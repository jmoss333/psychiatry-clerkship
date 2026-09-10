import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {getMoment,momentIds,publicProjection} from '../lib/moments/catalog.mjs';
import {renderContent,checkGenerated} from '../bin/generate-moment-content.mjs';
const projectionKeys=['id','revision','title','displayName','skill','task','setup','setupAttribution','durationLabel','maxTurns','reviewStatus','reviewLabel','summaryPrompt','reflectionPrompts','transferTargets','voiceLabel'].sort();
const shared=['not_assessable','transcription_uncertain','simulation_drift','specific_opportunity_unanswered'];
function assertFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))assertFrozen(child);}}
test('three complete reviewed definitions are deeply frozen and exclude unknown moments',()=>{
 assert.equal(momentIds.length,3); assert.equal(getMoment('unknown'),undefined); assert.equal(getMoment('__proto__'),undefined); assert.equal(getMoment('toString'),undefined);
 assertFrozen(momentIds);
 for(const id of momentIds){const d=getMoment(id);assert.equal(d.schemaVersion,1);assert.equal(d.revision,1);assert.equal(d.maxTurns,4);assert.equal(d.reviewStatus,'reviewed');assert.equal(d.reviewer,'Joshua Moss, MD');assert.equal(d.reviewedAt,'2026-09-09');assertFrozen(d);assert.ok(d.facts.length&&d.criteria.length&&d.actorDirections.length);assert.equal(d.speechProfile.speed,1);assert.ok(['marin','cedar'].includes(d.speechProfile.voice));
  const factIds=d.facts.map(f=>f.id);assert.equal(new Set(factIds).size,factIds.length);
  for(const criterion of d.criteria){for(const observation of [...criterion.observationIds,...shared])assert.ok(d.templates.observations[observation]);}
  for(const key of d.allowedUncertaintyIds)assert.ok(d.templates.uncertainties[key]);for(const key of d.allowedNextAttemptIds)assert.ok(d.templates.nextAttempts[key]);
 }
 assert.equal(getMoment(momentIds[0]).stage,'A');assert.equal(getMoment(momentIds[1]).stage,'A');assert.equal(getMoment(momentIds[2]).stage,'B');
});
test('literal public projection has exact keys and leaks no private canary at any level',()=>{
 for(const id of momentIds){const d=getMoment(id);const canary='PRIVATE_CANARY_DO_NOT_PUBLISH';const projected=publicProjection({...d,privateCanary:canary,facts:[{id:canary,text:canary}],criteria:[canary],actorDirections:[canary],templates:{observations:{secret:canary}},learner:{...d.learner,privateCanary:canary}});
 assert.deepEqual(Object.keys(projected).sort(),projectionKeys);assert.ok(!JSON.stringify(projected).includes(canary));assert.ok(projected.transferTargets.every(t=>momentIds.includes(t)&&t!==id));
 assert.equal(projected.reviewLabel,undefined);assert.ok(projected.reflectionPrompts.length);assert.equal(typeof projected.setupAttribution,'string');assert.ok(!/[\u0000-\u001f\u007f]/.test(projected.setup));assert.deepEqual(projected.transferTargets,[momentIds[(momentIds.indexOf(id)+1)%3],momentIds[(momentIds.indexOf(id)+2)%3]]);
 }
 const elena=publicProjection(getMoment(momentIds[0]));assert.match(elena.setup,/Previous student/);assert.match(elena.setup,/At least now/);assert.ok(!elena.setup.includes('pay rent'));
 const priya=getMoment(momentIds[1]);assert.match(priya.facts.map(f=>f.text).join(' '),/not established.*previously took a medication/);assert.match(priya.learner.summaryPrompt,/Priya won't hear/);
 assert.equal(getMoment(momentIds[0]).learner.summaryPrompt,'');assert.equal(getMoment(momentIds[2]).learner.summaryPrompt,'');
});
test('public module bytes deterministic and checked by generator',async()=>{
 assert.equal(renderContent(),renderContent());const result=spawnSync(process.execPath,[new URL('../bin/generate-moment-content.mjs',import.meta.url).pathname,'--check'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);
 const text=await readFile(new URL('../public/moment-content.js',import.meta.url),'utf8');assert.equal(text,renderContent());
 const context=vm.createContext({});vm.runInContext(text,context);assert.deepEqual([...context.MomentContent.ids()], [...momentIds].sort());assert.equal(context.MomentContent.getProfile('unknown'),undefined);assert.equal(context.MomentContent.getProfile('__proto__'),undefined);assert.equal(context.MomentContent.getProfile('toString'),undefined);assert.equal(context.MomentContent.getProfile([momentIds[0]]),undefined);
 for(const id of momentIds){assert.equal(JSON.stringify(context.MomentContent.getProfile(id)),JSON.stringify(publicProjection(getMoment(id))));assertFrozen(context.MomentContent.getProfile(id));}
});
test('freshness check detects deliberately stale fixture, exits 1, and passes restored bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'moment-content-'));const path=join(dir,'moment-content.js');
 try{await writeFile(path,renderContent());assert.equal(await checkGenerated(path),true);await writeFile(path,renderContent()+'// STALE\n');assert.equal(await checkGenerated(path),false);
 const url=new URL('../bin/generate-moment-content.mjs',import.meta.url).href;const result=spawnSync(process.execPath,['--input-type=module','-e',`import {checkGenerated} from ${JSON.stringify(url)};process.exit(await checkGenerated(${JSON.stringify(path)})?0:1)`]);assert.equal(result.status,1);
 await writeFile(path,renderContent());assert.equal(await checkGenerated(path),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('39 authored challenges have real role-bound transcript evidence and explicit expected outcomes',async()=>{
 const packet=JSON.parse(await readFile(new URL('./fixtures/moments/challenges.json',import.meta.url),'utf8'));assert.equal(packet.schemaVersion,1);assert.equal(packet.challenges.length,39);assert.equal(new Set(packet.challenges.map(c=>c.id)).size,39);
 assert.deepEqual(momentIds.map(id=>packet.challenges.filter(c=>c.scenarioId===id).length),[11,15,13]);
 const inspect=(c)=>{const d=getMoment(c.scenarioId);assert.ok(d);assert.ok(c.rationale.length>30);assert.ok(c.transcript.length);assert.ok(c.expected.length);assert.ok(c.forbidden.length);assert.ok(Array.isArray(c.uncertainTurnIds));assert.equal(typeof c.outputs.summaryUncertain,'boolean');assert.equal(typeof c.outputs.teamFormulation,'string');assert.ok(c.canaries.length);
  assert.equal(c.sources.find(source=>source.id==='setup').text,d.learner.setup);assert.equal(c.sources.find(source=>source.id==='p0').text,d.opening);
  const ids=new Set();for(const source of c.transcript){assert.ok(!ids.has(source.id));ids.add(source.id);assert.ok(source.text.length);assert.ok(['scripted_setup','learner','patient_heard','team_formulation'].includes(source.kind));assert.ok(['previous_student','learner','patient','setup'].includes(source.speaker));assert.equal(typeof source.uncertain,'boolean');if(source.kind==='patient_heard')assert.ok(['played','interrupted','pending'].includes(source.playback.status));}
  for(const source of c.sources){assert.ok(ids.has(source.id));const original=c.transcript.find(s=>s.id===source.id);assert.ok(original.kind!=='patient_heard'||original.playback.status==='played');assert.deepEqual(Object.keys(source).sort(),['id','kind','speaker','text','turn','uncertain'].sort());}
  for(const f of c.expected){assert.ok(d.criteria.some(k=>k.id===f.criterionId));assert.ok(d.templates.observations[f.observationId]);for(const cite of f.evidence){const source=c.sources.find(s=>s.id===cite.sourceId);assert.ok(source,`${c.id}: missing ${cite.sourceId}`);assert.equal(source.text.slice(cite.start,cite.end),cite.quote);assert.ok(cite.quote.length<=300);}}
  if(c.pairedVariants)for(const paired of c.pairedVariants)inspect(paired);
 };
 packet.challenges.forEach(inspect);
 assert.ok(packet.challenges.find(c=>c.id==='P14').pairedVariants.some(c=>c.expected.some(f=>f.observationId==='simulation_drift')));
 assert.ok(packet.challenges.find(c=>c.id==='L04').pairedVariants.some(c=>c.expected.some(f=>f.observationId==='understanding_demonstrated')));
});
