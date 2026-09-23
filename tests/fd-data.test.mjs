// Contract for the front-door join layer. Evaluates the real snippet body via new Function,
// following tests/fd-state.test.mjs. Exercised against BOTH a small fixture (for shape) and the
// repo's REAL curriculum.json + SOURCE topic_meta.json (for the join actually holding on live
// data) -- a fixture-only suite would not have caught a topic_meta field being renamed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const src = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${src}
  return { fdEsc: fdEsc, fdBuildIndex: fdBuildIndex, fdItemsForWeek: fdItemsForWeek,
           fdFindWeek: fdFindWeek, fdLibraryOnlyReads: fdLibraryOnlyReads,
           fdPathWeekCount: fdPathWeekCount, fdNextWeek: fdNextWeek,
           fdActivePathValid: fdActivePathValid };
`);
const F = make();

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const CUR = readJson('../curriculum.json');

test('the resident audience offers APPs an explicit role without changing MS3 choices', () => {
  assert.deepEqual(CUR.roles.ms3.map((role) => role.id), ['student', 'subi', 'staff']);
  assert.deepEqual(CUR.roles.resident.map((role) => role.id), ['pgy1', 'pgy2', 'app', 'staff']);
  assert.equal(CUR.roles.resident.find((role) => role.id === 'app').name, 'APP / PA / NP');
});
// The SOURCE topic_meta.json. The BUILT copy may demote a drifted page's facultyReview to
// `pending` (attestation_hash.project_topic_meta_faculty_review), so the attestation premises
// below are facts about the faculty's own record, not about what either site serves today.
const META = readJson('../topic_meta.json');
const TOOLS = readJson('../tool_registry.json');
const MAN = readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json');
const realMs3Projection = () => {
  assert.ok(CUR.learningPaths, 'real curriculum must define learningPaths');
  return {
    ...CUR,
    path: { id: 'ms3-six-week', weekCount: 6 },
    weeks: CUR.learningPaths.ms3.weeks,
  };
};

const FIX_CUR = {
  path: { id: 'resident-four-week', weekCount: 4 },
  weeks: [
    { n: 1, title: 'W1', theme: 'T1', focusCategories: ['safety'],
      items: [{ ref: 'a.md', kind: 'read' }] },
    { n: 2, title: 'W2', theme: 'T2', focusCategories: ['mood'], items: [] },
    { n: 3, title: 'W3', theme: 'T3', focusCategories: ['ethics'], items: [] },
    { n: 4, title: 'W4', theme: 'T4', focusCategories: ['relational'], items: [] },
  ],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['a.md', 'b.md'] }],
  libraryExclude: [],
  careResources: [
    { id: 'resource-finder', title: 'Find services and community supports',
      description: 'Treatment, housing, food, transportation, and family supports.',
      group: 'support',
      url: 'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html',
      searchTerms: ['community resources', 'housing help', 'transportation help'] },
    { id: 'meeting-calendar', title: 'Find a recovery meeting',
      description: 'Current recovery-meeting options from ReConnect.',
      group: 'support',
      url: 'https://reconnect-tools.netlify.app/tools/recovery-meeting-calendar.html',
      searchTerms: ['recovery meeting', 'aa meeting', 'na meeting'] },
  ],
  teachingResources: [
    { id: 'family-therapy-companion', title: 'Family Therapy Seminar Companion',
      description: 'Practice family-meeting structure with de-identified teaching cases.',
      url: 'https://family-therapy-seminar-companion.netlify.app/',
      note: 'Answers stay on this device. Do not enter names or identifying details.' },
  ],
  safetyKit: [{ ref: 'a.md', sub: 'Sub line' }],
  roles: { ms3: [], resident: [] },
  synonyms: {},
};
const FIX_META = {
  'a.md': { read: 6, tldr: 'Summary A', points: ['p1', 'p2'],
            facultyReview: { status: 'reviewed' }, relatedTools: ['t.html'] },
  'b.md': { read: 3, tldr: 'Summary B' },
};
const FIX_TOOLS = { tools: [{ file: 't.html', title: 'Tool T', category: 'acute-safety', riskLevel: 'high' }] };
const FIX_MAN = { tools: [['src/t.html', 't.html', 'Tool T']],
                  md: [['src/a.md', 'a.md', 'Page A'], ['src/b.md', 'b.md', 'Page B']] };

test('fdEsc escapes every character that could break out of markup', () => {
  assert.equal(F.fdEsc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
});

test('fdEsc coerces null and undefined to an empty string rather than printing them', () => {
  assert.equal(F.fdEsc(null), '');
  assert.equal(F.fdEsc(undefined), '');
});

test('active-path validity requires an identified, ordered, count-matched week sequence', () => {
  const valid = { path: { id: 'fixture', weekCount: 2 }, weeks: [
    { n: 1, title: 'One', focusCategories: [] },
    { n: 2, title: 'Two', focusCategories: ['mood'] },
  ] };
  assert.equal(F.fdActivePathValid(valid), true);
  for (const invalid of [
    { path: { id: '', weekCount: 2 }, weeks: valid.weeks },
    { path: { id: 'fixture', weekCount: 0 }, weeks: [] },
    { path: { id: 'fixture', weekCount: 1 }, weeks: valid.weeks },
    { path: { id: 'fixture', weekCount: 2 }, weeks: [valid.weeks[1], valid.weeks[0]] },
  ]) assert.equal(F.fdActivePathValid(invalid), false);
});

test('an item joins minutes, summary, points and attestation from topic_meta', () => {
  const i = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN).byRef['a.md'];
  assert.equal(i.minutes, 6);
  assert.equal(i.summary, 'Summary A');
  assert.deepEqual(i.points, ['p1', 'p2']);
  assert.equal(i.attested, true);
  assert.equal(i.toolRef, 't.html');
});

test('landing destinations resolve titles without becoming week items, Library rows or daily picks', () => {
  const cur = structuredClone(FIX_CUR);
  cur.weeks[0].landingRef = 'week1.md';
  const man = structuredClone(FIX_MAN);
  man.md.push(['', 'week1.md', 'Week 1 — Foundations & the MSE']);
  const index = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, man);
  assert.equal(index.byRef['week1.md']?.title, 'Week 1 — Foundations & the MSE');
  assert.equal(index.known['week1.md'], true);
  assert.equal(index.byRef['week1.md'].readerOnly, true);
  assert.deepEqual(index.weeks[0].items.map(item => item.ref), ['a.md']);
  assert.deepEqual(index.columns[0].items.map(item => item.ref), ['a.md', 'b.md']);
  assert.deepEqual(F.fdLibraryOnlyReads(index).map(item => item.ref), ['b.md']);
  cur.libraryColumns[0].refs.push('week1.md');
  const placed = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, man);
  assert.notEqual(placed.byRef['week1.md'].readerOnly, true);
  assert.deepEqual(F.fdLibraryOnlyReads(placed).map(item => item.ref), ['b.md', 'week1.md']);
});

test('a page with no topic_meta entry still yields a usable item', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('orphan.md');
  const i = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN).byRef['orphan.md'];
  assert.equal(i.minutes, null, 'missing metadata must degrade, not throw');
  assert.equal(i.summary, '');
  assert.deepEqual(i.points, []);
  assert.equal(i.attested, false);
});

test('attested is true only for facultyReview.status "reviewed"', () => {
  for (const [status, expected] of [['reviewed', true], ['pending', false], ['draft', false], ['retired', false]]) {
    const meta = { 'a.md': { read: 1, tldr: 'x', facultyReview: { status } } };
    assert.equal(F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN).byRef['a.md'].attested, expected, status);
  }
});

test('href routes by kind so deep links keep working', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.byRef['a.md'].href, '?page=a.md');
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('t.html');
  assert.equal(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN).byRef['t.html'].href, '?tool=t.html');
});

test('a tool item takes its title and risk from tool_registry', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('t.html');
  const i = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN).byRef['t.html'];
  assert.equal(i.title, 'Tool T');
  assert.equal(i.risk, 'high');
  assert.equal(i.kind, 'tool');
});

test('a projected four-field manifest entry supplies its exact governance triplet while canonical triples degrade to null', () => {
  const projected = {
    tools: [['src/t.html', 't.html', 'Tool T', { status: 'pending', riskKind: 'clinical', riskLevel: 'high' }]],
    md: [['src/a.md', 'a.md', 'Page A', { status: 'pending', riskKind: 'general', riskLevel: 'low' }],
         ['src/b.md', 'b.md', 'Page B']],
  };
  const curriculum = JSON.parse(JSON.stringify(FIX_CUR));
  curriculum.libraryColumns[0].refs.push('t.html');
  const idx = F.fdBuildIndex(curriculum, FIX_META, FIX_TOOLS, projected);

  assert.deepEqual(idx.byRef['a.md'].governance,
    { status: 'pending', riskKind: 'general', riskLevel: 'low' });
  assert.deepEqual(idx.byRef['t.html'].governance,
    { status: 'pending', riskKind: 'clinical', riskLevel: 'high' });
  assert.equal(idx.byRef['b.md'].governance, null);
  assert.equal(idx.byRef['a.md'].title, 'Page A');
  assert.equal(idx.byRef['t.html'].kind, 'tool');
});

test('weeks carry resolved items in curriculum order', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.deepEqual(idx.path, { id: 'resident-four-week', weekCount: 4 });
  assert.deepEqual(idx.weeks[0].focusCategories, ['safety']);
  assert.equal(F.fdPathWeekCount(idx), 4);
  assert.equal(F.fdNextWeek(idx, 3).n, 4);
  assert.equal(F.fdNextWeek(idx, 4), null);
  assert.equal(idx.weeks.length, 4);
  assert.equal(idx.weeks[0].items[0].ref, 'a.md');
  assert.equal(idx.weeks[0].items[0].summary, 'Summary A', 'week items must be joined, not bare refs');
});

test('the kit carries its subtitle alongside the resolved item', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.kit[0].sub, 'Sub line');
  assert.equal(idx.kit[0].item.ref, 'a.md');
});

test('patient-care resources join as a defensive copy outside the shipped-page inventory', () => {
  const cur = structuredClone(FIX_CUR);
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.deepEqual(idx.careResources, FIX_CUR.careResources);
  assert.notStrictEqual(idx.careResources, cur.careResources);
  assert.notStrictEqual(idx.careResources[0].searchTerms, cur.careResources[0].searchTerms);
  assert.equal(idx.careResources[0].group, 'support');
  assert.equal(idx.byRef['resource-finder'], undefined,
    'an external link must not masquerade as a shipped or attestable Clerkship page');
  idx.careResources[0].searchTerms.push('mutated');
  assert.doesNotMatch(JSON.stringify(cur), /mutated/);
});

test('external teaching resources join defensively without becoming shipped pages', () => {
  const cur = structuredClone(FIX_CUR);
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.deepEqual(idx.teachingResources, FIX_CUR.teachingResources);
  assert.notStrictEqual(idx.teachingResources, cur.teachingResources);
  assert.equal(idx.byRef['family-therapy-companion'], undefined);
});

test('the real curriculum exposes the same five canonical care resources to both site projections', () => {
  for (const site of ['ms3', 'resident']) {
    const sourcePath = CUR.learningPaths[site];
    const projected = { ...CUR, path: { id: sourcePath.id, weekCount: sourcePath.weeks.length },
      weeks: sourcePath.weeks };
    const idx = F.fdBuildIndex(projected, META, TOOLS, MAN);
    assert.deepEqual(idx.careResources.map(({ id, url }) => ({ id, url })), [
      { id: 'resource-finder', url: 'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html' },
      { id: 'meeting-calendar', url: 'https://reconnect-tools.netlify.app/tools/recovery-meeting-calendar.html' },
      { id: 'education-library', url: 'https://mental-health-education-library.netlify.app/patient' },
      { id: 'podcast-navigator', url: 'https://reconnect-tools.netlify.app/tools/podcast-navigator.html' },
      { id: 'book-shelf', url: 'https://reconnect-tools.netlify.app/tools/relational-bibliotherapy.html' },
    ], site);
    assert.deepEqual(idx.teachingResources.map(({ id, url }) => ({ id, url })), [
      { id: 'family-therapy-companion', url: 'https://family-therapy-seminar-companion.netlify.app/' },
    ], site);
  }
});

test('fdItemsForWeek returns that week only, and [] for an unknown week', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(F.fdItemsForWeek(idx, 1).length, 1);
  assert.deepEqual(F.fdItemsForWeek(idx, 9), []);
});

// fdFindWeek: the week-metadata lookup shared by fd_today.js (the student's current week) and
// fd_path.js (whichever week is being viewed) -- hoisted here in Task 5 review so there is one
// lookup instead of two identical copies.
test('fdFindWeek returns the matching week object, title and all', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  const w = F.fdFindWeek(idx, 1);
  assert.equal(w.n, 1);
  assert.equal(w.title, 'W1');
  assert.equal(w.theme, 'T1');
});

test('fdFindWeek returns null for an unknown week, and for a missing/empty index', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(F.fdFindWeek(idx, 9), null);
  assert.equal(F.fdFindWeek(null, 1), null);
  assert.equal(F.fdFindWeek({}, 1), null);
});

test('fdLibraryOnlyReads excludes week items and excludes tools', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  const refs = F.fdLibraryOnlyReads(idx).map((i) => i.ref);
  assert.ok(refs.indexOf('b.md') !== -1, 'b.md is in a column but no week');
  assert.ok(refs.indexOf('a.md') === -1, 'a.md is a week item');
});

// ---- against the REAL repo data -----------------------------------------------------

test('titles resolve to the real page names, not to the slug', () => {
  const idx = F.fdBuildIndex(realMs3Projection(), META, TOOLS, MAN);
  // Asserting against known titles rather than truthiness: `title` falls back to `ref`, which is
  // always truthy, so assert.ok(it.title) passes even when every title is broken.
  assert.equal(idx.byRef['pg_suicide.md'].title, 'Suicide Risk & Safety Card');
  assert.equal(idx.byRef['mse.html'].title, 'Mental Status Exam');
});

test('no real item falls back to its slug as a title', () => {
  const idx = F.fdBuildIndex(realMs3Projection(), META, TOOLS, MAN);
  const fellBack = Object.keys(idx.byRef).filter((r) => idx.byRef[r].title === r);
  assert.deepEqual(fellBack, [],
    `every placed page is in site_manifest.json, so none should degrade to its slug: ${fellBack}`);
});

test('the real curriculum joins without throwing and routes every week item', () => {
  const idx = F.fdBuildIndex(realMs3Projection(), META, TOOLS, MAN);
  assert.equal(idx.path.id, 'ms3-six-week');
  assert.equal(idx.weeks.length, 6);
  let n = 0;
  for (const w of idx.weeks) {
    for (const it of w.items) {
      assert.ok(it.href.indexOf('?') === 0, `week ${w.n} item ${it.ref} has no route`);
      n += 1;
    }
  }
  // 39 = 40 minus cssrs.html, which left Week 5 on 2026-09-16: a rights reference is a Library
  // row, not a path step (tests/path-rights-references.test.mjs).
  assert.equal(n, 39, 'expected the 39 week items curriculum.json ships');
});

test('every real library column item resolves', () => {
  const idx = F.fdBuildIndex(realMs3Projection(), META, TOOLS, MAN);
  let placed = 0;
  for (const c of idx.columns) placed += c.items.length;
  // 83 = 81 + the two 2026-08-21 therapy-curriculum pages (therapy_on_the_unit.md,
  // therapy_reading_room.md) placed in the Clinical-skills and Evidence-&-exam columns.
  assert.equal(placed, 83, 'expected the 83 pages curriculum.json places');
});

// Source-copy premise: these five are attested in topic_meta.json. On a site whose build found
// their sources drifted, the BUILT registry reads pending and the Front Door drops the attested
// affordance -- that projection is pinned in tests/attestation-projection-build.test.mjs.
test('all five real kit items are attested and carry safety steps', () => {
  const idx = F.fdBuildIndex(realMs3Projection(), META, TOOLS, MAN);
  assert.equal(idx.kit.length, 5);
  for (const k of idx.kit) {
    assert.equal(k.item.attested, true, `${k.item.ref} must be attested to appear in the kit`);
    assert.ok(META[k.item.ref].safetySteps.length >= 3, `${k.item.ref} needs safetySteps`);
  }
});

// ---- libraryHints: the one-line "use this when…" a Library tool row carries ------------------

test('an item joins its libraryHints line as `hint`, and a ref with none reads as empty', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryHints = { 'a.md': 'Read this first.', 'ghost.html': 'never placed' };
  const idx = F.fdBuildIndex(cur, {}, { tools: [] }, { tools: [], md: [['s', 'a.md', 'A']] });
  assert.equal(idx.byRef['a.md'].hint, 'Read this first.');
  const bare = F.fdBuildIndex(FIX_CUR, {}, { tools: [] }, { tools: [], md: [['s', 'a.md', 'A']] });
  assert.equal(bare.byRef['a.md'].hint, '', 'no libraryHints block at all still joins cleanly');
  assert.equal(typeof bare.byRef['a.md'].hint, 'string');
});

test('every real column-placed tool carries a hint, and every hint names a placed tool', () => {
  // The contract validate_curriculum.py enforces at build time, pinned here so it also turns
  // `node --test` red: a tool without its one-line hint is a bare title in the only browse
  // surface, and a hint for a ref no column places is copy nobody can read.
  const idx = F.fdBuildIndex(realMs3Projection(), META, TOOLS, MAN);
  const placedTools = [];
  for (const c of idx.columns) for (const it of c.items) if (it.kind === 'tool') placedTools.push(it.ref);
  assert.ok(placedTools.length >= 20, `fixture sanity: the real Library places ${placedTools.length} tools`);
  for (const ref of placedTools) {
    const hint = idx.byRef[ref].hint;
    assert.ok(hint && hint.trim().length >= 20, `${ref} needs a one-line hint (got ${JSON.stringify(hint)})`);
    assert.ok(hint.length <= 110, `${ref}'s hint must stay one line (${hint.length} chars)`);
  }
  const placedEverywhere = new Set(placedTools);
  for (const addition of (CUR.siteLibrary.resident.additions || [])) for (const ref of addition.refs) placedEverywhere.add(ref);
  for (const ref of Object.keys(CUR.libraryHints || {})) {
    assert.ok(placedEverywhere.has(ref), `libraryHints names ${ref}, which no Library column places`);
  }
});

// ---- Essentials: a resolved view over the canonical audience projection -----------------

test('Essentials resolves known refs in authored order, reuses canonical items, and counts drops', () => {
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [
    { name: 'Second & first', accent: 'safety', refs: ['b.md', 'missing.md', 'a.md'] },
    { name: 'Tool', accent: 'tool', refs: ['t.html'] },
  ];
  const before = structuredClone(cur);
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.deepEqual(idx.essentials.map(col => ({
    name: col.name, accent: col.accent, refs: col.items.map(item => item.ref),
  })), [
    { name: 'Second & first', accent: 'safety', refs: ['b.md', 'a.md'] },
    { name: 'Tool', accent: 'tool', refs: [] },
  ]);
  assert.strictEqual(idx.essentials[0].items[0], idx.byRef['b.md']);
  assert.strictEqual(idx.essentials[0].items[1], idx.byRef['a.md']);
  assert.equal(idx.essentialsDropped, 2);
  assert.equal(idx.byRef['missing.md'], undefined, 'an unknown essential must never enter byRef');
  assert.equal(idx.byRef['t.html'], undefined, 'known-to-manifest but unplaced must not be ensured by Essentials');
  assert.deepEqual(cur, before, 'building the view must not mutate the projected curriculum');
});

test('a missing Essentials array degrades to an empty view with a numeric zero drop count', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.deepEqual(idx.essentials, []);
  assert.equal(idx.essentialsDropped, 0);
});

const ROOT = new URL('../', import.meta.url);
const projections = JSON.parse(execFileSync('python3', ['-B', '-c', `
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
`], { cwd: ROOT, encoding: 'utf8' }));

for (const [site, expectedKit, expectedFull] of [['ms3', 30, 83], ['res', 35, 93]]) {
  test(`${site}: real projected Essentials resolves ${expectedKit} of ${expectedFull} Library pages`, () => {
    const payload = projections[site];
    const idx = F.fdBuildIndex(payload.curriculum, META, TOOLS, payload.manifest);
    const actual = idx.essentials.reduce((n, col) => n + col.items.length, 0);
    const full = idx.columns.reduce((n, col) => n + col.items.length, 0);
    assert.equal(actual, expectedKit);
    assert.equal(full, expectedFull);
    assert.equal(idx.essentialsDropped, 0);
    assert.deepEqual(idx.essentials.map(col => col.items.map(item => item.ref)),
      payload.curriculum.essentials.map(col => col.refs), 'projection order must be display order');
    for (const col of idx.essentials) for (const item of col.items) {
      assert.strictEqual(item, idx.byRef[item.ref], `${item.ref} must reuse its canonical object`);
      assert.ok(item.title && item.kind && item.href, `${item.ref} keeps joined display metadata`);
    }
  });
}

test('inherited object names are unresolved Essentials refs and preserve the canonical index', () => {
  const canonical = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  const cur = structuredClone(FIX_CUR);
  cur.essentials = [{name:'Unresolved', accent:'topic', refs:['__proto__','constructor','toString']}];
  const idx = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.deepEqual(idx.essentials[0].items, []);
  assert.equal(idx.essentialsDropped, 3);
  for (const key of Object.keys(canonical).filter(key => !key.startsWith('essentials'))) {
    assert.deepEqual(idx[key], canonical[key], `${key} must remain the canonical index`);
  }
});
