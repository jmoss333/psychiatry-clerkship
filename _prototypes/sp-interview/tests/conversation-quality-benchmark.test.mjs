import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {_internals} from '../../../sp-proxy/netlify/functions/sp.mjs';
import {loadScenarios,loadCaseDefinition,buildReviewPacket,runBenchmark,REQUIRED_COVERAGE} from '../dana-quality-benchmark.mjs';

const scenarios=await loadScenarios();
const caseDef=await loadCaseDefinition();
const benchmark=fileURLToPath(new URL('../dana-quality-benchmark.mjs',import.meta.url));
const packet=()=>buildReviewPacket({caseDef,scenarios});
async function temporary(t) {
  const base=await fs.realpath(os.tmpdir());
  const dir=await fs.mkdtemp(path.join(base,'dana-quality-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return dir;
}

test('twenty synthetic fixtures cover the screenshot wording and fidelity boundaries',()=>{
  assert.equal(scenarios.length,20);assert.equal(new Set(scenarios.map(item=>item.id)).size,20);
  const coverage=new Set(scenarios.flatMap(item=>item.tags));
  for(const tag of REQUIRED_COVERAGE)assert.ok(coverage.has(tag),tag);
  const utterances=scenarios.map(item=>item.currentLearnerUtterance);
  for(const text of ['Hello',"I'm sorry that you had to", "I'm sorry you had to tell The doctor everything last night",
    "My goal is to help understand why you're here",'What brought you into the emergency room',
    'It sounds like you Been under a lot of stress recently',"That's really difficult it seems like",
    "Help me understand what Heard or how it's impacted you", "No this won't take long at all",
    'How could we be of most help today','No worries take your time'])assert.ok(utterances.includes(text),text);
  for(const scenario of scenarios){
    assert.equal(scenario.synthetic,true);assert.ok(scenario.expectations.should.length);assert.ok(scenario.expectations.mustNot.length);
    assert.ok(scenario.sourceFactIds.length);assert.ok(scenario.relevantGates.length);
    for(const entry of scenario.priorTranscript.filter(item=>item.who==='pt'))assert.equal(entry.playbackStatus,'played');
  }
});

test('benchmark preserves exact histories, recognition noise and genuine repeated questions without mutation',()=>{
  const before=JSON.stringify({caseDef,scenarios}),review=packet();
  for(const [index,item] of review.cases.entries()){
    const scenario=scenarios[index];
    assert.deepEqual(item.modelInput.messages,[...scenario.priorTranscript,{who:'me',text:scenario.currentLearnerUtterance}]
      .map(entry=>({role:entry.who==='me'?'user':'assistant',content:entry.text})));
    assert.equal(item.modelInput.messages.at(-1).content,scenario.currentLearnerUtterance);
  }
  const repeated=review.cases.find(item=>item.id==='repeat-sleep-question');
  assert.equal(repeated.modelInput.messages.filter(item=>item.role==='user'&&item.content==='How has your sleep been?').length,2);
  assert.equal(review.cases.find(item=>item.id==='garbled-impact-request').modelInput.messages.at(-1).content,"Help me understand what Heard or how it's impacted you");
  assert.equal(JSON.stringify({caseDef,scenarios}),before);
});

test('canonical gate replay matches every scenario and locked disclosures never enter model context',()=>{
  for(const item of packet().cases){
    const learnerTexts=[...item.priorTranscript.filter(entry=>entry.who==='me').map(entry=>entry.text),item.currentLearnerUtterance];
    const state=_internals.deriveState(caseDef,learnerTexts);
    assert.equal(item.canonicalState.rapport,state.rapport);
    assert.deepEqual(item.canonicalState.unlockedGates,Object.keys(state.unlocked));
    assert.ok(!item.modelInput.system.includes(caseDef.hiddenAgenda));
    for(const gate of caseDef.gated){
      if(state.unlocked[gate.id])assert.ok(item.modelInput.system.includes(gate.reveal));
      else {
        assert.ok(!item.modelInput.system.includes(gate.reveal),`${item.id}: ${gate.id}`);
        if(gate.repeatAsk)assert.ok(!item.modelInput.system.includes(gate.repeatAsk));
        assert.ok(!item.sourceReferences.some(ref=>ref.id.startsWith(`gated.${gate.id}.`)));
      }
    }
  }
  assert.deepEqual(packet().cases.find(item=>item.id==='plan-before-disclosure').canonicalState.unlockedGates,[]);
});

test('interruption review carries only the actually played prefix as assistant history',()=>{
  const item=packet().cases.find(item=>item.id==='resume-after-played-prefix');
  const spoken=caseDef.gated[0].reveal.replace(/\*[^*]*\*/g,'').trim();
  const lastPatient=item.modelInput.messages.filter(message=>message.role==='assistant').at(-1).content;
  assert.ok(spoken.startsWith(lastPatient));assert.ok(spoken.length>lastPatient.length);
  assert.ok(!item.modelInput.messages.some(message=>message.content===spoken));
  assert.ok(!item.modelInput.messages.some(message=>message.content.includes(spoken.slice(lastPatient.length).trim())));
  assert.deepEqual(item.canonicalState.unlockedGates,['si_active']);
  assert.equal(item.deliveryContext.kind,'interrupted_after_played_prefix');
  assert.equal(item.priorTranscript.at(-1).omittedTail,true);
  assert.match(item.modelInput.system,/only the included complete prefix was heard/);
  assert.match(item.modelInput.system,/remaining patient reply is omitted/);
});

test('fixture validation rejects invented patient history, premature gate text, invalid state and unsafe references',()=>{
  for(const mutate of [
    values=>{values[0].priorTranscript[0].text='I was in a new accident yesterday.';},
    values=>{values[0].priorTranscript[0].playbackStatus='interrupted';},
    values=>{values[0].sourceFactIds.push('hiddenAgenda');},
    values=>{values[0].sourceFactIds.push('gated.si_active.reveal');},
    values=>{values[0].expectedUnlockedGates=['si_active'];},
    values=>{values[19].priorTranscript[0].text=values[19].priorTranscript.at(-1).text;},
    values=>{values[0].id=values[1].id;},
    values=>{values.pop();},
  ]){
    const changed=structuredClone(scenarios);mutate(changed);
    assert.throws(()=>buildReviewPacket({caseDef,scenarios:changed}),/fixtures or case context are invalid/);
  }
  const changedCase=structuredClone(caseDef);changedCase.responses.mood.open[0]+=' New unsupported detail.';
  assert.throws(()=>buildReviewPacket({caseDef:changedCase,scenarios}),/fixtures or case context are invalid/);
});

test('dry-run builds context without any provider or speech call and never declares semantic success',async()=>{
  let calls=0;
  const review=await runBenchmark({caseDef,scenarios,provider:{reply(){calls++;throw new Error('unexpected');},speak(){calls++;},speakStream(){calls++;}}});
  assert.equal(calls,0);assert.equal(review.callsAttempted,0);assert.equal(review.mode,'dry_run');assert.equal(review.semanticReview,'not_reviewed');
  for(const item of review.cases){assert.equal(item.structuralStatus,'context_ready');assert.equal(item.reply,null);assert.deepEqual(item.humanReview,{status:'not_reviewed',notes:null});}
  assert.ok(Object.keys(review.provenance).includes('dana-live-context.mjs'));
  for(const hash of Object.values(review.provenance))assert.match(hash,/^[a-f0-9]{64}$/);
});

test('explicit live review runs exactly twenty sequential text calls, zero speech, and requires human judgment',async t=>{
  const dir=await temporary(t),outDir=path.join(dir,'review');
  let active=0,maxActive=0,calls=0,speech=0;
  const provider={
    async reply(input){
      assert.deepEqual(Object.keys(input).sort(),['messages','system']);active++;maxActive=Math.max(maxActive,active);calls++;
      await new Promise(resolve=>setImmediate(resolve));active--;
      return 'My favorite color is blue.'; // Valid spoken shape, deliberately unsupported meaning: not a semantic pass.
    },speak(){speech++;throw new Error('Speech must not run.');},speakStream(){speech++;throw new Error('Speech must not run.');},
  };
  const review=await runBenchmark({live:true,outDir,provider,caseDef,scenarios});
  assert.equal(calls,20);assert.equal(review.callsAttempted,20);assert.equal(maxActive,1);assert.equal(speech,0);
  assert.equal(review.semanticReview,'not_reviewed');assert.equal(review.mode,'live_text_only');
  for(const item of review.cases){assert.equal(item.reply,'My favorite color is blue.');assert.equal(item.structuralStatus,'reply_recorded');assert.equal(item.humanReview.status,'not_reviewed');assert.equal(Object.hasOwn(item,'score'),false);}
  const saved=JSON.parse(await fs.readFile(path.join(outDir,'review.json'),'utf8'));
  assert.deepEqual(saved,review);
  const markdown=await fs.readFile(path.join(outDir,'review.md'),'utf8');
  assert.match(markdown,/No keyword score or automatic semantic pass/);assert.match(markdown,/Human review: not reviewed/);
  assert.match(markdown,/Speech calls: 0/);
});

test('provider failures and invalid replies are sanitized without retries or raw diagnostics in saved reviews',async t=>{
  const dir=await temporary(t),outDir=path.join(dir,'review'),secret='synthetic-sensitive-error-never-save';let calls=0;
  const provider={async reply(){calls++;if(calls===1)throw new Error(secret);if(calls===2)return JSON.stringify({secret});return 'Okay. I am listening.';}};
  const review=await runBenchmark({live:true,outDir,provider,caseDef,scenarios});
  assert.equal(calls,20);assert.equal(review.cases[0].structuralStatus,'provider_error');assert.equal(review.cases[0].errorCode,'reply_request_failed');
  assert.equal(review.cases[1].structuralStatus,'invalid_spoken_reply');assert.equal(review.cases[1].reply,null);
  for(const name of ['review.json','review.md'])assert.ok(!(await fs.readFile(path.join(outDir,name),'utf8')).includes(secret));
  assert.equal(review.semanticReview,'not_reviewed');
});

test('output must be new and cannot follow symlinks; invalid paths fail before provider calls',async t=>{
  const dir=await temporary(t),existing=path.join(dir,'existing');await fs.mkdir(existing);await fs.writeFile(path.join(existing,'keep.txt'),'unchanged');
  const alias=path.join(dir,'alias');await fs.symlink(existing,alias,'dir');let calls=0;
  const provider={reply(){calls++;return 'Okay.';}};
  for(const outDir of [existing,alias,path.join(alias,'new'),'synthetic-secret\0invalid']) {
    await assert.rejects(runBenchmark({live:true,outDir,provider,caseDef,scenarios}),error=>/new writable directory/.test(error.message)&&!error.message.includes('synthetic-secret'));
  }
  await assert.rejects(runBenchmark({live:true,provider,caseDef,scenarios}),/explicit output directory/);
  assert.equal(calls,0);assert.equal(await fs.readFile(path.join(existing,'keep.txt'),'utf8'),'unchanged');
  assert.equal((await fs.readdir(existing)).length,1);
});

test('CLI is a zero-call dry-run by default and reports malformed options without echoing them',()=>{
  const env={PATH:process.env.PATH,HOME:process.env.HOME};
  const dry=spawnSync(process.execPath,[benchmark],{encoding:'utf8',env,timeout:10000});
  assert.equal(dry.status,0);assert.deepEqual(JSON.parse(dry.stdout),{mode:'dry_run',scenarios:20,callsAttempted:0,repliesRecorded:0,humanReviewRequired:true});
  const bad=spawnSync(process.execPath,[benchmark,'--synthetic-sensitive-option'],{encoding:'utf8',env,timeout:10000});
  assert.equal(bad.status,1);assert.ok(!(bad.stdout+bad.stderr).includes('synthetic-sensitive-option'));
  const missing=spawnSync(process.execPath,[benchmark,'--live'],{encoding:'utf8',env,timeout:10000});
  assert.equal(missing.status,1);assert.match(missing.stderr,/could not complete/);
});
