#!/usr/bin/env node
/* Invariant: every item reviewed.json calls "pending" must be reachable in the faculty
   console, or be named in NOT_REVIEWABLE_IN_CONSOLE with that exclusion on the record.

   THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE JULY 2026 BUG. When the Case-of-the-Week
   pipeline started appending registry-derived pages to both site builds without touching
   site_manifest.json, 22 pending pages became invisible to the console: reviewed.json
   said they needed faculty review, and no surface existed to give it. Nothing was red.
   A ledger entry that says "pending" is a standing claim that someone still has to look
   at this; a console that cannot show it makes that claim unfulfillable.

   Reads the three files the console and the two builds actually derive from, and fails
   in BOTH directions:
     - a pending slug outside the universe and off the allowlist  -> unreachable item
     - an allowlist entry that IS in the universe                 -> stale exclusion

   Run from anywhere:  node faculty-console/check_pending_visible.mjs */

import { readFileSync } from 'node:fs';

import { NOT_REVIEWABLE_IN_CONSOLE, contentUniverseSlugs } from './content-universe.mjs';

const ROOT = new URL('../', import.meta.url);
const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
const REGISTRY_PATH = '08_Cases_and_Simulation/case-of-the-week/cotw_registry.json';

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
  const manifest = load(MANIFEST_PATH);
  const registry = load(REGISTRY_PATH);

  let universe;
  try {
    universe = contentUniverseSlugs({ manifest, registry });
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
        `  - ${slug}: reviewed.json says pending, but it is in neither site_manifest.json `
        + 'nor cotw_registry.json, so the faculty console cannot show it. Either wire it '
        + 'into the build that ships it, or add it to NOT_REVIEWABLE_IN_CONSOLE in '
        + 'faculty-console/content-universe.mjs with a reason.',
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
    + `${allowlist.size} explicitly excluded (${[...allowlist].join(', ')}).`,
  );
  return 0;
}

process.exit(main());
