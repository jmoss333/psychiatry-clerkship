/* Snapshot gate for the pinned "On the Unit Practice and Tools" panel.
 *
 * WHAT THIS PINS, that tests/practice-panel.test.mjs does not: that file asserts PROPERTIES of the
 * rendered panel — no rights reference is offered as an action, no audience token in the chrome,
 * no missing-quiz apology. Properties catch the defects you thought to look for. This catches the
 * ones you did not: any change at all to what a learner sees, on any of the 74 pages.
 *
 * It exists because the same claim kept being made by hand. "Rendering all 74 panels before and
 * after gives byte-identical output, 0 of 74 changed" was the strongest verification in WP-F, and
 * it was a sentence in a PR body backed by a script that no longer existed. Now it is a number
 * anyone can reproduce with `node bin/render_panels.mjs`, and a red test when it is not 0.
 *
 * THE FRICTION IS THE FEATURE. An intended change to the panel now requires regenerating these
 * snapshots, and the resulting diff of tests/__panels__/ is the learner-visible delta, page by
 * page. Reviewing that diff is the point; committing it is how the change gets evidenced. Do not
 * relax this test to avoid regenerating — regenerate.
 *
 * The snapshots depend only on source, never on _build/, so `node bin/render_panels.mjs --write`
 * always repairs them and does not run through build_and_check.sh. That ordering matters: see the
 * note in tests/_panel_render.mjs about the trap a build-dependent test falls into.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  renderAll, formatPanel, unformatPanel, snapshotName, SNAPSHOT_DIR, topicEntries,
  TOPIC_META, manifestTitle, F,
} from './_panel_render.mjs';

const DIR = fileURLToPath(SNAPSHOT_DIR);
const REGEN = 'run `node bin/render_panels.mjs --write` and commit the diff';
const panels = renderAll();

test('the snapshot directory exists and is populated', () => {
  assert.ok(existsSync(DIR), `tests/__panels__/ is missing — ${REGEN}`);
  assert.ok(panels.length > 0, 'no panel rendered at all; the render harness is broken');
  assert.equal(panels.length, topicEntries.length,
    'every topic_meta entry is expected to render a panel; if that changed on purpose, update this count');
});

test('every rendered panel matches its snapshot byte for byte', () => {
  const missing = [];
  const differs = [];
  for (const [ref, html] of panels) {
    const file = `${DIR}/${snapshotName(ref)}`;
    if (!existsSync(file)) { missing.push(ref); continue; }
    const want = formatPanel(html);
    const got = readFileSync(file, 'utf8');
    if (got !== want) {
      // Name the first differing line, so a red test says WHERE rather than just "changed".
      const a = got.split('\n');
      const b = want.split('\n');
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
      differs.push(`${ref} (line ${i + 1})\n      snapshot: ${JSON.stringify(a[i] ?? '<eof>')}\n      rendered: ${JSON.stringify(b[i] ?? '<eof>')}`);
    }
  }
  assert.deepEqual(missing, [], `pages with no snapshot — ${REGEN}`);
  assert.equal(differs.length, 0,
    `${differs.length} of ${panels.length} panels changed what a learner sees.\n`
    + `If that is intended, ${REGEN}; the diff is the change.\n\n    ${differs.join('\n    ')}`);
});

test('no snapshot outlives the page it describes', () => {
  const want = new Set(panels.map(([ref]) => snapshotName(ref)));
  const orphaned = readdirSync(DIR).filter((f) => f.endsWith('.html') && !want.has(f));
  assert.deepEqual(orphaned, [], `snapshots for pages that no longer render a panel — ${REGEN}`);
});

test('the stored snapshots are real panels, not an empty render agreeing with an empty file', () => {
  // The failure this guards is the one that made a WP-B assertion vacuous on #480: a check that
  // passes because both sides are empty proves nothing. A snapshot must actually contain a panel.
  for (const [ref] of panels) {
    const got = readFileSync(`${DIR}/${snapshotName(ref)}`, 'utf8');
    assert.match(got, /<details class="topic-tpl practice-panel">/, `${ref}: snapshot is not a panel`);
    assert.match(got, /<span class="practice-title">On the Unit Practice and Tools<\/span>/,
      `${ref}: snapshot has lost the panel title`);
    assert.ok(got.length > 200, `${ref}: snapshot is implausibly short (${got.length} bytes)`);
  }
});

test('the snapshot format only inserts line breaks — no render change can hide in it', () => {
  // formatPanel breaks between adjacent tags so the diff is readable. If it also normalised or
  // dropped anything, a real change could be formatted away and the gate would pass through it.
  // Pinned on the whole real corpus, because the property has to hold for the content that exists.
  for (const [ref, html] of panels) {
    assert.equal(unformatPanel(formatPanel(html)), html,
      `${ref}: formatting a panel and reversing it does not return the original`);
  }
});

// ---- coverage boundary (Codex P2 on #539) ------------------------------------------------------
//
// The gate above proves the 74 snapshotted panels did not move. It does NOT prove "nothing a
// learner sees changed", and the difference is the whole reason these two tests exist.
//
// Neither shipped site renders from the source registries this harness reads. The resident build
// injects its own FD_TOPIC_META/FD_SITE_MANIFEST (resident_section.py:301, :358) and both builds
// append Case-of-the-Week topic_meta derived at build time (build_deploy.py:308,
// resident_section.py:318). Rather than leave that in a comment for someone to not read, the gap
// is asserted against shipped_pages.json — the derived universe ADR-002 requires code to ask,
// instead of the producers. A new page-producing route lands in `unexplained` and fails here.

const SHIPPED = JSON.parse(
  readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/shipped_pages.json', import.meta.url), 'utf8'),
);

test('the coverage gap has exactly its known dimensions', () => {
  const snapped = new Set(panels.map(([ref]) => ref));
  const shippedPages = SHIPPED.pages.filter((p) => p.kind === 'page');
  const uncovered = shippedPages.filter((p) => !snapped.has(p.slug));

  // NOTE ON WHAT DOES *NOT* WORK HERE, because the first version of this test did it and was
  // vacuous. Partitioning `uncovered` into known buckets and asserting the remainder is empty
  // proves nothing: `snapped` is built from every rendering topic_meta entry, so a page cannot
  // be both uncovered AND renderable-from-source. That remainder is empty by construction —
  // an assertion that can never fail, which is the defect the vacuity guard above exists for.
  //
  // What actually bites is pinning the gap's DIMENSIONS. Each number below moves for a real
  // reason — a new Case-of-the-Week, a page gaining or losing its panel, a new page-producing
  // route — and moving it fails here, forcing a deliberate decision instead of silent drift.
  const byProducer = {};
  for (const p of uncovered) byProducer[p.producer] = (byProducer[p.producer] || 0) + 1;

  assert.deepEqual(byProducer, { cotw_registry: 22, site_manifest: 1 },
    'the set of shipped pages with no snapshot changed.\n'
    + '  cotw_registry: Case-of-the-Week panels, derived at build time, unrenderable from source.\n'
    + '  site_manifest: rapid_review.md ships to both sites with no topic_meta entry, so no panel.\n'
    + 'If a new route now puts panels on a learner site, snapshot them or record why not.');

  assert.equal(shippedPages.length - uncovered.length, panels.length,
    'snapshot coverage no longer equals shipped pages minus the known gap');

  // The non-COTW page is uncovered because it renders NO panel. If it ever gains one it needs
  // a snapshot, and the pinned counts above need revisiting rather than bumping.
  for (const p of uncovered.filter((x) => x.producer !== 'cotw_registry')) {
    assert.ok(!(TOPIC_META[p.slug] && F.hasPracticeTpl(TOPIC_META[p.slug])),
      `${p.slug} now renders a panel but has no snapshot`);
  }
});

test('the snapshots record the MS3 payload, which is not what the resident site ships', () => {
  // Pins the audience caveat as data. resident_section.py:272 titles shelf-mode.html
  // "Board-Style Question Bank"; the source manifest this harness reads calls it
  // "Shelf Mode — Exam Simulation". Seeing the MS3 string here is CORRECT for these snapshots
  // and is exactly why they must not be read as covering the resident site.
  const withShelf = panels.filter(([, html]) => html.includes('?tool=shelf-mode.html'));
  assert.ok(withShelf.length > 0, 'no panel links shelf-mode.html; this caveat needs rechecking');
  assert.equal(manifestTitle('shelf-mode.html'), 'Shelf Mode — Exam Simulation',
    'the source manifest title changed; re-check what the resident build renders');
});
