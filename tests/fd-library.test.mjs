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

const FIX_CUR = {
  weeks: [{ n: 1, title: 'W1', theme: 'T1', items: [] }, { n: 2, title: 'W2', theme: 'T2', items: [] },
          { n: 3, title: 'W3', theme: 'T3', items: [] }, { n: 4, title: 'W4', theme: 'T4', items: [] },
          { n: 5, title: 'W5', theme: 'T5', items: [] }, { n: 6, title: 'W6', theme: 'T6', items: [] }],
  libraryColumns: [
    { name: 'Zebra tools', accent: 'tool', refs: ['t1.html', 't2.html'] },
    { name: 'Acute stuff', accent: 'safety', refs: ['s1.md'] },
    { name: 'Middle topics', accent: 'topic', refs: ['m1.md', 'm2.md', 'm3.md'] },
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
] };
const FIX_MAN = {
  tools: [['src/t1.html', 't1.html', 'Tool One'], ['src/t2.html', 't2.html', 'Tool Two']],
  md: [['src/s1.md', 's1.md', 'Safety One'], ['src/m1.md', 'm1.md', 'Middle One'],
       ['src/m2.md', 'm2.md', 'Middle Two'], ['src/m3.md', 'm3.md', 'Middle Three'],
       ['src/n1.md', 'n1.md', 'Another One'], ['src/l1.md', 'l1.md', 'Last One']],
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

// ---- every row: data-fd-open + the column's accent class --------------------------------

test('every row carries data-fd-open="<ref>" and its column accent class', () => {
  const html = F.fdLibrary(IDX);
  // tool column -> is-tool dot
  assert.match(html,
    /<button type="button" class="fd-collink" data-fd-open="t1\.html">\s*<span class="fd-collink__dot is-tool"><\/span>/);
  assert.match(html,
    /<button type="button" class="fd-collink" data-fd-open="t2\.html">\s*<span class="fd-collink__dot is-tool"><\/span>/);
  // safety column -> bare dot (no is-tool), per CLASS-INVENTORY: only .is-tool is a defined
  // modifier -- safety/topic accents both render the default (olive) dot.
  assert.match(html,
    /<button type="button" class="fd-collink" data-fd-open="s1\.md">\s*<span class="fd-collink__dot"><\/span>/);
  // topic columns -> bare dot too
  assert.match(html,
    /<button type="button" class="fd-collink" data-fd-open="m1\.md">\s*<span class="fd-collink__dot"><\/span>/);
  assert.match(html,
    /<button type="button" class="fd-collink" data-fd-open="l1\.md">\s*<span class="fd-collink__dot"><\/span>/);
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
  assert.match(html, /<span class="fd-library__count">8 pages/, 'fixture places 8 pages total (2+1+3+1+1)');
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
const REAL_IDX = F.fdBuildIndex(REAL_CUR, REAL_META, REAL_TOOLS, REAL_MAN);

test('the count of rendered links equals 81 against the real curriculum.json', () => {
  const expected = (REAL_CUR.libraryColumns || []).reduce((n, c) => n + c.refs.length, 0);
  assert.equal(expected, 81, 'curriculum.json is expected to place 81 pages across the five columns');
  const html = F.fdLibrary(REAL_IDX);
  const links = html.match(/data-fd-open="/g) || [];
  assert.equal(links.length, expected, 'every column-placed page must render exactly one Library link');
  assert.equal(links.length, 81);
});

test('the real header count matches the real link count', () => {
  const html = F.fdLibrary(REAL_IDX);
  const links = html.match(/data-fd-open="/g) || [];
  assert.match(html, new RegExp('<span class="fd-library__count">' + links.length + ' pages'));
});

test('the real five columns render in curriculum.json order with no duplicates and no empty column', () => {
  const html = F.fdLibrary(REAL_IDX);
  const names = REAL_CUR.libraryColumns.map((c) => c.name);
  assert.equal(names.length, 5, 'expected five library columns');
  let cursor = -1;
  for (const name of names) {
    const at = html.indexOf('<div class="fd-col__name">' + name.replace(/&/g, '&amp;') + '</div>');
    assert.ok(at > cursor, `column "${name}" missing or out of curriculum.json order`);
    cursor = at;
  }
  for (const c of REAL_CUR.libraryColumns) {
    assert.ok(c.refs.length > 0, `column "${c.name}" must not be empty`);
  }
});

test('real tool-column dots get is-tool; real non-tool columns do not', () => {
  const html = F.fdLibrary(REAL_IDX);
  for (const c of REAL_CUR.libraryColumns) {
    for (const ref of c.refs) {
      const m = html.match(new RegExp(
        '<button type="button" class="fd-collink" data-fd-open="' + ref.replace(/\./g, '\\.') +
        '">\\s*<span class="([^"]*)">'));
      assert.ok(m, `no rendered row for ${ref}`);
      if (c.accent === 'tool') assert.equal(m[1], 'fd-collink__dot is-tool', `${ref} in a tool column must get is-tool`);
      else assert.equal(m[1], 'fd-collink__dot', `${ref} in a ${c.accent} column must NOT get is-tool`);
    }
  }
});
