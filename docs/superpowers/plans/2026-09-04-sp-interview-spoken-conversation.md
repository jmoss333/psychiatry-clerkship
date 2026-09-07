# SP Interview Spoken Conversation Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` after implementation is authorized. Work packages below are reviewable increments; complete their acceptance checks before proceeding.

**Goal:** Let a learner start an encounter once, talk naturally with the standardized patient, interrupt when needed, and finish with a useful formative debrief.

**Architecture:** Keep the existing patient actor and server-derived disclosure rules. Add automatic spoken turns, then stream authorized patient audio and introduce echo-safe interruption. Add live transcription only if measured latency, recognition quality, or browser compatibility requires it; a native speech-to-speech actor is a separate alternative.

**Tech stack:** Existing static HTML/React view, dependency-free JavaScript controller, browser media APIs, Node/Netlify proxy, existing actor, reviewed transcription and synthesis adapters.

**Spec:** The design contract in sections 2–5 below is self-contained. It proposes revising the interaction decisions in [the July managed-voice design](../specs/2026-07-14-interview-room-managed-voice-design.md); it does not claim those changes are approved or implemented.

**Status:** The user authorized the disabled Dana prototype and extra thinking time on September 4, 2026. That bounded milestone is now implemented in an isolated worktree based on `3e6ca0e`; the broader plan below remains proposed. [Local launch instructions and verification](../../../_prototypes/sp-interview/DANA_CONVERSATION.md) describe what can be tried today. Physical microphone behavior, hosted settings, paid provider performance, and account configuration remain untested. Nothing was deployed.

**Prototype scope decision:** Use browser recognition and synthetic playback around the canonical scripted Dana patient to demonstrate ten automatic turns without credentials or managed-voice activation. This deliberately precedes the proposed managed transcription/streaming work: it validates the turn controller and screen, not live patient quality or acoustic performance. The browser may transmit audio to its own recognition service. The normal learner page remains outside this local-only opt-in. Extra thinking time changes the silence threshold from 900 to 1,500 ms and never enters patient state or feedback. Full speech-triggered interruption, correction, captions controls, streaming, and live provider evaluation remain later work.

## 1. Recommendation and current evidence

In everyday terms: give the current patient a better set of ears and a smoother voice. The learner should experience a conversation; text can remain available for captions, correction, accessibility, and debrief.

| Approach | Result and tradeoff | Decision |
|---|---|---|
| Automatic turns plus streaming speech around the existing actor | Reuses the most existing work and keeps explicit control over patient words. Still has transcription and actor processing delays. | Recommended first release. |
| Native real-time speech-to-speech patient | Strong candidate for natural pacing and interruption; changes the patient-generation system and its disclosure enforcement. | Benchmark separately if the controlled approach misses the experience targets. |
| Improve browser dictation/read-aloud only | Smallest change, but inconsistent voices and repeated turn controls remain. | Retain as an explicitly selected fallback. |

This choice matches the distinction in [OpenAI's voice architecture guidance](https://developers.openai.com/api/docs/guides/voice-agents): a chained pipeline permits explicit control, while direct audio sessions target fluid conversation. The recommendation here is an engineering judgment based on this repository, not a measured provider comparison.

Current source explains the friction:

- `sp-interview.html:970` promises speech goes into an editable draft and never sends without **Say it**. The current interaction is Speak → Stop → transcription → review → Say it → patient response → audio.
- `sp-interview.voice.js:145,182,672,835` buffers the learner recording and patient audio. Playback starts after the entire audio response arrives.
- `sp-interview.voice.js:971` returns to ready after playback; it does not resume listening automatically.
- `sp-proxy/netlify/functions/sp.mjs:1217` returns a completed actor reply with a speech ticket. `sp-speech-ticket.mjs:237` binds that ticket to the exact authorized reply and encounter context.
- `sp-interview.pack.json:28,120,144` has managed speech disabled, an unselected stack, and pending privacy/voice-profile review. A reviewed case is not an approved voice deployment.
- `sp.mjs:284–335` derives state from individual learner text turns; punctuation and segmentation affect that state. Preserving the actor alone does not prove voice/text equivalence.

Source paths above are relative to `_prototypes/sp-interview/` unless a different directory is named. Backend shared modules live in `sp-proxy/netlify/functions/_shared/`.

## 2. Learner experience

1. Choose a reviewed case and **Start conversation**. Show a short disclosure explaining synthetic voice, microphone transmission, automatic sending, and the selected provider before requesting microphone access.
2. Keep the encounter screen quiet: patient name, **Listening / Patient responding / Paused**, microphone indicator, **Pause**, **End**, **Captions**, and **Use keyboard**. No mandatory composer interaction between ordinary turns.
3. Detect when the learner finishes speaking. Short pauses and unfinished sentences receive more time; a deliberate **Done speaking** control remains available. Silence alone never generates patient dialogue.
4. Play the patient response as audio arrives after its text is authorized. Automatically listen again after playback. A stable, reviewed synthetic voice belongs to each patient.
5. In the completed conversation mode, the learner can interrupt by speaking. Stop patient playback promptly and retain the beginning of the new utterance. **Stop patient** remains a reliable explicit control.
6. Finite-recording mode shows recording status followed by finalized captions. If live transcription is added, show provisional learner words separately from committed turns. **Correct last question** pauses the encounter; a correction replaces/recomputes the affected turn and invalidates a stale response rather than adding duplicate clinical credit.
7. **Pause**, page hiding, microphone loss, or connection loss stops capture/transmission and playback. Resuming requires a visible action. **End** releases all media, then follows the existing self-assessment → formative debrief sequence.
8. Speech failure preserves the encounter and offers **Retry voice** or **Use keyboard**. Do not silently change the actor to an offline patient or silently resume recording.

The first prototype uses automatic listening after playback and an explicit Stop control. It is an intermediate milestone: speech-triggered interruption remains required before calling the full experience complete.

### Deliberate changes from July

The July design requires manual review/send and prohibits recording during patient playback. This proposal retains those rules in the existing dictation mode, while introducing a distinct conversation mode with automatic sending and a separately tested interruption policy. The current request establishes the desired planning direction; it does not supply faculty attestation, privacy approval, or release evidence.

## 3. Conversation and clinical-state contract

Use one conversation controller, with media adapters underneath it. Reuse encounter/turn IDs, cancellation, stale-callback protection, and explicit provider errors already in the voice controller.

```text
Start → Listening → Finalizing learner utterance → Awaiting patient
      → Playing authorized speech → Listening

During playback: learner speech → Stop playback → Listening
Any active state: Pause / media failure → Paused
Any state: End → Ended
```

Microphone acquisition belongs to the encounter, not every individual question. Capture/transmission policy is explicit for each state. In the initial half-duplex prototype, capture is disabled during patient playback; the interruption package changes this to tested echo-controlled capture.

### Turn records

Maintain these distinctions in transient encounter memory:

```text
LearnerTurn:
  encounterId, turnId, revision, finalText, inputMode

PatientTurn:
  encounterId, turnId, authorizedText, ticket,
  playbackStatus [not_started | playing | completed | interrupted | failed],
  playedThroughMs, presentedText, deliveredText [string | null]
```

Provisional recognition is for captions only. One finalized utterance invokes the actor once. Deduplicate by encounter, turn, and revision; repeated callbacks and network retries must not produce duplicate turns or provider charges.

If the learner resumes speaking during finalization, actor waiting, or audio buffering before any patient audio starts, retain the new speech with a bounded 300 ms local pre-roll. Cancel/invalidate the pending response, append the continuation in its original order, and re-finalize the same learner turn with an incremented revision. Only the latest revision enters active dialogue/state; any already-incurred provider charge remains accounted for. If capture or transcription fails, pause and offer correction rather than answer the truncated question. Test a clinically meaningful negation arriving after the original endpoint and a late actor response arriving after that continuation.

`playedThroughMs` is an application observation, not proof that someone heard or understood the words. Do not infer a word boundary by multiplying audio time by text length. Use verified speech alignment where available; otherwise set `deliveredText=null` and label the reply interrupted/uncertain. Preserve generated text separately for debugging the synthetic case without treating its unplayed tail as delivered.

The proxy must validate the new transcript shape and continue deriving disclosure permission on the server. Playback reports from a browser cannot unlock information or certify learning. Actor context and formative debrief must be interruption-aware: do not claim the learner received or followed up information that was never presented. With verified alignment, include only the delivered prefix in ordinary conversational history. Without alignment, exclude the entire interrupted patient reply from that history, insert a neutral interruption marker, and offer **Repeat patient**; retain the authorized full text separately for ticket validation. This conservative fallback may repeat something the learner already heard, but cannot imply the unplayed tail was delivered. The debrief labels delivery uncertain and makes no negative judgment based on that missing evidence.

Test final speech-derived questions, including punctuation variation, against the expected case behavior. Existing regex coverage is not a measure of competence; voice work must not strengthen that claim. Any new false pass or premature disclosure caused by segmentation blocks promotion of the affected mode.

## 4. Transport, speech quality, and cost

### First: remove interaction friction using current routes

Implement local voice activity detection to finish a bounded recording automatically and re-arm after playback. Keep the existing `/api/sp/voice?op=transcribe` and `/api/sp` contracts for this prototype. Use a configurable pause threshold, initially 900 ms for normal pauses and a longer 1,500 ms setting for learners who want more thinking time. These are tuning starting points, not validated clinical timings.

Pure silence detection cannot reliably recognize an unfinished thought. Test fillers, self-corrections, and mid-sentence pauses; keep a manual hold/done control. Promote live transcription plus a supported turn detector if the local detector cannot meet the interruption/false-endpoint targets.

### Second: stream already-authorized patient speech

Keep complete actor-text authorization and the existing full-reply ticket. Change the synthesis adapter, proxy response, and browser player so audio starts before the full audio file downloads. Do not stream raw actor tokens to the learner before disclosure filtering or speak unsanitized stage directions.

Use one synthesis operation per reply, bounded incremental decoding/playback, and server-enforced byte/deadline limits. Cancellation must stop queued audio immediately, abort upstream work where possible, and settle cost conservatively even if the provider already incurred the charge. Do not split every sentence into a separately billed request as the default implementation.

[OpenAI's speech endpoint supports streaming output](https://developers.openai.com/api/docs/guides/text-to-speech). Audition a current low-latency speech model against the repository's existing candidate stack; pin the selected model and stock voice only after review. Provider marketing about speed is not a latency result for this app.

The proxy uses Netlify's Request/Response function style. Its [current API documentation](https://docs.netlify.com/build/functions/api/) describes streamed `Response` bodies with a 60-second execution limit and 20 MB ceiling. Retain the application's stricter bounds and prove deployed first-byte streaming with a canary. A function invocation is not an encounter-long WebSocket host.

### Third, only if measurement justifies it: live transcription

Replace whole-recording uploads with live transcription while retaining the same finalized-turn interface. [OpenAI documents transcription-only sessions with partial and completed transcript events](https://developers.openai.com/api/docs/guides/realtime-transcription), and [recommends WebRTC for browser realtime connections](https://developers.openai.com/api/docs/guides/realtime-webrtc).

Before selecting that transport, prove server-enforced duration, concurrency, spend reservation, termination, and privacy controls for the exact model/account. A short-lived connection credential does not itself cap the lifetime or cost of a connected session. If these controls require a persistent relay or sideband service, produce a separate deployment/cost decision before adding infrastructure. Keep the finite-upload implementation usable until that decision passes.

Do not assume semantic turn detection is available for every transcription model. [VAD support and settings depend on the session/model](https://developers.openai.com/api/docs/guides/realtime-vad). Choose the detector from verified capability and performance results.

### Budget and privacy

- Preserve the current shared $16 boundary for new managed-voice reservations and $20 hard rotation cap for paid operations, as documented in `sp-proxy/README.md:243`. Recalculate projected usage with a current rate card, including retries, interruptions, evaluation, and existing canary use. The July cost estimate is not current evidence.
- At 96 encounters, $20 permits only about $0.21 per encounter on average for all covered operations; speech has less available because of the $16 reserve boundary. Report cost per completed encounter and projected block use before asking to change the budget.
- Keep provider credentials server-side, preserve the current learner-passcode policy, and retain atomic operation identities. Add session reservation/renewal only if live transcription is selected.
- Audio remains bounded and transient. Do not persist learner audio or transcript content in browser storage, analytics, logs, crash reports, or session-replay products. Existing explicitly requested text export can remain.
- Automatic sending means an editable draft is no longer a review checkpoint. Live transcription would send audio before a local text warning can run. Explain this in consent; use synthetic cases only; never describe a PHI heuristic as prevention or promise provider zero retention without verified account evidence.

## 5. Definition of smooth enough to pilot

These are proposed acceptance targets, not measurements or guarantees. Measure at least 100 ordinary turns across the three synthetic cases, report median and 95th percentile, and separate warm/cold start and device/network conditions.

| Measure | Proposed target |
|---|---|
| Per-turn button presses after Start | Zero for ordinary conversation |
| End of learner speech to first audible patient response | Median ≤2 seconds; 95th percentile ≤3.5 seconds, including turn detection |
| Speech-triggered interruption | Playback stops within 250 ms of confirmed learner speech; also report raw speech-onset latency |
| Return to listening after patient finishes | Within 300 ms |
| Premature end-of-turn events | Fewer than 5 per 100 turns; no lost negation or clinically material remainder in the acceptance set |
| Duplicate committed turns / echo submitted as learner text | Zero in the scripted acceptance set |
| End or Pause | Capture/transmission and playback stop immediately; all late events ignored |
| Disclosure and debrief fidelity | No new premature disclosure, duplicate credit, or assumption that an interrupted tail was delivered |

Latency events record durations and failure codes only: speech end, turn commit, transcription complete, actor complete, first audio byte, first audible sample, playback stop. Do not log transcript text or patient facts. Deliberately selected extra thinking time must be reported separately so it is not mislabeled as provider lag.

Real-device checks cover Chrome and Edge on Windows/macOS, Safari on macOS/iPhone, and Android Chrome, with headphones and loudspeakers. Include VoiceOver/NVDA keyboard paths, caption readability, microphone denial, autoplay restrictions, Bluetooth changes, background/resume, poor Wi-Fi, and campus-network access. The current managed upload path accepts bounded WAV/Ogg/WebM, not MP4. Start the prototype on verified Chrome/Edge devices; Safari/iPhone is a compatibility target, not established support. Negotiate the actual recording format and either provide a tested capture/transcription path or label voice unavailable with an explicit keyboard/manual option. A browser mock cannot establish acoustic reliability.

## 6. Implementation work packages

Each package starts with the named failing behavior tests, implements the smallest change, and reruns the affected suites. Commit only the scoped files in an isolated worktree when implementation is authorized; preserve existing unrelated plans and concurrent work.

### Task 1 — Capture the baseline and define turn semantics

**Files:** new `_prototypes/sp-interview/tests/conversation-state.test.mjs`; extend `tests/parity.test.mjs` in that directory; new `sp-proxy/tests/sp-spoken-turns.test.mjs`; this plan for measured results.

- [ ] Add synthetic cases for partial→final→duplicate-final, punctuation variation, negation, a mid-question pause, correction, and interrupted patient replies.
- [ ] Establish current state results from both MockProvider and server. Record pre-existing mismatches separately; define faculty-reviewed expected behavior for speech-specific differences.
- [ ] Define revision replacement and interruption handling in client and server contract tests before media changes.
- [ ] Measure the current pipeline with content-free timing. Use an explicitly authorized provider audition for actual audio/latency evidence; fake providers prove lifecycle behavior only.

**Deliverable:** reproducible baseline, expected speech-turn behavior, and an agreed acceptance set. Estimated engineering effort: 1–2 days.

### Task 2 — One-case hands-free prototype

**Files:** modify `_prototypes/sp-interview/sp-interview.voice.js` and `sp-interview.html`; create `sp-interview.turns.js` for turn detection; add the new asset to `site_manifest.json` sidecars; update `generate-preview.mjs` as needed and regenerate the preview.

- [ ] Add an explicit `dictation` versus `conversation` interaction policy. Preserve old no-auto-send tests under dictation mode.
- [ ] Implement automatic bounded turn completion, once-only submission, automatic re-arming, persistent microphone lifecycle, Pause/End, and accessible status controls.
- [ ] Start with Dana, local fake providers, then an authorized synthetic live audition. Keep conversation mode disabled in learner release configuration.
- [ ] Verify ten consecutive turns without touching the composer, plus speech resuming while the actor is pending, end-during-transcription, duplicate callbacks, no microphone, lost connection, and case change.

**Deliverable:** tangible spoken encounter through existing patient logic, with an explicit Stop button. Estimated effort: 2–3 days.

### Task 3 — Stream patient audio and select its voice

**Files:** `sp-proxy/netlify/functions/_shared/sp-speech-provider.mjs`, `sp-voice.mjs`, relevant `sp-budget.mjs` cancellation paths; client `sp-interview.voice.js`; new `sp-interview.audio.js`; sidecar/preview registration; new `sp-proxy/tests/sp-voice-stream.test.mjs` and client `tests/streaming-audio.test.mjs`.

- [ ] With a two-chunk fake audio response, require first playback before the second chunk arrives. Test invalid-ticket rejection before provider work, byte/time limits, upstream cancellation, and disconnect accounting.
- [ ] Replace provider/proxy/client whole-audio buffering while preserving full-reply authorization and one billed operation. Pin and test the incremental audio format/decoder on the supported browsers.
- [ ] Audition voice consistency, intelligibility, pronunciation, first-audio delay, and cost using existing synthetic case wording. Keep stage directions visual and use stock voices.
- [ ] Verify deployed streaming behavior before any claim about speed. Recalculate full-block spend.

**Deliverable:** authorized patient speech starts during synthesis. Estimated effort: 2–3 days, excluding voice review.

### Task 4 — Reliable interruption and transcript correction

**Files:** client controller/turn detector/audio player; `sp.mjs` transcript validation, context construction and evaluation input; new `sp-proxy/tests/sp-playback-context.test.mjs`; existing parity and voice suites; `sp-proxy/REDTEAM_CHECKLIST.md`.

- [ ] Test learner interruption mid-sentence and mid-disclosure; loudspeaker echo; coughs/backchannels; preserved initial words; stale synthesis completion; two interruptions in succession.
- [ ] Implement echo-controlled detection, immediate playback cancellation, and the turn records in section 3. Do not add rapport or grading penalties for speech timing.
- [ ] Implement paused correction by turn revision and state recomputation. A late reply from the superseded revision cannot play or enter the current transcript.
- [ ] Update the old no-overlap red-team rule to describe tested interruption behavior, while retaining it for dictation/half-duplex fallback. Human acoustic tests must pass before enabling this mode.

**Deliverable:** the full conversation loop supports interruption without losing dialogue or changing disclosure rules accidentally. Estimated effort: 2–4 days.

### Task 5 — Conditional input-streaming decision

**Files if selected:** new client `sp-interview.transcription.js` and tests; new proxy session route; `_shared/sp-http.mjs`, `sp-budget.mjs`, governance and deployment tests; `build_deploy.py` CSP; sidecars and preview generator.

- [ ] Compare the measured latency breakdown, endpoint errors, and capture-format compatibility against section 5. Skip this package if finite recordings meet the targets on the intended voice-supported devices.
- [ ] If input delay, pause handling, or recording-format compatibility remains a blocker, run a bounded transcription-only WebRTC feasibility audition with a server-created session and pinned model configuration.
- [ ] Demonstrate duration/cost enforcement and browser compatibility. Permit only exact required CSP origins; retain no broad wildcard or browser-held permanent secret.
- [ ] Approve a concrete persistent-service design separately if server control cannot be achieved with the selected provider and existing hosting. Do not present an initialization endpoint as a complete lifecycle solution.

**Deliverable:** either documented evidence that live transcription is unnecessary, or a separately reviewed, tested replacement adapter. Additional effort depends on the demonstrated hosting/control requirements.

### Task 6 — Pilot, release evidence, and rollback

**Files:** `sp-interview.pack.json`; `_shared/sp-governance.mjs` and related tests as contracts change; `_prototypes/sp-interview/release-passport.mjs`; `tests/run-all.sh`; `tests/smoke/interview-room.spec.js`; proxy README/red-team checklist; generated preview.

- [ ] Run the complete synthetic acceptance set for Dana, Marcus, and Ray. Obtain faculty review of each voice/cadence and speech-derived clinical behavior; verify exact provider/account privacy controls and updated consent.
- [ ] Have faculty and 2–3 learners pilot supported devices. Collect structured ratings of response delay, premature interruptions, comprehensibility, and preference without recording their audio.
- [ ] Record exact client/pack/proxy versions, model/voice pins, cost evidence, and the applicable release passport. Do not set pending review fields to reviewed without the corresponding human decision.
- [ ] Run the gates below and the hosted red-team checklist after deployment/model/pack changes. Public health reachability does not exercise voice.
- [ ] Verify a server capability switch can disable conversation mode, stop/reject further voice work, and preserve explicit keyboard continuation. Keep the old dictation route for rollback.

**Deliverable:** evidence-backed decision to release or retain the pilot. Estimated engineering effort: 1–2 days plus faculty, privacy, and learner availability.

## 7. Verification commands and integration

Run targeted tests during each package. Before release, run the full local gate, which already covers the SP suites and site builds:

```bash
bash _prototypes/sp-interview/tests/run-all.sh
npm --prefix sp-proxy test
bash bin/verify.sh
```

For the dedicated browser flow, after preparing dependencies in `tests/smoke`:

```bash
npx playwright test interview-room.spec.js --project=interview-room
```

Register new client tests in `run-all.sh`; proxy `*.test.mjs` files use its existing glob. Build MS3 and resident output sequentially. Use the existing Ubuntu workflow for visual baselines. Add new script assets to the manifest sidecars and generated preview rather than manually editing generated output. If CI inventory changes, update verify coverage and the scheduled-workflow digest using the validator's own canonicalization.

## 8. Next decision and an optional extension

**Concrete next step:** implement Tasks 1–2 as a disabled one-case Dana prototype. Demonstrate Start → speak → patient answers → speak again, and show measured delay. This is the smallest useful way to decide which audio work is worth doing next. The core path is approximately 10–16 engineering days before optional live-transcription work; review and pilot scheduling are separate.

**If the controlled pipeline still misses the target:** compare a native realtime patient on the same synthetic benchmark. Keep locked facts out of its initial context; require trusted disclosure control before speech, reliable interruption history, and hard session spending limits. A prompt instructing the model to obey gates is insufficient. [Realtime sideband controls](https://developers.openai.com/api/docs/guides/realtime-server-controls) offer server participation, but do not by themselves prove those guarantees.

**Innovative extension:** a learner-selectable **Give me more thinking time** setting plus faculty-reviewed patient pacing profiles. It changes pause tolerance and delivery within the existing case's approved persona, without inferring emotion, changing facts, or grading accent, fluency, or speaking speed. Keep it outside the first prototype until basic turn-taking is reliable.
