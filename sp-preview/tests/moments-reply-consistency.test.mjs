import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMomentHarness} from './fixtures/moments/runtime.mjs';
import {getMoment} from '../lib/moments/catalog.mjs';
import {createMomentCodec} from '../lib/moments/state.mjs';

const scenarioId='moment_elena_rupture_001';
const firstSentence='I am worried about rent.';
const fullReply='I am worried about rent. That is what matters.';
const readState=(h,token)=>createMomentCodec({definition:getMoment(scenarioId),env:h.env,origin:h.env.URL,now:()=>Date.UTC(2026,8,9,12)}).open(token);
const reviewBody=(state,completed)=>({action:'debrief',scenarioId,state,previousPlayback:completed?'played':'interrupted',previousCompletedSegments:completed,outputs:{teamFormulation:'',summaryUncertain:false},uncertainTurnIds:[],endReason:'learner_end'});
function installActor(h,separator,split){
 const spoken=[],contexts=[];
 const speak=h.provider.speak;
 h.provider.speak=async input=>{spoken.push(input.text);return speak(input);};
 h.provider.replyStream=async context=>{
  contexts.push(context);
  const lead=`I am${separator}worried about rent.`;
  if(split)context.onLead(lead);
  return `${lead}${separator}That is${separator}what matters.`;
 };
 return {spoken,contexts};
}
for(const [label,separator] of [['space',' '],['newline','\n'],['tab','\t'],['CRLF','\r\n']])for(const split of [false,true]){
 test(`${label} in ${split?'prefetched':'single'} reply stays usable through turn, review, and alternative`,async()=>{
  const h=makeMomentHarness(),{spoken,contexts}=installActor(h,separator,split),completed=split?2:1;
  const opening=await h.start(scenarioId);
  const first=await h.raw({action:'turn',scenarioId,state:opening,text:'What is hardest?',previousPlayback:'played',previousCompletedSegments:1});
  assert.equal(first.status,200);
  const published=first.events.find(e=>e.type==='reply');
  assert.equal(published.reply,fullReply);
  assert.deepEqual(published.segments.map(s=>s.text),split?[firstSentence,' That is what matters.']:[fullReply]);
  assert.equal(readState(h,first.state).history.at(-1).text,fullReply);
  assert.deepEqual(spoken.slice(1),split?[firstSentence,'That is what matters.']:[fullReply]);
  const second=await h.turn(first.state,'I hear you.',{previousCompletedSegments:completed});
  let reviewSources;
  h.provider.evaluateMoment=async({sources})=>{
   reviewSources=sources;
   return {schemaVersion:1,scenarioId,findings:[{criterionId:'E_MEANING',status:'observed',observationId:'rent_meaning_explored',evidence:[{sourceId:'l1',start:0,end:16,quote:'What is hardest?'},{sourceId:'p1',start:19,end:23,quote:'rent'}],uncertaintyId:'insufficient_evidence',nextAttemptId:'check_meaning'}]};
  };
  const reviewed=await h.raw(reviewBody(second,completed));
  assert.deepEqual(reviewed.events.map(e=>e.type),['review-start','review','review-complete']);
  assert.equal(reviewSources.find(s=>s.id==='p1').text,fullReply);
  assert.equal(reviewSources.find(s=>s.id==='p2').text,fullReply);
  assert.equal(reviewed.events[1].report.findings[0].evidence[1].quote,'rent');
  assert.equal(readState(h,reviewed.state).moment.phase,'closed');
  const alternative=await h.retry(reviewed.state,2,'Let me understand the rent concern.');
  assert.equal(readState(h,alternative).moment.phase,'alternative_done');
  assert.equal(contexts.at(-1).messages.filter(m=>m.role==='assistant').at(-1).content,fullReply);
 });
}
for(const heard of [0,1])test(`normalized segmented replies preserve ${heard} heard segments in evidence and alternative context`,async()=>{
 const h=makeMomentHarness(),{contexts}=installActor(h,'\n',true);
 let state=await h.start(scenarioId);
 state=await h.turn(state,'What is hardest?');
 state=await h.turn(state,'Please continue.',{previousPlayback:'interrupted',previousCompletedSegments:heard});
 let sources;
 h.provider.evaluateMoment=async context=>{sources=context.sources;throw Error('No fixture assessment');};
 const reviewed=await h.raw(reviewBody(state,0));
 assert.equal(reviewed.status,200);
 assert.equal(sources.some(s=>s.id==='p2'),false);
 assert.equal(sources.find(s=>s.id==='p1')?.text,heard?firstSentence:undefined);
 await h.retry(reviewed.state,2,'I would like to understand.');
 const previous=contexts.at(-1).messages.filter(m=>m.role==='assistant').slice(1);
 assert.deepEqual(previous.map(m=>m.content),heard?[firstSentence]:[]);
});
test('whitespace normalization does not conceal a changed speculative prefix or forbidden formatting',async()=>{
 for(const badReply of ['I am\nworried about work. That is what matters.','I am\nworried about rent.\n- That is what matters.']){
  const h=makeMomentHarness();
  h.provider.replyStream=async({onLead})=>{onLead('I am\nworried about rent.');return badReply;};
  const state=await h.start(scenarioId);
  const result=await h.raw({action:'turn',scenarioId,state,text:'What is hardest?',previousPlayback:'played',previousCompletedSegments:1});
  assert.deepEqual(result.events.map(e=>e.type),['error']);
  assert.equal(result.events.some(e=>e.type==='audio'||e.type==='reply'),false);
 }
});
