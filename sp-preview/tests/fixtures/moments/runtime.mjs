import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMomentHandler} from '../../../lib/moments/handler.mjs';
import {createHandler} from '../../../lib/handler.mjs';
import {createPreviewBudget} from '../../../lib/budget.mjs';
export function makeMomentHarness({now,providerOverrides={}}={}){
 let time=Date.UTC(2026,8,9,12),record=null,etag=0;now=now||(()=>time);
 const counts={actor:0,review:0,speech:0},reservations=[],contexts=[];
 const env={DANA_PREVIEW_ENABLED:'true',DANA_PREVIEW_PASSCODE:'fictional-test-passcode',DANA_PREVIEW_STATE_KEY:Buffer.alloc(32,4).toString('base64url'),DEPLOY_ID:'fixture-deploy',URL:'https://fixture.test',DANA_PREVIEW_BUDGET_NAMESPACE:'shared-fixture'};
 const store={async getWithMetadata(){return record?{data:structuredClone(record),etag:String(etag)}:null;},async set(key,value,opts){await Promise.resolve();if(opts.onlyIfNew&&record||opts.onlyIfMatch!==undefined&&opts.onlyIfMatch!==String(etag))return {modified:false};record=JSON.parse(value);return {modified:true,etag:String(++etag)};}};
 const provider={configured:true,async speak(){counts.speech++;return Buffer.concat([Buffer.from('ID3'),Buffer.alloc(157)]);},async replyStream(context){counts.actor++;contexts.push(context);return 'What matters to me is being understood.';},async evaluateMoment(context){counts.review++;contexts.push(context);throw Error('fixture evaluator unavailable');},...providerOverrides};
 function budget(){const real=createPreviewBudget({store,namespace:env.DANA_PREVIEW_BUDGET_NAMESPACE,now});return {async reserve(r){const result=await real.reserve(r);reservations.push(r);return result;}};}
 async function raw(body,{full=false,envPatch={},headers={}}={}){
  const response=await (full?createHandler:createMomentHandler)({env:{...env,...envPatch},provider,budget:budget(),now})(new Request(env.URL+(full?'/api/dana-preview':'/api/practice-moment'),{method:'POST',headers:{origin:env.URL,'x-preview-key':env.DANA_PREVIEW_PASSCODE,'content-type':'application/json',...headers},body:JSON.stringify(body)}));
  const text=await response.text();let events=[];if(response.ok)events=text.trim().split('\n').filter(Boolean).map(JSON.parse);
  return {status:response.status,events,error:response.ok?null:JSON.parse(text).error,state:events.filter(e=>e.state).at(-1)?.state};
 }
 let scenarioId='moment_elena_rupture_001';
 async function requireState(body,options){const result=await raw(body,options);assert.equal(result.status,200,JSON.stringify(result));assert.ok(result.state);return result.state;}
 const playback={previousPlayback:'played',previousCompletedSegments:1};
 return {env,store,provider,counts,reservations,contexts,raw,advance:ms=>{time+=ms;},read:()=>structuredClone(record),budget,
  start:async(id=scenarioId)=>{scenarioId=id;return requireState({action:'start',scenarioId,requestId:randomUUID()});},
  turn:(state,text,extra={})=>requireState({action:'turn',scenarioId,state,text,...playback,...extra}),
  debrief:(state,outputs={teamFormulation:'',summaryUncertain:false},uncertainTurnIds=[])=>requireState({action:'debrief',scenarioId,state,...playback,outputs,uncertainTurnIds,endReason:'learner_end'}),
  retry:(state,turnId,text)=>requireState({action:'retry',scenarioId,state,turnId,text}),
 };
}
