import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadBenchmark, runBenchmark } from '../benchmarks/interview-room/run.mjs';
import { buildCalibration, renderCalibration } from '../benchmarks/interview-room/calibration.mjs';

const report = await runBenchmark(await loadBenchmark());
const exercise = buildCalibration(report);

test('calibration uses actual benchmark exchanges and paired patient alternatives', () => {
  assert.equal(exercise.pairs.length, 5);
  assert.equal(exercise.status, 'pending-faculty-review');
  const comparison = exercise.pairs.find(p => p.id === 'question-or-statement');
  for (const side of comparison.sides) {
    const run = report.runs.find(r => r.id === side.sourceId);
    assert.deepEqual(side.turns, run.frames.filter(f => !f.setup).map(f => ({ learner: f.student, patient: f.patient })));
    assert.equal(side.coverage[0].status, run.frames.at(-1).client.coverage.c_si);
  }
  for (const pair of exercise.pairs.filter(p => p.suppliedReplies)) {
    assert.equal(pair.sides[0].turns[0].learner, pair.sides[1].turns[0].learner);
    assert.notEqual(pair.sides[0].turns[0].patient, pair.sides[1].turns[0].patient);
    assert.deepEqual(pair.sides[0].coverage, pair.sides[1].coverage);
  }
});

test('missing evidence fails instead of producing a plausible empty exercise', () => {
  const broken = structuredClone(report);
  broken.runs = broken.runs.filter(r => r.id !== 'plain-screen/Dana');
  assert.throws(() => buildCalibration(broken), /plain-screen\/Dana/);
  const noPairs = structuredClone(report);
  noPairs.responsePairs = [];
  assert.throws(() => buildCalibration(noPairs), /answer-versus-refusal/);
});

test('comparison wording follows captured evidence when future coverage changes', () => {
  const changed = structuredClone(report);
  changed.responsePairs[0].variants[1].coverage.find(row => row.id === 'c_si').status = 'missed';
  const updated = buildCalibration(changed);
  assert.equal(updated.pairs.find(pair => pair.id === 'answer-versus-refusal').coverageChanged, true);
  assert.match(renderCalibration(updated), /The captured labels differ between these conversations\./);
});

test('generated exercise is current, accessible by native controls, and offline', () => {
  const html = renderCalibration(exercise);
  assert.equal(fs.readFileSync(new URL('../benchmarks/interview-room/calibration.html', import.meta.url), 'utf8'), html);
  assert.equal((html.match(/class="comparison"/g) || []).length, 5);
  assert.equal((html.match(/class="reveal"/g) || []).length, 5);
  assert.equal((html.match(/<select /g) || []).length, 30);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\b/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=/);
  assert.doesNotMatch(html, /\b(?:textarea|input type="text")\b/);
  assert.match(html, /Pending faculty review/);
});

test('transcript text is escaped and cannot introduce active HTML', () => {
  const hostile = structuredClone(exercise);
  hostile.pairs[0].sides[0].turns[0].patient = '<img src=x onerror=alert(1)> & "quoted"';
  const html = renderCalibration(hostile);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'));
  assert.ok(!html.includes('<img src=x'));
});

test('blind review omits feedback and discussion rather than merely hiding them', () => {
  const html = renderCalibration(exercise, { blind: true });
  assert.doesNotMatch(html, /class="reveal"|class="coverage"|For discussion · proposed/);
  assert.ok(!html.includes('Screening language recognized.'));
  assert.ok(!html.includes(exercise.pairs[0].discussion));
  assert.ok(html.includes('Have you had thoughts of killing yourself?'));
  assert.equal((html.match(/<select /g) || []).length, 30);
  assert.match(html, /Simulator labels are not included in this reviewer copy/);
});
