import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/* Topic hub block — "Everything on this topic" (site_build/topic_hub_block.py).

   Contract pinned here, at `node --test` time rather than only at deploy time:
   1. the registry resolves (every hub and sibling ships, every cotwTopic names a shipped case);
   2. every link the block renders resolves ON THE SITE IT RENDERS FOR — Case-of-the-Week twins
      differ per site, and a resident block that kept an MS3 twin would be a dead link;
   3. the block never links the page it sits on, and its copy is audience-neutral (it ships
      to both sites unrebranded, like every Front Door string);
   4. both build scripts call the renderer, and the resident sweep runs AFTER the MS3 COTW
      twins are deleted and BEFORE the strip/contrast passes — the ordering that makes the
      inherited MS3 block get replaced rather than shipped.
   Nothing in this repo globs site_build/test_*.py, so the Python self-test is driven from here. */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteBuild = path.join(repo, '13_Faculty_Resources', '_automation', 'site_build');
const script = path.join(siteBuild, 'topic_hub_block.py');
const shipped = JSON.parse(fs.readFileSync(path.join(siteBuild, 'shipped_pages.json'), 'utf8'));
const bySlug = new Map(shipped.pages.map((p) => [p.slug, p]));

function py(...args) {
  const run = spawnSync('python3', [script, ...args], { cwd: repo, encoding: 'utf8' });
  return run;
}

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

test('registry resolves and the Python self-test passes', () => {
  const check = py('--check');
  assert.equal(check.status, 0, check.stderr || check.stdout);
  assert.match(check.stdout, /topic hubs: \d+ hubs OK/);
  const self = py('--self-test');
  assert.equal(self.status, 0, self.stderr || self.stdout);
});

test('every rendered link resolves on the site it renders for; a hub never links itself', () => {
  const run = py('--json');
  assert.equal(run.status, 0, run.stderr);
  const model = JSON.parse(run.stdout);
  for (const site of ['ms3', 'res']) {
    assert.ok(model[site].length >= 10, `${site}: expected at least ten hubs`);
    for (const hub of model[site]) {
      const rows = [
        ...hub.siblings.map((s) => ({ href: s.href, target: s.ref })),
        ...hub.cotw.map((c) => ({ href: c.href, target: c.slug })),
      ];
      for (const row of rows) {
        const page = bySlug.get(row.target);
        assert.ok(page, `${site}/${hub.ref}: ${row.target} is not a shipped slug`);
        assert.ok(page.sites.includes(site), `${site}/${hub.ref}: ${row.target} does not ship on ${site}`);
        assert.notEqual(row.target, hub.ref, `${site}/${hub.ref} links itself`);
      }
      for (const c of hub.cotw) {
        assert.ok(c.slug.endsWith(`_${site}.md`), `${site}/${hub.ref}: COTW twin ${c.slug} is the wrong audience`);
      }
      if (hub.cotw.length > 1) {
        const dates = hub.cotw.map((c) => c.date);
        assert.deepEqual(dates, [...dates].sort().reverse(), `${site}/${hub.ref}: COTW must list newest first`);
      }
      for (const tool of ['diagnostic-reasoning.html', 'family-systems.html', 'communication-practice.html', 'question-bank-practice.html']) {
        const used = [...hub.reasoning, ...hub.family, ...hub.drills, ...(hub.questions ? [hub.questions] : [])]
          .some((r) => r.href.startsWith(`?tool=${tool}`));
        if (used) assert.ok(bySlug.get(tool)?.sites.includes(site), `${site}/${hub.ref}: ${tool} not shipped here`);
      }
      assert.ok(hub.siblings.length + hub.cotw.length + hub.reasoning.length + hub.family.length
        + hub.drills.length + (hub.questions ? 1 : 0) > 0, `${site}/${hub.ref}: empty hub`);
    }
  }
});

test('rendered copy is audience-neutral and the block is a collapsed <details>', () => {
  for (const site of ['ms3', 'res']) {
    const run = py('--render', 'suicide.md', '--site', site);
    assert.equal(run.status, 0, run.stderr);
    const html = run.stdout;
    assert.ok(html.startsWith('<details class="pairing-block topic-hub" data-topic-hub="suicide.md">'), html.slice(0, 120));
    assert.ok(!html.includes('<details open'), 'must ship collapsed');
    // Titles come from the registries and may legitimately name an audience ("… — MS3" is
    // stripped from COTW titles); the block's OWN copy — everything outside <a>…</a> — may not.
    const ownCopy = html.replace(/<a [^>]*>[^<]*<\/a>/g, '');
    assert.ok(!AUDIENCE_TOKEN_RE.test(ownCopy), `audience token in hub copy: ${ownCopy.match(AUDIENCE_TOKEN_RE)?.[0]}`);
    assert.ok(/cotw_\d{8}_[a-z0-9]+_(ms3|res)\.md/.test(html) ? html.includes(`_${site}.md`) : true);
  }
});

test('both build scripts inject the block, in the order that makes the resident rendering win', () => {
  const build = fs.readFileSync(path.join(siteBuild, 'build_deploy.py'), 'utf8');
  assert.ok(build.includes('_t,_hdid=_hub.inject_markdown(_t,_hub_data,dst,"ms3")'), 'build_deploy.py: MS3 injection');
  assert.ok(build.includes('topic hub block missing from hub page(s)'), 'build_deploy.py: fail-closed gap check');

  const res = fs.readFileSync(path.join(siteBuild, 'resident_section.py'), 'utf8');
  const sweep = res.indexOf('_t,_hdid=_hub.inject_markdown(_t,_hub_res_data,os.path.basename(_md_path),"res")');
  const twinRemoval = res.indexOf('glob.glob(OUT+"/content/cotw_*_ms3.md")');
  const strip = res.indexOf('common.strip_review_banners(OUT)');
  assert.ok(sweep > 0, 'resident_section.py: resident injection');
  assert.ok(twinRemoval > 0 && twinRemoval < sweep, 'resident sweep must run after the MS3 COTW twins are removed');
  assert.ok(strip > sweep, 'resident sweep must run before the strip/contrast passes');
  assert.ok(res.includes('topic hub block not rendered for the resident site'), 'resident_section.py: fail-closed gap check');
});
