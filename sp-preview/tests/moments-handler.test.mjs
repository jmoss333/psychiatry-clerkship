import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {makeMomentHarness} from './fixtures/moments/runtime.mjs';
import {getMoment} from '../lib/moments/catalog.mjs';
import {createMomentCodec} from '../lib/moments/state.mjs';
import {createMomentHandler} from '../lib/moments/handler.mjs';
const id='moment_elena_rupture_001',fullId='sp_depression_gated_si_001';
const turn=state=>({action:'turn',scenarioId:id,state,text:'What matters?',previousPlayback:'played',previousCompletedSegments:1});
const review=state=>({action:'debrief',scenarioId:id,state,previousPlayback:'played',previousCompletedSegments:1,outputs:{teamFormulation:'',summaryUncertain:false},uncertainTurnIds:[],endReason:'learner_end'});
test('four turns, review and alternative bounded to one start and 19 units',async()=>{
 const h=makeMomentHarness();let s=await h.start(id);for(let i=0;i<4;i++)s=await h.turn(s,'What matters?');
 assert.equal((await h.raw(turn(s))).status,409);const closed=await h.debrief(s);const alt=await h.retry(closed,1,'What should I understand?');
 assert.equal(h.reservations.reduce((n,r)=>n+r.units,0),19);assert.equal(h.reservations.filter(r=>r.units===1).length,1);assert.deepEqual(h.counts,{actor:5,review:1,speech:6});
 for(const body of [turn(s),review(s),review(closed),turn(closed),turn(alt),{action:'retry',scenarioId:id,state:alt,turnId:1,text:'Again'}])assert.notEqual((await h.raw(body)).status,200);
 assert.equal(h.reservations.length,7);
});
test('invalid shape, zero-turn review, playback, flags and summary fail before reservation',async()=>{
 const h=makeMomentHarness(),s=await h.start(id);const count=h.reservations.length;
 for(const b of [review(s),{...turn(s),reflection:'PRIVATE'},{...turn(s),previousCompletedSegments:2},{...turn(s),scenarioId:fullId},{...review(s),outputs:{teamFormulation:'x',summaryUncertain:false}},{...review(s),uncertainTurnIds:[1,1]}])assert.notEqual((await h.raw(b)).status,200);
 assert.equal(h.reservations.length,count);assert.equal(h.counts.actor+h.counts.review,0);
});
test('concurrent turn and review compete across fresh handlers and real CAS',async()=>{
 const h=makeMomentHarness();let s=await h.start(id);s=await h.turn(s,'Hello');const results=await Promise.all([h.raw(turn(s)),h.raw(review(s))]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(h.reservations.length,3);assert.equal(h.counts.actor+h.counts.review,2);
});
test('review failure closes once; encrypted representations cannot buy two alternatives',async()=>{
 const h=makeMomentHarness();let s=await h.start(id);s=await h.turn(s,'Hello');const r=await h.raw(review(s));assert.deepEqual(r.events.map(e=>e.type),['review-start','review-unavailable','review-complete']);assert.equal(r.events[0].state,r.state);
 const codec=createMomentCodec({definition:getMoment(id),env:h.env,origin:h.env.URL,now:()=>Date.UTC(2026,8,9,12)}),other=codec.seal(codec.open(r.state));
 const results=await Promise.all([h.raw({action:'retry',scenarioId:id,state:r.state,turnId:1,text:'Hello again'}),h.raw({action:'retry',scenarioId:id,state:other,turnId:1,text:'Different'})]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(h.counts.review,1);
});
test('review failures are sorted into a bounded category, counted in diagnostics, and never leak provider text',async()=>{
 let mode='provider_timeout';
 const secret={provider_timeout:'LEAK_TIMEOUT_DETAIL',provider_invalid:'LEAK_PROTOCOL_DETAIL',citation_invalid:'LEAK_CITATION_DETAIL',budget:'LEAK_BUDGET_DETAIL',unknown:'LEAK_UNKNOWN_DETAIL'};
 const evaluateMoment=async()=>{
  if(mode==='citation_invalid')return {schemaVersion:1,scenarioId:'not-this-scenario',findings:[],leak:secret.citation_invalid};
  if(mode==='provider_timeout')throw Object.assign(new Error(secret.provider_timeout),{code:'provider_timeout',category:'api'});
  if(mode==='provider_invalid')throw Object.assign(new Error(secret.provider_invalid),{code:'protocol_final',category:'protocol'});
  if(mode==='budget')throw Object.assign(new Error(secret.budget),{code:'preview_budget_exhausted'});
  throw new Error(secret.unknown);
 };
 const h=makeMomentHarness({providerOverrides:{evaluateMoment}});
 const handler=createMomentHandler({env:h.env,provider:h.provider,budget:h.budget(),now:()=>Date.UTC(2026,8,9,12)});
 async function send(body){
  const response=await handler(new Request(h.env.URL+'/api/practice-moment',{method:'POST',headers:{origin:h.env.URL,'x-preview-key':h.env.DANA_PREVIEW_PASSCODE,'content-type':'application/json'},body:JSON.stringify(body)}));
  const text=await response.text();const events=response.ok?text.trim().split('\n').filter(Boolean).map(JSON.parse):[];
  return {status:response.status,events,state:events.filter(e=>e.state).at(-1)?.state};
 }
 const expected={provider_timeout:0,provider_invalid:0,citation_invalid:0,budget:0,unknown:0};
 for(const category of Object.keys(expected)){
  mode=category;
  const start=await send({action:'start',scenarioId:id,requestId:randomUUID()});assert.equal(start.status,200);
  const turnResult=await send({action:'turn',scenarioId:id,state:start.state,text:'Hello',previousPlayback:'played',previousCompletedSegments:1});assert.equal(turnResult.status,200);
  const r=await send({action:'debrief',scenarioId:id,state:turnResult.state,previousPlayback:'played',previousCompletedSegments:1,outputs:{teamFormulation:'',summaryUncertain:false},uncertainTurnIds:[],endReason:'learner_end'});
  assert.equal(r.status,200);
  const unavailable=r.events.find(e=>e.type==='review-unavailable');
  assert.equal(unavailable.code,'preview_review_unavailable');
  assert.equal(unavailable.category,category);
  assert.equal(JSON.stringify(r.events).includes(secret[category]),false);
  expected[category]++;
  assert.deepEqual(handler.getDiagnostics(),expected);
 }
});
test('full and moment share start operation IDs, budget and endpoint binding',async()=>{
 const h=makeMomentHarness(),requestId=randomUUID();const a=await h.raw({action:'start',scenarioId:id,requestId});assert.equal(a.status,200);
 assert.equal((await h.raw({action:'start',caseId:fullId,requestId},{full:true})).status,409);
 assert.equal((await h.raw({action:'turn',caseId:fullId,state:a.state,text:'Hello',previousPlayback:'played',previousCompletedSegments:1},{full:true})).status,400);
 for(let i=1;i<20;i++){const r=i%2?await h.raw({action:'start',caseId:fullId,requestId:randomUUID()},{full:true}):await h.raw({action:'start',scenarioId:id,requestId:randomUUID()});assert.equal(r.status,200);}
 assert.equal((await h.raw({action:'start',scenarioId:id,requestId:randomUUID()})).error,'preview_daily_starts_exhausted');assert.equal(h.read().schemaVersion,2);assert.equal(h.read().limit,680);assert.equal(h.read().windowLimit,340);assert.equal(h.read().startLimit,20);
});
test('disabled, unauthorized and cross-deploy requests spend nothing',async()=>{
 const h=makeMomentHarness(),body={action:'start',scenarioId:id,requestId:randomUUID()};assert.equal((await h.raw(body,{envPatch:{DANA_PREVIEW_ENABLED:'false'}})).status,503);assert.equal((await h.raw(body,{headers:{'x-preview-key':'wrong'}})).status,403);assert.equal(h.reservations.length,0);
 const s=await h.start();assert.equal((await h.raw(turn(s),{envPatch:{DEPLOY_ID:'new'}})).status,400);assert.equal(h.reservations.length,1);
});
