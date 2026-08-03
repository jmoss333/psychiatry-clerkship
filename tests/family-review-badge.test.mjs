// Review badge parity: family-systems-practice.html must render the same
// two-branch faculty-review badge as communication-practice.html.
//
// 2026-08-01 audit (WS2): family's reviewBadge had no 'reviewed' branch, so
// attested scenarios would still display 'faculty review needed'. Behavioural
// extraction (same pattern as family-srs-parity.test.mjs): re-introducing the
// divergence turns this red.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractReviewBadge(file) {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  const m = src.match(/function reviewBadge\([^)]*\)\{[^\n]*/);
  assert.ok(m, `reviewBadge not found in ${file}`);
  const esc = (value) => String(value);
  return new Function('esc', `${m[0]}\nreturn reviewBadge;`)(esc);
}

const commBadge = extractReviewBadge('02_Clinical_Skills/Communication_Practice/communication-practice.html');
const famBadge = extractReviewBadge('06_Family_and_Relational/family-systems-practice.html');

const fixtures = [
  { facultyReview: { status: 'reviewed', reviewer: 'Joshua Moss, MD', lastReviewed: '2026-08-02' } },
  { facultyReview: { status: 'reviewed' } },
  { facultyReview: { status: 'draft' } },
  { facultyReview: { status: 'draft-pending-attestation' } },
  {},
];

for (const item of fixtures) {
  assert.equal(
    famBadge(item),
    commBadge(item),
    `family badge must match communication badge for ${JSON.stringify(item)}`,
  );
}

const reviewed = famBadge(fixtures[0]);
assert.match(reviewed, /pill reviewed/);
assert.match(reviewed, /Reviewed · Joshua Moss, MD · 2026-08-02/);
assert.doesNotMatch(reviewed, /faculty review needed/);

const draft = famBadge(fixtures[2]);
assert.match(draft, /pill draft/);
assert.match(draft, /faculty review needed/);

const famSrc = fs.readFileSync(
  path.join(repo, '06_Family_and_Relational/family-systems-practice.html'), 'utf8');
assert.match(famSrc, /\.pill\.reviewed\{/, 'family tool must style the reviewed pill');

console.log('Family review badge parity with communication-practice verified');
