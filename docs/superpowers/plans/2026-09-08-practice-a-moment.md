# Practice a Moment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver three short, voice-first practice moments inside the protected Interview Room, with private reflection, evidence-linked feedback, one spoken alternative, and optional transfer to a different situation.

**Architecture:** Reuse the established microphone/audio controller and receipt primitives; add a separate moment endpoint, immutable scenario catalog, and bounded text-only review. Keep existing full encounters, learner-site navigation, and the stable usage ledger unchanged. Review evidence and private reflection are separate data flows.

**Tech Stack:** Existing plain JavaScript/IIFE UI, Node >=22 ESM, Netlify Functions, @netlify/blobs 11.0.2, current pinned OpenAI actor/TTS models, node:test, Playwright 1.62.1. No new framework or dependency required.

**Spec:** `docs/superpowers/specs/2026-09-08-practice-a-moment-design.md` and `docs/superpowers/specs/2026-09-08-practice-a-moment-cases.md`. Read both; they define the actual content and contracts this plan implements.

## Global Constraints

- Complete Stage A and Stage B. Elena/Priya alone are a milestone, not final completion.
- Four patient-facing turns per moment; existing full encounters retain ten.
- Automatic quiet window 4.5 seconds; more thinking time 8 seconds; Space/Done finish early; no automatic sends while held, reflecting, editing or uncertain.
- Same 20 starts per UTC day, 680 operation units per UTC day, 340 per rolling 30 minutes, same ledger schema/key/namespace. Maximum moment 19 units; no dollar inference.
- Same 30-minute receipt expiry; case/rubric revision, deployment, origin, access and mode binding. No receipt refresh extends original expiry.
- New private reflection never leaves RAM/UI. Existing attending presentation remains private. Only the distinctly labeled exercise formulation enters the review upon explicit submission.
- Use current model pins and existing Marin/Cedar; all new moment synthesis and playback speeds 1.0. No change to Dana or Marcus.
- No trait/readiness/competence score, timed grading, forced patient warmth, forced disclosure, or required preferred phrase.
- No transcript/audio persistence or dialogue logging, no new analytics, no new clinical claims/policy decisions, and no attestation edits.
- No credential values in files, patches, output, fixtures or prompts. Reuse authorized server configuration without exposing it.
- Preserve unrelated work. Branch prefix `codex/`. Never reset, bypass checks, weaken CSP or regenerate visual baselines on macOS.
- Product implementation is the executor's task. This packet itself contains plans and authored draft content, not a claim of shipped behavior.

## Execution strategy and file map

One integrating Codex agent owns shared runtime changes. Parallelize the content/projection work and the pure evidence validator only after agreeing on the interfaces below; do not have two agents edit `app.js`, `state.mjs`, provider transport, or the same smoke file concurrently. Use a fresh independent reviewer for protocol/budget and for educational feedback. Do not send third-party messages.

| File | Action / responsibility |
|---|---|
| `sp-preview/lib/moments/catalog.mjs` | New: all three private scenario definitions and immutable public projection. |
| `sp-preview/lib/moments/context.mjs` | New: actor and review contexts; no established-case resolver dependency. |
| `sp-preview/lib/moments/state.mjs` | New: strict moment wrapper, lower turn limit, closure, terminal alternative. |
| `sp-preview/lib/moments/evidence.mjs` | New: server evidence sources, schema, citation/role/sequence validation, safe display DTO. |
| `sp-preview/lib/moments/handler.mjs` | New: exact request validation, reservations, dialogue/review streaming. |
| `sp-preview/netlify/functions/practice-moment.mjs` | New: trusted deployment environment and SAME runtime budget/store. |
| `sp-preview/lib/state.mjs` | Extract playback finalization only; preserve existing exported functions/defaults. |
| `sp-preview/lib/openai-provider.mjs` | Add bounded `evaluateMoment`; preserve actor and speech behavior. |
| `sp-preview/lib/portrayal.mjs` | Add explicit profiles for three moment IDs. |
| `sp-preview/bin/generate-moment-content.mjs` | New: deterministic explicit public projection, write/check modes. |
| `sp-preview/public/moment-content.js` | New generated public projection; no facts/rubric leakage. |
| `sp-preview/public/moment-station.js` | New pure DOM projection/callbacks, reflection/review/output/alternative/transfer. |
| `sp-preview/public/app.js` | Parameterize mode/endpoint/cap; own review transport and speech capture destinations. |
| `sp-preview/public/index.html`, `styles.css` | Two entry choices, accessible moment layout, reviewed copy. |
| `sp-preview/build.mjs`, `netlify.toml` | Seven-asset allowlist and one additional API rewrite; unchanged CSP. |
| `sp-preview/tests/moments-*.test.mjs` | New runtime/content/review/controller tests, run by existing test glob. |
| `sp-preview/tests/fixtures/moments/challenges.json` | 39 authored challenge cases, not generated expectations. |
| `sp-preview/tests/fixtures/moments/runtime.mjs` | Shared fake provider/CAS store/request harness for new tests. |
| `sp-preview/tests/build.test.mjs`, `client.test.mjs`, `handler.test.mjs`, `provider.test.mjs` | Extend meaningful affected contracts without deleting original cases. Verify actual provider test filename before modifying; current source file is `provider.test.mjs`. |
| `tests/smoke/hosted-preview-browser.spec.js` | Extend existing CSP project with moment endpoint, phase and privacy journeys. |
| `sp-preview/qa/moments-audition.mjs` | New explicitly invoked bounded paid proof; never in CI/default tests. |
| `sp-preview/README.md`, `ACCEPTANCE.md` | Truthful public/private data map, cost allowances, flags, release receipts and human evidence gaps. |

No `ci.yml` step is needed: `sp-preview` *.test.mjs and build are already invoked by CI and verify.sh; the existing hosted-preview smoke project runs the extended spec. Verify inclusion by making a temporary deliberate failure in a new local test and observing the established command fail, then restore it. Do not commit the deliberate defect.

## Task 0: establish an isolated current baseline

**Files:** Read repository instructions, the three companion docs, `sp-preview/README.md`, `ACCEPTANCE.md`, `sp-proxy/REDTEAM_CHECKLIST.md`, `.github/workflows/ci.yml`, `bin/verify.sh`. No runtime edits.

**Interfaces:** Consumes PR582 merge `71f6ac8a8bb74f6e544255d3f3068d1c305c4086`; produces a clean isolated branch, baseline SHA, and logs.

- [ ] Inspect `git status --short`, worktree inventory and current `AGENTS.md`/`CLAUDE.md`. Do not edit the root's unrelated CI/maintenance work.
- [ ] Fetch and branch from current main; execute from the repository root. If the named worktree/branch already exists, inspect/resume it rather than overwriting it.

```bash
git fetch origin
git merge-base --is-ancestor 71f6ac8a8bb74f6e544255d3f3068d1c305c4086 origin/main
git worktree add .worktrees/practice-a-moment -b codex/practice-a-moment origin/main
```

- [ ] Copy this packet's four documents into the new worktree if they are not yet on main. Read exact scope before coding. Do not copy `.env*`, access files, node_modules or build output between worktrees.
- [ ] Discover the active collision tool with `rg --files .worktrees/agent-collision-sentinel | rg '/collision_report.py$'`. At planning time it is `tools/coordination/collision_report.py` in that worktree. Run its `--help`, then `--path sp-preview --path tests/smoke/hosted-preview-browser.spec.js --check`. Resolve actual overlap through separate ownership; do not assume a separate worktree removes collisions.
- [ ] In the new worktree, confirm Node >=22, install package dependencies, and run the narrow baseline followed by the root gate. Save stdout/stderr to ignored `output/practice-moment/` and inspect failures before editing.

```bash
npm --prefix sp-proxy ci
npm --prefix sp-preview ci
npm --prefix tests/smoke ci
npm --prefix sp-preview test
npm --prefix sp-preview run build
bash bin/verify.sh
```

**Acceptance:** current main contains the earlier family/MI work; changes are isolated; baseline failures distinguished from new regressions. Record baseline counts, do not assume the previous198/21 remain current.

## Task 1: encode immutable authored moments and public projections

**Files:** Create catalog, generator, generated public content, `moments-content.test.mjs`, and challenge JSON. Read companion cases without inventing clinical history.

**Interfaces:**

```js
export const momentIds = Object.freeze([
 'moment_elena_rupture_001', 'moment_priya_formulation_001', 'moment_luis_teachback_001'
]);
export function getMoment(id) {} // undefined or frozen definition
export function publicProjection(definition) {} // exact fields in design §5
```

Definition fields: `schemaVersion`, `id`, `revision`, `reviewStatus`, `maxTurns`, `learner`, `facts` (id/text pairs), `opening`, `actorDirections`, `speechProfile`, `criteria`, `templates`. Stable IDs/templates are in the companion cases appendix. Freeze nested objects. No `variant` request or live variant selector in this release; break/decline variants are test fixtures.

- [ ] Create all three definitions, stage-tagged A/A/B, using the supplied facts and openings. Priya starts with an accurate available concern, not a fabricated learner error. Her medication history remains unknown.
- [ ] Write tests that fail if a projection leaks a private canary field or permits an unknown scenario.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {getMoment, momentIds, publicProjection} from '../lib/moments/catalog.mjs';
test('all selected moments have authored facts and a safe public projection', () => {
 assert.equal(momentIds.length, 3);
 for (const id of momentIds) {
  const d = getMoment(id);
  assert.equal(d.maxTurns, 4);
  assert.equal(d.reviewStatus, 'draft-pending-faculty-review');
  assert.ok(d.facts.length && d.criteria.length);
  const projected = publicProjection({...d, privateCanary:'PRIVATE_CANARY'});
  assert.ok(!JSON.stringify(projected).includes('PRIVATE_CANARY'));
  for (const key of ['facts','criteria','actorDirections','templates'])
   assert.ok(!Object.hasOwn(projected, key));
 }
 assert.equal(getMoment('unknown'), undefined);
});
```

- [ ] Run `node --test sp-preview/tests/moments-content.test.mjs` before and after implementation. Add exact projection-key assertions; a regex against only one private field is insufficient.
- [ ] Implement generator with sorted IDs, deterministic JSON and no timestamps. `--check` compares bytes and exits1 on mismatch; `--write` replaces only its generated file. Add the check to a new node test, not a new CI workflow step.
- [ ] Encode the 39 case challenges as data with fixed transcript IDs/roles/playback flags, optional formulation and uncertainty flags, required/forbidden observations, and rationale. Do not use the model to generate its own expected results. Preserve the prose cases alongside fixtures.
- [ ] Commit: `feat(sp): define authored practice moments and public projection` after tests pass.

**Acceptance:** R01/R03/R12 foundations; three complete cases, 39 challenge IDs, no placeholder tiles, generated projection freshness proved by deliberately making and restoring a stale projection in a temporary fixture.

## Task 2: implement heard evidence and strict review validation

**Files:** New `evidence.mjs`, `moments-evidence.test.mjs`; implement criterion/template IDs from case appendix.

**Interfaces:**

```js
export function buildEvidenceSources(definition, finalizedHistory, {
 teamFormulation='', summaryUncertain=false, uncertainTurnIds=[]
}={}) {} // Source[] from design §8
export function reviewSchema(definition) {} // strict JSON Schema
export function validateDebrief(report, sources, definition, {endReason}) {} // safe display DTO or throw
```

- [ ] Define evidence IDs from actual history positions (`p0`, `l1`, `p1`, etc.); exclude zero-heard patient entries. Mark uncertain learner/source IDs from explicit review input. Setup is separate and never a current-learner statement.
- [ ] Write failing tests for exact source slicing, wrong speaker, nonexistent ID, quote from private facts, partial audio tail, surrogate pairs/UTF-16 bounds, unknown criteria, injected HTML, extra fields and more than three findings.

```js
test('unheard tail cannot become review evidence', () => {
 const d=getMoment('moment_priya_formulation_001');
 const sources=buildEvidenceSources(d,[
  {who:'pt',text:d.opening,playbackStatus:'played'},
  {who:'me',text:'You do not want help.'},
  {who:'pt',text:'I want help. The rest was not heard.',playbackStatus:'interrupted'}
 ]);
 assert.ok(!sources.some(s=>s.id==='p1'));
});
```

- [ ] Implement schema and deterministic validation. `quote === source.text.slice(start,end)` is necessary but insufficient: require criterion-specific role/sequence rules from the design. Reject the whole report if any citation/template/sequence is invalid and use the safe fallback; do not silently display a partial plausible assessment.
- [ ] Add triplet tests: P_REVISION requires earlier learner + heard correction + later formulation; a correct first summary uses P_RETENTION. A stopped exercise cannot receive a negative missing-opportunity claim without a later actual response to the specific cited opportunity.
- [ ] Render only authored templates and validated excerpts. A synthetic actor fabrication must not become a fixed fact. Test this by supplying both patient and learner repetition of invented medication history and requiring the reference-fact limitation to remain.
- [ ] Run `node --test sp-preview/tests/moments-evidence.test.mjs` and commit: `feat(sp): validate moment feedback against attributed evidence`.

**Acceptance:** R06/R07; deterministic provenance is proved, semantic interpretation is explicitly not claimed proven by these checks. The 39 challenge fixtures are frozen expectations for deterministic/adversarial and faculty review. Task 9 samples three live model reviews; it does not establish performance across all 39 challenges.

## Task 3: add bounded actor/review contexts and provider review

**Files:** New `context.mjs`; update provider and portrayal; new `moments-context.test.mjs`, `moments-provider.test.mjs`; existing provider tests stay intact.

**Interfaces:**

```js
export function createMomentContext(definition, finalizedHistory) {} // {system,messages}
export function createReviewContext(definition, sources, {endReason}) {} // {system,sources,schema}
// createOpenAIProvider() additionally returns:
async function evaluateMoment({system,sources,schema,signal}) {} // parsed Review, never audio
```

- [ ] Build actor context from the fixed case facts and heard dialogue. Include the exact common actor rules and per-case directions; omit criteria, feedback templates and private reactions. No keyword branching from preferred phrases. Unknown history remains unknown.
- [ ] Add canary tests: reflection, summary, criteria and future/unheard dialogue absent from actor input; actor-only directions and private reflection absent from review sources. Patient-generated claims do not mutate the definition.
- [ ] Add explicit voice profiles for the three moment IDs without changing existing case profiles. Pin original Dana/Marcus profile equality in a before/after fixture.
- [ ] Implement provider `evaluateMoment` using the current actor model and the separate structured-output contract. Reuse bounded transport with usage kind `actor`; do not call the current counter with an unsupported `review` bucket.

```js
const input={
 model:ACTOR_MODEL,
 instructions:system,
 input:[{role:'user',content:JSON.stringify(sources)}],
 store:false,
 reasoning:{effort:'low'},
 max_output_tokens:1800,
 text:{format:{type:'json_schema',name:'moment_review',strict:true,schema}}
};
// request('actor','/responses',input,signal,consumeValidatedReviewJson)
```

- [ ] Mock fetch and test exact request body, no speech endpoint, completed/refused/incomplete response, malformed/mixed JSON, explicit source/system/schema/request input bounds, output size bounds and abort. Oversized input must fail before fetch. Provider must not retry a refused/invalid review with a repair prompt. Existing speech/actor parser tests pass unchanged.
- [ ] Run `node --test sp-preview/tests/moments-context.test.mjs sp-preview/tests/moments-provider.test.mjs sp-preview/tests/provider.test.mjs sp-preview/tests/portrayal.test.mjs`; resolve actual baseline filenames rather than creating duplicate suites.
- [ ] Commit: `feat(sp): add bounded moment actors and structured review requests`.

**Acceptance:** R03/R06/R07/R12; one review request only, no new model/pin change, no alteration of full-case speech behavior.

## Task 4: implement moment state, endpoint and shared budget proof

**Files:** `state.mjs` small extraction; new moments state/handler/function; additional rewrite in netlify.toml; new `moments-state.test.mjs`, `moments-handler.test.mjs`, fake-runtime fixture.

**Interfaces:**

```js
// existing lib/state.mjs:
export function finalizePlayback(state, playback) {} // cloned history, no append
// lib/moments/state.mjs:
export function createMomentCodec({definition,env,origin,now}) {} // seal/open wrapper
export function initialMomentState(definition,now) {}
export function nextMomentHistory(state,body) {}
export function closeMomentState(state,body) {} // heard history, new nonce, phase closed
export function retryMomentState(state,turnId,sid) {} // prefix; alternative_done only on issuance
// lib/moments/handler.mjs:
export function createMomentHandler({env,provider,budget,now=Date.now,deadlineMs=50000}) {}
```

- [ ] Write failing boundary tests before extracting playback logic. Prove unchanged results for existing nextHistory/retryState at zero, one and two completed audio segments. Preserve original history; do not mutate it in closure.
- [ ] Implement exact body validation from design §6, including both output keys, flag limits, per-scenario summary availability, four-turn cap, flags, phase and content/review hash. Reject before reservation. New function uses the SAME `dana-preview-attempts` store and trusted runtimeBudget.
- [ ] Implement dialogue streaming with existing complete-reply-before-publication behavior. Do not promote generated audio receipts to heard evidence; browser completion acknowledgment remains distinct.
- [ ] Validate debrief requires dialogue phase and 1–4 turns, correct end reason, output shapes, and playback counts BEFORE reserving. Zero-turn or malformed-playback direct requests must show zero reservations/calls. Then implement debrief closure, sharing the current continuation slot. Send one closed receipt before evaluator work and preserve that nonce for all later events. Known provider failure emits review-unavailable plus complete. Unknown pre-receipt loss requires restart/static fallback.
- [ ] Implement one closed-state alternative from the authenticated prefix. No future dialogue, review output, team summary or private reaction enters actor context. Original and alternate histories stay distinct.
- [ ] New fake runtime helper exports `makeMomentHarness({now,providerOverrides}={})`; it returns helpers that each resolve to the latest receipt string and exposes `start(id)`, `turn(state,text,playback)`, `debrief(state,outputs,flags)`, `retry(state,turnId,text)`, `counts`, `reservations`; each invocation constructs a fresh handler over a shared CAS fake store. Test actual budget class, not a fake accepting everything.

```js
test('four turns, review and alternative are bounded to one start and 19 units',async()=>{
 const h=makeMomentHarness();
 let s=await h.start('moment_elena_rupture_001');
 for(let i=0;i<4;i++)s=await h.turn(s,'What matters most here?');
 const closed=await h.debrief(s,{teamFormulation:'',summaryUncertain:false},[]);
 await h.retry(closed,1,'I moved past what this means. What should I understand?');
 assert.equal(h.reservations.reduce((n,r)=>n+r.units,0),19);
 assert.equal(h.reservations.filter(r=>r.units===1).length,1);
 assert.equal(h.counts.actor,5);
 assert.equal(h.counts.review,1);
 assert.ok(h.counts.speech<=11);
});
```

- [ ] Add competing turn/debrief requests on the SAME nonce; only one wins and initiates work. Repeat after actor failures, review failures, midnight, fresh handler instances, and a simulated deployment change. Test two alternate requests using different encrypted representations of the same closed nonce.
- [ ] Test full/moment cross-endpoint replay, mismatched scenario, altered outputs, fifth turn, second review, second alternative and continuation after closure/alternative. All fail before provider work. Reused start requestId cannot start both modes.
- [ ] Test mixed full/moment starts at the 20 boundary, totals at 680, rolling 340, and a debrief allowance failure. Existing charges/namespace are not reset and no schema migration appears in diff.
- [ ] Run new state/handler suites and all existing `sp-preview` tests. Commit: `feat(sp): add isolated moment protocol with shared usage limits`.

**Acceptance:** R02/R08/R09/R10/R11. No server-side session storage, no broader budget allowance, no repeated feedback generation.

## Task 5: reuse speech lifecycle across conversation, output and alternative

**Files:** `public/app.js`, `moments-controller.test.mjs`, affected existing client tests. Integrator owns this file exclusively.

**Interfaces:** Retain `createController(env,options)` and old exports. Add optional `options.getMomentProfile(id)` supplied by mount from generated content. Full cases resolve exactly as before; unknown IDs fail. Add `snapshot.mode`, `snapshot.maxTurns`, `snapshot.momentStage`, `snapshot.captureTarget`, `snapshot.review`, `snapshot.teamFormulation`, `snapshot.uncertainTurnIds`, `snapshot.summaryUncertain`. Existing full-mode snapshots retain compatible fields.

```js
function experience(id){
 const moment=options.getMomentProfile && options.getMomentProfile(id);
 if(moment)return {mode:'moment',endpoint:'/api/practice-moment',id,maxTurns:4};
 if(CASE_IDS.includes(id))return {mode:'full',endpoint:'/api/dana-preview',id,maxTurns:10};
 return null;
}
```

New controller methods: `openPrivateReflection()`, `closePrivateReflection()`, `setTeamFormulation(text)`, `setSummaryUncertain(boolean)`, `setUncertainTurn(turnId,boolean)`, `recordTeamFormulation()`, `requestMomentReview()`, `recordAlternative(turnId)`. Private reflection TEXT is held only by moment-station, never controller snapshots; controller only knows whether capture is paused for it.

- [ ] Parameterize every ten-turn limit in parser/controller/UI by trusted mode configuration, default10. A client option is only UX; server cap remains authoritative. Keep full payload keys unchanged; moment payload uses scenarioId, not caseId.
- [ ] Reuse one capture controller with destination `patient`, `team_formulation`, or `alternative`. `onSubmit` dispatches according to destination: patient -> turn API; formulation -> local editable output only; alternative -> one retry API. No capture can feed two destinations.
- [ ] End after four replies and stop capture. Do not start formulation recording automatically or mislabel its audience. Explicit Record team formulation starts capture; automatic quiet/Space finishes its LOCAL draft. Explicit Review submits. Full station's existing private presentation is never read by this path.
- [ ] Implement the exact DisplayReview DTO from design §8, separate bounded review NDJSON parser, and request ownership/abort logic. After receipt arrival store closed token; no patient parser tolerance changes. On errors use the design failure matrix, preserving original evidence.
- [ ] Make alternative capture available after review even though normal patient `ended` is true. Route it explicitly and keep later normal conversation disabled. One completed alternative ends; no auto-mic restart.
- [ ] Test no per-turn composer input/click,4.5/8 quiet windows, Hold, interim withdrawal, speechend without words, reflection pause preserving draft, Space in textarea not submitting, explicit target switching, review cancellation, captured summary never reaching actor, and stale promise after Clear.
- [ ] Run `node --test sp-preview/tests/moments-controller.test.mjs sp-preview/tests/client.test.mjs` and the existing station suite. Commit: `feat(sp): preserve hands-free flow through practice moment phases`.

**Acceptance:** R02/R04/R05/R08/R11. No new microphone-during-playback claim. Optional phase transitions can use controls; ordinary spoken turns still need no Send click.

## Task 6: implement accessible moment UI and seven-asset build

**Files:** moment-station, index, styles, build; build tests; `moments-station.test.mjs`; existing CSP browser spec.

**Interfaces:**

```js
// IIFE browser module MomentStation, parallel to the existing Station module:
mount(host,{profile,onReflectOpen,onReflectClose,onRecordSummary,onSummaryChange,
 onSummaryUncertain,onUncertainTurn,onReview,onRecordAlternative,onRetry,onTransfer})
// returns {update(snapshot),dispose()}; no network or storage
```

- [ ] Put Full encounter / Practice a moment before case selection. Keep layout compact, current warm palette, clear main action, comfortable reading width, and draft badges. Mount either existing Station or MomentStation; never two competing station controllers.
- [ ] Add `<script src="moment-content.js" defer>` and moment-station before app.js, using existing script conventions. No inline code/style and no remote fonts/frameworks.
- [ ] Provide separate labels for previous-student lead-in, current learner, patient, submitted team formulation and alternative. Feedback quotations expand to reveal their original context; never label unknown/unheard text as heard. Team summary label states it is included in AI feedback.
- [ ] Reflection panel is keyboard accessible, closes with focus returning to its opener, and leaves capture paused. Standard Escape inside that panel closes it; busy playback Escape remains immediate interruption. Do not alter Space behavior inside controls. No forced textarea remount on speech snapshots.
- [ ] Implement unread/uncertain flags, unavailable review copy, no-request zero-turn ending, clear dismissal controls and visible end-of-moment status. Do not display an opportunity-not-taken badge as a global grade.
- [ ] Update exact asset allowlist and test it contains only seven files. Add private canary assertions across every published asset, separate from function bundle. Add projection freshness to existing test glob. Keep CSP/header assertions intact.
- [ ] Extend hosted-preview smoke scenarios for both modes under actual netlify.toml headers,320px/desktop, keyboard/focus, disclosure, reflection and clear. Observe console CSP violations and actual computed layout, not only DOM existence.
- [ ] Commit: `feat(sp): add accessible practice moment station and private reflection`.

**Stage A acceptance:** Elena/Priya run start-to-review-to-alternative with safe fallback, full modes pass, and privacy tests prove the distinction between private presentation, private reflection and submitted output. Continue to Stage B after this review.

## Task 7: enable Luis and opt-in transfer without changing session identity

**Files:** catalog/public projection, moment-station/controller mount, moments content/controller/station and browser tests.

**Interfaces:** `transferTargets` holds enabled moment IDs in this order: Elena -> Priya,Luis; Priya -> Luis,Elena; Luis -> Elena,Priya. `visitedMomentIds` is a RAM-only Set outside the disposable encounter controller, scoped to this page. Clear clears it; choosing the next situation preserves only that set during explicit teardown/start.

- [ ] Enable the complete Luis definition from Task1 after the shared runtime milestone. Surface barrier at the authored point without requiring a preferred phrase or inventing callback logistics. Keep current review status visible.
- [ ] Implement `chooseTransfer(profile, visited)` as first enabled unvisited target; if none, offer **Choose another moment** without claiming it is unseen. No random/adaptive diagnosis of learner needs and no score carry-over.

```js
function chooseTransfer(profile,visited,enabled){
 return profile.transferTargets.find(id=>enabled.has(id)&&!visited.has(id)) || null;
}
```

- [ ] Explicit selection tears down old controller/station, clears audio/drafts/review/reflection/receipt, then shows the new door. Do not auto-call start; a new Start consumes the shared allowance. No actor request includes prior dialogue or evaluator output.
- [ ] Test all three link orders, no unseen target, decline/I'm done, budget exhaustion on next start, Clear resetting visited IDs, and canary absence in the new actor context. No browser persistence or analytics.
- [ ] Run all new and existing `sp-preview` tests and hosted-preview smoke. Commit: `feat(sp): add teach-back moment and opt-in transfer practice`.

**Acceptance:** R13 and complete selected content scope. Links are practice opportunities, not evidence of measured skill transfer.

## Task 8: independent adverse-path review and exact build gates

**Files:** tests and fixes only where a reproduced defect requires them; README/ACCEPTANCE updated with final scope. No new infrastructure or unrelated repairs.

- [ ] Ask an independent agent to attack state/replay/budget and another to review the 39 educational fixtures. They must inspect actual changes and reproduce findings; no approval based only on parent summaries.
- [ ] For each new guard, introduce a temporary counterexample to show the test fails, restore the guard and show pass. Use `docs/SILENT_SHRINK_CHECKLIST.md` §F. Cover missing projection field, wrong speaker quote, early-stop penalty, zero-heard correction and nonce replay. Do not add exemptions that shrink the claimed surface.
- [ ] Run complete suites from the new worktree; shared-output builds must run sequentially. Save actual commands, exit codes, source SHA and counts. Inspect span/qbank output; current AGENTS says both can fail and uncached source spans are not a clean bill.

```bash
npm --prefix sp-preview test
npm --prefix sp-preview run build
node --test tests/*.test.mjs
cd tests/smoke
npx playwright test --project=hosted-preview
cd ../..
bash bin/verify.sh
```

- [ ] Do not claim the entire smoke suite ran locally from the single hosted project. Required CI must pass on the exact pushed head, including full nav/faculty/LFS/visual smoke. If failures reproduce on clean main, document them and continue isolated work rather than bypassing checks.
- [ ] Confirm no unwanted paths changed: budget.mjs should have no policy/schema change; no `.env*`, media pointer stubs, private fixture outputs, clinical attestation, analytics, workflow or learner-route changes.
- [ ] Document automated versus live and physical-microphone evidence separately. Commit fixes/docs as one appropriately scoped final review commit.

**Acceptance:** R14 and functional/security part of R15. Passing tests do not certify semantic feedback or acoustic authenticity.

## Task 9: bounded provider audition and faculty review packet

**Files:** `qa/moments-audition.mjs`, ignored `output/practice-moment/`, ACCEPTANCE. No private content/credentials in tracked outputs.

- [ ] Write opt-in paid script requiring `DANA_QA_URL`, `DANA_QA_ACCESS_FILE`, and explicit `DANA_QA_MODE=moments`. Read the passcode privately from its existing authorized local file. Refuse missing flags or a target outside the assigned protected site/preview. Never create credentials or change billing.
- [ ] Script runs exactly three starts, one per selected scenario, each four turns + one debrief. Only Elena gets one alternative. Assert a strict maximum of **51 reserved units and 3 starts**: `3*(1+4*3+3)+3`. Provider-call ceilings are **13 actor replies, 3 evaluator calls, and 29 TTS calls**, with 3 openings included in the TTS bound. No automatic repeat after a failure. A later human audition consumes its own normal starts and units.
- [ ] Use fixed learner inputs from challenge fixtures for meaningful good/poor/uncertain paths. Assert receipt/review provenance and actual MP3 decode. Keep timing boundaries separate. Store synthetic dialogue locally only in ignored output, mark it as synthetic test material; do not store access tokens, state receipts or private reaction data. Summary receipt may contain hashes/counts/timings and safe failure codes.
- [ ] Report the three sampled live reviews separately from the 39 authored expectations. Do not call mocked evaluator fixtures as 39 successful live semantic evaluations.
- [ ] Compare a read-only aggregate of the SAME ledger before/after; prove existing charges remain and cross-deploy namespace is unchanged. Do not delete/reset it. If allowance is exhausted, record that and run all unpaid checks; do not treat another namespace as a test workaround.
- [ ] Faculty packet: case facts/openings/actor directions, review criteria,39 challenge expectations, rendered actual sample feedback and audio, known limitations, revision SHA, reviewer/date fields left explicitly unreviewed. Include the two source/correction cases and actor-fabrication challenge. A second model is not a substitute for this review.
- [ ] Physical microphone checklist: four turns without touching composer, long pause with thinking time, Space finishing, private reflection preventing capture, summary capture routed correctly, alternate speech, mobile layout and Clear. Record browser/device and whether recognition was native. Never describe synthetic recognition tests as a real microphone pass.

**Acceptance:** Real provider evidence where current authorized capacity permits, truthful unavailable evidence otherwise. No new content is labeled reviewed without the owner's decision. The script itself and all unpaid checks remain required even if a paid run cannot proceed.

## Task 10: PR, deployment and completion record

**Files:** README/ACCEPTANCE; PR body; ignored verification receipts. Preserve owner authorization already present in the task when deciding whether deployment is authorized; do not ask again for an already authorized reversible action.

- [ ] Prepare a draft PR from `codex/practice-a-moment` (or two staged PRs with explicit dependency) containing the complete selected scope. Explain the before/after learner behavior and which information is private versus submitted. Keep clinical draft status explicit.
- [ ] Run required checks on the exact head. Do not use `--no-verify`, force-push another agent's branch, or weaken gates. If splitting A/B, verify B includes A and all selected work before reporting complete implementation.
- [ ] Deploy the complete sp-preview package only to the existing protected site's staging alias for review, after existing authorization/credential availability is confirmed from context. Verify linked site ID with a read-only Netlify status call before deployment. Do not deploy repository root or alter production environment secrets/caps. Read the Netlify deploy skill and use the configured auth method; never print environment values.
- [ ] Set the new non-secret `DANA_MOMENTS_ENABLED=true` flag for the assigned staging deployment context, leaving existing secrets, model pins and budgets unchanged. Verify disabled requests refuse before spend, then enable the staging flag and verify the actual endpoint. Production flag enablement is part of the authorized release step, not an incidental staging change.
- [ ] Verify served public asset hashes match final source, function routing, wrong-passcode refusal without spend, feature flag behavior, and the relevant `sp-proxy/REDTEAM_CHECKLIST.md` controls. Report any protocol-specific checks that are not applicable rather than pretending the offline12 probes are the full checklist.
- [ ] Release to the stable protected faculty preview only within existing owner authorization and after all technical gates pass; set its new non-secret `DANA_MOMENTS_ENABLED=true` flag as part of that release. To contain this mode, set only that flag false; do not rotate credentials or reset the ledger. Keep draft labels; do not change faculty attestation. If that authorization is absent in the executor's new task, finish the PR, functioning staging preview and evidence first, then request the single concrete release decision. Ordinary implementation/testing must not wait for this final release question.
- [ ] Final receipt maps R01–R15 to files/tests/browser/evidence/reviewer status and explicitly separates built, tested, previewed, merged, deployed and faculty-reviewed. Record exact source/deploy SHA/ID. Never claim a scripted alternative proves learning transfer.

**Completion definition:** all three selected moments and transfer flow implemented; tests cover actual production paths; failures have honest fallback; existing full encounters preserved; complete reviewable source/preview and evidence delivered; release/attestation status accurately stated. No requirement is satisfied merely by adding a named test that does not exercise it.

## Coverage map and executor handoff

| Requirements | Tasks | Required evidence |
|---|---|---|
| R01/R03/R12 |1,3,6,7 | Catalog/projection exact keys, three visible cards, fixed facts, actor adversarial samples, private-output absence. |
| R02/R05 |4,5,6 | Server4 cap, full 10 retained, actual browser automatic speech and distinct summary phase. |
| R04/R11 |5,6,8 | Network/storage/receipt canaries, aborted work, Clear and no stale repaint. |
| R06/R07 |2,3,4,8,9 | Provenance/sequence failures,39 frozen challenges, model samples and faculty assessment status. |
| R08/R09 |4,5,8 | Shared nonce/concurrency tests, original-history preservation, terminal retry. |
| R10 |4,8,9 | Mixed ledger boundary tests and same-namespace aggregate checks;19 units/moment,51 scripted audition maximum. |
| R13 |7 | Three opt-in transfer paths, independent start accounting, no transcript carryover. |
| R14/R15 |8,9,10 | Exact-head gates, rendered journeys, physical microphone status, PR/deploy/review receipts. |

The paste-ready executor prompt is `docs/superpowers/plans/2026-09-08-practice-a-moment-handoff.md`. Execute the tasks rather than reopening the ten-idea brainstorming exercise. Resolve routine mechanical choices locally; raise only a substantive conflict, missing external authority, or unavailable required input, with the concrete result already prepared where possible.
