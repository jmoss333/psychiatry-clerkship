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
           fdFindWeek: fdFindWeek, fdLibraryOnlyReads: fdLibraryOnlyReads };
`);
const F = make();

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const CUR = readJson('../curriculum.json');
const META = readJson('../topic_meta.json');
const TOOLS = readJson('../tool_registry.json');
const MAN = readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json');

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
const FIX_MAN = { tools: [['src/t.html', 't.html', 'Tool T']],
                  md: [['src/a.md', 'a.md', 'Page A'], ['src/b.md', 'b.md', 'Page B']] };

test('fdEsc escapes every character that could break out of markup', () => {
  assert.equal(F.fdEsc('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
});

test('fdEsc coerces null and undefined to an empty string rather than printing them', () => {
  assert.equal(F.fdEsc(null), '');
  assert.equal(F.fdEsc(undefined), '');
});

test('an item joins minutes, summary, points and attestation from topic_meta', () => {
  const i = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN).byRef['a.md'];
  assert.equal(i.minutes, 6);
  assert.equal(i.summary, 'Summary A');
  assert.deepEqual(i.points, ['p1', 'p2']);
  assert.equal(i.attested, true);
  assert.equal(i.toolRef, 't.html');
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

test('weeks carry resolved items in curriculum order', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.weeks.length, 6);
  assert.equal(idx.weeks[0].items[0].ref, 'a.md');
  assert.equal(idx.weeks[0].items[0].summary, 'Summary A', 'week items must be joined, not bare refs');
});

test('the kit carries its subtitle alongside the resolved item', () => {
  const idx = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN);
  assert.equal(idx.kit[0].sub, 'Sub line');
  assert.equal(idx.kit[0].item.ref, 'a.md');
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

// curriculum.json's library refs are PER SITE: a bare slug is a page every site ships, an object
// carries a "sites" list. site_build/common.py's fd_curriculum_for_site() is canonical and applies
// this at build time; this mirrors it so the counts below are what a site actually renders rather
// than a union no site renders.
const forSite = (cur, site) => ({
  ...cur,
  libraryColumns: (cur.libraryColumns || [])
    .map((c) => ({
      ...c,
      refs: (c.refs || []).filter((e) => typeof e === 'string' || !e.sites || e.sites.includes(site)),
    }))
    .filter((c) => c.refs.length),
});


test('titles resolve to the real page names, not to the slug', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  // Asserting against known titles rather than truthiness: `title` falls back to `ref`, which is
  // always truthy, so assert.ok(it.title) passes even when every title is broken.
  assert.equal(idx.byRef['pg_suicide.md'].title, 'Suicide Risk & Safety Card');
  assert.equal(idx.byRef['mse.html'].title, 'Mental Status Exam');
});

test('no real item falls back to its slug as a title, on either site', () => {
  // Two sources, one rule: shared pages get their title from site_manifest.json, and the per-site
  // pages the manifest cannot register carry their own on the curriculum ref. Either way a row
  // must never render as "canon_200.md".
  for (const site of ['ms3', 'resident']) {
    const idx = F.fdBuildIndex(forSite(CUR, site), META, TOOLS, MAN);
    const fellBack = Object.keys(idx.byRef).filter((r) => idx.byRef[r].title === r);
    assert.deepEqual(fellBack, [], `${site}: pages degraded to their slug: ${fellBack}`);
  }
});

test('the real curriculum joins without throwing and routes every week item', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  assert.equal(idx.weeks.length, 6);
  let n = 0;
  for (const w of idx.weeks) {
    for (const it of w.items) {
      assert.ok(it.href.indexOf('?') === 0, `week ${w.n} item ${it.ref} has no route`);
      n += 1;
    }
  }
  assert.equal(n, 40, 'expected the 40 week items curriculum.json ships');
});

test('every real library column item resolves, on both sites', () => {
  // 89 on MS3, 97 on resident — every page each site ships. curriculum.json's libraryExclude is
  // empty, so these are totality counts, not just placement counts: a page outside a column is
  // outside index.byRef, which means no Library link AND no search hit.
  for (const [site, expected] of [['ms3', 89], ['resident', 97]]) {
    const idx = F.fdBuildIndex(forSite(CUR, site), META, TOOLS, MAN);
    let placed = 0;
    for (const c of idx.columns) placed += c.items.length;
    assert.equal(placed, expected, `expected the ${expected} pages curriculum.json places on ${site}`);
  }
});

test('all five real kit items are attested and carry safety steps', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  assert.equal(idx.kit.length, 5);
  for (const k of idx.kit) {
    assert.equal(k.item.attested, true, `${k.item.ref} must be attested to appear in the kit`);
    assert.ok(META[k.item.ref].safetySteps.length >= 3, `${k.item.ref} needs safetySteps`);
  }
});

// ---- authored calls-to-action ------------------------------------------------------------
// topic_meta.json's `cta` was dead in the front door until Plan 3 Task 7: fdMakeItem never read
// it, so 104 faculty-written links across 65 topics rendered nowhere. These pin the two things
// that make the carry-through correct rather than merely present -- the query suffix surviving
// whole, and a link to a page THIS site does not ship being dropped.

const CTA_CUR = JSON.parse(JSON.stringify(FIX_CUR));
CTA_CUR.libraryColumns[0].refs.push('t.html');

test('cta is carried into the item shape, in both authored container shapes', () => {
  // 43 topics write one object, 22 write an array. Both are live in topic_meta.json today.
  const one = { 'a.md': { cta: { label: 'Open T', href: '?tool=t.html' } } };
  const many = { 'a.md': { cta: [{ label: 'Open T', href: '?tool=t.html' },
                                 { label: 'Read B', href: '?page=b.md' }] } };
  assert.deepEqual(F.fdBuildIndex(CTA_CUR, one, FIX_TOOLS, FIX_MAN).byRef['a.md'].cta,
    [{ label: 'Open T', href: '?tool=t.html', ref: 't.html' }]);
  assert.equal(F.fdBuildIndex(CTA_CUR, many, FIX_TOOLS, FIX_MAN).byRef['a.md'].cta.length, 2);
});

test('an item with no cta carries an empty list, never undefined', () => {
  assert.deepEqual(F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN).byRef['b.md'].cta, []);
});

test('the &case= / &scenario= suffix survives the join UNTOUCHED', () => {
  // The whole point. A ref-only carry-through would open the tool at its front page and drop the
  // case with no error -- 16 of the 104 authored hrefs carry one of these suffixes.
  const meta = { 'a.md': { cta: [
    { label: 'Practice', href: '?tool=t.html&scenario=caregiver_baseline_adaptations_001' },
    { label: 'Drill', href: '?tool=t.html&case=rupture_limit_setting_001&resume=1' },
  ] } };
  const cta = F.fdBuildIndex(CTA_CUR, meta, FIX_TOOLS, FIX_MAN).byRef['a.md'].cta;
  assert.equal(cta[0].href, '?tool=t.html&scenario=caregiver_baseline_adaptations_001');
  assert.equal(cta[1].href, '?tool=t.html&case=rupture_limit_setting_001&resume=1');
  assert.equal(cta[0].ref, 't.html', 'the ref is derived ALONGSIDE the href, never instead of it');
  assert.equal(cta[1].ref, 't.html');
});

test('a cta whose target this site does not ship is dropped', () => {
  // topic_meta.json is shared by both sites; curriculum.json's per-site membership is not, so a
  // link authored for one audience can name a page the other does not ship.
  const meta = { 'a.md': { cta: [{ label: 'Elsewhere', href: '?page=not-shipped-here.md' },
                                 { label: 'Read B', href: '?page=b.md' }] } };
  const cta = F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN).byRef['a.md'].cta;
  assert.deepEqual(cta.map((c) => c.ref), ['b.md']);
});

test('a cta href form the shell cannot route is dropped, not rendered as a dead link', () => {
  const meta = { 'a.md': { cta: [
    { label: 'External', href: 'https://example.org/x' },
    { label: 'Fragment', href: '#somewhere' },
    { label: 'Legacy', href: 'tools/t.html' },
    { label: 'No label', href: '?page=b.md' },
    { label: 'No href' },
    { label: 'Prototype pollution', href: '?page=constructor' },
    { label: 'Read B', href: '?page=b.md' },
  ] } };
  meta['a.md'].cta[3].label = '';
  const cta = F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN).byRef['a.md'].cta;
  assert.deepEqual(cta, [{ label: 'Read B', href: '?page=b.md', ref: 'b.md' }]);
});

test('every real authored cta resolves on the site that ships it', () => {
  // Live data, not a fixture. This is the invariant the render depends on: after the join, no
  // rendered cta can point at a page its own site does not ship.
  let total = 0;
  for (const site of ['ms3', 'resident']) {
    const idx = F.fdBuildIndex(forSite(CUR, site), META, TOOLS, MAN);
    for (const ref of Object.keys(idx.byRef)) {
      for (const c of idx.byRef[ref].cta) {
        assert.ok(idx.byRef[c.ref], `${site}: ${ref} cta "${c.label}" points at unshipped ${c.ref}`);
        total += 1;
      }
    }
  }
  assert.ok(total > 150, `expected the authored cta corpus across both sites, got ${total}`);
});

test('the site filter drops nothing on TODAY\'s data, and the reason is stated', () => {
  // Exactly one authored href names a page only one site ships: cl_reference.md offers
  // "?page=adv_psychopharm.md", and adv_psychopharm.md is resident-only. It renders anyway,
  // because cl_reference.md is ITSELF resident-only — the host page and its target travel
  // together. So the filter above is defence, not a live fix, and this records that so a future
  // reader does not mistake a passing filter for a working one.
  const resident = F.fdBuildIndex(forSite(CUR, 'resident'), META, TOOLS, MAN);
  const ms3 = F.fdBuildIndex(forSite(CUR, 'ms3'), META, TOOLS, MAN);
  assert.ok(resident.byRef['cl_reference.md'], 'precondition: resident ships the host page');
  assert.ok(resident.byRef['cl_reference.md'].cta.some((c) => c.ref === 'adv_psychopharm.md'),
    'the resident site ships the target, so the link stands');
  assert.equal(ms3.byRef['cl_reference.md'], undefined,
    'precondition: MS3 ships neither the host page nor its target');
});

test('the legacy tools/<slug>.html href form is normalised to the routable one', () => {
  // Restored from the deleted shell's ctaHref(). It survives in exactly one place:
  // resident_section.py synthesises two resident-only CTAs with it. Left as a raw path the link
  // would leave the shell and load the tool standalone — no chrome, no governance notice, no way
  // back — so the href is REWRITTEN, not merely recognised.
  const meta = { 'a.md': { cta: [{ label: 'Open the trainer', href: 'tools/t.html' }] } };
  assert.deepEqual(F.fdBuildIndex(CTA_CUR, meta, FIX_TOOLS, FIX_MAN).byRef['a.md'].cta,
    [{ label: 'Open the trainer', href: '?tool=t.html', ref: 't.html' }]);
});

test('the legacy form is exact — a path with a query or a subdirectory is not it', () => {
  const cases = ['tools/t.html?case=x', 'tools/sub/t.html', 'tools/t.htm', '../tools/t.html'];
  for (const href of cases) {
    const meta = { 'a.md': { cta: [{ label: 'L', href }] } };
    assert.deepEqual(F.fdBuildIndex(CTA_CUR, meta, FIX_TOOLS, FIX_MAN).byRef['a.md'].cta, [], href);
  }
});

// ---- the rest of the topic template ----------------------------------------------------------

const TPL_CASES = { cases: [{ id: 'c1', title: 'A drill title' }, { id: 'c2', title: 'Another' }] };

test('the six restored fields reach the item shape', () => {
  const meta = { 'a.md': {
    cant: 'One sentence.',
    workflowStages: ['encounter'],
    clinicalWorkflow: { ask: 'A?', rounds: 'R.' },
    ruleOut: ['X'], firstMove: 'Y',
    communicationCases: ['c1'],
    quiz: { q: 'Q', o: [{ t: 'a', c: true }, { t: 'b' }], why: 'W' },
  } };
  const i = F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN, TPL_CASES).byRef['a.md'];
  assert.equal(i.cant, 'One sentence.');
  assert.deepEqual(i.stages, ['encounter']);
  assert.deepEqual(i.workflow, [{ label: 'What to ask', value: 'A?' }, { label: 'Rounds', value: 'R.' }]);
  assert.deepEqual(i.ruleOut, ['X']);
  assert.equal(i.firstMove, 'Y');
  assert.deepEqual(i.cases, [{ id: 'c1', title: 'A drill title',
    href: '?tool=communication-practice.html&case=c1' }]);
  assert.deepEqual(i.quiz, { q: 'Q', options: [{ text: 'a', correct: true }, { text: 'b', correct: false }], why: 'W' });
});

test('a page carrying none of them gets empty values, never undefined', () => {
  const i = F.fdBuildIndex(FIX_CUR, FIX_META, FIX_TOOLS, FIX_MAN, TPL_CASES).byRef['b.md'];
  assert.equal(i.cant, '');
  assert.deepEqual(i.stages, []);
  assert.deepEqual(i.workflow, []);
  assert.deepEqual(i.ruleOut, []);
  assert.equal(i.firstMove, '');
  assert.deepEqual(i.cases, []);
  assert.equal(i.quiz, null);
});

test('workflow rows keep encounter order and drop non-string fields', () => {
  const meta = { 'a.md': { clinicalWorkflow: { exam: 'E', ask: 'A', safety: '', mse: 42,
    actions: [{ label: 'L', href: '?page=b.md' }] } } };
  const i = F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN, TPL_CASES).byRef['a.md'];
  assert.deepEqual(i.workflow.map((r) => r.label), ['What to ask', 'Exam focus']);
  assert.deepEqual(i.cta.map((c) => c.href), ['?page=b.md'],
    'actions are links, not prose — they belong in cta, not the grid');
});

test('clinicalWorkflow.actions merge into cta, authored cta first, deduped by href', () => {
  const meta = { 'a.md': {
    cta: [{ label: 'Authored', href: '?page=b.md' }],
    clinicalWorkflow: { actions: [{ label: 'Same href', href: '?page=b.md' },
                                  { label: 'Different', href: '?tool=t.html' }] },
  } };
  const cur = JSON.parse(JSON.stringify(FIX_CUR));
  cur.libraryColumns[0].refs.push('t.html');
  const cta = F.fdBuildIndex(cur, meta, FIX_TOOLS, FIX_MAN, TPL_CASES).byRef['a.md'].cta;
  assert.deepEqual(cta.map((c) => c.label), ['Authored', 'Different']);
});

test('a communicationCase the shipped pack does not carry is dropped', () => {
  const meta = { 'a.md': { communicationCases: ['c1', 'ghost_001'] } };
  const i = F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN, TPL_CASES).byRef['a.md'];
  assert.deepEqual(i.cases.map((c) => c.id), ['c1'],
    'the drill link would open communication-practice.html at a case that is not there');
});

test('a missing communication pack degrades to no drills rather than throwing', () => {
  const meta = { 'a.md': { communicationCases: ['c1'] } };
  for (const pack of [undefined, null, {}, { cases: [] }]) {
    assert.deepEqual(F.fdBuildIndex(FIX_CUR, meta, FIX_TOOLS, FIX_MAN, pack).byRef['a.md'].cases, []);
  }
});

test('fdQuiz rejects the shapes that would render an unanswerable question', () => {
  const bad = [{ q: 'Q' }, { q: 'Q', o: [] }, { o: [{ t: 'a' }] }, { q: '', o: [{ t: 'a' }] },
               { q: 'Q', o: [{ c: true }] }];
  for (const quiz of bad) {
    assert.equal(F.fdBuildIndex(FIX_CUR, { 'a.md': { quiz } }, FIX_TOOLS, FIX_MAN).byRef['a.md'].quiz,
      null, JSON.stringify(quiz));
  }
});

test('fdQuiz agrees with the shell\'s own topicHasQuiz gate on the LIVE data', () => {
  // topicHasQuiz() decides whether an SRS card is seeded and review.html applies the same test to
  // decide whether it can serve one. A page that seeds a card but renders no question, or renders
  // one nobody seeded, is a loop that does not close.
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN, readJson('../communication_cases.json'));
  let n = 0;
  for (const ref of Object.keys(META)) {
    if (ref.charAt(0) === '_') continue;
    const m = META[ref];
    const shellSaysYes = !!(m.quiz && m.quiz.q && m.quiz.o && m.quiz.o.length);
    const item = idx.byRef[ref];
    if (!item) continue;                    // not shipped on this projection
    assert.equal(!!item.quiz, shellSaysYes, `${ref}: the two gates disagree`);
    if (shellSaysYes) n += 1;
  }
  assert.ok(n >= 40, `expected the quiz-bearing corpus, got ${n}`);
});

test('every real communicationCases id resolves against the shipped pack', () => {
  const pack = readJson('../communication_cases.json');
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN, pack);
  let n = 0;
  for (const ref of Object.keys(idx.byRef)) {
    const authored = (META[ref] && META[ref].communicationCases) || [];
    assert.equal(idx.byRef[ref].cases.length, authored.length,
      `${ref}: a drill id was dropped — it names a case the pack does not carry`);
    n += authored.length;
  }
  assert.ok(n > 50, `expected the authored drill corpus, got ${n}`);
});
