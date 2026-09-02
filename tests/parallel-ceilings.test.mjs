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

const EXPECTED_MARKER_COUNT = 28; // +1 (2026-09-02): shared family retrieval prompts (fam_retrieval.js).

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
  const expected = {
    ms3: { metadata: 1, 'computed-key': 6, 'legacy-metadata': 1 },
    res: { metadata: 1, 'computed-key': 9, 'legacy-metadata': 1 },
  };
  assert.deepEqual(actual, expected,
    'qa-baseline.json changed — a computed-key or soft-class ceiling moved; update this pin deliberately');
});
