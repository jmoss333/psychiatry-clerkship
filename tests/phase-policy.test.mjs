// Behavioural contract for the rotation-phase-policy snippet (cw_shelf_date). Evaluates the
// real functions, not their text — a boundary regression turns these red even when every
// future consumer stays byte-identical. Harness technique (new Function over the snippet
// source) follows tests/sm2-behavior.test.mjs; the localStorage stub follows the memStorage()
// convention shared by tests/calib-ledger.test.mjs. Both shelfDaysUntil() and phasePolicy()
// take nowMs as an explicit parameter, so no Date.now() monkeypatching is needed anywhere here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const snippet = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/phase_policy.js',
  import.meta.url,
), 'utf8');

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
  ${snippet}
  return {
    shelfDaysUntil: shelfDaysUntil,
    phasePolicy: phasePolicy,
    localDayStr: localDayStr,
    localDayIndex: localDayIndex,
  };
`);

// Same audience-token ban tests/shell-copy.test.mjs applies to shared shell copy — this
// snippet's labels ship to both sites and must never bake in a site-specific word.
const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// Local-midnight day arithmetic that mirrors the snippet's own `new Date(s+'T00:00:00')`
// idiom exactly — using the identical parsing on both sides of an assertion is what keeps
// these tests timezone-robust: whatever zone the runner is in, implementation and test agree.
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function dateNDaysOut(nowMs, days) {
  const d = new Date(nowMs);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

// Fixed reference instant: local midnight of a date safely clear of any DST transition
// (mid-January; the widest test offset here is +/-29 days, which never crosses a US
// spring-forward/fall-back changeover), so day-boundary math below is exact, not approximate.
const NOW_STR = '2026-01-15';
const NOW_MS = new Date(NOW_STR + 'T00:00:00').getTime();

test('literal key check: cw_shelf_date appears in the snippet source as a quoted literal', () => {
  assert.ok(
    /(['"])cw_shelf_date\1/.test(snippet),
    'the store key must be a literal string inside the snippet body, not built/concatenated',
  );
});

// ---- shelfDaysUntil ---------------------------------------------------------------

test('shelfDaysUntil returns null when shelfStr is absent/empty/falsy', () => {
  const { shelfDaysUntil } = make(memStorage());
  assert.equal(shelfDaysUntil(null, NOW_MS), null);
  assert.equal(shelfDaysUntil(undefined, NOW_MS), null);
  assert.equal(shelfDaysUntil('', NOW_MS), null);
});

test('shelfDaysUntil returns null on an invalid date string ("banana")', () => {
  const { shelfDaysUntil } = make(memStorage());
  assert.equal(shelfDaysUntil('banana', NOW_MS), null);
});

test("shelfDaysUntil agrees with the shell's own local-midnight idiom for an arbitrary date", () => {
  const { shelfDaysUntil } = make(memStorage());
  const shelfStr = '2026-03-01';
  const expected = Math.ceil((new Date(shelfStr + 'T00:00:00').getTime() - NOW_MS) / 86400000);
  assert.equal(shelfDaysUntil(shelfStr, NOW_MS), expected);
});

test('shelfDaysUntil defaults nowMs to Date.now() when the parameter is omitted', () => {
  const { shelfDaysUntil } = make(memStorage());
  const shelfStr = '2099-01-01'; // far future: stable regardless of the day this test runs
  const explicit = shelfDaysUntil(shelfStr, Date.now());
  const implicit = shelfDaysUntil(shelfStr);
  assert.equal(implicit, explicit);
});

const BOUNDARY_DAYS = [29, 28, 15, 14, 8, 7, 1, 0, -1];

for (const n of BOUNDARY_DAYS) {
  test(`shelfDaysUntil pins the ${n}-day boundary at local midnight`, () => {
    const { shelfDaysUntil } = make(memStorage());
    const shelfStr = dateNDaysOut(NOW_MS, n);
    const expected = Math.ceil((new Date(shelfStr + 'T00:00:00').getTime() - NOW_MS) / 86400000);
    assert.equal(expected, n, 'sanity: local test-date arithmetic must itself land on day n');
    assert.equal(shelfDaysUntil(shelfStr, NOW_MS), n);
  });
}

// Guards the Math.ceil time-of-day invariance against future refactors: "now" evaluated at
// noon must land on the same calendar day-count as "now" evaluated at local midnight of that
// same day, for any shelf date. A refactor to e.g. Math.round or raw division would break this
// silently (rounding differently depending on what time of day a learner happens to load the
// page), even though every midnight-anchored BOUNDARY_DAYS pin above would still pass.
for (const n of [-3, 0, 7]) {
  test(`shelfDaysUntil is time-of-day invariant at the ${n}-day offset (midday === local midnight)`, () => {
    const { shelfDaysUntil } = make(memStorage());
    const shelfStr = dateNDaysOut(NOW_MS, n);
    const middayNowMs = NOW_MS + 12 * 3600000; // noon of the same reference day as NOW_MS
    // At offset 0, Math.ceil(-0.5) legitimately returns -0 (the shelf date is "today," and
    // querying from midday puts the raw ms diff just past zero going negative). -0 is
    // behaviorally identical to +0 everywhere phasePolicy/effectiveNewPerDay consume this
    // value (days<0, days<=N, arithmetic, string interpolation all treat them alike) — only
    // assert/strict's Object.is-based equal distinguishes them, so normalize before comparing.
    assert.equal(
      shelfDaysUntil(shelfStr, middayNowMs) + 0,
      shelfDaysUntil(shelfStr, NOW_MS) + 0,
      `midday-now result must equal midnight-now result at offset ${n}`,
    );
  });
}

// ---- phasePolicy ------------------------------------------------------------------

function policyFor(days) {
  const ls = memStorage();
  if (days !== null) ls.setItem('cw_shelf_date', dateNDaysOut(NOW_MS, days));
  const { phasePolicy } = make(ls);
  return phasePolicy(NOW_MS);
}

test('phasePolicy is "unset" (cap 12, no daysToShelf) when cw_shelf_date is absent', () => {
  const p = policyFor(null);
  assert.equal(p.phase, 'unset');
  assert.equal(p.newPerDayCap, 12);
  assert.equal(p.daysToShelf, null);
  assert.ok(p.label.includes('Start-here'), `unset label should point to Start-here: "${p.label}"`);
});

test('phasePolicy is "unset" (cap 12) when cw_shelf_date is an invalid string ("banana")', () => {
  const ls = memStorage();
  ls.setItem('cw_shelf_date', 'banana');
  const { phasePolicy } = make(ls);
  const p = phasePolicy(NOW_MS);
  assert.equal(p.phase, 'unset');
  assert.equal(p.newPerDayCap, 12);
});

test('phasePolicy label is review-forward on "post" (days-to-shelf negative)', () => {
  const p = policyFor(-1);
  assert.equal(p.phase, 'post');
  assert.ok(/review/i.test(p.label), `post label should be review-forward: "${p.label}"`);
});

// (days-to-shelf, expected phase, expected newPerDayCap) — pins every documented phase
// boundary: >28 encode/12 · 15-28 interleave/12 · 7-14 consolidate/8 · 0-7 taper/5 (the cap
// floor, matching the Daily Review slider's minimum) · <0 post/12.
const PHASE_BOUNDARIES = [
  [29, 'encode', 12],
  [28, 'interleave', 12],
  [15, 'interleave', 12],
  [14, 'consolidate', 8],
  [8, 'consolidate', 8],
  [7, 'taper', 5],
  [1, 'taper', 5],
  [0, 'taper', 5],
  [-1, 'post', 12],
];

for (const [days, phase, cap] of PHASE_BOUNDARIES) {
  test(`phasePolicy at ${days} days-to-shelf is "${phase}" with cap ${cap}`, () => {
    const p = policyFor(days);
    assert.equal(p.phase, phase);
    assert.equal(p.newPerDayCap, cap);
    assert.equal(p.daysToShelf, days);
  });
}

test('every returned label is audience-neutral (no MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford token)', () => {
  const scenarios = [null, -1, 0, 1, 7, 8, 14, 15, 28, 29];
  for (const days of scenarios) {
    const p = policyFor(days);
    assert.ok(
      !AUDIENCE_TOKEN_RE.test(p.label),
      `label for days=${days} ("${p.label}") contains an audience token`,
    );
  }
  const ls = memStorage();
  ls.setItem('cw_shelf_date', 'banana');
  const bananaLabel = make(ls).phasePolicy(NOW_MS).label;
  assert.ok(!AUDIENCE_TOKEN_RE.test(bananaLabel), `invalid-date label ("${bananaLabel}") contains an audience token`);
});

test('phasePolicy silently falls back to "unset" if localStorage throws — no throw escapes', () => {
  const throwing = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const { phasePolicy } = make(throwing);
  let p;
  assert.doesNotThrow(() => { p = phasePolicy(NOW_MS); });
  assert.equal(p.phase, 'unset');
});

// ---- local-day helpers (front door day boundary) ------------------------------------
// Constructed with new Date(y, m, d, h, mi) — LOCAL construction on both sides of every
// assertion, the same timezone-robustness technique the shelfDaysUntil tests above use.

test('localDayStr returns the local calendar date, zero-padded', () => {
  const { localDayStr } = make(memStorage());
  assert.equal(localDayStr(new Date(2026, 0, 5, 12, 0, 0).getTime()), '2026-01-05');
  assert.equal(localDayStr(new Date(2026, 10, 30, 12, 0, 0).getTime()), '2026-11-30');
});

test('localDayStr does not roll over early in the evening (the UTC bug)', () => {
  const { localDayStr } = make(memStorage());
  // 23:30 local. new Date().toISOString().slice(0,10) reports the NEXT day here in every
  // zone west of UTC — that is the prototype defect this helper replaces.
  assert.equal(localDayStr(new Date(2026, 7, 15, 23, 30, 0).getTime()), '2026-08-15');
});

test('localDayIndex is constant across a single local day', () => {
  const { localDayIndex } = make(memStorage());
  const early = new Date(2026, 7, 15, 0, 5, 0).getTime();
  const late = new Date(2026, 7, 15, 23, 55, 0).getTime();
  assert.equal(localDayIndex(early), localDayIndex(late));
});

test('localDayIndex advances by exactly one across local midnight', () => {
  const { localDayIndex } = make(memStorage());
  const before = new Date(2026, 7, 15, 23, 59, 0).getTime();
  const after = new Date(2026, 7, 16, 0, 1, 0).getTime();
  assert.equal(localDayIndex(after) - localDayIndex(before), 1);
});

test('localDayIndex advances by exactly one per day across a month boundary', () => {
  const { localDayIndex } = make(memStorage());
  const aug31 = new Date(2026, 7, 31, 9, 0, 0).getTime();
  const sep1 = new Date(2026, 8, 1, 9, 0, 0).getTime();
  assert.equal(localDayIndex(sep1) - localDayIndex(aug31), 1);
});
