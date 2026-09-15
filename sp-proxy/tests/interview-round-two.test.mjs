import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadBenchmark, replay } from '../../benchmarks/interview-room/run.mjs';
import { renderCalibration } from '../../benchmarks/interview-room/calibration.mjs';
import { loadRoundTwo, runRoundTwo, validateRoundTwo } from '../../benchmarks/interview-room/round-two.mjs';

test('fresh-phrasing runner produces actual exchanges without inventing labels', async () => {
  const runtime = await loadBenchmark();
  const corpus = loadRoundTwo();
  const before = JSON.stringify({ corpus, baseline: runtime.corpus });
  const result = await runRoundTwo(runtime, corpus);
  assert.equal(result.exercise.pairs.length, 4);
  assert.equal(result.runs.length, 8);
  assert.equal(result.summary.parityMismatches, 0);
  assert.equal(JSON.stringify({ corpus, baseline: runtime.corpus }), before);
  assert.ok(result.runs.every(run => run.checks.length === 0));
  const first = result.runs[0];
  const direct = await replay(runtime, { id: 'probe', setup: 'warm', turns: [corpus.pairs[0].sides[0].turns[0]], checks: [] }, 'Dana');
  assert.deepEqual(first.frames, direct.frames);
  assert.equal(result.exercise.pairs[0].sides[0].turns[0].patient, direct.frames.at(-1).patient);
  assert.equal(result.exercise.pairs[0].sides[0].coverage[0].status, direct.frames.at(-1).client.coverage.c_si);
  assert.equal(result.exercise.pairs[3].sides[0].context.length, 4);
  assert.equal(result.exercise.pairs[3].sides[0].turns.length, 3);
  assert.equal(result.exercise.pairs[3].sides[1].turns.length, 1);
});

test('fresh-phrasing input rejects baseline reuse, malformed pairs, and encoded judgments', async () => {
  const runtime = await loadBenchmark();
  const corpus = loadRoundTwo();
  for (const mutate of [
    doc => { doc.pairs[0].sides[0].turns[0] = 'HAVE YOU HAD THOUGHTS OF KILLING YOURSELF!'; },
    doc => { doc.pairs[0].case = 'Unknown'; },
    doc => { doc.pairs[0].sides.pop(); },
    doc => { doc.pairs[0].sides[0].turns = []; },
    doc => { doc.pairs[0].expected = 'observed'; },
    doc => { doc.pairs[0].sides[0].grade = 'partial'; },
    doc => { doc.pairs[1].id = doc.pairs[0].id; },
    doc => { doc.reviewStatus = 'approved'; },
  ]) {
    const broken = structuredClone(corpus); mutate(broken);
    assert.throws(() => validateRoundTwo(broken, runtime));
  }
});

test('reviewer and facilitator artifacts share dialogues but only facilitator includes results', async () => {
  const { exercise } = await runRoundTwo(await loadBenchmark(), loadRoundTwo());
  const reviewer = renderCalibration(exercise, { blind: true });
  const facilitator = renderCalibration(exercise);
  for (const [file, html] of [['round-two-reviewer.html', reviewer], ['round-two-facilitator.html', facilitator]]) {
    assert.equal(fs.readFileSync(new URL(`../../benchmarks/interview-room/${file}`, import.meta.url), 'utf8'), html);
    assert.equal((html.match(/<select /g) || []).length, 24);
  }
  assert.equal((facilitator.match(/class="reveal"/g) || []).length, 4);
  assert.equal((reviewer.match(/class="reveal"/g) || []).length, 0);
  assert.ok(!reviewer.includes(exercise.pairs[0].discussion));
  assert.match(reviewer, /connect-src 'none'/);
  assert.doesNotMatch(reviewer, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\b/);
});
