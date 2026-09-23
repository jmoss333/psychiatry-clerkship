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
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const librarySrc = read('frontdoor/fd_library.js');

function make(governanceBadge) {
  // eslint-disable-next-line no-new-func
  return new Function('governanceBadge', `
    ${read('phase_policy.js')}
    ${read('frontdoor/fd_state.js')}
    ${read('frontdoor/fd_data.js')}
    ${librarySrc}
    return { fdLibrary: fdLibrary, fdEssentials: fdEssentials, fdBuildIndex: fdBuildIndex };
  `)(governanceBadge || function () { return ''; });
}
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

test('library rows pass projected governance to the shared badge helper after each label', () => {
  const calls = [];
  const G = make((triplet) => {
    calls.push(triplet);
    if (!triplet || triplet.status === 'reviewed') return '';
    return triplet.riskLevel === 'high'
      ? '<span class="governance-badge high">Pending review · High risk</span>'
      : '<span class="governance-badge">Pending review</span>';
  });
  const manifest = JSON.parse(JSON.stringify(FIX_MAN));
  manifest.tools[0].push({ status: 'pending', riskKind: 'clinical', riskLevel: 'high' });
  manifest.tools[1].push({ status: 'pending', riskKind: 'general', riskLevel: 'low' });
  manifest.md.find((entry) => entry[1] === 'mismatch-read.md').push(
    { status: 'reviewed', riskKind: 'general', riskLevel: 'low' });
  const html = G.fdLibrary(G.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, manifest));

  assert.deepEqual(calls.slice(0, 3), [
    { status: 'pending', riskKind: 'clinical', riskLevel: 'high' },
    { status: 'pending', riskKind: 'general', riskLevel: 'low' },
    { status: 'reviewed', riskKind: 'general', riskLevel: 'low' },
  ]);
  assert.match(html, /fd-collink__label">Tool One<\/span><span class="governance-badge high">Pending review · High risk<\/span>/);
  assert.match(html, /fd-collink__label">Tool Two<\/span><span class="governance-badge">Pending review<\/span>/);
  assert.doesNotMatch(html, /fd-collink__label">Misplaced Read<\/span><span class="governance-badge/);
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
const REAL_IDX = F.fdBuildIndex(REAL_CUR, REAL_META, REAL_TOOLS, REAL_MAN);

test('the count of rendered links equals 81 against the real curriculum.json', () => {
  const expected = (REAL_CUR.libraryColumns || []).reduce((n, c) => n + c.refs.length, 0);
  // 83 = 81 + the two 2026-08-21 therapy-curriculum pages (therapy_on_the_unit.md,
  // therapy_reading_room.md).
  assert.equal(expected, 83, 'curriculum.json is expected to place 83 pages across the five columns');
  const html = F.fdLibrary(REAL_IDX);
  const links = html.match(/data-fd-open="/g) || [];
  assert.equal(links.length, expected, 'every column-placed page must render exactly one Library link');
  assert.equal(links.length, 83);
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

// Expectation is derived from REAL_IDX.byRef[ref].kind -- fd_data.js's own per-item field,
// computed from each ref's extension -- NOT from the column's accent. In today's data the two
// coincide for every one of the 81 real refs (verified below), but the assertion is written
// against the field that is actually supposed to be load-bearing, so it will still catch a
// regression to accent-keying the day a column's contents stop being homogeneous (fix round 1
// review, 2026-08-16 -- the previous version of this test asserted against c.accent and could not
// have caught that regression).
test('real dots are keyed on the item\'s kind, and today that always agrees with its column\'s accent', () => {
  const html = F.fdLibrary(REAL_IDX);
  let sawTool = false, sawRead = false;
  for (const c of REAL_CUR.libraryColumns) {
    for (const ref of c.refs) {
      const kind = REAL_IDX.byRef[ref].kind;
      const m = html.match(new RegExp(
        '<button type="button" class="fd-collink" data-fd-open="' + ref.replace(/\./g, '\\.') +
        '">\\s*<span class="([^"]*)">'));
      assert.ok(m, `no rendered row for ${ref}`);
      // A rights reference is the ONE principled divergence: it keeps kind 'tool' so it still
      // loads from /tools/, but it reproduces no instrument, so it wears a plain dot and lives in
      // a content column rather than "Interactive tools" (Fresh Eyes Audit A3).
      const rights = REAL_IDX.byRef[ref].rights === true;
      const toolLike = kind === 'tool' && !rights;
      const expected = toolLike ? 'fd-collink__dot is-tool' : 'fd-collink__dot';
      assert.equal(m[1], expected, `${ref} (kind=${kind}, rights=${rights}, accent=${c.accent}) dot class`);
      // The data invariant, still checked so an UNprincipled divergence stays visible here.
      assert.equal(toolLike, c.accent === 'tool',
        `${ref}: kind=${kind} rights=${rights} but column accent=${c.accent} -- no longer agree`);
      if (toolLike) sawTool = true; else sawRead = true;
    }
  }
  assert.ok(sawTool && sawRead, 'fixture sanity: real data must exercise both dot states');
});

// ---- hints: one line under a tool's title ------------------------------------------------------
//
// 23–26 tools whose titles do not say what they do (The Interview Circle, The Interview Room,
// What Do You Say Next?, Interaction Cards…) shipped as bare titles in the only browse surface.
// A row renders its joined `hint` under the label; a row with none renders exactly as before.

test('a row with a hint renders it after the label; a row without one renders no hint span', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryHints = { 't1.html': 'Build a written exam from a descriptor bank.' };
  const html = F.fdLibrary(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN));
  assert.match(html, /fd-collink__label">Tool One<\/span><span class="fd-collink__hint">Build a written exam from a descriptor bank\.<\/span>/);
  const t2 = html.match(/data-fd-open="t2\.html">[\s\S]*?<\/button>/)[0];
  assert.doesNotMatch(t2, /fd-collink__hint/, 'no hint, no span — not an empty one');
});

test('a hint is escaped like every other interpolated string', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryHints = { 't1.html': '<img src=x onerror=1> & "quotes"' };
  const html = F.fdLibrary(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=1&gt; &amp; &quot;quotes&quot;/);
});

test('every real tool row carries a hint span, and no real hint carries an audience token', () => {
  const html = F.fdLibrary(REAL_IDX);
  let toolRows = 0;
  for (const c of REAL_CUR.libraryColumns) {
    for (const ref of c.refs) {
      if (REAL_IDX.byRef[ref].kind !== 'tool') continue;
      toolRows += 1;
      const row = html.match(new RegExp('data-fd-open="' + ref.replace(/\./g, '\\.') + '">[\\s\\S]*?</button>'));
      assert.ok(row, `no rendered row for ${ref}`);
      const hint = row[0].match(/<span class="fd-collink__hint">([^<]*)<\/span>/);
      assert.ok(hint, `${ref} must render its hint`);
      assert.doesNotMatch(hint[1], AUDIENCE_TOKEN_RE, `${ref}'s hint ships to both sites: ${hint[1]}`);
    }
  }
  assert.ok(toolRows >= 20, `fixture sanity: ${toolRows} tool rows`);
  for (const [ref, hint] of Object.entries(REAL_CUR.libraryHints || {})) {
    assert.doesNotMatch(hint, AUDIENCE_TOKEN_RE, `${ref}'s hint ships to both sites: ${hint}`);
  }
});

// ---- Essentials renderer -------------------------------------------------------------------

test('Essentials uses reading rows, open native groups, a section index rail and a separate tool group', () => {
  const idx = {columns: IDX.columns, teachingResources:[
    {id:'family-therapy-companion',title:'Family Therapy Seminar Companion',description:'Practice a structured family meeting with de-identified teaching cases.',url:'https://family-therapy-seminar-companion.netlify.app/',note:'Answers stay on this device. Do not enter names or identifying details.'},
  ], essentials:[{name:'First <group>',items:[
    {ref:'read.md',title:'Title <one>',summary:'A & B',minutes:7,kind:'md',governance:{status:'pending'}},
    {ref:'tool.html',title:'Tool <one>',hint:'Use this when A & B.',kind:'tool'},
    {ref:'second.html',title:'Second tool',hint:'Compare the next step.',kind:'tool'}]}]};
  const calls=[];
  const G=make((g,o)=>{calls.push([g,o]); return g?.status==='pending'?'<span class="pending-test"></span>':'';});
  const html=G.fdEssentials(idx);
  assert.match(html, /<section class="fd-library fd-kit">/);
  assert.match(html, />Core readings<\/h1>/);
  assert.match(html, />1 readings · 2 tools<\/span>/);
  assert.match(html, /<nav class="fd-kit__index" aria-label="Essentials sections">/);
  assert.match(html, /data-fd-kit-section="all"[^>]*aria-pressed="true"/);
  assert.match(html, />All<\/span><span class="fd-kit__index-count">3<\/span>/);
  assert.match(html, />First &lt;group&gt;<\/span><span class="fd-kit__index-count">1<\/span>/);
  assert.match(html, />Tools<\/span><span class="fd-kit__index-count">2<\/span>/);
  assert.doesNotMatch(html, /<select|<option/);
  assert.equal((html.match(/<details class="fd-kit__group/g)||[]).length,2);
  assert.equal((html.match(/data-fd-kit-section=/g)||[]).length,3);
  assert.match(html, /role="tablist" aria-label="Preview tools"/);
  assert.equal((html.match(/role="tab"/g)||[]).length,2);
  assert.match(html, /data-fd-kit-tool="tool.html"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(html, /data-fd-kit-tool="second.html"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  assert.match(html, /role="tabpanel"[^>]*aria-labelledby="fd-kit-tool-tab-0"/);
  assert.match(html, /Tool &lt;one&gt;<\/h3><p>Use this when A &amp; B\.<\/p>/);
  assert.match(html, /data-fd-open="tool.html"[^>]*aria-label="Open Tool &lt;one&gt;"/);
  assert.match(html, /Title &lt;one&gt;/); assert.match(html,/A &amp; B/); assert.match(html,/7 min/);
  assert.match(html, /Faculty re-review in progress — 1 of 1 readings changed since they were last attested ·/); assert.match(html, /<summary>What that means<\/summary>/);
  assert.match(html, /Everything \(10 pages\) →/);
  assert.doesNotMatch(html, /fd-kit__care|Patient care resources/);
  assert.match(html, /class="fd-kit__teaching"[^>]*aria-label="External teaching companion"/);
  assert.match(html, /href="https:\/\/family-therapy-seminar-companion\.netlify\.app\/"/);
  assert.match(html, /Family Therapy Seminar Companion <span class="fd-visually-hidden">\(opens in a new tab\)<\/span>/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /Family Therapy Seminar Companion/);
  assert.match(html, /Answers stay on this device\. Do not enter names or identifying details\./);
  assert.deepEqual(calls[0][1],{compact:true});
  const filtered=G.fdEssentials(idx,{kitSection:'0'});
  assert.match(filtered,/data-fd-kit-section="0"[^>]*aria-pressed="true"/);
  assert.match(filtered,/data-fd-kit-section="all"[^>]*aria-pressed="false"/);
  assert.match(filtered,/data-fd-open="read.md"/); assert.doesNotMatch(filtered,/data-fd-open="tool.html"/);
  const tools=G.fdEssentials(idx,{kitSection:'tools'});
  assert.match(tools,/data-fd-open="tool.html"/); assert.doesNotMatch(tools,/data-fd-open="read.md"/);
  const second=G.fdEssentials(idx,{kitSection:'tools',kitToolPreview:'second.html'});
  assert.match(second,/data-fd-kit-tool="second.html"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(second,/Second tool<\/h3><p>Compare the next step\.<\/p>/);
  assert.match(second,/data-fd-open="second.html"[^>]*aria-label="Open Second tool"/);
  assert.equal(G.fdEssentials(idx,{kitSection:'tools',kitToolPreview:'missing.html'}),tools);
  assert.equal(G.fdEssentials(idx,{kitSection:'unknown'}),html);
});

test('zero resolved Essentials falls back exactly to full Library with no dead return control', () => {
  for(const essentials of [[],[{name:'Empty',items:[]}]]) {
    const empty={columns:IDX.columns,essentials};
    assert.equal(F.fdEssentials(empty), F.fdLibrary(empty));
    assert.doesNotMatch(F.fdLibrary(empty),/data-fd-library-view="essentials"/);
  }
});

test('full Library return control appears only for resolved Essentials', () => {
  const html=F.fdLibrary({...IDX,essentials:[{name:'One',items:[IDX.columns[0].items[0]]}]});
  assert.match(html,/data-fd-library-view="essentials">← The Essentials<\/button>/);
});

test('fdEssentials is pure and does not mutate its index', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.essentials = [{ name: 'Kit', accent: 'topic', refs: ['m1.md', 'm2.md'] }];
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  const before = JSON.stringify(idx);
  assert.equal(F.fdEssentials(idx), F.fdEssentials(idx));
  assert.equal(JSON.stringify(idx), before);
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

for (const [site, expectedKit, expectedFull] of [['ms3', 30, 83], ['res', 35, 93]]) {
  test(`${site}: real Essentials renders ${expectedKit} reading and tool choices and links to all ${expectedFull} pages`, () => {
    const payload = projected[site];
    const idx = F.fdBuildIndex(payload.curriculum, REAL_META, REAL_TOOLS, payload.manifest);
    const html = F.fdEssentials(idx);
    assert.equal((html.match(/class="fd-kit__reading"/g) || []).length+
      (html.match(/data-fd-kit-tool="/g) || []).length, expectedKit);
    assert.match(html, new RegExp('fd-library__count\">' + (site==='ms3'?23:26) + ' readings · ' + (site==='ms3'?7:9) + ' tools'));
    assert.equal((html.match(/<details class=\"fd-kit__group/g)||[]).length,site==='ms3'?8:7);
    assert.equal((html.match(/data-fd-kit-section=/g)||[]).length,site==='ms3'?9:8);
    assert.doesNotMatch(html,/governance-badge/);
    const pending=idx.essentials.flatMap(c=>c.items).filter(i=>i.kind!=='tool'&&i.governance?.status==='pending').length;
    assert.match(html,new RegExp('— '+pending+' of '+(site==='ms3'?23:26)+' readings'));
    const compact=make((g,o)=>g?.status==='pending'&&o?.compact?'<span class=\"dot-test\"></span>':'').fdEssentials(idx);
    assert.equal((compact.match(/dot-test/g)||[]).length,pending);
    assert.match(html, new RegExp('data-fd-library-view="full">Everything \\(' + expectedFull + ' pages\\) →'));
  });
}

test('the live Library shell selects kit by default and the complete renderer only for full', () => {
  const shell = read('spa_index.html');
  assert.match(shell, /fdEssentials\(FD_INDEX,\{kitSection:state\.kitSection,kitToolPreview:state\.kitToolPreview,week:live\.week\}\)/,
    'the live shell must pass the selected tool through to the pure Essentials renderer');
  const branch = /if\(state\.tab==='library'\) return (fdSurface\('library',function\(\)\{[^\n]+\}\));/.exec(shell);
  assert.ok(branch,'Library shell branch remains a shared pure renderer call');
  const run = new Function('state','FD_INDEX','fdSurface','fdLibrary','fdEssentials',`var live=state; return ${branch[1]};`);
  const surface = (_name,render) => render();
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{name:'Kit',accent:'topic',refs:['m1.md']}];
  const idx = F.fdBuildIndex(cur,FIX_META,FIX_TOOLS,FIX_MAN);
  for (const libraryView of [undefined,'essentials']) {
    assert.equal(run({tab:'library',libraryView},idx,surface,F.fdLibrary,F.fdEssentials),F.fdEssentials(idx));
  }
  assert.equal(run({tab:'library',libraryView:'full'},idx,surface,F.fdLibrary,F.fdEssentials),F.fdLibrary(idx));
});

test('compact shared badge retains normal behavior and names pending dots accessibly', () => {
  const src=read('spa_index.html');
  const body=src.slice(src.indexOf('  function governanceBadge('),src.indexOf('  /* Report whether the alert'));
  const badge=new Function(body+';return governanceBadge;')();
  for(const g of [null,{status:'reviewed'}]) assert.equal(badge(g,{compact:true}),'');
  const g={status:'pending',riskLevel:'high'};
  assert.match(badge(g),/governance-badge high/);
  assert.doesNotMatch(badge(g,{compact:true}),/governance-badge/);
  assert.match(badge(g,{compact:true}),/role="img" aria-label="Awaiting faculty re-review"/);
});

// This week is an intersection of the active Path and the existing Essentials readings.
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

const renderedRefs = html => [...html.matchAll(/data-fd-open="([^"]+)"/g)].map(match => match[1]);

test('This week counts only matching Essentials readings and preserves their section order', () => {
  const idx = weeklyFixture(), before = JSON.stringify(idx);
  const all = F.fdEssentials(idx, { week: 1 });
  assert.match(all, /data-fd-kit-section="week"[^>]*aria-pressed="false"[^>]*><span>This week<\/span><span class="fd-kit__index-count">2<\/span>/);
  assert.deepEqual(renderedRefs(all), ['m2.md', 'm1.md', 's1.md', 'm3.md', 't1.html']);
  const filtered = F.fdEssentials(idx, { week: 1, kitSection: 'week' });
  assert.match(filtered, /data-fd-kit-section="week"[^>]*aria-pressed="true"[^>]*><span>This week<\/span><span class="fd-kit__index-count">2<\/span>/);
  assert.deepEqual(renderedRefs(filtered), ['m1.md', 's1.md']);
  assert.equal((filtered.match(/<details class="fd-kit__group" open>/g) || []).length, 2);
  assert.equal((filtered.match(/fd-kit__group-count">1 readings/g) || []).length, 2);
  assert.doesNotMatch(filtered, /fd-kit__tools/);
  assert.match(filtered, /Everything \(10 pages\)/);
  assert.equal(JSON.stringify(idx), before, 'weekly filtering cannot mutate Path or Essentials');
});

test('This week drops empty groups and changes with the actual current week', () => {
  const html = F.fdEssentials(weeklyFixture(), { week: 2, viewWeek: 1, kitSection: 'week' });
  assert.deepEqual(renderedRefs(html), ['m2.md']);
  assert.match(html, />This week<\/span><span class="fd-kit__index-count">1<\/span>/);
  assert.doesNotMatch(html, /<summary>Second /);
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
    const readings = payload.curriculum.essentials.flatMap(group => group.refs).filter(ref => ref.endsWith('.md'));
    let exercised = 0;
    for (const week of payload.curriculum.weeks) {
      const assigned = new Set(week.items.map(item => item.ref));
      const expected = readings.filter(ref => assigned.has(ref));
      const html = F.fdEssentials(idx, { week: week.n, kitSection: 'week' });
      if (expected.length) {
        exercised++;
        assert.deepEqual(renderedRefs(html), expected, `week ${week.n}`);
        assert.match(html, new RegExp('>This week<\\/span><span class="fd-kit__index-count">' + expected.length + '<'));
      } else {
        assert.doesNotMatch(html, /data-fd-kit-section="week"/);
        assert.deepEqual(renderedRefs(html), renderedRefs(F.fdEssentials(idx)));
      }
    }
    assert.ok(exercised > 0, 'real weekly intersections must actually be checked');
  });
}

test('the live shell passes the actual week to Essentials rather than the browsed Path week', () => {
  const shell = read('spa_index.html');
  const branch = /if\(state\.tab==='library'\) return (fdSurface\('library',function\(\)\{[^\n]+\}\));/.exec(shell);
  const run = new Function('state','live','FD_INDEX','fdSurface','fdLibrary','fdEssentials', `return ${branch[1]};`);
  const idx = weeklyFixture(), state = { tab: 'library', viewWeek: 1, kitSection: 'week' };
  const render = live => run(state,live,idx,(_name,paint)=>paint(),F.fdLibrary,F.fdEssentials);
  assert.deepEqual(renderedRefs(render({ week: 2, viewWeek: 1 })), ['m2.md']);
  assert.deepEqual(renderedRefs(render({ viewWeek: 1 })), renderedRefs(F.fdEssentials(idx)));
});
