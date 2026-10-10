# Reading Companion Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a protected one-page reading companion with five preset questions, checked source references, and a small faculty-evaluated pilot.

**Architecture:** Add a same-origin page and function to `sp-preview`. A bundled, faculty-approved excerpt and server-selected prompts feed a bounded Responses request; validated answers live only in browser memory. A narrow shared transport/evidence contract also serves the independently implemented faculty brief.

**Tech Stack:** Existing Node 22, ESM, native fetch, Netlify Functions and Blobs, plain HTML/CSS/JavaScript, Python source extraction, node:test and existing Playwright suite. No new runtime package is required.

**Spec:** [Paired pilot design](../specs/2026-10-10-paired-ai-pilot-design.md). Read it and this plan before implementation. Planning baseline: `78082c882be9aff968e14c0bcf34ded48981de50`; refresh current main before work.

## Global Constraints

- No PHI, no learner free text, no persistent provider conversations, no automatic disposition/attestation, no new analytics.
- Keep `sp-preview` on Node 22 and the faculty console on its existing Node 24 setting.
- Reader: at most 20 paid attempts/day and 5/rolling 30 minutes. Faculty: 10/day and 2/rolling 30 minutes.
- Reader input context: at most 12,000 characters; faculty context: 24,000 characters. Reject oversized input without truncation.
- Maximum output tokens: reader 1,400; faculty 2,500. Timeout: 25 seconds per provider request, bounded response body 64 KiB, no automatic retries, no tools, `store:false`, no `previous_response_id`, and no tracing of prompt/response bodies.
- All display text uses text nodes, not HTML insertion.
- Feature flags default off. Missing credentials, stable budget namespace, expiry, source manifest, or approved excerpt fail closed.

## Review Focus

1. A source is present but its faculty signature no longer binds: extraction must refuse, not copy a reviewed badge (R1).
2. A provider supplies plausible prose with an invented citation: display nothing from the response (R2).
3. Two simultaneous clicks/retries or two function instances request the same operation: one paid attempt at most (R2/R3).
4. A late response arrives after Clear/navigation or after a new request: do not resurrect old content or focus (R3).
5. A visually successful preview contains private source/config files in its publish directory: the exact asset allowlist must fail the build (R3).

---

## File map and division of work

| Unit | New files | Existing files to change |
| --- | --- | --- |
| Source selection | `sp-preview/config/reading-companion.json`, `sp-preview/lib/reading-companion/source.mjs`, `sp-preview/build-reading-source.py` | `sp-preview/build.mjs`, `.gitignore` |
| Shared contract/provider/budget | `sp-preview/lib/ai-pilot/contract.mjs`, `provider.mjs`, `budget.mjs` | None; preserve existing SP adapters/ledger |
| Reader function | `sp-preview/lib/reading-companion/handler.mjs`, `sp-preview/netlify/functions/reading-companion.mjs` | `sp-preview/netlify.toml` |
| Reader page | `sp-preview/public/reading-companion.html`, `reading-companion.js`, `reading-companion.css` | `sp-preview/build.mjs`, `sp-preview/tests/build.test.mjs` |
| Tests/evaluation | `sp-preview/tests/reading-companion-source.test.mjs`, `ai-pilot-contract.test.mjs`, `ai-pilot-budget.test.mjs`, `ai-pilot-provider.test.mjs`, `reading-companion-handler.test.mjs`, `tests/smoke/reading-companion.spec.js`, `sp-preview/evals/reading-companion-v1.json`, `sp-preview/qa/ai-pilot-eval.mjs` | `sp-preview/README.md`, `tests/smoke/playwright.config.js` |

Private generated data belongs under `sp-preview/generated/reading-companion.json`, bundled only into the function. Serve the approved excerpt through the authenticated function; never put the private manifest, secrets, or raw repository paths in `dist`. Excerpt text is already published curriculum, but access and output minimization still follow the pilot contract.

R1 can proceed while the faculty track prepares its reference corpus. R2 owns the shared interface; freeze it before the faculty endpoint integration. R3 and faculty F2/F3 can then proceed independently. Before changing CI/verification enrollment, check existing inclusion; any necessary `bin/verify.sh` or workflow change is a separate governance PR.

## R1: source manifest and deterministic extraction

**Files:** source-selection files above; `sp-preview/tests/reading-companion-source.test.mjs`.

**Interfaces:**
- `build-reading-source.py --root ROOT --out FILE --check` reads the current effective attestation using the repository's canonical attestation helpers; `--check` compares expected output without writing.
- Generated pack: `{version:1, sourceId, slug, audience:"ms3", sourceCommit, sourceHash, attestationHash, reviewedAt, attribution, units, presets}`. `sourceHash` is SHA-256 of the exact canonical JSON pack inputs, excluding itself and wall-clock build time; it is not the repository's SHA-1 attestation hash.
- `loadReadingPack()` returns the bundled pack. `selectPreset(pack,presetId)` returns only the authorized unit IDs and fixed instruction for that preset; rejects unknown IDs.

- [ ] **Write failing extraction tests.** Use a temporary miniature source and controlled reviewed/withdrawn/drifted ledger fixtures; clean them up with `t.after`. Include missing and repeated headings, reordered headings, draft ledger, and modified source with unchanged stored attestation. The extractor must delegate binding calculation to existing canonical helpers, not copy the hash algorithm.

```js
test('unknown presets cannot expand the source set', () => {
  assert.throws(() => selectPreset(pack, 'all-pages'), /unknown_preset/);
});
test('every preset names existing evidence units', () => {
  const ids = new Set(pack.units.map(unit => unit.id));
  for (const preset of pack.presets) {
    assert.ok(preset.unitIds.length > 0);
    assert.ok(preset.unitIds.every(id => ids.has(id)));
  }
});
```

- [ ] **Run the test before implementation:** `node --test sp-preview/tests/reading-companion-source.test.mjs`. Confirm failure because the new extractor/module does not exist.
- [ ] **Implement extraction.** Configure slug `pg_interview.md`, source path and four exact headings from the spec. Take complete heading-bounded sections, not manually copied strings or fragile line numbers. Emit evidence units by paragraph/bullet, preserving exact original text and heading IDs. Duplicate/missing headings, embedded HTML, unexpected source lineage, draft/drifted/unbound ledger, or text >12,000 characters stops extraction. Keep the five fixed preset IDs `frame`, `opening`, `permission`, `closing`, `recall`.
- [ ] **Bind metadata.** Include `LICENSE-content` attribution, source revision, and canonical attestation receipt. Check `shipped_pages.json` for source/slug/audience eligibility. Source attestation approves the source text only; it does not approve generated explanations or the new feature.
- [ ] **Isolate build availability.** Always regenerate the ignored pack from source at build time with Python's existing stdlib-only attestation helpers. When the pilot is disabled and source eligibility fails, emit only `{version:1,available:false,reason:"source_unavailable"}` for the reader; keep the existing room build working and never reuse an older generated pack. An explicitly enabled build requires a valid pack. Runtime handlers reject the unavailable sentinel before provider access. Test a drifted source in both enabled and disabled builds.
- [ ] **Add exact ignore entries before producing artifacts:** `/sp-preview/generated/` and `/output/ai-pilot/`. Check them with `git check-ignore`; use mode 0700 for the evaluation directory and 0600 for output files. Generated pack data remains excluded from the public asset allowlist even though its source excerpt is published curriculum.
- [ ] **Run extraction against current main and review the selected excerpt with faculty before activation.** The observed planning hash is a comparison point, not a hardcoded perpetual eligibility rule. A changed hash requires a new reviewed pack.
- [ ] **Run source tests and inspect generated-pack/public-output separation.** Commit only intended manifest/extractor/test changes; do not add generated learner builds or edit the ledger.

## R2: shared evidence contract, bounded provider, and isolated budget

**Files:** `sp-preview/lib/ai-pilot/{contract,provider,budget}.mjs` and matching tests.

**Interfaces:**
- `assertEvidenceReferences(statements,units)` rejects unknown/missing IDs and non-string/oversized text; returns validated statements.
- `contextDigest(value)` returns SHA-256 of canonical JSON with recursively sorted object keys and preserved array order, excluding only the top-level `contextDigest` field. Both services use the same tested definition; faculty F1 supplies its receipt fields.
- `createPilotProvider({fetchImpl,apiKey,model,now})` exposes `generate({kind,instructions,context,schema,signal}) -> {value,usage,model}`. `kind` is `reader` or `faculty`; output and input ceilings are chosen by code, never request parameters.
- `createPilotBudget({store,namespace,dailyLimit,windowLimit,now})` exposes `reserve({requestId,contextDigest}) -> {reserved:true}`; duplicates throw `already_submitted`, changed bindings throw `request_conflict`, capacity throws `budget_exhausted`. Use a new ledger schema/key under the stable pilot namespace; do not modify `createPreviewBudget` or its records.

The reader provider schema is strict, all keys required, and each object has `additionalProperties:false`:

```json
{
  "type":"object","additionalProperties":false,
  "required":["result","points"],
  "properties":{
    "result":{"type":"string","enum":["answered","insufficient_source"]},
    "points":{"type":"array","items":{
      "type":"object","additionalProperties":false,
      "required":["text","evidenceIds"],
      "properties":{
        "text":{"type":"string"},
        "evidenceIds":{"type":"array","items":{"type":"string"}}
      }
    }}
  }
}
```

Application checks additionally require 1–4 cited points for `answered`, zero points for `insufficient_source`, each point <=600 characters, and 1–3 references per point. Reference IDs must be in the preset's selected units, not merely anywhere in the pack.

- [ ] **Write failure tests for attribution and budget races.** Use an injected CAS store fixture with interleaved reads/writes, not an in-memory counter that bypasses concurrency.

```js
test('a real-looking invented reference is rejected', () => {
  assert.throws(() => assertEvidenceReferences(
    [{text:'A statement',evidenceIds:['missing-unit']}],
    [{id:'frame-1',text:'Authored source'}]
  ), /unknown_evidence/);
});
test('the same operation reserves once across instances', async () => {
  const options = {store,namespace:'pilot-test/reader',dailyLimit:20,windowLimit:5,now};
  const a = createPilotBudget(options), b = createPilotBudget(options);
  const request = {requestId:'00000000-0000-4000-8000-000000000001',contextDigest:'a'.repeat(64)};
  const results = await Promise.allSettled([a.reserve(request),b.reserve(request)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
```

- [ ] **Run new tests and confirm intended failures.** Then implement strict reference validation and atomic conditional-write reservation following `sp-preview/lib/budget.mjs`'s consistency/retry pattern. Retain operation hashes for 15 days, covering the full 14-day pilot plus one day; test midnight and day-14 replay. Do not reset the ledger when expiry is extended or a deployment changes. Reject changed stored policy and namespace collisions. Ledger failure is unavailable, never free access.
- [ ] **Implement provider transport separately from `openai-provider.mjs`.** Use `POST https://api.openai.com/v1/responses`, the baseline model in the spec, `store:false`, strict `text.format`, explicit ceilings, no tools, and low reasoning effort if supported by the pinned baseline. Parse completed output only; reject refusals, incomplete responses, bad JSON, oversized bytes, wrong content type, redirects, and provider errors. No raw provider body enters logs/client errors.
- [ ] **Test timeout, cancellation, response-body cap, schema/refusal, source-instruction injection, and no hidden retries.** A transport spy must see exactly one fetch for an accepted attempt and zero for contract/budget rejection. Semantic source injection is also a faculty-evaluated case, not “proved safe” solely by string tests.
- [ ] **Run `node --test sp-preview/tests/ai-pilot-*.test.mjs` and existing `npm --prefix sp-preview test`.** Commit the shared modules/test changes as an independently reviewable unit.

## R3: authenticated endpoint and accessible protected page

**Files:** reader handler/function/public assets, `sp-preview/netlify.toml`, build allowlist, handler and browser tests.

**Interfaces:** `createReadingHandler({env,pack,provider,budget,now}) -> async (Request) => Response`.

Authenticated GET `/api/reading-companion` returns the public excerpt projection, labels, presets and source hash. POST accepts exactly:

```json
{"version":1,"sourceId":"interview-opening-v1","sourceHash":"64 lowercase hex characters","presetId":"frame","requestId":"00000000-0000-4000-8000-000000000001"}
```

The quoted sourceHash describes validation, not a runnable fixture value; tests use `pack.sourceHash`. Success is `{version:1,status:"answered"|"insufficient_source",sourceId,sourceHash,presetId,points}`. Application code owns the metadata. HTTP errors expose `{error:{code,message}}`: 400 invalid request, 401 unauthorized, 403 origin, 409 source/request conflict or duplicate, 429 quota, 503 disabled/expired/configuration/unavailable. No hidden retry.

- [ ] **Write handler tests before code.** For disabled/missing expiry, expired pilot, wrong passcode/origin, unknown preset, extra `text`/URL field, source mismatch and exhausted budget, assert zero provider calls.

```js
test('a free-text field is rejected before a paid request', async () => {
  const request = makeRequest({...validRequest,text:'unapproved input'});
  const response = await handler(request);
  assert.equal(response.status, 400);
  assert.equal(providerCalls.length, 0);
});
```

- [ ] **Implement strict checks in order:** request byte ceiling -> method/origin/access -> flags/config/expiry -> exact schema/source/preset -> evidence context -> atomic reservation -> provider -> reference/schema validation -> response. Read the dedicated key from the server env; never forward it to OpenAI. Use no-store responses and constant-time access-key comparison.
- [ ] **Add thin function adapter and explicit TOML rewrite.** Do not add `config.path` or relax existing Dana routes. Initialize the separate `/reader` ledger only from configured stable namespace.
- [ ] **Implement the page.** Password stays in module memory; fetch the excerpt after login. Use buttons with descriptive names, one polite live status, a results heading, source quotations and Clear. Show loading immediately, disable duplicate submission, preserve source reading during requests, and abort/ignore stale results on Clear/navigation. Recall displays the fixed question locally; generation occurs only on Reveal. No answer input or automatic scoring.
- [ ] **Add the three public assets to the exact allowlist and update its test.** A fixture with `private-source.json` in public must fail. The HTML contains no inline executable script/style, private config, or credential.
- [ ] **Run a real local browser with mocked provider and authenticated test fixtures.** Add `reading-companion.spec.js` explicitly to the `hosted-preview` project's `testMatch` array in `tests/smoke/playwright.config.js`; its current match names only `hosted-preview-browser.spec.js`. Follow that suite's local server and actual-header harness. Prove discovery with `npx playwright test --project=hosted-preview --list` from `tests/smoke`, then run the project. Test 320px/desktop, keyboard focus, reduced motion, loading, cancel, stale late response, disabled/expired service, and no free-text network payload. Do not regenerate Ubuntu visual baselines locally.
- [ ] **Run targeted tests and full preview regression.** Separate source/content changes from any governing CI edits before commit/PR. This step ships dark code only.

## R4: evaluation, readiness receipt, and facilitated trial

**Files:** evaluation manifest/runner and `sp-preview/README.md`; private outputs under ignored `output/ai-pilot/`.

**Interfaces:** `node sp-preview/qa/ai-pilot-eval.mjs --kind reader --fixture PATH --out DIR` defaults to injected/mock provider; `--live` is an explicit separate mode with preflight that verifies exact source/model/prompt manifest, approved access, and remaining quota. Do not build an automatic online CI evaluation.

Live evaluation must also reserve every attempt atomically through `createPilotBudget`, backed by the same durable Netlify Blobs store and applicable `/reader` or `/faculty` namespace as the deployed functions. A quota preflight alone is insufficient. Configure access to that exact store during authorized setup; fail closed if it cannot be established. Do not substitute an in-memory/file counter or an unapproved fresh namespace. The runner uses new UUIDs, enforces the manifest's finite request count, performs no hidden retries, and counts failed/cancelled attempts. Parallel live runners and deployed requests must contend on the same durable cap.

- [ ] **Create a fixed 15-answer evaluation manifest and ten negative-control fixtures as specified in the design.** Each record names source hash, preset ID, expected support/abstention criteria, and faculty review fields. Never fabricate completed faculty ratings.
- [ ] **Test that absent model/source/rights receipt stops live execution.** Save output provenance, actual token usage, latency and success/failure codes for all attempts; record synthetic/approved outputs only. The runner does not read learner state.
- [ ] **Complete OpenAI key setup through the approved plugin workflow only when implementation/live evaluation is authorized.** Keys never go into documentation, Git, browser assets, or chat. Verify provider terms and selected spending envelope with the owner before setting activation flags.
- [ ] **Run all 15 live answers, then have faculty judge meaning against the fixed rubric.** Apply the design's thresholds; a critical error stops the pilot. Repeat only changed/failed scope until fixed, then run the entire fixed set for the candidate release.
- [ ] **Run `bash bin/verify.sh`, current CI, and deployed protected-browser acceptance at the exact candidate revision.** Confirm source pack and function revisions agree; distinguish mocked browser proof from live provider proof and native screen-reader acceptance.
- [ ] **Before each facilitated session, verify the source remains BOUND against current main.** Record date/revision and disable the trial if this cannot be established. Set a maximum 14-day expiry; test both flag-off and expiry withdrawal. Recruit 3–5 MS3 volunteers only for this protected, supervised trial.
- [ ] **Write a short continue/revise/stop report with quality, usefulness, latency and actual cost.** Link the exact output set and faculty judgments. No promotion to main-reader navigation or resident rollout is included in this plan.

## Integration handoff and next option

The faculty plan consumes only R2's public module interfaces and evidence-unit shape; it does not reuse the reader passcode or prompts. Both can remain independently disabled. Preserve a text-only source reading experience when generation is unavailable.

After the paired trial, the next implementation decision is either a normal link from `fd_reader.js` to the protected companion, or faculty-reviewed static explanation cards. Full inline Reader integration would separately cover `fd_wire.js`, action contracts, CSS inventory, effective-ledger eligibility and browser tests; it is not hidden work in this pilot.
