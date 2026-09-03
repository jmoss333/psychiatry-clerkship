# Daily Review serves every card in its own queue — design

**Date:** 2026-09-02
**Status:** implemented on `claude/site-usability-engagement-o2kpmb`
**Source:** Clerkship Engagement Concepts canvas, concept G
**Companions:** `2026-09-02-timed-block-and-session-receipt-design.md` (the block whose review
step reads the same queue), `2026-07-15-family-systems-active-retrieval-design.md` (which
authored the FAM# cards), `2026-07-15-sim-and-content-improvements-future-work.md` (which
registered this gap)

---

## Plain-language summary

Family Systems Practice has been writing spaced-repetition cards since July. The home due badge
counted them; Daily Review could not show them, because it only ever built its queue from two
sources it knew how to draw — landmark-deck questions and per-topic quizzes, both multiple
choice. A family prompt has no options to pick: you answer it aloud and then rate yourself
against the model. So the fix is not a filter, it is a **second card shape**, and with that
shape in place the queue can hold anything a tool schedules.

## The gap, precisely

`dueBreakdown()` in the shell buckets every `cw_srs_v1` card by id prefix — `QB#`, `FAM#`,
`deck#`/`TOPIC#` — and the badge sums all of them. `review.html` built `cards` from
`quizzes.json` and `topic_meta.json` only, then queued from that list. A due `FAM#` card was
therefore counted and never served: the badge read a few higher than the session, permanently,
with no way for the learner to work the difference down.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Card shapes | `kind: 'choice' \| 'recall'` on every card | The queue, scheduler, grading and receipt are shared; only the answer step differs |
| Recall interaction | Answer aloud → **Reveal one way to do it** → self-rate | Identical to the family tool's own loop, so the same card behaves the same in both places |
| Grades on a recall card | All four stay open | There is no objective outcome to gate on — the grade *is* the outcome. Choice cards keep the Good/Easy lock on a miss |
| Which family cards are served | Only those that already have a schedule | See below |
| Prompt definitions | One shared snippet, injected into both tools | The card id embeds the prompt id |
| Reveal content | The scenario's own `opening` or authored section | No new clinical text, so no new attestation surface |
| Data | Third fetch of `family_systems_scenarios.json`, failing soft | A source that will not load contributes nothing; the rest of the queue still runs |

### Why only cards that already have a schedule

A recall card joins the queue only once `cw_srs_v1` holds an entry for it — that is, once the
learner has practised it beside its scenario in the family tool. Two reasons, and they point the
same way:

- **It closes exactly the gap.** The badge counts *due* cards, which by definition already have
  a schedule. Serving precisely those makes badge and queue agree.
- **It does not open a new one.** These prompts are authored to be answered with the scenario's
  setting, opening and prepare-list in front of you. Sprung cold as a "new card", a prompt like
  "Name the trap here" has no *here*. Unpractised prompts therefore stay out of the new-card
  stream, which also means this change cannot alter what a learner's daily new-card allowance
  introduces.

`queueable(card, cardState)` is the single predicate, applied in both places the queue is
counted (the dashboard metrics) and built (the session), so the two can never drift.

## Why the prompt list had to become a shared snippet

`famCardId(scenarioId, promptId)` puts the prompt id **inside** the card id. Two copies of the
prompt list — one per tool — could drift, and the failure would be silent and ugly: the same
schedule filed under a prompt the learner never saw, or one prompt's history split across two
ids. That is the id-collision class the repo's storage rule already warns about. So
`FAM_DEFAULT_RETRIEVAL`, `famCardId`, `famRevealContent` and `famRetrievalFor` moved into
`site_build/fam_retrieval.js` and are injected into both consumers; neither may re-declare them,
and a test pins that.

## Files

- `site_build/fam_retrieval.js` — the shared prompt list, card id, and reveal resolution
  (marker `/*__FAM_RETRIEVAL__*/`; `SNIPPET_MARKERS` 27 → 28)
- `family-systems-practice.html` — local copies removed, call sites renamed
- `review.html` — third card source (`famRecallCards`), `queueable`, `revealNodes`, `prettyRef`,
  the recall branch of the session renderer, and guards on every option-only path
  (`correctIdx`, the keyboard handler, the feedback panel)
- Tests: `fam-retrieval`, `review-recall`; `calib-wiring`'s `sug` pin extended for the recall
  branch; `parallel-ceilings` marker count

## Verification

- `node --test tests/*.test.mjs`: 1621 pass, 0 fail.
- Both site builds and `check-static-site.mjs` on each: no hard finding except the LFS pointer
  stubs this sandbox always produces (no `git-lfs`).
- End to end on the built site: a due family card is served in Daily Review, shows its prompt
  with no options, reveals the scenario's own opening verbatim, accepts all four grades,
  produces the session receipt, and moves the schedule forward. A 14-card new-card queue
  introduced zero family prompts, confirming the gate.
- The family tool's own practice loop still reveals, grades and schedules — under the identical
  card id Daily Review serves, which is the point of the shared snippet.

## Residual, deliberately left

- A `FAM#` card whose scenario is later removed from `family_systems_scenarios.json` would still
  be counted by the badge and no longer be renderable — the same shape as a retired question-bank
  item, which the shell gates with `qbRecordServable`. Rare enough (it needs a scenario to be
  deleted, not edited) that a second registry read in the shell is not yet worth it.
- Spoken-communication (`cw_comm_v1`) and reasoning (`cw_reason_v1`) cards still schedule
  nothing, so there is nothing to render for them. When they do, each is a builder plus a fetch:
  the queue, the recall renderer, the grading path and the receipt are already general.
