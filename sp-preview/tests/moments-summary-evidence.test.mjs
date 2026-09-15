import test from 'node:test';
import assert from 'node:assert/strict';
import {getMoment} from '../lib/moments/catalog.mjs';
import {buildEvidenceSources,validateDebrief} from '../lib/moments/evidence.mjs';
import {makeMomentHarness} from './fixtures/moments/runtime.mjs';

const scenarioId='moment_priya_formulation_001',definition=getMoment(scenarioId);
const patient='I want help. I am worried about thinking clearly at work.';
const summaries=[['concern_retained','Priya wants help and is worried about functioning at work.'],['concern_distorted','Priya rejects treatment and does not want help.']];
function evidence(summary,summaryUncertain=false){return buildEvidenceSources(definition,[{who:'pt',text:definition.opening,playbackStatus:'played'},{who:'me',text:'What should I understand?'},{who:'pt',text:patient,playbackStatus:'played'}],{teamFormulation:summary,summaryUncertain});}
function review(sources,observationId){return {schemaVersion:1,scenarioId,findings:[{criterionId:'P_CONCERN',status:'observed',observationId,evidence:['p1','team-summary'].map(id=>{const s=sources.find(s=>s.id===id);return {sourceId:id,start:0,end:s.text.length,quote:s.text};}),uncertaintyId:'treatment_history_unknown',nextAttemptId:'check_meaning'}]};}
for(const [observationId,summary] of summaries)test(`${observationId} accepts an explicitly submitted team formulation as later evidence`,()=>{
 const sources=evidence(summary),report=review(sources,observationId);
 const displayed=validateDebrief(report,sources,definition);
 assert.equal(displayed.findings[0].observationId,observationId);
 assert.equal(displayed.findings[0].evidence.at(-1).sourceId,'team-summary');
 assert.equal(displayed.findings[0].evidence.at(-1).quote,summary);
 assert.throws(()=>validateDebrief(report,evidence(summary,true),definition),'uncertain team text is not substantive evidence');
 const reversed=structuredClone(report);reversed.findings[0].evidence.reverse();
 assert.throws(()=>validateDebrief(reversed,sources,definition),'patient concern must precede the formulation');
 assert.throws(()=>validateDebrief(report,sources.filter(s=>s.id!=='p1'),definition),'the heard concern cannot be omitted');
});
test('valid feedback on the final team formulation reaches the review stream',async()=>{
 const h=makeMomentHarness();h.provider.replyStream=async()=>patient;
 h.provider.evaluateMoment=async({sources})=>review(sources,'concern_distorted');
 let state=await h.start(scenarioId);state=await h.turn(state,'What should I understand?');
 const result=await h.raw({action:'debrief',scenarioId,state,previousPlayback:'played',previousCompletedSegments:1,outputs:{teamFormulation:summaries[1][1],summaryUncertain:false},uncertainTurnIds:[],endReason:'learner_end'});
 assert.deepEqual(result.events.map(e=>e.type),['review-start','review','review-complete']);
 assert.equal(result.events[1].report.findings[0].observationId,'concern_distorted');
 assert.equal(h.reservations.reduce((sum,r)=>sum+r.units,0),7);
});
test('team formulation is not substituted for a patient-facing response in unrelated criteria',()=>{
 const sources=evidence(summaries[0][1]),report=review(sources,'concern_retained');
 report.findings[0].criterionId='P_INVITATION';report.findings[0].observationId='correction_invited';
 assert.throws(()=>validateDebrief(report,sources,definition));
});
