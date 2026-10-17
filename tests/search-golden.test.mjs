// Golden learner queries (C2, 2026-10-17) against the SOURCE projection of both sites.
//
// tests/fixtures/search-golden.json holds the rows; frontdoor-search-gate.mjs (goldenErrors) holds
// the rule, and the static-QA gate runs the same rows against each BUILT site's own page-text
// index on every build. This file runs before any build exists (CI runs node --test first), so it
// builds a page-text index the way common.build_search_index does -- from each shipped page's
// source -- and joins it to the real audience projection, the harness search-ward-benchmark uses.
// Also pinned here: the track rule, the synonym list's bidirectionality, and that page text and
// synonym groups never create or move a safety-protocol row.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { goldenErrors, trackExclusions } from '../13_Faculty_Resources/_automation/site_build/frontdoor-search-gate.mjs';

const ROOT = new URL('../', import.meta.url);
const BUILD = new URL('13_Faculty_Resources/_automation/site_build/', ROOT);
const json = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const snippets = ['fd_data.js', 'fd_search.js'].map((f) =>
  readFileSync(new URL(`frontdoor/${f}`, BUILD), 'utf8')).join('\n');
// eslint-disable-next-line no-new-func
const F = new Function('governanceBadge', `${snippets}\nreturn {fdBuildIndex,fdSearchResults,fdSearchAlternatives,fdSearchBodyScores};`)(() => '');
const golden = json('tests/fixtures/search-golden.json');
const canonical = json('curriculum.json');
const meta = json('topic_meta.json'), tools = json('tool_registry.json');

// One Python call: both projections plus a source-built page-text index per site. The temporary
// content directory is a TemporaryDirectory, removed before the call returns (verify.sh LEAK rule).
const built = JSON.parse(execFileSync('python3', ['-B', '-c', `
import contextlib, io, json, os, shutil, sys, tempfile
sys.path.insert(0,'13_Faculty_Resources/_automation/site_build')
from frontdoor_catalog import build_frontdoor_payload
from shipped_pages import load_shipped_pages
import common
cur=json.load(open('curriculum.json')); shipped=load_shipped_pages('.')
out={}
for site,key in [('ms3','ms3'),('res','resident')]:
    pages=[p for p in shipped['pages'] if site in p['sites']]
    nav=[{'section':'Resources','items':[{'f':p['slug'],'t':p['title'],
        'k':'tool' if p['kind']=='tool' else 'md',
        'governance':{'status':'pending','riskKind':'general','riskLevel':'low'}} for p in pages]}]
    payload=build_frontdoor_payload(key,cur,nav,'0'*40,shipped=shipped)
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp,'content'))
        for p in pages:
            if p['kind']!='tool' and os.path.exists(p['source']):
                shutil.copyfile(p['source'],os.path.join(tmp,'content',p['slug']))
        with contextlib.redirect_stdout(io.StringIO()):
            body=common.build_search_index(nav,tmp)
    out[site]={'payload':payload,'body':body}
print(json.dumps(out))
`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));

for (const site of ['ms3', 'res']) {
  const p = built[site].payload;
  const bodyIndex = built[site].body;
  const index = F.fdBuildIndex(p.curriculum, meta, tools, p.manifest);
  const search = (q, body = bodyIndex) =>
    F.fdSearchResults(index, q, p.curriculum.synonyms, { bodyIndex: body, searchExpanded: true });

  test(`${site}: every golden query reaches its page`, () => {
    assert.deepEqual(goldenErrors(golden, site, (q) => search(q), (ref) => !!index.byRef[ref]), []);
  });

  test(`${site}: page text and synonym groups never add, drop or reorder a safety-protocol row`, () => {
    const queries = [...golden.queries.map((r) => r.query), 'suicide', 'kill myself', 'wants to leave',
      'delirium', 'withdrawal', 'combative', 'serotonin syndrome', 'neuroleptic malignant syndrome', 'si'];
    const bare = F.fdBuildIndex({ ...p.curriculum, synonymGroups: [] }, meta, tools, p.manifest);
    for (const q of queries) {
      const protocols = (rows) => rows.map((r, i) => (r.kind === 'protocol' ? `${i}:${r.item.ref}` : null)).filter(Boolean);
      const now = search(q);
      const before = F.fdSearchResults(bare, q, p.curriculum.synonyms, { searchExpanded: true });
      assert.deepEqual(now.filter((r) => r.kind === 'protocol').map((r) => r.item.ref),
        before.filter((r) => r.kind === 'protocol').map((r) => r.item.ref), `${q}: the protocol set`);
      // Positions may only move DOWN by the alias-tier rule, never up: compare the leading block.
      const lead = (rows) => { const out = []; for (const r of rows) { if (r.kind !== 'protocol') break; out.push(r.item.ref); } return out; };
      assert.deepEqual(lead(now), lead(before), `${q}: protocols that led still lead, in order (${protocols(now)})`);
    }
  });

  test(`${site}: a page found only by its text is labelled and is never a safety-kit page`, () => {
    const kit = new Set(index.kit.map((k) => k.item.ref));
    let bodyRows = 0;
    for (const q of ['QTc', 'QT prolongation', 'NMS', 'EPS']) {
      for (const r of search(q)) {
        if (!r.body) continue;
        bodyRows += 1;
        assert.equal(r.kind, 'item');
        assert.ok(!kit.has(r.item.ref), `${q}: ${r.item.ref}`);
      }
    }
    assert.ok(bodyRows > 0, 'the page-text tier contributed rows');
  });

  test(`${site}: without the page-text index search ranks exactly as titles and summaries allow`, () => {
    // "QT prolongation" had no title/summary match on either site before C2; the synonym list alone
    // must now find the primer, and with the index the medication-monitoring page joins it.
    const titleOnly = search('QT prolongation', null).map((r) => r.item.ref);
    assert.ok(titleOnly.includes('psychopharm_primer.md'));
    assert.ok(search('QT prolongation').map((r) => r.item.ref).includes('med_monitoring.md'));
  });

  test(`${site}: track-specific pages stay reachable by link but out of search`, () => {
    const withheld = trackExclusions(canonical, p.curriculum, site);
    assert.deepEqual(withheld, p.curriculum.searchTrackExclude, 'the gate and the builder agree');
    for (const ref of withheld) {
      assert.ok(index.known[ref], `${ref} still opens from a link`);
      assert.ok(!index.byRef[ref] || index.byRef[ref].readerOnly, `${ref} is not searchable`);
    }
    if (site === 'res') {
      assert.deepEqual(withheld, ['orientation.md', 'osce.md', 'reading_map.md', 'shelf.md',
        'week1.md', 'week2.md', 'week3.md', 'week4.md', 'week5.md', 'week6.md']);
    } else {
      assert.deepEqual(withheld, [], 'nothing on the MS3 site is another track\'s');
    }
  });
}

test('the synonym list is bidirectional: every term reaches every other term in its group', () => {
  const groups = built.ms3.payload.curriculum.synonymGroups;
  assert.ok(groups.length >= 7);
  for (const group of groups) {
    for (const term of group) {
      const alts = F.fdSearchAlternatives(term, groups);
      assert.deepEqual([...alts].sort(), group.filter((t) => t !== term).sort(), term);
    }
  }
  // Inside a longer query the whole phrase swaps, and the rest of the query is kept.
  assert.ok(F.fdSearchAlternatives('qtc prolongation on haloperidol', groups).includes('qt interval on haloperidol'));
  assert.deepEqual(F.fdSearchAlternatives('something unrelated', groups), []);
});

test('page-text scoring needs every word of a phrase and degrades to nothing without an index', () => {
  assert.deepEqual(F.fdSearchBodyScores(null, 'qtc', []), {});
  const si = { n: 3, avgLen: 10, df: { first: 2, episode: 1, psychosis: 2 },
    docs: [{ f: 'a.md', L: 10 }, { f: 'b.md', L: 10 }, { f: 'c.md', L: 10 }],
    postings: { first: [[0, 1], [1, 1]], episode: [[0, 1]], psychosis: [[0, 1], [2, 3]] } };
  const scores = F.fdSearchBodyScores(si, 'first episode psychosis', []);
  assert.equal(scores['a.md'].rank, 0, 'the page with every word leads');
  assert.equal(scores['a.md'].norm, 1);
  assert.ok(scores['c.md'].norm < 0.5, 'a partial match is discounted');
});
