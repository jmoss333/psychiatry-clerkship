// FT-3 (2026-09-28): Daily Review no longer shows a day streak. The dashboard tile counts
// relearned cards instead: cards the page shows that lapsed at least once and whose latest
// grade was a pass. Why: streaks are an extrinsic reward that can undercut intrinsic motivation,
// and a streak punishes the skipped day that spacing makes harmless. Correcting errors is the
// behaviour this tool exists to build (the owner's decision, 2026-09-28; plan FT-3).
//
// The rule rides on one fact about the canonical grader (sm2_apply_grade.js): a pass moves
// `due` at least a day past `last`, while Again re-dues the card at the moment it is graded.
// So `lapses > 0 && due > last` means "missed before, passed since", whatever day it is now.
// The label is "Relearned", not "now right", because a wrong choice may still be graded Hard.
// These tests run the real grader AND the helpers under one controlled clock, so a regression
// to anything that reads today's date fails the idle-days test by name.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repo = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const review = repo('07_Evidence_and_Reading/Landmark_Trials/review.html');
const grader = repo('13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js');

function slice(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a > -1 && b > a, `could not slice ${from} .. ${to}`);
  return src.slice(a, b);
}

const lanes = slice(review, '/* ---------- review lanes ---------- */', '/* ---------- end review lanes ---------- */');
const fixes = slice(review, '/* ---------- error correction ---------- */', '/* ---------- end error correction ---------- */');

// One fake clock shared by the real grader and the page helpers.
function world() {
  let now = Date.UTC(2026, 8, 28, 12);
  const FakeDate = { now: () => now };
  // eslint-disable-next-line no-new-func
  const { applyGrade } = new Function('Date', `var DAY = 86400000;\n${grader}\nreturn { applyGrade };`)(FakeDate);
  // eslint-disable-next-line no-new-func
  const F = new Function('Date', `${lanes}\n${fixes}\nreturn { reviewCorrected, reviewCorrectedCount };`)(FakeDate);
  return { applyGrade, F, advance: (ms) => { now += ms; }, now: () => now };
}
const fresh = () => ({ ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: 0, last: 0 });
const DAY = 86400000;

test('a card counts once it is missed and then passed', () => {
  const w = world();
  let c = w.applyGrade(fresh(), 'Again');
  assert.equal(w.F.reviewCorrected(c), false, 'a miss alone is not relearned');
  w.advance(60_000);
  c = w.applyGrade(c, 'Good');
  assert.equal(w.F.reviewCorrected(c), true, 'missed, then passed');
});

test('skipping days never lowers the count', () => {
  const w = world();
  let c = w.applyGrade(fresh(), 'Again');
  w.advance(60_000);
  c = w.applyGrade(c, 'Hard');
  assert.equal(w.F.reviewCorrected(c), true);
  // Thirty days pass with no study: the card is overdue on the shared clock, and it still counts.
  w.advance(30 * DAY);
  assert.ok(c.due < w.now(), 'the card is overdue now');
  assert.equal(w.F.reviewCorrected(c), true, 'an absence is not a penalty');
});

test('a fresh miss takes the card back out until it is passed again', () => {
  const w = world();
  let c = w.applyGrade(w.applyGrade(fresh(), 'Again'), 'Good');
  w.advance(3 * DAY);
  c = w.applyGrade(c, 'Again');
  assert.equal(w.F.reviewCorrected(c), false);
  w.advance(60_000);
  c = w.applyGrade(c, 'Easy');
  assert.equal(w.F.reviewCorrected(c), true);
});

test('a card never missed does not count, and neither does a legacy record without `last`', () => {
  const w = world();
  assert.equal(w.F.reviewCorrected(w.applyGrade(fresh(), 'Good')), false);
  assert.equal(w.F.reviewCorrected({ lapses: 2, due: 5 }), false);
  assert.equal(w.F.reviewCorrected(undefined), false);
});

test('only cards this page loaded count, filtered by lane', () => {
  const w = world();
  const relearned = w.applyGrade(w.applyGrade(fresh(), 'Again'), 'Good');
  const missed = w.applyGrade(fresh(), 'Again');
  const loaded = [{ id: 'AR-24#5' }, { id: 'TOPIC#t_mood.md' }, { id: 'COMM#suicide_direct_question_001' }, { id: 'AR-1#0' }];
  const stateCards = {
    'AR-24#5': relearned, 'TOPIC#t_mood.md': relearned, 'COMM#suicide_direct_question_001': relearned, 'AR-1#0': missed,
    // In the shared store but never shown by Daily Review: must not count.
    'QB#qb_mood_001': relearned, 'RETIRED#gone': relearned,
  };
  assert.equal(w.F.reviewCorrectedCount(loaded, stateCards, 'landmark'), 1);
  assert.equal(w.F.reviewCorrectedCount(loaded, stateCards, 'clerkship'), 2);
  assert.equal(w.F.reviewCorrectedCount(loaded, stateCards, 'all'), 3);
  assert.equal(w.F.reviewCorrectedCount(null, stateCards, 'all'), 0);
  assert.equal(w.F.reviewCorrectedCount(loaded, null, 'all'), 0);
});

test('no user-visible streak remains in Daily Review', () => {
  assert.doesNotMatch(review, /Day streak/);
  assert.doesNotMatch(review, /-day streak/);
  assert.doesNotMatch(review, /className:"stat streak"/);
  const confirmText = slice(review, 'function resetAll(){', '}');
  assert.doesNotMatch(confirmText, /streak/i, 'the reset dialog no longer mentions a streak');
});

test('the dashboard, receipt and help text use the relearned count honestly', () => {
  assert.match(review, /className:"stat fixed"/);
  assert.match(review, /e\("div",\{className:"lab"\},"Relearned"\)/);
  assert.match(review, /reviewCorrectedCount\(cards,store\.cards,lane\)/);
  assert.match(review, /reviewCorrectedCount\(cards,store\.cards,"all"\)/);
  assert.match(review, /One card you once missed has been relearned\./);
  assert.match(review, /a day off never lowers it/);
  // UI strings only (the helper's comment names the rejected wording on purpose).
  assert.doesNotMatch(review, /"Missed, now right"|(?:is|are) now right\./,
    'no UI string may claim correctness the rule cannot prove');
  assert.match(review, /\.stat\.fixed \.num\{/);
});
