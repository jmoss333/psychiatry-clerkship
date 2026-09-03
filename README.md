# Psychiatry Clerkship Library
**Single source of truth for the six-week adult inpatient psychiatry clerkship.**
Joshua Moss, MD | Psychiatrist · scaffolded 2026-06-26

This is a **navigation layer / card catalog**, not a second copy of your work. Each folder's README points to the
canonical asset wherever it actually lives (local repo, iCloud, Notion, Google Drive). Edit source once; the library
references it. Internal RSS/RSSM naming is retained here; a public mirror would strip it.

## Start here
- `00_START_HERE/COMPREHENSIVE_NOTEBOOKLM_RESOURCE.md` — uploadable NotebookLM master resource for the full clerkship library.
- `docs/superpowers/plans/_AUDIT_AND_ROADMAP.md` — the full audit, gap analysis, curriculum, and roadmap (Phases 1–9).
- `_MASTER_INDEX.xlsx` — searchable index of catalogued assets (filter by status/priority/category).
- `99_Archive/root-planning-2026-07/_CODEX_AUDIT_INTEGRATION.md` — verdict + merge log for the parallel Codex audit (exhaustive 11,700-file census + MS3 student pack now folded in).
- `00_START_HERE/` — orientation, syllabus, "A Day on the Unit"; `_audit-census-codex/` holds the exhaustive census + parallel reports.

## Built so far (live content)
- **Interactive teaching tools** (6, single-file HTML, Clinical Warm): MSE builder (`02_Clinical_Skills/Mental_Status_Exam/`, now with a Language & Interview tab) · Decisional Capacity (`04_Acute_and_Safety/Decisional_Capacity/`) · Oral Presentation + timer (`02_Clinical_Skills/Oral_Presentations/`) · Violence Risk / FRST (`04_Acute_and_Safety/Violence_Risk/`) · Withdrawal scales CIWA-Ar/COWS (`03_Core_Topics/SUD_Withdrawal/`) · Reflection + PIF set (`02_Clinical_Skills/Reflection_PIF/`).
- **MS3 Student Pack** (15 markdown files: orientation, pocket guides, OSCE set, shelf guide, synthetic cases, weekly reading map, expansion modules) → `14_Tracks/MS3/Student_Ready_Pack/`.
- **Exhaustive census + duplicate log** (11,700 files / 2,785 dup groups) → `00_START_HERE/_audit-census-codex/`.

## How it's organized
| # | Folder | Holds |
|---|---|---|
| 00 | START_HERE | Orientation, syllabus, week-0 checklist, glossary |
| 01 | Six_Week_Curriculum | Week 1–6 modules (objectives, readings, skills, cases, reflection) |
| 02 | Clinical_Skills | Interviewing · MSE · Formulation · Documentation · Presentations · DDx · Reflection |
| 03 | Core_Topics | Mood · Psychosis · Anxiety · SUD/Withdrawal · Personality · Geriatric · Perinatal |
| 04 | Acute_and_Safety | Suicide/safety · Violence · Agitation/restraint · Capacity · Delirium · Catatonia |
| 05 | Psychopharmacology | Student Top-10 primer · Protocol library (taper, clozapine, order sets) |
| 06 | Family_and_Relational | RSS frame · family meeting playbook · EE · canonical FT deck |
| 07 | Evidence_and_Reading | Landmark library · 6-wk reading pathway · Journal Club · guidelines |
| 08 | Cases_and_Simulation | Composite cases · population case studies · decision labs |
| 09 | Exam_Prep | Shelf high-yield · OSCE stations |
| 10 | Patient_and_Family_Education | References into psychoed-library & post-discharge-kit |
| 11 | AI_and_Prompts | Student-safe prompt set · Teaching-Prep agent |
| 12 | Media | Videos (QR) · podcasts · audiobooks · NotebookLM audio |
| 13 | Faculty_Resources | Teaching scripts · eval/supervision templates · elective application |
| 14 | Tracks | MS3 · Sub-I/MS4 · Resident · CAP · SW · Nursing · Patients/Families overlays |
| 99 | Archive | Retired versions (FT deck dups, RSSM v10, manual v1, raw exports) |

## Multi-track model
Content never forks. `14_Tracks/<audience>/` holds only a short ordered list of links into the shared body.
MS3 is the default build; later tracks are overlays.

## Operations and maintenance

The [scheduled maintenance operations runbook](13_Faculty_Resources/_automation/maintenance/README.md)
is the operator source of truth for UTC schedules, 90-day evidence, production canaries,
faculty-review queues, rotation readiness, pause/resume steps, and privacy boundaries.
[Curriculum surveillance](13_Faculty_Resources/_automation/surveillance/README.md) documents the
rolling report inbox and its human review lifecycle. Scheduled GitHub workflows become active only
from the default branch; branch-local cron files are not live schedules.

**Status tags:** ✅ Exists · 🔧 Revise · ➕ Expand · ✳️ Create · 🔀 Merge · 🗄️ Archive
