# Family reply diagnosis and information replay

September 6, 2026. Local `codex/dana-spoken-prototype` only. Follow-up to the [Claude review response](2026-09-06-claude-review-remediation.md).

## Diagnosed failure

The new live reproduction reached Morgan's private answer, returned to the shared room, completed Morgan's public acknowledgment, and stopped at Maya's opening. Content-free diagnostics identified `callback_rejected`, `lead_callback`, `causeCode: invalid_reply`, with the server-selected participant `maya`. A single additional actor-only probe using the same fictional conversation captured the rejected opening: `[Shared conversation] That makes sense to me.` No speech request was made by that probe.

The model copied internal audience metadata into its spoken output. The bracket rejection correctly refused that format. Actor history had supplied labeled utterances from both participants as assistant examples, encouraging both the tag and speaker confusion. This reproduced failure was in local output validation, not authentication, credit limits, or microphone handling. The older failure has no retained actor text, so its exact cause cannot be proved retroactively.

Changes:

- Only the current actor's completed speech in the current channel is a plain assistant example. Other participants' speech and own memory from another channel remain labeled context records. Addressee labels, ordering, owner-only routing, and completed-only history remain enforced.
- Output instructions explicitly exclude room metadata. If the model nevertheless starts a public answer with the exact server-authored `[Shared conversation] ` prefix, the server removes that single prefix only after preserving the original streamed-prefix identity. The entire cleaned answer must pass validation before any speech or caption appears. No additional actor request is made. Unknown, private, repeated, wrong-channel, or speaker labels remain invalid.
- Replies using private memory still wait for complete output and the existing secondary phrase guard. Cleaning a label cannot bypass it. That guard is lexical and does not prove absence of every paraphrase, implication, or confirmation.
- A separate offline defect rejected valid quoted opening/ending sentences because a whole-reply rule was applied to fragments. Quoted openings now wait for the completed answer; family ending fragments rely on complete-reply validation. Entirely quoted final replies, malformed output, mismatched/duplicate prefixes, failed completion, and cancellation remain rejected. The same opening correction applies to the single-patient server.

Both local servers now expose allowlisted failure categories, stages, elapsed time, and bounded counts. Family server events may include the fixed participant ID. Raw error messages, provider IDs, prompts, replies, keys, and stacks are excluded. The last-failure list holds at most 12 entries. These diagnostics are process-local and do not create a persistent learner transcript or billing ledger.

## Evidence

- New quote cases and history-projection regressions failed before their respective changes; targeted checks then passed. The exact audience-label recovery initially failed before its fix, including the private-guard check.
- Full SP runner: **547 node:test checks plus legacy direct suites passed**. `output/reply-diagnosis-sp-tests.log`.
- Root static suite: **1,776 passed**. `output/reply-diagnosis-root-tests.log`. Run after the SP runner to avoid their shared-fixture collision.
- Existing mocked browser suites: **44 family and 91 single-patient checks passed**. `output/diagnosis-family-browser.log`, `output/diagnosis-dana-browser.log`.
- Actual Python worker → JS provider → family HTTP differential: **47 offline runs passed**, including 15 streamed/nonstream pairs, 14 failed/malformed/cancelled/wrong-channel cases, and 3 private-memory disclosure checks. `output/speech/quoted-fragment-diagnosis/`. No API calls in this differential. Source hashes and rerun instructions are retained there.
- Final real-provider browser sequence: private Morgan reply → rejoin with both participants → Maya follow-up. **4 actor replies and all 8 native audio segments completed**, no captured browser/API/diagnostic errors, no private drinking quantity in the shared replies. `output/speech/reply-diagnosis-live-qa/report.json` and `family-completed.png`. Space-to-first-playing samples: 3.59, 4.27, and 2.88 seconds; these three samples are not a service-level latency measure.

The live browser check used synthetic recognition and muted native playback at 2x. It establishes completion/decoding of this sequence, not physical microphone performance, subjective voice quality, screen-reader performance, faculty approval, or semantic privacy in all possible conversations. The ordinary desktop browser could not be inspected because the Mac was locked; the fresh browser automation above completed independently.

The corrected family preview is available on port **4326**. Existing earlier preview servers were not replaced. Restarting `start-family-live.command` loads current files on its ordinary port 4320.

### Observed usage for this diagnosis pass

The failed reproduction, one actor-only probe, and final successful run together recorded **8 actual actor attempts: 6 completed and 2 failed**, and **12 completed speech operations**. Reported actor usage totals **8,129 tokens across 6 reported responses**. The two failed actor attempts and all binary speech operations provided no token usage. Their token use and the dollar total are unknown; `costUsd` stays null. These figures describe this diagnosis pass only. Rejected or interrupted work is not assumed free.

Synthetic diagnostic captures are in narrowly ignored QA folders, separate from normal in-memory encounter state. The original failed evidence is retained. The canonical pack, production proxy, faculty review records, and learner deployment have no changes from this pass.

## Proposed innovative idea: information replay

This is an explanation and interactive concept, not a new feature wired into the encounter.

After finishing, choose a bookmarked question and open **What information was available?** Freeze the moment immediately before the learner asked it. Switch between the learner, Morgan, and Maya to see the information available to each person and its source. Show only material the learner has already encountered; never turn the replay into an answer key for undisclosed case facts. Shared statements, own private exchanges, and authored background stay distinguishable. Incomplete playback is labeled uncertain rather than treated as heard.

Example: Morgan tells the student their drinking amount privately. After rejoining, the student asks Maya, “Now that you know how much Morgan is drinking, what concerns you most?” The replay shows that the question assumes knowledge not established in Maya's shared conversation. It does not claim what Maya felt, understood, or legally consented to.

A reflection prompt can ask: “How could you check what Maya knows while keeping Morgan's private disclosure separate?” A possible alternative is: “Maya, what have you understood about what brought Morgan here?” The original visit and other actor's context remain unchanged.

Next best implementation: one optional post-encounter button attached to an existing bookmark, using the saved pre-question state and exact completed quotes. This deterministic replay needs no additional language-model or speech-generation call. The next experiment after that could be a permissioned bridge where Morgan explicitly approves one exact statement for sharing; remembering, replaying, and authorizing disclosure must remain separate operations.

### Implementation follow-up

The user subsequently approved adding the optional replay. It is now implemented by `family-information-replay.js` and the finished-bookmark controls in `family-visit.js`. It uses completed conversation entries only, with the prefix verified against `beginTurn` snapshots and actual participant dialogue projections. It deliberately omits all unspoken authored background rather than exposing an answer key. Both private channels, uncertain audio, detached output, first and unanswered questions, original-versus-retry state, and malformed record rejection have regression coverage.

See [Family Visit instructions](../../../_prototypes/sp-interview/FAMILY_VISIT.md) for the current flow. This new local version is served on port 4327 and needs no paid provider call for replay. The permissioned sharing bridge remains unimplemented.
