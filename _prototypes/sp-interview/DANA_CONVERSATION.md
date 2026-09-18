# Spoken Interview Room: local conversation prototype

## Claude review corrections — September 6

Local Dana now answers a direct suicide question even as the first question, after premature reassurance or judgment, and when it is asked again. A separately labeled draft overlay changes only the active-ideation gate; the authored words, recordings, and follow-up depth gates stay unchanged. Its source gate and live case context are pinned and checked for drift. The canonical case pack, production proxy, and faculty review records are unchanged. This correction is for supervised review of the local draft, not a release attestation.

Asking directly is appropriate; a guarded response does not mean the question was wrong. This follows [NIMH guidance on asking about suicide directly](https://www.nimh.nih.gov/health/publications/5-action-steps-to-help-someone-having-thoughts-of-suicide). Rapport flags remain narrow heuristics, not a valid evaluation of clinical communication.

The local health endpoint now reports operation counts and actual provider-reported tokens with reporting coverage. Missing usage stays unknown, including speech responses without token data; dollar cost stays unavailable. Counters reset with the process and do not reconstruct earlier API spending. See [the review response and current validation](../../docs/superpowers/plans/2026-09-06-claude-review-remediation.md), including the related family memory and caption corrections.

## Complete medical-student station — September 6

Dana, Marcus, Ray, and Morgan now share the complete encounter workflow: a door note and student task, requested chart information, optional accommodated practice time, ongoing patient priorities, authored observable cues, a closing-summary prompt, a separate attending presentation, and exact-quote reflection. The same objectives apply to MD and DO students. The Morgan/Maya family version uses the same station modules with explicit conversation privacy boundaries.

With the opt-in headphone setting, a brief final acknowledgment such as “mm-hmm” lets the patient finish. A question, negation, or substantive continuation interrupts while preserving the first recognized words. Speaker playback retains button/keyboard interruption. Long pauses still use the existing 4.5/6-second allowance, Hold, and Space controls.

End offers a return to the patient for a summary or a transition to the attending handoff. Typing or dictating that handoff makes no patient-response request. Reflection starts with the learner's own interpretation, then presents the exact original quote, confirmed completed words, possible patient perspectives, and supervision questions. Alternatives keep the original intact. No fluency, accent, speed, personality, empathy, or readiness grade is added. Browser dictation may use its recognition service.

The optional timer pauses during reply preparation, pauses/repairs, alternatives, and hidden tabs. It can be doubled or extended and never cuts off the encounter. The existing ten-turn local operation limit remains visible; the station suggests beginning closure near the final turns.

See [the implementation and verification ledger](../../docs/superpowers/plans/2026-09-06-sp-complete-encounter.md) and [the independent Claude review prompt](../../docs/superpowers/plans/2026-09-05-claude-sp-encounter-review-prompt.md). Historical verification below describes earlier versions; use the new ledger for this addition. This remains a local draft pending faculty review.

Start once, ask ten questions aloud, and hear the selected patient respond without touching a composer. With the optional headphone setting, the microphone stays available during patient speech, so you can interrupt. Otherwise, the Interrupt button stops the reply and begins listening; the microphone also resumes automatically after playback. The original recorded mode uses the existing scripted Dana case. The new live mode is described below; neither mode is deployed to learners.

## Three live cases — added September 5

The live preview now lets you choose **Dana, Marcus, or Ray** before starting. This expands the spoken experience using the three existing canonical fictional cases; it does not add new canonical patient histories or change their faculty-review records. New live wording and voice delivery remain experimental.

| Case | Practice focus | Local voice |
|---|---|---|
| Dana — Day 1 Admission Interview | Open the interview, respond to shame, and ask about safety directly | Marin; existing 75 recordings retained |
| Marcus — Day 1 After a Sleepless Week | Validate and redirect a rapid, tangential conversation while exploring sleep and safety | Cedar with brisk, connected, restrained delivery |
| Ray — First Days, Guarded and Afraid | Build trust, explore unusual experiences neutrally, and tolerate pauses | Cedar with quiet, cautious, clearly audible delivery |

Choose a person in **Choose a practice conversation**. Each card shows the existing case goal and presenting context. Start locks the selected person through the encounter and its one alternative. **Clear and start over** empties the encounter and keeps the same case selected; the chooser then becomes available again. The default link still opens Dana. An unsupported case or unavailable opening cannot silently start a different person.

All three use the same 4.5-second pause, extra thinking time, Hold, Space/Escape controls, optional headphone interruption, repair card, bookmarks, and direct one-turn retry. Transcript labels, controls, disclosure, and reflection copy use the selected person's name. The prerecorded/scripted conversation mode remains Dana-only.

The server owns immutable case identity for each session and passes it to speech generation and retry children. Turns cannot change that identity. Every case has a source-hash-bound factual inventory and explicit information limits. Canonical server replay still controls disclosure. Locked reveal text and locked gate identifiers are excluded from actor context. Missing details remain unknown; for example, Ray's lack of a previous psychiatrist visit does not establish that he has never received therapy.

Two canonical openings were generated once with the existing approved API setup: Marcus, 21.048 seconds; Ray, 6.600 seconds. Their one-entry manifests bind the pack, source text, spoken text, voice/model, and actual audio bytes. Both fully decode as MP3. Files live only in ignored `output/speech/voice-cases-v1/{marcus,ray}/`; selecting or previewing them does not call a provider. New dialogue uses the existing live actor and TTS path. Cedar requests never borrow Dana's Marin recording cache. Voices are provisional auditions, not an attested learner voice release. [OpenAI stock voices](https://developers.openai.com/api/docs/guides/text-to-speech).

The case-selection and recording changes are limited to the explicit loopback preview. The ordinary Interview Room, canonical case pack, deployed sites, and learner release settings are unchanged.

Verification of the three-case expansion: 80 browser scenarios passed with simulated recognition, audio, and API responses; all 399 SP node:test checks and the existing direct contract suites passed; 1,768 root static checks passed. Actual OpenAI integration completed two original replies plus one bookmarked alternative for each new case, with fourteen native Chromium audio completions, no page/media errors, original text and notes preserved, and Clear returning to the same selected case. Recognition was simulated and playback muted: this confirms integration and decoding, not real microphone accuracy or perceived naturalness. The chooser and ready states were also verified in the ordinary browser.

A text spot check of those six replies found no material contradiction or gated reveal, but Marcus once added an unestablished bedtime experience. His information limits now explicitly keep sleep-onset difficulty and bedtime experience unknown; one targeted actor-only repeat retained short sleep without tiredness and did not invent that experience. This is a bounded observation, not a claim that future replies cannot drift. New live wording and Cedar delivery still need your listening review. Evidence: ignored `output/speech/voice-cases-v1/live-results.json`, per-case `case-card.png`/`retry.png`, and `marcus/sleep-refinement.json`.

This expansion generated exactly two new reusable opening clips. Its native integration used six actor turns; the focused sleep follow-up used one additional actor request without speech. Automated regression tests use mocks and create no provider charges. Existing Dana recordings were not regenerated.


## Live conversation — added September 5

The user chose live, case-grounded replies with Marin after testing the recorded prototype. The live version uses the current conversation to compose new patient wording. It remains a local, experimental fictional encounter; generated replies have not been individually faculty-reviewed.

Open `start-dana-live.command` in this directory, or use <http://127.0.0.1:4319/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1> while its server is running. The launcher opens Chrome and uses the previously approved ignored Dana environment file in the main checkout. No credential enters browser code. The ordinary port-4318 recording preview remains separate.

- Default end-of-turn pause is **4.5 seconds**. Extra thinking time is **6 seconds**; Hold my turn still prevents automatic sending.
- **Space** finishes a recognized learner turn while Listening. A second Space while waiting or during playback leaves Dana's reply running and explains that the question is already sent. **Escape** interrupts Dana instead. Neither shortcut intercepts typing, native controls, modifier shortcuts, repeated keys, or IME composition. The visible Done speaking and Interrupt Dana buttons remain available.
- Unanswered learner turns show whether Dana's reply is pending, cancelled, or failed. A failure remains visible after Resume; nothing is automatically resent. The notice disappears when a patient transcript entry is created, whose playback status is tracked separately.
- The opening is the approved local Marin recording. New replies use `gpt-5.4-2026-03-05` with low reasoning and a 768-token output budget, and `gpt-4o-mini-tts-2025-12-15` with the same Marin delivery instructions and normal speed. When an audio segment's exact words match one of the existing 75 clips, the server verifies and reuses that clip. It never substitutes an approximate matching line.
- The server prepares a substantive opening sentence privately while the actor finishes composing. No audio URL or reply text is released until the actor completes, the entire reply passes the existing spoken-text checks, and its prefix exactly matches the prepared words. The rest is then generated as a second segment when needed. Replies without a usable opening sentence use one segment.
- The browser preloads both segments and plays them in order, streaming MP3 bytes without waiting for complete files. Repeated audio requests reuse each segment's sole producer and bounded in-memory bytes. The sentence transition does not wait for a receipt network round trip.
- The server retains chronological learner and heard patient turns in memory. A complete reply requires its exact accepted ID, native audio completion, and successful receipts for every segment. If a complete opening segment was heard before interruption, only that contiguous verified prefix enters subsequent context; the unfinished remainder is omitted. Late or out-of-order receipts cannot upgrade cancelled playback. Voice preview never acknowledges the encounter opening.
- The live actor receives concise case facts rather than canned social or fallback response menus. A source hash binds the fact summaries to the canonical case and fails closed on drift. Canonical `deriveState` controls disclosure gates from server-owned learner history. Locked reveals and raw hidden agenda stay outside the actor context. The actor can phrase replies, but cannot author clinical state, award coverage, or open gates. Prompt constraints and output-format checks reduce errors; they do not prove factual fidelity.
- Recognized learner words and conversation context are sent to OpenAI. Replies use `store=False`; that is not a promise of zero provider retention. The app writes no local transcript/audio logs. End stops input and audio while retaining temporary in-memory context for one alternative. Clear and navigation away request deletion of original and retry sessions; the 30-minute expiry is the fallback if deletion cannot reach the server. Clear waits at most 1.5 seconds for deletion before resetting the page. Generated audio stays in memory. Browser speech recognition has its own provider behavior.
- Each encounter allows 10 learner turns. The local process caps 60 actor attempts, 60 speech attempts, 8 sessions, and 2 concurrent turns. A split reply uses at most two speech attempts; even discarded speculative speech counts. The whole turn shares a 4 MB audio cap. Requests have deadlines, deduplication, and cancellation. Concurrency stays reserved until all speech production ends or the turn is aborted. Interrupt/Pause cancels the actor and all segment producers, and waits for cancellation acknowledgement before another turn is submitted; known-turn cancellation also handles discarded metadata. Reaching a limit produces an error; there is no automatic retry or voice fallback.
- Only loopback hosts and same-origin API requests are accepted. An explicit static-file allowlist excludes environment files, server source, hidden files, traversal, symlinks, and directory listings. This local service is not a hosted deployment configuration.

One-time local dependency setup, from this worktree root:

```bash
uv venv output/speech/dana-runtime-venv --python python3
uv pip install --python output/speech/dana-runtime-venv/bin/python -r _prototypes/sp-interview/requirements-dana.txt
```

The implementation is separated into the live browser adapter, local HTTP server, case-context builder, verified recording reuse, and a Python OpenAI SDK worker. Provider errors are sanitized, SDK retries are disabled, and the child process is terminated on cancellation. The recorded mode and hosted speech eligibility rules are unchanged.

API references: [conversation history with storage disabled](https://developers.openai.com/api/docs/guides/conversation-state), [GPT-5.4 snapshot](https://developers.openai.com/api/docs/models/gpt-5.4), and [Marin text-to-speech](https://developers.openai.com/api/docs/guides/text-to-speech).

## Bookmark moments and start a direct retry — September 5

During a live encounter, **Bookmark exchange N** marks the latest submitted learner turn without pausing recognition or playback, changing the transcript, or sending a request. **Alt + Shift + B** (Option + Shift + B on Mac), outside a control, does the same without moving focus. The number on the button identifies the exchange: words still being drafted are not included. Each exchange can be bookmarked once; the opening is not a learner exchange.

An exchange can be marked while Dana is preparing or speaking her reply. Its bookmark follows that same reply to completion. At End, **Moments you bookmarked** shows the marked exchanges in order, with optional reflection fields and Remove controls. Only complete playback or verified completed audio segments supply Dana's quoted words; an interrupted or failed reply never substitutes its unheard tail. No completed segment means an explicit notice rather than guessed wording.

Each eligible bookmark now has **Try this moment again**. It selects that exact exchange in the existing alternative panel, moves focus to its status, and starts the microphone when ready. It does not silently substitute a different moment. While the finished encounter is being prepared, buttons remain disabled with an explanation. Selecting one exchange locks the encounter to that one alternative; repeated clicks and other bookmark buttons cannot create more sessions. If the tab becomes hidden during setup, the microphone stays off until explicit Resume. Notes and their focus survive availability updates.

Bookmarks and their optional notes exist only in page memory. They do not enter the actor context, browser storage, server, exports, or feedback calculations. Clear and page exit empty them; hiding the tab preserves them for Resume. Optional notes do not gate the existing self-assessment or teaching points. The feature remains confined to the live local preview and does not change the canonical case or learner release state.

Verification: 13 bookmark-model tests, nine retry unit tests, and 15 bookmark browser scenarios cover pending replies, exact direct selection, one-child limits, setup recovery before and after child creation, interruption, drafts, keyboard guards, notes, removal, tab hiding, Clear, reload, and prerecorded isolation. Four setup-failure regressions failed before the repair and passed after. The full dedicated suite passed 76 scenarios with simulated recognition, playback, and API responses; the bookmark/direct-retry interface work made no paid provider calls. A focused debrief screenshot is retained in `output/speech/dana-bookmarks/debrief.png`. After the final changes, the served preview, conversation module, and retry module matched local file hashes, and the refreshed idle browser page reported “Live Dana is ready.”

## Try one moment again — September 5

After choosing **End encounter**, or completing ten questions, press **Try this moment again** on an eligible bookmark. You can also choose an earlier exchange in the original alternative panel and press **Try that moment again**. Speak one alternative question using the same Space, pause, thinking-time, and Hold controls. Dana answers with Marin. The original and alternative appear together with: “What changed in your wording, and what did you notice?” Reflection text remains only in the page and is discarded on Clear or leaving.

Each retry starts with a server-owned snapshot from immediately before the selected original question, including only the patient words acknowledged as heard at that time. It cannot use the original answer or later disclosures. Canonical disclosure state is recomputed from that prefix plus the alternative. One child session and one submitted alternative are allowed; there are no recursive retries or automatic resends. The original transcript stays unchanged. A failure before the microphone controller is created can recover on the same selected moment, reusing the one child session already allocated. A setup exception after controller creation stops and cleans up the alternative with an explicit Clear-and-start-over message. A failed spoken answer exposes its text and reflection controls without resending it.

The local browser loads the retry module only with the live conversation flag. This feature does not change learner-site navigation, the canonical case, or release status. It produces no technique ranking, communication score, or readiness claim.

### Conversation-quality benchmark

`dana-quality-benchmark.mjs` contains twenty synthetic dialogue fixtures with exact history, source references, disclosure expectations, and reviewer prompts. Running it normally checks fixture structure without provider calls. An explicit live run makes twenty sequential actor requests and no speech requests:

```bash
node _prototypes/sp-interview/dana-quality-benchmark.mjs
node _prototypes/sp-interview/dana-quality-benchmark.mjs --live --out output/speech/dana-quality-new-run
```

The September 5 sample recorded all twenty replies. Agent review found two clear issues: the garbled work-impact request was interpreted as a hearing-symptom question, and the unknown weight-change answer added an unsupported explanation about not weighing herself. A third answer ambiguously accommodated an unsupported family-event premise. These findings are recorded in the ignored local review packet; they are open response-quality work, not passing benchmark results. The sampled locked-plan question remained guarded, and the interrupted-prefix continuation used an already earned disclosure. Human/faculty semantic review remains unperformed.

A real integration check completed two original actor/Marin replies and one alternative, with seven native audio completions including the recorded opening. The original DOM stayed unchanged, the microphone stopped, reflection received focus, and Clear reset the page. Recognition was simulated and native playback muted; this checks integration and decoding rather than real microphone accuracy or perceived naturalness. Evidence: `output/speech/dana-practice-qa/live-results.json` and `retry.png`.

## Repair a misunderstanding during the encounter — September 5

After Dana replies, **Repair a misunderstanding** is available while Listening and before new speech begins. It pauses the microphone and shows only the latest reply's verified heard words, with the example opener “I think I misunderstood. Let me check…”. **Continue speaking** resumes the ordinary conversation so the learner can use their own words. The correction consumes the next normal turn; nothing is inserted, sent automatically, or removed from the transcript.

The option is unavailable during draft speech, including the interval between speech starting and the first transcript callback. This guard uses the controller's speech-activity state, including when a recognizer is handed over after headphone playback. **Dismiss repair** leaves capture paused. Hiding the tab closes the card and requires explicit Resume; End also clears it. An unfinished latest reply without a verified heard prefix cannot silently fall back to an older reply. The one-turn post-encounter retry remains separate.

The repair feature completed a real two-reply actor/Marin integration run with simulated recognition and five native audio completions. Opening the card made no API request; the correction used the same original session and next turn number, previous transcript entries stayed unchanged, and Clear reset the encounter. Native playback was muted. Evidence: `output/speech/dana-repair-refinement/live-results.json`, `repair-card.png`, and `repair-conversation.png`.

The separate `dana-quality-refinements.mjs` runner compares twelve targeted scenarios, with two samples each by default. These include noisy and clear requests, unspecified details, unsupported premises, and spoken topic repairs. It preserves exact histories and disclosure state, records prompt provenance, makes no speech requests, and leaves human semantic review explicitly unperformed:

```bash
node _prototypes/sp-interview/dana-quality-refinements.mjs
node _prototypes/sp-interview/dana-quality-refinements.mjs --live --out output/speech/dana-quality-refinement-new-run --repeats 2
```

### Response-quality refinement and current evidence

The live actor now uses the pinned GPT-5.4 snapshot with low reasoning. Both normal and streamed replies share the same constants; the Marin model, voice, playback speed, prefix validation, deadlines, and cancellation remain unchanged. The instruction order now prioritizes the current request, established facts, and natural conversational repair. Hash-bound information limits distinguish missing measurements, clinician identity, hearing acuity, and unspecified events from known negatives. No second actor call or silent regeneration was added between turns.

Prompt-only versions and a mini-model reasoning experiment continued to invent weighing explanations. The final 44-reply sample with the selected actor handled all five measured-weight/weight-repair questions without those explanations, and all three exact noisy-impact questions stayed on the work-impact topic. These counts describe the observed cases, not an automatic quality score or a claim of general reliability. All human/faculty review fields remain not_reviewed.

Remaining unsupported details appeared in other responses: a claimed husband preference that Dana should not be alone, speculation that she never learned the clinician's name, and an invented statement about not paying attention to hearing. A separate diagnosis probe added an unestablished account of what clinicians had told her. These are recorded fidelity issues; the prototype must not be represented as clinically validated or ready for learner deployment.

A final real actor/Marin browser check completed two replies and four native audio playbacks, including the recorded opening. The repair card generated no request and preserved the original session/history. First native playback occurred 4.584 and 3.015 seconds after the turn requests. Recognition was simulated and audio muted; these events do not establish acoustic recognition quality or perceived fluency. The earlier standalone stronger-model trial included one 8.651-second first actor response, so occasional longer waits remain possible. Full response generation uses more API budget than the previous mini actor.

Verification during the Dana response-quality refinement: full SP runner passed (353 node:test checks plus the existing direct contract suites); 61 browser scenarios passed; root static tests passed 1,768 checks. The headphone and delayed-first-result repair regressions failed before their fixes and passed after. Twelve deterministic red-team probes passed. Twelve additional live actor probes did not expose prompts, unlock restricted banks, give a medication dose or diagnosis, or add graphic method detail; the diagnosis probe's unsupported clinician statement remains noted above. This is a local partial checklist exercise, not a recorded faculty red-team sign-off or learner release.

Local evidence is under `output/speech/dana-repair-refinement/`: `final-targeted/review.json`, `final-original/review.json`, `agent-review.md`, `redteam.json`, and `final-playback/live-results.json`. Earlier failed experiments remain alongside them. The canonical pack and learner deployment are unchanged.

## Faster playback after Space — September 5

Space submits finalized speech immediately; it does not start another 4.5-second pause. The prior live path waited for the entire MP3 on the server and again for a complete browser download. The streaming path preserves the same reply model, case prompt, Marin model, delivery instructions, and natural playback speed, while letting native audio playback begin as bytes arrive.

A three-turn real API comparison used two muted native Chromium players consuming the **same single generated audio stream**: one began progressively, and one waited for the full file as the previous implementation did. These are synthetic recognized questions, not recordings of the user.

| Turn | Space to streaming voice | Space to full-buffer voice | Earlier start |
|---|---:|---:|---:|
| 1 | 3.894 s | 4.826 s | 0.932 s |
| 2 | 2.929 s | 3.721 s | 0.792 s |
| 3 | 5.605 s | 6.600 s | 0.995 s |

Both players finished every clip without browser errors. Streaming saved 0.8–1.0 seconds in these three comparisons (15–21%); it does not remove variable model/network latency. A separate controlled browser test holds back the final portion of a real MP3 and verifies playback starts before completion. Incomplete streams must fail the completion receipt and remain unheard in subsequent conversation context.

The Python SDK emits small MP3 chunks with a terminal byte count. The Node provider validates the stream prefix, bounds bytes, and requires clean completion. Partial failures, timeouts, and cancellation cannot become successful playback receipts. The server's audio/status/cancellation URLs expose no API key and never start a second speech request on replay.

The later missing-reply screenshot was reproducible by submitting with Space and pressing Space again while waiting: the original shortcut cancelled the request without a durable transcript explanation. The screenshot alone does not prove that was the user's historical cause. Space now only submits; Escape deliberately interrupts. Browser regressions cover the second Space, deliberate cancellation with late callbacks, and a request failure that stays annotated through Resume and a later successful question.

### Validated early speech — implemented September 5

Following the saved experiment below, the user asked to implement the refinement. The live provider now streams actor text into a private preparation callback. The server can synthesize one exact substantive prefix immediately, but withholds every audio token until the completed response passes `validateReply`, exact-prefix matching, and clean worker completion. These are format and identity checks, not a semantic factual-fidelity guarantee; the same canonical case-context and disclosure controls remain in force.

One or two ordered segments reconstruct the full reply exactly, including whitespace. No independent MP3 files are concatenated. The browser preloads both native players and checks every completion receipt independently while starting the next segment immediately. Escape, Pause, End, request failure, and invalid final text cancel the entire turn. A failed remainder cannot make the whole reply count as heard, even if the first segment finished. The old full-reply provider path remains supported for existing test adapters; the local OpenAI provider uses early preparation by default.

A real three-turn API/browser run verified the integrated path using simulated recognition and muted native Chromium playback at normal speed:

| Turn | Full validated metadata available | First playback event | Segments completed |
|---|---:|---:|---:|
| 1 | 4.496 s | 6.092 s | 2 of 2 |
| 2 | 1.750 s | 2.837 s | 2 of 2 |
| 3 | 1.755 s | 3.731 s | 2 of 2 |

All three exact segment joins reproduced their complete reply text; all six audio segments finished; every playback began after validated metadata. Native end-to-next-playing event gaps were 0.6–0.9 ms. These browser events do not measure acoustic silence or subjective naturalness. This run verifies actual integration, not a controlled speed comparison against the old path; actor/network variability remains visible in the first-turn delay. Evidence: ignored `output/speech/dana-refinement-qa/live-results.json`.

### First-sentence experiment — saved comparison only

The user approved experimenting with starting Marin on a completed opening sentence while Dana finishes composing the reply. `dana-first-sentence-experiment.py` remains a standalone benchmark; the implemented refinement above is separate. It uses the same case context, model pins, voice, and delivery instructions. Tiny acknowledgements are kept with a substantive following sentence. The exact streamed prefix must match the completed, validated actor reply before remainder synthesis starts. Failed experiments discard generated audio; they never play partial output.

Three real API runs used the screenshot's preceding conversation and fictional follow-ups. Each generated a lead clip, a remainder clip, and a separate whole-reply comparison with identical words. Timings below are first audio bytes received by the Python worker, **not measured first audible words**. The comparison speech jobs run concurrently, so these three samples are exploratory rather than a reliable latency guarantee.

| Question | Lead audio arrival | Whole-reply audio arrival | Earlier arrival |
|---|---:|---:|---:|
| What has been going on recently? | 2.260 s | 2.844 s | 0.584 s |
| Hardest part of a normal day? | 2.818 s | 3.568 s | 0.750 s |
| Effect on things with Tom? | 2.190 s | 2.736 s | 0.546 s |

All nine MP3s decoded successfully. The completed remainder file was available before the projected end of the opening segment in all three runs. This estimate does not establish the perceived sentence join or safe cancellation behavior in a live segmented turn. The screenshot's previously unanswered question produced an on-topic reply about the past two months and loss of interest.

The first run had only 118 ms of estimated remainder-readiness margin; network variability could erase it. The third split recording was 1.27 seconds longer overall than its whole-reply comparison. Run two also generated “I just sit there and stare at things,” a behavioral detail absent from the supplied fact inventory. These samples therefore assess voice and latency, not validated clinical dialogue. All lead audio arrived after the actor completed in these three runs: a useful next experiment is preparing lead speech early but withholding playback until final text and exact-prefix checks pass. That could preserve the observed gain without playing unfinished actor output; format validation still does not prove semantic grounding.

Saved samples and metrics are in ignored `output/speech/dana-first-sentence-experiment/`. While the existing static server is running, open <http://127.0.0.1:4318/output/speech/dana-first-sentence-experiment/index.html> for a side-by-side audition. Samples play immediately rather than simulating their initial generation wait. The experiment makes two speech requests per split reply; its additional whole-reply request is only a comparison. The later local refinement adds turn-owned ordered segments, cancellation across all jobs, and conservative partial-delivery handling. It does not change learner-release or hosted speech eligibility.

All six saved full/split comparison playbacks completed in native Chromium at normal speed without page or media errors. The test preloaded clips and muted playback; it verifies the ordered player and decoding, not acoustic delivery, network streaming, or the naturalness of the join. Results are in `browser-qa.json` beside the saved samples.

## Try the prerecorded version locally

From this worktree's repository root:

```bash
python3 -m http.server 4318 --bind 127.0.0.1
```

Open <http://127.0.0.1:4318/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1> in a browser that provides speech recognition. Press **Preview voice** to hear the recorded opening without enabling the microphone. Press **Start conversation**, allow the microphone, hear Dana's opening, and wait for **Listening** before speaking. The microphone starts only after this explicit action. Marin playback uses standard browser audio; device-voice mode additionally requires speech synthesis. A browser without speech recognition shows a typing fallback.

The ordinary local case-selection page now also offers **Talk with Dana**, which preserves the conversation-mode flag and opens a separate encounter. If speech recognition fails, **Copy conversation link** provides the same flagged URL to try in Chrome. Voice preview only checks playback; it does not check microphone input. Starting now explicitly reminds the user to allow microphone access if prompted.

The local opt-in bootstrap requests fresh versions of its prototype scripts on each page load. This avoids stale cached code in the embedded browser during development; the recorded MP3 library and its in-session playback cache are unchanged.

- **Voice playback** defaults to Marin's complete local library: **75 of 75 recordings**, generated September 5, 2026. Device voice remains available explicitly. Each reply plays its matching MP3 without a speech-generation request.
- **Dana’s voice** now prefers Samantha or an enhanced local English voice instead of the first alphabetically listed voice. Novelty voices such as Albert are excluded. **Preview voice** auditions the opening without starting the microphone or consuming an interview turn. Voice selection is locked while the conversation is listening or speaking; Pause to change it. Normal pace and pitch preserve the selected voice's intended sound.
- **Give me more thinking time** is off by default: Dana waits 4.5 seconds after finalized words and speech activity end. Turning it on uses 6 seconds. These timings need an actual microphone trial; neither setting scores pauses, speaking speed, or fluency.
- **Hold my turn** keeps listening without automatic submission. Release it to start the full selected pause, or choose Done speaking. Ordinary quiet speech-service endings reconnect instead of ending the encounter. A five-minute input limit and bounded rapid-restart recovery remain.
- **Let me interrupt Dana by speaking (use headphones)** is an explicit opt-in. The same recognizer is handed to the learner turn so the first words, including a negation, are retained. Dana waits for initial microphone readiness before playback. This mode is not echo-safe on speakers; no text-similarity filter tries to remove Dana’s voice.
- **Interrupt Dana** works during playback or while waiting for a reply. Escape also interrupts when focus is outside an input, button, link, or editable area. Interrupted recordings are marked in the transcript; their complete text remains visible. A reply cancelled before text arrives leaves an explanation beside the learner's question.
- **Done speaking** or Space outside a control finishes an already recognized question immediately. Both are optional; unfinished recognition is never forced through.
- **Pause**, **End encounter**, and hiding the tab stop the microphone and playback. **Resume** requires a click. Repeat an unfinished question after resuming; unsubmitted speech is not carried into a new capture.
- After ten learner turns and Dana's last response, the microphone stops and three reflection prompts appear. Teaching points follow self-reflection. There is no automated grade.
- Reload to begin another encounter. The typing link returns to the usual local Interview Room and starts a separate encounter.

Use fictional practice only. The page saves neither learner audio nor conversation text, but the browser may send microphone audio to its speech-recognition service. Patient playback uses the selected device voice or exact prerecorded Marin audio. Generating the Marin library requires a one-time OpenAI API batch; playing completed recordings makes no synthesis requests. The browser never receives the API key. Hosted managed speech remains disabled.

The URL flag works only on a loopback host in the generated mock preview. Ordinary learner pages and hosted previews cannot enable it. The prototype JavaScript files and generated recordings are absent from learner build assets.

## Implementation

`sp-interview.turns.js` owns listening, finalized questions, the pause timer, patient response, playback, and stopping after ten turns. `sp-interview.conversation.js` connects that controller to browser speech and the local screen. `sp-interview.responses.js` adds tightly scoped ordinary-language matching and social acknowledgement selection from the existing recordings, preserving the original learner transcript and canonical clinical state. A small opt-in bootstrap in the source HTML loads these modules; `generate-preview.mjs` produces the preview.

`sp-interview.recordings.js` verifies the current pack, all 75 exact patient lines, and each downloaded recording's byte count and SHA-256 hash. It plays a local audio file and caches it for reuse. Missing, mismatched, or failed audio stops visibly without selecting another line or silently changing voices. Pause/End cancels loading and playback; the complete patient reply remains visible. Resume moves to the next question, so use the visible text if the preceding recording did not finish.

```text
Start → Dana opening → Starting microphone → Listening
      → Finished question → Dana response → Spoken reply
      → Starting microphone → Listening … ten questions → Reflection
```

Greetings, apologies, purpose statements, and simple reflections from the user’s screenshot now receive existing acknowledgement recordings. Ordinary questions about rest, hunger, work, household, support, memory, and interests can reach their existing case responses. A clean “Can you say more about that?” can use an unplayed recording from the immediately preceding ordinary topic at the same openness level. Safety and mixed questions keep canonical precedence. Detailed follow-ups beyond the recording inventory still require new authored content; this is not a free-form language model.

Interim recognition never submits a question. Duplicate finalized callbacks do not create extra turns. A speech-service interruption during unfinished recognition asks the learner to repeat the whole question instead of answering a possibly truncated question. The display waits for actual service readiness before saying Listening. Late events after Pause or End are ignored. Stage directions remain visible but are removed from spoken output.

## Verification

| Check | Result |
|---|---|
| Full SP Interview suites, including bookmarks, retry, benchmark, heard-prefix memory, recordings, provider, and case contracts | All suites passed September 5; 399 node:test checks plus the existing direct contract suites |
| Dedicated prototype browser suite | 80 passed September 5, including Marcus/Ray case selection, direct bookmark retries, setup recovery, repair, delayed recognition, headphone handoff, and retry isolation |
| Existing Interview Room browser suite | 23 passed |
| Root static regression tests | 1,768 passed September 5 during the three-case expansion |
| Full `bin/verify.sh`, including sequential MS3 and resident builds | Passed September 4; not rerun for the September 5 prototype refinements |
| Generated preview reproducibility and whitespace check | Passed |

The speech tests inject recognition and playback events into the real controller and canonical scripted case. They prove the automatic flow and state parity; they do not prove acoustic recognition quality, audible timing, device compatibility, or naturalness. The repeatable recorded-audio browser tests use byte-hashed test fixtures. The three-case expansion passed the full SP suites, dedicated browser suite, and root static tests. The full repository build gate was last run September 4. The 23 existing Interview Room browser checks above are from the original prototype run.

The validated-early-speech review reproduced an integration defect with valid paragraph breaks and repeated spaces: the controller collapsed whitespace, while live audio was keyed by exact reply text. Two controller-plus-client regressions failed before the fix and passed after patient replies retained their interior whitespace. Learner-input normalization and device-speech stage-direction handling are unchanged. The local server on port 4319 was refreshed after the final 302/45 test runs, and the idle browser preview was reloaded; prior encounters need a fresh start.

On September 5, all 75 generated files passed full decoding and integrity inspection: mono 24 kHz MP3, 422.544 seconds total, and 6,760,704 bytes. There were no missing/extra MP3s, decoder errors, clipping samples, or abrupt-ending flags. One initial pause of about two seconds matches a line scripted with a long pause. The actual in-app browser selected Marin, displayed all 75 lines ready, and played the recorded opening. Technical checks do not establish exact spoken wording or naturalness; those remain part of the listening trial.

A separate September 5 test completed ten consecutive turns using the real generated MP3s and native Chromium audio playback at normal speed. All 12 playbacks ended (preview, encounter opening, and ten replies), with 11 local MP3 fetches because the opening was cached. The encounter finished at ten turns with the microphone off, without a composer, device synthesis, external requests, or browser/media errors. Recognition callbacks were simulated and playback was muted; this verifies actual decoding, playback, caching, and turn control, not acoustic recognition or listening quality. All 16 repeatable browser scenarios also passed again with the completed library present; device-voice tests explicitly isolate their missing-library fixture.

The full repository gate also reported 11 evidence-span rows requiring review in unchanged curriculum evidence; that report-only finding is separate from this prototype. Qbank coherence reported zero pairs to review.

Live input check, September 5: the user auditioned the opening and accepted Marin's voice. In the Codex in-app browser, both Start and a direct Resume reached a speech-recognition `network` error before any question was recognized. This reproduces the reported conversation failure; it does not establish the underlying network/provider cause. Chrome reached its normal microphone-permission prompt instead. The user later supplied a screenshot with recognized spoken turns, confirming they could converse, and identified premature cutoff and repetitive clarification as the next defects. The recovery copy now reports the actual connection error without assuming a previously working connection, and clearly separates voice preview from microphone input. All SP suites and preview reproducibility also passed after these changes.

Live reply audition, September 5: ten consecutive real API replies and Marin MP3s completed using the screenshot conversation plus deeper follow-ups. New audio took 3.17–4.88 seconds from turn submission, in addition to the selected end-of-turn pause. The offer to help elicited a relevant concern and preference; the husband follow-up remained on topic; unknown details no longer triggered a canned self-introduction. A final targeted check returned a brief unknown-doctor-name answer without inventing an explanation. The garbled “what Heard” turn still received a short clarification before relevant impact details, so recognition noise remains a conversational limitation. A sampled novel MP3 decoded cleanly as mono 24 kHz audio. This was synthetic API input, not a real microphone audition.

Six additional local actor probes exercised character switching, prompt extraction, a locked plan question, medication/dose advice, an unspecified symptom, and an unsupported family premise. They did not expose the prompt, reveal the locked plan, or provide medication dosing. These bounded observations and output-shape checks do not prove factual fidelity and are not the learner-release red-team sign-off. The next real microphone trial remains required before describing the experience as smooth.

To rerun the focused checks after installing the existing locked test dependencies:

```bash
node --test _prototypes/sp-interview/tests/conversation-*.test.mjs
npm --prefix tests/smoke run test:dana-conversation
bash _prototypes/sp-interview/tests/run-all.sh
```

The dedicated browser command starts and stops its own loopback server on port 4317. It does not change the normal CI or production browser projects.

## Morgan: local motivational interviewing case

The live chooser now includes **Morgan — What alcohol gives and takes**, a fictional adult discussing mixed feelings about alcohol after a medically stabilized fall. The case is authored in `sp-interview.local-cases.js` and loaded only by the explicit localhost live prototype. It is a **local draft with faculty review pending**. The canonical three-case pack and its review records are unchanged.

Open `http://127.0.0.1:4319/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1&case=sp_alcohol_ambivalence_001`. Morgan uses Marin, with one locally recorded opening and case-grounded live replies. They use they/them pronouns. Both the benefits and costs of drinking are ordinary facts; there are no earned secret disclosures or required abstinence ending. Withdrawal history and risk are explicitly unspecified and require clinical evaluation; this is not a withdrawal-management exercise.

Morgan's live actor receives no keyword-derived numeric rapport: negated pressure or labels must not be presented as low rapport. Their grounding digest includes the actor template and authoritative local facts/limits, so a changed template cannot silently add a diagnosis. The existing canonical cases retain their established context contract. The local recording manifest binds Morgan's augmented pack view; the three existing opening libraries retain their original pack hashes.

Verification on September 5: 417 SP node checks plus the legacy direct suites, 81 mocked browser tests, 1,768 root static tests, preview reproducibility, and diff checks passed. The Morgan MP3 fully decoded. A final real-provider browser smoke completed a spoken turn and an isolated alternative, with five native audio completions, original transcript/reflection preserved, same-case Clear, and no browser errors. Recognition was synthetic and audio muted; this does not establish microphone or audible voice quality. An earlier extended smoke completed three live replies but its test script then addressed the wrong bookmark ID; the corrected final smoke passed. Two additional actor-only probes preserved autonomy in a negated instruction and declined to infer abrupt-stopping safety from medical stabilization. These samples are bounded checks, not a faculty review or comprehensive clinical validation.

The separate [family-visit system plan](../../docs/superpowers/plans/2026-09-05-family-visit-simulator.md) now has a local [Morgan/Maya family runtime](FAMILY_VISIT.md) on port 4320. It provides separate actor knowledge, explicit targeting, private check-ins, ordered Marin/Cedar playback, operation budgets, and an isolated whole-room retry. Launch it with `start-family-live.command`; it remains a draft pending faculty review and does not activate a learner-site case.

## Next trial

Try Morgan with an open invitation, a reflection of both sides, a question about what matters, and an invitation to consider their own next step. Bookmark one moment and try a different reflection after ending. Listen for natural responses and preserved choice rather than trying to elicit a prescribed commitment.

Choose Marcus and try five turns that require calm redirection, then choose Ray and try five turns that require building trust. Use pauses and one repair, bookmark a moment, end, and ask that moment differently. Check that the voice and responses feel distinct while the selected person and earlier situation remain consistent. These listening trials are the next step before showing the set to Kaitlin.

Start a fresh live encounter and bookmark two exchanges, including one while Dana is speaking. End the encounter and check that the moments match what you intended to revisit; write one optional reflection and leave the other blank. Use **Try this moment again** on the intended bookmark, speak one alternative, and confirm its original question matches that bookmark. Check that the original conversation and notes remain intact and another alternative cannot be started. Then Clear.

Try a ten-question microphone encounter, end it, and choose one moment to ask differently. Verify that the alternative uses the earlier situation and that the original remains visible. The next response-quality work should target the benchmark’s noisy impact question and unsupported explanation, with variants and repeated samples before making a quality claim. A later experiment could pair clear and noisy versions of the same question to reveal topic changes caused by transcription.

Run a real ten-question microphone audition, first with headphones and then speakers. Try both pause settings and include a hesitation, a correction, a resumed question, microphone denial, and Pause/Resume. Observe cutoffs and response delays without recording the learner or assigning a performance score. Do not call this a smooth live conversation until that trial succeeds.

Hold my turn and optional headphone spoken interruption are implemented locally. Their automated tests exercise lifecycle and event ordering; they do not establish real-world echo rejection. Live mode uses conversation context for new replies and reuses approved audio only on exact wording matches. Validated early speech is now the local OpenAI path; the separate paired samples remain available for comparing delivery. Next, try five to ten real microphone turns with pauses, an interruption, and a deeper follow-up. A further experiment could choose a longer opening phrase when the predicted remainder would otherwise arrive too late, without changing Dana's words or playback speed. The live prototype still needs real conversational and factual-fidelity evaluation before any learner release.

## Completed Marin library

The user authorized one recording of each canonical line with OpenAI's stock Marin voice. The batch contains 75 unique lines and 5,969 spoken characters after removing visual stage directions. The selected model is `gpt-4o-mini-tts-2025-12-15`, with a measured, conversational, emotionally understated delivery based on Dana's existing persona. All original dialogue words remain unchanged.

Generation completed using the user-approved **SP-INTERVIEW** key in **Psychiatherapy / Default project**. The prior session key belonged to another organization; that mismatch was the source of the billing errors. The new key is stored in the approved ignored env file outside the served preview folder. It is not needed by the browser or included with the recordings.

Completed local files:

- `output/speech/dana-marin-v1/catalog.json`: all source/spoken text identities and 75 stable MP3 filenames.
- `output/speech/dana-marin-v1/generation-plan.json`: model, voice, exact delivery instructions, current-pack fingerprint, and completion status.
- `output/speech/dana-marin-v1/manifest.json`: all 75 verified recordings, file hashes, byte counts, durations, and source-text identities.
- `output/speech/dana-marin-v1/*.mp3`: the 75 real Marin recordings. The temporary JSONL batch input was removed after generation succeeded.
- `output/speech/dana-marin-v1/technical-qa.json` and `playback-qa.json`: file-decoding and real-browser playback evidence.

The batch used the bundled speech CLI with `gpt-4o-mini-tts-2025-12-15`, `marin`, MP3 output, normal speed, 40 requests per minute, and one configured attempt per job. Delivery instructions specify a reserved, tired, understated conversational Dana, without added words or sound effects. The exact instructions remain in the generation plan.

Do not regenerate the full library for ordinary playback. If a future line needs replacement, inspect existing clips and regenerate only missing or invalid files, then deliberately finalize a matching complete manifest. The library stays in an ignored local output directory, outside Git LFS and learner builds. Listen to the opening and representative guarded/open replies before describing the voice as suitable for a learner pilot. No faculty release status is changed by generation.
