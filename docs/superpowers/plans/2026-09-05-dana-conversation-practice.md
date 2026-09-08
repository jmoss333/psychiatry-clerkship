# Dana Conversation Practice Implementation Plan

> **For agentic workers:** Implement the three bounded work packages below in the existing Dana worktree, with independent review and fresh verification after integration.

**Goal:** Improve conversation consistency and interrupted-turn continuity, then let the learner practice one earlier question again without changing the original encounter.

**Architecture:** A server-owned prefix snapshot anchors each eligible original exchange. Finished original sessions retain snapshots in memory for one isolated retry child; deletion and expiry remove both. The browser reports only verified completed audio-segment counts, while the server determines which exact words can enter history.

**Tech Stack:** Existing plain JavaScript controller/browser adapter, local Node HTTP server, Python OpenAI SDK worker, node:test and Playwright.

**Spec:** User-approved priorities in this conversation, and `_prototypes/sp-interview/DANA_CONVERSATION.md` for the current local prototype contracts.

## Global constraints

- Local disabled prototype only; no learner deployment, canonical case edits, or release-status changes.
- Fictional practice only; credentials remain in the approved server environment.
- Preserve Marin, current model pins, 4.5/6-second pause choices, Space to send, Escape to interrupt.
- No storage, export, numeric communication score, winner, readiness or entrustment claim.
- One retry branch and one alternative learner turn per original encounter; no recursive retries.
- Original transcript and case state remain unchanged by retry.
- No automatic retry of a provider call; existing global attempt/concurrency/size limits cover child sessions.
- Finishing stops microphone/audio. Clear, navigation away, or the existing 30-minute expiry deletes original and child server data. Copy must explain temporary in-memory retention for reflection/retry.

## Work package 1: Conversation-quality benchmark

**Files:** new `dana-quality-benchmark.mjs`, twenty fixtures under `fixtures/dana-quality/`, and `tests/conversation-quality-benchmark.test.mjs`.

- [x] Define synthetic scenarios with exact prior dialogue, one current utterance, source-fact references, expected gate state, and human-readable conversational expectations.
- [x] Cover greetings, reassurance, empathy, follow-ups, corrections, repeated questions, unsupported details/premises, negation, locked disclosures, and heard-prefix continuity.
- [x] Make dry-run the default. `--live --out <new-directory>` may request twenty actor replies sequentially using the existing provider, with no TTS.
- [x] Write a review packet that separates structural execution results from semantic review; never turn a keyword hit into a quality score.
- [x] Test fixture coverage, context isolation, unchanged gate rules, bounded provider work, and sanitized failures.
- [x] Run the authorized synthetic live sample and review its responses against the stated expectations. Record observed failures without claiming a statistical or clinical validation.

## Work package 2: Completed-segment memory

**Files:** `sp-interview.live.js`, `sp-interview.turns.js`, `sp-interview.conversation.js`, `dana-live-server.mjs`, `dana-live-context.mjs`, and focused tests.

**Interface:** POST turn optionally includes `previousCompletedSegments: 0|1|2`, bound to `previousTurnId`. The browser increments it only for a contiguous prefix whose native playback ended and whose completion receipts succeeded before cancellation. The server obtains exact text from its own segment records.

- [x] Test completed first segment plus interrupted second; only the first enters subsequent history.
- [x] Test interruption during the first segment, wrong turn ID, noncontiguous receipts, source failure, and late callbacks; none may claim unheard words.
- [x] Support optional `onHeardText(prefix)` from live speech through the bridge/controller; preserve the prefix on interrupted transcript entries and remove redundant metadata after complete playback.
- [x] Include only heard prefix text in model context, with neutral metadata about the omitted remainder.

## Work package 3: One-exchange spoken retry

**Files:** `dana-live-server.mjs`, `sp-interview.live.js`, `sp-interview.conversation.js`, `sp-interview.turns.js`, new `sp-interview.retry.js`, prototype bootstrap/preview, and retry tests.

**Server interfaces:**

```text
POST /api/dana/session/:id/finish  {}
  -> {finished:true,retryTurnIds:[turnId,...]}
POST /api/dana/session/:id/retry   {turnId}
  -> {sessionId,sourceTurnId}
DELETE /api/dana/session/:id
  -> clears original and child
```

**Client interfaces:** `live.finish()` returns the finish result; `live.createRetry(turnId)` returns `{client,sourceTurnId}` with a child client already bound to the returned session. Existing `start/respond/speak/end` methods work on that child. Repeated setup for the same selection shares one child; another selection is rejected.

**UI interface:** `SPInterviewRetry.mount({env,container,originalSnapshot,retryTurnIds,createRetry,createInput,createBridge})`. The controller supports `maxTurns:1, skipOpening:true` for this child only; default original behavior remains ten turns with its recorded opening.

- [x] Save immutable history immediately before each original learner question, after resolving preceding playback acknowledgement. Do not include the selected original question, its answer, or future turns in the child.
- [x] Test fresh child gate derivation from prefix plus the alternative question, independent of later original disclosure state.
- [x] Finish blocks new original turns and stops active work; retry uses one new child turn and existing global limits.
- [x] Preserve saved heard-status history on the child's first turn rather than treating it as a new opening acknowledgement.
- [x] After the encounter, show the selected original exchange, allow one spoken alternative, and display both responses with the reflection prompt: “What changed in your wording, and what did you notice?”
- [x] Preserve keyboard guards, live announcements, focus, pause/resume, and cleanup; prevent microphone or late UI updates after leaving.
- [x] Add Clear and start over, and explain in-memory reflection/retry retention.

## Integration verification

- [x] Run full SP suites and dedicated prototype browser suite after all edits.
- [x] Verify generated preview reproducibility and whitespace checks.
- [x] Exercise a bounded real actor/Marin retry through native playback using fictional input.
- [x] Review original-state isolation, partial-heard history, cancellation, and retention independently.
- [x] Refresh the owned local server only after checks pass; inspect the final visible retry state.

No commit, merge, or deployment is part of this implementation.

## Verification evidence — September 5

- Full SP runner passed: 338 node:test checks plus existing direct contract suites.
- Dedicated browser suite passed 53 scenarios; three new visibility regressions failed before their fixes and passed afterward.
- Root static suite passed 1,768 tests. Generated preview and whitespace checks passed.
- Twenty real text-only scenarios completed. Agent review found two clear response-quality issues and one ambiguous unsupported premise; human/faculty review remains unperformed. These are recorded findings, not passing semantic results.
- Real actor/Marin integration completed two original replies and one retry, with seven native audio completions, unchanged original transcript, focused reflection, and Clear reset. Recognition was simulated; playback was muted.
- Independent review found the hidden-tab setup race and unbounded deletion wait; both were reproduced and fixed. Focused rereview found no remaining substantive issue.
- Full bin/verify.sh and learner builds were not rerun for this local-only slice; their previous September 4 evidence is not a current release check.
