#!/usr/bin/env node
/* Gate the "On the Unit Practice and Tools" panels a BUILD publishes, per audience.
 *
 * WHAT IT ADDS TO bin/render_panels.mjs, which it does not replace. That tool renders the MS3
 * SOURCE registries and owns tests/__panels__/ms3/. It cannot cover the resident site at all:
 * resident_section.py patches topic_meta with resident CTAs and rebuilds the manifest from
 * resident nav, and both builds append Case-of-the-Week topic_meta derived at build time. None
 * of that exists in the source tree, so until now a whole shipped audience had no snapshot —
 * 87 resident panels, of which 19 render markup that appears nowhere in the MS3 corpus (13
 * resident Case-of-the-Week pages and 6 resident-only pages) and 6 more render DIFFERENTLY on
 * the two sites. This renders _build/<site>/index.html instead: the shipped renderer over the
 * shipped data, so nothing is re-derived and no second renderer can disagree with the first.
 *
 * WHY IT IS NOT A `tests/*.test.mjs` FILE. It needs the build. `node --test` runs BEFORE
 * build_deploy.py inside build_and_check.sh and on a fresh clone in CI, so a build-dependent
 * assertion placed there skips exactly where it matters — and a red one would abort the very
 * build that repairs it. It runs from build_and_check.sh AFTER the per-site build instead,
 * where _build/<site> is current by construction, so it gates Netlify, CI and bin/verify.sh.
 * (tests/panel-build-render.test.mjs pins the MACHINERY in the node suite, skipping when the
 * build is absent; this file is the corpus gate.)
 *
 * WHY THE FRESHNESS GUARD MATTERS ANYWAY. Run standalone — the normal way to re-check without a
 * rebuild — _build/ can be older than the inputs that feed a panel. Comparing a current corpus
 * against a stale render reports "0 panels changed" over a build its own inputs have outrun:
 * a false clean, which is worse than no gate. staleBuildReason() turns that into exit 2 naming
 * the input that outran the build, so "could not check" can never read as "checked, clean".
 *
 * USAGE
 *   node tests/panel_build_gate.mjs --site res            # check; exit 1 on drift, 2 if stale
 *   node tests/panel_build_gate.mjs --site res --write    # accept the render as the new corpus
 *
 * EXITS  0 clean · 1 drift · 2 could-not-check (stale/absent build, or a bad argument).
 * Exit 2 is deliberately NOT 0: a gate that cannot see its subject must not report success.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { staleBuildReason } from './_build_freshness.mjs';
import {
  BUILD_SNAPSHOT_AUDIENCES, PANEL_BUILD_INPUTS, buildSnapshotDir, formatPanel, renderFromBuild,
  snapshotName,
} from './_panel_render.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);

const USAGE = 'usage: node tests/panel_build_gate.mjs --site <'
  + `${BUILD_SNAPSHOT_AUDIENCES.join('|')}> [--write]`;

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`${USAGE}\n`
    + '  (no flag)  compare the build\'s panels against tests/__panels__/<site>/; 1 on drift\n'
    + '  --write    accept the current render as the new corpus\n'
    + '  exits: 0 clean · 1 drift · 2 could-not-check');
  process.exit(0);
}

const WRITE = argv.includes('--write');
const siteAt = argv.indexOf('--site');
const site = siteAt === -1 ? null : argv[siteAt + 1];

// A bad argument is could-not-check, not a pass: a typo'd site must never exit 0.
if (!site) {
  console.error(`panel-build-gate: no --site given.\n${USAGE}`);
  process.exit(2);
}
if (!BUILD_SNAPSHOT_AUDIENCES.includes(site)) {
  console.error(`panel-build-gate: '${site}' has no build-rendered corpus.\n`
    + '  tests/__panels__/ms3/ is the SOURCE-registry render and is maintained by\n'
    + '  `node bin/render_panels.mjs`; this gate must not write there.\n'
    + `  ${USAGE}`);
  process.exit(2);
}

// The freshness guard. Throws on a declared input that does not exist — a typo there would make
// the check vacuously "fresh" and retire this contract without anything going red.
const stale = staleBuildReason(REPO, site, PANEL_BUILD_INPUTS);
if (stale) {
  console.error(`panel-build-gate: cannot render ${site} — ${stale}`);
  process.exit(2);
}

const dir = fileURLToPath(buildSnapshotDir(site));
const rel = path.relative(REPO, dir);
const panels = renderFromBuild(site);

if (!panels.length) {
  // An empty render agreeing with an empty directory is the vacuous pass #480 shipped.
  console.error(`panel-build-gate: ${site} rendered NO panels; the harness is broken, not clean`);
  process.exit(2);
}

const expected = new Map(panels.map(([ref, html]) => [snapshotName(ref), formatPanel(html)]));
if (WRITE) mkdirSync(dir, { recursive: true });
const onDisk = existsSync(dir)
  ? new Set(readdirSync(dir).filter((f) => f.endsWith('.html')))
  : new Set();

const changed = [];
const added = [];
for (const [ref, html] of panels) {
  const name = snapshotName(ref);
  if (!onDisk.has(name)) { added.push(ref); continue; }
  if (readFileSync(path.join(dir, name), 'utf8') !== formatPanel(html)) changed.push(ref);
}
// An orphan is a page that stopped rendering a panel on this site. Leaving one behind would let
// a snapshot outlive the page it describes, so --write removes it and says which.
const orphaned = [...onDisk].filter((f) => !expected.has(f));

if (WRITE) {
  for (const [name, text] of expected) writeFileSync(path.join(dir, name), text);
  for (const f of orphaned) rmSync(path.join(dir, f));
}

console.log(`${panels.length} ${site} panels ${WRITE ? 'written' : 'compared'} against ${rel}/`);
console.log(`scope: the ${site} BUILD's own payload — every page shipped_pages.json scopes to `
  + `${site} that renders a panel.`);
console.log(`${changed.length} of ${panels.length} panels changed`
  + (added.length ? `, ${added.length} new` : '')
  + (orphaned.length ? `, ${orphaned.length} orphaned` : ''));

const list = (label, refs) => { for (const r of refs) console.log(`  ${label} ${r}`); };
list('changed ', changed);
list('new     ', added);
list('orphaned', orphaned);

if (!(changed.length + added.length + orphaned.length)) process.exit(0);
if (WRITE) {
  console.log('\nCorpus updated. Read the diff — it is the learner-visible change.');
  process.exit(0);
}
console.log(`\nThe ${site} build's panels no longer match tests/__panels__/${site}/.\n`
  + `If the change is intended, run \`node tests/panel_build_gate.mjs --site ${site} --write\`\n`
  + 'and commit the diff; that diff IS the set of learner-visible changes, page by page.');
process.exit(1);
