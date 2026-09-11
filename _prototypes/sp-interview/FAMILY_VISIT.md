# Local Family Visit

Morgan and their adult daughter Maya practice a voluntary family meeting after Morgan's medical stabilization. This is a fictional, unshipped draft pending faculty review. The original single-patient cases and canonical case pack are unchanged.

## Open the visit

Double-click `start-family-live.command` on this Mac, or run it from this worktree's repository root:

```bash
./_prototypes/sp-interview/start-family-live.command
```

The launcher selects the existing approved `.env.dana.local` from the main checkout and supplies the shared runtime automatically. It never sends the API key to the browser. Keep its Terminal window open while practicing.

Open <http://127.0.0.1:4320/_prototypes/sp-interview/family-visit.html>. The separate Dana/Morgan single-patient server can keep running on port 4319. A `file:` URL or a static server cannot provide live family responses.

## Try a meeting

1. Choose **Start family visit**. You begin the meeting; neither person gives an automatic paid opening.
2. Select **Ask Morgan**, **Ask Maya**, or **Ask both**. The selection stays visible and persists. Keys 1, 2, and 3 select a target outside form controls.
3. Speak normally. Finish with **Space** or **Done speaking**, or wait 4.5 seconds after the last words. Extra thinking time allows 6 seconds; Hold my turn waits for explicit completion. No speaking speed or pause score exists.
4. Morgan uses Marin and Maya uses Coral. Both produces two ordered responses. **Interrupt the room** or **Esc** stops the current voice and removes the queued reply. With the explicit headphone setting, short acknowledgments let the speaker continue; a substantive response interrupts and carries its first words into the next learner turn. On speakers, use the button/keyboard interruption. Participant audio remains ordered, one voice at a time.
5. Use a private check-in once the current exchange is complete and the draft is empty. The case explicitly allows both check-ins. After rejoining, each person remembers their own completed private exchange. That memory is labeled private in their actor context; it never enters the other person's context or shared captions. Remembering does not authorize sharing its details.
6. Bookmark an exchange, end the visit, and optionally write a local reflection. **Try this moment again** restores the selected moment's target, channel, case, and completed history. Choose **Resume** to start its microphone. One alternative leaves the original conversation and notes unchanged.
7. After ending the original visit, choose **What information was available?** beside a bookmark. Switch between **You, the student**, **Morgan**, and **Maya** to compare the earlier conversation record. The replay stops immediately before that question, separates shared dialogue from each person's own private check-ins, and counts unconfirmed audio without displaying its unfinished words. Close or Escape returns to the bookmark. Arrow keys, Home, and End move between the person tabs.

A helpful opening is: “What would each of you most like us to understand today?” Then explore Morgan's choices, Maya's limits, a disagreement, a repair, and a possible next step. Remaining uncertain or disagreeing is allowed.

## System boundaries

- `family-visit-case.mjs` authors the two perspectives; `family-visit-state.mjs` selects the facts and history each actor may receive. The family packet is hash-bound and checked against Morgan's source baseline.
- `family-live-server.mjs` is an independent loopback server. It validates explicit targets, channels, request identity, bounded response shapes, and ordered playback receipts. The existing provider supplies live text and streamed voice.
- `family-visit.js` manages the two speaker cards and native audio. Shared `sp-interview.turns.js` retains recognition, pause timing, Space, and cancellation through opt-in external-delivery and initially-paused flags.
- `family-information-replay.js` reconstructs earlier dialogue from the finished original record. Its time boundary is checked against the actual saved turn snapshot. It displays no unspoken case inventory and makes no network, model, speech, or storage call. Switching views never changes another participant's context or grants permission to disclose.
- Only complete, validated sentence segments count as heard. Interruption never estimates spoken words from elapsed time. Unvalidated or unfinished text remains visibly unconfirmed. Receipts establish browser playback completion, not proof that a human listened.
- An original visit has at most 10 learner turns and one one-turn alternative. The process caps actor calls at 60, speech calls at 60, active provider calls at two, and sessions at eight. A both-person exchange reserves its entire allowance before starting. Cancelled or uncertain work is not refunded as if it were free.
- Server history and generated audio live only in memory for up to 30 minutes. Clear and leaving request deletion, including the alternative. Lost connections fall back to expiry. Learner notes never leave page memory. No browser storage, learner-audio recording, transcript export, clinical decision, or readiness score is implemented.
- A failed stop leaves recognition off and exposes Clear. Neither a failed response nor a failed cancellation silently resends the learner's words.
- The local health page reports process operation counts and provider-reported token totals, with coverage counts. Missing usage is unknown, not zero. These figures reset when the process restarts and do not reconstruct earlier spending or provide a dollar bill.

The turn coordinator enforces who can speak and what dialogue they receive; model adherence to fictional facts still needs human review. Clinical history outside the authored packet, medical clearance, withdrawal treatment, capacity, and legal permissions are not generated conclusions.

## Verification and remaining work

The automated family fixtures cover target order, native-completion receipt boundaries, cancelled queues, private facts, both retry-channel directions, exact snapshots, failed-stop recovery, limits, request validation, expiry, and deletion. Run:

```bash
bash _prototypes/sp-interview/tests/run-all.sh
cd tests/smoke
npm run test:family-visit
```

September 5 verification: all 454 SP node checks and the legacy direct suites passed, including 25 family-server and 9 family-state/case checks. All 18 family desktop/mobile browser checks, 81 existing single-patient browser checks, 1,768 root static checks, preview reproducibility, and diff checks passed. Independent review found and corrected a retry-channel mismatch and the deleted-alternative lifecycle; failed-stop recovery also has a browser regression.

The final real-provider run completed three scenes: cooperative visit plus isolated alternative, disagreement/interruption/repair, and a private disclosure followed by a public question to Maya. It completed nine original learner turns across those scenes, one alternative, and 23 native audio segments, with no browser or captured API errors. It preserved the original notes/transcript, suppressed the queued second speaker on interruption, and kept Morgan's private quantity out of Maya's answer. Initial browser playback began 2.69–3.96 seconds after Space in nine samples (median 3.23 seconds). This is a small local sample, not a service guarantee or p95 benchmark.

The first exploratory live run stopped on an unclassified response failure after Morgan's fourth-turn reply; that error's code was not captured. The repeated final run with error capture passed all three scenes. Do not describe the earlier issue as a diagnosed or proven-fixed provider defect. Normal API failures remain visible and pause the visit without resending the question.

Real-provider QA uses synthetic recognition and muted native browser audio at 2x speed, so it does not establish physical microphone reliability, audible voice quality, or faculty approval. The final local report and screenshots are under `output/speech/family-native-qa-final/`; the earlier run is retained under `output/speech/family-native-qa/`. These are synthetic local QA artifacts, not learner artifacts. Bounded agent review found no unsupported case facts, private leakage, or role switches in the final sampled replies. Faculty semantic review and the governed learner-release red-team sign-off remain unperformed.

Next: a short human microphone audition, followed by faculty review of this specific case and representative encounter transcripts. Third relatives, a permissioned bridge from private to public dialogue, persistent usage accounting, and learner-site integration remain future work; see the [system plan](../../docs/superpowers/plans/2026-09-05-family-visit-simulator.md).

## Complete student station — September 6

All five approved realism features are implemented in this local prototype and the four single-patient cases:

- Shared profiles add ongoing patient priorities and continuity through correction and repair. Portrayal instructions supplement the authoritative case; they do not grant disclosures or infer rapport from controls.
- With headphones, brief acknowledgments allow ongoing speech and substantive words interrupt. After two completed public exchanges directed to one person, the other can request the floor. Invite selects the next addressee so the learner can invite them in their own words; it generates no automatic patient turn. Private and unfinished exchanges do not trigger requests.
- The station starts with a door note, task, and source-labeled chart information available on request. Its optional 8/10-minute clock can be doubled, paused, or extended; it pauses during reply preparation and never forces an ending. A prompt near the final turns leaves room to summarize. End pauses the visit and offers a return to the patient before closing.
- Sparse authored observations identify visible behavior without assigning an emotion or diagnosis. Channel changes clear private cues. An explicit repair cue is not proof that a repair succeeded.
- After closing, the learner can present to an attending by typing or browser dictation, then reflect on an exact exchange. The shared reflection shows only completed replies and possible perspectives from participants who actually replied. Public and private review contexts are selected explicitly; changing the review selection makes no room or provider request. Existing alternatives preserve the original. Dictation stops during an alternative, on hiding, and on Clear.

Chart requests, cues, acknowledgments, timers, attending presentation, and authored reflection make no patient-response API call. Browser dictation can still use the browser's recognition service; it is not an offline speech-recognition promise. No speaking-speed, accent, fluency, personality, empathy, or readiness score is added.

The five-feature build is recorded in [the completion ledger](../../docs/superpowers/plans/2026-09-06-sp-complete-encounter.md); subsequent corrections and current verification are in [the Claude review response](../../docs/superpowers/plans/2026-09-06-claude-review-remediation.md). Family browser coverage includes delayed cancellation/channel change followed by page exit, retaining unfinished learner words before repair, and waiting for cancellation before returning from the closing panel.

## Claude review corrections — September 6

Each learner turn now names its addressee in actor history. Morgan hears that a question was addressed to Maya, rather than treating every question as directed to Morgan. Each actor retains only their own completed private dialogue; the unasked private fact inventory stays out of public requests. Rejoining does not add private words to the public transcript or imply permission to share. Public portrayal allows acknowledging a private check-in or asking to clarify what may be discussed together.

When a public reply draws on that private memory, the server waits for the complete reply before publishing any sentence or starting speech. A secondary check blocks repeated private phrases that are not already public. It catches literal phrases and basic number variants, but does not prove that every paraphrase, implication, or confirmation is safe. Owner-only context routing is independently enforced. A permissioned sharing workflow and broader semantic validation remain future work.

**Pause after replies so I can read completed captions** is an opt-in preference. It announces each completed speaker and caption once and leaves the microphone paused until Resume. Focusing the conversation log also holds an unfinished turn while it is read. The ordinary empty silence timer cannot submit an empty turn. These automated checks do not replace an actual screen-reader and microphone audition.

## Reply-format diagnosis — September 6

A reproduced Maya reply copied `[Shared conversation]` from labeled actor history and was correctly rejected as non-spoken metadata. Actor examples now contain only that actor's own plain speech in the current channel. Other speakers and private memories retain audience labels as context. One exact leading public audience label can be recovered after the original streamed prefix and the complete cleaned reply pass validation; arbitrary labels, stage directions, and private disclosures remain blocked. Quoted sentence fragments also wait for appropriate whole-reply validation.

Health diagnostics now distinguish provider, protocol, and local validation failures using safe fixed codes, with no stored dialogue or raw errors. The [diagnosis record](../../docs/superpowers/plans/2026-09-06-sp-reply-diagnosis.md) includes the exact reproduction, passing regressions, and a successful live private → both → Maya sequence.

## Optional information replay — September 6

The approved information replay is now connected to the finished original visit's bookmarks. It shows the learner's exact question, channel, and addressee above a view of prior completed dialogue for the selected person. The question itself, its response, and later information never enter that prior record. Hidden actor background is deliberately omitted. A participant's view can report that other private entries were excluded, but never exposes those entries' words.

The feature does not infer listening, understanding, emotions, permission, or competence. Audio completion is a browser receipt, not proof of human listening. Opening or switching replay views makes no request, starts no microphone, and generates no audio. It leaves the original notes and conversation unchanged, disappears while an alternative is open, and is removed on Clear or page exit. It is available again after returning to the original reflection.

The new local preview uses port **4327**; prior encounter tabs were preserved. Restarting the normal family launcher loads the same files on port 4320. A permissioned bridge to share one exact private statement remains future work and is not authorized by the replay.

Verification: 26 replay projection checks, all 573 SP node checks plus legacy suites, 1,776 root static checks, and all 50 family browser checks passed. The new browser cases exercised temporal/private separation, zero requests and microphone/audio starts from replay, keyboard focus, preserved notes, retry isolation, and Clear on desktop and mobile. The actual port-4327 page was checked for the correct title, ready controls, the loaded replay module, and no script errors. Tests used synthetic dialogue and microphone/audio doubles; no paid provider call was made for this addition. Actual screen-reader audition remains a human check.
