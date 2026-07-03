# TOPIC_META_EXECUTION_BRIEF — drafting metadata for the remaining 33 pages

You are drafting `topic_meta.json` entries for the MS3 clerkship site. The quality bar, field
specs, voice, and guardrails live in **`TOPIC_META_RUBRIC.md`** — read it completely before
drafting anything. This brief is the work order: process, guardrails, and the exact target list.

## Ground rules (violating any of these voids the work)

1. **Branch discipline.** Work on a new branch off `origin/main` (`git fetch origin` first),
   e.g. `content/topic-meta-batch-1`. Commit there. **Never merge, never push** — pushing
   `main` deploys the live site. Do not touch the branches `ci/qa-publish-gate`,
   `fix/restore-dropped-pages`, or `fix/vendor-and-video-asset-deploy`, and leave any dirty
   files in other checkouts alone.
2. **Additive to one file.** You edit **only** `topic_meta.json` (repo root). Never edit page
   markdown, `build_deploy.py`, `nav.json` outputs, or anything else. If a page contains an
   error, note it in your handoff summary — do not fix it.
3. **Never touch `13_Faculty_Resources/reviewed.json`.** Every entry you write is AI-drafted and
   **pending faculty attestation**; the `_note` at the top of `topic_meta.json` declares this —
   keep it intact. Attestation happens later, by Dr. Moss, in the Review & Attest tool.
4. **Ground every entry in the page text.** Read the page's source file (paths below) in full
   before drafting its entry. No claim, number, or legal statement the page does not make
   (rubric §5). Fictional composites only; no PHI.
5. **Validate before every commit:**
   - `python3 -c "import json; json.load(open('topic_meta.json'))"`
   - `OUT_DIR=_build/ms3 python3 13_Faculty_Resources/_automation/site_build/build_deploy.py`
     must finish with `missing: []` and `md copied: 56`.
   - Confirm your entry's key matches the deployed slug exactly (they are listed below).

## Per-page procedure

For each page, in order:

1. Read the source file completely.
2. Identify the archetype (assigned below; rubric §2 defines them). If the page clearly doesn't
   fit its assignment, follow the page, not the table — and say so in your handoff.
3. Draft the entry in canonical field order (`read, hy, tldr, points, cant, ruleOut, firstMove,
   quiz, cta`), applying rubric §3–§5. Match the three reference exemplars in
   `topic_meta.json`: `t_geri.md` (A), `motivational_interviewing.md` (B), `pg_suicide.md`
   (safety). JSON stays 2-space-indented, real UTF-8 (em dashes literal, not `—`).
4. Self-check against the rubric: `points` exactly 3; quiz has 4 parallel options, exactly one
   `"c": true`, distractors are named misconceptions, `why` dispatches them; `firstMove` never
   appears without `ruleOut`; archetype C has no quiz; correct-answer position varies across
   your batch; `hy` stays scarce (≤ ⅓ of your batch).
5. Append to `topic_meta.json`, validate (ground rule 5), commit in batches of ~5 with message
   `content: topic_meta batch N — <slugs> (pending attestation)`.

End your run with a handoff summary: entries drafted, anything you couldn't source to a page,
any archetype reassignments, and any page errors noticed (for faculty, not for fixing).

## Target list — the 33 pages missing metadata

Verified against `topic_meta.json` keys vs the `md[]` map in `build_deploy.py` (56 md pages;
20 covered before this branch, 3 exemplars added here; 33 remain). Key = deployed slug.

### Archetype A — clinical topics (full schema; `ruleOut`+`firstMove` if the page has a differential)

| # | Key | Title | Source file |
|---|---|---|---|
| 1 | `t_perinatal.md` | Perinatal | `03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md` |
| 2 | `nutrition_metabolic.md` | Nutrition & Metabolic Health | `03_Core_Topics/Nutrition/nutrition_metabolic_inpatient_teaching.md` |
| 3 | `exp_consult.md` | Capacity/Delirium/Catatonia/Withdrawal | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md` |
| 4 | `psychopharm_primer.md` | Psychopharmacology Primer | `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` |

### Archetype B — clinical skills / how-to (no `ruleOut`/`firstMove`; quiz tests applying the skill)

| # | Key | Title | Source file |
|---|---|---|---|
| 5 | `ddx.md` | Differential Dx Scaffolds | `02_Clinical_Skills/Differential_Diagnosis/inpatient_differential_scaffolds.md` |
| 6 | `pg_interview.md` | Interview & MSE Pocket Guide | `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md` |
| 7 | `pg_formulation.md` | Formulation & DDx Pocket Guide | `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md` |
| 8 | `doc_oral.md` | Documentation & Oral Presentation | `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md` |
| 9 | `exp_tx.md` | Treatment Basics | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/treatment_basics_digest.md` |
| 10 | `exp_family.md` | Family & Discharge | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md` |
| 11 | `family_modalities.md` | Family Therapy Modalities | `06_Family_and_Relational/family_therapy_modalities_inpatient.md` |
| 12 | `family_playbook.md` | Family Meeting Playbook (90-min) | `06_Family_and_Relational/family_meeting_playbook_90min.md` |
| 13 | `brief_psychotherapy.md` | Brief Psychotherapy on the Unit | `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md` |
| 14 | `protocol_library.md` | Protocol Library | `05_Psychopharmacology/Protocol_Library/protocol_library_inpatient.md` |
| 15 | `evidence_inpatient.md` | Evidence-Based Inpatient Psychiatry | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` |

### Archetype C — resource / navigation (`read, tldr, points, cta` only — **no quiz**)

| # | Key | Title | Source file |
|---|---|---|---|
| 16 | `welcome.md` | Welcome to the Rotation | `13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md` |
| 17 | `orientation.md` | Orientation Packet | `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md` |
| 18 | `core_readings.md` | Core Reading List | `14_Tracks/MS3/Student_Ready_Pack/core_reading_list.md` |
| 19 | `week1.md` | Week 1 — Foundations | `01_Six_Week_Curriculum/Week_1_Foundations/README.md` |
| 20 | `week2.md` | Week 2 — Mood/Psychosis/Pharm | `01_Six_Week_Curriculum/Week_2_Mood_Psychosis_Pharm/README.md` |
| 21 | `week3.md` | Week 3 — Psychotherapy/Personality | `01_Six_Week_Curriculum/Week_3_Psychotherapy_Personality/README.md` |
| 22 | `week4.md` | Week 4 — Family/Systems/EE | `01_Six_Week_Curriculum/Week_4_Family_Systems_EE/README.md` |
| 23 | `week5.md` | Week 5 — Acute/Emergency | `01_Six_Week_Curriculum/Week_5_Acute_Emergency/README.md` |
| 24 | `week6.md` | Week 6 — Integration/Exam | `01_Six_Week_Curriculum/Week_6_Integration_Exam/README.md` |
| 25 | `reading_map.md` | Weekly Reading Map | `14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md` |
| 26 | `osce.md` | OSCE Stations | `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md` |
| 27 | `cases.md` | Practice Cases | `14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/synthetic_practice_cases.md` |
| 28 | `shelf.md` | Shelf Review Guide | `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md` |
| 29 | `book_library.md` | MS3 Book Library | `07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md` |
| 30 | `podcast_library.md` | Podcast Library (P&P) | `12_Media/psychiatry_psychotherapy_podcast_library.md` |
| 31 | `landmark_trials.md` | Landmark Trials — Listen & Test | `07_Evidence_and_Reading/Landmark_Trials/landmark_trials_page.md` |
| 32 | `rounds_questions.md` | High-Yield Rounds Questions | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` |
| 33 | `omm_resources.md` | Osteopathic (OMM) Resources | `03_Core_Topics/OMM_Resources/omm_in_psychiatry_resources.md` |

Notes on assignments the drafter should sanity-check against the page text (per-page step 2):
`protocol_library.md` and `evidence_inpatient.md` sit near the B/C line — if the page reads as a
pure link index, demote to C (no quiz). `rounds_questions.md` is already question-formatted;
never wrap a quiz around existing questions (C is deliberate).

## Why quiz inclusion is rationed (context, not optional reading)

Every entry with a `quiz` is counted in the site's "X of Y reviewed" progress denominator and
seeds a spaced-repetition card. The A+B lists above add 15 quiz-bearing entries to the current
23 (deck grows to 38) — an intended expansion, but with clinical content only. Archetype C pages are
kept out so the progress metric keeps meaning "clinical topics reviewed," not "pages visited."
