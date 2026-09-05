#!/usr/bin/env node
/* Render every "On the Unit Practice and Tools" panel each site publishes and compare it
 * against tests/__panels__/<site>/.
 *
 * WHAT IT ANSWERS: "does this change what a learner actually sees?" — the question that came up
 * in WP-A, WP-B and WP-F and was answered each time by a hand-written script that was then
 * thrown away. The headline output is the measurement those answers turned on:
 *
 *     0 of 164 panels changed
 *
 * It renders from _build/<site>/index.html, which carries the injected payloads AND the panel
 * code with its case-title needle already replaced. So this is the shipped renderer over the
 * shipped data, per audience: resident overlays and the build-derived Case-of-the-Week panels
 * are covered, and nothing is re-derived.
 *
 * USAGE
 *   node bin/render_panels.mjs                     # check both audiences
 *   node bin/render_panels.mjs --site res          # check one
 *   node bin/render_panels.mjs --write             # accept the current render as the snapshot
 *
 * Needs a current _build/. `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`
 * builds BOTH trees, so one run is enough to regenerate both audiences.
 *
 * HOW TO USE IT ON A CHANGE. Run it before you edit to confirm you start clean, then after. If
 * the count is 0, your edit is provably invisible to learners and you can say so with a number.
 * If it is not 0, run --write and read the diff of tests/__panels__/ — that diff IS the set of
 * learner-visible changes, page by page, and it belongs in the PR as the evidence for them.
 *
 * WHY JS AND NOT PYTHON, unlike the rest of bin/: the renderer being pinned is JavaScript, and
 * it is evaluated for real rather than re-implemented. A Python port would be a second renderer
 * that could disagree with the shipped one, which is the failure this prevents.
 *
 * THE ENFORCING GATE is build_and_check.sh, which calls this with --check after build_deploy.py.
 * ci.yml and bin/verify.sh already run that script for both sites, so this adds no CI step and
 * trips none of the three contracts CLAUDE.md warns a new one trips. Running after the build is
 * also what keeps --write always available: a failure leaves _build/ current.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { staleBuildReason } from '../tests/_build_freshness.mjs';
import {
  AUDIENCES, PANEL_BUILD_INPUTS, formatPanel, renderFromBuild, shippedPanelRefs,
  snapshotDir, snapshotName,
} from '../tests/_panel_render.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log('usage: node bin/render_panels.mjs [--check|--write] [--site ms3|res]\n'
    + '  --check   (default) compare the live render against tests/__panels__/; exit 1 on drift\n'
    + '  --write   accept the current render as the new snapshot\n'
    + '  --site    limit to one audience (default: both)');
  process.exit(0);
}

const WRITE = argv.includes('--write');
const siteFlag = argv.indexOf('--site');
if (siteFlag !== -1 && !AUDIENCES.includes(argv[siteFlag + 1] || '')) {
  console.error(`--site needs one of ${AUDIENCES.join('|')}`);
  process.exit(2);
}
const sites = siteFlag === -1 ? [...AUDIENCES] : [argv[siteFlag + 1]];

let drift = 0;
let covered = 0;
let shippedTotal = 0;
const shippedSeen = new Set();

for (const site of sites) {
  const stale = staleBuildReason(REPO, site, PANEL_BUILD_INPUTS);
  if (stale) {
    console.error(`cannot render ${site}: ${stale}`);
    process.exit(2);
  }

  const dir = fileURLToPath(snapshotDir(site));
  const panels = renderFromBuild(site);
  const expected = new Map(panels.map(([ref, html]) => [snapshotName(ref), formatPanel(html)]));

  if (WRITE) mkdirSync(dir, { recursive: true });
  const onDisk = existsSync(dir)
    ? new Set(readdirSync(dir).filter((f) => f.endsWith('.html')))
    : new Set();

  const changed = [];
  const added = [];
  for (const [name, want] of expected) {
    if (!onDisk.has(name)) { added.push(name); continue; }
    if (readFileSync(path.join(dir, name), 'utf8') !== want) changed.push(name);
  }
  // An orphan is a page that stopped publishing a panel on this site. Leaving it behind would
  // let a snapshot outlive the page it describes, so --write removes it and says which.
  const orphaned = [...onDisk].filter((f) => !expected.has(f));

  if (WRITE) {
    for (const [name, text] of expected) writeFileSync(path.join(dir, name), text);
    for (const f of orphaned) rmSync(path.join(dir, f));
  }

  const ships = shippedPanelRefs(site);
  const noPanel = [...ships].filter((ref) => !expected.has(snapshotName(ref))).sort();
  for (const ref of ships) shippedSeen.add(ref);
  shippedTotal += ships.size;
  covered += panels.length;
  drift += changed.length + added.length + orphaned.length;

  console.log(`${site}: ${panels.length} panels ${WRITE ? 'written' : 'compared'}`
    + ` · ${ships.size} pages ship`
    + (noPanel.length ? ` · ${noPanel.length} render no panel (${noPanel.join(', ')})` : ''));
  const list = (label, names) => { for (const n of names) console.log(`    ${label} ${n}`); };
  list('changed ', changed);
  list('new     ', added);
  list('orphaned', orphaned);
}

if (sites.length === AUDIENCES.length) {
  console.log(`coverage: ${covered} panels over ${shippedSeen.size} distinct shipped pages`
    + ` (${shippedTotal} page-site pairs)`);
}
console.log(`${drift} of ${covered} panels changed`);

if (!drift) process.exit(0);
if (WRITE) {
  console.log('\nSnapshots updated. Read the diff — it is the learner-visible change.');
  process.exit(0);
}
console.log('\nThe rendered panels no longer match their snapshots.\n'
  + 'If the change is intended, run `node bin/render_panels.mjs --write` and commit the diff.');
process.exit(1);
