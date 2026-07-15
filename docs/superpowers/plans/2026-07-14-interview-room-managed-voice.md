# Interview Room Managed Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a merge-ready Interview Room whose voice lifecycle is smooth, cancellable, honest
about failures, limited to reviewed clinical cases, and prepared for managed speech without enabling
billable learner audio before the audition, privacy review, and faculty attestation are complete.

**Architecture:** A dependency-free browser controller owns recording, actor wait, synthesis,
playback, cancellation, encounter IDs, and turn IDs while React renders only controller state. The
existing actor remains the clinical brain. Netlify Functions add reviewed-case enforcement, raw-pack
hashing, one-use signed speech tickets, atomic micro-dollar reservations, and injectable speech
providers; managed speech is disabled by default and fails closed to text/device mode.

**Tech Stack:** React 18 UMD with `React.createElement`, browser `MediaRecorder` and
`speechSynthesis`, Node.js 20 built-ins and `node:test`, Netlify Functions Web APIs, Netlify Blobs
10.7.9 with strong consistency and conditional writes, Python 3.11 repository validators, existing
MS3/resident build and Playwright smoke infrastructure.

## Global Constraints

- Keep the existing actor and deterministic rapport/disclosure engine as the only patient brain.
- Text is the authoritative record and the complete patient reply appears before audio starts.
- Dictation always becomes an editable draft and never sends automatically.
- Learner recording and patient playback never overlap.
- `Voice off`, End encounter, case change, difficulty change, page teardown, and stale callbacks stop
  or lose authority over audio and requests within 100 ms under the mocked clock.
- Managed recording stops at 90 seconds or 4.0 MiB, whichever occurs first; provider work aborts
  before 50 seconds.
- Keep at most three patient audio objects and 10 MiB total in memory; Replay creates no provider
  request.
- A reviewed clinical case remains usable in text/device mode. Managed voice additionally requires a
  reviewed speech engine, reviewed case profile, matching hashes/pins, and the enabled feature flag.
- Student clients receive `403 case_not_reviewed` for draft cases even if the selector is modified.
- Never log or persist learner audio or transcript content. Logs may contain IDs, phases, timings,
  machine error codes, usage units, and spend estimates only.
- Do not collect voice biometrics, speaker identity, emotion, accent scores, raw-audio telemetry, or
  scored interruption/latency behavior.
- Production CORS rejects missing origins and `*`; localhost origins are development-only.
- The total actor-plus-voice planning cap is $20 per rotation, with managed voice disabled at the $16
  warning threshold. Every provider call reserves a conservative maximum before it begins.
- Use integer micro-dollars. Ten concurrent calls must produce $0 locally estimated overshoot.
- CI uses fake providers and performs no billable or credentialed network calls.
- Use stock synthetic voices only. Do not clone or imitate an identifiable person.
- `SP_MANAGED_VOICE_ENABLED` defaults to `false`; software must not manufacture audition, privacy,
  learner-pilot, or faculty approval.
- Dana is the only currently reviewed clinical case. Marcus and Ray retain regression coverage but
  remain unavailable to learners.
- Preserve existing parity, locked-content, storage, Dana, Marcus, and Ray behavior tests.
- Use Node 20 in CI and Netlify. Pin `@netlify/blobs` to `10.7.9`, commit `package-lock.json`, and use
  `npm ci --omit=dev` for the proxy build.
- Read deployed configuration from `Netlify.env.get(name)`; retain a `process.env[name]` fallback
  only for Node tests and local Netlify development.

---

## File Structure

### Client and governance

- Create: `_prototypes/sp-interview/sp-interview.voice.js`
- Create: `_prototypes/sp-interview/generate-preview.mjs`
- Create: `_prototypes/sp-interview/release-passport.mjs`
- Modify: `_prototypes/sp-interview/sp-interview.html`
- Generate: `_prototypes/sp-interview/sp-interview.preview.html`
- Modify: `_prototypes/sp-interview/sp-interview.pack.json`
- Create: `_prototypes/sp-interview/tests/harness-exit.test.mjs`
- Create: `_prototypes/sp-interview/tests/preview.test.mjs`
- Create: `_prototypes/sp-interview/tests/review-filter.test.mjs`
- Create: `_prototypes/sp-interview/tests/voice-state.test.mjs`
- Create: `_prototypes/sp-interview/tests/voice-contract.test.mjs`
- Create: `_prototypes/sp-interview/tests/managed-transport.test.mjs`
- Create: `_prototypes/sp-interview/tests/provider-errors.test.mjs`
- Create: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`
- Create: `_prototypes/sp-interview/tests/ops-docs.test.mjs`
- Modify: `_prototypes/sp-interview/tests/smoke.test.js`
- Modify: `_prototypes/sp-interview/tests/storage.test.mjs`
- Modify: `_prototypes/sp-interview/tests/run-all.sh`
- Modify: `13_Faculty_Resources/reviewed.json`
- Modify: `13_Faculty_Resources/_automation/validate_attestation_consistency.py`
- Create: `13_Faculty_Resources/_automation/test_validate_attestation_consistency.py`
- Modify: `13_Faculty_Resources/_automation/site_build/site_manifest.json`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `.github/workflows/ci.yml`
- Create: `tests/smoke/interview-room.spec.js`
- Modify: `tests/smoke/playwright.config.js`

### Proxy and managed speech

- Modify: `sp-proxy/package.json`
- Create: `sp-proxy/package-lock.json`
- Modify: `sp-proxy/netlify.toml`
- Modify: `sp-proxy/netlify/functions/sp.mjs`
- Create: `sp-proxy/netlify/functions/sp-voice.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-http.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-pack.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-governance.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-budget.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-speech-ticket.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-speech-provider.mjs`
- Create: `sp-proxy/tests/helpers/fake-blob-store.mjs`
- Create: `sp-proxy/tests/helpers/fake-speech-provider.mjs`
- Create: `sp-proxy/tests/fixtures/pack.fixture.mjs`
- Create: `sp-proxy/tests/sp-http.test.mjs`
- Create: `sp-proxy/tests/sp-pack-governance.test.mjs`
- Create: `sp-proxy/tests/sp-budget.test.mjs`
- Create: `sp-proxy/tests/sp-speech-ticket.test.mjs`
- Create: `sp-proxy/tests/sp-speech-provider.test.mjs`
- Create: `sp-proxy/tests/sp-voice.test.mjs`
- Create: `sp-proxy/tests/sp-handler.test.mjs`
- Modify: `sp-proxy/README.md`
- Modify: `sp-proxy/REDTEAM_CHECKLIST.md`

---

### Task 1: Make the Existing Gate Honest and the Preview Reproducible

**Files:**

- Create: `_prototypes/sp-interview/tests/harness-exit.test.mjs`
- Create: `_prototypes/sp-interview/generate-preview.mjs`
- Create: `_prototypes/sp-interview/tests/preview.test.mjs`
- Modify: `_prototypes/sp-interview/tests/smoke.test.js`
- Modify: `_prototypes/sp-interview/tests/storage.test.mjs`
- Modify: `_prototypes/sp-interview/tests/run-all.sh`
- Modify: `_prototypes/sp-interview/sp-interview.html`
- Generate: `_prototypes/sp-interview/sp-interview.preview.html`

**Interfaces:**

- Produces: `generate-preview.mjs --write|--check` and a byte-reproducible preview.
- Produces: an authoritative Dana harness exit code used by every later task.

- [ ] **Step 1: Write the failing harness-exit test**

```javascript
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const run = spawnSync(process.execPath, ['smoke.test.js'], {
  cwd: dir,
  env: { ...process.env, SP_SMOKE_FORCE_FAIL: '1' },
  encoding: 'utf8',
});
assert.equal(run.status, 1);
assert.match(run.stdout + run.stderr, /FAIL — forced harness check/);
```

- [ ] **Step 2: Verify the harness test is red**

Run: `node _prototypes/sp-interview/tests/harness-exit.test.mjs`

Expected: assertion failure because `smoke.test.js` exits `0`.

- [ ] **Step 3: Make every Dana assertion affect process status**

Use one `failures` counter, add every scenario error and PHI error, add a controlled
`SP_SMOKE_FORCE_FAIL` assertion, and finish the async body with:

```javascript
if(process.env.SP_SMOKE_FORCE_FAIL==='1'){
  failures++;
  console.log('FAIL — forced harness check');
}
process.exitCode=failures?1:0;
```

- [ ] **Step 4: Write the failing preview generator test**

The test spawns `generate-preview.mjs --check`, extracts `window.__SP_PACK__` and
`window.__SP_PREVIEW__`, deep-compares the embedded pack with `sp-interview.pack.json`, and asserts
the marker is exactly:

```javascript
{
  generated: true,
  providerMode: 'mock',
  endpoint: '',
  autoOpenSettings: false,
}
```

- [ ] **Step 5: Verify the preview test is red**

Run: `node _prototypes/sp-interview/tests/preview.test.mjs`

Expected: failure because no generator or preview marker exists.

- [ ] **Step 6: Implement the generator and canonical preview switches**

`generate-preview.mjs` must read canonical HTML and the pack, inject a generated-file comment plus
the two assignments immediately before the application script, and refuse a transform unless the
insertion marker occurs exactly once:

```javascript
const injected = [
  '<!-- GENERATED by generate-preview.mjs; do not edit directly. -->',
  `<script>window.__SP_PREVIEW__=${JSON.stringify(previewConfig)};` +
    `window.__SP_PACK__=${JSON.stringify(pack)};</script>`,
].join('\n');
```

Canonical initialization reads `window.__SP_PREVIEW__ || {providerMode:'live', endpoint:null,
autoOpenSettings:true}` so the preview does not maintain a second application implementation.

- [ ] **Step 7: Regenerate and verify green**

Run:

```bash
node _prototypes/sp-interview/generate-preview.mjs --write
node _prototypes/sp-interview/generate-preview.mjs --check
node _prototypes/sp-interview/tests/harness-exit.test.mjs
node _prototypes/sp-interview/tests/preview.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
```

Expected: all commands exit `0`; the runner prints `ALL SUITES PASSED` only after the harness meta-test.

- [ ] **Step 8: Commit**

```bash
git add _prototypes/sp-interview
git commit -m "test(sp-interview): make preview and harness deterministic"
```

---

### Task 2: Enforce Clinical and Voice Governance Without Fabricating Approval

**Files:**

- Create: `_prototypes/sp-interview/tests/review-filter.test.mjs`
- Modify: `_prototypes/sp-interview/sp-interview.html`
- Modify: `_prototypes/sp-interview/sp-interview.pack.json`
- Modify: `13_Faculty_Resources/reviewed.json`
- Modify: `13_Faculty_Resources/_automation/validate_attestation_consistency.py`
- Create: `13_Faculty_Resources/_automation/test_validate_attestation_consistency.py`

**Interfaces:**

- Produces: client helpers `isCaseReviewed(caseDef)` and `eligibleCases(pack)`.
- Produces: pack-level `speechEngine` and case-level `speechProfile` draft contracts.
- Preserves: Dana case review; does not promote Marcus, Ray, or managed voice.

- [ ] **Step 1: Write red review-filter and attestation tests**

The JavaScript contract must assert:

```javascript
assert.deepEqual(
  testApi.eligibleCases(pack).map((caseDef) => caseDef.id),
  ['sp_depression_gated_si_001'],
);
assert.equal(testApi.isManagedVoiceEligible(pack, pack.cases[0]), false);
```

The Python fixture suite must prove reviewed ledger plus pending tool header fails, an attested pack
containing a draft case fails, missing reviewed-case reviewer/date fails, and pending pack plus draft
voice records passes.

- [ ] **Step 2: Verify both tests are red**

Run:

```bash
node _prototypes/sp-interview/tests/review-filter.test.mjs
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
```

- [ ] **Step 3: Add explicit draft speech contracts**

Set pack status to `draft-pending-attestation`. Add `speechEngine` with schema version `1`, status
`draft-pending-attestation`, `enabled:false`, `activeStack:null`, the two audition candidate stacks,
the dated planning rate card, and a pending privacy review. Add each case profile with known cadence,
rate, stage-direction policy, and null provider/model/voice fields allowed only while draft:

```json
{
  "status": "draft-pending-attestation",
  "profileVersion": 1,
  "provider": null,
  "providerModel": null,
  "voiceId": null,
  "stageDirections": "visual-only",
  "facultyReview": {
    "status": "pending",
    "reviewer": null,
    "reviewedAt": null,
    "auditionId": null,
    "profileHash": null
  }
}
```

Use `measured-flat`/`0.95` for Dana, `pressured-fast`/`1.15` for Marcus, and
`guarded-halting`/`0.85` for Ray.

Candidate IDs are `openai-quality-v1` (`whisper-1` plus `tts-1-hd`) and
`elevenlabs-expressive-v1` (`scribe_v2` plus `eleven_multilingual_v3`). The pending privacy record
contains empty policy URL/hash arrays, null reviewer/review/next-review dates, decision `pending`, and
consent version `2026-07-14-draft`; these explicit missing values keep managed voice ineligible.

The July 14 planning rates are explicit operational inputs: Haiku 4.5 `$1/M` input and `$5/M`
output tokens; OpenAI TTS-1 HD `$30/M` characters; Whisper `$0.006/minute`; ElevenLabs
Multilingual v2/v3 `$0.10/1K` characters; and Scribe v2 `$0.22/hour`. Store source URLs and an
effective date. A runtime model absent from this exact rate card fails before provider work.

- [ ] **Step 4: Reconcile and enforce attestation**

Change only `reviewed.json["sp-interview.html"].status` to `pending`; retain the historical reviewer
fields. Refactor the validator to `validate(root) -> list[str]`, parse `[RC-META]` for every manifest
tool, validate pack/case/profile relationships, and keep the CLI exit contract.

- [ ] **Step 5: Filter the client selector**

Define and export:

```javascript
function isCaseReviewed(caseDef){
  return !!(caseDef&&caseDef.facultyReview&&caseDef.facultyReview.status==='reviewed');
}
function eligibleCases(pack){
  return (pack&&Array.isArray(pack.cases)?pack.cases:[]).filter(isCaseReviewed);
}
function isManagedVoiceEligible(pack,caseDef){
  return !!(isCaseReviewed(caseDef)&&pack.speechEngine&&pack.speechEngine.enabled===true&&
    pack.speechEngine.status==='reviewed'&&caseDef.speechProfile&&
    caseDef.speechProfile.status==='reviewed');
}
```

Render `eligibleCases(S.pack)` while keeping all case regression tests pack-driven.

- [ ] **Step 6: Regenerate preview and verify green**

Run:

```bash
node _prototypes/sp-interview/generate-preview.mjs --write
node _prototypes/sp-interview/tests/review-filter.test.mjs
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
bash _prototypes/sp-interview/tests/run-all.sh
```

- [ ] **Step 7: Commit**

```bash
git add _prototypes/sp-interview 13_Faculty_Resources/reviewed.json \
  13_Faculty_Resources/_automation/validate_attestation_consistency.py \
  13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
git commit -m "fix(sp-interview): enforce case and attestation eligibility"
```

---

### Task 3: Build the Single Audio Lifecycle Controller

**Files:**

- Create: `_prototypes/sp-interview/sp-interview.voice.js`
- Create: `_prototypes/sp-interview/tests/voice-state.test.mjs`
- Create: `_prototypes/sp-interview/tests/voice-contract.test.mjs`
- Modify: `_prototypes/sp-interview/tests/run-all.sh`

**Interfaces:**

```javascript
const controller = SPInterviewVoice.createController(deps);
controller.getSnapshot();
controller.subscribe(listener);
controller.beginEncounter(encounterId);
controller.requestOpening({ runActor });
controller.setMode('off' | 'device' | 'managed');
controller.setDraft(text);
controller.startListening();
controller.stopListening();
controller.submitTurn({ runActor });
controller.acceptPatientReply({ encounterId, turnId, reply, ticket });
controller.stopPlayback();
controller.replay(turnId);
controller.canReplay(turnId);
controller.resolveFallback('text' | 'device');
controller.cancelAll(reason);
controller.endEncounter();
controller.destroy();
```

`deps` supplies `createRecorder`, `transcribe`, `synthesize`, `deviceSpeak`, `createPlayer`,
`createObjectURL`, `revokeObjectURL`, `setTimeout`, `clearTimeout`, and `now`. Recorder adapters expose
`start/stop/cancel/release`; managed players expose `play/stop/destroy`; device players expose
`stop/destroy`. Adapter creation receives the current encounter and prospective turn IDs.
`requestOpening` and `submitTurn` are the only actor-request paths. `runActor` receives
`{mode:'open'|'converse', text, signal, encounterId, turnId}` and resolves to `{reply, ticket}`. The
controller resolves either method with `{encounterId,turnId,reply,ticket}` only while the captured IDs
remain current; React publishes the full text and then calls `acceptPatientReply` with that exact
immutable payload. Audio uses only the stored actor payload, never caller-substituted text or tickets.

Opening is turn `0` and must be accepted before learner turns begin. A failed, cancelled, or
unaccepted opening remains retryable. `setDraft` owns the editable text. `submitTurn` freezes and
clears it; actor failure or ordinary cancellation restores the same text and rolls back the turn ID
for a same-ID retry. Encounter replacement, End, and destroy intentionally discard it.

- [ ] **Step 1: Write the red state and contract tests**

Cover the exact state graph, explicit mode values, 90-second stop, 4 MiB rejection, editable
transcript callback, stale encounter/turn rejection, no record/play overlap, Replay without network,
three-object/10-MiB eviction with exact replayable turn IDs, cancellable/stale opening requests,
stage-direction stripping, strict adapter shapes, authoritative reply/ticket binding, accepted-opening
gating, same-turn retry after failure/cancellation, synchronous recorder callbacks, and all
cancellation events. The chunk crossing 4 MiB is discarded and no oversized body reaches
transcription.

Use a seeded sequence test:

```javascript
for (let seed = 1; seed <= 100; seed++) {
  const trace = runSeededSequence(seed);
  assert.equal(trace.some((step) => step.recording && step.playing), false, `seed ${seed}`);
}
```

- [ ] **Step 2: Verify red**

Run:

```bash
node --test _prototypes/sp-interview/tests/voice-state.test.mjs
node --test _prototypes/sp-interview/tests/voice-contract.test.mjs
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the UMD controller**

Expose the same object as `window.SPInterviewVoice` and `module.exports`. The snapshot has only:

```javascript
{
  phase: 'ready',
  mode: 'off',
  encounterId: null,
  turnId: 0,
  draft: '',
  error: null,
  activePatientTurn: null,
  replayableTurnIds: [],
}
```

Own exactly one recorder, actor abort controller, speech abort controller, and player. Every async
continuation captures encounter/turn IDs and returns without mutation when they no longer match.
`spokenText(reply)` removes only `*stage direction*` spans and normalizes whitespace.

Replay cache order is insertion FIFO and replay does not refresh it. Audio larger than 10 MiB is
one-shot and never cached. Revoke each URL exactly once on eviction, stale synthesis, encounter
replacement, End, and destroy. `cancelAll` preserves same-encounter replay entries; Voice off and
terminal/replacement actions clear them. Cancellation synchronously aborts, releases, clears timers,
and publishes before returning; late callbacks are inert.

- [ ] **Step 4: Verify green and aggregate**

Run:

```bash
node --test _prototypes/sp-interview/tests/voice-state.test.mjs
node --test _prototypes/sp-interview/tests/voice-contract.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
```

- [ ] **Step 5: Commit**

```bash
git add _prototypes/sp-interview/sp-interview.voice.js _prototypes/sp-interview/tests
git commit -m "feat(sp-interview): add deterministic voice controller"
```

---

### Task 4: Establish Proxy HTTP, Pack, Governance, and Ticket Contracts

**Files:**

- Modify: `sp-proxy/package.json`
- Create: `sp-proxy/package-lock.json`
- Modify: `sp-proxy/netlify.toml`
- Create: `sp-proxy/netlify/functions/_shared/sp-http.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-pack.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-governance.mjs`
- Create: `sp-proxy/netlify/functions/_shared/sp-speech-ticket.mjs`
- Create: `sp-proxy/tests/helpers/fake-blob-store.mjs`
- Create: `sp-proxy/tests/fixtures/pack.fixture.mjs`
- Create: `sp-proxy/tests/sp-http.test.mjs`
- Create: `sp-proxy/tests/sp-pack-governance.test.mjs`
- Create: `sp-proxy/tests/sp-speech-ticket.test.mjs`

**Interfaces:**

```javascript
createHttp({ studentKey, operationsKey, allowedOrigins, production });
readEnv(name);
createPackLoader({ url, token, fetchImpl, now, ttlMs: 300000 });
resolveReviewedCase({ pack, caseId });
reviewedCaseSummaries(pack);
managedVoiceEligibility({ pack, packHash, caseDef, now });
createTicketCodec({ secret, clock, randomBytes });
createRedemptionLedger({ store, namespace, clock, maxCasAttempts: 5 });
spokenText(reply);
```

- [ ] **Step 1: Pin reproducible dependencies**

Set `@netlify/blobs` exactly to `10.7.9`, add `"test":"node --test tests/*.test.mjs"`, run
`npm install --package-lock-only`, and change Netlify build command to `npm ci --omit=dev`.

- [ ] **Step 2: Write red HTTP and pack-governance tests**

Assert allowed/disallowed origins, production wildcard rejection, separate student/operations keys,
no CORS on usage responses, raw-byte SHA-256 pack hashing, five-minute caching, reviewed-only case
summaries, `400 unknown_case`, `403 case_not_reviewed`, and independent managed-voice eligibility.

- [ ] **Step 3: Write red ticket tests**

Use a fixed clock and random bytes. Assert valid round-trip, 120-second expiry, tampered payload,
altered reply, wrong pack/attestation/profile/case, 16-byte `jti`, and exact stage stripping. The ticket
payload contains schema, rotation, encounter, turn, `jti`, case, pack hash, attestation hash, profile
hash/version, provider/model/voice, reply hash, issued time, and expiry.

Use the conditional fake Blob store to assert ten concurrent claims produce exactly one claim and
nine stable `speech_in_progress` errors. After `complete`, every later claim returns
`speech_already_redeemed`. The ledger stores only ticket IDs, lifecycle status, expiry, and
content-free usage metadata; it never stores reply or audio content. `claim` uses `onlyIfNew`, while
`complete` uses the claim ETag with `onlyIfMatch`.

- [ ] **Step 4: Verify red**

Run:

```bash
npm --prefix sp-proxy ci
node --test sp-proxy/tests/sp-http.test.mjs
node --test sp-proxy/tests/sp-pack-governance.test.mjs
node --test sp-proxy/tests/sp-speech-ticket.test.mjs
```

- [ ] **Step 5: Implement the shared modules**

Use `crypto.timingSafeEqual` over fixed-length SHA-256 digests for credentials. Hash raw pack bytes
before `JSON.parse`. Return typed operational errors with `{status, code, message}`. Reject managed
voice unless every reviewed hash/pin and next-review date matches. `readEnv(name)` calls
`globalThis.Netlify.env.get(name)` when available and otherwise reads `process.env[name]` for tests.
The redemption ledger exposes `claim(payload)` and
`complete(claim,{status:'succeeded'|'provider_failed',usage})`; concurrent versus terminal states map
exactly to `speech_in_progress` and `speech_already_redeemed`.

- [ ] **Step 6: Verify green**

Run: `npm --prefix sp-proxy test`

Expected: HTTP, pack/governance, and ticket suites pass with no network access.

- [ ] **Step 7: Commit**

```bash
git add sp-proxy
git commit -m "feat(sp-proxy): add governed HTTP and speech tickets"
```

---

### Task 5: Implement Atomic Rotation Budget Accounting

**Files:**

- Create: `sp-proxy/netlify/functions/_shared/sp-budget.mjs`
- Modify: `sp-proxy/tests/helpers/fake-blob-store.mjs`
- Create: `sp-proxy/tests/sp-budget.test.mjs`

**Interfaces:**

```javascript
const ledger = createBudgetLedger({
  store,
  namespace,
  rotationId,
  capMicros: 20000000,
  warningMicros: 16000000,
  rateCard,
  clock,
  maxCasAttempts: 5,
});
await ledger.reserve({ idempotencyKey, kind, maximumMicros });
await ledger.markProviderStarted(reservation);
await ledger.settle({ reservation, actualMicros, usage });
await ledger.failBeforeProvider({ reservation, code });
await ledger.getBand();
await ledger.getUsage();
```

- [ ] **Step 1: Write the conditional fake store and red ledger tests**

The fake implements only `getWithMetadata`, `set`, `onlyIfNew`, and `onlyIfMatch`. Test initial
creation, ETag conflicts, five bounded retries, duplicate keys, failed-before-provider retry,
provider-started no-retry, settlement, unknown rate card, unavailable store, `$16` warning, `$20`
cap, and ten simultaneous reservations.

```javascript
const results = await Promise.allSettled(
  Array.from({ length: 10 }, (_, index) => ledger.reserve({
    idempotencyKey: `turn-${index}`,
    kind: 'synthesis',
    maximumMicros: 2500000,
  })),
);
const stored = await fakeStore.getWithMetadata('test/rotation-1');
assert.equal(JSON.parse(stored.data).authorizedMicros, 20000000);
assert.equal(results.filter((result) => result.status === 'fulfilled').length, 8);
```

- [ ] **Step 2: Verify red**

Run: `node --test sp-proxy/tests/sp-budget.test.mjs`

- [ ] **Step 3: Implement compact strong-consistency CAS records**

Store one JSON record per `namespace/rotationId`, use integer micro-dollars, and reserve maximum cost
before `markProviderStarted`. Do not fall back to process memory. Keep terminal idempotency records
for the rotation and cumulative units after pruning details.

The record schema is:

```javascript
{
  schema: 1,
  authorizedMicros: 0,
  spentMicros: 0,
  reservedMicros: 0,
  units: { actorInputTokens: 0, actorOutputTokens: 0, transcriptionSeconds: 0, synthesisCharacters: 0 },
  operations: {},
  updatedAt: '2026-07-14T00:00:00.000Z',
}
```

- [ ] **Step 4: Verify green**

Run:

```bash
node --test sp-proxy/tests/sp-budget.test.mjs
npm --prefix sp-proxy test
```

- [ ] **Step 5: Commit**

```bash
git add sp-proxy/netlify/functions/_shared/sp-budget.mjs sp-proxy/tests
git commit -m "feat(sp-proxy): enforce atomic rotation budget"
```

---

### Task 6: Add Injected Speech Providers and the Disabled-by-Default Voice Endpoint

**Files:**

- Create: `sp-proxy/netlify/functions/_shared/sp-speech-provider.mjs`
- Create: `sp-proxy/netlify/functions/sp-voice.mjs`
- Create: `sp-proxy/tests/helpers/fake-speech-provider.mjs`
- Create: `sp-proxy/tests/sp-speech-provider.test.mjs`
- Create: `sp-proxy/tests/sp-voice.test.mjs`

**Interfaces:**

```javascript
provider.transcribe({ audio, mimeType, signal });
// => { text, durationSeconds, usage: { seconds } }
provider.synthesize({ text, profile, signal });
// => { audio: Uint8Array, contentType: 'audio/mpeg', usage: { characters } }

createSpeechProvider({ stack, fetchImpl, apiKeys });
createVoiceHandler({ http, packLoader, governance, ticketCodec, redemption, budget, provider, config });
```

- [ ] **Step 1: Write red provider tests**

Test deterministic fake transcripts/audio, exact usage units, invocation counts, configurable
provider errors, 50-second abort, OpenAI request shape, ElevenLabs request shape, and absence of keys
from returned errors.

- [ ] **Step 2: Write red endpoint tests**

Test health while disabled, health with reviewed fixtures, operations-key usage, accepted MIME list,
`401`, origin `403`, case/profile `403`, MIME `415`, size `413`, budget `429`, storage `503`, timeout
`504`, valid transcription, valid binary synthesis, altered ticket, and ten duplicate speech requests
causing exactly one provider invocation. Concurrent duplicates return `speech_in_progress`; a retry
after completion returns `speech_already_redeemed` and never starts another provider call.

- [ ] **Step 3: Verify red**

Run:

```bash
node --test sp-proxy/tests/sp-speech-provider.test.mjs
node --test sp-proxy/tests/sp-voice.test.mjs
```

- [ ] **Step 4: Implement providers and route**

Use native `fetch`, `FormData`, `Blob`, and `AbortSignal`. Accept only `audio/webm`,
`audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg`, and `audio/wav`. Count actual bytes and reject
above `4194304` before reservation. Export:

Export the injected `createVoiceHandler(dependencies)`, a default handler constructed from production
dependencies, and `config={path:'/api/sp/voice'}`. The handler routes only the four operations defined
in the design; every other method/operation returns typed `405 method_not_allowed`.

For synthesis, verify ticket and governance first, reserve the maximum budget, then atomically claim
the `jti`. A duplicate claim releases the not-started reservation and returns the redemption ledger's
stable code. Only after both reservation and claim succeed may the handler mark provider-started and
invoke the provider. Settle the budget and mark redemption terminal on success or provider failure;
a response loss or retry can never start a second synthesis call.

Production dependencies read `SP_MANAGED_VOICE_ENABLED` as false unless exactly `true`, use
`getStore({name:'sp-usage', consistency:'strong'})`, and require an explicit non-identifying
`SP_ROTATION_ID` whenever managed voice is enabled. Production fails closed rather than deriving a
rotation from a passcode; local tests inject an explicit test rotation. Deploy previews never enable real speech.
Health returns `warning` at $16; transcribe and speak reject new calls in that band while actor turns
retain the remaining envelope.

- [ ] **Step 5: Verify green**

Run: `npm --prefix sp-proxy test`

- [ ] **Step 6: Commit**

```bash
git add sp-proxy
git commit -m "feat(sp-proxy): add guarded managed speech endpoint"
```

---

### Task 7: Refactor the Actor Handler for Eligibility, Budget, Openings, and Typed Errors

**Files:**

- Modify: `sp-proxy/netlify/functions/sp.mjs`
- Create: `sp-proxy/tests/sp-handler.test.mjs`
- Modify: `_prototypes/sp-interview/tests/parity.test.mjs`

**Interfaces:**

Export injected `createSpHandler(dependencies)`, the default production handler, and the unchanged
`_internals={deriveState,computeCoverage,actorSystem,evaluatorSystem}` parity surface.

- [ ] **Step 1: Write red handler tests**

Inject fake pack, budget, ticket, and Anthropic clients. Assert reviewed-only GET, draft POST rejection
before quota/provider, `{caseId,mode:'open'}` canonical opening, optional opening ticket, converse
ticket, evaluator text-only response, typed `401/403/429/502/504`, captured Anthropic usage,
idempotent reservation, and ledger failure causing zero provider calls.

- [ ] **Step 2: Verify red**

Run: `node --test sp-proxy/tests/sp-handler.test.mjs`

- [ ] **Step 3: Refactor without changing deterministic engine exports**

Move HTTP, pack, governance, and budget work behind injected dependencies. Change Anthropic calls to
return:

```javascript
{
  text: content.filter((block) => block.type === 'text').map((block) => block.text).join(''),
  usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens },
}
```

Reserve conservatively using UTF-8 request bytes for maximum input tokens and configured maximum
output tokens. Remove the in-memory quota fallback. `mode:'open'` executes before empty-message
validation and makes no Anthropic call.

- [ ] **Step 4: Verify green and parity**

Run:

```bash
node --test sp-proxy/tests/sp-handler.test.mjs
node _prototypes/sp-interview/tests/parity.test.mjs
npm --prefix sp-proxy test
```

- [ ] **Step 5: Commit**

```bash
git add sp-proxy/netlify/functions/sp.mjs sp-proxy/tests \
  _prototypes/sp-interview/tests/parity.test.mjs
git commit -m "refactor(sp-proxy): govern actor turns and openings"
```

---

### Task 8: Integrate the Controller Into the Learner Experience

**Files:**

- Create: `_prototypes/sp-interview/tests/provider-errors.test.mjs`
- Create: `_prototypes/sp-interview/tests/managed-transport.test.mjs`
- Modify: `_prototypes/sp-interview/sp-interview.html`
- Modify: `_prototypes/sp-interview/sp-interview.voice.js`
- Generate: `_prototypes/sp-interview/sp-interview.preview.html`
- Create: `tests/smoke/interview-room.spec.js`
- Modify: `tests/smoke/playwright.config.js`

**Interfaces:**

- Consumes: Tasks 3, 6, and 7 controller/endpoint contracts.
- Produces: Off, Device voice, and conditionally available Managed voice modes.

- [ ] **Step 1: Write red provider and source-contract tests**

Expose `ProxyProvider` to the existing test hook. Assert `401`, `403`, `429`, timeout, and upstream
errors reject with stable codes and never call `MockProvider.respond`. Assert the HTML loads
`sp-interview.voice.js`, has one voice controller ref, contains no `SpeechRecognition`, no
`buildSpeechSteps`, no independent speech timer, and always renders `m.text`.

In `managed-transport.test.mjs`, specify `SPInterviewVoice.createManagedTransport({voiceEndpoint,
getStudentKey,fetchImpl})`. Assert transcription sends the original allowlisted audio body (never
base64 or FormData), `Content-Type`, `x-student-key`, case/encounter/turn IDs, and the caller's abort
signal. Assert synthesis sends only `{reply,ticket}`, requests audio, returns bytes plus MIME type,
and preserves typed endpoint errors. No method may log, persist, retry, or switch providers. Assert
all recording/blob references are released after draft creation, transcription rejection or timeout,
cancellation, or encounter end.

Create the Chromium `interview-room` Playwright project and write browser tests for keyboard mode
selection, text before audio, denied mic, blocked autoplay, slow actor, cancel-on-end, no overlap,
stale-response rejection, explicit offline choice, Stop/Replay, narrow layout, reduced motion, and
one live-region announcement per reply. Inject fake media/TTS APIs before navigation and use no live
credential or provider.

- [ ] **Step 2: Verify red**

Run:

```bash
node --test _prototypes/sp-interview/tests/provider-errors.test.mjs
node --test _prototypes/sp-interview/tests/managed-transport.test.mjs
node --test _prototypes/sp-interview/tests/voice-contract.test.mjs
npm --prefix tests/smoke ci
npm --prefix tests/smoke exec -- playwright install chromium
python3 -m http.server 4300 --directory _prototypes/sp-interview &
SERVER_PID=$!
trap 'kill $SERVER_PID' EXIT
curl --fail --silent --show-error --retry 20 --retry-delay 1 --retry-connrefused http://localhost:4300/sp-interview.html >/dev/null
SP_INTERVIEW_BASE_URL=http://localhost:4300/ npm --prefix tests/smoke run test -- --project=interview-room
```

Expected: the unit contracts and browser acceptance fail on the missing integrated behavior.

- [ ] **Step 3: Replace React's parallel audio state**

Load the controller before the app. Create it once with lazy `useRef`, subscribe once, and destroy on
unmount. Migrate legacy `cw_sp_voice=1` to `device`, never managed. Store only versioned mode and
consent keys in local storage.

Render a native mode select with `Voice off`, `Device voice`, and Managed voice only when health says
it is eligible. Managed selection first presents consent that separately names clerkship retention,
the selected speech provider, a linked provider data-use notice, provider processing, no
real-patient information, and equal typing access.

Construct the managed transport from the reviewed voice-health response and the existing tab-scoped
student key. Its raw-audio and signed-synthesis methods are the controller's injected `transcribe`
and `synthesize` dependencies; neither React nor `ProxyProvider` performs speech requests directly.

- [ ] **Step 4: Route encounter actions through the controller**

`begin` uses live `mode:'open'` for the governed opening and ignores late openings. `send` publishes
the learner message, calls `submitTurn`, shows `[Patient] is thinking` immediately, publishes the full
reply text, then calls `acceptPatientReply`. `endEncounter`, step-out, mode change, case change, and
page teardown cancel controller resources.

- [ ] **Step 5: Implement explicit stable fallback UI**

Actor errors keep the submitted learner text and offer Retry or Continue offline. Offline selection
rehydrates a fresh `MockProvider` by replaying prior learner turns before generating the failed turn,
then places a persistent `Offline simulation` label in the encounter header and beside every new
offline patient reply.
Voice errors keep patient text and offer Continue with text or Use device voice. No mode changes
without an explicit learner action.

- [ ] **Step 6: Add text-first Stop and Replay controls**

Every patient message remains complete. The active patient message exposes Stop; cached messages
expose Replay. Device voice uses `speechSynthesis` only. Managed dictation uses `MediaRecorder`; Device
mode uses typing or operating-system dictation and has no in-tool microphone.

- [ ] **Step 7: Regenerate and verify green**

Run:

```bash
node _prototypes/sp-interview/generate-preview.mjs --write
node --test _prototypes/sp-interview/tests/provider-errors.test.mjs
node --test _prototypes/sp-interview/tests/managed-transport.test.mjs
node --test _prototypes/sp-interview/tests/voice-state.test.mjs
node --test _prototypes/sp-interview/tests/voice-contract.test.mjs
node _prototypes/sp-interview/tests/preview.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
npm --prefix tests/smoke ci
npm --prefix tests/smoke exec -- playwright install chromium
python3 -m http.server 4300 --directory _prototypes/sp-interview &
SERVER_PID=$!
trap 'kill $SERVER_PID' EXIT
curl --fail --silent --show-error --retry 20 --retry-delay 1 --retry-connrefused http://localhost:4300/sp-interview.html >/dev/null
SP_INTERVIEW_BASE_URL=http://localhost:4300/ npm --prefix tests/smoke run test -- --project=interview-room
```

- [ ] **Step 8: Commit**

```bash
git add _prototypes/sp-interview tests/smoke/interview-room.spec.js tests/smoke/playwright.config.js
git commit -m "feat(sp-interview): integrate smooth governed voice experience"
```

---

### Task 9: Ship Build Contracts, CI, Operations, and a Release Passport

**Files:**

- Create: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`
- Create: `_prototypes/sp-interview/tests/ops-docs.test.mjs`
- Modify: `_prototypes/sp-interview/tests/run-all.sh`
- Modify: `13_Faculty_Resources/_automation/site_build/site_manifest.json`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `.github/workflows/ci.yml`
- Modify: `sp-proxy/README.md`
- Modify: `sp-proxy/REDTEAM_CHECKLIST.md`
- Create: `_prototypes/sp-interview/release-passport.mjs`

**Interfaces:**

- Produces built `sp-interview.html`, pack, and controller assets for both sites.
- Produces a content-free release-readiness receipt; it does not attest anything.

- [ ] **Step 1: Write red CI/build and operations-document tests**

Assert Node 20 setup precedes the aggregate SP/proxy suite and that suite precedes site builds. Assert
manifest `toolAssets` includes the pack and controller and built output contains both. Require README
sections for disabled flag, environment, separate retention, accidental-PHI response, rate card,
budget, usage auth, vendor alerts, rollback, and rotation turnover. Require all ten voice red-team
probes and reject the phrase `falls back automatically`.

- [ ] **Step 2: Verify red**

Run:

```bash
node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs
node --test _prototypes/sp-interview/tests/ops-docs.test.mjs
```

- [ ] **Step 3: Make assets data-driven and add CI gates**

Add manifest entries:

```json
"toolAssets": [
  ["_prototypes/sp-interview/sp-interview.pack.json", "sp-interview.pack.json"],
  ["_prototypes/sp-interview/sp-interview.voice.js", "sp-interview.voice.js"]
]
```

Preflight and copy every entry. Static QA fails when a relative script source is absent. Add
`npm --prefix sp-proxy ci`, `npm --prefix sp-proxy test`, the SP runner, and the Python attestation
test after Node setup and before site builds. After the smoke job starts built-site servers, run the
`interview-room` Playwright project against `http://localhost:4200/tools/`.

- [ ] **Step 4: Document exact safe operations**

Document all new environment variables without values, the `$16/$20` behavior, content-free logs,
separate operations credential, provider-policy review record, rollback by setting
`SP_MANAGED_VOICE_ENABLED=false`, and manual external gates. Update the red-team checklist with mic
after off, overlap, self-capture, wrong-case voice, altered ticket, stage direction, audio after end,
silent fallback, cap behavior, and safety pronunciation.

- [ ] **Step 5: Generate a content-free release passport during tests**

Create `_prototypes/sp-interview/release-passport.mjs`. It reports only status and SHA-256 hashes for
HTML, pack, case review, speech engine, profiles, privacy record, and rate card. It prints `missing`
for external approvals and never upgrades status. The doc explains that missing external gates permit
merge with managed voice disabled but not learner activation.

- [ ] **Step 6: Verify green**

Run:

```bash
node --test _prototypes/sp-interview/tests/ci-build-contract.test.mjs
node --test _prototypes/sp-interview/tests/ops-docs.test.mjs
npm --prefix sp-proxy test
bash _prototypes/sp-interview/tests/run-all.sh
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml _prototypes/sp-interview \
  13_Faculty_Resources/_automation/site_build sp-proxy
git commit -m "chore(sp-interview): add release and operations gates"
```

---

### Task 10: Browser Acceptance, Whole-Branch Verification, and Morning Handoff

**Files:**

- Modify only additional files required by defects proven during this task.

- [ ] **Step 1: Run the complete non-browser verification from a clean dependency install**

```bash
rm -rf sp-proxy/node_modules
npm --prefix sp-proxy ci
npm --prefix tests/smoke ci
npm --prefix tests/smoke exec -- playwright install chromium
npm --prefix sp-proxy test
node _prototypes/sp-interview/generate-preview.mjs --check
bash _prototypes/sp-interview/tests/run-all.sh
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: every command exits `0`; no test calls a real speech or actor provider.

- [ ] **Step 2: Run browser acceptance against the built MS3 tool**

Use the existing Playwright dependency and a local HTTP server. With fake media/TTS adapters verify
keyboard-only mode selection, full text before audio, denied mic, blocked autoplay, slow actor,
cancel-on-end, no overlap, stale response rejection, explicit offline choice, Stop/Replay, narrow
mobile layout, reduced motion, and exactly one live-region announcement per patient reply.

Run the existing Chromium project named `interview-room` with
`SP_INTERVIEW_BASE_URL=http://localhost:4200/tools/`. The test opens `sp-interview.html`, injects fake
browser audio APIs before navigation, and never supplies a live endpoint or passcode.

```bash
python3 -m http.server 4200 --directory _build/ms3 &
SERVER_PID=$!
trap 'kill $SERVER_PID' EXIT
curl --fail --silent --show-error --retry 20 --retry-delay 1 --retry-connrefused http://localhost:4200/tools/sp-interview.html >/dev/null
SP_INTERVIEW_BASE_URL=http://localhost:4200/tools/ npm --prefix tests/smoke run test -- --project=interview-room
```

- [ ] **Step 3: Fix only reproduced defects with TDD**

For every defect, add the smallest failing automated test, watch it fail, implement the fix, and run
the focused test plus the aggregate suite before continuing.

- [ ] **Step 4: Commit any browser-acceptance repairs**

If Step 3 changed files, stage only those named defect fixes, verify `git diff --cached --check`, and
commit them as `fix(sp-interview): resolve browser acceptance defects`. Do not proceed with a dirty
tree. If no defect was reproduced, create no empty commit.

- [ ] **Step 5: Refresh and reconcile the remote base**

Run `git fetch origin main`. If `origin/main` is not already an ancestor of `HEAD`, merge it with
`git merge --no-edit origin/main`; do not discard either side. Resolve only genuine in-scope
conflicts, add a focused regression test for any behavioral conflict, then rerun Steps 1 and 2.

- [ ] **Step 6: Obtain independent whole-branch review**

Generate a review package from `git merge-base origin/main HEAD` through `HEAD`. Require separate
verdicts for specification compliance and code quality. Fix every Critical or Important finding,
commit the reviewed fixes, rerun their covering tests plus the aggregate suite, and obtain clean
re-review.

- [ ] **Step 7: Run final repository evidence**

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted changes, and only intentional Interview Room,
governance, build, CI, proxy, test, and documentation commits.

- [ ] **Step 8: Push, open or refresh the pull request, and confirm remote checks**

Push `codex/interview-room-voice-experience-design`, open or refresh its pull request against
`main`, and wait for required checks. Confirm the PR reports no merge conflicts and save its URL.
If authentication or a remote service is unavailable, preserve the clean verified branch and report
that external blocker explicitly instead of claiming remote merge readiness.

- [ ] **Step 9: Prepare morning merge guidance**

Report the branch, commits, exact verification results, managed-voice disabled status, remaining
external gates, safe rollback, and the concrete merge command or pull-request URL. Do not label
managed voice learner-ready until audition, privacy, real-device, pilot, and faculty gates are
recorded.

---

## External Release Gates That Code Must Not Claim to Complete

- Blind twelve-clip Dana/Marcus/Ray synthesis audition with five to eight raters.
- Twenty-four-recording transcription benchmark with zero meaning-changing critical errors.
- Faculty approval of persona fit and safety-phrase pronunciation.
- Institutional review of provider retention, training use, deletion, region, subprocessors, and
  account controls.
- Current stock-voice/provider-terms review.
- Real-device Safari/iOS/Windows, VoiceOver, autoplay, and campus-network checks.
- Volunteer learner pilot with realism at least 4/5 and distraction at most 2/5.
- Campus-network latency confirmation: median send-to-first-audio at most 3 seconds, p95 at most 6
  seconds, and median text-to-audio start at most 750 ms.
- Measured 96-encounter projection at or below $20 using the refreshed rate card.
- Dana voice-profile attestation and separate Marcus/Ray clinical plus voice attestation.

The software is merge-ready when all automated and independent review gates pass with managed voice
disabled. Activation is a later faculty/operations action after every external gate above is recorded.
