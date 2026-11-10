# Scale chooser — "Which scale, and what does the number license?"

**Date:** 2026-10-31 · **Verified at:** `main` @ `61530b1` · **Status:** plan for the author (Joshua Moss, MD). Nothing here changes a rights disposition, a page or a registry. Every build step below is a separate draft PR, and §8 lists the decisions only the author can make.

**Standing rules this plan lives under:** the library teaches administration and never reproduces a copyrighted instrument (CLAUDE.md invariant 8); no dose literals, no PHI, no free-text field (invariant 7); storage keys are literal `cw_*` (invariant 13); policy and content never share a commit (invariant 1).

**Builds on:** the scales audit (`docs/superpowers/plans/2026-10-21-scales-and-cognitive-screening-audit.md`), the COWS series PR (#1115), and the second-wave enhancements A (screeners measurement-based-care card) and B (decision-aids "Delirium screen first" view).

---

## 0. Summary

**The gap.** The library teaches scales one page at a time. A learner who already knows *which* instrument to use can find it; a learner standing in front of a confused, withdrawing or agitated patient cannot. Selection — "why that scale, and what will its number let me do?" — is the question attendings actually ask on rounds, and nothing in the library teaches it.

**The proposal.** A fixed-choice chooser that starts from the clinical question, not the instrument. The learner picks what they need to do ("screen for delirium", "trend a depression response", "check opioid withdrawal before an induction"). The chooser answers with the instrument teams use today, where to practise it here or the official form when it cannot be practised here, its rights standing in plain words, what the number licenses, what it does not, and the confounds. It scores nothing.

**Why it is safe to build.** Every row is data, and one test checks the data against the registries the library already gates on: `instrument_rights.json` (a retired or restricted instrument can never be shown as practised here), `shipped_pages.json` (every "practise here" link resolves to a page that ships), and `evidence_annotations.json` (every number with a paper behind it carries that paper's own words). A gap — an instrument teams use that the library does not yet teach — becomes a visible row with an official route, instead of an absence nobody notices.

**Recommended path.** Phase 1 ships a standalone single-file tool (`scale-chooser.html`) through the ordinary new-tool recipe, with its data inline between sentinels. The Front Door entry and a shared registry come later (Phase 4), once the rows have settled under real use. Phase 1 needs no policy PR.

---

## 1. Why this is the right next teaching move

| Observation | Source | What it means for the chooser |
|---|---|---|
| The audit inventoried eleven scale surfaces across four rights standings: provisional, retired, restricted, and unregistered in-house lists | `instrument_rights.json`; audit §1 | Learners cannot tell from a page why COWS scores but CIWA-Ar links out. The chooser states the standing once, in words. |
| The curriculum names instruments it never operationalises: AIMS (6 files), MDQ (6), EPDS (4), AUDIT-C/CAGE, PCL-5 | audit §1 | Each becomes a row with an official route and a "not yet practised here" badge, so the gap is honest and countable. |
| The MSE pearl "delirium screen first, MoCA only after" had nothing behind it to practise until enhancement B | `mse.html`; B | The chooser makes ordering rules like this one first-class: some intents say "not yet — do this first". |
| Measurement-based care needs two scores, not one | enhancement A | "Trend a response" is a different intent from "screen", with a different instrument use and a different licensed claim. |
| The Care navigator already routes fixed intents to resources from data | `curriculum.json` `careNavigator` / `careResources`; `frontdoor/fd_care_navigator.js` | The pattern exists and is tested. The chooser follows it rather than inventing a new one. |

---

## 2. What the learner sees

**Entry points (Phase 1–2).** A Library tool card ("Which scale?") in the Clinical Skills group; search aliases ("which scale", "screening tool", every instrument name in the rows); a one-line back-link on each scale surface ("Not the right scale? Open the chooser →").

**Step 1 — "What do you need to do?"** Intents grouped by the clinical moment, as pressable chips (no text field):

- **Admission:** screen depression · screen anxiety · screen for delirium · cognition once delirium is excluded · screen substance use · baseline movement exam before an antipsychotic.
- **Every day:** check opioid withdrawal · check alcohol withdrawal · trend a depression response · gauge agitation.
- **Safety:** item 9 is positive · structured violence risk · suspected catatonia.
- **Not a scale:** decisional capacity — the chooser says so and routes to the four-abilities workbench, because "not every question is answered by a number" is itself the lesson.

**Step 2 — the answer card,** in the decision-aids grammar (red rule-out, teal first move):

1. **Use:** the instrument(s) teams use today, by name.
2. **Where:** "Practise it here →" (a shipped page), or "Get the official form →" (the custodian route), or both.
3. **Standing:** one plain line — *practised here* · *taught here, scored from the official form* · *link only — the library does not reproduce it* · *not yet in the library*.
4. **What the number licenses** and **what it does not** — two short lists, the heart of the card.
5. **Confounds** — what makes the number lie (sedation, aphasia, language, baseline pain, a clock set by the last dose).
6. **Evidence** — one line with a PMID where an annotation licenses it; nothing where none does.

**Step 3 — "Quiz me" (Phase 3).** A one-line vignette; the learner picks the intent and the instrument; the feedback names what their choice would and would not have licensed. Transient by default, like the decision trees' cover-and-recall.

**What it never does.** Score, sum, threshold, store a patient detail, or show an item stem or anchor.

---

## 3. The data — one row per intent

Phase 1 keeps the rows inline in the tool between `/* SCALE_CHOOSER_DATA_BEGIN */` sentinels, so the test can execute them exactly as the COWS and screeners tests do. Phase 4 lifts the same rows into `scale_chooser.json`.

```js
{
  id: 'delirium-screen',                 // kebab-case, unique
  moment: 'admission',                   // admission | daily | safety | not-a-scale
  intent: 'Screen for delirium',
  instruments: [{
    name: '4AT',
    rightsId: null,                      // an instrument_rights.json id when one exists
    standing: 'taught-here',             // practised-here | taught-here | route-only | not-yet
    surface: 'decision-aids.html',       // must resolve in shipped_pages.json, or null
    officialUrl: 'https://www.the4at.com/'  // must equal officialSource.formUrl when rightsId is set
  }],
  first: 'Look at arousal and attention, and get the baseline, before any cognitive test.',
  licenses: ['A positive screen starts a medical workup for the cause.'],
  doesNotLicense: ['A negative screen once does not rule delirium out; it fluctuates.'],
  confounds: ['Sedation', 'Aphasia or language barrier', 'Severe hearing or visual impairment'],
  evidence: [],                          // [{sourceId, claimId}] — each must resolve and list the tool in usedBy
  related: ['delirium.md', 'mse.html']
}
```

**Invariants the Phase 1 test enforces** (`tests/scale-chooser.test.mjs`, reading the registries, never live governance state):

1. Every `surface` and `related` slug resolves in `13_Faculty_Resources/_automation/site_build/shipped_pages.json`.
2. Every `rightsId` exists in `instrument_rights.json`; a `retired` or `restricted` instrument is never `practised-here`; `provisional` maps to `practised-here` only for the instruments the registry already lists as reproduced.
3. When `rightsId` is set, `officialUrl` equals that row's `officialSource.formUrl`, so the chooser can never route somewhere the rights gate does not.
4. Every `evidence` pair resolves to an annotation claim whose `usedBy` includes `scale-chooser.html`, and the tool's `tool_registry.json` row lists each `sourceId`.
5. A digit next to "≥", "≤", "score", "points" or "cut-off" in `licenses`/`doesNotLicense` requires an `evidence` entry on that row — no unlicensed thresholds.
6. No dose literal (the §5 regex), no storage call, no `<input>`/`<textarea>`/`contentEditable`, no crisis number.
7. Coverage: every instrument in `instrument_rights.json` appears in at least one row, so a newly registered instrument cannot be left out of the chooser silently.

---

## 4. The v1 inventory — fourteen intents

| Intent | Instrument(s) | Where | Standing | Licensed claim today |
|---|---|---|---|---|
| Screen depression | PHQ-9 | `screeners.html` | practised here (provisional) | `kroenke-2001-phq9` — bands, ≥10 sensitivity/specificity |
| Trend a depression response | PHQ-9, twice | `screeners.html` change card (A) | practised here | `lowe-2004-phq9-monitoring` — 5-point individual change |
| Screen anxiety | GAD-7 | `screeners.html` | practised here (provisional) | `kroenke-2010-phq-gad-review` — cut-point 10; change sensitivity emerging |
| Item 9 is positive | C-SSRS | `cssrs.html` → Columbia | route only (retired here) | none needed; `pg_suicide.md` carries the teaching |
| Screen for delirium | 4AT; CAM family | `decision-aids.html` screen view (B) | taught here, scored from the official form | none yet — `nice-delirium-cg103` has no annotation |
| Cognition once delirium is excluded | MoCA | `mse.html` pearl → official site | route only | none yet — `nasreddine-2005-moca` has no annotation |
| Check opioid withdrawal | COWS | `withdrawal.html` | practised here (in-house descriptors) | `asam-hpso-bup-2023` — COWS ≥ 8 with one objective sign (#1115) |
| Check alcohol withdrawal | CIWA-Ar | `withdrawal.html` → CSAM | route only (retired here) | none — `asam-alcohol-withdrawal-2020` unannotated |
| Suspected catatonia | BFCRS | `bfcrs.html` → URMC | link only (restricted) | `bap-catatonia-2023` |
| Structured violence risk | FRST (in-house list); BVC, DASA named | `violence.html` | taught here | none; FRST citation lacks an identifier |
| Baseline movement exam | AIMS | `med_monitoring.md` | not yet in the library | none — candidate source in audit §9 |
| Screen substance use | AUDIT-C; single-question screens | — | not yet in the library | none |
| Gauge agitation | RASS; BARS | `decision-aids.html` ladder | not yet in the library | none |
| Decisional capacity | not a scale — four abilities | `capacity.html` | taught here | none needed |

Five rows carry a licensed claim on day one; the rest teach selection and routing without a number, which the invariants allow. Each later annotation or gap closure flips a row, and the test counts them.

---

## 5. Architecture — tool first, Front Door second

| Option | What it costs | What it buys | Verdict |
|---|---|---|---|
| **A. Front Door module** (`fd_scale_chooser.js`, data in `curriculum.json` like `careNavigator`) | The heaviest contract surface: `CLASS-INVENTORY.md`, `fd-*.test.mjs`, `front-door.spec.js`, both sites' shells | Lives on the landing surface | Phase 4, once the rows have settled |
| **B. Standalone tool** (`scale-chooser.html`, single-file React like the others) | The ordinary new-tool recipe (about fifteen registration files and count pins, all known) | Deep-linkable, testable out of the page, cheap to revise | **Phase 1** |
| C. Extend `decision-aids.html` with a chooser view | Small | Reuses the grammar | Rejected: buries selection inside one page and couples the chooser's attestation to the trees' |

Phase 1's registration, from the recipe the scouts extracted from F7 (`5aa1345`) and F1 (`3f1a24f`): source under `02_Clinical_Skills/Scale_Chooser/`; `site_manifest.json` tuple; both navs (`build_deploy.py` `_tool(...)`, `resident_section.py`); `shipped_pages.json` and `metrics/allowlist.json` via `--write`; a `reviewed.json` **pending** row (hard requirement of `validate_tool_governance.py`); `curriculum.json` column, group, `libraryHints` and `searchAliases`; `tool_registry.json` row; the count pins in `validate_tool_governance.py`, its test, `test_frontdoor_catalog.py`, the fd-data and fd-library fixtures, three Playwright specs and `ci-build-contract.test.mjs`; the per-tool test.

---

## 6. Governance

- **Rights.** The chooser names instruments and routes to custodians; it reproduces nothing. Invariant 3 ties every routed URL to `instrument_rights.json`. Whether `scale-chooser.html` joins `instrument-rights-gate.mjs`'s pinned pages is a policy change, so it is a separate PR and the author's call (§8, D4).
- **Attestation.** The tool lands **pending**, risk clinical/moderate, like every new tool. The "licenses / does not license" lines are authored clinical teaching and need the author's signature through the faculty console.
- **Evidence.** A row cites a paper only through an annotation claim; enhancement A shows the recipe (registry source, cached abstract, annotation, `test_registry.py` pin, regenerated evidence drill).
- **Crisis block.** The chooser routes *to* risk surfaces but is not where risk work is done, so under the scope rule in `docs/agent-guide/safety-content.md` it carries no `<!-- crisis-block-html -->` marker. That is a judgment, stated in the PR, and the author may decide otherwise (D3).
- **Storage and analytics.** Phase 1 stores nothing. Phase 3 may add `cw_scale_quiz_v1` (registered in `tool_registry.json`) and integer counters from the generated allowlist only.

---

## 7. Phases, sizes and acceptance

| Phase | What ships | Size | Depends on |
|---|---|---|---|
| **0 — decisions** | §8 answered | — | the author |
| **1 — the tool** | `scale-chooser.html` with the 14 intents, inline data, the invariant test, full registration, pending row | M (one PR) | D1, D2 |
| **2 — wiring** | back-links from each scale surface; search aliases; an Essentials card | S per surface | Phase 1 merged |
| **3 — quiz** | vignette → pick the intent and instrument → feedback on what the choice licenses; transient; optional spaced retrieval | M | Phase 1 |
| **4 — Front Door + registry** | `scale_chooser.schema.json` (policy PR first), `scale_chooser.json` (content PR), `fd_scale_chooser.js` rendering the same rows; question-bank items about a scale link to their row | M–L | settled rows; D5 |
| **5 — close the gaps** | AIMS practice, ASQ, AUDIT-C, CIWA-Ar preconditions, the MSE cognition tab, the violence structured-tools card — each flips a row from "not yet" to "practised" or "taught" | S–M each | instrument decisions |

**Phase 1 acceptance.**

- All seven invariants in §3 pass in `tests/scale-chooser.test.mjs`; `bash bin/verify.sh --push` and both site builds are green; the smoke suite's frozen-colour baseline stays 0/0/0 for the new page in both themes.
- Every intent renders on a 390 px phone without horizontal scroll; every chip is a button with `aria-pressed`; the answer card is announced politely.
- A reviewer can trace every number on the page to a PMID and an annotation, and every "practise here" link to a page that ships.

---

## 8. Decisions only the author can make

| # | Decision | Recommendation |
|---|---|---|
| D1 | Build the chooser at all, with the §4 inventory as v1 | Yes — fourteen rows, five with a licensed claim |
| D2 | Tool first (Phase 1) or Front Door first | Tool first; the Front Door contract is the expensive surface |
| D3 | Does the chooser carry the crisis block? | No — it routes to risk work but is not where it happens |
| D4 | Pin `scale-chooser.html` in `instrument-rights-gate.mjs` | Yes, as a separate policy PR after Phase 1 |
| D5 | Instrument standing for the gap rows (AIMS, ASQ, AUDIT-C: public domain or WHO-licensed; 4AT: CC BY 4.0) | Record each in `instrument_rights.json` before any is practised here; the chooser only routes until then |
| D6 | Wording of the four standing badges | "Practised here" · "Taught here — score from the official form" · "Link only" · "Not yet in the library" |

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| The chooser drifts from the pages it routes to | The test reads `shipped_pages.json`, `instrument_rights.json` and the annotations on every run |
| A "licenses" line over-claims | Thresholds need an evidence entry (invariant 5); every line is attested before learners see it as reviewed |
| Rights creep — a retired instrument reappears as practised | Invariant 2 makes it a red build |
| The chooser starts scoring | Invariant 6 and an absence pin on any sum or threshold logic |
| Front Door contract cost | Deferred to Phase 4; the data shape is fixed now so Phase 4 is a re-render |
| Rows go stale as practice changes | Each row carries its evidence; the existing surveillance and review cadence cover the sources |

---

## 10. How we will know it works

Integer counters only, from the generated allowlist: chooser opens; intent selections by id (a bounded set); click-through to "practise here" versus "official form". Phase 3 adds aggregate quiz accuracy per intent. The teaching test is the rounds question: a learner asked "why that scale?" can say what the number will and will not let them do.
