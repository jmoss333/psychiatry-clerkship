// Explicit opt-in paid hosted acceptance proof. Never part of npm test.
//
// DANA_QA_MODE=automatic (default) is the hands-free proof: after Start and the
// opening, the run makes no click, key press, focus change or composer write, and
// waits out the real 4.5-second quiet window on every one of ten turns. It counts
// every interaction event the page receives and fails if any arrives.
//
// DANA_QA_MODE=shortcut retains the earlier coverage of the Space completion path
// as its own separate paid run. It is not evidence of automatic completion.
//
// Neither mode is physical-microphone evidence: both replace SpeechRecognition, and
// the report records nativeRecognition:false so it can never be read as more.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../tests/smoke/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
const PREVIEW_URL=process.env.DANA_QA_URL;
const ACCESS=process.env.DANA_QA_ACCESS_FILE;
const MODE=process.env.DANA_QA_MODE||'automatic';
if(!PREVIEW_URL||!ACCESS)throw new Error('Explicit DANA_QA_URL and DANA_QA_ACCESS_FILE are required; this proof makes paid API requests.');
if(!['automatic','shortcut'].includes(MODE))throw new Error('DANA_QA_MODE must be automatic or shortcut.');
const output=process.env.DANA_QA_OUTPUT_DIR||new URL('../test-results/',import.meta.url).pathname;
fs.mkdirSync(output,{recursive:true});
const REPORT=output+'/hosted-browser-report.json';
const QUIET_MS=4500;
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
const report={success:false,mode:MODE,stage:'setup',startRequests:0,turnRequests:0,blockedExtraRequests:0,responseStatuses:[],pageErrorCount:0,consoleErrorCount:0,startedAt:new Date().toISOString()};
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
 page.on('response',response=>{if(new URL(response.url()).pathname==='/api/dana-preview')report.responseStatuses.push(response.status());});
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
  const qa=window.__hostedDanaQA={recognizers:[],audioCreated:0,audioPlaying:0,audioEnded:0,audioErrors:0,durations:[],metrics:[],interactions:[],armed:false};
  window.Audio=function(source){
   const audio=new NativeAudio(source);audio.muted=true;audio.playbackRate=2;qa.audioCreated++;
   let played=false;
   audio.addEventListener('playing',()=>{if(played)return;played=true;qa.audioPlaying++;const metric=qa.metrics.at(-1);if(metric&&metric.dispatchAt!==null&&metric.replyMs===null)metric.replyMs=Math.round(performance.now()-metric.dispatchAt);});
   audio.addEventListener('ended',()=>{qa.audioEnded++;qa.durations.push(Number.isFinite(audio.duration)?Math.round(audio.duration*1000)/1000:null);});
   audio.addEventListener('error',()=>qa.audioErrors++);
   return audio;
  };
  window.Audio.prototype=NativeAudio.prototype;
  // Dispatch time is read from the outgoing request, so the wait for automatic
  // completion is measured separately from the provider's own latency.
  const nativeFetch=window.fetch;
  window.fetch=function(input,init){
   try{const body=init&&typeof init.body==='string'?JSON.parse(init.body):null;
    if(body&&body.action==='turn'){const metric=qa.metrics.at(-1);if(metric&&metric.dispatchAt===null)metric.dispatchAt=performance.now();}}catch(_){}
   return nativeFetch.apply(this,arguments);
  };
  // Chrome's real ordering: cumulative results, an interim index that later flips
  // to final, and speechend before the final result arrives.
  class Recognition{
   constructor(){this.active=false;this.results=[];this.cursor=0;qa.recognizers.push(this);}
   start(){this.active=true;queueMicrotask(()=>this.onstart?.());}
   abort(){this.active=false;}
   fire(){this.onresult?.({results:this.results,resultIndex:this.cursor});}
   put(text,isFinal){this.results[this.cursor]=Object.assign([{transcript:text}],{isFinal});this.results.length=this.cursor+1;if(isFinal)this.cursor++;this.fire();}
   async utter(text){
    const parts=text.split(' ');const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    this.onspeechstart?.();
    for(let count=3;count<parts.length;count+=4){this.put(parts.slice(0,count).join(' '),false);await pause(60);}
    this.onspeechend?.();await pause(250);
    this.put(text,true);
   }
  }
  window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=undefined;
  // Anything the learner would have had to do is recorded by type and target, so a
  // hands-free claim cannot survive a harness that quietly clicked or typed — and so
  // the report names what happened instead of leaving a bare count to be guessed at.
  for(const type of ['keydown','pointerdown','click','focusin','input'])
   document.addEventListener(type,event=>{if(qa.armed&&qa.interactions.length<50)
    qa.interactions.push(type+':'+((event.target&&event.target.id)||(event.target&&event.target.tagName||'?').toLowerCase()));},true);
 });
 report.stage='load';await page.goto(PREVIEW_URL,{waitUntil:'domcontentloaded'});verify(await page.title()==='Meet Dana · The Interview Room','page_identity');
 await page.locator('#preview-key').fill(passcode);await page.locator('#voice-mode').check();
 report.stage='opening';await page.locator('#start').click();
 // Locator assertions poll without constructing page-world JavaScript strings;
 // waitForFunction would violate the preview's intentional no-unsafe-eval CSP.
 await expect(page.locator('#status')).toHaveText('Listening — I’ll send when you finish',{timeout:120000});
 verify(await page.locator('#preview-key').inputValue()==='','passcode_cleared');
 // From here to the end of the tenth turn the run touches nothing.
 await page.evaluate(()=>{window.__hostedDanaQA.armed=true;});
 for(let index=0;index<prompts.length;index++){
  report.stage='turn_'+(index+1);
  await page.evaluate(async({text,turn,endSession})=>{
   const qa=window.__hostedDanaQA;qa.metrics.push({turn,finalAt:null,dispatchAt:null,replyMs:null});
   const recognition=qa.recognizers.findLast(item=>item.active);
   if(!recognition)throw new Error('No active synthetic recognizer');
   await recognition.utter(text);
   qa.metrics.at(-1).finalAt=performance.now();
   // Mid-encounter the browser ends and restarts recognition on its own; prove the
   // pending turn survives it instead of needing a click.
   if(endSession){recognition.active=false;recognition.onend?.();}
  },{text:prompts[index],turn:index+1,endSession:index===4});
  if(MODE==='shortcut'){await page.locator('h1').click();await page.keyboard.press('Space');}
  await expect(page.locator('#turn-count')).toHaveText((index+1)+' of 10 questions',{timeout:120000});
  await expect(page.locator('#status')).toHaveText(index===9?'Encounter ended — microphone off':'Listening — I’ll send when you finish',{timeout:120000});
 }
 report.stage='verify';
 const metrics=await page.evaluate(()=>{const qa=window.__hostedDanaQA;qa.armed=false;
  const diagnostics=window.DanaPreview.session.getDiagnostics();
  return {audioCreated:qa.audioCreated,audioPlaying:qa.audioPlaying,audioEnded:qa.audioEnded,audioErrors:qa.audioErrors,durations:qa.durations,
   metrics:qa.metrics.map(({turn,finalAt,dispatchAt,replyMs})=>({turn,quietMs:finalAt!==null&&dispatchAt!==null?Math.round(dispatchAt-finalAt):null,replyMs})),
   interactionsAfterStart:qa.interactions.slice(),activeRecognizers:qa.recognizers.filter(item=>item.active).length,
   browserStorageEntries:localStorage.length+sessionStorage.length,
   nativeRecognition:diagnostics.nativeRecognition,recognitionSessions:diagnostics.sessions,
   automaticSubmissions:diagnostics.automaticSubmissions,explicitSubmissions:diagnostics.explicitSubmissions,
   captureCounts:diagnostics.counts};});
 Object.assign(report,metrics);
 const quiet=report.metrics.map(item=>item.quietMs).filter(Number.isFinite);
 report.quietMsRange=quiet.length?[Math.min(...quiet),Math.max(...quiet)]:null;
 const replies=report.metrics.map(item=>item.replyMs).filter(Number.isFinite);
 report.replyMsRange=replies.length?[Math.min(...replies),Math.max(...replies)]:null;
 report.learnerRows=await page.locator('.message.you').count();report.patientRows=await page.locator('.message.dana').count();
 report.allRepliesCompleted=await page.locator('.message.dana .delivery').evaluateAll(nodes=>nodes.every(node=>node.textContent==='Voice completed'));
 verify(report.startRequests===1&&report.turnRequests===10&&report.blockedExtraRequests===0,'request_count');
 verify(report.learnerRows===10&&report.patientRows===11&&report.allRepliesCompleted,'completed_transcript');
 verify(report.audioCreated>=11&&report.audioCreated<=21&&report.audioCreated===report.audioPlaying&&report.audioPlaying===report.audioEnded&&report.audioErrors===0,'native_audio_completion');
 verify(report.metrics.length===10&&quiet.length===10&&replies.length===10,'latency_metrics');
 verify(report.nativeRecognition===false,'synthetic_recognition_declared');
 if(MODE==='automatic'){
  // The application moves focus to Clear once the encounter ends, which is its own
  // accessibility behaviour and happens after the tenth turn is already complete.
  // Everything else would be a learner action and must not have occurred.
  const learnerActions=report.interactionsAfterStart.filter(entry=>entry!=='focusin:clear');
  verify(learnerActions.length===0,'no_interaction_after_start');
  verify(report.automaticSubmissions===10&&report.explicitSubmissions===0,'every_turn_sent_itself');
  // Below the quiet window a turn cannot have waited it out; the upper bound keeps
  // an unbounded stall from passing as success.
  verify(quiet.every(value=>value>=QUIET_MS-100&&value<=QUIET_MS+3000),'automatic_quiet_window');
 }else{
  verify(report.explicitSubmissions===10&&report.automaticSubmissions===0,'every_turn_sent_by_shortcut');
 }
 verify(report.recognitionSessions>=11,'recognition_restarted_between_turns');
 verify(report.activeRecognizers===0&&report.browserStorageEntries===0,'ended_privacy');
 verify(report.pageErrorCount===0&&report.responseStatuses.length===11&&report.responseStatuses.every(status=>status===200),'runtime_health');
 await page.locator('#encounter-panel').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/hosted-desktop.png'});
 await page.setViewportSize({width:390,height:844});report.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);verify(!report.mobileOverflow,'mobile_layout');await page.screenshot({path:output+'/hosted-mobile.png'});
 await page.locator('#clear').click();verify(await page.locator('#transcript').innerText()==='','clear_transcript');verify(await page.locator('#preview-key').inputValue()==='','clear_passcode');
 report.success=true;report.stage='complete';report.finishedAt=new Date().toISOString();fs.writeFileSync(REPORT,JSON.stringify(report,null,2));
 console.log('PASS ('+MODE+'): one opening and ten real hosted turns completed with native audio. Content-free report: '+REPORT);
}catch(error){
 report.failureName=error?.name;report.failureHint=String(error?.message||'').split('\n')[0].replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]');
 report.finishedAt=new Date().toISOString();fs.writeFileSync(REPORT,JSON.stringify(report,null,2));console.error('Hosted browser proof did not finish at '+report.stage+'. Content-free report: '+REPORT);process.exitCode=1;
}finally{if(browser)await browser.close();}
