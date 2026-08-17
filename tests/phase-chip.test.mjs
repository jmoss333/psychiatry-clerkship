// Wiring contract for the PHASE_POLICY snippet at its spa_index.html consumer, and for the
// single-source shelf-date parsing the front door depends on. Mirrors the behaviour/wiring split
// tests/phase-policy.test.mjs (behaviour of phasePolicy()/shelfDaysUntil() themselves, evaluated
// from the injected snippet body) vs. tests/phase-wiring.test.mjs (review.html's wiring) already
// use for this snippet — this file is the third leg: the shell's wiring.
//
//   (a) the /*__PHASE_POLICY__*/ marker appears exactly once in spa_index.html;
//   (b) spa_index.html does not reimplement `function phasePolicy(`/`function shelfDaysUntil(`
//       locally — the canonical body lives in phase_policy.js only, arriving via marker
//       expansion at build time (never hand-typed in this consumer);
//   (c) THE DEDUP PIN: no inline `+'T00:00:00'` date-parse literal in spa_index.html's SOURCE
//       **or in any frontdoor/ module**. Before this pin, the shelf-countdown card and
//       shelfIntensityHtml() each carried their own copy of `new Date(shelf+'T00:00:00')` — two
//       independent parses that could silently disagree at a day boundary. Both were rewired to
//       the single shared shelfDaysUntil() helper. This is a plain string scan of SOURCE files,
//       not built output: the /*__PHASE_POLICY__*/ marker is text only until
//       inject_shared_snippets() (common.py) replaces it with phase_policy.js's body (which DOES
//       contain "T00:00:00") at build time. Since that expansion never happens to these source
//       files, a source scan can never "see" the injected snippet body and false-pass — the same
//       reasoning tests/phase-wiring.test.mjs test (c) applies to review.html's literal
//       'cw_shelf_date' check.
//
// ---- WHAT PLAN 3 TASK 8 CHANGED, AND WHY -------------------------------------------------------
// (d) the phase-chip slice-marker pair and (e) the behavioural coverage of the sliced chip
// fragment are GONE, deleted rather than repointed: Plan 3 Task 3 deleted renderHome() and with it
// the "rotation phase" chip, and Task 5's Progress restoration did not bring it back. NOTHING
// REPLACED IT — phasePolicy() now has zero call sites in the shell (its other consumer,
// review.html, is unaffected and still pinned by tests/phase-wiring.test.mjs). The rotation-week
// framing a learner sees on the front door comes from fd_today.js's Continue card and
// fd_state.js's fdExamCountdown(), neither of which consults the phase policy. Recorded here
// rather than in a commit message alone because a reader of this file will otherwise ask where
// the chip coverage went.
//
// (c) GREW to cover frontdoor/*.js in the same task, and that is a fix, not a flourish:
// fd_state.js's own header comment already claimed "tests/phase-chip.test.mjs bans the idiom, in
// code and in comments alike" while this file scanned only spa_index.html — a comment crediting a
// test with enforcement it did not perform. The modules are now where the date logic lives, so
// they are where the ban has to reach.
//
// dueBreakdown and calib-panel slice regions are pinned by their own suites
// (tests/srs-home-counters.test.mjs, tests/calib-panel.test.mjs) and tests/spa-shell-a11y.test.mjs
// covers shell a11y structure — this file does not duplicate those.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '13_Faculty_Resources/_automation/site_build';
const SPA = `${BUILD}/spa_index.html`;
const FRONTDOOR = `${BUILD}/frontdoor`;
const MARKER = '/*__PHASE_POLICY__*/';

const source = readFileSync(new URL(`../${SPA}`, import.meta.url), 'utf8');

// Enumerated from disk, never hand-listed: a module added later must inherit the ban without
// anyone remembering to add it here.
function frontdoorSources() {
  const dir = new URL(`../${FRONTDOOR}/`, import.meta.url);
  const names = readdirSync(dir).filter((n) => n.endsWith('.js')).sort();
  assert.ok(names.length >= 10,
    `expected the frontdoor module set, found ${names.length} — did the scan go blind?`);
  return names.map((n) => [`${FRONTDOOR}/${n}`, readFileSync(new URL(n, dir), 'utf8')]);
}

// ---- (a) marker present exactly once -----------------------------------------------

test('spa_index.html carries the PHASE_POLICY marker exactly once', () => {
  const count = source.split(MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${MARKER} in ${SPA}, found ${count}`);
});

// ---- (b) no local reimplementation of the canonical functions ----------------------

test('spa_index.html does not reimplement phasePolicy() or shelfDaysUntil() locally', () => {
  assert.doesNotMatch(source, /function\s+phasePolicy\s*\(/,
    'phasePolicy must arrive only via the injected /*__PHASE_POLICY__*/ marker');
  assert.doesNotMatch(source, /function\s+shelfDaysUntil\s*\(/,
    'shelfDaysUntil must arrive only via the injected /*__PHASE_POLICY__*/ marker');
});

// ---- (c) THE DEDUP PIN: zero inline +'T00:00:00' literals outside the snippet ------

const MIDNIGHT_NEEDLE = "+'T00:00:00'";

test("spa_index.html source contains zero inline +'T00:00:00' date-parse literals", () => {
  const count = source.split(MIDNIGHT_NEEDLE).length - 1;
  assert.equal(count, 0,
    `expected zero inline ${MIDNIGHT_NEEDLE} literals in ${SPA} — every date string must go `
    + `through the shared shelfDaysUntil(), found ${count}`);
});

// The half fd_state.js's comment already promised. Comments count: the idiom is banned as a
// PATTERN, and a commented example is the thing the next author copies.
test("no frontdoor/ module contains an inline +'T00:00:00' date-parse literal, in code or comment", () => {
  const offenders = frontdoorSources()
    .filter(([, src]) => src.includes(MIDNIGHT_NEEDLE))
    .map(([name]) => name);
  assert.deepEqual(offenders, [],
    `${MIDNIGHT_NEEDLE} must not appear in a frontdoor module — shelfDaysUntil() (phase_policy.js) `
    + 'is the repo\'s one sanctioned local-midnight parse site');
});

