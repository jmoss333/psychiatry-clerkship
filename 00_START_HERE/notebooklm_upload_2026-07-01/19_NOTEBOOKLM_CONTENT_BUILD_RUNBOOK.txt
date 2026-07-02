# NotebookLM Content Build Runbook - Psychiatry Clerkship Library

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

## Purpose

This runbook converts the uploaded Psychiatry Clerkship Library into a complete set of
NotebookLM-generated teaching products: student guides, faculty materials, OSCEs, shelf
questions, safety references, media scripts, and QA artifacts.

Plain-English note: the notebook now has the ingredients. This runbook is the recipe. It tells
NotebookLM exactly what to make first, how to format it, and how to check whether it is safe and
usable.

## Master Rules For Every Content Prompt

Paste this block at the top of every major prompt unless a product-specific prompt says otherwise.

```text
Act as a senior psychiatry clerkship director building MS3 teaching materials for adult inpatient
psychiatry. Use only the selected NotebookLM sources. Do not invent citations, protocols, or local
policies. Use synthetic or de-identified examples only. Do not include real patient details. Keep
student-facing material within supervised MS3 scope. Flag anything that requires faculty
attestation, local policy confirmation, medication dosing verification, or updated evidence review.

For the output, include:
1. Title
2. Intended audience
3. How to use this on rotation
4. Main content
5. Red flags / escalation triggers
6. Faculty attestation flags
7. Sources used, by source filename
8. Suggested next prompt
```

## NotebookLM Workflow

Use this same workflow for every product.

1. Select the relevant sources in the left panel.
2. Paste the prompt into chat.
3. Ask for revision if the first output is too generic, too long, or not source-grounded.
4. Save the final response as a note.
5. Name the note using the naming convention below.
6. Run the QA prompt for that product.
7. Save the QA result as a companion note.

### Note Naming Convention

Use these prefixes so the notebook stays organized:

- `00 Governance - ...`
- `01 Student Core - ...`
- `02 Pocket Guide - ...`
- `03 Weekly Curriculum - ...`
- `04 Faculty Teaching - ...`
- `05 OSCE and Assessment - ...`
- `06 Media - ...`
- `07 QA - ...`
- `08 Maintenance - ...`

## Source Sets

### Global Source Set

Use for broad synthesis, planning, and cross-curricular products:

- `00_MASTER_COMPREHENSIVE_NOTEBOOKLM_RESOURCE.md`
- `01_MS3_CORE_PACK.md`
- `03_CORE_TOPICS.md`
- `04_ACUTE_SAFETY_AND_CONSULTS.md`
- `07_EVIDENCE_LANDMARKS_ROUNDS.md`
- `12_ROOT_STRATEGY_AUDIT_QA_OPENEVIDENCE.md`
- `17_COMPLETE_UPLOAD_MANIFEST_AND_EXCLUSIONS.md`

### Student Core Source Set

Use for orientation packets, weekly guides, pocket guides, and student-facing learning tools:

- `00_MASTER_COMPREHENSIVE_NOTEBOOKLM_RESOURCE.md`
- `01_MS3_CORE_PACK.md`
- `02_CLINICAL_SKILLS_AND_DOCUMENTATION.md`
- `03_CORE_TOPICS.md`
- `04_ACUTE_SAFETY_AND_CONSULTS.md`
- `05_PSYCHOPHARMACOLOGY_AND_PROTOCOLS.md`
- `06_FAMILY_RELATIONAL_DISCHARGE.md`
- `08_CASES_OSCE_SHELF_EXAM.md`

### Acute Safety Source Set

Use for suicide risk, agitation, violence risk, delirium, catatonia, withdrawal, capacity, and
consult-liaison teaching:

- `04_ACUTE_SAFETY_AND_CONSULTS.md`
- `05_PSYCHOPHARMACOLOGY_AND_PROTOCOLS.md`
- `07_EVIDENCE_LANDMARKS_ROUNDS.md`
- `12_ROOT_STRATEGY_AUDIT_QA_OPENEVIDENCE.md`
- `14_OFFICE_EXTRACTS_EVIDENCE_AND_FACULTY.md`

### Faculty Governance Source Set

Use for faculty review, attestation, local policy review, content QA, and roadmap work:

- `09_FACULTY_QA_ATTESTATION_AND_ROADMAP.md`
- `10_TRACKS_AND_AUDIENCE_OVERLAYS.md`
- `12_ROOT_STRATEGY_AUDIT_QA_OPENEVIDENCE.md`
- `15_PDF_SOURCE_INDEX_NO_FULL_TEXT.md`
- `17_COMPLETE_UPLOAD_MANIFEST_AND_EXCLUSIONS.md`

### Deep Archive Source Set

Use when you need to mine the broader library for additional source material:

- `13_OFFICE_EXTRACTS_CORE_TEACHING.md`
- `14_OFFICE_EXTRACTS_EVIDENCE_AND_FACULTY.md`
- `15_PDF_SOURCE_INDEX_NO_FULL_TEXT.md`
- `16_AUDIO_HTML_TOOL_AND_MEDIA_INDEX.md`
- `17_COMPLETE_UPLOAD_MANIFEST_AND_EXCLUSIONS.md`

## Build Sequence Overview

Build in this order:

1. Governance foundation
2. Student orientation and core learning products
3. Acute safety and consult products
4. Psychopharmacology and monitoring products
5. Family/discharge systems products
6. Faculty teaching and supervision products
7. OSCE, shelf, and assessment products
8. NotebookLM Studio media products
9. Final QA, gap analysis, and maintenance plan

Do not start with flashcards or media. Start with governance and source mapping so later products
do not propagate unreviewed claims.

## Phase 0 - Production Ledger

### Prompt 0.1 - Create The Production Ledger

Use: Global Source Set

Save as: `00 Governance - Production Ledger`

```text
Create a production ledger for this NotebookLM build. Make a table with these columns:
Product ID, Product title, Audience, Source set, Status, Faculty attestation needed, Local policy
dependency, Output format, Suggested note title, and Priority.

Include every major product needed for a comprehensive MS3 inpatient psychiatry clerkship
NotebookLM: source map, attestation scan, Day 1 packet, six-week curriculum, pocket guides,
rounds coach, acute safety guide, psychopharm recognition guide, family/discharge guide,
microteaching scripts, resident-as-teacher guide, OSCE stations, shelf questions, flashcards,
audio overview scripts, video storyboard, gap analysis, and maintenance checklist.
```

### Prompt 0.2 - Define The Content Standard

Use: Global Source Set

Save as: `00 Governance - Content Standard`

```text
Create a content standard for all outputs generated from this notebook. Define what counts as
clinically acceptable, student-appropriate, source-grounded, concise, and safe. Include rules for
supervision language, escalation language, medication language, evidence claims, local policy
claims, PHI avoidance, and pending faculty attestation.
```

## Phase 1 - Source Map And Risk Scan

### Prompt 1.1 - Source Map

Use: Global Source Set

Save as: `00 Governance - Source Map`

```text
Create a detailed source map of this notebook. Group the sources into:
1. MS3 core curriculum
2. Clinical skills and documentation
3. Core psychiatric topics
4. Acute safety and consult psychiatry
5. Psychopharmacology and protocols
6. Family, relational, and discharge systems
7. Evidence, landmarks, and rounds teaching
8. Cases, OSCEs, and shelf prep
9. Faculty QA and attestation
10. Source indexes and media archives

For each group, explain what it is best used for, what it should not be used for, the likely
audience, and any caution about source quality or completeness.
```

### Prompt 1.2 - Attestation-First Risk Scan

Use: Faculty Governance Source Set

Save as: `00 Governance - Attestation Risk Scan`

```text
Review the selected sources for clinical-safety and governance issues. Create a prioritized risk
scan with P0, P1, P2, and P3 categories.

Look specifically for:
1. Claims requiring faculty attestation
2. Local protocol dependencies
3. Medication dosing or monitoring claims needing confirmation
4. Student-facing language that could imply independent practice
5. Overclaims or unsupported evidence claims
6. Internal inconsistencies
7. Outdated or source-index-only material
8. Items that should remain faculty-only

For each issue, give the concern, why it matters, likely affected products, and recommended fix.
```

### Prompt 1.3 - Minimum Safe Product Set

Use: Global Source Set

Save as: `00 Governance - Minimum Safe Product Set`

```text
Define the minimum safe product set for launching this clerkship NotebookLM with MS3 students.
Separate products into:
1. Must build before student use
2. Strongly recommended
3. Faculty-only
4. Later enhancement

For each product, explain the safety rationale and what faculty must review before release.
```

## Phase 2 - Student Orientation And Core Products

### Prompt 2.1 - Day 1 Student Packet

Use: Student Core Source Set

Save as: `01 Student Core - Day 1 Packet`

```text
Create a polished Day 1 student packet for an MS3 adult inpatient psychiatry clerkship.

Include:
1. What this rotation is for
2. How to stay safe on the unit
3. PHI and documentation discipline
4. Daily workflow
5. What to do before rounds
6. Psychiatric interview expectations
7. Mental status exam expectations
8. Oral presentation expectations
9. How to ask for feedback
10. What students may do only with supervision
11. What students should never do independently
12. First-week checklist

Tone: direct, calm, clinically serious, and practical. Keep it usable as a real handout.
```

### Prompt 2.2 - Six-Week Learning Path

Use: Student Core Source Set

Save as: `03 Weekly Curriculum - Six Week Learning Path`

```text
Create a six-week learning path for MS3 students on adult inpatient psychiatry.

For each week include:
1. Clinical focus
2. Required reading from uploaded sources
3. Optional deeper reading
4. Bedside skill
5. Documentation skill
6. One assignment
7. One rounds question
8. One reflection prompt
9. One OSCE-style practice task
10. Faculty/resident observation opportunity

Make the progression realistic: orientation and safety first, then interview/MSE, diagnosis,
risk formulation, psychopharm reasoning, family/discharge systems, and final synthesis.
```

### Prompt 2.3 - Rounds Coach

Use: Student Core Source Set

Save as: `01 Student Core - Daily Rounds Coach`

```text
Create a daily rounds coach for MS3 students.

Include:
1. Pre-rounding checklist
2. What to review in the chart
3. What to ask the patient
4. How to update the MSE
5. How to prepare a risk update
6. 60-second oral presentation template
7. 90-second oral presentation template
8. What to say when uncertain
9. How to ask for a task
10. Common attending questions and model answers

Include short synthetic examples for depression with suicide risk, mania with psychosis, delirium,
catatonia, withdrawal, and discharge barrier/family conflict.
```

### Prompt 2.4 - Student Scope And Supervision Guide

Use: Student Core Source Set

Save as: `01 Student Core - Scope And Supervision Guide`

```text
Create a student scope and supervision guide. Separate tasks into:
1. Appropriate for independent preparation
2. Appropriate with direct observation
3. Appropriate only after explicit permission
4. Not appropriate for MS3 independent action

Cover interviews, MSE, safety questions, family contact, medication discussion, capacity
discussion, documentation, discharge planning, and emergency situations. Use plain language and
explicit escalation triggers.
```

## Phase 3 - Pocket Guides

### Prompt 3.1 - Pocket Guide Master Set

Use: Student Core Source Set

Save as: `02 Pocket Guide - Master Set`

```text
Create a set of ten one-page pocket guides for MS3 inpatient psychiatry.

Guides:
1. Psychiatric interview
2. Mental status exam language
3. Differential diagnosis and formulation
4. Suicide risk formulation and safety planning
5. Agitation and violence risk escalation
6. Delirium and medical mimics
7. Catatonia recognition
8. Withdrawal recognition
9. Psychopharmacology recognition and monitoring
10. Family/discharge systems

For each guide use this structure:
Why it matters, what to ask/look for, can't-miss red flags, what the student says on rounds,
what the student does next, and supervision/escalation reminder.
```

### Prompt 3.2 - Convert Each Pocket Guide To Print Format

Use: Output from Prompt 3.1

Save as: `02 Pocket Guide - Print Format Revision`

```text
Revise the pocket guide master set into a print-friendly format. Make each guide fit on one page
when pasted into a document. Use compact headings, tight bullets, and no long paragraphs. Preserve
safety and supervision language.
```

## Phase 4 - Acute Safety And Consult Products

### Prompt 4.1 - Acute Safety Guide

Use: Acute Safety Source Set

Save as: `01 Student Core - Acute Safety Guide`

```text
Create an MS3 acute safety guide for adult inpatient psychiatry.

Cover:
1. Suicide risk formulation
2. Self-harm on the unit
3. Agitation
4. Violence risk
5. Delirium
6. Catatonia
7. Alcohol or sedative withdrawal
8. Capacity questions
9. Medical instability masquerading as psychiatric illness
10. When and how to escalate

For each topic include: what the student may notice, what to ask, what to tell the team, what not
to do independently, and urgent escalation triggers. Do not provide medication dosing unless the
selected sources explicitly support it and label it as requiring local protocol confirmation.
```

### Prompt 4.2 - Delirium, Catatonia, Withdrawal Comparison Table

Use: Acute Safety Source Set

Save as: `01 Student Core - Delirium Catatonia Withdrawal Table`

```text
Create a comparison table for delirium, catatonia, alcohol/sedative withdrawal, mania, psychosis,
and severe depression. Columns: presentation clues, MSE clues, vital/lab clues, common mimics,
initial questions, what the student should say to the team, immediate safety concern, and
supervision/escalation note.
```

### Prompt 4.3 - Capacity Four-Abilities Teaching Page

Use: Acute Safety Source Set

Save as: `01 Student Core - Capacity Teaching Page`

```text
Create a student-facing teaching page on decision-making capacity using the four abilities model.
Include what capacity is and is not, how it differs from competency, how to structure questions,
common inpatient examples, documentation language, and when to ask for senior help. Use synthetic
examples only.
```

## Phase 5 - Psychopharmacology Products

### Prompt 5.1 - Psychopharm Recognition Guide

Use: Student Core Source Set plus Acute Safety Source Set

Save as: `01 Student Core - Psychopharm Recognition Guide`

```text
Create an MS3 psychopharmacology recognition and monitoring guide for inpatient psychiatry.

Focus on what a student should recognize and communicate, not independent prescribing.

Include:
1. Antidepressants
2. Antipsychotics
3. Mood stabilizers
4. Benzodiazepines and sedatives
5. Stimulants and ADHD medications when relevant
6. Medications for substance use disorders when relevant
7. Common side effects
8. Serious adverse effects
9. Monitoring concepts
10. What to ask on follow-up
11. What to report immediately

Avoid dosing unless a source and local protocol clearly support it. Flag all dosing/protocol items
for faculty attestation.
```

### Prompt 5.2 - Side Effect And Monitoring Table

Use: Student Core Source Set plus Acute Safety Source Set

Save as: `01 Student Core - Side Effect Monitoring Table`

```text
Create a student-facing medication side effect and monitoring table. Include medication class,
common side effects, serious adverse effects, monitoring concepts, patient questions, and urgent
team notification triggers. Keep it appropriate for MS3 supervised learning.
```

## Phase 6 - Family, Relational, And Discharge Products

### Prompt 6.1 - Family And Discharge Toolkit

Use: Student Core Source Set

Save as: `01 Student Core - Family And Discharge Toolkit`

```text
Create an MS3 family meeting and discharge planning toolkit.

Include:
1. Why family/discharge systems matter
2. What students can observe
3. What students can ask with supervision
4. Support map
5. Discharge barrier map
6. Warning signs and relapse prevention questions
7. How to present family/discharge issues on rounds
8. What not to say or promise
9. Common conflicts and de-escalating language
10. Synthetic scripts

Keep the material clinically serious and practical for inpatient psychiatry.
```

### Prompt 6.2 - Discharge Barrier Map

Use: Student Core Source Set

Save as: `02 Pocket Guide - Discharge Barrier Map`

```text
Create a discharge barrier map that students can use on rounds. Organize barriers into clinical,
safety, medication, family/support, housing, substance use, legal/forensic, follow-up access,
insurance/financial, and patient-preference domains. For each domain, give questions to ask, what
to report, and who on the team may need to be involved.
```

## Phase 7 - Faculty Teaching And Supervision Products

### Prompt 7.1 - Attending Microteaching Scripts

Use: Faculty Governance Source Set plus Student Core Source Set

Save as: `04 Faculty Teaching - Twelve Microteaching Scripts`

```text
Create 12 five-minute attending microteaching scripts for inpatient psychiatry rounds.

Topics:
1. MSE language
2. Suicide risk formulation
3. Bipolar vs unipolar depression
4. First-episode psychosis
5. Antipsychotic monitoring
6. Delirium
7. Catatonia
8. Withdrawal
9. Capacity
10. Borderline personality disorder and chronic suicidality
11. Family meetings
12. Discharge planning

For each script include: teaching question, why it matters, two-minute explanation, model student
answer, clinical pearl, bedside task, and faculty attestation caveat.
```

### Prompt 7.2 - Resident-As-Teacher Guide

Use: Faculty Governance Source Set plus Student Core Source Set

Save as: `04 Faculty Teaching - Resident As Teacher Guide`

```text
Create a resident-as-teacher guide for supervising MS3 students on adult inpatient psychiatry.

Include:
1. How to orient the student
2. How to assign patient tasks safely
3. How to observe interviews
4. How to review notes
5. How to teach risk formulation
6. How to involve students in family/discharge work
7. How to give feedback
8. How to handle student uncertainty
9. What residents should not delegate
10. End-of-week check-in script
```

### Prompt 7.3 - Faculty Attestation Checklist

Use: Faculty Governance Source Set

Save as: `07 QA - Faculty Attestation Checklist`

```text
Create a faculty attestation checklist for every student-facing product generated from this
notebook. Organize by product. For each product list: clinical claims to verify, medication or
protocol items to verify, local policy items to confirm, source gaps, possible overclaims, and
recommended reviewer role.
```

## Phase 8 - Assessment Products

### Prompt 8.1 - OSCE Station Set

Use: Student Core Source Set

Save as: `05 OSCE and Assessment - Twelve OSCE Stations`

```text
Create 12 synthetic OSCE stations for MS3 adult inpatient psychiatry.

For each station include:
1. Station title
2. Student prompt
3. Standardized patient instructions
4. Relevant history
5. Affect/behavior cues
6. Student tasks
7. Scoring checklist
8. Entrustment anchors
9. Critical fail behaviors
10. Debrief teaching points
11. Source grounding

Cover: suicide risk, mania, psychosis, depression, delirium, catatonia, withdrawal, capacity,
medication adverse effect, family/discharge conflict, BPD/chronic suicidality, and diagnostic
formulation.
```

### Prompt 8.2 - Shelf-Style Question Bank

Use: Student Core Source Set plus Evidence/Landmarks Source Set

Save as: `05 OSCE and Assessment - Shelf Style Question Bank`

```text
Create 50 NBME-style psychiatry shelf questions using synthetic vignettes only.

Cover:
1. Mood disorders
2. Psychosis
3. Anxiety, OCD, PTSD
4. Personality disorders
5. Substance use and withdrawal
6. Delirium, dementia, and capacity
7. Child/adolescent and neurodevelopmental topics when supported by sources
8. Eating and sleep disorders when supported by sources
9. Psychopharmacology
10. Emergency psychiatry

For each question include: vignette, answer choices, correct answer, explanation, why each wrong
answer is wrong, source topic, and difficulty level.
```

### Prompt 8.3 - Rounds Question Bank

Use: Student Core Source Set plus Evidence/Landmarks Source Set

Save as: `05 OSCE and Assessment - Rounds Question Bank`

```text
Create 100 short-answer rounds questions for MS3 students. For each include: question, ideal
30-second answer, common student pitfall, clinical pearl, source topic, and week of rotation.
Sort by week and topic.
```

### Prompt 8.4 - Flashcard Deck

Use: Student Core Source Set

Save as: `05 OSCE and Assessment - Flashcard Deck`

```text
Create 150 active-recall flashcards from the selected sources. Use a mix of cloze and question-
answer formats. Separate cards into: Week 1 basics, interview/MSE, diagnosis/formulation,
psychopharm, safety, consult/acute, family/discharge, and shelf review. Avoid trivia. Emphasize
clinical reasoning, red flags, and supervised student tasks.
```

## Phase 9 - Media And NotebookLM Studio Products

### Prompt 9.1 - Audio Overview Script: Whole Clerkship

Use: Global Source Set

Save as: `06 Media - Whole Clerkship Audio Overview Script`

```text
Create a 12-minute NotebookLM Audio Overview script for MS3 students starting adult inpatient
psychiatry. The arc should be: safety first, interview and MSE, differential before diagnosis,
risk formulation, treatment rationale, family/discharge systems, acute emergencies, and evidence
humility. Make it conversational but clinically serious.
```

### Prompt 9.2 - Audio Overview Script: Acute Safety

Use: Acute Safety Source Set

Save as: `06 Media - Acute Safety Audio Overview Script`

```text
Create a 10-minute audio overview script on acute inpatient psychiatry for MS3 students. Cover
suicide risk, agitation, violence risk, delirium, catatonia, withdrawal, capacity, and escalation.
Tone: calm, practical, safety-focused. Do not create medication dosing instructions.
```

### Prompt 9.3 - Video Overview Storyboard

Use: Student Core Source Set

Save as: `06 Media - Family Discharge Video Storyboard`

```text
Create a video overview storyboard for family meetings and discharge planning in adult inpatient
psychiatry. Include scene-by-scene narration, on-screen text, and simple diagram descriptions for:
support map, discharge barrier map, warning signs, and task ownership. Use synthetic material only.
```

### Prompt 9.4 - Slide Deck Outline

Use: Student Core Source Set

Save as: `06 Media - Clerkship Orientation Slide Deck Outline`

```text
Create a 20-slide orientation deck outline for MS3 adult inpatient psychiatry. For each slide
include title, objective, bullet content, speaker notes, and any suggested visual. Cover safety,
workflow, interview/MSE, risk, acute emergencies, psychopharm recognition, family/discharge
systems, and how to succeed on the rotation.
```

## Phase 10 - QA Prompts

Run these after each major product.

### Prompt 10.1 - Clinical Safety QA

Use: Product output plus relevant source set

Save as: `07 QA - [Product Name] Clinical Safety QA`

```text
Audit the product above for clinical safety. Identify any statement that may be unsafe, too broad,
outside MS3 scope, insufficiently supervised, insufficiently sourced, medication/protocol-specific,
or dependent on local policy. Return a table with concern, severity, exact text or section, reason,
and recommended revision.
```

### Prompt 10.2 - Student-Level QA

Use: Product output

Save as: `07 QA - [Product Name] Student Level QA`

```text
Audit this product for MS3 usability. Identify sections that are too advanced, too vague, too long,
too faculty-facing, or not actionable. Recommend edits that preserve clinical accuracy while
making the product more usable during an inpatient rotation.
```

### Prompt 10.3 - Source Grounding QA

Use: Product output plus relevant source set

Save as: `07 QA - [Product Name] Source Grounding QA`

```text
Check whether this product is source-grounded. For each major claim, identify whether it is
directly supported by selected sources, indirectly supported, unsupported, or requires faculty
attestation. Do not invent citations. Recommend removal or revision for unsupported claims.
```

### Prompt 10.4 - PHI And Synthetic-Case QA

Use: Product output

Save as: `07 QA - [Product Name] PHI QA`

```text
Review this product for any possible PHI, real patient implication, overly specific case detail,
or unsafe resemblance to identifiable clinical material. Confirm that all cases are synthetic or
de-identified. Recommend changes if any content should be generalized.
```

## Phase 11 - Final Assembly Products

### Prompt 11.1 - Student Handbook Assembly

Use: Saved notes from Phases 2-6

Save as: `01 Student Core - Complete Student Handbook`

```text
Assemble the student-facing notes into a coherent MS3 adult inpatient psychiatry handbook. Use
this order: welcome and scope, safety, workflow, interview/MSE, formulation, rounds, acute safety,
psychopharm recognition, family/discharge systems, weekly learning path, and final checklist.
Remove redundancy, preserve escalation language, and flag sections needing faculty attestation.
```

### Prompt 11.2 - Faculty Guide Assembly

Use: Saved notes from Phases 7 and 10

Save as: `04 Faculty Teaching - Complete Faculty Guide`

```text
Assemble the faculty-facing notes into a coherent teaching guide. Include: teaching philosophy,
source governance, student scope, resident-as-teacher guidance, microteaching scripts, assessment
approach, attestation checklist, and maintenance plan. Keep it practical for attendings and
residents supervising MS3 students.
```

### Prompt 11.3 - Assessment Packet Assembly

Use: Saved notes from Phase 8

Save as: `05 OSCE and Assessment - Complete Assessment Packet`

```text
Assemble the OSCE stations, shelf questions, rounds questions, and flashcards into a coherent
assessment packet. Add an index, suggested use by week, faculty review notes, and student-facing
instructions. Keep synthetic cases clearly synthetic.
```

## Phase 12 - Maintenance And Improvement

### Prompt 12.1 - Gap Analysis

Use: Global Source Set plus Deep Archive Source Set

Save as: `08 Maintenance - Gap Analysis`

```text
Identify the top 25 gaps that would most improve this clerkship library. Rank by student impact,
clinical safety, shelf utility, faculty effort, and whether the gap is content, tool, evidence,
workflow, media, or design. Include recommended next artifact for each gap.
```

### Prompt 12.2 - Quarterly Maintenance Checklist

Use: Faculty Governance Source Set

Save as: `08 Maintenance - Quarterly Checklist`

```text
Create a quarterly maintenance checklist for this NotebookLM clerkship library. Include source
review, faculty attestation, local policy review, medication/protocol updates, student feedback,
resident feedback, OSCE refresh, question-bank refresh, and archive/version-control steps.
```

## High-Yield First Session

If you only have one hour, run these prompts in order:

1. Prompt 0.1 - Production Ledger
2. Prompt 1.1 - Source Map
3. Prompt 1.2 - Attestation-First Risk Scan
4. Prompt 2.1 - Day 1 Student Packet
5. Prompt 3.1 - Pocket Guide Master Set
6. Prompt 10.1 - Clinical Safety QA on the Day 1 packet
7. Prompt 10.1 - Clinical Safety QA on the pocket guides

## Best First Content To Build

Build these first because they have the highest immediate value:

1. Day 1 student packet
2. Daily rounds coach
3. Acute safety guide
4. Pocket guide master set
5. Six-week learning path
6. Faculty attestation checklist

## Output Quality Standard

A finished NotebookLM-generated artifact is ready for review only if it is:

- clinically accurate,
- MS3-appropriate,
- concise enough for real rotation use,
- explicit about supervision and escalation,
- source-grounded by filename,
- free of PHI,
- clear about local-policy dependencies,
- clear about medication/protocol attestation needs,
- saved as a named note,
- paired with at least one QA note.

## Suggested First Prompt To Paste Now

Use this as the first live NotebookLM build prompt:

```text
Act as a senior psychiatry clerkship director building MS3 teaching materials for adult inpatient
psychiatry. Use only the selected NotebookLM sources. Do not invent citations, protocols, or local
policies. Use synthetic or de-identified examples only. Keep student-facing material within
supervised MS3 scope. Flag anything that requires faculty attestation, local policy confirmation,
medication dosing verification, or updated evidence review.

Create a production ledger for this NotebookLM build. Make a table with these columns:
Product ID, Product title, Audience, Source set, Status, Faculty attestation needed, Local policy
dependency, Output format, Suggested note title, and Priority.

Include every major product needed for a comprehensive MS3 inpatient psychiatry clerkship
NotebookLM: source map, attestation scan, Day 1 packet, six-week curriculum, pocket guides,
rounds coach, acute safety guide, psychopharm recognition guide, family/discharge guide,
microteaching scripts, resident-as-teacher guide, OSCE stations, shelf questions, flashcards,
audio overview scripts, video storyboard, gap analysis, and maintenance checklist.
```

Joshua Moss, MD | Psychiatrist
