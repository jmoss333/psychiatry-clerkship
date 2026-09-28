# Daily Review quick sessions and schedule restore

## Learner outcome

A learner can complete a short Daily Review session on a break, see how many
scheduled cards remain, and move the review schedule to another browser using a
downloaded JSON file. Clerkship Review, Landmark Evidence, and All due remain
views of the same `cw_srs_v1` schedule. Anki scheduling remains separate.

## Quick sessions

- Show **Quick 5**, **Quick 10**, and **Review all** for the selected lane. The
  existing **All due** lane still means due cards across both lanes; it is not
  renamed or silently selected by Review all.
- Reuse the existing due-first queue and daily new-card allowance. The quick
  limit caps its initial distinct cards, not repeat appearances after Again.
- Again returns a card within the current session. Progress numbers must remain
  truthful when this makes a session longer than its initial five or ten cards.
- After a completed quick session, show the current number of due cards in that
  lane, derived from the saved schedule. If a source is unavailable, say the
  count is incomplete instead of claiming zero. Keep timed-block receipts and
  their limits unchanged.
- Replace the inaccurate Again `<10m` hint with `this session`.

## Schedule backup and restore

- Add an explicit review-only backup download and a restore control on the Daily
  Review dashboard. Accept the new `clerkship-review-backup-v1` file and the
  site's existing `clerkship-study-v2` anonymous progress export. Import only
  its `srs` member; reading, quiz, calibration, plan, and study ID stay as they
  are on the receiving browser.
- Validate the envelope, SRS version, card records, settings, and statistics
  before any write. Reject oversized or malformed files. Require complete
  review sources and a complete current question-bank ID inventory before
  preparation. The site build embeds the full ID and retired-status inventory
  from its own `question_bank.json` in `review.html` for both MS3 and resident
  sites. Restore reads that embedded inventory without a runtime fetch and
  refuses to prepare if it is missing or malformed.
- Each site build also embeds SHA-256 digests for its five other Daily Review
  card-source files. The page checks the exact response bytes before accepting
  a source as ready. A shortened response with internally consistent counts
  therefore cannot make restore discard schedules for cards that still exist
  in the build.
- Retain valid card schedules whose IDs are currently served by Daily Review or
  belong to non-retired question-bank items. Skip retired/removed IDs and state
  the skipped count in the preview; never make a skipped due card appear in a
  site counter. Preserve the shared SRS schedule for currently served QB cards.
- Choosing a file displays a preview and changes nothing. A separate,
  explicitly labeled Replace action asks for confirmation, then writes only
  `cw_srs_v1`. A failed read, validation, cancellation, or storage write leaves
  the old schedule intact. A corrected article card is re-opened as due when a
  restored schedule predates its content revision. If a learner selects another
  file while the first is still loading, only the latest selection may update
  the preview or error state; show the selected file name in the preview.
- Keep controls keyboard operable, announce errors and completion to assistive
  technology, and use only `cw_*` browser keys. Neither the backup nor the
  restore sends learner history to a server.

## Verification

Node tests exercise the real queue selection, repeat behavior, due receipt,
restore parser, latest-file selection, source digest checks, and no-write
preview/failure paths. Build tests verify that both audience sites embed the
complete inventory and source digests, replacing inherited site data. Build both sites and run the repository
verification gate. A browser smoke check covers an export from one browser
context and restore into another using a small fixture.
