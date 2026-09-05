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
 *   node bin/render_panels.mjs --site res          # check one (--site=res works too)
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
 * EXIT CODES, because a caller reads them: 0 clean · 1 the panels genuinely drifted from their
 * snapshots · 2 the command could not answer the question at all (bad arguments, a missing or
 * stale build, a build too broken to render). 1 is reserved for drift so that "your build is
 * broken" can never be reported as "the panels changed" — that mistake would send someone to run
 * --write against unusable output and commit it.
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
const BUILD_CMD = '13_Faculty_Resources/_automation/site_build/build_and_check.sh';
const argv = process.argv.slice(2);

const USAGE = 'usage: node bin/render_panels.mjs [--check] [--write] [--site ms3|res]\n'
  + '  --check   accepted and is the default; checking is simply what happens without --write,\n'
  + '            so passing both --check and --write still writes\n'
  + '  --write   accept the current render as the new snapshot\n'
  + '  --site    limit to one audience (default: both); --site=ms3 is accepted too\n'
  + 'Checking compares the live render against tests/__panels__/ and exits 1 on drift.';

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}

const WRITE = argv.includes('--write');

/* Arguments are walked rather than found with indexOf('--site'), which never matched the
   `--site=ms3` spelling: that form fell through and silently checked BOTH audiences, so a caller
   wiring `--site=$SITE` into an ms3-only production build would exit 2 on the absent _build/res.
   An unrecognised argument stops the run for the same reason — `--sight ms3` must not quietly
   become a two-audience check. `--check` stays derived as "not --write"; it is named here only so
   that passing it is legal. */
let siteArg = null;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--site') { siteArg = argv[i + 1] ?? ''; i += 1; continue; }
  if (arg.startsWith('--site=')) { siteArg = arg.slice('--site='.length); continue; }
  if (arg === '--check' || arg === '--write') continue;
  console.error(`unknown argument '${arg}'\n${USAGE}`);
  process.exit(2);
}
if (siteArg !== null && !AUDIENCES.includes(siteArg)) {
  console.error(`--site needs one of ${AUDIENCES.join('|')}`);
  process.exit(2);
}
const sites = siteArg === null ? [...AUDIENCES] : [siteArg];

/* Freshness is scanned for EVERY requested site before anything is rendered or written. Checked
   inside the per-site loop instead, a fresh _build/ms3 beside a stale _build/res let --write
   update the ms3 corpus and only then exit 2 — leaving the two audiences inconsistent, which is
   the half-updated state that then gets committed. Every stale site is named, not just the first,
   so one rebuild fixes both. */
const stale = sites
  .map((site) => [site, staleBuildReason(REPO, site, PANEL_BUILD_INPUTS)])
  .filter(([, reason]) => reason);
if (stale.length) {
  for (const [site, reason] of stale) console.error(`cannot render ${site}: ${reason}`);
  process.exit(2);
}

/* Every site is rendered and compared BEFORE any site is written, for that same all-or-nothing
   reason: the render below has its own exit-2 path, and it must not fire with a sibling audience
   already rewritten. */
const plans = [];
for (const site of sites) {
  let panels;
  try {
    panels = renderFromBuild(site);
  } catch (err) {
    /* A structurally broken build — a renamed FD_* injection, a payload that will not evaluate,
       a missing panel marker — throws an AssertionError out of renderFromBuild, and an uncaught
       throw exits 1: the code a caller reads as "the panels changed". Reporting a broken build as
       drift would send someone to run --write against unusable output, so this exits 2 and keeps
       1 for genuine drift. The underlying error is printed, never swallowed — it is what names
       the payload or marker that went missing. */
    console.error(`cannot render ${site}: its build is unusable — the panel renderer or one of`
      + ` its injected payloads did not evaluate. rebuild: bash ${BUILD_CMD} ${site}`);
    console.error(err instanceof Error ? (err.stack || err.message) : String(err));
    process.exit(2);
  }

  const dir = fileURLToPath(snapshotDir(site));
  const expected = new Map(panels.map(([ref, html]) => [snapshotName(ref), formatPanel(html)]));
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

  const ships = shippedPanelRefs(site);
  plans.push({ site, dir, panels, expected, changed, added, orphaned, ships });
}

let drift = 0;
let covered = 0;
let shippedTotal = 0;
const shippedSeen = new Set();
const panelSeen = new Set();

for (const { site, dir, panels, expected, changed, added, orphaned, ships } of plans) {
  if (WRITE) {
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of expected) writeFileSync(path.join(dir, name), text);
    for (const f of orphaned) rmSync(path.join(dir, f));
  }

  const noPanel = [...ships].filter((ref) => !expected.has(snapshotName(ref))).sort();
  for (const ref of ships) shippedSeen.add(ref);
  // Refs that actually RENDERED, which is what the roll-up below reports as covered. Counting
  // shippedSeen there would credit a page that ships without a panel as covered.
  for (const [ref] of panels) panelSeen.add(ref);
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
  /* COVERED of shipped, never shipped alone. shippedSeen counts pages that SHIP, and reporting it
     as coverage overstated reach by one page: rapid_review.md ships on both sites, has no
     topic_meta entry, and therefore renders nothing. This change exists to delete a caveat that
     overstated the gate's reach, so the roll-up naming that reach must not repeat the defect —
     and any page that ships without a panel is named rather than absorbed into the total. */
  const bare = [...shippedSeen].filter((r) => !panelSeen.has(r)).sort();
  // Agrees with the count: "1 ships no panel", "2 ship no panel".
  const bareNote = bare.length
    ? ` · ${bare.length} ship${bare.length === 1 ? 's' : ''} no panel (${bare.join(', ')})`
    : '';
  console.log(`coverage: ${covered} panels over ${panelSeen.size} of ${shippedSeen.size} distinct`
    + ` shipped pages (${shippedTotal} page-site pairs)${bareNote}`);
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
