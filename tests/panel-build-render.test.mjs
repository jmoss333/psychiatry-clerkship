/* Contracts for the BUILD-rendered panel path — the machinery, not the corpus.
 *
 * DIVISION OF LABOUR. tests/panel_build_gate.mjs compares the render against
 * tests/__panels__/res/ and runs from build_and_check.sh AFTER the build, where _build/ is
 * current by construction. This file pins the things that should go red even when every
 * snapshot still matches: that the four FD_* payloads are extractable, that the resident
 * payload is genuinely not the MS3 one, that the corpus is neither empty nor orphaned, and
 * that the freshness guard's declared inputs are real paths.
 *
 * WHY IT SKIPS RATHER THAN FAILS WITHOUT A BUILD. `node --test` runs BEFORE build_deploy.py
 * inside build_and_check.sh and on a fresh clone in CI, so _build/ is routinely absent here.
 * A hard failure would abort the very build that creates it (CLAUDE.md, build-output tests).
 * staleBuildReason() turns that into a skip that names the rebuild command — and a skip is
 * always REPORTED, because a suite that quietly checked nothing reads exactly like one that
 * checked everything and found nothing wrong.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';
import {
  AUDIENCES, BUILD_SNAPSHOT_AUDIENCES, PANEL_BUILD_INPUTS, buildSnapshotDir, builtPayload,
  formatPanel, renderFromBuild, shippedPanelRefs, snapshotName,
} from './_panel_render.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const REGEN = (site) => `run \`node tests/panel_build_gate.mjs --site ${site} --write\` and commit the diff`;

/* Run `body(site)` for every audience whose _build/ is current; skip the ones that are not.
   Only the whole test skips when NO site could be read, so one fresh tree still enforces this. */
function forFreshSites(t, sites, body) {
  const skipped = [];
  let checked = 0;
  for (const site of sites) {
    const stale = staleBuildReason(REPO, site, PANEL_BUILD_INPUTS);
    if (stale) { skipped.push(stale); continue; }
    body(site);
    checked += 1;
  }
  if (skipped.length) t.diagnostic(`NOT CHECKED — ${skipped.join(' | ')}`);
  if (checked === 0) t.skip(skipped.join(' | '));
}

// ---- contracts that need no build ---------------------------------------------------------

test('every declared freshness input is a real path', () => {
  /* staleBuildReason() throws on a path that does not exist, precisely so a typo cannot make
     the check vacuously "fresh". Asserting it here names the offender directly instead of
     surfacing as a throw from inside the guard on whichever machine next runs a build. */
  for (const abs of PANEL_BUILD_INPUTS) {
    assert.ok(existsSync(abs), `declared panel build input does not exist: ${path.relative(REPO, abs)}`);
  }
  assert.equal(new Set(PANEL_BUILD_INPUTS).size, PANEL_BUILD_INPUTS.length,
    'PANEL_BUILD_INPUTS contains a duplicate');
});

test('the build-rendered corpus refuses the directory bin/render_panels.mjs owns', () => {
  /* tests/__panels__/ms3/ holds the SOURCE-registry render. A build-rendered --write there
     would silently overwrite a corpus another tool maintains, so asking for it throws. */
  assert.ok(!BUILD_SNAPSHOT_AUDIENCES.includes('ms3'),
    'ms3 must not gain a build-rendered corpus while bin/render_panels.mjs owns that directory');
  assert.throws(() => buildSnapshotDir('ms3'), /render_panels\.mjs/);
  assert.throws(() => buildSnapshotDir('nope'), /no build-rendered corpus/);
  for (const site of BUILD_SNAPSHOT_AUDIENCES) {
    assert.ok(AUDIENCES.includes(site), `${site} is gated but is not a known audience`);
  }
});

// ---- contracts that read the build ----------------------------------------------------------

test('each build injects exactly one of each FD_* payload, and they evaluate', (t) => {
  forFreshSites(t, AUDIENCES, (site) => {
    // builtPayload asserts presence, uniqueness and object-ness per payload; this pins that the
    // extraction reaches real data rather than an empty object that would render empty panels.
    const ctx = builtPayload(site);
    assert.ok(Object.keys(ctx.FD_TOPIC_META).length > 50,
      `${site}: FD_TOPIC_META has implausibly few entries (${Object.keys(ctx.FD_TOPIC_META).length})`);
    assert.ok(Object.keys(ctx.FD_CURRICULUM).length > 0, `${site}: FD_CURRICULUM is empty`);
    assert.ok(Object.keys(ctx.FD_SITE_MANIFEST).length > 0, `${site}: FD_SITE_MANIFEST is empty`);
  });
});

test('the resident build ships a payload the MS3 snapshots do not describe', (t) => {
  /* This is the whole reason tests/__panels__/res/ exists, so it is pinned rather than
     asserted in a comment. Until 2026-09-21 the repo's answer to "is the resident site
     gated?" was a caveat in tests/panel-snapshots.test.mjs saying it was not. */
  // This one comparison needs BOTH trees, so it cannot use the per-site loop: a run with only
  // one fresh build must skip rather than compare a fresh tree against a stale one.
  const stale = AUDIENCES.map((s) => staleBuildReason(REPO, s, PANEL_BUILD_INPUTS)).filter(Boolean);
  if (stale.length) { t.skip(stale.join(' | ')); return; }

  const ms3 = new Map(renderFromBuild('ms3'));
  const res = new Map(renderFromBuild('res'));
  const resOnly = [...res.keys()].filter((k) => !ms3.has(k));
  const shared = [...res.keys()].filter((k) => ms3.has(k));
  const differ = shared.filter((k) => ms3.get(k) !== res.get(k));

  assert.ok(resOnly.length > 0,
    'no resident-only panel; if the two sites really converged, this gate needs rethinking');
  assert.ok(differ.length > 0,
    'no shared page renders differently on res; the resident overlay would then be a no-op');
  // Resident Case-of-the-Week panels are derived at build time and exist in no source registry.
  assert.ok(resOnly.some((k) => k.endsWith('_res.md')),
    'no resident Case-of-the-Week panel; those exist only in the build');
  t.diagnostic(`res-only ${resOnly.length} · shared-but-different ${differ.length} of ${shared.length}`);
});

test('every panel the res build publishes has a snapshot, and none outlives its page', (t) => {
  forFreshSites(t, BUILD_SNAPSHOT_AUDIENCES, (site) => {
    const dir = fileURLToPath(buildSnapshotDir(site));
    assert.ok(existsSync(dir), `tests/__panels__/${site}/ is missing — ${REGEN(site)}`);
    const panels = renderFromBuild(site);
    assert.ok(panels.length > 0, `${site}: no panel rendered at all; the harness is broken`);

    const want = new Set(panels.map(([ref]) => snapshotName(ref)));
    const onDisk = readdirSync(dir).filter((f) => f.endsWith('.html'));
    assert.deepEqual(panels.filter(([ref]) => !onDisk.includes(snapshotName(ref))).map(([r]) => r), [],
      `${site}: pages with no snapshot — ${REGEN(site)}`);
    assert.deepEqual(onDisk.filter((f) => !want.has(f)), [],
      `${site}: snapshots for pages that no longer render a panel — ${REGEN(site)}`);
  });
});

test('the stored res snapshots are real panels, not an empty render agreeing with empty files', (t) => {
  /* The vacuous pass #480 shipped: a check that passes because both sides are empty proves
     nothing. A snapshot must actually contain a panel. */
  forFreshSites(t, BUILD_SNAPSHOT_AUDIENCES, (site) => {
    const dir = fileURLToPath(buildSnapshotDir(site));
    for (const [ref] of renderFromBuild(site)) {
      const got = readFileSync(path.join(dir, snapshotName(ref)), 'utf8');
      assert.match(got, /<details class="topic-tpl practice-panel">/, `${site}/${ref}: not a panel`);
      assert.match(got, /<span class="practice-title">On the Unit Practice and Tools<\/span>/,
        `${site}/${ref}: snapshot has lost the panel title`);
      assert.ok(got.length > 200, `${site}/${ref}: implausibly short (${got.length} bytes)`);
    }
  });
});

test('the res coverage gap is exactly the pages that render no panel', (t) => {
  /* Named as a set rather than counted, so a new resident page that should have a panel
     lands here by name instead of moving a number someone can bump. */
  forFreshSites(t, BUILD_SNAPSHOT_AUDIENCES, (site) => {
    const rendered = new Set(renderFromBuild(site).map(([ref]) => ref));
    const uncovered = [...shippedPanelRefs(site)].filter((s) => !rendered.has(s)).sort();
    assert.deepEqual(uncovered, ['rapid_review.md'],
      `the set of ${site} shipped pages with no panel changed.\n`
      + '  rapid_review.md ships with no topic_meta entry, so it renders no panel.\n'
      + `  If a page gained or lost one, ${REGEN(site)} and update this set.`);
  });
});

test('the res snapshot format only inserts line breaks — no render change can hide in it', (t) => {
  forFreshSites(t, BUILD_SNAPSHOT_AUDIENCES, (site) => {
    const dir = fileURLToPath(buildSnapshotDir(site));
    for (const [ref, html] of renderFromBuild(site)) {
      const stored = readFileSync(path.join(dir, snapshotName(ref)), 'utf8');
      // Reversing the stored file must return the rendered markup byte for byte. If formatPanel
      // normalised anything, a real change could be formatted away on both sides and pass.
      assert.equal(stored.replace(/\n$/, '').split('>\n<').join('><'), html,
        `${site}/${ref}: un-formatting the snapshot does not return the rendered panel`);
      assert.equal(stored, formatPanel(html), `${site}/${ref}: snapshot is not the formatted render`);
    }
  });
});
