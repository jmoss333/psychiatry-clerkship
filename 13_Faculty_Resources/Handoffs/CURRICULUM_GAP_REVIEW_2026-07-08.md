# Psychiatry Clerkship Library Curriculum Gap Review

Date: 2026-07-08
Reviewer lens: psychiatrist, MS3 educator, psychiatry residency program director
Scope: learner-facing curriculum text and HTML in `01_` through `14_Tracks`, the MS3 Student Ready Pack, resident overlays, evidence and media indices, `reviewed.json`, `topic_meta.json`, and the 144-item question bank. I did not transcribe or clinically audit every audio file minute-by-minute; media were reviewed through manifests, transcripts where present, and curricular placement.

## Plain-English Summary

This library is no longer just a content dump. It has a coherent inpatient psychiatry spine, strong safety teaching, unusually good family/systems material, a reviewed topic metadata layer, and an attested question bank. The main gaps are now second-order: local-policy governance, outpatient/continuity exposure, substance-withdrawal nuance, psychopharm monitoring precision, interprofessional/resident track depth, media accessibility, and more deliberate assessment loops.

## Standards Used For Comparison

- AAMC Core EPAs: students should be prepared for 13 real-world activities on entry to residency, including history/exam, differential diagnosis, documentation, oral presentation, clinical questions/evidence, handoffs, interprofessional teamwork, urgent care recognition, and consent/procedures. Source: https://www.aamc.org/about-us/mission-areas/medical-education/cbme/core-epas
- ADMSEP junior psychiatry clerkship objectives: psychiatry clerkships need explicit objectives, both for assessment and because many future generalists will have no further formal psychiatry training. Source: https://www.admsep.org/Educational-Objectives-for-a-Junior-Psychiatry-Clerkship.php
- NBOME COMAT Clinical Psychiatry blueprint: largest domains are mood and anxiety/trauma/OCD/dissociation, with substantial neurodevelopmental/gender/impulse, neurocognitive, psychosis, substance, medical/somatic/sleep, personality, and eating/sexual/paraphilic content. It explicitly tests both inpatient and outpatient management. Source: https://www.nbome.org/assessments/comat/clinical-subject-exams/comat-clinical-psychiatry/
- ACGME Psychiatry Milestones: resident-level progression emphasizes psychiatric evaluation, collateral, risk assessment, formulation/differential, treatment planning, psychotherapy, systems-based care, evidence-based practice, professionalism, and reflective growth. Source: https://www.acgme.org/globalassets/pdfs/milestones/psychiatrymilestones.pdf
- ACGME 2025 Psychiatry Program Requirements: residency education must include diagnosis/treatment/prevention of psychiatric, addictive, emotional, medical, and neurologic disorders related to psychiatry; longitudinal outpatient psychotherapy; and curricula responsive to community health needs and disparities. Source: https://www.acgme.org/globalassets/pfassets/programrequirements/2025-reformatted-requirements/400_psychiatry_2025_reformatted.pdf
- ADMSEP CSI modules list current psychiatry teaching topics, including suicide prevention, AUD, GAD, OCD, implicit bias/cultural care, catatonia, peripartum mood disorders, neurocognitive disorders, psychosis, QT prolongation, personality, delirium, PTSD, body dysmorphic disorder, ECT, ASD/ID, eating disorders, ADHD, insomnia, bipolar disorder, and capacity. Source: https://www.admsep.org/csi-emodules.php
- Current clinical-source anchors checked for high-risk areas: ASAM alcohol withdrawal guideline (https://www.asam.org/quality-care/clinical-guidelines/alcohol-withdrawal-management-guideline), FDA clozapine REMS removal (https://www.fda.gov/drugs/drug-safety-communications/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine), ACOG perinatal mental health treatment guidance (https://www.acog.org/clinical/clinical-guidance/clinical-practice-guideline/articles/2023/06/treatment-and-management-of-mental-health-conditions-during-pregnancy-and-postpartum), and APA 2025 delirium guideline announcement (https://www.psychiatry.org/news-room/news-releases/apa-published-updated-guideline-for-delirium).

## Current Strengths

1. Strong inpatient safety spine
   - Orientation, single safety rule, interview/MSE, suicide risk, violence risk, agitation/restraint, capacity, delirium, catatonia, and withdrawal are all represented.
   - OSCE stations test core safety behaviors with critical-fail criteria.

2. Practical clinical reasoning
   - The formulation and differential guides train students away from premature closure.
   - Repeated emphasis on medical/substance mimics is appropriate for inpatient psychiatry.

3. Family, discharge, and systems are a differentiator
   - Family meeting, collateral, discharge barrier mapping, expressed emotion, and post-discharge risk are much stronger than most clerkship curricula.

4. Exam layer is now real
   - `question_bank.json` contains 144 attested items, with category tags, trap feedback, two-tier items, and relational items.

5. Faculty review infrastructure exists
   - `reviewed.json` has 89 entries and `topic_meta.json` has broad page coverage. Earlier gaps such as missing eating-disorder page, missing topic metadata, Miklowitz statistic error, QTc citation error, clozapine REMS status, and truncated Q97 appear largely fixed.

## Priority Gaps

### P0/P1 - Fix Before Broad Learner Release

1. Local-policy and clinical-governance separation
   - Several pages still mix universal teaching with local protocols or locally variable legal/process details.
   - `CLERKSHIPOS_BACKLOG_2026-07.md` correctly flags absent `localPolicy` tags.
   - Action: add a `localPolicy` field to relevant metadata and visibly label local protocol content: restraint standards, involuntary process, withdrawal order sets, clozapine workflow, emergency escalation, observation levels, and EHR rules.

2. SUD/withdrawal content needs sharper safety nuance
   - `substance_use_inpatient_teaching.md` still says naltrexone or acamprosate without explaining guideline splits, patient selection, or topiramate.
   - It teaches CIWA-Ar use but the main page does not clearly state that CIWA-Ar can fail in delirium, psychosis, severe cognitive impairment, language barriers, or unreliable self-report. The tool has a caveat; the teaching page should too.
   - It says thiamine before glucose but gives no level-specific teaching on who needs high-dose parenteral thiamine.
   - Action: revise SUD page with ASAM caveats, AUD medication decision table, tobacco/gambling/caffeine exam hooks, discharge MAUD linkage, and objective-scale alternatives where CIWA-Ar is invalid.

3. Psychopharm monitoring precision
   - The psychopharm primer and protocol library still contain residue such as "required schedule" or "required hematologic monitoring" for clozapine, while the psychosis and resident pages correctly state that REMS ended and ANC remains recommended per prescribing information.
   - Metabolic monitoring cadence and QTc action thresholds should be consistent across topic pages, resident references, rounds questions, and the question bank.
   - Action: make one canonical monitoring table for antipsychotics, lithium, valproate, lamotrigine, clozapine, QTc, antidepressant switch risk, and serotonin syndrome/NMS.

4. Attestation status is inconsistent between source text and metadata
   - Many source files still say "pending Dr. Moss review" even when `reviewed.json` marks the built slug reviewed.
   - The backlog also conflicts with newer question-bank metadata: the bank says all 144 items were attested on 2026-07-05.
   - Action: make `reviewed.json` the source of truth, remove stale source banners, and update stale backlog docs with superseded notices.

5. Outpatient and continuity psychiatry are underdeveloped
   - The curriculum is intentionally inpatient-heavy, but NBOME explicitly tests inpatient and outpatient diagnosis/management.
   - ACGME resident requirements emphasize longitudinal outpatient psychotherapy and multiple treatment modalities.
   - Action: add an MS3 "After the Unit" module covering PHP/IOP, outpatient follow-up, collaborative care, early psychosis/coordinated specialty care, ACT, therapy referral, maintenance pharmacotherapy, relapse prevention, and measurement-based follow-up.

### P1/P2 - Educational Quality Gaps

6. Assessment system needs more workplace-based observation
   - OSCEs and question bank are strong, but the live clinical evaluation loop is thin.
   - Action: add weekly mini-CEX style checklists for interview/MSE, risk formulation, oral presentation, note, collateral call, family meeting prep, and discharge reasoning. Add resident-facing "how to observe and give feedback" prompts.

7. Interprofessional and advanced tracks are mostly link maps
   - Sub-I/MS4, CAP fellow, social work, nursing, and patient/family tracks exist but do not yet have full competencies, cases, rubrics, or role-specific assignments.
   - Action: keep shared content, but give each track a one-page competency map, 3 role-specific cases, and an assessment artifact.

8. Child/adolescent and developmental psychiatry are represented but thin relative to COMAT weight
   - Neurodevelopmental content exists, and CAP overlay exists, but child/adolescent depression, anxiety/OCD, ADHD, school/family systems, pediatric SSRI monitoring, and adolescent suicide risk need more exam-ready cases.
   - Action: add 6 to 8 synthetic child/adolescent/developmental vignettes and a child/adolescent quick-reference aligned with NBOME and ADMSEP modules.

9. Perinatal/reproductive psychiatry needs attestation of high-risk numbers
   - Perinatal page is conceptually strong, but Tier 3 medication/lactation numbers remain held for attestation.
   - Action: create a two-layer page: MS3 recognition/safety level, resident medication-risk table with citations and review date.

10. Media accessibility and curation
   - There are about 100 local audio files and a large podcast index. Orientation transcript exists but is draft/pending in the transcript file.
   - Action: create a media manifest with title, duration, topic, transcript/caption path, required vs optional status, review state, and license/source. Do not make media required until transcripted or accessibility-equivalent.

11. Student-safe AI prompt set remains a stub
   - `11_AI_and_Prompts` identifies the need but does not yet provide the learner-ready prompt set.
   - Action: add PHI-safe prompts for formulation practice, MSE language cleanup, oral presentation rehearsal, qbank self-explanation, and reflection. Include hard PHI guardrails and "do not use for patient care decisions" language.

## 30/60/90-Day Plan

### First 30 Days - Safety, Governance, Currency

1. SUD/withdrawal update
   - Add CIWA-Ar limitation caveat to the page.
   - Add AUD medication table: naltrexone, acamprosate, topiramate, disulfiram, gabapentin where appropriate, plus contraindications and discharge linkage.
   - Add thiamine teaching tier: routine prophylaxis vs suspected Wernicke vs protocol-dependent dosing.

2. Psychopharm monitoring update
   - Remove clozapine "required/mandatory" residue from primer and protocol library.
   - Create a single monitoring table and link it from psychopharm, psychosis, nutrition/metabolic, rounds questions, and resident C-L reference.

3. Governance cleanup
   - Align source review banners with `reviewed.json`.
   - Add `risk` and `localPolicy` metadata.
   - Update stale backlog/handoff files so future agents do not work from obsolete status.

4. Faculty attestation session
   - Batch-review Tier 3 items: perinatal medication/lactation, catatonia resident dosing, C-L resident thresholds, SDOH observational numbers, CIWA bands, metabolic-monitoring schedule.

### Days 31-60 - Curriculum Expansion

5. Build "After the Unit: Continuity and Outpatient Psychiatry"
   - Include PHP/IOP, ACT, coordinated specialty care, collaborative care, therapy matching, follow-up timing, relapse prevention, measurement-based care, and social-needs handoff.

6. Build child/adolescent-developmental case set
   - ADHD vs mania, autism/ID diagnostic overshadowing, adolescent depression plus SSRI black-box conversation, pediatric OCD, school/family systems, adolescent suicide safety, eating disorder medical instability.

7. Build assessment toolkit
   - Weekly direct-observation cards, mini-CEX forms, midpoint checklist, final entrustment anchors, resident feedback scripts.

8. Build student-safe AI prompts
   - Five prompts plus safety disclaimers and de-identification examples.

### Days 61-90 - Tracks, Media, Evaluation

9. Convert role overlays into real tracks
   - Sub-I/MS4, resident, nursing, social work, CAP fellow, and patient/family track each gets objectives, role-specific activities, and assessment.

10. Media accessibility pass
   - Transcript/caption manifest; required/optional labels; remove or hide unreviewed required media.

11. Evaluate and improve
   - Collect student performance data: qbank category accuracy, OSCE critical-fail rates, direct-observation completion, shelf/COMAT outcome, and student/resident/faculty feedback.

## Suggested OpenEvidence Research Prompts

Use these as full prompts in OpenEvidence. Ask for primary sources, guideline conflicts, date currency, and teaching implications.

1. Alcohol withdrawal and AUD on adult inpatient psychiatry units

   "Review current evidence and guidelines for alcohol withdrawal management specifically in adult inpatient psychiatry or medically limited psychiatric units. Compare CIWA-Ar, PAWSS, mMINDS/MINDS, RASS-AW, CAM-ICU, and fixed-dose vs symptom-triggered protocols. Address when CIWA-Ar is invalid due to delirium, psychosis, cognitive impairment, language barriers, or inability to self-report. Include thiamine dosing tiers for prophylaxis vs suspected Wernicke encephalopathy, benzodiazepine vs phenobarbital evidence and monitoring requirements, and discharge initiation of medication for AUD. End with an MS3-safe teaching summary, resident-level nuance, and 5 exam-style discriminators."

2. Medication treatment of alcohol use disorder after psychiatric hospitalization

   "Summarize evidence and guideline recommendations for naltrexone, acamprosate, topiramate, disulfiram, gabapentin, and other AUD pharmacotherapies after psychiatric hospitalization. Include COMBINE, VA/DoD, APA, ASAM, and major meta-analyses through 2026. Clarify when acamprosate is preferred despite mixed efficacy, when naltrexone is contraindicated, where topiramate fits, and what evidence exists for starting MAUD before discharge. Provide a student-facing decision table and identify claims that require faculty attestation before teaching."

3. Outpatient and continuity psychiatry essentials for an inpatient MS3 clerkship

   "What outpatient and continuity-care psychiatry knowledge should be taught during a six-week inpatient adult psychiatry clerkship to prepare students for COMAT/shelf and future primary care? Review evidence for collaborative care, coordinated specialty care for first-episode psychosis, ACT, PHP/IOP, rapid post-discharge follow-up, measurement-based care, therapy referral, relapse prevention, and transitions after suicide-risk hospitalization. Include what an MS3 should observe, do, and present, plus a 20-minute teaching module outline."

4. Psychopharmacology monitoring and safety table for medical students and psychiatry residents

   "Build a 2026 evidence-based psychopharmacology monitoring table for psychiatry trainees. Cover SGAs and FGAs, clozapine after REMS removal, lithium, valproate, carbamazepine, lamotrigine, antidepressants including switch/serotonin syndrome, stimulants, benzodiazepines, QTc risk, metabolic monitoring, renal/thyroid/PTH, pregnancy/lactation flags, and common drug interactions. Separate MS3 recognition-level teaching from resident action thresholds. Cite primary guidelines and note areas of disagreement."

5. Perinatal and reproductive psychiatry for inpatient psychiatry trainees

   "Review current evidence and guidelines for perinatal and reproductive psychiatry relevant to adult inpatient psychiatry. Cover postpartum psychosis, perinatal depression/anxiety/OCD, bipolar relapse prevention, suicide/infant-safety assessment, lithium, valproate, lamotrigine, antipsychotics, SSRIs, zuranolone/brexanolone status, lactation relative infant doses, and when to involve obstetrics/MFM/pharmacy. Produce a two-tier teaching output: MS3 recognition/safety priorities and resident medication-risk reference."

6. Child/adolescent and neurodevelopmental psychiatry content for adult-oriented clerkships

   "Identify the highest-yield child/adolescent and neurodevelopmental psychiatry concepts that should be included in an adult inpatient psychiatry clerkship because they are common on COMAT/shelf and clinically relevant. Cover ADHD vs mania, autism and intellectual disability with diagnostic overshadowing, pediatric anxiety/OCD/depression, adolescent suicidality, SSRI black-box counseling through age 24, school/family systems, eating disorders in adolescents, and capacity/consent issues. Provide 8 synthetic vignette prompts and a compact teaching table."

7. Brief psychotherapy, milieu, and family interventions on inpatient psychiatry units

   "Review evidence for brief psychotherapeutic and relational interventions feasible on adult inpatient psychiatry units: supportive psychotherapy, motivational interviewing, behavioral activation, problem-solving therapy, DBT skills/TIPP/chain analysis, safety planning, psychoeducation, family psychoeducation, expressed emotion interventions, and discharge-focused family meetings. For each, specify mechanism, evidence strength, contraindications, and a student-safe bedside phrase. End with a 6-week skill progression and OSCE rubric."

8. Assessment system for a psychiatry clerkship and resident teaching overlay

   "Review best evidence and national standards for assessing third-year medical students in psychiatry clerkships and for involving psychiatry residents as teachers. Include AAMC EPAs, ADMSEP objectives/milestones, workplace-based assessments, mini-CEX/direct observation, OSCE validity, oral presentation rubrics, documentation review, qbank analytics, feedback quality, and entrustment anchors. Propose a practical assessment blueprint for a six-week inpatient rotation with weekly observable behaviors and resident teaching responsibilities."

9. Structural competency, cultural formulation, and restraint/involuntary-care equity in inpatient psychiatry

   "Review evidence and guidelines on structural competency, DSM-5-TR Cultural Formulation Interview, racial/ethnic disparities in diagnosis, restraint/seclusion, involuntary hospitalization, duty to protect, and discharge barriers in inpatient psychiatry. Focus on what medical students can safely learn and do: questions to ask, documentation language, family/support engagement, and when to escalate to attending/risk management. Include any high-quality evidence on interventions that reduce restraint and improve equitable follow-up."

10. Learning science for psychiatry clerkship libraries

   "What evidence supports retrieval practice, spaced repetition, audio/video learning, simulation, reflective writing, and AI-assisted self-explanation in medical student psychiatry education? Focus on psychiatry clerkships or clinical clerkships when possible. Identify best practices for required vs optional media, transcript/accessibility standards, question-bank feedback design, confidence calibration, and faculty attestation of AI-generated educational content. Produce a learner workload model for a six-week rotation."

## Recommended Success Metrics

- 100 percent of high-risk clinical pages have `risk`, `reviewed`, `lastReviewed`, and `localPolicy` status.
- No stale source banner contradicts `reviewed.json`.
- All required media have transcripts or equivalent access.
- Every week has at least one direct observation and one formative feedback artifact.
- Student qbank performance shows no category below 70 percent after remediation.
- OSCE critical-fail rates decrease after targeted teaching.
- At least one continuity/outpatient assignment is completed by every student.
- Resident track has observable supervision/teaching behaviors, not only reading links.
