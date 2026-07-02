# Psychiatry Clerkship Library — Master Audit, Architecture & Curriculum

**Prepared for:** Joshua Moss, MD | Psychiatrist
**Date:** June 26, 2026
**Scope:** Single source of truth for a six-week adult inpatient psychiatry clerkship library — built from a comprehensive audit of existing work, designed for multi-track scalability (MS3 → Sub-I → Resident → CAP fellow → SW/Nursing → Patients & Families).
**Companion file:** `Psychiatry_Clerkship_Library_Master_Index.xlsx` (Phase 8 searchable index)

> **Design law:** This plan *reuses* existing assets before recommending anything new. Every gap recommendation is tagged **Exists / Revise / Expand / Create**. No content was created during the audit. No PHI appears anywhere in this corpus — all cases are fictional composites.

---

## Executive summary

You are not starting from zero. You are sitting on **one of the most complete inpatient-psychiatry teaching corpora a single clinician is likely to own** — it is simply scattered across four systems (local repo, iCloud Drive, Notion, Google Drive) and three naming generations. The audit found a mature **Landmark Article Library (100 papers + 15-paper rotation pathway + 6 Journal-Club-in-a-Box packets)**, a **Relational Psychiatry Teaching Manual**, a full **BHU2 inpatient protocol suite** (suicide/CSSRS, delirium, catatonia-adjacent, benzo taper, clozapine, restraint), a **family-therapy didactic franchise**, a **published patient/family psychoeducation library** (1,500+ files), and an **active MaineHealth advanced-clerkship elective application**.

The work is therefore **85% curation/consolidation, 15% net-new authoring**. The three highest-leverage moves:

1. **Consolidate four copies of the Landmark library and ~12 versions of the family-therapy deck into one canonical each** (kills the largest source of drift and confusion).
2. **Stand up the directory architecture in §5 and physically file existing assets into it** (the "librarian" pass).
3. **Author the ~10 genuinely missing student-facing modules** in §4 — almost all are short, high-yield, and shelf/OSCE-aligned (MSE, capacity how-to, presentation/rounds etiquette, shelf prep, OSCE station bank).

| Dimension | Finding |
|---|---|
| Total distinct educational assets catalogued | ~140 (excluding raw exports & build artifacts) |
| Sources spanned | Local repo · iCloud Drive · Notion · Google Drive (Apple Notes & NotebookLM audio partially covered) |
| Strongest domains | Family/relational psychiatry · landmark evidence · suicide & safety · catatonia/delirium · psychopharm protocols · patient/family psychoed |
| Weakest domains (gaps) | MSE module · capacity how-to · shelf prep · OSCE bank · presentations/rounds · student-level psychopharm primer |
| Duplicate clusters needing merge | 6 major (Landmark ×4, FT decks ×12, RSSM v10/v11, Teaching Manual v1/v2, video-scripts ×2 dirs, Raw_Records export) |
| Net-new authoring required | ~10 modules, most ≤1 build session each |

---

## 1. Phase 1 — Search coverage (where I looked)

| Source | Coverage | Key yield |
|---|---|---|
| **Local repo** `~/Code/reconnect-psychiatry-system/` | Deep | `teaching/`, `clinical-materials/`, `psychoed-library/` (1,541 files), `rssm-manual/`, `family-meeting-science/`, `post-discharge-kit/`, `population-adaptations/`, `manuscript/` |
| **Home directory** `~/` (loose files) | Deep | BHU2 protocol suite, APA guideline plans, inpatient guideline surveillance, psychoed modules, **`Library_Plan_and_Audit_Roadmap.md`**, **`Education_Hub_Blueprint.md`** |
| **iCloud Drive** | Targeted (psychiatry-scoped) | `Work & Career › Psychiatry Projects` (00–14 numbered ecosystem), `Medical Resources` (Didactics, Gen Psych Resources, Clinical Tools, Reference Materials, Transcripts), train-the-trainer program |
| **Notion** | Scoped query | **Teaching Curriculum** page + database, **Landmark Psychiatry Article Library**, Teaching-Prep & Task-Triager automation agents, ReConnect/Recovery Companion project hubs |
| **Google Drive** | Scoped query | **Landmark Psychiatry Teaching Library** folder, **Resident_Handout_2page**, **Facilitator_Teaching_Script_and_Answer_Keys**, FT case-teaching decks + video, legacy student talks (2016 Integrative Psychiatry, Class-of-2020 Clerkship Advice) |
| **NotebookLM** | Indirect | 13 audio/AI study projects + transcripts found in `teaching/notebooklm-projects/` (audio overviews) |
| **Apple Notes** | Deferred | Not crawled this pass (personal/PHI-risk); flagged for a scoped follow-up query |

**Assumptions stated:** (1) The `Psychiatry-Unit-Education/` and `Psychiatry_Preceptor_Curriculum/` directories described in `Education_Hub_Blueprint.md` are a *planning synthesis*, not on-disk folders — the concrete equivalents are the teaching manual, landmark guide, and the Notion Teaching Curriculum DB. (2) "Internal" RSS/RSSM/ReConnect naming is retained for trainee/faculty materials and stripped for any public/patient-facing layer, per your global preference.

---

## 2. Phase 2 — Inventory (catalogued by category)

Condensed catalog below; the **full row-level inventory with all requested columns** (Title, Location, Type, Topic, Level, Audience, Completeness, Last-updated, Quality, Keep/Revise/Archive) lives in `Psychiatry_Clerkship_Library_Master_Index.xlsx`.

### 2.1 Trainee & teaching spine
| Asset | Location | Type | Level | Completeness | Keep? |
|---|---|---|---|---|---|
| Landmark Psychiatry Teaching Guide (100 papers, 15-paper pathway, 6 JC packets, teaching-script template) | `teaching/landmark-psychiatry-teaching-guide.md` | MD | MS3→Attending | High | **Keep (canonical)** |
| Landmark library — Google Drive folder + Resident Handout + Facilitator Script/Answer Keys | Google Drive | Folder/PDF/DOCX | All | High | Merge → keep as export |
| Landmark Article Library | Notion page | Page/DB | All | Med | Merge → keep as live DB |
| Relational Psychiatry Teaching Manual v2 | `teaching/Relational_Psychiatry_Teaching_Manual_v2.docx` (+ v1, + source MD) | DOCX/MD | MS3→Resident | High | **Keep v2; archive v1** |
| Composite teaching cases v1 | `teaching/archive/composite_cases_v1.md` | MD | MS3→Resident | Med | Revise → promote out of archive |
| RSS video scripts (10) | `teaching/video-scripts/` **and** `teaching/video-content/Scripts/` | MD | All | High | **Merge two dirs → one** |
| 13 NotebookLM projects + audio overviews/transcripts | `teaching/notebooklm-projects/` | MD/TXT/audio | All | Med | Keep → index |
| ED→Inpatient Psych Capstone (patient materials, condition inserts, eval tools) | `teaching/ed-psych-capstone/` | Mixed | Patient/Staff | High | Keep |
| Video QR system | `teaching/video-qr-system/` | PDF/MD | All | High | Keep |
| Gen Psych didactic decks (Intern Bootcamp, Barkley ADHD, CPT, Exposure, cultural & biopsychosocial formulation samples) | iCloud `Medical Resources/Gen Psych Resources/` | PPTX/PDF/DOCX | MS3→Resident | High | Keep → harvest |
| ASCP Psychopharmacology Curriculum (11th ed) | iCloud `Gen Psych Resources/` | Folder | Resident/Faculty | High (external) | Keep as reference |
| Notion **Teaching Curriculum** DB + Teaching-Prep agent | Notion | DB/automation | Faculty | Med | Keep → wire to library |
| A Day on the Unit — Walkthrough | iCloud `Work & Career/` + repo | DOCX | MS3 | Med | Revise → orientation |

### 2.2 Inpatient clinical workflow / protocols (BHU2 — directly clerkship-relevant)
| Asset | Location | Type | Use | Keep? |
|---|---|---|---|---|
| BHU2 Top-20 Pocket Card 2026 | `~/BHU2_Top20_Pocket_Card_2026.html` | HTML | Student pocket reference | **Keep (flagship)** |
| Suicide Safer-Discharge Checklist + C-SSRS/Safety-Plan EHR field spec | `~/BHU2_Suicide_Safer_Discharge_Checklist.html`, `~/CSSRS_SafetyPlan_EHR_Field_Spec.docx` | HTML/DOCX | Risk & disposition | Keep |
| Delirium Prevention Checklist + Order-Set Spec | `~/BHU2_Delirium_Prevention_Checklist.html`, `~/Delirium_OrderSet_Spec.docx` | HTML/DOCX | Delirium | Keep |
| Benzodiazepine Taper Checklist + Order-Set Spec | `~/BHU2_Benzodiazepine_Taper_Checklist.html`, `~/Benzodiazepine_Taper_OrderSet_Spec.docx` | HTML/DOCX | Withdrawal/taper | Keep |
| Clozapine Post-REMS Workflow + Order-Set Spec | `~/BHU2_Clozapine_PostREMS_Workflow.html`, `~/Clozapine_PostREMS_OrderSet_Spec.docx` | HTML/DOCX | Psychopharm | Keep |
| Restraint/Physical-Holding Checklist + Order-Set Spec | `~/BHU2_Restraint_PhysicalHolding_Checklist.html`, `~/Restraint_PhysicalHolding_OrderSet_Spec.docx` | HTML/DOCX | Agitation/safety | Keep |
| BHU2 Implementation Packet + Committee Deck + Protocol/Order-Set Drafts | `~/BHU2_Implementation_*.{docx,pptx}` | DOCX/PPTX | Faculty/systems | Keep (faculty track) |
| Inpatient Psychiatry Guideline Surveillance 2023–2026 | `~/Inpatient_Psychiatry_Guideline_Surveillance_2023-2026.docx` | DOCX | Guideline library | **Keep (guidelines hub)** |
| APA Guideline Highlights Plan + Build Plan v2 | `~/APA_Guideline_Highlights_Plan.md`, `~/Guideline_Highlights_Build_Plan_v2.md` | MD | Guideline highlights | Revise → execute |
| Catatonia discharge instructions | `~/Documents/.../catatonia dc instruct.pdf` | PDF | Catatonia | Keep |
| Psychiatric documentation template; PQ-B; SIPS cheat sheets | iCloud `Medical Resources/Clinical Tools/` | MD/PDF/DOCX | Documentation/screening | Keep → harvest |

### 2.3 Family / relational psychiatry (signature differentiator)
| Asset | Location | Type | Keep? |
|---|---|---|---|
| Family Meeting Science suite (ward protocol, 12-cases paper, systematic review, intervention taxonomy, LEFI fidelity instrument + scoring workbook) | `family-meeting-science/` | MD/XLSX | **Keep (research+teaching core)** |
| Family-therapy inpatient didactic decks — **~12 versions** (REVAMP, REVAMP2, FINAL Animated, Psychiatrist-Edited, WITH_VIDEO_EMAIL, Clinical/Inpatient Family Blueprint, .key, .pptx, .pdf, Google Slides + video) | Downloads / iCloud / Google Drive | PPTX/PDF/KEY/Slides | **Merge → 1 canonical + 1 archive** |
| "The Family is the Milieu" FINAL (+ with-video) | Downloads / iCloud | DOCX/PPTX | Keep (canonical narrative) |
| FTM papers & briefs; FTM audio (by-topic + quarantine) | `_assets/ftm-papers/`, `_assets/ftm-audio/` | PDF/audio | Keep → index |
| Family Integrated Inpatient Recovery; FT inpatient systematic review | Downloads | PDF/MD | Keep |
| Clinical Implementation Spine (Family Meeting Playbook 90-min, First Three Sessions, MVP Milieu, Family-Supported Adherence, Risk-Stratified Discharge) | `clinical-materials/Clinical_Implementation_Spine/` | MD | **Keep (faculty/resident)** |

### 2.4 RSSM framework manual
| Asset | Location | Keep? |
|---|---|---|
| RSSM Master **v11** (newest) + v10 | `rssm-manual/RSSM_Master_v11.docx`, `…v10.docx` | **Keep v11; archive v10** |
| RSSM publication set (journal article v2, glossary, index, appendices I/J/K) | `rssm-manual/publication/` | Keep |
| RSSM v10 stray copies | `~/Downloads/RSSM_Master_v10.docx`, `…Primer…md` | **Archive (stale dups)** |
| RSSM audiobook plan; cross-reference audit | `manuscript/` | Keep |

### 2.5 Patient & family psychoeducation (published library — links into clerkship, not core)
| Asset | Location | Notes |
|---|---|---|
| Psychoed library — patient-materials (20), family (77), infographics (54), patient-journey (44) | `psychoed-library/` | **Keep (processed)** |
| Psychoed library — **Raw_Records (1,339)** | `psychoed-library/Raw_Records/` | Raw Notion export → **archive once processed content verified** |
| Post-discharge kit (bundles by dx, perinatal, caregiver, crisis de-escalation, admission packet) | `post-discharge-kit/` | Keep |
| Population adaptations (Forensic, Refugee, IDD, Perinatal — case studies + clinician notes) | `population-adaptations/` | Keep (multi-track seed) |
| Depression First Steps; SSRI First 6 Weeks (patient) | `~/Depression_First_Steps_PAT.html`, `~/Medication_First_6_Weeks_SSRI_PAT.html` | Keep |
| Book + Podcast Library plan (verified seed catalog) | `~/Library_Plan_and_Audit_Roadmap.md` | Keep → build |

### 2.6 Planning / meta / infrastructure
| Asset | Location | Notes |
|---|---|---|
| Education Hub Blueprint (3-path architecture) | `~/Education_Hub_Blueprint.md` | Foundational — partially superseded by this plan |
| Library Plan & Audit Roadmap (Book/Podcast) | `~/Library_Plan_and_Audit_Roadmap.md` | Foundational |
| Clinical Warm design system | `~/clinical-warm-design-system.html` | Keep (styling) |
| Control Tower / Action Plan / dashboards / curriculum-site.html | `~/`, iCloud | Keep (PM layer) |
| **MH Advanced Clerkship — New Elective Application AY26-27** | `~/Downloads/MH Advanced Clerkship New Elective Application AY26-27.pdf` | **Keep (drives requirements)** |

---

## 3. Phase 3 — Duplicate & version analysis

| # | Cluster | Instances | Recommendation |
|---|---|---|---|
| 1 | **Landmark library** | repo MD · Google Drive folder (+handout+facilitator keys) · Notion page/DB · (implied iCloud) | **Keep repo MD as canonical source of truth.** Notion DB = live editable view; Google Drive = distribution export (handout + facilitator keys). Reconcile the "100 papers / 50-paper / 15-paper pathway" naming so counts agree. Fix internal mislabel: the "15-paper" pathway lists **16** numbered entries. |
| 2 | **Family-therapy didactic deck** | ~12 versions across Downloads, iCloud, Google Drive | **Pick ONE canonical** (recommend the most recent *Psychiatrist-Edited* / *FINAL with video* lineage), move the rest to `99_Archive/`. This is the single biggest hygiene win. |
| 3 | **RSSM Master** | v11 + v10 (repo) + v10 (Downloads) + Primer.md | **Keep v11.** Archive all v10 copies. |
| 4 | **Relational Psychiatry Teaching Manual** | v1 docx · v2 docx · source MD (repo) · iCloud .md | **Keep v2 + source MD.** Archive v1; reconcile iCloud copy to the repo source. |
| 5 | **RSS video scripts** | `teaching/video-scripts/` *and* `teaching/video-content/Scripts/` (same 10) | **Merge to one directory**; delete the duplicate tree. |
| 6 | **psychoed-library/Raw_Records (1,339)** | Raw Notion export overlapping processed `patient-materials/`, `family/`, `infographics/` | **Archive the raw export** once processed equivalents are confirmed complete; keep a single MANIFEST mapping raw→processed. |

**Net effect of executing dedupe:** ~30+ redundant files retired, four "single source of truth" anchors established (Landmark MD, FT canonical deck, RSSM v11, Teaching Manual v2).

---

## 4. Phase 4 — Gap analysis vs. an ideal inpatient clerkship

Each domain tagged **Exists / Revise / Expand / Create**. "Exists" = usable today; "Create" = genuine net-new (most are short).

| # | Domain | Status | Anchor asset (reuse) | Action |
|---|---|---|---|---|
| 1 | Clerkship **orientation** (logistics, expectations, "a day on the unit") | **Revise** | `A_Day_on_the_Unit_Walkthrough.docx` | Wrap into `00_START_HERE` syllabus + week-0 checklist |
| 2 | **Psychiatric interviewing** (incl. agitated/guarded patient, trauma-informed) | **Expand** | RSS video scripts; Gen Psych decks | Author a 1-page interviewing module + 2 demo clips |
| 3 | **Mental Status Exam** teaching module | **Create** | `Appearance Behavior.pdf` (fragment only) | Author MSE module + pocket card + annotated exemplar |
| 4 | **DSM-5-TR diagnosis overview / differential** | **Create/Expand** | Landmark guide; composite cases | Author DDx scaffolds for top 8 unit presentations |
| 5 | **Psychopharmacology — student primer** (vs. faculty protocols) | **Expand** | BHU2 protocol suite; ASCP curriculum | Author "Top-10 inpatient drugs" student tier above the protocols |
| 6 | **Emergency psychiatry / agitation management** | **Expand** | Restraint checklist; order-set drafts | Author agitation-ladder teaching module (verbal→PRN→restraint) |
| 7 | **Decisional capacity** how-to | **Create** | Appelbaum paper in Landmark guide | Author capacity bedside module (4 abilities + sample note) |
| 8 | **Delirium** | **Exists** | Delirium checklist + order-set | Link into Week-5 acute block |
| 9 | **Catatonia** | **Exists** | Bush-Francis JC packet; catatonia dc pdf | Link; add BFCRS screening card |
| 10 | **Suicide & violence risk** | **Exists** | C-SSRS/Safety-Plan spec; Safer-Discharge; Stanley-Brown JC packet | Link; add violence-risk one-pager |
| 11 | **Substance use & withdrawal** (CIWA/COWS) | **Expand** | Benzo taper; Volkow JC | Add CIWA/COWS quick-use card |
| 12 | **Personality disorders / DBT** | **Exists** | Linehan JC packet; book/podcast catalog | Link |
| 13 | **Psychotherapy basics** (common factors, CBT/DBT/MI, exposure, CPT) | **Exists** | Gen Psych decks (CPT, exposure, Beck); Wampold JC | Curate into Week-3 reading + skills |
| 14 | **Family meetings / EE** | **Exists (strong)** | Family Meeting Science; FT decks; Brown EE + Pharoah JC | Flagship — link prominently |
| 15 | **Documentation** (H&P, progress, presentation note) | **Expand** | `psychiatric-documentation-template.md`; Epic note makeovers | Author student note exemplars + checklist |
| 16 | **Oral presentation / rounds etiquette** | **Create** | — | Author "present a psych patient in 3 min" + rounds-prep card |
| 17 | **Clinical reasoning / case formulation** | **Expand** | Biopsychosocial formulation samples; FTM relational formulation figure | Author formulation worksheet (BPS + relational) |
| 18 | **Evidence-based medicine / journal club** | **Exists (strong)** | 6 Journal-Club-in-a-Box packets; teaching-script template | Link; schedule across 6 weeks |
| 19 | **Reading assignments** | **Exists** | 15-paper pathway (extend 4→6 wk) | Re-sequence to 6 weeks (see §6) |
| 20 | **Pocket references** | **Exists** | BHU2 Top-20 Pocket Card | Add MSE + CIWA/COWS cards to the set |
| 21 | **Shelf / NBME exam prep** | **Create** | — | Author shelf high-yield map + 50-item self-check |
| 22 | **OSCE / standardized-patient stations** | **Create** | Composite cases; capacity/safety modules | Author 4–6 OSCE stations w/ checklists |
| 23 | **Professional identity / ethics / boundaries** | **Create** | Rosenhan JC (labeling) | Author short ethics/PIF reflection set |
| 24 | **Disposition & discharge planning** | **Exists (strong)** | Risk-Stratified Discharge Pathway; Maine aftercare; post-discharge kit | Link |
| 25 | **Daily reflection exercises** | **Create** | Video content prompts | Author 6 weekly reflection prompts |
| 26 | **Cases & simulation** | **Exists** | `composite_cases_v1.md`; population case studies | Promote from archive; map to weeks |
| 27 | **Consult-psychiatry etiquette** (if C-L exposure) | **Create (optional)** | — | Optional one-pager |
| 28 | **Multimedia** (video/podcast/audiobook) | **Exists/Expand** | RSS videos; NotebookLM audio; Book+Podcast plan | Index into `12_Media` |
| 29 | **AI-assisted learning / prompts** | **Exists** | Notion Teaching-Prep agent; prompt-stack | Surface a student-safe prompt set |

**Gap verdict:** Of 29 domains, **15 already Exist**, **8 need Expand/Revise**, **~10 need Create** — and the Creates are mostly 1–2 page high-yield assets directly tied to shelf/OSCE performance. This is a finishing job, not a build-from-scratch.

---

## 5. Phase 5 — Ideal library architecture (scalable, multi-track)

A single numbered tree, audience-tagged, designed so new tracks and topics slot in without reorganizing. Internal RSS/RSSM naming retained; a public mirror would strip it.

```
Psychiatry-Clerkship-Library/
├── 00_START_HERE/                 # syllabus, how-to-use, "A Day on the Unit", week-0 checklist, glossary
├── 01_Six_Week_Curriculum/        # Week_1 … Week_6 (each: objectives, readings, skills, cases, reflection)
├── 02_Clinical_Skills/
│   ├── Interviewing/              # incl. agitated/guarded, trauma-informed
│   ├── Mental_Status_Exam/        # ⭐ CREATE: module + pocket card + exemplar
│   ├── Case_Formulation/          # BPS + relational worksheet
│   ├── Documentation/             # H&P, progress, note exemplars + checklist
│   ├── Oral_Presentations/        # ⭐ CREATE: 3-min present + rounds-prep card
│   └── Differential_Diagnosis/    # DDx scaffolds, top 8 presentations
├── 03_Core_Topics/                # Mood · Psychosis · Anxiety · SUD/Withdrawal · Personality · Geri · Perinatal
├── 04_Acute_and_Safety/
│   ├── Suicide_Risk_and_Safety_Planning/   # C-SSRS, Stanley-Brown, Safer-Discharge
│   ├── Violence_Risk/             # ⭐ CREATE one-pager
│   ├── Agitation_and_Restraint/   # agitation ladder + restraint checklist
│   ├── Decisional_Capacity/       # ⭐ CREATE: 4-abilities module + sample note
│   ├── Delirium/                  # checklist + order set
│   └── Catatonia/                 # BFCRS card + JC packet + dc instructions
├── 05_Psychopharmacology/
│   ├── Student_Primer_Top10/      # ⭐ EXPAND: student tier
│   └── Protocol_Library/          # benzo taper, clozapine post-REMS, order-set specs
├── 06_Family_and_Relational/      # RSS frame · Family Meeting Playbook · EE · canonical FT deck
├── 07_Evidence_and_Reading/
│   ├── Landmark_Library/          # canonical 100-paper MD + spreadsheet
│   ├── Reading_Pathway_6wk/       # re-sequenced (see §6)
│   ├── Journal_Club_in_a_Box/     # 6 packets
│   └── Guidelines/                # APA highlights + surveillance doc
├── 08_Cases_and_Simulation/       # composite cases + population case studies + decision labs
├── 09_Exam_Prep/
│   ├── Shelf_High_Yield/          # ⭐ CREATE
│   └── OSCE_Stations/             # ⭐ CREATE: 4–6 stations + checklists
├── 10_Patient_and_Family_Education/  # links → psychoed-library, post-discharge-kit (read-only refs)
├── 11_AI_and_Prompts/             # student-safe prompt set; Teaching-Prep agent
├── 12_Media/                      # videos (QR), podcasts, audiobooks, NotebookLM audio
├── 13_Faculty_Resources/          # teaching-script template, eval/supervision templates, elective application, guideline build plans
├── 14_Tracks/                     # MS3 · Sub-I_MS4 · Resident_PGY2 · CAP_Fellow · SW · Nursing · Patients_Families
├── 99_Archive/                    # retired versions (FT deck dups, RSSM v10, manual v1, raw exports)
├── _MASTER_INDEX.xlsx
└── _AUDIT_AND_ROADMAP.md          # this document
```

**Multi-track mechanism:** `14_Tracks/<audience>/` holds only a short **track map** (objectives + an ordered list of links into the shared body) — content never forks. MS3 is the default build; each later track is an overlay (Sub-I adds leadership/sign-out + deeper psychopharm; Resident adds ACGME milestones + supervision; CAP adds developmental lens; SW/Nursing emphasize milieu/safety/family; Patients-Families points to `10_`).

---

## 6. Phase 6 — Six-week inpatient curriculum (reuse-first)

Extends your existing **4-week, 16-paper** Landmark pathway to a **6-week** arc, mapped onto RSS Layers 1→4 and the inpatient workflow. Each week: ~3–4 hrs of structured learning outside clinical time. **R** = required, **O** = optional. Every line tagged with reuse status.

### Week 1 — Foundations & Orientation *(RSS L1: Biological Stabilization)*
- **Objectives:** Orient to the unit; conduct a basic psychiatric interview; structure an MSE; write an admission note.
- **Readings (R):** Engel 1977 (BPS) · Rosenhan 1973 (labeling) · Appelbaum-Grisso 1988 (capacity). *(Exists — Landmark pathway #1–3)*
- **Skills:** Interview observation → first solo interview; **MSE module** *(Create)*; admission-note exemplar *(Expand)*.
- **Pocket refs:** BHU2 Top-20 Pocket Card *(Exists)*; MSE card *(Create)*.
- **Case:** Composite case #1 *(Exists — promote from archive)*.
- **Reflection:** "What did the label do?" (Rosenhan) *(Create)*.
- **Workflow tie-in:** shadow admissions; capacity question on rounds.
- **Time:** ~3.5 hr.

### Week 2 — Mood, Psychosis & Pharmacology *(RSS L1→L2)*
- **Objectives:** Differential for depression/mania/psychosis; measurement-based care; antipsychotic selection logic.
- **Readings (R):** CATIE 2005 · STAR*D 2006 · Bush 1996 (Catatonia rating). **JC#1 CATIE** + **JC#5 Catatonia**. *(Exists)*
- **Skills:** Student psychopharm primer — Top-10 inpatient drugs *(Expand)*; BFCRS screening on any mute/immobile patient *(Exists)*.
- **Case:** Psychosis/mania composite *(Exists)*.
- **Reflection:** "Pick by profile, not class" — apply CATIE to a unit patient *(Create prompt)*.
- **Time:** ~4 hr.

### Week 3 — Psychotherapy, Personality & the Relationship *(RSS L3: Relational Connection)*
- **Objectives:** Common factors; DBT logic for BPD; basic CBT/MI/exposure literacy.
- **Readings (R):** Wampold 1997 · Linehan 1991 · (O) Ramsay ADHD-CBT. **JC#3 Safety Planning.** *(Exists)*
- **Skills:** Common-factors micro-skills; safety-plan with a real patient (supervised) *(Exists — Stanley-Brown)*; formulation worksheet BPS+relational *(Expand)*.
- **Media (O):** Exposure-therapy & CPT didactic decks *(Exists — harvest)*.
- **Case:** BPD/safety composite *(Exists)*.
- **Reflection:** rupture-and-repair moment journal *(Create)*.
- **Time:** ~3.5 hr.

### Week 4 — Family, Systems & Expressed Emotion *(RSS L3→L4; signature week)*
- **Objectives:** Run/observe a family meeting; recognize high-EE; cite the family-intervention evidence.
- **Readings (R):** Brown 1972 (EE) · Pharoah 2010 (Cochrane family intervention). **JC#2 EE** + **JC#6 Family Intervention.** *(Exists)*
- **Skills:** Family Meeting Playbook 90-min *(Exists)*; observe → co-facilitate a meeting; EE-spotting checklist.
- **Media:** canonical Family-Therapy deck + "Family is the Milieu" *(Exists — after dedupe)*; FTM audio overview *(Exists)*.
- **Case:** family-collateral composite *(Exists)*.
- **Reflection:** "What would I change in that family meeting?" *(Create)*.
- **Time:** ~4 hr.

### Week 5 — Acute & Emergency Psychiatry *(RSS L1 under stress)*
- **Objectives:** Manage agitation safely; recognize delirium & catatonia; assess violence risk; reduce means.
- **Readings (R):** Franklin 2017 (suicide prediction limits) · Volkow 2016 (addiction). **(O)** Bush catatonia review. *(Exists)*
- **Skills:** Agitation ladder verbal→PRN→restraint *(Expand)*; Delirium prevention checklist *(Exists)*; CIWA/COWS quick-card *(Create)*; violence-risk one-pager *(Create)*.
- **Pocket refs:** Restraint checklist; Benzo taper; Clozapine post-REMS *(Exists)*.
- **Case:** substance + psychosis + risk composite *(Exists)*.
- **Reflection:** "Document reasoning, not certainty" (Franklin) *(Create)*.
- **Time:** ~4 hr.

### Week 6 — Integration, Disposition & Exam Readiness *(RSS L4: Functional Engagement)*
- **Objectives:** Build a discharge/disposition plan; integrate a full case; demonstrate shelf/OSCE readiness.
- **Readings (R):** ACE 1998 (Felitti) · Deegan 1996 (recovery). *(Exists)*
- **Skills:** Risk-Stratified Discharge Pathway *(Exists)*; Maine aftercare disposition case *(Exists)*; **shelf high-yield review + 50-item self-check** *(Create)*; **OSCE stations** (capacity, safety plan, family meeting, MSE) *(Create)*.
- **Capstone:** full oral case presentation *(Create rubric)* + relational formulation.
- **Reflection:** end-of-rotation professional-identity reflection *(Create)*.
- **Time:** ~4.5 hr.

> **Resident overlay (PGY-2, 4-wk compression):** same spine, add ACGME-milestone mapping, the teaching-script template (teach one landmark paper at rounds), and supervision/eval templates. **Sub-I overlay:** add sign-out/leadership + deeper psychopharm. Both reuse the same modules.

---

## 7. Phase 7 — Prioritized reuse ledger

Single view of what to reuse vs. build, ordered by leverage.

| Priority | Item | Status | Effort |
|---|---|---|---|
| P0 | Canonicalize Landmark library (repo MD ⟷ Notion DB ⟷ GDrive export); fix 15-vs-16 count | **Revise** | Low |
| P0 | Merge ~12 FT decks → 1 canonical + archive | **Revise** | Low |
| P0 | Stand up §5 directory tree; file existing assets | **Exists→file** | Med |
| P1 | MSE module + pocket card + exemplar | **Create** | Low |
| P1 | Decisional-capacity bedside module + sample note | **Create** | Low |
| P1 | Oral-presentation / rounds-etiquette card + 3-min rubric | **Create** | Low |
| P1 | Student psychopharm primer (Top-10 inpatient) | **Expand** | Low |
| P1 | Documentation exemplars + checklist | **Expand** | Low |
| P2 | Shelf high-yield map + 50-item self-check | **Create** | Med |
| P2 | OSCE station bank (4–6) + checklists | **Create** | Med |
| P2 | Agitation ladder; CIWA/COWS card; violence-risk one-pager | **Create/Expand** | Low |
| P2 | 6 weekly reflection prompts + ethics/PIF set | **Create** | Low |
| P3 | Book + Podcast library build (already specced) | **Exists→build** | Med |
| P3 | Media index (videos/podcasts/audiobooks/NotebookLM) | **Expand** | Low |
| P3 | Archive Raw_Records after processed-content verification | **Archive** | Low |

---

## 8. Phase 8 — Master index

Delivered as the companion spreadsheet `Psychiatry_Clerkship_Library_Master_Index.xlsx` with columns: **Title · Category · Subcategory · Format · Topic · Educational Level · Difficulty · Est. Reading/Use Time · Clinical Relevance · Current Status · Priority · Location · Recommended Action.** Filterable/sortable; one row per distinct asset (duplicates collapsed to their canonical with variants noted).

---

## 9. Phase 9 — Phased implementation roadmap

| Phase | Goal | Concrete deliverables | Depends on |
|---|---|---|---|
| **R1 — Organize** | One home, one copy | Build §5 tree; execute §3 dedupe; file assets; publish this doc + index as the tree's README | Audit (done) |
| **R2 — Revise** | Fix drift | Canonical Landmark (counts reconciled); canonical FT deck; RSSM v11 only; Teaching Manual v2 only; APA guideline highlights executed | R1 |
| **R3 — Create gaps** | Finish MS3 spine | P1+P2 modules (MSE, capacity, presentations, psychopharm primer, documentation, shelf, OSCE, agitation/CIWA/violence, reflections) | R1 |
| **R4 — Multimedia** | Add modalities | Media index; Book+Podcast library v1; QR/video wiring; NotebookLM audio surfaced | R2 |
| **R5 — AI-assisted** | Smart layer | Student-safe prompt set; wire Notion Teaching-Prep agent to the curriculum DB; weekly auto-reading nudge | R3 |
| **R6 — Polish & open tracks** | Scale | Public-facing mirror (RSS naming stripped); activate `14_Tracks/` overlays (Sub-I, Resident, CAP, SW/Nursing, Patients-Families); align to MH elective application | R1–R5 |

---

## 10. Guiding principles (locked)

Reuse before create · preserve high-quality assets · one canonical per concept · scalable numbered architecture · internal RSS naming for trainees, stripped for public · **fictional composites only, zero PHI** · this document + the index are the single source of truth and the tree's front door.

## 11. Immediate next actions (your call)

1. **Approve the §5 directory structure** — then I can scaffold it (empty tree + README stubs) and file existing assets into it as a non-destructive first pass.
2. **Greenlight the P0 dedupe** — I'll move redundant FT decks and stale RSSM/manual copies into `99_Archive/` (reversible).
3. **Pick the first 3 modules to author** from the P1 list (recommend MSE, capacity, oral-presentation — highest shelf/OSCE yield, lowest effort).

*Single source of truth. Reuse-first. Built to grow without disorganizing.*
*Joshua Moss, MD | Psychiatrist*
