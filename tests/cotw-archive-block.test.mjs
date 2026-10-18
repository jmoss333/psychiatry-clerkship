import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/* Case-of-the-Week archive (site_build/cotw_archive_block.py).

   The index page is the only Library-placed route to the weekly cases, and its hand-written
   line-up had fallen five editions behind. Pinned here:
   1. the archive lists EVERY shipped edition for each site (the build also asserts it);
   2. it is grouped under the topic hubs' labels, newest first, newest case on top;
   3. both index sources carry the marker (a source without it would ship no list at all);
   4. both build scripts render it and fail closed. */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteBuild = path.join(repo, '13_Faculty_Resources', '_automation', 'site_build');
const script = path.join(siteBuild, 'cotw_archive_block.py');
const shipped = JSON.parse(fs.readFileSync(path.join(siteBuild, 'shipped_pages.json'), 'utf8'));
const hubs = JSON.parse(fs.readFileSync(path.join(siteBuild, 'topic_hubs.json'), 'utf8'));
const py = (...args) => spawnSync('python3', [script, ...args], { cwd: repo, encoding: 'utf8' });

/* The Python-level checks (registry mutations the CLI cannot express) run here through
   python3 -c, so they execute under node --test on every gate. */
const PY_UNIT = `
import copy, re, sys
sys.path.insert(0, '13_Faculty_Resources/_automation/site_build')
import cotw_archive_block as a
real = a.load('.')
# 1. every shipped edition is rendered on its site; twins are the right audience
for site in a.SITES:
    out, did = a.inject_markdown(a.MARKER, real, a.INDEX_SLUG, site)
    assert did
    a.assert_complete(out, real, site)
    assert all(r['slug'].endswith('_%s.md' % site) for r in a.editions(real, site))
# 2. newest first, grouped, one current edition per topic code per group
for site in a.SITES:
    m = a.model(real, site)
    assert m['newest']['slug'] == a.editions(real, site)[0]['slug']
    for _l, items in m['groups']:
        dates = [r['date'] for r in items]
        assert dates == sorted(dates, reverse=True)
        firsts = [r for r in items if not r['earlier']]
        assert len({r['topic'] for r in firsts}) == len(firsts)
# 3. two editions of one subject under different topic codes: the older is "earlier"
ms3 = {r['slug']: r for _l, items in a.model(real, 'ms3')['groups'] for r in items}
if 'cotw_20260723_suiciderisk_ms3.md' in ms3 and 'cotw_20261012_safety_ms3.md' in ms3:
    assert ms3['cotw_20260723_suiciderisk_ms3.md']['earlier']
    assert not ms3['cotw_20261012_safety_ms3.md']['earlier']
# 4. an unclaimed topic lands under Other, last
data = copy.deepcopy(real)
for hub in data['hubs']['hubs']:
    hub['cotwTopics'] = [c for c in hub.get('cotwTopics', []) if c != 'fep']
labels = [l for l, _ in a.model(data, 'ms3')['groups']]
assert a.OTHER in labels and labels[-1] == a.OTHER
# 5. no marker -> not injected, and completeness then fails closed
out, did = a.inject_markdown('# Index\\n\\nno marker\\n', real, a.INDEX_SLUG, 'ms3')
assert not did
try:
    a.assert_complete(out, real, 'ms3'); raise AssertionError('completeness must fail')
except SystemExit:
    pass
# 6. non-index page untouched; deterministic; copy audience-neutral
assert a.inject_markdown(a.MARKER, real, 't_mood.md', 'ms3') == (a.MARKER, False)
for site in a.SITES:
    assert a.render(real, site) == a.render(real, site)
banned = re.compile(r'MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford', re.I)
for s in (a.NEWEST, a.HEADING, a.EARLIER, a.OTHER):
    assert not banned.search(s), s
# 7. Today's announcement payload: the newest edition, each site its own twin, ISO date, nothing else
for site in a.SITES:
    n = a.newest(real, site)
    top = a.model(real, site)['newest']
    assert set(n) == {'slug', 'title', 'date'}, n
    assert n['slug'] == top['slug'] and n['slug'].endswith('_%s.md' % site)
    assert n['title'] == top['title'] and not re.search(r'\\s+\u2014\\s+(MS3|Resident)\\s*$', n['title'])
    assert re.fullmatch(r'\\d{4}-\\d{2}-\\d{2}', n['date']) and n['date'].replace('-', '') == top['date']
assert a.newest(real, 'ms3')['slug'] != a.newest(real, 'res')['slug']
empty = dict(real, shipped={})
assert a.newest(empty, 'ms3') is None
print('ok')
`;

test('python-level unit checks pass (completeness, ordering, grouping, fail-closed)', () => {
  const run = spawnSync('python3', ['-B', '-c', PY_UNIT], { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /ok/);
});

test('every shipped edition appears exactly once per site, newest first, under a hub label', () => {
  const run = py('--json');
  assert.equal(run.status, 0, run.stderr);
  const model = JSON.parse(run.stdout);
  const labels = new Set(hubs.hubs.map((h) => h.topic));
  for (const site of ['ms3', 'res']) {
    const expected = shipped.pages
      .filter((p) => p.sites.includes(site) && /^cotw_\d{8}_[a-z0-9]+_(ms3|res)\.md$/.test(p.slug))
      .map((p) => p.slug).sort();
    const listed = model[site].groups.flatMap(([, items]) => items.map((r) => r.slug)).sort();
    assert.deepEqual(listed, expected, `${site}: archive must list exactly the shipped editions`);
    assert.equal(new Set(listed).size, listed.length, `${site}: no edition listed twice`);
    assert.ok(model[site].newest && model[site].newest.slug, `${site}: newest is defined`);
    const newestDate = Math.max(...listed.map((s) => Number(s.slice(5, 13))));
    assert.equal(Number(model[site].newest.date), newestDate, `${site}: newest case on top`);
    for (const [label, items] of model[site].groups) {
      assert.ok(labels.has(label) || label === 'Other topics', `${site}: group "${label}" is not a hub topic`);
      const dates = items.map((r) => r.date);
      assert.deepEqual(dates, [...dates].sort().reverse(), `${site}/${label}: newest first`);
      for (const r of items) assert.ok(r.slug.endsWith(`_${site}.md`), `${site}: ${r.slug} is the wrong twin`);
    }
  }
});

test('both index sources carry the marker, and the rendered markdown links every edition', () => {
  for (const [src, site] of [['index_ms3.md', 'ms3'], ['index_resident.md', 'res']]) {
    const text = fs.readFileSync(path.join(repo, '08_Cases_and_Simulation', 'case-of-the-week', src), 'utf8');
    assert.ok(text.includes('<!-- cotw-archive -->'), `${src}: marker missing`);
    assert.ok(!/\*\*This term's line-up/.test(text), `${src}: the hand-written line-up must not come back`);
    const run = py('--site', site);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.startsWith('**Newest case:**'), run.stdout.slice(0, 60));
    assert.ok(!/MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i.test(
      run.stdout.replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/—[^\n]*/g, '')),
      'the archive\'s own copy (outside links and blurbs) is audience-neutral');
  }
});

test('both build scripts render the archive and fail closed', () => {
  const build = fs.readFileSync(path.join(siteBuild, 'build_deploy.py'), 'utf8');
  assert.ok(build.includes('_t,_adid=_archive.inject_markdown(_t,_archive_data,dst,"ms3")'));
  assert.ok(build.includes('_archive.assert_complete(_t,_archive_data,"ms3")'));
  assert.ok(build.includes('Case-of-the-Week archive not rendered on cotw_index.md'));
  const res = fs.readFileSync(path.join(siteBuild, 'resident_section.py'), 'utf8');
  assert.ok(res.includes('_t,_adid=_archive.inject_markdown(_t,_archive_res_data,os.path.basename(_md_path),"res")'));
  assert.ok(res.includes('_archive.assert_complete(_t,_archive_res_data,"res")'));
  assert.ok(res.includes('Case-of-the-Week archive not rendered on the resident cotw_index.md'));
});
