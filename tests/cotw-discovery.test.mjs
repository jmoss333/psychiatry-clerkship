// Case of the Week discoverability (C2, 2026-10-17).
//  1. Every topic page the hub registry ties to a weekly case names its newest edition in the
//     reader's "Next in this thread" chrome -- rendered beside the page, never inside its text, so
//     no source byte, contentHash or page-text index entry moves and no signature reopens.
//  2. The generated archive on the index (#1082) tags every row with its topic and track.
// Python-level data comes from the real audience projection through `python3 -c`, the pattern
// tests/search-ward-benchmark.test.mjs uses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BUILD = new URL('13_Faculty_Resources/_automation/site_build/', ROOT);
const read = (p) => readFileSync(new URL(p, BUILD), 'utf8');
// eslint-disable-next-line no-new-func
const F = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_today.js')}
  ${read('frontdoor/fd_block.js')}
  ${read('frontdoor/fd_reader.js')}
  return { fdReader: fdReader, fdBuildIndex: fdBuildIndex };
`)();
const json = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const meta = json('topic_meta.json'), tools = json('tool_registry.json');
const py = (code) => JSON.parse(execFileSync('python3', ['-B', '-c', `
import json, sys
sys.path.insert(0,'13_Faculty_Resources/_automation/site_build')
${code}
`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const projections = py(`
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
`);

for (const site of ['ms3', 'res']) {
  const other = site === 'ms3' ? 'res' : 'ms3';
  const p = projections[site];
  const index = F.fdBuildIndex(p.curriculum, meta, tools, p.manifest);
  const thread = (ref) => {
    const html = F.fdReader(index, { ref, done: {} }, '<p>Body.</p>');
    const at = html.indexOf('class="fd-nextthread"');
    return at < 0 ? '' : html.slice(at, html.indexOf('</nav>', at));
  };

  test(`${site}: topic pages name their newest Case of the Week in "Next in this thread"`, () => {
    const topics = Object.keys(index.cotwForTopic);
    assert.ok(topics.length >= 12, `${site}: ${topics.length} topic pages carry a case`);
    for (const ref of ['catatonia.md', 'toxidromes.md', 't_mood.md', 't_psychosis.md', 'agitation.md',
      'suicide.md', 't_sud.md']) {
      const newest = index.cotwForTopic[ref][0];
      const nav = thread(ref);
      assert.match(nav, new RegExp(`data-fd-open="${newest.slug.replace('.', '\\.')}"`), `${site} ${ref}`);
      assert.ok(nav.includes('Case of the Week: '), ref);
      assert.ok(newest.slug.endsWith(`_${site}.md`) && !nav.includes(`_${other}.md`), `${site} ${ref}: own track only`);
    }
  });

  test(`${site}: newest first, only cases this site searches, and a page without a case gets no row`, () => {
    for (const [ref, rows] of Object.entries(index.cotwForTopic)) {
      const dates = rows.map((r) => r.date);
      assert.deepEqual(dates, [...dates].sort().reverse(), ref);
      for (const r of rows) assert.ok(index.byRef[r.slug] && !index.byRef[r.slug].readerOnly, `${ref}: ${r.slug}`);
    }
    assert.ok(!thread('welcome.md').includes('Case of the Week: '));
    // A case page does not point at itself.
    const own = index.cotwForTopic['catatonia.md'][0].slug;
    assert.ok(!thread(own).includes(`data-fd-open="${own}"`));
  });
}

// The generated archive on the index (#1082) tags every row with its topic and track (C2).
test('every archive row on the index carries its topic and track tags, on both sites', () => {
  const out = py(`
import cotw_archive_block as arc
d = arc.load('.')
print(json.dumps({s: arc.render(d, s) for s in ('ms3', 'res')}))
`);
  for (const [site, track] of [['ms3', 'MS3'], ['res', 'Resident']]) {
    const rows = out[site].split('\n').filter((l) => /^(- |\*\*Newest case:\*\* )\[/.test(l));
    assert.ok(rows.length >= 18, `${site}: ${rows.length} rows`);
    for (const row of rows) assert.match(row, new RegExp(`\\]\\(\\?page=cotw_[^)]+_${site}\\.md\\) — \\*[^*]+ · ${track}\\*`), row);
  }
});
