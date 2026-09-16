/* WHO a faculty attestation says the item is suitable for.

   The 2026-09-14 attestation review found the console asking the reviewer to affirm that
   a RESIDENT page was "accurate and appropriate for a third-year student". The wording was
   a hard-coded literal, so it was wrong on all 22 resident-only pages and understated on
   the 91 that ship to both audiences — and a reviewer who ticked it was signing a claim
   about the wrong learner.

   The defect class is what these tests pin, not the sentences. A test that asserted
   audienceLabel(['res']) === 'a psychiatry resident' would restate the implementation and
   break on a harmless rewording while still passing if someone re-hard-coded a literal.
   So the assertions here are properties over the REAL shipped_pages.json listing:

     1. no resident-only item's wording claims a third-year/MS3 audience;
     2. an item serving both audiences names both, rather than one of them;
     3. an unknown audience is stated as unknown and never silently becomes MS3 —
        the silent default is what let the original defect survive;
     4. audience tracks `sites` and not `site`, the two being different facts that
        disagree for 91 of the listed pages.

   Item 4 is the root cause. `site` is the ONE deployment a preview is fetched from;
   `sites` is every deployment that publishes the item. Reading the former for audience is
   the bug, and it is invisible to any schema because both fields are individually valid. */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveContentUniverse } from './content-universe.mjs';
import {
  audienceLabel,
  audienceShortLabel,
  audienceSites,
  normalizeReviewItems,
} from './review-model.mjs';

const ROOT = new URL('../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const SHIPPED = readJson('13_Faculty_Resources/_automation/site_build/shipped_pages.json');

// The console renders from normalized review items, so assert on those rather than on the
// raw universe — this is the object the wording is actually computed from.
const items = normalizeReviewItems({
  items: deriveContentUniverse({ shipped: SHIPPED })
    .map(item => ({ ...item, status: 'unreviewed' })),
  qbank: [],
});

// Anything a reviewer could read as "this is for a third-year medical student".
const CLAIMS_MS3 = /third-year|\bMS3\b/i;
const CLAIMS_RESIDENT = /resident/i;

const bySites = predicate => items.filter(item => item.sites && predicate(item.sites));

test('the listing still contains all three audience shapes', () => {
  // Guards the tests below against passing vacuously if the listing ever loses a shape —
  // a check that runs over an empty set reports success while checking nothing.
  assert.ok(bySites(s => s.length === 1 && s[0] === 'res').length > 0,
    'no resident-only items — the case the original defect got wrong');
  assert.ok(bySites(s => s.length === 1 && s[0] === 'ms3').length > 0, 'no MS3-only items');
  assert.ok(bySites(s => s.length > 1).length > 0, 'no dual-audience items');
});

test('no resident-only item asks the reviewer to affirm an MS3 audience', () => {
  const offenders = bySites(s => s.length === 1 && s[0] === 'res')
    .filter(item => CLAIMS_MS3.test(audienceLabel(item.sites))
      || CLAIMS_MS3.test(audienceShortLabel(item.sites)))
    .map(item => item.identity);
  assert.deepEqual(offenders, [],
    `resident-only items whose attestation wording claims an MS3 audience: ${offenders.join(', ')}`);
});

test('an item serving both audiences names both, not one of them', () => {
  for (const item of bySites(s => s.length > 1)) {
    const long = audienceLabel(item.sites);
    assert.ok(CLAIMS_MS3.test(long) && CLAIMS_RESIDENT.test(long),
      `${item.identity} ships to both audiences but its wording names only one: "${long}"`);
    const short = audienceShortLabel(item.sites);
    assert.ok(CLAIMS_MS3.test(short) && CLAIMS_RESIDENT.test(short),
      `${item.identity} button label names only one audience: "${short}"`);
  }
});

test('audience follows sites, not the preview site', () => {
  // These two fields disagree for every dual-audience page: `site` is 'ms3' there because
  // that is where the preview is fetched from. If audience were ever re-derived from
  // `site`, every one of them would silently narrow back to an MS3-only claim.
  const disagree = items.filter(item => item.sites
    && item.sites.length > 1 && item.site === 'ms3');
  assert.ok(disagree.length > 0, 'expected items where site and sites disagree');
  for (const item of disagree) {
    assert.notEqual(audienceLabel(item.sites), audienceLabel([item.site]),
      `${item.identity} derives the same audience from site as from sites`);
  }
});

test('an unknown audience is stated as unknown, never defaulted to MS3', () => {
  for (const missing of [undefined, null, []]) {
    assert.equal(audienceSites(missing), null);
    const long = audienceLabel(missing);
    assert.ok(!CLAIMS_MS3.test(long), `unknown audience rendered as an MS3 claim: "${long}"`);
    assert.ok(!CLAIMS_RESIDENT.test(long), `unknown audience rendered as a resident claim: "${long}"`);
    assert.ok(!CLAIMS_MS3.test(audienceShortLabel(missing)));
  }
});

test('normalizeReviewItems carries sites without inventing them', () => {
  const [page] = normalizeReviewItems({
    items: [{ slug: 'x.md', title: 'X', kind: 'page', status: 'unreviewed', site: 'res', sites: ['res'] }],
    qbank: [],
  });
  assert.deepEqual(page.sites, ['res']);

  // A record with no sites keeps its preview default for `site` but must NOT borrow it
  // as an audience — that borrowing is precisely the original defect.
  const [bare] = normalizeReviewItems({
    items: [{ slug: 'y.md', title: 'Y', kind: 'page', status: 'unreviewed' }],
    qbank: [],
  });
  assert.equal(bare.site, 'ms3');
  assert.equal(bare.sites, null);

  // Order in, order out: wording must not depend on how the listing happened to be written.
  const [either] = normalizeReviewItems({
    items: [{ slug: 'z.md', title: 'Z', kind: 'page', status: 'unreviewed', sites: ['res', 'ms3'] }],
    qbank: [],
  });
  assert.deepEqual(either.sites, ['ms3', 'res']);

  assert.throws(() => normalizeReviewItems({
    items: [{ slug: 'bad.md', title: 'Bad', kind: 'page', status: 'unreviewed', sites: ['faculty'] }],
    qbank: [],
  }), TypeError);
});

test('questions carry no learner-site audience', () => {
  // Question items are not published to a learner deployment; they have their own three
  // confirmations. They must not borrow a page audience, in either direction.
  const [question] = normalizeReviewItems({
    items: [],
    qbank: [{ id: 'q1', status: 'draft', revision: 'a'.repeat(64) }],
  });
  assert.equal(question.sites, null);
});
