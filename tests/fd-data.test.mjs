// Contract for the front-door join layer. Evaluates the real snippet body via new Function,
// following tests/fd-state.test.mjs. Exercised against BOTH a small fixture (for shape) and the
// repo's REAL curriculum.json + topic_meta.json (for the join actually holding on live data) --
// a fixture-only suite would not have caught a topic_meta field being renamed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const src = readFileSync(new URL(`${BUILD}/frontdoor/fd_data.js`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${src}
  return { fdEsc: fdEsc, fdBuildIndex: fdBuildIndex, fdItemsForWeek: fdItemsForWeek,
           fdLibraryOnlyReads: fdLibraryOnlyReads };
`);
const F = make();

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const CUR = readJson('../curriculum.json');
const META = readJson('../topic_meta.json');
const TOOLS = readJson('../tool_registry.json');

const FIX_CUR = {
  weeks: [{ n: 1, title: 'W1', theme: 'T1', items: [{ ref: 'a.md', kind: 'read' }] },
          { n: 2, title: 'W2', theme: 'T2', items: [] }, { n: 3, title: 'W3', theme: 'T3', items: [] },
          { n: 4, title: 'W4', theme: 'T4', items: [] }, { n: 5, title: 'W5', theme: 'T5', items: [] },
          { n: 6, title: 'W6', theme: 'T6', items: [] }],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['a.md', 'b.md'] }],
  libraryExclude: [],
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

test('fdEsc escapes every character that could break out of markup', () => {
  assert.equal(F.fdEsc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
});

test('fdEsc coerces null and undefined to an empty string rather than printing them', () => {
  assert.equal(F.fdEsc(null), '');
  assert.equal(F.fdEsc(undefined), '');
});

test('an item joins minutes, summary, points and attestation from topic_meta', () => {
  const i = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS).byRef['a.md'];
  assert.equal(i.minutes, 6);
  assert.equal(i.summary, 'Summary A');
  assert.deepEqual(i.points, ['p1', 'p2']);
  assert.equal(i.attested, true);
  assert.equal(i.toolRef, 't.html');
});

test('a page with no topic_meta entry still yields a usable item', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('orphan.md');
  const i = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS).byRef['orphan.md'];
  assert.equal(i.minutes, null, 'missing metadata must degrade, not throw');
  assert.equal(i.summary, '');
  assert.deepEqual(i.points, []);
  assert.equal(i.attested, false);
});

test('attested is true only for facultyReview.status "reviewed"', () => {
  for (const [status, expected] of [['reviewed', true], ['pending', false], ['draft', false], ['retired', false]]) {
    const meta = { 'a.md': { read: 1, tldr: 'x', facultyReview: { status } } };
    assert.equal(F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS).byRef['a.md'].attested, expected, status);
  }
});

test('href routes by kind so deep links keep working', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS);
  assert.equal(idx.byRef['a.md'].href, '?page=a.md');
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('t.html');
  assert.equal(F.fdBuildIndex(cur, FIX_META, FIX_TOOLS).byRef['t.html'].href, '?tool=t.html');
});

test('a tool item takes its title and risk from tool_registry', () => {
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('t.html');
  const i = F.fdBuildIndex(cur, FIX_META, FIX_TOOLS).byRef['t.html'];
  assert.equal(i.title, 'Tool T');
  assert.equal(i.risk, 'high');
  assert.equal(i.kind, 'tool');
});

test('weeks carry resolved items in curriculum order', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS);
  assert.equal(idx.weeks.length, 6);
  assert.equal(idx.weeks[0].items[0].ref, 'a.md');
  assert.equal(idx.weeks[0].items[0].summary, 'Summary A', 'week items must be joined, not bare refs');
});

test('the kit carries its subtitle alongside the resolved item', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS);
  assert.equal(idx.kit[0].sub, 'Sub line');
  assert.equal(idx.kit[0].item.ref, 'a.md');
});

test('fdItemsForWeek returns that week only, and [] for an unknown week', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS);
  assert.equal(F.fdItemsForWeek(idx, 1).length, 1);
  assert.deepEqual(F.fdItemsForWeek(idx, 9), []);
});

test('fdLibraryOnlyReads excludes week items and excludes tools', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS);
  const refs = F.fdLibraryOnlyReads(idx).map((i) => i.ref);
  assert.ok(refs.indexOf('b.md') !== -1, 'b.md is in a column but no week');
  assert.ok(refs.indexOf('a.md') === -1, 'a.md is a week item');
});

// ---- against the REAL repo data -----------------------------------------------------

test('the real curriculum joins without throwing and resolves every week item', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS);
  assert.equal(idx.weeks.length, 6);
  let n = 0;
  for (const w of idx.weeks) {
    for (const it of w.items) {
      assert.ok(it.title, `week ${w.n} item ${it.ref} has no title`);
      assert.ok(it.href.indexOf('?') === 0, `week ${w.n} item ${it.ref} has no route`);
      n += 1;
    }
  }
  assert.equal(n, 40, 'expected the 40 week items curriculum.json ships');
});

test('every real library column item resolves to a titled item', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS);
  let placed = 0;
  for (const c of idx.columns) {
    for (const it of c.items) {
      assert.ok(it.title, `${c.name}: ${it.ref} has no title`);
      placed += 1;
    }
  }
  assert.equal(placed, 81, 'expected the 81 pages curriculum.json places');
});

test('all five real kit items are attested and carry safety steps', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS);
  assert.equal(idx.kit.length, 5);
  for (const k of idx.kit) {
    assert.equal(k.item.attested, true, `${k.item.ref} must be attested to appear in the kit`);
    assert.ok(META[k.item.ref].safetySteps.length >= 3, `${k.item.ref} needs safetySteps`);
  }
});
