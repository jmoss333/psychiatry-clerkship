import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,randomBytes} from 'node:crypto';
import {makeMomentHarness} from './fixtures/moments/runtime.mjs';
import {getCase} from '../lib/case.mjs';
import {createStateCodec,initialState,hash,nextHistory,issuedState,retryState} from '../lib/state.mjs';
import {recommendFamilyBid,pendingFamilyBid,FAMILY_BID_TEXT} from '../lib/family-bids.mjs';

const FAMILY='family_morgan_maya_001',DANA='sp_depression_gated_si_001';
const clock=()=>Date.UTC(2026,8,9,12);
const codec=(h,caseId=FAMILY)=>createStateCodec({key:h.env.DANA_PREVIEW_STATE_KEY,binding:`hosted-sp-v2:${caseId}:${getCase(caseId).binding}:${h.env.DEPLOY_ID}:${h.env.URL}:${hash(h.env.DANA_PREVIEW_PASSCODE)}`,now:clock,withDeliveryIntensity:true});
const startBody=()=>({action:'start',caseId:FAMILY,requestId:randomUUID()});
async function send(h,body){const result=await h.raw(body,{full:true});assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.events.at(-1).type,'complete',JSON.stringify(result.events));return result;}
const question=(state,targetRoleId='morgan',text='What matters to you?',completed=0,extra={})=>({action:'turn',caseId:FAMILY,state,targetRoleId,text,previousPlayback:completed?'played':'interrupted',previousCompletedSegments:completed,...extra});

test('family Start returns an authenticated empty room and reserves one start without speech or actor work',async()=>{
 const h=makeMomentHarness(),body=startBody(),result=await send(h,body);
 assert.deepEqual(result.events,[{type:'ready',caseId:FAMILY,turn:0,state:result.state},{type:'complete',state:result.state}]);
 const state=codec(h).open(result.state);
 assert.equal(state.openingMode,'clinician');assert.equal(state.turn,0);
 assert.deepEqual(state.history,[]);assert.deepEqual(state.segments,[]);assert.equal(state.completed,0);
 assert.deepEqual(h.counts,{actor:0,review:0,speech:0});assert.deepEqual(h.reservations.map(value=>value.units),[1]);
 assert.equal((await h.raw(body,{full:true})).status,409);
 assert.deepEqual(h.counts,{actor:0,review:0,speech:0});assert.equal(h.reservations.length,1);
});

test('silent family Start retains access, request-shape and receipt boundaries before reservation',async()=>{
 const h=makeMomentHarness(),body=startBody();
 for(const options of [{headers:{'x-preview-key':'incorrect'}},{headers:{origin:'https://foreign.example'}},{envPatch:{DANA_PREVIEW_ENABLED:'false'}}]){
  assert.notEqual((await h.raw(body,{full:true,...options})).status,200);
 }
 for(const openingMode of ['clinician','patient',null])assert.equal((await h.raw({...body,openingMode},{full:true})).status,400,'opening mode is server-owned');
 assert.equal(h.reservations.length,0);assert.deepEqual(h.counts,{actor:0,review:0,speech:0});
 const start=await send(h,body);
 assert.equal((await h.raw(question(start.state),{full:true,envPatch:{DEPLOY_ID:'another-deploy'}})).status,400);
 assert.equal(h.reservations.length,1);
});

for(const target of ['morgan','maya'])test(`the clinician's first question reaches ${target} without a fabricated patient opening`,async()=>{
 const h=makeMomentHarness(),start=await send(h,startBody());
 const result=await send(h,question(start.state,target,'I am the clinician. What would you like us to discuss?'));
 const state=codec(h).open(result.state);
 assert.equal(result.events[0].speakerId,target);assert.equal(state.turn,1);assert.equal(state.history.length,2);
 assert.equal(state.history[0].who,'me');assert.equal(state.history[0].targetRoleId,target);
 assert.deepEqual(h.contexts[0].messages,[{role:'user',content:'I am the clinician. What would you like us to discuss?'}]);
 assert.equal(h.counts.actor,1);assert.equal(h.counts.speech,1);assert.deepEqual(h.reservations.map(value=>value.units),[1,3]);
});

test('an empty room cannot claim heard clips or reopen as an unmarked, nonfamily, or malformed state',async()=>{
 const h=makeMomentHarness(),start=await send(h,startBody()),valid=codec(h).open(start.state);
 const withoutMode=structuredClone(valid);delete withoutMode.openingMode;
 const invalid=[withoutMode,{...valid,openingMode:'patient'},{...valid,openingMode:null},{...valid,turn:1},{...valid,segments:['Invented opening.']},{...valid,completed:1},{...valid,history:[{who:'pt',text:'Invented opening.',speakerId:'morgan',playbackStatus:'pending'}]}];
 for(const state of invalid){
  const result=await h.raw(question(codec(h).seal(state)),{full:true});assert.equal(result.status,400);assert.equal(result.error,'preview_state_invalid');
 }
 const forgedDana={...valid,caseId:DANA};
 assert.throws(()=>codec(h,DANA).open(codec(h,DANA).seal(forgedDana)),{code:'preview_state_invalid'});
 assert.equal((await h.raw(question(start.state,'morgan','Hello.',1),{full:true})).status,400);
 assert.deepEqual(h.counts,{actor:0,review:0,speech:0});assert.equal(h.reservations.length,1);
});

test('first-question alternative keeps the original addressee and has no earlier dialogue',async()=>{
 const h=makeMomentHarness(),start=await send(h,startBody());
 let result=await send(h,question(start.state,'maya','What matters to you?'));
 result=await send(h,question(result.state,'morgan','What would you like to discuss?',1));
 const retry=await send(h,{action:'retry',caseId:FAMILY,state:result.state,turnId:1,text:'Maya, what would you like us to understand?'});
 assert.equal(retry.events[0].speakerId,'maya');
 assert.deepEqual(h.contexts.at(-1).messages,[{role:'user',content:'Maya, what would you like us to understand?'}]);
 const state=codec(h).open(retry.state);assert.equal(state.openingMode,'clinician');assert.equal(state.history.length,2);assert.equal(state.retried,true);
 assert.equal((await h.raw(question(retry.state,'morgan','More?',1),{full:true})).status,409);
 assert.deepEqual(h.reservations.map(value=>value.units),[1,3,3,3]);
});

test('later alternative preserves only a completed prior prefix and its original addressee',()=>{
 let state=initialState(undefined,clock,FAMILY,undefined,'standard','clinician');
 state=issuedState(state,nextHistory(state,{text:'First question',targetRoleId:'maya',previousPlayback:'played',previousCompletedSegments:0}),'Heard. Unheard.',['Heard.',' Unheard.'],'maya');state.completed=2;
 state=issuedState(state,nextHistory(state,{text:'Second question',targetRoleId:'morgan',previousPlayback:'interrupted',previousCompletedSegments:1}),'Second reply.',['Second reply.'],'morgan');state.completed=1;
 const child=retryState(state,2,randomBytes(16).toString('hex'));
 assert.equal(child.history.length,2);assert.equal(child.turn,1);
 assert.equal(child.history[0].targetRoleId,'maya');assert.equal(child.history[1].text,'Heard.');assert.equal(child.history[1].omittedTail,true);
 assert.equal(child.completed,1);assert.deepEqual(child.segments,['Heard.']);
 const first=retryState(state,1,randomBytes(16).toString('hex'));
 assert.equal(first.turn,0);assert.deepEqual(first.history,[]);assert.deepEqual(first.segments,[]);assert.equal(first.completed,0);
});

test('legacy patient-first family state remains usable and retains its opening on a first-question alternative',async()=>{
 const h=makeMomentHarness();let legacy=initialState('An earlier heard opening.',clock,FAMILY,'morgan','standard');legacy.completed=1;
 const turn=await send(h,question(codec(h).seal(legacy),'maya','How would you like to begin?',1));
 assert.equal(codec(h).open(turn.state).openingMode,undefined);
 assert.equal(codec(h).open(turn.state).history.length,3);
 const retry=await send(h,{action:'retry',caseId:FAMILY,state:turn.state,turnId:1,text:'Maya, tell me what matters.'});
 assert.equal(retry.events[0].speakerId,'maya');assert.equal(h.contexts.at(-1).messages[0].content,'An earlier heard opening.');
 assert.equal(codec(h).open(retry.state).history.length,3);
});

test('family bids have the same turn timing with or without a patient opening',()=>{
 const me=targetRoleId=>({who:'me',text:'What support matters?',targetRoleId});
 const pt=(speakerId,bid)=>({who:'pt',text:'I want to be heard.',speakerId,playbackStatus:'played',...(bid?{familyBid:{speakerId:bid,text:FAMILY_BID_TEXT,playbackStatus:'played'}}:{})});
 for(const opening of [[],[pt('morgan')]]){
  const history=[...opening,me('morgan'),pt('morgan'),me('morgan')];
  assert.deepEqual(recommendFamilyBid(history,'morgan'),{speakerId:'maya',text:FAMILY_BID_TEXT});
  history.push(pt('morgan','maya'));assert.deepEqual(pendingFamilyBid(history),{speakerId:'maya',text:FAMILY_BID_TEXT});
  history.push(me('maya'),pt('maya'),me('maya'));
  assert.deepEqual(recommendFamilyBid(history,'maya'),{speakerId:'morgan',text:FAMILY_BID_TEXT});
 }
});

test('family cue can accompany the first clinician question without creating an opening turn',async()=>{
 const h=makeMomentHarness(),start=await send(h,startBody());
 const result=await send(h,question(start.state,'maya','What would you like to discuss?',0,{roomCueId:'door_knock'}));
 const state=codec(h).open(result.state);assert.equal(state.history.length,2);assert.deepEqual(state.roomCue,{id:'door_knock',turn:1});
 assert.match(h.contexts.at(-1).system,/AUTHORED FACULTY ROOM EVENT/);
 const retry=await send(h,{action:'retry',caseId:FAMILY,state:result.state,turnId:1,text:'Let us return to your priorities.'});
 assert.deepEqual(codec(h).open(retry.state).roomCue,{id:'door_knock',turn:1});assert.equal(retry.events[0].speakerId,'maya');
});

test('clinician-first family still stops at ten questions and permits only one terminal alternative',async()=>{
 const h=makeMomentHarness();let result=await send(h,startBody());
 for(let turn=1;turn<=10;turn++){
  const completed=result.events.filter(event=>event.type==='audio').length;
  result=await send(h,question(result.state,turn%2?'maya':'morgan','How would you like to begin?',completed));
  const state=codec(h).open(result.state);assert.equal(state.turn,turn);assert.equal(state.history.length,turn*2);
 }
 const before=h.reservations.length;
 assert.equal((await h.raw(question(result.state,'morgan','An eleventh question',1),{full:true})).status,409);
 assert.equal(h.reservations.length,before);
 const alternative=await send(h,{action:'retry',caseId:FAMILY,state:result.state,turnId:1,text:'Maya, what should we understand?'});
 assert.equal(alternative.events[0].speakerId,'maya');
 assert.equal((await h.raw({action:'retry',caseId:FAMILY,state:alternative.state,turnId:1,text:'Another alternative'},{full:true})).status,409);
 assert.equal(h.counts.actor,11);assert.equal(h.reservations.reduce((total,reservation)=>total+reservation.units,0),34);
});
