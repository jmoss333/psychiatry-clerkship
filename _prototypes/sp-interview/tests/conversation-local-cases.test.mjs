import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {_internals} from '../../../sp-proxy/netlify/functions/sp.mjs';

const require=createRequire(import.meta.url);
const registryPath=new URL('../sp-interview.local-cases.js',import.meta.url);
const canonical=JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json',import.meta.url),'utf8'));

function load(){
  assert.ok(fs.existsSync(registryPath),'the local case registry must exist');
  const path=fileURLToPath(registryPath);
  delete require.cache[require.resolve(path)];
  return require(path);
}

test('exports one local draft Morgan case and a matching speech profile',()=>{
  const registry=load();
  assert.deepEqual(Object.keys(registry).sort(),['cases','profiles']);
  assert.equal(registry.cases.length,1);
  const caseDef=registry.cases[0],id='sp_alcohol_ambivalence_001';
  assert.equal(caseDef.id,id);
  assert.equal(caseDef.persona.displayName,'Morgan');
  assert.equal(caseDef.persona.pronouns,'they/them');
  assert.equal(caseDef.persona.ageBand,'40s');
  assert.match(caseDef.persona.opening,/fall/i);
  assert.deepEqual(registry.profiles[id],{
    name:'Morgan',slug:'morgan',voice:'marin',
    practice:'Explore alcohol ambivalence with reflective listening, autonomy support, and values-based questions.'
  });
  assert.match(caseDef.facultyReview.status,/draft|pending/i);
  assert.equal(caseDef.facultyReview.reviewer,null);
  assert.equal(caseDef.speechProfile.facultyReview.status,'pending');
  assert.ok(!canonical.cases.some(item=>item.id===id),'local case must not enter the canonical pack');
});

test('publishes the same registry as a dependency-free browser UMD global',()=>{
  const sandbox={};
  vm.runInNewContext(fs.readFileSync(registryPath,'utf8'),sandbox);
  assert.equal(sandbox.SPInterviewLocalCases.cases[0].id,'sp_alcohol_ambivalence_001');
  assert.equal(sandbox.SPInterviewLocalCases.profiles.sp_alcohol_ambivalence_001.voice,'marin');
});

test('is compatible with deterministic state derivation and legacy response selection',()=>{
  const caseDef=load().cases[0];
  for(const intent of caseDef.intents) for(const pattern of intent.patterns) assert.doesNotThrow(()=>new RegExp(pattern,'i'));
  const turns=[
    'What do you like about drinking?',
    'It sounds like alcohol helps you switch off, and you also dislike losing your mornings.',
    'What matters most to you right now?',
    'You need to admit you are an alcoholic and quit forever.'
  ];
  const state=_internals.deriveState(caseDef,turns);
  assert.equal(state.covered.explore_benefits,true);
  assert.equal(state.covered.reflection,true);
  assert.equal(state.covered.values,true);
  assert.equal(state.covered.confront_label,true);
  assert.deepEqual(state.unlocked,{},'rapport must not unlock hidden facts');
  for(const intent of caseDef.intents){
    const bank=caseDef.responses[intent.id];
    assert.ok(bank && bank.guarded.length && bank.open.length,`missing response bank for ${intent.id}`);
  }
  assert.ok(caseDef.responses._default.guarded.length && caseDef.responses._default.open.length);
});

test('grounds ambivalence in ordinary facts with explicit unknown limits and no hidden disclosures',()=>{
  const caseDef=load().cases[0],grounding=caseDef.localGrounding;
  assert.equal(caseDef.gated.length,0);
  assert.match(caseDef.hiddenAgenda,/no hidden/i);
  assert.equal(grounding.source.url,'https://www.ncbi.nlm.nih.gov/books/NBK571068/');
  assert.match(grounding.source.scope,/ambivalence.*normal/i);
  assert.match(JSON.stringify(grounding.ordinaryFacts),/four to six beers most evenings/i);
  assert.match(JSON.stringify(grounding.ordinaryFacts),/independence|reliable/i);
  assert.match(JSON.stringify(grounding.informationLimits),/diagnosis.*unknown/i);
  assert.match(JSON.stringify(grounding.informationLimits),/withdrawal.*unknown/i);
  assert.ok(Array.isArray(grounding.actorRules) && grounding.actorRules.length>=6);
  assert.match(grounding.actorRules.join(' '),/autonomy/i);
  assert.match(grounding.actorRules.join(' '),/(?:not|without).*sustain talk.*trait/i);
});

test('keeps the clinical boundary outside scoring, instruments, and withdrawal advice',()=>{
  const text=JSON.stringify(load());
  assert.doesNotMatch(text,/\b(?:AUDIT|CAGE)\b/i);
  assert.doesNotMatch(text,/readiness(?:Score|Rating|Level)"\s*:\s*\d|diagnosis"\s*:\s*"alcohol use disorder/i);
  assert.equal(load().cases[0].gated.length,0);
  assert.doesNotMatch(text,/\breward(?:s|ed|ing)?\b/i);
  assert.match(text,/withdrawal risk requires clinical evaluation/i);
  assert.match(text,/do not advise Morgan to stop suddenly/i);
  assert.match(text,/no medication or withdrawal-management advice/i);
  assert.match(text,/Morgan decides what changes, if any, fit their goals/i);
});

test('keeps synthetic chronology and quantities deterministic across common probes',()=>{
  const caseDef=load().cases[0],facts=caseDef.localGrounding.ordinaryFacts;
  assert.match(facts.setting,/voluntar(?:y|ily).*inpatient medical service/i);
  assert.match(facts.fall,/medically stabilized/i);
  assert.match(facts.pattern,/four to six beers most evenings/i);
  assert.match(facts.changeHistory,/two beers on work nights for three weeks/i);
  for(const question of [
    'What happened before the fall?','What does drinking do for you?','What are the downsides?',
    'What matters to you?','Have you changed it before?','What would you like to do next?'
  ]) assert.deepEqual(_internals.deriveState(caseDef,[question]),_internals.deriveState(caseDef,[question]));
});
