import test from 'node:test';
import assert from 'node:assert/strict';
import {familyCase,caseHash} from '../family-visit-case.mjs';
import {createRequire} from 'node:module';
import {
  createRoomState,roomView,beginTurn,issueSegment,applyReceipt,advanceGroup,
  cancelGroup,changeChannel,finishRoom,createRetry,createActorContext,containsPrivatePhrase
} from '../family-visit-state.mjs';

const require=createRequire(import.meta.url);
const canonicalMorgan=require('../sp-interview.local-cases.js').cases.find(item=>item.id==='sp_alcohol_ambivalence_001');

function room(){return createRoomState({sessionId:'s1'});}
function completeOne(value,{turnId=1,targetRoleId='morgan',text='What matters to you?',groupId='g1',segmentId='x1',reply='A complete sentence.'}={}){
  beginTurn(value,{turnId,text,targetRoleId,channel:value.channel,groupId});
  issueSegment(value,{groupId,turnId,roleId:targetRoleId,segmentId,text:reply});
  const result=applyReceipt(value,{groupId,completedSegmentIds:[segmentId],status:'played'});
  advanceGroup(value,{groupId});
  return result;
}

test('only the current actor supplies plain assistant examples; other speech remains labeled context in order',()=>{
  const value=room();
  completeOne(value,{text:'Morgan, what support would you welcome?',reply:'I would welcome a weekly call.'});
  completeOne(value,{turnId:2,targetRoleId:'maya',text:'Maya, what could you offer?',reply:' I could make a planned weekly call.',groupId:'g2',segmentId:'x2'});
  const snapshot=structuredClone(value.events);
  const morgan=createActorContext(value,'morgan'),maya=createActorContext(value,'maya');
  assert.deepEqual(morgan.messages,[
    {role:'user',content:'[Shared conversation] Student addressing Morgan: Morgan, what support would you welcome?'},
    {role:'assistant',content:'I would welcome a weekly call.'},
    {role:'user',content:'[Shared conversation] Student addressing Maya: Maya, what could you offer?'},
    {role:'user',content:'[Shared conversation] Maya:  I could make a planned weekly call.'},
  ]);
  assert.deepEqual(maya.messages,[
    {role:'user',content:'[Shared conversation] Student addressing Morgan: Morgan, what support would you welcome?'},
    {role:'user',content:'[Shared conversation] Morgan: I would welcome a weekly call.'},
    {role:'user',content:'[Shared conversation] Student addressing Maya: Maya, what could you offer?'},
    {role:'assistant',content:' I could make a planned weekly call.'},
  ]);
  assert.match(maya.system,/metadata labels.*never.*spoken/i);
  assert.match(maya.system,/assistant messages.*your own.*current channel/i);
  assert.deepEqual(value.events,snapshot,'projection never rewrites the room transcript');
});

for(const roleId of ['morgan','maya'])test(roleId+' current private speech is plain but rejoined and retry memory stays labeled context',()=>{
  const value=room(),other=roleId==='morgan'?'maya':'morgan',name=familyCase.participants[roleId].displayName;
  completeOne(value,{targetRoleId:roleId,reply:'OWN_PUBLIC_SENTINEL'});
  changeChannel(value,roleId+'-private');
  completeOne(value,{turnId:2,targetRoleId:roleId,text:'PRIVATE_LEARNER_SENTINEL',reply:'OWN_PRIVATE_SENTINEL',groupId:'g2',segmentId:'x2'});
  beginTurn(value,{turnId:3,targetRoleId:roleId,text:'What else would you like to say privately?',channel:value.channel,groupId:'g3'});
  issueSegment(value,{groupId:'g3',turnId:3,roleId,segmentId:'x3a',text:'HEARD_PRIVATE_SENTINEL'});
  issueSegment(value,{groupId:'g3',turnId:3,roleId,segmentId:'x3b',text:'UNHEARD_PRIVATE_SENTINEL'});
  applyReceipt(value,{groupId:'g3',completedSegmentIds:['x3a'],status:'interrupted'});
  const current=createActorContext(value,roleId);
  assert.deepEqual(current.messages.filter(message=>message.role==='assistant'),[
    {role:'assistant',content:'OWN_PRIVATE_SENTINEL'},
    {role:'assistant',content:'HEARD_PRIVATE_SENTINEL'},
  ]);
  assert.deepEqual(current.messages.find(message=>message.content.includes('OWN_PUBLIC_SENTINEL')),{role:'user',content:'[Shared conversation] '+name+': OWN_PUBLIC_SENTINEL'});
  assert.ok(Object.hasOwn(current.facts,'private'));
  changeChannel(value,'public');
  const joined=createActorContext(value,roleId);
  assert.deepEqual(joined.messages.filter(message=>message.role==='assistant'),[{role:'assistant',content:'OWN_PUBLIC_SENTINEL'}]);
  for(const marker of ['OWN_PRIVATE_SENTINEL','HEARD_PRIVATE_SENTINEL']){
    const message=joined.messages.find(message=>message.content.includes(marker));
    assert.equal(message.role,'user');assert.match(message.content,/^\[PRIVATE MEMORY:/);
  }
  assert.doesNotMatch(JSON.stringify(joined),/UNHEARD_PRIVATE_SENTINEL/);
  assert.deepEqual(joined.privateMemory,current.privateMemory,'message formatting cannot change memory visibility');
  assert.equal(Object.hasOwn(joined.facts,'private'),false);
  assert.doesNotMatch(JSON.stringify(createActorContext(value,other)),/PRIVATE_LEARNER_SENTINEL|OWN_PRIVATE_SENTINEL|HEARD_PRIVATE_SENTINEL|UNHEARD_PRIVATE_SENTINEL/);
  completeOne(value,{turnId:4,targetRoleId:roleId,reply:'LATER_PUBLIC_SENTINEL',groupId:'g4',segmentId:'x4'});
  finishRoom(value);const child=createRetry(value,{turnId:4,sessionId:'child-'+roleId});
  const retry=createActorContext(child,roleId);
  assert.deepEqual(retry.messages,joined.messages);
  assert.deepEqual(retry.privateMemory,joined.privateMemory);
  assert.doesNotMatch(JSON.stringify(createActorContext(child,other)),/PRIVATE_LEARNER_SENTINEL|OWN_PRIVATE_SENTINEL|HEARD_PRIVATE_SENTINEL|UNHEARD_PRIVATE_SENTINEL/);
});

test('case is a hash-bound local draft preserving Morgan baseline and separately authored Maya limits',()=>{
  assert.equal(familyCase.id,'family_morgan_maya_001');
  assert.match(caseHash,/^[a-f0-9]{64}$/);
  assert.equal(familyCase.review.status,'draft-pending-faculty-review');
  assert.equal(familyCase.review.reviewer,null);
  assert.equal(familyCase.participants.morgan.pronouns,'they/them');
  assert.equal(familyCase.participants.maya.relationship,'adult daughter');
  assert.match(familyCase.sharedFacts.living,/Morgan lives alone/i);
  assert.match(familyCase.participants.maya.informationLimits.observations,/not established/i);
  const publicText=JSON.stringify({shared:familyCase.sharedFacts,maya:familyCase.participants.maya.publicFacts});
  assert.doesNotMatch(publicText,/four to six|withdrawal|seizure|container size/i);
  assert.match(JSON.stringify(familyCase.privateTopics.morgan),/four to six beers most evenings/i);
  assert.equal(familyCase.consent.privateCheckIns.morgan,true);
  assert.equal(familyCase.consent.privateCheckIns.maya,true);
});

test('family projection stays aligned with the authored Morgan source case',()=>{
  const source=canonicalMorgan.localGrounding.ordinaryFacts,publicFacts=JSON.stringify(familyCase.participants.morgan.publicFacts),privateFacts=JSON.stringify(familyCase.participants.morgan.privateFacts);
  assert.match(source.workAndHome,/manages inventory at a hardware store and lives alone/i);
  assert.match(familyCase.sharedFacts.living,/Morgan lives alone/i);
  assert.match(publicFacts,/switch off after work/i);
  assert.match(source.benefits,/end of a stressful workday/i);
  assert.match(publicFacts,/foggy mornings/i);
  assert.match(source.costs,/foggy mornings/i);
  assert.match(publicFacts,/inventory job at a hardware store/i);
  assert.match(privateFacts,/four to six beers most evenings/i);
  assert.match(source.pattern,/four to six beers most evenings/i);
  assert.doesNotMatch(publicFacts,/four to six|two beers on work nights/i);
});

test('locks explicit targets and orders both without numeric relationship state',()=>{
  const value=room();
  const result=beginTurn(value,{turnId:1,text:'I would like to hear from both.',targetRoleId:'both',channel:'public',groupId:'g1'});
  assert.deepEqual(result.roles,['morgan','maya']);
  assert.equal(value.activeGroup.currentRoleId,'morgan');
  assert.throws(()=>issueSegment(value,{groupId:'g1',turnId:1,roleId:'maya',segmentId:'early',text:'Too soon.'}),e=>e.code==='wrong_role');
  assert.equal('rapport' in value,false);
  assert.equal(roomView(value).events.find(e=>e.kind==='learner').targetRoleId,'both');
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'morgan',segmentId:'m1',text:'Morgan speaks first.'});
  applyReceipt(value,{groupId:'g1',completedSegmentIds:['m1'],status:'played'});
  assert.deepEqual(advanceGroup(value,{groupId:'g1'}),{roleId:'maya'});
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'maya',segmentId:'y1',text:'Maya speaks second.'});
  applyReceipt(value,{groupId:'g1',completedSegmentIds:['m1','y1'],status:'played'});
  assert.deepEqual(advanceGroup(value,{groupId:'g1'}),{roleId:null});
  assert.equal(value.activeGroup,null);
});

test('only completed ordered sentence segments become heard context',()=>{
  const value=room();
  beginTurn(value,{turnId:1,text:'Morgan, what feels possible?',targetRoleId:'morgan',channel:'public',groupId:'g1'});
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'morgan',segmentId:'a',text:'The first sentence.'});
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'morgan',segmentId:'b',text:' The unheard sentence.'});
  assert.throws(()=>applyReceipt(value,{groupId:'g1',completedSegmentIds:['b'],status:'interrupted'}),e=>e.code==='invalid_receipt');
  assert.throws(()=>applyReceipt(value,{groupId:'g1',completedSegmentIds:['a'],status:'played'}),e=>e.code==='invalid_receipt');
  applyReceipt(value,{groupId:'g1',completedSegmentIds:['a'],status:'interrupted'});
  const context=createActorContext(value,{roleId:'maya',groupId:'g1'});
  assert.match(context.history.map(e=>e.text).join(' '),/first sentence/);
  assert.doesNotMatch(context.history.map(e=>e.text).join(' '),/unheard sentence/);
  assert.equal(value.events.find(e=>e.segmentId==='b').status,'interrupted');
});

test('cancellation cannot retract a previously completed prefix',()=>{
  const value=room();
  beginTurn(value,{turnId:1,text:'Tell me both perspectives.',targetRoleId:'both',channel:'public',groupId:'g1'});
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'morgan',segmentId:'a',text:'First.'});
  applyReceipt(value,{groupId:'g1',completedSegmentIds:['a'],status:'played'});
  advanceGroup(value,{groupId:'g1'});
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'maya',segmentId:'b',text:' Second.'});
  assert.throws(()=>cancelGroup(value,{groupId:'g1',completedSegmentIds:[]}),e=>e.code==='invalid_receipt');
  cancelGroup(value,{groupId:'g1',completedSegmentIds:['a']});
  assert.equal(value.events.find(e=>e.segmentId==='a').status,'completed');
  assert.equal(value.events.find(e=>e.segmentId==='b').status,'interrupted');
});

test('private channels partition facts, dialogue, and immutable consent transitions',()=>{
  const value=room();
  changeChannel(value,{channel:'morgan-private'});
  completeOne(value,{targetRoleId:'morgan',text:'Can we discuss your drinking pattern privately?'});
  const morgan=createActorContext(value,{roleId:'morgan',groupId:'none'});
  const maya=createActorContext(value,{roleId:'maya',groupId:'none'});
  assert.match(JSON.stringify(morgan.facts),/four to six beers most evenings/i);
  assert.match(morgan.history.map(e=>e.text).join(' '),/drinking pattern privately/i);
  assert.doesNotMatch(JSON.stringify(maya),/four to six|drinking pattern privately/i);
  assert.throws(()=>beginTurn(value,{turnId:2,text:'Maya?',targetRoleId:'maya',channel:'morgan-private',groupId:'g2'}),e=>e.code==='invalid_target');
  changeChannel(value,{channel:'public'});
  assert.equal(value.events.filter(e=>e.kind==='transition').length,2);
  for(const roleId of ['morgan','maya']){
    const context=createActorContext(value,roleId);
    if(roleId==='morgan')assert.match(JSON.stringify(context.messages),/PRIVATE MEMORY.*drinking pattern privately/i);
    else assert.doesNotMatch(JSON.stringify(context.messages),/drinking pattern privately|A complete sentence/i);
    assert.doesNotMatch(context.system,/drinking pattern privately|A complete sentence/i);
    assert.equal(Object.hasOwn(context.facts,'private'),false,'private inventory is not loaded publicly');
  }
});

test('own private memory survives rejoin and retry without entering the other actor projection',()=>{
  const value=room();
  changeChannel(value,'morgan-private');
  completeOne(value,{targetRoleId:'morgan',text:'PRIVATE_LEARNER_SENTINEL',groupId:'private-group',segmentId:'private-segment'});
  value.events.find(e=>e.segmentId==='private-segment').text='PRIVATE_PATIENT_SENTINEL';
  changeChannel(value,'public');
  completeOne(value,{turnId:2,targetRoleId:'morgan',text:'PUBLIC_TURN',groupId:'public-group',segmentId:'public-segment'});
  finishRoom(value);
  assert.match(JSON.stringify(createActorContext(value,'morgan').privateMemory),/PRIVATE_PATIENT_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(createActorContext(value,'maya')),/PRIVATE_(?:LEARNER|PATIENT)_SENTINEL/);
  const child=createRetry(value,{turnId:2,sessionId:'child-private-boundary'});
  assert.match(JSON.stringify(createActorContext(child,'morgan').privateMemory),/PRIVATE_PATIENT_SENTINEL/);
  assert.doesNotMatch(JSON.stringify(createActorContext(child,'maya')),/PRIVATE_(?:LEARNER|PATIENT)_SENTINEL/);
  assert.match(createActorContext(child,'morgan').system,/NOT permission to disclose/);
  assert.ok(!child.events.some(e=>e.channel==='public'&&e.text?.includes('PRIVATE_')));
});

test('private memory is audience-bound, completed only, and targeting labels are server-derived',()=>{
  const value=room();changeChannel(value,'maya-private');
  beginTurn(value,{turnId:1,text:'Would a limit sound uncaring?',targetRoleId:'maya',channel:value.channel,groupId:'g1'});
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'maya',segmentId:'a',text:'MAYA_HEARD_PRIVATE'});
  issueSegment(value,{groupId:'g1',turnId:1,roleId:'maya',segmentId:'b',text:'MAYA_UNHEARD_PRIVATE'});
  applyReceipt(value,{groupId:'g1',completedSegmentIds:['a'],status:'interrupted'});changeChannel(value,'public');
  completeOne(value,{turnId:2,targetRoleId:'morgan',text:'What would you add?',groupId:'g2',segmentId:'c'});
  const maya=createActorContext(value,'maya'),morgan=createActorContext(value,'morgan');
  assert.match(JSON.stringify(maya.messages),/MAYA_HEARD_PRIVATE/);
  assert.doesNotMatch(JSON.stringify(maya),/MAYA_UNHEARD_PRIVATE/);
  assert.doesNotMatch(JSON.stringify(morgan),/MAYA_HEARD_PRIVATE|MAYA_UNHEARD_PRIVATE|Would a limit sound uncaring/);
  assert.match(maya.messages.at(-2).content,/Student addressing Morgan: What would you add/);
  assert.match(maya.system,/not demands for you to answer on their behalf/);
  assert.match(maya.system,/no permission-to-share operation/);
});

test('secondary private phrase check catches literal variants without treating public facts as private',()=>{
  const value=room();changeChannel(value,'morgan-private');
  completeOne(value,{text:'What was your pattern?',groupId:'g1',segmentId:'a'});
  value.events.find(e=>e.segmentId==='a').text='Four to six beers most evenings. I value keeping Sunday breakfast with Maya.';
  changeChannel(value,'public');const context=createActorContext(value,'morgan');
  assert.equal(containsPrivatePhrase(context,'I said 4 to 6 beers most evenings.'),true);
  assert.equal(containsPrivatePhrase(context,'FOUR, to SIX beers most evenings.'),true);
  assert.equal(containsPrivatePhrase(context,'Keeping Sunday breakfast with Maya matters to me.'),false);
  assert.equal(containsPrivatePhrase(context,'We did speak privately. I would like to check what we share.'),false);
  assert.equal(containsPrivatePhrase(context,'Yes, that is right.'),false,'lexical checking cannot establish semantic non-disclosure');
});

test('cancel omits uncertain work and finish creates one exact-prefix one-turn child',()=>{
  const value=room();
  completeOne(value);
  beginTurn(value,{turnId:2,text:'What could Maya offer?',targetRoleId:'maya',channel:'public',groupId:'g2'});
  issueSegment(value,{groupId:'g2',turnId:2,roleId:'maya',segmentId:'y2',text:'A completed Maya answer.'});
  applyReceipt(value,{groupId:'g2',completedSegmentIds:['y2'],status:'played'});
  advanceGroup(value,{groupId:'g2'});
  beginTurn(value,{turnId:3,text:'Anything else?',targetRoleId:'maya',channel:'public',groupId:'g3'});
  issueSegment(value,{groupId:'g3',turnId:3,roleId:'maya',segmentId:'pending',text:'This never finished.'});
  cancelGroup(value,{groupId:'g3',completedSegmentIds:[]});
  finishRoom(value);
  assert.deepEqual(roomView(value).retryEligibleTurnIds,[1,2]);
  const original=structuredClone(roomView(value));
  const child=createRetry(value,{turnId:2,sessionId:'child'});
  assert.equal(child.sourceTurnId,2);
  assert.equal(child.maxTurns,1);
  assert.equal(child.retryConstraint.targetRoleId,'maya');
  assert.ok(!child.events.some(e=>e.turnId===2));
  assert.ok(child.events.some(e=>e.turnId===1));
  assert.throws(()=>createRetry(value,{turnId:2,sessionId:'other'}),e=>e.code==='retry_exists');
  assert.throws(()=>createRetry(value,{turnId:1,sessionId:'other-turn'}),e=>e.code==='retry_exists');
  assert.deepEqual(roomView(value),original,'retry must not mutate original room view');
  assert.throws(()=>changeChannel(child,{channel:'maya-private'}),e=>e.code==='retry_channel_locked');
  beginTurn(child,{turnId:1,text:'What could Maya offer instead?',targetRoleId:'maya',channel:'public',groupId:'cg'});
  cancelGroup(child,{groupId:'cg'});
  assert.throws(()=>beginTurn(child,{turnId:2,text:'Another',targetRoleId:'maya',channel:'public',groupId:'cg2'}),e=>e.code==='turn_limit');
  finishRoom(child);
  assert.throws(()=>createRetry(child,{turnId:1,sessionId:'grandchild'}),e=>e.code==='retry_child_forbidden');
});

test('room views omit private fact inventory and reject lifecycle misuse',()=>{
  const value=room(),view=roomView(value);
  assert.equal(view.caseHash,caseHash);
  assert.equal(view.maxTurns,10);
  assert.doesNotMatch(JSON.stringify(view),/four to six|withdrawal|privateTopics/i);
  assert.doesNotMatch(JSON.stringify(createActorContext(value,'maya')),/four to six|seizure|medications|laboratory/i);
  assert.doesNotMatch(JSON.stringify(createActorContext(value,'morgan')),/four to six|seizure|medications|laboratory/i);
  assert.throws(()=>beginTurn(value,{turnId:1,text:'Hi',targetRoleId:'unknown',channel:'public',groupId:'g'}),e=>e.code==='invalid_target');
  beginTurn(value,{turnId:1,text:'Hi',targetRoleId:'morgan',channel:'public',groupId:'g'});
  assert.throws(()=>changeChannel(value,{channel:'morgan-private'}),e=>e.code==='group_pending');
  cancelGroup(value,{groupId:'g'});
  finishRoom(value);
  assert.throws(()=>beginTurn(value,{turnId:2,text:'Hi again',targetRoleId:'morgan',channel:'public',groupId:'g2'}),e=>e.code==='room_finished');
});
