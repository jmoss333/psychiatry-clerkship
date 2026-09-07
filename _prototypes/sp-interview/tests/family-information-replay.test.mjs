import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
  createRoomState,roomView,beginTurn,issueSegment,applyReceipt,advanceGroup,
  cancelGroup,changeChannel,finishRoom,createRetry,createActorContext
} from '../family-visit-state.mjs';

const require=createRequire(import.meta.url);
const {buildReplay}=require('../family-information-replay.js');
const safeKeys=['id','text','kind','roleId','targetRoleId','channel','turnId'];
const copyEntry=entry=>Object.fromEntries(safeKeys.filter(key=>Object.hasOwn(entry,key)).map(key=>[key,entry[key]]));
const byId=(left,right)=>Number(left.id.slice(1))-Number(right.id.slice(1));

function turn(room,{text,target='morgan',replies=[],interrupted=false}={}){
  const turnId=room.turnCount+1,groupId='g'+turnId;
  const {roles}=beginTurn(room,{turnId,text,targetRoleId:target,channel:room.channel,groupId});
  const ids=[];
  for(const roleId of roles){
    const parts=replies.filter(reply=>reply.roleId===roleId);
    if(!parts.length){cancelGroup(room,{groupId});break;}
    for(const [index,reply] of parts.entries()){
      const segmentId=groupId+'-'+roleId+'-'+index;
      issueSegment(room,{groupId,turnId,roleId,segmentId,text:reply.text});
      if(reply.heard!==false)ids.push(segmentId);
    }
    applyReceipt(room,{groupId,completedSegmentIds:ids,status:interrupted?'interrupted':'played'});
    if(interrupted)break;
    advanceGroup(room,{groupId});
  }
  return turnId;
}
function scenario(){
  const room=createRoomState({sessionId:'session-secret'});
  turn(room,{text:'PUBLIC_QUESTION',target:'both',replies:[{roleId:'morgan',text:'MORGAN_PUBLIC'},{roleId:'maya',text:'MAYA_PUBLIC'}]});
  changeChannel(room,'morgan-private');
  turn(room,{text:'MORGAN_PRIVATE_QUESTION',replies:[{roleId:'morgan',text:'MORGAN_PRIVATE_HEARD'},{roleId:'morgan',text:'MORGAN_PRIVATE_UNHEARD',heard:false}],interrupted:true});
  changeChannel(room,'public');changeChannel(room,'maya-private');
  turn(room,{text:'MAYA_PRIVATE_QUESTION',target:'maya',replies:[{roleId:'maya',text:'MAYA_PRIVATE_HEARD'},{roleId:'maya',text:'MAYA_PRIVATE_UNHEARD',heard:false}],interrupted:true});
  changeChannel(room,'public');
  turn(room,{text:'EARLIER_UNANSWERED_QUESTION',target:'maya'});
  turn(room,{text:'SELECTED_UNANSWERED_QUESTION',target:'both'});
  turn(room,{text:'FUTURE_QUESTION',replies:[{roleId:'morgan',text:'FUTURE_REPLY'}]});
  finishRoom(room);return room;
}
function freezeDeep(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freezeDeep(item);Object.freeze(value);}return value;}

test('each view contains only earlier completed dialogue for its audience in both private directions',()=>{
  const original=scenario(),replay=buildReplay(roomView(original),5);
  assert.deepEqual(replay.question,{text:'SELECTED_UNANSWERED_QUESTION',channel:'public',targetRoleId:'both'});
  assert.equal(replay.turnId,5);assert.deepEqual(replay.views.map(view=>view.id),['learner','morgan','maya']);
  for(const view of replay.views){
    assert.deepEqual(view.shared.map(entry=>entry.text),['PUBLIC_QUESTION','MORGAN_PUBLIC','MAYA_PUBLIC','EARLIER_UNANSWERED_QUESTION']);
    assert.doesNotMatch(JSON.stringify(view),/SELECTED_|FUTURE_|UNHEARD/);
  }
  const [learner,morgan,maya]=replay.views;
  assert.deepEqual(learner.private.map(entry=>entry.text),['MORGAN_PRIVATE_QUESTION','MORGAN_PRIVATE_HEARD','MAYA_PRIVATE_QUESTION','MAYA_PRIVATE_HEARD']);
  assert.deepEqual(morgan.private.map(entry=>entry.text),['MORGAN_PRIVATE_QUESTION','MORGAN_PRIVATE_HEARD']);
  assert.deepEqual(maya.private.map(entry=>entry.text),['MAYA_PRIVATE_QUESTION','MAYA_PRIVATE_HEARD']);
  assert.deepEqual(replay.views.map(view=>view.unconfirmedCount),[2,1,1]);
  assert.deepEqual(replay.views.map(view=>view.excludedPrivateCount),[0,2,2]);
  assert.doesNotMatch(JSON.stringify(morgan),/MAYA_PRIVATE/);assert.doesNotMatch(JSON.stringify(maya),/MORGAN_PRIVATE/);
  for(const view of replay.views)for(const entry of [...view.shared,...view.private])assert.ok(Object.keys(entry).every(key=>safeKeys.includes(key)));
  assert.doesNotMatch(JSON.stringify(replay),/session-secret|groupId|segmentId|audioUrl|caseHash|privateFacts|four to six/);
});

test('before the first question every view is empty and failed or unanswered selected turns remain replayable',()=>{
  const original=scenario(),first=buildReplay(original,1);
  assert.deepEqual(first.views.map(({id,...view})=>view),Array.from({length:3},()=>({shared:[],private:[],unconfirmedCount:0,excludedPrivateCount:0})));
  assert.equal(buildReplay(original,4).question.text,'EARLIER_UNANSWERED_QUESTION');
  assert.equal(buildReplay(original,5).question.text,'SELECTED_UNANSWERED_QUESTION');
});

test('pending and interrupted text never escapes; uncertainty is counted only for eligible audiences',()=>{
  const original=roomView(scenario());
  original.events.find(event=>event.text==='MORGAN_PRIVATE_UNHEARD').status='pending';
  const replay=buildReplay(original,5);
  assert.deepEqual(replay.views.map(view=>view.unconfirmedCount),[2,1,1]);
  assert.doesNotMatch(JSON.stringify(replay),/PRIVATE_UNHEARD/);
  const publicReply=original.events.find(event=>event.text==='MORGAN_PUBLIC');publicReply.audience=['learner','morgan'];
  const limited=buildReplay(original,5);
  assert.ok(limited.views[1].shared.some(entry=>entry.text==='MORGAN_PUBLIC'));
  assert.ok(!limited.views[2].shared.some(entry=>entry.text==='MORGAN_PUBLIC'),'public channel alone does not grant an audience');
});

test('replay matches actual beginTurn snapshots and permitted completed actor history',()=>{
  const original=scenario();
  for(const turnId of [1,2,3,4,5,6]){
    const replay=buildReplay(original,turnId),snapshot=original.snapshots.get(turnId);
    const earlier=snapshot.events.filter(event=>(event.kind==='learner'||event.kind==='segment')&&event.status==='completed');
    assert.deepEqual([...replay.views[0].shared,...replay.views[0].private].sort(byId),earlier.map(copyEntry));
    for(const roleId of ['morgan','maya']){
      const projection=createActorContext({...original,events:snapshot.events,channel:snapshot.channel},roleId);
      const expected=projection.history.filter(event=>event.kind==='learner'||event.kind==='segment').map(copyEntry);
      const view=replay.views.find(view=>view.id===roleId);
      assert.deepEqual([...view.shared,...view.private].sort(byId),expected);
    }
  }
});

test('only finished original rooms and an existing numeric question id can be replayed',()=>{
  const original=scenario();
  for(const invalid of [null,undefined,{},[],{...roomView(original),status:'active'},{...original,finished:false}])assert.equal(buildReplay(invalid,1),null);
  for(const turnId of [0,-1,1.5,7,'1',null,NaN,Infinity])assert.equal(buildReplay(original,turnId),null);
  const child=createRetry(original,{turnId:6,sessionId:'child-secret'});finishRoom(child);
  assert.equal(buildReplay(child,1),null);assert.equal(buildReplay(roomView(child),1),null);
});

const badMutations={
  'unknown role':event=>{event.roleId='assistant';},
  'wrong private role':event=>{event.roleId='maya';},
  'unknown channel':event=>{event.channel='private';},
  'cross-owner audience':event=>{event.audience=['learner','morgan','maya'];},
  'unknown audience member':event=>{event.audience=['learner','morgan','administrator'];},
  'duplicate audience':event=>{event.audience=['learner','morgan','morgan'];},
  'non-array audience':event=>{event.audience='learner,morgan';},
  'empty audience':event=>{event.audience=[];},
  'missing audience':event=>{delete event.audience;},
  'unknown status':event=>{event.status='played';},
  'object text':event=>{event.text={secret:'unsafe'};},
  'control text':event=>{event.text='unsafe\u0000text';},
  'invalid surrogate':event=>{event.text='unsafe\ud800text';},
  'unknown event kind':event=>{event.kind='system';},
  'bad event id':event=>{event.id={secret:'unsafe'};},
  'extra target on segment':event=>{event.targetRoleId='both';},
  'mismatched turn':event=>{event.turnId=1;},
};
for(const [name,mutate] of Object.entries(badMutations))test('malformed event fails the entire replay closed: '+name,()=>{
  const original=roomView(scenario()),event=original.events.find(event=>event.text==='MORGAN_PRIVATE_HEARD');mutate(event);
  assert.equal(buildReplay(original,5),null);
});

test('ambiguous questions, malformed transitions, and unsafe future records fail closed',()=>{
  for(const mutate of [
    room=>{room.events.find(event=>event.text==='SELECTED_UNANSWERED_QUESTION').targetRoleId='someone';},
    room=>{room.events.find(event=>event.text==='MORGAN_PRIVATE_QUESTION').targetRoleId='both';},
    room=>{room.events.find(event=>event.kind==='transition').audience=['external'];},
    room=>{room.events.find(event=>event.text==='FUTURE_REPLY').status='unknown';},
    room=>{room.events.push({...room.events.find(event=>event.text==='SELECTED_UNANSWERED_QUESTION')});},
    room=>{const event=room.events.find(event=>event.text==='MORGAN_PRIVATE_HEARD');Object.defineProperty(event,'text',{get(){throw new Error('must not call an accessor');}});},
  ]){
    const original=roomView(scenario());mutate(original);assert.doesNotThrow(()=>assert.equal(buildReplay(original,5),null));
  }
});

test('input remains deeply unchanged and outputs share no mutable references across calls or views',()=>{
  const original=freezeDeep(roomView(scenario())),before=structuredClone(original),first=buildReplay(original,5),second=buildReplay(original,5);
  first.question.text='changed';first.views[0].shared[0].text='changed';first.views[0].private.splice(0);first.views[1].unconfirmedCount=99;
  assert.equal(first.views[1].shared[0].text,'PUBLIC_QUESTION');
  assert.deepEqual(buildReplay(original,5),second);assert.deepEqual(original,before);
});

test('non-enumerable and array accessors are rejected without executing them',()=>{
  for(const location of ['event-text','audience-member','event-array']){
    const original=roomView(scenario()),event=original.events.find(event=>event.text==='MORGAN_PRIVATE_HEARD');let reads=0;
    if(location==='event-text')Object.defineProperty(event,'text',{enumerable:false,get(){reads++;return 'MORGAN_PRIVATE_HEARD';}});
    if(location==='audience-member')Object.defineProperty(event.audience,'0',{get(){reads++;return 'learner';}});
    if(location==='event-array'){const first=original.events[0];Object.defineProperty(original.events,'0',{get(){reads++;return first;}});}
    assert.equal(buildReplay(original,5),null);assert.equal(reads,0,location);
  }
});

test('browser UMD exposes the same pure API without network, storage, or case imports',()=>{
  const source=readFileSync(new URL('../family-information-replay.js',import.meta.url),'utf8');
  const window={};
  const fail=()=>{throw new Error('external capability must not be accessed');};
  vm.runInNewContext(source,{window,fetch:fail,XMLHttpRequest:fail,localStorage:{getItem:fail,setItem:fail},sessionStorage:{getItem:fail,setItem:fail}},{timeout:1000});
  assert.equal(typeof window.FamilyInformationReplay?.buildReplay,'function');
  assert.deepEqual(JSON.parse(JSON.stringify(window.FamilyInformationReplay.buildReplay(roomView(scenario()),5))),buildReplay(roomView(scenario()),5));
});
