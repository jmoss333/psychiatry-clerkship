# Interview Room Usefulness Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make The Interview Room recognise what a competent learner actually says, answer the questions a depression admission interview needs, and give a debrief that shows the learner what they missed, without leaving the closed-vocabulary engine faculty ratified.

**Architecture:** The patient's disclosures and the debrief's topic map are decided by regex intents in `sp-interview.pack.json`, evaluated by two engines that must agree: the browser `MockProvider` in `sp-interview.html` and `deriveState` in `sp-proxy/netlify/functions/sp.mjs`. This plan adds four small, deterministic engine features (apostrophe normalisation, per-sentence `excludePatterns`, per-intent gate deflection, a general `onlyFirstTime`), then spends them in three content waves: recognition (A), Dana's clinical completeness (B), cues and debrief (C). Four draft PRs; the first is server-only so the live proxy tolerates the new pack fields before any pack carries them.

**Tech Stack:** Single-file HTML tool (React 18 UMD, raw `React.createElement`, no build step, ES5-style code in the page script), Node ≥18 `node:test`, Netlify function (`sp.mjs`, ESM), Playwright smoke suite, Python validators.

**Spec:** [`docs/superpowers/specs/2026-11-11-interview-room-usefulness-clinical-edits.md`](../specs/2026-11-11-interview-room-usefulness-clinical-edits.md) (the CE ids) and its companion [`…-proposed-edits.json`](../specs/2026-11-11-interview-room-usefulness-proposed-edits.json) (every regex, every patient line, 97 probe rows). Read both before Task 0. Load patterns and copy from the JSON with code; do not retype a regex.

## Global Constraints

- **Faculty gate.** A CE id from the spec enters the pack only if Joshua Moss, MD accepted that id in writing. Task 0 records his reply. An id he did not mention is out. PR-1 carries no clinical content and may be drafted before his reply.
- **You never merge, deploy, label, re-attest, or edit `13_Faculty_Resources/reviewed.json`.** Every PR is a draft. The owner merges, deploys the proxy, and re-attests in the faculty console.
- **Closed vocabulary only (decision D16).** No model classifier, no embeddings, no new network call.
- **No lookbehind in any pattern** (`(?<=`, `(?<!`). The pack has none today; older Safari throws on them.
- **No dose literals, no crisis numbers, no PHI** anywhere in pack, tests or docs. `\d+\s?(mg|mcg|mL)` over the pack must return nothing.
- **Debrief wording rule (F1–F5, G4, D16(2)).** New debrief text describes what the simulator recognised or what the case contains. It never states what the learner did, and never classifies the patient's reply.
- **`bin/`, `.github/`, `.claude/`, `faculty-console/`, any `*.schema.json`, `CLAUDE.md`, `decisions.json` may not change in the same PR as `sp-interview.html` or the pack** (gate L1). This plan needs none of them. If a task seems to need one, stop and report.
- **Client and server engines stay bit-identical on state** (`rapport`, `covered`, `unlocked`). `_prototypes/sp-interview/tests/parity.test.mjs` is the judge; add a scenario for every engine rule you add.
- **After any change to `sp-interview.html` or the pack:** `node _prototypes/sp-interview/generate-preview.mjs --write`.
- **Page-script style:** ES5 (`var`, `function`), `e(...)` for elements, 2-space indent, single quotes, no `console.log`.
- **Structures tests extract from the page; keep them intact:** the single `<script>\n(function(){` marker, `var e=React.createElement`, the `window.__SP_TEST__` export object, `if(S.screen==='select'){`, `/* ---------- encounter`, `PHI_PATTERNS`, and the three `criticalMiss||{}).rehearse/.ref/.reframe` lookups.
- **Do not rename the intent id `si_intent_protective` or any gate id.** `bin/redteam-offline.mjs` names them and cannot travel with content.
- **Branches:** `claude/interview-room-<pr>-2026-11-11`, each in its own worktree nested under the session worktree, pushed as a draft PR the day it is created. Run `python3 bin/coordination_report.py --prs` first; stop if another session holds `_prototypes/sp-interview/` or `sp-proxy/`.

## Review Focus

Each line names the task whose tests pin it.

1. **Curly apostrophes, curly quotes and non-breaking spaces in a learner turn** (phone keyboards, pasted text) must be recognised exactly like their straight forms. → Task 2.
2. **A turn with an exclusion frame in one sentence and a real question in another** (“The chart says you were admitted last night. Have you had thoughts of killing yourself?”) must read observed. → Tasks 1, 3.
3. **Version skew:** new pack on the old proxy, and new proxy on the old pack, must neither crash nor change today's state for today's inputs. → Task 1.
4. **A case that uses none of the new fields** (Morgan's local copy, test fixtures, the `sp-preview` bundle) must produce identical state before and after. → Tasks 1, 3, 4.
5. **A debrief with nothing in it:** zero turns, only flagged turns, or the turn cap reached. No cue, no locked reveal and no priority may throw; the page renders. → Tasks 9, 10.

## File map

| File | Responsibility | PRs |
|---|---|---|
| `sp-proxy/netlify/functions/sp.mjs` | server engine: `compileIntents`, `matchIntents`, `deriveState`, `lockedDeflection` | 1, 2 |
| `sp-proxy/tests/sp-engine-extensions.test.mjs` (new) | server tests for the four engine rules on a patched clone of a pack case | 1, 2 |
| `_prototypes/sp-interview/sp-interview.html` | client engine (`MockProvider`), debrief functions, UI | 2, 3, 4 |
| `_prototypes/sp-interview/sp-interview.pack.json` | intents, replies, gates, checklist, cues | 2, 3, 4 |
| `_prototypes/sp-interview/sp-interview.local-cases.js` | Morgan's byte-equal local copy of his pack case | 2 |
| `_prototypes/sp-interview/tests/engine-extensions.test.mjs` (new; add a line to `run-all.sh`) | client tests through `window.__SP_TEST__`, modelled on `tests/visit-note.test.mjs` | 2, 3, 4 |
| `_prototypes/sp-interview/tests/parity.test.mjs` | client/server state parity scenarios | 2, 3 |
| `sp-proxy/tests/fixtures/intent-recall-corpus.json` + `sp-proxy/tests/sp-intent-recall.test.mjs` | recall floor, precision rows, new `screenGrades` bucket | 2, 3 |
| `benchmarks/interview-room/corpus.json` | `basis` of the scenarios the owner ruled on | 2 |
| derived pins (hashes and counts, listed per task) | must be recomputed, never pasted blind | 2, 3 |
| `tests/smoke/interview-room.spec.js` | Playwright assertions for entrance and debrief | 4 |

---

### Task 0: Preflight and the faculty gate (no code)

- [ ] **Step 1:** Run `python3 bin/coordination_report.py --prs`. If any active worktree or open PR touches `_prototypes/sp-interview/` or `sp-proxy/`, stop and report it.
- [ ] **Step 2:** Read `docs/agent-guide/{interview-room,governance-separation,attestation-hashes,gates,tools-and-frontdoor,branching-and-worktrees}.md` and `benchmarks/interview-room/README.md`.
- [ ] **Step 3:** Find the owner's reply to the spec. Write the accepted, rejected and reworded CE ids, quoting his words, into `docs/superpowers/specs/2026-11-11-interview-room-usefulness-rulings.md` (new, spec-class). If there is no reply, do PR-1 only and stop.
- [ ] **Step 4:** Settle the two facts the spec lists as NOT CHECKED and write the answers into the rulings file: (a) does `sp-interview-proxy` deploy from git on merge or by hand (`sp-proxy/README.md`, `sp-proxy/netlify.toml`); (b) can a learner reach recorded Dana audio today, and what happens to it when the pack hash changes (`sp-interview.recordings.js:97`, `dana-audio-catalog.mjs:20,49`). If (b) shows learners lose a working feature, report before starting PR-3.
- [ ] **Step 5:** Baseline. Run the proof set below on untouched `origin/main` and record pass/fail counts in the rulings file. A red baseline is reported, not fixed here.

**Proof set** (referred to as “run the proof set” below):

```bash
node _prototypes/sp-interview/generate-preview.mjs --check
npm --prefix sp-proxy ci --include=dev && npm --prefix sp-proxy test
bash _prototypes/sp-interview/tests/run-all.sh
node bin/redteam-offline.mjs
npm --prefix sp-preview ci --include=dev && npm --prefix sp-preview test && npm --prefix sp-preview run build
node --test tests/conversation-encounter-profiles.test.mjs tests/crisis-block.test.mjs tests/tool-frame.test.mjs tests/ward-capture.test.mjs
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 bin/check_governance_separation.py --base origin/main
```

---

## PR-1 — server tolerance (no content, no attestation drift)

Branch `claude/interview-room-pr1-server-tolerance-2026-11-11`. Touches `sp-proxy/` only. Inert on today's pack: no case carries the new fields yet.

### Task 1: `excludePatterns` and `deflectByIntent` in `sp.mjs`

**Files:**
- Modify: `sp-proxy/netlify/functions/sp.mjs` (`compileIntents`/`matchIntents` at ~286–291; the gate cascade in `deriveState` at ~319–361; `lockedDeflection` at ~389 and its caller in `actorSystem`)
- Create: `sp-proxy/tests/sp-engine-extensions.test.mjs`

**Interfaces:**
- Produces: `segments(text: string): string[]` = `String(text).match(/[^.?!]+[.?!]*/g) || [String(text)]`.
- Produces: `matchIntents(compiled, text): string[]`. An intent with no `excludePatterns` is credited when any pattern matches the whole turn (today's rule, unchanged). An intent with `excludePatterns` is credited when **some segment** matches a pattern and matches no exclude.
- Produces: gate field `deflectByIntent: { [intentId]: string }`. In the cascade, for a top-level gate that is not unlocked and whose `requiresIntents` did not hit, after the existing `euphemismIntent` branch: if any key of `deflectByIntent` is in `hits`, the turn is consumed and nothing unlocks. For the same gate once it **is** unlocked, a `deflectByIntent` hit behaves like a repeated ask: the turn is consumed when the gate has a `repeatAsk`, and not otherwise.
- Produces: `lockedDeflection(g, s)` returns `g.deflectByIntent[k]` when some key `k` is in `s.lastIntents`, otherwise today's value.
- Exports `segments` through `_internals`.

- [ ] **Step 1: Write the failing tests.** Build fixtures in the test by deep-cloning a case from the canonical pack and adding fields; never edit the pack.

```js
// sp-proxy/tests/sp-engine-extensions.test.mjs
const dana = () => structuredClone(pack.cases.find((c) => c.id === 'sp_depression_gated_si_001'));
const withExcludes = () => { const c = dana(); const EX = edits.waveA.allCases['screenExcludePatterns (si_direct, si_passive, si_euphemism)'];
  for (const id of ['si_direct', 'si_passive', 'si_euphemism']) c.intents.find((i) => i.id === id).excludePatterns = EX; return c; };

test('a case with no excludePatterns derives the same state as before', () => {
  const turns = corpus.cases.sp_depression_gated_si_001.interview.turns;
  assert.deepEqual(deriveState(dana(), turns), BASELINE_STATE); // BASELINE_STATE captured from origin/main in Step 2
});
test('an exclude vetoes a match in the same sentence', () => {
  const s = deriveState(withExcludes(), ['The chart says you have had thoughts of killing yourself.']);
  assert.equal(s.covered.si_direct, undefined); assert.equal(s.unlocked.si_active, undefined);
});
test('an exclude in one sentence does not veto a question in another', () => {
  const s = deriveState(withExcludes(), ['The chart says you were admitted last night. Have you had thoughts of killing yourself?']);
  assert.equal(s.covered.si_direct, true); assert.equal(s.unlocked.si_active, true);
});
test('deflectByIntent consumes the turn and opens nothing', () => {
  const c = withExcludes();
  c.intents.push(edits.waveA.allCases.newIntents.find((i) => i.id === 'si_leading'));
  c.gated[0].deflectByIntent = { si_leading: 'No.' };
  const s = deriveState(c, ["You're not thinking of killing yourself, are you?"]);
  assert.deepEqual(s.lastIntents, ['si_leading']); assert.equal(s.unlocked.si_active, undefined);
});
test('after disclosure, a deflectByIntent hit is a repeated ask, not a denial', () => {
  const c = withExcludes();
  c.intents.push(edits.waveA.allCases.newIntents.find((i) => i.id === 'si_leading'));
  c.gated[0].deflectByIntent = { si_leading: 'No.' };
  const s = deriveState(c, ['Have you had thoughts of killing yourself?', "You're not going to kill yourself, are you?"]);
  assert.equal(s.unlocked.si_active, true); assert.deepEqual(s.lastIntents, ['si_leading']);
});
test('a pack with unknown fields does not throw (old pack shape still loads; new shape on this code loads)', () => {
  const c = dana(); c.cues = [{ id: 'x' }]; c.intents[0].somethingNew = 1;
  assert.doesNotThrow(() => deriveState(c, ['Hello.']));
});
test('patterns that are an object exposing only .map still compile', () => { /* mirror sp-realtime-handler.test.mjs:861 */ });
```

- [ ] **Step 2: Run and confirm red.** `npm --prefix sp-proxy test`. Expected: the exclude and deflect tests fail (the unknown-fields and `.map` tests may already pass; they are regression guards); the baseline test needs `BASELINE_STATE`, which you capture by printing `deriveState(dana(), turns)` on unmodified code and pasting the JSON into the test.
- [ ] **Step 3: Implement** the three interfaces above. Keep `it.patterns.map(...)` and use `(it.excludePatterns || []).map(...)`.
- [ ] **Step 4: Run the proof set.** Expected: all green, `sp-engine-extensions` 7/7.
- [ ] **Step 5: Commit and open the draft PR.** Body: what is inert and why it ships first; the evidence block from spec §7 narrowed to this PR; “Owner: merge, then deploy `sp-interview-proxy` before PR-2 merges.”

---

## PR-2 — Wave A: recognition (content; drifts the attestation row)

Branch `claude/interview-room-pr2-recognition-2026-11-11`, cut after PR-1 merges (or stacked on it, pushing with `CLERKSHIP_PR_BASE=origin/<pr1-branch>`). CE ids: A1–A7, B1–B7, C1–C12, G1, as accepted.

### Task 2: Normalise typographic characters before matching (both engines)

**Files:** `sp-interview.html` (`MockProvider.prototype._match`, ~431), `sp.mjs` (`matchIntents`), both new test files, `parity.test.mjs`.

**Interfaces:**
- Produces: `normalizeLearnerText(text): string` in both engines, identical: `[‘’ʼ′]` → `'`, `[“”″]` → `"`, ` ` → space. Nothing else. Called once at the top of matching; the stored transcript keeps the learner's own characters. Dashes are not touched: pack patterns match `—` and `–` literally.
- Client exports it on `window.__SP_TEST__`; server on `_internals`.

- [ ] **Step 1: Failing tests,** server and client, from `edits.probes.typographicApostrophe` (5 rows): each row's text must be recognised for its listed intent on the Dana admission case. Add: a turn containing ` ` between “killing” and “yourself” is recognised as `si_direct`; the transcript text returned by `MockProvider.respond` still contains `’`. Add one curly-apostrophe scenario to `parity.test.mjs`.
- [ ] **Step 2:** Run both suites; confirm the 5 rows fail on unmodified engines (this is the known-miss fixture, G-2).
- [ ] **Step 3:** Implement in both engines.
- [ ] **Step 4:** Run the proof set. Expected green.
- [ ] **Step 5:** Commit.

### Task 3: Client `excludePatterns` and `deflectByIntent`

**Files:** `sp-interview.html` (`MockProvider.prototype.start` ~423, `_match` ~431, PASS 2 loop ~496–514), `engine-extensions.test.mjs`, `parity.test.mjs`.

**Interfaces:**
- Consumes: Task 1's server rules; the client must reach the same `covered`/`unlocked`/`rapport`.
- Produces: `start()` builds `ex[id]` beside `rx[id]`; `_match` applies the per-sentence rule; the PASS 2 loop gains the `deflectByIntent` branch after the euphemism branch, replying with the mapped line while the gate is locked and with `gd.repeatAsk` once it is unlocked.

- [ ] **Step 1: Failing tests.** The same five cases as Task 1's tests, driven through `MockProvider`, plus: the reply to the leading-negative turn equals the `deflectByIntent` line. Add two parity scenarios on a patched clone (exclude in the same sentence; exclude in another sentence) and one for `deflectByIntent`.
- [ ] **Step 2:** Run; confirm red.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the proof set. Expected green; parity count rises by 3.
- [ ] **Step 5:** Commit.

### Task 4: Honour `onlyFirstTime` for every rapport rule (both engines) — CE-B7, CE-B2

**Files:** `sp-interview.html` (`respond`, the `rr.raises` loop ~456–463), `sp.mjs` (`deriveState` ~301–307), both test files, `parity.test.mjs`.

**Interfaces:**
- Produces: state field `onceUsed: { [intentId]: true }`. A raise rule with `onlyFirstTime: true` applies at most once per encounter, for any intent. `greeting_agenda` stays once-only whether or not it is flagged (today's behaviour). `open_invite` behaves as today.

- [ ] **Step 1: Failing test.** Ray (`sp_psychosis_paranoid_001`), turns `['No pressure.', 'No pressure at all.', 'Really, no pressure.', 'No rush, no pressure.']`: rapport after each turn must be `1, 1, 1, 1`. Today it is `1, 2, 3, 4`. Add the same four turns as a parity scenario. Add: Dana's rapport sequence over the corpus `interview` turns is unchanged from baseline.
- [ ] **Step 2:** Run; confirm the Ray test fails with `[1,2,3,4]`.
- [ ] **Step 3:** Implement in both engines. Skip this task entirely, and say so in the PR, if the owner rejected CE-B7; then CE-B2 cannot ship either.
- [ ] **Step 4:** Run the proof set. `ray.test.js` may pin a rapport that relied on repeated transparency; if it goes red, report the scenario and the old and new values in the PR rather than editing the assertion silently.
- [ ] **Step 5:** Commit.

### Task 5: Soft intents never outrank a real question (client reply selection)

**Files:** `sp-interview.html` (`respond`, the final reply block ~516–524), `engine-extensions.test.mjs`.

**Interfaces:**
- Produces: `var SOFT_INTENTS=['reflection','empathy_statement','probe'];`. `content` excludes flags and every soft intent. When `content` is empty the reply comes from the first soft hit that has a `responses` entry, in the order `reflection`, `empathy_statement`; otherwise `_default`. State is not affected, so the server needs no change.

- [ ] **Step 1: Failing test** on a patched Dana clone carrying `empathy_statement` and its `responses`: “I'm so sorry you're going through this. How have you been sleeping?” replies with a sleep line; “I'm so sorry you're going through this.” alone replies with an `empathy_statement` line; “That sounds exhausting.” still replies as today.
- [ ] **Step 2–5:** red, implement, proof set, commit.

### Task 6: Wave A pack edits, corpus rows and derived pins

**Files:**
- Modify: `sp-interview.pack.json` (all five cases), `sp-interview.local-cases.js` (Morgan's copy must deep-equal his pack case: `tests/morgan-pack.test.mjs:62–67`), `sp-interview.html` (`buildNarrative`, one new growth branch), `sp-interview.preview.html` (regenerated)
- Modify: `sp-proxy/tests/fixtures/intent-recall-corpus.json`, `sp-proxy/tests/sp-intent-recall.test.mjs`, `benchmarks/interview-room/corpus.json`
- Modify (matcher copies that must learn the per-sentence exclude rule): `sp-proxy/tests/sp-intent-recall.test.mjs:41–46`, `sp-passive-si-boundary.test.mjs:43–46`, `sp-safety-screen-phrasing.test.mjs:57–60` and its direct `.patterns.some` calls (~106, 168, 172, 234), `sp-safety-scoring-uniformity.test.mjs:38`, `_prototypes/sp-interview/tests/dana-follow-up-pack.test.mjs:98`. Prefer importing one shared helper from `sp-proxy/tests/helpers/` over five copies.
- Recompute (read what each hashes first): `dana-live-context.mjs:18,153,157` `FACT_SOURCE_HASH` values (they hash `{persona, responses, gated, hiddenAgendaTone}`); `sp-interview.local-dana.js:13–14` if `gated[0]` changed; `tests/conversation-audio-catalog.test.mjs` and `tests/conversation-recordings.test.mjs` line counts (64 response lines, 77 total today).

**Interfaces:**
- Consumes: Tasks 1–5; `edits.waveA` from the companion JSON; the rulings file.
- Produces: corpus bucket `screenGrades: [[text, 'observed'|'partial'|'missed']]` at the top level of `intent-recall-corpus.json`, checked for **every** case that has a `c_si` row by a new test `screen grade probes hold in every case`.

- [ ] **Step 1: Write the failing corpus rows first (D16(1), G-2).** Copy `edits.probes.c_si` into `screenGrades`; add `edits.probes.recognition` rows to each case's `required` (mustRecognise) and `mustNot` (mustNotRecognise) buckets; move the corpus's existing `proposed` rows to `required` (CE-A1) or `mustNot` (CE-A4, CE-A6) per the rulings. Drop any row whose CE id was rejected.
- [ ] **Step 2: Run `npm --prefix sp-proxy test` on the unmodified pack and save the red output** into the PR body. Expected: of the 36 `screenGrades` phrasings, 17 fail in all five cases and “Did he take his own life?” fails on Marcus only; the other 18 already hold and guard against regression. The validation, empathy, flag, sleep and Ray rows fail.
- [ ] **Step 3: Apply `edits.waveA` to the pack with a throwaway script** that loads the JSON (do not hand-type). For each case: replace the `take (…)` stem; attach the eight screen excludes to `si_direct`, `si_passive`, `si_euphemism`; append `si_leading` and `empathy_statement` before the first flag intent; add `si_leading` to `c_si.partialIfOnly`; add the `empathy_statement` raise rule; append the reflection, judgmental, reassurance, sleep and concentration patterns where the intent exists; Ray's `violence_screen` pattern; the patient copy under `patientCopy` (gate `deflectByIntent`, `responses.si_leading`, `responses.empathy_statement`, the two `_default` lines, Dana's teaching-point sentence). Mirror Morgan's result into `sp-interview.local-cases.js`.
- [ ] **Step 4: Add the CE-A7 growth branch to `buildNarrative`,** placed before the euphemism branch, shown when `si_leading` is covered and `si_direct`, `si_passive` are not: text exactly `The simulator recognized a leading question about suicide (one that expects “no”) but not a plain suicide screen. Review your words and the patient’s reply separately. For practice, ask it open: “Have you had thoughts of killing yourself?”`, `link:'pg_suicide.md'`, `intents:['si_direct','si_leading']`.
- [ ] **Step 5: Check where `criticalMiss.partial` is rendered or sent** (`grep -n "criticalMiss" sp-interview.html sp-proxy/netlify/functions/*.mjs`). Its copy says “only by euphemism”. If any learner-visible or evaluator path shows it for a `partial` reached through `si_leading`, stop: that needs a new CE line from the owner.
- [ ] **Step 6: In `benchmarks/interview-room/corpus.json`,** for the scenarios the owner ruled on (`leading-negative`, `learner-assertion`, `chart-quotation`, `historical-question-quotation`, `negated-discussion`), set `basis` and `reference` to cite the rulings file. Do not touch `third-person` (faculty-only, decision `interview-third-person-accepted-limitation`). Follow the README for regenerating any baseline the benchmark test pins.
- [ ] **Step 7: Recompute the derived pins** listed under Files; regenerate the preview.
- [ ] **Step 8: Run the proof set, then `bash bin/verify.sh --push`.** Expected: recall floor 250/250 plus the new rows; `screenGrades` 36 phrasings in every case; parity green; `redteam-offline` S1–S3 green (S3: no gate opens on a euphemism; confirm it also reports nothing for `si_leading`).
- [ ] **Step 9: Commit; open the draft PR.** Body: accepted CE ids with the owner's words; the red run from Step 2 and the green run from Step 8; “this drifts the `sp-interview.html` row to pending until console re-attestation”; rollback `git revert <sha>`.

---

## PR-3 — Wave B: Dana's clinical completeness (content)

Branch `claude/interview-room-pr3-dana-2026-11-11`. CE ids D1–D11, E1–E6. Do not start if Task 0 Step 4(b) found learners would lose recorded audio and the owner has not answered.

### Task 7: New topics on Dana's admission case (CE-D1 … D11)

**Files:** pack (case `sp_depression_gated_si_001`), `intent-recall-corpus.json` (Dana `required`, `mustNot`, `interview`), `_prototypes/sp-interview/tests/smoke.test.js:59–63`, `engine-extensions.test.mjs`, the derived pins from Task 6, preview.

**Interfaces:**
- Consumes: `edits.waveB[DANA]`: intents to insert before `mood` (`mania_screen`, `fhx`, `precipitant`, `firearms`) and before the first flag (`anxiety_screen`, `trauma_screen`, `probe`); `excludePatterns.add`; `responses`; the `si_means` removals; checklist row `c_bipolar`; the `c_si_followup` label and intents; hints; the appended teaching point.
- Order matters: an inserted intent sits before the general intent it overlaps, because the offline patient answers the first fresh hit in pack order.

- [ ] **Step 1: Failing rows.** Add `edits.probes.danaWaveB` (36 rows) to Dana's `required`/`mustNot`. Re-bucket the two gun rows from `si_means` to `firearms` (`edits.waveB.expectedCorpusReBuckets`). Add to Dana's corpus `interview` three turns so `noMissedRows` still holds: “Have you ever had a stretch where you needed very little sleep and had more energy than usual?”, “Does anyone in your family have depression or anything like it?”, “Are there any guns in the house?” (the last after the means question). Add the first two to the “dana skilled” transcript in `smoke.test.js`, watching the `replies[8]` index at line 59.
- [ ] **Step 2:** Run; confirm red on the unmodified pack. Save the output.
- [ ] **Step 3:** Apply the edits with a script. Add client tests: “Have you ever had a period where you needed very little sleep and felt on top of the world?” replies with a `mania_screen` line, not the insomnia line; after disclosure, “Are there any guns in the house?” replies with a `firearms` line and does not replay the pills reveal; “Has anyone in your family died by suicide?” does not unlock `si_active`.
- [ ] **Step 4:** Recompute pins; regenerate preview; run the proof set. Expected: 36/36 new rows; existing floor green after the two re-buckets.
- [ ] **Step 5:** Commit.

### Task 8: Intent is not a protective factor (CE-E1 … E6; Dana and the follow-up)

**Files:** pack (both Dana cases), `sp-interview.html:658` (the hard-coded follow-up completeness check in `buildNarrative`), `sp-interview.local-dana.js:13–14` (`SOURCE_GATE` literal and `SOURCE_GATE_HASH`), `dana-live-context.mjs` hashes, `sp-proxy/tests/redteam-offline.test.mjs:55` (`18 gate(s) on 5 reviewed case(s)` → `20`), `intent-recall-corpus.json` (rows at ~155, 343, 453), `sp-safety-scoring-uniformity.test.mjs:170,189–191`, `benchmarks/interview-room/corpus.json:166–188`, `fixtures/dana-quality/19-*.json`, `20-*.json` if they name the follow-up intents, `parity.test.mjs`.

**Interfaces:**
- Consumes: `edits.waveB[DANA]` and `[FU]`: intent `si_intent` inserted **before** `si_intent_protective`; the three patterns removed from `si_intent_protective` and its new label; gate `si_intent_detail` inserted **before** `si_protective_detail`; Dana's edited protective reveal; `si_active.unlocks`; `c_si_followup.intents`.
- Produces: `buildNarrative`'s follow-up check reads the case's own `c_si_followup` checklist intents instead of four hard-coded ids.

- [ ] **Step 1: Failing tests.** Corpus: re-bucket “Do you intend to act on these thoughts?” and “How close have you come?” to `si_intent`. Gate scenarios (corpus `gateScenarios`): after `Have you had thoughts of killing yourself?`, the turn `Do you intend to act on these thoughts?` must unlock `si_intent_detail` and must not unlock `si_protective_detail`; the turn `What has kept you from acting on these thoughts?` must unlock `si_protective_detail` and must not unlock `si_intent_detail`; before disclosure, `Do you intend to act on this?` unlocks nothing. Same three for the follow-up case. Parity scenario for each.
- [ ] **Step 2:** Run; confirm red.
- [ ] **Step 3:** Apply the pack edits; change `sp-interview.html:658`; update the literals and counts listed under Files, reading each before changing it.
- [ ] **Step 4:** Regenerate preview; run the proof set and `bash bin/verify.sh --push`. `node bin/redteam-offline.mjs` must pass unmodified; if a hand-written probe there fails, stop and report (that file is governance).
- [ ] **Step 5:** Commit; open the draft PR with the same body shape as PR-2.

---

## PR-4 — Wave C: cues, debrief, entrance (content)

Branch `claude/interview-room-pr4-debrief-2026-11-11`. CE ids F1–F4. The debrief and entrance changes carry no clinical wording but follow spec §6 exactly.

### Task 9: Cues and the offline “say more” reply

**Files:** pack (Dana admission: `cues`), `sp-interview.html` (new pure function; `respond` reply block), `engine-extensions.test.mjs`.

**Interfaces:**
- Consumes: `edits.waveC[DANA].cues`: `{ id, label, patientPatterns: string[], responseKey: string|null, followIntents: string[] }`.
- Produces: `computeCues(session): Array<{ id, label, turn: number, patientLine: string, next: Array<{ number, learner, intents: string[] }>, followRecognised: boolean }>`. `turn` is `0` for the opening line, else the 1-based turn whose patient reply matched. A cue is listed once, at its first occurrence. `next` is the following two learner turns (fewer at the end). `followRecognised` is true when any `next` turn's intents intersect `followIntents`. Patient lines are matched after `normalizeLearnerText`. A case with no `cues` returns `[]`.
- Produces: in `respond`, when the only non-flag hits are soft intents including `probe`, and the previous patient line matches a cue whose `responseKey` has a `responses` entry, the reply is picked from that entry at the current tier. No state change.
- Export `computeCues` on `window.__SP_TEST__`.

- [ ] **Step 1: Failing tests.** (a) After “Can you walk me through what led up to coming in last night?” at open tier, Dana's reply carries cue `cue_overheard`; next learner turn “What did Tom hear you say?” → `followRecognised: true`. (b) Same cue, next two turns “How's your appetite?”, “How's your energy?” → `false`, and `next` holds both lines verbatim. (c) At open tier (open with one invitation first; the cue lines for `cue_three_am` and `cue_burden` exist only in the open tier), after the sleep reply, “Say more about that.” replies with a `cue_three_am` line. (d) Zero turns → `[]`. (e) Marcus (no `cues`) → `[]`.
- [ ] **Step 2–5:** red, implement, regenerate preview, proof set, commit.

### Task 10: Debrief restructure (spec §6)

**Files:** `sp-interview.html` (debrief screen ~1976–2100; two new pure functions), `engine-extensions.test.mjs`, `sp-proxy/tests/interview-feedback-display.test.mjs` (reads the page; keep it green), `tests/smoke/interview-room.spec.js`.

**Interfaces:**
- Produces: `lockedReveals(session): Array<{ gateId, reveal, children: Array<{ gateId, reveal }> }>`: top-level gates (no `requiresGate`) not in `session.unlocked`, each with its child gates. Empty when everything opened.
- Produces: `pickPriority(session, cov, nar, cues): { kind: 'critical'|'flag'|'cue'|'reflections'|'topic'|'none', text: string, link?: string }`: the first that applies of: the critical row not observed (`text` = the existing `rehearseLine` framing; the crit box itself is unchanged); a flag in any turn (`getCoach`'s existing flag sentence); the first cue with `followRecognised === false` (`text` = `The simulator did not recognize a follow-up to “<label>” in your next two lines. In the re-run, stay with it before moving on.`); fewer than two recognised reflections (the existing growth sentence); the first `missed` checklist row that has a `hints` entry (that hint); else `none`.
- Export both on `window.__SP_TEST__`.

Layout, top to bottom: formative banner (unchanged) → one `<details>` “How to read this feedback” holding the three existing guide paragraphs and the exchange list, closed by default → safety-topic box (unchanged, only when it applies) → **One thing for the re-run** (`pickPriority`, hidden when `none` or when the critical box is showing the same thing) → **What stayed behind the door** (`lockedReveals`; heading note exactly `Not disclosed in this encounter. These are the patient’s own lines, had the question opened them.`; top-level reveal shown, children inside a nested `<details>`) → **Cues she offered** (per cue: label, the patient line, then each `next` line with `The simulator recognized: <intent labels>` or `The simulator recognized nothing in this line.`; use the persona's name, not a pronoun, in the heading) → “Your read, then the room's” → one `<details>` “Everything the simulator recognized” holding the existing What worked / Work on next, the four indicators and the topic list unchanged → “From your faculty” and actions (unchanged).

- [ ] **Step 1: Failing unit tests** for `lockedReveals` (no SI question → Dana's `si_active` with four or five children; after full disclosure → `[]`; Morgan, no gates → `[]`) and `pickPriority` (one test per `kind`, plus zero turns → `critical` for Dana and no throw; a session at the turn cap → no throw).
- [ ] **Step 2: Failing Playwright assertions** in `interview-room.spec.js`: after a three-turn offline Dana encounter with no suicide question, the debrief shows the heading “What stayed behind the door”, the text “Not disclosed in this encounter.”, and exactly one visible “One thing for the re-run” block; the string “A match does not establish” is present once in the DOM, inside the collapsed panel.
- [ ] **Step 3:** Implement. Keep every existing F1–F4 label string and the `criticalMiss` lookups byte-for-byte.
- [ ] **Step 4:** Regenerate preview; run the proof set; `cd tests/smoke && npx playwright test --project=interview-room`. Check `tests/contrast-check.mjs` selectors `.sa label .num` and `.teach p .pin` still resolve.
- [ ] **Step 5:** Commit.

### Task 11: Entrance and self-assessment copy (spec §6, last two bullets)

**Files:** `sp-interview.html` (header ~1626–1653, entrance ~1697–1711, self-assessment ~1962–1973), `_prototypes/sp-interview/tests/storage.test.mjs` (pins the passcode sentence and proxy URL; do not change either), `tests/smoke/interview-room.spec.js` (asserts the room select has value `spoken` at ~703–706, 740, 1078, 1096, 1190; that default must not change).

**Interfaces:**
- Produces: when the spoken room is unavailable for the chosen case, both Begin buttons are enabled and start a typed encounter for this visit only (no write to `cw_sp_room_mode_v1`); the note reads `The spoken room isn’t available right now, so this visit will use the typed room.`
- Copy: `● Mock patient (offline)` → `● Practice patient (works offline)`; `● Live patient (LLM proxy)` → `● Live patient`; the settings card shows the passcode field first and puts the endpoint field inside `<details><summary>Advanced</summary>`; its first sentence becomes `Enter the passcode from Dr. Moss.` and keeps `The passcode is kept only for this browser tab.` verbatim.
- Self-assessment, when the provider is the offline mock and the case has no `visitNote`: `Commit before you see anything. Your answers are shown back to you beside the transcript — nothing is graded.` and the ready hint `Nothing here is graded.`; the live wording is unchanged.

- [ ] **Step 1:** Failing Playwright assertions: in the offline preview with the room select at `spoken`, “Begin — Supported” is enabled and clicking it lands in the typed room; `localStorage.cw_sp_room_mode_v1` is still unset or `spoken`; the header button text is `● Practice patient (works offline)`.
- [ ] **Step 2–4:** red, implement, regenerate preview, proof set plus the Playwright project.
- [ ] **Step 5:** Commit; open the draft PR.

---

### Task 12: Hand each PR to the owner

For every PR, the body ends with the evidence block from the spec's §7, rewritten for that PR's own diff (CLAIMS tagged VERIFIED or INFERRED, COUNT with its denominator and SHA, ROLLBACK, BLAST RADIUS, COST, PRIOR DECISIONS, WHAT WOULD CHANGE THE REC, NOT CHECKED), then a list headed **Only the owner can do**: merge; for PR-1, deploy `sp-interview-proxy`; for PR-2 to PR-4, re-attest the `sp-interview.html` row in the faculty console (it renders pending from merge until then). Report a gate as “X verified <property> at <SHA>; known-miss fixture <row> fails as expected”, never as “X passed”.

Then run `python3 bin/what_needs_josh.py` and confirm the drifted row is listed.

## Deferred, on purpose

- Renaming `si_intent_protective` to `si_protective` (needs a governance PR for `bin/redteam-offline.mjs` first).
- Cues and completeness topics for Marcus, Ray, Morgan and the follow-up visit, after the owner has seen Dana's.
- A supervision sheet at the top of the transcript download.
- Anything semantic (D16(3)).
