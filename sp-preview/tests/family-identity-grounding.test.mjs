import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createActorContext} from '../../_prototypes/sp-interview/family-visit-state.mjs';
import {familyContext,FAMILY_CASE_ID} from '../lib/family.mjs';
import {makeMomentHarness} from './fixtures/moments/runtime.mjs';

const identities={
  morgan:{name:'Morgan',pronouns:'they/them',relationship:'Maya’s parent'},
  maya:{name:'Maya',pronouns:'she/her',relationship:'adult daughter'}
};
function suppliedFacts(context){
  const prefix='Use only this role projection: ';
  const line=context.system.split('\n').find(value=>value.startsWith('CHANNEL:'));
  assert.ok(line?.includes(prefix),'the actual actor system carries its permitted fact projection');
  return JSON.parse(line.slice(line.indexOf(prefix)+prefix.length,-1));
}
function assertGrounding(context){
  assert.deepEqual(suppliedFacts(context).identities,identities,'both identities must reach the actor, not just UI role helpers');
  assert.match(context.system,/pronouns.*relationships.*authoritative case facts/i);
  assert.match(context.system,/learner dialogue or earlier generated replies/i);
  assert.match(context.system,/Maya.*my parent.*Morgan/);
  assert.match(context.system,/attribute.*concern.*person/i);
  assert.match(context.system,/do not generalize.*unnamed people/i);
  assert.match(context.system,/witnessed.*fall.*past family confrontation/i);
}

test('both family actors receive only public identity fields in public and own-private projections',()=>{
  for(const roleId of ['morgan','maya'])for(const channel of ['public',roleId+'-private']){
    const context=createActorContext({channel,events:[]},roleId);
    assert.deepEqual(context.facts.identities,identities);
    assertGrounding(context);
    for(const identity of Object.values(context.facts.identities))assert.deepEqual(Object.keys(identity).sort(),['name','pronouns','relationship']);
  }
});

test('incorrect family terms stay exact dialogue while trusted identity and reaction attribution stay grounded',()=>{
  const prior='My dad said he was fine. Everyone was scared.';
  const learner='Maya, your father must have scared everybody. How can we help him?';
  const context=familyContext([
    {who:'pt',text:prior,speakerId:'maya',playbackStatus:'played'},
    {who:'me',text:learner,targetRoleId:'maya'}
  ],'maya');
  assertGrounding(context);
  assert.deepEqual(context.messages,[{role:'assistant',content:prior},{role:'user',content:learner}], 'grounding does not rewrite or erase what was actually heard');
  assert.equal(context.system.includes(prior),false);
  assert.equal(context.system.includes(learner),false);
});

test('actual hosted first turn, role change and alternative deliver the same identity and attribution contract',async()=>{
  const h=makeMomentHarness();
  async function send(body){
    const result=await h.raw({...body,caseId:FAMILY_CASE_ID},{full:true});
    assert.equal(result.status,200,JSON.stringify(result));
    assert.equal(result.events.at(-1).type,'complete',JSON.stringify(result.events));
    return result;
  }
  let result=await send({action:'start',requestId:randomUUID()});
  assert.equal(h.contexts.length,0,'the clinician-first opening still does no actor work');
  result=await send({action:'turn',state:result.state,targetRoleId:'maya',text:'Maya, what would you like us to understand?',previousPlayback:'played',previousCompletedSegments:0});
  result=await send({action:'turn',state:result.state,targetRoleId:'morgan',text:'Morgan, how do you see the fall?',previousPlayback:'played',previousCompletedSegments:1});
  await send({action:'retry',state:result.state,turnId:1,text:'Maya, what matters most to you?'});
  assert.equal(h.contexts.length,3);
  for(const [index,name] of ['Maya','Morgan','Maya'].entries()){
    assertGrounding(h.contexts[index]);
    assert.ok(h.contexts[index].system.startsWith('You are '+name+','));
  }
  assert.deepEqual(h.contexts.at(-1).messages,[{role:'user',content:'Maya, what matters most to you?'}]);
  assert.deepEqual(h.reservations.map(item=>item.units),[1,3,3,3]);
});
