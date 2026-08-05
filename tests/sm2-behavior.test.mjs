// Behavioural contract for the canonical SM-2 grader. Evaluates the real function,
// not its text — a scheduling change turns these red even when every consumer
// stays byte-identical (the gap the old textual parity test left open).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js',
  import.meta.url,
), 'utf8');

const DAY = 86400000;
// eslint-disable-next-line no-new-func
const applyGrade = new Function('card', 'grade', 'opts',
  `var DAY=${DAY}; ${snippet}; return applyGrade(card, grade, opts);`);

// Reference re-implementation of the documented sm2Fuzz formula (a spec pin,
// not a call into the SUT) — used to compute expected fuzzed values
// independently so tests don't hardcode magic numbers from hand arithmetic.
function refFuzz(ivl, key, reps) {
  if (ivl < 3 || !key) return ivl;
  let h = 2166136261;
  const s = key + ':' + reps;
  for (let i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0; }
  const f = ((h % 2001) / 1000) - 1; // [-1, 1]
  return Math.min(365, Math.max(1, Math.round(ivl + ivl * 0.15 * f)));
}

const fresh = () => ({ ease: 2.5, ivl: 0, reps: 0, lapses: 0, due: Date.now(), last: 0 });
const days = (ms) => Math.round(ms / DAY);

test('first encounter: Again requeues now / Hard 1d / Good 1d / Easy 4d', () => {
  const now = Date.now();
  const again = applyGrade(fresh(), 'Again');
  assert.equal(again.ivl, 1);
  assert.equal(again.lapses, 1);
  assert.ok(again.due <= Date.now(), 'Again re-dues the card immediately');
  const hard = applyGrade(fresh(), 'Hard');
  assert.equal(hard.ivl, 1);
  assert.equal(days(hard.due - now), 1);
  const good = applyGrade(fresh(), 'Good');
  assert.equal(good.ivl, 1);
  assert.equal(days(good.due - now), 1);
  const easy = applyGrade(fresh(), 'Easy');
  assert.equal(easy.ivl, 4);
  assert.equal(days(easy.due - now), 4);
});

test('ease floor 1.3 holds under repeated failure', () => {
  let c = { ease: 1.35, ivl: 10, reps: 5, lapses: 0, due: 0, last: 0 };
  c = applyGrade(c, 'Again');
  assert.equal(c.ease, 1.3);
  c = applyGrade(c, 'Hard');
  assert.equal(c.ease, 1.3);
});

test('Easy ease is capped at 4.0', () => {
  const c = applyGrade({ ease: 3.95, ivl: 10, reps: 3, lapses: 0, due: 0, last: 0 }, 'Easy');
  assert.equal(c.ease, 4);
});

test('interval capped at 365 d on Good/Easy; Hard due date capped at 365 d out', () => {
  const now = Date.now();
  const good = applyGrade({ ease: 2.5, ivl: 300, reps: 9, lapses: 0, due: 0, last: 0 }, 'Good');
  assert.equal(good.ivl, 365);
  const easy = applyGrade({ ease: 2.5, ivl: 300, reps: 9, lapses: 0, due: 0, last: 0 }, 'Easy');
  assert.equal(easy.ivl, 365);
  const hard = applyGrade({ ease: 2.5, ivl: 350, reps: 9, lapses: 0, due: 0, last: 0 }, 'Hard');
  assert.equal(days(hard.due - now), 365);
});

test('lapse halves the interval (min 1), ease -0.2, re-dues now, counts the lapse', () => {
  const c = applyGrade({ ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 }, 'Again');
  assert.equal(c.ivl, 5);
  assert.equal(c.ease, 2.3);
  assert.equal(c.lapses, 1);
  assert.ok(c.due <= Date.now());
});

test('reps increment and last is stamped on every grade', () => {
  const before = Date.now();
  const c = applyGrade(fresh(), 'Good');
  assert.equal(c.reps, 1);
  assert.ok(c.last >= before);
});

// ---- Task 11: deterministic ±15% interval fuzz (opts.fuzzKey) ----------------

test('opts omitted is byte-identical to opts={} / fuzzKey undefined (back-compat identity)', () => {
  const now = 1_700_000_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const base = { ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 };
    const noArg = applyGrade({ ...base }, 'Good');
    const emptyOpts = applyGrade({ ...base }, 'Good', {});
    const undefinedFuzzKey = applyGrade({ ...base }, 'Good', { fuzzKey: undefined });
    assert.deepEqual(noArg, emptyOpts, 'opts={} must match opts omitted');
    assert.deepEqual(noArg, undefinedFuzzKey, 'fuzzKey:undefined must match opts omitted');
  } finally {
    Date.now = realNow;
  }
});

test('fuzz is a no-op when the resulting interval is below 3 days, even with a fuzzKey', () => {
  const now = Date.now();
  const noFuzz = applyGrade(fresh(), 'Good'); // first encounter -> ivl=1 (<3)
  const withFuzz = applyGrade(fresh(), 'Good', { fuzzKey: 'QB#below-three' });
  assert.equal(noFuzz.ivl, 1);
  assert.equal(withFuzz.ivl, 1);
  assert.equal(days(withFuzz.due - now), days(noFuzz.due - now));
});

test('fuzz keeps the interval within +/-15% of the unfuzzed value and within [1, 365]', () => {
  const card = () => ({ ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 });
  const unfuzzed = applyGrade(card(), 'Good');
  assert.equal(unfuzzed.ivl, 25); // 10 * 2.5 ease, pin the unfuzzed baseline this test fuzzes against
  const fuzzed = applyGrade(card(), 'Good', { fuzzKey: 'QB#a' });
  assert.ok(fuzzed.ivl >= Math.floor(unfuzzed.ivl * 0.85), `${fuzzed.ivl} below -15% floor`);
  assert.ok(fuzzed.ivl <= Math.ceil(unfuzzed.ivl * 1.15), `${fuzzed.ivl} above +15% ceiling`);
  assert.ok(fuzzed.ivl >= 1 && fuzzed.ivl <= 365);
  assert.equal(fuzzed.ivl, refFuzz(unfuzzed.ivl, 'QB#a', unfuzzed.reps), 'must match the documented FNV-1a-style fuzz formula');
  assert.equal(days(fuzzed.due - Date.now()), fuzzed.ivl, 'due must derive from the final fuzzed ivl');
});

test('fuzz never pushes the interval above the 365-day cap', () => {
  const fuzzed = applyGrade({ ease: 2.5, ivl: 300, reps: 9, lapses: 0, due: 0, last: 0 }, 'Easy', { fuzzKey: 'QB#cap' });
  assert.ok(fuzzed.ivl <= 365);
});

test('same card state + same fuzzKey is deterministic', () => {
  const now = 1_700_000_000_000;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const card = () => ({ ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 });
    const a = applyGrade(card(), 'Good', { fuzzKey: 'QB#det' });
    const b = applyGrade(card(), 'Good', { fuzzKey: 'QB#det' });
    assert.deepEqual(a, b);
  } finally {
    Date.now = realNow;
  }
});

test('different fuzzKeys typically produce different offsets for the same card state', () => {
  const card = () => ({ ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 });
  const keys = ['QB#a', 'QB#b', 'QB#c', 'QB#d', 'QB#e', 'QB#f', 'QB#g', 'QB#h'];
  const ivls = keys.map((k) => applyGrade(card(), 'Good', { fuzzKey: k }).ivl);
  assert.ok(new Set(ivls).size > 1, `expected varied intervals across keys, got ${ivls}`);
});

test('Again is never fuzzed, even with a fuzzKey', () => {
  const noFuzz = applyGrade({ ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 }, 'Again');
  const withFuzz = applyGrade({ ease: 2.5, ivl: 10, reps: 4, lapses: 0, due: 0, last: 0 }, 'Again', { fuzzKey: 'QB#again' });
  assert.equal(noFuzz.ivl, withFuzz.ivl);
});
