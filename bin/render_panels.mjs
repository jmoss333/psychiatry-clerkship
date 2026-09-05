#!/usr/bin/env node
/* Render every "On the Unit Practice and Tools" panel and compare it against tests/__panels__/.
 *
 * WHAT IT ANSWERS: "does this source edit change what a learner actually sees?" — the question
 * that came up in WP-A, WP-B and WP-F and was answered each time by a hand-written script that
 * was then thrown away. The headline output is the measurement those answers turned on:
 *
 *     0 of 74 panels changed
 *
 * READ THE SCOPE LINE IT PRINTS. This renders the MS3 SOURCE REGISTRIES, which is not what
 * either site ships: the resident build injects its own overlaid payload, and both builds
 * append Case-of-the-Week panels at build time. 74 of 97 shipped pages are covered. The gap
 * is pinned as data in tests/panel-snapshots.test.mjs so a new uncovered producer fails.
 *
 * USAGE
 *   node bin/render_panels.mjs            # check: exit 1 if any panel drifted from its snapshot
 *   node bin/render_panels.mjs --write    # accept the current render as the new snapshot
 *
 * HOW TO USE IT ON A CHANGE. Run it before you edit to confirm you start clean, then after. If
 * the count is 0, your edit is provably invisible to learners and you can say so with a number.
 * If it is not 0, run --write and read the diff of tests/__panels__/ — that diff IS the set of
 * learner-visible changes, page by page, and it belongs in the PR as the evidence for them.
 *
 * WHY JS AND NOT PYTHON, unlike the rest of bin/: the renderer being pinned is JavaScript inside
 * spa_index.html, and it is evaluated for real rather than re-implemented. A Python port would be
 * a second renderer that could disagree with the shipped one, which is the failure this prevents.
 *
 * The enforcing gate is tests/panel-snapshots.test.mjs, which runs under the existing
 * `node --test tests/*.test.mjs` step. Nothing needs adding to ci.yml — so this trips none of the
 * three contracts CLAUDE.md warns a new CI step trips.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  renderAll, formatPanel, snapshotName, SNAPSHOT_DIR,
} from '../tests/_panel_render.mjs';

const WRITE = process.argv.includes('--write');
const dir = fileURLToPath(SNAPSHOT_DIR);

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: node bin/render_panels.mjs [--write]\n'
    + '  (no flag)  compare the live render against tests/__panels__/; exit 1 on drift\n'
    + '  --write    accept the current render as the new snapshot');
  process.exit(0);
}

const panels = renderAll();
const expected = new Map(panels.map(([ref, html]) => [snapshotName(ref), formatPanel(html)]));

if (WRITE) mkdirSync(dir, { recursive: true });
const onDisk = existsSync(dir) ? new Set(readdirSync(dir).filter((f) => f.endsWith('.html'))) : new Set();

const changed = [];
const added = [];
for (const [ref, html] of panels) {
  const name = snapshotName(ref);
  const want = formatPanel(html);
  if (!onDisk.has(name)) { added.push(ref); continue; }
  if (readFileSync(`${dir}/${name}`, 'utf8') !== want) changed.push(ref);
}
const orphaned = [...onDisk].filter((f) => !expected.has(f));

if (WRITE) {
  for (const [name, text] of expected) writeFileSync(`${dir}/${name}`, text);
  // An orphan is a page that stopped rendering a panel. Leaving it behind would let a snapshot
  // outlive the page it describes, so --write removes it and says which.
  for (const f of orphaned) rmSync(`${dir}/${f}`);
}

const drift = changed.length + added.length + orphaned.length;
const verb = WRITE ? 'written' : 'compared';
console.log(`${panels.length} panels ${verb} against ${dir.replace(`${process.cwd()}/`, '')}`);
// Name the reach every run. "0 of 74 changed" alone reads as "nothing a learner sees moved",
// which is not what this measures: neither shipped site renders from the source registries,
// and 23 shipped pages have no snapshot at all (Codex P2 on #539).
console.log('scope: MS3 source registries \u2014 74 of 97 shipped pages.'
  + ' Resident overlays and the 22 build-generated Case-of-the-Week panels are NOT covered.');
console.log(`${changed.length} of ${panels.length} panels changed`
  + (added.length ? `, ${added.length} new` : '')
  + (orphaned.length ? `, ${orphaned.length} orphaned` : ''));

const list = (label, refs) => { for (const r of refs) console.log(`  ${label} ${r}`); };
list('changed ', changed);
list('new     ', added);
list('orphaned', orphaned);

if (!drift) process.exit(0);
if (WRITE) { console.log('\nSnapshots updated. Read the diff — it is the learner-visible change.'); process.exit(0); }
console.log('\nThe rendered panels no longer match their snapshots.\n'
  + 'If the change is intended, run `node bin/render_panels.mjs --write` and commit the diff.');
process.exit(1);
