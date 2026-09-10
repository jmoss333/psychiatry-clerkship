# Spoken encounter realism implementation plan

**Goal:** Build the four approved realism features and release the tested protected room.

**Architecture:** Trusted context guidance adds continuity and clarification after canonical case projection. Family bid metadata and one authored cue travel in sealed encounter receipts; the client owns playback, floor-taking and accessible controls. No additional actor calls or mutable server session cache.

**Spec:** `docs/superpowers/specs/2026-09-09-sp-encounter-realism.md`

- [x] Add and test `interaction-guidance.mjs`: preserve canonical prefix, permitted role and heard messages; add no inferred score/state.
- [x] Add `family-bids.mjs`; integrate separate speaker metadata into handler, state finalization, family context, browser playback and station projection. Preserve two speech segments and three-unit reservation.
- [x] Add `room-cues.mjs` and one-cue receipt field; add faculty controls, local short sound, visible description and cancellation. Validate allowlisted cue IDs before spending.
- [x] Add public read-only capability endpoint; hide disabled Moments on production, allow explicitly enabled staging.
- [ ] Run focused protocol/controller tests, complete preview tests and hosted browser journeys. Independently review history and cancellation boundaries.
- [ ] Run bounded real-provider audition: at most three starts and nine replies, no automatic retries, using fictional Dana/Marcus/family prompts. Retain a development-only receipt; do not store user conversations.
- [ ] Run the full local gate; commit and update the existing draft PR without changing faculty attestation.
- [ ] Deploy and verify the exact committed bundle on protected staging, then on the authorized live Interview Room. Check no-store/authentication, served hashes, production format gating and unchanged ledger namespace/caps. Record release evidence and remaining human listening checks.
