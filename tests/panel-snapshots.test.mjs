/* Snapshot contracts for the pinned "On the Unit Practice and Tools" panel.
 *
 * WHAT RUNS WHERE, and why it is split. The byte-comparison — "did any panel change?" — needs a
 * build, so it runs from build_and_check.sh AFTER build_deploy.py (see bin/render_panels.mjs).
 * Everything in THIS file reads only committed files, so it runs on a fresh clone in CI, where
 * _build/ does not exist. Putting the comparison here instead would either skip in CI or wedge
 * the build that repairs it (CLAUDE.md, T17).
 *
 * WHAT THIS PINS, that tests/practice-panel.test.mjs does not: that file asserts PROPERTIES of a
 * rendered panel. This asserts properties of the stored corpus — that it is complete against what
 * ships, that it contains real panels, and that its storage format can hide nothing.
 *
 * THE FRICTION IS THE FEATURE. An intended change to the panel requires regenerating these
 * snapshots, and the resulting diff of tests/__panels__/ is the learner-visible delta, page by
 * page. Reviewing that diff is the point; committing it is how the change gets evidenced. Do not
 * relax these tests to avoid regenerating — regenerate.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  AUDIENCES, TOPIC_META, formatPanel, shippedPanelRefs, snapshotDir, snapshotName, unformatPanel,
} from './_panel_render.mjs';

const REGEN = 'rebuild, then run `node bin/render_panels.mjs --write` and commit the diff';
const dirOf = (site) => fileURLToPath(snapshotDir(site));
const filesOf = (site) => readdirSync(dirOf(site)).filter((f) => f.endsWith('.html')).sort();

test('both audiences have a populated snapshot directory', () => {
  for (const site of AUDIENCES) {
    assert.ok(existsSync(dirOf(site)), `tests/__panels__/${site}/ is missing — ${REGEN}`);
    assert.ok(filesOf(site).length > 0, `tests/__panels__/${site}/ is empty — ${REGEN}`);
  }
});

test('every shipped page that renders a panel has a snapshot, and nothing else does', () => {
  // The set difference, not a count. #539 pinned {cotw_registry: 22, site_manifest: 1}; those
  // numbers move for several unrelated reasons and invite being bumped. A named set does not.
  for (const site of AUDIENCES) {
    const stored = new Set(filesOf(site));
    const shipped = [...shippedPanelRefs(site)].sort();

    const missing = shipped.filter((ref) => !stored.has(snapshotName(ref)));
    assert.deepEqual(missing, ['rapid_review.md'],
      `${site}: the set of shipped pages with no snapshot changed.\n`
      + '  rapid_review.md is expected here and only here: it has no topic_meta entry, so it\n'
      + '  renders no panel. Anything else means a page that ships lost or gained a panel, or a\n'
      + `  new page-producing route appeared — snapshot it (${REGEN}) or record why not.`);

    const shippedFiles = new Set(shipped.map(snapshotName));
    const extra = [...stored].filter((f) => !shippedFiles.has(f)).sort();
    assert.deepEqual(extra, [],
      `${site}: snapshots for pages that site does not publish — ${REGEN}`);
  }
});

test('the one uncovered page is uncovered because it has no metadata at all', () => {
  // Guards the exemption above from decaying into a permanent excuse. If rapid_review.md ever
  // gains a topic_meta entry it can render a panel, and it needs a snapshot like everything else.
  assert.ok(!TOPIC_META['rapid_review.md'],
    'rapid_review.md now has a topic_meta entry — it may render a panel and needs snapshotting');
});

test('the stored snapshots are real panels, not an empty render agreeing with an empty file', () => {
  // The failure this guards is the one that made a WP-B assertion vacuous on #480: a check that
  // passes because both sides are empty proves nothing. A snapshot must actually contain a panel.
  for (const site of AUDIENCES) {
    for (const file of filesOf(site)) {
      const got = readFileSync(path.join(dirOf(site), file), 'utf8');
      assert.match(got, /<details class="topic-tpl practice-panel">/, `${site}/${file}: not a panel`);
      assert.match(got, /<span class="practice-title">On the Unit Practice and Tools<\/span>/,
        `${site}/${file}: has lost the panel title`);
      assert.ok(got.length > 200, `${site}/${file}: implausibly short (${got.length} bytes)`);
    }
  }
});

test('the snapshot format only inserts line breaks — no render change can hide in it', () => {
  // formatPanel breaks between adjacent tags so the diff is readable. If it also normalised or
  // dropped anything, a real change could be formatted away and the gate would pass through it.
  // Pinned on the whole stored corpus, because the property has to hold for the content that
  // exists — and reading the corpus keeps this build-independent.
  for (const site of AUDIENCES) {
    for (const file of filesOf(site)) {
      const stored = readFileSync(path.join(dirOf(site), file), 'utf8');
      assert.equal(formatPanel(unformatPanel(stored)), stored,
        `${site}/${file}: unformatting a snapshot and reformatting it does not return the original`);
    }
  }
});

test('the audiences are stored apart, and their difference is real', () => {
  // 68 refs ship to both sites and only a handful render differently. Storing them per audience
  // costs duplication and buys the ability to say WHICH site a file describes — the ambiguity
  // that let a resident-only change report zero drift (Codex P2 on #539).
  const resFiles = new Set(filesOf('res'));
  const shared = filesOf('ms3').filter((f) => resFiles.has(f));
  assert.ok(shared.length > 50, `expected many pages to ship to both sites, saw ${shared.length}`);
  const differing = shared.filter((f) => readFileSync(path.join(dirOf('ms3'), f), 'utf8')
    !== readFileSync(path.join(dirOf('res'), f), 'utf8'));
  assert.ok(differing.length > 0,
    'no shared page renders differently between audiences; the resident overlay may have stopped '
    + 'being applied, or the two corpora are no longer built from different payloads');
});
