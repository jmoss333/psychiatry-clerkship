// Behavioural contract for the front door's state + engagement snippet. Evaluates the real
// functions rather than their text, following tests/phase-policy.test.mjs: new Function over
// the snippet source, memStorage() for localStorage, and nowMs passed explicitly so nothing
// monkeypatches Date. fd_state.js depends on localDayStr/localDayIndex from phase_policy.js,
// so both snippets are concatenated here exactly as inject_shared_snippets() concatenates
// them into the built page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const phase = readFileSync(new URL(`${BUILD}/phase_policy.js`, import.meta.url), 'utf8');
const fdState = readFileSync(new URL(`${BUILD}/frontdoor/fd_state.js`, import.meta.url), 'utf8');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `
  ${phase}
  ${fdState}
  return {
    FD_STORE: FD_STORE,
    fdLoad: fdLoad,
    fdSave: fdSave,
    fdExamCountdown: fdExamCountdown,
    fdDailyPick: fdDailyPick,
    fdRingStep: fdRingStep,
  };
`);

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// ---- storage key + persistence ------------------------------------------------------

test('the store key is namespaced cw_ as the QA gate requires', () => {
  assert.equal(make(memStorage()).FD_STORE, 'cw_frontdoor_v1');
});

test('fdLoad returns an empty object when nothing is stored', () => {
  assert.deepEqual(make(memStorage()).fdLoad(), {});
});

test('fdLoad returns an empty object rather than throwing on malformed JSON', () => {
  const ls = memStorage();
  ls.setItem('cw_frontdoor_v1', '{not json');
  assert.deepEqual(make(ls).fdLoad(), {});
});

test('fdSave round-trips through fdLoad', () => {
  const ls = memStorage();
  const { fdSave, fdLoad } = make(ls);
  fdSave({ role: 'ms3', tab: 'path', viewWeek: 4 });
  assert.deepEqual(fdLoad(), { role: 'ms3', tab: 'path', viewWeek: 4 });
});

test('fdSave persists only whitelisted keys, never done/streak/week', () => {
  const ls = memStorage();
  const { fdSave, fdLoad } = make(ls);
  // done lives in cw_progress_v1, streak in cw_srs_v1, week in cw_rotation_start.
  // Duplicating them here is exactly the desync the spec forbids.
  fdSave({ role: 'ms3', done: { 'x.md': true }, streak: 9, week: 3 });
  const out = fdLoad();
  assert.equal(out.role, 'ms3');
  assert.equal(out.done, undefined);
  assert.equal(out.streak, undefined);
  assert.equal(out.week, undefined);
});

// ---- exam countdown -----------------------------------------------------------------

test('fdExamCountdown is empty outside weeks 5 and 6', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  for (const w of [null, 1, 2, 3, 4]) {
    assert.equal(fdExamCountdown(w, wed), '');
  }
});

test('week 6 counts down to Friday', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime(); // Wednesday
  assert.equal(fdExamCountdown(6, wed), '· exam in ~2 days');
});

test('week 5 adds the extra week', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  assert.equal(fdExamCountdown(5, wed), '· exam in ~9 days');
});

test('the day itself reads as exam day, not "in ~0 days"', () => {
  const { fdExamCountdown } = make(memStorage());
  const fri = new Date(2026, 7, 14, 9, 0, 0).getTime(); // Friday
  assert.equal(fdExamCountdown(6, fri), '· exam day — good luck');
});

test('one day out is singular', () => {
  const { fdExamCountdown } = make(memStorage());
  const thu = new Date(2026, 7, 13, 9, 0, 0).getTime();
  assert.equal(fdExamCountdown(6, thu), '· exam in ~1 day');
});

// Scoped to the RETURNED strings, not the file. AUDIENCE_TOKEN_RE bans tokens in
// user-visible copy — tests/phase-policy.test.mjs:193,200 apply it to label values for
// the same reason. A whole-file scan would fail on identifiers and comments that never
// reach a reader.
test('every countdown string the module emits is audience-neutral', () => {
  const { fdExamCountdown } = make(memStorage());
  for (let d = 0; d < 7; d += 1) {
    for (const w of [5, 6]) {
      const out = fdExamCountdown(w, new Date(2026, 7, 10 + d, 9, 0, 0).getTime());
      assert.doesNotMatch(out, AUDIENCE_TOKEN_RE,
        `fdExamCountdown(${w}) emitted an audience token: "${out}"`);
    }
  }
});

// ---- daily pick ---------------------------------------------------------------------

const CANDIDATES = [
  { ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' },
];

test('fdDailyPick returns null when every candidate is done', () => {
  const { fdDailyPick } = make(memStorage());
  const done = { 'a.md': true, 'b.md': true, 'c.md': true };
  assert.equal(fdDailyPick(CANDIDATES, done, Date.now()), null);
});

test('fdDailyPick returns null for an empty candidate list', () => {
  const { fdDailyPick } = make(memStorage());
  assert.equal(fdDailyPick([], {}, Date.now()), null);
});

test('fdDailyPick never returns a completed item', () => {
  const { fdDailyPick } = make(memStorage());
  const done = { 'a.md': true, 'c.md': true };
  for (let d = 0; d < 14; d += 1) {
    const now = new Date(2026, 7, 1 + d, 9, 0, 0).getTime();
    assert.equal(fdDailyPick(CANDIDATES, done, now).ref, 'b.md');
  }
});

test('fdDailyPick is stable within a local day and rotates across days', () => {
  const { fdDailyPick } = make(memStorage());
  const morning = new Date(2026, 7, 1, 7, 0, 0).getTime();
  const evening = new Date(2026, 7, 1, 22, 0, 0).getTime();
  const tomorrow = new Date(2026, 7, 2, 7, 0, 0).getTime();
  assert.equal(fdDailyPick(CANDIDATES, {}, morning).ref,
    fdDailyPick(CANDIDATES, {}, evening).ref,
    'the pick must not change at 8pm — that is the UTC bug');
  assert.notEqual(fdDailyPick(CANDIDATES, {}, morning).ref,
    fdDailyPick(CANDIDATES, {}, tomorrow).ref);
});

test('fdDailyPick cycles through every candidate over a full period', () => {
  const { fdDailyPick } = make(memStorage());
  const seen = new Set();
  for (let d = 0; d < 3; d += 1) {
    seen.add(fdDailyPick(CANDIDATES, {}, new Date(2026, 7, 1 + d, 9, 0, 0).getTime()).ref);
  }
  assert.equal(seen.size, 3);
});

// ---- progress ring ------------------------------------------------------------------

test('fdRingStep starts at the from value and ends at the to value', () => {
  const { fdRingStep } = make(memStorage());
  assert.equal(fdRingStep(0, 80, 0, 600), 0);
  assert.equal(fdRingStep(0, 80, 600, 600), 80);
});

test('fdRingStep clamps past the duration rather than overshooting', () => {
  const { fdRingStep } = make(memStorage());
  assert.equal(fdRingStep(0, 80, 5000, 600), 80);
});

test('fdRingStep eases out — past halfway by the midpoint', () => {
  const { fdRingStep } = make(memStorage());
  assert.ok(fdRingStep(0, 100, 300, 600) > 50,
    'cubic ease-out must be past halfway at the midpoint');
});

test('fdRingStep is monotonic and returns integers', () => {
  const { fdRingStep } = make(memStorage());
  let prev = -1;
  for (let t = 0; t <= 600; t += 50) {
    const v = fdRingStep(0, 97, t, 600);
    assert.equal(v, Math.round(v), 'ring percent must be an integer');
    assert.ok(v >= prev, `ring must not go backwards at t=${t}`);
    prev = v;
  }
});

test('fdRingStep animates downward too', () => {
  const { fdRingStep } = make(memStorage());
  assert.equal(fdRingStep(80, 20, 600, 600), 20);
  assert.ok(fdRingStep(80, 20, 300, 600) < 50);
});
