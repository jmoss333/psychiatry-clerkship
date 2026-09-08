import test from 'node:test';
import assert from 'node:assert/strict';
import {getCase, caseIds} from '../lib/case.mjs';
import localCases from '../../_prototypes/sp-interview/sp-interview.local-cases.js';
import {createContext} from '../../_prototypes/sp-interview/dana-live-context.mjs';
import {speechProfile} from '../../_prototypes/sp-interview/conversation-speech-profiles.mjs';
import {hostedSpeechProfile,refineActorContext} from '../lib/portrayal.mjs';
import {createOpenAIProvider} from '../lib/openai-provider.mjs';

const MORGAN='sp_alcohol_ambivalence_001';
const FAMILY='family_morgan_maya_001';

test('hosted registration exposes all five encounters under separate bindings',()=>{
  assert.deepEqual([...caseIds].sort(),[
    FAMILY,MORGAN,'sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001',
  ]);
  assert.equal(new Set(caseIds.map(id=>getCase(id).binding)).size,5);
  for(const id of caseIds)assert.equal(getCase(id).caseDef.id,id);
  assert.equal(getCase('unknown'),undefined);
});

test('hosted Morgan uses the authored MI inventory without introducing diagnosis or disclosure gates',()=>{
  const registered=getCase(MORGAN);
  assert.ok(registered,'Morgan is available to start in the hosted room');
  assert.equal(registered.caseDef,localCases.cases[0],'hosting must not fork the authored case');
  assert.equal(registered.caseDef.persona.pronouns,'they/them');
  assert.equal(registered.caseDef.facultyReview.status,'draft-pending-attestation');
  assert.deepEqual(registered.caseDef.gated,[]);
  const questions=['What does drinking do for you, and what concerns you about it?'];
  const result=createContext(registered.caseDef,questions,[
    {who:'pt',text:registered.caseDef.persona.opening,playbackStatus:'played'},
    {who:'me',text:questions[0]},
  ]);
  assert.match(result.system,/Sunday breakfast with Maya/);
  assert.match(result.system,/quiet persistent thoughts/);
  assert.match(result.system,/withdrawal risk requires clinical evaluation/);
  assert.match(result.system,/no readiness stage or numeric rating/);
  assert.doesNotMatch(result.system,/CURRENT STATE|rapport\s*=/);
  assert.equal(result.messages.at(-1).content,questions[0]);
});

test('family registration uses the public adapter and binds its full authored case',async()=>{
  const registered=getCase(FAMILY);
  assert.ok(registered,'the two-person encounter is registered');
  const {familyCaseDef,familyBinding,familyContext}=await import('../lib/family.mjs');
  assert.equal(registered.caseDef,familyCaseDef);
  assert.equal(registered.binding,familyBinding);
  const opening=[{who:'pt',speakerId:'morgan',text:registered.caseDef.persona.opening,playbackStatus:'pending'}];
  for(const role of ['morgan','maya']){
    const context=familyContext(opening,role);
    assert.ok(context.system);
    assert.deepEqual(context.messages,[],'an unplayed opening is not shared dialogue');
    assert.doesNotMatch(context.system,/four to six beers|for three weeks|fear that a limit will sound uncaring/i);
  }
});

test('hosted speech refinements preserve archived Dana and original local profiles',()=>{
  const dana=speechProfile('sp_depression_gated_si_001');
  assert.equal(hostedSpeechProfile('sp_depression_gated_si_001'),dana);
  for(const id of ['sp_mania_redirect_001','sp_psychosis_paranoid_001',MORGAN,'family_maya_001']){
    const original=speechProfile(id),before=JSON.stringify(original);
    const hosted=hostedSpeechProfile(id);
    assert.equal(hosted.voice,original.voice);
    assert.equal(JSON.stringify(original),before,'audition overlays must not rewrite recorded or local instructions');
    assert.notEqual(hosted.instructions,original.instructions);
    assert.match(hosted.instructions,/Speak only the supplied dialogue, exactly/);
    assert.match(hosted.instructions,/normal playback speed/);
  }
  assert.throws(()=>hostedSpeechProfile('unknown'));
});

test('Marcus actor refinement keeps facts, state, and heard history while guiding redirection',()=>{
  const caseDef=getCase('sp_mania_redirect_001').caseDef;
  const question='Marcus, let us return to your sleep. How much have you slept?';
  const source=createContext(caseDef,[question],[
    {who:'pt',text:caseDef.persona.opening,playbackStatus:'played'},
    {who:'me',text:question},
  ]),before=structuredClone(source);
  const refined=refineActorContext(source,caseDef.id);
  assert.deepEqual(source,before,'the authoritative context must remain unchanged');
  assert.equal(refined.messages,source.messages);
  assert.equal(refined.state,source.state);
  assert.ok(refined.system.startsWith(source.system),'all authoritative fact and gate instructions remain in place');
  assert.match(refined.system,/answer the specific question first, and hold that topic/);
  assert.match(refined.system,/brief connected shift between ideas already established/);
  assert.match(refined.system,/900-character maximum/);
  assert.match(refined.system,/verbatim required disclosures/);
  assert.match(refined.system,/Never infer hostility or poor performance/);
  for(const id of [MORGAN,FAMILY,'sp_depression_gated_si_001','sp_psychosis_paranoid_001']){
    assert.equal(refineActorContext(source,id),source,'another case must not receive Marcus style');
  }
});

test('buffered and streamed speech send the hosted portrayal with exact words and native speed',async()=>{
  const requests=[];
  const provider=createOpenAIProvider({env:{OPENAI_API_KEY:'test-only-key'},fetchImpl:async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    const bytes=new Uint8Array(160);bytes.set([73,68,51]);
    return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});
  }});
  const fixtures=[
    {caseId:'sp_mania_redirect_001',voice:'cedar',style:/urgent, continuous forward momentum/,text:'Yes, sleep. Two or three hours, and I am not tired.'},
    {caseId:'sp_psychosis_paranoid_001',voice:'cedar',style:/uneven, cautious phrasing/,text:'I do not know what is happening.'},
    {caseId:MORGAN,voice:'marin',style:/mixed feelings be audible/,text:'I am not promising to stop forever.'},
    {caseId:'family_maya_001',voice:'cedar',style:/steady and caring at the same time/,text:'I care about you, and I cannot check every night.'},
  ];
  for(const fixture of fixtures){
    for(const streaming of [false,true]){
      const input={caseId:fixture.caseId,text:fixture.text};
      if(streaming)await provider.speakStream({...input,onChunk(){}});else await provider.speak(input);
      const request=requests.at(-1);
      assert.equal(request.voice,fixture.voice);
      assert.equal(request.input,fixture.text,'style must never rewrite the spoken content');
      assert.equal(request.speed,1);
      assert.match(request.instructions,fixture.style);
      assert.match(request.instructions,/Preserve every negation, uncertainty, and required disclosure/);
    }
  }
});
