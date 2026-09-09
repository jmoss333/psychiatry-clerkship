# Practice a Moment — implementation evidence

September 9, 2026. All three fictional moments remain **faculty-review drafts**. This is an engineering implementation record, not clinical approval or evidence of learner competence.

Students can choose a full encounter or a short moment with Elena, Priya or Luis. Moments allow up to four responses, private reflection, one explicitly requested evidence-linked review, and one terminal spoken alternative. Priya has a separate optional team formulation submitted only to review. Transfers require a fresh Start and carry no dialogue or reflection.

## Evidence and publication state

The isolated branch started from `f533e2c` (current main at task start), containing PR582 merge `71f6ac8a8bb74f6e544255d3f3068d1c305c4086`. The collision sentinel reported SAFE for `sp-preview` and the hosted browser spec with complete local/GitHub evidence. Root CI/maintenance edits were preserved.

Existing baseline: 198 preview tests passed. The first root run encountered unmaterialized LFS media; 106 objects already cached locally were checked out without a download. The full repository gate subsequently passed, including both sequential audience builds. During implementation, runs that overlapped unfinished modules are not counted as a clean baseline.

Automated verification includes the full preview suite, the hosted-preview Playwright project with real CSP/layout and synthetic speech/audio, and `bash bin/verify.sh`. The full smoke project's visual-baseline/nav/faculty checks are separate CI evidence. Local logs and screenshots live only in ignored `output/practice-moment/`.

Independent protocol review found no blocking server defect and exercised two-segment 19-unit accounting, failed requests across midnight, competing continuations, two encryptions of a closed nonce, malformed/no-spend review inputs, 340/680 exhaustion, and cancellation. Those eight probes are tracked in `moments-protocol-adversarial.test.mjs`.

Independent educational review inspected 39 authored challenges plus two paired variants, 58 expected findings. These demonstrate the expected examples are structurally representable and their quotations attributable. **They are not 39 successful live AI evaluations.** Four intentionally incorrect interpretations can still have valid exact quotations: an accurate first account labeled an uncorrected mistake; an actor invention attributed to the learner; an accepted pause labeled an unanswered opportunity; and a yes/no acknowledgment called demonstrated understanding. Semantic interpretation remains a model hypothesis requiring faculty challenge review.

Review fixes: P08's unsupported narrowing is now withheld instead of being mislabeled as effect/causation. The current approved template set has no specific narrowing observation. P11 retains independently supported invitation wording and marks unclarified history not assessable; no new Priya boundary rubric was invented. Permanent tests now include both paired variants.

No paid provider run, physical microphone audition, production publication, merge, learner-site promotion, or faculty attestation occurred in this implementation task. Netlify's saved CLI session initially reported expired; authenticated staging publication and its new non-secret flag require restored access. A public asset build or local fixture response does not prove a working deployed provider.

## Requirement audit

| ID | Implementation and evidence | Remaining external evidence |
|---|---|---|
| R01 | Three draft cards, two format choices; catalog/projection and real browser tests. | Faculty acceptance of content. |
| R02 | Server four-response cap; automatic 4.5/8-second controller, Space/Hold/typing; all five ten-turn full cases retained. | Native physical microphone and timing audition. |
| R03 | Immutable versioned facts, separately attributed setup, actor directions confirm accurate first attempts; contexts/challenge fixtures. | Actual actor fidelity and faculty semantic judgment. |
| R04 | Reflection text confined to station DOM; capture stopped before opening; focus/Space/Escape and network/storage canaries. | Human microphone check in a real environment. |
| R05 | Optional Priya formulation uses distinct capture destination, editable local draft and explicit Review; never actor/TTS. | Faculty review of actual spoken summary flow. |
| R06 | Finalized heard sources, exact quote/source/role/order validation, strict provider output and client DTO; one closed review receipt. | Correctness of AI interpretation. |
| R07 | Four permitted statuses, authored templates and uncertainty; no trait/competence/fluency scoring. | Faculty feedback review; P08 template gap remains explicit. |
| R08 | One terminal alternative from authenticated heard prefix, original review retained; controller/browser/CAS tests. | Sample real spoken alternative. |
| R09 | Exact bodies, AAD mode/scenario/content/deploy binding; start and continuation identities shared with existing endpoint. | Hosted endpoint/routing verification. |
| R10 | Existing budget file unchanged; schema v2/key/namespace and 20 starts/680 daily/340 rolling unchanged; 19-unit maximum tested. | Read-only same-ledger before/after aggregate for authorized paid audition. |
| R11 | Clear/disposal abort work, erase runtime and station fields, suppress late results; unknown outcomes not retried. | Hosted cancellation sampling. |
| R12 | Exact public projection and seven-asset build; no facts/rubrics/directions in public assets; CSP unchanged. | Served asset hashes and deployed function bundle. |
| R13 | Complete Luis and opt-in next situations; RAM-only visited IDs; teardown then fresh Start. | Faculty usability assessment; no claim of measured learning transfer. |
| R14 | Existing full-case tests, desktop/mobile/keyboard/CSP journeys, explicit mock/provider distinction. | Exact-head CI, real-provider audition and physical microphone. |
| R15 | Reviewable commits, source, faculty packet and bounded audition script prepared. | Draft PR/CI and authenticated staging evidence recorded in task receipt; final owner release decision. |

## Bounded provider audition

`qa/moments-audition.mjs` is never run by tests or CI. It refuses execution without `DANA_QA_MODE=moments`, `DANA_QA_URL` pointing to the assigned protected site/preview, and `DANA_QA_ACCESS_FILE` pointing to existing authorized local access. Do not paste the passcode in chat. It uses three starts, four turns and one review per scenario, plus one Elena alternative: at most 51 conservative operation units. Provider ceilings are 13 actor replies, three evaluators and 29 TTS segments. Failures or uncertain requests are never repeated. Audio is decoded with a real browser; recognition is synthetic. The script reports operation units, not dollars. No supported actual cost figure is available.

Before and after any authorized run, inspect only numeric aggregate usage in the existing shared ledger; preserve its namespace, key, charges and entries. If capacity is exhausted, stop. Never substitute another namespace. Native-microphone faculty audition is separate and consumes additional normal budget.

## Faculty audition record

Reviewer: **unreviewed**. Date/device/browser: **not supplied**. Source/content revision: record the exact PR head and deployment ID being auditioned. All definitions are schema version 1, revision 1; receipt binding additionally hashes the whole authored definition.

Review the companion cases/specification, the 39 challenge expectations and both paired variants, including actor-first invented medication history and yes/no versus later teach-back. Listen for accurate first-attempt confirmation, respectful stopping, fixed-fact fidelity, no forced warmth, and faithful attribution. Inspect actual generated review quotations and uncertainty; do not approve from fixture counts alone.

Physical microphone checklist: four turns without composer interaction; long pause with thinking time; Space to finish; Hold; reflection preventing capture; explicit local summary recording and edit; spoken alternative; mobile controls; Clear during response/review. Record native recognition, device and browser. No item is marked passed by synthetic recognition.

Next best check: restore authenticated staging, verify served hashes/routing/flag/no-spend refusal, then authorize the exact three-start provider audition. A future idea is a faculty-authored comparison of two equally appropriate responses, aimed at testing feedback restraint without creating a score.
