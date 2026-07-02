# Comprehensive NotebookLM Resource - Psychiatry Clerkship Library

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

Source root: `/Users/jm/Psychiatry-Clerkship-Library`

## Purpose

This file is the single uploadable NotebookLM source for the Psychiatry Clerkship
Library. It gives NotebookLM the curriculum map, the clinical teaching stance,
the source coverage, the high-yield topic synthesis, and the prompts needed to
turn the library into a reliable study, teaching, and faculty-review assistant.

Plain-English note: this is the "master briefing" for NotebookLM. It tells the
model what the clerkship is, what matters clinically, where the evidence and
teaching materials sit, and what not to do with patient information.

## How NotebookLM Should Use This Source

Use this source as a structured map of the library, not as a replacement for the
source files themselves.

When answering student or faculty questions:

- Prioritize third-year medical student learning unless the prompt names another
  audience.
- Teach recognition, reasoning, escalation, and supervised participation.
- Do not present the library as a medication dosing reference.
- When content is flagged as AI-drafted or pending attestation, say so.
- If source pages disagree, name the disagreement and recommend faculty review.
- Keep patient information out of outputs. Use synthetic or de-identified
  examples only.
- Cite local source sections by folder or file title when possible.
- Prefer clear clinical reasoning over long textbook exposition.

## Privacy, Copyright, And Clinical Safety Guardrails

No real patient details should be added to this resource or pasted into
NotebookLM. Teaching cases should be synthetic or carefully de-identified
composites. Do not include names, dates of birth, MRNs, exact dates of
admission, addresses, rare biographical details, or identifiable family details.

This resource does not reproduce raw copyrighted article or book text. The
library contains many PDFs and slide decks; this file summarizes them at the
curriculum and reference level. If NotebookLM is given separate PDFs, it should
summarize and cite them, not reproduce extended passages.

Clinical use requires local policy, attending supervision, current references,
and faculty attestation. The library is educational; it is not direct medical
advice.

## Source Coverage Reviewed

The local library contains 1001 non-system files, about 851 MB total.

Format inventory:

| Format | Count |
|---|---:|
| Markdown | 215 |
| PDF | 503 |
| DOCX | 49 |
| PowerPoint/PPTX | 50 |
| HTML tools/pages | 27 |
| Audio M4A | 100 |
| CSV | 23 |
| TXT | 15 |
| JSON/JSONL | 10 |
| XLSX and related | 3 |
| Python scripts | 4 |
| CSS/PNG | 2 |

Major folder coverage:

| Area | File count | Role in the notebook |
|---|---:|---|
| `00_START_HERE` | 28 | Orientation, audit outputs, source strategy |
| `01_Six_Week_Curriculum` | 8 | Week-by-week curriculum arc |
| `02_Clinical_Skills` | 60 | Interview, MSE, formulation, documentation, psychotherapy |
| `03_Core_Topics` | 91 | Mood, psychosis, anxiety/OCD/PTSD, SUD, personality, geriatric, perinatal, nutrition, neurodevelopment |
| `04_Acute_and_Safety` | 50 | Suicide, violence, agitation, capacity, delirium, catatonia |
| `05_Psychopharmacology` | 18 | Student primer and protocol map |
| `06_Family_and_Relational` | 17 | Family meeting, expressed emotion, relational/system work |
| `07_Evidence_and_Reading` | 111 | Landmark trials, evidence summaries, reading pathways, rounds questions |
| `08_Cases_and_Simulation` | 2 | Synthetic cases and DOI resolution notes |
| `09_Exam_Prep` | 3 | OSCE and shelf guide pointers |
| `10_Patient_and_Family_Education` | 14 | Patient/family reference layer |
| `11_AI_and_Prompts` | 14 | Prompting, safety, AI workflow |
| `12_Media` | 15 | Podcasts and media library |
| `13_Faculty_Resources` | 455 | Accreditation, APA resources, handoffs, OpenEvidence artifacts |
| `14_Tracks` | 30 | Audience overlays: MS3, resident, nursing, social work, CAP, patient/family |
| `Psychodynamic Therapy Reading List` | 48 | Psychotherapy enrichment, mostly resident/faculty depth |
| `OPENEVIDENCE RAW FILES TO REVIEW` | 17 | Evidence review source set pending incorporation/attestation |

Existing audit context: a prior census catalogued 11,700 candidate resources,
flagged 2,785 duplicate/version groups, and skipped 1,016 PHI-sensitive or
non-education paths. This NotebookLM source uses the current clerkship library
as the working source of truth and does not import skipped PHI-sensitive
material.

## Library Identity

The Psychiatry Clerkship Library is a single source of truth for a six-week
adult inpatient psychiatry clerkship. It is a navigation layer and curriculum
system, not a second copy of every source document. The default learner is the
MS3 on an adult inpatient psychiatry unit.

The library's signature strength is workflow integration: it teaches students
how to interview, examine, reason, present, write, assess risk, join family
meetings, and think about discharge in the actual sequence of a clinical day.

The library should be understood as three overlapping layers:

1. Core student spine: orientation, weekly map, pocket guides, core topic pages,
   acute/safety pages, documentation/oral presentation, OSCEs, shelf review.
2. Clinical reference layer: evidence summaries, landmark trials, protocol
   library, screening tools, APA resources, patient/family handouts.
3. Faculty and enrichment layer: accreditation, QA, attestation, OpenEvidence
   review memos, resident curriculum, psychodynamic readings, podcasts, audio
   summaries, and deeper reference collections.

## Educational Stance

This clerkship teaches psychiatry as supervised clinical reasoning. Students are
not expected to prescribe independently, clear patients for discharge, decide
capacity alone, manage restraints alone, or run unsupervised psychotherapy.

Students should become reliable at:

- Asking direct safety questions.
- Recognizing urgent medical and psychiatric patterns.
- Building a differential that includes medical, substance, medication, and
  neurologic causes.
- Performing and documenting a mental status exam.
- Separating chronic from acute suicide risk.
- Using collateral and family context ethically.
- Explaining a treatment rationale without pretending to be the prescriber.
- Presenting concise oral updates.
- Mapping discharge barriers.
- Escalating promptly when worried.

The single safety rule: if immediate safety is concerning, tell the resident or
attending now. Do not wait for rounds and do not carry the concern alone.

## Six-Week Curriculum Map

Week 1 - Foundations and orientation:

- Learn the unit rhythm, PHI rules, interview frame, MSE language, and how to
  present initial findings.
- Observable skill: focused psychiatric interview plus MSE.
- Assignment: de-identified MSE and one-paragraph formulation.

Week 2 - Mood, psychosis, and pharmacology:

- Learn mood and psychosis differentials, medical/substance mimics, basic
  medication classes, and monitoring.
- Observable skill: explain why a medication or non-medication intervention fits
  the formulation.
- Assignment: treatment-rationale paragraph.

Week 3 - Psychotherapy, personality, and the relationship:

- Learn alliance, supportive psychotherapy moves, DBT-informed stance, chronic
  versus acute suicidality, and countertransference awareness.
- Observable skill: supervised alliance building and safety-plan reasoning.
- Assignment: safety plan plus brief therapy rationale.

Week 4 - Family, systems, and expressed emotion:

- Learn family meeting preparation, expressed emotion, family psychoeducation,
  discharge barriers, and support-system mapping.
- Observable skill: prepare and co-facilitate a family meeting with a defined
  student role.
- Assignment: family-meeting agenda with synthetic or de-identified facts.

Week 5 - Acute and emergency psychiatry:

- Learn agitation ladder, delirium, catatonia, withdrawal, suicide and violence
  risk, capacity, and urgent escalation.
- Observable skill: recognize urgent patterns, formulate risk, and escalate.
- Assignment: risk formulation plus consult question.

Week 6 - Integration, disposition, and exam readiness:

- Learn full case synthesis, OSCE-style practice, shelf review, and transition
  planning.
- Observable skill: present a complete case with formulation, risk reasoning,
  and disposition plan.
- Assignment: final synthetic or de-identified case presentation and reflection.

## Clinical Reasoning Core

Use the same reasoning template across diagnoses:

1. What is the current syndrome or clinical problem?
2. What medical, substance, medication, sleep, or neurologic factor could be
   driving it?
3. What risk is acute today, and what risk is chronic baseline?
4. What family, trauma, social, legal, cultural, or discharge context changes
   the plan?
5. What must be safer, clearer, or more connected before discharge?

Differential diagnosis asks, "What could this be?" Formulation asks, "Why this
patient, why now, and what does it mean for the plan?"

Every differential should include:

- Primary psychiatric syndrome.
- Substance or medication-induced condition.
- Medical or neurologic contributor.
- Trauma, stressor, or developmental context.
- Family/system/disposition factor affecting safety and recovery.

## Daily Student Workflow

Before rounds:

- Review assigned patients, vitals, sleep, PRNs, nursing notes, labs, safety
  events, medication changes, and family/discharge updates.

During rounds:

- Listen for diagnosis, risk, treatment target, medication rationale, family
  context, legal status, and disposition barrier.

After rounds:

- See patients, gather collateral with permission, update note draft, and ask a
  focused clinical question.

Afternoon:

- Present updates, revise notes, identify unresolved safety, medication, family,
  and discharge tasks.

End of day:

- Clarify handoff risks and what should trigger escalation overnight.

## Psychiatric Interview And MSE

The interview is a flexible circle around the patient's story, not a rigid
checklist. Cover the opening narrative, symptoms/timeline, safety, psychiatric
history, substance and withdrawal risk, medical/neurologic contributors,
medications, trauma/development, family/supports/collateral, function,
strengths, values, and discharge barriers.

Ask direct safety questions calmly. Ask about passive death wish, suicidal
thoughts, plan, intent, preparation, lethal means, violence concerns, and
vulnerability.

Use trauma-informed moves:

- Ask permission before sensitive topics.
- Explain why the question matters.
- Give control where possible.
- Avoid unnecessary detail extraction.
- Thank the patient for telling you.

The MSE should describe observable findings: appearance, behavior, speech, mood,
affect, thought process, thought content, perception, cognition, insight, and
judgment. Avoid vague or stigmatizing terms. Replace labels like
"manipulative," "noncompliant," or "poor historian" with specific behavior and
context.

## Documentation And Oral Presentation

Good psychiatric documentation shows reasoning. It should answer:

- What are we treating?
- What else could this be?
- What is the risk today?
- What changed since yesterday?
- What has to happen before discharge?

Progress notes should include: one-liner, interval events, subjective report,
MSE, formulation update, risk formulation, and plan organized by safety,
medications/medical/substance/sleep, psychotherapy/milieu/groups,
family/collateral, and disposition.

Daily rounds presentations should be 60 to 90 seconds:

1. Hospital day and reason for admission.
2. Sleep, PRNs, safety events, vitals, and labs.
3. Patient report and one MSE point.
4. Risk update.
5. Plan question.

## Suicide Risk And Safety

Teach students to ask directly and separate chronic from acute risk.

Chronic risk includes prior attempts, family history of suicide, chronic
psychiatric illness, substance use disorder, trauma history, demographic and
social risk factors.

Acute risk includes current intent or plan, recent preparation, recent loss or
humiliation, intoxication or withdrawal, severe insomnia, agitation, psychosis,
command hallucinations, new access to lethal means, loss of supports, or
collateral that contradicts the patient report.

Protective factors matter only if they are credible and available during the
risk window.

A strong risk formulation names chronic risk, acute risk, protective factors and
limits, modifiable targets, and the current level-of-care and safety plan.

High-yield safety interventions emphasized by the evidence layer:

- Means restriction.
- Stanley-Brown style safety planning.
- Concrete follow-up scheduled before discharge.
- Caring contacts or structured follow-up after discharge when available.
- Family/support involvement when consent allows.

Do not use "denies SI/HI" as the entire risk assessment.

## Violence Risk And Agitation

Agitation is a symptom with a driver, not a diagnosis. Look for delirium,
intoxication or withdrawal, psychosis, mania, akathisia, pain, fear, trauma
response, or environmental overload.

Use a least-restrictive ladder:

1. Modify the environment and milieu.
2. Use verbal de-escalation.
3. Offer collaborative oral PRN medication when appropriate.
4. Use involuntary medication only for imminent danger.
5. Use restraint or seclusion only as a last-resort safety measure.

Restraint and seclusion are not treatment. They buy time, require monitoring,
must stop as soon as safety allows, and should be followed by debrief.

Violence risk teaching includes the distinction between imminent shift-level
risk tools such as Broset or DASA and longer-term structured professional
judgment tools such as HCR-20. The library frames tools as aids to structured
judgment, not standalone prediction.

## Capacity And Consult Psychiatry

Capacity is decision-specific and time-specific. A patient can have capacity for
one decision but not another.

Assess four abilities:

1. Communicate a stable choice.
2. Understand relevant information.
3. Appreciate how the information applies personally.
4. Reason about options and consequences.

Capacity is not the same as agreeing with the team, having good judgment in
general, lacking a psychiatric diagnosis, being calm, or being legally
competent.

A good consult begins with the question:

- Who is asking?
- What decision is blocked?
- What changed today?
- What medical, substance, or medication cause must be considered?
- What would change after psychiatry answers?

## Delirium

Delirium is acute, fluctuating disturbance of attention and awareness. It is a
medical emergency and a major psychiatric mimic.

Teach students to test attention directly rather than infer it. Use months
backward, digit span, or a structured tool such as CAM when appropriate.

Common drivers include infection, hypoxia, metabolic derangement, medication
effects, anticholinergic burden, substance withdrawal, pain, urinary retention,
constipation, sleep disruption, surgery, and ICU exposure.

Management prioritizes the cause and non-pharmacologic bundles: reorientation,
sleep-wake protection, mobilization, sensory aids, hydration/nutrition, family
presence, and deprescribing deliriogenic agents. Antipsychotics are reserved for
dangerous agitation, lowest effective exposure, time-limited. Benzodiazepines
are generally avoided except for alcohol or sedative withdrawal.

## Catatonia

Catatonia is a syndrome that can occur with mood disorders, psychotic disorders,
autism, and medical/neurologic illness. It may be retarded or excited.

Look for mutism, stupor, immobility, staring, posturing, waxy flexibility,
negativism, echolalia, echopraxia, stereotypy, grimacing, poor intake, and
agitation not explained by the environment.

Use the Bush-Francis Catatonia Rating Scale to detect and track signs. A
lorazepam challenge can be diagnostic and therapeutic. Benzodiazepines are
first-line; ECT is critical for severe, malignant, or benzodiazepine-refractory
catatonia. Avoid antipsychotics until catatonia is excluded because they can
worsen malignant catatonia or neuroleptic malignant syndrome.

Known internal review issue: some library pages intentionally avoid naming
doses, while the evidence page includes dosing examples. Treat this as a
faculty-attestation item and defer to local protocol.

## Substance Use And Withdrawal

Substance use presents as intoxication, withdrawal, or a confounder of another
psychiatric syndrome.

Alcohol and benzodiazepine withdrawal can be lethal. Opioid and stimulant
withdrawal are usually not lethal by themselves but can be intensely distressing
and can change engagement, risk, and discharge planning.

Altered mental status in a person using substances should still get a real
differential: Wernicke encephalopathy, head injury, infection, hypoxia, hepatic
encephalopathy, polysubstance intoxication, anticholinergic state, metabolic
derangement, and medication effects.

Core student tasks:

- Ask substance, route, amount, frequency, last use, prior withdrawal, prior
  seizures or delirium tremens, overdose history, and current symptoms.
- Use CIWA-Ar or COWS only as supervised local tools, not as independent dosing
  calculators.
- Remember thiamine before glucose when alcohol-related thiamine deficiency is
  plausible.
- Link opioid-risk patients to naloxone and MOUD planning before discharge.
- Use motivational interviewing and nonjudgmental language.

OpenEvidence accuracy flag: the SUD page should be reviewed for naltrexone
versus acamprosate framing in alcohol use disorder, especially in relation to
COMBINE.

## Mood Disorders

Inpatient mood work is about safety, correct diagnosis, measured treatment, and
sleep/milieu stabilization.

Key diagnostic trap: screen every depressed patient for past mania or hypomania
before treating as unipolar depression. Bipolar depression misread as unipolar
can be destabilized by antidepressant monotherapy.

Can't-miss mimics include thyroid disease, corticosteroid or medication effects,
intoxication or withdrawal, delirium, neurologic disease, and substance-induced
mood syndromes.

Inpatient management includes suicide assessment, serial MSE, collateral,
medication reconciliation, TSH/CBC/CMP/UDS when relevant, pregnancy testing when
teratogenic medications are possible, sleep protection, measurement-based
tracking, and discharge follow-up.

Core evidence anchors include STAR*D for sequential depression treatment,
BALANCE for bipolar maintenance comparisons, lithium's anti-suicidal signal,
ECT for severe/catatonic/psychotic/life-threatening depression, and sleep/circadian
stabilization as a treatment target.

## Psychosis

Psychosis is a syndrome, not a diagnosis. Start by ruling out medical,
substance, medication, neurologic, delirious, seizure-related, and autoimmune
causes, especially in first-episode or atypical presentations.

Differentiate primary psychotic disorders from mood disorders with psychotic
features. Ask whether psychosis occurs only during mood episodes or also
outside them.

Antipsychotic choice should be driven by side-effect fit and patient-specific
risk, not by "newer is better." Monitor metabolic risk, EPS/akathisia, QTc when
relevant, sedation, prolactin, and adherence barriers.

First-episode psychosis needs medical workup, family engagement, coordinated
specialty care when available, and attention to duration of untreated psychosis.
Use LEAP-style engagement for anosognosia. Clozapine should be considered after
two adequate antipsychotic trials fail, with mandatory monitoring.

OpenEvidence accuracy flag: distinguish Leucht 2012 maintenance relapse
prevention from Leucht 2013 comparative antipsychotic analyses; add NNT framing
only after faculty attestation.

## Anxiety, OCD, And Trauma

On the inpatient unit, anxiety, OCD, and PTSD commonly ride alongside mood,
psychotic, substance, or medical problems.

Anxiety is a symptom before it is a diagnosis. Screen for cardiopulmonary
causes, thyroid disease, hypoglycemia, caffeine/stimulants, alcohol or
benzodiazepine withdrawal, and akathisia.

Core treatment concepts:

- SSRIs/SNRIs are often first-line medications across anxiety disorders, OCD,
  and PTSD, but onset is delayed and activation can occur.
- Avoid standing benzodiazepines as a maintenance plan, especially with SUD,
  older adults, delirium risk, or PTSD.
- OCD treatment relies on exposure and response prevention, usually with SSRI
  support.
- PTSD treatment emphasizes trauma-focused therapy such as PE or CPT when
  clinically appropriate.
- Trauma-informed care is clinical care: predictability, choice, explanations,
  and minimizing coercion reduce escalation and retraumatization.

OpenEvidence accuracy flag: qualify PTSD medication language. Only specific
SSRIs have FDA approval for PTSD, medication effect sizes are modest, and
trauma-focused psychotherapy is generally central.

## Personality Pathology And BPD

Personality pathology on the unit usually means an acute crisis in the context
of long-standing affective, interpersonal, and identity instability.

Teach chronic versus acute-on-chronic suicide risk. Chronic suicidality is a
baseline pattern; acute-on-chronic escalation involves a sharp change in intent,
preparation, means, agitation, intoxication, psychosis, or support loss.

Avoid diagnostic overshadowing. A BPD diagnosis does not rule out major
depression, bipolar disorder, psychosis, intoxication, withdrawal, delirium, or
medical illness.

Acute care should be structured, validating, consistent, goal-focused, and
team-aligned. Use a DBT-informed stance: validate distress while supporting
change and skill use. Track splitting as a symptom and team-process signal, not
as a moral failing. Monitor countertransference and use supervision.

OpenEvidence accuracy flag: avoid overstating the claim that admission itself
harms BPD. The stronger documented iatrogenic concern is discharge polypharmacy
and unstructured/open-ended care. Faculty review should clarify admission
indications, structure of stay, and deprescribing emphasis.

## Geriatric Psychiatry

Geriatric inpatient psychiatry centers on separating reversible from irreversible
causes of cognitive and behavioral change and avoiding iatrogenic harm.

Core triad: delirium versus dementia versus depression. Delirium is acute,
fluctuating, and inattentive. Dementia is chronic and progressive. Depression
can masquerade as cognitive impairment.

Key tasks:

- Test attention daily.
- Review every medication for anticholinergic and deliriogenic burden.
- Screen for infection, hypoxia, pain, urinary retention, constipation,
  metabolic derangement, and sensory deprivation.
- Obtain collateral on baseline cognition and function.
- Use non-pharmacologic management first for dementia-related agitation.
- Use antipsychotics only when necessary, time-limited, with risk-benefit
  documentation.
- Keep ECT on the table for severe, psychotic, catatonic, or treatment-resistant
  late-life depression.

## Perinatal Psychiatry

Perinatal psychiatry requires explicit risk-benefit thinking for mother and
infant, plus urgent recognition of postpartum psychosis.

Postpartum psychosis is an emergency, often bipolar-spectrum, and commonly has
rapid onset, mood lability, confusion, waxing/waning course, and infant-centered
delusions. A lucid interval does not make it safe.

Differentiate:

- Baby blues: mild, self-limited, resolves within about two weeks.
- Perinatal mood/anxiety disorder: persistent, impairing, treatable.
- Postpartum OCD: ego-dystonic intrusive thoughts, usually distressing to the
  parent and linked to avoidance.
- Postpartum psychosis: impaired reality testing and risk to mother and infant.

Student tasks include EPDS screening, direct mania/psychosis questions beyond
EPDS, infant-safety assessment, TSH/infection/medical workup review, collateral
from partner/family when permitted, sleep tracking, and discharge supervision
planning.

## Neurodevelopmental Disorders

ADHD, autism, and intellectual disability are usually clinical context rather
than the direct admission reason.

Avoid diagnostic overshadowing. New behavior change in ASD or ID should prompt
evaluation for pain, constipation, urinary retention, infection, dental issues,
sleep loss, medication effects, akathisia, delirium, catatonia, mood disorder,
psychosis, OCD, trauma, or substance use.

Differentiate chronic ADHD from episodic mania. Differentiate autistic
communication style and restricted interests from psychosis. Remember catatonia
can occur in autism.

Management starts with environment and communication: predictability, sensory
load reduction, concrete language, extra processing time, visual supports,
consistent staff, and supported decision-making.

## Nutrition And Metabolic Health

Metabolic health is psychiatric care. Serious mental illness carries major
cardiometabolic mortality, and several psychotropics worsen weight, glucose,
lipids, and blood pressure.

Teach antipsychotic metabolic monitoring: baseline, early follow-up around 12
weeks, and annual monitoring or more frequent monitoring when high risk. Track
weight/BMI, blood pressure, fasting glucose or HbA1c, fasting lipids, and
personal/family cardiometabolic history.

High metabolic burden: clozapine and olanzapine. Lower burden: aripiprazole,
ziprasidone, lurasidone, and similar lower-risk agents. Consider lifestyle
intervention, switching when clinically feasible, and evidence-based mitigation
such as metformin when appropriate.

Teach lithium hydration/sodium consistency, MAOI tyramine restrictions,
grapefruit CYP interactions, caffeine/alcohol effects, and food insecurity as a
systems issue.

## Psychopharmacology

Students should know classes, targets, monitoring, and emergencies, not dosing
like an attending.

Medication classes to recognize:

- SSRIs/SNRIs: depression, anxiety, OCD, PTSD; watch activation, GI/sexual side
  effects, serotonin syndrome, mania switch.
- Antipsychotics: psychosis, mania, agitation, adjunctive mood treatment; watch
  EPS, akathisia, metabolic effects, sedation, QTc, NMS.
- Mood stabilizers: bipolar disorder and mania prevention; lithium requires
  renal/thyroid/level monitoring, valproate has hepatic/platelet/teratogenic
  concerns.
- Benzodiazepines: withdrawal, catatonia, short-term targeted use; watch falls,
  delirium, sedation, dependence, withdrawal.
- Stimulants/non-stimulants: ADHD; watch insomnia, appetite, anxiety,
  cardiovascular issues, misuse/diversion.
- Clozapine: treatment-resistant schizophrenia; requires ANC monitoring and
  vigilance for myocarditis, ileus, seizure risk, metabolic burden, and
  agranulocytosis.

Medication emergencies to recognize and escalate:

- Serotonin syndrome: clonus/hyperreflexia plus autonomic instability.
- Neuroleptic malignant syndrome: rigidity, hyperthermia, altered mental status,
  elevated CK.
- Lithium toxicity: tremor, ataxia, confusion, often after dehydration, renal
  change, or interacting medication.
- QTc/torsades risk.
- Anticholinergic toxicity.
- Clozapine red flags.

## Family, Systems, And Discharge

Inpatient psychiatry does not end at symptom reduction. The patient leaves into
a system: family, housing, medications, transportation, work/school, finances,
follow-up, stigma, and safety. If the system cannot hold the plan, the plan is
not done.

Family meeting structure:

1. Purpose and agenda.
2. Patient voice and consent boundaries.
3. Current clinical status in plain language.
4. Safety and warning signs.
5. Medication and treatment plan.
6. Family/support roles and limits.
7. Discharge barriers.
8. Follow-up and crisis plan.
9. Remaining uncertainty.
10. Next steps and task ownership.

The recommended stance is multipartial, de-shaming, and practical. Translate
anger into fear, control into attempted safety, and symptoms into illness and
regulation rather than character. Coach influence, not control.

Discharge planning should start at admission. Verify housing, medication access,
follow-up date, transportation, family/support capacity, means safety, substance
use/withdrawal risk, crisis plan, and realistic sleep/environment plan.

## Evidence And Landmark Reading

The evidence layer includes:

- Evidence-Based Inpatient Psychiatry: suicide assessment, violence risk,
  agitation, seclusion/restraint, delirium, catatonia, capacity, involuntary
  treatment, family meetings, discharge planning, readmission reduction,
  follow-up, collaborative care, and measurement-based care.
- Landmark Psychiatry - Listen & Test: 50 brief audio summaries grouped by
  foundations, mood, psychosis, acute/safety, psychopharmacology, personality,
  family/systems, substance use, child, neuroscience, trauma, systems, skills,
  anxiety, and geriatric psychiatry.
- High-Yield Rounds Questions: 100 short-answer teaching questions with model
  answer, evidence, key paper, and pearl.
- Psychopharmacology ranked papers: 20 high-impact prescribing papers, merged
  into the student primer rather than duplicated as a separate MS3 burden.
- Psychodynamic reading list: enrichment for psychotherapy depth, mostly above
  the MS3 required core.

Evidence teaching should emphasize: structured tools help reasoning but do not
predict individual suicide or violence with certainty; brief inpatient suicide
prevention and discharge follow-up matter; family psychoeducation is relapse
protective; delirium prevention is non-pharmacologic; catatonia requires active
recognition; and discharge is a high-risk transition.

## Cases, OSCEs, And Assessment

The MS3 assessment system includes:

- Six OSCE stations: suicide risk with collateral hesitation, capacity to refuse
  treatment, possible catatonia, alcohol withdrawal risk, family-meeting agenda,
  and oral presentation of a new admission.
- Synthetic practice cases: first-episode mania with family conflict,
  depression/alcohol/suicide risk, delirium mistaken for psychosis, possible
  catatonia in severe depression, capacity refusal, withdrawal risk, family
  discharge barrier, and integrated oral presentation.
- Shelf review guide covering mood, psychosis, anxiety/OCD/trauma, personality,
  substance use, neurocognitive/medical mimics, psychopharmacology, child/adolescent,
  sleep, eating, ethics, and emergency psychiatry.
- Documentation and presentation rubrics.
- Reflection and professional identity formation prompts.

Assessment should focus on observable behavior: can the student ask, reason,
document, present, recognize danger, and escalate?

## Audience Tracks

MS3 is the default. Other tracks are overlays, not separate content forks:

- Resident: deeper psychopharmacology, inpatient systems, supervision, canon
  papers, and teaching roles.
- CAP fellow: child/adolescent overlays and pediatric adaptations.
- Nursing: milieu, safety, observation, escalation, family communication, and
  team-based care.
- Social work: discharge barriers, systems, housing, insurance, family supports,
  and community transitions.
- Patients/families: plain-language education and support materials.
- Sub-I/MS4: more responsibility, consult formulation, and advanced presentation.

## AI, NotebookLM, And Prompt Use

NotebookLM is useful for:

- Turning a page into a short study guide.
- Producing oral-board style questions.
- Comparing two local source pages.
- Generating a short audio overview.
- Preparing a family-meeting teaching script.
- Creating a faculty review checklist.
- Finding inconsistencies across draft pages.

NotebookLM should not:

- Receive patient-identifiable information.
- Be used as the authority for live clinical decisions.
- Invent local policy, doses, legal thresholds, or institutional protocols.
- Treat pending-attestation material as final.

## Suggested NotebookLM Prompts

Student orientation prompt:

```
Using only the sources in this notebook, create a one-page MS3 survival guide for
the first 48 hours of the adult inpatient psychiatry rotation. Focus on safety,
PHI, interview/MSE, daily workflow, and how to ask for feedback.
```

Rounds preparation prompt:

```
Create a 10-minute rounds prep plan for an MS3 following two patients: one with
mania/psychosis and one with depression/suicide risk. Include what to check
before rounds, what to ask at bedside, what to present, and what to escalate.
```

Differential diagnosis prompt:

```
Teach me how to build a differential for a new inpatient psychiatric admission.
Use the library's five-part differential and give examples for psychosis,
agitation, depression/suicidality, confusion, and refusal of care.
```

Risk formulation prompt:

```
Create a supervised student template for suicide risk formulation that separates
chronic risk, acute risk, protective factors, modifiable targets, means safety,
and disposition. Do not use real patient details.
```

Family meeting prompt:

```
Create a 90-minute inpatient family meeting guide for a student observer. Include
preparation, consent boundaries, agenda, what to listen for, useful phrases, and
post-meeting documentation points.
```

Faculty attestation prompt:

```
Review the clinical teaching pages in this notebook as a faculty attestation
assistant. List statements that require local policy confirmation, dosing/protocol
confirmation, citation verification, or wording changes before learner release.
```

Shelf/COMAT prompt:

```
Generate 25 MS3-level short-answer rounds questions from the library. Cover
psychosis, mood, anxiety/OCD/PTSD, SUD/withdrawal, delirium, catatonia, capacity,
personality, geriatric, perinatal, and psychopharmacology emergencies. Provide a
model answer and a pearl for each.
```

Audio overview prompt:

```
Create a 12-minute audio overview for an MS3 starting adult inpatient psychiatry.
The arc should be: safety first, interview/MSE, differential before diagnosis,
formulation links to treatment, family/discharge systems, acute emergencies, and
how to use evidence without overclaiming prediction.
```

QA inconsistency prompt:

```
Find internal inconsistencies in the source set. Prioritize clinical safety,
pending-attestation content, duplicate or conflicting evidence claims, and
student-facing language that may imply independent practice.
```

## Known Faculty Review And Attestation Items

The library already has a QA and attestation framework. Major review items:

- Complete the faculty attestation pass and replace "pending review" banners
  only after review.
- Confirm local capacity and involuntary-care language.
- Confirm local withdrawal protocols and scale use.
- Confirm local restraint/seclusion policy and documentation.
- Confirm medication monitoring and metabolic monitoring cadence.
- Confirm buprenorphine induction threshold against local protocol.
- Confirm ECT framing, especially "not last resort" language.
- Confirm perinatal medication and infant-safety wording.
- Confirm PTSD/OCD medication and psychotherapy framing.
- Reconcile catatonia and agitation pages where one page withholds doses/agents
  and another evidence page names them.
- Standardize landmark/evidence labels where counts or citations differ.
- Keep internal framework terminology out of student-facing public materials
  unless deliberately used for internal faculty context.

## High-Yield Clinical Pearls Across The Library

- Psychiatric symptoms can be medical until proven otherwise.
- Sleep is treatment, especially in mood and psychotic crises.
- Collateral is often the highest-yield diagnostic intervention.
- "Denies SI" is not a risk assessment.
- Protective factors are only protective if available during the risk window.
- Delirium is acute, fluctuating, and inattentive.
- Catatonia is treatable and dangerous to miss.
- Akathisia can look like anxiety or agitation.
- Antipsychotics are chosen by side-effect fit and monitoring needs.
- Lithium requires respect: levels, kidneys, thyroid, hydration, interactions.
- Clozapine is uniquely effective for treatment-resistant schizophrenia and
  uniquely monitoring-intensive.
- Benzodiazepines are targeted tools, not automatic standing maintenance.
- Family involvement is clinical data, not just logistics.
- Discharge planning starts at admission.
- A plan that depends on an unverified assumption is not done.
- Students should recognize and escalate; they do not independently clear risk,
  prescribe, discharge, restrain, or decide capacity.

## Recommended Upload Strategy

For a single comprehensive NotebookLM notebook, upload this file first.

Then, if source limits allow, add these high-yield companion sources:

1. `14_Tracks/MS3/Student_Ready_Pack/00_index/README.md`
2. `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md`
3. `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/interview_mse_pocket_guide.md`
4. `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/formulation_differential_pocket_guide.md`
5. `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md`
6. `14_Tracks/MS3/Student_Ready_Pack/03_weekly_map/week_by_week_reading_map.md`
7. `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md`
8. `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/treatment_basics_digest.md`
9. `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md`
10. `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md`
11. `03_Core_Topics/*/*_inpatient_teaching.md`
12. `04_Acute_and_Safety/*/*_inpatient_teaching.md`
13. `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md`
14. `06_Family_and_Relational/family_meeting_playbook_90min.md`
15. `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md`
16. `07_Evidence_and_Reading/Landmark_Trials/landmark_trials_page.md`
17. `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md`
18. `_QA_REPORT.md`
19. `13_Faculty_Resources/Handoffs/openevidence_library_accuracy_review_2026-06-30.md`

Avoid uploading raw case-specific files or potentially identifying case
materials unless they have been manually de-identified and approved.

## Final Plain-English Summary

The clerkship library is best understood as a practical operating manual for an
MS3 on inpatient psychiatry. It teaches students how to stay safe, ask the right
questions, think medically before anchoring psychiatrically, formulate risk,
communicate with families, write and present clearly, and use evidence without
pretending that tools can replace judgment. NotebookLM should act as a tutor,
study guide, and faculty-review assistant for that system.

Joshua Moss, MD | Psychiatrist
