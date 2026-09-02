# Timed block ("I have N minutes") + shared session receipt — design

**Date:** 2026-09-02
**Status:** implemented on `claude/site-usability-engagement-o2kpmb` (PR #456), with the
seven-day activity strip from the same canvas
**Source:** Clerkship Engagement Concepts canvas, concepts B and C
**Companion:** `2026-08-05-offline-shell-and-session-capsule-design.md` (the capsule this builds
on; its "I have N minutes" launcher was deferred there for want of duration data)

---

## Plain-language summary

Between rounds a learner has a pocket of minutes, not a plan. Today now asks **"I have…"** —
5, 10 or 20 minutes — and packs the window from what is due and what is next: the due reviews
first (retrieval decays fastest), then one unread page from this week that fits, then practice
questions aimed at the weakest blueprint area. Starting the block opens the first step; every
practice tool now ends on the same **session receipt**, which names what to re-read, offers
one next action (the block's next step when one is live), and marks the Today item done so
nobody goes back to tick it.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Where the plan is built | Front door, at render, from live stores (`fdBlockPlan`) | The inputs (dues, progress, mastery) already live in the shell; tools stay ignorant of each other |
| What is persisted | One block, `cw_block_v1`, pruned after 12 h | A plan built for one morning's dues must not resurface stale; nothing else is new state |
| Page-step completion | Derived from `cw_progress_v1`, never stored | Ticking the page from Today, the reader or the receipt all count; no second source of truth |
| Review / question-step completion | Marked by the receipt inside the tool | The tool is the only party that knows the session finished |
| Tool entry | `?block=1&limit=N` (Daily Review), `?block=1&n=N[&cat=C]` (question bank) | Rides the existing `toolExtraFromParams` passthrough; no shell routing change |
| Tool → shell navigation | `openPage` message gains an optional `search` (short, plain query only) | The in-iframe link interceptor keeps only the resource name, which would drop `block=1` |
| Receipt scope | Question bank, Daily Review, Shelf Mode | The three tools with a session end; the sims end on their own summaries and are deferred |
| Which tools mark themselves done | Only the question bank (a week item) | Daily Review and Shelf Mode are hidden tools, not path items |
| Block actions | `data-block-*`, owned by the shell's auxiliary click handler | Outside the `data-fd-*` controller namespace `fd_wire` pins |
| Overrun | A page that does not fit is skipped, never squeezed | A block that ends early is a pleasant surprise; one that runs over is a broken promise |

## Estimates the planner encodes

Review card ≈ 30 s, practice question ≈ 45 s, page = `topic_meta.read` minutes; reviews take
2 min of a 5- or 10-minute block and 4 min of a 20-minute one; questions fill what is left,
2–10 of them. All rounded up.

## Files

- `site_build/block_store.js` — `cw_block_v1` load / save / clear / mark-step (marker
  `/*__BLOCK_STORE__*/`, injected into the shell, the question bank and Daily Review)
- `site_build/session_receipt.js` — `cwReceipt(spec)` (marker `/*__SESSION_RECEIPT__*/`,
  injected into the three tools)
- `site_build/frontdoor/fd_block.js` — pure planner, status and card (marker `/*__FD_BLOCK__*/`)
- `spa_index.html` — `fdTodayLive` splice, block click handlers, `openPage.search`
- `question-bank-practice.html`, `review.html`, `shelf-mode.html` — block entry + receipt
- `frontdoor.css` `.fd-block*`; `CLASS-INVENTORY.md`
- Tests: `fd-block`, `block-store`, `session-receipt`, `block-wiring`; `parallel-ceilings`
  marker count 24 → 27

## Deferred

- Receipts for the sims (Diagnostic Reasoning, What Do You Say Next?, Family Systems, One
  Patient) — each ends on a per-case summary today; wiring them is mechanical once their
  stores feed `cw_srs_v1` (see `2026-07-15-sim-and-content-improvements-future-work.md`).
- Learning the per-item durations the capsule was meant to accrue; the planner's constants
  stand in until there is measured data.
- A block that spans days (today's is pruned after 12 h by design).
