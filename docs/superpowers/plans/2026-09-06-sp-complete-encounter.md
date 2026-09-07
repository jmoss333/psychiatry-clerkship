# Complete spoken SP encounter implementation plan

**Goal:** Implement all five approved realism features across the four single-patient spoken cases and Morgan/Maya family meeting, for medical students training toward MD or DO degrees.

**Spec:** The five numbered ideas in the September 5 conversation: sustained patient agenda/reactions; natural conversational rhythm; complete student encounter; authored observable cues; exact-word patient-perspective debrief including two family perspectives. The user authorized implementation of all five. No new approval checkpoint is needed for local implementation.

**Architecture:** Shared case profiles, rhythm helper, and station UI extend the existing capture and audio paths. Existing server-owned case histories remain authoritative; portrayal instructions cannot grant disclosures or grade learners. Family-specific integration retains explicit targets, private audiences, ordered receipts, and original/alternative isolation.

**Global constraints:** Existing isolated worktree; preserve unrelated work and canonical pack. Local draft pending faculty review. No learner deployment, recorded learner audio, persistent personal transcripts, copied instruments, dosing advice, scores for speech/accent/speed/empathy, or inferred readiness. Use the same educational objectives for MD/DO students. Keep 4.5/6-second timing, Hold, Space, interruption and error recovery. Optional station time does not terminate or grade a slow learner.

## Work packages

- [x] Shared profiles (`sp-encounter-profiles.js`): exact existing case IDs, door notes, requestable source-labeled chart context, agendas, portrayal directions, sparse observable cues, handoff prompts, and evidence-linked reflection. Unknown clinical facts stay unknown; cues are authored fiction, not inferred emotion. Tests bind reflection to the selected literal learner quote and completed replies.
- [x] Rhythm (`sp-encounter-rhythm.js`, conversation adapter): short final acknowledgments allow patient speech to continue. Substantive/negative continuations interrupt and transfer all first words. Recognition is explicit opt-in with headphones while a voice is playing; otherwise keep button/keyboard interruption. Family floor request follows completed public exchanges, and requires invite or defer. Test no auto-generation, private suppression, no mic after stop, no lost negation.
- [x] Shared station UI (`sp-encounter-ui.js`, source HTML/preview): door note/task, chart requests, optional accommodated timer, observable cues, natural-close prompt, a spoken or typed attending presentation kept separate from patient requests, exact-quote debrief and existing retry. Expose mount/update/requestClose/dispose so family uses the same workflow. Tests cover case switch, repeated events, lifecycle, storage absence, and quote integrity.
- [x] Root integration: augment single/family actor instructions with case-specific priorities and persistent actual interaction events; preserve snapshots and role boundaries. Wire family station/rhythm, private checks, floor invite/defer, cues and debrief. Extend local server static allowlists for the new modules. No extra speculative actor requests for cues, acknowledgments, chart cards, handoffs, or reflections.
- [x] Verification: focused unit/server tests, all existing SP suites, all existing browser scenarios plus new complete encounters on desktop/mobile and every case; source-preview reproducibility; root static checks; actual provider/audio sample with synthetic recognition; visible fresh browser preview. Audition speech transitions and fact consistency with bounded samples. Actual human microphone/faculty experience remains a separately named validation boundary, not something mocks certify.

## Interface contract

`SPEncounterProfiles.getProfile(caseId)` returns immutable authoring or null. `buildPortrayalInstructions(profile,{roleId,events})` returns grounded portrayal instructions. `buildReflection(profile,{exchanges,selectedId})` returns an exact quote, completed replies, possible perspectives and separate teaching questions. Exchanges identify a learner turn and named completed/interrupted replies.

`SPEncounterRhythm.createListener({createInput,onReady,onConnecting,onAcknowledgment,onInterrupt,onError})` returns start/stop/takeInput. Taking input transfers the running recognizer and buffered words after room cancellation. `createFloorRequests({participants})` exposes next(events,channel)/invite/defer; it creates no actor call.

`SPEncounterUI.mount(host,{window,caseId,profiles,createSpeechInput,onPause,onResume,onEnd,onRepair,onRetry,afterHost})` returns update(snapshot), requestClose(), dispose(). Update accepts single-patient transcript or explicit family events/channel/retry identity. Family role and private audience labels must survive conversion.

## Completion evidence ledger

September 6: inspected authoritative dirty worktree and current goal. Existing family and four-case implementations remain intact. Prior goal turn classification: progress (new active implementation goal; read-only evidence changed decomposition). Three parallel tasks now own separate profiles/rhythm/station UI files; root owns backend and family integration. No implementation claim yet.


## Completed September 6

All five packages are implemented across Dana, Marcus, Ray, Morgan, and Morgan/Maya. The original canonical pack is unchanged. The new modules are confined to opt-in local prototype loaders and explicit loopback server asset allowlists, not the learner build registry.

Verified evidence:

- `output/complete-encounter-sp-tests.log`: all legacy direct suites plus **485 node:test checks passed**. A first concurrent run collided with a root test's temporary COTW fixture; sequential execution passed. A stale four-script bootstrap assertion was corrected to verify all seven intended cache-busted prototype scripts, then the complete suite passed.
- `output/complete-encounter-root-tests.log`: **1,776 root static checks passed**.
- `output/complete-encounter-dana-browser.log`: **87 single-patient browser checks passed**, including all four full station journeys and existing ten-turn, cancellation, recordings, repair, bookmark, and retry behavior.
- `output/complete-encounter-family-browser.log`: **38 family desktop/Pixel 7 checks passed**, including the shared station, review-channel privacy, delayed cancellation/channel changes, page exit, unfinished-word protection, acknowledgment playback, listener transfer, and closing-panel wait.
- A final private-room cue correction prevents the active person from looking toward someone absent from the private check-in. The **21 profile/context/UI checks** and **two desktop/mobile private-channel checks** passed afterward (`output/complete-encounter-private-cue-browser.log`).
- Source/generated-preview reproducibility, syntax, and diff checks passed. Independent reviews caught and corrected the headphone startup timer, retry-state alias, private cue/reflection separation, interruption turn numbering, late microphone resumes after page exit, repair during an unfinished utterance, and returning before cancellation settles.

Actual-provider/native-audio evidence:

- `output/speech/complete-encounter-single-qa/report.json`: all four cases, **eight original live turns**, **15 generated segments plus four recorded openings**, all 19 native audio completions; no page/audio errors; exact quote reflection, typed and dictated attending presentation, and Clear passed. Handoff/reflection made no additional patient API call. Space-to-native-playing events ranged **2.74–3.84 seconds**, median **3.25 seconds**.
- `output/speech/complete-encounter-family-qa/report.json`: **four learner turns / six actor replies / 11 native audio completions**, including introduction/agenda, correcting an assumption, Maya private check-in, rejoin, and closing summary. Public/private reflection selection and typed handoff added no patient-response request. Clear left no active recognizer. Initial native playback ranged **2.99–5.95 seconds**; the first both-person request was the slowest.
- The recorded samples use synthetic recognition and muted native Audio at 2x speed. They prove API integration and browser decoding/playback, not physical microphone accuracy, human-perceived naturalness, clinical approval, or a latency guarantee. The family private sample elicited existing public support preferences; protection of genuinely private details is covered by server projection/regression tests and earlier separate QA, not proved by that sample alone.
- Bounded transcript review found continuity through corrections, no role swaps or newly observed case contradictions in these samples. Marcus recalled the student's inability to promise a discharge decision; Morgan kept autonomy and ambivalence; Ray returned to an unanswered information-sharing question. Open model dialogue remains subject to faculty review.

The local family preview was visually inspected in the ordinary browser in a fresh zero-turn state with microphone off. A current independent review prompt is at `docs/superpowers/plans/2026-09-05-claude-sp-encounter-review-prompt.md`.

Next best step: a short human microphone encounter in a single case and the family case, then faculty review of the exact prototype and representative transcripts. A future permissioned private-to-public bridge could let a participant choose one statement to share while keeping the rest private; it is not implemented or silently assumed by the current channel system. These five features are complete as local draft functionality; no production release or faculty attestation is claimed.

## Subsequent independent review

Claude's September 6 review was checked against the current implementation. The follow-up corrected the local Dana direct-safety gate, owner-only private memory, addressee labels, completed-caption reading, and new process-local token accounting. It also distinguished comments about the older build from remaining limitations. Current results, the live failure retained for investigation, and the exact scope of the private-phrase guard are in [the review response](2026-09-06-claude-review-remediation.md). The dated completion counts above describe the earlier feature pass, not this later correction.
