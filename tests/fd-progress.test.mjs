// Contract for the demoted Progress & mastery page, and for the three orphans it gave a home to:
// window.exportStudy (kept alive by Task 3 and unreachable ever since), the ONLY writer of
// cw_shelf_date, and the add-to-home-screen offline instruction.
//
// fdProgress() lives in spa_index.html rather than under frontdoor/ because it composes three
// impure derivations (masteryByBlueprint, calibrationSummary, renderCalibPanel) that already read
// storage themselves — so it is sliced out and executed with those supplied as stubs, the same
// extract-and-execute pattern tests/surface-governance-ui.test.mjs uses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const shell = read('spa_index.html');
const wire = read('frontdoor/fd_wire.js');
const today = read('frontdoor/fd_today.js');
const css = read('frontdoor/frontdoor.css');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

const block = slice(shell, '/* ---- Progress & mastery ----', '/* ---- end Progress & mastery ---- */');

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

const ROWS = [
  { c: 'mood', label: 'Mood', score: 44, n: 9, miss: 5, conf: 'solid' },
  { c: 'psychosis', label: 'Psychosis', score: 91, n: 8, miss: 1, conf: 'solid' },
  { c: 'safety', label: 'Acute & Safety', score: 63, n: 1, miss: 0, conf: 'low' },
  { c: 'ethics', label: 'Ethics & Law', score: null, n: 0, miss: 0, conf: 'none' },
];

function build(over) {
  const o = Object.assign({ rows: ROWS, calPanel: '', cal: { total: 0, certWrong: 0,
    lv: { guess: { n: 0, correct: 0 }, likely: { n: 0, correct: 0 }, certain: { n: 0, correct: 0 } } } }, over);
  // eslint-disable-next-line no-new-func
  const factory = new Function('rows', 'calPanel', 'cal', `
    ${read('frontdoor/fd_data.js')}
    function fdReaderBackLabel(t){ return t==='library'?'Library':'Today'; }
    function fdReaderBackButton(l){ return '<button class="fd-reader__back" data-fd-back>‹ '+l+'</button>'; }
    function masteryByBlueprint(){ return rows; }
    function calibrationSummary(){ return cal; }
    function renderCalibPanel(){ return calPanel; }
    ${block}
    return fdProgress;
  `);
  return factory(o.rows, o.calPanel, o.cal);
}

const IDX = { byRef: { 'a.md': {}, 'b.md': {}, 't.html': {} } };
const st = (over) => Object.assign({ done: {}, fromTab: 'today', examDate: '' }, over);

// ---- the page ---------------------------------------------------------------------------

test('coverage counts the whole shipped index against the done map', () => {
  const html = build()(IDX, st({ done: { 'a.md': true, 'zz.md': true } }));
  assert.match(html, /1 of 3 shipped pages and tools marked done\./,
    'a done entry for something not in the index must not inflate the count');
});

test('mastery renders one bar per blueprint area, not-started included', () => {
  const html = build()(IDX, st({}));
  assert.equal((html.match(/class="fd-bar"/g) || []).length, 4);
  assert.match(html, /class="fd-bar__fill" style="width:44%"/);
  assert.match(html, /class="fd-bar__fill" style="width:0%"/, 'not started draws an empty track');
  assert.match(html, /class="fd-bar__value">not started</);
  assert.match(html, /63% · few</, 'a low-n score says so rather than reading as settled');
});

test('the empty state shows only before any practice exists', () => {
  assert.doesNotMatch(build()(IDX, st({})), /fd-progress__empty/);
  const blank = build({ rows: [{ c: 'mood', label: 'Mood', score: null, n: 0, miss: 0, conf: 'none' }] });
  assert.match(blank(IDX, st({})), /fd-progress__empty/);
});

test('weak areas require an actual wrong answer, worst first, capped at three', () => {
  // masteryByBlueprint's own shrinkage means a perfect 1/1 scores 63 — below 70. Without the
  // miss>0 clause a single correct answer in each area would flag all twelve as weak.
  const html = build()(IDX, st({}));
  assert.match(html, /data-fd-practice="mood"/);
  assert.doesNotMatch(html, /data-fd-practice="safety"/,
    'safety is 63% with zero misses — shrunk low because n is tiny, not because anything was missed');
  assert.doesNotMatch(html, /data-fd-practice="psychosis"/, '91% is not weak');
});

test('the weak-areas section is omitted entirely when nothing qualifies', () => {
  const strong = build({ rows: [{ c: 'mood', label: 'Mood', score: 88, n: 20, miss: 2, conf: 'solid' }] });
  assert.doesNotMatch(strong(IDX, st({})), /Practice your weakest areas/);
});

test('the calibration panel wins when the ledger is deep enough; the summary is the fallback', () => {
  const panel = build({ calPanel: '<div id="LEDGER"></div>' });
  assert.match(panel(IDX, st({})), /id="LEDGER"/);
  assert.doesNotMatch(panel(IDX, st({})), /Confidence calibration/,
    'the panel carries its own heading — printing both states the same thing twice');

  const fallback = build({ cal: { total: 6, certWrong: 2,
    lv: { guess: { n: 2, correct: 1 }, likely: { n: 2, correct: 1 }, certain: { n: 2, correct: 1 } } } });
  const html = fallback(IDX, st({}));
  assert.match(html, /Confidence calibration/);
  assert.match(html, /confidently wrong<\/strong> on 2 items/);
});

test('the calibration fallback is omitted when there is nothing recorded at all', () => {
  assert.doesNotMatch(build()(IDX, st({})), /Confidence calibration/);
});

// ---- the three orphans ------------------------------------------------------------------

test('window.exportStudy has a route again', () => {
  // Task 3 deliberately kept this alive rather than delete an anonymous, IRB-adjacent export
  // path — and it has had no caller since. This is the caller.
  assert.match(block, /data-fd-studyexport/);
  assert.match(wire, /window\.exportStudy\(\)/, 'fd_wire.js is what actually invokes it');
  assert.match(build()(IDX, st({})), /id="studyMsg"/,
    'exportStudy writes its confirmation into #studyMsg — without the element the click is silent');
});

test('the exam-date field is the only writer of cw_shelf_date in the build', () => {
  // fdExamCountdown() and phasePolicy() both PREFER this date over their rotation-grid fallback.
  // Between Task 3's deletion of the Start-here screen and this field there was no writer at all,
  // so the countdown ran on the fallback permanently, silently, with no test failing.
  assert.match(build()(IDX, st({})), /id="fdExamDate" type="date" data-fd-examdate/);
  const writers = [...shell.matchAll(/localStorage\.setItem\(\s*'cw_shelf_date'/g)].length
    + [...wire.matchAll(/localStorage\.setItem\(\s*'cw_shelf_date'/g)].length;
  assert.equal(writers, 1, 'exactly one writer — two would let the two disagree');
  assert.match(wire, /hasAttribute\('data-fd-examdate'\)/, 'and it is reached by a delegated change listener');
});

test('the stored date is reflected back into the field, escaped', () => {
  assert.match(build()(IDX, st({ examDate: '2026-09-18' })), /value="2026-09-18"/);
  assert.doesNotMatch(build()(IDX, st({ examDate: '"><script>x()</script>' })), /<script>/);
});

test('no rotation-START field sits beside it', () => {
  // cw_rotation_start is written only by fdSetRotationWeek(), which snaps to the Monday of the
  // chosen week. fd_state.js records that a non-Monday value makes the exam countdown drift
  // UPWARD as time passes — a free date input is exactly how one would get written.
  const html = build()(IDX, st({}));
  assert.equal((html.match(/type="date"/g) || []).length, 1, 'exactly one date field on the page');
  assert.doesNotMatch(html, /rotation start/i);
});

test('the A2HS offline instruction ships its copy byte-identical to the deleted line', () => {
  assert.match(build()(IDX, st({})),
    /<p class="fd-a2hs">On iPhone: Share ⬆ → Add to Home Screen keeps this site working offline\.<\/p>/);
});

// ---- routing and reachability ------------------------------------------------------------

test('Progress is a reading-pane route, not a fourth tab', () => {
  assert.match(wire, /var FD_REF_PROGRESS='__progress__';/);
  assert.match(wire, /if\(fdIsSpecialRef\(ref\)\) return 'special';/,
    "k:'special' is what keeps capCtx, the governance ledger and fdFetchBody away from it");
  assert.doesNotMatch(read('frontdoor/fd_shell.js'), /__progress__/,
    'the tab row must stay three tabs — spec §1 demotes this page deliberately');
});

test('Progress is reachable, and from the column a phone can see', () => {
  assert.match(today, /data-fd-open="__progress__"/);
  const main = today.slice(today.indexOf('fd-today__main'), today.indexOf('<aside class="fd-rail">'));
  assert.match(main, /fd-progresslink/,
    '.fd-rail is display:none below 1000px — an entry point only in the rail is no entry point');
});

// ---- copy and colour ----------------------------------------------------------------------

test('no rendered string carries an audience-specific token', () => {
  // The old renderProgress said "for the clerkship study". This page ships to BOTH sites without
  // passing through RESIDENT_REBRAND, so that wording could not be ported verbatim.
  const html = build({ cal: { total: 6, certWrong: 1,
    lv: { guess: { n: 2, correct: 1 }, likely: { n: 2, correct: 1 }, certain: { n: 2, correct: 1 } } } })(
    IDX, st({ examDate: '2026-09-18' }));
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

test('the Progress rules use tokens, never raw hex', () => {
  const rules = [...css.matchAll(/\.fd-(?:progress|bar|a2hs|due|capture)[a-z_-]*(?:__[a-z-]+)?[^{]*\{([^}]*)\}/g)]
    .map((m) => m[1]).join(';');
  assert.ok(rules.length > 0, 'sanity: expected the new rules to exist');
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b/i);
});
