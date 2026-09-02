# MS3 · Curriculum content — volume 9

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Practice and Exam Prep

---

## Shelf Mode — Exam Simulation

- **Slug:** `shelf-mode.html` · **Type:** tool · **Sidebar:** hidden (deep link only)
- **Source:** `07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`moderate`

#### Tool — clinical content

_These tools are single-file HTML that render from inline JS data, so the clinical text below is recovered from the tool's own string literals. Ordering follows the file, not the runtime flow._

**Static shell text:**

- Shelf Mode — Exam Simulation Reviewed by Joshua Moss, MD on 2026-07-05
- Skip to content

**Authored clinical strings (73):**

- Strong — exam-ready range.
- Solid — tighten the misses.
- Passing range — keep drilling.
- Psychopharm & Med Emergencies
- t label a draft mid-block without breaking the simulation, so the conservative subset is the attested 142. Categories map onto the existing BLUEPRINT topic regexes. */ var CAT_TOPIC={mood:"Mood",psychosis:"Psychosis",anxiety:"Anxiety, OCD & Trauma",substance:"Substance Use",pharm:"Psychopharm & Med Emergencies",neurocog:"Delirium, Dementia & MCI",personality:"Personality",childdev:"Child & Adolescent",otherdx:"Somatic & Related",safety:"Psychiatric Emergencies",ethics:"Interview, Ethics & Law",relational:"Relational & Family"}; function bankPool(data){ var out=[]; (((data&&data.items)||[])).forEach(function(it){ if(it.status!=="attested") return; if(!it.stem||!Array.isArray(it.options)||it.options.length<2) return; var hasCorrect=false; it.options.forEach(function(op){ if(op&&op.c)hasCorrect=true; }); if(!hasCorrect) return; /* Options are shuffled ONCE here (bank storage order is authoring order — the draft pool is known to lean on first-position answers) and letters relabel automatically because every render site derives them from array index (KEYS[i]). Correct option explains via the item
- A 26-year-old woman is admitted after 5 days of decreased need for sleep, rapid speech, increased spending, and a belief that she has been chosen to reform the hospital. She has had two prior depressive episodes treated with sertraline. On exam she is irritable with pressured speech and flight of ideas. Which of the following is the most appropriate next step?
- Continue sertraline and add cognitive behavioral therapy
- Antidepressant monotherapy can sustain or worsen mania; the priority is to stop it and start an antimanic agent.
- Discontinue sertraline and start a mood stabilizer or second-generation antipsychotic
- Correct — acute mania (bipolar I): stop the antidepressant, begin lithium/valproate or an SGA, and protect sleep.
- Start fluoxetine for treatment-resistant depression
- The presentation is mania, not depression; an antidepressant is contraindicated.
- Obtain brain MRI before initiating any treatment
- Classic mania with prior mood episodes does not require imaging before treatment; do not delay antimanic therapy.
- Begin lorazepam as monotherapy
- A benzodiazepine is adjunctive for agitation/sleep but does not treat the manic episode.
- Acute mania: stop the antidepressant, start a mood stabilizer or SGA, and protect sleep.
- A 30-year-old man on fluoxetine is brought in 8 hours after a friend gave him tramadol for back pain. He is agitated and diaphoretic. Temperature is 39.1°C, heart rate 124. Exam shows hyperreflexia and inducible clonus, greater in the lower extremities. Which of the following is the most likely diagnosis?
- Correct — rapid onset after adding a serotonergic agent (tramadol), with hyperthermia, autonomic instability, and neuromuscular hyperexcitability (clonus, hyperreflexia). Stop the agents, supportive care, consider cyproheptadine.
- Neuroleptic malignant syndrome
- NMS follows dopamine antagonists, evolves over days, and features 'lead-pipe' rigidity and bradyreflexia — not clonus/hyperreflexia.
- Anticholinergic toxidrome gives dry skin, absent bowel sounds, and normal reflexes — not diaphoresis with clonus.
- Malignant hyperthermia is triggered by volatile anesthetics/succinylcholine, not oral serotonergics.
- Sympathomimetic intoxication
- Stimulant toxicity can mimic this but lacks the prominent clonus/hyperreflexia and the clear serotonergic trigger.
- Serotonin syndrome = serotonergic trigger + hyperthermia + clonus/hyperreflexia (lower-limb predominant); NMS = dopamine blocker + rigidity + hyporeflexia over days.
- A 52-year-old man admitted for pancreatitis becomes tremulous and diaphoretic on hospital day 2, with heart rate 116, blood pressure 168/98, and visual misperceptions. He reports drinking a pint of vodka daily until admission. Which of the following is the most appropriate management?
- Symptom-triggered benzodiazepine dosing with CIWA-Ar monitoring, plus thiamine
- Correct — alcohol withdrawal: benzodiazepines (often CIWA-Ar–guided) are first-line, with thiamine to prevent Wernicke encephalopathy.
- Antipsychotics lower the seizure threshold and do not treat the underlying GABA/glutamate dysregulation; they are at most adjunctive for agitation.
- Intravenous dextrose before any other intervention
- Give thiamine before/with glucose in at-risk patients — a glucose load alone can precipitate Wernicke encephalopathy.
- Physical restraints and observation
- Restraints do not treat withdrawal and can worsen autonomic arousal; pharmacologic treatment is needed.
- Clonidine may blunt autonomic signs but does not prevent withdrawal seizures or delirium tremens.
- Alcohol withdrawal: benzodiazepines (CIWA-Ar–guided) first-line; give thiamine before glucose.
- A 78-year-old woman is inattentive and intermittently drowsy two days after hip surgery. Her family says she was cognitively intact at baseline; symptoms fluctuate and worsen at night. She is on oxycodone and diphenhydramine for sleep. Which of the following is the most appropriate first step?
- Identify and treat underlying causes and remove deliriogenic medications
- Correct — acute, fluctuating inattention with altered arousal is delirium. First-line is to find and fix the cause (pain meds, anticholinergics, infection, metabolic) and use nonpharmacologic measures.
- Start a scheduled long-acting benzodiazepine
- Benzodiazepines worsen delirium (except in alcohol/benzo withdrawal) and increase fall risk.
- Begin donepezil for cognitive decline
- Cholinesterase inhibitors treat chronic dementia, not acute delirium, and have no role here.
- Obtain an outpatient neuropsychology referral
- This is an acute medical problem requiring inpatient workup, not deferred testing.
- Reassure the family this is expected post-operative confusion and observe
- Delirium signals an underlying disturbance and predicts poor outcomes; it requires active workup, not watchful waiting.
- Delirium is a medical emergency: treat the cause and stop deliriogenic drugs; avoid benzodiazepines unless withdrawal-related.
- A 60-year-old man with diabetes and a necrotic foot refuses a recommended amputation. He can describe the gangrene, the risk of fatal sepsis without surgery, the option of amputation, and explains he would rather risk death than lose his leg, citing consistent long-held values. He has no psychosis or cognitive deficit. Which of the following best describes his decision-making capacity?
- He has capacity to refuse the amputation
- Correct — he demonstrates the four abilities (understanding, appreciation, reasoning, and a stable choice). Capacity is decision-specific; a 'wrong-seeming' choice with intact reasoning is still a capacitated refusal.
- He lacks capacity because the refusal is medically dangerous
- Capacity is about the process of decision-making, not whether the choice matches the medical recommendation.
- He lacks capacity and a guardian should consent to surgery
- There is no impairment in the four abilities; overriding a capacitated refusal would violate autonomy.
- Capacity cannot be assessed without neuropsychological testing
- Capacity is a clinical, decision-specific bedside determination, not a test score.
- He has capacity only if he agrees to surgery
- Capacity does not depend on agreeing with the team; that reasoning is circular.
- Capacity is decision-specific and rests on four abilities; a high-risk refusal with intact reasoning is still capacitated.
- Could not load the question bank (question_bank.json).
- Loading the question bank…
- Optional practice · exam simulation
- A timed, blueprint-weighted vignette set that mirrors the psychiatry COMAT / shelf. Choose your length, topics, and pacing. Single best answer, with feedback and a teaching point on every item.
- The attested question bank didn't load, so this is running on a small set of sample items so you can see how it works. Reload when you're back online for the full blueprint-weighted exam.
- Tutor — feedback after each
- Tip: press 1–5 to answer, Enter to advance.
- Optional exam-prep simulation. Items are educational and use fictional composites only (no patient information). Verify management against current guidelines and your team. Progress is saved only in this browser.
- Joshua Moss, MD | Psychiatrist
- Nothing to review — every item correct.
- Joshua Moss, MD | Psychiatrist · Educational simulation; fictional composites only. Verify management against current guidelines.
- End this set and discard progress?
- Educational simulation; fictional composites only (no patient information). Joshua Moss, MD | Psychiatrist

---

## COMAT & Shelf Review

- **Slug:** `shelf.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 742 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 5 min

**TL;DR (shown above the page text):**

> Use patients to organize exam review — for each patient, name the syndrome, write the differential, name one medical mimic, name first-line treatment, and name one safety or legal issue; the exam is patient-anchored, not topic-anchored.

**Key points (bulleted card):**

- Six COMAT/shelf exam traps to internalize: 'denies SI — low risk' (ask about means and preparatory behavior), 'psychosis means schizophrenia' (check substances, mood, and delirium first), and 'family support means discharge is safe' (family support is data, not a risk decision).
- The final week 9-item checklist covers mania vs. stimulant intoxication, delirium vs. psychosis, capacity in 4 abilities, chronic vs. acute risk formulation, catatonia red flags, antipsychotic adverse effects, lithium monitoring, alcohol withdrawal risk, and case presentation under 6 minutes.
- Legal and ethical questions anchor on decision-specific capacity, duty-to-protect jurisdictional variation, and voluntary vs. involuntary hospitalization — treat these as clinical reasoning problems, not rule memorization.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Turn each patient into an exam stem: age, time course, syndrome, key risk, mimic, and next best step.
- **mse** — Translate MSE into exam language: attention for delirium, psychomotor change for catatonia/mania, thought process/content for psychosis.
- **safety** — Shelf traps often hide safety in plain sight: means access, preparatory behavior, delirium, withdrawal, capacity, and adverse medication effects.
- **say** — My answer is..., because the discriminating feature is..., and the tempting wrong answer misses...
- **collateral** — Use collateral facts as exam discriminators: baseline, timeline, adherence, substance exposure, family safety, and follow-up feasibility.
- **rounds** — Rehearse one 20-second answer before rounds, then test the same concept in the question bank.
- **exam** — Study by patient problem, not topic list: syndrome, mimic, treatment, safety/legal, and disposition.
- **actions** — Open practice questions; Open shelf mode; Practice suicide wording

**Cross-references and tagging:**

- **Related tools:** `question-bank-practice.html`, `shelf-mode.html`, `review.html`, `diagnostic-reasoning.html`, `communication-practice.html`
- **Communication cases:** `suicide_direct_question_001`, `psychosis_validation_001`, `medication_ambivalence_001`
- **Workflow stages:** `exam`, `diagnosis`, `safety`
- **Workflow modes:** `shelf`, `5min`

#### Page text (as shipped)

# Psychiatry COMAT & Shelf Review Guide — Inpatient Rotation

Audience: MS3 students.

**Your exam is the COMAT.** UNE COM uses the **NBOME COMAT Clinical Psychiatry** subject exam (not the NBME shelf) for the Medical Knowledge grade. The high-yield content below serves both; for the official content blueprint and sample items, see the [COMAT Clinical Psychiatry page (NBOME)](https://www.nbome.org/assessments/comat/clinical-subject-exams/comat-clinical-psychiatry/).

## How To Study During The Rotation

Use patients to organize exam review:

- For each patient, identify the syndrome.
- Write the differential.
- Name one medical/substance mimic.
- Name first-line treatment.
- Name one safety or legal issue.
- Name one discharge barrier.

## High-Yield Domains

### Mood Disorders

Know:

- Major depressive episode criteria.
- Bipolar I vs bipolar II.
- Mixed features.
- Psychotic depression.
- Suicide risk assessment.
- Antidepressant-induced mania concern.

Clinical anchor:

- Sleep change and episodicity matter.

### Psychotic Disorders

Know:

- Schizophrenia spectrum timeline.
- Brief psychotic disorder, schizophreniform disorder, schizophrenia.
- Schizoaffective disorder vs mood disorder with psychotic features.
- Substance/medication-induced psychosis.
- Delirium as mimic.

Clinical anchor:

- Always ask about mood episodes, substances, medications, sleep, and medical symptoms.

### Anxiety, OCD, Trauma

Know:

- Panic disorder vs panic attack.
- GAD vs adjustment disorder.
- OCD obsessions/compulsions.
- PTSD intrusion, avoidance, negative mood/cognition, arousal.

Clinical anchor:

- Avoid forcing trauma details in the acute setting unless needed for safety.

### Personality Disorders

Know:

- Cluster A, B, C patterns.
- Borderline personality disorder criteria and self-harm risk.
- Splitting, idealization/devaluation, abandonment fears.

Clinical anchor:

- Describe behavior and context; avoid pejorative labels.

### Substance Use And Withdrawal

Know:

- Alcohol withdrawal timeline and seizure/DT risk.
- Opioid intoxication vs withdrawal.
- Stimulant intoxication and crash.
- Cannabis-associated anxiety/psychosis in vulnerable patients.

Clinical anchor:

- Last use and prior complicated withdrawal are essential.

### Neurocognitive And Medical Mimics

Know:

- Delirium: acute, fluctuating, inattentive.
- Dementia: chronic, progressive.
- Catatonia: motor/behavioral syndrome requiring urgent recognition.
- Medication effects: steroids, anticholinergics, dopaminergic agents, intoxication/withdrawal.

Clinical anchor:

- New confusion in hospital is delirium until proven otherwise.

### Psychopharmacology

Know broad classes:

- SSRIs/SNRIs.
- Mood stabilizers: lithium, valproate, carbamazepine, lamotrigine.
- Antipsychotics: first vs second generation, EPS, metabolic effects.
- Benzodiazepines: short-term use, withdrawal risk.
- Stimulants and non-stimulants for ADHD.

Clinical anchor:

- For inpatient psychiatry, monitoring and adverse effects are as important as starting dose.

### Legal/Ethical

Know:

- Capacity vs competence.
- Voluntary vs involuntary hospitalization basics.
- Duty to protect/warn varies by jurisdiction.
- Confidentiality and collateral.
- Emergency treatment principles.

Clinical anchor:

- Capacity is decision-specific and time-specific.

## Exam Traps (COMAT & Shelf)

| Trap | Better Thinking |
|---|---|
| "Patient denies SI, so low risk" | Ask about acute factors, means, preparatory behavior, collateral |
| "Psychosis means schizophrenia" | Check mood episodes, substances, delirium, medical causes |
| "Refusal means no capacity" | Assess four decision abilities |
| "Agitation means antipsychotic" | Consider delirium, withdrawal, pain, akathisia, trauma |
| "Family wants discharge, so discharge is safe" | Family support is data, not a substitute for risk reasoning |
| "Bizarre behavior is behavioral" | Consider catatonia, delirium, intoxication, neurologic illness |

## Weekly Exam Integration

| Week | Exam Focus |
|---|---|
| 1 | MSE, suicide assessment, psychiatric interview |
| 2 | DSM differentials and medical/substance mimics |
| 3 | Medication classes and psychotherapy basics |
| 4 | Emergency psychiatry, capacity, delirium, catatonia, withdrawal |
| 5 | Family, systems, discharge, ethics |
| 6 | Mixed practice questions and OSCE-style review |

## Practice Question Template

For each topic, make one question:

1. Stem: age, setting, symptoms, timeline.
2. Key clue: one detail that changes diagnosis or management.
3. Ask: diagnosis, next step, mechanism, adverse effect, risk, legal issue.
4. Explain why the wrong answers are tempting.

## Final Week Checklist

- Can I distinguish mania from stimulant intoxication?
- Can I distinguish delirium from psychosis?
- Can I explain capacity in four abilities?
- Can I write a chronic vs acute suicide risk formulation?
- Can I identify catatonia red flags?
- Can I name common antipsychotic adverse effects?
- Can I name lithium monitoring concerns?
- Can I describe alcohol withdrawal risk?
- Can I present a case in under 6 minutes?

Plain-English note: this guide links exam studying to real inpatient cases so
students do not treat test prep and clinical reasoning as separate tasks.


---

## Rapid Review — Buzzwords

- **Slug:** `rapid_review.md` · **Type:** md · **Sidebar:** listed
- **Source:** `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 968 words

#### Page text (as shipped)

# Rapid Review — Buzzwords & One-Liners


**How to use this.** A dense, night-before recall sheet: the classic association on the left, the answer and next move on the right. It is a *recall* tool, not a substitute for the topic pages — each line points back to where the reasoning lives. Confirm any dose or threshold against the primary page and institutional references before acting.

## Mood
- Depression ≥2 weeks, ≥5 SIGECAPS incl. mood or anhedonia → **major depressive episode** → SSRI + therapy. *(→ Mood)*
- Manic ≥1 week (or any duration if hospitalized), elevated/irritable + DIGFAST → **bipolar I** → mood stabilizer/SGA; **antidepressant monotherapy contraindicated**. *(→ Mood)*
- Antidepressant "works" but patient becomes activated/grandiose → uncovered **bipolar** → screen for bipolarity before any antidepressant.
- Severe, psychotic, catatonic, food-refusing, or pregnant + high suicide risk → **ECT**. *(→ ECT)*
- Grief-specific yearning/preoccupation >12 months, impairing → **prolonged grief disorder (DSM-5-TR)** — not normal bereavement.

## Psychosis
- Psychosis <1 mo → **brief psychotic**; 1–6 mo → **schizophreniform**; ≥6 mo → **schizophrenia**. *(→ Psychosis)*
- ≥2 wk psychosis *without* mood symptoms + mood episodes most of illness → **schizoaffective**; psychosis only during mood episodes → **mood disorder with psychotic features**.
- Two failed adequate antipsychotic trials → **treatment-resistant** → **clozapine** (ANC monitoring per prescribing info; REMS eliminated 2025). *(→ Psychosis, Med Monitoring)*
- Clozapine + fever/chest pain early → **myocarditis**; + abdominal distension → **ileus**. *(→ Psychosis)*
- First-episode psychosis → **coordinated specialty care (RAISE)** — meds + family + psychosocial.

## Anxiety / OCD / Trauma
- Chronic worry ≥6 mo, multiple domains → **GAD** → SSRI/SNRI + CBT. *(→ Anxiety)*
- Recurrent unexpected attacks + worry about attacks → **panic disorder** → SSRI + CBT; benzo bridge only.
- Ego-dystonic obsessions + rituals → **OCD** → SSRI (higher dose) + **ERP**; clomipramine 2nd-line.
- Trauma + re-experiencing/avoidance/hyperarousal → **PTSD** → trauma-focused therapy ± SSRI/SNRI; prazosin for nightmares; **avoid benzodiazepines**.
- Anxiety only when performing → **performance-type social anxiety** → PRN beta-blocker.

## Personality
- Warm to nights, hostile to days → **splitting (BPD)** → team consistency. *(→ Personality)*
- Recurrent self-harm + emptiness + unstable relationships → **BPD** → **DBT** first-line; meds adjunctive.
- Pervasive lifelong distrust, no frank psychosis → **paranoid PD** (Cluster A).
- Odd beliefs/magical thinking + persistent social discomfort → **schizotypal**; no desire for relationships → **schizoid**; wants but fears rejection → **avoidant**.
- Ego-syntonic perfectionism/control, no true obsessions → **OCPD** (not OCD).
- ≥18 + conduct disorder before 15 → **antisocial PD**.

## Substance / Withdrawal
- Confusion + ophthalmoplegia + ataxia in alcohol use → **Wernicke** → **thiamine before glucose**. *(→ SUD)*
- Alcohol withdrawal peak 48–96 h, autonomic instability + confusion → **delirium tremens** → benzodiazepines (CIWA-driven). *(→ Withdrawal card)*
- Opioid withdrawal → track with **COWS**; start buprenorphine only when objective withdrawal present (COWS ≈ 8–12). *(→ SUD)*
- AUD maintenance → **naltrexone or acamprosate** first-line; disulfiram adherence-dependent.
- Opioid overdose → **naloxone**; MOUD (buprenorphine/methadone/naltrexone) reduces mortality.

## Neurocognitive / Delirium / Mimics
- Acute, fluctuating, inattentive → **delirium** → find and treat the cause; avoid benzodiazepines (except alcohol/sedative withdrawal). *(→ Delirium)*
- New "psychiatric" symptoms in an older/medically ill patient → **delirium/medical until proven otherwise**. *(→ Medical Workup)*
- Visual hallucinations + fluctuating cognition + parkinsonism → **Lewy body dementia** → **neuroleptic sensitivity** (avoid antipsychotics). *(→ Neurocognitive)*
- Stepwise decline + vascular risk → **vascular dementia**; early behavior/personality change → **frontotemporal**.
- Psychosis + movement disorder + seizures/autonomic instability → **anti-NMDA-receptor encephalitis**.

## Safety / Toxidromes
- Dopamine blocker + **lead-pipe rigidity + hyporeflexia** + high CK → **NMS** → stop antipsychotic; dantrolene/bromocriptine. *(→ Toxidromes)*
- Serotonergic agent + **clonus + hyperreflexia (legs)** + diaphoresis → **serotonin syndrome** → cyproheptadine.
- **Dry, flushed, mydriasis, retention** → **anticholinergic toxicity**.
- Waxy flexibility/posturing/mutism → **catatonia** → **lorazepam challenge**; malignant/refractory → **ECT**. *(→ Catatonia)*
- Strongest suicide risk factor = **prior attempt**; highest-yield prevention = **means restriction (firearms)**; highest-risk window = **post-discharge**. *(→ Suicide)*
- Strongest predictor of violence = **past violence**; treat **dynamic** factors (psychosis, intoxication, agitation). *(→ Violence)*

## Psychopharmacology / Monitoring
- Lithium level = **12-h trough, ~5 days after change**; NSAIDs/thiazides/ACE raise it; teratogen (Ebstein). *(→ Med Monitoring)*
- Valproate → LFTs/platelets; **teratogen (neural tube)** — avoid in childbearing potential.
- Antipsychotic → baseline + ongoing **metabolic** panel; watch QTc, EPS, tardive dyskinesia.
- Akathisia → reduce/switch → **propranolol**; SSRI overdose relatively safe; **TCA overdose → wide QRS** (sodium bicarbonate).
- MAOI + tyramine → **hypertensive crisis**; MAOI + serotonergic → serotonin syndrome (wait washout).

## Child / Development
- Inattention/hyperactivity, before age 12, ≥2 settings → **ADHD** → **stimulants** first-line. *(→ Neurodevelopmental)*
- Social-communication deficits **+ restricted/repetitive behaviors**, early → **autism**.
- Defiant/argumentative, no rights-violations → **ODD**; aggression/destruction/deceit/serious violations → **conduct disorder**.
- Motor **and** vocal tics >1 yr, onset <18 → **Tourette**.
- Nocturnal enuresis (age ≥5) → **enuresis alarm** first-line.

## Ethics / Legal
- Involuntary hold = **mental illness + danger to self/others or grave disability**. *(→ Ethics & Law)*
- **Capacity** = clinical, decision-specific, can fluctuate; **competence** = legal/court.
- Capacitated patient may **refuse even life-sustaining treatment**.
- Identifiable threatened victim → **duty to protect (Tarasoff)**.
- No advance directive → surrogate uses **substituted judgment**, then best interest.
- Emergency + can't consent + no surrogate → **implied consent**.

## Other high-yield
- Deliberate illness for the sick role, no external gain → **factitious**; for external gain → **malingering**; not intentional → **somatic symptom disorder**.
- Refeeding a severely malnourished patient → watch **hypophosphatemia** (refeeding syndrome). *(→ Nutrition)*
- Serotonergic + poor sleep + weight/BMI tracking on antipsychotics = routine metabolic vigilance.

*Joshua Moss, MD | Psychiatrist · High-yield recall aid; confirm every threshold/dose against the linked topic page and institutional references. Educational; fictional composites only, no PHI.*


---

## OSCE Stations

- **Slug:** `osce.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 1,544 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 4 min

**TL;DR (shown above the page text):**

> Six OSCE stations covering the skills most tested on rounds — suicide risk with collateral, capacity with delirium recognition, catatonia, alcohol withdrawal, family meeting agenda, and oral case presentation — with entrustment anchors 1–4.

**Key points (bulleted card):**

- Each station specifies behaviors to practice, not answers to memorize — rater focus is on clinical reasoning, communication, and appropriate escalation, not on naming the correct drug first.
- Station 2 (capacity) and Station 3 (catatonia) test whether you avoid premature psychiatric labels when a medical mimic is present — both require recognizing the underlying driver before concluding behavior.
- Target entrustment level 3 by end of rotation: able to perform routine parts with indirect supervision and escalate appropriately — safe and organized, not yet independent.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — For each OSCE station, first identify the task: risk, capacity, catatonia, withdrawal, family meeting, or oral presentation.
- **mse** — Use observable MSE findings to justify your next step; stations reward saying what you saw, not only naming a diagnosis.
- **safety** — State when you would stop the station and get supervision, medical evaluation, or emergency support.
- **say** — I want to ask this directly because safety matters: have you had thoughts of killing yourself?
- **collateral** — Use collateral to test baseline, time course, risk, and discharge feasibility rather than asking for global impressions.
- **rounds** — Give a concise assessment, your immediate safety action, and the data that would change your plan.
- **exam** — Practice stations aloud: opening line, core questions, safety escalation, and summary.
- **actions** — Practice direct suicide question; Open reasoning workbench; Open rounding prep

**Cross-references and tagging:**

- **Related tools:** `communication-practice.html`, `diagnostic-reasoning.html`, `family-systems.html`, `oral.html`, `cssrs.html`, `capacity.html`
- **Communication cases:** `suicide_direct_question_001`, `family_meeting_opening_001`, `collateral_questions_001`
- **Workflow stages:** `encounter`, `safety`, `communication`, `team`, `exam`
- **Workflow modes:** `ward`, `safety`, `family`, `shelf`

#### Page text (as shipped)

# MS3 Psychiatry OSCE Station Set

Generated: 2026-06-27

All cases are synthetic. No real patient details are used.

## Station 1 - Suicide Risk With Collateral Hesitation

**Time:** 12 minutes encounter, 3 minutes summary, 10 minutes feedback.

**Student task**

Conduct a focused suicide risk assessment, ask permission for collateral, and
state an acute risk impression.

**Patient brief**

29-year-old retail worker admitted after sending a concerning text to a sibling.
The patient says the ED overreacted. Sleep has been 3-4 hours nightly. Cannabis
use increased. A goodbye letter exists but is not volunteered unless asked
directly. Firearm access is at a parent's home.

**Behaviors to practice**

- Opens with role and purpose.
- Asks directly about suicidal thoughts, plan, intent, preparation, past attempts.
- Asks about means access.
- Separates chronic and acute factors.
- Asks permission for collateral.
- Reflects the patient's worry about burdening family.
- Names one next step.

**Rater focus**

Risk formulation, means restriction, collateral consent, tone.

## Station 2 - Capacity To Refuse Medical Treatment

**Time:** 12 minutes encounter, 5 minutes oral capacity summary.

**Student task**

Assess decision-making capacity for a specific refusal.

**Patient brief**

67-year-old admitted to medicine with infection and new paranoia that IV
antibiotics are poison. The patient is intermittently inattentive and worse at
night. The medical team asks, "Does the patient have capacity to refuse?"

**Behaviors to practice**

- Identifies the exact decision.
- Assesses choice, understanding, appreciation, and reasoning.
- Screens attention and fluctuation.
- Considers delirium and psychosis.
- Avoids equating disagreement with incapacity.
- Presents which capacity ability is impaired.

**Rater focus**

Decision-specific reasoning and delirium recognition.

## Station 3 - Possible Catatonia

**Time:** 10 minutes observation/interview, 5 minutes team presentation.

**Student task**

Identify catatonia concern and escalate.

**Patient brief**

35-year-old with depression sits motionless, answers rarely, has eaten little,
and intermittently holds the same posture. Nursing reports the patient is
"refusing everything." Vital signs are stable but oral intake is poor.

**Behaviors to practice**

- Describes motor signs objectively.
- Asks about intake, mobility, autonomic signs, and medication exposure.
- Considers catatonia in differential.
- Avoids labeling behavior as "noncompliance."
- Escalates to resident/attending.

**Rater focus**

Recognition and language.

## Station 4 - Alcohol Withdrawal Risk On Psychiatry Unit

**Time:** 10 minutes encounter, 5 minutes presentation.

**Student task**

Screen for alcohol withdrawal risk and escalate appropriately.

**Patient brief**

48-year-old admitted for suicidal ideation after job loss. Reports drinking
"more than usual." Last drink was yesterday morning. Prior tremors and one
possible withdrawal seizure years ago, revealed only if asked.

**Behaviors to practice**

- Asks amount/frequency/last drink.
- Asks prior withdrawal, seizure, delirium tremens.
- Checks current symptoms and vitals.
- Recognizes alcohol withdrawal risk.
- Does not propose unsupervised management.

**Rater focus**

Withdrawal history and escalation.

## Station 5 - Family Meeting Agenda Before Discharge

**Time:** 15 minutes prep/presentation.

**Student task**

Prepare a family meeting agenda for a synthetic patient nearing discharge.

**Case brief**

22-year-old admitted for first manic episode. Sleep and agitation have improved.
Family is frightened and divided: one parent wants strict control, another wants
to avoid conflict. Patient wants discharge and refuses to discuss warning signs.

**Behaviors to practice**

- Names meeting goal.
- Defines student/team role.
- Includes patient voice.
- Covers warning signs, medication plan, sleep, means safety, follow-up.
- Avoids making family responsible for treatment adherence alone.
- Names one unresolved discharge barrier.

**Rater focus**

Structure, boundaries, patient autonomy, family support.

## Station 6 - Oral Presentation Of A New Admission

**Time:** 6-minute presentation, 4-minute questions.

**Student task**

Present a synthetic admission with differential, risk, formulation, and plan.

**Case brief**

40-year-old with insomnia, paranoia, weight loss, and new stimulant use. Family
history includes bipolar disorder. Patient has hypertension and recently started
a corticosteroid burst.

**Behaviors to practice**

- Organized timeline.
- Differential includes stimulant-induced psychosis, mania, steroid effect,
  primary psychosis, medical/neurologic contributors.
- MSE uses observable language.
- Risk is explicit.
- Plan matches differential and safety concerns.

**Rater focus**

Diagnostic reasoning and concision.

## Entrustment Anchors

| Level | Description |
|---|---|
| 1 | Needs full prompting; misses safety or diagnosis issue |
| 2 | Identifies main issue but needs direct supervision |
| 3 | Performs with indirect supervision for routine parts; escalates appropriately |
| 4 | Organized, safe, concise, anticipates next step |

## Shared Debrief Questions

- What information changed your risk or differential?
- What did you ask directly rather than imply?
- What patient/family emotion did you notice?
- What would you escalate immediately?
- What would you document in one sentence?

Plain-English note: these OSCEs practice what students actually do on an
inpatient unit: ask safety questions, recognize medical mimics, talk to families,
and present clearly.

---

## Scored Checklists & Critical-Fail Criteria

*Added 2026-07-04 — reviewed and attested by Joshua Moss, MD (2026-07-09). Each station is scored out of 10.
**A critical-fail auto-fails the station regardless of the numeric score** (mark the station "1" on the entrustment anchor and debrief the safety miss).*

**How to score.** Award the listed points for behaviors performed unprompted; give half credit if the examiner had to prompt. Pass = **≥ 7/10 AND no critical-fail**. Map the total to the entrustment anchors (≤4 → level 1; 5–6 → level 2; 7–8 → level 3; 9–10 → level 4).

### Station 1 — Suicide risk with collateral hesitation (10 pts)

- Introduces role, purpose, and the limits of confidentiality — 1
- Asks directly about ideation, **plan, intent, and preparatory acts** — 2
- Elicits the goodbye letter / preparation by asking directly (not volunteered) — 1
- Asks about **means access, including the firearm at the parent's home** — 2
- Separates chronic from acute risk factors; notes protective factors — 1
- Asks permission for collateral — 1
- Responds empathically to the "burden on family" worry — 1
- States an acute risk impression **and** one concrete next step — 1

**Critical-fail (auto-fail):** never asks about means/firearm access · never screens plan/intent/preparation · elicits an active plan yet states no protective step (means restriction, observation level, escalation).

### Station 2 — Capacity to refuse medical treatment (10 pts)

- Identifies the **exact decision** at stake (refuse IV antibiotics) — 2
- Assesses all four abilities — choice, understanding, appreciation, reasoning — 4 (1 each)
- Screens attention and fluctuation (delirium) — 1
- Considers delirium/psychosis as contributors — 1
- Names **which specific ability is impaired**; frames capacity as decision- and time-specific — 2

**Critical-fail:** equates disagreement/refusal alone with incapacity · misses delirium in a clearly fluctuating patient (no attention screen) · declares the patient globally "incompetent" rather than decision-specific.

### Station 3 — Possible catatonia (10 pts)

- Describes motor signs objectively (immobility, mutism, posturing, negativism) — 2
- Asks about intake, mobility, autonomic signs, medication exposure — 2
- Names **catatonia** in the differential — 2
- Recognizes escalation/benzodiazepine (lorazepam) challenge; does **not** reflexively give an antipsychotic — 1
- Avoids "noncompliance / refusing everything" language — 1
- Escalates to resident/attending — 1
- Flags malignant catatonia / NMS as the dangerous end — 1

**Critical-fail:** labels the patient "refusing/noncompliant" without considering catatonia · fails to escalate a patient with poor intake + motor signs · proposes an antipsychotic as the fix without recognizing catatonia/NMS risk.

### Station 4 — Alcohol withdrawal risk (10 pts)

- Asks amount / frequency / **last drink** — 2
- Asks about prior withdrawal, **seizure, and DTs** (revealed only if asked) — 2
- Checks current symptoms and vital signs — 2
- Recognizes elevated withdrawal/seizure risk — 2
- Escalates to a protocol (symptom-triggered benzodiazepine per team) and names **thiamine before glucose** — 1
- Does **not** propose unsupervised management — 1

**Critical-fail:** proposes unsupervised/self-directed management or discharge · never asks the withdrawal-seizure history (misses it) · fails to escalate a high-risk withdrawal.

### Station 5 — Family meeting agenda before discharge (10 pts)

- Names the meeting goal — 2
- Defines the student/team role and boundaries — 1
- Includes the patient's voice and protects autonomy — 2
- Covers warning signs, medication plan, sleep, **means safety**, and follow-up — 2
- Avoids making the family solely responsible for adherence — 1
- Holds the divided parents without taking a side — 1
- Names one unresolved discharge barrier — 1

**Critical-fail:** omits means-safety and warning-signs for a first-manic patient who refuses to discuss them · proposes a discharge decision beyond MS3 scope · sidelines patient autonomy.

### Station 6 — Oral presentation of a new admission (10 pts)

- Organized one-liner and timeline — 2
- Differential includes **stimulant-induced psychosis, mania, steroid effect, primary psychosis, and medical/neurologic** contributors — 3
- MSE in observable language — 1
- Risk stated explicitly — 2
- Plan matches the differential and safety concerns (includes medical workup) — 2

**Critical-fail:** anchors on a primary psychiatric diagnosis without the medical/substance/steroid differential · omits risk entirely · proposes management beyond MS3 scope without escalation.

---

**Examiner note.** The critical-fail list encodes the non-negotiable safety behaviors for each station — a student can be fluent and still fail if they miss one. Use the Shared Debrief Questions above to close every station, and always name the safety behavior that was missed.


---

## Practice Cases

- **Slug:** `cases.md` · **Type:** md · **Sidebar:** listed
- **Source:** `14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/synthetic_practice_cases.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 849 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 6 min

**TL;DR (shown above the page text):**

> Eight synthetic composite cases spanning first-episode mania, suicide risk, withdrawal, delirium, catatonia, family dynamics, and discharge planning — each includes student tasks, hidden clinical detail that rewards direct questioning, and a case discussion template.

**Key points (bulleted card):**

- Each case contains hidden clinical detail that is only revealed when the student asks directly — the reward for thorough, non-assumption-based history-taking.
- Student tasks mirror the OSCE: build the differential, name the safety questions, draft an MSE, prepare a family meeting agenda, and identify the discharge barrier.
- The case discussion template asks: what would change the differential? what collateral is missing? what is the discharge barrier? what must be done before tomorrow? — use it after every case.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — For each case, ask what hidden detail would change diagnosis, risk, disposition, or family/system plan.
- **mse** — Document the MSE finding that most changes the differential and the one finding that could be misleading.
- **safety** — Name the safety question before the diagnosis question when the case includes suicide, violence, withdrawal, delirium, catatonia, or discharge risk.
- **say** — What is he like at baseline, what changed, when did it change, and what specific safety concerns have you noticed?
- **collateral** — Use collateral to define baseline, timeline, safety, adherence, supports, and discharge barriers.
- **rounds** — After the case, present problem representation, differential, risk formulation, collateral gap, and next action.
- **exam** — Synthetic cases are practice for illness scripts: syndrome, mimic, first-line treatment, safety/legal issue, and disposition.
- **actions** — Open reasoning workbench; Practice collateral questions; Open family systems practice

**Cross-references and tagging:**

- **Related tools:** `diagnostic-reasoning.html`, `communication-practice.html`, `family-systems.html`, `oral.html`, `decision-aids.html`
- **Communication cases:** `suicide_direct_question_001`, `collateral_questions_001`, `family_conflict_discharge_001`
- **Workflow stages:** `diagnosis`, `safety`, `family`, `team`, `exam`
- **Workflow modes:** `ward`, `safety`, `family`, `shelf`

#### Page text (as shipped)

# Synthetic Practice Cases

Generated: 2026-06-27

All cases are fictional composites for teaching. No real patient details are used.

## Case 1 - First-Episode Mania With Family Conflict

**Presentation**

22-year-old college student brought by family for 6 days of little sleep,
increased spending, pressured speech, grand plans, irritability, and paranoid
concerns about roommates. Urine toxicology is positive for cannabis only.

**Student tasks**

- Build differential.
- Identify safety questions.
- Draft MSE.
- Prepare family meeting agenda.
- Name discharge barriers.

**Teaching points**

- Mania vs substance-induced symptoms.
- Sleep as both symptom and treatment target.
- Family fear can become control; family support still matters.
- Discharge readiness requires more than reduced agitation.

## Case 2 - Depression, Alcohol Escalation, And Suicide Risk

**Presentation**

46-year-old admitted after telling a coworker, "I cannot do this anymore."
Reports 2 months of low mood, insomnia, guilt, and increased nightly alcohol
use. No prior psychiatric care. Initially denies a plan but later describes
stockpiled medication at home.

**Student tasks**

- Separate chronic and acute suicide risk.
- Ask withdrawal screening questions.
- Draft means-restriction plan for team review.
- Write one-paragraph formulation.

**Teaching points**

- "Denies SI" is not enough.
- Alcohol can increase acute risk and complicate treatment.
- If withdrawal risk or malnutrition is present, verify thiamine is given before or with glucose/carbohydrate when possible; true hypoglycemia still gets treated immediately.
- Means restriction must be concrete.
- Collateral can change risk formulation.

## Case 3 - Delirium Mistaken For Psychosis

**Presentation**

73-year-old on medical floor becomes paranoid overnight, sees insects, pulls at
IV line, and is calm by morning. Family says the patient was independent last
week. New medications include diphenhydramine for sleep.

**Student tasks**

- Identify delirium features.
- Perform brief attention screen.
- Build medical differential.
- Present consult question.

**Teaching points**

- Fluctuation and inattention are key.
- Visual hallucinations in an older hospitalized patient should trigger delirium concern.
- Medication review is part of psychiatric assessment.

## Case 4 - Possible Catatonia In Severe Depression

**Presentation**

38-year-old with severe depression is lying still, minimally speaking, eating
little, and holding odd postures. Staff describe "refusal." No fever. Recently
started antipsychotic for suspected psychotic depression.

**Student tasks**

- Describe motor findings objectively.
- Name catatonia in differential.
- Identify escalation triggers.
- Avoid stigmatizing documentation.

**Teaching points**

- Catatonia can be missed when behavior is framed as refusal.
- Poor intake and immobility are safety issues.
- Catatonia and delirium can overlap; ask for help early.

## Case 5 - Capacity To Refuse Treatment

**Presentation**

58-year-old with bipolar disorder and pneumonia refuses antibiotics, saying
"the hospital is experimenting on me." The patient can repeat the diagnosis but
cannot explain what might happen without treatment and becomes distracted
during questioning.

**Student tasks**

- State the exact decision.
- Assess choice, understanding, appreciation, reasoning.
- Screen attention.
- Present capacity summary.

**Teaching points**

- Capacity is decision-specific.
- Psychosis does not automatically remove capacity.
- Inattention raises delirium concern.

## Case 6 - Withdrawal Risk On Admission

**Presentation**

51-year-old admitted for suicidal ideation after divorce. Reports drinking "a
few" drinks nightly, then clarifies it is 10-12 drinks daily. Last drink was 18
hours ago. Prior withdrawal seizure 5 years ago.

**Student tasks**

- Ask alcohol withdrawal questions.
- Identify red flags.
- Escalate to team.
- Include withdrawal risk in formulation.

**Teaching points**

- Quantify "a few."
- Prior complicated withdrawal changes acuity.
- Thiamine before/with glucose is a safety check in alcohol withdrawal risk because carbohydrate loading can precipitate Wernicke encephalopathy in thiamine-depleted patients.
- Psychiatric units still manage medical risk.

## Case 7 - Discharge Barrier Hidden In Family System

**Presentation**

31-year-old admitted for psychosis is improved on medication. Patient wants to
return home. Parent says privately, "I cannot do this again," but tells patient
"of course you can come home."

**Student tasks**

- Identify mismatch between stated and actual support.
- Prepare family meeting agenda.
- Draft discharge barrier map.
- Name patient autonomy issue.

**Teaching points**

- Family agreement is not the same as viable discharge support.
- Discharge planning requires honest capacity of the support system.
- The patient should not be triangulated between team and family.

## Case 8 - Oral Presentation Integration

**Presentation**

40-year-old with insomnia, paranoia, weight loss, stimulant use, and recent
corticosteroid prescription. Family history of bipolar disorder. Medical workup
is incomplete.

**Student tasks**

- Give 6-minute admission presentation.
- Include differential.
- Name next diagnostic steps.
- Name immediate safety concerns.

**Teaching points**

- Psychosis has many causes.
- Timeline and medication exposure matter.
- Do not close on a primary psychiatric diagnosis too early.

## Case Discussion Template

For each case:

1. One-line summary.
2. Top three differential diagnoses.
3. What could be medically dangerous?
4. What safety questions are mandatory?
5. What collateral would help?
6. What would change discharge readiness?
7. What should the note say in one sentence?

Plain-English note: these cases let students practice reasoning without using
real patient details. They are deliberately common enough to teach patterns but
synthetic enough for safe reuse.


---

## Landmark Trials — Listen & Test

- **Slug:** `landmark_trials.md` · **Type:** md · **Sidebar:** listed
- **Source:** `07_Evidence_and_Reading/Landmark_Trials/landmark_trials_page.md`
- **Governance:** status=`reviewed` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 881 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 6 min

**TL;DR (shown above the page text):**

> Fifty landmark papers as 90–120 second audio overviews with board-style self-test in Shelf Mode and Daily Review — listen to the four Foundations papers first (Engel, Rosenhan, Robins-Guze, Insel), then follow your patients to the theme that fits.

**Key points (bulleted card):**

- Each audio is 90–120 seconds — short enough for the walk between the unit and the staff room, not a dedicated study block.
- The Acute & Safety cluster (6 papers) covers Appelbaum capacity, Bush-Francis catatonia, lithium-suicide (Cipriani 2013), safety planning (Stanley 2012), and the limits of risk-factor prediction (Franklin 2017) — the most rotation-relevant papers.
- The same trials feed the board-style questions in Shelf Mode and Daily Review, which extend beyond the individual trial into the broader clinical question — pair the audio with those for shelf preparation.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Choose the paper that answers the clinical problem in front of you: capacity, catatonia, lithium-suicide, safety planning, or diagnostic validity.
- **mse** — Separate what the study measured from what you observed at bedside; do not let a trial result replace the individual assessment.
- **safety** — Use safety papers to support supervision and documentation, not to independently clear or detain a patient.
- **say** — Translate one landmark finding into a plain-language explanation only when it helps shared decision-making.
- **collateral** — Use paper themes to guide collateral questions about timeline, prior response, safety environment, and treatment adherence.
- **rounds** — Offer a 20-second evidence pearl when it changes the differential, risk formulation, or next step.
- **exam** — Pair each audio with board-style self-test in Shelf Mode or Daily Review, then answer one question bank item on the same concept.
- **actions** — Open question bank practice

**Cross-references and tagging:**

- **Related tools:** `review.html`, `question-bank-practice.html`, `oral.html`
- **Evidence sources:** `appelbaum-grisso-1988-capacity`, `border-2019-candidate-gene`, `brown-1972-expressed-emotion`, `bush-1996-catatonia-rating-scale`, `caspi-2003-5htt-stress`, `engel-1977-biopsychosocial-model`, `felitti-1998-ace`, `franklin-2017-suicide-risk-meta-analysis`, `lieberman-2005-catie`, `linehan-1991-dbt`, `march-2004-tads`, `pharoah-2010-family-intervention`, `rosenhan-1973-sane-places`, `rush-2006-stard`, `stanley-brown-2012-safety-planning`, `volkow-2016-addiction-brain-disease`, `wampold-1997-bona-fide-psychotherapies`
- **Workflow stages:** `exam`, `diagnosis`, `safety`, `treatment`
- **Workflow modes:** `ward`, `5min`, `shelf`
- **Shelf blueprint tags:** `pharm`
- **EPA crosswalk:** `EPA7`

#### Page text (as shipped)

# Landmark Psychiatry — Listen & Test

> 50 landmark papers as ~2-minute audio overviews (NotebookLM), grouped by theme. Where a DOI is verified, open the paper. Shelf Mode and Daily Review draw board-style questions from these papers plus additional high-yield topics. Suggested, not required. Educational; verify against primary sources.

## Foundations  (4)
**Engel 1977 - Biopsychosocial**  ·  _1:47_
<audio controls preload="none" src="audio/40_LM_41_Engel_1977_Biopsychosocial_1_47.m4a"></audio>
<a href="https://doi.org/10.1126/science.847460" target="_blank" rel="noopener">Paper (DOI)</a>

**Insel 2010 - RDoC**  ·  _1:44_
<audio controls preload="none" src="audio/49_LM_50_Insel_2010_RDoC_1_44.m4a"></audio>
<a href="https://doi.org/10.1176/appi.ajp.2010.09091379" target="_blank" rel="noopener">Paper (DOI)</a>

**Robins-Guze 1970 - Diagnostic Validity**  ·  _1:54_
<audio controls preload="none" src="audio/44_LM_42_Robins_Guze_1970_Diagnostic_Validity_1_54.m4a"></audio>
<a href="https://doi.org/10.1176/ajp.126.7.983" target="_blank" rel="noopener">Paper (DOI)</a>

**Rosenhan 1973 - Pseudopatients**  ·  _1:50_
<audio controls preload="none" src="audio/26_LM_26_Rosenhan_1973_Pseudopatients_1_50.m4a"></audio>
<a href="https://doi.org/10.1126/science.179.4070.250" target="_blank" rel="noopener">Paper (DOI)</a>


## Mood  (5)
**Cipriani 2018 - Antidepressant NMA**  ·  _1:52_
<audio controls preload="none" src="audio/05_LM_05_Cipriani_2018_Antidepressant_NMA_1_52.m4a"></audio>
<a href="https://doi.org/10.1016/S0140-6736(17)32802-7" target="_blank" rel="noopener">Paper (DOI)</a>

**Geddes 2010 - BALANCE**  ·  _1:36_
<audio controls preload="none" src="audio/06_LM_06_Geddes_2010_BALANCE_1_36.m4a"></audio>
<a href="https://doi.org/10.1016/S0140-6736(09)61828-6" target="_blank" rel="noopener">Paper (DOI)</a>

**Miklowitz 2003 - FFT Bipolar**  ·  _1:53_
<audio controls preload="none" src="audio/15_LM_15_Miklowitz_2003_FFT_Bipolar_1_53.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.60.9.904" target="_blank" rel="noopener">Paper (DOI)</a>

**Rush 2006 - STAR*D**  ·  _1:44_
<audio controls preload="none" src="audio/02_LM_02_Rush_2006_STAR_D_1_44.m4a"></audio>
<a href="https://doi.org/10.1176/appi.ajp.163.11.1905" target="_blank" rel="noopener">Paper (DOI)</a>

**Sachs 2007 - STEP-BD**  ·  _1:34_
<audio controls preload="none" src="audio/03_LM_03_Sachs_2007_STEP_BD_1_34.m4a"></audio>
<a href="https://doi.org/10.1056/NEJMoa064135" target="_blank" rel="noopener">Paper (DOI)</a>


## Psychosis  (3)
**Kane 1988 - Clozapine**  ·  _1:50_
<audio controls preload="none" src="audio/04_LM_04_Kane_1988_Clozapine_1_50.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1988.01800330013001" target="_blank" rel="noopener">Paper (DOI)</a>

**Leucht 2013 - Antipsychotic NMA**  ·  _2:00_
<audio controls preload="none" src="audio/07_LM_08_Leucht_2013_Antipsychotic_NMA_2_00.m4a"></audio>
<a href="https://doi.org/10.1016/S0140-6736(13)60733-3" target="_blank" rel="noopener">Paper (DOI)</a>

**Lieberman 2005 - CATIE Trial**  ·  _1:38_
<audio controls preload="none" src="audio/01_LM_01_Lieberman_2005_CATIE_Trial_1_38.m4a"></audio>
<a href="https://doi.org/10.1056/NEJMoa051688" target="_blank" rel="noopener">Paper (DOI)</a>


## Acute & Safety  (6)
**Appelbaum 1988 - Capacity**  ·  _1:49_
<audio controls preload="none" src="audio/27_LM_27_Appelbaum_1988_Capacity_1_49.m4a"></audio>
<a href="https://doi.org/10.1056/nejm198812223192504" target="_blank" rel="noopener">Paper (DOI)</a>

**Bush-Francis 1996 - Catatonia**  ·  _1:35_
<audio controls preload="none" src="audio/28_LM_28_Bush_Francis_1996_Catatonia_1_35.m4a"></audio>
<a href="https://doi.org/10.1111/j.1600-0447.1996.tb09814.x" target="_blank" rel="noopener">Paper (DOI)</a>

**Cipriani 2013 - Lithium-Suicide**  ·  _1:50_
<audio controls preload="none" src="audio/08_LM_07_Cipriani_2013_Lithium_Suicide_1_50.m4a"></audio>
<a href="https://doi.org/10.1136/bmj.f3646" target="_blank" rel="noopener">Paper (DOI)</a>

**Franklin 2017 - Risk Factors**  ·  _1:38_
<audio controls preload="none" src="audio/35_LM_35_Franklin_2017_Risk_Factors_1_38.m4a"></audio>
<a href="https://doi.org/10.1037/bul0000084" target="_blank" rel="noopener">Paper (DOI)</a>

**Mann 2005 - Suicide Prevention**  ·  _1:38_
<audio controls preload="none" src="audio/31_LM_33_Mann_2005_Suicide_Prevention_1_38.m4a"></audio>
<a href="https://doi.org/10.1001/jama.294.16.2064" target="_blank" rel="noopener">Paper (DOI)</a>

**Stanley 2012 - Safety Planning**  ·  _1:50_
<audio controls preload="none" src="audio/34_LM_34_Stanley_2012_Safety_Planning_1_50.m4a"></audio>
<a href="https://doi.org/10.1016/j.cbpra.2011.01.001" target="_blank" rel="noopener">Paper (DOI)</a>


## Psychopharmacology  (2)
**Kellner 2006 - Continuation ECT**  ·  _1:48_
<audio controls preload="none" src="audio/09_LM_09_Kellner_2006_Continuation_ECT_1_48.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.63.12.1337" target="_blank" rel="noopener">Paper (DOI)</a>

**Moncrieff 2022 - Antidepressant Withdrawal**  ·  _1:37_
<audio controls preload="none" src="audio/10_LM_10_Moncrieff_2022_Antidepressant_Withdrawal_1_37.m4a"></audio>


## Personality  (5)
**Bateman 1999 - MBT**  ·  _2:02_
<audio controls preload="none" src="audio/21_LM_22_Bateman_1999_MBT_2_02.m4a"></audio>
<a href="https://doi.org/10.1176/ajp.156.10.1563" target="_blank" rel="noopener">Paper (DOI)</a>

**Gunderson 2018 - BPD Review**  ·  _1:46_
<audio controls preload="none" src="audio/33_LM_32_Gunderson_2018_BPD_Review_1_46.m4a"></audio>
<a href="https://doi.org/10.1038/nrdp.2018.29" target="_blank" rel="noopener">Paper (DOI)</a>

**Kernberg 1984 - Personality Org**  ·  _1:56_
<audio controls preload="none" src="audio/39_LM_39_Kernberg_1984_Personality_Org_1_56.m4a"></audio>

**Linehan 1991 - DBT**  ·  _1:54_
<audio controls preload="none" src="audio/24_LM_21_Linehan_1991_DBT_1_54.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1991.01810360024003" target="_blank" rel="noopener">Paper (DOI)</a>

**Zanarini 2005 - BPD Remission**  ·  _1:48_
<audio controls preload="none" src="audio/32_LM_31_Zanarini_2005_BPD_Remission_1_48.m4a"></audio>
<a href="https://doi.org/10.1521/pedi.2005.19.5.505" target="_blank" rel="noopener">Paper (DOI)</a>


## Family & Systems  (9)
**Brown 1962 - Expressed Emotion**  ·  _2:02_
<audio controls preload="none" src="audio/11_LM_11_Brown_1962_Expressed_Emotion_2_02.m4a"></audio>
<a href="https://doi.org/10.1136/jech.16.2.55" target="_blank" rel="noopener">Paper (DOI)</a>

**Diamond 2010 - ABFT**  ·  _1:53_
<audio controls preload="none" src="audio/19_LM_16_Diamond_2010_ABFT_1_53.m4a"></audio>
<a href="https://doi.org/10.1016/j.jaac.2009.11.002" target="_blank" rel="noopener">Paper (DOI)</a>

**Falloon 1982 - Family Management**  ·  _1:57_
<audio controls preload="none" src="audio/14_LM_13_Falloon_1982_Family_Management_1_57.m4a"></audio>
<a href="https://doi.org/10.1056/nejm198206173062401" target="_blank" rel="noopener">Paper (DOI)</a>

**Leff 1982 - Family Intervention**  ·  _1:35_
<audio controls preload="none" src="audio/12_LM_12_Leff_1982_Family_Intervention_1_35.m4a"></audio>
<a href="https://doi.org/10.1192/bjp.141.2.121" target="_blank" rel="noopener">Paper (DOI)</a>

**Leff 2000 - Couple Therapy Depression**  ·  _1:45_
<audio controls preload="none" src="audio/16_LM_19_Leff_2000_Couple_Therapy_Depression_1_45.m4a"></audio>
<a href="https://doi.org/10.1192/bjp.177.2.95" target="_blank" rel="noopener">Paper (DOI)</a>

**McFarlane 1995 - Multifamily**  ·  _1:52_
<audio controls preload="none" src="audio/13_LM_14_McFarlane_1995_Multifamily_1_52.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1995.03950200069016" target="_blank" rel="noopener">Paper (DOI)</a>

**Minuchin 1978 - Psychosomatic Families**  ·  _1:50_
<audio controls preload="none" src="audio/18_LM_18_Minuchin_1978_Psychosomatic_Families_1_50.m4a"></audio>
<a href="https://doi.org/10.4159/harvard.9780674418233" target="_blank" rel="noopener">Paper (DOI)</a>

**Pharoah 2010 - Cochrane Family**  ·  _1:35_
<audio controls preload="none" src="audio/20_LM_20_Pharoah_2010_Cochrane_Family_1_35.m4a"></audio>
<a href="https://doi.org/10.1002/14651858.cd000088.pub3" target="_blank" rel="noopener">Paper (DOI)</a>

**Pinsof 1995 - Systemic Meta**  ·  _2:00_
<audio controls preload="none" src="audio/17_LM_17_Pinsof_1995_Systemic_Meta_2_00.m4a"></audio>
<a href="https://doi.org/10.1111/j.1752-0606.1995.tb00179.x" target="_blank" rel="noopener">Paper (DOI)</a>


## Substance Use  (2)
**Project MATCH 1997**  ·  _1:53_
<audio controls preload="none" src="audio/42_LM_45_Project_MATCH_1997_1_53.m4a"></audio>
<a href="https://pubmed.ncbi.nlm.nih.gov/8979210/" target="_blank" rel="noopener">Paper (PubMed)</a>

**Volkow 2016 - Addiction**  ·  _1:53_
<audio controls preload="none" src="audio/47_LM_46_Volkow_2016_Addiction_1_53.m4a"></audio>
<a href="https://doi.org/10.1056/nejmra1511480" target="_blank" rel="noopener">Paper (DOI)</a>


## Child  (3)
**Bridge 2007 - Pediatric SSRI**  ·  _1:41_
<audio controls preload="none" src="audio/45_LM_48_Bridge_2007_Pediatric_SSRI_1_41.m4a"></audio>
<a href="https://doi.org/10.1001/jama.297.15.1683" target="_blank" rel="noopener">Paper (DOI)</a>

**MTA 1999 - ADHD**  ·  _1:45_
<audio controls preload="none" src="audio/46_LM_47_MTA_1999_ADHD_1_45.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.56.12.1073" target="_blank" rel="noopener">Paper (DOI)</a>

**TADS 2004 - Adolescent Depression**  ·  _1:44_
<audio controls preload="none" src="audio/30_LM_30_TADS_2004_Adolescent_Depression_1_44.m4a"></audio>
<a href="https://doi.org/10.1001/jama.292.7.807" target="_blank" rel="noopener">Paper (DOI)</a>


## Neuroscience  (3)
**Border 2019 - Non-Replication**  ·  _1:36_
<audio controls preload="none" src="audio/37_LM_37_Border_2019_Non_Replication_1_36.m4a"></audio>
<a href="https://doi.org/10.1176/appi.ajp.2018.18070881" target="_blank" rel="noopener">Paper (DOI)</a>

**Caspi 2003 - 5-HTTLPR**  ·  _1:47_
<audio controls preload="none" src="audio/51_LM_36_Caspi_2003_5_HTTLPR_1_47.m4a"></audio>
<a href="https://doi.org/10.1126/science.1083968" target="_blank" rel="noopener">Paper (DOI)</a>

**Sekar 2016 - C4 Schizophrenia**  ·  _1:50_
<audio controls preload="none" src="audio/36_LM_38_Sekar_2016_C4_Schizophrenia_1_50.m4a"></audio>
<a href="https://doi.org/10.1038/nature16549" target="_blank" rel="noopener">Paper (DOI)</a>


## Trauma  (1)
**Felitti 1998 - ACE Study**  ·  _1:52_
<audio controls preload="none" src="audio/41_LM_44_Felitti_1998_ACE_Study_1_52.m4a"></audio>
<a href="https://doi.org/10.1016/s0749-3797(98)00017-8" target="_blank" rel="noopener">Paper (DOI)</a>


## Systems  (1)
**Stein-Test 1980 - ACT**  ·  _1:54_
<audio controls preload="none" src="audio/43_LM_43_Stein_Test_1980_ACT_1_54.m4a"></audio>
<a href="https://doi.org/10.1001/archpsyc.1980.01780170034003" target="_blank" rel="noopener">Paper (DOI)</a>


## Skills  (4)
**Gutheil-Gabbard 1993 - Boundaries**  ·  _1:46_
<audio controls preload="none" src="audio/38_LM_40_Gabbard_1995_Boundaries_1_46.m4a"></audio>
<a href="https://doi.org/10.1176/ajp.150.2.188" target="_blank" rel="noopener">Paper (DOI)</a>

**Norcross 2011 - Alliance**  ·  _1:44_
<audio controls preload="none" src="audio/25_LM_25_Norcross_2011_Alliance_1_44.m4a"></audio>
<a href="https://doi.org/10.1037/a0022180" target="_blank" rel="noopener">Paper (DOI)</a>

**Shedler 2010 - Psychodynamic**  ·  _1:43_
<audio controls preload="none" src="audio/23_LM_24_Shedler_2010_Psychodynamic_1_43.m4a"></audio>
<a href="https://doi.org/10.1037/a0018378" target="_blank" rel="noopener">Paper (DOI)</a>

**Wampold 2001 - Common Factors**  ·  _1:42_
<audio controls preload="none" src="audio/22_LM_23_Wampold_2001_Common_Factors_1_42.m4a"></audio>


## Anxiety  (1)
**Foa 2005 - Prolonged Exposure**  ·  _1:42_
<audio controls preload="none" src="audio/29_LM_29_Foa_2005_Prolonged_Exposure_1_42.m4a"></audio>
<a href="https://doi.org/10.1037/0022-006X.73.5.953" target="_blank" rel="noopener">Paper (DOI)</a>


## Geriatric  (1)
**Inouye 1999 - Delirium**  ·  _1:59_
<audio controls preload="none" src="audio/48_LM_49_Inouye_1999_Delirium_1_59.m4a"></audio>
<a href="https://doi.org/10.1056/NEJM199903043400901" target="_blank" rel="noopener">Paper (DOI)</a>


*Joshua Moss, MD | Psychiatrist · Audio overviews via NotebookLM; reviewed and attested by Joshua Moss, MD (2026-07-09); no PHI.*


---

## Anki Flashcard Decks

- **Slug:** `anki.md` · **Type:** md · **Sidebar:** listed
- **Source:** `09_Exam_Prep/anki_export/anki.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 310 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 2 min

**TL;DR (shown above the page text):**

> Download the clerkship's attested question bank and high-yield concepts as Anki spaced-repetition decks; suspend all cards, then unsuspend by topic as the rotation covers each block.

**Key points (bulleted card):**

- Two decks, both built only from attested content: the Question Bank (vignette cards) and Concepts (topic one-liners + high-yield pearls, with author-bolded facts as cloze deletions).
- Import the combined .apkg for one file with both subdecks; every card is tagged by topic, source page, high-yield, and attestation status for the suspend/unsuspend workflow.
- Decks regenerate automatically on each site rebuild, so they stay in sync with the library.

**Cross-references and tagging:**

- **Related tools:** `question-bank-practice.html`, `shelf-mode.html`, `review.html`
- **Workflow stages:** `exam`
- **Workflow modes:** `shelf`, `5min`

#### Page text (as shipped)

# Anki Flashcard Decks


**In one line** — Download the clerkship library as [Anki](https://apps.ankiweb.net/) spaced-repetition decks and review the high-yield material the same way you review everything else on your phone.

**What you get** — Two decks, both built straight from this site's attested material:

- **Question Bank** — every attested board-style item as a vignette card (best answer, the trap in each distractor, the teaching point, and a link back to the source page). Two-tier items include a second card for the mechanism.
- **Concepts** — the "in one line" summary for each topic plus every high-yield pearl. Where a pearl has a **bolded** fact, that fact is the cloze deletion.

## Download

<p>
<a href="anki/psychiatry_clerkship_library_ALL.apkg" download><strong>⬇ Complete deck (recommended)</strong></a> — one file, two subdecks (Question Bank + Concepts).
</p>
<p>
<a href="anki/psychiatry_clerkship_library.apkg" download>⬇ Question Bank only</a> ·
<a href="anki/psychiatry_clerkship_concepts.apkg" download>⬇ Concepts only</a> ·
<a href="anki/psychiatry_clerkship_library.csv" download>⬇ Question Bank as CSV</a>
</p>

## How to use it

1. Install Anki (desktop is free; **AnkiMobile** on iOS / **AnkiDroid** on Android is free on Android).
2. Open the downloaded `.apkg` — it imports as **Psychiatry Clerkship Library (Moss)** with the two subdecks.
3. **Suspend everything, then unsuspend by topic** as the rotation covers each block. Every card is tagged `Psychiatry::<topic>`, `Source::<page>`, `HighYield`, and `Status::attested`, so you can browse to exactly the block you want.
4. Cap new cards around 20–30/day and review daily — the schedule does the rest.

**Pair with** — the [Practice Questions tool](?tool=question-bank-practice.html) for timed, exam-style practice of the same items, and the [COMAT & Shelf Review](?page=shelf.md) guide for the blueprint.

**Attested content only** — a topic page contributes cards only once it carries a review sign-off, so the decks grow as more of the library is attested. Decks refresh automatically when the site rebuilds.

*Joshua Moss, MD | Psychiatrist · Educational; fictional composites only, no PHI.*


---

# SECTION: Case of the Week

---

## Index — All Cases

- **Slug:** `cotw_index.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/index_ms3.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 417 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 2 min · safetyLevel=`moderate`

**TL;DR (shown above the page text):**

> The rotating weekly teaching case - one de-identified synthetic vignette a week, with guided discussion questions, a ranked differential, and a workup-and-management ladder.

**Key points (bulleted card):**

- A new case is added each week; the current one sits at the top of the Case of the Week sidebar.
- ~20-30 minute small-group discussion - no pre-reading required.
- Every case ships in matched MS3 and resident versions.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Pick the week you want from the sidebar and work its stem cold - your own history, your own differential, your own next step - before reading any teaching point.
- **mse** — Each case asks you to say what its exam findings rule in and rule out; that discrimination between look-alike syndromes is the recurring skill across the series.
- **safety** — Safety content across every case is oriented to recognition, escalation, and safety planning, never to method detail. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Every case includes at least one moment to rehearse out loud what you would actually say to the patient or family.
- **collateral** — A recurring question in the series: what collateral would change this differential, and who would you have to call to get it?
- **rounds** — Cases are built for a ~20-30 minute small-group discussion; the facilitator notes in each one are written for whoever is running the session.
- **exam** — Matched MS3 and resident versions of every case: MS3 at Step 2 CK level, resident level assuming DSM-5-TR fluency and going deeper on mechanism, guidelines, and evidence quality.
- **actions** — Medication monitoring reference

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Faculty review:** {"status": "reviewed", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-11"}

#### Page text (as shipped)

# Case of the Week — MS3


**What this is.** A rotating weekly psychiatry teaching case, written at the MS3 / USMLE Step 2 CK level. Each case is a short, de-identified synthetic vignette with guided discussion questions (each paired with a teaching point), a ranked differential, a workup-and-management ladder, and anchoring citations. They're built for a ~20–30 minute small-group discussion — no pre-reading required — but also read well as solo review.

**How to use it.** Pick the current week from the sidebar under **Case of the Week**. Work the stem first, commit to an answer for each discussion question before reading its teaching point, then check your differential and management against the model. Safety content is oriented to recognition, escalation, and safety planning.

**This term's line-up (most recent first):**

- **Catatonia — Recognition, Workup & Treatment** (Aug 31) — the patient who stops moving: spotting the signs at the bedside, the BFCRS screen, the lorazepam challenge, and recognizing when it becomes an emergency.
- **Borderline Personality Disorder — Presentation & Management** (Aug 27) — reading the pattern, not the moment: BPD vs. bipolar, chronic vs. acute-on-chronic risk, psychotherapy as the definitive treatment, and naming the diagnosis without flinching.
- **Panic Disorder — Recognition, Differential & First-Line Treatment** (Aug 10) — panic attack vs. panic disorder, the must-not-miss mimics, why repeating a negative workup backfires, and SSRI + CBT.
- **Lithium — Monitoring, Toxicity & Interactions** (Aug 3) — why the level rises when the dose doesn't, level-vs-exam dissociation, and the dialysis criteria.
- **Opioid Use Disorder — Intoxication, Withdrawal & MOUD** (Jul 27) — the two toxidromes, naloxone, COWS, and starting medication treatment in the building.
- **Alcohol Withdrawal & Delirium Tremens** (Jul 26) — the withdrawal timeline, predicting severe withdrawal, and first-line management.
- **Suicide Risk Assessment & Safety Planning** (Jul 23) — structured assessment, the limits of risk scores, and collaborative safety planning.
- **MDD — Treatment Selection & Augmentation** (Jul 20) — switch vs. augment vs. optimize when an antidepressant isn't working.
- **Bipolar Mania — Recognition & Acute Management** (Jul 20) — spotting a manic episode and choosing first-line acute treatment.
- **Acute Agitation & Delirium in the ED** (Jul 13) — treat the driver, de-escalate before PRN, PRN before restraint.
- **Serotonin Syndrome vs. NMS** (Jul 9) — telling the two hyperthermic toxidromes apart and managing each.

New cases are added weekly. A matching resident-level version of each case lives on the MMC resident site.

*Joshua Moss, MD | Psychiatrist*


---

## Catatonia (Aug 31)

- **Slug:** `cotw_20260831_catatonia_ms3.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-31_catatonia-recognition-workup-treatment_MS3.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 1,637 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`ms3` (2026-08-31)

**TL;DR (shown above the page text):**

> A mute, motionless patient is an emergency until proven otherwise - screen with the BFCRS, test-and-treat with the lorazepam challenge, hold the antipsychotics, and know the malignant-catatonia triggers that mean early ECT.

**Key points (bulleted card):**

- ~20-30 minute small-group discussion - no pre-reading required.
- De-identified synthetic case; each discussion question is paired with a teaching point.
- MS3 / Step 2 CK level. Facilitator notes are kept separate from the learner-facing stem.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Work the stem cold: take your own history, commit to a differential, and name your next step before reading a single teaching point. The guided questions are written to be answered, not skimmed.
- **mse** — Say out loud what each exam finding in the vignette rules in and rules out — the discrimination between look-alike syndromes is what the case is drilling.
- **safety** — Safety content in every case is oriented to recognition, escalation, and safety planning. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Before moving on, rehearse one sentence you would actually say to this patient or family, in plain language and out loud.
- **collateral** — Ask yourself what collateral would change your differential here, and who you would have to call to get it.
- **rounds** — Use the ranked differential and the workup-and-management ladder as the spine of your presentation; lead with the finding that changes management.
- **exam** — Shelf-level takeaway: A mute, motionless patient is an emergency until proven otherwise - screen with the BFCRS, test-and-treat with the lorazepam challenge, hold the antipsychotics, and know the malignant-catatonia triggers that mean early ECT.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `neurocog`, `safety`, `pharm`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA3`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-31"}

#### Page text (as shipped)

# Case of the Week — August 31, 2026 (MS3 Version)

## Catatonia: Recognition, Workup, and Treatment

**Learner level:** MS3, psychiatry clerkship (USMLE Step 2 CK framing)
**Format:** Facilitator-led discussion, ~20–30 minutes. No pre-reading required.
**Note:** This is a fully synthetic, de-identified teaching case. It describes no real patient; any resemblance to a real person is coincidental.

---

## Learner-facing case stem

A 22-year-old college student with a history of major depressive disorder is brought to the emergency department by her roommates, who report that "she stopped talking two days ago." Over the past two weeks she has withdrawn from classes, eaten very little, and spent hours sitting motionless in the same position. She has no known medical problems and currently takes no medications; she stopped a previously prescribed antidepressant several months ago. Her roommates are not aware of any substance use.

On examination she is awake with eyes open but does not answer questions or follow commands (**mutism** — absence or near-absence of speech). She turns away when approached and resists gentle attempts to redirect her (**negativism** — apparently motiveless resistance to instructions or examination). When the examiner lifts her arm, it remains suspended in the air for more than a minute (**posturing/catalepsy** — maintaining a position against gravity), and when the examiner repositions the limb it yields with slight, even resistance, "like bending a warm candle" (**waxy flexibility**). She intermittently repeats the examiner's last words (**echolalia**).

Vital signs: T 37.0 °C, HR 88, BP 118/74, RR 14, SpO₂ 99% on room air. Mucous membranes are dry. There is no fever, no diffuse rigidity, no tremor, and no clonus. Basic bedside glucose is normal.

---

## Guided discussion questions

**Q1. What syndrome best explains this presentation, and which specific signs support it?**

*Teaching point:* This is **catatonia**, a neuropsychiatric syndrome of disturbed motor, speech, and volitional behavior that occurs in mood disorders, psychotic disorders, and many medical illnesses [1]. DSM-5-TR requires **≥3 of 12 characteristic signs**: stupor, catalepsy, waxy flexibility, mutism, negativism, posturing, mannerisms, stereotypies, agitation, grimacing, echolalia, echopraxia. This patient shows at least five (mutism, negativism, catalepsy/posturing, waxy flexibility, echolalia). Catatonia is not rare — in the original validation study of a standardized rating scale, about 7% of consecutive psychiatric admissions met criteria [3] — and it is frequently missed when no one examines for it.

**Q2. What bedside tool standardizes recognition, and what is the actual bedside exam?**

*Teaching point:* The **Bush-Francis Catatonia Rating Scale (BFCRS)** — a 23-item severity scale with a 14-item screening instrument (screen positive at ≥2 signs) and a standardized examination, with excellent inter-rater reliability [3]. Key exam moves: observe spontaneous behavior; attempt conversation; passively move a limb to test for waxy flexibility and catalepsy; test for echopraxia (does the patient copy your movements?); give a simple command and note negativism; check grasp reflex; review nursing notes for oral intake, verbigeration (repetitive phrases), and posturing overnight.

**Q3. Build a ranked differential. What features here argue for and against each item?**

*Teaching point:* See the ranked differential below. The two "cannot-miss" branch points for a student: (a) **is there a medical cause** (catatonia is a syndrome, not a diagnosis), and (b) **is this neuroleptic malignant syndrome (NMS)** — which this patient cannot have without dopamine-blocking drug exposure. Recent antipsychotic exposure, fever, rigidity, and marked autonomic instability should always be actively sought and documented.

**Q4. What initial workup do you order, and why?**

*Teaching point:* Workup targets the cause and the complications: CBC, CMP (dehydration, renal function), glucose, **creatine kinase (CK)** (rhabdomyolysis from immobility or rigidity; a screen for NMS/malignant features), TSH, urine drug screen, pregnancy test, and an ECG (baseline before medications). Brain imaging and EEG are indicated when the presentation suggests a neurological or medical cause (new focal signs, seizure suspicion, delirium-like fluctuation) — and testing for **neuronal autoantibodies** (e.g., anti-NMDA-receptor encephalitis) in serum and cerebrospinal fluid when suspicion of autoimmune encephalitis exists [2]. Always review the medication list for recent antipsychotic starts or abrupt benzodiazepine discontinuation.

**Q5. What is the lorazepam challenge, and what does a positive result mean?**

*Teaching point:* A test dose of **lorazepam** (commonly 1–2 mg IV, IM, or PO), with re-examination over the following minutes to a few hours. Marked improvement — the patient begins speaking or moving — both **supports the diagnosis** and **predicts treatment response**. Benzodiazepines (lorazepam is the agent of choice) and/or **electroconvulsive therapy (ECT)** are first-line treatment for catatonia regardless of the underlying cause [1,2]. A negative challenge does not exclude catatonia.

**Q6. The patient improves partially after lorazepam. Outline ongoing management and the complications you must prevent.**

*Teaching point:* Continue **scheduled lorazepam** with dose escalation as tolerated — effective doses are often much higher than typical anxiolytic dosing, and guidelines note lorazepam is "sometimes used in very high doses" in this context [2]; sedation is monitored but tolerance to sedation is common in catatonia. Proceed to **ECT** if response is inadequate. Treat the underlying illness (here, a major depressive episode) once catatonia is lysing — and **avoid starting antipsychotics, especially high-potency dopamine blockers, while the patient is catatonic**, as they can worsen catatonia or precipitate NMS. Supportive care is life-saving: hydration and nutrition (swallow assessment; nasogastric feeding if needed), venous thromboembolism (VTE) prophylaxis, aspiration precautions, skin/pressure-injury care, and early mobilization.

**Q7. What findings would convert this into an emergency, and what is your escalation plan?**

*Teaching point:* **Malignant catatonia** — catatonia plus fever, autonomic instability (labile blood pressure, tachycardia), rigidity, or rising CK — is life-threatening and can be fatal without prompt treatment [1]. Recognition and escalation are the student's job: notify the senior resident and attending immediately, involve medicine/ICU for autonomic monitoring and stabilization, stop any dopamine-blocking agents, and pursue urgent ECT consultation. Separately, as this patient's catatonia lyses, remember that she has a severe depressive episode: complete a structured suicide risk assessment, ensure appropriate observation, and build a safety plan with her before any transition of care. Escalate to your supervisor immediately if she voices thoughts of self-harm.

---

## Ranked differential diagnosis (most to least likely)

1. **Catatonia associated with major depressive disorder** — known depression, subacute withdrawal, then classic catatonic signs; most common context for catatonia is a mood disorder [1].
2. **Catatonia due to another medical condition** — including autoimmune (anti-NMDA-receptor) encephalitis; argues for: young woman, subacute course; argues against: no prodrome, seizures, dysautonomia, or focal signs yet. This must be actively excluded, not assumed away [2].
3. **Hypoactive delirium** — can look similar (withdrawn, minimally responsive) and can co-occur with catatonia; look for fluctuating attention and an underlying medical driver.
4. **Neuroleptic malignant syndrome** — effectively excluded without recent dopamine-blocking drug exposure; would feature rigidity, fever, autonomic instability, elevated CK.
5. **Severe drug-induced parkinsonism / extrapyramidal side effects** — no offending medication here; would show rigidity and bradykinesia rather than negativism, waxy flexibility, and echophenomena.

---

## Workup & management summary

**Immediate:** full vital signs and repeat monitoring; bedside glucose; BFCRS screen and standardized exam [3]; collateral history (medications — especially antipsychotics and recently stopped benzodiazepines — substances, medical symptoms, timeline).

**Laboratory:** CBC, CMP, glucose, CK, TSH, urine drug screen, pregnancy test, ECG. Escalate to brain imaging, EEG, and serum/CSF neuronal autoantibody testing when a medical or autoimmune cause is suspected [2].

**Diagnostic-therapeutic:** lorazepam challenge (1–2 mg), re-examine; if positive, scheduled lorazepam with structured uptitration and daily BFCRS scoring [1,2].

**Definitive:** ECT for benzodiazepine-refractory catatonia, malignant catatonia, or need for rapid response [1,2]. Treat the underlying psychiatric illness as catatonia resolves; hold antipsychotics while catatonic.

**Supportive (prevents most of the mortality):** hydration, nutrition with swallow evaluation, VTE prophylaxis, aspiration and pressure-injury precautions, early mobilization, monitoring for malignant conversion (temperature, autonomic signs, CK).

---
---

## Facilitator notes — keep separate; not for learner distribution

**Flow (20–30 min):** 5 min stem read-aloud + spontaneous impressions → 15–20 min through Q1–Q7 (Q1, Q3, Q5, Q6 are the core; Q2, Q4, Q7 can compress) → 5 min wrap-up with the three take-homes below.

**Three take-homes to land:** (1) Catatonia is common, missed, and *examinable* — screen with the BFCRS when any patient is mute, withdrawn, or "not participating." (2) Lorazepam challenge is both a test and the start of treatment; lorazepam and/or ECT are first-line regardless of cause. (3) Fever + rigidity + autonomic instability = malignant catatonia = emergency; and never start high-potency antipsychotics in an actively catatonic patient.

**Common learner errors to anticipate:** calling this "just severe depression" or "conversion disorder/malingering" (respond: the exam findings — waxy flexibility, echolalia — are objective and reproducible); jumping to antipsychotics because "she's psychotic until proven otherwise" (use this to teach the NMS-risk teaching point in Q6); ordering a head CT reflexively while skipping the CK and medication history.

**Bedside extension if time allows:** have learners pair up and physically practice the BFCRS exam sequence (observation → speech → passive movement → echopraxia test → command/negativism) on each other.

**Step 2 CK pearls:** the answer to "next best step" in a catatonic patient is almost always *lorazepam challenge*; the answer in benzodiazepine-refractory or malignant catatonia is *ECT*; anti-NMDA-receptor encephalitis is the classic "young woman with psychiatric symptoms + autonomic instability/seizures" distractor and is screened with serum/CSF autoantibodies.

**Safety framing:** keep all suicide-risk discussion at the level of recognition, structured assessment, observation level, and escalation to supervisors — method-level details are out of scope for this session.

---

## References

Based on articles retrieved from PubMed (National Library of Medicine). Citation fields below (journal, year, volume/pages, DOI) were verified against PubMed records on 2026-08-31.

1. Heckers S, Walther S. Catatonia. *N Engl J Med*. 2023;389(19):1797-1802. [DOI: 10.1056/NEJMra2116304](https://doi.org/10.1056/NEJMra2116304)
2. Rogers JP, Zandi MS, David AS. The diagnosis and treatment of catatonia. *Clin Med (Lond)*. 2023;23(3):242-245. [DOI: 10.7861/clinmed.2023-0113](https://doi.org/10.7861/clinmed.2023-0113)
3. Bush G, Fink M, Petrides G, Dowling F, Francis A. Catatonia. I. Rating scale and standardized examination. *Acta Psychiatr Scand*. 1996;93(2):129-136. [DOI: 10.1111/j.1600-0447.1996.tb09814.x](https://doi.org/10.1111/j.1600-0447.1996.tb09814.x)


---

## Borderline Personality Disorder (Aug 27)

- **Slug:** `cotw_20260827_bpd_ms3.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-27_borderline-personality-disorder_MS3.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 1,919 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`ms3` (2026-08-27)

**TL;DR (shown above the page text):**

> A third admission, a five-drug regimen, and a 'treatment-resistant bipolar' label that was never right - BPD is diagnosed from the longitudinal pattern, treated definitively with psychotherapy, and managed on a chronic vs. acute-on-chronic risk frame.

**Key points (bulleted card):**

- ~20-30 minute small-group discussion - no pre-reading required.
- De-identified synthetic case; each discussion question is paired with a teaching point.
- MS3 / Step 2 CK level. Facilitator notes are kept separate from the learner-facing stem.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Work the stem cold: take your own history, commit to a differential, and name your next step before reading a single teaching point. The guided questions are written to be answered, not skimmed.
- **mse** — Say out loud what each exam finding in the vignette rules in and rules out — the discrimination between look-alike syndromes is what the case is drilling.
- **safety** — Safety content in every case is oriented to recognition, escalation, and safety planning. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Before moving on, rehearse one sentence you would actually say to this patient or family, in plain language and out loud.
- **collateral** — Ask yourself what collateral would change your differential here, and who you would have to call to get it.
- **rounds** — Use the ranked differential and the workup-and-management ladder as the spine of your presentation; lead with the finding that changes management.
- **exam** — Shelf-level takeaway: A third admission, a five-drug regimen, and a 'treatment-resistant bipolar' label that was never right - BPD is diagnosed from the longitudinal pattern, treated definitively with psychotherapy, and managed on a chronic vs. acute-on-chronic risk frame.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `communication`, `team`, `exam`
- **Shelf blueprint tags:** `personality`, `safety`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-27"}

#### Page text (as shipped)

# Case of the Week — August 27, 2026 (MS3 Edition)

## Borderline Personality Disorder: Presentation & Management

> **De-identified synthetic teaching case.** This case is a fictional composite created for teaching. It contains no real patient details. Citations below are based on articles retrieved from PubMed; DOI links are provided in the reference list.
>
> **Learner level:** MS3 (psychiatry clerkship) · **Format:** ~20–30 minute guided discussion · **Framing:** USMLE Step 2 CK–relevant

---

# PART 1 — LEARNER-FACING CASE

## Case Stem

Ms. J is a 22-year-old college student brought to the emergency department by her roommate after the roommate found superficial self-inflicted injuries on Ms. J's forearm. This occurred about an hour after Ms. J's partner of three months ended their relationship by text. Ms. J tells you, "I don't even know who I am without her. Everyone always leaves me."

On interview, she describes intense mood shifts that last "a few hours, maybe a day" — she can go from "fine" to "devastated or furious" in response to arguments, perceived slights, or unanswered messages. She describes chronic feelings of emptiness, a long pattern of relationships that begin as "perfect" and collapse within months, and impulsive behaviors when upset (binge spending, episodic heavy drinking, texting "hundreds of times" when she fears someone is pulling away). She has had passing thoughts that "everyone would be better off without me" during past crises, and tonight had similar thoughts, which she says faded after her roommate arrived. She denies a current wish to die, denies any plan or preparation, and is asking for help "feeling less out of control."

She was told at age 19 that she "might be bipolar" after a similar crisis, and briefly took quetiapine, which she stopped because of sedation. She has never had a period of days of persistently elevated mood, decreased need for sleep, or increased goal-directed activity. She drinks 4–6 drinks on weekend nights, denies other substance use, and takes no current medications. Vital signs are normal; the forearm injuries require only simple dressing. She is alert, cooperative, tearful then briefly irritable when discharge logistics are raised, with linear thought process and no psychotic symptoms.

## Discussion Questions (learner version)

1. Ms. J's mood is clearly unstable. What features of her history point toward borderline personality disorder (BPD) rather than bipolar disorder?
2. What is BPD, and how is the diagnosis actually made? Should you share the diagnosis with her tonight?
3. What is your ranked differential diagnosis, and which co-occurring conditions should you actively screen for?
4. How do you assess her suicide risk tonight, and what is the difference between her *chronic* risk and her *acute-on-chronic* risk?
5. What is the first-line treatment for BPD, and what role — if any — do medications play?
6. What is an appropriate disposition from the ED tonight, and how would you communicate the plan to Ms. J in a way that is validating rather than dismissive?

---

# PART 2 — FACILITATOR GUIDE (not for learner distribution)

## Discussion Questions with Teaching Points

**Q1. Why BPD rather than bipolar disorder?**
*Teaching point:* The key discriminator is the **time course and trigger pattern of mood shifts**. BPD mood instability (*affective instability* — rapid, reactive mood shifts) lasts hours to a day or two and is almost always **interpersonally triggered** (rejection, perceived abandonment). Bipolar mood episodes are **sustained** (≥4–7 days for hypomania/mania, weeks for depression), often arise without a clear trigger, and include changes in sleep need, energy, and goal-directed activity. Ms. J has never had a sustained elevated-mood episode. A "bipolar" label given during a crisis, without sustained episodes, should prompt re-examination — misdiagnosis is common and leads to ineffective medication trials [1,2].

**Q2. What is BPD and how is it diagnosed?**
*Teaching point:* BPD affects roughly 0.7–2.7% of adults and is characterized by instability in **identity, relationships, and affect**, plus impulsivity, intense anger, chronic emptiness, frantic efforts to avoid abandonment, recurrent suicidal or self-injurious behavior, and transient stress-related paranoid ideation or dissociation (feeling unreal or detached) [1]. Diagnosis is **clinical**, made by structured or semistructured interview showing a pervasive, persistent pattern (DSM-5-TR: ≥5 of 9 criteria) beginning by early adulthood — not by any lab or imaging test. Onset is typically in adolescence, and earlier recognition allows earlier effective treatment [2]. **Yes — share the working diagnosis.** Naming BPD (with psychoeducation: explaining the illness model in plain language) is respectful, reduces confusion from serial mislabels, and is the gateway to effective therapy. Frame it as a treatable disorder with a hopeful trajectory.

**Q3. Ranked differential and comorbidity screening.**
*Teaching point:* Comorbidity is the rule in BPD — mood disorders ~83%, anxiety disorders ~85%, substance use disorders ~78% among people with BPD [1] — so the question is usually "BPD *and* what else," not "BPD *or*." Screen actively for depression, PTSD/trauma history, alcohol and other substance use, and eating pathology. (Full ranked differential below.)

**Q4. Suicide risk assessment: chronic vs. acute-on-chronic.**
*Teaching point:* People with BPD often carry **chronically elevated** risk (recurrent suicidal thoughts and self-injury over years). What demands escalation is an **acute-on-chronic spike**: new or intensifying wish to die, a plan or preparatory behavior, command hallucinations, intoxication, a major loss, or a recent serious attempt. Tonight: ask directly about current suicidal ideation, intent, plan, access to lethal means; gather collateral from the roommate; and complete **safety planning** — a structured, collaborative list of warning signs, internal coping strategies, social contacts, professional contacts, and steps to make the environment safer (lethal-means counseling), plus crisis contacts. Self-injury without suicidal intent (common in BPD, often serving emotion-regulation) must still be taken seriously but is distinct from a suicide attempt; document the distinction. When risk is acute, escalate: one-to-one observation, psychiatric consultation, and consideration of admission [1,2].

**Q5. First-line treatment.**
*Teaching point:* **Psychotherapy is the treatment of choice** — the Step 2 CK answer. Structured therapies such as **dialectical behavior therapy (DBT)** (a skills-based cognitive-behavioral therapy targeting emotion regulation, distress tolerance, and interpersonal effectiveness) and psychodynamic therapies (e.g., mentalization-based treatment) reduce BPD severity with medium effect sizes versus usual care [1,3]. **No medication reliably improves core BPD symptoms**, and none is FDA-approved for BPD [1]. Medications are reserved for (a) discrete comorbid disorders (e.g., SSRIs for major depression) and (b) short-term crisis management, where low-dose antipsychotics or sedative antihistamines are preferred and **benzodiazepines are avoided** (disinhibition, misuse risk) [1]. Avoid accumulating polypharmacy from serial crises.

**Q6. Disposition and communication.**
*Teaching point:* If acute risk is manageable (ideation without intent or plan, engaged with safety planning, sober, with social support and follow-up), brief ED stabilization and structured outpatient referral is often *better* care than reflexive admission — long nonspecific hospitalizations can be iatrogenic (regression, reinforcement of crisis-driven care), though brief admission is appropriate for acute-on-chronic escalation. Communicate with **validation + structure**: acknowledge that her distress is real and severe, name the diagnosis and its treatability, set the expectation that therapy is the definitive treatment, and give concrete next steps (referral, safety plan in hand, crisis line, return precautions). Expect and tolerate brief anger without withdrawing care — consistency is therapeutic. Prognosis is genuinely hopeful: most patients achieve symptomatic remission over years, though functional recovery lags and requires treatment [1,2].

## Ranked Differential Diagnosis

1. **Borderline personality disorder** — pervasive pattern of abandonment fear, unstable relationships and identity, reactive affect lasting hours, chronic emptiness, recurrent self-injury in interpersonal crises. Best fit.
2. **Bipolar II disorder** — argued against by absence of any sustained hypomanic episode; mood shifts here are hour-scale and interpersonally cued. The most common mislabel in this population [1,2].
3. **Major depressive disorder (current episode)** — screen for persistent ≥2-week neurovegetative syndrome; may coexist and would change medication calculus.
4. **PTSD / trauma-related disorder** — high overlap with BPD; screen for trauma history, intrusions, avoidance, hyperarousal.
5. **Alcohol use disorder** — weekend binge pattern warrants AUDIT-C and brief intervention; intoxication amplifies impulsivity and suicide risk.

## Workup & Management (ED-appropriate)

- **Workup:** History + collateral; focused exam and wound care; pregnancy test if applicable; blood alcohol level/urine toxicology when intoxication is possible; TSH and basic labs if mood workup is being initiated; no imaging or "BPD labs" — diagnosis is clinical [1].
- **Tonight:** Direct suicide risk assessment; collaborative safety plan with lethal-means counseling; brief psychoeducation naming BPD as treatable; avoid starting a benzodiazepine; if a crisis medication is truly needed, a one-time low-dose antipsychotic or sedative antihistamine is preferred [1].
- **Bridge:** Referral to structured psychotherapy (DBT or equivalent evidence-based program); treat comorbid depression/AUD on their own merits; discourage polypharmacy; schedule near-term follow-up and provide crisis contacts.

> <div class="crisis-block-hook" hidden></div>
>
> ### If someone is in crisis
>
> On the unit, a patient in immediate danger is an escalation to your supervising resident or attending and the charge nurse — not a phone call. These lines are what you put IN a patient's safety plan, what families use after discharge, and what you can use yourself.
>
> - **988 Suicide & Crisis Lifeline** — Call or text 988. Chat at chat.988lifeline.org. 24/7, free, confidential. Spanish available by call, text, and chat; a dedicated line serves Deaf/Hard-of-Hearing callers. Calls placed in Maine route to Maine crisis specialists.
> - **Crisis Text Line** — Text HOME to 741741. Text HOLA to 741741 for Spanish. 24/7, free. Text-only. Often the most acceptable option for adolescents and young adults who will not make a phone call.
> - **Maine Crisis Line** — 1-888-568-1112. Text and chat available via the Maine Crisis Line website. 24/7. Staffed by clinically trained crisis workers and the gateway to Maine's mobile crisis teams — the number that actually dispatches a face-to-face response.
> - **Veterans Crisis Line** — Dial 988 then press 1. Text 838255. 24/7. No VA enrollment required. Ask about service history — it changes which line is the right referral.
> - **Emergency services** — 911. 24/7. For imminent danger to life.
>
> *Contacts verified 2026-07-27 against official sources. Maintained in `crisis_resources.json`; do not edit these numbers inline.*

## Facilitator Notes

- **Timing (25 min):** Stem read-aloud 3 min → Q1–Q3 ~10 min (diagnosis/differential) → Q4 ~6 min (risk) → Q5–Q6 ~6 min (treatment/disposition).
- **Common learner pitfalls:** (1) equating any mood lability with bipolar disorder; (2) treating self-injury as automatically equal to a suicide attempt (or, conversely, dismissing it); (3) believing admission is always the safest choice; (4) "there's a pill for this" — reinforce psychotherapy-first; (5) hesitance to name the diagnosis to the patient.
- **Tone modeling:** Demonstrate validating language ("It makes sense that a breakup felt unbearable given how hard you fight to keep people close") paired with clear limits and a concrete plan. Learners imitate what they hear.
- **Safety framing:** Keep discussion of self-injury at the level of recognition, risk stratification, escalation, and safety planning — do not elaborate on methods.

---

## References

Based on articles retrieved from PubMed. Citation fields (journal, year, volume/issue/pages, PMID, DOI) verified via PubMed metadata.

1. Leichsenring F, Heim N, Leweke F, Spitzer C, Steinert C, Kernberg OF. Borderline Personality Disorder: A Review. *JAMA*. 2023;329(8):670-679. PMID: 36853245. [DOI: 10.1001/jama.2023.0589](https://doi.org/10.1001/jama.2023.0589)
2. Bohus M, Stoffers-Winterling J, Sharp C, Krause-Utz A, Schmahl C, Lieb K. Borderline personality disorder. *Lancet*. 2021;398(10310):1528-1540. PMID: 34688371. [DOI: 10.1016/S0140-6736(21)00476-1](https://doi.org/10.1016/S0140-6736(21)00476-1)
3. Storebø OJ, Stoffers-Winterling JM, Völlm BA, et al. Psychological therapies for people with borderline personality disorder. *Cochrane Database Syst Rev*. 2020;5(5):CD012955. PMID: 32368793. [DOI: 10.1002/14651858.CD012955.pub2](https://doi.org/10.1002/14651858.CD012955.pub2)

---

*Prepared for the Psychiatry Clerkship — Case of the Week series. Joshua Moss, MD | Psychiatrist*
