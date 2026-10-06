// Contract for the Library renderer (one-thread redesign, Phase 2 -- spec
// docs/superpowers/specs/one-thread-handoff/README.md section 2). Evaluates the real snippet body
// via new Function, following tests/fd-data.test.mjs, tests/fd-path.test.mjs. Concatenated in the
// same dependency order inject_shared_snippets() uses on the built page: phase_policy.js ->
// fd_state.js -> fd_data.js (the join layer fd_library.js's fdBuildIndex comes from) -> fd_library.js.
//
// The Library is the only browse surface. A page missing from Everything is unreachable except by
// search, so the inventory assertions against the REAL projected curriculum (not a fixture) are the
// load-bearing tests here -- they fail if a page silently stops being placed in a column.
//
// Governance branches (pending / high-risk / reviewed) are pinned with inline fixtures, never with
// the live ledger (#729): the real-data tests derive their pending count from the same index they
// render and compare the two, so they stay green whatever faculty attest tomorrow.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const librarySrc = read('frontdoor/fd_library.js');

// The shared badge exactly as spa_index.html emits it (surface-governance-ui.test.mjs pins the
// source); tests that need to count calls pass their own.
function realBadge(triplet, opts) {
  if (!triplet || triplet.status !== 'pending') return '';
  if (opts && opts.compact) return '<span class="fd-kit__pending" role="img" aria-label="Awaiting faculty re-review"></span>';
  const high = triplet.riskLevel === 'high';
  const label = high ? 'Pending review · High risk' : 'Pending review';
  return '<span class="governance-badge' + (high ? ' high' : '') + '" aria-label="' + label + '">' + label + '</span>';
}

function make(governanceBadge) {
  // eslint-disable-next-line no-new-func
  return new Function('governanceBadge', `
    ${read('phase_policy.js')}
    ${read('frontdoor/fd_state.js')}
    ${read('frontdoor/fd_data.js')}
    ${librarySrc}
    return { fdLibrary: fdLibrary, fdEssentials: fdEssentials, fdBuildIndex: fdBuildIndex,
      fdUsedIn: fdUsedIn, fdPracticeWith: fdPracticeWith, fdLibraryMark: fdLibraryMark };
  `)(governanceBadge || realBadge);
}
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// ---- fixture: five columns, distinct accents, out of alphabetical order ----------------
//
// Two refs are deliberately misplaced relative to their column's accent -- 'mismatch-read.md'
// sits in the tool-accent column, 'mismatch-tool.html' sits in a topic-accent column. kind is
// derived per-item by fd_data.js from the ref's own extension (fdIsTool), independent of which
// column holds it, so these two prove the tool chip follows the ITEM, not the column.
const FIX_CUR = {
  weeks: [{ n: 1, title: 'W1', theme: 'T1', items: [] }, { n: 2, title: 'W2', theme: 'T2', items: [] },
          { n: 3, title: 'W3', theme: 'T3', items: [] }, { n: 4, title: 'W4', theme: 'T4', items: [] },
          { n: 5, title: 'W5', theme: 'T5', items: [] }, { n: 6, title: 'W6', theme: 'T6', items: [] }],
  libraryColumns: [
    { name: 'Zebra tools', accent: 'tool', refs: ['t1.html', 't2.html', 'mismatch-read.md'] },
    { name: 'Acute stuff', accent: 'safety', refs: ['s1.md'] },
    { name: 'Middle topics', accent: 'topic', refs: ['m1.md', 'm2.md', 'm3.md', 'mismatch-tool.html'] },
    { name: 'Another topic col', accent: 'topic', refs: ['n1.md'] },
    { name: 'Last col', accent: 'topic', refs: ['l1.md'] },
  ],
  libraryExclude: [],
  safetyKit: [],
  roles: { ms3: [], resident: [] },
  synonyms: {},
};
const FIX_META = {};
const FIX_TOOLS = { tools: [
  { file: 't1.html', title: 'Tool One', category: 'acute-safety', riskLevel: 'low' },
  { file: 't2.html', title: 'Tool Two', category: 'clinical-skills', riskLevel: 'low' },
  { file: 'mismatch-tool.html', title: 'Misplaced Tool', category: 'clinical-skills', riskLevel: 'low' },
] };
const FIX_MAN = {
  tools: [['src/t1.html', 't1.html', 'Tool One'], ['src/t2.html', 't2.html', 'Tool Two'],
          ['src/mismatch-tool.html', 'mismatch-tool.html', 'Misplaced Tool']],
  md: [['src/s1.md', 's1.md', 'Safety One'], ['src/m1.md', 'm1.md', 'Middle One'],
       ['src/m2.md', 'm2.md', 'Middle Two'], ['src/m3.md', 'm3.md', 'Middle Three'],
       ['src/n1.md', 'n1.md', 'Another One'], ['src/l1.md', 'l1.md', 'Last One'],
       ['src/mismatch-read.md', 'mismatch-read.md', 'Misplaced Read']],
};
const IDX = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);

const renderedRefs = (html, cls) => [...html.matchAll(new RegExp('class="' + cls + '" data-fd-open="([^"]+)"', 'g'))].map((m) => m[1]);
const everythingRefs = (html) => renderedRefs(html, 'fd-collink');
const essentialsRefs = (html) => renderedRefs(html, 'fd-kit__reading');
const status = (html) => html.match(/<p class="fd-library__status" role="status" aria-live="polite">([^<]*)<\/p>/)[1];
const groupHeadings = (html) => [...html.matchAll(/<span class="fd-kit__group-name">([^<]*)<\/span><span class="fd-kit__group-count">· (\d+)<\/span>/g)].map((m) => [m[1], Number(m[2])]);
const row = (html, ref) => {
  const m = html.match(new RegExp('<div class="fd-kit__item[^"]*">\\s*<button type="button" class="(?:fd-collink|fd-kit__reading)" data-fd-open="' + ref.replace(/\./g, '\\.') + '">[\\s\\S]*?</button>'));
  assert.ok(m, `no rendered row for ${ref}`);
  return m[0];
};

// ---- Everything: one shell, every placed page once, in curriculum.json order -----------------

test('Everything renders every column as an open group "Name · count", in curriculum.json order', () => {
  const html = F.fdLibrary(IDX);
  assert.match(html, /^<section class="fd-library">/);
  assert.match(html, /<h1 class="fd-library__h1">Library<\/h1>/);
  assert.match(html, /<p class="fd-library__lede">Everything the rotation uses\. Essentials is the short list; Everything is the full catalogue\.<\/p>/);
  assert.deepEqual(groupHeadings(html), [['Zebra tools', 3], ['Acute stuff', 1], ['Middle topics', 4], ['Another topic col', 1], ['Last col', 1]]);
  assert.equal((html.match(/<details class="fd-kit__group" open>/g) || []).length, 5, 'every group starts open');
  assert.equal(status(html), 'Showing all 10 pages.');
});

test('every placed page renders exactly one Everything row, as data-fd-open -- no second attribute name invented', () => {
  const html = F.fdLibrary(IDX);
  const refs = everythingRefs(html);
  assert.deepEqual(refs, FIX_CUR.libraryColumns.flatMap((c) => c.refs));
  assert.equal(new Set(refs).size, refs.length);
  assert.doesNotMatch(html, /data-fd-item=|data-fd-link=/);
  assert.doesNotMatch(html, /fd-kit__peek/, 'Everything has no preview pane and so no Preview controls');
  assert.doesNotMatch(html, /fd-kit__tool-preview/);
});

test('the tool chip follows the ITEM\'s kind, not the column; a rights reference reads "reference"', () => {
  const cur = structuredClone(FIX_CUR);
  cur.rightsReferences = ['t2.html'];
  const html = F.fdLibrary(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN));
  assert.match(row(html, 'mismatch-tool.html'), /<span class="fd-chip is-tool">tool<\/span>/, 'a .html tool in a topic column keeps its chip');
  assert.doesNotMatch(row(html, 'mismatch-read.md'), /fd-chip/, 'a .md read in the tool column gets none');
  assert.match(row(html, 't2.html'), /<span class="fd-chip is-tool">reference<\/span>/);
  assert.match(row(html, 't2.html'), /<span class="fd-kit__meta">Reference<\/span>/);
  assert.match(row(html, 't1.html'), /<span class="fd-kit__meta">Tool<\/span>/);
  assert.match(row(html, 's1.md'), /<span class="fd-kit__meta">Reading<\/span>/);
});

test('Everything rows carry the hint verbatim as the row text; a row without one renders no text span', () => {
  const cur = structuredClone(FIX_CUR);
  cur.libraryHints = { 't1.html': 'Build a written exam from a descriptor bank.' };
  const html = F.fdLibrary(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN));
  assert.match(row(html, 't1.html'), /<span class="fd-collink__label">Tool One<\/span><span class="fd-chip is-tool">tool<\/span><\/span><span class="fd-kit__summary">Build a written exam from a descriptor bank\.<\/span>/);
  assert.doesNotMatch(row(html, 't2.html'), /fd-kit__summary/, 'no hint, no span — not an empty one');
});

// ---- governance: the FULL badge, verbatim, on every row it applies to (both views) -----------

test('pending and high-risk badges appear verbatim on every applicable row in both views, after the name', () => {
  const calls = [];
  const G = make((triplet, opts) => { calls.push([triplet, opts]); return realBadge(triplet, opts); });
  const manifest = structuredClone(FIX_MAN);
  manifest.tools[0].push({ status: 'pending', riskKind: 'clinical', riskLevel: 'high' });
  manifest.tools[1].push({ status: 'pending', riskKind: 'general', riskLevel: 'low' });
  manifest.md.find((e) => e[1] === 'mismatch-read.md').push({ status: 'reviewed', riskKind: 'general', riskLevel: 'low' });
  manifest.md.find((e) => e[1] === 'm1.md').push({ status: 'pending', riskKind: 'general', riskLevel: 'low' });
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 't1.html', 't2.html', 'mismatch-read.md'] }];
  const idx = G.fdBuildIndex(cur, FIX_META, FIX_TOOLS, manifest);

  const full = G.fdLibrary(idx);
  assert.match(row(full, 't1.html'), /<span class="fd-collink__label">Tool One<\/span><span class="fd-chip is-tool">tool<\/span><span class="governance-badge high" aria-label="Pending review · High risk">Pending review · High risk<\/span>/);
  assert.match(row(full, 't2.html'), /<span class="fd-collink__label">Tool Two<\/span><span class="fd-chip is-tool">tool<\/span><span class="governance-badge" aria-label="Pending review">Pending review<\/span>/);
  assert.match(row(full, 'm1.md'), /<span class="fd-collink__label">Middle One<\/span><span class="governance-badge" aria-label="Pending review">Pending review<\/span>/);
  assert.doesNotMatch(row(full, 'mismatch-read.md'), /governance-badge/);
  assert.equal((full.match(/governance-badge/g) || []).length, 3, 'three pending pages, three badges');

  const kit = G.fdEssentials(idx);
  assert.match(row(kit, 'm1.md'), /<span class="fd-kit__title">Middle One<\/span><span class="governance-badge" aria-label="Pending review">Pending review<\/span>/);
  assert.match(row(kit, 't1.html'), /governance-badge high" aria-label="Pending review · High risk">Pending review · High risk</);
  assert.doesNotMatch(kit, /fd-kit__pending/, 'the compact dot form is gone from the Library');
  assert.ok(calls.every(([, opts]) => !opts || !opts.compact), 'the badge helper is never asked for its compact form');
  // The review banner counts pending READINGS: m1.md of the two readings in the kit.
  assert.match(kit, /<div class="fd-kit__review"><span>Faculty re-review in progress — 1 of 2 readings changed since they were last attested ·<\/span> <details><summary>What that means<\/summary>/);
  assert.match(full, /Faculty re-review in progress — 1 of 7 readings changed since they were last attested ·/);
});

test('summaries are byte-identical to topic_meta tldr (escaped only), and a filter adds tags without changing characters', () => {
  const meta = { 'm1.md': { read: 5, tldr: 'Use the interview as a "circle" & keep <safety> first — 100% verbatim.' } };
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md'] }];
  const idx = F.fdBuildIndex(cur, meta, FIX_TOOLS, FIX_MAN);
  const expected = 'Use the interview as a &quot;circle&quot; &amp; keep &lt;safety&gt; first — 100% verbatim.';
  assert.match(row(F.fdEssentials(idx), 'm1.md'), new RegExp('<span class="fd-kit__summary">' + expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</span>'));
  // Highlighting: the title gets <mark>; the summary text is unchanged.
  const filtered = F.fdEssentials(idx, { filter: 'middle' });
  assert.match(row(filtered, 'm1.md'), /<span class="fd-kit__title"><mark>Middle<\/mark> One<\/span>/);
  assert.match(row(filtered, 'm1.md'), new RegExp('<span class="fd-kit__summary">' + expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</span>'));
  assert.equal(F.fdLibraryMark('a <b> & "c"', ''), 'a &lt;b&gt; &amp; &quot;c&quot;');
  assert.equal(F.fdLibraryMark('Family & Discharge', 'family'), '<mark>Family</mark> &amp; Discharge');
  assert.equal(F.fdLibraryMark('a<b>a', 'a'), '<mark>a</mark>&lt;b&gt;<mark>a</mark>', 'every occurrence, segments escaped');
});

// ---- controls: segmented control with live counts, filter field, visible status line ----------

test('the segmented control carries live totals for both views and aria-pressed selection', () => {
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 't1.html'] }];
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  const kit = F.fdEssentials(idx), full = F.fdLibrary(idx);
  assert.match(kit, /<nav class="fd-library__views" aria-label="Library views"><button type="button" class="fd-library__view is-active" data-fd-library-view="essentials" aria-pressed="true">Essentials<span class="fd-library__view-count"> · 2<\/span><\/button><button type="button" class="fd-library__view" data-fd-library-view="full" aria-pressed="false">Everything<span class="fd-library__view-count"> · 10<\/span><\/button><\/nav>/);
  assert.match(full, /data-fd-library-view="essentials" aria-pressed="false">Essentials<span class="fd-library__view-count"> · 2<\/span>/);
  assert.match(full, /class="fd-library__view is-active" data-fd-library-view="full" aria-pressed="true">Everything<span class="fd-library__view-count"> · 10<\/span>/);
  // Counts are totals, never filtered.
  assert.match(F.fdLibrary(idx, { filter: 'zzz' }), /Everything<span class="fd-library__view-count"> · 10<\/span>/);
});

test('the filter field: placeholder, "/" chip without a query, Clear with one, value round-tripped and escaped', () => {
  const empty = F.fdLibrary(IDX);
  assert.match(empty, /<div class="fd-library__filter" role="search"><svg[^>]*aria-hidden="true">[\s\S]*?<\/svg><input type="text" class="fd-library__filter-input" data-fd-library-filter value="" aria-label="Filter the Library by title or topic" placeholder="Filter by title or topic — e.g. delirium, family meeting" autocomplete="off" spellcheck="false"><span class="fd-kbd fd-library__filter-key" aria-hidden="true">\/<\/span><\/div>/);
  assert.doesNotMatch(empty, /data-fd-library-filter-clear/);
  const typed = F.fdLibrary(IDX, { filter: 'one "x"' });
  assert.match(typed, /value="one &quot;x&quot;"/);
  assert.match(typed, /<button type="button" class="fd-library__filter-clear" data-fd-library-filter-clear>Clear<\/button>/);
  assert.doesNotMatch(typed, /fd-library__filter-key/);
});

test('the status line is a visible role="status" paragraph reusing the existing strings', () => {
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 'm2.md', 't1.html'] }, { name: 'Other', accent: 'topic', refs: ['s1.md'] }];
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(status(F.fdEssentials(idx)), 'Showing all 4 Essentials items.');
  assert.equal(status(F.fdEssentials(idx, { kitSection: '0' })), 'Showing 2 readings in Kit.');
  assert.equal(status(F.fdEssentials(idx, { kitSection: 'tools' })), 'Showing 1 tools.');
  assert.equal(status(F.fdLibrary(idx)), 'Showing all 10 pages.');
  assert.equal(status(F.fdLibrary(idx, { kitSection: '2' })), 'Showing 4 pages in Middle topics.');
  assert.doesNotMatch(F.fdEssentials(idx), /fd-visually-hidden" role="status"/, 'the status line is no longer hidden');
});

// ---- filter: titles and hints in the current view, N of M, zero results -> Search ---------------

test('the filter matches titles and hints in the current view only, highlights with <mark> and announces N of M', () => {
  const cur = structuredClone(FIX_CUR);
  cur.libraryHints = { 't1.html': 'Draft the mental status exam.', 't2.html': 'Compare two weeks.' };
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 'm2.md', 't1.html'] }];
  const idx = F.fdBuildIndex(cur, { 'm2.md': { tldr: 'The word Middle appears in prose only.' } }, FIX_TOOLS, FIX_MAN);
  // Everything: "one" matches Tool One, Safety One, Middle One, Another One, Last One by title.
  const full = F.fdLibrary(idx, { filter: 'one' });
  assert.deepEqual(everythingRefs(full), ['t1.html', 's1.md', 'm1.md', 'n1.md', 'l1.md']);
  assert.equal(status(full), '5 of 10 pages match “one”.');
  assert.deepEqual(groupHeadings(full), [['Zebra tools', 1], ['Acute stuff', 1], ['Middle topics', 1], ['Another topic col', 1], ['Last col', 1]], 'groups without a match are omitted, counts are matches');
  assert.match(row(full, 'm1.md'), /<span class="fd-collink__label">Middle <mark>One<\/mark><\/span>/);
  // A hint match (Everything shows hints as row text): "mental status" finds Tool One through its hint.
  const hint = F.fdLibrary(idx, { filter: 'mental status' });
  assert.deepEqual(everythingRefs(hint), ['t1.html']);
  assert.match(row(hint, 't1.html'), /<span class="fd-kit__summary">Draft the <mark>mental status<\/mark> exam\.<\/span>/);
  // A summary-only word does not match: summaries are prose, not navigation.
  assert.equal(status(F.fdEssentials(idx, { filter: 'prose' })), 'No titles match “prose”.');
  // Essentials scopes to its own items: "one" is Middle One and Tool One here.
  const kit = F.fdEssentials(idx, { filter: 'one' });
  assert.deepEqual(essentialsRefs(kit), ['m1.md', 't1.html']);
  assert.equal(status(kit), '2 of 3 items match “one”.');
  // Within a section, M is the section's total.
  assert.equal(status(F.fdEssentials(idx, { kitSection: 'tools', filter: 'one' })), '1 of 1 items match “one”.');
  // Case-insensitive, whitespace-collapsed; the index counts matches per section while filtering.
  assert.equal(status(F.fdLibrary(idx, { filter: '  MIDDLE   one ' })), '1 of 10 pages match “MIDDLE one”.');
  assert.match(F.fdLibrary(idx, { filter: 'one' }), /data-fd-kit-section="all" aria-pressed="true"><span>All<\/span><span class="fd-kit__index-count">5<\/span>/);
  assert.match(F.fdLibrary(idx, { filter: 'one' }), /data-fd-kit-section="2" aria-pressed="false"><span>Middle topics<\/span><span class="fd-kit__index-count">1<\/span>/);
  assert.match(F.fdLibrary(idx, { filter: 'two' }), /data-fd-kit-section="1" aria-pressed="false"><span>Acute stuff<\/span><span class="fd-kit__index-count">0<\/span>/, 'a section with no match still lists, at 0');
});

test('Essentials tool hint matches remain visible when the tool also has a summary', () => {
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 't1.html'] }];
  cur.libraryHints = { 't1.html': 'Prepare in 5 or 15 minutes.' };
  const meta = { 'm1.md': { tldr: 'Reading summary stays verbatim.' },
    't1.html': { tldr: 'A guided rehearsal and supervision question.' } };
  const idx = F.fdBuildIndex(cur, meta, FIX_TOOLS, FIX_MAN);
  const filtered = F.fdEssentials(idx, { filter: 'minutes' });
  assert.deepEqual(essentialsRefs(filtered), ['t1.html']);
  assert.match(row(filtered, 't1.html'), /<span class="fd-kit__summary">Prepare in 5 or 15 <mark>minutes<\/mark>\.<\/span>/);
  assert.match(row(F.fdEssentials(idx), 'm1.md'), /Reading summary stays verbatim\./);
  delete cur.libraryHints['t1.html'];
  const noHint = F.fdBuildIndex(cur, meta, FIX_TOOLS, FIX_MAN);
  assert.match(row(F.fdEssentials(noHint), 't1.html'), /A guided rehearsal and supervision question\./,
    'a tool without a hint retains its existing summary fallback');
});

test('with matches the filtered footer hands the query to Search; with none the zero-results state does', () => {
  const some = F.fdLibrary(IDX, { filter: 'one' });
  assert.match(some, /<p class="fd-library__footer">Not seeing it\? <button type="button" class="fd-library__searchlink" data-fd-search data-fd-search-query="one">Search the library for “one” →<\/button><\/p>/);
  assert.doesNotMatch(some, /fd-library__empty/);
  const none = F.fdLibrary(IDX, { filter: 'milieu <rules>' });
  assert.equal(status(none), 'No titles match “milieu <rules>”.'.replace('<rules>', '&lt;rules&gt;'));
  assert.match(none, /<section class="fd-library__empty" aria-labelledby="fd-library-empty-h"><h2 class="fd-library__empty-h" id="fd-library-empty-h">No titles match “milieu &lt;rules&gt;”<\/h2>/);
  assert.match(none, /<p class="fd-library__empty-p">This filter checks titles and tool descriptions in the current view\. Search also checks summaries and related terms across the library\.<\/p>/);
  assert.match(none, /<button type="button" class="fd-btn fd-btn--primary" data-fd-search data-fd-search-query="milieu &lt;rules&gt;">Search the library<\/button><button type="button" class="fd-btn fd-btn--ghost" data-fd-library-filter-clear>Clear filter<\/button>/);
  assert.match(none, /<p class="fd-library__empty-note">Still unsure\? <strong>＋ Ask a question<\/strong> saves it on this device for supervision\.<\/p>/);
  assert.doesNotMatch(none, /fd-kit__group|fd-library__footer|data-fd-open=/, 'the groups and footer are replaced');
  // Essentials withholds the preview pane in the zero state so "Search the library" is the one filled button.
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 't1.html'] }];
  const kitNone = F.fdEssentials(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN), { filter: 'zzz' });
  assert.doesNotMatch(kitNone, /fd-kit__tool-preview|has-preview/);
  assert.equal((kitNone.match(/fd-btn--primary/g) || []).length, 1);
});

// ---- section index: Everything sections are the libraryColumns, Essentials the curator's --------

test('Everything\'s section index lists All and every column; an unknown or empty section falls back to All', () => {
  const html = F.fdLibrary(IDX);
  assert.match(html, /<nav class="fd-kit__index" aria-label="Catalogue sections"><div class="fd-kit__index-track">/);
  const buttons = [...html.matchAll(/data-fd-kit-section="([^"]+)" aria-pressed="(true|false)"><span>([^<]*)<\/span><span class="fd-kit__index-count">(\d+)<\/span>/g)].map((m) => [m[1], m[3], Number(m[4]), m[2]]);
  assert.deepEqual(buttons, [['all', 'All', 10, 'true'], ['0', 'Zebra tools', 3, 'false'], ['1', 'Acute stuff', 1, 'false'],
    ['2', 'Middle topics', 4, 'false'], ['3', 'Another topic col', 1, 'false'], ['4', 'Last col', 1, 'false']]);
  const scoped = F.fdLibrary(IDX, { kitSection: '2' });
  assert.deepEqual(everythingRefs(scoped), ['m1.md', 'm2.md', 'm3.md', 'mismatch-tool.html']);
  assert.match(scoped, /data-fd-kit-section="2" aria-pressed="true"/);
  assert.equal(F.fdLibrary(IDX, { kitSection: 'tools' }), html, 'Essentials-only keys mean All here');
  assert.equal(F.fdLibrary(IDX, { kitSection: '99' }), html);
});

// ---- rows: meta line, safety dot, selected row ---------------------------------------------------

test('row meta reads "Reading|Tool · N min · Safety kit · Week N · Case week N" from the index and the case arc', () => {
  const cur = structuredClone(FIX_CUR);
  cur.weeks[0].items = [{ ref: 'm1.md' }, { ref: 't1.html' }, { ref: 'one-patient-six-weeks.html' }];
  cur.weeks[4].items = [{ ref: 'm1.md' }];
  cur.weeks[2].items = [{ ref: 'm2.md' }];
  cur.libraryColumns[0].refs.push('one-patient-six-weeks.html');
  cur.safetyKit = [{ ref: 's1.md', sub: 'Screen · plan', triggers: [] }];
  const man = structuredClone(FIX_MAN);
  man.tools.push(['src/one-patient-six-weeks.html', 'one-patient-six-weeks.html', 'Case Journeys']);
  const idx = F.fdBuildIndex(cur, { 'm1.md': { read: 5 }, 'm2.md': { read: 3 } }, FIX_TOOLS, man);
  const caseArc = { weeks: [
    { title: 'Admission', links: [{ kind: 'page', target: 'm1.md' }, { kind: 'tool', target: 't1.html' }] },
    { title: 'Week two', links: [] },
    { title: 'Week three', links: [{ kind: 'page', target: 'm1.md' }] },
  ] };
  const html = F.fdLibrary(idx, { caseArc });
  assert.match(row(html, 'm1.md'), /<span class="fd-kit__meta">Reading · 5 min · Weeks 1 and 5 · Case weeks 1 and 3<\/span>/);
  assert.match(row(html, 'm2.md'), /<span class="fd-kit__meta">Reading · 3 min · Week 3<\/span>/);
  assert.match(row(html, 't1.html'), /<span class="fd-kit__meta">Tool · Week 1 · Case week 1<\/span>/);
  assert.match(row(html, 's1.md'), /<span class="fd-kit__meta">Reading · Safety kit<\/span>/);
  // Case weeks are reported only while the case tool ships: without it the same arc adds nothing.
  const without = F.fdLibrary(IDX, { caseArc });
  assert.match(row(without, 'm1.md'), /<span class="fd-kit__meta">Reading<\/span>/);
  assert.deepEqual(F.fdUsedIn(idx, caseArc, 'm1.md'), { weeks: [1, 5], caseWeeks: [{ n: 1, title: 'Admission' }, { n: 3, title: 'Week three' }] });
  assert.deepEqual(F.fdUsedIn(idx, null, 'm1.md'), { weeks: [1, 5], caseWeeks: [] });
  assert.deepEqual(F.fdUsedIn(idx, { weeks: 'nope' }, 'zzz.md'), { weeks: [], caseWeeks: [] });
});

test('safety items -- kit pages and acute-safety tools -- carry the 8px danger dot; nothing else does', () => {
  const cur = structuredClone(FIX_CUR);
  cur.safetyKit = [{ ref: 's1.md', sub: 'Screen', triggers: [] }];
  const html = F.fdLibrary(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN));
  const dot = /<span class="fd-kit__safety" role="img" aria-label="Safety"><\/span>/;
  assert.match(row(html, 's1.md'), dot, 'a kit page');
  assert.match(row(html, 't1.html'), dot, 'an acute-safety tool (#951: red means safety)');
  assert.doesNotMatch(row(html, 't2.html'), dot);
  assert.doesNotMatch(row(html, 'm1.md'), dot);
  assert.equal((html.match(/fd-kit__safety/g) || []).length, 2);
});

// ---- Essentials: sections, This week, tools as rows, preview pane -------------------------------

function kitFixture() {
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [
    { name: 'First <group>', accent: 'topic', refs: ['m2.md', 'm1.md'] },
    { name: 'Second', accent: 'topic', refs: ['s1.md', 't1.html', 't2.html'] },
  ];
  cur.weeks[0].items = [{ ref: 'm1.md' }, { ref: 's1.md' }, { ref: 'm1.md' }, { ref: 't1.html' }, { ref: 'n1.md' }];
  cur.weeks[1].items = [{ ref: 'm2.md' }];
  cur.libraryHints = { 't1.html': 'Use this when A & B.', 't2.html': 'Compare the next step.' };
  // The case tool ships on this fixture site (last column), so case weeks can be reported.
  cur.libraryColumns[4].refs.push('one-patient-six-weeks.html');
  cur.teachingResources = [{ id: 'family-therapy-companion', title: 'Family Therapy Seminar Companion', description: 'Practice a structured family meeting with de-identified teaching cases.', url: 'https://family-therapy-seminar-companion.netlify.app/', note: 'Answers stay on this device. Do not enter names or identifying details.' }];
  const meta = { 'm1.md': { read: 7, tldr: 'A & B', facultyReview: { status: 'reviewed' } }, 'm2.md': { read: 4, tldr: 'Second reading.' } };
  const man = structuredClone(FIX_MAN);
  man.tools.push(['src/one-patient-six-weeks.html', 'one-patient-six-weeks.html', 'Case Journeys']);
  return F.fdBuildIndex(cur, meta, FIX_TOOLS, man);
}

test('Essentials: curator sections, This week, a Tools group of rows (no tablist), the teaching companion, and the index', () => {
  const idx = kitFixture();
  const html = F.fdEssentials(idx, { week: 1 });
  assert.match(html, /^<section class="fd-library fd-kit">/);
  assert.match(html, /<nav class="fd-kit__index" aria-label="Essentials sections">/);
  const buttons = [...html.matchAll(/data-fd-kit-section="([^"]+)" aria-pressed="(true|false)"><span>([^<]*)<\/span><span class="fd-kit__index-count">(\d+)<\/span>/g)].map((m) => [m[1], m[3], Number(m[4])]);
  assert.deepEqual(buttons, [['all', 'All', 5], ['week', 'This week', 2], ['0', 'First &lt;group&gt;', 2], ['1', 'Second', 1], ['tools', 'Tools', 2]]);
  assert.deepEqual(groupHeadings(html), [['First &lt;group&gt;', 2], ['Second', 1], ['Tools', 2]]);
  assert.deepEqual(essentialsRefs(html), ['m2.md', 'm1.md', 's1.md', 't1.html', 't2.html'], 'readings first, then the tools as rows');
  assert.doesNotMatch(html, /role="tablist"|role="tab"|fd-kit__tool-tabs|fd-kit__tools|<select|<option/);
  assert.match(html, /class="fd-kit__teaching"[^>]*aria-label="External teaching companion"/);
  assert.match(html, /href="https:\/\/family-therapy-seminar-companion\.netlify\.app\/"[^>]*target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Family Therapy Seminar Companion <span class="fd-visually-hidden">\(opens in a new tab\)<\/span>/);
  assert.match(html, /Answers stay on this device\. Do not enter names or identifying details\./);
  assert.match(row(html, 't1.html'), /<span class="fd-kit__title">Tool One<\/span><span class="fd-chip is-tool">tool<\/span>/);
  assert.match(row(html, 't1.html'), /<span class="fd-kit__summary">Use this when A &amp; B\.<\/span>/, 'a tool row shows its hint');
  assert.match(row(html, 'm1.md'), /<span class="fd-kit__summary">A &amp; B<\/span><span class="fd-kit__meta">Reading · 7 min · Week 1<\/span>/);
  // Sections.
  assert.deepEqual(essentialsRefs(F.fdEssentials(idx, { week: 1, kitSection: '0' })), ['m2.md', 'm1.md']);
  assert.deepEqual(essentialsRefs(F.fdEssentials(idx, { week: 1, kitSection: 'tools' })), ['t1.html', 't2.html']);
  assert.doesNotMatch(F.fdEssentials(idx, { week: 1, kitSection: '0' }), /fd-kit__teaching/, 'the companion rides with All and Tools only');
  assert.equal(F.fdEssentials(idx, { week: 1, kitSection: 'unknown' }), html);
});

test('the desktop preview pane follows the selected row and extends to readings', () => {
  const idx = kitFixture();
  const caseArc = { weeks: [{ title: 'Admission', links: [{ kind: 'page', target: 'm1.md' }] }] };
  const pairings = { pairings: [
    { id: 'p1', weeks: [1], audiences: ['ms3', 'res'], items: [{ role: 'read', kind: 'page', ref: 'm1.md' }, { role: 'listen', kind: 'audio_oe', ref: '34' }, { role: 'practice', kind: 'tool', ref: 't2.html' }] },
    { id: 'p2', weeks: [2], audiences: ['res'], items: [{ role: 'read', kind: 'page', ref: 'm1.md' }, { role: 'practice', kind: 'tool', ref: 't1.html' }] },
    { id: 'p3', weeks: [3], audiences: ['ms3'], items: [{ role: 'read', kind: 'page', ref: 'm1.md' }, { role: 'practice', kind: 'tool', ref: 'not-shipped.html' }] },
  ] };
  // Default: nothing selected -> the first tool, as the retired shelf did.
  const dflt = F.fdEssentials(idx, { week: 1 });
  assert.match(dflt, /<div class="fd-library__body has-preview">/);
  assert.match(dflt, /<aside class="fd-kit__tool-preview" id="fd-kit-tool-preview" aria-label="Preview"><p class="fd-kit__preview-kicker">Tool<\/p><h2 class="fd-kit__preview-title">Tool One<\/h2><p class="fd-kit__preview-summary">Use this when A &amp; B\.<\/p>/);
  assert.match(dflt, /<div class="fd-kit__item is-selected"><button type="button" class="fd-kit__reading" data-fd-open="t1\.html">/);
  assert.match(dflt, /data-fd-kit-tool="t1\.html" aria-pressed="true" aria-label="Preview Tool One">Preview<\/button>/);
  assert.equal((dflt.match(/is-selected/g) || []).length, 1);
  assert.equal((dflt.match(/class="fd-kit__peek"/g) || []).length, 5, 'every Essentials row has a Preview control');
  assert.match(dflt, /class="fd-btn fd-btn--primary fd-kit__preview-open" data-fd-open="t1\.html" aria-label="Open Tool One">Open tool<\/button><p class="fd-kit__preview-note">Preview is not saved\. Reload returns to the list\.<\/p><\/aside>/);
  // A reading, with the case arc and pairings: "Where it is used" and "Practice with".
  const reading = F.fdEssentials(idx, { week: 1, kitToolPreview: 'm1.md', caseArc, pairings, audience: 'ms3' });
  assert.match(reading, /<div class="fd-kit__item is-selected"><button type="button" class="fd-kit__reading" data-fd-open="m1\.md">/);
  assert.match(reading, /data-fd-kit-tool="m1\.md" aria-pressed="true"/);
  assert.match(reading, /data-fd-kit-tool="t1\.html" aria-pressed="false"/);
  const pane = reading.match(/<aside class="fd-kit__tool-preview"[\s\S]*?<\/aside>/)[0];
  assert.match(pane, /<p class="fd-kit__preview-kicker">Reading · 7 min<\/p><h2 class="fd-kit__preview-title">Middle One<\/h2><p class="fd-kit__preview-summary">A &amp; B<\/p>/);
  assert.match(pane, /<h3 class="fd-kit__preview-h">Where it is used<\/h3><ul class="fd-kit__preview-list"><li>Week 1 · W1<\/li><li>Case Journeys · Week 1 — Admission<\/li><\/ul>/);
  assert.match(pane, /<h3 class="fd-kit__preview-h">Practice with<\/h3><p class="fd-kit__preview-practice"><strong>Tool Two<\/strong> · tool — Compare the next step\.<\/p>/);
  assert.doesNotMatch(pane, /Tool One/, 'a pairing scoped to the other audience, and a practice ref this site does not ship, are skipped');
  assert.match(pane, /<p class="fd-kit__preview-status fd-kit__preview-attested">✓ faculty-attested<\/p>/, 'no governance projection: topic_meta facultyReview decides');
  assert.match(pane, /class="fd-btn fd-btn--primary fd-kit__preview-open" data-fd-open="m1\.md" aria-label="Open Middle One">Open reading<\/button>/);
  assert.deepEqual(F.fdPracticeWith(idx, pairings, 'm1.md', 'resident').map((i) => i.ref), ['t2.html', 't1.html']);
  assert.deepEqual(F.fdPracticeWith(idx, pairings, 't2.html', 'ms3').map((i) => i.ref), [], 'a tool never pairs with itself and the page is not a practice item');
  assert.deepEqual(F.fdPracticeWith(idx, null, 'm1.md', 'ms3'), []);
  // Governance in the pane: pending shows the full badge; reviewed shows the attested line.
  const man = structuredClone(FIX_MAN);
  man.md.find((e) => e[1] === 'm1.md').push({ status: 'pending', riskKind: 'clinical', riskLevel: 'high' });
  man.md.find((e) => e[1] === 'm2.md').push({ status: 'reviewed', riskKind: 'general', riskLevel: 'low' });
  const cur = structuredClone(FIX_CUR); cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 'm2.md'] }];
  const gidx = F.fdBuildIndex(cur, {}, FIX_TOOLS, man);
  assert.match(F.fdEssentials(gidx, { kitToolPreview: 'm1.md' }), /<p class="fd-kit__preview-status"><span class="governance-badge high" aria-label="Pending review · High risk">Pending review · High risk<\/span><\/p>/);
  assert.match(F.fdEssentials(gidx, { kitToolPreview: 'm2.md' }), /✓ faculty-attested/);
  // An unknown ref falls back to the first tool; no tools -> the first reading. Selection is never persisted (pure).
  assert.equal(F.fdEssentials(idx, { week: 1, kitToolPreview: 'missing.html' }), dflt);
  assert.match(F.fdEssentials(gidx), /<div class="fd-kit__item is-selected"><button type="button" class="fd-kit__reading" data-fd-open="m1\.md">/);
});

test('zero resolved Essentials falls back exactly to Everything, with no dead Essentials control', () => {
  for (const essentials of [[], [{ name: 'Empty', items: [] }]]) {
    const empty = { ...IDX, essentials };
    assert.equal(F.fdEssentials(empty), F.fdLibrary(empty));
    assert.doesNotMatch(F.fdLibrary(empty), /data-fd-library-view=/, 'the segmented control is withheld');
    assert.match(F.fdLibrary(empty), /<div class="fd-library__controls"><div class="fd-library__filter" role="search">/, 'the filter still renders');
  }
});

test('fdEssentials and fdLibrary are pure and do not mutate their index', () => {
  const idx = kitFixture();
  const before = JSON.stringify(idx);
  assert.equal(F.fdEssentials(idx, { week: 1, filter: 'one', kitSection: '0' }), F.fdEssentials(idx, { week: 1, filter: 'one', kitSection: '0' }));
  assert.equal(F.fdLibrary(idx, { filter: 'one' }), F.fdLibrary(idx, { filter: 'one' }));
  assert.equal(JSON.stringify(idx), before);
});

// ---- escaping / purity / audience-neutral --------------------------------------------------------

test('item titles, group names and the query are escaped', () => {
  const evilCur = structuredClone(FIX_CUR);
  evilCur.libraryColumns[0].name = '<script>alert(1)</script>';
  const evilMan = { tools: [['src/t1.html', 't1.html', '<img src=x onerror=1>'], FIX_MAN.tools[1]], md: FIX_MAN.md };
  const html = F.fdLibrary(F.fdBuildIndex(evilCur, FIX_META, FIX_TOOLS, evilMan), { filter: '<img' });
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<mark>&lt;img<\/mark>/);
});

test('fd_library.js touches no DOM, storage, or clock, and stays ES5', () => {
  assert.doesNotMatch(librarySrc, /localStorage\.|document\.|window\.|Date\.now\(\)/,
    'fd_library.js must stay a pure function of (index, opts)');
  assert.doesNotMatch(librarySrc, /\bconst\s|\blet\s|=>/,
    'fd_library.js is a build-injected snippet, not a module -- ES5 only (var/function)');
});

test('no rendered output carries an audience-specific token or a raw hex colour', () => {
  for (const html of [F.fdLibrary(IDX), F.fdEssentials(kitFixture(), { week: 1 }), F.fdLibrary(IDX, { filter: 'zzz' })]) {
    assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,6}\b/, 'no raw hex in emitted markup -- colour must come from CSS classes');
  }
});

// ---- against the REAL repo data (the inventory criterion) ----------------------------------------
//
// Every shipped page appears in Everything exactly once -- with the two deliberate exceptions the
// curriculum itself declares: curriculum.libraryExclude (week pages, the rp-* trainers, utilities)
// and the search-only case-of-the-week pages (curriculum.searchResources without a column
// placement, projected by frontdoor_catalog). Nothing shipped is unreachable: it is in Everything,
// or deliberately excluded, or search-only. The per-site counts are derived AND pinned, so an
// unintentional drop fails loudly even if someone "fixes" the derivation alongside it.

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const REAL_CUR = readJson('../curriculum.json');
const REAL_META = readJson('../topic_meta.json');
const REAL_TOOLS = readJson('../tool_registry.json');
const REAL_MAN = readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json');
const REAL_CASE_ARC = readJson('../longitudinal_case.json');
const REAL_PAIRINGS = readJson('../pairings.json');
const REAL_SHIPPED = readJson('../13_Faculty_Resources/_automation/site_build/shipped_pages.json');
const REAL_IDX = F.fdBuildIndex(REAL_CUR, REAL_META, REAL_TOOLS, REAL_MAN);

test('the canonical curriculum places 84 pages across five columns and Everything renders each once', () => {
  const expected = (REAL_CUR.libraryColumns || []).reduce((n, c) => n + c.refs.length, 0);
  // 83 = 81 + the two 2026-08-21 therapy-curriculum pages (therapy_on_the_unit.md,
  // therapy_reading_room.md). 84 = 83 + pharmacy.html (2026-09-30, Interactive tools).
  assert.equal(expected, 84, 'curriculum.json is expected to place 84 pages across the five columns');
  const html = F.fdLibrary(REAL_IDX);
  const refs = everythingRefs(html);
  assert.equal(refs.length, expected);
  assert.equal(new Set(refs).size, 84);
  assert.equal(status(html), 'Showing all 84 pages.');
  // The canonical file keys essentials by audience ({ms3, resident}); only a projected payload
  // resolves them, so the canonical render has no Essentials and withholds the segmented control.
  assert.doesNotMatch(html, /data-fd-library-view=/);
  const names = REAL_CUR.libraryColumns.map((c) => c.name);
  assert.equal(names.length, 5, 'expected five library columns');
  assert.deepEqual(groupHeadings(html).map(([n]) => n), names.map((n) => n.replace(/&/g, '&amp;')), 'groups in curriculum.json order');
  for (const c of REAL_CUR.libraryColumns) assert.ok(c.refs.length > 0, `column "${c.name}" must not be empty`);
});

test('real chips follow the item: every tool row wears "tool", a rights reference "reference", reads none', () => {
  const html = F.fdLibrary(REAL_IDX);
  let sawTool = false, sawRead = false, sawRights = false;
  for (const c of REAL_CUR.libraryColumns) {
    for (const ref of c.refs) {
      const item = REAL_IDX.byRef[ref], r = row(html, ref);
      if (item.kind === 'tool' && item.rights) { sawRights = true; assert.match(r, /fd-chip is-tool">reference</); }
      else if (item.kind === 'tool') { sawTool = true; assert.match(r, /fd-chip is-tool">tool</); assert.ok(item.hint, `${ref} must carry a hint`); assert.match(r, /<span class="fd-kit__summary">/); }
      else { sawRead = true; assert.doesNotMatch(r, /fd-chip/); }
      // Everything rows show the hint; the hint must ship to both sites.
      assert.doesNotMatch(item.hint || '', AUDIENCE_TOKEN_RE, `${ref}'s hint ships to both sites`);
    }
  }
  assert.ok(sawTool && sawRead && sawRights, 'fixture sanity: real data exercises tools, reads and a rights reference');
});

const PROJECT_ROOT = new URL('../', import.meta.url);
const projected = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json,sys
sys.path.insert(0,'13_Faculty_Resources/_automation/site_build')
from frontdoor_catalog import build_frontdoor_payload
from shipped_pages import load_shipped_pages
cur=json.load(open('curriculum.json')); shipped=load_shipped_pages('.')
out={}
for site,key in [('ms3','ms3'),('res','resident')]:
    nav=[{'section':'Resources','items':[{'f':p['slug'],'t':p['title'],
        'k':'tool' if p['kind']=='tool' else 'md',
        'governance':{'status':'pending','riskKind':'general','riskLevel':'low'}}
        for p in shipped['pages'] if site in p['sites']]}]
    out[site]=build_frontdoor_payload(key,cur,nav,'0'*40,shipped=shipped)
print(json.dumps(out))
`], { cwd: PROJECT_ROOT, encoding: 'utf8' }));

// Pinned per-site counts (2026-10-04): Everything 85 / 94 shipped pages placed in columns;
// Essentials 31 / 35 reading and tool rows; shipped 109 / 118 (2026-10-05: +1 CotW week per site).
const SITES = { ms3: { kit: 31, full: 85, shipped: 109 }, res: { kit: 35, full: 94, shipped: 118 } };

for (const [site, pins] of Object.entries(SITES)) {
  test(`${site}: every shipped page is in Everything exactly once, or deliberately excluded, or search-only; counts match shipped_pages.json`, () => {
    const payload = projected[site];
    const idx = F.fdBuildIndex(payload.curriculum, REAL_META, REAL_TOOLS, payload.manifest);
    const shipped = REAL_SHIPPED.pages.filter((p) => p.sites.includes(site)).map((p) => p.slug);
    assert.equal(shipped.length, pins.shipped, `${site} ships ${pins.shipped} pages`);
    const html = F.fdLibrary(idx);
    const refs = everythingRefs(html);
    assert.equal(refs.length, pins.full);
    assert.equal(new Set(refs).size, pins.full, 'each page exactly once');
    const inEverything = new Set(refs);
    const excluded = new Set((payload.curriculum.libraryExclude || []).map((e) => e.ref));
    const searchOnly = new Set(Object.keys(idx.byRef).filter((ref) => idx.byRef[ref].searchOnly));
    const unreachable = shipped.filter((slug) => !inEverything.has(slug) && !excluded.has(slug) && !searchOnly.has(slug));
    assert.deepEqual(unreachable, [], 'a shipped page that is neither in Everything, nor excluded, nor search-only is unreachable except by URL');
    assert.equal(inEverything.size + [...excluded].filter((r) => shipped.includes(r)).length + [...searchOnly].filter((r) => shipped.includes(r) && !excluded.has(r)).length, shipped.length,
      'Everything + libraryExclude + search-only account for every shipped page');
    for (const ref of refs) assert.ok(shipped.includes(ref), `${ref} is in Everything but does not ship on ${site}`);
    assert.equal(status(html), `Showing all ${pins.full} pages.`);
    assert.match(html, new RegExp('Everything<span class="fd-library__view-count"> · ' + pins.full + '</span>'));
  });

  test(`${site}: real Essentials renders ${pins.kit} reading and tool rows, every one also in Everything`, () => {
    const payload = projected[site];
    const idx = F.fdBuildIndex(payload.curriculum, REAL_META, REAL_TOOLS, payload.manifest);
    const html = F.fdEssentials(idx, { week: 1, caseArc: REAL_CASE_ARC, pairings: REAL_PAIRINGS, audience: site === 'ms3' ? 'ms3' : 'resident' });
    const refs = essentialsRefs(html);
    assert.equal(refs.length, pins.kit);
    assert.deepEqual(refs, payload.curriculum.essentials.flatMap((c) => c.refs.filter((r) => !r.endsWith('.html'))).concat(payload.curriculum.essentials.flatMap((c) => c.refs.filter((r) => r.endsWith('.html')))),
      'curator order: readings by section, then the tools');
    const everything = new Set(everythingRefs(F.fdLibrary(idx)));
    for (const ref of refs) assert.ok(everything.has(ref), `${ref} is in Essentials but not in Everything`);
    assert.equal(status(html), `Showing all ${pins.kit} Essentials items.`);
    assert.match(html, new RegExp('Essentials<span class="fd-library__view-count"> · ' + pins.kit + '</span>'));
    assert.equal((html.match(/<details class="fd-kit__group" open>/g) || []).length, site === 'ms3' ? 8 : 7, 'reading sections + the Tools group');
    assert.equal((html.match(/data-fd-kit-section=/g) || []).length, site === 'ms3' ? 10 : 9, 'All, This week, the sections, Tools');
    // The pending count is derived from the same index, never pinned (#729).
    const readings = refs.filter((r) => idx.byRef[r].kind !== 'tool');
    const pending = readings.filter((r) => idx.byRef[r].governance?.status === 'pending').length;
    if (pending) assert.match(html, new RegExp('Faculty re-review in progress — ' + pending + ' of ' + readings.length + ' readings'));
    else assert.doesNotMatch(html, /fd-kit__review/);
    // Every pending row (reading or tool) wears the full badge; no reviewed row does.
    for (const ref of refs) {
      const g = idx.byRef[ref].governance;
      if (g?.status === 'pending') assert.match(row(html, ref), g.riskLevel === 'high' ? /Pending review · High risk/ : /aria-label="Pending review">Pending review</);
      else assert.doesNotMatch(row(html, ref), /governance-badge/);
    }
    // Summaries byte-identical to topic_meta (escaped only).
    for (const ref of readings) {
      const tldr = REAL_META[ref]?.tldr;
      if (!tldr) continue;
      const esc = tldr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      assert.ok(row(html, ref).includes('<span class="fd-kit__summary">' + esc + '</span>'), `${ref}'s summary is not byte-identical to topic_meta`);
    }
    // The preview pane renders for the real data without throwing and names a real item.
    assert.match(html, /<div class="fd-library__body has-preview">/);
    assert.match(html, /<aside class="fd-kit__tool-preview"/);
  });
}

// ---- the live shell branch --------------------------------------------------------------------------

test('the live Library shell renders both views through one call, passing section, preview, filter, week, case arc, pairings and audience', () => {
  const shell = read('spa_index.html');
  assert.match(shell, /var libOpts=\{kitSection:state\.kitSection,kitToolPreview:state\.kitToolPreview,filter:state\.libraryFilter,week:live\.week,caseArc:FD_CASE_ARC,pairings:FD_PAIRINGS,audience:FD_AUDIENCE\}; return state\.libraryView==='full'\?fdLibrary\(FD_INDEX,libOpts\):fdEssentials\(FD_INDEX,libOpts\);/);
  assert.match(shell, /var FD_PAIRINGS=null;/, 'the pairings needle build_deploy.py fills');
  const branch = /if\(state\.tab==='library'\) return (fdSurface\('library',function\(\)\{[^\n]+\}\));/.exec(shell);
  assert.ok(branch, 'Library shell branch remains a shared pure renderer call');
  const run = new Function('state', 'live', 'FD_INDEX', 'FD_CASE_ARC', 'FD_PAIRINGS', 'FD_AUDIENCE', 'fdSurface', 'fdLibrary', 'fdEssentials', `return ${branch[1]};`);
  const surface = (_name, render) => render();
  const idx = kitFixture();
  const caseArc = { weeks: [] }, pairings = { pairings: [] };
  const opts = (state, live) => ({ kitSection: state.kitSection, kitToolPreview: state.kitToolPreview, filter: state.libraryFilter, week: live.week, caseArc, pairings, audience: 'ms3' });
  for (const libraryView of [undefined, 'essentials']) {
    const state = { tab: 'library', libraryView, kitSection: '0', libraryFilter: 'one', kitToolPreview: 'm1.md' }, live = { week: 2 };
    assert.equal(run(state, live, idx, caseArc, pairings, 'ms3', surface, F.fdLibrary, F.fdEssentials), F.fdEssentials(idx, opts(state, live)));
  }
  const state = { tab: 'library', libraryView: 'full', kitSection: '2', libraryFilter: 'x' }, live = { week: 1 };
  assert.equal(run(state, live, idx, caseArc, pairings, 'ms3', surface, F.fdLibrary, F.fdEssentials), F.fdLibrary(idx, opts(state, live)));
});

test('the live shell passes the actual week to Essentials rather than the browsed Path week', () => {
  const shell = read('spa_index.html');
  const branch = /if\(state\.tab==='library'\) return (fdSurface\('library',function\(\)\{[^\n]+\}\));/.exec(shell);
  const run = new Function('state', 'live', 'FD_INDEX', 'FD_CASE_ARC', 'FD_PAIRINGS', 'FD_AUDIENCE', 'fdSurface', 'fdLibrary', 'fdEssentials', `return ${branch[1]};`);
  const idx = kitFixture(), state = { tab: 'library', viewWeek: 1, kitSection: 'week' };
  const render = (live) => run(state, live, idx, null, null, 'ms3', (_n, paint) => paint(), F.fdLibrary, F.fdEssentials);
  assert.deepEqual(essentialsRefs(render({ week: 2, viewWeek: 1 })), ['m2.md']);
  assert.deepEqual(essentialsRefs(render({ viewWeek: 1 })), essentialsRefs(F.fdEssentials(idx)));
});

test('compact shared badge retains normal behavior and names pending dots accessibly', () => {
  const src = read('spa_index.html');
  const body = src.slice(src.indexOf('  function governanceBadge('), src.indexOf('  /* Report whether the alert'));
  const badge = new Function(body + ';return governanceBadge;')();
  for (const g of [null, { status: 'reviewed' }]) assert.equal(badge(g, { compact: true }), '');
  const g = { status: 'pending', riskLevel: 'high' };
  assert.match(badge(g), /governance-badge high/);
  assert.doesNotMatch(badge(g, { compact: true }), /governance-badge/);
  assert.match(badge(g, { compact: true }), /role="img" aria-label="Awaiting faculty re-review"/);
});

// ---- This week: an intersection of the active Path and the existing Essentials readings ---------

function weeklyFixture() {
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [
    { name: 'First', accent: 'topic', refs: ['m2.md', 't1.html', 'm1.md'] },
    { name: 'Second', accent: 'topic', refs: ['s1.md', 'm3.md'] },
  ];
  cur.weeks[0].items = [{ ref: 'm1.md' }, { ref: 's1.md' }, { ref: 'm1.md' }, { ref: 't1.html' }, { ref: 'n1.md' }];
  cur.weeks[1].items = [{ ref: 'm2.md' }];
  cur.weeks[2].items = [{ ref: 't1.html' }, { ref: 'n1.md' }];
  return F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
}

test('This week counts only matching Essentials readings and preserves their section order', () => {
  const idx = weeklyFixture(), before = JSON.stringify(idx);
  const all = F.fdEssentials(idx, { week: 1 });
  assert.match(all, /data-fd-kit-section="week" aria-pressed="false"><span>This week<\/span><span class="fd-kit__index-count">2<\/span>/);
  assert.deepEqual(essentialsRefs(all), ['m2.md', 'm1.md', 's1.md', 'm3.md', 't1.html']);
  const filtered = F.fdEssentials(idx, { week: 1, kitSection: 'week' });
  assert.match(filtered, /data-fd-kit-section="week" aria-pressed="true"><span>This week<\/span><span class="fd-kit__index-count">2<\/span>/);
  assert.deepEqual(essentialsRefs(filtered), ['m1.md', 's1.md']);
  assert.deepEqual(groupHeadings(filtered), [['First', 1], ['Second', 1]]);
  assert.equal(status(filtered), 'Showing 2 readings for this week.');
  assert.doesNotMatch(filtered, /data-fd-open="t1\.html"[^]*class="fd-kit__reading"/, 'no tool rows under This week');
  assert.match(filtered, /data-fd-library-view="full" aria-pressed="false">Everything/);
  assert.equal(JSON.stringify(idx), before, 'weekly filtering cannot mutate Path or Essentials');
});

test('This week drops empty groups and changes with the actual current week', () => {
  const html = F.fdEssentials(weeklyFixture(), { week: 2, viewWeek: 1, kitSection: 'week' });
  assert.deepEqual(essentialsRefs(html), ['m2.md']);
  assert.match(html, />This week<\/span><span class="fd-kit__index-count">1<\/span>/);
  assert.doesNotMatch(html, /fd-kit__group-name">Second</);
});

test('unset, invalid, empty and tool-only weeks offer All instead of an empty weekly view', () => {
  const idx = weeklyFixture(), all = F.fdEssentials(idx);
  for (const week of [undefined, null, 0, -1, 1.5, '1', NaN, Infinity, 99, 3, 4]) {
    assert.equal(F.fdEssentials(idx, { week, kitSection: 'week' }), all, `week ${week}`);
  }
  const noWeeks = { ...idx, weeks: undefined };
  assert.equal(F.fdEssentials(noWeeks, { week: 1, kitSection: 'week' }), F.fdEssentials(noWeeks));
  const emptyKit = { ...idx, essentials: [] };
  assert.equal(F.fdEssentials(emptyKit, { week: 1, kitSection: 'week' }), F.fdLibrary(emptyKit));
});

for (const site of ['ms3', 'res']) {
  test(`${site}: every actual Path week filters the exact Essentials reading intersection`, () => {
    const payload = projected[site];
    const idx = F.fdBuildIndex(payload.curriculum, REAL_META, REAL_TOOLS, payload.manifest);
    const readings = payload.curriculum.essentials.flatMap((group) => group.refs).filter((ref) => ref.endsWith('.md'));
    let exercised = 0;
    for (const week of payload.curriculum.weeks) {
      const assigned = new Set(week.items.map((item) => item.ref));
      const expected = readings.filter((ref) => assigned.has(ref));
      const html = F.fdEssentials(idx, { week: week.n, kitSection: 'week' });
      if (expected.length) {
        exercised++;
        assert.deepEqual(essentialsRefs(html), expected, `week ${week.n}`);
        assert.match(html, new RegExp('>This week<\\/span><span class="fd-kit__index-count">' + expected.length + '<'));
      } else {
        assert.doesNotMatch(html, /data-fd-kit-section="week"/);
        assert.deepEqual(essentialsRefs(html), essentialsRefs(F.fdEssentials(idx)));
      }
    }
    assert.ok(exercised > 0, 'real weekly intersections must actually be checked');
  });
}

test('the selected preparation preview shows its governed status and one launch destination', () => {
  const prep = { ref: 'prepare-for-tomorrow.html', kind: 'tool', title: 'Prepare for tomorrow', hint: 'Choose a task and time.', governance: { status: 'pending', riskKind: 'clinical', riskLevel: 'moderate' } };
  for (const st of ['pending', 'reviewed']) {
    const item = { ...prep, governance: { ...prep.governance, status: st } };
    const fixture = { ...IDX, essentials: [{ name: 'Tools', accent: 'tool', items: [{ ref: 'other.html', title: 'Other tool', kind: 'tool', governance: { status: 'reviewed' } }, item] }] };
    const html = F.fdEssentials(fixture, { kitToolPreview: prep.ref });
    const pane = html.match(/<aside class="fd-kit__tool-preview"[\s\S]*?<\/aside>/)[0];
    if (st === 'pending') assert.match(pane, /<span class="governance-badge" aria-label="Pending review">Pending review<\/span>/);
    else assert.match(pane, /✓ faculty-attested/);
    assert.equal((pane.match(/data-fd-open="prepare-for-tomorrow.html"/g) || []).length, 1, 'one launch destination in the pane');
    assert.match(html, /data-fd-kit-tool="prepare-for-tomorrow.html" aria-pressed="true"/);
  }
});


test('reviewed reading preview keeps pending practice recommendation status separate', () => {
  const idx = kitFixture();
  idx.byRef['m1.md'].governance = {status: 'reviewed', riskLevel: 'low'};
  idx.byRef['t2.html'].governance = {status: 'pending', riskLevel: 'high'};
  const pairings = {pairings: [{id: 'synthetic', audiences: ['ms3'], items: [
    {role: 'read', kind: 'page', ref: 'm1.md'},
    {role: 'practice', kind: 'tool', ref: 't2.html'},
  ]}]};
  const html = F.fdEssentials(idx, {kitToolPreview: 'm1.md', pairings, audience: 'ms3'});
  const pane = html.match(/<aside class="fd-kit__tool-preview"[\s\S]*?<\/aside>/)[0];
  const practice = pane.match(/<p class="fd-kit__preview-practice">[\s\S]*?<\/p>/)[0];
  assert.match(practice, /Tool Two/);
  assert.match(practice, /Pending review · High risk/);
  assert.match(pane, /faculty-attested/);
});
