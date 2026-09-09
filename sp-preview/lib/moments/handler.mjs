import {randomBytes,timingSafeEqual} from 'node:crypto';
import {validateReply} from '../../../_prototypes/sp-interview/dana-live-context.mjs';
import {getMoment} from './catalog.mjs';
import {createMomentContext,createReviewContext} from './context.mjs';
import {buildEvidenceSources,validateDebrief} from './evidence.mjs';
import {createMomentCodec,initialMomentState,nextMomentHistory,closeMomentState,retryMomentState} from './state.mjs';
import {hash,problem,nextHistory,issuedState} from '../state.mjs';

const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const safeCodes=new Set(['preview_unavailable','preview_forbidden','preview_input_invalid','preview_state_invalid','preview_session_expired','preview_encounter_finished','preview_operation_duplicate','preview_operation_mismatch','preview_daily_starts_exhausted','preview_budget_exhausted','preview_window_exhausted','preview_budget_unavailable','preview_budget_contention','preview_provider_unavailable','preview_cancelled']);
function safeError(error){return safeCodes.has(error?.code)?error.code:'preview_provider_unavailable';}
function same(a,b){return timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));}
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
async function inputBody(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw problem(400,'preview_input_invalid');
 const reader=request.body?.getReader();if(!reader)throw problem(400,'preview_input_invalid');
 let total=0,chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>140000)throw problem(413,'preview_input_invalid');chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{await reader.cancel().catch(()=>{});throw problem(400,'preview_input_invalid');}
}
const validAudio=bytes=>Buffer.isBuffer(bytes)&&bytes.length>=100&&bytes.length<=4000000&&(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255&&(bytes[1]&224)===224);

export function createMomentHandler({env=process.env,provider,budget,now=Date.now,deadlineMs=50000}={}) {
 return async function handler(request){
  let state,history,action,codec,definition,reviewBody;
  try{
   const secret=env.DANA_PREVIEW_PASSCODE;
   if(env.DANA_MOMENTS_ENABLED!=='true'||env.DANA_PREVIEW_ENABLED!=='true'||typeof secret!=='string'||secret.length<15||!env.DEPLOY_ID||!provider?.configured||!budget)throw problem(503,'preview_unavailable');
   const origin=request.headers.get('origin'),allowed=[env.DEPLOY_URL,env.URL,env.DANA_PREVIEW_ORIGIN].filter(Boolean);
   if(!origin||!allowed.includes(origin)||new URL(request.url).origin!==origin||!same(request.headers.get('x-preview-key')||'',secret))throw problem(403,'preview_forbidden');
   if(request.method!=='POST')throw problem(405,'preview_input_invalid');
   const body=await inputBody(request);action=body?.action;
   definition=getMoment(body?.scenarioId);
   if(!definition)throw problem(400,'preview_input_invalid');
   codec=createMomentCodec({definition,env,origin,now});
   let operationId;
   if(action==='start'){
    if(!exact(body,['action','scenarioId','requestId'])||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId))throw problem(400,'preview_input_invalid');
    state=initialMomentState(definition,now);operationId=`start:${body.requestId}`;
   }else if(action==='turn'){
    if(!exact(body,['action','scenarioId','state','text','previousPlayback','previousCompletedSegments']))throw problem(400,'preview_input_invalid');
    state=codec.open(body.state);history=nextMomentHistory(state,body);operationId=`turn:${state.sid}:${state.nonce}`;
   }else if(action==='debrief'){
    if(!exact(body,['action','scenarioId','state','previousPlayback','previousCompletedSegments','outputs','uncertainTurnIds','endReason'])||!exact(body.outputs,['teamFormulation','summaryUncertain']))throw problem(400,'preview_input_invalid');
    const {teamFormulation,summaryUncertain}=body.outputs;
    if(typeof teamFormulation!=='string'||teamFormulation.length>1200||/[\u0000-\u001f\u007f]/.test(teamFormulation)||typeof summaryUncertain!=='boolean'||!teamFormulation.trim()&&summaryUncertain||definition.id!=='moment_priya_formulation_001'&&teamFormulation!==''||!['turn_limit','learner_end','technical_interruption'].includes(body.endReason))throw problem(400,'preview_input_invalid');
    const parent=codec.open(body.state);
    if(body.endReason==='turn_limit'&&parent.turn!==4||!Array.isArray(body.uncertainTurnIds)||body.uncertainTurnIds.length>4||body.uncertainTurnIds.some((id,i,ids)=>!Number.isInteger(id)||id<1||id>parent.turn||i>0&&id<=ids[i-1]))throw problem(400,'preview_input_invalid');
    // Construct and validate closure/evidence before reserving; no provider work here.
    state=closeMomentState(parent,body);
    const sources=buildEvidenceSources(definition,state.history,{...body.outputs,uncertainTurnIds:body.uncertainTurnIds});
    reviewBody={sources,endReason:body.endReason};operationId=`turn:${parent.sid}:${parent.nonce}`;
   }else if(action==='retry'){
    if(!exact(body,['action','scenarioId','state','turnId','text']))throw problem(400,'preview_input_invalid');
    const parent=codec.open(body.state);state=retryMomentState(parent,body.turnId,randomBytes(16).toString('hex'));
    history=nextHistory(state,{text:body.text,previousPlayback:'played',previousCompletedSegments:state.completed});
    operationId=`turn:${parent.sid}:${parent.nonce}`;
   }else throw problem(400,'preview_input_invalid');
   if(request.signal.aborted)throw problem(409,'preview_cancelled');
   await budget.reserve({operationId:hash(operationId),bindingHash:hash(JSON.stringify(body)),units:action==='start'?1:3});
  }catch(error){return Response.json({error:safeError(error)},{status:error.status||503,headers:HEADERS});}

  const abort=new AbortController(),cancel=()=>abort.abort();
  request.signal.addEventListener('abort',cancel,{once:true});if(request.signal.aborted)cancel();
  let closed=false;
  const timer=setTimeout(cancel,deadlineMs);
  const stream=new ReadableStream({
   start(controller){
    const send=value=>{if(abort.signal.aborted||closed)throw problem(409,'preview_cancelled');controller.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));};
    // The repo's canonical spoken-text transform, used by the recordings catalog,
    // the local prototype and the voice module. A visual stage direction is for the
    // learner to read; the voice instructions in this same request say not to speak
    // one, so it must not be in the text we hand over.
    const spokenText=value=>String(value).replace(/\*[^*]*\*/g,' ').replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
    async function speak(text){
     if(abort.signal.aborted)throw problem(409,'preview_cancelled');
     const say=spokenText(text);
     // A segment that is ONLY staging has nothing to speak; that is an authoring
     // error, not something to paper over with silent audio.
     if(!say)throw problem(500,'preview_provider_unavailable');
     const bytes=await provider.speak({text:say,caseId:definition.id,signal:abort.signal});
     if(abort.signal.aborted)throw problem(409,'preview_cancelled');
     if(!validAudio(bytes))throw problem(502,'preview_provider_unavailable');
     return bytes;
    }
    (async()=>{
     const pending=[];
     const begin=text=>{const job=speak(text);job.catch(()=>{});pending.push(job);return job;};
     try{
      if(action==='debrief'){
       const closedReceipt=codec.seal(state);
       send({type:'review-start',state:closedReceipt});
       try{
        const context=createReviewContext(definition,reviewBody.sources,{endReason:reviewBody.endReason});
        if(abort.signal.aborted)throw problem(409,'preview_cancelled');
        const raw=await provider.evaluateMoment({...context,signal:abort.signal});
        const report=validateDebrief(raw,reviewBody.sources,definition,{endReason:reviewBody.endReason});
        send({type:'review',report});
       }catch(error){if(abort.signal.aborted)throw error;send({type:'review-unavailable',code:'preview_review_unavailable'});}
       send({type:'review-complete',state:closedReceipt});return;
      }
      let reply,segments,jobs;
      if(action==='start'){reply=definition.opening;segments=[reply];jobs=[begin(reply)];}
      else {
       const context=createMomentContext(definition,history);
       let lead=null,leadJob=null,acceptingLead=true;
       const onLead=text=>{
        if(!acceptingLead||abort.signal.aborted)return;
        if(lead!==null||validateReply(text,{fragment:true})!==text)throw problem(502,'preview_provider_unavailable');
        lead=text;if(!/^(?:"[\s\S]*"|“[\s\S]*”)$/.test(text))leadJob=begin(text);
       };
       try{reply=validateReply(await provider.replyStream({system:context.system,messages:context.messages,signal:abort.signal,onLead}));}
       finally{acceptingLead=false;}
       if(lead!==null&&!reply.startsWith(lead))throw problem(502,'preview_provider_unavailable');
       if(leadJob){
        segments=[lead];jobs=[leadJob];const remainder=reply.slice(lead.length);
        if(remainder.trim()){segments.push(remainder);jobs.push(begin(remainder));}
        else if(remainder.length)throw problem(502,'preview_provider_unavailable');
       }else{segments=[reply];jobs=[begin(reply)];}
       state=issuedState(state,history,reply,segments);
       if(action==='retry')state={...state,retried:true,moment:{...state.moment,phase:'alternative_done'}};
      }
      send({type:'reply',reply,segments:segments.map(text=>({text})),state:codec.seal(state),turn:state.turn});
      for(let index=0;index<jobs.length;index++){
       const bytes=await jobs[index];state={...state,completed:index+1};
       send({type:'audio',index,data:bytes.toString('base64'),state:codec.seal(state)});
      }
      send({type:'complete',state:codec.seal(state)});
     }catch(error){
      if(!abort.signal.aborted&&!closed)try{send({type:'error',code:safeError(error)});}catch{}
      abort.abort();
     }finally{
      // A finished function must own no orphan provider work.
      await Promise.allSettled(pending);
      clearTimeout(timer);request.signal.removeEventListener('abort',cancel);
      if(!closed){closed=true;try{controller.close();}catch{}}
     }
    })();
   },
   cancel(){closed=true;abort.abort();clearTimeout(timer);request.signal.removeEventListener('abort',cancel);},
  });
  return new Response(stream,{status:200,headers:{...HEADERS,'Content-Type':'application/x-ndjson; charset=utf-8'}});
 };
}
