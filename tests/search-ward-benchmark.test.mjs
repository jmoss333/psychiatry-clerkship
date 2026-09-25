// Ward-language search benchmark (review task #3, 2026-09-24). What a learner types on the unit --
// a brand name, a lab, an abbreviation -- run through the REAL audience projection for each site,
// the same harness tests/search-discovery.test.mjs uses. The fixture, not this file, holds the
// phrases: tests/fixtures/search-ward.json explains each section.
//
// Two invariants here are gates rather than benchmarks:
//   * a crisis phrasing opens on its safety protocol (row 0), and
//   * no search alias ranks above a safety protocol unless that phrase is a recorded decision in
//     the fixture's protocolOutrankingAliases. Aliases outrank topic-word protocol matches by design
//     (#429: an alias is a faculty statement that a phrasing means a resource), so every alias that
//     does so has to be one somebody decided on. A new alias that moves a protocol fails here until
//     it is added to that list -- which is the faculty decision, visible in the diff.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BUILD = new URL('13_Faculty_Resources/_automation/site_build/', ROOT);
const json = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const snippets = ['fd_data.js', 'fd_search.js', 'fd_today.js'].map((f) =>
  readFileSync(new URL(`frontdoor/${f}`, BUILD), 'utf8')).join('\n');
// eslint-disable-next-line no-new-func
const F = new Function('governanceBadge', `${snippets}\nreturn {fdBuildIndex,fdSearchResults};`)(() => '');
const fixture = json('tests/fixtures/search-ward.json');
const curriculum = json('curriculum.json');
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

const protocolRows = (rows) => rows.map((r, i) => (r.kind === 'protocol' ? `${i}:${r.item.ref}` : null))
  .filter(Boolean).join(',');

test('the benchmark is non-trivial and every section is populated', () => {
  assert.ok(fixture.served.length >= 30, `only ${fixture.served.length} served phrases`);
  assert.ok(fixture.crisis.length >= 5 && fixture.itemFirst.length >= 5 && fixture.deferred.length >= 1);
  const served = new Set(fixture.served.map((r) => r.query));
  for (const d of fixture.deferred) {
    assert.ok(!served.has(d.query), `${d.query} is both served and deferred`);
    assert.ok(d.reason && d.reason.length > 20, `${d.query}: a deferral needs its reason`);
  }
});

// Doses never belong in discovery vocabulary (the same line the tool QA gate draws): an alias
// names a resource, it does not suggest an amount.
test('no search alias or benchmark phrase carries a dose', () => {
  const DOSE = /\b\d+(\.\d+)?\s*(mg|mcg|ug|ml|g|units?|iu|im|iv|po|sl|pr|q\d*h)\b/i;
  const phrases = [...Object.values(curriculum.searchAliases).flat(),
    ...fixture.served.map((r) => r.query), ...fixture.itemFirst, ...fixture.crisis.map((r) => r.query)];
  for (const p of phrases) assert.doesNotMatch(p, DOSE, p);
});

test('every recorded protocol-outranking alias still exists (a stale entry would hide a change)', () => {
  for (const [ref, phrases] of Object.entries(fixture.protocolOutrankingAliases)) {
    for (const p of phrases) assert.ok((curriculum.searchAliases[ref] || []).includes(p), `${ref}: ${p}`);
  }
});

for (const site of ['ms3', 'res']) {
  const p = projections[site];
  const index = F.fdBuildIndex(p.curriculum, meta, tools, p.manifest);
  const bare = F.fdBuildIndex({ ...p.curriculum, searchAliases: {} }, meta, tools, p.manifest);
  const results = (q, idx = index) => F.fdSearchResults(idx, q, p.curriculum.synonyms, {});

  for (const row of fixture.served.filter((r) => r.sites.includes(site))) {
    test(`${site}: ward phrase ${JSON.stringify(row.query)} reaches its page`, () => {
      const acceptable = row.acceptable.filter((ref) => index.byRef[ref]);
      assert.ok(acceptable.length, `${row.query}: no acceptable page ships on ${site}`);
      const refs = results(row.query).map((r) => r.item.ref);
      const rank = refs.findIndex((ref) => acceptable.includes(ref));
      assert.ok(rank >= 0 && rank < row.maxRank, `${row.query}: ${refs.join(', ') || '(nothing)'}`);
      assert.equal(new Set(refs).size, refs.length);
    });
  }

  // A trigger-routed phrasing opens on its protocol. An `accidental` one (reached only by the
  // safety-kit pass's substring test, never by a trigger) is pinned weaker -- the protocol must
  // still be among the rows -- because that is all it has ever had; its fixture note says why,
  // and making it lead is the trigger decision.
  for (const row of fixture.crisis) {
    const verb = row.accidental ? 'still reaches' : 'opens on';
    test(`${site}: crisis phrasing ${JSON.stringify(row.query)} ${verb} ${row.protocol}`, () => {
      const rows = results(row.query);
      if (row.accidental) {
        assert.ok(rows.some((r) => r.kind === 'protocol' && r.item.ref === row.protocol),
          `${row.query}: ${row.accidental}`);
        return;
      }
      assert.equal(rows[0]?.kind, 'protocol', `${row.query}: row 0 is ${rows[0]?.kind}`);
      assert.equal(rows[0]?.item.ref, row.protocol, row.query);
    });
  }

  test(`${site}: medication and ward terms open on the page that teaches them, not on a protocol`, () => {
    for (const q of fixture.itemFirst) {
      const first = results(q)[0];
      assert.equal(first?.kind, 'item', `${q}: row 0 is ${first?.kind} ${first?.item.ref}`);
    }
  });

  test(`${site}: no alias ranks above a safety protocol unless that is a recorded decision`, () => {
    const moved = [];
    for (const [ref, phrases] of Object.entries(p.curriculum.searchAliases || {})) {
      const allowed = new Set(fixture.protocolOutrankingAliases[ref] || []);
      for (const q of phrases) {
        if (allowed.has(q)) continue;
        const withAliases = protocolRows(results(q)), without = protocolRows(results(q, bare));
        if (withAliases !== without) moved.push(`${ref} "${q}": [${without}] -> [${withAliases}]`);
      }
    }
    assert.deepEqual(moved, []);
  });
}
