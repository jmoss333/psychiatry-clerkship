# Spoken interruption and faculty voice calibration

2026-09-09 · protected faculty-preview experiment · not a production release

## Requested behavior and scope

The learner can choose **Interrupt by speaking** before a full encounter, or switch it on in the room. With headphones, recognition stays available during eligible patient playback. Distinct recognized learner words stop the active and queued recordings, remain in the draft, and become the next turn after the existing 4.5-second quiet interval. More thinking time remains 8 seconds; Hold and Space retain their existing behavior. Explicit Pause, Escape, End, Clear, and leaving the page take priority.

This first version covers Dana, Marcus, Ray, Morgan, and the shared Morgan/Maya encounter. Practice a Moment keeps its existing interaction and voice settings; its auxiliary reflection/formulation/alternative capture remains separate. The final allowed patient reply and a finished encounter's alternative do not open another learner turn.

## Architecture and its practical limits

Use the existing recognition session during playback, rather than opening a second microphone. A sound-start or speech-start notification alone does not interrupt. Recognized non-echo phrases of at least two words, or an explicit “wait”/“stop,” can take the floor. A small allowlist of standalone acknowledgments leaves playback running. This is a conservative interaction rule, not reliable inference of conversational intent.

The recognizer first compares results with the generated patient text. Identifiable echoed prefixes can be removed from a joined patient-tail/learner-opening result. Every result first seen during playback retains its reference through later interim/final revisions. New result IDs are compared only through a two-second post-playback/takeover tail. Later reflective repetition is permitted. A final revised to echo is quarantined rather than sent as a learner question. These are prototype heuristics, not a validated speaker-identification system.

The same recognizer remains alive across a spoken cancellation so the first words are retained. Automatic sending is blocked until request cleanup finishes and a usable conversation receipt exists. The server still remembers only completed audio segments; an unfinished segment is not promoted to fully heard dialogue. A separate intentional pause revokes automatic handoff. A recognition error disables spoken interruption while allowing valid patient audio to finish; manual interruption remains available.

**Headphones are the supported audition setup.** Recognition latency varies by browser and service. Speaker playback, misrecognition, very short utterances, or close repetition may cause false or missed interruptions. The two-second tail is an engineering choice requiring microphone trials, not an evidence-based acoustic threshold. The interface says “experimental” and explains microphone activity during replies. Audio may reach the browser's recognition service; the app does not save it.

[MDN's recognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) identifies limited browser support and possible remote recognition. [Its speech-start definition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/speechstart_event) does not identify who spoke. [Echo cancellation constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation) apply to media tracks; opening an unrelated track does not prove it controls ordinary `recognition.start()`. Accordingly, this implementation does not claim browser acoustic echo cancellation or introduce a redundant microphone stream.

A future lower-latency implementation could use a controlled duplex audio path and semantic turn detection. [OpenAI's VAD documentation](https://developers.openai.com/api/docs/guides/realtime-vad) describes this capability. Adopting it here requires separately preserving case authority, delivered-history accounting, provider limits, and cancellation behavior. It is not silently substituted for the current validated actor and TTS pipeline.

## Faculty settings

Full encounters offer **Gentler expression / Current portrayal / More pronounced expression** before Start. The server accepts only `gentle`, `standard`, or `expressive`; stores the selection in authenticated encounter state; and carries it through every segment, family speaker change, and alternative. Arbitrary performance instructions and mid-encounter request overrides are refused before paid work.

All current profiles, including the selected Marcus Cedar cadence, remain unchanged at Standard. Voice identity, numeric synthesis speed, actor context, case facts, disclosure rules, and feedback criteria are unchanged across intensity presets. Nonstandard directions affect word-supported emphasis, phrasing, and emotional weight. They cannot invent slurring, crying, hostility, new symptoms, agreement, or certainty. The control is portrayal intensity, not illness severity or learner difficulty.

The [case-by-case evidence memo](2026-09-09-sp-voice-evidence.md) distinguishes research findings from proposed performance directions. [OpenAI's TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech) supports directional control over emotional range, intonation, and speaking style; instructions do not establish that a particular generated performance is clinically accurate.

## Verification and listening sequence

1. Exercise cancellation, echo revisions, first-word retention, explicit stop priority, setting validation, family routing, and existing Moment behavior with provider-free tests.
2. Exercise the visible controls on desktop and mobile under the deployed security headers. Mock recognition and audio establish UI/state behavior, not physical-microphone performance.
3. Compare identical canonical lines across the three presets for five speech roles. Generate once, no actor requests or retries. Listen for exact meaning, intelligibility, individual variability, absence of caricature, and the intended change in expression. Generating a clip is not faculty approval.
4. Conduct a physical headphone trial: ten interruptions across early and late segments, acknowledgments, unfinished sentences, thoughtful pauses, corrections, and an explicit End. Check that first words survive and no echoed question is submitted. Then separately characterize speaker playback; do not treat headphone success as speaker validation.
5. Keep the protected preview status and existing faculty-review labels. No production publication, merge, or attestation is implied.

Existing release limitation: the prior Elena paid encounter completed its dialogue but its feedback request was unavailable. These voice changes do not resolve or explain that feedback failure.

The main site's managed-voice checklist V3 expects no listening during playback. That remains the default behavior here. The user's explicit request authorizes a separate, opt-in headphone experiment with different turn-taking; it does not establish a V3 physical self-capture pass or activate managed voice on learner sites. The offline red-team runner still tests canonical disclosure gates. Human character, pronunciation, and acoustic checks remain separate.

## Further realism ideas, in priority order

- **A patient who keeps their emotional continuity.** A respectful response can soften the next line a little without instantly erasing fear, shame, irritation, or ambivalence. Use authored, observable changes and heard dialogue; never infer a hidden learner-quality score.
- **An explicit difference between listening and taking the floor.** Extend the small acknowledgment rule using a calibrated duplex path, so “mm-hmm” allows continuation while a substantive sentence interrupts. Preserve an unconditional manual stop.
- **Faculty-directed room events.** A predefined knock or change of focus can test distraction and redirection. Each event needs authored facts and an accessible textual equivalent; the patient should not hallucinate a room event.
- **A family member who waits, then asks for a turn.** Authored bids such as “Could I add something?” could make a shared meeting feel less like a respondent selector. This needs consent-aware turn routing and private-fact protection before overlap is enabled.
- **Compare the same moment twice.** Hold patient words constant while changing only vocal expression, then ask faculty what changed their interpretation. The new calibration clips provide a small foundation without turning impressions into diagnoses.
- **A private patient agenda revealed through conversation.** Author a legitimate concern the learner can discover, with clear disclosure rules. Preserve uncertainty and allow good conversations to end without full agreement.

Next best step after this protected build: a brief physical headphone trial plus faculty comparison of the identical-line clips. These address the two remaining uncertainties separately: conversational turn-taking and believable patient portrayal.
