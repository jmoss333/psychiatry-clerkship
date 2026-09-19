// D6 build-output pin: the drift projection reaches the SHIPPED artifacts, and the two built
// registries agree with each other.
//
// WHY A BUILD-OUTPUT TEST AND NOT A UNIT TEST. `project_effective_ledger` and
// `project_topic_meta_faculty_review` are unit-tested against fixtures in
// 13_Faculty_Resources/_automation/test_surface_governance.py and tests/maintenance/
// test_attestation_hash.py -- each against its own inputs. What no unit test can see is whether
// the two registries the BUILD writes still say the same thing about the same page once every
// producer has had its turn: governance.json comes from the projected ledger, topic_meta.json is
// assembled from the source registry plus cotw_meta.inject() plus the demotion, and nav.json and
// search-index.json each embed their own copy of the governance triplet. Four writers, one fact.
// A later write that re-marked a drifted page `reviewed` in the built topic_meta would be
// invisible to every unit test and caught here, because the two registries would disagree.
//
// WHAT THIS DOES *NOT* PIN, said plainly so nobody reads more into a green run: the ORDER in
// which the demotion and cotw_meta.inject() run. cotw_meta.py:211-215 writes
// `facultyReview.status: "pending"` unconditionally for every DERIVED case, inject() leaves a
// hand-written entry completely alone, and project_topic_meta_faculty_review only rewrites
// blocks that already exist -- so inject-then-demote and demote-then-inject emit identical
// bytes. Re-ordering them is undetectable, and harmless. (Today the only drifted cotw_* slug,
// cotw_index.md, is source-authored and inject never touches it.)
//
// WHAT IT PINS, per site:
//   1. every page the built governance.json calls pending WITH THE STALE REASON keeps a
//      facultyReview block that is not `reviewed` and still names its reviewer and date (D6:
//      the review did happen; only its binding lapsed, so the attribution is not erased);
//   2. a page the ledger still calls `reviewed` is not demoted in the built topic_meta;
//   3. the inverse -- no block is demoted relative to the SOURCE topic_meta.json unless this
//      site's governance says that page drifted;
//   4. a drifted page is STILL PLACED -- every stale slug is in the built nav.json, and every
//      stale slug that nav.json or search-index.json carries has `governance.status: pending`
//      embedded in its row (the badge). A demotion warns; it must never unplace a page, because
//      an unreachable protocol at 2am is worse than a warned one;
//   5. no stored contentHash reaches any built artifact. The ledger's hashes are governance
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
// decide where the demotion lands relative to cotw_meta.inject(); cotw_meta.py and
// cotw_registry.json ARE the other half of that ordering (they write the blocks the demotion
// must run after, and one of them is why assertion 2 has an exclusion at all); and
// validate_tool_governance.py produces the tool-governance.json assertion 5 searches.
//
// Page SOURCES are deliberately NOT declared, and that is not an oversight. Every assertion
// here is built-vs-built or built-vs-source-topic_meta: none reads a page's markdown or HTML.
// Editing a page changes which slugs drift, but the build recomputes that from reviewed.json
// and the tree on the next run, and reviewed.json IS declared -- whereas declaring all ~128
// sources would mean a single content edit skipped this suite until a full rebuild, which is
// the freshness guard erring permissive in the expensive direction.
const BUILD_INPUTS = [
  join(root, '13_Faculty_Resources/reviewed.json'),
  join(root, 'topic_meta.json'),
  join(root, '13_Faculty_Resources/_automation/site_build/shipped_pages.json'),
  join(root, '13_Faculty_Resources/_automation/site_build/build_deploy.py'),
  join(root, '13_Faculty_Resources/_automation/site_build/resident_section.py'),
  join(root, '13_Faculty_Resources/_automation/site_build/cotw_meta.py'),
  join(root, '08_Cases_and_Simulation/case-of-the-week/cotw_registry.json'),
  join(root, '13_Faculty_Resources/_automation/surface_governance.py'),
  join(root, '13_Faculty_Resources/_automation/attestation_hash.py'),
  join(root, '13_Faculty_Resources/_automation/validate_tool_governance.py'),
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
  const nav = readJson(join(dir, 'nav.json'));
  const search = readJson(join(dir, 'search-index.json'));
  return {
    governance: readJson(join(dir, 'governance.json')).items,
    topicMeta: readJson(join(dir, 'topic_meta.json')),
    // nav.json is [{section, items:[{f, governance}]}]; search-index.json carries the same row
    // shape under `docs`. Both embed the governance triplet -- that embedded copy IS the badge.
    navRows: nav.flatMap((section) => section.items || []),
    searchRows: search.docs || [],
  };
}

// Run `body(site, built)` for every site whose _build/ is current; skip the sites that are not.
// Only the whole test skips when no site could be read, so one fresh tree still enforces this.
//
// Every per-site skip is ALWAYS reported, not just when nothing could be checked: a run where
// ms3 is fresh and res is stale would otherwise print a bare `pass` and say nothing about the
// half it never opened -- a check reporting success over a set smaller than the one it claims
// to cover (docs/SILENT_SHRINK_CHECKLIST.md, the shape this whole suite exists for).
// Returns how many sites ran, so a caller can decide whether its own set was empty or unread.
function forEachFreshSite(t, body) {
  const skipped = [];
  let checked = 0;
  for (const site of SITES) {
    const stale = staleBuildReason(root, site, BUILD_INPUTS);
    if (stale) { skipped.push(stale); continue; }
    body(site, built(site));
    checked += 1;
  }
  if (skipped.length) t.diagnostic(`NOT CHECKED — ${skipped.join(' | ')}`);
  if (checked === 0) t.skip(skipped.join(' | '));
  return checked;
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

// Slugs whose topic_meta block is DERIVED at build time rather than authored. Today that is
// exactly Case-of-the-Week: cotw_meta.py:211-215 writes `facultyReview.status = "pending"` for
// every case unconditionally, independent of any ledger, so a reviewed cotw row legitimately
// carries a pending block and must not be read as a demotion.
const DERIVED_BLOCK_SLUG = /^cotw_\d{8}_[a-z0-9]+_(ms3|res)\.md$/;

test('a page the ledger still calls reviewed is not demoted in the built topic_meta', (t) => {
  let inScope = 0;
  const ran = forEachFreshSite(t, (site, { governance, topicMeta }) => {
    const reviewed = Object.entries(governance)
      .filter(([, item]) => item.status === 'reviewed')
      .map(([slug]) => slug);

    let checked = 0;
    const excluded = [];
    for (const slug of reviewed) {
      const block = facultyReview(topicMeta, slug);
      if (!block) continue;
      // Only blocks AUTHORED in topic_meta.json are in scope -- see DERIVED_BLOCK_SLUG.
      if (!facultyReview(SOURCE_META, slug)) { excluded.push(slug); continue; }
      checked += 1;
      assert.equal(block.status, 'reviewed',
        `${site}: ${slug} is reviewed in governance.json but demoted in the built topic_meta.json`);
    }
    inScope += checked;

    // PIN THE EXCLUSION'S DIMENSIONS. That `continue` is the only way a reviewed page can leave
    // this assertion's scope, so a NEW build-time injector writing facultyReview blocks would
    // silently join it and take its pages with it. The COUNT is deliberately not pinned: it is
    // 6 on ms3 and 5 on res today (only the _ms3 half of the 2026-09-07 case is bound) and it
    // moves legitimately whenever the owner attests a case or lets one drift. The SHAPE is
    // pinned instead, which is what cannot change unless someone means it.
    for (const slug of excluded) {
      assert.match(slug, DERIVED_BLOCK_SLUG,
        `${site}: ${slug} carries a build-derived facultyReview block from something other than `
        + "cotw_meta.py -- a new injector has silently joined this assertion's exclusion");
    }
    t.diagnostic(`${site}: ${reviewed.length} reviewed page(s), ${checked} in scope, `
      + `${excluded.length} excluded as build-derived block(s)`);
  });

  // NEVER PASS OVER AN EMPTY SET. While the re-attestation queue is full, no reviewed page
  // carries a source-authored block, so this assertion has nothing to check -- and a green `ok`
  // would read as "verified" when nothing was. It skips with the reason instead and lights up on
  // its own as the owner re-attests. A floor is the wrong tool: zero is a legitimate state of
  // the tree, not a regression.
  if (ran > 0 && inScope === 0) {
    t.skip('no reviewed page carries a source-authored facultyReview block — nothing to check');
  }
});

test('a drifted page keeps its place in nav.json and carries a pending badge in both indexes', (t) => {
  forEachFreshSite(t, (site, { governance, navRows, searchRows }) => {
    const drifted = new Set(Object.entries(governance)
      .filter(([, item]) => item.status === 'pending' && STALE_REASON_RE.test(item.reason || ''))
      .map(([slug]) => slug));

    // PLACEMENT. This is the claim CLAUDE.md makes -- "the demotion warns, it never unplaces" --
    // and until now nothing pinned it: faculty-console/check_pending_visible.mjs reads the
    // SOURCE ledger, where a drifted row still says `reviewed`, and never opens nav.json at all.
    const placed = new Set(navRows.map((row) => row.f));
    for (const slug of drifted) {
      assert.ok(placed.has(slug),
        `${site}: ${slug} drifted and fell out of nav.json — a demotion must never unplace`);
    }

    // THE BADGE. Both indexes embed the governance triplet per row, and that embedded copy is
    // what paints the "Pending review" chip in the Library and in search results, so it has to
    // agree with the PROJECTED ledger rather than the source one.
    let badges = 0;
    for (const row of [...navRows, ...searchRows]) {
      if (!drifted.has(row.f)) continue;
      badges += 1;
      assert.equal(row.governance && row.governance.status, 'pending',
        `${site}: ${row.f} is drifted but its index row still badges as `
        + `${row.governance && row.governance.status}`);
    }
    assert.ok(drifted.size === 0 || badges > 0,
      `${site}: ${drifted.size} drifted page(s) and not one badged index row`);

    // search-index.json legitimately carries fewer slugs than nav.json, and that omission is
    // governance-independent (the week pages and a couple of tools are never indexed). Reported,
    // not asserted, so this test cannot quietly become a pin on the indexer's scope.
    const indexed = new Set(searchRows.map((row) => row.f));
    const unindexed = [...drifted].filter((slug) => !indexed.has(slug)).sort();
    t.diagnostic(`${site}: ${drifted.size} drifted, all placed in nav; ${badges} badged index `
      + `row(s); ${unindexed.length} absent from search-index.json by construction`
      + `${unindexed.length ? ` (${unindexed.slice(0, 4).join(', ')}…)` : ''}`);
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
