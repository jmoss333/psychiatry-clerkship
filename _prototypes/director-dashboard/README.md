# Director dashboard — UNSHIPPED prototype (F8)

**What it is:** a single page showing the clerkship director cohort-level aggregates — reach and
the pre-shelf reading pattern by rotation week, the retrieval-practice funnel (disjoint tiers),
the first-10-answer accuracy-band mix, weak topics by category (proposed feed), and the
evaluation's feasibility bars — from a committed **synthetic** feed. It is the L8 pitch's panels
as a living page instead of a mock PDF.

**What it is not:** a learner-facing page, a report on any individual, or real data. No learner
data has been collected. It is not registered in `site_manifest.json`, `site_extras.py` or the
faculty console, so it never ships. It stores nothing (no `localStorage`, no cookies) and makes
one request: the synthetic feed. Designed for data minimisation; compliance review pending.

## Run it

The page loads the shared engine and the feed from `metrics/aggregate/`, so serve the
**repository root**:

```bash
python3 -m http.server 8765        # from the repository root
# open http://localhost:8765/_prototypes/director-dashboard/director-dashboard.html
```

Or open the file directly (the engine is a classic script, so it loads from `file://`) and pick
`metrics/aggregate/synthetic_feed.json` with the file picker (read on the device; nothing is
uploaded).

## Files

| File | Purpose |
| --- | --- |
| `director-dashboard.html` | Page (UI only). Renders `CohortAggregate.publish(feed)`; a hidden cell reaches it with no value. |
| `../../metrics/aggregate/cohort_aggregate.js` | **The one engine**: validation, aggregation, small-cell + complementary suppression, exact differencing audit. Shared with the metrics site's read-only function. |
| `../../metrics/aggregate/synthetic_feed.json` | SYNTHETIC feed (`"_synthetic": true`), generated from seeded visit atoms; includes a 4-learner resident block so small cells occur. |
| `../../metrics/aggregate/synthetic_feed_generator.mjs` | Regenerates the feed (`--write` / `--check`); the tests use its atoms for the independent audit. |
| `../../metrics/netlify/functions/cohort.mjs` | Read-only function `GET /api/cohort` on the metrics site (D-F8-2): synthetic only; real counters hard-disabled. |
| `DATA_CONTRACT.md` | Input contract, published-aggregate shape, suppression rules (rule 4 now enforced). |
| `../../tests/director-dashboard.test.mjs` | Engine + differencing proofs (tested once). `metrics/tests/cohort-handler.test.mjs` pins only the function's HTTP/no-storage behaviour. |

## How it will be fed

```
learner sites ── allowlisted keys ──► metrics/ counters {site, week, key, n}
                                          │  (CLERKSHIP_ANALYTICS off today; L8 D1–D3)
                                          ▼
              metrics/ /api/cohort — publish(): grouped, suppressed totals (D-F8-2, built;
                                          │       serves SYNTHETIC until REAL_COUNTERS_ENABLED)
rotation calendar (D-F8-3: maintenance/rotation_blocks.json, MS3) ──►┘
                                          ▼
                     this page (moves into faculty-console/ later — a governance PR)
honest broker pre/post aggregates (#1077) ──► feasibility panel
```

Related: `docs/superpowers/specs/2026-09-04-usage-analytics-design.md` (the counter service),
`docs/superpowers/specs/2026-10-27-director-dashboard-design.md` (this prototype's design), the
L8 clerkship-outcomes design (questions, claims boundary, feasibility bars), and draft PRs
#1076 (outcome counters) and #1077 (pre/post).

## Decisions

- **D-F8-1** aggregate-only scope — decided 2026-10-27; record in `decisions.json` (governance PR).
- **D-F8-2** read-only function on `metrics/` — built (`/api/cohort`), synthetic only.
- **D-F8-3** rotation calendar — the committed `maintenance/rotation_blocks.json` (MS3); residents'
  dates waiting on the coordinator.
- **D-F8-5** weak-topics category counter — deferred until L8 D1–D3.
- **D-F8-6** nested-threshold differencing — closed (DATA_CONTRACT rule 4, enforced and tested).
- **Still open:** L8 D1–D3 (before `REAL_COUNTERS_ENABLED` may flip), D6 retention, D9 residents.
