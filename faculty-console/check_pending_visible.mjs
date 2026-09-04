#!/usr/bin/env node
/* Invariant: every item reviewed.json calls "pending" must be reachable in the faculty
   console, or be named in NOT_REVIEWABLE_IN_CONSOLE with that exclusion on the record.

   THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE JULY 2026 BUG. When the Case-of-the-Week
   pipeline started appending registry-derived pages to both site builds without touching
   site_manifest.json, 22 pending pages became invisible to the console: reviewed.json
   said they needed faculty review, and no surface existed to give it. Nothing was red.
   A ledger entry that says "pending" is a standing claim that someone still has to look
   at this; a console that cannot show it makes that claim unfulfillable.

   Reads the ledger and the one derived listing of what ships (shipped_pages.json, which
   build_and_check.sh verifies against the real build output on every build — ADR-002),
   and fails in BOTH directions:
     - a pending slug outside the universe and off the allowlist  -> unreachable item
     - an allowlist entry that IS in the universe                 -> stale exclusion

   The second direction is not hypothetical: pointing this check at shipped_pages.json
   is what proved 'rp-agitation.html' and 'rp-brief-psych.html' had been excluded as
   undeployed while the resident site was serving both. See content-universe.mjs.

   Run from anywhere:  node faculty-console/check_pending_visible.mjs */

import { readFileSync } from 'node:fs';

import { NOT_REVIEWABLE_IN_CONSOLE, contentUniverseSlugs } from './content-universe.mjs';

const ROOT = new URL('../', import.meta.url);
const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
const SHIPPED_PAGES_PATH = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';

function load(relativePath) {
  const url = new URL(relativePath, ROOT);
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch (error) {
    console.error(`pending visibility INVALID — cannot read ${relativePath}: ${error.message}`);
    process.exit(2);
  }
  return null;
}

function main() {
  const reviewed = load(REVIEWED_PATH);
  const shipped = load(SHIPPED_PAGES_PATH);

  let universe;
  try {
    universe = contentUniverseSlugs({ shipped });
  } catch (error) {
    console.error(`pending visibility INVALID — the content universe is malformed: ${error.message}`);
    return 1;
  }

  const allowlist = new Set(NOT_REVIEWABLE_IN_CONSOLE);
  const pending = Object.entries(reviewed)
    .filter(([, entry]) => entry && typeof entry === 'object' && entry.status === 'pending')
    .map(([slug]) => slug)
    .sort();

  const unreachable = pending.filter(slug => !universe.has(slug) && !allowlist.has(slug));
  const staleExclusions = [...allowlist].filter(slug => universe.has(slug)).sort();

  if (unreachable.length || staleExclusions.length) {
    console.error(
      `pending visibility INVALID — ${unreachable.length} unreachable pending item(s), `
      + `${staleExclusions.length} stale exclusion(s).`,
    );
    for (const slug of unreachable) {
      console.error(
        `  - ${slug}: reviewed.json says pending, but no site ships it according to `
        + 'shipped_pages.json, so the faculty console cannot show it. Either wire its '
        + 'producer into site_build/shipped_pages.py and regenerate, or add it to '
        + 'NOT_REVIEWABLE_IN_CONSOLE in faculty-console/content-universe.mjs with a reason.',
      );
    }
    for (const slug of staleExclusions) {
      console.error(
        `  - ${slug}: listed in NOT_REVIEWABLE_IN_CONSOLE but now IS in the console `
        + 'universe. Remove the stale exclusion so it is reviewed like everything else.',
      );
    }
    return 1;
  }

  console.log(
    `pending visibility OK — ${pending.length} pending item(s), `
    + `${universe.size} in the console universe, `
    + `${allowlist.size} explicitly excluded`
    + `${allowlist.size ? ` (${[...allowlist].join(', ')})` : ''}.`,
  );
  return 0;
}

process.exit(main());
