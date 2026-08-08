// Wiring contract for the rotation-phase-policy snippet (cw_shelf_date) at its Daily Review
// consumer. The BEHAVIOUR of shelfDaysUntil/phasePolicy itself is pinned separately in
// tests/phase-policy.test.mjs by evaluating the snippet body via `new Function`. This file
// only pins the WIRING — mirrors the behaviour/wiring split tests/phase-policy.test.mjs
// (behaviour) vs. this file (wiring) already use for the CALIB_LOG snippet
// (tests/calib-ledger.test.mjs vs. tests/calib-wiring.test.mjs):
//   (a) the /*__PHASE_POLICY__*/ marker appears exactly once in review.html;
//   (b) review.html does not reimplement `function phasePolicy(`/`function shelfDaysUntil(`
//       locally — the canonical body lives in phase_policy.js only;
//   (c) review.html's source never hardcodes the literal 'cw_shelf_date' key — only
//       phase_policy.js may (it reaches review.html solely via marker expansion at build
//       time, verified separately against the BUILT output in build_and_check.sh);
//   (d) THE LOAD-BEARING CHECK: both newRemain call sites (metrics()'s dashboard display
//       AND start()'s queue-build) reference effectiveNewPerDay — patching only one leaves
//       the other unthrottled (a prior draft failed review on exactly this);
//   (e) setNewPerDay marks the store userSet so an explicit learner choice always wins
//       over the phase cap on future dashboard renders.
// Behavioural coverage of effectiveNewPerDay() itself (cap application, userSet override,
// phasePolicy()-throws fallback) is hand-written directly in review.html, not injected —
// so it isn't covered by tests/phase-policy.test.mjs. It is pinned at the bottom of this
// file instead, by slicing the real function out of the shipped source and executing it
// against a stubbed phasePolicy (same `new Function` technique tests/srs-home-counters.test.mjs
// uses for spa_index.html).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const REVIEW = '07_Evidence_and_Reading/Landmark_Trials/review.html';
const MARKER = '/*__PHASE_POLICY__*/';

const reviewSrc = readFileSync(new URL(`../${REVIEW}`, import.meta.url), 'utf8');

// ---- (a) marker present exactly once -----------------------------------------------

test('review.html carries the PHASE_POLICY marker exactly once', () => {
  const count = reviewSrc.split(MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${MARKER} in ${REVIEW}, found ${count}`);
});

// ---- (b) no local reimplementation of the canonical functions ----------------------

test('review.html does not reimplement phasePolicy() or shelfDaysUntil() locally', () => {
  assert.doesNotMatch(reviewSrc, /function\s+phasePolicy\s*\(/,
    'phasePolicy must arrive only via the injected /*__PHASE_POLICY__*/ marker');
  assert.doesNotMatch(reviewSrc, /function\s+shelfDaysUntil\s*\(/,
    'shelfDaysUntil must arrive only via the injected /*__PHASE_POLICY__*/ marker');
});

// ---- (c) literal cw_shelf_date absent from the pre-build source --------------------

test("literal 'cw_shelf_date' is absent from review.html's source (present only after marker expansion)", () => {
  assert.doesNotMatch(reviewSrc, /(['"])cw_shelf_date\1/,
    'the cw_shelf_date key must reach review.html solely through the injected snippet body, '
    + 'never hand-typed in the consumer source');
});

// ---- (d) THE LOAD-BEARING CHECK: both newRemain call sites use effectiveNewPerDay --

test("metrics()'s newRemain uses effectiveNewPerDay, not a raw settings.newPerDay read", () => {
  const fnMatch = reviewSrc.match(/function metrics\(\)\{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'metrics() function body not found');
  const body = fnMatch[0];

  // Nonzero-extraction guard: pin the assertions below against THIS captured substring,
  // not the whole file — otherwise a stray `effectiveNewPerDay(` anywhere else in the tool
  // would let the pin pass even if metrics() itself still read settings.newPerDay raw. The
  // length floor also catches a regex that matched some degenerate near-empty function body.
  assert.ok(body.length > 150, `metrics() match is suspiciously short (${body.length} chars): ${JSON.stringify(body)}`);

  const calls = body.match(/effectiveNewPerDay\(/g) || [];
  assert.equal(calls.length, 1, `expected exactly one effectiveNewPerDay( call in metrics(), found ${calls.length}`);
  assert.doesNotMatch(body, /\(store\.settings\.newPerDay\s*\|\|\s*12\)/,
    'metrics() must not read store.settings.newPerDay directly — the display cap would '
    + 'silently diverge from the queue cap the moment either site is edited independently');
});

test("start()'s newRemain uses effectiveNewPerDay, not a raw settings.newPerDay read", () => {
  const fnMatch = reviewSrc.match(/function start\(ahead\)\{[\s\S]*?\n  \}/);
  assert.ok(fnMatch, 'start(ahead) function body not found');
  const body = fnMatch[0];

  // Same nonzero-extraction guard rationale as the metrics() pin above.
  assert.ok(body.length > 150, `start() match is suspiciously short (${body.length} chars): ${JSON.stringify(body)}`);

  const calls = body.match(/effectiveNewPerDay\(/g) || [];
  assert.equal(calls.length, 1, `expected exactly one effectiveNewPerDay( call in start(), found ${calls.length}`);
  assert.doesNotMatch(body, /\(s\.settings\.newPerDay\s*\|\|\s*12\)/,
    "start() must not read s.settings.newPerDay directly — this is the exact regression a prior "
    + 'draft shipped: capping only the dashboard display while the queue kept serving the raw '
    + 'setting (12), unthrottled by the rotation-phase cap');
});

// ---- (e) setNewPerDay marks the store userSet ---------------------------------------

test('setNewPerDay marks the store userSet=true before persisting, so an explicit choice always wins', () => {
  const fnMatch = reviewSrc.match(/function setNewPerDay\(v\)\{[\s\S]*?\}/);
  assert.ok(fnMatch, 'setNewPerDay(v) function body not found');
  const body = fnMatch[0];
  assert.ok(body.length > 40, `setNewPerDay() match is suspiciously short (${body.length} chars): ${JSON.stringify(body)}`);

  const userSetIdx = body.indexOf('s.settings.userSet=true');
  const persistIdx = body.indexOf('persist(s)');
  assert.ok(userSetIdx >= 0, 'setNewPerDay must set s.settings.userSet=true');
  assert.ok(persistIdx >= 0, 'setNewPerDay must call persist(s)');
  assert.ok(userSetIdx < persistIdx, 'userSet must be set before the store is persisted');
});

// ---- behavioural coverage of effectiveNewPerDay() (hand-written, not injected) -----

function extractEffectiveNewPerDay(src) {
  const fnMatch = src.match(/function effectiveNewPerDay\(s\)\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'effectiveNewPerDay(s) function body not found');
  // eslint-disable-next-line no-new-func
  return new Function('phasePolicy', `${fnMatch[0]}\nreturn effectiveNewPerDay;`);
}

test('effectiveNewPerDay caps the setting to the phase policy when userSet is not true', () => {
  const factory = extractEffectiveNewPerDay(reviewSrc);
  const fn = factory(() => ({ newPerDayCap: 5 }));
  assert.equal(fn({ settings: { newPerDay: 12 } }), 5, 'default 12 must be capped down to the phase cap');
  assert.equal(fn({ settings: {} }), 5, 'missing newPerDay defaults to 12, then is capped');
  assert.equal(fn({ settings: { newPerDay: 3 } }), 3, 'a setting already below the cap is unaffected');
});

test('effectiveNewPerDay returns the raw setting when userSet is true, even above the phase cap', () => {
  const factory = extractEffectiveNewPerDay(reviewSrc);
  const fn = factory(() => ({ newPerDayCap: 5 }));
  assert.equal(fn({ settings: { newPerDay: 12, userSet: true } }), 12,
    'an explicit learner choice (including choosing 12) must always win over the phase cap');
});

test('effectiveNewPerDay falls back to an uncapped default (12) if phasePolicy() throws', () => {
  const factory = extractEffectiveNewPerDay(reviewSrc);
  const fn = factory(() => { throw new Error('phasePolicy unavailable'); });
  assert.equal(fn({ settings: { newPerDay: 20 } }), 12,
    'the try/catch fallback cap (12) must still apply even if phasePolicy() itself throws');
});

// RED-teeth check performed manually during authoring (not re-run automatically here, since
// it requires mutating the source file): temporarily reverting start()'s newRemain line back
// to `(s.settings.newPerDay||12)` (leaving metrics() alone, reproducing the exact regression
// a prior draft shipped) turned exactly one test in this file red — "start()'s newRemain uses
// effectiveNewPerDay, not a raw settings.newPerDay read" (8 pass / 1 fail) — with every other
// test, including metrics()'s equivalent pin, staying green. The source was then restored and
// the suite re-verified fully green (9/9). See task-2-report.md.

// ---- #324 post-merge follow-up: loadS() backfills userSet for pre-#324 sliders --------
// Learners who moved the slider before #324 shipped have no `userSet` key, so the phase
// cap would silently override their explicit choice once. All four cw_srs_v1 writers
// (family-systems-practice.html, review.html's freshStore/loadS fallback, spa_index.html's
// seedSRS, question-bank-practice.html) default newPerDay to 12 — a stored value that is
// both present and not-12 proves an explicit pre-#324 choice. Pattern follows
// tests/srs-home-counters.test.mjs: slice the real function out of the shipped source, run
// it against a stubbed in-memory localStorage (no disk I/O).

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function extractLoadS(src) {
  const start = src.indexOf('var DAY=86400000');
  const end = src.indexOf('function saveS(', start);
  assert.ok(start !== -1 && end !== -1, 'could not locate the DAY/KEY/freshStore/loadS slice in review.html');
  const code = src.slice(start, end);
  assert.ok(code.length > 150, `loadS() slice is suspiciously short (${code.length} chars): ${JSON.stringify(code)}`);
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', `var window = {};\n${code}\nreturn loadS;`);
}

function storeWithSettings(settings) {
  return JSON.stringify({
    v: 1,
    cards: {},
    day: { lastDay: '', newToday: 0 },
    stats: { streak: 0, lastStudy: '', totalReviews: 0, correct: 0, seen: 0 },
    settings,
  });
}

test('loadS() backfills userSet=true for a pre-#324 store with a non-default newPerDay and no userSet key', () => {
  const ls = memStorage();
  ls.setItem('cw_srs_v1', storeWithSettings({ newPerDay: 20 }));
  const loadS = extractLoadS(reviewSrc)(ls);
  const s = loadS();
  assert.equal(s.settings.userSet, true,
    'a stored newPerDay of 20 with no userSet key proves an explicit pre-#324 choice');
});

test('loadS() does NOT backfill userSet for a store still at the irreducible default (newPerDay:12) with no userSet key', () => {
  const ls = memStorage();
  ls.setItem('cw_srs_v1', storeWithSettings({ newPerDay: 12 }));
  const loadS = extractLoadS(reviewSrc)(ls);
  const s = loadS();
  assert.equal('userSet' in s.settings, false,
    'newPerDay:12 is irreducibly indistinguishable from every writer\'s untouched default and must stay cappable');
});

test('loadS() treats an existing userSet key as authoritative and never overwrites it, even the impossible userSet:false state', () => {
  const ls = memStorage();
  // userSet:false is not writable by any code path today (setNewPerDay only ever writes
  // true) — this stub exists purely to pin that the backfill guard checks key presence
  // (`!('userSet' in s.settings)`), not truthiness, so it can never clobber a stored value.
  ls.setItem('cw_srs_v1', storeWithSettings({ newPerDay: 20, userSet: false }));
  const loadS = extractLoadS(reviewSrc)(ls);
  const s = loadS();
  assert.equal(s.settings.userSet, false,
    'an existing userSet key of any value is authoritative — backfill must never overwrite it');
});
