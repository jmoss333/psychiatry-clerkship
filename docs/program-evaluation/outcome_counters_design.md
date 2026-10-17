DRAFT — NOT APPROVED. `CLERKSHIP_OUTCOMES` stays `off` until the owner approves this design and
an ethics determination is on file (see `evaluation_protocol_draft.md` and
`irb_qi_determination_request_draft.md` beside this file).

# Outcome counters: aggregate engagement for the question bank and Daily Review

**Status:** draft scaffolding, gated off. **Builds on:** the usage-analytics counter service
(`docs/superpowers/specs/2026-09-04-usage-analytics-design.md`). Nothing in that design's privacy
model changes here.

## What it adds

Nine allowlisted tool-step keys, sent through the existing emitter, so the metrics site can
count, per site and ISO week, how many **page visits** crossed each threshold:

| Key | Meaning (per visit to the tool) |
| --- | --- |
| `tool:qbank:answered-5` / `-10` / `-20` | answered at least 5 / 10 / 20 questions |
| `tool:qbank:first10-lt50` | first ten answers: fewer than 5 correct |
| `tool:qbank:first10-50to79` | first ten answers: 5-7 correct |
| `tool:qbank:first10-80up` | first ten answers: 8 or more correct |
| `tool:daily-review:graded-1` / `-10` / `-25` | graded at least 1 / 10 / 25 cards |

Tool opens are already counted as `page:question-bank-practice.html` and `page:review.html`.

## What it never sends

No item id, category, answer, confidence, score, count, timestamp or learner identifier. The
running counts live in memory for one page visit. The emitter's own rules still apply: DNT and
GPC honoured, learner opt-out, per-visit dedup, week-level storage, n < 5 suppressed in reports.

## How it is gated (two independent gates, both default off)

1. `CLERKSHIP_ANALYTICS=off|ms3|res|both` ships the emitter (unchanged).
2. `CLERKSHIP_OUTCOMES=off|on` (new) stamps the `CW_OUTCOMES` global into pages that carry
   `outcome_tally.js`. Without the stamp, `cwOutcomeTally()` returns on its first line.

The second gate exists because the page-view counters may be enabled on a site before this is
approved. Merging this code changes nothing that site sends. `build_deploy.py` fails the build
if an off build carries the stamp anywhere (the resident site is a copy of that tree).

## Where the code lives, and why there

`outcome_tally.js` is a shared snippet nested inside `calib_log.js` (marker
`/*__OUTCOME_TALLY__*/`). `calibLog()` already receives exactly the validated, enum-only events
needed (`s`, `a`), from both the question bank and Daily Review. Hooking there means **neither
attested tool source changes**, so no `reviewed.json` attestation drifts.

## Known limits (read before reporting anything)

- Visits, not learners. A learner who opens the bank three times counts three times.
- Self-selected items. Accuracy bands reflect whatever the learner chose to practise, so a week's
  band mix is not a knowledge measure. Knowledge gain is the pre/post design's job.
- Week, not rotation week. Mapping ISO weeks to rotation weeks uses the public block calendar
  and is only clean when blocks do not overlap.

## Enabling (owner only, after approval)

Set `CLERKSHIP_OUTCOMES=on` in the Netlify UI for the site, alongside the site's existing
`CLERKSHIP_ANALYTICS` value. Rollback: set it back to `off` and redeploy.
