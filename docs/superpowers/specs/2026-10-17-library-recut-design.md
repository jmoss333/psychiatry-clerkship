# Library re-cut (O2): sub-groups inside the Everything columns, depth chips on rows

**Date:** 2026-10-17 · **Status:** governance half on `claude/library-recut-2026-10-17` (this PR); content half follows · **Author:** Claude (Cowork), for Joshua Moss, MD
**Origin:** O2 of `claude/org-and-features-review-2026-10-17.md` (project doc), re-measured against the Front Door Library rather than the legacy nav.

## 1. The problem, re-measured

The review counted the legacy nav (*Understand the Problem* 22, *Assess Safety and Acuity* 14–16). What a learner actually browses is the Front Door Library's **Everything** view: five columns, each one flat list of rows.

| Column | ms3 rows | res rows | What is interleaved |
|---|---|---|---|
| Interactive tools | 19 | 23 | interview trainers, risk instruments, pharmacy, exam drills, resident PRN trainers |
| Acute & safety | 12 | 14 | reading · pocket card · official instrument for the same syndrome (suicide ×3, catatonia ×2) |
| Core topics | 17 | 17 | one reasoning scaffold + 16 condition guides |
| Clinical skills | 17 | 19 | orientation, formulation, family, psychotherapy, ethics |
| Evidence & exam | 19 | 21 | exam prep, reading lists, medication references, media libraries |

Every column exceeds the review's 12-row bar. Rows carry a *tool / reference* chip but no depth signal: `pg_suicide.md` (card) and `suicide.md` (guide) look identical until opened. **Essentials** (the default view) is already well cut and is not touched.

## 2. Design

**Data, not code, decides the cut.** `curriculum.json` `libraryColumns[].groups` partitions a column's refs into named sub-groups; `siteLibrary.*.additions[].group` says which sub-group a resident-only ref joins. No ref moves between columns, so every count the inventory tests pin (`libraryCount` 85 / 94, nav-crawl, Essentials) is unchanged. The validator makes the partition exact (every ref once; no unknown ref; no empty group) so a ref can never silently vanish from the only browse surface.

**Rendering (content PR):** `fd_library.js` renders a grouped column as its heading plus sub-headings — plain headings inside the existing open `<details>`, never nested disclosure, so nothing the inventory tests count becomes hidden. The filter and the section counts work per sub-group. Compact (Everything) rows gain a depth chip derived from the slug prefix — `pg_` → **card**, `exp_` → **module**; a guide is the unmarked default (the same rule `fd_today.js` uses: only the exceptions are labelled) — alongside the existing *tool / reference* chip.

## 3. Proposed sub-groups (the approval gate — edit names or membership freely; it is one JSON edit)

| Column | Sub-group | Refs (shared) | Resident additions |
|---|---|---|---|
| Interactive tools | Interview & present | mse · interview-circle · sp-interview · communication-practice · oral | — |
| | Assess & decide | diagnostic-reasoning · screeners · capacity · violence (FRST) · withdrawal | — |
| | Medications | pharmacy · interaction-cards · decision-aids | — |
| | Cases & families | one-patient-six-weeks · family-systems | — |
| | Practice & review | shelf-mode · review · question-bank-practice · reflection (+ ms3: prepare-for-tomorrow) | rp-agitation · rp-brief-psych · rp-canon-quiz · rp-post-event-huddle |
| Acute & safety | Suicide risk | pg_suicide · suicide · cssrs | — |
| | Agitation, delirium & catatonia | agitation · delirium · catatonia · bfcrs · violence | — |
| | Medical, toxic & consult | exp_consult · toxidromes · medical_workup · protocol_library | systems_medlegal · cl_reference |
| Core topics | Core conditions | ddx · t_mood · t_psychosis · t_anxiety · t_personality · t_sud | — |
| | Lifespan & special topics | t_geri · t_perinatal · t_neurodev · t_eating · t_neurocog · t_somatic · t_sleep · t_dissociative · t_sexual · t_impulse · t_adjustment | — |
| Clinical skills | Start here & present | welcome · orientation · pg_interview · pg_formulation · case_formulation · doc_oral | rotation · supervision_teaching |
| | Family, collateral & discharge | collateral_workflow · exp_family · family_modalities · family_playbook | — |
| | Treatment & psychotherapy | exp_tx · psychotherapy · brief_psychotherapy · therapy_on_the_unit · motivational_interviewing | — |
| | Culture, ethics & law | cultural_psychiatry · ethics_legal | — |
| Evidence & exam | Exam prep | shelf · rapid_review · anki · osce · rounds_questions | — |
| | Cases | cases · cotw_index | — |
| | Reading & evidence | core_readings · reading_map · landmark_trials · evidence_inpatient · therapy_reading_room | canon_200 |
| | Medications & somatic treatments | psychopharm_primer · med_monitoring · ect_neuromodulation · nutrition_metabolic | adv_psychopharm |
| | Books, podcasts & OMM | book_library · podcast_library · omm_resources | — |

Largest sub-group: 11 (Lifespan & special topics). *Core conditions* deliberately equals Essentials' *Core diagnoses*, so the two views agree on what "core" means.

## 4. Sequencing (by constraint)

| PR | Kind | Content |
|---|---|---|
| **A (this)** | governance only | `curriculum.schema.json` (+`groups`, +`group`), `validate_curriculum.py` partition rule, its tests. `curriculum.json` validates unchanged. |
| **B** | content | the sub-group data above; `frontdoor_catalog.py` projects additions into their group and drops exclusions from groups; `fd_data.js` carries `groups` on `idx.columns`; `fd_library.js` sub-headings + depth chips; CSS + CLASS-INVENTORY; `fd-library` and smoke tests; **visual baselines for the Library "full" views need the Ubuntu refresh workflow** (Today baselines unaffected). |

## 5. Acceptance checks

| Check | Where |
|---|---|
| Partition exactness: six ways to break it each fail; the real file passes | `test_validate_curriculum.py` (PR A) |
| An addition into a grouped column names an existing group; into a flat column names none | `test_validate_curriculum.py` (PR A) |
| No visible sub-group > 12 rows on either site | `tests/fd-library.test.mjs` (PR B) |
| Every column ref renders exactly once; Everything count unchanged (85 / 94) | `tests/fd-library.test.mjs`, smoke `libraryCount` (PR B) |
| Depth chip on every `pg_` / `exp_` row in Everything; none on guides | `tests/fd-library.test.mjs` (PR B) |
| Filter matches inside sub-groups; empty sub-groups drop; section index counts unchanged | `tests/fd-library.test.mjs` (PR B) |
| Sub-headings are not disclosure controls (nothing hidden from nav-crawl) | `tests/fd-library.test.mjs` + nav-crawl (PR B) |

## 6. Open questions for Josh

1. The sub-group names and membership in §3.
2. Depth chips on guides too (*guide* on every plain reading), or exceptions only (card / module) as proposed?
3. Should Essentials show the same sub-headings? (Proposed: no — it is already five short sections.)
