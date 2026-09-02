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
    fdProgressDoneMap: fdProgressDoneMap,
    fdProgressToggle: fdProgressToggle,
    fdRotationWeek: fdRotationWeek,
    fdRotationStartForWeek: fdRotationStartForWeek,
    fdExamCountdown: fdExamCountdown,
    fdDailyPick: fdDailyPick,
    fdRingStep: fdRingStep,
    fdActivityDays: fdActivityDays,
    fdActivityDayIndex: fdActivityDayIndex,
  };
`);

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;
const FOUR = [1, 2, 3, 4].map((n) => ({ n }));
const SIX = [1, 2, 3, 4, 5, 6].map((n) => ({ n }));
const MONDAY = '2026-08-03';
const atDay = (offset) => new Date(2026, 7, 3 + offset, 9, 0, 0).getTime();

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
  fdSave({ role: 'ms3', tab: 'path', viewWeek: 4, toolExpanded: true });
  assert.deepEqual(fdLoad(), {
    role: 'ms3', tab: 'path', viewWeek: 4, toolExpanded: true,
  });

  fdSave({ role: 'ms3', tab: 'path', viewWeek: 4, toolExpanded: false });
  assert.equal(fdLoad().toolExpanded, false,
    'the focused preference must overwrite an earlier expanded preference');
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

test('rotation week and start derive from explicit path membership', () => {
  const { fdRotationWeek, fdRotationStartForWeek } = make(memStorage());
  assert.equal(fdRotationWeek(MONDAY, FOUR, atDay(0)), 1);
  assert.equal(fdRotationWeek(MONDAY, FOUR, atDay(6)), 1);
  assert.equal(fdRotationWeek(MONDAY, FOUR, atDay(7)), 2);
  assert.equal(fdRotationWeek(MONDAY, FOUR, atDay(27)), 4);
  assert.equal(fdRotationWeek(MONDAY, FOUR, atDay(28)), 5);
  assert.equal(fdRotationWeek(MONDAY, SIX, atDay(35)), 6);
  assert.equal(fdRotationWeek(MONDAY, SIX, atDay(42)), 7);
  const now = new Date(2026, 7, 12, 9, 0, 0).getTime(); // Wednesday of week 6
  assert.equal(fdRotationStartForWeek(4, FOUR, now), '2026-07-20');
  assert.equal(fdRotationStartForWeek(5, FOUR, Date.now()), '');
});

// ---- exam countdown -----------------------------------------------------------------

test('fdExamCountdown is empty outside the path final two weeks', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  for (const w of [null, 1, 2]) {
    assert.equal(fdExamCountdown(w, FOUR, wed), '');
  }
  assert.equal(fdExamCountdown(3, FOUR, wed), '· exam in ~9 days');
  assert.equal(fdExamCountdown(4, FOUR, wed), '· exam in ~2 days');
});

test('week 6 counts down to Friday', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime(); // Wednesday
  assert.equal(fdExamCountdown(6, SIX, wed), '· exam in ~2 days');
});

test('week 5 adds the extra week', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  assert.equal(fdExamCountdown(5, SIX, wed), '· exam in ~9 days');
});

// The split of responsibility, made explicit rather than left as an accident of these fixtures:
// the fragment owns its separator DOT and the caller owns the SPACE that joins it to whatever
// precedes it (fd_today.js's subhead does exactly that, as its own streak clause already did).
// Every expectation in this file asserts the space-less form; without this test that reads as
// "the leading space was forgotten", and fd_today.js originally concatenated it as though the
// fragment were self-spacing, printing "Sunday· exam in ~5 days". Whichever half moves, one of
// these two tests fails: tests/fd-today.test.mjs pins the joined string.
test('the countdown is a bare fragment: separator dot included, leading space NOT', () => {
  const { fdExamCountdown } = make(memStorage());
  for (const week of [5, 6]) {
    for (let d = 0; d < 7; d++) {
      const out = fdExamCountdown(week, SIX, new Date(2026, 7, 10 + d, 9, 0, 0).getTime());
      if (out === '') continue;
      assert.equal(out[0], '·', `week ${week} day ${d}: the fragment carries its own separator`);
      assert.doesNotMatch(out, /^\s/, `week ${week} day ${d}: the caller supplies the space`);
      assert.doesNotMatch(out, /\s$/, `week ${week} day ${d}: and nothing trails`);
    }
  }
});

// Monday 2026-08-10 … Sunday 2026-08-16 is one full rotation week. Pinning EVERY weekday is
// the point: the prior loop walked seven days but asserted only that no audience token
// appeared, so a formula that produced 13 on the Saturday of week 5 passed it unnoticed.
const WEEK_MON = 10; // 2026-08-10 is a Monday
const PER_WEEKDAY = {
  5: [
    '· exam in ~11 days', // Mon
    '· exam in ~10 days', // Tue
    '· exam in ~9 days',  // Wed
    '· exam in ~8 days',  // Thu
    '· exam in ~7 days',  // Fri
    '· exam in ~6 days',  // Sat — the wall-calendar formula said 13 here
    '· exam in ~5 days',  // Sun
  ],
  6: [
    '· exam in ~4 days',      // Mon
    '· exam in ~3 days',      // Tue
    '· exam in ~2 days',      // Wed
    '· exam in ~1 day',       // Thu
    '· exam day — good luck', // Fri
    '',                       // Sat — the exam is behind us, not a phantom next one
    '',                       // Sun
  ],
};

test('every weekday of weeks 5 and 6 has a pinned countdown', () => {
  const { fdExamCountdown } = make(memStorage());
  for (const week of [5, 6]) {
    PER_WEEKDAY[week].forEach((expected, offset) => {
      const now = new Date(2026, 7, WEEK_MON + offset, 9, 0, 0).getTime();
      assert.equal(fdExamCountdown(week, SIX, now), expected,
        `week ${week}, day offset ${offset} from Monday`);
    });
  }
});

// The property the bug violated: one day forward in time must never increase the countdown.
function daysFrom(out) {
  if (out === '') return null;
  if (out === '· exam day — good luck') return 0;
  return Number(/~(\d+) day/.exec(out)[1]);
}

// This is also the pin for the Monday-alignment assumption documented on fdExamCountdown:
// WEEK_MON is a real Monday, so the sweep below only holds because rotations always start on
// one. A non-Monday cw_rotation_start would desync week/idx and reopen the rising-countdown /
// phantom-next-exam bug this test (and the '' entries in the weekday table above) pins shut.
test('the countdown never increases as time advances one day at a time', () => {
  const { fdExamCountdown } = make(memStorage());
  let prev = Infinity;
  let ended = false;
  for (let offset = 0; offset < 14; offset += 1) {
    const week = offset < 7 ? 5 : 6;
    const now = new Date(2026, 7, WEEK_MON + offset, 9, 0, 0).getTime();
    const days = daysFrom(fdExamCountdown(week, SIX, now));
    if (days === null) { ended = true; continue; }
    assert.ok(!ended, `the countdown came back after the exam at offset ${offset}`);
    assert.ok(days <= prev, `countdown rose from ${prev} to ${days} at offset ${offset}`);
    prev = days;
  }
  assert.ok(ended, 'the fixture must run past the exam day');
});

test('a stored cw_shelf_date wins over the rotation-grid fallback', () => {
  const ls = memStorage();
  ls.setItem('cw_shelf_date', '2026-08-21'); // the Friday AFTER the week-6 Friday
  const { fdExamCountdown } = make(ls);
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  // Grid fallback would say 2 days; the stored date is the real one.
  assert.equal(fdExamCountdown(6, SIX, wed), '· exam in ~9 days');
});

test('a stored cw_shelf_date reads as exam day on the day and empties after it', () => {
  const ls = memStorage();
  ls.setItem('cw_shelf_date', '2026-08-14');
  const { fdExamCountdown } = make(ls);
  assert.equal(fdExamCountdown(6, SIX, new Date(2026, 7, 14, 9, 0, 0).getTime()),
    '· exam day — good luck');
  assert.equal(fdExamCountdown(6, SIX, new Date(2026, 7, 15, 9, 0, 0).getTime()), '');
});

test('an unparseable cw_shelf_date falls back rather than emitting NaN', () => {
  const ls = memStorage();
  ls.setItem('cw_shelf_date', 'banana');
  const { fdExamCountdown } = make(ls);
  assert.equal(fdExamCountdown(6, SIX, new Date(2026, 7, 12, 9, 0, 0).getTime()),
    '· exam in ~2 days');
});

test('a usable legacy non-Monday rotation start drives the fallback countdown', () => {
  const { fdExamCountdown } = make(memStorage());
  const wed = new Date(2026, 7, 12, 9, 0, 0).getTime();
  assert.equal(fdExamCountdown(6, SIX, wed, '2026-07-07'), '· exam in ~3 days');
});

// shelfDaysUntil() in phase_policy.js is the repo's ONE local-midnight parse site; the
// phase-chip contract bans the suffix idiom everywhere else, comments included.
test('fd_state.js contains no date-parse idiom of its own', () => {
  assert.doesNotMatch(fdState, /T00:00:00/,
    'fd_state.js must delegate string date parsing to shelfDaysUntil()');
});

test('the day itself reads as exam day, not "in ~0 days"', () => {
  const { fdExamCountdown } = make(memStorage());
  const fri = new Date(2026, 7, 14, 9, 0, 0).getTime(); // Friday
  assert.equal(fdExamCountdown(6, SIX, fri), '· exam day — good luck');
});

test('one day out is singular', () => {
  const { fdExamCountdown } = make(memStorage());
  const thu = new Date(2026, 7, 13, 9, 0, 0).getTime();
  assert.equal(fdExamCountdown(6, SIX, thu), '· exam in ~1 day');
});

// Scoped to the RETURNED strings, not the file. AUDIENCE_TOKEN_RE bans tokens in
// user-visible copy — tests/phase-policy.test.mjs:193,200 apply it to label values for
// the same reason. A whole-file scan would fail on identifiers and comments that never
// reach a reader.
test('every countdown string the module emits is audience-neutral', () => {
  const { fdExamCountdown } = make(memStorage());
  for (let d = 0; d < 7; d += 1) {
    for (const w of [5, 6]) {
      const out = fdExamCountdown(w, SIX, new Date(2026, 7, 10 + d, 9, 0, 0).getTime());
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

// ---- seven-day activity strip -----------------------------------------------------------
//
// fdActivityDays reads the timestamps every tool already writes and returns seven booleans,
// oldest first, ending on the day containing nowMs. Fixture: nowMs is Sunday 2026-08-09 09:00,
// so the window is Mon 08-03 .. Sun 08-09 and atDay(0..6) lands on each of those days.

const F2 = make(memStorage());
const SUNDAY = atDay(6);

test('an empty or malformed store set yields seven quiet days rather than throwing', () => {
  assert.deepEqual(F2.fdActivityDays({}, SUNDAY), [false, false, false, false, false, false, false]);
  assert.deepEqual(F2.fdActivityDays(null, SUNDAY), [false, false, false, false, false, false, false]);
  assert.deepEqual(F2.fdActivityDays({ srs: 'junk', qb: 4, calib: { qb: 'x' }, capture: {} }, SUNDAY),
    [false, false, false, false, false, false, false]);
});

test('every store shape the tools write is recognised, each on its own day', () => {
  const days = F2.fdActivityDays({
    srs: { cards: { 'QB#1': { last: atDay(0) } }, stats: { lastStudy: '2026-8-4' } }, // Mon (ms), Tue (Y-M-D unpadded)
    qb: { q1: { ts: atDay(2) } },                                                    // Wed (ms)
    comm: { c1: { at: '2026-08-06' } },                                              // Thu (ISO date)
    reason: { r1: { updatedAt: '2026-08-07', steps: { s1: { at: '2026-08-07' } } } }, // Fri (ISO date)
    progress: { 'a.md': { done: true, at: '2026-08-08' } },                          // Sat (localDayStr)
    capture: [{ at: atDay(6) }],                                                     // Sun (ms)
  }, SUNDAY);
  assert.deepEqual(days, [true, true, true, true, true, true, true]);
});

test('the calibration ledger counts for both question and review events', () => {
  const days = F2.fdActivityDays({ calib: { v: 1, qb: [{ ts: atDay(1) }], rev: [{ ts: atDay(5) }] } }, SUNDAY);
  assert.deepEqual(days, [false, true, false, false, false, true, false]);
});

test('activity outside the window is ignored in both directions', () => {
  const days = F2.fdActivityDays({
    qb: { old: { ts: atDay(-1) }, future: { ts: atDay(7) }, edge: { ts: atDay(0) } },
  }, SUNDAY);
  assert.deepEqual(days, [true, false, false, false, false, false, false]);
});

test('a page merely present in progress does not count unless it is done', () => {
  const days = F2.fdActivityDays({ progress: { 'a.md': { done: false, at: '2026-08-09' } } }, SUNDAY);
  assert.deepEqual(days, [false, false, false, false, false, false, false]);
});

test('the day normaliser accepts ms and Y-M-D strings only', () => {
  const noon = new Date(2026, 7, 9, 12, 0, 0).getTime();
  assert.equal(F2.fdActivityDayIndex('2026-08-09'), F2.fdActivityDayIndex(noon));
  assert.equal(F2.fdActivityDayIndex('2026-8-9'), F2.fdActivityDayIndex(noon));
  assert.equal(F2.fdActivityDayIndex(0), null, 'zero is the capsule\'s "unset" value, not epoch day');
  assert.equal(F2.fdActivityDayIndex('yesterday'), null);
  assert.equal(F2.fdActivityDayIndex(null), null);
});
