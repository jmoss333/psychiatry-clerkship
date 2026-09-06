// Explicit opt-in paid hosted acceptance proof. Never part of npm test.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../tests/smoke/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const URL=process.env.DANA_QA_URL;
const ACCESS=process.env.DANA_QA_ACCESS_FILE;
if(!URL||!ACCESS)throw new Error('Explicit DANA_QA_URL and DANA_QA_ACCESS_FILE are required; this proof makes paid API requests.');
const output=process.env.DANA_QA_OUTPUT_DIR||new globalThis.URL('../test-results/',import.meta.url).pathname;
fs.mkdirSync(output,{recursive:true});
const REPORT=output+'/hosted-browser-report.json';
const prompts=[
 'No, this will not take long. I am a medical student, and I would like to understand what matters to you today.',
 'Could you tell me what led to coming to the hospital?',
 'What has feeling empty been like for you?',
 'What did losing your job mean to you?',
 'How has this affected your sleep and daily routine?',
 'What has Tom noticed, and what support feels helpful?',
 'Have you had thoughts about ending your life?',
 'Have you thought about how you might do that?',
 'What has helped you hold on when things feel difficult?',
 'Let me check my understanding: things have felt empty since losing work, and you want a say in what happens next. What would you want us to focus on together?'
];
const report={success:false,stage:'setup',startRequests:0,turnRequests:0,blockedExtraRequests:0,responseStatuses:[],pageErrorCount:0,consoleErrorCount:0,startedAt:new Date().toISOString()};
let browser;
function verify(condition,stage){if(!condition){report.stage=stage;throw new Error('verification_failed');}}
try{
 const passcode=fs.readFileSync(ACCESS,'utf8').trim().split(/\r?\n/).at(-1);
 verify(!!passcode&&passcode.length>=16,'access_file');
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.setDefaultTimeout(30000);
 page.on('pageerror',()=>report.pageErrorCount++);
 page.on('console',message=>{if(message.type()==='error')report.consoleErrorCount++;});
 page.on('response',response=>{if(new globalThis.URL(response.url()).pathname==='/api/dana-preview')report.responseStatuses.push(response.status());});
 // Guard against an accidental extra paid start or eleventh question. This does
 // not fake the endpoint: every allowed request goes to the real hosted server.
 await page.route('**/api/dana-preview',async route=>{
  let body;try{body=route.request().postDataJSON();}catch{report.blockedExtraRequests++;return route.abort();}
  if(body?.action==='start'){report.startRequests++;if(report.startRequests>1){report.blockedExtraRequests++;return route.abort();}}
  else if(body?.action==='turn'){report.turnRequests++;if(report.turnRequests>10){report.blockedExtraRequests++;return route.abort();}}
  else{report.blockedExtraRequests++;return route.abort();}
  await route.continue();
 });
 await page.addInitScript(()=>{
  const NativeAudio=window.Audio;
  const qa=window.__hostedDanaQA={recognizers:[],audioCreated:0,audioPlaying:0,audioEnded:0,audioErrors:0,durations:[],metrics:[],pendingTurn:0};
  window.Audio=function(source){
   const audio=new NativeAudio(source);audio.muted=true;audio.playbackRate=2;qa.audioCreated++;
   let played=false;
   audio.addEventListener('playing',()=>{if(played)return;played=true;qa.audioPlaying++;const metric=qa.metrics.find(item=>item.turn===qa.pendingTurn);if(metric&&metric.firstPlayingMs===null)metric.firstPlayingMs=Math.round(performance.now()-metric.spaceAt);});
   audio.addEventListener('ended',()=>{qa.audioEnded++;qa.durations.push(Number.isFinite(audio.duration)?Math.round(audio.duration*1000)/1000:null);});
   audio.addEventListener('error',()=>qa.audioErrors++);
   return audio;
  };
  window.Audio.prototype=NativeAudio.prototype;
  class Recognition{
   constructor(){this.active=false;this.results=[];qa.recognizers.push(this);}
   start(){this.active=true;queueMicrotask(()=>this.onstart?.());}
   abort(){this.active=false;}
   emit(text){const result=Object.assign([{transcript:text}],{isFinal:true});this.results.push(result);this.onspeechstart?.();this.onresult?.({results:[...this.results],resultIndex:this.results.length-1});this.onspeechend?.();}
  }
  window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=undefined;
  document.addEventListener('keydown',event=>{if(event.code!=='Space'||event.repeat||event.target?.closest('input,textarea,button,select,a,summary,[contenteditable]'))return;if(!qa.pendingTurn)return;const metric=qa.metrics.find(item=>item.turn===qa.pendingTurn);if(metric&&!metric.spaceAt)metric.spaceAt=performance.now();});
 });
 report.stage='load';await page.goto(URL,{waitUntil:'domcontentloaded'});verify(await page.title()==='Meet Dana · The Interview Room','page_identity');
 await page.locator('#preview-key').fill(passcode);await page.locator('#voice-mode').check();
 report.stage='opening';await page.locator('#start').click();
 // Locator assertions poll without constructing page-world JavaScript strings;
 // waitForFunction would violate the preview's intentional no-unsafe-eval CSP.
 await expect(page.locator('#status')).toHaveText('Listening',{timeout:120000});
 verify(await page.locator('#preview-key').inputValue()==='','passcode_cleared');
 for(let index=0;index<prompts.length;index++){
  report.stage='turn_'+(index+1);
  await page.locator('h1').click();
  await page.evaluate(({text,turn})=>{const qa=window.__hostedDanaQA;qa.pendingTurn=turn;qa.metrics.push({turn,spaceAt:null,firstPlayingMs:null});const recognition=qa.recognizers.findLast(item=>item.active);if(!recognition)throw new Error('No active synthetic recognizer');recognition.emit(text);},{text:prompts[index],turn:index+1});
  await page.keyboard.press('Space');
  await expect(page.locator('#turn-count')).toHaveText((index+1)+' of 10 questions',{timeout:120000});
  await expect(page.locator('#status')).toHaveText(index===9?'Encounter ended — microphone off':'Listening',{timeout:120000});
 }
 report.stage='verify';
 const metrics=await page.evaluate(()=>{const qa=window.__hostedDanaQA;return {audioCreated:qa.audioCreated,audioPlaying:qa.audioPlaying,audioEnded:qa.audioEnded,audioErrors:qa.audioErrors,durations:qa.durations,metrics:qa.metrics.map(({turn,firstPlayingMs})=>({turn,firstPlayingMs})),activeRecognizers:qa.recognizers.filter(item=>item.active).length,browserStorageEntries:localStorage.length+sessionStorage.length};});
 Object.assign(report,metrics);
 report.learnerRows=await page.locator('.message.you').count();report.patientRows=await page.locator('.message.dana').count();
 report.allRepliesCompleted=await page.locator('.message.dana .delivery').evaluateAll(nodes=>nodes.every(node=>node.textContent==='Voice completed'));
 verify(report.startRequests===1&&report.turnRequests===10&&report.blockedExtraRequests===0,'request_count');
 verify(report.learnerRows===10&&report.patientRows===11&&report.allRepliesCompleted,'completed_transcript');
 verify(report.audioCreated>=11&&report.audioCreated<=21&&report.audioCreated===report.audioPlaying&&report.audioPlaying===report.audioEnded&&report.audioErrors===0,'native_audio_completion');
 verify(report.metrics.length===10&&report.metrics.every(item=>Number.isFinite(item.firstPlayingMs)&&item.firstPlayingMs>=0),'latency_metrics');
 verify(report.activeRecognizers===0&&report.browserStorageEntries===0,'ended_privacy');
 verify(report.pageErrorCount===0&&report.responseStatuses.length===11&&report.responseStatuses.every(status=>status===200),'runtime_health');
 await page.locator('#encounter-panel').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/hosted-desktop.png'});
 await page.setViewportSize({width:390,height:844});report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);verify(!report.mobileOverflow,'mobile_layout');await page.screenshot({path:output+'/hosted-mobile.png'});
 await page.locator('#clear').click();verify(await page.locator('#transcript').innerText()==='','clear_transcript');verify(await page.locator('#preview-key').inputValue()==='','clear_passcode');
 report.success=true;report.stage='complete';report.finishedAt=new Date().toISOString();fs.writeFileSync(REPORT,JSON.stringify(report,null,2));
 console.log('PASS: one opening and ten real hosted turns completed with native audio. Content-free report: '+REPORT);
}catch(error){
 report.failureName=error?.name;report.failureHint=String(error?.message||'').split('\n')[0].replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]');
 report.finishedAt=new Date().toISOString();fs.writeFileSync(REPORT,JSON.stringify(report,null,2));console.error('Hosted browser proof did not finish at '+report.stage+'. Content-free report: '+REPORT);process.exitCode=1;
}finally{if(browser)await browser.close();}
