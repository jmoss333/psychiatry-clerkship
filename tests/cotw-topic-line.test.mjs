// The visible "Case of the Week for this topic" line on topic pages (C2, 2026-10-17): rendered by
// site_build/topic_hub_block.py into the BUILT page under its title, so no source byte (and no
// contentHash) moves. Python-level checks run through `python3 -c` under node --test, the pattern
// tests/topic-hub-block.test.mjs uses.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const py = (code) => JSON.parse(execFileSync('python3', ['-B', '-c', `
import json, sys
sys.path.insert(0,'13_Faculty_Resources/_automation/site_build')
import topic_hub_block as hub
data = hub.resolve(hub.load('.'))
${code}
`], { cwd: ROOT, encoding: 'utf8' }));

test('topic pages: a visible Case-of-the-Week line under the title, resident twins on the resident site', () => {
  const out = py(`
rows = {}
for site in ('ms3','res'):
    for ref in hub.hubs_for_site(data, site):
        line = hub.render_cotw_line(data, ref, site)
        rows.setdefault(site, {})[ref] = line
print(json.dumps(rows))
`);
  for (const site of ['ms3', 'res']) {
    const other = site === 'ms3' ? 'res' : 'ms3';
    const withLine = Object.entries(out[site]).filter(([, line]) => line);
    assert.ok(withLine.length >= 10, `${site}: ${withLine.length} topic pages carry the line`);
    for (const [ref, line] of withLine) {
      assert.match(line, /^<p class="pairing-block cotw-for-topic" data-cotw-for="[^"]+"><strong>Case of the Week for this topic:<\/strong> <a href="\?page=cotw_\d{8}_[a-z0-9]+_/);
      assert.ok(!line.includes(`_${other}.md`), `${site} ${ref}`);
      assert.ok(line.includes('?page=cotw_index.md'), ref);
    }
    for (const ref of ['catatonia.md', 'toxidromes.md', 't_mood.md', 't_psychosis.md', 'agitation.md', 'suicide.md']) {
      assert.ok(out[site][ref], `${site}: ${ref} names its case`);
    }
  }
});

test('the line sits under the page title and the page text after it is unchanged', () => {
  const out = py(`
src = '# Catatonia on the Inpatient Unit\\n\\n**In one line.** Body.\\n\\n**Pair with** x.\\n'
text, did = hub.inject_markdown(src, data, 'catatonia.md', 'ms3')
again, _ = hub.inject_markdown(text, data, 'catatonia.md', 'ms3')
res, _ = hub.inject_markdown(text, data, 'catatonia.md', 'res')
stripped = hub.BLOCK_RE.sub('', hub.COTW_LINE_RE.sub('', text))
print(json.dumps({'text': text, 'did': did, 'idem': again == text, 'same': stripped.split() == src.split(), 'res': res}))
`);
  assert.equal(out.did, true);
  assert.ok(out.text.startsWith('# Catatonia on the Inpatient Unit\n\n<p class="pairing-block cotw-for-topic" data-cotw-for="catatonia.md">'));
  assert.ok(out.idem, 'idempotent');
  assert.ok(out.same, 'the page text is unchanged apart from the generated blocks');
  assert.equal((out.res.match(/cotw-for-topic/g) || []).length, 1, 'the resident pass replaces, never duplicates');
  assert.ok(out.res.includes('_res.md') && !out.res.includes('catatonia_ms3.md'));
});

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
