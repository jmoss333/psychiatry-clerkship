import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadBenchmark, runBenchmark } from '../../benchmarks/interview-room/run.mjs';
import { buildCalibration, renderCalibration } from '../../benchmarks/interview-room/calibration.mjs';

const report = await runBenchmark(await loadBenchmark());
const exercise = buildCalibration(report);

// The shipped pack's real top-level status is usually draft-pending-attestation
// between attestation waves, so sp.mjs's own POST_PACK_STATUSES gate refuses
// every responsePair() request and `report` above carries three skipped pairs
// (see run.mjs). Several tests below need a genuinely completed pair — actual
// handler execution, actual captured transcript, actual regex extraction — to
// exercise that code path at all. Rather than fabricate a parallel fixture, they
// run the real benchmark a second time against a cloned pack whose top-level
// `status` is overridden to 'reviewed'. This is the same technique
// interview-benchmark.test.mjs already uses to test regressions (cloning
// runtime.pack and mutating one field): the client, server, and handler code
// under test are entirely real; only the input pack's approval flag differs
// from what is currently shipped.
const approvedRuntime = await loadBenchmark();
approvedRuntime.pack = structuredClone(approvedRuntime.pack);
approvedRuntime.pack.status = 'reviewed';
const approvedReport = await runBenchmark(approvedRuntime);
const approvedExercise = buildCalibration(approvedReport);

test('an approved pack completes every response pair (sanity check for the tests below)', () => {
  assert.equal(approvedReport.responsePairs.length, report.responsePairs.length);
  assert.ok(approvedReport.responsePairs.every(p => p.completed === true && !p.skipped));
});

test('calibration uses actual benchmark exchanges and paired patient alternatives', () => {
  assert.equal(approvedExercise.pairs.length, 5);
  assert.equal(approvedExercise.status, 'pending-faculty-review');
  const comparison = approvedExercise.pairs.find(p => p.id === 'question-or-statement');
  for (const side of comparison.sides) {
    const run = approvedReport.runs.find(r => r.id === side.sourceId);
    assert.deepEqual(side.turns, run.frames.filter(f => !f.setup).map(f => ({ learner: f.student, patient: f.patient })));
    assert.equal(side.coverage[0].status, run.frames.at(-1).client.coverage.c_si);
  }
  for (const pair of approvedExercise.pairs.filter(p => p.suppliedReplies)) {
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
  const changed = structuredClone(approvedReport);
  changed.responsePairs[0].variants[1].coverage.find(row => row.id === 'c_si').status = 'missed';
  const updated = buildCalibration(changed);
  assert.equal(updated.pairs.find(pair => pair.id === 'answer-versus-refusal').coverageChanged, true);
  assert.match(renderCalibration(updated), /The captured labels differ between these conversations\./);
});

test('a skipped response pair is a named, visible outcome, never a silent pass or a crash', () => {
  const skippedPairs = report.responsePairs.filter(p => p.skipped);
  // This assertion documents today's real gate state (the shipped pack's
  // top-level status) rather than assuming it; if the pack is ever reviewed or
  // attested, this test still passes (there is simply nothing to check below).
  for (const pair of skippedPairs) {
    assert.equal(pair.skipped, 'pack_not_approved');
    const exercisePair = exercise.pairs.find(p => p.id === pair.id);
    assert.equal(exercisePair.skipped, 'pack_not_approved');
    assert.equal(exercisePair.sides, undefined);
  }
  const html = renderCalibration(exercise);
  if (skippedPairs.length) {
    assert.match(html, /class="comparison skipped"/);
    assert.match(html, /Skipped: <strong>pack_not_approved<\/strong>/);
    assert.match(html, /pack_not_approved/);
  } else {
    assert.doesNotMatch(html, /class="comparison skipped"/);
  }
});

test('generated exercise is current, accessible by native controls, and offline', () => {
  const html = renderCalibration(exercise);
  assert.equal(fs.readFileSync(new URL('../../benchmarks/interview-room/calibration.html', import.meta.url), 'utf8'), html);
  const answered = exercise.pairs.filter(p => !p.skipped).length;
  assert.equal((html.match(/class="comparison/g) || []).length, exercise.pairs.length);
  assert.equal((html.match(/class="reveal"/g) || []).length, answered);
  assert.equal((html.match(/<select /g) || []).length, answered * 6);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|sendBeacon)\b/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)=/);
  assert.doesNotMatch(html, /\b(?:textarea|input type="text")\b/);
  assert.match(html, /Pending faculty review/);
});

test('transcript text is escaped and cannot introduce active HTML', () => {
  const hostile = structuredClone(approvedExercise);
  hostile.pairs[0].sides[0].turns[0].patient = '<img src=x onerror=alert(1)> & "quoted"';
  const html = renderCalibration(hostile);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'));
  assert.ok(!html.includes('<img src=x'));
});

test('blind review omits feedback and discussion rather than merely hiding them', () => {
  // Prove the hiding is doing real work: confirm the sighted copy of this exact
  // exercise actually carries the built-in strengths text before checking that
  // the blind copy omits it. Without this, "the blind copy lacks the string"
  // would hold trivially for any exercise, blind template bug or not. The exact
  // wording ("Screening language recognized." versus the not-yet-landed "...
  // told you the truth" correction — see interview-benchmark.test.mjs) is
  // immaterial to what this test checks; either phrasing must disappear in the
  // blind copy.
  const screeningStrength = s => s.includes('Screening language recognized.') || s.includes('You asked about suicide in plain language');
  const sighted = renderCalibration(approvedExercise);
  assert.ok(screeningStrength(sighted), 'the sighted copy must actually carry the strengths text this test hides');
  const html = renderCalibration(approvedExercise, { blind: true });
  assert.doesNotMatch(html, /class="reveal"|class="coverage"|For discussion · proposed/);
  assert.ok(!screeningStrength(html));
  assert.ok(!html.includes(approvedExercise.pairs[0].discussion));
  assert.ok(html.includes('Have you had thoughts of killing yourself?'));
  assert.equal((html.match(/<select /g) || []).length, 30);
  assert.match(html, /Simulator labels are not included in this reviewer copy/);
});
