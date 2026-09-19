// D6 build-output pin: the drift projection reaches the SHIPPED artifacts, in the right order.
//
// WHY A BUILD-OUTPUT TEST AND NOT A UNIT TEST. `project_effective_ledger` and
// `project_topic_meta_faculty_review` are unit-tested against fixtures in
// 13_Faculty_Resources/_automation/test_surface_governance.py and tests/maintenance/
// test_attestation_hash.py. What those cannot see is ORDERING inside the two build scripts:
// the built topic_meta.json is written by cotw_meta.inject() and then demoted, and a demotion
// placed before that inject would be silently overwritten for every Case-of-the-Week slug and
// silently correct for every other one. That is a whole-pipeline fact, so it is pinned here,
// against _build/, per docs/SILENT_SHRINK_CHECKLIST.md §D.
//
// WHAT IT PINS, per site:
//   1. every page the built governance.json calls pending WITH THE STALE REASON keeps a
//      facultyReview block that is not `reviewed` and still names its reviewer and date (D6:
//      the review did happen; only its binding lapsed, so the attribution is not erased);
//   2. a page the ledger still calls `reviewed` is not demoted in the built topic_meta;
//   3. the inverse -- no block is demoted relative to the SOURCE topic_meta.json unless this
//      site's governance says that page drifted;
//   4. no stored contentHash reaches any built artifact. The ledger's hashes are governance
//      evidence, not learner-facing data; a hash in the served tree would let anyone recompute
//      which pages are bound without the console.
//
// THE SKIP GUARD IS NOT OPTIONAL. build_and_check.sh is `set -euo pipefail` and runs
// `node --test tests/*.test.mjs` BEFORE build_deploy.py, so a red build-output test aborts the
// only supported way to refresh _build/. staleBuildReason() skips with the rebuild command when
// a declared input outran the build, and still hard-fails when a CURRENT build lacks the page.
// Consequence worth stating: these assertions therefore never run on Netlify or in CI (_build/
// starts absent there) -- this is a local-only contract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { staleBuildReason } from './_build_freshness.mjs';

const root = new URL('..', import.meta.url).pathname;
const SITES = ['ms3', 'res'];

// Every input these assertions depend on. A path that does not exist throws inside
// staleBuildReason(): a typo would make the freshness check vacuously "fresh" and retire this
// contract silently. reviewed.json and topic_meta.json decide WHICH pages drift;
// attestation_hash.py + surface_governance.py decide what drift means; the two build scripts
// decide where the demotion lands relative to cotw_meta.inject().
const BUILD_INPUTS = [
  join(root, '13_Faculty_Resources/reviewed.json'),
  join(root, 'topic_meta.json'),
  join(root, '13_Faculty_Resources/_automation/site_build/shipped_pages.json'),
  join(root, '13_Faculty_Resources/_automation/site_build/build_deploy.py'),
  join(root, '13_Faculty_Resources/_automation/site_build/resident_section.py'),
  join(root, '13_Faculty_Resources/_automation/surface_governance.py'),
  join(root, '13_Faculty_Resources/_automation/attestation_hash.py'),
];

// The shape of attestation_hash.STALE_REASON. Matched rather than compared so the date varies,
// and anchored so a governance row pending for any OTHER reason (never reviewed, withdrawn) is
// not read as drift.
const STALE_REASON_RE =
  /^Content changed since faculty review on \d{4}-\d{2}-\d{2}; awaiting re-attestation\.$/;

// Artifacts a learner's browser fetches, and the only places a leaked hash could surface.
const SERVED_JSON = [
  'governance.json',
  'nav.json',
  'search-index.json',
  'topic_meta.json',
  'tool-governance.json',
];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const SOURCE_META = readJson(join(root, 'topic_meta.json'));
const LEDGER = readJson(join(root, '13_Faculty_Resources/reviewed.json'));

const facultyReview = (meta, slug) => {
  const record = meta[slug];
  if (!record || typeof record !== 'object') return null;
  const block = record.facultyReview;
  return block && typeof block === 'object' ? block : null;
};

function built(site) {
  const dir = join(root, '_build', site);
  return {
    governance: readJson(join(dir, 'governance.json')).items,
    topicMeta: readJson(join(dir, 'topic_meta.json')),
  };
}

// Run `body(site, built)` for every site whose _build/ is current; skip the sites that are not.
// Only the whole test skips when no site could be read, so one fresh tree still enforces this.
function forEachFreshSite(t, body) {
  const skipped = [];
  let checked = 0;
  for (const site of SITES) {
    const stale = staleBuildReason(root, site, BUILD_INPUTS);
    if (stale) { skipped.push(stale); continue; }
    body(site, built(site));
    checked += 1;
  }
  if (checked === 0) t.skip(skipped.join(' | '));
}

test('a drifted page renders pending in governance.json and keeps its attribution in the built topic_meta (D6)', (t) => {
  forEachFreshSite(t, (site, { governance, topicMeta }) => {
    const drifted = Object.entries(governance)
      .filter(([, item]) => item.status === 'pending' && STALE_REASON_RE.test(item.reason || ''))
      .map(([slug]) => slug);

    let withBlock = 0;
    for (const slug of drifted) {
      const block = facultyReview(topicMeta, slug);
      if (!block) continue; // not every shipped page carries a topic_meta record
      withBlock += 1;
      assert.notEqual(block.status, 'reviewed',
        `${site}: ${slug} reads pending in governance.json but still reviewed in topic_meta.json`);
      // D6: the demotion changes `status` and NOTHING else. Dropping reviewer/lastReviewed would
      // erase a review that really happened, and would also read as "never reviewed" rather than
      // "review no longer bound" to anyone reading the built registry.
      assert.equal(typeof block.reviewer, 'string', `${site}: ${slug} lost facultyReview.reviewer`);
      assert.ok(block.reviewer.length > 0, `${site}: ${slug} has an empty facultyReview.reviewer`);
      assert.equal(typeof block.lastReviewed, 'string',
        `${site}: ${slug} lost facultyReview.lastReviewed`);
      assert.match(block.lastReviewed, /^\d{4}-\d{2}-\d{2}$/,
        `${site}: ${slug} has a malformed facultyReview.lastReviewed`);
    }

    // Non-vacuity, stated as the implication rather than a floor: zero drifted pages is the
    // GOAL state of the re-attestation queue, so it must not fail here -- but drift with no
    // demoted block at all would mean the projection never reached the built registry.
    if (drifted.length > 0) {
      assert.ok(withBlock > 0,
        `${site}: ${drifted.length} drifted page(s) but not one demoted facultyReview block`);
    }
    t.diagnostic(`${site}: ${drifted.length} drifted page(s), ${withBlock} with a topic_meta block`);
  });
});

test('a page the ledger still calls reviewed is not demoted in the built topic_meta', (t) => {
  forEachFreshSite(t, (site, { governance, topicMeta }) => {
    const reviewed = Object.entries(governance)
      .filter(([, item]) => item.status === 'reviewed')
      .map(([slug]) => slug);

    let checked = 0;
    for (const slug of reviewed) {
      // Only blocks AUTHORED in topic_meta.json are in scope. A Case-of-the-Week block is
      // DERIVED at build time by cotw_meta.py, which writes status "pending" for every case
      // unconditionally (cotw_meta.py:211) -- nothing to do with this ledger, and a fact that
      // predates the projection. Scoping by the source keeps this from asserting cotw_meta's
      // behaviour by accident.
      if (!facultyReview(SOURCE_META, slug)) continue;
      const block = facultyReview(topicMeta, slug);
      if (!block) continue;
      checked += 1;
      assert.equal(block.status, 'reviewed',
        `${site}: ${slug} is reviewed in governance.json but demoted in the built topic_meta.json`);
    }
    // Deliberately no floor: while the re-attestation queue is full this set is EMPTY, and a
    // floor would fail honest work. It lights up as the owner re-attests -- the count is printed
    // so a reader can see which regime the tree is in rather than inferring a pass means data.
    t.diagnostic(`${site}: ${reviewed.length} reviewed page(s), ${checked} with a source-authored facultyReview block`);
  });
});

test('no facultyReview block is demoted unless this site\'s governance says the page drifted', (t) => {
  forEachFreshSite(t, (site, { governance, topicMeta }) => {
    const drifted = new Set(Object.entries(governance)
      .filter(([, item]) => item.status === 'pending' && STALE_REASON_RE.test(item.reason || ''))
      .map(([slug]) => slug));

    let demoted = 0;
    for (const slug of Object.keys(topicMeta)) {
      const source = facultyReview(SOURCE_META, slug);
      const block = facultyReview(topicMeta, slug);
      if (!source || !block) continue;
      if (source.status !== 'reviewed' || block.status === 'reviewed') continue;
      demoted += 1;
      // topic_meta.json is ONE file copied into both builds, so it carries records for pages a
      // given site does not ship (adv_psychopharm.md is resident-only). Those have no governance
      // row here and cannot be cross-checked against this site's ledger view.
      if (!(slug in governance)) continue;
      assert.ok(drifted.has(slug),
        `${site}: ${slug} was demoted in the built topic_meta without a stale governance row`);
    }
    assert.ok(demoted > 0 || drifted.size === 0,
      `${site}: ${drifted.size} drifted page(s) but no demoted block to attribute to them`);
    t.diagnostic(`${site}: ${demoted} block(s) demoted relative to the source topic_meta.json`);
  });
});

test('no stored contentHash reaches any built artifact', (t) => {
  const hashes = Object.values(LEDGER)
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.contentHash === 'string')
    .map((entry) => entry.contentHash);
  // A vacuity guard with teeth: an unparsable or unbacked ledger would make every search below
  // trivially clean. PR 1a bound 108 rows; the floor is "some", not that number, so re-attesting
  // never trips it.
  assert.ok(hashes.length > 0, 'reviewed.json carries no contentHash to search for');

  forEachFreshSite(t, (site) => {
    for (const name of SERVED_JSON) {
      const text = readFileSync(join(root, '_build', site, name), 'utf8');
      assert.equal(text.includes('contentHash'), false,
        `${site}/${name} names contentHash; the ledger's binding is governance, not served data`);
      for (const hash of hashes) {
        assert.equal(text.includes(hash), false,
          `${site}/${name} contains a stored contentHash (${hash.slice(0, 8)}…)`);
      }
    }
    t.diagnostic(`${site}: ${SERVED_JSON.length} served artifact(s) searched for ${hashes.length} hashes`);
  });
});
