// Contract for the Path renderer. Evaluates the real snippet body via new Function, following
// tests/fd-data.test.mjs, tests/fd-shell.test.mjs, tests/fd-today.test.mjs. Concatenated in the
// same dependency order inject_shared_snippets() uses on the built page: phase_policy.js ->
// fd_state.js -> fd_data.js (the join layer) -> fd_today.js (fdTodayProgress, which fd_path.js's
// dot state must derive from) -> fd_path.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const pathSrc = read('frontdoor/fd_path.js');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_today.js')}
  ${pathSrc}
  return { fdPath: fdPath, fdBuildIndex: fdBuildIndex, fdItemsForWeek: fdItemsForWeek,
           fdTodayProgress: fdTodayProgress };
`);
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// ---- fixture: six real weeks, one or two items each ----------------------------------

const WEEK_DEFS = [
  { n: 1, title: 'Foundations', theme: 'Orientation', refs: [['w1a.md', 'read']] },
  { n: 2, title: 'Week Two', theme: 'T2', refs: [['w2a.md', 'read']] },
  { n: 3, title: 'Week Three', theme: 'T3', refs: [['w3a.md', 'read']] },
  { n: 4, title: 'Week Four', theme: 'T4', refs: [['w4a.md', 'read']] },
  { n: 5, title: 'Week Five', theme: 'T5', refs: [['w5a.md', 'read'], ['w5b.html', 'tool']] },
  { n: 6, title: 'Week Six', theme: 'T6', refs: [['w6a.md', 'read']] },
];

function buildCurriculum(weekDefs) {
  return {
    weeks: weekDefs.map((w) => ({
      n: w.n, title: w.title, theme: w.theme,
      items: w.refs.map(([ref, kind]) => ({ ref, kind })),
    })),
    libraryColumns: [], libraryExclude: [], safetyKit: [],
    roles: { ms3: [], resident: [] }, synonyms: {},
  };
}

function buildManifest(weekDefs) {
  const md = [], tools = [];
  for (const w of weekDefs) {
    for (const [ref] of w.refs) {
      const title = 'Title ' + ref;
      if (/\.html$/.test(ref)) tools.push(['src/' + ref, ref, title]);
      else md.push(['src/' + ref, ref, title]);
    }
  }
  return { tools, md };
}

const FIX_CUR = buildCurriculum(WEEK_DEFS);
const FIX_META = {};
const FIX_TOOLS = { tools: [{ file: 'w5b.html', title: 'Title w5b.html', category: 'acute-safety', riskLevel: 'moderate' }] };
const FIX_MAN = buildManifest(WEEK_DEFS);
const IDX = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
const FOUR_INDEX = F.fdBuildIndex(buildCurriculum(WEEK_DEFS.slice(0, 4)), FIX_META, FIX_TOOLS,
  buildManifest(WEEK_DEFS.slice(0, 4)));

const BASE_STATE = { week: 2, viewWeek: 2, done: {} };
const s = (over) => Object.assign({}, BASE_STATE, over);

// Row extraction: each timeline row is exactly one <button>...spans...</button> with no nested
// button, so a non-greedy match up to the first </button> after the data-fd-view-week attribute
// safely captures just that row.
function rowFor(html, n) {
  const m = html.match(new RegExp('<button type="button" class="([^"]*)" data-fd-view-week="' + n + '">([\\s\\S]*?)</button>'));
  if (!m) throw new Error('no timeline row for week ' + n);
  return { cls: m[1], body: m[2] };
}

// ---- six rows, always, line included on every one -------------------------------------

test('all six timeline rows render, each carrying its connector line (including the last)', () => {
  const html = F.fdPath(IDX, s({}));
  const rows = html.match(/<button type="button" class="fd-timeline__row/g) || [];
  assert.equal(rows.length, 6);
  const lines = html.match(/class="fd-timeline__line"/g) || [];
  assert.equal(lines.length, 6, '.fd-timeline__line must be emitted on every row, last included');
  for (let n = 1; n <= 6; n++) assert.ok(rowFor(html, n), 'row ' + n + ' must be findable');
});

test('Path emits view-week actions only, reserving setup-week for setup', () => {
  const html = F.fdPath(IDX, s({}));
  assert.equal((html.match(/data-fd-view-week=/g) || []).length, 6);
  assert.doesNotMatch(html, /data-fd-week=/);
});

test('Path renders the projected path length and falls back only to an actual first week', () => {
  const fourHtml = F.fdPath(FOUR_INDEX, { week: 2, viewWeek: 2, done: {} });
  assert.match(fourHtml, /<h1 class="fd-path__h1">Your 4-week path<\/h1>/);
  assert.equal((fourHtml.match(/data-fd-view-week=/g) || []).length, 4);
  const invalid = F.fdPath(FOUR_INDEX, { week: 2, viewWeek: 99, done: {} });
  assert.match(invalid, /<span class="fd-eyebrow">Week 1<\/span>/);
  assert.doesNotMatch(invalid, /Week 99/);
  const empty = F.fdPath({ path: { id: '', weekCount: 0 }, weeks: [] },
    { week: null, viewWeek: null, done: {} });
  assert.match(empty, /class="fd-fallback"[^>]*role="alert"/);
});

// ---- dot state: is-current only on state.week; is-done only when actually complete ----

test('the current week gets is-current; a later week finished out of order still gets is-done', () => {
  // week 2 is current and incomplete; week 1 is complete and earlier; week 4 is complete and
  // LATER than the current week, finished before week 3 -- the dot must not care about order.
  const html = F.fdPath(IDX, s({ week: 2, viewWeek: 2, done: { 'w1a.md': true, 'w4a.md': true } }));
  assert.equal(rowFor(html, 1).cls, 'fd-timeline__row');
  assert.match(rowFor(html, 1).body, /class="fd-dot is-done"/);
  assert.equal(rowFor(html, 2).cls, 'fd-timeline__row is-sel');
  assert.match(rowFor(html, 2).body, /class="fd-dot is-current"/);
  assert.match(rowFor(html, 3).body, /class="fd-dot"><\/span>/, 'week 3 is untouched: bare dot');
  assert.match(rowFor(html, 4).body, /class="fd-dot is-done"/, 'week 4 finished ahead of week 3');
});

test('an incomplete week never gets is-done even with some items checked off', () => {
  const html = F.fdPath(IDX, s({ week: 2, viewWeek: 2, done: { 'w5a.md': true } }));
  assert.match(rowFor(html, 5).body, /class="fd-dot"><\/span>/);
});

test('a week with zero items is never marked done', () => {
  const emptyCur = buildCurriculum(WEEK_DEFS.map((w) => (w.n === 6 ? Object.assign({}, w, { refs: [] }) : w)));
  const idx = F.fdBuildIndex(emptyCur, FIX_META, FIX_TOOLS, FIX_MAN);
  const html = F.fdPath(idx, s({ week: 2, viewWeek: 2, done: {} }));
  assert.match(rowFor(html, 6).body, /class="fd-dot"><\/span>/);
  assert.match(rowFor(html, 6).body, /0\/0/);
});

// ---- selection is viewWeek, not week ---------------------------------------------------

test('the selected (is-sel) row is viewWeek, not week', () => {
  const html = F.fdPath(IDX, s({ week: 2, viewWeek: 5 }));
  assert.equal(rowFor(html, 5).cls, 'fd-timeline__row is-sel', 'viewWeek 5 is selected');
  assert.equal(rowFor(html, 2).cls, 'fd-timeline__row', 'week 2 (current, but not viewed) is not selected');
  // current-ness (is-current) still tracks state.week even while browsing elsewhere.
  assert.match(rowFor(html, 2).body, /class="fd-dot is-current"/);
});

// ---- per-week counts read d/t -----------------------------------------------------------

test('per-week counts render as done/total', () => {
  const html = F.fdPath(IDX, s({ week: 2, viewWeek: 2, done: { 'w5a.md': true } }));
  assert.match(rowFor(html, 5).body, /<span class="fd-timeline__count">1\/2<\/span>/);
  assert.match(rowFor(html, 1).body, /<span class="fd-timeline__count">0\/1<\/span>/);
});

// ---- detail card: "you are here" only for the current week ----------------------------

test('the detail card shows "you are here" only when viewing the current week', () => {
  const onCurrent = F.fdPath(IDX, s({ week: 2, viewWeek: 2 }));
  assert.match(onCurrent, /class="fd-detail__here">you are here</);
  const elsewhere = F.fdPath(IDX, s({ week: 2, viewWeek: 4 }));
  assert.doesNotMatch(elsewhere, /fd-detail__here/);
});

// ---- detail rows inherit fd_today.js's fdRow, a11y treatment included ------------------
//
// fd_path.js renders its detail list through fdRow(compact=true) rather than keeping a second
// copy of the row markup, so the ✓-must-not-lie fix (aria-hidden glyph, state on the button via
// aria-pressed) arrives here for free. Pinned on THIS surface too: a future edit that forks the
// row again would otherwise reintroduce the defect on Path alone, silently.

test('a detail row hides its ✓ from assistive tech and carries the state on the button', () => {
  const html = F.fdPath(IDX, s({ week: 5, viewWeek: 5, done: { 'w5a.md': true } }));
  assert.match(html, /class="fd-check is-done" data-fd-toggle="w5a\.md" title="Mark done" aria-pressed="true">/);
  assert.match(html, /class="fd-check" data-fd-toggle="w5b\.html" title="Mark done" aria-pressed="false">/);

  const glyphs = (html.match(/✓/g) || []).length;
  assert.equal(glyphs, 2, 'one per detail row of the viewed week');
  assert.equal((html.match(/<span aria-hidden="true">✓<\/span>/g) || []).length, glyphs,
    'no bare ✓ may survive -- it announces an undone item as done');
});

test('aria-pressed tracks the done map in both directions on the detail card', () => {
  const none = F.fdPath(IDX, s({ week: 5, viewWeek: 5, done: {} }));
  assert.equal((none.match(/aria-pressed="false"/g) || []).length, 2);
  assert.doesNotMatch(none, /aria-pressed="true"/);

  const all = F.fdPath(IDX, s({ week: 5, viewWeek: 5, done: { 'w5a.md': true, 'w5b.html': true } }));
  assert.equal((all.match(/aria-pressed="true"/g) || []).length, 2);
  assert.doesNotMatch(all, /aria-pressed="false"/);
});

test('the rows really are the compact variant of the shared row, not a fork', () => {
  const html = F.fdPath(IDX, s({ week: 5, viewWeek: 5, done: {} }));
  assert.match(html, /class="fd-row is-compact"/);
});

// ---- "Set as my week" only when viewWeek !== week --------------------------------------

test('"Set as my week" appears only when browsing away from the current week, and carries data-fd-setweek', () => {
  const onCurrent = F.fdPath(IDX, s({ week: 2, viewWeek: 2 }));
  assert.doesNotMatch(onCurrent, /data-fd-setweek/);
  const elsewhere = F.fdPath(IDX, s({ week: 2, viewWeek: 5 }));
  assert.match(elsewhere, /<button type="button" class="fd-btn fd-btn--accent" data-fd-setweek="5">Set as my week<\/button>/);
});

// ---- no week set: nothing may claim to be current ---------------------------------------

test('with no week set, no row and no pill claims "you are here", but browsing still works', () => {
  const html = F.fdPath(IDX, s({ week: null, viewWeek: 3 }));
  assert.doesNotMatch(html, /is-current/);
  assert.doesNotMatch(html, /you are here/);
  for (let n = 1; n <= 6; n++) {
    assert.doesNotMatch(rowFor(html, n).body, /is-current/);
  }
  // Set as my week must still work with no week set -- that is how one gets set.
  assert.match(html, /data-fd-setweek="3"/);
});

// ---- escaping ----------------------------------------------------------------------------

test('week titles and item titles are escaped', () => {
  const evilCur = JSON.parse(JSON.stringify(FIX_CUR));
  evilCur.weeks[0].title = '<script>alert(1)</script>';
  const evilMan = {
    tools: FIX_MAN.tools,
    md: FIX_MAN.md.map((row) => (row[1] === 'w1a.md' ? [row[0], row[1], '<img src=x onerror=1>'] : row)),
  };
  const evilIdx = F.fdBuildIndex(evilCur, FIX_META, FIX_TOOLS, evilMan);
  const html = F.fdPath(evilIdx, s({ week: 1, viewWeek: 1 }));
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
});

// ---- purity / audience-neutral ------------------------------------------------------------

test('fd_path.js touches no DOM, storage, or clock', () => {
  assert.doesNotMatch(pathSrc, /localStorage\.|document\.|window\.|Date\.now\(\)/,
    'fd_path.js must stay a pure function of (index, state)');
});

test('no rendered output carries an audience-specific token', () => {
  const html = F.fdPath(IDX, s({ week: 2, viewWeek: 2 }))
    + F.fdPath(IDX, s({ week: null, viewWeek: 3 }))
    + F.fdPath(IDX, s({ week: 2, viewWeek: 5 }));
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});
