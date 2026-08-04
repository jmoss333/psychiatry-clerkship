# Faculty attestation: batch sign-off and answer-key rebalancing

**Date:** 2026-08-04
**Status:** Design — awaiting review
**Author:** Joshua Moss, MD (with Claude Code)

## Problem

46 active draft questions are waiting on faculty attestation. The console attests
**one item per commit**, and each item costs a full Review → Resolve → Confirm pass:
select, wait for preview, mark reviewed at the exact saved revision, tick three
confirmations, attest, wait for the confirming reload. At that rate the backlog is
roughly 46 sequential sign-off cycles, which is why it has not moved.

Two findings reframe the work.

**1. The server is already batch-capable.** `faculty-console/netlify/functions/qbank-actions.mjs`
takes an array of entries, validates each, flips them all in a single commit, and returns
`ids` for the whole set. It carries batch-specific rules that only make sense for N > 1:

- `attest.warning_individual_only` — any item with warnings forces individual attestation
  when `selected.length > 1`
- `assessBatch()` — blocks a batch whose correct-answer positions form a positional cue
- per-entry `reviewedRevision === revision` — every item must carry its own review receipt

The browser calls this endpoint with exactly one entry (`attestEntries([entry], [current.id])`).
**Batch attestation is a UI gap, not a missing capability.** The server rules, and their
tests, already exist.

**2. The backlog has a real defect that blocks batching — correctly.** All 46 active drafts
have correct answer **A**. Simulating per-category batches against `assessBatch()`:

| Category | n | Answer keys | Batch guard |
|---|---|---|---|
| personality | 10 | A:10 | **blocked** |
| childdev | 10 | A:10 | **blocked** |
| ethics | 8 | A:8 | **blocked** |
| otherdx | 5 | A:5 | **blocked** |
| anxiety | 4 | A:4 | **blocked** |
| safety | 4 | A:4 | **blocked** |
| relational | 3 | A:3 | passes (n < 4) |
| psychosis | 2 | A:2 | passes (n < 4) |

The guard fires on every cohort of 4 or more. It is right to: a bank where the correct
answer is always first teaches position, not psychiatry. Any design that routes around
this ships the defect.

## Goals

1. Attest a reviewed cohort in one action and one commit, without weakening any existing control.
2. Make the answer-key skew visible and fixable inside the console, as a step before attestation.
3. Keep per-item clinical judgment intact — batching may reduce clicks, never scrutiny.

## Non-goals

- No change to the Review → Resolve → Confirm rail's meaning or to what faculty affirms.
- No change to the server's validation rules. The UI moves toward the server's existing
  contract; the contract does not move toward the UI.
- No auto-attestation, no "attest all", no heuristic that decides an item is fine.

## Design

### A. Multi-select in the queue

The queue gains a selection checkbox per row and a selection summary. Selection is
independent of which item is open in the workspace: you still open each item, review it,
and record its saved-revision receipt one at a time. Selection only accumulates the items
you have already reviewed, so they can be committed together.

An item may enter the selection only when it satisfies what the server will require of it:

- status `draft`
- no structural blockers
- a recorded review receipt at its **current** revision (`reviewedRevision === revision`)

An item that does not qualify shows why in the row, and its checkbox is disabled. This
mirrors `deriveAttestationEligibility()` rather than reimplementing it.

Any event that already clears review receipts — a manifest revision change, a save, a
reopen — clears the selection too. A receipt that no longer matches its revision cannot be
allowed to sit quietly in a batch.

### B. The batch rail

With a selection, the Confirm step attests the selection instead of the open item. It shows:

- what is selected, grouped by category, with each item's revision
- the batch's answer-key distribution and whether `assessBatch()` would pass
- any item carrying warnings, with the reason it must be attested individually

The three faculty confirmations stay exactly as they are and remain **one affirmation for
the batch** — matching the server, which calls `requireConfirmations()` once per request.
This is defensible precisely because the per-item review receipt is separately enforced:
the batch cannot contain an item you have not opened and marked reviewed at its exact
revision. The confirmations attest to judgment across the set; the receipts prove each item
was actually examined. The rail says so in those terms.

Failure is per batch, not per item: the server either advances the branch with all N or
returns a conflict and changes nothing. The rail reports the whole set's outcome and, on
conflict, keeps the selection so it can be retried after a reload.

### C. Answer-key rebalancing

`assessBatch()` blocking a cohort is a finding, not an obstacle. When a selection trips
`batch.answer_key_balance`, the rail names the skew ("10 of 10 correct answers are A") and
offers **Rebalance answer keys** as an edit step.

Rebalancing moves the correct option to a different position and reorders the distractors
with it. It is a normal draft edit: it goes through the existing save path, produces a new
revision per item, and therefore **invalidates that item's review receipt**, dropping it
out of the selection until re-reviewed. That is the correct consequence — the item the
learner sees has changed, so the prior review no longer covers it.

Two constraints on the transform:

- Option **content** is never rewritten, only reordered, and `c: true` follows its option.
- Any field that names an option by key (`trap` entries, `why`, `pearl`, `tier2`) must be
  remapped in the same edit, or the rationale will point at the wrong letter. This is the
  part that must be tested hardest.

Rebalancing is proposed, never automatic, and is always previewed before saving.

### D. The mid-edit reset (carried from #310)

An async preview timeout calls `applyQuestionView('live')` and `clearReviewAcknowledgements()`
regardless of what the reviewer is doing. If it fires while you are typing in Edit, the view
resets and your review state is discarded silently. This produced #310's CI failure and
would be worse with a batch selection in flight, where a stray reset could clear receipts
across a cohort.

Fix: a preview lifecycle transition must not change the active view or clear receipts while
the workspace is dirty or the reviewer is in Edit. It should record the preview failure and
surface it, leaving the reviewer's state alone. This is a small, well-bounded change in the
preview handlers, and it is a precondition for trusting a multi-item selection.

## Testing

Behavioral, matching the repo's existing style.

**`qbank-rules` / `review-model` (node):**
- selection eligibility accepts and rejects exactly what the server accepts and rejects
- a revision change drops the affected item from a selection
- rebalancing preserves option content, moves `c: true` with its option, and remaps every
  key-referencing field — including a case where `why`, a `trap`, and `tier2` all name keys
- rebalancing a cohort turns a previously blocked `assessBatch()` into a passing one

**Faculty console smoke (Playwright):**
- select three reviewed drafts, attest once, assert one POST with three items and one commit
- an item with warnings cannot join a multi-item selection and says why
- a save mid-selection drops that item and leaves the rest selected
- a preview timeout during Edit leaves the view, the editor text, and receipts intact
- keyboard: selection is reachable and operable without a pointer

**Negative controls.** Each new guard is verified to fail when its protection is removed —
the same discipline used on the badge-honesty test. A test that cannot go red is not a test.

## Sequencing

1. Preview-reset fix (independent, lands first — it is a correctness fix on its own)
2. Selection model + eligibility, node-tested, no UI
3. Queue multi-select + batch rail
4. Answer-key rebalancing
5. Backlog pass: rebalance and attest the 46 drafts using the new flow

Steps 1–3 deliver the throughput win. Step 4 is what makes it usable on *this* backlog,
since every cohort of 4+ is currently blocked.

## Risks

- **Batch reduces friction on a clinical safety action.** Mitigated by keeping per-item
  receipts mandatory and server-enforced; the UI cannot select an unreviewed item.
- **Rebalancing corrupts rationale-to-key references.** The sharpest risk in this design.
  Mitigated by never rewriting content, remapping all key references in the same edit,
  requiring a preview, and forcing re-review via the new revision.
- **One affirmation covering N items reads as weaker governance.** It is the server's
  existing contract, and the per-item receipt is the real control. The rail states plainly
  what the affirmation covers.
