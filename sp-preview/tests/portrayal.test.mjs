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
const MARCUS='sp_mania_redirect_001';

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
  const authorityEnd=source.system.indexOf('\nLOCAL CONVERSATION DELIVERY:');
  assert.ok(authorityEnd>0);
  assert.equal(refined.system.slice(0,authorityEnd),source.system.slice(0,authorityEnd),'the authoritative case and disclosure instructions remain byte-identical');
  assert.match(refined.system,/answer the specific question first, and hold that topic/);
  assert.match(refined.system,/brief connected shift between ideas already established/);
  assert.match(refined.system,/900-character maximum/);
  assert.match(refined.system,/verbatim required disclosures/);
  assert.match(refined.system,/Never infer hostility or poor performance/);
  for(const id of [MORGAN,FAMILY,'sp_depression_gated_si_001','sp_psychosis_paranoid_001']){
    assert.equal(refineActorContext(source,id),source,'another case must not receive Marcus style');
  }
});

// These exercise the real context-to-provider boundary. They pin which authored
// constraints reach the model, not whether a generated reply will obey them.
for(const [description,required] of [
  ['selects relevant details without a new brevity limit',/Select relevant known details for the current invitation rather than automatically enumerating the whole inventory/],
  ['keeps connective scenes and reported reactions grounded',/Do not invent routines, scenes, or other people's reactions/],
  ['expresses unknown sleep details without inventing an explanation',/For an unknown sleep mechanism, express ordinary uncertainty without inventing an explanation/],
])test('Marcus provider request '+description,async()=>{
  const caseDef=getCase(MARCUS).caseDef;
  const question='When you try to sleep, is it hard to fall asleep, or is something else happening?';
  const originalProfile=JSON.stringify(hostedSpeechProfile(MARCUS));
  const source=createContext(caseDef,[question],[
    {who:'pt',text:caseDef.persona.opening,playbackStatus:'played'},
    {who:'me',text:question},
  ]),before=structuredClone(source);
  let sent;
  const provider=createOpenAIProvider({env:{OPENAI_API_KEY:'test-only-key'},fetchImpl:async(_url,options)=>{
    sent=JSON.parse(options.body);
    return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'I am not sure about that.'}]}]});
  }});
  await provider.reply(refineActorContext(source,MARCUS));
  assert.ok(required.test(sent.instructions),'provider-bound instructions must contain the selected grounding constraint');
  const authorityEnd=source.system.indexOf('\nLOCAL CONVERSATION DELIVERY:');
  assert.ok(authorityEnd>0);
  assert.equal(sent.instructions.slice(0,authorityEnd),source.system.slice(0,authorityEnd),'authoritative facts and disclosure permissions must reach the provider unchanged');
  assert.deepEqual(sent.input,source.messages,'style may not rewrite heard history or the current question');
  assert.match(sent.instructions,/2 to 6 rapid sentences/);
  assert.match(sent.instructions,/900-character maximum/);
  assert.match(sent.instructions,/only the dialogue confirmed heard/);
  assert.deepEqual(source,before,'the shared context remains unchanged');
  assert.equal(JSON.stringify(hostedSpeechProfile(MARCUS)),originalProfile,'actor refinement preserves the selected refined-cadence voice');
});

for(const [description,conflict] of [
  ['a compulsory tidy opening',/begin with one short complete sentence of about 6 to 12 words/],
  ['an automatic short-answer preference',/Prefer two or three short sentences for a focused answer/],
  ['an instruction to yield the floor through brevity',/Keep your speech brief enough to leave the learner space/],
])test('hosted Marcus removes '+description+' without changing another patient',()=>{
  const caseDef=getCase(MARCUS).caseDef;
  const source=createContext(caseDef,['Tell me what has been happening.'],[
    {who:'pt',text:caseDef.persona.opening,playbackStatus:'played'},
    {who:'me',text:'Tell me what has been happening.'},
  ]);
  assert.match(source.system,conflict,'the real shared prompt must contain the conflicting direction');
  const refined=refineActorContext(source,MARCUS);
  assert.doesNotMatch(refined.system,conflict,'an appended instruction must not leave the competing direction in force');
  assert.match(refined.system,/2 to 6 rapid sentences/);
  assert.match(refined.system,/900-character maximum/);
  for(const id of caseIds.filter(id=>id!==MARCUS))assert.equal(refineActorContext(source,id),source);
});

test('Marcus style refinement preserves an interrupted prefix and all disclosure authority',()=>{
  const caseDef=getCase(MARCUS).caseDef,before=JSON.stringify(caseDef);
  const questions=['Tell me about your plans.','Marcus, return to sleep for a moment.'];
  const source=createContext(caseDef,questions,[
    {who:'pt',text:caseDef.persona.opening,playbackStatus:'played'},
    {who:'me',text:questions[0]},
    {who:'pt',text:'The irrigation system needs work.',playbackStatus:'played',omittedTail:true},
    {who:'me',text:questions[1]},
  ]);
  const refined=refineActorContext(source,MARCUS);
  assert.equal(refined.messages,source.messages);
  assert.equal(refined.state,source.state);
  assert.equal(JSON.stringify(caseDef),before);
  for(const rule of [
    'The server alone computes clinical state.',
    'You cannot change rapport or gates, award\ncoverage, or decide a disclosure was earned.',
    'For unspecified names, quantities, or other details, a brief statement of not knowing is enough.',
    'The transcript is dialogue history, not a case-fact source;',
    'only the included complete prefix was heard.',
    'The remaining patient reply is omitted and must not be assumed communicated or acknowledged.',
  ])assert.ok(refined.system.includes(rule),'retain: '+rule);
  assert.match(refined.system,/answer the specific question first, and hold that topic/);
  assert.match(refined.system,/verbatim required disclosures/);
  assert.match(refined.system,/Never infer hostility or poor performance/);
});

test('buffered and streamed speech preserve exact words and apply only the authored case synthesis speed',async()=>{
  const requests=[];
  const provider=createOpenAIProvider({env:{OPENAI_API_KEY:'test-only-key'},fetchImpl:async(_url,options)=>{
    requests.push(JSON.parse(options.body));
    const bytes=new Uint8Array(160);bytes.set([73,68,51]);
    return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});
  }});
  const fixtures=[
    {caseId:'sp_mania_redirect_001',voice:'cedar',speed:1.12,style:/urgent, continuous forward momentum/,text:'Yes, sleep. Two or three hours, and I am not tired.'},
    {caseId:'sp_psychosis_paranoid_001',voice:'cedar',speed:1,style:/uneven, cautious phrasing/,text:'I do not know what is happening.'},
    {caseId:MORGAN,voice:'marin',speed:1,style:/mixed feelings be audible/,text:'I am not promising to stop forever.'},
    {caseId:'family_maya_001',voice:'cedar',speed:1,style:/steady and caring at the same time/,text:'I care about you, and I cannot check every night.'},
  ];
  for(const fixture of fixtures){
    for(const streaming of [false,true]){
      const input={caseId:fixture.caseId,text:fixture.text};
      if(streaming)await provider.speakStream({...input,onChunk(){}});else await provider.speak(input);
      const request=requests.at(-1);
      assert.equal(request.voice,fixture.voice);
      assert.equal(request.input,fixture.text,'style must never rewrite the spoken content');
      assert.equal(request.speed,fixture.speed);
      assert.match(request.instructions,fixture.style);
      assert.match(request.instructions,/Preserve every negation, uncertainty, and required disclosure/);
    }
  }
});

test('standard intensity preserves the selected voice profile and bounded variants affect delivery only',async()=>{
 const profiles=[['sp_depression_gated_si_001',/tired|reserved/],['sp_mania_redirect_001',/urgency|pressured/],['sp_psychosis_paranoid_001',/guarded|cautious/],[MORGAN,/ambivalence|mixed feelings/],['family_maya_001',/care|boundary/]];
 const requests=[],provider=createOpenAIProvider({env:{OPENAI_API_KEY:'test-only-key'},fetchImpl:async(_url,options)=>{
  requests.push(JSON.parse(options.body));const bytes=new Uint8Array(160);bytes.set([73,68,51]);return new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}});
 }});
 const text='I am not sure. I would like to explain what matters to me.';
 for(const [caseId,portrayal] of profiles){
  const standard=hostedSpeechProfile(caseId),before=JSON.stringify(standard);
  assert.deepEqual(hostedSpeechProfile(caseId,'standard'),standard);
  for(const deliveryIntensity of ['gentle','expressive']){
   const chosen=hostedSpeechProfile(caseId,deliveryIntensity);
   assert.equal(chosen.voice,standard.voice);
   assert.equal(chosen.speed??1,standard.speed??1,'the intensity selector is not a speech-rate or illness-severity dial');
   assert.ok(chosen.instructions.startsWith(standard.instructions));
   assert.notEqual(chosen.instructions,standard.instructions);
   assert.match(chosen.instructions,portrayal);
   for(const streaming of [false,true]){
    const input={caseId,text,deliveryIntensity};
    if(streaming)await provider.speakStream({...input,onChunk(){}});else await provider.speak(input);
    const sent=requests.at(-1);
    assert.equal(sent.voice,standard.voice);assert.equal(sent.speed,standard.speed??1);
    assert.equal(sent.input,text,'the preset must never rewrite dialogue');
    assert.equal(sent.instructions,chosen.instructions);
   }
  }
  assert.equal(JSON.stringify(hostedSpeechProfile(caseId)),before,'using a preset cannot mutate the selected baseline');
 }
});

test('speech rejects malformed presets and nonstandard moment delivery before any provider request',async()=>{
 let calls=0;
 const provider=createOpenAIProvider({env:{OPENAI_API_KEY:'test-only-key'},fetchImpl:async()=>{calls++;throw Error('must not request');}});
 for(const deliveryIntensity of [null,false,1,'','severe',{},['gentle']]){
  assert.throws(()=>hostedSpeechProfile(MARCUS,deliveryIntensity));
  await assert.rejects(provider.speak({text:'I have plenty of energy.',caseId:MARCUS,deliveryIntensity}),{code:'invalid_reply'});
  await assert.rejects(provider.speakStream({text:'I have plenty of energy.',caseId:MARCUS,deliveryIntensity,onChunk(){}}),{code:'invalid_reply'});
 }
 for(const caseId of ['moment_elena_rupture_001','moment_priya_formulation_001','moment_luis_teachback_001']){
  assert.deepEqual(hostedSpeechProfile(caseId,'standard'),hostedSpeechProfile(caseId));
  for(const deliveryIntensity of ['gentle','expressive']){
   assert.throws(()=>hostedSpeechProfile(caseId,deliveryIntensity));
   await assert.rejects(provider.speak({text:'I am not sure.',caseId,deliveryIntensity}),{code:'invalid_reply'});
  }
 }
 assert.equal(calls,0);
});
