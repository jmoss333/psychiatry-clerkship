// Review badge honesty: family-systems-practice.html and communication-practice.html
// must each render a distinct reviewed state, never "faculty review needed" for an
// attested item.
//
// 2026-08-01 audit (WS2): family's reviewBadge had no 'reviewed' branch, so attested
// scenarios would still display 'faculty review needed'. This test was originally
// written as a byte-identity check against communication-practice, which was a fair
// proxy while the two implementations matched.
//
// 2026-08-04: communication-practice's fast-rep rewrite gave its orient panel a hard
// 60-word budget, so its badge is deliberately terse -- status only, with reviewer and
// date moved into the deeper-coaching disclosure (covered by
// tests/smoke/communication-practice.spec.js "reviewer attribution remains escaped
// inside deeper coaching"). Family has no such budget and keeps attribution inline.
// Identity is therefore no longer the right assertion; this pins the invariant the
// audit actually cared about, per tool, and still turns red if either 'reviewed'
// branch is removed or either tool's attribution placement silently moves.

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

const TOOLS = [
  {
    name: 'family',
    file: '06_Family_and_Relational/family-systems-practice.html',
    badgeCarriesAttribution: true,
  },
  {
    name: 'communication',
    file: '02_Clinical_Skills/Communication_Practice/communication-practice.html',
    badgeCarriesAttribution: false,
  },
];

const REVIEWER = 'Joshua Moss, MD';
const REVIEWED_AT = '2026-08-02';
const REVIEWED = { facultyReview: { status: 'reviewed', reviewer: REVIEWER, lastReviewed: REVIEWED_AT } };

for (const { name, file, badgeCarriesAttribution } of TOOLS) {
  const badge = extractReviewBadge(file);

  const reviewed = badge(REVIEWED);
  assert.match(reviewed, /pill reviewed/, `${name}: attested item must use the reviewed pill`);
  assert.match(reviewed, /Reviewed/, `${name}: attested item must read as reviewed`);
  assert.doesNotMatch(
    reviewed,
    /faculty review needed/,
    `${name}: attested item must not still ask for faculty review`,
  );

  // Attribution placement differs by tool on purpose. Assert the actual contract both
  // ways so a silent move in either direction fails here rather than shipping.
  if (badgeCarriesAttribution) {
    assert.match(reviewed, /Joshua Moss, MD/, `${name}: badge must carry the reviewer`);
    assert.match(reviewed, /2026-08-02/, `${name}: badge must carry the review date`);
  } else {
    assert.doesNotMatch(
      reviewed,
      /Joshua Moss, MD|2026-08-02/,
      `${name}: badge is word-budgeted -- attribution belongs in deeper coaching`,
    );
  }

  for (const status of ['draft', 'draft-pending-attestation']) {
    const draft = badge({ facultyReview: { status } });
    assert.match(draft, /pill draft/, `${name}: ${status} must use the draft pill`);
    assert.match(draft, /faculty review needed/, `${name}: ${status} must ask for faculty review`);
  }

  const absent = badge({});
  assert.match(absent, /pill draft/, `${name}: missing facultyReview must fall back to draft`);
  assert.match(absent, /faculty review needed/, `${name}: missing facultyReview must ask for review`);
}

for (const { name, file } of TOOLS) {
  const src = fs.readFileSync(path.join(repo, file), 'utf8');
  assert.match(src, /\.pill\.reviewed\{/, `${name} tool must style the reviewed pill`);
}

// The communication tool drops attribution from the badge only because it relocates it;
// losing it altogether would be a governance regression, so pin the disclosure render.
const commSrc = fs.readFileSync(
  path.join(repo, '02_Clinical_Skills/Communication_Practice/communication-practice.html'), 'utf8');
assert.match(
  commSrc,
  /Reviewed by '\+esc\(/,
  'communication tool must still render escaped reviewer attribution in deeper coaching',
);

console.log('Review badge honesty verified for family and communication practice');
