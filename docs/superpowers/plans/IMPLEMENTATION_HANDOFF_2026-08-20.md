# Implementation Handoff — Clinical & Instrument Review Remediation

**Target repo:** `~/Psychiatry-Clerkship-Library` (branch from `main`)
**Source documents:** `CLINICAL_AND_INSTRUMENT_REVIEW_2026-08-20.md` · `SPEC_Withdrawal_Instrument_Redesign_v1.md`
**Audience:** Claude Code (or any coding agent) executing in the repo, with Joshua Moss, MD as the clinical author-of-record.
**Created:** 2026-08-20

---

## 0. How to use this document

This is an **execution spec**, not a summary. Each work package (WP) is independently mergeable and carries its own acceptance criteria and verification command. Work the waves in order; within a wave, WPs are parallel unless a `Blocked by` line says otherwise.

Every WP is labelled with an owner:

| Label | Meaning |
|---|---|
| **`AGENT`** | The agent implements and verifies end to end. No clinical judgment required. |
| **`AGENT+REVIEW`** | The agent implements; a named clinician must approve the diff before merge. The agent opens the PR and **stops**. |
| **`AUTHOR-GATED`** | The agent may scaffold structure, TODO markers, and tests, but **must not write the clinical content**. Content comes from §8. |

**The single most important rule in this document:** the agent must never author, invent, paraphrase, or "fill in" clinical content, instrument anchors, drug information, or faculty attestations. Where content is required, the spec supplies it verbatim or the WP is `AUTHOR-GATED`. If an anchor string, threshold, or teaching sentence is not present in `SPEC_Withdrawal_Instrument_Redesign_v1.md` or in this document, **stop and ask** rather than generating it.

---

## 1. Ground rules (non-negotiable)

1. **No invented clinical content.** See above. This includes: instrument anchors, score bands, thresholds, drug names, doses, guideline claims, citations, and answer keys. A plausible-sounding anchor in a safety instrument is a defect, not a draft.
2. **No self-attestation.** Never set `facultyReview.status` to `reviewed`, never add a "Reviewed and attested by…" line, never write into `reviewed.json` or `qbank_attestation_*.json`. Those are author actions.
3. **No PHI, ever** — including in test fixtures, sample series data, and commit messages. All examples are synthetic.
4. **`localStorage` keys must be `cw_*` (shared hub) or `rp_*` (resident).** The QA gate hard-fails anything else (`check-static-site.mjs:253-255`).
5. **Dose-literal gate scope** (`check-static-site.mjs:242-251, 284`):
   - **HARD fail** for `rp-*.html` and `*-trainer.html` in `tools/`, and **unconditionally HARD for any `*.pack.json`**.
   - **SOFT warn** for other `tools/*.html` unless the file carries a `QA-ALLOW-DOSE` marker.
   - Regex is `/\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i`. **Recognition thresholds like `CIWA ≥15`, `COWS ≥8–12`, `QTc ≥500`, `≥50% BFCRS reduction` do not match it and are safe to add.** This distinction is the whole point of WP-19 and §8.4.
6. **The SP state machine is duplicated and parity-tested.** `deriveState` exists in **both** `sp-proxy/netlify/functions/sp.mjs` (~L288-336) and `_prototypes/sp-interview/sp-interview.html` (~L234-280). `_prototypes/sp-interview/tests/parity.test.mjs` runs 48 scenarios across both. **Any change to one must be made to the other in the same commit** or parity fails. A one-sided "fix" that keeps parity green because both sides are wrong is a known failure mode in this repo (see the `onlyFirstTime` bug).
7. **`CLAUDE.md` and `AGENTS.md` must stay byte-identical.** If you edit one, run `cp CLAUDE.md AGENTS.md` before committing. CI fails the PR otherwise.
8. **No hard-coded `/Users` or `/sessions` paths in tracked `.py`.** CI greps for it. Derive from `__file__`.
9. **Never commit Git-LFS pointer stubs** in place of media. If audio shows as "modified" in a sandbox without LFS, do not commit it.
10. **A new shipped page must be registered in `site_manifest.json` AND in nav inside `build_deploy.py`**, or the QA gate's orphaned-source check hard-fails the build.
11. **Do not "improve" anything not named in a WP.** Scope creep in a safety-instrument file is how the next audit gets written.

---

## 2. Repo facts to load before touching anything

Run this first and read the output:

```bash
cd ~/Psychiatry-Clerkship-Library
cat CLAUDE.md
sed -n '1,40p' 13_Faculty_Resources/_automation/site_build/check-static-site.mjs   # gate contract
sed -n '1,35p' 13_Faculty_Resources/_automation/validate_registry_schemas.py       # PAIRS tuple
sed -n '19,110p' .github/workflows/ci.yml                                          # the gate order
python3 -c "import json;d=json.load(open('13_Faculty_Resources/_automation/site_build/site_manifest.json'));print(len(d['tools']),'tools',len(d['md']),'md')"
```

**Full local verification (this is the gate; run it before every PR):**

```bash
python3 -m pip install -r requirements.txt
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
node --test tests/*.test.mjs
node tests/contrast-check.mjs
npm --prefix sp-proxy ci && npm --prefix sp-proxy test
bash _prototypes/sp-interview/tests/run-all.sh
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Playwright smoke is a separate suite with its own deps and **must not** be run from repo root:
```bash
cd tests/smoke && npm ci && npx playwright test
```
**Visual baselines regenerate on Ubuntu/Chromium only** — via the "Refresh visual baselines" `workflow_dispatch`, never locally on macOS.

**Registries and their schemas** (`validate_registry_schemas.py` `PAIRS`): `topic_meta`, `question_bank`, `communication_cases`, `family_systems_scenarios`, `evidence_registry`, `tool_registry`. Note what is **absent**: `reasoning_cases.json`, `reasoning_cases_resident.json`, `longitudinal_case.json`, and `quizzes.json`. WP-16 and WP-17 close that.

---

## 3. Work package index

| Wave | WP | Title | Owner | Effort | Blocked by |
|---|---|---|---|---|---|
| **0** | WP-00 | Branch, tracking file, verification harness baseline | AGENT | 30 m | — |
| **1 — Safety** | WP-01 | Capacity module: `'na'` bug + disable Copy note | AGENT | 20 m | WP-00 |
| | WP-02 | COWS: legal-value arrays, delete impossible scores | AGENT | 2 h | WP-00 |
| | WP-03 | CIWA: delete unconditional directive, restore ≥15 band | AGENT+REVIEW | 45 m | WP-00 |
| | WP-04 | Withdrawal seizure window: overlapping bands | AGENT+REVIEW | 20 m | WP-00 |
| | WP-05 | BFCRS: anchors, invalid scores, malignant-catatonia interrupt, challenge interval | AGENT+REVIEW | 2 h | WP-00 |
| | WP-06 | C-SSRS: timeframes, stale-answer bug, administration panel | AGENT+REVIEW | 1 h | WP-00 |
| | WP-07 | Violence page: delete the count-based directive | AGENT | 20 m | WP-00 |
| | WP-08 | SP: delete punitive regexes + crisis/distress path + keep the 403 | AGENT+REVIEW | 3 h | WP-00 |
| **2 — Score integrity** | WP-09 | Daily Review: shuffle options | AGENT | 15 m | WP-00 |
| | WP-10 | Shelf Mode: disable, remove false marketing copy | AGENT | 30 m | WP-00 |
| | WP-11 | Case banks: randomize option order at render | AGENT | 1 h | WP-00 |
| | WP-12 | Formative labelling + honest attempt storage | AGENT | 1 h | WP-00 |
| | WP-13 | Draft-badge bug + case-level attestation coherence | AGENT | 45 m | WP-00 |
| | WP-14 | Diagnostic Reasoning: restore blind repeat practice | AGENT | 45 m | WP-11 |
| **3 — Prevent recurrence** | WP-15 | New CI gate: positional + length cue detection | AGENT | 3 h | WP-11 |
| | WP-16 | `quizzes.json`: pretty-print, stable ids, schema, validator | AGENT | 3 h | WP-09 |
| | WP-17 | Wire content-hash attestation into CI | AGENT | 2 h | — |
| | WP-18 | Trap-name consistency check + fix the three stale `why` fields | AGENT+REVIEW | 1 h | WP-17 |
| | WP-19a | Distractor-rationale leak migration in `quizzes.json` | AGENT | 3 h | WP-16 |
| **4 — Instrument rebuild** | WP-20 | CIWA-Ar + COWS rebuilt as rating instruments | AGENT+REVIEW | 6 h | WP-02, WP-03 |
| | WP-21 | Serial trending across instruments | AGENT | 4 h | WP-20 |
| | WP-22 | BFCRS pre/post Δ% + response criterion | AGENT+REVIEW | 2 h | WP-05, WP-21 |
| | WP-23 | PAWSS pre-screen card | AUTHOR-GATED | 3 h | WP-20 |
| **5 — Clinical content** | WP-24 | Catatonia on the psychosis page + acute dystonia in the primer | AUTHOR-GATED | — | — |
| | WP-25 | Fentanyl-era buprenorphine branch + qbank re-keys | AUTHOR-GATED | — | — |
| | WP-26 | Citation and landmark-trial corrections | AGENT+REVIEW | 3 h | — |
| | WP-27 | Dose policy rewrite + per-page disclosure line | AGENT+REVIEW | 2 h | — |
| | WP-28 | Evidence registry wiring (10 orphaned sources) | AGENT | 1 h | — |
| | WP-29 | Six consult pages | AUTHOR-GATED | — | — |
| **6 — SP rebuild** | WP-30 | Coverage moves to patient-side emission | AGENT+REVIEW | 4 h | WP-08 |
| | WP-31 | Gates → authored preconditions | AUTHOR-GATED | — | WP-30 |
| | WP-32 | Evaluator: quote enforcement, strengths floor 0, no praise fallback | AGENT | 3 h | WP-08 |
| | WP-33 | Adversarial transcript suite + "fails correctly" test | AGENT | 3 h | WP-30, WP-32 |

**Dependency spine:** `WP-00 → Wave 1 (parallel) → Wave 2 (parallel) → WP-15/16/17 → Wave 4 → Wave 6`. Wave 5 is independent of everything and blocked only on author input.

---

## 4. Branch, commit, and PR protocol

- **One branch per WP:** `fix/wp-01-capacity-na-verdict`, `fix/wp-02-cows-legal-values`, …
- **Never batch a Wave-1 safety fix with anything else.** Each must be independently revertable.
- **Every PR body must contain**, verbatim:
  - the WP id and title,
  - the acceptance-criteria checklist from this document with boxes ticked,
  - the local verification command output (pass/fail lines only),
  - for `AGENT+REVIEW`: `**BLOCKED — requires clinical sign-off from Joshua Moss, MD before merge.**`
- **Commit message format:**
  ```
  WP-NN: <imperative summary>

  <what changed and why, referencing the review finding id>
  Verification: <command run>
  ```
- **Do not merge your own `AGENT+REVIEW` PR.** Open it, post the checklist, stop, and report.
- **Tracking file:** maintain `docs/superpowers/plans/2026-08-20-review-remediation-STATUS.md` (created in WP-00) with one row per WP: status, branch, PR, blocker. Update it in the same commit as the work.

---

## 5. Wave 1 — Safety fixes (before the next rotation block)

### WP-01 · Capacity module: `'na'` is truthy → the tool declares INTACT capacity `AGENT`

**File:** `04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html`

**Current (L110-116):**
```js
function verdict(){
  var anyImp = ABIL.some(function(a){return rate[a.key]==='impaired';});
  var allRated = ABIL.every(function(a){return rate[a.key];});
  if(!allRated) return {cls:'part',txt:'Incomplete — rate all four abilities for a determination.'};
  if(anyImp) return {cls:'no',txt:'Pattern suggests the patient LACKS capacity for this specific decision.'};
  return {cls:'ok',txt:'Pattern consistent with INTACT capacity for this specific decision.'};
}
```
The UI (L182) sets `rate[a.key] = 'na'` for the **Not assessed** button. `'na'` is truthy, so `allRated` passes.

**Replace with:**
```js
function verdict(){
  var anyImp   = ABIL.some(function(a){return rate[a.key]==='impaired';});
  var anyNA    = ABIL.some(function(a){return rate[a.key]==='na';});
  var allRated = ABIL.every(function(a){return a.key in rate && rate[a.key]!=='na';});
  if(anyNA)     return {cls:'part',txt:'Cannot determine — one or more abilities are marked Not assessed. A determination requires all four.'};
  if(!allRated) return {cls:'part',txt:'Incomplete — rate all four abilities for a determination.'};
  if(anyImp)    return {cls:'no',txt:'Pattern suggests the patient LACKS capacity for this specific decision.'};
  return {cls:'ok',txt:'Pattern consistent with INTACT capacity for this specific decision.'};
}
```

**Also (L190) — disable the export while the assessment is incomplete:**
```js
e('button',{className:'btn btn-primary',disabled:verdict().cls==='part',
            title:(verdict().cls==='part'?'Complete all four abilities before exporting a note.':''),
            onClick:copyNote}, copied?'Copied ✓':'Copy note'),
```

**Acceptance criteria**
- [ ] All four abilities = **Not assessed** → verdict reads *"Cannot determine…"*, never *"INTACT"*.
- [ ] Mixed (two Intact, two Not assessed) → *"Cannot determine…"*.
- [ ] All four Intact → unchanged `INTACT` verdict; **Copy note** enabled.
- [ ] Any `na` present → **Copy note** disabled.
- [ ] Generated `note()` text is unchanged for the all-rated paths.
- [ ] New test in `tests/capacity-verdict.test.mjs` covering the four states above (extract `verdict()` logic or assert via string match on the rendered output — follow the pattern in an existing `tests/*.test.mjs`).

**Verify:** `node --test tests/*.test.mjs && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`

> **Note for the follow-on work (WP-not-scheduled, author decision):** the review's recommendation is to **delete `verdict()` entirely** and convert the module to a structured report, on the grounds that the four abilities are a framework and even the MacCAT-T authors declined to publish a cutoff. That is an architectural change requiring the author's decision — do not do it under WP-01. Record it in the status file as `OPEN-DECISION-1`.

---

### WP-02 · COWS renders impossible scores `AGENT`

**File:** `03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html`

**Current (L108-120 data, L155 render):**
```js
var COWS=[ {k:'pulse',b:'Resting pulse rate',d:'measured after 1 min rest (0 ≤80 → 4 >120)',max:4}, … ];
…
var opts=[]; for(var s=0;s<=i.max;s++) opts.push(e('option',{key:s,value:s},s));
```
COWS is a **sparse** instrument. The dense loop offers integers that do not exist on it — e.g. gooseflesh (legal `0,3,5`) currently offers `0,1,2,3,4,5`.

**Change 1 — data model.** Replace `max:N` with `vals:[…]` on all eleven COWS items. Anchor text is supplied verbatim in `SPEC_Withdrawal_Instrument_Redesign_v1.md` §2.2 — **copy it from there; do not retype from memory.** Keep a `max` field derived from `Math.max(...vals)` so the existing `mval` / `mini` bar renderers keep working:

```js
var COWS=[
  {k:'pulse', b:'Resting pulse rate', tag:'OBSERVED',
   d:'After the patient has been sitting or lying for one minute',
   vals:[{v:0,a:'≤80'},{v:1,a:'81–100'},{v:2,a:'101–120'},{v:4,a:'>120'}]},
  // … the remaining ten items, verbatim from SPEC §2.2
];
COWS.forEach(function(i){ i.max = i.vals[i.vals.length-1].v; });
```

**Change 2 — render only legal options** (L155). Handle both shapes so the CIWA array is untouched by this WP:
```js
var opts = i.vals
  ? i.vals.map(function(o){ return e('option',{key:o.v,value:o.v}, o.v+' — '+o.a); })
  : (function(){var a=[];for(var s=0;s<=i.max;s++)a.push(e('option',{key:s,value:s},s));return a;})();
```

**Change 3 — fix the meter labels** (L131-141). The `COWS_GAUGE.labels` currently read `≤12 mild / 13–24 mod / ≥25 severe` while `info()`'s first tier is `≤4 None/minimal`, and the published `25–36` and `37–48` bands are collapsed. Restore four segments matching `info()`: `5–12 mild · 13–24 moderate · 25–36 moderately severe · 37–48 severe`, and add the missing fourth tier to `info()`.

**Acceptance criteria**
- [ ] Every COWS `<select>` offers **only** published legal values. Specifically: gooseflesh offers `0,3,5`; restlessness `0,1,3,5`; pupil size `0,1,2,5`; GI upset `0,1,2,3,5`; pulse/aches/nose/tremor/yawning/anxiety `0,1,2,4`; sweating `0,1,2,3,4`.
- [ ] Each option label shows its published anchor text.
- [ ] Maximum achievable total is **48**.
- [ ] Meter segments match `info()` tiers; no COWS score displays a tier label contradicting its pill.
- [ ] New test `tests/cows-legal-values.test.mjs` parses the `COWS` array out of the HTML and asserts the exact legal-value sets above. This test is the regression guard — it must fail if anyone reintroduces a dense range.
- [ ] CIWA behaviour unchanged in this PR.

**Verify:** `node --test tests/*.test.mjs && bash …/build_and_check.sh ms3 && bash …/build_and_check.sh res`

---

### WP-03 · CIWA: the unconditional "often no medication" string, and the missing ≥15 band `AGENT+REVIEW`

**File:** same. **Current (L124-129):**
```js
labels:[{t:'≤8 mild'},{t:'9–19 mod'},{t:'≥20 severe'}],
info:function(t){
  if(t<=8)  return {…, action:'Often no medication — monitor and reassess.', timeline:null};
  if(t<=19) return {…, action:'Symptom-triggered benzodiazepine; reassess hourly.', timeline:'24–48 h'};
  return              {…, action:'High seizure / DT risk — escalate urgently per protocol.', timeline:'48–72 h'};
}
```

Two defects: (a) merging 9–19 erases **CIWA ≥15**, the conventional escalation threshold; (b) *"Often no medication"* is an affirmative instruction issued to a tool with **no field for withdrawal history** — a patient with prior withdrawal seizure or DT needs scheduled prophylaxis regardless of the score.

**Replace `info()` and `labels` with four bands, using the replacement strings from `SPEC` §1.3 verbatim.** The principle to enforce, and to apply to every future band string: **the tool describes; it does not direct.**

**Also add a "highest drivers" readout.** The `scored` array already exists at L157 (top 6 non-zero items, sorted). Surface the top two by name in the band panel: *"Your highest drivers are tremor and anxiety."* This is what a clinician actually communicates and it is what the score is for.

**Also (L202)** split the PAWSS sentence. Keep the validity-conditions half — *"CIWA assumes the patient can communicate — it is unreliable in delirium, intubation, or language barriers"* — it is the best sentence on the tab. Delete *"use a protocol like RASS/PAWSS there"* and replace with the non-communicative-patient pathway text in `SPEC` §3. PAWSS gets its own card in WP-23.

**Acceptance criteria**
- [ ] Four bands: `0–8 / 9–14 / 15–19 / ≥20`. The 15–19 band names ≥15 as the escalation threshold.
- [ ] The string `Often no medication` does not appear anywhere in the file.
- [ ] No band string contains an imperative treatment instruction; each ends by deferring to unit protocol.
- [ ] The 0–8 band explicitly states that prophylaxis is driven by withdrawal history and complicated-withdrawal risk, not by this score.
- [ ] Top-two driver items are named in the output.
- [ ] `grep -n "RASS/PAWSS" <file>` returns nothing.
- [ ] `tests/ciwa-bands.test.mjs` asserts band boundaries and the absence of the banned string.

**Sign-off required from:** Joshua Moss, MD (band text is clinical).

---

### WP-04 · Alcohol-withdrawal seizure window rendered as a sequential ladder `AGENT+REVIEW`

**File:** `04_Acute_and_Safety/Decision_Aids/decision-aids.html` (L189-194)

```js
{t:"12–24 h", h:"Alcoholic hallucinosis", …},
{t:"24–48 h", h:"Withdrawal seizures", s:"Generalized tonic-clonic; can occur without prior signs.", tone:"warn"},
```

Withdrawal seizures occur **6–48 h**, peaking ~**12–24 h**. The disjoint ladder implies a patient at hour 18 is "not in the window yet."

**Change:** render **overlapping bands**, not sequential steps. Seizures `6–48 h (peak 12–24 h)`. Note DTs can extend to ~96 h. The visual must not imply that one phase ends before the next begins.

**Also:** this page self-labels *"AI-drafted, pending faculty attestation"* (L294) while the **attested** CIWA card links into it at its highest-stakes moment (`withdrawal-ciwa-cows-card.html:183`, fires at moderate/severe CIWA). Either the page gets attested by the author or the outbound link is suppressed. Record as `OPEN-DECISION-2`; do not decide it yourself.

**Acceptance criteria**
- [ ] Seizure band renders as `6–48 h` with peak `12–24 h` visually indicated.
- [ ] Timeline no longer implies strict sequence between hallucinosis and seizures.
- [ ] DT window extends to ~96 h.
- [ ] `OPEN-DECISION-2` logged in the status file with both options stated.

---

### WP-05 · BFCRS: wrong anchors, invalid scores, no malignant-catatonia interrupt `AGENT+REVIEW`

**File:** `04_Acute_and_Safety/Catatonia/bfcrs.html`

**5a — Withdrawal anchors are wrong by ~3× (L130).**
```js
{n:"Withdrawal",d:"Refuses food / drink or eye contact",
 a:["Absent","Minimal intake / interaction for < 1 day","< 3 days","No intake / interaction for ≥ 3 days"]},
```
Published anchors: `1 = minimal PO intake/interaction for less than one day` · `2 = minimal PO intake/interaction for more than one day` · `3 = no PO intake/interaction for one day or more`. Restore verbatim. A patient with no PO intake for 24 h is a **3** — that is the rung that flags the dehydration/rhabdo/NG decision, and it also feeds the total used to judge lorazepam response.

**5b — Dichotomous items accept invalid 1 and 2.** Waxy flexibility (L129), Mitgehen (L133) and grasp reflex (L136) are labelled *"(scored 0 or 3)"* and carry the placeholder `"— (item is rated present / absent)"` at levels 1 and 2 — but `Item()` renders `[0,1,2,3]` unconditionally as clickable buttons (~L160). A spurious `1` inflates the `/69` total **and** can flip `screenCount` (`scores[i]>0` over items 1-14) to positive, firing the lorazepam callout.

Add to the button map:
```js
var disabled = !it.a[v] || it.a[v].charAt(0)==='—';
return e("button",{key:v, disabled:disabled,
  className:"opt"+(on?" on":"")+(v===0?" zero":"")+(disabled?" na":""),
  onClick:function(){ if(!disabled) set(i,v); }}, …);
```

**5c — Item 23 (Autonomic abnormality) is scoreable and triggers nothing.** The only conditional in the file is `var positive = screenCount>=2` (L~155), which nudges toward a benzodiazepine trial. A patient scoring 3 on autonomic abnormality with rigidity is **malignant catatonia** — the emergency the attested teaching page calls *"the one you must never miss."*

Add a hard interrupt, rendered **above** the lorazepam callout and visually dominant:
```js
var idxAuto = 22, idxRigid = 9, idxImmob = 0;   // verify indices against BF[] before use
var malignant = scores[idxAuto] >= 1 && (scores[idxRigid] >= 2 || scores[idxImmob] >= 2);
```
Interrupt copy (author-supplied, use verbatim): *"Autonomic abnormality with rigidity or immobility — consider malignant catatonia / NMS. This is a medical emergency. ECT is definitive. Escalate now."* Cross-link `?page=toxidromes.md`.

**5d — The lorazepam callout (L189).** Currently: *"e.g., 1–2 mg IV/IM, reassess in 1–2 h."* Three problems: the interval is wrong (challenge is re-rated at ~5 min after IV, 10–15 min IM); the **positive-response criterion is missing** (≥50% reduction in BFCRS) in a tool that computes and displays exactly that number and captions it *"track it to follow response"*; and the dose literal contradicts the attested MS3 catatonia page which says never to quote one.

Rewrite the callout to: state the challenge without a dose (defer to protocol), give the correct reassessment interval, state the **≥50% BFCRS reduction** criterion, and keep the *"hold antipsychotics until catatonia is excluded"* clause. **Removing `1–2 mg` also clears a dose-gate SOFT warning** — confirm with the gate output.

**Acceptance criteria**
- [ ] Withdrawal anchors match the published instrument verbatim; level 3 threshold is `≥1 day`.
- [ ] Levels 1 and 2 are non-clickable on waxy flexibility, Mitgehen and grasp reflex; `screenCount` cannot be flipped by an invalid score.
- [ ] `malignant` interrupt fires on the stated condition and renders above the lorazepam callout.
- [ ] Callout states the correct reassessment interval and the ≥50% criterion; contains no `mg` literal.
- [ ] `tests/bfcrs-scoring.test.mjs` asserts: (a) legal score sets for the three dichotomous items, (b) the Withdrawal anchor strings, (c) the malignant-catatonia trigger truth table.
- [ ] Gate output shows no new dose warnings.

**Sign-off required from:** Joshua Moss, MD.

**Deferred to WP-22:** examination-procedure content (the manoeuvre instructions with their counter-instructions) and the pre/post Δ% fields. Those are `AUTHOR-GATED` content plus a UI change.

---

### WP-06 · C-SSRS: missing timeframes and a stale-answer bug `AGENT+REVIEW`

**File:** `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html`

**6a — Every timeframe anchor is missing (L82-86).** Q1–Q5 ship with verbatim stems and **no reference period**. The published Screener with Triage places Q1–Q5 under **Past month** and Q6 under **Lifetime** with a **past-3-months** sub-question. The tool preserves the Q6 structure (L128-137) and drops the Q1–Q5 frame — while `band()` is calibrated to past-month ideation. A patient recalling ideation from a decade ago answers yes to Q4 and gets `HIGH risk`.

Add a `frame` field to each `Q` entry (`'Past month'` for q1–q5, `'Lifetime'` for q6) and render it in the existing `nodekick` element alongside the category label.

**6b — Stale answers survive a branch reversal.** `var showSub = a.q2==='yes'` (L103) controls only rendering; `band()` (L88-99) reads `a.q3/q4/q5` unconditionally. Answer Q2=Yes → Q4=Yes, then correct Q2 to No: Q3–Q5 dim out and the triage node still reads HIGH off the orphaned Q4.

Fix in the setter, not in `band()`:
```js
function S(k){ return function(v){
  var n=Object.assign({},a); n[k]=v;
  if(k==='q2' && v!=='yes'){ delete n.q3; delete n.q4; delete n.q5; }
  if(k==='q6' && v!=='yes'){ delete n.q6b; }
  set(n);
};}
```

**6c — Relabel the output from a risk tier to a required action.** Per §8.1 of the review: the Screener **with Triage** is an action table, not a risk estimate. Change `tierLbl` from `Low risk / Moderate risk / High risk` to `Screen result → required action`, and make `b.txt` lead with the action. Keep the escalation language. **Do not** add a PPV/base-rate panel.

**6d — Add the two highest-yield administration lines** (author-supplied, verbatim):
> *"Ask these questions verbatim, in order. Do not improvise or paraphrase — paraphrase is the dominant source of C-SSRS unreliability."*
> *"A negative screen is not safety. Roughly half of people who die by suicide denied ideation at their last contact."*

**6e — Q6 example list.** `AUTHOR-GATED`. Q6 without its published examples under-detects aborted, interrupted and preparatory acts, because patients do not spontaneously classify *"I held the gun and put it back"* as *doing anything*. Scaffold a `q6examples` array with a `TODO(author)` marker; **do not populate it** — see §8.2 and the licensing question in WP-06f.

**6f — Licensing (blocking).** The C-SSRS is licensed through the Research Foundation for Mental Hygiene and this repo reproduces its items verbatim on two public Netlify sites. **The agent must not expand verbatim reproduction (6e) until the author confirms terms.** Log as `OPEN-DECISION-3` and surface it in the PR body.

**Acceptance criteria**
- [ ] Q1–Q5 display `Past month`; Q6 displays `Lifetime` with its 3-month sub-question.
- [ ] Setting Q2 to `no` after answering Q4 clears q3–q5 and the triage node updates.
- [ ] `tests/cssrs-branching.test.mjs` covers the reversal path and the frame labels.
- [ ] Output is action-framed, not tier-framed.
- [ ] Both administration lines present.
- [ ] `OPEN-DECISION-3` (licensing) recorded and flagged in the PR.

---

### WP-07 · Violence page: a self-declared non-instrument that issues a decision rule `AGENT`

**File:** `04_Acute_and_Safety/Violence_Risk/violence-risk-one-pager.html` (L137-139)

```js
count===0 ? 'No imminent signs checked — continue routine observation and reassess.'
          : (count+' sign(s) present → move to de-escalation now; ensure team awareness and your own exit.')
```
The block disclaims at L131 *"Not a scored instrument — a teaching prompt"* and then counts boxes and issues a directive. Checking zero boxes returns an affirmative safety statement.

**Replace with non-quantified text** and delete `count` from the output entirely:
> *"Any of these means tell the team now. This list is not summed and there is no threshold — an unchecked list is not a negative result."*

**Also (L123, low risk, do in the same PR):** literal markdown asterisks render on screen because the string is a plain JS text node — `**Fordham Risk Screening Tool (FRST)**` displays with asterisks. Convert to `e('strong', null, …)`.

**Also:** wrap the site-specific paragraph (*"At Maine Medical Center… completed in the Emergency Department at intake"*) in a `LOCAL_POLICY` token — the tool ships unmodified to the UNE MS3 site, where that workflow is not theirs. Follow the existing token pattern (`localPolicies` in the SP pack is the reference implementation; the gate reports unfilled tokens as INFO, never fails).

**Deferred, author decision:** the attested prose page (`violence_risk_inpatient_teaching.md:9,28`) sends students to a **Brøset (BVC)** tool that does not exist; the tool implements **FRST**. BVC is a shift-to-shift 24-hour instrument with a ≥2 threshold; FRST is a one-time ED-intake screen. Either build BVC (six present/absent items) or correct the markdown. Log as `OPEN-DECISION-4`.

**Acceptance criteria**
- [ ] No count-derived directive; no affirmative safety statement from an unchecked list.
- [ ] No literal `**` renders on screen.
- [ ] Site-specific workflow behind a `LOCAL_POLICY` token.
- [ ] Build gate passes for **both** `ms3` and `res`.

---

### WP-08 · SP: stop punishing correct technique, add the learner-safety path, keep the 403 `AGENT+REVIEW`

**Files (must change together — see Ground Rule 6):**
`sp-proxy/netlify/functions/sp.mjs` · `_prototypes/sp-interview/sp-interview.html` · `_prototypes/sp-interview/sp-interview.pack.json`

**8a — Delete the technique flag regexes.** The pack's flag patterns (`"you should(n'?t)?\\b"`, `"\\bat least\\b"`, `"\\bslow down[.!]"`) fire on textbook-correct technique:
- *"You shouldn't have to carry all of this by yourself."* → `judgmental`, rapport **−2**
- *"At least tell me how you have been sleeping."* → **−2**
- *"I hear you. Let's slow down. Walk me through your sleep."* → **−2**, and the patient snaps *"CALM down. Great. Revolutionary clinical technique."* — the exact warm redirect the mania case's own `debriefTeachingPoints` reward.

A −2 also arms `blockedByRecentFlags` for two turns, so correct technique **locks the SI gate**. There is no regex that scores empathy. **Delete the flag system**, not tune it. Keep `ooc_attempt` (jailbreak detection) — that is a different mechanism and is working.

**8b — Add the learner-distress path.** This is the only place in the library where a person can be hurt rather than mistaught. The tool is `riskLevel: high`, its only learner-reachable case is active SI, and there is no `988`, no crisis resource, and no out-of-scope detector anywhere in the flow.

Implement:
- A **client-side out-of-scope detector evaluated before send**, matching first-person distress (`\bI\b.*(want to die|kill myself|can'?t go on|hurt myself|end it)`). On match: **suspend the fiction**, render a non-dismissible panel, **log nothing**.
- The panel content is `AUTHOR-GATED` (§8.5) but must include: 988, Crisis Text Line, the local crisis number, student health with actual hours, and the on-call number.
- **Crisis resources in the encounter footer on every screen**, not only the debrief. Currently the only related content is the aftercare note at `sp-interview.html:1121`, which is well written and reaches only learners who finish.
- A **prebrief with a real opt-out** for any case whose `skillTags` include `suicide`. The opt-out must not be logged in a way that identifies who took it.
- A pack-level rule: **the SP never escalates SI content in response to learner hesitancy.**
- Detector fires **generously**. False positives cost nothing here.

**8c — Do not lift the 403.** `sp.mjs:31` `POST_PACK_STATUSES = new Set(['reviewed','attested'])` currently blocks every live POST because `pack.status` is `draft-pending-attestation`. **That accident is the only thing currently protecting learners from the assessment layer.** Do not change the pack status, `POST_PACK_STATUSES`, or `facultyReview` under any WP in this document. Add a comment at `sp.mjs:31` recording why.

**8d — Fix the `onlyFirstTime` bug while you are in `deriveState` (both files).** The engine hard-codes two exceptions and silently ignores `onlyFirstTime` on any other intent — Ray's `transparency` raise declares it and is not honoured, so repeating one identical sentence twice unlocks a gate. Parity currently passes because **both sides are wrong together**.
```js
// server sp.mjs:295-296 and client sp-interview.html:264-265 — replace the two hard-coded cases with:
if (r.onlyFirstTime) { if (s.usedRaises[r.intent]) continue; s.usedRaises[r.intent] = true; }
```
Initialise `usedRaises: {}` in both state constructors (`sp.mjs:288`, `sp-interview.html:234`) and add a pack-contract test asserting every declared `onlyFirstTime` is honoured.

**8e — Fix the interrogation-penalty equality bug (both files).** `if (runRule && s.closedRun === runRule.closedRun)` — strict equality on a monotonically increasing counter means the penalty fires exactly once, ever. Ten consecutive closed questions cost a total of −1.
```js
if (runRule && s.closedRun >= runRule.closedRun && s.closedRun % runRule.closedRun === 0)
```

**Acceptance criteria**
- [ ] The three punitive regexes are gone from the pack; `ooc_attempt` retained.
- [ ] New test asserts each of the three previously-penalised sentences now scores **no flag and no rapport loss**, and that the pack's own `debriefTeachingPoints` exemplar phrases score as raises.
- [ ] Out-of-scope detector fires client-side before send; encounter ends; nothing is logged.
- [ ] Crisis resources render on every encounter screen.
- [ ] Prebrief + unlogged opt-out present for `suicide`-tagged cases.
- [ ] `onlyFirstTime` honoured generically; new pack-contract test passes.
- [ ] Interrogation penalty repeats past threshold.
- [ ] **`parity.test.mjs` passes** — confirming client and server were changed together.
- [ ] `pack.status`, `POST_PACK_STATUSES` and all `facultyReview` blocks are **untouched** (`git diff` must show no change to them).
- [ ] Pack contains no dose literal (gate is HARD on `*.pack.json`).

**Verify:** `npm --prefix sp-proxy test && bash _prototypes/sp-interview/tests/run-all.sh`

**Sign-off required from:** Joshua Moss, MD **and** a second psychiatrist for the crisis-path copy.

---

## 6. Wave 2 — Score integrity

### WP-09 · Daily Review: press "1", score ~50% `AGENT`

**File:** `07_Evidence_and_Reading/Landmark_Trials/review.html`

Options render in source order (L~222, `c.o.map(... String.fromCharCode(65+i) ...)`), the correct answer sits at index 0 in **220/437** `quizzes.json` questions, and the keyboard handler (L150) makes `1` a single keystroke. The SRS then records those keystrokes as `Easy` and stretches the interval, and the Retention tile reports it as learning.

`shuffle()` already exists at **L122** and is used only for queue order.

**Fix:** shuffle each card's options **once per card instance**, not per render (re-shuffling on re-render would move the buttons under the user's cursor). Shuffle at queue-build time and store the display order on the session card object; map the chosen display index back to the source index before grading.

**Acceptance criteria**
- [ ] Option order varies across sessions for the same card.
- [ ] Order is stable within a single card presentation (no reshuffle on reveal).
- [ ] Grading, feedback attribution, and `cw_srs_v1` state all key off the **source** index.
- [ ] `tests/review-shuffle.test.mjs` asserts a large sample of shuffled orders does not put the key at index 0 more than chance.

---

### WP-10 · Shelf Mode ships permanently in preview with 5 items `AGENT`

**File:** `07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html`

`shelfPool()` (L154) accepts only decks whose id starts with `SHELF-`. **Zero such decks exist** — in source or in either deployed build. So L229-230 fires on every load and the tool serves 5 hardcoded `SAMPLE` items, under page copy advertising a *"timed, blueprint-weighted psychiatry COMAT/shelf vignette simulation."* The 15-row `BLUEPRINT` table (L111-127) and the whole `buildExam` allocator (L132-152) are dead code. Students calibrate study time to practice-test scores.

**Fix — gate it as a disabled state, not a startable exam:**
- When `shelfPool(data).length === 0`, render an explanatory disabled panel. Do **not** fall through to `SAMPLE`.
- Remove the 10/20/40-question length selector while disabled.
- Remove the "blueprint-weighted COMAT/shelf vignette simulation" claim from the page copy **and** from the `RC-META` description (L4).
- Correct `landmark_trials_page.md:3`, which claims *"Shelf Mode and Daily Review draw board-style questions from these papers"* — Shelf Mode draws nothing from `quizzes.json`.
- Leave `SAMPLE`, `BLUEPRINT` and `buildExam` in place with a comment pointing at the future wiring; do not delete working machinery.

**Acceptance criteria**
- [ ] No path renders a startable exam while `SHELF-*` decks are absent.
- [ ] No page copy or metadata claims blueprint-weighted shelf simulation.
- [ ] `tests/shelf-mode-disabled.test.mjs` asserts the disabled state when the pool is empty, and asserts the banned marketing strings are absent.
- [ ] `landmark_trials_page.md:3` corrected.

> **Follow-on (not this WP):** wire Shelf Mode to `question_bank.json`, which already carries `category`, `difficulty`, per-option traps and blueprint-joinable `pages`. Log as `OPEN-DECISION-5`.

---

### WP-11 · Case banks: the key is at a fixed position in 25/25 reasoning steps and 10/10 communication cases `AGENT`

**Files:** `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html` · `02_Clinical_Skills/Communication_Practice/communication-practice.html`

Measured: `reasoning_cases.json` keys option `[a]` in **13/13** steps; `reasoning_cases_resident.json` in **12/12**; `communication_cases.json` keys `"b"` in **10/10** *and* the key is the longest option in **10/10** (mean 175 vs 60 chars). Clicking the same button every time yields *"Strong reasoning"* on every step and a progress bar reading **4 of 4 cases completed**.

**Do NOT re-key the JSON in this WP.** Re-keying changes clinical content ordering and invites merge conflicts with the author's content work. **Shuffle at render instead** — it is a smaller diff, cannot alter content, and fixes both banks.

- `diagnostic-reasoning.html:135` (`stepHtml`) and `communication-practice.html:181` (`caseHtml`): shuffle `st.choices` / `c.choices` before mapping to buttons.
- Seed the shuffle **per (caseId, stepId) per session** so the order is stable while the learner is on the screen and across the feedback re-render, but varies between sessions. A tiny deterministic PRNG seeded on `caseId+stepId+sessionSalt` is preferable to `Math.random()` for this reason.
- All persistence (`cw_reason_v1`, `cw_comm_v1`) continues to key on `choice.id` — never on display position.

**Acceptance criteria**
- [ ] Option order varies between sessions and is stable within one.
- [ ] Selecting an answer and re-rendering with feedback does not reorder the options.
- [ ] Saved attempts still resolve to the correct `choice.id`.
- [ ] `tests/case-bank-shuffle.test.mjs` asserts non-degenerate ordering across seeds.
- [ ] No `.json` content file is modified in this PR.

---

### WP-12 · Formative labelling and honest attempt storage `AGENT`

**Files:** `communication-practice.html` · `diagnostic-reasoning.html`

Neither tool states it is formative (`grep -i "formative\|not graded\|summative"` → zero hits in both), yet both persist a per-learner score: `progressHtml` renders *"N best-next-line selections saved locally"* and `diagnostic-reasoning.html:130` renders *"N/M strong"*. `saveAttempt` (`communication-practice.html:148`) overwrites on every click, so a learner who clicks wrong then right stores only the best — **the number is farmable**, and a screenshot of that bar is one email away from being a grade.

**Fix:**
- Add a visible line to both tools: *"Formative practice only — not a grade. Do not submit these counts as evidence of performance."*
- Change `saveAttempt` to store the **first** response per (case, step) plus an attempt count, deriving "current" separately. Migrate existing `cw_comm_v1` / `cw_reason_v1` records forward without loss (treat an existing record as `first`).
- **Suppress per-domain reporting where n < 5.** `communication-practice.html:170` (`domainSummaryHtml`) renders a six-domain breakdown from a bank with Safety n=1, Psychosis n=1, Medication n=1. Replace with a count and *"too few items in this domain for a meaningful breakdown."*

**Acceptance criteria**
- [ ] Formative line visible without scrolling in both tools.
- [ ] First response is preserved; a wrong-then-right sequence does not display as "strong."
- [ ] Existing localStorage records migrate without data loss.
- [ ] Domain breakdown suppressed below n=5.
- [ ] Storage keys remain `cw_*`.

---

### WP-13 · Draft-badge bug and case-level attestation coherence `AGENT`

**13a — `06_Family_and_Relational/family-systems-practice.html:247`** hard-codes the draft badge with no `reviewed` branch:
```js
function reviewBadge(it){var rv=it.facultyReview||{};return '<span class="pill draft">'+esc((rv.status||'draft').replace(/-/g,' '))+' - faculty review needed</span>';}
```
After attestation all 8 scenarios will permanently display *"reviewed - faculty review needed."* Copy the correct implementation from `communication-practice.html:173` / `diagnostic-reasoning.html:131`, which both branch on `rv.status==='reviewed'`.

**13b — Two sources of truth disagree.** All 22 cases across the five banks carry `facultyReview: {status:'draft', reviewer:'', lastReviewed:''}` and render *"faculty review needed"* to learners, while `13_Faculty_Resources/reviewed.json` marks the containing tool pages `reviewed` by Joshua Moss, MD. The learner-facing signal says the content is unvetted.

**The agent does not resolve this.** Add a validator check to `validate_attestation_consistency.py` that **fails** when a tool page is marked `reviewed` in `reviewed.json` while any case it renders carries `facultyReview.status !== 'reviewed'`. Run it, capture the failure list, and put it in the PR body as the author's work queue. Log as `OPEN-DECISION-6`: attest at case level, or delete the per-case block and inherit page-level attestation — **do not ship both.**

**Acceptance criteria**
- [ ] Family-systems badge branches correctly on `reviewed`.
- [ ] New consistency check exists and currently **fails** with an enumerated list (this is expected and correct — it is documenting the gap).
- [ ] The check is added to CI **as a warning first**, promoted to hard-fail once the author resolves `OPEN-DECISION-6`.

---

### WP-14 · Diagnostic Reasoning: repeat practice is impossible `AGENT`

**File:** `02_Clinical_Skills/Clinical_Reasoning/diagnostic-reasoning.html`

`savedChoiceForStep()` (L~139) restores the prior selection **with its feedback panel already open** (`render()`: `if(!state.choice&&st)state.choice=savedChoiceForStep(c,st)`). The `restart` action (L~145 handler) resets `state.step` and `state.choice` but never clears the saved record, so the answers reappear. There is no `removeItem('cw_reason_v1')` anywhere in the file — contrast `communication-practice.html:149`, which has a full `resetHistory()`.

With n=4 cases, this is the difference between a deliberate-practice loop and a one-shot demo.

**Fix:**
- `restart` clears that case's saved steps from `state.attempts` and persists.
- Add a **Reset local history** control mirroring `communication-practice.html:149`, including the confirm dialog.
- Keep the saved record for the *progress* display, but never pre-open feedback on a re-entered step.

**Acceptance criteria**
- [ ] Re-entering a completed case presents unanswered steps with no feedback shown.
- [ ] "Restart case" clears that case only.
- [ ] "Reset local history" clears `cw_reason_v1` after confirmation.
- [ ] Progress display still reflects completion history.

---

## 7. Wave 3 — Prevent recurrence (the CI layer)

### WP-15 · New gate: positional and length cue detection `AGENT`

**New file:** `13_Faculty_Resources/_automation/validate_item_cues.py`
**Wire into:** `.github/workflows/ci.yml` (after "Validate — registry schemas") and, if cheap, `build_and_check.sh`.

Assertions, run across `question_bank.json`, `communication_cases.json`, `reasoning_cases.json`, `reasoning_cases_resident.json`, and (after WP-16) `quizzes.json`:

1. **Positional tell:** no bank may key the same positional index in more than **40%** of its items. *(Current: 100% in both reasoning banks, 100% in communication cases, 98% among the 49 qbank drafts, 50.3% in `quizzes.json`.)*
2. **Length cue:** the keyed option must not be the sole longest option in more than **35%** of items, and the mean (key length − mean distractor length) must not exceed **+20 chars**. *(Current: 85.4% bank-wide, 91.6% among attested, +65 chars.)*
3. **Minimum options:** ≥3 per item. *(`communication_cases.schema.json` currently permits `minItems: 2`.)*
4. **Exactly one keyed best** per item.
5. **Negative stems:** flag `EXCEPT` / `NOT` / `least likely` in stems. *(Currently 0 — this is a regression guard.)*
6. **Absolute-term distractors:** warn on `always` / `never` / `all` / `none` / `alone` / `by itself` in distractors.

**Rollout discipline — important:** ship the validator with a **baseline allowlist** capturing today's known-failing items so CI goes green on merge, then burn the allowlist down in WP-19 and the author's re-keying work. A gate that is red on arrival gets disabled. Print the allowlist size on every run so it cannot be quietly forgotten.

**Acceptance criteria**
- [ ] Validator runs clean against current content **with** the baseline allowlist.
- [ ] Validator fails when a synthetic 100%-position-keyed bank is injected in its self-test.
- [ ] Self-test file `13_Faculty_Resources/_automation/test_validate_item_cues.py` added and wired to CI (mirror the `test_validate_registry_schemas.py` pattern).
- [ ] Allowlist size printed and recorded in the status file as a burn-down number.

---

### WP-16 · `quizzes.json`: 437 assessment items outside the governance system `AGENT`

**Current state:** 79 decks / 437 questions / 1,748 options, **427 KB stored as a single line** (unreviewable in a diff), **no schema**, absent from `validate_registry_schemas.py` `PAIRS`, no attestation ledger, self-declared provenance *"NotebookLM Landmark Psychiatry quiz extraction (Codex)"*. Both consuming tools are marked `reviewed` in `reviewed.json`. Card ids are positional (`review.html:142`, `d.id+"#"+i`) so inserting or reordering one question silently reassigns every downstream card's SRS history.

**Tasks, in order:**
1. **Pretty-print** the file (stable key order, 1 item per line minimum). This is a whitespace-only commit — do it alone so the next diff is readable.
2. **Add stable per-question `id`s** (`<deckId>-q<NN>`, never renumbered or reused — mirror the rule already stated in `question_bank.schema.json`).
3. **Migrate `cw_srs_v1`** from positional `deck#index` keys to the new ids, with a one-time client-side migration in `review.html` keyed on a version marker. Losing a rotation's worth of SRS state is a real cost — write the migration, don't skip it.
4. **Write `quizzes.schema.json`** and add the pair to `validate_registry_schemas.py` `PAIRS`.
5. **Create `quizzes_attestation.json`** with an **empty** ledger and honest counts. Do not attest anything.

**Acceptance criteria**
- [ ] File is diffable; a one-question change produces a small diff.
- [ ] Every question has a stable unique id; a duplicate id fails validation.
- [ ] SRS migration preserves existing state for unchanged questions.
- [ ] `quizzes.json` validates against its schema in CI.
- [ ] Attestation ledger exists, is empty, and reports real counts.

---

### WP-17 · Wire the content-hash attestation that already exists `AGENT`

The repo already implements the fix and never runs it: `13_Faculty_Resources/_automation/anki/pcl_anki/qbank.py:30-137` defines `QB_HASH_FIELDS` and `qbank_item_sha256()` — canonical-JSON hashing over `{id, status, retired, stem, options, why, pearl, evidence, pages, link, tier2, category}` — with a passing test suite at `tests/anki/test_qbank_governance.py`. `grep -n anki .github/workflows/*.yml` returns **nothing**.

Meanwhile: the attestation record is `{status, at, by}` only, with nothing binding it to the text it approved; commit `e36809c` (four days after sign-off) materially rewrote attested item content (`qb_eth_005` stem, `qb_rel_006` option D, `qb_pha_011` pearl) with no re-attestation and a ledger that still reads clean.

**Tasks:**
1. Add the anki governance suite to the `build-test-validate` job.
2. Extend `qbank_attestation_*.json` records with `contentHash`.
3. New CI step: re-hash every attested item and **fail on drift**, naming the drifted ids.
4. Backfill hashes for the current 144 records — and **flag, do not silently accept**, any item whose content has changed since 2026-07-05. Those need re-attestation by the author.
5. Correct `question_bank.json:2`, which claims *"All 144 items attested by Dr. Moss 2026-07-05"* in a file containing **192** items with **46 unattested drafts served to students**. Replace with real counts. Log the ship-drafts-or-not question as `OPEN-DECISION-7`.
6. Point `qbank_validate.py`'s existing longest-answer / key-balance / negative-lead-in gates at the **live** `question_bank.json`, not only at the 24-item pilot batch. *(Note: CI currently runs `09_Exam_Prep/shelf_comat_bank/engine/test_qbank.py`, a data-quality gate for a pilot bank that ships to nobody.)*

**Acceptance criteria**
- [ ] Anki governance suite runs in CI.
- [ ] Attestation records carry `contentHash`; drift fails the build with named ids.
- [ ] Drifted-since-sign-off items enumerated in the PR body for author re-attestation.
- [ ] `_note` states true counts.
- [ ] No attestation status is changed by the agent.

---

### WP-18 · Trap-name consistency + three stale `why` fields `AGENT+REVIEW`

Three **attested** items ship explanations naming distractors that no longer exist — edit residue from the 2026-07-05 fix pass:

| Item | Defect |
|---|---|
| `qb_otherdx_002` (L7669) | `why` dispatches a `malingering` trap that was replaced with "purging disorder"; then asserts *"All three examination findings distinguish BN from BED"* and contradicts itself in the same sentence |
| `qb_rel_011` (L7432) | `why` names `Punitive documentation`; that trap was renamed to `Incident response first` |
| `qb_pha_009` (L3762) | `why` opens *"Selective citation, Partial citation: Selective citation, Partial citation in two forms."* — duplicated/garbled |

**Agent task:** add a deterministic check to `validate_item_cues.py` (or a sibling): **every trap name appearing in `why` must match a trap name present in that item's options.** This catches all three mechanically and prevents recurrence.

**Author task:** the corrected `why` text for all three. The agent must not rewrite a clinical explanation.

**Also flag for the author** (do not fix): 21 items carry a duplicate trap name across two of their own options (`qb_per_012`, `qb_psy_015`, `qb_otherdx_013` confirmed); 388 of 445 trap names are used exactly once (87% singleton rate — the taxonomy is not functioning as a taxonomy below item 144); and the 49 draft items use a trap vocabulary with **zero intersection** with the attested corpus's 320 names.

---

### WP-19a · The distractor-rationale leak `AGENT`

In **175 of 437** `quizzes.json` questions (**40.0%**), the "why this is wrong" rationale is concatenated into the distractor's own `o.t` instead of `o.fb` — so `review.html` and `shelf-mode.html` render it **inside the option button, before the student answers**. 393 distractors (22.5% of all options) are affected.

Example as rendered (deck `AR-44` Q0):
> *C. The long-term maintenance efficacy of divalproex versus lithium in bipolar I disorder. **While maintenance is a critical part of treatment, this specific trial focused on the acute phase of mania.***

Retrieval practice with the answer visible produces no testing effect.

**Fix — mechanical migration:** for every non-correct option, split `o.t` after the first sentence; move the remainder to `o.fb` (appending if `fb` already has content). Then add a validator assertion: **no non-correct option's `t` may contain more than one sentence or exceed N characters.**

**Guard rails:** this is a bulk content transformation. Run it as a script, commit the script alongside the result, and **spot-check 20 randomly sampled migrated options by hand** before opening the PR. Any option where the split is ambiguous goes into a `NEEDS-AUTHOR` list rather than being guessed at.

**Also note for the author** (do not fix): 660/1,748 options (37.8%) carry no per-option feedback at all, and only 49.7% of distractors have any rationale.

---

## 8. Wave 4 — Instrument rebuild

### WP-20 · CIWA-Ar and COWS as rating instruments `AGENT+REVIEW`

**Content source: `SPEC_Withdrawal_Instrument_Redesign_v1.md` §1 and §2, verbatim.** Every anchor, elicitation stem, exclusion and administration line is written out there. The agent's job is the data model and the UI; **the agent authors no strings.**

**Data model** — extend both `CIWA` and `COWS` arrays:
```js
{
  k: 'anx', b: 'Anxiety',
  tag: 'ASKED',                                  // or 'OBSERVED'
  ask: 'Do you feel nervous?',                   // verbatim elicitation, or the manoeuvre for OBSERVED
  vals: [ {v:0,a:'no anxiety, at ease'}, {v:1,a:'mildly anxious'},
          {v:4,a:'moderately anxious, or guarded, so anxiety is inferred'},
          {v:7,a:'equivalent to acute panic states as seen in severe delirium or acute schizophrenic reactions'} ],
  show: [0,4,7],                                 // rungs rendered by default
  exclude: 'Anxiety, not akathisia. If an inner restlessness is driving the movement, that is akathisia — do not score it here.'
}
```

**UI contract (the four-line pattern, `SPEC` §0.2):**
1. Item name + `OBSERVED`/`ASKED` tag.
2. Elicitation verbatim, **always on screen** — never behind a disclosure.
3. Three rungs by default (0, middle, top). Full ladder behind a `see all anchors` control. **The middle rung is never behind the tap.**
4. Exclusion inline where one exists.

**Exception (`SPEC` §1.2, items 6-8):** the three CIWA perceptual items show **all eight rungs** by default. The 3→4 step is the jump from a sensation to a hallucination and must not be collapsed.

**Also in this WP:**
- **Orientation restored to five levels** including serial additions at levels 0 and 1, plus the one-sentence explanation of why the item is 0–4 and why the maximum is 67.
- **Fix the gauge denominator** (L121-124, L169): the accessible name announces *"Score 12 of 30"* while the header says max 67. Announce the instrument's denominator; label the display track as truncated.
- **Administration panel** at the top of the CIWA tab (`SPEC` §1.1) — what the instrument is, what it cannot do, when it does not apply at all, who scores it and how often, hold parameters, and *"if you did not perform the elicitation, do not score the item — write 'not assessed.'"*
- **COWS "use it well" panel** (`SPEC` §2.3) — the CIWA tab has a validity pearl; this tab has none.

**Acceptance criteria**
- [ ] Every item on both scales carries a tag, an elicitation, ≥3 anchors and (where published) an exclusion.
- [ ] Default view shows 3 rungs; perceptual items show 8; full ladder reachable in one tap.
- [ ] CIWA total maxes at 67; COWS at 48; announced denominators match.
- [ ] Orientation shows five levels with serial additions.
- [ ] No string in the tool was authored by the agent — every clinical string traces to a `SPEC` line. **Provide the mapping in the PR body.**
- [ ] Contrast check passes (`node tests/contrast-check.mjs`) — this is a dense-text redesign.
- [ ] Mobile viewport check: the four lines fit without horizontal scroll at 390 px.
- [ ] `tests/withdrawal-instrument-contract.test.mjs` asserts every item has `tag`, `ask`, `vals`, `show`, and that `show` values exist in `vals`.

**Sign-off required from:** Joshua Moss, MD, against `SPEC` §0.3 — **a second person verifies every anchor character-by-character against the primary instrument before merge.**

---

### WP-21 · Serial trending `AGENT`

Three assets promise that trend matters; zero instruments can hold two data points (`grep -c localStorage` across the five instrument tools = 0 except `cw_theme`).

**Spec (from `SPEC` §4):**
```
Keys:      cw_ciwa_series_v1 · cw_cows_series_v1 · cw_bfcrs_series_v1   (rp_* on the resident build)
Entry:     { t:<ISO timestamp>, total:<int>, items:{k:v}, note:<optional> }
Never:     any identifier, initials, MRN, room, DOB, or free text describing a real patient
Retention: 7 days, learner-clearable, with a visible "Clear series" control
```
**Display:** sparkline of the last 8 scores · **Δ per hour** between the last two entries · a one-line read (*"Rising 4 points in 2 hours"* / *"Plateau"* / *"Falling — what does a falling score oblige you to do?"*).

**Required banner:** *"Practice tool. Enter observations from a case or a simulated patient only. Never enter data from a real patient."*

**Acceptance criteria**
- [ ] All keys `cw_*` / `rp_*`; QA gate passes.
- [ ] Series survives reload, clears on demand, expires at 7 days.
- [ ] No free-text field capable of holding a patient identifier.
- [ ] No-PHI banner visible before the first entry can be made.
- [ ] Δ/hour computed correctly across a spanning-midnight fixture.

---

### WP-22 · BFCRS pre/post Δ% and the examination procedure `AGENT+REVIEW` / `AUTHOR-GATED`

**Agent portion:** pre/post BFCRS score fields with automatic Δ%, and the response criterion displayed on screen — *a ≥50% reduction in BFCRS is the conventional positive response.* You already compute and display the total and caption it *"track it to follow response"*; this writes the fraction.

**Author-gated portion:** the **How to examine** content under each manoeuvre item. The agent scaffolds a collapsible `howTo` field per item with `TODO(author)` and **must not write the manoeuvres**. The instruction is what makes the sign pathological, and getting it wrong produces a confident meaningless number. Items needing content: Mitgehen, Gegenhalten, ambitendency, automatic obedience, grasp reflex, waxy flexibility, rigidity (**including the published exclusion: "do not consider if cogwheeling or tremor present"** — its absence means parkinsonism gets scored as catatonic rigidity). Also needed: the **observation window** statement (BFCRS rates behaviour observed *during* the examination, with Withdrawal and Autonomic abnormality permitted to draw on 24 h of chart/nursing data).

---

### WP-23 · PAWSS pre-screen card `AUTHOR-GATED`

`PAWSS` currently appears in exactly one clause repo-wide, misdescribed as a monitoring alternative. It is a **10-point admission-time prediction** instrument identifying who will develop **complicated** withdrawal, threshold **≥4** — the single highest-value skill in inpatient alcohol withdrawal, and absent.

**Agent:** build the card shell, wire it into the CIWA tab, register in `site_manifest.json` and nav if it becomes its own page.
**Author:** the ten items verbatim, the threshold statement, and *"what it changes"* — per `SPEC` §3, with reproduction terms confirmed first.

---

## 9. Wave 5 — Clinical content (`AUTHOR-GATED` unless noted)

The agent's role in this wave is **scaffolding and verification only**: create the section headings, the cross-links, the `site_manifest.json` and nav registrations, the `topic_meta.json` entries, and a `TODO(author)` marker for each block. Then stop. A build that fails the orphaned-source check because a page was scaffolded but not registered is the agent's bug; a page with invented clinical content is a much worse one.

| WP | Content needed | Where |
|---|---|---|
| **WP-24** | *Catatonia overlap* block (retarded catatonia mimicking negative symptoms; BFCRS screen; **hold antipsychotics**; lorazepam challenge) + the four-part **EPS taxonomy** including **acute dystonia** with recognition, timing, risk factors and the reflex response | `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` · `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` |
| **WP-25** | Two-branch buprenorphine initiation (`SPEC` §2.4) + rewritten `qb_sud_005` option C + re-keyed `qb_sud_014` (scheduled + PRN) + qualified `qb_sud_004` | `03_Core_Topics/SUD_Withdrawal/…` · `question_bank.json` |
| **WP-26** | See below — **partly agent-executable** | multiple |
| **WP-27** | Dose-policy paragraph, placed on every dose-free MS3 page | `CLAUDE.md` + all MS3 teaching pages |
| **WP-29** | Six consult pages: consult recommendation writing · delirium ownership + a real delirium instrument (CAM/4AT + RASS) · medical-floor restraint/sitter/environment · medication reconciliation and discontinuation hazards · AMA / medical clearance / refused recommendation · the liaison half | new `NN_Category/` content |

### WP-26 · Citation and landmark-trial corrections `AGENT+REVIEW`

The agent **may** correct these because each is a verifiable factual mismatch against a named source, not a clinical judgment. Each correction must cite the primary source in the PR body.

| Location | Defect | Action |
|---|---|---|
| `anxiety_trauma_ocd_inpatient_teaching.md:15,31` | Cites Lima Cochrane 2004 as establishing propranolol *"strongest evidence"* first-line for akathisia. The review concludes: *"There are insufficient data to recommend beta-blocking drugs for akathisia. These drugs are experimental for this problem."* (3 trials, n=51) | Keep the clinical hierarchy (defensible practice); re-attribute and state plainly that beta-blocker evidence is weak and dose reduction/switch is best supported. **Author writes the replacement sentence.** |
| `eating_disorders_inpatient_teaching.md:18` | *"olanzapine may modestly help weight and obsessionality in AN."* Attia 2019 AJP found a small BMI benefit and **no** YBOCS difference | Agent may correct to match the trial; author reviews |
| `substance_use_inpatient_teaching.md:15` | *"(Saitz, N Engl J Med 1998)"* — Saitz's only 1998 NEJM item is a 2-page correspondence piece and cannot support the claim. The real referent (Saitz, JAMA 1994) is cited correctly elsewhere in the same repo | Re-cite |
| `quizzes.json` `AR-27` Q2 | Keys *"depressive relapses"* for BALANCE with HR 0.63 — BALANCE's outcome was time-to-new-intervention for any emotional episode; lithium's effect is larger against **manic** relapse | Re-key |
| `quizzes.json` `AR-27` Q4 | Attributes the 4-vs-20-month abrupt-discontinuation figures to BALANCE (that is the Faedda/Baldessarini discontinuation literature) | Convert to a general discontinuation item with correct attribution |
| `quizzes.json` `AR-26` Q4 | Compares Miklowitz 2007's 64% one-year recovery to Sachs 2007's 23.5% eight-week durable recovery as *"significantly higher"* — different trials, populations, outcomes; no such test | Rewrite without the cross-trial comparison |
| `quizzes.json` `AR-44` Q3 | 20 mg/kg/day oral loading presented as a Bowden 1994 recommendation | Re-attribute |
| `question_bank.json` `qb_cog_007` | Attested, difficulty 1, and **clinically inverted**: makes urinary incontinence preceding cognition the NPH discriminator in three places. Gait disturbance is characteristically first; incontinence typically last. The source page makes no ordering claim | **Author rewrites**; agent flags |
| `landmark_trials_page.md` L80, 164, 204, 208, 221, 90 | Six label/DOI mismatches (Stanley 2012→2018 DOI; Bridge 2007→Hammad 2006; Gabbard 1995→1993; Norcross 2011→Flückiger 2018; Foa 2005→2002; Moncrieff 2022 mislabelled) | Agent re-resolves all 50 DOIs against PubMed/Crossref; extends `13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py` (already in CI) to this page |

### WP-28 · Evidence registry wiring `AGENT`

`evidence_registry.json` is structurally excellent and ~90% decorative: **7 of 71** `topic_meta.json` entries carry `evidenceIds`; **26 of 36** registry sources are referenced by nothing — including `lieberman-2005-catie`, `rush-2006-stard`, `linehan-1991-dbt`, `canmat-isbd-bipolar-2018`, every one of which is **quoted by name in the prose** of a page in this repo.

**Task:** wire the ten already-registered sources that the prose already names to their `topic_meta` entries. This is mechanical (match the prose citation to the registry id) and requires no new research. Report the remaining 16 orphans to the author.

---

## 10. Wave 6 — SP assessment rebuild

**Order matters and partial states are worse than the current state.** Do not re-enable scoring until WP-30, WP-31, WP-32 and WP-33 are all done. Keep the 403 (Ground Rule in WP-08c) throughout.

### WP-30 · Coverage moves to patient-side emission `AGENT+REVIEW`

**Files:** `sp.mjs` `computeCoverage` (L338-351) and the mirror in `sp-interview.html` (L368-383, L406).

**Current:**
```js
const got = c.intents.filter(i => s.covered[i]).length;
if (got === c.intents.length) status = 'observed';
```
Coverage credits the item when the **student's intent regex fired**, not when the **patient disclosed**. Executed: a one-turn encounter with *"Have you had thoughts of killing yourself?"* → the patient deflects, the `si_active` gate stays **LOCKED**, and the debrief renders `c_si: observed` plus the narrative strength *"You asked about suicide in plain language. That is exactly why she told you the truth."* She said nothing.

**Fix:**
- Add an optional `observedRequiresGate` field to the checklist schema (pack-driven, not hard-coded).
- `observed` **iff** the gate is unlocked. `partial` if the intent fired but the gate stayed locked. `missed` otherwise.
- Gate the narrative strength at `sp-interview.html:406` on `s.unlocked['si_active']`, not on `s.covered['si_direct']`.
- **Require a minimum viable utterance** before an intent can register coverage: interrogative or ≥6 words. This alone kills the noun-string exploit (15 turns of *"mood sleep appetite energy concentration guilt"*, *"plan"*, *"voices"* currently unlock every gate and score 8/8 observed with praise).

**Acceptance criteria**
- [ ] Deflected-SI scenario yields `c_si: partial` and **no** "she told you the truth" strength.
- [ ] Noun-string scenario yields `data ≠ observed`. Add it as a named adversarial scenario in `smoke.test.js`.
- [ ] `parity.test.mjs` passes (both files changed together).
- [ ] Checklist behaviour is pack-driven; no case-specific logic in the engine.

### WP-31 · Gates → authored preconditions `AUTHOR-GATED`

The correct model of disclosure is already written in the pack — as **prose**, in `hiddenAgenda` (shame, fear of commitment, fear of losing custody/job/guns, prior bad experience with the system) — and it never reaches the state machine, which knows only an integer 0–4. `si_active` requires `rapport ≥ 1`; rapport increments per regex "reflection" hit with no first-time rule; Marcus's mixed-SI gate requires rapport **0** and unlocks cold on turn one.

**Agent:** extend the pack schema to support structural preconditions — e.g. `requiresCovered: [...]`, `requiresTurnsSince: N`, `blockedByUntil: ['confidentiality_addressed']` — and implement them in `deriveState` **in both files**. Write the contract tests.

**Author:** the preconditions themselves, per case. *"She will not talk about the firearm until you have acknowledged the divorce and she has not been interrupted for three turns; she shuts down for two turns if you ask about means before she has told you she has been thinking about dying."* These are hand-authored, deterministic, testable — **and the preconditions are the lesson.**

**Also author-gated:** completing the coverage checklists. Dana has **no prior-attempt item and no lethal-means/firearm item** while citing VA/DoD 2024 as her evidence base. Ray — command hallucination naming an identifiable upstairs target — has no access-to-means and no prior-attempt item. Marcus — manic, found with a shovel at 4 a.m. — has no organic screen and no violence screen. *A learner can currently score full coverage on a suicide interview without ever asking about a gun.*

### WP-32 · Evaluator accountability `AGENT`

**File:** `sp.mjs` `validateFeedback` (L667-716)

Two defects:
- *"EVERY claim must quote a numbered turn verbatim"* is **prompt text with zero enforcement**. The validator checks key shape, link membership, rating enum, and character bounds. It never checks that a quoted string appears in the transcript, never screens for dose literals, never checks for management advice.
- `if (value.strengths.length !== 2) throw providerFailed()` — the schema **requires exactly two strengths**. A learner who did nothing well cannot receive fewer. The deterministic fallback (`sp-interview.html:417`) pads with the same sentence twice.

**Fix:**
- Post-validate every `"…"`-delimited span in `strengths`, `growth` and `domains[*].note` against a normalized concatenation of `turn.me`. Non-matching claims are **dropped**, not softened. Retry once, then fall back to *"Evaluation unavailable — review your transcript with your supervisor."*
- **Strengths minimum: 0**, maximum 2. Remove the padding loop.
- Run the CI `DOSE` regex over evaluator output and over `actorReply` (L657-661, which is currently `text.trim()` plus a length check — in Live mode nothing stops the model emitting a dose, a diagnosis, or advice). On hit, substitute the case's `_default` guarded line and emit a content-free `{event:'actor_content_blocked'}`.
- Add explicit anti-sycophancy language to the evaluator prompt template *(author-supplied)*: *"If the transcript does not support a second strength, return one. Do not manufacture praise. Do not soften a missed safety screen."*

**Acceptance criteria**
- [ ] An evaluation containing an invented quote is rejected or has that claim dropped; test with a fixture.
- [ ] Zero-strength feedback validates.
- [ ] No praise fallback path exists.
- [ ] Dose regex applied to model output, with a test.

### WP-33 · Adversarial suite and the "fails correctly" test `AGENT`

The reviewer found four criticals by trying four obvious things. That entire class should be caught by CI, not by an auditor.

**Add to `_prototypes/sp-interview/tests/`, each with an expected system behaviour:**
minimal input · noun strings · hostile input · off-topic input · the student who types the answer into the question · the student who says nothing · the student who is rude · the student who discloses their own distress (asserts the WP-08b interrupt fires) · a jailbreak attempt (asserts `ooc_attempt` and no gate leak).

**And the single most important test:** *"fails correctly."* Take a deliberately bad encounter and assert the debrief is bad — low ratings, no manufactured strengths, the critical-miss banner present. **If the system cannot produce a poor evaluation, it cannot produce a good one.**

Also materialize the **golden transcript** as a versioned fixture with expected substrings. Today it exists only as scenario 1 of `smoke.test.js:37-56` and exercises the **MockProvider** — so it can never detect live actor drift, which is the exact risk it was created to control.

---

## 11. Consolidated new CI gates

| Gate | WP | Fails on |
|---|---|---|
| Positional/length cue detection | WP-15 | key at fixed index >40%; key sole-longest >35%; mean length delta >+20 chars; <3 options; not exactly one key |
| Trap-name consistency | WP-18 | a trap named in `why` that is absent from that item's options |
| `quizzes.json` schema | WP-16 | missing/duplicate stable id; schema violation |
| Distractor-rationale leak | WP-19a | a non-correct option's `t` containing a second sentence |
| Attestation content hash | WP-17 | attested item text drifted since sign-off |
| Case/tool attestation coherence | WP-13 | a `reviewed` tool rendering `draft` cases (warn → hard once resolved) |
| Anki governance suite | WP-17 | existing suite, currently not wired |
| Instrument legal values | WP-02, WP-20 | any rendered integer absent from an item's `vals[]` |
| Instrument item contract | WP-20 | any item missing `tag`, `ask`, `vals`, or with `show` values not in `vals` |
| SP adversarial suite | WP-33 | any adversarial scenario producing a passing debrief |
| DOI/citation integrity | WP-26 | extend the existing `run_citation_check.py` to `landmark_trials_page.md` |

---

## 12. Author-gated content queue

Everything the agent must **not** write. Suggested order — the first three are the highest clinical yield per word.

1. **Catatonia block + EPS taxonomy including acute dystonia** (WP-24). *~600 words, one sitting, same two pages. Highest yield in this list.*
2. **Two-branch buprenorphine initiation** + the three qbank re-keys (WP-25).
3. **Crisis-path and prebrief copy for the SP** (WP-08b) — needs a second reviewer and named humans, one of whom is **not** the clerkship director.
4. **CIWA/COWS anchor verification** against primary sources (WP-20, `SPEC` §0.3) — the agent copies from `SPEC`; a human confirms `SPEC` against the instrument.
5. **BFCRS examination procedures** with counter-instructions + the rigidity/cogwheeling exclusion + the observation window (WP-22).
6. **PAWSS items and threshold** (WP-23), reproduction terms confirmed.
7. **C-SSRS Q6 example list** (WP-06e) — **blocked on the licensing question**.
8. **The three corrected `why` fields** + the `qb_cog_007` NPH rewrite (WP-18, WP-26).
9. **Dose-policy paragraph** (WP-27):
   > *MS3 pages carry no initiation or titration doses. Thresholds, therapeutic ranges, monitoring intervals, regulatory limits and response criteria are always teachable and always taught. Resident pages carry doses under an institutional-protocol banner. By design, this page stays dose-free; the numbers live on the resident reference.*
10. **SP disclosure preconditions** per case + the missing checklist items (WP-31).
11. **The six consult pages** (WP-29) — start with consult recommendation writing.
12. **Tier 1 content block** (review §3): bipolar depression pharmacotherapy · lamotrigine · LAIs · TD/VMAT2 · xylazine and contemporary supply · AUD pharmacotherapy beyond nine words · antidepressants other than SSRIs · "how to think about dose" · tobacco/NRT · geriatric agents · reproductive pharmacology · prazosin/OCD dose-duration/clomipramine · clozapine bowel regimen + BEN/Duffy + suicidality indication · a Stanley–Brown safety-plan builder with lethal-means counselling · involuntary status and AMA in the case banks.

---

## 13. Open decisions log (agent maintains, author resolves)

| id | Decision | Raised in |
|---|---|---|
| OPEN-DECISION-1 | Delete `verdict()` and convert the capacity module to a structured report? | WP-01 |
| OPEN-DECISION-2 | Attest `decision-aids.html` or suppress the attested→unattested outbound link? | WP-04 |
| OPEN-DECISION-3 | C-SSRS licensing for verbatim reproduction on two public sites | WP-06 |
| OPEN-DECISION-4 | Build the BVC, or correct the markdown that points to a nonexistent Brøset tool? | WP-07 |
| OPEN-DECISION-5 | Wire Shelf Mode to `question_bank.json`, or generate `SHELF-*` decks? | WP-10 |
| OPEN-DECISION-6 | Case-level attestation, or inherit page-level? (Do not ship both.) | WP-13 |
| OPEN-DECISION-7 | Do unattested drafts ship? (46 of 189 served items) | WP-17 |
| OPEN-DECISION-8 | Move the communication bank to two-tier? The length cue is a structural consequence of forcing single-best-answer onto judgment-call content | review §8.4 |
| OPEN-DECISION-9 | Is the SP going live this academic year? Determines whether WP-08b is Tier 0 | review §5.2 |

---

## 14. Anti-goals

Do **not**:
- Write clinical content, anchors, thresholds, drug information, or answer keys.
- Set any `facultyReview.status`, write to `reviewed.json`, or add an attestation line.
- Change `pack.status` or `POST_PACK_STATUSES`, or otherwise open the SP live path.
- Re-key `.json` case banks in WP-11 — shuffle at render instead.
- "Simplify" `cl_reference.md` or `adv_psychopharmacology.md`. Both reviewers named them the best clinical reference pages in the repo.
- Sand off the **named-trap taxonomy** during a psychometric cleanup. If parallel option lengths cost the traps, stop the cleanup. *(Preserve: "Comfort-first induction," "It's just withdrawal," "Agitation = antipsychotic," "Quiet patient = stable patient," "Refusal = no capacity.")*
- Remove the **confidence-before-answer** flow, the *"confidently wrong"* count, the two-tier `shaky` cap, or the shrinkage-corrected mastery estimate.
- Touch the **FRST predictive-limits paragraph**, the **toxidrome discriminator**, the **BPD page**, the **refeeding "anticipate and monitor, not prescribe"** line, or the **OMM evidence-honesty** paragraph.
- Build psychometrics infrastructure that ~30 students/year cannot power (item p-values, point-biserial discrimination). Build structural checks that need no students.
- Add a PPV/base-rate caveat panel to the C-SSRS. Relabel the output as an action instead.
- Reproduce full published anchor ladders on every item. Three rungs plus elicitation plus exclusion — a technically complete card nobody reads is the same failure as no card, only more expensive.
- Batch a Wave-1 safety fix with unrelated changes.
- Run the Playwright smoke suite from repo root, or regenerate visual baselines on macOS.

---

## 15. Kickoff prompt for Claude Code

```
Read IMPLEMENTATION_HANDOFF_2026-08-20.md in this repo, in full, before doing anything.
Then read CLAUDE.md, and §1 (Ground rules) and §14 (Anti-goals) of the handoff again.

Confirm back to me, in one message:
  1. The three things you must never do (§1.1, §1.2, §14).
  2. Which two files contain duplicated SP state logic and why that matters.
  3. The exact scope of the dose-literal gate — where it is HARD, where SOFT, and why
     "CIWA ≥15" is safe to add but "1–2 mg" is not.

Then execute WP-00 and stop for my confirmation before starting Wave 1.

For each subsequent work package:
  - work on its own branch
  - run the full local verification from §2 before opening a PR
  - paste the acceptance-criteria checklist into the PR body with boxes ticked
  - for AGENT+REVIEW packages, open the PR and STOP — do not merge
  - update docs/superpowers/plans/2026-08-20-review-remediation-STATUS.md in the same commit

If a work package requires a clinical string that is not written verbatim in the handoff or in
SPEC_Withdrawal_Instrument_Redesign_v1.md, stop and ask. Do not generate it.
```
