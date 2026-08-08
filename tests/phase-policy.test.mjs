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
  return { shelfDaysUntil: shelfDaysUntil, phasePolicy: phasePolicy };
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
