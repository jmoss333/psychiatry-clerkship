/* Build-dependent regression pins for three defects: the two Codex reported on #539 (resident
 * overlays invisible; Case-of-the-Week panels unsnapshotted) and one found in-house -- six
 * `resident_extra` pages the MS3 build renders but the MS3 site never publishes.
 *
 * These are LOCAL-ONLY contracts by construction: node --test runs before build_and_check.sh
 * reaches build_deploy.py, and CI clones fresh, so _build/ is absent there and these skip.
 * The enforcing gate is the byte-comparison inside build_and_check.sh — this file exists so
 * each of the three defects has a named, readable pin rather than living only in 164 snapshots.
 *
 * Guarded with staleBuildReason(), never existsSync(): a _build/ older than the sources under
 * test fails honestly and that red would abort the build that repairs it (CLAUDE.md, T17).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';
import {
  builtPayload, renderFromBuild, shippedPanelRefs, PANEL_BUILD_INPUTS,
} from './_panel_render.mjs';

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

/* The six resident_extra pages live in the SHARED topic_meta.json, so BOTH builds inject them
 * into FD_TOPIC_META and either build COULD render them; only the ships filter keeps them out of
 * the MS3 set (spec D-3). Named here rather than derived from shipped_pages.json, because a list
 * computed from the same source the filter consults would move with it and pin nothing. */
const RESIDENT_ONLY = ['adv_psychopharm.md', 'canon_200.md', 'cl_reference.md', 'rotation.md',
  'supervision_teaching.md', 'systems_medlegal.md'];

test('a build renders no panel for a page that site does not publish', (t) => {
  for (const site of ['ms3', 'res']) {
    const reason = stale(site);
    if (reason) return t.skip(reason);
  }
  /* Three legs, because the interesting claim is the DIFFERENCE between them. Asserting only
   * "everything renderFromBuild('ms3') returned ships on ms3" restates that function's own
   * filter predicate and cannot fail whatever the code does — the tautology this replaces. */
  const ms3Meta = builtPayload('ms3').FD_TOPIC_META;
  assert.deepEqual(RESIDENT_ONLY.filter((ref) => !(ref in ms3Meta)), [],
    'the MS3 build no longer injects these, so the ships filter is not what excludes them');

  const ms3Ships = shippedPanelRefs('ms3');
  assert.deepEqual(RESIDENT_ONLY.filter((ref) => ms3Ships.has(ref)), [],
    'these are expected to be resident-only');

  const ms3Rendered = new Set(renderFromBuild('ms3').map(([ref]) => ref));
  assert.deepEqual(RESIDENT_ONLY.filter((ref) => ms3Rendered.has(ref)), [],
    'a page the MS3 site does not publish rendered into the MS3 panel set');

  const resRendered = new Set(renderFromBuild('res').map(([ref]) => ref));
  assert.deepEqual(RESIDENT_ONLY.filter((ref) => !resRendered.has(ref)), [],
    'the resident site publishes these, so each must render a panel in the resident set');
});
