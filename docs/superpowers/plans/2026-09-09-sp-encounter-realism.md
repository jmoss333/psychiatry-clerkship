# Spoken encounter realism implementation plan

**Goal:** Build the four approved realism features and release the tested protected room.

**Architecture:** Trusted context guidance adds continuity and clarification after canonical case projection. Family bid metadata and one authored cue travel in sealed encounter receipts; the client owns playback, floor-taking and accessible controls. No additional actor calls or mutable server session cache.

**Spec:** `docs/superpowers/specs/2026-09-09-sp-encounter-realism.md`

- [x] Add and test `interaction-guidance.mjs`: preserve canonical prefix, permitted role and heard messages; add no inferred score/state.
- [x] Add `family-bids.mjs`; integrate separate speaker metadata into handler, state finalization, family context, browser playback and station projection. Preserve two speech segments and three-unit reservation.
- [x] Add `room-cues.mjs` and one-cue receipt field; add faculty controls, local short sound, visible description and cancellation. Validate allowlisted cue IDs before spending.
- [x] Add public read-only capability endpoint; advertise Moments only when the room is enabled, matching Claude’s merged single-flag decision.
- [x] Run focused protocol/controller tests, complete preview tests and hosted browser journeys. Independently review history and cancellation boundaries.
- [x] Run bounded real-provider audition: at most three starts and nine replies, no automatic retries, using fictional Dana/Marcus/family prompts. Retain a development-only receipt; do not store user conversations.
- [x] Run the full local gate and preserve merged Claude work without changing faculty attestation.
- [ ] Commit and publish the new realism branch for review; PR #586 has already merged.
- [ ] Deploy and verify the exact committed bundle on protected staging, then on the authorized live Interview Room. Check no-store/authentication, served hashes, production format gating and unchanged ledger namespace/caps. Record release evidence and remaining human listening checks.

## Integration evidence

Merged origin/main at `91cdfec`, including Claude’s case attestations, Moments single-flag decision and bounded error categories, hosted disclosure probes, benchmark harness, spoken controls and typed-room display changes. Fixed the actual handler/browser mismatch for categorized unavailable-feedback frames. The full gate exposed stale generated benchmark worksheets on clean main; canonical regeneration fixed three HTML files without changing assertions or decisions. The new capability bundle test now resolves paths consistently from root and package directories.

The full local gate passes. The hosted suite contains 423 passing tests; 43 browser journeys passed across a full run and targeted reruns. A three-start, nine-reply synthetic provider audition completed, followed by three text-only grounding challenges. No physical microphone or faculty acoustic judgment is claimed. One unexpected-script patient output prompted a deterministic pre-publication guard; Marcus’s follow-up kept known sleep facts but still generalized about other people’s reactions. That remaining model limitation is recorded, not treated as an eliminated failure. No endless regeneration or automatic retry was used.
