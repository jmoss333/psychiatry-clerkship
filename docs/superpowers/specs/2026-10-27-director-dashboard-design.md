# Director dashboard (F8) — prototype design

**Date:** 2026-10-27 · **Status:** prototype, unshipped, synthetic data only · **Plan:** F-wave
WP-F8-proto.

## Goal

Give the clerkship director a cohort-level view of how the library is used across a rotation —
the four L8 panels plus weak topics — without any learner-level field existing anywhere in the
pipeline. Show the UX now; wire real data only after the analytics decisions (L8 D1–D3, D-F8-2).

## Scope

- In: `_prototypes/director-dashboard/` (page, synthetic fixture, README, data contract) and
  `tests/director-dashboard.test.mjs`.
- Out: `metrics/`, the files of draft PRs #1076/#1077, `faculty-console/`, any registration
  (`site_manifest.json`, `site_extras.py`, nav), any storage, any network beyond the fixture.

## Design

1. **One closed input shape** (`DATA_CONTRACT.md`): the metrics site's `{site, week, key, n}`
   records, a director-maintained rotation calendar, and optional per-block pre/post feasibility
   aggregates. Closed field sets make identifiers a validation failure; a failing feed renders
   nothing.
2. **Pure engine, thin UI.** `<script id="dd-engine">` has no DOM, storage or network and is run
   directly by the test in a `vm` sandbox; the UI only formats what the engine returns.
3. **Suppression at render, independent of the source.** Threshold default 5 (L8 §2.1; plan
   D-F6-5/D-F8-1), configurable upward per feed, floor enforced in code. Counts < threshold
   (zero included) render `<5`; complementary suppression on totalled rows; shares suppressed on
   a small numerator or denominator and bounded when the complement is small.
4. **Pooling.** Rotation-week tables pool across the selected blocks on one site; feasibility
   pools across all blocks on the site — small blocks (4 learners) otherwise suppress everything.
5. **Claims boundary on the page** (L8 §7) so counters are not mistaken for learning outcomes.

## Deviation from the plan, stated

The plan lists "accuracy-band mix by category". PR #1076's counters carry no category, by design.
The prototype therefore shows the band mix **by rotation week** (the L8 design's question 7) and
puts "weak topics by category" in a separate panel fed by a **proposed** key family that no
producer emits — flagged in the README as a decision, because it widens what learners' browsers
would send.

## Verification

`node --test tests/director-dashboard.test.mjs`; `node --test tests/*.test.mjs`;
`bash bin/verify.sh --push`; `shipped_pages.py --check` unchanged (nothing registered).

## Addendum 2026-10-27 — D-F8-6, D-F8-2, D-F8-3 (owner decisions "fw rec")

- **One engine, moved to the deployable.** The inline `dd-engine` block became
  `metrics/aggregate/cohort_aggregate.js` (classic-script/ESM neutral, `globalThis.CohortAggregate`)
  so the dashboard and the metrics function share one implementation; the synthetic fixture moved
  beside it as `synthetic_feed.json` and is now generated from seeded visit atoms.
- **D-F8-6 closed.** Output is `publish(feed)`: cells that are `{shown:false}` carry no value;
  cumulative thresholds become disjoint tiers; every identity (totals, pooled-vs-block,
  answered-10 ↔ bands) drives complementary suppression with a residual rule, followed by an
  exact Gauss–Jordan audit. Hidden cells render uniformly as `—`. The reach "Total" column was
  dropped and reach "tools" excludes the two funnel tools, removing two identities rather than
  protecting them. The tests audit from visit atoms, independently of the engine's identities.
- **D-F8-2 built.** `metrics/netlify/functions/cohort.mjs`, `/api/cohort`: GET-only, no storage,
  no logging, no cookies, no request reading; synthetic feed only; real counters behind
  `REAL_COUNTERS_ENABLED = false` (literal) and an unwired `REAL_CALENDAR`. Deploys with the
  metrics site from `main`; no Netlify UI, environment or DNS change.
- **D-F8-3.** The calendar of record already exists:
  `13_Faculty_Resources/_automation/maintenance/rotation_blocks.json` (MS3; dates only). The
  engine converts it (`blocksFromRotationConfig`) instead of adding a parallel file. Residents'
  dates are not in the repository.
