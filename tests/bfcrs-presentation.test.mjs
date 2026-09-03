// BFCRS presentation guard — the retired reference page must present as a reference.
//
// #400 removed the reproduction; this file guards the presentation half (authorized
// 2026-08-27, recorded in the bfcrs entry's decisionRef in instrument_rights.json):
// - The "See it in action" spotlight embed is gone FOR CAUSE, not merely pending: its
//   mp4 was a screen recording of the retired 23-item scoring tool "in use" — a video
//   that can never ship, because the page it demonstrates no longer exists. (Other
//   tools' spotlight embeds are deliberately pending future exports per
//   _prototypes/video-library/README.md and are untouched by this rule.)
// - With the embed's toggle script gone the page is fully static, like the C-SSRS stub.
// - The page <title> must equal the rights-registry requiredTitle, so the page and the
//   publication contract can never disagree about what this surface is called.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, '04_Acute_and_Safety/Catatonia/bfcrs.html'), 'utf8');
const rights = JSON.parse(readFileSync(path.join(ROOT, 'instrument_rights.json'), 'utf8'));

test('no spotlight embed of the retired scoring tool', () => {
  assert.ok(!html.includes('tl-spotlight'), 'the "See it in action" block must not return');
  assert.ok(!html.includes('tool-spotlight-bfcrs'), 'no reference to the retired-tool recording');
  assert.doesNotMatch(html, /<video\b/i, 'no video element on the reference page');
});

test('the reference page is fully static — no script', () => {
  assert.doesNotMatch(html, /<script\b/i);
});

test('the rights framing survives (keep-guards)', () => {
  assert.match(html, /no longer reproduces/i);
  assert.match(html, /prior written consent/);
  assert.match(html, /8686483/, 'Bush 1996 PMID');
  assert.match(html, /urmc\.rochester\.edu/);
});

test('the route is a followable link to URMC’s own scale and training', () => {
  // INV-IR2. The URMC terms that forced the removal are exactly why the route is a link:
  // they hand the learner the scale, the coding guide and the exam videos directly.
  // instrument-rights-gate.mjs pins the same URL at build time — keep the two in step.
  const src = rights.instruments.find((i) => i.id === 'bfcrs').officialSource;
  assert.ok(html.includes(`href="${src.formUrl}"`),
    `the reference page must link the recorded official form: ${src.formUrl}`);
  assert.ok(html.includes(`href="${src.trainingUrl}"`), 'link the training modules too');
});

test('the page title equals the rights-registry requiredTitle', () => {
  const entry = rights.instruments.find((i) => i.id === 'bfcrs');
  const pin = entry.pages.find((p) => p.file === 'bfcrs.html');
  // The source <title> HTML-encodes the ampersand; compare decoded text.
  const title = html.match(/<title>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&');
  assert.equal(title, pin.requiredTitle,
    'bfcrs.html <title> and instrument_rights.json requiredTitle must agree — governed titles change in one place');
});
