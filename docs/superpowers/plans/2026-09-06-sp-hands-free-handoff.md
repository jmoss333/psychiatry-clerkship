# Spoken Interview Room Handoff and Implementation Plan

> For agentic workers: use the available subagent-driven-development or executing-plans workflow task by task. The user has selected a handoff; do not ask them to choose an execution workflow again.

**Goal:** Deliver a reliably automatic spoken Dana encounter, repair the draft integration checks, and preserve a clear path for bringing the existing cases and family visit into the protected hosted preview.

**Architecture:** Keep the existing authenticated hosted transport and case-grounded actor/Marin speech. Repair the microphone-to-turn lifecycle in the browser; do not replace it with a new voice stack. Existing local station, case, reflection, and family modules are the source for subsequent migration.

**Tech stack:** Vanilla browser JavaScript, Web Speech API, native audio, Node 22+, Netlify Functions and Blobs, node:test, Playwright.

**Spec:** The user's latest acceptance requirement is: “I don’t want to have to click send question every time I speak but otherwise looks good.” Earlier requirements remain: 4–5 seconds for reflective pauses, optional longer thinking time and Hold, optional Space completion, realistic case-grounded speech, formative reflection, and optional family information replay.

## Start here

Recommended executor: Claude Code, using the prior independent Claude review and the repository's canonical CLAUDE.md. This is a bounded engineering handoff; choosing Claude does not imply a benchmark or price comparison with Codex. Complete Tasks 1–3 as the next delivery. The later migration sequence is a backlog, not permission to combine every remaining feature into the microphone repair.

- Repository: `jmoss333/psychiatry-clerkship`.
- Draft integration PR: https://github.com/jmoss333/psychiatry-clerkship/pull/547
- Branch: `codex/hosted-dana-preview`.
- Reviewed application source commit: `d6bac57`.
- Evidence/source snapshot before this handoff: `8d3f43fceac9bcdc8b81e0435da2d215daac532e`.
- Integration base: `4bc4ade994c5914403cbb4735d11e3edae556d8e`.
- Same-Mac worktree: `/Users/jm/Psychiatry-Clerkship-Library/.worktrees/hosted-dana-preview`.
- Original preserved local prototype: `/Users/jm/Psychiatry-Clerkship-Library/.worktrees/dana-spoken-prototype`.
- Hosted preview: https://dana--interview-room-faculty-preview.netlify.app
- Separate Netlify site: `interview-room-faculty-preview`, ID `f2d991ee-f5e5-43b6-88ab-933fb0cd3c0f`, alias `dana`.

Read current branch status and PR checks before editing. Do not reset, switch, or overwrite unrelated work. Reuse the handoff worktree if unoccupied; otherwise create an isolated `codex/` branch from the current PR head and explain how its changes should be integrated. Do not replace the source with an older local copy or current main alone.

## Global constraints

- Voice mode should require one Start action and microphone permission, then no click, Space press, focus change, or composer edit for each normal turn. Typing remains an equal, explicit alternative.
- Default automatic completion: 4.5 seconds after completed recognized speech. Hosted “Give me more thinking time”: 8 seconds. Local prototype documents include an earlier 6-second option; preserve the current hosted 8-second behavior unless intentionally aligning both with tests and documentation.
- Hold suppresses automatic completion. Space/Done speaking can finish early; Escape interrupts. Do not grade speed, pauses, accent, fluency, empathy, personality, or readiness.
- Retain Marin and the approved model/voice instructions. Do not regenerate the existing recordings, introduce another provider, or add retries merely to improve perceived latency.
- Fictional cases only. Preserve authored facts, source hashes, disclosure overlays, faculty status, and no-PHI controls. Direct suicide-question access remains as implemented in the draft overlay; do not change clinical rules as a UI fix.
- API keys stay server-side. No keys, passcodes, encrypted receipts, dialogue, or raw provider errors in committed files, diagnostics, reports, screenshots, or PR text. Existing preview credentials are local ignored files; use approved secret-loading mechanisms without printing them.
- No browser transcript persistence, learner audio recording, transcript database, or analytics containing speech. Diagnostic events may contain fixed state/error codes and timing/counts only.
- Preserve full-reply validation before speculative speech publication, one active request, duplicate rejection, heard-segment receipts, deadlines, cancellation, 30-minute expiry, and existing budget ceilings. Do not repeatedly redeploy to reset the budget.
- Produce commits and update the draft PR. An isolated update to the existing protected preview is within the continuing preview work; do not merge, activate learner routes, attest content, or deploy learner/production proxy changes.

## What is already packaged

| Capability | Source of truth | Current availability |
| --- | --- | --- |
| Protected hosted Dana, streamed actor/speech, encrypted continuity, durable budget | `sp-preview/` | Hosted engineering/faculty preview |
| Dana, Marcus, Ray, Morgan alcohol motivational interviewing | `_prototypes/sp-interview/sp-interview.local-cases.js`, `dana-live-context.mjs`, `conversation-speech-profiles.mjs` | Local draft cases; only Dana hosted |
| Live conversation and audio/turn handling | `sp-interview.conversation.js`, `sp-interview.live.js`, `sp-interview.turns.js`, `dana-live-server.mjs` | Local richer implementation |
| Student station: door note, chart requests, priorities/cues, optional time, closing, attending presentation | `sp-encounter-profiles.js`, `sp-encounter-ui.js`, `sp-encounter-rhythm.js` | Local across single/family cases |
| Bookmarks, exact-quote reflection, one-moment alternative preserving original | `sp-interview.bookmarks.js`, `sp-interview.retry.js` | Local |
| Morgan/Maya family meeting, ordered speakers, targeted/shared/private conversation | `family-visit-case.mjs`, `family-visit-state.mjs`, `family-live-server.mjs`, `family-visit.js`, `family-visit.html` | Local draft |
| Optional “What information was available?” replay | `family-information-replay.js` | Local after ending/bookmark; no provider call |
| 75 Dana Marin recordings plus Marcus/Ray/Morgan openings | Separate local media archive and original `output/speech/` | Preserved, ignored by Git; not public assets |

Read in this order: `sp-preview/README.md`; `sp-preview/ACCEPTANCE.md`; `_prototypes/sp-interview/DANA_CONVERSATION.md`; `FAMILY_VISIT.md`; `FAMILY_VISIT_CONTRACT.md`; `docs/superpowers/plans/2026-09-06-sp-complete-encounter.md`; `2026-09-06-claude-review-remediation.md`; `2026-09-06-sp-reply-diagnosis.md`. The source files in the table without a full prefix are under `_prototypes/sp-interview/`.

The original independent-review prompt is `docs/superpowers/plans/2026-09-05-claude-sp-encounter-review-prompt.md`. The subsequent remediation documents contain the actionable preserved review history; do not depend on a temporary attachment still being available.

## Current evidence and gaps

At snapshot `8d3f43f`, the recorded full local gate passed: 1,801 root tests plus 2 skips; 573 SP node tests plus legacy suites; 81 focused hosted-preview tests. These are previous results, not a pass for your new changes.

The real hosted run completed one opening and ten questions, with 21 native audio completions and no browser/audio errors. However, it used synthetic recognition and pressed Space on every question. Audio was muted at 2x. It did not prove hands-free completion or physical microphone behavior. Median Space-to-audio was 2.93 seconds, range 2.00–12.28 seconds; this is a small sample, not a service guarantee. See `sp-preview/ACCEPTANCE.md`.

GitHub CI subsequently failed at the same SHA. The newly added recordings test failed at `_prototypes/sp-interview/tests/conversation-recordings.test.mjs:89`: `expected asynchronous adapter work to settle`. The helper at line 80 permits only 30 `setImmediate` iterations while real WebCrypto hashing is still asynchronous. The focused suite passed 13/13 locally during handoff diagnosis. This supports a package-introduced test race; prove it with controlled delayed hashing rather than labeling it an unrelated baseline failure. CI job: https://github.com/jmoss333/psychiatry-clerkship/actions/runs/34037107500/job/101497115020

The new `sp-preview` tests/build are currently separate commands, not included in the root CI/verify workflow. Add that coverage as part of this delivery.

## Task 1: Make spoken turns truly automatic

**Files:** `sp-preview/public/app.js`, `index.html`, optionally `styles.css`; `sp-preview/tests/client.test.mjs`; `sp-preview/qa/hosted-browser.mjs`.

**Interfaces:** `createCapture(env, callbacks)` emits final/interim words and `onSubmit`; `createController(env, options)` owns submission, playback and recognition restart. The existing server request/receipt protocol remains unchanged.

Confirmed source behavior at the snapshot:

- `app.js:63,80,98` already arms 4.5/8-second submission after final speech. Do not assume automatic sending is absent.
- `app.js:83` pauses immediately if recognition ends with unfinished interim words.
- `app.js:84–87` pauses on repeated short restarts or most recognition errors.
- `app.js:162,196` intentionally pauses capture on textarea input; operating-system dictation may arrive through this path.
- `app.js:171–173` falls back to typing if SpeechRecognition is unavailable. `app.js:201` pauses when hidden.
- The hosted QA replaces recognition, clicks the heading, and presses Space (`qa/hosted-browser.mjs:57–79`). The ten-turn controller test directly calls `send()` (`tests/client.test.mjs:98–103`). Neither proves the required loop.

The user's exact failure path is unconfirmed. Use fixed-code, in-memory diagnostics to distinguish native recognition, input edits, interim termination, Hold, and error states. Do not guess or silently promote unfinished interim words to a final question.

- [ ] Add a controller/browser test that starts once, emits speech, waits for automatic submission and complete patient playback, and repeats ten times. No call to `send()`, click, keyboard press, focus reset, or composer write after Start. Assert one opening plus exactly ten turn requests, no duplicates, and microphone off at End.
- [ ] Exercise the following explicit event sequences before implementing the smallest necessary lifecycle repair.

```text
Final A -> 4499 ms: 0 turns -> 1 ms: exactly 1 turn
Final A -> 4000 ms -> new speech/final B -> 4499 ms: 0 -> 1 ms: one A+B turn
Thinking time: final A -> 7999 ms: 0 -> 1 ms: one turn
Hold: final A -> 60000 ms: 0; explicit finish: exactly one turn
Final A -> normal onend/no-speech -> restart: preserve A and original quiet deadline
Final A + interim B -> service ends: preserve words, clearly recover; no truncated auto-send
Duplicate final/late stale callbacks: one copy of each accepted phrase and one request
Complete two audio segments -> Listening automatically; no capture of patient playback
```

- [ ] Reproduce the stop condition with the smallest deterministic fixture. Retry normal recognition lifecycle events safely, but preserve explicit recovery for permission loss, unresolved speech, and unknown provider outcomes. Bound restarts; never silently lose words or create an endless reconnect loop.
- [ ] Make voice mode visibly primary: “Listening — I’ll send when you finish.” Keep the typed composer available as an explicit alternative, with no forced textarea focus or required Send action in the voice flow. A manual edit must still pause automatic sending until the user resumes voice or explicitly sends.
- [ ] Preserve Pause, Hold, Space, Escape, hidden-tab handling, End, Clear, repeated-key/IME behavior, and no automatic resend after provider failure. Keep mic restart after the final played segment. Do not add unrestricted speaker-mode barge-in as part of this repair.
- [ ] Update the opt-in hosted QA to use real 4.5-second automatic completion, with timing measured from final recognized words and from dispatch separately. Keep the paid-call bound and content-free reports. Retain separate shortcut coverage.
- [ ] Run focused mocked tests before paid testing. Verify ten automatic turns through actual hosted audio once within the existing preview allowance. Physical microphone validation in the user's supported browser is a separate manual check; if unavailable, report it as pending rather than imitating it with synthetic input.

## Task 2: Repair and cover the integration checks

**Files:** `_prototypes/sp-interview/tests/conversation-recordings.test.mjs`, `.github/workflows/ci.yml`, `bin/verify.sh`, the existing workflow-inventory/digest contract and tests, and relevant coverage contract.

- [ ] Reproduce delayed WebCrypto completion in the recordings fixture. Replace event-loop-count polling with a bounded completion signal or elapsed-time wait; retain assertions for exact hashes, verified cache reuse, cancellation and revoked URLs. Do not change production hashing to accommodate a test.
- [ ] Run that suite with controlled slow digest completion and repeat locally; then run the full prototype suite.
- [ ] Add `npm --prefix sp-preview ci`, `npm --prefix sp-preview test`, and `npm --prefix sp-preview run build` to the appropriate CI/local gate. The paid hosted command must never run automatically in CI.
- [ ] Follow the repository's three CI-change contracts: local coverage parity, exact workflow inventory/digest, and any required registry-test inventory. Compute the workflow digest through the validator's own loader/helper. Do not relax protected checks or bypass hooks.
- [ ] Run the complete gate and verify GitHub CI at the exact pushed SHA. Successful Netlify preview builds do not substitute for a failing GitHub check.

## Task 3: Deliver the verified preview and concise review packet

- [ ] Commit the microphone repair separately from CI synchronization. Update PR #547 when using its branch; if working in a child branch, create a draft follow-up and make the dependency explicit.
- [ ] Update `sp-preview/README.md` and `ACCEPTANCE.md` with what actually passed: automatic versus Space submission, synthetic versus physical microphone, browser identity, exact source/deploy, request counts, cancellation results, and latency range.
- [ ] Deploy only the existing isolated preview when needed, preserving its access controls and budgets. Only `sp-preview/dist` is public. Complete the Function build; do not publish the repo root or local prototype server.
- [ ] Verify wrong/missing passcode and private asset routes; verify native audio, no mobile overflow, accessible status/focus, Clear, and no browser storage. Reuse the documented modern Function routing and trusted `context.deploy.id`; do not reintroduce custom-path/default-endpoint conflict.
- [ ] Report a working preview, exact commit/PR, concise test summary, unresolved limitations, and the next bounded migration. No learner-release claim.

Useful commands from the repository root, after installing dependencies:

```sh
npm --prefix sp-preview ci
npm --prefix sp-proxy ci
npm --prefix tests/smoke ci
node --test sp-preview/tests/client.test.mjs
node --test _prototypes/sp-interview/tests/conversation-recordings.test.mjs
npm --prefix sp-preview test
npm --prefix sp-preview run build
bash _prototypes/sp-interview/tests/run-all.sh
npm --prefix tests/smoke run test:dana-conversation
npm --prefix tests/smoke run test:family-visit
bash bin/verify.sh
```

Run suites that share build outputs sequentially. Inspect the browser configs for their local-server setup. Do not generate visual baselines on macOS. The opt-in paid command is `npm --prefix sp-preview run test:hosted`, with explicit `DANA_QA_URL` and `DANA_QA_ACCESS_FILE` supplied through the existing approved setup. It must be revised to test automatic completion before using its result to claim hands-free operation.

## Subsequent migration sequence

1. Bring the existing station UI, bookmarks, reflection, and one-moment alternative into the protected hosted encounter. Port the behavior and tests; do not replace it with a generic chat screen. Retry must preserve the original and use only the information heard at that exact earlier moment.
2. Add Morgan alcohol motivational interviewing first, then Marcus and Ray, using the same hosted transport. Bind immutable case identity and its hash/version into encrypted state and replay; reject case changes mid-encounter. Keep authored facts/voices and unsupported-detail limits. Hosted opening speech can use existing generation until a separately verified media publication path is ready.
3. Migrate Morgan/Maya family as a separate reviewable change. Preserve ordered speakers, selected addressee, interruption/cancel of queued speech, owner-only private memory, public rejoin boundaries, caption pauses, and original/alternative isolation. A single-patient encrypted receipt is not automatically a correct family state model. Inspect payload limits and budget math without silently increasing them.
4. Port optional information replay after the family state contract passes. Show only earlier, completed, audience-appropriate conversation, stopping immediately before the selected question. It must reveal no hidden case inventory or unheard tail, call no provider, write no storage, and never grant permission to share private information. Existing phrase filtering is not proof against every semantic disclosure.
5. Prepare a faculty audition and learner integration draft only after technical evidence. Later learner integration must use canonical build/nav registration, faculty content-universe visibility, and existing release gates. Clinical approval, readiness decisions and production activation remain separate.

Potential future idea: a faculty “pause and discuss” action that opens the existing information replay at a bookmarked moment and returns to the same encounter. Keep it optional and non-scoring. Do not add it to the first microphone/CI repair.

## Media, access and costs

The companion local archive contains a source patch, commit inventory, this handoff, checksums, and 78 verified existing MP3s with four manifests: 75 Dana lines and the Marcus, Ray and Morgan openings. It excludes credentials, transcripts, diagnostics, virtual environments and dependencies. It is a transfer package, not a public-site publish directory. The PR remains the preferred source integration route; the patch is an offline fallback against the stated base.

On the same Mac the preview passcode is in ignored `sp-preview/preview-access.txt`; provider secrets are in the existing ignored configuration. Never include their contents in a handoff prompt. Another machine needs separately configured access; do not embed or copy secrets into the archive.

Reuse recordings exactly through their manifests and verify SHA-256 before use. Restore them under the matching `output/speech/` paths only if absent or byte-identical. Keep them out of ordinary commits and never replace real media with LFS pointers. Family speech is generated per encounter; there is no missing permanent family recording library to regenerate.

Current lifetime/window counters are conservative operation reservations, not dollar billing. Previous local usage reports were process-limited and speech usage was sometimes missing. Exact historical API cost remains unavailable from this package; do not invent a dollar total. New live verification can incur charges and must stay within the existing bounded test allowance; ordinary tests use mocks.
