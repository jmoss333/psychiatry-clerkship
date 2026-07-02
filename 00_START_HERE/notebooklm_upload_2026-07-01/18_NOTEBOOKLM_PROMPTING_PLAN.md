# NotebookLM Prompting Plan - Psychiatry Clerkship Library

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

## Purpose

This plan turns the uploaded Psychiatry Clerkship Library sources into useful NotebookLM outputs: student guides, faculty review materials, teaching scripts, study aids, OSCE cases, shelf questions, and audio/video overviews.

Plain-English note: this is the production playbook. It tells you what to ask NotebookLM so the library turns into concrete teaching products instead of generic summaries.

## Operating Rules For Every Prompt

Use these constraints unless deliberately overridden:

- Audience defaults to MS3 students on adult inpatient psychiatry.
- Use synthetic or de-identified examples only.
- Do not create medication dosing instructions unless a source and local protocol explicitly support them.
- Flag pending-attestation claims and local-policy items.
- Prefer concise, clinically usable outputs.
- For student-facing outputs, teach recognition, reasoning, escalation, and supervised participation.
- For faculty-facing outputs, identify evidence gaps, local-policy dependencies, and attestation needs.

## Source Selection Strategy

For broad synthesis, select:

- `00_MASTER_COMPREHENSIVE_NOTEBOOKLM_RESOURCE.md`
- `01_MS3_CORE_PACK.md`
- `03_CORE_TOPICS.md`
- `04_ACUTE_SAFETY_AND_CONSULTS.md`
- `07_EVIDENCE_LANDMARKS_ROUNDS.md`
- `12_ROOT_STRATEGY_AUDIT_QA_OPENEVIDENCE.md`

For student handouts, add:

- `02_CLINICAL_SKILLS_AND_DOCUMENTATION.md`
- `05_PSYCHOPHARMACOLOGY_AND_PROTOCOLS.md`
- `06_FAMILY_RELATIONAL_DISCHARGE.md`
- `08_CASES_OSCE_SHELF_EXAM.md`

For faculty governance, add:

- `09_FACULTY_QA_ATTESTATION_AND_ROADMAP.md`
- `10_TRACKS_AND_AUDIENCE_OVERLAYS.md`
- `17_COMPLETE_UPLOAD_MANIFEST_AND_EXCLUSIONS.md`

For deeper source discovery, add indexes:

- `15_PDF_SOURCE_INDEX_NO_FULL_TEXT.md`
- `16_AUDIO_HTML_TOOL_AND_MEDIA_INDEX.md`
- `13_OFFICE_EXTRACTS_CORE_TEACHING.md`
- `14_OFFICE_EXTRACTS_EVIDENCE_AND_FACULTY.md`

## Phase 1 - Notebook Orientation And Source Audit

Prompt 1: Source map

```text
Create a source map of this notebook. Group the uploaded sources into: MS3 core curriculum, clinical skills, core diagnoses, acute/safety, psychopharmacology, family/discharge, evidence/landmarks, cases/exam prep, faculty QA, and source indexes. For each group, say what it is best used for and what it should not be used for.
```

Prompt 2: Attestation-first risk scan

```text
Review the uploaded sources for clinical-safety and governance issues. List: (1) statements requiring faculty attestation, (2) local protocol dependencies, (3) internal inconsistencies, (4) possible overclaims, and (5) student-facing language that could imply independent practice. Prioritize P0/P1/P2.
```

Prompt 3: What should students actually read?

```text
Build a right-sized MS3 required reading list from these sources. Limit required reading to what a student can realistically complete during a six-week inpatient rotation. Separate required, optional, and faculty-only material. Include rationale for each required item.
```

## Phase 2 - Student-Facing Core Products

Prompt 4: Day 1 packet

```text
Create a polished Day 1 student packet for the adult inpatient psychiatry clerkship. Include: how to stay safe, PHI discipline, daily workflow, interview/MSE expectations, what to present on rounds, how to ask for feedback, what students may and may not do, and a first-week checklist. Keep it concise and practical.
```

Prompt 5: Pocket guide set

```text
Create a set of five one-page pocket guides: (1) psychiatric interview and MSE, (2) formulation and differential diagnosis, (3) suicide risk and safety planning, (4) acute emergencies: delirium/catatonia/withdrawal/agitation, and (5) psychopharmacology recognition and monitoring. Use bullet points, scripts, and escalation triggers.
```

Prompt 6: Weekly learning path

```text
Create a six-week learning path for the clerkship. For each week include: clinical focus, required reading, optional deeper reading, bedside skill, assignment, one rounds question, one reflection prompt, and one OSCE-style practice task.
```

Prompt 7: Daily rounds coach

```text
Create a daily rounds preparation checklist and a 60-90 second oral presentation template. Include examples for depression with suicide risk, mania with psychosis, delirium, catatonia, alcohol withdrawal, and discharge barrier/family conflict.
```

## Phase 3 - Teaching Scripts And Faculty Materials

Prompt 8: Microteaching scripts

```text
Create 12 five-minute attending microteaching scripts for inpatient rounds. Topics: MSE language, suicide risk, bipolar vs unipolar depression, first-episode psychosis, antipsychotic monitoring, delirium, catatonia, withdrawal, capacity, BPD/chronic suicidality, family meetings, and discharge planning. Each script should include a teaching question, model answer, clinical pearl, and student task.
```

Prompt 9: Faculty attestation checklist

```text
Create a faculty attestation checklist for the clinical pages. For each topic area, list the claims to verify, local policy items to confirm, medication/protocol caveats, evidence claims requiring citation review, and suggested wording changes.
```

Prompt 10: Resident-as-teacher guide

```text
Create a resident guide for supervising MS3 students on the inpatient psychiatry unit. Include how to assign patient tasks, observe interviews, give feedback, review notes, teach risk formulation, involve students in family meetings, and avoid giving students unsafe autonomy.
```

## Phase 4 - Cases, OSCEs, And Shelf Prep

Prompt 11: OSCE expansion

```text
Expand the existing OSCE set to 12 stations. Use only synthetic cases. Include station prompt, standardized patient instructions, student task, scoring checklist, entrustment anchors, critical fail behaviors, and debrief teaching points.
```

Prompt 12: Vignette question bank

```text
Create 30 NBME-style psychiatry shelf questions from the library, using synthetic vignettes. Cover mood, psychosis, anxiety/OCD/PTSD, personality, SUD/withdrawal, delirium/dementia/capacity, child/adolescent, neurodevelopmental, eating/sleep, psychopharmacology, and emergency psychiatry. Include answer, explanation, why wrong answers are wrong, and source topic.
```

Prompt 13: Rounds short-answer bank

```text
Create 100 short-answer rounds questions. For each: question, ideal 30-second answer, key evidence or landmark if available, and one clinical pearl. Sort by week of rotation and topic.
```

Prompt 14: Synthetic case conference

```text
Create a 45-minute synthetic case conference for MS3s. Include a case stem, progressive disclosure, MSE, labs/vitals snippets, differential prompts, risk formulation, family/discharge twist, final formulation, and teaching points. Do not include real patient details.
```

## Phase 5 - Audio, Video, And Study Products

Prompt 15: Audio overview - whole clerkship

```text
Create a 12-minute NotebookLM Audio Overview script for students starting the rotation. Arc: safety first, interview/MSE, differential before diagnosis, risk formulation, treatment rationale, family/discharge systems, acute emergencies, and evidence humility.
```

Prompt 16: Audio overview - acute safety

```text
Create a 10-minute audio overview on acute inpatient psychiatry for MS3s: suicide risk, agitation, violence risk, delirium, catatonia, withdrawal, capacity, and when to escalate. Tone should be calm, practical, and safety-focused.
```

Prompt 17: Video overview - family/discharge

```text
Create a video overview storyboard for family meetings and discharge planning. Include scene-by-scene narration, on-screen text, and simple visual diagrams for support map, discharge barrier map, warning signs, and task ownership.
```

Prompt 18: Flashcards

```text
Create 150 active-recall flashcards from the uploaded sources. Use cloze and question-answer formats. Separate into: Week 1 basics, diagnosis, psychopharm, safety, consult/acute, family/discharge, and shelf review. Avoid trivia; focus on clinical reasoning and can't-miss patterns.
```

## Phase 6 - Content Improvement And Maintenance

Prompt 19: Gap analysis

```text
Using the source map and current curriculum, identify the top 20 gaps that would most improve this clerkship library. Rank by student impact, clinical safety, shelf utility, faculty effort, and whether the gap is content, tool, evidence, or design.
```

Prompt 20: Rewrite for student level

```text
Take the selected source and rewrite it for MS3 students. Preserve clinical accuracy, remove faculty-only or resident-level depth, add scripts and escalation triggers, and include a pending-attestation banner if needed.
```

Prompt 21: Convert dense evidence into teaching page

```text
Convert the selected evidence section into a student-facing teaching page. Use this structure: in one line, how it presents, differential and can't-miss mimics, initial workup, acute inpatient management, what the student does, discharge essentials, high-yield pearls, and faculty attestation flags.
```

Prompt 22: Make a diagram plan

```text
Create diagram specifications for the highest-yield visual learning assets in this clerkship: differential diagnosis tree, suicide risk formulation flow, agitation ladder, delirium workup, catatonia pathway, withdrawal triage, capacity four abilities, and discharge barrier map. For each, give title, nodes, edges, learner use case, and source grounding.
```

## Recommended Production Sequence

1. Run Phase 1 prompts first to verify source organization and attestation risks.
2. Generate Day 1 packet, pocket guides, and weekly path.
3. Generate microteaching scripts and faculty attestation checklist.
4. Generate OSCE expansion and question banks.
5. Generate audio/video scripts.
6. Use gap analysis and rewrite prompts for iterative improvement.

## Quality Bar

A useful output should be:

- clinically accurate,
- source-grounded,
- MS3-appropriate,
- concise enough to use on a real rotation,
- explicit about escalation and supervision,
- free of PHI,
- transparent about pending faculty attestation.

Joshua Moss, MD | Psychiatrist
