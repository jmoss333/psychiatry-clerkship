// Withdrawal page presentation guard — authorized 2026-08-27 (recorded in the cows entry's
// decisionRef in instrument_rights.json).
//
// Two fixes, both about saying true things on a rights-sensitive surface:
// 1. The "See it in action" spotlight embed is removed BY THE AUTHOR'S CALL: its mp4 was
//    never exported and 404s on both sites. (The remaining tools' spotlight embeds are
//    still deliberately pending future exports per _prototypes/video-library/README.md —
//    this authorization named the withdrawal embed only; do not generalize it.)
// 2. The footer claimed "Scoring anchors here are abbreviated for teaching" — true for
//    CIWA-Ar (in-house abbreviated descriptors), FALSE for COWS, whose anchors render the
//    published instrument's own text and legal values (that fidelity is the whole point of
//    WP-02 / tests/cows-legal-values.test.mjs). A rights-flagged page must not understate
//    what it reproduces: the recorded COWS interim waiver covers verbatim anchors, and the
//    page's own description now says so plainly.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(
  path.join(ROOT, '03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html'), 'utf8');

test('no dead spotlight embed', () => {
  assert.ok(!html.includes('tl-spotlight'), 'the "See it in action" block is removed by author call');
  assert.ok(!html.includes('tool-spotlight-withdrawal'), 'no reference to the never-exported recording');
  assert.doesNotMatch(html, /<video\b/i);
});

test('the footer no longer understates the COWS reproduction', () => {
  assert.ok(!html.includes('Scoring anchors here are abbreviated'),
    'the blanket abbreviation claim is false for COWS and must not return');
  assert.ok(!html.includes('Behavioral anchors are abbreviated;'),
    'the disclaimer variant of the same blanket claim must not return');
});

test('the corrected wording distinguishes the two instruments accurately', () => {
  // Updated 2026-08-28. The old pins asserted "CIWA-Ar descriptors here are abbreviated for
  // teaching", which was accurate while those descriptors shipped. CIWA-Ar has since been retired
  // to a stub (author's call), so that sentence is now FALSE and its absence is the contract.
  assert.doesNotMatch(html, /descriptors here are abbreviated for teaching/,
    'the page no longer ships CIWA-Ar descriptors, so it must not claim to');
  assert.doesNotMatch(html, /CIWA-Ar anchors are abbreviated/,
    'the same claim in the disclaimer must not survive the retirement');
  assert.match(html, /The CIWA-Ar is NOT reproduced here/);
  assert.match(html, /COWS items carry their published anchors and legal score values/,
    'COWS is unchanged and must still be described accurately');
  assert.match(html, /The CIWA-Ar is not reproduced here; COWS anchors follow the published instrument/);
});

test('attribution and bedside direction survive (keep-guards)', () => {
  assert.match(html, /2597811/, 'Sullivan 1989 PMID');
  assert.match(html, /12924748/, 'Wesson & Ling 2003 PMID');
  assert.match(html, /not from this page/);
  assert.match(html, /NOT a dosing calculator/);
});
