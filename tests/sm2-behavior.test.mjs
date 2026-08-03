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
const applyGrade = new Function('card', 'grade',
  `var DAY=${DAY}; ${snippet}; return applyGrade(card, grade);`);

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
