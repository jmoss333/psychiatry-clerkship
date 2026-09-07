import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext} from '../dana-live-context.mjs';
import profiles from '../sp-encounter-profiles.js';
import encounterUI from '../sp-encounter-ui.js';
import localCases from '../sp-interview.local-cases.js';
import {familyCase} from '../family-visit-case.mjs';
import {
  createRoomState,beginTurn,issueSegment,applyReceipt,advanceGroup,
  changeChannel,finishRoom,createRetry,createActorContext,roomView
} from '../family-visit-state.mjs';

const pack = JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json',import.meta.url),'utf8'));
const cases = [...pack.cases,...localCases.cases];
function oneTurn(room,roleId,text,reply,{interrupted=false}={}) {
  const turnId=room.turnCount+1,groupId='g'+turnId,segmentId='s'+turnId;
  beginTurn(room,{turnId,groupId,text,targetRoleId:roleId,channel:room.channel});
  issueSegment(room,{groupId,turnId,segmentId,roleId,text:reply});
  applyReceipt(room,{groupId,completedSegmentIds:interrupted?[]:[segmentId],status:interrupted?'interrupted':'played'});
  if(!interrupted)advanceGroup(room,{groupId});
  return turnId;
}

test('each single-patient prompt integrates only its own behavior while retaining locked disclosure boundaries',()=>{
  for(const caseDef of cases){
    const {system,state}=createContext(caseDef,['Hello. What would you like us to focus on?'],[
      {who:'pt',text:caseDef.persona.opening,playbackStatus:'played'},
      {who:'me',text:'Hello. What would you like us to focus on?'}
    ]);
    const profile=profiles.getProfile(caseDef.id),role=profile.participants[0];
    assert.match(system,new RegExp('STANDARDIZED PATIENT PORTRAYAL — '+role.name));
    for(const priority of role.priorities)assert.ok(system.includes(priority));
    assert.match(system,/reflective pauses, accent, fluency, or speaking speed/);
    assert.match(system,/not automatic agreement/);
    assert.match(system,/clinical facts and disclosure permissions governed by the authoritative case/);
    assert.deepEqual(Object.keys(state.unlocked),[]);
    for(const gate of caseDef.gated){
      assert.ok(!system.includes(gate.reveal),'locked reveal must not enter '+caseDef.id);
      if(gate.repeatAsk)assert.ok(!system.includes(gate.repeatAsk));
    }
    assert.ok(!system.includes(caseDef.hiddenAgenda),'raw hidden agenda must not enter '+caseDef.id);
    for(const other of cases.filter(item=>item.id!==caseDef.id))assert.ok(!system.includes('STANDARDIZED PATIENT PORTRAYAL — '+other.persona.displayName));
  }
});

test('interruption continuity contains delivery metadata but never the unheard reply',()=>{
  for(const caseDef of cases){
    const first='Could you explain more?',last='I interrupted. Please continue in your own words.';
    const context=createContext(caseDef,[first,last],[
      {who:'pt',text:caseDef.persona.opening,playbackStatus:'played'},
      {who:'me',text:first},{who:'pt',text:'UNHEARD_CASE_SENTINEL',playbackStatus:'interrupted'},
      {who:'me',text:last}
    ]);
    assert.doesNotMatch(JSON.stringify(context),/UNHEARD_CASE_SENTINEL/);
    assert.match(context.system,/Your speech was interrupted/);
    assert.match(context.system,/Never blame or judge the learner from playback metadata/);
    assert.equal(context.messages.at(-1).content,last);
    assert.deepEqual(Object.keys(context.state.unlocked),[],'a conversational repair alone does not unlock disclosures');
  }
});

test('interruption metadata names the learner turn rather than the transcript entry index',()=>{
  const caseDef=cases[0];
  const context=createContext(caseDef,['First question.','Second question.'],[
    {who:'pt',text:caseDef.persona.opening,playbackStatus:'played'},
    {who:'me',text:'First question.'},{who:'pt',text:'First response.',playbackStatus:'interrupted'},
    {who:'me',text:'Second question.'}
  ]);
  const interruption=context.system.split('\n').find(line=>line.startsWith('Your speech was interrupted'));
  assert.match(interruption,/Your speech was interrupted near turn 1\./);
  assert.doesNotMatch(interruption,/Your speech was interrupted near turn 2\./);
});

test('family behavior retains only own private memory and never presents private interruption cues as public',()=>{
  const room=createRoomState({sessionId:'encounter-review'});
  changeChannel(room,'morgan-private');
  oneTurn(room,'morgan','MORGAN_PRIVATE_QUESTION','MORGAN_PRIVATE_COMPLETED');
  oneTurn(room,'morgan','Morgan, continue.','MORGAN_PRIVATE_UNHEARD',{interrupted:true});
  const morganPrivate=createActorContext(room,'morgan');
  assert.match(JSON.stringify(morganPrivate),/four to six beers/);
  assert.match(morganPrivate.system,/Your speech was interrupted/);
  changeChannel(room,'maya-private');
  oneTurn(room,'maya','MAYA_PRIVATE_QUESTION','MAYA_PRIVATE_COMPLETED');
  const mayaPrivate=createActorContext(room,'maya');
  assert.match(JSON.stringify(mayaPrivate),/saying no.*not caring/i);
  assert.doesNotMatch(JSON.stringify(mayaPrivate),/MORGAN_PRIVATE|four to six beers/);
  changeChannel(room,'public');
  for(const roleId of ['morgan','maya']){
    const context=createActorContext(room,roleId),profile=profiles.getProfile(familyCase.id),role=profile.participants.find(p=>p.id===roleId);
    assert.match(context.system,new RegExp('STANDARDIZED PATIENT PORTRAYAL — '+role.name));
    for(const priority of role.priorities)assert.ok(context.system.includes(priority));
    assert.match(JSON.stringify(context),roleId==='morgan'?/MORGAN_PRIVATE_COMPLETED/:/MAYA_PRIVATE_COMPLETED/);
    assert.doesNotMatch(JSON.stringify(context),roleId==='morgan'?/MAYA_PRIVATE|MORGAN_PRIVATE_UNHEARD/:/MORGAN_PRIVATE/);
    assert.doesNotMatch(context.system,/four to six beers|Your speech was interrupted/);
    assert.ok(!Object.hasOwn(context.facts,'private'));
  }
});

test('family partial playback carries only completed public words into the other participant context',()=>{
  const room=createRoomState({sessionId:'encounter-prefix'});
  beginTurn(room,{turnId:1,groupId:'g1',text:'Morgan, what matters most?',targetRoleId:'morgan',channel:'public'});
  issueSegment(room,{turnId:1,groupId:'g1',segmentId:'first',roleId:'morgan',text:'I want the choice to remain mine.'});
  issueSegment(room,{turnId:1,groupId:'g1',segmentId:'tail',roleId:'morgan',text:'UNHEARD_PUBLIC_TAIL'});
  applyReceipt(room,{groupId:'g1',completedSegmentIds:['first'],status:'interrupted'});
  const context=createActorContext(room,'maya');
  assert.match(JSON.stringify(context.messages),/I want the choice to remain mine/);
  assert.doesNotMatch(JSON.stringify(context),/UNHEARD_PUBLIC_TAIL/);
  assert.doesNotMatch(context.system,/Your speech was interrupted/,'Morgan’s interruption cannot be described as Maya’s own speech');
});

test('family retry preserves the same public knowledge and excludes later or private events',()=>{
  const room=createRoomState({sessionId:'encounter-retry-parent'});
  changeChannel(room,'morgan-private');
  oneTurn(room,'morgan','PRIVATE_BEFORE_RETRY','PRIVATE_RESPONSE_BEFORE_RETRY');
  changeChannel(room,'public');
  const selected=oneTurn(room,'morgan','SELECTED_ORIGINAL_QUESTION','SELECTED_ORIGINAL_RESPONSE');
  oneTurn(room,'maya','LATER_QUESTION','LATER_RESPONSE');
  finishRoom(room);
  const original=JSON.stringify(roomView(room)),child=createRetry(room,{sessionId:'encounter-retry-child',turnId:selected});
  assert.match(JSON.stringify(createActorContext(child,'morgan').privateMemory),/PRIVATE_RESPONSE_BEFORE_RETRY/);
  assert.doesNotMatch(JSON.stringify(createActorContext(child,'maya')),/PRIVATE_BEFORE|PRIVATE_RESPONSE/);
  for(const roleId of ['morgan','maya'])assert.doesNotMatch(JSON.stringify(createActorContext(child,roleId)),/SELECTED_ORIGINAL|LATER_QUESTION|LATER_RESPONSE/);
  assert.equal(JSON.stringify(roomView(room)),original);
});

test('selected public reflection excludes unrelated private exchanges and interrupted continuations',()=>{
  const room=createRoomState({sessionId:'encounter-reflection'});
  changeChannel(room,'morgan-private');
  oneTurn(room,'morgan','PRIVATE_REFLECTION_QUESTION','PRIVATE_REFLECTION_RESPONSE');
  changeChannel(room,'public');
  const selected=oneTurn(room,'maya','What support could you offer?','A planned weekly call.');
  oneTurn(room,'morgan','Anything to add?','UNHEARD_REFLECTION_RESPONSE',{interrupted:true});
  const exchanges=encounterUI.exchangesFrom(roomView(room));
  const reflection=profiles.buildReflection(profiles.getProfile(familyCase.id),{exchanges,selectedId:String(selected)});
  assert.equal(reflection.quote,'What support could you offer?');
  assert.deepEqual(reflection.perspectives.map(p=>p.roleId),['maya']);
  assert.deepEqual(reflection.completedReplies.map(r=>r.text),['A planned weekly call.']);
  assert.doesNotMatch(JSON.stringify(reflection),/PRIVATE_REFLECTION|UNHEARD_REFLECTION/);
  const privateReflection=profiles.buildReflection(profiles.getProfile(familyCase.id),{exchanges,selectedId:'1'});
  assert.deepEqual(privateReflection.perspectives.map(p=>p.roleId),['morgan'],'a private Morgan exchange does not generate a Maya perspective');
});
