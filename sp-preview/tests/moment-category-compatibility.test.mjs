import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMomentHandler} from '../lib/moments/handler.mjs';
import {getMoment} from '../lib/moments/catalog.mjs';
import {makeMomentHarness} from './fixtures/moments/runtime.mjs';

const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})')(clientModule,clientModule.exports);
const {createReviewParser,createController}=clientModule.exports;
const scenarioId='moment_elena_rupture_001';
const categories=['provider_timeout','provider_invalid','citation_invalid','budget','unknown'];
const debrief=state=>({action:'debrief',scenarioId,state,previousPlayback:'played',previousCompletedSegments:1,outputs:{teamFormulation:'',summaryUncertain:false},uncertainTurnIds:[],endReason:'learner_end'});

function failure(category){
  const error=new Error('PROVIDER_PRIVATE_DETAIL');
  if(category==='provider_timeout')return Object.assign(error,{code:'provider_timeout',category:'api'});
  if(category==='provider_invalid')return Object.assign(error,{code:'protocol_final',category:'protocol'});
  if(category==='budget')return Object.assign(error,{code:'preview_budget_exhausted'});
  return error;
}

function parse(events){
  const states=[],unavailable=[];
  const parser=createReviewParser({scenarioId,onState:value=>states.push(value),onUnavailable:()=>unavailable.push(true)});
  const text=events.map(event=>JSON.stringify(event)+'\n').join('');
  // The response reader can split inside a field or an event boundary.
  for(let at=0;at<text.length;at+=37)parser.push(text.slice(at,at+37));
  return {result:parser.finish(),states,unavailable};
}

for(const category of categories)test(`actual ${category} review stream reaches the fallback and preserves one alternative`,async()=>{
  let evaluations=0;
  const h=makeMomentHarness({providerOverrides:{async evaluateMoment(){evaluations++;if(category==='citation_invalid')return {schemaVersion:1,scenarioId:'wrong',findings:[]};throw failure(category);}}});
  const start=await h.start(scenarioId),turn=await h.turn(start,'What matters to you?');
  const response=await h.raw(debrief(turn));
  assert.equal(response.status,200);
  assert.equal(response.events.find(event=>event.type==='review-unavailable').category,category);
  assert.equal(JSON.stringify(response.events).includes('PROVIDER_PRIVATE_DETAIL'),false);
  const parsed=parse(response.events);
  assert.deepEqual(parsed.states,[response.state]);
  assert.deepEqual(parsed.unavailable,[true]);
  assert.equal(parsed.result.state,response.state);
  assert.equal(evaluations,1);
  assert.equal(h.reservations.length,3);
  await h.retry(parsed.result.state,1,'Let me check what I understood.');
  assert.equal(evaluations,1);
  assert.equal(h.reservations.length,4);
  assert.equal(h.reservations.reduce((total,reservation)=>total+reservation.units,0),10);
  assert.notEqual((await h.raw({action:'retry',scenarioId,state:parsed.result.state,turnId:1,text:'A second alternative'})).status,200);
  assert.equal(h.reservations.length,4);
});

test('legacy unavailable frames remain compatible; arbitrary categories and extra fields fail closed',()=>{
  const start={type:'review-start',state:'closed-receipt'},complete={type:'review-complete',state:'closed-receipt'};
  const legacy={type:'review-unavailable',code:'preview_review_unavailable'};
  assert.deepEqual(parse([start,legacy,complete]).unavailable,[true]);
  for(const category of ['provider_private_detail','',null,4,{message:'private'},['unknown']]){
    assert.throws(()=>parse([start,{...legacy,category},complete]),error=>error.code==='protocol_error');
  }
  for(const event of [null,[],4,'private'])assert.throws(()=>parse([start,event,complete]),error=>error.code==='protocol_error');
  assert.throws(()=>parse([start,{...legacy,category:'unknown',message:'PROVIDER_PRIVATE_DETAIL'},complete]),error=>error.code==='protocol_error');
});

test('controller uses the existing unavailable-feedback state without retrying the provider',async()=>{
  let evaluations=0,requests=0;
  const h=makeMomentHarness({providerOverrides:{async evaluateMoment(){evaluations++;throw failure('provider_timeout');}}});
  const handler=createMomentHandler({env:h.env,provider:h.provider,budget:h.budget(),now:()=>Date.UTC(2026,8,9,12)});
  const env={document:{hidden:false},crypto:{randomUUID:()=> '123e4567-e89b-42d3-a456-426614174000'},atob,Blob,setTimeout,clearTimeout,
    URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},
    Audio:class{play(){queueMicrotask(()=>this.onended?.());return Promise.resolve();}pause(){}removeAttribute(){}load(){}},
    fetch(path,options){requests++;return handler(new Request(h.env.URL+path,{...options,headers:{...options.headers,origin:h.env.URL}}));}};
  const controller=createController(env,{getMomentProfile:getMoment});
  try{
    assert.equal(await controller.start(h.env.DANA_PREVIEW_PASSCODE,false,scenarioId),true);
    assert.equal(await controller.send('What matters to you?'),true);
    controller.end();
    assert.equal(await controller.requestMomentReview(),false);
    const snapshot=controller.getSnapshot();
    assert.equal(snapshot.momentStage,'review_unavailable');
    assert.equal(snapshot.closedReceiptAvailable,true);
    assert.equal(snapshot.restartRequired,false);
    // A recognized unavailable event is ordinary fallback, not a protocol error.
    assert.equal(snapshot.error,'');
    assert.equal(evaluations,1);assert.equal(requests,3);
    assert.equal(await controller.requestMomentReview(),false);
    assert.equal(evaluations,1);assert.equal(requests,3);
    assert.equal(await controller.retry(1,'Let me check what I understood.'),true);
    assert.equal(controller.getSnapshot().momentStage,'alternative_done');
    assert.equal(controller.getSnapshot().closedReceiptAvailable,false);
    assert.equal(evaluations,1);assert.equal(requests,4);
    assert.equal(await controller.retry(1,'Another try'),false);
    assert.equal(requests,4);
  }finally{controller.dispose();}
});
