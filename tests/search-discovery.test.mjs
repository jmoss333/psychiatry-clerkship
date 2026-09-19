import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BUILD = new URL('13_Faculty_Resources/_automation/site_build/', ROOT);
const json = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const snippets = ['fd_data.js', 'fd_search.js', 'fd_today.js'].map(f =>
  readFileSync(new URL(`frontdoor/${f}`, BUILD), 'utf8')).join('\n');
const F = new Function('governanceBadge', `${snippets}\nreturn {fdBuildIndex,fdSearchResults,fdSearchOverlay,fdLibraryOnlyReads,fdQuickTools};`)(() => '');
const fixture = json('tests/fixtures/search-discovery.json');
const shipped = json('13_Faculty_Resources/_automation/site_build/shipped_pages.json');
// Use the real audience projector rather than pretending shared curriculum is both sites.
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
const meta = json('topic_meta.json'), tools = json('tool_registry.json');

// Generate queries from the shipped inventory so new dated cases join the guard automatically.
// Dates/durations are labels, not clinical intent: changing their punctuation must not create
// a safety route that the resource's name without that label did not have.
function datedOrTimedTitleVariants(title) {
  const date = title.match(/\(((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2})\)/);
  const duration = title.match(/\((\d+) min\)/);
  const match = date || duration;
  if (!match) return null;
  const label = match[0].slice(1,-1);
  const labels = date
    ? [`(${label})`, `[${label}]`, `(${label.replace(' ', '. ')})`, `[${label.replace(' ', '. ')}]`]
    : [`(${label})`, `[${label}]`, `(${label}.)`, `(${duration[1]} minutes)`];
  return {
    kind: date ? 'date' : 'duration',
    core: title.replace(match[0], '').replace(/\s+/g, ' ').trim(),
    queries: labels.flatMap(replacement => {
      const query = title.replace(match[0], replacement);
      return [query, query + '?'];
    }),
  };
}

for (const site of ['ms3', 'res']) {
  const p = projections[site];
  const index = F.fdBuildIndex(p.curriculum, meta, tools, p.manifest);
  const results = q => F.fdSearchResults(index, q, p.curriculum.synonyms, {});
  test(`${site}: generated date and duration title variants preserve discovery and safety intent`, t => {
    const cases = shipped.pages.filter(page => page.sites.includes(site)).map(page => ({
      ref: page.slug, variants: datedOrTimedTitleVariants(page.title),
    })).filter(row => row.variants);
    assert.ok(cases.some(row => row.variants.kind === 'date'), 'date guard must exercise shipped resources');
    if (site === 'res') assert.ok(cases.some(row => row.variants.kind === 'duration'), 'duration guard must exercise shipped resources');
    let checked = 0;
    for (const {ref, variants} of cases) {
      assert.ok(index.byRef[ref], `shipped variant resource absent: ${ref}`);
      const coreProtocols = results(variants.core).filter(r => r.kind === 'protocol').map(r => r.item.ref);
      for (const query of variants.queries) {
        const rows = results(query);
        assert.deepEqual(rows.filter(r => r.kind === 'protocol').map(r => r.item.ref), coreProtocols,
          `metadata changed safety intent: ${query}`);
        assert.equal(rows.find(r => r.kind === 'item')?.item.ref, ref, `first ordinary result: ${query}`);
        assert.equal(new Set(rows.map(r => r.item.ref)).size, rows.length, query);
        checked++;
      }
    }
    t.diagnostic(`${cases.length} shipped resources; ${checked} generated queries`);
  });
  for (const row of fixture.queries.filter(r => r.sites.includes(site) && r.acceptable.length)) {
    test(`${site}: learner query ${JSON.stringify(row.query)} reaches its teaching resource`, () => {
      const refs = results(row.query).map(r => r.item.ref);
      const rank = refs.findIndex(ref => row.acceptable.includes(ref));
      assert.ok(rank >= 0 && rank < row.maxRank, `${row.query}: ${refs.join(', ')}`);
      assert.equal(new Set(refs).size, refs.length);
      assert.ok(refs.length <= 8);
    });
  }
  test(`${site}: fresh learner paraphrases generalize beyond the development queries`, () => {
    const failures = fixture.holdouts.filter(row =>
      !results(row.query).slice(0, 3).some(r => row.acceptable.includes(r.item.ref)));
    assert.ok(failures.length <= 1, JSON.stringify(failures.map(r => r.query)));
  });
  test(`${site}: punctuation never loses a known safety route`, () => {
    for (const [q, ref] of [['SI?', 'pg_suicide.md'], ['AMS?', 'delirium.md'],
      ['concern about SI?', 'pg_suicide.md'],
      ['she wants to die!', 'pg_suicide.md'], ['patient wants to leave?', 'exp_consult.md']]) {
      assert.ok(results(q).some(r => r.kind === 'protocol' && r.item.ref === ref), q);
    }
  });
  const exactNames = [
    ['One Patient, Six Weeks', 'one-patient-six-weeks.html'],
    [`First-Episode Psychosis (Sep 7) — ${site === 'res' ? 'Resident' : 'MS3'}`, `cotw_20260907_fep_${site}.md`],
    ...(site === 'res' ? [['Post-Event Learning Huddle (2 min)', 'rp-post-event-huddle.html']] : []),
  ];
  for (const [query, ref] of exactNames) {
    test(`${site}: punctuation in exact title ${JSON.stringify(query)} does not invent a safety match`, () => {
      const rows = results(query);
      assert.equal(rows[0]?.item.ref, ref);
      assert.equal(rows[0]?.kind, 'item');
      assert.ok(rows.every(r => r.kind !== 'protocol'));
    });
  }
  test(`${site}: every explicit safety trigger still leads to its protocol`, () => {
    for (const kit of p.curriculum.safetyKit) for (const q of kit.triggers) {
      const rows = results(q);
      assert.ok(rows.some(r => r.kind === 'protocol' && r.item.ref === kit.ref), `${kit.ref}: ${q}`);
      assert.ok(results(q + '!').some(r => r.kind === 'protocol' && r.item.ref === kit.ref), `${kit.ref}: ${q}!`);
      // The protocol the trigger names precedes every ordinary row: that is the crisis contract.
      // Another protocol reached only by a topic word may sit below a resource the curated
      // search aliases name for this exact phrasing ("cows": the withdrawal tool above the consult
      // sheet whose title carries "withdrawal") -- see fdSearchResults, #429.
      const firstItem = rows.findIndex(r => r.kind !== 'protocol');
      const named = rows.findIndex(r => r.kind === 'protocol' && r.item.ref === kit.ref);
      if (firstItem >= 0) assert.ok(named < firstItem, `${kit.ref}: ${q} trails an ordinary row`);
    }
  });
  test(`${site}: no result is from the other audience`, () => {
    const allowed = new Set(shipped.pages.filter(p => p.sites.includes(site)).map(p => p.slug));
    for (const row of [...fixture.queries, ...fixture.holdouts]) {
      for (const result of results(row.query)) assert.ok(allowed.has(result.item.ref), result.item.ref);
    }
  });
  test(`${site}: every searchable resource can be found by its complete name`, () => {
    const failures = Object.values(index.byRef).filter(i => !i.readerOnly).filter(item =>
      !results(item.searchTitle || item.title).some(r => r.item.ref === item.ref));
    assert.deepEqual(failures.map(i => i.ref), []);
  });
}

test('search-only resources do not change Library, assignments or daily picks', () => {
  const cur = { weeks: [{n:1,items:[],landingRef:'week1.md'}], libraryColumns: [],
    safetyKit: [], searchResources: ['case.md', 'week1.md', 'a-tool.html'] };
  const manifest = {md:[['','case.md','A complete case title'],['','week1.md','Week one']],
    tools:[['','a-tool.html','Search-only tool']]};
  const index = F.fdBuildIndex(cur, {}, {}, manifest);
  assert.equal(F.fdSearchResults(index, 'complete case', {}, {})[0]?.item.ref, 'case.md');
  assert.equal(F.fdSearchResults(index, 'week one', {}, {})[0]?.item.ref, 'week1.md');
  assert.equal(index.columns.length, 0);
  assert.equal(index.weeks[0].items.length, 0);
  assert.deepEqual(F.fdLibraryOnlyReads(index), []);
  assert.deepEqual(F.fdQuickTools(index, []), []);
});

test('empty search offers a named Browse Library action and explicitly named input', () => {
  const html = F.fdSearchOverlay({byRef:{},kit:[]}, 'zzzzqqq', {}, {});
  assert.match(html, /data-fd-tab="library"[^>]*>Browse Library/);
  assert.match(html, /<input[^>]*aria-label="Search resources"/);
});

test('canonical displayed names rank correctly even when navigation abbreviates them', () => {
  const byRef = {'t_psychosis.md': {ref:'t_psychosis.md',title:'Psychosis',searchTitle:'Psychotic Disorders'}};
  for (let i=0;i<10;i++) byRef[`other${i}.md`] = {
    ref:`other${i}.md`, title:'Other Disorders',summary:'Related disorders teaching',
  };
  const results = F.fdSearchResults({byRef,kit:[]}, 'Psychotic Disorders', {}, {});
  assert.equal(results[0].item.ref, 't_psychosis.md');
});
