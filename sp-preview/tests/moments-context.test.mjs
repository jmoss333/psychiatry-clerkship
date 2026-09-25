import test from 'node:test';
import assert from 'node:assert/strict';
import {getMoment,momentIds} from '../lib/moments/catalog.mjs';
import {createMomentContext,createReviewContext} from '../lib/moments/context.mjs';
import {hostedSpeechProfile} from '../lib/portrayal.mjs';
for(const id of ['moment_elena_rupture_001','moment_priya_formulation_001','moment_luis_teachback_001'])test(`actor and evaluator contexts separate private inputs: ${id}`,()=>{
 const d=getMoment(id),copy=structuredClone(d);copy.templates.observations.canary='RUBRIC_CANARY';copy.actorDirections.push('ACTOR_CANARY');
 const history=[{who:'pt',text:'UNHEARD_CANARY',playbackStatus:'interrupted'},{who:'me',text:'What matters?'},{who:'pt',text:'Heard prefix.',playbackStatus:'played',omittedTail:true}];
 const actor=createMomentContext(copy,history);assert.ok(!JSON.stringify(actor).includes('RUBRIC_CANARY'));assert.ok(!JSON.stringify(actor).includes('UNHEARD_CANARY'));assert.equal(actor.messages.length,2);
 const review=createReviewContext(d,[],{endReason:'technical_interruption'});assert.ok(!review.system.includes('ACTOR_CANARY'));assert.match(review.system,/simulation_drift/);assert.match(review.system,/not patient evidence/);
 const profile=hostedSpeechProfile(id);assert.equal(profile.speed,1);assert.equal(profile.voice,id.includes('luis')?'cedar':'marin');
});
