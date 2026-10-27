# Director dashboard — UNSHIPPED prototype (F8)

**What it is:** a single-file page showing the clerkship director cohort-level aggregates — reach
and the pre-shelf reading pattern by rotation week, the retrieval-practice funnel, the
first-10-answer accuracy-band mix, weak topics by category (proposed feed), and the evaluation's
feasibility bars — from a committed **synthetic** fixture. It is the L8 pitch's panels as a
living page instead of a mock PDF.

**What it is not:** a learner-facing page, a report on any individual, or real data. No learner
data has been collected. It is not registered in `site_manifest.json`, `site_extras.py` or the
faculty console, so it never ships. It stores nothing (no `localStorage`, no cookies) and makes
one request: the fixture beside it. Designed for data minimisation; compliance review pending.

## Run it

Browsers block `fetch` from `file://`, so serve the folder:

```bash
cd _prototypes/director-dashboard && python3 -m http.server 8765
# open http://localhost:8765/director-dashboard.html
```

Or open the file directly and pick `director-dashboard.fixture.json` with the file picker (the
file is read on the device; nothing is uploaded).

## Files

| File | Purpose |
| --- | --- |
| `director-dashboard.html` | Page. `<script id="dd-engine">` is the pure aggregation/suppression engine; `<script id="dd-ui">` renders it. |
| `director-dashboard.fixture.json` | SYNTHETIC feed (`"_synthetic": true`), seeded random walk; includes a 4-learner resident block so small cells occur. |
| `DATA_CONTRACT.md` | The aggregate-only input schema a real feed must satisfy, and the suppression rules. |
| `../../tests/director-dashboard.test.mjs` | Pins the contract, the n<5 rule (configurable upward only), complementary suppression, rate bounds, week mapping, and "no storage / no network / not registered". |

## How it will be fed (each step is a decision, none taken here)

```
learner sites ── allowlisted keys ──► metrics/ counters {site, week, key, n}
                                          │  (CLERKSHIP_ANALYTICS off today; L8 D1–D3)
                                          ▼
                     read-only, suppressed aggregate endpoint (D-F8-2)  or  a committed export
                                          │
rotation_blocks.json (D-F8-3) ──────────► this page (moves into faculty-console/ later — a governance PR)
honest broker pre/post aggregates (#1077) ┘
```

Related: `docs/superpowers/specs/2026-09-04-usage-analytics-design.md` (the counter service),
`docs/superpowers/specs/2026-10-27-director-dashboard-design.md` (this prototype's design), the
L8 clerkship-outcomes design (questions, claims boundary, feasibility bars), and draft PRs
#1076 (outcome counters) and #1077 (pre/post).

## Decisions this prototype surfaces

- **D-F8-1** pin aggregate-only scope in `decisions.json` (governance PR).
- **D-F8-2** read path for counters (recommend a read-only function on `metrics/` returning
  suppressed aggregates).
- **D-F8-3** rotation calendar source (recommend committed `rotation_blocks.json`, start dates only).
- **New:** the weak-topics panel needs a per-category key family that nothing emits today; adding
  it widens what learners' browsers send and should be decided explicitly, not slipped into an
  allowlist regeneration.
- Whether the nested-threshold differencing gap in `DATA_CONTRACT.md` rule 4 should be closed.
