/* Build-dependent regression pins for the two defects Codex reported on #539.
 *
 * These are LOCAL-ONLY contracts by construction: node --test runs before build_and_check.sh
 * reaches build_deploy.py, and CI clones fresh, so _build/ is absent there and these skip.
 * The enforcing gate is the byte-comparison inside build_and_check.sh — this file exists so
 * the two specific defects have named, readable pins rather than living only in 164 snapshots.
 *
 * Guarded with staleBuildReason(), never existsSync(): a _build/ older than the sources under
 * test fails honestly and that red would abort the build that repairs it (CLAUDE.md, T17).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';
import { renderFromBuild, shippedPanelRefs, PANEL_BUILD_INPUTS } from './_panel_render.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const stale = (site) => staleBuildReason(REPO, site, PANEL_BUILD_INPUTS);

test('the resident build renders its own shelf-mode title, the MS3 build does not', (t) => {
  for (const site of ['ms3', 'res']) {
    const reason = stale(site);
    if (reason) return t.skip(reason);
  }
  const titleOf = (site) => {
    const seen = new Set();
    for (const [, html] of renderFromBuild(site)) {
      for (const m of html.matchAll(/Board-Style Question Bank|Shelf Mode — Exam Simulation/g)) seen.add(m[0]);
    }
    return seen;
  };
  assert.deepEqual([...titleOf('ms3')], ['Shelf Mode — Exam Simulation']);
  assert.deepEqual([...titleOf('res')], ['Board-Style Question Bank']);
});

test('every Case-of-the-Week page that ships renders a snapshotted panel', (t) => {
  for (const site of ['ms3', 'res']) {
    const reason = stale(site);
    if (reason) return t.skip(reason);
  }
  for (const site of ['ms3', 'res']) {
    const rendered = new Set(renderFromBuild(site).map(([ref]) => ref));
    const cotw = [...shippedPanelRefs(site)].filter((ref) => ref.startsWith('cotw_2'));
    assert.ok(cotw.length >= 11, `${site}: expected the COTW registry's cases to ship, saw ${cotw.length}`);
    assert.deepEqual(cotw.filter((ref) => !rendered.has(ref)), [],
      `${site}: a shipped Case-of-the-Week page renders no panel`);
  }
});

test('a build renders no panel for a page that site does not publish', (t) => {
  const reason = stale('ms3');
  if (reason) return t.skip(reason);
  // The six resident_extra pages have entries in the shared topic_meta.json, so the MS3
  // build CAN render them — but the MS3 site never publishes them. Filtering by what ships
  // is what keeps them out of the MS3 snapshots (spec D-3).
  const shipped = shippedPanelRefs('ms3');
  for (const [ref] of renderFromBuild('ms3')) {
    assert.ok(shipped.has(ref), `${ref} is rendered for ms3 but does not ship there`);
  }
  assert.ok(!shipped.has('rotation.md'), 'rotation.md is expected to be resident-only');
});
