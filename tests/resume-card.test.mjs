// Wiring + behavioural contract for the home "Resume question bank" row (Task 9): the qbank
// session capsule (cw_sess_v1) MERGES into the existing "Continue where you left off" section in
// renderHome (spa_index.html) rather than shipping as its own hm-sec — the binding decision
// documented in the phase-policy/capsule plan (renderHome crowding: a separate Resume section
// would be the 15th). This is spa_index.html's SECOND /*__SESS_CAPSULE__*/ consumer — the first
// (question-bank-practice.html, Task 8) is pinned by tests/sess-capsule.test.mjs. Mirrors the
// wiring-pin shape tests/phase-chip.test.mjs uses for spa_index.html's PHASE_POLICY wiring:
//   (a) the /*__SESS_CAPSULE__*/ marker appears exactly once in spa_index.html;
//   (b) spa_index.html does not reimplement `function sessLoad(` locally — the canonical body
//       lives in sess_capsule.js only, arriving via marker expansion at build time;
//   (c) the literal 'cw_sess_v1' key never appears hand-typed in spa_index.html's pre-build
//       source (present only after marker expansion into the BUILT output, checked elsewhere);
//   (d) the resume-row slice marker pair appears exactly once;
//   (e) behavioural coverage of the sliced resume-row fragment itself (same `new Function`
//       slicing technique tests/phase-chip.test.mjs and tests/calib-panel.test.mjs use): session
//       row present + ordered FIRST when both a live session and a last-page bookmark exist, page
//       row alone preserves the pre-existing baseline behaviour unchanged, absent when neither
//       exists, N/M math is pinned, and the deep-link mechanism (a plain `<a href="?tool=...">`,
//       NOT a `data-f` button) is pinned and documented.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const MARKER = '/*__SESS_CAPSULE__*/';
const ROW_START = '/* ---- resume row ---- */';
const ROW_END = '/* ---- end resume row ---- */';

const source = readFileSync(new URL(`../${SPA}`, import.meta.url), 'utf8');

function slice(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, b);
}

// ---- (a) marker present exactly once -------------------------------------------------

test('spa_index.html carries the SESS_CAPSULE marker exactly once', () => {
  const count = source.split(MARKER).length - 1;
  assert.equal(count, 1, `expected exactly one ${MARKER} in ${SPA}, found ${count}`);
});

// ---- (b) no local reimplementation of the canonical function -------------------------

test('spa_index.html does not reimplement sessLoad() locally', () => {
  assert.doesNotMatch(source, /function\s+sessLoad\s*\(/,
    'sessLoad must arrive only via the injected /*__SESS_CAPSULE__*/ marker');
});

// ---- (c) literal cw_sess_v1 absent from the pre-build source -------------------------

test("literal 'cw_sess_v1' is absent from spa_index.html's source (present only after marker expansion)", () => {
  assert.doesNotMatch(source, /(['"])cw_sess_v1\1/,
    'the cw_sess_v1 key must reach spa_index.html solely through the injected snippet body, '
    + 'never hand-typed in this consumer source');
});

// ---- (d) resume-row slice marker pair appears exactly once ---------------------------

test('the resume-row marker pair appears exactly once in spa_index.html', () => {
  const startCount = source.split(ROW_START).length - 1;
  const endCount = source.split(ROW_END).length - 1;
  assert.equal(startCount, 1, 'expected exactly one resume-row start marker');
  assert.equal(endCount, 1, 'expected exactly one resume-row end marker');
});

// ---- (e) behavioural coverage of the sliced resume-row fragment ----------------------

const rowCode = slice(source, ROW_START, ROW_END);

function buildRow(sessLoadStub, last, LAB) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('sessLoad', 'last', 'LAB', `
    var h = '';
    ${rowCode}
    return h;
  `);
  return fn(sessLoadStub, last === undefined ? null : last, LAB || {});
}

function fakeSession(queueLen, idx) {
  return { at: 0, expiresAt: 0, queueIds: new Array(queueLen).fill('id'), idx: idx, responses: [] };
}

test('neither a live session nor an eligible last page: the section renders nothing', () => {
  const html = buildRow(() => null, null, {});
  assert.equal(html, '');
});

test('page-only baseline is unchanged: same "Continue where you left off" markup as before the merge', () => {
  const html = buildRow(() => null, 'welcome.md', {});
  assert.equal(
    html,
    '<div class="hm-sec"><h2>Continue where you left off</h2>'
    + '<button class="hm-li" data-f="welcome.md"><span class="t">Resume your last page</span>'
    + '<span class="sec">Resume →</span></button></div>',
  );
});

test('a last page that resolves in LAB (a tool filename, not a content page) is still excluded, session absent', () => {
  const html = buildRow(() => null, 'question-bank-practice.html', { 'question-bank-practice.html': 'Practice Questions' });
  assert.equal(html, '', 'LAB[last]!==undefined must still suppress the page row, same as pre-merge');
});

test('session-only: renders the session row inside the SAME heading, no page row', () => {
  const html = buildRow(() => fakeSession(10, 3), null, {});
  assert.match(html, /<h2>Continue where you left off<\/h2>/);
  assert.match(html, /Resume question bank — 7 left, ~5 min/);
  assert.doesNotMatch(html, /Resume your last page/);
});

test('both exist: the session row is ordered FIRST, the page row SECOND, one heading only', () => {
  const html = buildRow(() => fakeSession(5, 2), 'welcome.md', {});
  const headingCount = (html.match(/<h2>Continue where you left off<\/h2>/g) || []).length;
  assert.equal(headingCount, 1, 'must not duplicate the section heading');
  const sessionIdx = html.indexOf('Resume question bank');
  const pageIdx = html.indexOf('Resume your last page');
  assert.ok(sessionIdx > -1 && pageIdx > -1, 'both rows must be present');
  assert.ok(sessionIdx < pageIdx, 'the session row (more perishable: 24h expiry + in-progress state) must render before the page-bookmark row');
});

// ---- N/M math pin: N = queueIds.length - idx; M = max(1, round(N * 45 / 60)) ---------

test('N/M math: 10-question queue at idx 3 -> 7 left, ~5 min', () => {
  const html = buildRow(() => fakeSession(10, 3), null, {});
  assert.match(html, /7 left, ~5 min/);
});

test('N/M math: 1 question left rounds up to a 1-minute floor (never ~0 min)', () => {
  const html = buildRow(() => fakeSession(4, 3), null, {});
  assert.match(html, /1 left, ~1 min/);
});

test('N/M math: 8 questions left -> ~6 min', () => {
  const html = buildRow(() => fakeSession(8, 0), null, {});
  assert.match(html, /8 left, ~6 min/);
});

// ---- deep-link mechanism pin ----------------------------------------------------------
//
// navClick(f) resolves a NAV ITEM by an EXACT `.navitem[data-f="f"]` match against nav.json
// filenames (spa_index.html, ~line 1374) — a query-suffixed data-f value like
// "question-bank-practice.html?resume=1" can never match one of those, so the session row
// cannot use the button/data-f/navClick path the page row uses. Instead it reuses the plain
// `<a class="hm-li" href="?tool=...">` pattern actionRow()/communicationHref() already ship
// elsewhere on this page: that href already flows through contentEl's existing a[href] click
// delegate (the `[?&](page|tool)=` regex branch), which calls toolExtraFromParams() to carry
// `resume=1` through as show()'s toolExtra and onto the iframe src — zero new delegation
// branches, per the #323 constraint.

test('the session row deep-links via a plain href, not a data-f button', () => {
  const html = buildRow(() => fakeSession(10, 3), null, {});
  const anchorMatch = html.match(/<a class="hm-li" href="([^"]*)">/);
  assert.ok(anchorMatch, 'expected an <a class="hm-li" href="..."> element for the session row');
  assert.equal(anchorMatch[1], '?tool=question-bank-practice.html&resume=1');
  assert.doesNotMatch(html, /<a class="hm-li"[^>]*data-f=/,
    'the session row anchor must not carry a data-f attribute — that would additionally route '
    + "through the .hm-li[data-f] -> navClick() branch and double-open the tool (once via "
    + 'navClick without resume=1, once via the href with it)');
});

test('the page row keeps its original button/data-f mechanism (navClick), untouched by the merge', () => {
  const html = buildRow(() => null, 'welcome.md', {});
  assert.match(html, /<button class="hm-li" data-f="welcome\.md">/);
});

// ---- malformed-capsule guard --------------------------------------------------------
//
// sessLoad() only validates expiresAt (pruning an expired/malformed-expiry entry) — it does
// not validate queueIds/idx shape. Today's only writer (checkpointSession() in
// question-bank-practice.html) always produces a well-formed {queueIds:[...], idx:number}
// pair, so this is latent, not active. But renderHome's four call sites are not
// try/catch-wrapped, so an unguarded `sess.queueIds.length` on a malformed record (a manually
// edited localStorage value, a future writer bug, etc.) would throw and blank the WHOLE home
// page, not just this row. tryResumeSession() (question-bank-practice.html) already guards
// exactly this shape (`!cap.queueIds` / non-numeric idx defaults) — the row must mirror it:
// treat a malformed session as if sessLoad had returned null.

test('malformed capsule (queueIds missing/not-an-array) does not throw and the row falls back to absent', () => {
  const bad = { at: 0, expiresAt: 0, idx: 0, responses: [] }; // no queueIds at all
  assert.doesNotThrow(() => buildRow(() => bad, null, {}));
  const html = buildRow(() => bad, null, {});
  assert.equal(html, '', 'a malformed session must be treated as absent, not crash renderHome');
});

test('malformed capsule (non-numeric idx) does not throw and the row falls back to absent', () => {
  const bad = { at: 0, expiresAt: 0, queueIds: ['a', 'b', 'c'], idx: 'oops', responses: [] };
  assert.doesNotThrow(() => buildRow(() => bad, null, {}));
  const html = buildRow(() => bad, null, {});
  assert.equal(html, '', 'a non-numeric idx must be treated as absent, not crash renderHome');
});

test('a malformed session still lets the page row render on its own (both||one-bad guard composes correctly)', () => {
  const bad = { at: 0, expiresAt: 0, queueIds: 'not-an-array', idx: 0, responses: [] };
  const html = buildRow(() => bad, 'welcome.md', {});
  assert.equal(
    html,
    '<div class="hm-sec"><h2>Continue where you left off</h2>'
    + '<button class="hm-li" data-f="welcome.md"><span class="t">Resume your last page</span>'
    + '<span class="sec">Resume →</span></button></div>',
    'malformed session must not suppress a legitimate page row, and must not leak session markup',
  );
});
