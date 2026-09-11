// Explicit opt-in only: three starts / at most 51 conservative reserved units.
// Never imported by production, CI, or default tests. No request is repeated.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {momentIds,getMoment} from '../lib/moments/catalog.mjs';
export function configuration(env){
 if(env.DANA_QA_MODE!=='moments'||!env.DANA_QA_URL||!env.DANA_QA_ACCESS_FILE)throw Error('Explicit moments mode, protected preview URL and existing access file are required.');
 const url=new URL(env.DANA_QA_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^[a-z0-9-]+--interview-room-faculty-preview\.netlify\.app$/.test(url.hostname)||url.pathname!=='/')throw Error('Only the assigned protected site or its preview is allowed.');
 return {url:url.origin,access:env.DANA_QA_ACCESS_FILE};
}
export const MAX_STARTS=3,MAX_UNITS=51;
const scripts=[
 ["The earlier response moved past what you were describing. What matters most?","So rent is the concern. Have I understood?","Would you like to talk about that or pause?","We can stop here if you prefer."],
 ["You are reluctant to get treatment. Is that right?","Thank you for correcting me. You want help and want to keep thinking clearly at work.","I understand that this is a fear, rather than an established effect. Is that right?","What have I left out of your concern?"],
 ["The request has been sent, but no appointment is confirmed. Social work is checking availability.","How would you describe what is arranged and what remains pending?","You understand the status, but cannot take calls at work. Have I got that right?","I can raise that contact barrier with the team. I cannot promise an arrangement."],
];
export async function runAudition(env=process.env){
 const config=configuration(env); // Before reading access or launching browser.
 const key=(await readFile(config.access,'utf8')).trim().split(/\r?\n/).at(-1);if(key.length<15)throw Error('Access file invalid.');
 const output=new URL('../../output/practice-moment/audition/',import.meta.url);await mkdir(output,{recursive:true});
 const require=createRequire(new URL('../../tests/smoke/package.json',import.meta.url)),{chromium}=require('@playwright/test');
 const browser=await chromium.launch(),page=await browser.newPage();await page.goto('about:blank');
 const mod={exports:{}};vm.runInThisContext('(function(module,exports){'+await readFile(new URL('../public/app.js',import.meta.url),'utf8')+'\n})')(mod,mod.exports);
 const report={syntheticDialogue:true,nativeRecognition:false,physicalMicrophone:false,starts:0,reservedUnitsUpperBound:0,providerCeilings:{actorReplies:13,evaluators:3,tts:29},audioDecoded:0,success:false,samples:[],failure:null};
 async function call(body){
  const units=body.action==='start'?1:3;if(report.reservedUnitsUpperBound+units>MAX_UNITS||body.action==='start'&&report.starts>=MAX_STARTS)throw Error('audition_cap');
  report.reservedUnitsUpperBound+=units;if(body.action==='start')report.starts++;
  const dispatched=performance.now(),audio=[],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);let state,reply,review,firstAudioMs=null,segments=0;
  try{
   const response=await fetch(config.url+'/api/practice-moment',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-preview-key':key,Origin:config.url},body:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'omit'});
   await mod.exports.readResponse(response,{review:body.action==='debrief',scenarioId:body.scenarioId,maxTurns:4,expectedTurn:body.action==='start'?0:body.action==='retry'?body.turnId:undefined,onState:s=>{state=s;},onReply:e=>{reply=e.reply;segments=e.segments.length;},onAudio:e=>{if(firstAudioMs===null)firstAudioMs=performance.now()-dispatched;audio.push(e.data);},onReview:r=>{review=r;},onUnavailable:()=>{throw Error('review_unavailable');}},controller.signal);
   for(const data of audio){await page.evaluate(async encoded=>{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const context=new AudioContext();try{const decoded=await context.decodeAudioData(bytes.buffer);if(!decoded.length||!decoded.duration)throw Error('decode_failed');}finally{await context.close();}},data);report.audioDecoded++;}
   report.samples.push({scenarioId:body.scenarioId,action:body.action,reply,review,firstAudioMs,completeMs:performance.now()-dispatched,audioHashes:audio.map(data=>createHash('sha256').update(Buffer.from(data,'base64')).digest('hex'))});
   return {state,segments};
  }finally{clearTimeout(timer);}
 }
 try{
  for(const [i,scenarioId] of momentIds.entries()){
   let last=await call({action:'start',scenarioId,requestId:randomUUID()});
   for(const text of scripts[i])last=await call({action:'turn',scenarioId,state:last.state,text,previousPlayback:'played',previousCompletedSegments:last.segments});
   const closed=await call({action:'debrief',scenarioId,state:last.state,previousPlayback:'played',previousCompletedSegments:last.segments,outputs:{teamFormulation:i===1?'Priya wants help and fears treatment could affect her thinking at work. Treatment history remains unclarified.':'',summaryUncertain:i===1},uncertainTurnIds:[],endReason:'turn_limit'});
   if(i===0)await call({action:'retry',scenarioId,state:closed.state,turnId:1,text:'I want to understand what losing this job means for you. Where would you like to start?'});
  }
  if(report.starts!==3||report.reservedUnitsUpperBound!==51)throw Error('audition_count');report.success=true;
 }catch{report.failure='Audition stopped; no failed or uncertain request was repeated.';}
 finally{await browser.close();await writeFile(new URL('receipt.json',output),JSON.stringify(report,null,2)+'\n');}
 if(!report.success)throw Error(report.failure);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){runAudition().then(r=>console.log(JSON.stringify({success:r.success,starts:r.starts,reservedUnitsUpperBound:r.reservedUnitsUpperBound,audioDecoded:r.audioDecoded}))).catch(()=>{console.error('Audition unavailable or stopped. No retry performed.');process.exitCode=1;});}
