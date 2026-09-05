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
