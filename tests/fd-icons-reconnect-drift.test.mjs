/* Drift guard: the clerkship's vendored Lucide subset vs ReConnect's `wf-*` glyphs (C1).

   C0 decision D-set: one icon set (Lucide), both sites, each repo vendoring its OWN copy -- no
   shared package. So nothing stops the two copies drifting apart except this test. For every
   glyph both repos carry, matched by UPSTREAM Lucide name (ReConnect's `wf-learn` is `book-open`,
   `wf-crisis` is `life-buoy`, ...; its entries record the upstream name in a `lucide` field), the
   drawing must be byte-identical, and both must name the same Lucide release.

   CI has no ReConnect checkout, so the comparison reads a committed snapshot:
   site_build/vendor/reconnect-rc-icons-wf.snapshot.json, stamped with the ReConnect commit it was
   read from. Refresh it host-side with
     node 13_Faculty_Resources/_automation/site_build/vendor/refresh_reconnect_icon_snapshot.mjs \
       --repo ~/Code/reconnect-psychiatry-system --rev <sha>
   Optional live mode: set RECONNECT_REPO=<checkout> (and RECONNECT_REV, default origin/main) and
   this test also proves the snapshot still equals ReConnect at that revision. Without it, the
   live check SKIPS with that instruction -- it never passes over a file it did not read. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  SNAPSHOT_PATH, SOURCE_FILE, extractWayfinding,
} from '../13_Faculty_Resources/_automation/site_build/vendor/refresh_reconnect_icon_snapshot.mjs';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const vendor = JSON.parse(readFileSync(new URL(`${BUILD}/vendor/lucide-static-1.54.0.icons.json`, import.meta.url), 'utf8'));
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
const iconsSrc = readFileSync(new URL(`${BUILD}/frontdoor/fd_icons.js`, import.meta.url), 'utf8');

// The overlap on the day C1 was cut (ReConnect R1 #1887 @ 6d7b9481). Pinned so a refresh that
// silently loses the overlap -- a renamed `lucide` field, a dropped glyph -- reads as a change to
// review, not a smaller set passing (docs/SILENT_SHRINK_CHECKLIST.md). Update deliberately.
const EXPECTED_SHARED = {
  'book-open': 'wf-learn', 'chevron-right': 'wf-chevron-right', 'circle-alert': 'wf-notice',
  'external-link': 'wf-external', library: 'wf-reference', 'life-buoy': 'wf-crisis',
  'list-filter': 'wf-filter', 'settings-2': 'wf-settings', 'user-round': 'wf-patient',
  users: 'wf-family',
};

function sharedPairs(snap) {
  const out = {};
  for (const [wf, entry] of Object.entries(snap.icons)) {
    if (vendor.icons[entry.lucide]) out[entry.lucide] = wf;
  }
  return out;
}

test('snapshot is stamped: ReConnect repo, file and a full commit sha', () => {
  assert.equal(snapshot.source.repo, 'jmoss333/reconnect-psychiatry-system');
  assert.equal(snapshot.source.path, SOURCE_FILE);
  assert.match(snapshot.source.commit, /^[0-9a-f]{40}$/);
  assert.ok(Object.keys(snapshot.icons).length > 0, 'an empty snapshot would make every check vacuous');
  for (const [wf, entry] of Object.entries(snapshot.icons)) {
    assert.match(wf, /^wf-[a-z0-9-]+$/, `${wf}: ReConnect wayfinding glyphs carry the wf- prefix (N4)`);
    assert.match(entry.lucide, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, wf);
    assert.equal(typeof entry.d, 'string', wf);
  }
});

test('both repos pin the same Lucide release', () => {
  assert.equal(snapshot.lucideVersion, '1.54.0');
  assert.equal(vendor.source.version, snapshot.lucideVersion);
  assert.ok(iconsSrc.includes(`var FD_ICON_SOURCE='lucide-static@${snapshot.lucideVersion}';`),
    'fd_icons.js must name the same lucide-static release');
});

test('the shared set is the pinned overlap (no silent shrink)', () => {
  assert.deepEqual(sharedPairs(snapshot), EXPECTED_SHARED);
});

test('every shared glyph draws byte-identically in both repos', () => {
  const pairs = sharedPairs(snapshot);
  assert.ok(Object.keys(pairs).length >= 1);
  for (const [lucide, wf] of Object.entries(pairs)) {
    assert.equal(vendor.icons[lucide].body, snapshot.icons[wf].d,
      `${lucide} (clerkship) and ${wf} (ReConnect) differ -- one copy is not verbatim lucide-static@1.54.0`);
  }
});

test('live: the snapshot still equals ReConnect at RECONNECT_REV (opt-in, host-side)', (t) => {
  const repo = process.env.RECONNECT_REPO;
  if (!repo || !existsSync(path.join(repo, '.git'))) {
    t.skip('set RECONNECT_REPO=<ReConnect checkout> [RECONNECT_REV=<sha>] to compare the snapshot with ReConnect itself');
    return;
  }
  const rev = execFileSync('git', ['-C', repo, 'rev-parse', process.env.RECONNECT_REV || 'origin/main'], { encoding: 'utf8' }).trim();
  const source = execFileSync('git', ['-C', repo, 'show', `${rev}:${SOURCE_FILE}`], { encoding: 'utf8', maxBuffer: 8 << 20 });
  const live = extractWayfinding(source);
  assert.equal(live.lucideVersion, snapshot.lucideVersion, `ReConnect ${rev.slice(0, 12)} moved its Lucide pin`);
  for (const [lucide, wf] of Object.entries(sharedPairs({ icons: live.icons }))) {
    assert.equal(vendor.icons[lucide].body, live.icons[wf].d, `${lucide} vs ReConnect ${wf} at ${rev.slice(0, 12)}`);
  }
  if (rev === snapshot.source.commit) assert.deepEqual(live.icons, snapshot.icons);
});
