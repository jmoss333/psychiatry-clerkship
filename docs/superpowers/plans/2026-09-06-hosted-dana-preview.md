# Hosted Dana preview implementation plan

> **For agentic workers:** Use subagent-driven-development task by task; keep provider, budget, browser, and handler file ownership separate.

**Goal:** Package the existing spoken and family prototypes, then prove one protected ten-turn Dana encounter on hosting without activating learner production.

**Architecture:** A separate `sp-preview` site publishes only three public assets. One authenticated modern Netlify Function streams each validated reply and its complete MP3 segments; encrypted, expiring browser-held receipts replace process-local conversation Maps. A content-free durable reservation ledger bounds paid attempts across function instances.

**Tech Stack:** Node 22+, native fetch and Web Streams, AES-256-GCM, Netlify Functions/Blobs, browser speech recognition and MP3 playback.

**Spec:** The approved staged integration direction in this conversation; existing behavior is documented in `_prototypes/sp-interview/DANA_CONVERSATION.md` and `FAMILY_VISIT.md`.

## Global constraints

- Preserve the original prototype worktree and existing production sites.
- Dana only in this hosted proof. Other cases, family, replay, and reflection remain packaged for subsequent migration.
- Preserve actor `gpt-5.4-2026-03-05`, low reasoning, 768 output tokens, `store:false`; speech `gpt-4o-mini-tts-2025-12-15`, Marin.
- Keep current draft disclosure overlay visibly pending faculty review. Do not alter canonical attestation or production voice flags.
- No provider key, case inventory, transcript, or audio in public assets or durable usage records. Transcript receipts are encrypted and retained in browser memory only, expiring after 30 minutes.
- 4.5-second pause, optional longer pause, Space to finish, Escape to interrupt, typed fallback, no fluency grading.
- Reserve paid attempts before provider calls. Count limits are conservative operation allowances, not dollar-cost claims.

## Task 1: Preserve and package

- [x] Create `codex/hosted-dana-preview` from current `origin/main` in an isolated worktree.
- [x] Apply the five tracked prototype changes and copy the explicit source/test/document allowlist. Exclude recordings, output diagnostics, environment files, and credentials.
- [x] Run root baseline: 1,793 passing, 2 skipped, 0 failures.
- [x] Run the prototype and root regression suites sequentially after integration: 573 SP node tests plus legacy suites; 1,801 root passes and 2 skips; full verify gate and both audience builds passed.

## Task 2: Native provider and durable attempt limits

**Files:** `sp-preview/lib/openai-provider.mjs`, `budget.mjs`; `sp-preview/tests/provider.test.mjs`, `budget.test.mjs`.

**Interfaces:** `createOpenAIProvider({env,fetchImpl,timeoutMs})` exposes `replyStream({system,messages,signal,onLead})` and `speak({text,caseId,signal})`. `createPreviewBudget({store,namespace,limit,windowLimit,now}).reserve({operationId,bindingHash,units})` authorizes at most once using one conditional-write record.

- [x] Test fragmented SSE, final-text identity, safe errors, cancellation, and MP3 bounds before implementing the native adapter.
- [x] Test concurrent reservations, duplicate claims, rolling window, corrupt/unavailable storage, and absence of dialogue before implementing the ledger.
- [x] Run both focused suites; retain conservative reservations after failure/cancellation.

## Task 3: Portable authenticated encounter

**Files:** `sp-preview/lib/state.mjs`, `handler.mjs`, `case.mjs`; `sp-preview/netlify/functions/dana-preview.mjs`; `sp-preview/tests/handler.test.mjs`.

**Interfaces:** POST `/api/dana-preview`, header `x-preview-key`. Start body `{action:'start',requestId}`; turn body `{action:'turn',state,text,previousPlayback,previousCompletedSegments}`. Stream `reply`, ordered `audio`, and `complete` events, each carrying the latest encrypted receipt; failures carry only a safe error code.

- [x] Test missing/wrong passcode and origin before any paid call; altered, expired, wrong-deployment receipts; invalid text; ten turns using fresh handlers; duplicate request rejection; interrupted heard-prefix handling; actor failure and late audio suppression.
- [x] Implement a 50-second overall deadline and abort propagation. Prepare first-sentence audio privately; publish only after full reply validation and prefix equality.
- [x] Seal state after actor validation and after each completed audio segment. Never accept client-authored patient history.

## Task 4: Accessible preview and deployment bundle

**Files:** `sp-preview/public/{index.html,app.js,styles.css}`, `build.mjs`, `netlify.toml`, `package.json`, `README.md`; browser/client/build tests.

- [x] Test stream validation, one active turn, typed fallback, pause controls, keyboard completion/interruption, memory cleanup, and ten-turn limit.
- [x] Copy only public allowlisted files to `dist`; bundle the server independently. Assert private source routes are absent.
- [ ] Verify hosted function routing, no-store headers, restrictive CSP, same-origin microphone policy, and disabled production behavior.
- [ ] Produce a draft integration PR and isolated deploy preview. Run a ten-turn hosted proof and record latency, cancellation, and failure recovery. A local or bundle pass is not a hosted pass.

## Release boundary

This is an engineering/faculty preview, not learner activation or clinical approval. After the hosted proof, migrate the full station/reflection UI and Morgan; family follows its separately reviewed transient information-boundary protocol. A failed or unavailable hosting login leaves deployment explicitly pending.

## Engineering verification

The isolated preview has 81 passing focused checks, including provider, budget, encrypted state, browser client, asset allowlist, and function bundle contracts. Desktop/mobile mocked browser checks passed under the actual CSP. The rolling allowance is 72 conservative operation units and the deployment lifetime cap remains 120, allowing verification plus a complete user encounter without raising the lifetime ceiling.

Two hosted-only defects were reproduced and fixed: a custom Function path disabled the default endpoint targeted by the explicit rewrite (404), and build-only DEPLOY_ID was unavailable during invocation (503). The route now uses the default Function endpoint and trusted context.deploy.id. Access probes return 403 without the passcode and 400 for authenticated malformed input, before any provider call.
