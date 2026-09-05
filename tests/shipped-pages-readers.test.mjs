/* THE RATCHET. "What ships" has one derived answer now; this keeps it that way.

   ADR-002 (13_Faculty_Resources/_automation/site_build/) replaced a vigilance control
   with a structural one. shipped_pages.json is generated from every producer and verified
   against the real build output on every build, and new code reads it instead of reading
   site_manifest.json or cotw_registry.json directly. The failure that motivated it — the
   faculty console reading one producer, missing a second, and hiding 22 pending pages for
   two months — comes back the moment a new direct reader appears, because a direct reader
   sees whichever producers its author happened to know about.

   So this test freezes the set of files that still name a producer file in a string
   literal. It is exactly the readers that existed when ADR-002 landed, minus the ones it
   migrated, plus the producers and the guards themselves.

   ALLOWED_DIRECT_READERS MAY ONLY SHRINK.
   Migrating a Phase-2 reader to shipped_pages.json means deleting its line here. Adding a
   line means a new consumer went around the single source, which is the thing this file
   exists to stop — read shipped_pages.py's load_shipped_pages() instead. If a genuinely
   new PRODUCER appears (something that puts a page on a site by a route shipped_pages.py
   does not know), it belongs in site_extras.py and in shipped_pages.py's derivation, and
   the build's --check-build gate will fail until it is.

   DECISION: shipped-pages-single-source */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const repo = path.resolve(import.meta.dirname, '..');

/* A quoted path literal ending in a producer filename — `'…/site_manifest.json'`,
   `"cotw_registry.json"`. Deliberately NOT a bare mention: prose in a comment or a
   docstring explaining the history is not a read, and this must not tax documentation. */
const DIRECT_READ = /(['"`])[A-Za-z0-9_./-]*(site_manifest|cotw_registry)\.json\1/;

const SEARCH_EXTENSIONS = new Set(['.py', '.mjs', '.js', '.sh', '.yml', '.yaml']);
const SKIP_PREFIXES = ['docs/', '99_Archive/', '_build/', '.claude/worktrees/', 'node_modules/'];

/* Tests are excluded: a fixture naturally names the file it is a fixture for, and the
   suites that assert on the producers directly are how we know the derivation is right. */
const isTest = rel =>
  rel.endsWith('.test.mjs')
  || rel.endsWith('.spec.js')
  || /(^|\/)tests?\//.test(rel)
  || /(^|\/)test_[^/]*\.py$/.test(rel);

/* The derivation itself. These two ARE the single source; naming the producers is their
   entire job. */
const THE_DERIVATION = [
  '13_Faculty_Resources/_automation/site_build/shipped_pages.py',
  '13_Faculty_Resources/_automation/site_build/cotw_slug.py',
];

const ALLOWED_DIRECT_READERS = Object.freeze([
  // --- producers: they define what ships, so of course they read their own inputs ---
  '13_Faculty_Resources/_automation/site_build/build_deploy.py',
  '13_Faculty_Resources/_automation/site_build/resident_section.py',
  '13_Faculty_Resources/_automation/site_build/cotw_meta.py',

  // --- guards and gates that act ON the producer files rather than consuming them ---
  '.claude/hooks/clerkship_guards.py',

  // --- Phase-2 migrations (ADR-002 "Consequences"). Each still re-derives what ships
  //     for itself; several still carry a private copy of the Case-of-the-Week patch.
  //     Deleting a line here is the only edit this list accepts. ---
  '13_Faculty_Resources/_automation/validate_curriculum.py',
  '13_Faculty_Resources/_automation/validate_claim_anchors.py',
  '13_Faculty_Resources/_automation/validate_registry_schemas.py',
  '13_Faculty_Resources/_automation/export_curriculum_review.py',
  '13_Faculty_Resources/_automation/library_coverage_scan.py',
  '13_Faculty_Resources/_automation/generate_evidence_drill.py',
  '13_Faculty_Resources/_automation/maintenance/governance_digest.mjs',
  '13_Faculty_Resources/_automation/site_build/pairings_block.py',
  '13_Faculty_Resources/_automation/anki/pcl_anki/release.py',
  'bin/sweep_unlicensed_claims.py',
  'tools/pdf_library_export/export_website_pdf_library.py',

  // --- partially migrated by ADR-002. Each asks shipped_pages.json WHAT SHIPS and still
  //     opens site_manifest.json for something only the manifest carries ---
  // the review queue is derived; the manifest supplies the question bank's page anchors
  // and the qbank conflict revision
  'faculty-console/netlify/functions/attest.mjs',
  // the shipped set is derived; the manifest supplies each entry's SOURCE PATH, which the
  // per-entry source-banner, tool-metadata-header and case-pack checks open by hand
  '13_Faculty_Resources/_automation/validate_attestation_consistency.py',
]);

function trackedSources() {
  return execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(rel => SEARCH_EXTENSIONS.has(path.extname(rel)))
    .filter(rel => !SKIP_PREFIXES.some(prefix => rel.startsWith(prefix)))
    .filter(rel => !isTest(rel))
    .filter(rel => !THE_DERIVATION.includes(rel));
}

function directReaders() {
  const found = [];
  for (const rel of trackedSources()) {
    let source;
    try {
      source = readFileSync(path.join(repo, rel), 'utf8');
    } catch {
      continue; // listed but absent in this checkout (LFS pointer, sparse)
    }
    if (DIRECT_READ.test(source)) found.push(rel);
  }
  return found.sort();
}

test('no new code reads a "what ships" producer directly', () => {
  assert.deepEqual(
    directReaders(),
    [...ALLOWED_DIRECT_READERS].sort(),
    'The set of files naming site_manifest.json or cotw_registry.json in a string literal '
    + 'changed. A NEW entry means a consumer went around the single source: read '
    + '13_Faculty_Resources/_automation/site_build/shipped_pages.json instead (Python: '
    + 'load_shipped_pages() in shipped_pages.py; JS: deriveContentUniverse() in '
    + 'faculty-console/content-universe.mjs). A MISSING entry means a Phase-2 reader was '
    + 'migrated — delete its line from ALLOWED_DIRECT_READERS. See ADR-002.',
  );
});

test('the readers ADR-002 migrated stay migrated', () => {
  // These four were the attestation family. If any name a producer in a literal again,
  // the July 2026 blind spot has been reopened in the exact place it happened.
  const migrated = [
    'faculty-console/content-universe.mjs',
    'faculty-console/check_pending_visible.mjs',
  ];
  const readers = new Set(directReaders());
  for (const rel of migrated) assert.ok(!readers.has(rel), `${rel} reads a producer directly again`);
  for (const rel of migrated) {
    const source = readFileSync(path.join(repo, rel), 'utf8');
    assert.ok(
      source.includes('shipped_pages.json'),
      `${rel} no longer refers to shipped_pages.json`,
    );
  }
});

test('the tracked shipped_pages.json is current with its producers', () => {
  // The same gate ci.yml, bin/verify.sh and build_and_check.sh run. Here too, so a stale
  // file is caught by the plain `node --test tests/*.test.mjs` inner loop as well.
  const result = execFileSync('python3', [
    '13_Faculty_Resources/_automation/site_build/shipped_pages.py',
    '--check',
  ], { cwd: repo, encoding: 'utf8' });
  assert.match(result, /shipped_pages OK/);
});
