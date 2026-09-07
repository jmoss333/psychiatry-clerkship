import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {run,prepare,loadRefinements} from '../dana-quality-refinements.mjs';
import {loadCaseDefinition} from '../dana-quality-benchmark.mjs';
import {createContext} from '../dana-live-context.mjs';
const scenarios=await loadRefinements(),caseDef=await loadCaseDefinition();
const runner=fileURLToPath(new URL('../dana-quality-refinements.mjs',import.meta.url));
async function temp(t){const dir=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'dana-refinements-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('twelve targeted scenarios preserve exact screenshot, explicit hearing, unknown facts and clear repairs',async()=>{
  const before=JSON.stringify(scenarios);const cases=await prepare({scenarios,caseDef});
  assert.equal(cases.length,12);assert.equal(new Set(cases.map(x=>x.id)).size,12);
  const tagged=tag=>cases.filter(x=>x.tags.includes(tag));
  assert.equal(tagged('work_impact').length,3);assert.equal(tagged('explicit_hearing').length,2);
  assert.equal(tagged('unknown_quantity').length+tagged('unknown_name').length,3);
  assert.equal(tagged('unsupported_premise').length,2);assert.equal(tagged('spoken_repair').length,2);
  assert.ok(cases.some(x=>x.currentLearnerUtterance==="Help me understand what Heard or how it's impacted you"));
  for(const item of cases){
    assert.equal(item.modelInput.messages.at(-1).content,item.currentLearnerUtterance);
    assert.deepEqual(item.canonicalState.unlockedGates,[]);assert.ok(item.sourceReferences.every(x=>typeof x.text==='string'&&x.text.length));
    assert.equal(item.humanReview.status,'not_reviewed');
    for(const gate of caseDef.gated)assert.ok(!item.modelInput.system.includes(gate.reveal));
  }
  for(const item of tagged('spoken_repair'))assert.equal(item.priorTranscript.at(-1).who,'me');
  assert.equal(JSON.stringify(scenarios),before);
});

test('dry run defaults to two repeats and never consults the supplied provider',async()=>{
  const provider={get reply(){throw new Error('must never consult provider');}};
  const packet=await run({provider});assert.equal(packet.mode,'dry_run');assert.equal(packet.callsPlanned,24);assert.equal(packet.callsAttempted,0);
  assert.equal(packet.cases.length,24);assert.equal(packet.semanticReview,'not_reviewed');
  assert.ok(packet.cases.every(x=>x.reply===null&&x.humanReview.status==='not_reviewed'));
  assert.match(packet.provenance['fixtures/dana-quality-refinements.json'],/^[a-f0-9]{64}$/);
});

test('live fake run is sequential, bounded, text-only and never retries failures',async t=>{
  const dir=await temp(t);let active=0,maxActive=0,calls=0;
  const provider={async reply(){calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setImmediate(r));active--;if(calls===2)throw new Error('secret provider text');if(calls===3)return '[invalid stage direction]';return 'I have been tired.';},get speak(){throw new Error('no speech');},get speakStream(){throw new Error('no speech');}};
  const packet=await run({live:true,outDir:path.join(dir,'new-review'),provider});
  assert.equal(calls,24);assert.equal(maxActive,1);assert.equal(packet.callsAttempted,24);
  assert.equal(packet.cases[1].errorCode,'reply_request_failed');assert.equal(packet.cases[2].errorCode,'reply_shape_invalid');
  assert.equal(packet.cases.filter(x=>x.reply!==null).length,22);
  assert.ok(packet.cases.every(x=>x.humanReview.status==='not_reviewed'));
  const json=await fs.readFile(path.join(dir,'new-review/review.json'),'utf8'),md=await fs.readFile(path.join(dir,'new-review/review.md'),'utf8');
  assert.ok(!json.includes('secret provider text'));assert.ok(!md.includes('secret provider text'));assert.match(md,/Exact canonical source facts/);
  assert.equal(JSON.parse(json).semanticReview,'not_reviewed');
});

test('injected before-context has separate provenance but cannot alter historical words or canonical gates',async()=>{
  const builder=(...args)=>({...createContext(...args),system:'An earlier prompt wording.'});
  const packet=await run({repeats:1,contextBuilder:builder,contextLabel:'before',contextSourceSha256:'a'.repeat(64)});
  assert.equal(packet.context.injected,true);assert.equal(packet.context.sourceSha256,'a'.repeat(64));assert.equal(packet.context.label,'before');
  assert.ok(packet.cases.every(x=>x.modelInput.system==='An earlier prompt wording.'));
  assert.match(packet.context.functionSha256,/^[a-f0-9]{64}$/);
  await assert.rejects(prepare({contextBuilder:(...args)=>({...createContext(...args),state:{unlocked:{si_active:true}}})}),/invalid/);
  await assert.rejects(prepare({contextBuilder:(...args)=>({...createContext(...args),messages:[{role:'user',content:'changed words'}]})}),/invalid/);
});

test('original source validator rejects invented patient history, unknown source IDs and gate changes',async()=>{
  for(const alter of [x=>{x[0].priorTranscript[0].text='Invented patient fact';},x=>{x[0].sourceFactIds.push('responses.missing.open.0');},x=>{x[0].expectedUnlockedGates=['si_active'];}]){
    const changed=structuredClone(scenarios);alter(changed);await assert.rejects(prepare({scenarios:changed}),/invalid/);
  }
});

test('live mode needs explicit fresh output and valid bounded repeats before any provider work',async t=>{
  const dir=await temp(t);let calls=0;const provider={async reply(){calls++;return 'Hello.';}};
  await assert.rejects(run({live:true,provider}),/explicit/);
  for(const repeats of [0,4,1.5,'2'])await assert.rejects(run({live:true,outDir:path.join(dir,'bad'),repeats,provider}),/repeats/);
  await assert.rejects(run({live:true,outDir:dir,provider}),/new writable/);
  const link=path.join(dir,'link');await fs.symlink(dir,link);await assert.rejects(run({live:true,outDir:path.join(link,'bad'),provider}),/symbolic/);
  assert.equal(calls,0);
  const packet=await run({repeats:3});assert.equal(packet.callsPlanned,36);
});

test('CLI defaults to dry run and rejects unsafe live or repeat flags without printing diagnostics',()=>{
  const dry=spawnSync(process.execPath,[runner],{encoding:'utf8'});assert.equal(dry.status,0);assert.equal(JSON.parse(dry.stdout).callsAttempted,0);
  for(const args of [['--live'],['--repeats','4'],['--repeats','2','--repeats','1'],['--unknown']]){
    const result=spawnSync(process.execPath,[runner,...args],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/could not complete/);
  }
});
