import {timingSafeEqual} from 'node:crypto';
import {getCase} from './case.mjs';
import {createStateCodec,finalizePlayback,hash,problem} from './state.mjs';
import {isDeliveryIntensity} from './portrayal.mjs';

export const FACULTY_FEEDBACK_STORE='faculty-full-visit-feedback-v1';
const CASES=new Set(['sp_depression_gated_si_001','sp_alcohol_ambivalence_001']);
const JUDGMENTS=new Set(['Addressed','Partly addressed','Still open']);
const INPUT_KEYS=['caseId','state','previousPlayback','previousCompletedSegments','patientIndex','learnerIndex','judgment','note'];
const RECORD_KEYS=['schemaVersion','reference','caseId','caseBinding','deployId','settings','patient','learner','patientReply','judgment','note','savedAt'];
const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const MAX_BODY=150000,MAX_RECORDS=200;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const index=value=>Number.isInteger(value)&&value>=0&&value<=20;
const note=value=>typeof value==='string'&&value.length<=1200&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const unavailable=()=>problem(503,'feedback_unavailable');
const invalid=()=>problem(400,'feedback_input_invalid');
function same(left,right){
 const a=Buffer.from(left),b=Buffer.from(right);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function inputBody(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw invalid();
 const reader=request.body?.getReader();if(!reader)throw invalid();
 let total=0;const chunks=[];
 try{
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_BODY)throw problem(413,'feedback_input_invalid');chunks.push(value);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
 }catch(error){await reader.cancel().catch(()=>{});if(error?.status===413)throw error;throw invalid();}
}
const patientExcerpt=(entry,at)=>({index:at,text:entry.text,omittedTail:entry.omittedTail===true});
const heard=entry=>object(entry)&&entry.who==='pt'&&entry.playbackStatus==='played'&&text(entry.text,1200);
function validExcerpt(value,patient){
 return exact(value,patient?['index','text','omittedTail']:['index','text'])&&index(value.index)
  &&text(value.text,1200)&&(!patient||typeof value.omittedTail==='boolean');
}
function validRecord(record,key){
 if(!exact(record,RECORD_KEYS)||record.schemaVersion!==1||!/^v1\/[a-f0-9]{32}$/.test(key)
  ||record.reference!==key.slice(3)||!CASES.has(record.caseId)||!text(record.deployId,200)
  ||typeof record.caseBinding!=='string'||!/^[a-f0-9]{64}$/.test(record.caseBinding)
  ||!exact(record.settings,['concernInitiative','deliveryIntensity','replyDetail'])
  ||!['invited','natural','forthcoming'].includes(record.settings.concernInitiative)
  ||!isDeliveryIntensity(record.settings.deliveryIntensity)
  ||!['standard',...(record.caseId==='sp_alcohol_ambivalence_001'?['one-point']:[])].includes(record.settings.replyDetail)
  ||!validExcerpt(record.patient,true)||record.patient.index%2!==0
  ||!JUDGMENTS.has(record.judgment)||!note(record.note)
  ||typeof record.savedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.savedAt)||!Number.isFinite(Date.parse(record.savedAt)))return false;
 if(record.learner!==null&&(!validExcerpt(record.learner,false)||record.learner.index%2!==1||record.learner.index<=record.patient.index))return false;
 return record.patientReply===null||(record.learner!==null&&validExcerpt(record.patientReply,true)&&record.patientReply.index===record.learner.index+1);
}
// Ignore only the server timestamp when a phone retries a response it did not
// receive. Fixed key ordering also makes equivalent JSON storage order harmless.
function fingerprint(record){
 const stable=value=>Array.isArray(value)?value.map(stable):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
 const {savedAt,...submission}=record;
 return hash(JSON.stringify(stable(submission)));
}
async function readRecord(store,key){
 let record;try{record=await store.get(key,{type:'json',consistency:'strong'});}catch{throw unavailable();}
 if(record!==null&&!validRecord(record,key))throw unavailable();
 return record;
}
async function saveRecord(store,record){
 const key=`v1/${record.reference}`;
 let existing=await readRecord(store,key);
 if(existing===null){
  let result;try{result=await store.set(key,JSON.stringify(record),{onlyIfNew:true});}catch{throw unavailable();}
  if(result?.modified===true)return;
  if(result?.modified!==false)throw unavailable();
  // A second phone request may have won the atomic create while this one was
  // reading. Inspect that immutable winner using strong consistency.
  existing=await readRecord(store,key);if(existing===null)throw unavailable();
 }
 if(fingerprint(existing)!==fingerprint(record))throw problem(409,'feedback_already_submitted');
}
async function reviewRecords(store){
 const keys=[];let truncated=false;
 try{
  pages:for await(const page of store.list({prefix:'v1/',paginate:true})){
   if(!object(page)||!Array.isArray(page.blobs))throw unavailable();
   for(const blob of page.blobs){
    if(!object(blob)||typeof blob.key!=='string'||!/^v1\/[a-f0-9]{32}$/.test(blob.key))throw unavailable();
    if(keys.length===MAX_RECORDS){truncated=true;break pages;}
    keys.push(blob.key);
   }
  }
 }catch{throw unavailable();}
 const records=[];
 // Bound concurrent storage reads while retaining a strict response limit.
 for(let offset=0;offset<keys.length;offset+=10){
  const batch=await Promise.all(keys.slice(offset,offset+10).map(key=>readRecord(store,key)));
  if(batch.some(record=>record===null))throw unavailable();
  records.push(...batch);
 }
 records.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.reference.localeCompare(b.reference));
 return {records,truncated};
}
export function createFacultyFeedbackHandler({env=process.env,store,now=Date.now}={}){
 return async function handler(request){
  try{
   if(env.DANA_PREVIEW_ENABLED!=='true'||!text(env.DEPLOY_ID,200)||!store||typeof store.get!=='function'||typeof store.set!=='function')throw unavailable();
   const requestOrigin=new URL(request.url).origin,origin=request.headers.get('origin'),allowed=[env.DEPLOY_URL,env.URL,env.DANA_PREVIEW_ORIGIN].filter(Boolean);
   if(!allowed.includes(requestOrigin)||(request.method==='GET'?origin!==null&&origin!==requestOrigin:origin!==requestOrigin))throw problem(403,'feedback_forbidden');
   if(request.method==='GET'){
    const key=env.FACULTY_FEEDBACK_REVIEW_KEY;
    if(typeof key!=='string'||key.length<32||key.length>256||key===env.DANA_PREVIEW_PASSCODE||typeof store.list!=='function')throw unavailable();
    if(!same(request.headers.get('authorization')||'',`Bearer ${key}`))throw problem(403,'feedback_forbidden');
    return Response.json(await reviewRecords(store),{headers:HEADERS});
   }
   if(request.method!=='POST')throw problem(405,'feedback_input_invalid');
   const secret=env.DANA_PREVIEW_PASSCODE;
   if(typeof secret!=='string'||secret.length<15)throw unavailable();
   if(!same(request.headers.get('x-preview-key')||'',secret))throw problem(403,'feedback_forbidden');
   const body=await inputBody(request);
   if(!exact(body,INPUT_KEYS)||!CASES.has(body.caseId)||!index(body.patientIndex)
    ||body.learnerIndex!==null&&(!index(body.learnerIndex)||body.learnerIndex<=body.patientIndex)
    ||!JUDGMENTS.has(body.judgment)||!note(body.note))throw invalid();
   const {binding:caseBinding}=getCase(body.caseId);
   const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:`hosted-sp-v2:${body.caseId}:${caseBinding}:${env.DEPLOY_ID}:${origin}:${hash(secret)}`,now,withDeliveryIntensity:true});
   const state=codec.open(body.state);
   if(state.caseId!==body.caseId)throw problem(400,'preview_state_invalid');
   if(state.retried===true)throw problem(400,'feedback_original_encounter_required');
   // The receipt authenticates the words; the playback receipt bounds the last
   // reply to issued, completed audio. No browser-supplied quote is accepted.
   if(!state.segments.every(segment=>typeof segment==='string')||!state.history.every((entry,at)=>object(entry)
    &&entry.who===(at%2===0?'pt':'me')&&text(entry.text,1200)
    &&(entry.who==='me'||['pending','played','interrupted'].includes(entry.playbackStatus))))throw problem(400,'preview_state_invalid');
   const history=finalizePlayback(state,body),patient=history[body.patientIndex],learner=body.learnerIndex===null?null:history[body.learnerIndex];
   if(!heard(patient)||body.learnerIndex!==null&&(!learner||learner.who!=='me'||!text(learner.text,1200)))throw invalid();
   const reply=learner?history[body.learnerIndex+1]:null;
   const record={schemaVersion:1,reference:state.sid,caseId:body.caseId,caseBinding,deployId:env.DEPLOY_ID,
    settings:{concernInitiative:state.concernInitiative||'natural',deliveryIntensity:state.deliveryIntensity||'standard',replyDetail:state.replyDetail||'standard'},
    patient:patientExcerpt(patient,body.patientIndex),learner:learner?{index:body.learnerIndex,text:learner.text}:null,
    patientReply:heard(reply)?patientExcerpt(reply,body.learnerIndex+1):null,judgment:body.judgment,note:body.note.trim(),savedAt:new Date(now()).toISOString()};
   if(!validRecord(record,`v1/${state.sid}`))throw unavailable();
   await saveRecord(store,record);
   return Response.json({saved:true,reference:state.sid},{headers:HEADERS});
  }catch(error){
   const codes=new Set(['feedback_unavailable','feedback_forbidden','feedback_input_invalid','feedback_already_submitted','feedback_original_encounter_required','preview_state_invalid','preview_session_expired']);
   const code=error?.code==='preview_input_invalid'?'feedback_input_invalid':error?.code;
   return Response.json({error:codes.has(code)?code:'feedback_unavailable'},{status:codes.has(code)?error.status||503:503,headers:HEADERS});
  }
 };
}
