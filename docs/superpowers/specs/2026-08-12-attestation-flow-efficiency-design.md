# Attestation Flow Efficiency — the Review-Sitting Flow

**Date:** 2026-08-12
**Status:** Approved design (Josh Moss, MD — this session)
**Audience:** Faculty-console maintainers

## Plain-language summary

Attesting a 12-draft qbank sitting currently costs ~52 clicks: per item, the reviewer
clicks the item in the list, checks two separate review checkboxes, and checks a batch-tray
checkbox; then once per batch, three cohort confirmations and the attest button. Only the
review assertions and cohort confirmations are governance-load-bearing — the rest is
navigation mechanics.

This design cuts the per-item cost to one action (~16 clicks for the same sitting, 2
keypresses per pending content page) without weakening any review evidence: assertions
stay explicit and fully labeled, receipts stay revision-anchored, the cohort guard and the
three confirmations stay untouched, and every keyboard shortcut fires only when its
labeled control is rendered.

## Goals

1. One deliberate action per reviewed qbank draft; zero pure-navigation clicks inside a
   sitting.
2. Same for pending content pages/tools (the one-click attest gains flow).
3. No change to what is asserted, recorded, or committed — evidence identical to today.

## Non-goals

- No server (`attest.mjs`, `qbank-actions.mjs`) or schema changes; client-only.
- No change to the reopen-reason dialog, stale-write protection, or receipt persistence.
- No relaxation of the batch cohort guard (`assessBatch` same-key limits).
- No autosubmit: the batch commit and its three confirmations remain manual.

## Design

### 1. Compound receipt (qbank drafts)

When the live preview status is `ready` **and** the item is a clean draft at its saved
revision (the exact conditions under which today's two checkboxes are both meaningful),
render ONE checkbox in place of the pair:

> "I reviewed this draft at its saved revision and its live rendering."

Checking it performs both of today's state changes atomically: the revision-anchored
receipt (`state.reviewedRevisions.set(id, revision)`) and the live-render check
(`state.reviewChecks.liveReviewed`). Unchecking clears both.

**Degraded-path fallback:** when the preview is in any failure state
(`PREVIEW_FAILURES`), today's separate checkboxes render unchanged — the degraded path
keeps its explicit, separate acknowledgment ("live preview unavailable, acknowledged").
The compound control never renders alongside the separate pair.

### 2. Auto-enroll (batch tray)

Earning a receipt adds the item's id to `state.batchSelection` automatically; losing a
receipt (revision drift, uncheck) removes it — the existing pruning already handles the
eligible-set intersection. The tray checkbox remains rendered and togglable: unchecking
is an explicit exclusion that survives until the receipt is re-earned. The cohort guard
(`assessBatch`) continues to vet the final selection at attest time; auto-enrollment
never bypasses it.

### 3. Auto-advance

- **Qbank:** checking the compound receipt (mouse or `R`) advances the selection to the
  next unreceipted draft in the current filtered list (wrapping is not needed — stop at
  the end and announce "all drafts in this filter hold receipts"). Receipts persist
  across navigation (#346), so flow-forward loses nothing.
- **Content:** a successful one-click attest advances to the next pending content item in
  the current filter; when none remain, announce completion and stay put.
- Advancing uses the existing `setSelectedReviewKey` path so receipts, holds, and
  navigation guards behave exactly as manual navigation does. Auto-advance never fires
  while a navigation guard (unsaved edit) is active.

### 4. Keyboard

- `R` — toggles the compound receipt on the current item. Fires ONLY when the compound
  control is rendered (same integrity rule as the existing `A` shortcut: the key targets
  a control whose label states the full assertion; `aria-keyshortcuts="r"` marks it).
  Never fires in inputs/textareas/selects/contenteditable, never with modifiers.
- `ArrowUp`/`ArrowDown` — move the review-list selection (guard-aware, same path as
  clicking). Only when focus is not in a form control.
- Existing `A` (one-click content attest) and `Cmd/Ctrl+S` unchanged.

### 5. Announcements

Each auto-advance announces the newly selected item (`announce()`); receipt earn/loss and
enrollment changes announce compactly ("Receipt recorded — 3 of 12 remaining; added to
batch"). No new live regions — the console's existing announcer is reused.

## Error handling

- Compound receipt with a stale item (revision changed underneath): the existing
  revision-anchored check simply fails to match — the receipt does not record, the tray
  does not enroll, and the announcement says the draft changed and needs re-review.
- Auto-advance target vanished (filter changed, item attested elsewhere): fall back to
  the first unreceipted visible item; if none, stay put and announce.
- `R` with no compound control rendered: no-op (no announcement spam).

## Testing

- **Unit/contract (root suite):** compound-control gating (renders only when preview
  ready + clean saved revision; degraded paths keep separate boxes); atomic set/clear of
  both state slices; auto-enroll on earn, prune on loss, exclusion survives re-render;
  auto-advance selects next unreceipted item, stops at end, respects navigation guard;
  `R`/arrow scoping (form-control focus, modifiers, absent control).
- **Existing pinned suites to update:** `tests/faculty-batch-selection.test.mjs`
  (selection semantics gain auto-enroll), `tests/faculty-console-contract.test.mjs` and
  `tests/faculty-console-actions.test.mjs` (receipt flow), `tests/smoke/faculty-console.spec.js`
  (the sitting flow end-to-end: receipt → advance → tray filled → 3 confirmations →
  batch attest; and content attest → advance).
- **Invariant that must not regress:** receipts persist across item navigation
  (`preserveQuestionReceipts`), revision-anchored self-invalidation, `assessBatch`
  cohort blocks, `A`-shortcut integrity rule.

## Acceptance criteria

- A 12-draft sitting with clean previews completes with 12 compound-receipt actions +
  3 confirmations + 1 attest (16 deliberate actions), fully keyboard-drivable.
- A degraded-preview item still requires its separate explicit acknowledgments.
- Excluding an auto-enrolled item from the batch takes one uncheck that sticks.
- No change in the attest request payload, receipts data model, or server behavior.
- All existing console suites green after updates; no new smoke flake.
