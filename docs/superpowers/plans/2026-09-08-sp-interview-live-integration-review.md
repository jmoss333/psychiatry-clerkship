# Spoken Interview Room: review and protected pilot integration

Reviewed September 8, 2026 against main `4a5d4bb`, including the three user-supplied physical-microphone conversation PDFs. Work is isolated on `codex/sp-live-integration`.

## Findings and changes

The samples contain 13 learner submissions across Dana, Marcus, and Ray, 15 patient replies marked voice completed, and one partially played Dana reply. Introductions, empathy, and follow-up questions now produce contextual replies rather than repeated clarification loops. Marcus maintains reduced need for sleep and his distinct hurried style. Dana's apparent repetition follows interrupted playback, so the PDF alone does not establish a memory defect.

Two material issues were corrected:

1. After resuming speech near the end of a pause, `speechend` could reuse an expired earlier deadline and submit before a delayed final transcription arrived. The quiet period now restarts at the latest speech ending; 4.5-second normal and 8-second reflective pauses, Hold, and Space remain available. Independent counterexample and real-controller regression tests fail before the fix and pass afterward.
2. Ray inferred a lifetime absence of earlier episodes and invented prior conversations from a case that establishes only the current six-week course and no prior psychiatrist visit. Explicit information limits now preserve those unknowns. Final live probes answered with uncertainty and current known facts. Prompt tests alone do not establish model adherence.

Residual Dana-specific failure/fallback labels were made patient-neutral. The server and hosted QA accept an access phrase of at least 15 characters; boundary tests use a dummy phrase. The requested live credential is configured only in the server environment and is absent from source and URLs.

Independent checks reconfirmed the earlier repairs: unheard audio stays out of retry history, interim speech is not silently submitted, Clear removes station notes, case identity and voices match, Ray's visual staging is not spoken, and the station renders under the deployed CSP.

## Response time

Measured real OpenAI actor and TTS requests from this machine, alternating treatment order within each pair. These are small experiments, not a latency guarantee, and exclude the learner's deliberate quiet period and hosted browser/network overhead.

| Experiment | Samples per setting | Baseline median / slowest first audio | Candidate median / slowest | Decision |
| --- | ---: | --- | --- | --- |
| Same pinned model, reasoning `low` vs `none` | 6 | 3.409 / 4.674 s | 3.025 / 4.272 s | Keep `low`: mixed individual results and less consistent phrasing. Explicit constructor option retained for repeatable experiments. |
| Same model with a short substantive first sentence | 4 | 2.738 / 3.334 s | 1.930 / 2.178 s | Apply pacing instruction: about 30% lower median in this sample. |

The pacing instruction asks for a short meaningful first sentence, followed by relevant detail, with required disclosures taking priority. It does not add filler, truncate responses, accelerate the voice, shorten reflective pauses, or release speculative audio before the complete actor reply validates. Text and lead speech generation already overlap correctly; the remaining reply's speech does not block ready lead audio. Marcus favors focused answers near the shorter end of his canonical 2–6-sentence style.

## Main-site integration

The existing `/tools/sp-interview.html` page gains a prominent **Start a spoken interview** card linking to `https://interview-room-faculty-preview.netlify.app`. It opens the same top-level tab, including from the library's tool iframe. The three-case room retains its own microphone permissions, CSP, server-side credentials, case-bound receipts, no-browser-storage behavior, and cancellation semantics. The existing typed/offline Interview Room remains available.

This is a protected pilot, with a shared allowance of 120 operation units per deployment and 72 per rolling half-hour. Each full ten-question encounter uses 31 units. This supports roughly three complete encounters before verification or failed attempts, not unrestricted class-wide use. Capacity should be deliberately selected before broader student distribution; deployment is not a budget-reset mechanism.

Morgan and family encounters are outside this release. No case facts, gate requirements, faculty attestation, or canonical managed-voice activation flags were changed.

## Verification and limits

- Full `bash bin/verify.sh` passed, including sequential MS3 and resident build/QA gates. An initial stale generated-preview failure was corrected by running its canonical generator.
- Hosted preview node suite: 163 tests passed. Context/encounter-context suite: 38 tests passed. Original Interview Room browser suite: 25 journeys passed; new entry navigation and mobile rendering checked.
- Eight final live actor probes covered Ray's unspecified history/conversations, prompt injection, medication/dose advice, Dana's direct safety disclosure and detailed-method pressure, and locked Marcus/Ray disclosure paths. Replies remained within the tested boundaries. This is not a full clinical attestation or a completed legacy red-team sign-off.
- Physical-microphone evidence is the user's three tested sessions. PDFs do not establish response latency, ten uninterrupted spoken turns per case, or broad learner readiness.
- Deployment and hosted acceptance receipts are recorded separately after verification. A green build alone is not evidence that the live link and password work.

Next useful step: a small supervised pilot through sensitive follow-ups, an interruption, and a corrected closing summary for each patient, with content-free timing measurements and a defined capacity allowance.

Potential innovation: an optional faculty review strip showing exactly which audio segments were heard at an interrupted moment, so sensible conversational repair is distinguishable from repetition.
