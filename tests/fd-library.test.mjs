// Contract for the Library renderer. Evaluates the real snippet body via new Function, following
// tests/fd-data.test.mjs, tests/fd-path.test.mjs. Concatenated in the same dependency order
// inject_shared_snippets() uses on the built page: phase_policy.js -> fd_state.js -> fd_data.js
// (the join layer fd_library.js's fdBuildIndex comes from) -> fd_library.js.
//
// The Library is the only browse surface once the sidebar is deleted (see the design spec and
// docs/superpowers/sdd/2026-08-15-front-door-modules/task-6-brief.md). A page missing from it is
// unreachable except by search, so the count assertion against the REAL curriculum.json (not a
// fixture) is the load-bearing test here -- it is the one that fails if a page silently stops
// being placed in a column.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const librarySrc = read('frontdoor/fd_library.js');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${librarySrc}
  return { fdLibrary: fdLibrary, fdBuildIndex: fdBuildIndex };
`);
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// ---- fixture: five columns, distinct accents, out of alphabetical order ----------------
//
// Two refs are deliberately misplaced relative to their column's accent -- 'mismatch-read.md'
// sits in the tool-accent column, 'mismatch-tool.html' sits in a topic-accent column. kind is
// derived per-item by fd_data.js from the ref's own extension (fdIsTool), independent of which
// column holds it, so these two prove the dot follows the ITEM, not the column: if the renderer
// ever regresses to keying off column accent, these are the two rows that would flip and a
// same-accent-only fixture could not catch it (fix round 1 review, 2026-08-16).
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
  { file: 't2.html', title: 'Tool Two', category: 'acute-safety', riskLevel: 'low' },
  { file: 'mismatch-tool.html', title: 'Misplaced Tool', category: 'acute-safety', riskLevel: 'low' },
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

// ---- all five columns render in curriculum.json order -----------------------------------

test('all five columns render, in curriculum.json order', () => {
  const html = F.fdLibrary(IDX);
  const names = ['Zebra tools', 'Acute stuff', 'Middle topics', 'Another topic col', 'Last col'];
  let cursor = -1;
  for (const name of names) {
    const at = html.indexOf('<div class="fd-col__name">' + name + '</div>');
    assert.ok(at !== -1, `column "${name}" must render`);
    assert.ok(at > cursor, `column "${name}" must render after the previous column (curriculum.json order)`);
    cursor = at;
  }
  const cols = html.match(/<div class="fd-col">/g) || [];
  assert.equal(cols.length, 5, '.fd-col is required per column even though it carries no rule of its own');
});

// ---- every row: data-fd-open + the ITEM's kind dot class (not the column's accent) ------
//
// Expectation is derived from IDX.byRef[ref].kind -- the field fd_data.js computes per item from
// the ref's own extension -- never from FIX_CUR's column.accent, so this test cannot degenerate
// into a restatement of "whatever fd_library.js currently reads" (fix round 1 review, 2026-08-16).

test('every row carries data-fd-open="<ref>" and a dot class keyed on the item\'s kind', () => {
  const html = F.fdLibrary(IDX);
  const dotClassFor = (ref) => {
    const m = html.match(new RegExp(
      '<button type="button" class="fd-collink" data-fd-open="' + ref.replace(/\./g, '\\.') +
      '">\\s*<span class="([^"]*)">'));
    assert.ok(m, `no rendered row for ${ref}`);
    return m[1];
  };
  for (const ref of Object.keys(IDX.byRef)) {
    const expected = IDX.byRef[ref].kind === 'tool' ? 'fd-collink__dot is-tool' : 'fd-collink__dot';
    assert.equal(dotClassFor(ref), expected, `${ref} (kind=${IDX.byRef[ref].kind}) dot class`);
  }
  // The two deliberately misplaced refs are the ones that actually distinguish kind-keying from
  // accent-keying -- assert them explicitly so a regression to accent-keying fails loudly here,
  // not just in aggregate.
  assert.equal(dotClassFor('mismatch-read.md'), 'fd-collink__dot',
    'a .md read in the tool-accent column must NOT get is-tool');
  assert.equal(dotClassFor('mismatch-tool.html'), 'fd-collink__dot is-tool',
    'a .html tool in a topic-accent column must still get is-tool');
});

test('data-fd-open is the established open convention -- no second attribute name invented', () => {
  const html = F.fdLibrary(IDX);
  assert.doesNotMatch(html, /data-fd-item=/);
  assert.doesNotMatch(html, /data-fd-link=/);
});

// ---- header: exact copy + page count ------------------------------------------------------

test('the header reads "Everything, one screen" with the page count', () => {
  const html = F.fdLibrary(IDX);
  assert.match(html, /<h1 class="fd-library__h1">Everything, one screen<\/h1>/);
  assert.match(html, /<span class="fd-library__count">10 pages/, 'fixture places 10 pages total (3+1+4+1+1)');
});

// ---- titles escaped -------------------------------------------------------------------------

test('item titles and column names are escaped', () => {
  const evilCur = JSON.parse(JSON.stringify(FIX_CUR));
  evilCur.libraryColumns[0].name = '<script>alert(1)</script>';
  const evilMan = {
    tools: [['src/t1.html', 't1.html', '<img src=x onerror=1>'], FIX_MAN.tools[1]],
    md: FIX_MAN.md,
  };
  const evilIdx = F.fdBuildIndex(evilCur, FIX_META, FIX_TOOLS, evilMan);
  const html = F.fdLibrary(evilIdx);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});

// ---- structure: grid + no raw hex ------------------------------------------------------------

test('renders the library grid wrapper and no inline hex colours', () => {
  const html = F.fdLibrary(IDX);
  assert.match(html, /<section class="fd-library">/);
  assert.match(html, /<div class="fd-library__grid">/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,6}/, 'no raw hex in emitted markup -- colour must come from CSS classes');
});

// ---- purity / audience-neutral ----------------------------------------------------------------

test('fd_library.js touches no DOM, storage, or clock, and stays ES5', () => {
  assert.doesNotMatch(librarySrc, /localStorage\.|document\.|window\.|Date\.now\(\)/,
    'fd_library.js must stay a pure function of (index)');
  assert.doesNotMatch(librarySrc, /\bconst\s|\blet\s|=>/,
    'fd_library.js is a build-injected snippet, not a module -- ES5 only (var/function)');
});

test('no rendered output carries an audience-specific token', () => {
  const html = F.fdLibrary(IDX);
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

// ---- against the REAL repo data ----------------------------------------------------------------
// This is the test that fails if a page ever silently stops being reachable: the sidebar is gone
// once this redesign ships, so the Library is the only browse surface. Deriving `expected` from
// the real curriculum.json (rather than hardcoding it as the only check) means the assertion
// tracks intentional column changes; pinning it to 81 as well means an *unintentional* drop still
// fails loudly even if someone "fixes" the derived count alongside the regression.

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const REAL_CUR = readJson('../curriculum.json');
const REAL_META = readJson('../topic_meta.json');
const REAL_TOOLS = readJson('../tool_registry.json');
const REAL_MAN = readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json');

// curriculum.json's library refs are PER SITE: a bare slug is a page every site ships, an object
// carries a "sites" list. site_build/common.py's fd_curriculum_for_site() is canonical and resolves
// this at build time; this mirrors it so these tests can assert what each site actually renders
// rather than the union, which no site renders. (The projection is also pinned end-to-end against
// the two real builds by _prototypes/sp-interview/tests/ci-build-contract.test.mjs.)
const forSite = (cur, site) => ({
  ...cur,
  libraryColumns: (cur.libraryColumns || [])
    .map((c) => ({
      ...c,
      refs: (c.refs || []).filter((e) => typeof e === 'string' || !e.sites || e.sites.includes(site)),
    }))
    .filter((c) => c.refs.length),
});
const refSlug = (e) => (typeof e === 'string' ? e : e.ref);
const REAL_IDX = F.fdBuildIndex(forSite(REAL_CUR, 'ms3'), REAL_META, REAL_TOOLS, REAL_MAN);
const RES_IDX = F.fdBuildIndex(forSite(REAL_CUR, 'resident'), REAL_META, REAL_TOOLS, REAL_MAN);

// Two counts, not one. 81 is what the MS3 site renders; 90 is what the resident site renders, and
// the nine-page gap IS the resident-only set that had no browse path at all before Task 6 (they
// reached users only through the deleted sidebar's nav.json). Pinning both means losing either
// site's placement fails here, and pinning the gap's membership means a resident page cannot be
// quietly dropped back out by "fixing" a count.
const RESIDENT_ONLY = [
  'adv_psychopharm.md', 'canon_200.md', 'cl_reference.md', 'rotation.md',
  'rp-agitation.html', 'rp-brief-psych.html', 'rp-canon-quiz.html',
  'supervision_teaching.md', 'systems_medlegal.md',
];

test('the count of rendered links equals 81 (ms3) and 90 (resident) against the real curriculum.json', () => {
  for (const [site, idx, expected] of [['ms3', REAL_IDX, 81], ['resident', RES_IDX, 90]]) {
    const placed = forSite(REAL_CUR, site).libraryColumns.reduce((n, c) => n + c.refs.length, 0);
    assert.equal(placed, expected, `curriculum.json is expected to place ${expected} pages on ${site}`);
    const links = F.fdLibrary(idx).match(/data-fd-open="/g) || [];
    assert.equal(links.length, expected, `${site}: every column-placed page renders exactly one link`);
  }
});

test('the resident Library is the MS3 Library plus exactly the nine resident-only pages', () => {
  const slugs = (site) => new Set(forSite(REAL_CUR, site).libraryColumns
    .flatMap((c) => c.refs.map(refSlug)));
  const ms3 = slugs('ms3');
  const res = slugs('resident');
  assert.deepEqual([...ms3].filter((s) => !res.has(s)), [],
    'the resident site ships every shared page, so its Library cannot be missing one');
  assert.deepEqual([...res].filter((s) => !ms3.has(s)).sort(), RESIDENT_ONLY,
    'the resident-only pages must each be placed in a resident column — the sidebar that used '
    + 'to reach them is gone, so an unplaced one is reachable only by search');
});

test('every per-site ref carries its own title, so no resident row renders as a raw slug', () => {
  // site_manifest.json registers only the shared pages, so curriculum.json is the ONLY title
  // source for these nine. Asserting on the rendered row (not on the JSON) is what catches
  // fd_data.js dropping the overlay.
  const html = F.fdLibrary(RES_IDX);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const slug of RESIDENT_ONLY) {
    const title = RES_IDX.byRef[slug].title;
    assert.notEqual(title, slug, `${slug} fell back to its slug`);
    assert.ok(html.includes(esc(title)), `${slug}'s title must render`);
  }
});

test('the real header count matches the real link count', () => {
  const html = F.fdLibrary(REAL_IDX);
  const links = html.match(/data-fd-open="/g) || [];
  assert.match(html, new RegExp('<span class="fd-library__count">' + links.length + ' pages'));
});

test('the real five columns render in curriculum.json order with no duplicates and no empty column', () => {
  const html = F.fdLibrary(REAL_IDX);
  const names = forSite(REAL_CUR, 'ms3').libraryColumns.map((c) => c.name);
  assert.equal(names.length, 5, 'expected five library columns');
  let cursor = -1;
  for (const name of names) {
    const at = html.indexOf('<div class="fd-col__name">' + name.replace(/&/g, '&amp;') + '</div>');
    assert.ok(at > cursor, `column "${name}" missing or out of curriculum.json order`);
    cursor = at;
  }
  for (const c of forSite(REAL_CUR, 'ms3').libraryColumns) {
    assert.ok(c.refs.length > 0, `column "${c.name}" must not be empty`);
  }
});

// Expectation is derived from REAL_IDX.byRef[ref].kind -- fd_data.js's own per-item field,
// computed from each ref's extension -- NOT from the column's accent. In today's data the two
// coincide for every one of the 81 real refs (verified below), but the assertion is written
// against the field that is actually supposed to be load-bearing, so it will still catch a
// regression to accent-keying the day a column's contents stop being homogeneous (fix round 1
// review, 2026-08-16 -- the previous version of this test asserted against c.accent and could not
// have caught that regression).
test('real dots are keyed on the item\'s kind, and today that always agrees with its column\'s accent', () => {
  // Run over BOTH sites: the resident-only refs are the only per-site entries in the file, so a
  // ms3-only sweep would never exercise the object ref form at all.
  for (const [site, idx] of [['ms3', REAL_IDX], ['resident', RES_IDX]]) {
  const html = F.fdLibrary(idx);
  let sawTool = false, sawRead = false;
  for (const c of forSite(REAL_CUR, site).libraryColumns) {
    for (const ref of c.refs.map(refSlug)) {
      const kind = idx.byRef[ref].kind;
      const m = html.match(new RegExp(
        '<button type="button" class="fd-collink" data-fd-open="' + ref.replace(/\./g, '\\.') +
        '">\\s*<span class="([^"]*)">'));
      assert.ok(m, `no rendered row for ${ref}`);
      const expected = kind === 'tool' ? 'fd-collink__dot is-tool' : 'fd-collink__dot';
      assert.equal(m[1], expected, `${ref} (kind=${kind}, column accent=${c.accent}) dot class`);
      // Today's data invariant, checked so a future divergence between kind and accent is visible
      // here rather than silently changing which field "happens" to agree with the other.
      assert.equal(kind === 'tool', c.accent === 'tool',
        `${ref}: kind=${kind} but column accent=${c.accent} -- kind and accent no longer agree`);
      if (kind === 'tool') sawTool = true; else sawRead = true;
    }
  }
  assert.ok(sawTool && sawRead, `${site}: real data must exercise both dot states`);
  }
});
