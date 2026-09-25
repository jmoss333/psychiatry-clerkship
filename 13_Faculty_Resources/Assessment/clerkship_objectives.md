# MS3 Psychiatry Clerkship Objectives

**DRAFT for Josh's edit.** Workplace-assessment pack (WP-3), decision D5. Faculty-facing; not shipped to either site.

This file is the **single source of the MS3 clerkship objectives**. Every instrument in this pack
cites these ids, and the objectives sections that WP-13 adds to the core topic pages will cite
them too. It is also **WP-17 step 2**: each objective is mapped to the AAMC Core EPAs and to the
2024 AAMC/AACOM/ACGME Foundational Competencies. That mapping is a draft here; registering the
Foundational Competencies in `standards.json` is WP-17 step 1 and needs its own governance PR.

## How to read the table

- **ID.** Permanent. Never renumber. To drop an objective, keep its row and mark it *retired*; add
  new objectives at the end with the next free number. Topic pages and completed cards will cite
  these ids, so a renumbered id would silently point at a different objective.
- **Objective.** One observable behavior that a preceptor can watch or read. "The student will…"
  is implied.
- **Core EPA.** AAMC Core EPAs for Entering Residency (titles listed below).
- **Foundational Competencies.** Subcompetency ids in the official "<Competency> <n>" form, from
  the AAMC/AACOM/ACGME *Foundational Competencies for Undergraduate Medical Education* (2024).
- **Week(s).** The six-week spine adopted under decision D3.
- **Core refs.** The MS3 pages that teach the objective, by site slug. Pages marked *planned* do
  not exist yet; the work package that creates them is named.

## Objectives

| ID | Objective | Core EPA | Foundational Competencies | Week(s) | Core refs |
|---|---|---|---|---|---|
| **OBJ-01** | Recognize an immediate safety concern (suicidal intent, escalating agitation, possible delirium or catatonia, or withdrawal) and report it to the resident or attending at once rather than waiting for rounds. | 10 | Patient Care 4; Professionalism 6 | 1 (deepened in 5) | `orientation.md`, `pg_suicide.md`, `agitation.md`, `delirium.md`, `catatonia.md`, `withdrawal.html`, `toxidromes.md` |
| **OBJ-02** | Conduct a patient-centered psychiatric interview that states the student's role and purpose, opens with an open-ended question, follows the patient's account without leading questions, and closes with a summary the patient can correct. | 1 | Patient Care 2; Interpersonal and Communication Skills 1; Interpersonal and Communication Skills 3 | 1 | `pg_interview.md`, `sp-interview.html` |
| **OBJ-03** | Ask about suicidal thoughts and thoughts of harming others in plain language and, after any disclosure, ask about plan, intent, preparatory acts, access to lethal means, and protective factors. | 1, 10 | Patient Care 2; Patient Care 4 | 1, 5 | `pg_suicide.md`, `suicide.md`, `violence.md`, `sp-interview.html` |
| **OBJ-04** | Elicit and describe the mental status examination in observable language that agrees with the history, and perform the focused bedside checks the presentation calls for (attention testing for delirium, catatonia signs, extrapyramidal signs). | 1 | Patient Care 3; Interpersonal and Communication Skills 4 | 1 | `mse.html`, `pg_interview.md`, `delirium.md`, `catatonia.md` |
| **OBJ-05** | Build a prioritized differential for a psychiatric presentation that includes medical, substance- or medication-induced, and neurocognitive causes, and propose the initial workup that would tell them apart. | 2, 3 | Patient Care 5; Patient Care 6; Medical Knowledge 2 | 1, 2, 4 | `medical_workup.md`, `delirium.md`, `toxidromes.md`, `t_psychosis.md`, `t_mood.md`, `t_sud.md`, `cl_presentations.md` (planned: WP-9) |
| **OBJ-06** | Formulate suicide and violence risk by separating chronic from acute factors, naming protective factors and modifiable targets, and linking the formulation to the observation level and the plan. | 10 | Patient Care 4; Medical Knowledge 2 | 5 (introduced in 1) | `pg_suicide.md`, `suicide.md`, `violence.md` |
| **OBJ-07** | Propose an initial treatment plan by problem that explains why one medication and one non-medication intervention fit the formulation, and names the monitoring each one requires. | 4 | Patient Care 7; Medical Knowledge 2 | 2, 3 | `psychopharm_primer.md`, `med_monitoring.md`, `t_mood.md`, `t_psychosis.md`, `t_sud.md`, `brief_psychotherapy.md` |
| **OBJ-08** | Construct a biopsychosocial and cultural case formulation that answers "why this person, why now?" and show how it changes at least one element of the plan. | 2 | Patient Care 1; Patient Care 11; Professionalism 7 | 3 (revisited in 6) | `case_formulation.md`, `t_anxiety.md`, `t_personality.md`, `brief_psychotherapy.md` |
| **OBJ-09** | Write an admission note whose history has a timeline, whose mental status examination agrees with that history, and whose assessment shows reasoning (a risk formulation, a differential with medical mimics, and a plan by problem) without copied-forward text. | 5 | Interpersonal and Communication Skills 4; Professionalism 10 | 2 | `doc_oral.md`, `mse.html` |
| **OBJ-10** | Deliver a concise oral presentation that leads with a one-liner, states suicidal and homicidal ideation explicitly, gives a synthesized assessment, presents a plan by problem, and ends with a plan or disposition thought. | 6 | Interpersonal and Communication Skills 4; Patient Care 5 | 3 (introduced in 1; again in 6) | `doc_oral.md`, `osce.md` |
| **OBJ-11** | Gather collateral within the patient's consent and the unit's policy, and take a defined, prepared role in a family meeting that attends to expressed emotion and to the family's own questions. | 1, 9 | Patient Care 2; Interpersonal and Communication Skills 1; Professionalism 2 | 4, 5 | `family_playbook.md` |
| **OBJ-12** | Work as a member of the interprofessional team (nursing, social work, occupational therapy, peer support) by seeking each member's observations, sharing a clear plan, and closing the loop on assigned tasks. | 9 | Interpersonal and Communication Skills 2; Systems-Based Practice 3 | 1–6 (rated in 4–5) | `orientation.md` (no dedicated page yet) |
| **OBJ-13** | Transfer care safely: give a verbal handoff that names the main overnight risks with if–then contingencies and asks for a read-back, and draft a discharge plan that maps barriers, means safety, and outpatient follow-up. | 8 | Systems-Based Practice 4; Systems-Based Practice 8; Interpersonal and Communication Skills 4 | 5, 6 | `doc_oral.md`, `suicide.md`, `family_playbook.md`, `after_unit.md` (planned: WP-9) |
| **OBJ-14** | For one specific treatment decision, reason through the four abilities of decision-making capacity (communicating a choice, understanding, appreciation, reasoning), from an observed assessment or a practice station, and explain the patient's legal status and rights on the unit in plain language. | 11 | Professionalism 2; Professionalism 3; Patient Care 8 | 5 | `capacity.html`, `ethics_legal.md` |
| **OBJ-15** | After a safety event or near miss on the unit (restraint, fall, elopement, medication error), describe what happened factually in a team debrief, name one system condition that contributed, and propose one improvement without assigning individual blame. | 13 | Systems-Based Practice 6; Interpersonal and Communication Skills 2 | 5 | `agitation.md`, `violence.md` |
| **OBJ-16** | Act with professional integrity on the unit: keep patient information inside the clinical record (never in personal notes, devices, or AI tools), speak about patients respectfully, complete tasks reliably, and name the limits of their own knowledge and ask for help. | — (cross-cutting) | Professionalism 1; Professionalism 2; Professionalism 6; Professionalism 10 | 1–6 | `orientation.md` |
| **OBJ-17** | Direct their own learning: ask for feedback on one named behavior each week, compare the self-rating with the preceptor's rating at the midpoint and set a revised goal, and answer one question from patient care by finding and appraising evidence. | 7 | Practice-Based Learning and Improvement 1; Practice-Based Learning and Improvement 2; Practice-Based Learning and Improvement 3; Practice-Based Learning and Improvement 4 | 3 (midpoint), 6 | `orientation.md`, `shelf.md` |

## Where each objective is assessed

Row and item numbers refer to the cards. `tests/assessment-pack.test.mjs` fails if a card cites
an objective this matrix does not place on it, or the reverse.

| ID | DO-1 interview + MSE | DO-2 admission note | DO-3 oral presentation | DO-4 team and family | Midpoint self-rating |
|---|---|---|---|---|---|
| OBJ-01 | row 5 (tells the supervisor at once) | — | — | variant C | yes |
| OBJ-02 | rows 1, 2, 8 | — | — | — | yes |
| OBJ-03 | rows 4, 5 | — | — | — | yes |
| OBJ-04 | row 7 | row 5 | — | — | yes |
| OBJ-05 | rows 3, 6 | rows 4, 6 | item 3 | — | yes |
| OBJ-06 | row 5 | row 3 | item 2 | variant A | yes |
| OBJ-07 | — | row 7 | item 4 | — | yes |
| OBJ-08 | — | row 6 | item 3 | — | yes |
| OBJ-09 | — | all rows | — | — | yes |
| OBJ-10 | — | — | all items | variant B | yes |
| OBJ-11 | — | — | — | rows 1–3, 5; variants A, B | yes |
| OBJ-12 | — | — | — | rows 1, 3, 4, 6 | yes |
| OBJ-13 | — | row 7 | item 5 | variants A, C | yes |
| OBJ-14 | — | — | — | — | yes |
| OBJ-15 | — | — | — | variant D | yes |
| OBJ-16 | — | row 8 | — | rows 2, 6 | yes |
| OBJ-17 | — | — | — | — | yes (sections 1 and 2) |

OBJ-14 (capacity) has no direct-observation card in this pack: students observe capacity
assessments rather than lead them (see `required_encounters.md`). Its practice surfaces are OSCE
station 2 now and the capacity simulation planned in WP-11.

## Core EPA titles

Verbatim titles from AAMC, *Core Entrustable Professional Activities for Entering Residency:
Toolkits for the 13 Core EPAs* (2017). EPA 12 (Perform General Procedures of a Physician) has no
objective here; it is outside the scope of a psychiatry clerkship.

| EPA | Title |
|---|---|
| 1 | Gather a History and Perform a Physical Examination |
| 2 | Prioritize a Differential Diagnosis Following a Clinical Encounter |
| 3 | Recommend and Interpret Common Diagnostic and Screening Tests |
| 4 | Enter and Discuss Orders and Prescriptions |
| 5 | Document a Clinical Encounter in the Patient Record |
| 6 | Provide an Oral Presentation of a Clinical Encounter |
| 7 | Form Clinical Questions and Retrieve Evidence to Advance Patient Care |
| 8 | Give or Receive a Patient Handover to Transition Care Responsibility |
| 9 | Collaborate as a Member of an Interprofessional Team |
| 10 | Recognize a Patient Requiring Urgent or Emergent Care and Initiate Evaluation and Management |
| 11 | Obtain Informed Consent for Tests and/or Procedures |
| 13 | Identify System Failures and Contribute to a Culture of Safety and Improvement |

## Foundational Competency ids used

Paraphrases of 12 words or fewer, taken from the frameworks research; they are not the official
wording, which is in the AAMC/AACOM/ACGME report (2024, CC BY-NC):
<https://engage.aamc.org/UME-Competencies-AAMC-ACGME-AACOM>. The framework has six competencies
and 49 subcompetencies (45 for all students plus 4 DO-specific ones). Ids are the competency name
and a number; there are no official alphanumeric codes.

| Id | Paraphrase |
|---|---|
| Professionalism 1 | Shows respect and compassion to patients, caregivers, families, and team. |
| Professionalism 2 | Protects patient privacy, confidentiality, and autonomy. |
| Professionalism 3 | Uses ethical principles and reasoning to guide conduct. |
| Professionalism 6 | Recognizes limits of own knowledge and skills; seeks help appropriately. |
| Professionalism 7 | Identifies biases and strategies to mitigate their effects. |
| Professionalism 10 | Completes duties thoroughly, reliably, and on time. |
| Patient Care 1 | Integrates patient and caregiver context, values, and preferences into care. |
| Patient Care 2 | Gathers relevant histories from multiple data sources as needed. |
| Patient Care 3 | Performs relevant physical exams with appropriate techniques and tools. |
| Patient Care 4 | Identifies urgent/emergent patients, seeks help, recommends initial management. |
| Patient Care 5 | Creates and prioritizes differential diagnoses. |
| Patient Care 6 | Proposes hypothesis-driven diagnostic testing and interprets results. |
| Patient Care 7 | Formulates management plans for commonly encountered conditions. |
| Patient Care 8 | Explains common diagnostics, treatments, and plans in patient-centered language. |
| Patient Care 11 | Identifies individual and structural factors affecting health and wellness. |
| Medical Knowledge 2 | Applies foundational knowledge to clinical reasoning and decision-making. |
| Practice-Based Learning and Improvement 1 | Seeks and incorporates feedback and assessment data to improve. |
| Practice-Based Learning and Improvement 2 | Finds growth opportunities through informed self-assessment and reflective practice. |
| Practice-Based Learning and Improvement 3 | Develops, implements, and reassesses learning and improvement goals. |
| Practice-Based Learning and Improvement 4 | Locates, appraises, and synthesizes evidence for patient-centered decisions. |
| Interpersonal and Communication Skills 1 | Collaborates with patients, caregivers, and team to strengthen therapeutic relationship. |
| Interpersonal and Communication Skills 2 | Collaborates with clinical and administrative staff to improve team function. |
| Interpersonal and Communication Skills 3 | Demonstrates active listening. |
| Interpersonal and Communication Skills 4 | Communicates clearly, accurately, and compassionately in verbal, nonverbal, written, electronic forms. |
| Systems-Based Practice 3 | Adapts performance to different teams, care settings, and systems. |
| Systems-Based Practice 4 | Collaborates in care transitions and coordination. |
| Systems-Based Practice 6 | Identifies patient-safety concerns, systems issues, and QI opportunities. |
| Systems-Based Practice 8 | Applies knowledge of local community health needs, disparities, and resources. |

## Provenance and limits

- **Drafted from:** the six week READMEs' objective lines; the Orientation Packet's "What
  Students Should Practice Each Week" table (the same skills the Front Door Path shows each
  week); its "Expected Competencies By End Of Rotation" list; the D3 six-week spine; and the
  2026-09-24 Curriculum Architecture Review §4 and §6 (gaps: documentation, workplace interview
  observation, oral presentation, handoff, interprofessional collaboration, safety culture, and
  mid-clerkship self-assessment).
- **Frameworks** were read from primary sources on 2026-09-24: Core EPA titles verbatim from the
  2017 Toolkits; Foundational Competency ids from the 2024 report (post-October 2025 edit).
  No official crosswalk from the Core EPAs to the Foundational Competencies exists; this mapping
  is the clerkship's own judgment.
- **Not mapped yet (proposed — Josh to confirm):**
  - The four DO-specific subcompetencies (Professionalism 11, Patient Care 12–13, Medical
    Knowledge 6). UNE COM students are osteopathic students, so the school may want them.
  - Patient Care 10 (health promotion and prevention in care plans), which would fit OBJ-13 if
    the discharge plan should carry prevention content.
  - ADMSEP objectives at item level. The 1997 clerkship objectives are DSM-IV era and their live
    page is gone; the 2007 ADMSEP guide's four units (clinical skills; psychopathology;
    prevention, therapeutics and management; professionalism, ethics and the law) informed the
    scope of this list but are not cross-referenced row by row.
- **Weeks follow the D3 spine**, not the older week READMEs (which still place family work in
  Week 4 and acute care in Week 5). WP-2 reconciles the schedule.
