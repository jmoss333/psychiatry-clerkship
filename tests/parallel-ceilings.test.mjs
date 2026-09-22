import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Parallel-work ceilings. Two agents each individually green can make the SECOND merge fail:
// the qa-baseline computed-key counts are exact ceilings, and SNIPPET_MARKERS is a 3-line dict
// every snippet PR edits. This test turns both into a named PR-time failure. If you are here
// because it went red: you (or a concurrent PR) changed a shared ceiling — bump the pins below
// IN THE SAME DIFF as the change, after confirming the other agent's PRs in flight.

// +1 (2026-09-22): resident-preview APP On shift renderer (fd_app.js).
const EXPECTED_MARKER_COUNT = 31;

test('SNIPPET_MARKERS entry count matches the pinned constant', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '13_Faculty_Resources/_automation/site_build/common.py'), 'utf8');
  const block = src.match(/SNIPPET_MARKERS = \{([\s\S]*?)\n\}/);
  assert.ok(block, 'SNIPPET_MARKERS literal not found');
  const entries = block[1].match(/"\/\*__[A-Z0-9_]+__\*\/"\s*:/g) || [];
  assert.equal(entries.length, EXPECTED_MARKER_COUNT,
    `SNIPPET_MARKERS has ${entries.length} entries; bump EXPECTED_MARKER_COUNT in the same PR`);
});

test('qa-baseline.json matches the pinned ceilings exactly', () => {
  const actual = JSON.parse(fs.readFileSync(
    path.join(ROOT, '13_Faculty_Resources/_automation/site_build/qa-baseline.json'), 'utf8'));
  // computed-key +1 each (2026-09-03): communication-practice.html and diagnostic-reasoning.html
  // now read localStorage[SRS_KEY] through the shared srs_store.js snippet rather than a
  // literal, the same indirection already accepted for family, question-bank, review and
  // shelf-mode. (res counts the resident-only tools too, hence its higher ceiling.)
  //
  // blueprint-gap 0 -> 6 (2026-09-18, PR 1b): §4a2 counts pages the BUILT governance.json
  // calls "reviewed", and the builds now render an attestation whose attested inputs have
  // drifted as pending — 94 of 108 reviewed shipped rows on the tree that day. Six
  // blueprint codes lost their last attested page as a result. This ceiling is a count of
  // work the owner still has to do, not a defect to design around: every re-attestation
  // lowers it, and the gate prints an invitation to lock the drop in. Do not fix a red
  // here by widening it — check what stopped being attested first.
  const expected = {
    ms3: { metadata: 1, 'blueprint-gap': 6, 'computed-key': 7, 'legacy-metadata': 1 },
    res: { metadata: 1, 'blueprint-gap': 6, 'computed-key': 10, 'legacy-metadata': 1 },
  };
  assert.deepEqual(actual, expected,
    'qa-baseline.json changed — a computed-key or soft-class ceiling moved; update this pin deliberately');
});
