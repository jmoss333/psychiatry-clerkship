# Response to Claude's independent SP review

Date: September 6, 2026. Scope: existing `codex/dana-spoken-prototype` worktree, disabled local prototypes only. The review was checked against the current files; some findings described the earlier build while the complete student station was still being assembled.

The practical change is that Dana no longer rebuffs a correct direct safety question because of a rapport threshold, and the family conversation preserves personal memory without treating private dialogue as shared knowledge. Completed-caption reading has an explicit pause, and real provider usage is visible without invented dollar figures.

## Findings and disposition

| Finding | Current disposition | Evidence and limit |
|---|---|---|
| F-1: Dana refuses a correct direct suicide question | Corrected in a labeled local draft | `sp-interview.local-dana.js` changes only `si_active`: minimum engine rapport threshold and no recent-flag blockers. Source gate, overlay identity/policy, spoken inventory, and live context are checked for drift. First-question, reassurance-after-good-rapport, judgment, and re-ask cases are covered. Follow-up depth gates and the canonical pack remain unchanged. |
| F-2: a participant forgets their private exchange | Corrected in role context; semantic disclosure remains a limitation to audition | Own completed private dialogue is retained with private labels; the other actor never receives it. Public requests omit unasked private fact inventory. No text is copied into shared room history. Public replies using private memory wait for complete output before speech or captions. A secondary four-token phrase guard blocks simple repeated disclosures, including number variants, but cannot prove absence of paraphrase, implication, or confirmation. |
| F-3: learner addressee omitted | Corrected | Each learner entry identifies the server-recorded addressee: Morgan, Maya, or both. Hearing a question to the other person is distinguished from being asked to answer it. |
| F-4: test runner omits two suites | Already corrected before this pass; reverified | The roster now covers every local SP suite, including encounter UI/rhythm and the new Dana overlay. The current full runner exits successfully. Earlier dated counts remain historical evidence, not a claim about every later edit. |
| F-5: completed dialogue unavailable through announcements | Corrected at the browser-contract level | Opt-in completed captions announce speaker and words once, then remain paused until Resume. Explicit transcript focus holds unfinished submission. Empty silence never submitted a turn; that part of the review was not reproduced because finalized nonempty words are required. Actual screen-reader and microphone audition is still needed. |
| F-6: caps without token accounting | Corrected for new process-local observations | Both health endpoints expose operations and actual allowlisted token usage with reporting coverage. Failed/uncertain work is not presumed free. Missing usage stays null; no historical spend reconstruction or dollar-cost claim. This is not a durable billing ledger. |
| F-7: reassurance detector misses ordinary wording | Recorded limitation; not broadened into an assessment | Flags are narrow lexical heuristics. The F-1 correction removes their ability to block the direct safety disclosure. Their absence does not certify good technique, and no fluency, empathy, or readiness grade was added. |

Dana's debrief now explicitly says that asking directly is appropriate and a guarded response does not make the question wrong. [NIMH guidance supports asking about suicide directly](https://www.nimh.nih.gov/health/publications/5-action-steps-to-help-someone-having-thoughts-of-suicide). Faculty review is still required for the exact local case behavior; no case attestation was changed.

The review's proposed door note, student task, chart requests, closing conversation, and attending presentation are already implemented and browser-tested. Patient perspectives are authored hypothetical teaching material, shown after the learner reflects on an exact quoted exchange; they are not generated claims about the patient's feelings. Floor requests remain based on completed public exchanges and do not create spontaneous paid replies or new clinical facts.

## Deliberate limits of the family correction

The review suggested allowing the actor to choose to disclose private content through a prompt sentence. That would make disclosure permission depend on unconstrained generation. This local version remembers the exchange but only acknowledges its occurrence or asks to clarify what may be discussed together. It has no operation that authorizes sharing a specific private statement yet.

Owner-only context routing is enforced in code. Output behavior is a separate problem: the lexical guard catches repeated phrases, not every possible secret. Full-response holding prevents a caught disclosure from escaping through the early spoken sentence. Cancellation, timeout, actor failure, and a blocked first participant stop the queued second participant and release only unused reservations. Abort-ignoring providers retain their active slot until they settle; late completion cannot restart speech.

## Verification

- Full SP runner: **515 node:test checks plus legacy direct suites passed**; includes preview reproducibility and the complete test-roster contract. `output/claude-review-sp-tests.log`.
- Root static suite: **1,776 passed**. `output/claude-review-root-tests.log`.
- Single-patient browser suite: **91 passed**, including prerecorded and live-mocked direct safety questions after negative history, visible local-draft labeling, and the debrief note. `output/claude-review-dana-browser.log`.
- Family browser suite: **44 passed** on desktop and Pixel 7. Includes completed-caption announcements, no transient microphone rearming, and keeping a partial draft unsent while reading either transcript even without caption-reading mode. `output/claude-review-family-browser.log`.
- Preview reproducibility and diff checks passed. Canonical pack, production proxy, and faculty review records have no diff. The updated family preview was inspected in the ordinary browser with the new caption preference visible, zero turns, and microphone off.

## Bounded live check and usage

`output/speech/claude-review-live-qa/report.json` records the final targeted four-turn sample: Dana's direct safety question first, Morgan's private drinking quantity, Morgan remembering the private exchange after rejoining, and Maya declining to invent a drinking quantity she does not know. All eight generated voice segments completed native browser playback. Morgan's public reply acknowledged the private conversation without repeating its details; Maya's reply contained no private quantity. Space-to-native-playing samples were 2.98–3.78 seconds. Recognition was synthetic and playback muted at 2x; this is not a microphone audition, subjective voice assessment, privacy proof, or service-level claim.

The first exploratory family attempt also completed Morgan's private reply and public acknowledgment, then failed at Maya's actor/provider stage in a both-person turn. The browser left the microphone off and showed recovery controls. Its cause is unclassified; the successful targeted follow-up is not a diagnosis or a fix for that failure. `first-attempt-report.json` and `first-attempt-family-error.png` retain the evidence. An initial QA-script mistake also tried Dana's Clear button before opening the finished controls; the Dana reply itself passed, and it was retained rather than paid for again.

Subsequent investigation reproduced a Maya failure and captured internal audience metadata in her spoken opening. The local validator rejected it. The [diagnosis and verification record](2026-09-06-sp-reply-diagnosis.md) documents the history correction, narrowly bounded label recovery, quote-fragment correction, safe diagnostics, and a completed real-provider private-to-both sequence. The earlier output was not retained, so its historical cause remains uncertain.

Across these isolated QA processes, the counters observed **7 actor attempts: 6 completed and 1 failed**, and **12 completed speech operations**. Reported actor usage totals **8,956 tokens across the 6 responses that supplied usage**. The failed actor attempt and all 12 binary speech responses supplied no token usage, so their token consumption and the total dollar cost remain unknown. `costUsd` is null. These are this pass's observations, not the cost of the entire project and not a reconstruction of earlier credit use.

The fresh review pages are served separately from earlier encounter tabs: Dana on port 4323 and family on port 4324. Standard launchers still use ports 4319 and 4320; restarting a launcher loads these same current worktree files. Existing encounter tabs were not cleared.

Tests use fictional authored content. Automated recognition and native-audio decoding do not certify actual microphone behavior, voice naturalness, screen-reader usability, or faculty approval. The older unclassified provider failure remains undiagnosed; a later passing run is not proof of its cause or repair.

## Next review

Next best step: a short human microphone and screen-reader audition, then faculty review of this exact local Dana variant and three family transcripts: an ordinary meeting, disagreement and repair, and private check-in followed by rejoin. Keep learner-site activation separate from this local review.

Innovative follow-up: a **what each person could know** replay. Show the learner's exact words alongside the public and own-private information available to the addressed person at that moment. Label it as a reconstruction of permitted context, not proof of what the person felt or understood. A later permissioned bridge could let the participant approve one exact statement for shared discussion while keeping the remaining private exchange separate.

No canonical pack, production proxy, faculty record, deployment, or learner release was changed. No messages were sent to Claude or faculty.
