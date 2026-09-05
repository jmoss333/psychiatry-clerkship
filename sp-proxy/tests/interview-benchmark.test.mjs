import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadBenchmark, replay, runBenchmark, validateCorpus, renderReport } from '../benchmarks/interview-room/run.mjs';

const runtime = await loadBenchmark();

test('benchmark executes the real client and server and preserves approved controls', async () => {
  const report = await runBenchmark(runtime);
  assert.ok(report.runs.length >= 40, 'exercise all three personas and conversation boundaries');
  assert.equal(report.summary.parityMismatches, 0);
  assert.equal(report.summary.controlMismatches, 0);
  assert.ok(report.summary.proposedChecks > 0);
  assert.ok(report.runs.every(r => r.frames.length > 0 && r.frames.every(f => typeof f.patient === 'string')));
  assert.ok(report.runs.every(r => r.reviewStatus === 'pending-faculty-review'));
  assert.ok(report.provenance.files['_prototypes/sp-interview/sp-interview.pack.json'].match(/^[a-f0-9]{64}$/));
  assert.match(renderReport(report), /Pending faculty review/);
  assert.match(renderReport(report), /not a clinical accuracy estimate/);
});

test('unknown personas, checklist rows, intents, steps and empty checks fail closed', () => {
  const mutations = [
    c => { c.scenarios[0].cases = ['Nobody']; },
    c => { c.scenarios[0].checks[0].key = 'missing_row'; },
    c => { c.scenarios[0].checks[0] = { kind: 'intent', key: 'missing_intent', expected: false }; },
    c => { c.scenarios[0].checks[0].step = 999; },
    c => { c.scenarios[0].checks = []; },
    c => { c.scenarios[1].id = c.scenarios[0].id; },
    c => { c.scenarios[0].basis = 'invented-approval'; },
    c => { c.scenarios[0].reviewStatus = 'reviewed'; },
    c => { c.scenarios[0].checks[0].forCase = 'Nobody'; },
  ];
  for (const mutate of mutations) {
    const corpus = structuredClone(runtime.corpus);
    mutate(corpus);
    assert.throws(() => validateCorpus(corpus, runtime.pack));
  }
});

test('historical plan and disclosure regressions are detected even when both engines agree', async () => {
  const planRuntime = { ...runtime, pack: structuredClone(runtime.pack) };
  const dana = planRuntime.pack.cases.find(c => c.persona.displayName === 'Dana');
  dana.intents.find(i => i.id === 'si_plan').patterns.push('\\bplan\\b');
  for (const id of ['ordinary-discharge-plan', 'ordinary-plan-after-disclosure']) {
    const result = await replay(planRuntime, runtime.corpus.scenarios.find(s => s.id === id), 'Dana');
    assert.ok(result.frames.every(f => f.parity), 'mutation must demonstrate a shared false green');
    assert.ok(result.checks.some(c => !c.matches), `${id} must catch the broad plan matcher`);
  }
  const gateRuntime = { ...runtime, pack: structuredClone(runtime.pack) };
  const marcus = gateRuntime.pack.cases.find(c => c.persona.displayName === 'Marcus');
  marcus.gated.find(g => g.id === 'g_si_mixed').requiresIntents.push('si_euphemism');
  for (const id of ['euphemism', 'reflection']) {
    const result = await replay(gateRuntime, runtime.corpus.scenarios.find(s => s.id === id), 'Marcus');
    assert.ok(result.frames.every(f => f.parity));
    assert.ok(result.checks.some(c => c.kind === 'gate' && !c.matches), `${id} must catch inappropriate disclosure`);
  }
});

test('command-line completion and pending-label failure signals stay distinct', () => {
  const runner = fileURLToPath(new URL('../benchmarks/interview-room/run.mjs', import.meta.url));
  const normal = spawnSync(process.execPath, [runner, '--json'], { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(normal.status, 0, normal.stderr);
  const report = JSON.parse(normal.stdout);
  const strict = spawnSync(process.execPath, [runner, '--json', '--strict'], { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(strict.status, report.summary.proposedMismatches > 0 ? 2 : 0, strict.stderr);
  assert.deepEqual(JSON.parse(strict.stdout), report, 'fresh sessions must produce the same evidence');
  const unknown = spawnSync(process.execPath, [runner, '--unknown'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stdout, '');
});

test('a deliberately wrong expectation produces a discrepancy, never a silent pass', async () => {
  const scenario = structuredClone(runtime.corpus.scenarios.find(s => s.id === 'plain-screen'));
  scenario.checks = [{ kind: 'coverage', key: 'c_si', expected: 'missed' }];
  const result = await replay(runtime, scenario, 'Dana');
  assert.equal(result.checks[0].matches, false);
  assert.deepEqual(result.checks[0].actual, { client: 'observed', server: 'observed' });
});

test('built-in feedback describes recognition without inventing a question or disclosure', async () => {
  for (const id of ['cold-screen-narrative', 'reassurance-and-screen', 'learner-assertion', 'plain-screen']) {
    const scenario = runtime.corpus.scenarios.find(s => s.id === id);
    for (const name of scenario.cases) {
      const result = await replay(runtime, scenario, name);
      const strengths = result.frames.at(-1).narrative.strengths;
      assert.ok(strengths.some(s => s.includes('The simulator recognized suicide-screening language.')), result.id);
      assert.ok(strengths.every(s => !s.includes('told you the truth') && !s.includes('You asked about suicide')), result.id);
    }
  }
});

test('patient-response variants traverse the real evaluation handler without a provider call', async () => {
  const report = await runBenchmark(runtime);
  assert.ok(report.responsePairs.length >= 3);
  for (const pair of report.responsePairs) {
    assert.equal(pair.completed, true);
    assert.equal(pair.variants.length, 2);
    assert.notEqual(pair.variants[0].transcript, pair.variants[1].transcript);
    assert.ok(pair.variants.every(v => v.transcript.includes(v.patient)));
    assert.ok(pair.variants.every(v => v.handlerStatus === 200));
    assert.ok(pair.variants.every(v => v.coverage.length > 0));
  }
});
