# The Interview Room Managed Voice and Smoother Encounter — design

**Date:** 2026-07-14<br>
**Author:** Joshua Moss, MD (with Codex)<br>
**Canonical repository:** `jmoss333/psychiatry-clerkship`<br>
**Primary audience:** third-year medical students on the six-week psychiatry clerkship<br>
**Baseline:** `main` at `09ae3d3`<br>
**Status:** approved design, pending written-spec review and implementation plan<br>
**Budget:** target no more than $20 in total actor-and-voice API spend per eight-student rotation block

## Purpose

Make The Interview Room feel like a coherent spoken encounter while preserving the governed clinical
behavior that already exists. The deterministic rapport and disclosure gates, attestable case pack,
live actor, self-assessment, and formative debrief remain authoritative. Managed speech becomes a
replaceable input/output layer around that engine; it does not become a second patient brain.

In plain language: the current system still decides **what** the patient says. This design gives it a
better-controlled set of ears and a voice, with text remaining the record if audio is unavailable.

## Current state and problem

The July 14 redesign added opt-in browser speech recognition, device text-to-speech, and a separate
timer that reveals patient text at a persona-derived pace. That proves the interaction concept, but
the browser layer is not yet a reliable learner-facing voice system:

1. Microphone capture, actor requests, timed text, and speech playback do not share one lifecycle.
   Turning voice off changes React state but does not explicitly stop an active recognizer.
2. The microphone can be started while a live reply is pending. When that reply returns, patient
   speech can begin while recognition is still active, allowing the patient voice to be captured as
   learner input.
3. Device voice selection is implicit, so the same patient can sound materially different across
   browsers and operating systems.
4. Text timing and actual speech timing run independently. The visual patient can finish before or
   after the audible patient.
5. Recognition errors are silent, late callbacks are not guarded by encounter/turn identity, and
   actor requests have no client timeout or abort lifecycle.
6. Live-provider errors are converted indiscriminately into an offline patient response. A failed
   passcode, exhausted quota, and server outage can therefore look like a normal clinical turn.
7. The existing SP suite validates case behavior, gate parity, tab-scoped credentials, and locked
   content. It does not validate microphone, playback, cancellation, permissions, latency, or
   accessibility behavior, and it is not invoked by repository CI.
8. Dana's smoke harness prints assertion failures without consistently returning a failing process
   status. A visible `FAIL` can therefore coexist with an apparently successful suite.
9. Governance sources currently disagree: the redesigned HTML is marked pending faculty review,
   while `reviewed.json` still marks `sp-interview.html` reviewed. The pack is top-level `attested`
   even though Marcus and Ray are case-level drafts, and the case selector does not filter them.

The existing engine tests passed at the baseline commit. That establishes a clean behavioral
starting point; it does not validate voice.

## Goals

1. Give each reviewed standardized patient a consistent, faculty-approved acoustic identity.
2. Enforce one-direction audio: the learner microphone and patient playback are never active at the
   same time.
3. Let learners dictate, review, edit, and explicitly send their words; never auto-send speech.
4. Keep the complete patient reply visible as the authoritative transcript.
5. Continue safely in text whenever microphone, transcription, speech generation, playback, or
   budget controls fail.
6. Keep all provider credentials server-side and retain no audio or transcript content in logs.
7. Meet a planned ceiling of $20 per eight-student rotation block for the existing actor plus managed
   speech under the documented 96-encounter high-use estimate.
8. Make voice behavior deterministic enough to test, pilot, attest, and roll back independently.
9. Prevent draft clinical cases from reaching the student-facing selector and prevent draft speech
   engines or voice profiles from enabling managed voice.

## Non-goals

- Replacing the current Anthropic actor with an end-to-end realtime speech model.
- Changing case facts, rapport rules, gated disclosures, rubrics, debrief teaching points, or
  clinical evidence.
- Grading learners, adding aggregate scores, or using acoustic features to infer empathy,
  competence, emotion, diagnosis, or identity.
- Automatically scoring interruption, response latency, accent, fluency, or speaking style.
- Recording, storing, or replaying learner microphone audio after transcription completes.
- Cloning a patient, faculty member, actor, celebrity, or other identifiable real person's voice.
- Guaranteeing managed speech after the configured rotation budget has been consumed.
- Building a permanent multi-provider marketplace. The audition selects one production provider;
  the interface exists for testing and safe replacement, not for learner choice.

## Approaches considered

### 1. Managed speech around the existing text engine — selected

The learner's audio is transcribed into an editable draft. The existing deterministic/director and
actor flow produces text. A separate server endpoint renders that exact, signed text through one
reviewed synthetic voice. This provides consistent speech without changing the clinical brain.

Estimated incremental speech cost is approximately $0.06–$0.28 per completed encounter depending
on the provider selected in the audition. The budget baseline is OpenAI `tts-1-hd` plus
`whisper-1`; ElevenLabs Eleven v3 (`eleven_v3`) plus Scribe v2 is the higher-expression challenger.

For the agreed 96-encounter high-use block, the planning envelope is:

| Path | Speech increment | Expected actor-plus-speech total | Decision |
|---|---:|---:|---|
| Text/device speech | $0 | approximately $3–$8 | Permanent no-added-speech-cost path |
| OpenAI managed baseline | approximately $6–$10 | approximately $9–$18 | Target if it passes the audition |
| ElevenLabs challenger | Measured from the audition | Must still be at most $20 | Reject if quality-adjusted usage exceeds the cap |

These are planning estimates, not quoted future prices; the versioned rate card and measured pilot
usage control release.

### 2. Harden browser speech only

This adds a shared state machine, explicit voice selection, error messages, and tests but keeps Web
Speech recognition and device synthesis. It adds no API cost and remains the fallback. It cannot
make patient identity or recognition behavior consistent across supported devices.

### 3. Replace the encounter with a realtime speech-to-speech agent

This offers the most fluid turn-taking and future barge-in support. It also replaces or duplicates
the governed patient actor, creates a substantially larger prompt/gate integration surface, and
requires full clinical and safety revalidation. It is explicitly deferred.

## Decisions locked with the user

1. Use the managed-speech wrapper approach.
2. Preserve the existing actor and deterministic gate engine as the only patient brain.
3. Target no more than $20 total actor-and-voice spend per eight-student rotation block.
4. Text remains the authoritative, downloadable record.
5. Dictation always lands in the editable composer and never sends automatically.
6. One controller owns microphone, transcription, actor waiting, and patient playback.
7. Patient audio and learner recording never overlap.
8. Every patient reply has Stop and Replay controls while its in-memory audio remains available.
9. Full patient text appears when the response arrives; no independent typewriter clock remains.
10. Managed speech failure never destroys or delays access to the text response.
11. Device speech and text-only mode remain explicit fallbacks.
12. Voice profiles are faculty-reviewed, provider/model/voice pinned, and versioned.
13. Only stock synthetic voices may ship.
14. A blind Dana/Marcus/Ray audition selects the production transcription-and-synthesis stack before
    integration is enabled.
15. Pending clinical cases do not appear in the student-facing selector; pending speech engines or
    voice profiles disable managed voice without blocking a reviewed case's text/device path.
16. Respectful interruption tracking is a future experiment, not part of this release.

## Architecture

### 1. Client voice controller

Move audio lifecycle logic out of the React view into one dependency-free controller loaded by both
the canonical and preview pages. The UI renders controller state and invokes its public methods; it
does not call microphone, transcription, timers, or audio playback independently.

The state set is:

```text
ready
  -> listening
  -> transcribing
  -> ready (editable transcript)
  -> awaiting_patient
  -> buffering_audio
  -> speaking
  -> ready

Any active state -> error -> ready
Any active state -> ended
```

Rules:

- `startListening()` first stops and releases patient playback.
- `send()` first stops recording, freezes the reviewed text, and creates a monotonically increasing
  turn identifier.
- `Voice off`, `End encounter`, case change, difficulty change, and page teardown call `cancelAll()`.
- Every asynchronous callback carries `encounterId` and `turnId`; callbacks for an inactive pair are
  ignored.
- At most one `MediaRecorder`, actor request, transcription request, speech request, and audio player
  is owned by the controller. Starting a replacement aborts and releases the prior object.
- Replay uses the already downloaded in-memory audio object. It does not incur another API request.
- Cache at most the three most recent patient audio objects and no more than 10 MiB in aggregate;
  evict and revoke the oldest object first when either boundary would be exceeded.
- Object URLs are revoked when the encounter ends or the cached turn is evicted.
- The composer remains available for typing in every non-ended state, but Send is disabled while an
  actor turn is outstanding.

### 2. Managed microphone path

Use `MediaRecorder` rather than browser `SpeechRecognition` for the managed path. Recording is
tap-to-start/tap-to-stop, with automatic stop after 90 seconds or 4.0 MiB of recorded data, whichever
comes first. The client requests a bounded recording bitrate and both client and server reject an
oversized body before provider work. This fits the current synchronous Netlify Function request
[payload and execution limits](https://docs.netlify.com/build/functions/configuration/); larger
uploads require a different architecture and are out of scope. The endpoint forwards the transient
body to the selected transcription provider and returns text plus duration metadata. Before any
billable work, the server independently counts the body, sniffs the declared media container, and
derives a finite duration no greater than 90 seconds; client claims and `Content-Length` are never
authoritative. It aborts provider work before 45 seconds so durable accounting can finish within the
current function window. Neither the proxy nor the client persists the learner audio blob after the
draft is produced.

The first managed release accepts bounded WAV, Ogg Opus, and WebM Opus only. It does not accept MP4:
container-level `mvhd` duration is not sufficient to prove AAC/audio-track duration, especially for
fragmented Safari recordings. Safari therefore keeps equal typing and device-voice paths until a
vetted bounded MP4 parser plus real Safari MediaRecorder fixtures pass falsified-timeline and memory
tests. The health response advertises only formats the server can independently verify.

The learner sees the transcript in the existing textarea, edits it if needed, and presses **Say
it**. The existing PHI heuristic runs against the final draft before the actor request. Because audio
may already have reached the speech vendor before text screening is possible, the microphone consent
copy explicitly says not to speak real-patient information.

Browser speech recognition is not used silently as a managed fallback. If recording or managed
transcription is unavailable, the learner chooses typing. Device dictation supplied by the operating
system remains outside the tool's managed workflow.

### 3. Actor response and signed speech ticket

The existing `/api/sp` converse route remains responsible for state derivation, prompt assembly,
actor generation, and `{reply, state}`. When managed voice is available, the response also includes
a short-lived speech ticket containing:

- ticket schema version;
- rotation, encounter, and turn identifiers;
- a cryptographically random 128-bit one-time `jti`;
- case ID;
- canonical pack, attestation, and reviewed speech-profile hashes;
- reviewed speech-profile ID and version plus provider/model/voice ID;
- SHA-256 digest of the exact reply;
- issued-at and 120-second expiry times; and
- an HMAC-SHA-256 signature created with a server-only secret.

The ticket prevents the browser from turning the faculty-funded endpoint into an arbitrary
text-to-speech service. The voice endpoint requires both the rotation passcode and a valid ticket,
recomputes the reply digest, verifies the exact reviewed attestation and pack/profile hashes, and
refuses expired or altered text. One strongly consistent budget operation, keyed by the signed
`jti`, atomically owns redemption, provider-start permission, and settlement. The endpoint does not
compose a second redemption record because two independent writes cannot form one crash-safe
permission. A duplicate or concurrent redemption returns a stable `speech_in_progress` or
`speech_already_redeemed` response and never causes a second provider call. If a response is lost
after redemption, text remains the fallback rather than billing again. Replay is client-cached, so
the normal interface consumes one synthesis call per patient turn.

The governed opening line needs the same protection. Starting a live encounter sends
`{caseId, mode:"open"}` to `/api/sp`; the server reads the reviewed opening from its canonical pack
and returns `{reply, state, speechTicket}`. Managed synthesis is available only for this signed
opening and signed live-actor replies. Offline mock replies use device speech or text, never the
faculty-funded managed synthesis endpoint. Evaluation and debrief content remain text-only.

### 4. Spoken text and stage directions

The transcript preserves the actor's complete reply. For audio, `spokenText` removes only asterisk-
delimited stage directions such as `*looks away*` or `*long pause*`, normalizes whitespace, and keeps
the patient's punctuation and words unchanged. Stage directions remain visible as nonverbal actions.
If stripping produces no spoken words, the turn remains visual and no synthesis request is made.

The first release does not convert stage directions into generated sound effects. Case-authored
cadence and pause settings shape the synthetic voice, but the TTS provider may not invent words,
facts, or emotional content.

### 5. Voice service

Add a separate `/api/sp/voice` Netlify function with four explicit operations:

| Operation | Method and content | Authorization | Output |
|---|---|---|---|
| Health | `GET /api/sp/voice` | rotation passcode | enabled provider, eligible profiles, accepted media types, and budget band; no secret or dollar detail |
| Transcribe | `POST /api/sp/voice?op=transcribe` with allowlisted raw audio content type | rotation passcode | editable transcript and audio duration |
| Speak | `POST /api/sp/voice?op=speak` with JSON ticket and exact reply | rotation passcode plus speech ticket | `audio/mpeg` for the ticket's reviewed profile |
| Usage | `GET /api/sp/voice?op=usage` | separate `SP_OPERATIONS_KEY`, never the student passcode | aggregate billable units and estimated rotation spend |

The endpoint shares constant-time passcode comparison, CORS policy, ticket verification, and budget
accounting with the actor function through small server-only modules. Provider keys and ticket
secrets never reach the browser. The usage operation is not called by learner code and does not emit
browser CORS headers. In production, startup fails closed if allowed origins are missing or include
`*`; explicitly configured localhost origins remain development-only. CI uses a fake provider; it
never calls a billable vendor.

### 6. Speech-engine and profile contracts

The pack receives one reviewed top-level `speechEngine` record containing the selected transcription
provider/model, synthesis provider/model family, engine status, rate-card version and effective date,
audition record, privacy-review record, and engine hash. This avoids repeating transcription settings
in every case while ensuring that a transcription-model change triggers review. Runtime environment
variables may contain keys and enable/disable flags, but their provider/model values must match this
reviewed record or the voice health check fails closed.

The privacy-review record includes reviewed policy URLs and content hashes, reviewer, review date,
next-review date, institutional decision, consent-copy version, and exact provider account controls.
Draft account controls are null. A reviewed record pins `{provider,zeroRetentionEntitled,evidenceHash}`
to the active provider and runtime; the software never infers or claims an entitlement. A missing,
mismatched, or expired record keeps managed voice off without affecting text/device use.

Each case receives a `speechProfile` with these required properties:

| Property | Contract |
|---|---|
| `id` | Stable case-specific identifier such as `dana-measured-v1` |
| `status` | `draft-pending-attestation` or `reviewed` |
| `provider` | `openai` or `elevenlabs`, selected by the audition |
| `providerModel` | Exact pinned model string |
| `voiceId` | Exact case-specific stock synthetic voice identifier |
| `voiceProvenance` | Reviewed evidence that the identifier is provider stock, not cloned |
| `cadence` | One of `measured-flat`, `pressured-fast`, or `guarded-halting` |
| `speakingRate` | Numeric provider-neutral target, validated to `0.75` through `1.25` |
| `adapterMappingVersion` | `openai-tts-1-hd-v1` or `eleven-v3-v1` after review |
| `providerSettings` | Exact attested settings object sent to the selected synthesis adapter |
| `stageDirections` | Required value `visual-only` |
| `profileVersion` | Positive integer incremented for any acoustic behavior change |
| `facultyReview` | Status, reviewer, review date, audition record, and SHA-256 profile hash |

The provider adapter translates the provider-neutral cadence into supported vendor settings. The
pack remains the clinical source of truth for how a patient should sound; environment configuration
may supply credentials and feature flags but may not silently override an attested profile.

Until audition and attestation, `voiceProvenance`, `adapterMappingVersion`, and `providerSettings`
are explicitly null. A reviewed provenance object requires `kind:'provider-stock'`, an HTTPS catalog
URL, named verifier, verification date, and evidence hash; these fields record evidence and are not
manufactured by software. OpenAI's reviewed settings object contains only `speed`, exactly equal to
the profile's speaking rate, and cadence adds no hidden prompt. Eleven v3's exact settings are
`speed`, `stability`, `similarity_boost`, `style`, and `use_speaker_boost`; unsupported or unattested
values fail rather than being clamped. The profile hash binds all of these fields.

## Provider audition and selection gate

Before production integration is enabled, compare these current paired speech stacks:

- Budget baseline: OpenAI `tts-1-hd` for synthesis and `whisper-1` for transcription.
- Expressive challenger: ElevenLabs Eleven v3 (`eleven_v3`) for synthesis and Scribe v2 for
  transcription.

Create a blind randomized set of twelve fictional clips: for each of Dana, Marcus, and Ray, use one
opening line, one neutral response, one emotionally loaded response, and one safety disclosure from
the current pack. A faculty reviewer and enough clerkship learners to total five to eight raters
score every clip from 1–5 for:

1. patient realism;
2. fit with the authored persona;
3. clarity of clinically important wording; and
4. lack of distracting or melodramatic delivery.

Evaluate transcription separately with 24 fictional, consented staff or synthetic recordings that
cover ordinary interview questions, common psychiatric terms, negation, quantities/time, and the
critical safety-intent phrase set. Do not use learner encounters or real-patient audio. A stack
qualifies only with no meaning-changing error in a safety, negation, quantity, or time phrase and a
median word-error rate no greater than 8%. Every transcription still remains editable before send;
this benchmark is a release gate, not permission to auto-send.

A speech stack qualifies only when it passes the transcription benchmark, mean synthesis realism
and persona fit are at least 4.0, no patient's persona-fit mean is below 3.5, safety wording is
pronounced correctly in every reviewed clip, and projected 96-encounter rotation spend remains at or
below $20 including the existing actor estimate. If both qualify, select higher persona fit; ties
resolve by lower median synthesis latency, then lower cost. If neither qualifies, ship the
controller/test improvements with device speech and text only; do not weaken the thresholds.

The audition output records transcription and synthesis provider/model/voice IDs, exact source-line
hashes, anonymized aggregate scores, measured latency, projected cost, rate-card version, reviewer,
and date. It contains no learner microphone audio.

## Learner experience

### Voice consent and mode

Managed voice is opt-in. On first enable, a concise disclosure states:

- this is a fictional AI patient;
- microphone audio is sent to the named speech provider for transcription;
- audio is not intentionally stored by the clerkship tool, while the named provider processes it
  under the linked provider data notice and approved account settings;
- the learner must not speak real-patient information; and
- typing provides the same educational path.

The learner can choose **Managed voice**, **Device voice**, or **Voice off**. The tool remembers the
mode locally but never bypasses browser microphone permission.

### Composer and turn status

- The microphone button clearly alternates between **Speak** and **Stop**.
- While recording, a persistent status says that speech will become an editable draft.
- While transcribing, the text composer remains visible and the status explains the brief wait.
- The learner reviews the draft and explicitly selects **Say it**.
- Within 100 ms of send, the room shows **[Patient] is thinking**.
- When text arrives, the complete reply appears immediately in the transcript.
- While audio buffers, the status says **Preparing [Patient]'s voice**.
- While speaking, the patient message has **Stop**; after completion it has **Replay**.
- Starting the microphone during playback stops the patient first. This is operational barge-in only;
  it is not scored or added to the clinical transcript.

### Stable fallback

The system does not switch acoustic identity silently. A managed-speech failure leaves the text in
place and offers **Continue with text** or **Use device voice**. The selected fallback remains stable
for the encounter unless the learner changes it.

The actor provider is also stable. Authentication, quota, timeout, or upstream failure is surfaced
by type. Continuing with the offline mock patient requires an explicit learner choice and is labeled
for the rest of the encounter. Offline mock replies use device voice or text because they do not
carry a server speech ticket.

## Error handling

| Error | Learner-facing behavior | Recovery |
|---|---|---|
| Microphone permission denied | Explain that microphone access was not granted | Continue typing; offer browser permission guidance |
| No speech captured | Preserve existing draft | Try recording again or type |
| Recording reaches 90 seconds or 4.0 MiB | Stop recording and explain the limit | Transcribe captured segment or discard |
| Transcription unavailable/timeout | Discard transient audio after failure | Type; retry only on explicit action |
| Actor unauthorized (`401`) | Explain that the rotation passcode needs attention | Reopen setup; never fabricate an offline reply |
| Actor turn/quota limit (`429`) | Explain the applicable limit | End encounter or explicitly continue offline |
| Actor timeout/upstream error | Keep learner message and show retry choices | Retry once or explicitly continue offline |
| Invalid/expired speech ticket | Keep text reply | Continue text; request no replacement actor turn |
| Managed speech unavailable | Keep text reply | Continue text or explicitly choose device voice |
| Autoplay/playback blocked | Keep text reply and expose Play | Learner starts playback directly |
| Rotation budget warning | Quiet operational notice at 80% | Stop new transcription/synthesis calls and reserve the remaining envelope for actor turns |
| Rotation budget exhausted | Preserve current text and transcript | Use device/text; at the total cap, explicitly continue offline |

Errors have stable machine codes for tests and plain-language messages for learners. Logs may contain
the code, case ID, turn number, phase duration, and billable units; never the text or audio.

## Privacy and security

1. No real-patient information is allowed in typed or spoken input.
2. The existing text PHI heuristic remains a blocking confirmation before actor send.
3. Audio is held only long enough to transcribe and is not written to Netlify Blobs, application
   logs, analytics, or browser storage.
4. The proxy does not log transcripts. Provider requests use the minimum audio or text required for
   the current operation.
5. Speech generation accepts only exact, short-lived, server-signed actor output.
6. The passcode remains in `sessionStorage`; endpoint and voice-mode preference may remain in
   `localStorage`.
7. Provider API keys, pricing configuration, and ticket secret remain server-side.
8. CORS remains restricted to the attested learner sites and explicitly configured local origins.
9. Voice output is visibly disclosed as synthetic. Stock voice use must comply with the selected
   provider's current terms.
10. No voice biometrics, speaker identification, emotion recognition, accent scoring, or raw-audio
    telemetry is collected.
11. Before any learner audio is enabled, the faculty/privacy review records the selected provider's
    current API retention, training-use, deletion, regional-processing, subprocessor, and account-
    control terms. If the available terms do not meet institutional requirements, managed dictation
    does not ship; typing and device speech remain available.
12. Consent states clerkship retention and vendor retention separately and must be renewed after a
    provider change or material provider-policy change. The operational runbook names the incident
    response, vendor notification/deletion pathway, and faculty contact for accidentally spoken
    patient information; no transcript is copied into an incident ticket.

## Accessibility

- Text is always sufficient to complete the encounter, self-assessment, and debrief.
- The complete patient reply is available visually without waiting for audio completion.
- The transcript remains a named `role="log"`; each reply is announced exactly once. Timed partial
  text is not separately announced.
- Record, Stop, Play, Replay, Voice mode, and fallback choices are native keyboard-operable controls
  with state-specific accessible names and `aria-pressed` where appropriate.
- Status changes use one polite live region. Critical setup/privacy errors use an alert only when
  immediate attention is required.
- Visible captions, focus behavior, color contrast, 44 px targets, reduced-motion behavior, and
  light/dark themes remain supported.
- Voice mode does not imply that the learner must speak; typing remains adjacent and equal.
- Screen-reader users can suppress patient audio without suppressing the transcript or status.

## Cost controls

Add a metadata-only rotation ledger keyed by `SP_ROTATION_ID`. Reuse the existing
`@netlify/blobs` dependency in a dedicated `sp-usage` store configured for strong consistency. It
records actor input/output token counts, transcription milliseconds, synthesis characters, and
estimated spend using a server-side pinned rate card. It records no identity, transcript, or audio. The design
uses Netlify's documented [strong-consistency and conditional-write
controls](https://docs.netlify.com/build/data-and-storage/netlify-blobs/#consistency), not the
current best-effort read/modify/write counter. The ledger computes cost from exact provider, model,
meter, rate-card, and measured-unit bindings; callers never supply dollar amounts.

Every billable request receives one stable logical idempotency key derived from rotation, encounter,
turn, and operation; synthesis also binds the one-time `jti`. The ledger, not the caller, advances an
internal generation only after a recorded failure before provider work begins. Before calling a
provider, the budget module
atomically reserves a conservative maximum cost using the record's ETag and a bounded retry loop;
after the response it reconciles that reservation to reported or measured usage. A request is
refused when its reservation would cross the cap. The same key may retry only after a recorded
failure that occurred before provider work began; once provider work starts, a retry cannot cause a
second billable call. This compare-and-swap rule prevents ordinary concurrent serverless calls from
overwriting one another. Failure to read or update the durable ledger fails managed voice closed and
leaves text available; it does not silently fall back to an in-memory counter. Provider-side spend
limits or alerts remain a second guardrail.

The rate card includes provider/model, unit, price, currency, effective date, and review date. A
pricing or model change requires a new rate-card version and a fresh 96-encounter projection before
the runtime configuration is enabled. The July 14, 2026 planning baseline uses the official
[OpenAI TTS-1 HD](https://developers.openai.com/api/docs/models/tts-1-hd),
[OpenAI Whisper](https://developers.openai.com/api/docs/models/whisper-1), and
[ElevenLabs API pricing](https://elevenlabs.io/pricing/api?price.platform=api) pages; implementation
must refresh these rates rather than treating this document as a live price list.

The default planned envelope is `SP_ROTATION_BUDGET_USD=20`:

- below $16: managed actor and voice operate normally;
- at $16 (80%): warn operationally and disable managed voice before compromising actor availability;
- at $20: stop additional billable actor/voice calls and offer the labeled offline/text path.

Because a provider can change billing or meter differently from local estimates, the ledger is still
not a substitute for vendor-side limits and billing alerts. The health response exposes only `ok`,
`warning`, or `capped` to learner clients. Detailed totals are operational and never shown as a
learner score or attributed to a student.

## Governance and attestation

Voice is curriculum behavior. A voice that sounds hostile, seductive, comic, overly dramatic,
stereotyped, or incongruent with the case can change what the learner practices even when the words
are unchanged. Therefore:

1. The redesigned tool remains pending until the final provider/model/voice profiles pass the blind
   audition and faculty review.
2. The build validator must check tool source headers, not only Markdown headers, against
   `reviewed.json`.
3. The selector includes a case only when `case.facultyReview.status` is `reviewed`. Managed voice is
   offered for that case only when `speechEngine.status` and `case.speechProfile.status` are also
   `reviewed`; otherwise the reviewed text/device path remains available.
   The selector, actor endpoint, voice endpoint, and health response enforce these rules independently;
   a modified client receives `403 case_not_reviewed` for a draft clinical case and cannot request a
   voice for an ineligible profile.
4. The pack's top-level status cannot imply that draft cases are attested; case-level review remains
   authoritative.
5. Attestation records the HTML hash, pack hash, speech-engine/profile hashes, actor model, evaluator
   model, transcription and synthesis provider models, stock voice IDs, rate-card version, privacy-
   review record, reviewer, and review date.
6. Any actor, evaluator, provider model, voice ID, cadence, rate, stage-direction rule, or profile
   version change invalidates the applicable performance attestation.
7. Re-attestation requires the deterministic suite, golden transcript, locked-content tests, twelve-
   clip voice regression set, and updated live red-team checklist.
8. The red-team checklist adds: microphone still active after Voice off; microphone/playback overlap;
   patient audio transcribed as learner input; wrong-case voice; altered ticket text; stage direction
   read aloud; audio after End encounter; silent provider fallback; budget-cap behavior; and safety-
   phrase pronunciation.
9. Only Dana may enter the first learner pilot unless Marcus and Ray obtain case and voice review.

This design does not treat model recall or synthetic-voice appeal as evidence of educational validity.
Faculty attestation and learner pilot observations remain required.

## File and responsibility boundaries

This is the expected change surface; the implementation plan will specify exact steps and tests.

| File | Responsibility |
|---|---|
| `_prototypes/sp-interview/sp-interview.voice.js` | Pure client audio state machine and browser adapters |
| `_prototypes/sp-interview/sp-interview.html` | Learner UI integration; no independent audio lifecycle |
| `_prototypes/sp-interview/sp-interview.preview.html` | Generated preview using the same controller and embedded pack |
| `_prototypes/sp-interview/sp-interview.pack.json` | Reviewed top-level speech engine and versioned per-case speech profiles |
| `_prototypes/sp-interview/tests/voice-state.test.mjs` | Deterministic lifecycle, cancellation, and stale-callback tests |
| `_prototypes/sp-interview/tests/voice-contract.test.mjs` | Profile, spoken-text, ticket, and fallback contracts |
| `_prototypes/sp-interview/tests/preview.test.mjs` | Canonical/preview generation parity and deployed-asset coverage |
| `_prototypes/sp-interview/tests/run-all.sh` | Honest aggregate exit status including voice tests |
| `sp-proxy/netlify/functions/sp.mjs` | Existing actor plus speech-ticket issuance and usage metadata |
| `sp-proxy/netlify/functions/sp-voice.mjs` | Bounded transcription, signed synthesis, health, and cost bands |
| `sp-proxy/netlify/functions/_shared/sp-http.mjs` | Shared auth, CORS, and safe response helpers |
| `sp-proxy/netlify/functions/_shared/sp-governance.mjs` | Frozen pack, per-case voice, privacy, and runtime-stack eligibility |
| `sp-proxy/netlify/functions/_shared/sp-speech-ticket.mjs` | HMAC ticket issuance/authentication; standalone redemption is not composed into the billable endpoint |
| `sp-proxy/netlify/functions/_shared/sp-budget.mjs` | Strongly consistent Blob ledger, idempotent reservations, reconciliation, and budget policy |
| `sp-proxy/README.md` | Environment, provider, privacy, cost, and rollback operations |
| `sp-proxy/REDTEAM_CHECKLIST.md` | Voice, overlap, failure, pronunciation, and re-attestation probes |
| `13_Faculty_Resources/_automation/site_build/build_deploy.py` | Copy the shared voice asset into learner builds |
| `13_Faculty_Resources/_automation/validate_attestation_consistency.py` | Enforce tool/pack/case/voice review alignment |
| `.github/workflows/ci.yml` | Run the SP suite on Node 20 before site builds |

The canonical HTML, shared controller, and JSON pack are the sources of truth. The preview is
mechanically generated and receives a drift test; it is not edited as a second implementation.

## Verification and acceptance criteria

### Automated behavior

1. Correct Dana's smoke harness so every failed assertion increments a suite failure count and the
   process exits nonzero. Injecting one deliberate assertion failure must make `run-all.sh` fail.
2. Add `bash _prototypes/sp-interview/tests/run-all.sh` to Node 20 CI before the site builds.
3. Across at least 100 deterministic event sequences, microphone and patient playback overlap zero
   times.
4. Voice off, End encounter, case change, and restart stop recording and playback within 100 ms in
   the mocked clock.
5. A late transcription, actor, synthesis, or playback callback cannot mutate a different turn or
   ended encounter.
6. Dictation never invokes actor send without a distinct learner action.
7. The server rejects a recording above 4.0 MiB, the client stops at the time-or-size boundary, and
   a transcription provider request is aborted before the synchronous function deadline.
8. Altered, expired, wrong-attestation, wrong-pack, wrong-case, and wrong-profile speech tickets are
   rejected.
9. Opening-line synthesis requires the server-returned canonical opening and a valid ticket; offline
   mock or arbitrary browser text cannot consume managed synthesis.
10. `spokenText` preserves patient words and removes only stage directions; the stage direction is
   still present in the visual transcript.
11. Replay causes zero new network or provider calls and the cache obeys both eviction boundaries.
12. `401`, `403`, `429`, timeout, upstream failure, speech failure, and budget cap produce distinct error
    codes and do not silently change provider mode.
13. Ten concurrent or duplicate requests cannot overwrite usage, redeem one ticket twice, or
    authorize locally estimated spend above the configured cap. The fake-provider test's permitted
    overshoot is $0; an unavailable ledger causes zero billable provider calls.
14. Only clinically reviewed cases appear in the production selector and actor/health responses;
    managed voice appears only for fully reviewed speech-engine/case/profile combinations.
15. Production configuration rejects missing or wildcard origins and student credentials cannot read
    detailed usage.
16. Managed voice fails closed when the rate card or privacy-review record is absent, expired, or
    mismatched; a material provider-policy change advances the consent version.
17. Canonical and preview pages use the same controller and case pack content after the documented
    preview transforms.

### Browser and accessibility checks

Run the built MS3 tool in current Chrome on macOS and Windows, plus current Safari on macOS/iOS when
available. Verify keyboard-only operation, VoiceOver on macOS/iOS, reduced motion, denied microphone,
autoplay blocked, offline, slow network, and narrow mobile layouts. Device/browser combinations that
cannot record or play managed audio must retain a complete typed encounter.

### Performance and learner pilot

- The thinking state appears within 100 ms of send.
- Median send-to-first-audio is at most 3 seconds and p95 is at most 6 seconds on the expected campus
  network.
- Audio begins no more than 750 ms median after the text reply arrives.
- Twenty stop/restart trials lose no finalized learner draft and play no stale patient audio.
- Five to eight pilot learners rate overall realism at least 4.0/5 and distraction at most 2.0/5.
- No safety-critical dictated phrase is sent without appearing in the editable draft first.
- The 96-encounter cost projection remains at or below $20 after measured pilot usage replaces the
  initial assumptions.

The existing deterministic gate, leak, and parity tests must remain green. Passing them proves
engine preservation; passing the new voice tests proves lifecycle behavior. Neither substitutes for
faculty review or the learner pilot.

## Rollout and rollback

### Phase 0 — make the gate honest

Fix failure propagation, add the SP suite to CI, generate the preview mechanically, reconcile tool
and case attestation, and hide draft cases before adding billable speech.

### Phase 1 — audition

Refresh provider prices and privacy/data terms, generate and review the twelve blind clips, and
record the winning speech engine and profiles in the pack. If neither stack qualifies—or its data
terms are not institutionally acceptable—stop after the browser-controller improvements.

### Phase 2 — managed voice foundation

Add the controller, voice endpoint, signed tickets, transient transcription, synthesis, stable
fallback, cost ledger, and automated tests behind `SP_MANAGED_VOICE_ENABLED=false`.

### Phase 3 — restricted pilot

Enable managed voice for Dana in Supported mode with two to three volunteer learners. Review
latency, errors, spend, accessibility, transcript integrity, and qualitative realism. Do not expose
draft cases.

### Phase 4 — faculty gate and gradual release

Replay the golden transcript and voice regression set, run the expanded red-team checklist, record
attestation, then enable Dana for the rotation. Expand to Marcus or Ray only after each case and
voice profile is independently reviewed.

### Rollback

Set `SP_MANAGED_VOICE_ENABLED=false`. The controller returns to explicit device/text modes, the actor
and transcript remain available, and no pack or clinical-content rollback is required. A provider
failure must never require weakening the deterministic engine, safety gates, or attestation rules.

## Future experiment

After the first release is stable, consider structured, non-scored barge-in for Marcus: a learner can
interrupt pressured speech respectfully, the audio stops, and the event is stored only as local
practice metadata for debrief discussion. It remains out of scope until faculty defines what an
educationally appropriate interruption means.

Maintain a short approved **voice fingerprint** clip for every reviewed patient. On any provider or
profile change, compare the new clip with the attested reference before learners hear it. This is a
regression aid, not biometric identity matching.

## Completion condition

This design is complete when the user approves this written specification. Only then should a
task-by-task implementation plan be written. No production code, provider account, credential,
deployment, or faculty attestation changes are authorized by this design document alone.
