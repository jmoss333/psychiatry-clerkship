# Hosted spoken room release checks

This complements the canonical proxy checklist. The hosted room has different request limits, receipts and optional microphone behavior; canonical managed-voice V3 must not be mistaken for this optional spoken-interruption experiment. Check the exact deployment after a change. Automated checks are not physical-microphone or faculty acoustic sign-off.

| Check | Expected behavior and evidence |
| --- | --- |
| H1 · Access and case binding | Missing/wrong passcode, invalid origin, case substitution and altered receipts fail before reservations. `handler.test.mjs`, `realism-handler.test.mjs`; repeat access refusals against the deploy. |
| H2 · Disclosures | Locked Dana/Marcus/Ray content and family private inventory stay out of actor context. `leak.test.mjs` and canonical offline red-team probes. This does not establish that a live model never invents information. |
| H3 · Heard speech | Interrupt each segment: only complete played segments become dialogue context or quoted evidence. `client.test.mjs`, `station.test.mjs`, `realism-handler.test.mjs`. |
| H4 · Spoken floor-taking | With opt-in on, a distinct sentence stops active and queued speech and retains its opening words. Brief acknowledgments and exact patient echo do not create paid learner turns. Default remains off; Pause/Escape/End/Clear and hidden-page cancellation win. Run headphone and speaker trials separately; textual echo filtering is not acoustic separation. |
| H5 · Voice expression | Three preset values are accepted at Start only and sealed across speakers/retry. Facts, disclosure permissions and numeric playback speed remain fixed. Faculty must listen for intelligible negation, accurate disclosure, and non-caricatured expression; tests do not attest acoustic authenticity. |
| H6 · Family requests | Main answer then other person's authored request, never overlap. A cut-off request cannot redirect a bare yes. One request per person, no extra learner turn or additional provider slot. Replay quotes the correct speaker. |
| H7 · Room event | One allowlisted cue; unsupported/repeated IDs fail before spending. Pause retains completed draft and displays unfinished words separately without auto-sending them. No new visitor, danger or disclosure permission. Retry before the cue excludes it. |
| H8 · Feedback unavailable | Actual handler streams with each bounded category reach the unavailable-feedback state and retain one explicit alternative. No provider retry or raw exception text. `moment-category-compatibility.test.mjs`. |
| H9 · Output consistency | Unexpected non-Latin patient-output letters fail before publication; accented Latin words remain. This is script consistency only, not a factuality or English-language detector. The learner's language is not examined. |
| H10 · Release isolation | Seven public assets only; private paths are 404. Capabilities expose only availability under the current room flag. Check no-store/CSP, stable ledger namespace and 20/680/340 limits after staging and production deploys. |

Record mechanical results, model audition observations, and physical/faculty judgments separately. Do not sign the canonical faculty record on behalf of another person.
