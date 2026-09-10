import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeMomentHarness} from './fixtures/moments/runtime.mjs';
import {getMoment} from '../lib/moments/catalog.mjs';
import {createMomentCodec} from '../lib/moments/state.mjs';
import {createMomentHandler} from '../lib/moments/handler.mjs';
const id='moment_elena_rupture_001';
const turn=state=>({action:'turn',scenarioId:id,state,text:'Please explain.',previousPlayback:'played',previousCompletedSegments:1});
const review=state=>({action:'debrief',scenarioId:id,state,previousPlayback:'played',previousCompletedSegments:1,outputs:{teamFormulation:'',summaryUncertain:false},uncertainTurnIds:[],endReason:'learner_end'});

test('maximal segmented path: 19 units, 1 start, 5 actors, 11 speech calls, 1 evaluator',async()=>{
 const h=makeMomentHarness();h.provider.replyStream=async({onLead})=>{h.counts.actor++;onLead('This first sentence is complete.');return 'This first sentence is complete. Another sentence follows.';};
 let s=await h.start();for(let n=0;n<4;n++)s=await h.turn(s,'I am listening.',{previousCompletedSegments:n===0?1:2});
 const r=await h.raw({...review(s),previousCompletedSegments:2});await h.retry(r.state,2,'Let me try again.');
 assert.deepEqual(h.counts,{actor:5,speech:11,review:1});assert.equal(h.reservations.reduce((n,x)=>n+x.units,0),19);assert.equal(h.reservations.filter(x=>x.units===1).length,1);
});
test('zero and partial heard patient content omitted from evaluator and alternative',async()=>{
 const h=makeMomentHarness();const contexts=[];h.provider.replyStream=async c=>{contexts.push(c);c.onLead('A short heard sentence appears.');return 'A short heard sentence appears. UnheardTailCanary';};h.provider.evaluateMoment=async c=>{contexts.push(c);throw Error();};
 let s=await h.start();s=await h.turn(s,'FIRST_LEARNER',{previousCompletedSegments:0,previousPlayback:'interrupted'});s=await h.turn(s,'FUTURE_LEARNER',{previousCompletedSegments:1,previousPlayback:'interrupted'});
 const closed=await h.raw({...review(s),previousCompletedSegments:0,previousPlayback:'interrupted'});await h.retry(closed.state,1,'ALTERNATIVE_LEARNER');
 assert.equal(contexts[0].messages.some(m=>m.role==='assistant'),false);
 assert.equal(JSON.stringify(contexts[1].messages).includes('UnheardTailCanary'),false);
 const sources=contexts[2].sources;assert.equal(sources.some(s=>s.id==='p0'||s.id==='p2'),false);assert.equal(sources.find(s=>s.id==='p1').text,'A short heard sentence appears.');
 assert.equal(JSON.stringify(contexts[3].messages).includes('FUTURE_LEARNER'),false);assert.equal(contexts[3].messages.some(m=>m.role==='assistant'),false);
});
test('failed actor burns continuation and forbids alternate branch or review, including midnight',async()=>{
 let time=Date.UTC(2026,8,9,23,59);const h=makeMomentHarness({now:()=>time});let s=await h.start();s=await h.turn(s,'Hello');let calls=0;h.provider.replyStream=async()=>{calls++;throw Error();};
 const result=await h.raw(turn(s));assert.equal(result.events.at(-1).type,'error');assert.equal(calls,1);time+=120000;
 for(const body of [turn(s),{...turn(s),text:'Other'},review(s)])assert.equal((await h.raw(body)).status,409);
 assert.equal(calls,1);assert.equal(h.reservations.length,3);assert.equal(h.counts.review,0);
});
test('midnight closed nonce remains single-use across encryptions and deployments',async()=>{
 let time=Date.UTC(2026,8,9,23,59);const h=makeMomentHarness({now:()=>time});let s=await h.start();s=await h.turn(s,'Hello');const c=await h.debrief(s);const codec=createMomentCodec({definition:getMoment(id),env:h.env,origin:h.env.URL,now:()=>time});const c2=codec.seal(codec.open(c));
 time+=120000;const bodies=[c,c2].map((state,i)=>({action:'retry',scenarioId:id,state,turnId:1,text:`Alternative ${i}`}));
 const rs=await Promise.all(bodies.map(b=>h.raw(b)));assert.equal(rs.filter(r=>r.status===200).length,1);assert.equal(rs.filter(r=>r.status===409).length,1);
 assert.equal((await h.raw(bodies[0],{envPatch:{DEPLOY_ID:'another'}})).status,400);assert.equal(h.reservations.length,4);
});
test('invalid debrief playback, shapes and flags never reserve or evaluate',async()=>{
 const h=makeMomentHarness();let s=await h.start();s=await h.turn(s,'Hello');const b=review(s);
 for(const patch of [{previousCompletedSegments:-1},{previousCompletedSegments:2},{previousCompletedSegments:0.1},{previousPlayback:'unknown'},{previousPlayback:null},{uncertainTurnIds:[2]},{uncertainTurnIds:[1,1]},{uncertainTurnIds:[1.1]},{endReason:'turn_limit'},{outputs:{teamFormulation:'',summaryUncertain:true}},{outputs:{teamFormulation:'',summaryUncertain:false,privateReflection:'secret'}},{reflection:'secret'}])assert.notEqual((await h.raw({...b,...patch})).status,200);
 assert.equal(h.reservations.length,2);assert.equal(h.counts.review,0);
});
test('shared rolling and daily exhaustion block review before provider work',async()=>{
 for(const target of ['window','day']){
  let time=Date.UTC(2026,8,9,12);const h=makeMomentHarness({now:()=>time});let s=await h.start();s=await h.turn(s,'Hello');
  // Seed real operations through the same CAS adapter. For daily boundary, old
  // charges are >=30m old while the moment receipt is newly issued below.
  if(target==='day'){
   for(let n=0;n<112;n++)await h.budget().reserve({operationId:`seed:${n}`,bindingHash:'a'.repeat(64),units:3});
   time+=31*60000;
   s=await h.start();s=await h.turn(s,'Hello');
  }
  for(let n=0;n<111;n++)await h.budget().reserve({operationId:`fill:${n}`,bindingHash:'b'.repeat(64),units:3});
  // Window: 337, add 3 -> 340 then review exceeds. Day: 674, add 3 twice -> 680.
  await h.budget().reserve({operationId:'end:1',bindingHash:'c'.repeat(64),units:3});

  const before=h.reservations.length,result=await h.raw(review(s));assert.equal(result.status,429);assert.equal(result.error,target==='day'?'preview_budget_exhausted':'preview_window_exhausted');assert.equal(h.reservations.length,before);assert.equal(h.counts.review,0);
 }
});
test('request aborted before validation completion performs no provider work',async()=>{
 const h=makeMomentHarness(),a=new AbortController();a.abort();
 const response=await createMomentHandler({env:h.env,provider:h.provider,budget:h.budget()})(new Request(h.env.URL+'/api/practice-moment',{method:'POST',headers:{origin:h.env.URL,'x-preview-key':h.env.DANA_PREVIEW_PASSCODE,'content-type':'application/json'},body:JSON.stringify({action:'start',scenarioId:id,requestId:randomUUID()}),signal:a.signal}));assert.equal(response.status,409);assert.equal(h.reservations.length,0);assert.equal(h.counts.speech,0);
});
test('cancel after review-start aborts evaluator but retains charged closure and one alternative',async()=>{
 const h=makeMomentHarness();let s=await h.start();s=await h.turn(s,'Hello');let observed=false;
 h.provider.evaluateMoment=async({signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{observed=true;reject(Error('cancelled'));},{once:true});});
 const response=await createMomentHandler({env:h.env,provider:h.provider,budget:h.budget(),now:()=>Date.UTC(2026,8,9,12)})(new Request(h.env.URL+'/api/practice-moment',{method:'POST',headers:{origin:h.env.URL,'x-preview-key':h.env.DANA_PREVIEW_PASSCODE,'content-type':'application/json'},body:JSON.stringify(review(s))}));
 const reader=response.body.getReader(),first=JSON.parse(new TextDecoder().decode((await reader.read()).value));assert.equal(first.type,'review-start');await reader.cancel();assert.equal(observed,true);
 assert.equal((await h.raw(review(s))).status,409);await h.retry(first.state,1,'I would like to understand.');assert.equal(h.reservations.reduce((n,x)=>n+x.units,0),10);
});
