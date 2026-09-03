# On-the-Unit Practice and Tools Panel — Relevance Plan

**Date:** 2026-09-03 · **Status:** plan, not yet implemented · **Surface:** the pinned practice panel on every topic page, both sites.
**Decisions taken:** D-1 (2026-09-03) — panel stays collapsed, fix its contents; no CSS change, no visual-baseline regeneration. See §7.
**Shipped:** WP-B, WP-C and WP-A (2026-09-03). Corrections found while implementing are marked
**[corrected 2026-09-03]** below.

**Goal:** Make the panel that is pinned to all 74 topic pages say something true and specific about *that page* — correct tool names, governance-correct instrument handling, audience-neutral copy, one obvious next action instead of a nine-link dump.

**Non-goal:** New pages, new tools, new content types, or any change to instrument scope. Every improvement below is a rewiring or a copy fix against data the repo already has and already validates.

---

## 1. What the panel is today

`buildTpl(m, file)` — `13_Faculty_Resources/_automation/site_build/spa_index.html:986` — renders a collapsed `<details class="topic-tpl practice-panel">` prepended above the parsed markdown (`spa_index.html:1983`, and a second injection path at `:1124`). It appears whenever `hasPracticeTpl(m)` is true (`:921`), which is every topic with any of tldr / points / clinicalWorkflow / workflowStages / cant / ruleOut / quiz / cta / relatedTools / communicationCases.

Its body is five fixed blocks: chip row → "Why today" line → **In 30 seconds** → **On the unit** → **Test yourself** → **Tools**.

It draws from six sources, three of which are hand-maintained maps private to the SPA:

| Source | Where | Maintained |
|---|---|---|
| `topic_meta.json` | fetched | validated (`validate_topic_meta.py`) |
| `PRACTICE_LABELS` (19 rows) | `spa_index.html:914` | **by hand** |
| `PRACTICE_SAFE` (6 rows) | `spa_index.html:915` | **by hand** |
| `PRACTICE_PAGE_TOOLS` (19 rows) | `spa_index.html:916` | **by hand** |
| `PRACTICE_CASE_LABELS` (10 rows) | `spa_index.html:917` | **by hand** |
| `PAGE_TOOLS` | `spa_index.html:961` | **never defined — dead branch** |

Meanwhile the front door already builds one joined index — `fdBuildIndex(curriculum, topicMeta, toolRegistry, siteManifest)` in `frontdoor/fd_data.js:53` — that carries, per ref: canonical `title` from `site_manifest.json`, `risk` from `tool_registry.json`, a `rights` governance flag derived from `instrument_rights.json`, plus `kind`, `href`, `minutes`, `summary`, `attested`, `governance`. It is in scope in the shell as `FD_INDEX` (`spa_index.html:1976`).

**The practice panel is the last surface in the app still running on the pre-registry hand maps.**

---

## 2. Findings

### F1 — Governance: rights-reference pages are rendered as instrument tools *(severity: highest)*

`instrument_rights.json` is the authority (INV-IR1, #412). It records `cssrs: retired`, `bfcrs: restricted`, `ciwa-ar: retired`, `cows: flagged-interim`. Pages whose `requiredDisclaimerType` is `instrument-not-reproduced` are mirrored into `curriculum.rightsReferences` (`['bfcrs.html','cssrs.html']`), and `validate_curriculum.py:174-219` fails the build if the two disagree — its comment states the rule plainly: *"a rights reference replaces a tool."*

`fd_data.js:19-33` honours that: the `rights` flag is *"a PRESENTATION flag"* and a rights page gets **"no Quick Tools, no tool chip, no 'Interactive tool' kicker, no Interactive-tools column."**

The practice panel does the opposite. It renders `cssrs.html` and `bfcrs.html` as action buttons in the `is-safety` class, under labels written before the retirements:

| Slug | Canonical title (`site_manifest.json` / `tool_registry.json`, and what the resident nav already shows) | What the panel shows |
|---|---|---|
| `cssrs.html` | Columbia C-SSRS — Official Form & Training | **"C-SSRS Suicide Screen →"** |
| `bfcrs.html` | Bush-Francis Catatonia Scale (BFCRS) — Official Form & Training | **"Bush-Francis Catatonia →"** |
| `withdrawal.html` | Withdrawal: COWS Tool · CIWA-Ar Official Form & Training | **"CIWA-Ar / COWS →"** (leads with the retired instrument) |
| `oral.html` | Treatment Team Rounding Prep | "Rounding Prep + Timer →" |
| `interaction-cards.html` | Interaction Cards — One Action | *absent from the map* → renders **"interaction cards →"** |

**Blast radius — 28 page-instances**, far wider than the registry intends, because `topic_meta.relatedTools` scattered these slugs well beyond the registry's `relatedPages`:

| Slug | Panel offers it on | `tool_registry.relatedPages` declares |
|---|---|---|
| `cssrs.html` | **14** pages — `ethics_legal`, `orientation`, `osce`, `pg_suicide`, `protocol_library`, `suicide`, `systems_medlegal`, `t_adjustment`, `t_dissociative`, `t_perinatal`, `t_personality`, `t_sud`, `week1`, `week3` | 2 (`pg_suicide`, `suicide`) |
| `bfcrs.html` | **6** — `catatonia`, `cl_reference`, `ect_neuromodulation`, `exp_consult`, `t_neurodev`, `week2` | 1 (`catatonia`) |
| `withdrawal.html` | **8** — `adv_psychopharm`, `cl_reference`, `exp_consult`, `orientation`, `protocol_library`, `t_sud`, `week1`, `week5` | 1 (`t_sud`) |

A learner clicking "C-SSRS Suicide Screen" on a risk page expects a screener and gets a not-reproduced notice — the label promises the exact thing the governance decision removed. The width of the spread is itself a finding: it is the reverse of F2's under-linking, and it means WP-A's registry join has to *reconcile* the two directions, not merely union them (§4, WP-A).

**[corrected 2026-09-03] The blast radius is 43, not 28, and there are three renderers, not one.**
Counting only tool lists missed the **15 author-written CTA and `clinicalWorkflow.actions` labels**
that name a retired instrument in the imperative — `"Open the C-SSRS screener"` (×3),
`"Open the Columbia C-SSRS screener"` (×2), `"Open C-SSRS"` (×5), `"Open the BFCRS scale"`,
`"Open BFCRS"` (×4) — spread over `catatonia`, `t_adjustment`, `t_dissociative`,
`ect_neuromodulation`, `pg_suicide`, `suicide`, `t_perinatal`, `week2`, `week3`, `cl_reference`.
Those are worse than the label map: a map entry merely names the tool wrongly, an imperative CTA
*instructs* the learner to open a screener that no longer exists. They also reach the page through
a **third renderer** — `buildWorkflow`'s own actions row (`spa_index.html:713`), which is not
`buildPracticeTools` — so WP-B had to cover all three emitters and let the registry title win over
the author's label for a rights reference. A fourth instance, `t_sud.md`'s
`"Open CIWA-Ar / COWS"`, points at a **live** tool (`withdrawal.html` is not a rights reference),
so no shell rule can override it; it was fixed in `topic_meta.json` instead, to the label the same
page already uses for the same target, `"Open withdrawal tool"`.

This is a labelling defect, not a scope question. It requires **no** change to instrument scope and must not narrow or lift the COWS interim waiver.

### F2 — Label and link sources have drifted from the registries

Measured against `tool_registry.json` + `site_manifest.json` + `communication_cases.json`:

- **4 wrong titles + 1 missing entry** in `PRACTICE_LABELS` (table above).
- **15 page→tool links declared in `tool_registry.relatedPages` never appear in the panel** — `one-patient-six-weeks.html` is declared on 11 pages and surfaced on 1; `interaction-cards.html` is declared on 3 (`med_monitoring`, `psychopharm_primer`, `cotw_index`) and surfaced on 0.
- **`PRACTICE_CASE_LABELS` is 2 cases behind `communication_cases.json`.** `interview_motive_suspicion_001` ("Respond When the Patient Questions Why You're Asking") and `rounds_naming_uncertainty_001` ("Name Uncertainty on Rounds") have titles in the registry and fall through to the generic `'What Do You Say Next?'`. On `pg_interview.md`, `t_psychosis.md` and `doc_oral.md` an unnamed drill tile sits beside named ones.
- **`PRACTICE_PAGE_TOOLS` is now purely additive noise.** It is unioned with `topic_meta.relatedTools`, and on all 19 rows `relatedTools` is a superset or near-superset. It contributes nothing the meta doesn't, and is a second place to forget.

### F3 — The panel is the app's largest un-audited audience-neutrality surface

`tests/fd-path.test.mjs:27` codifies the contract: `AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i`, and `phase_policy.js:6` states the copy rule — *"labels ship to both sites — audience-neutral, 'Exam', never 'Shelf'."* Six front-door modules assert against it.

The practice panel is not covered, and emits the banned token twice on both sites:

- `WF_FIELDS` (`spa_index.html:712`) labels the workflow row **"Shelf/COMAT"** — rendered on **67 of 74** pages.
- `PRACTICE_MODE_LABELS` (`:939`) renders a **"Shelf"** chip — on **50 of 74** pages (`workflowModes` counts: ward 70, 5min 61, shelf 50, safety 40, family 39).
- `PRACTICE_LABELS` ships "Shelf Mode Exam Sim".

`WF_STAGE_LABELS` (`:711`) already says `exam:'Exam'` correctly — so the fix is a known-good word, already used two lines above.

**[corrected 2026-09-03] The test this plan specified cannot be written as specified.**
WP-C originally said to render `buildTpl` over all of `topic_meta.json` and assert
`AUDIENCE_TOKEN_RE` matches nothing. That test can never pass, and not because of a real defect:
the regex has **no word boundaries**, so `UNE` fires on "autoimm**une**" (`t_psychosis`,
`t_somatic`) and "**une**xplained" (`pg_suicide`), and `student` occurs legitimately in quiz stems
("A **student** presents…", 6 pages). Applied to rendered clinical prose it is a test satisfiable
only by rewriting medicine. The shipped test therefore asserts against **the strings the panel
owns** — `WF_FIELDS`, `WF_STAGE_LABELS`, `PRACTICE_MODE_LABELS`, `PRACTICE_LABEL_NEUTRAL` — plus one
render over a synthetic token-free meta that exercises every branch, so anything the regex finds is
the panel's own copy. Authored prose is F6/WP-F's problem, not a chrome regression.

### F4 — The relevance machinery is dead code

- `buildTpl` hardcodes `var mode='ward'` (`:988`). Nothing sets it.
- `practiceModeCfg` (`:940`) returns `{label, tools:[], stages:[]}` — `tools` is always empty, so `sortPracticeTools` (`:950`) assigns every key priority 99 and is a stable no-op.
- `sortPracticeCases` (`:954`) reads `window.__casePriority`, which is **assigned nowhere in the repo**. Also a no-op.
- The `.tpl-chip.mode` chips render with an `.on` class on `ward` and look like a segmented control. They are not clickable and there is no handler.

Net: **there is no ordering logic in the panel at all.** Tools appear in map-insertion order, and the UI implies a mode filter that does not exist.

### F5 — Redundancy and density

- **The "Why today" line is a verbatim duplicate.** `practiceModeText` (`:941`) returns `cw.rounds` in ward mode; `buildWorkflow` (`:713`) renders the same `cw.rounds` string as the "Rounds" row of the grid a few hundred pixels below. 67 of 74 pages print the identical sentence twice inside one panel.
- **It is prefixed "Ward mode: "** — naming a mode system that does not exist (F4).
- **Density.** Median 9 actions per panel (tools + cases + cta + workflow actions); **42 of 74 pages carry ≥8**; worst are `week1.md` (17), `t_psychosis.md` (14), `t_mood.md` (13). Every action is the same visual weight apart from drills. Nothing tells the learner which one to press with four minutes before rounds.

### F6 — Content gaps behind the frame

- **7 pages** fall back to the generic ward sentence (no `clinicalWorkflow.rounds` or `.ask`): `anki.md`, `case_formulation.md`, `med_monitoring.md`, `medical_workup.md`, `psychotherapy.md`, `therapy_reading_room.md`, `toxidromes.md`.
- **5 pages** have ≤1 of the five panel ingredients and render a near-empty panel: `toxidromes.md`, `med_monitoring.md`, `psychotherapy.md`, `case_formulation.md`, `medical_workup.md`.
- **31 of 74** have no `quiz` → the Test-yourself section prints "No page-specific question yet."
- `ruleOut` exists on only 25 of 74, so the "Rule out first → first move" mini-tree — the most clinically useful block in the panel — is absent from two-thirds of pages.

---

## 3. The relevance model

Replace *"one panel, everything, ordered by nothing"* with **one reason, one primary action, ranked support.**

Every signal below already exists and is already validated. No new registry, no new build step.

| Layer | Signal | Source |
|---|---|---|
| **Page** | what this topic makes you do | `topic_meta.clinicalWorkflow`, `ruleOut`, `cant`, `safetyLevel` |
| **Catalog** | what a tool *is* and *is for* | `tool_registry.{title,category,riskLevel,relatedPages}`, `site_manifest` titles |
| **Governance** | may this be offered as a tool at all | `instrument_rights.json` → `curriculum.rightsReferences` → `FD_INDEX[ref].rights` |
| **Learner** | where they are in the rotation | `phase_policy.js` (`phasePolicy`, `shelfDaysUntil`), `cw_srs_v1` due count, `cw_comm_v1` completed drills, `cw_last` |
| **Audience** | which site is serving | shared shell; copy must be neutral either way |

Ranking rule, deterministic and testable:

```
1. Governance   rights references are never actions      → Reference row, no arrow, no is-safety
2. Safety       safetyLevel==='high' or riskLevel==='high' on a page whose ruleOut/cant is set
3. Rehearsal    an unfinished communicationCase for this page
4. Page-declared topic_meta.relatedTools order (author intent, already curated)
5. Registry     tool_registry.relatedPages back-links not already shown
6. Review       question bank / daily review, only when the phase says so
```

---

## 4. Workstreams

Ordered so each lands independently and green.

### WP-A · Single source of truth *(no visual change; pure correctness)* — **shipped 2026-09-03**

- [x] ~~Delete `PRACTICE_LABELS`, `PRACTICE_PAGE_TOOLS`, `PRACTICE_CASE_LABELS`, `PRACTICE_SAFE`, and the dead `PAGE_TOOLS` branch.~~ All five gone. The shell now carries **no hand-maintained tool map at all**; every label, link and risk flag is derived from `FD_INDEX` / `FD_TOOL_REGISTRY`.
- [x] ~~`practiceToolLabel(k)` reads `FD_INDEX`~~ — and the "one documented exception" turned out
  not to exist. **[corrected 2026-09-03]** This plan claimed `shelf-mode.html`'s canonical title
  forces a conflict between "use the registry title" and "audience-neutral copy", and shipped a
  one-row `PRACTICE_LABEL_NEUTRAL` override for it. That was wrong: **the resident build already
  rewrites the manifest title per site** — the built `FD_SITE_MANIFEST` says
  `"Shelf Mode — Exam Simulation"` on ms3 and `"Board-Style Question Bank"` on res. Reading
  `FD_INDEX` therefore gives each site its own name with no override and no forked copy, so the
  map is deleted and no manifest change is needed. The conflict was an artifact of not checking
  the built artifact.
- [x] ~~`practiceCaseLabel`~~ — reads titles injected from `communication_cases.json` at build time
  (`build_deploy.py`, verified needle, the same mechanism as `RETIRED_QB_IDS`). The two drills that
  rendered unnamed now read "Respond When the Patient Questions Why You're Asking" and "Name
  Uncertainty on Rounds".
- [x] ~~`practiceIsSafe`~~ — reads `tool_registry.riskLevel === 'high'`. Reproduces the old hand
  list exactly, so no page's safety styling changed.
- [ ] `practiceCaseLabel(id)` reads the `title` already fetched with `communication_cases.json`.
- [x] ~~**Reconcile the page→tool set in both directions.**~~ The two sources disagree in opposite ways: `tool_registry.relatedPages` under-links (15 declared links never surfaced, F2) while `topic_meta.relatedTools` over-links (`cssrs.html` on 14 pages against a declared 2, F1). A naive union keeps both faults. Rule:
  - registry back-links are **added** (they are the curated catalog view), and
  - a `relatedTools` entry for a ref the registry does **not** declare for that page is **demoted** below the declared ones rather than dropped — dropping silently removes an author's deliberate cross-link.
  - Report the delta once at build time (`build_deploy.py`, print-only) so the divergence is visible and can be curated down in WP-F instead of hiding inside the renderer.

  **Result:** the build now prints `page->tool reconciliation: 15 registry link(s) the pages did
  not list, 195 authored link(s) the registry does not declare`. The 15 matches this plan's
  prediction exactly. **The 195 did not** — the registry declares far less than the pages
  actually link, so `tool_registry.relatedPages` is not the curated superset this plan assumed;
  it is a thin subset. That is a curation question for WP-F, and the number is now visible on
  every build instead of hiding inside the renderer.

**Acceptance:** every label the panel prints equals the title the nav prints for the same slug; the 15 missing registry links appear; the 2 unnamed drills are named; no page's action list changes membership except by those 15 additions. **Test:** `tests/practice-panel.test.mjs` — for every ref reachable from any panel, `practiceToolLabel(ref) === manifestTitle(ref)`; assert no literal tool title string remains in `spa_index.html`; pin the per-page action-set diff against a fixture so a future `relatedTools` edit shows up as an intentional change.

### WP-B · Governance-correct instrument handling *(highest priority)* — **shipped 2026-09-03**

- [ ] A ref with `FD_INDEX[ref].rights === true` renders as a **reference line**, not an action: registry title, no `→`, no `is-safety` class, kicker "Official form & training — not reproduced here".
- [ ] Rights references sort below live tools and never occupy the primary slot (WP-D).
- [ ] `withdrawal.html` keeps its registry title (COWS first). **Do not** restate, narrow, or lift the recorded COWS interim waiver; the tool stays a tool.

**Acceptance:** `cssrs.html` and `bfcrs.html` never render with a tool arrow or safety chip anywhere in the panel; the string "C-SSRS Suicide Screen" and "CIWA-Ar / COWS" exist nowhere in the built sites. **Test:** extend `tests/practice-panel.test.mjs` to drive `buildPracticeTools` over a fixture containing every `curriculum.rightsReferences` entry and assert the presentation contract, mirroring the wording of `fd_data.js:19-33`. Also add a `check-static-site.mjs` assertion so drift fails the publish gate, not just CI.

### WP-C · Audience-neutral copy — **shipped 2026-09-03**

- [ ] `WF_FIELDS` `['exam','Shelf/COMAT']` → `['exam','Exam focus']` (matches `WF_STAGE_LABELS.exam` two lines above).
- [ ] `PRACTICE_MODE_LABELS.shelf` `'Shelf'` → `'Exam'`.
- [ ] Panel titles/kickers reviewed against `AUDIENCE_TOKEN_RE`.
- [ ] Extend the existing neutrality assertion to the panel: render `buildTpl` over all of `topic_meta.json` in a test and assert `AUDIENCE_TOKEN_RE` matches nothing. **This test is the durable fix** — F3 recurred because the panel sits outside the six modules that already have it.

### WP-D · One reason, one primary action

- [ ] **Kill the fake mode UI.** Remove `practiceModeCfg`, `sortPracticeTools`, `sortPracticeCases`, `window.__casePriority`, and the non-interactive `.tpl-chip.mode` chips (F4). *(Alternative, if chips should stay: make them real filters — costed in §6.)*
- [ ] Replace `practiceModeText` with a **page-specific reason** that is not a duplicate of the grid: prefer `cant` → `ruleOut[0]` → `clinicalWorkflow.ask`, and **never** `clinicalWorkflow.rounds` while the grid renders it (F5). Drop the "Ward mode: " prefix.
- [ ] Add a single **"Do this next"** primary action chosen by the §3 ranking, rendered as the first row **inside the panel body**, with the rest demoted to a secondary row. Per D-1 the panel stays collapsed, so this changes ordering and emphasis within the existing `.practice-body`, not the summary and not anything above the fold.
- [ ] Make the primary action phase-aware via the existing `phasePolicy()` — in `taper`/`consolidate` prefer retrieval (`review.html`, page quiz); otherwise prefer the page's safety or rehearsal tool. `phasePolicy` already reads `cw_shelf_date`; **no new storage key.**

**Acceptance:** every page shows exactly one primary action; no sentence appears twice in one panel; `.practice-summary` markup and the collapsed-state rendering are byte-identical to today. **Test:** pure-function test over all 74 metas — one primary, reason ≠ any grid value, deterministic for a fixed `nowMs`; plus an assertion that the summary block is unchanged.

### WP-E · Density and grouping

- [ ] Group the secondary row into **Assess · Rehearse · Reference · Review**, mapped from `tool_registry.category` + the rights flag. Suppress an empty group.
- [ ] Cap visible secondary actions (proposed: 4) behind a "More for this page" disclosure; drills keep their existing dedicated block.
- [ ] **Reuse the existing `.practice-*` classes and the `practice-drills` grouping idiom rather than adding new ones.** Per D-1 this workstream introduces no new CSS: grouping is achieved by emitting the existing `practice-actions` block once per group with a `practice-drill-head`-style heading, which is already styled.

**Acceptance:** no page renders more than 5 visible actions before disclosure; the worst page (`week1.md`, 17) is legible; `clinical-warm.css` and the panel's CSS block in `spa_index.html` are unmodified, so no visual baseline needs regenerating. **Test:** assert the visible-action cap across all metas; assert the stylesheet diff is empty.

### WP-F · Content fills *(authoring, gated by `topic-meta-author` skill)*

- [ ] `clinicalWorkflow.rounds`/`.ask` for the 7 generic pages.
- [ ] Panel ingredients for the 5 near-empty pages — at minimum `tldr` + `relatedTools` + one `clinicalWorkflow` field.
- [ ] `ruleOut` + `firstMove` for high-safety pages currently missing it (the mini-tree is the panel's highest-value block, present on only 25 of 74).
- [ ] Decide the policy for the 31 quiz-less pages: author a quiz, or suppress the section rather than printing "No page-specific question yet."
- [ ] **33 audience tokens in authored `topic_meta` prose that ships to both sites** — e.g.
  `supervision_teaching.md` tldr ("the first-line supervisor for the MS3"), `cl_reference.md`
  ("The numbers residents carry"), `cotw_index.md` ("matched MS3 and resident versions"),
  `ddx.md` ("Shelf questions often hide medical mimics"), `welcome.md` ("shelf review", "Use shelf
  mode"). Some are legitimately audience-referential content and some are leftovers; telling them
  apart is an author call, which is why WP-C's test deliberately stops at chrome.
- [ ] **Dead retired-instrument labels still in `topic_meta`.** The 15 `"Open C-SSRS"` /
  `"Open BFCRS"` CTA labels are now overridden at render time by WP-B, so nothing ships them to a
  learner — but they remain in the source data, where the next reader will believe them. Clean them
  so source and rendered output say the same thing.

> Every edit here goes through the `topic-meta-author` skill — `validate_topic_meta.py` enforces controlled vocabularies and cross-file referential integrity that are silent to get wrong.

---

## 5. Sequencing

| Phase | Workstreams | Ships | Risk |
|---|---|---|---|
| 1 | **WP-B + WP-C** | governance-correct, neutral copy | low — string + branch changes, no layout |
| 2 | **WP-A** | registry-sourced labels and links | low — behaviour-preserving, big deletion |
| 3 | **WP-D** | the actual relevance change | low — body-only ordering and copy (D-1) |
| 4 | **WP-E** | density | low-medium — body-only regrouping, no new CSS (D-1) |
| 5 | **WP-F** | content | low, but the slowest; unblocked by 1–4 |

Phases 1–2 are worth doing on their own even if 3–5 are deferred: they remove a live governance mislabel and a drift class, and they delete 2.5 KB of hand-maintained duplication across four maps.

---

## 6. Constraints this plan must not trip

- **ES5 only** in `spa_index.html` and every `frontdoor/*.js` snippet — `var`/`function`, no `const`/`let`/arrows/template literals. These are textually injected, not modules.
- **Audience-neutral copy** — `/MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i` in no emitted string. Slugs (`shelf.md`, `shelf-mode.html`) are identifiers, not copy.
- **localStorage `cw_*` / `rp_*` only.** WP-D deliberately adds **no** new key — it reuses `cw_shelf_date` via `phasePolicy()`.
- **Escape everything** reaching `innerHTML`; the panel already uses `esc`.
- **No crisis number in the panel.** Crisis contacts live only in `crisis_resources.json` and arrive by the `<!-- crisis-block -->` marker at build time. If WP-E adds a safety surface, add the marker; do not inline a number.
- **Instrument scope is a governance decision, not an agent decision.** WP-B changes *labels and presentation only*. It does not add, remove, or reinterpret any instrument's status, and it must not narrow or lift the recorded COWS interim waiver.
- **A red node test silently aborts the build.** `build_and_check.sh` is `set -euo pipefail` and runs `node --test tests/*.test.mjs` *before* `build_deploy.py`. Run the node suite first when a panel edit "doesn't show up".
- **Touching a shell literal tool map trips two separate contracts.** `check-static-site.mjs`'s
  `TOOL_MAP_VARS` (§7b) extracted each named map and hard-failed if one was missing — deliberately,
  so the safety net could not be quietly deleted — and `tests/fd-shell-boot.test.mjs` pinned that
  declaration line *verbatim*. Removing `PRACTICE_LABELS` failed the publish gate first and the
  node suite second. **Now resolved:** with the last map deleted, §7b's map scan is gone and its
  coverage moved to §4b, which resolves topic_meta's `cta`, `relatedTools` and
  `clinicalWorkflow.actions` targets against the shipped tree — wider than the map scan, and
  against the fields the panel actually reads. §7b's `?page=`/`?tool=` scan of `content/*.md` was
  nested *inside* the map branch and had to be lifted out, or deleting the maps would have
  silently disabled it too.
- **New CI step ⇒ three contracts.** If a step is added to `ci.yml`: `bin/check-verify-coverage.py`, the `validate_scheduled_workflows.py` step-inventory + sha256 digest (recompute via its own `_load`/`_contract_digest`), and `test_validate_registry_schemas.py`'s `PAIRS`. Adding tests to the existing `tests/*.test.mjs` glob avoids all three.
- **`cp CLAUDE.md AGENTS.md`** if this work changes either.

---

## 7. Decisions

### Taken

**D-1 (2026-09-03) — the panel stays a collapsed accessory; fix its contents.** Rejected: default-open on high-safety pages, and hoisting the reason or primary action above the fold. Consequences, binding on WP-D and WP-E:

- `.practice-summary` markup, the "Click to open" affordance and the collapsed-state rendering are **unchanged**. Everything below happens inside `.practice-body`.
- **No CSS change** — reuse the existing `.practice-*` classes. This is what keeps the Playwright visual baselines valid; regenerating them requires the "Refresh visual baselines" workflow_dispatch on the Ubuntu/Chromium runner and cannot be done from a laptop, so avoiding the need is worth a real constraint.
- WP-D and WP-E drop from medium to low risk and from ~2-3 days to ~1 (§5).
- The correctness findings F1-F5 are all still fixed in full; what is deferred is only the question of whether a learner who never opens the panel should see any of it. Worth revisiting once WP-F closes the content gaps — an empty panel is a bad thing to open by default, a complete one is not.

### Open

1. **Mode chips: remove or make real?** They are decorative today and imply a filter that does not exist. *Recommend removing* (WP-D) — the same relevance is better served by one ranked primary action than by five filters a learner must operate. Making them real is ~1 extra day: chips become buttons, `practiceModeCfg` gains genuine per-mode tool priorities, and mode persists in a `cw_*` key. **Note D-1 raises the cost of keeping them**: a real filter inside a collapsed panel is two interactions deep.
2. **Quiz-less pages (31 of 74):** author quizzes, or suppress the empty section?
3. **Withdrawal wording.** The registry title leads with COWS, which is correct. Confirm the panel should print the registry title verbatim rather than any shortened form.

---

## 8. Definition of done

- No panel label disagrees with the nav label for the same slug (0 of 22 tools).
- `cssrs.html` / `bfcrs.html` render as references, never as actions, on every page that offers them.
- `AUDIENCE_TOKEN_RE` matches nothing in `buildTpl` output across all 74 metas.
- Exactly one primary action per page; no duplicated sentence within a panel.
- ≤5 visible actions before disclosure (from a median of 9, max 17).
- Per D-1: `.practice-summary` and the panel's CSS are unmodified, and the smoke suite passes **without** regenerating visual baselines.
- 0 pages on the generic ward sentence; 0 pages with a near-empty panel.
- `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `res` both green; `node --test tests/*.test.mjs` green; smoke suite green.
