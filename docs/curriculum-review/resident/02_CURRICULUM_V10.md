# RESIDENT · Curriculum content — volume 10

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Practice and Exam Prep

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
- **Source:** `08_Cases_and_Simulation/case-of-the-week/index_resident.md`
- **Governance:** status=`reviewed` · riskKind=`general` · riskLevel=`low`
- **Length:** 422 words

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

# Case of the Week — Resident


**What this is.** A rotating weekly psychiatry teaching case at the resident level — assumes DSM-5-TR fluency and goes deeper on differential breadth, mechanism and pharmacology nuance, and guideline- and evidence-level reasoning. Each case is a de-identified synthetic vignette with guided discussion questions and teaching points, a reconsidered differential, a workup-and-management sequence, facilitator notes, and a fuller reference list. Built for a ~20–30 minute discussion — no pre-reading required.

**How to use it.** Pick the current week from the sidebar under **Case of the Week**. Reason through the stem and each question before reading the teaching point; use the facilitator notes if you're running the session. Safety content stays oriented to structured risk formulation, means-safety, and escalation.

**This term's line-up (most recent first):**

- **Catatonia — Recognition, Workup & Treatment** (Aug 31) — disentangling NMS from malignant catatonia, high-dose lorazepam strategy, early ECT triggers, the serum + CSF autoimmune workup, and the catatonia–delirium overlap.
- **Borderline Personality Disorder — Presentation & Management** (Aug 27) — the meta-analytic evidence in real numbers, deprescribing the inherited five-drug regimen, chronic vs. acute-on-chronic risk documentation, splitting and the milieu, and GPM when DBT is waitlisted.
- **Panic Disorder — Differential Precision & Pharmacologic Optimization** (Aug 10) — the pseudopheochromocytoma phenotype, benzodiazepine interdose rebound as an iatrogenic driver, and reconciling the Cochrane and BMJ network meta-analyses.
- **Lithium — Monitoring, Toxicity & Interactions** (Aug 3) — two-compartment kinetics and post-dialysis rebound, SILENT, nephrogenic DI vs. lithium nephropathy, and preconception counselling with effect sizes.
- **Opioid Use Disorder — Intoxication, Withdrawal & MOUD** (Jul 27) — buprenorphine-precipitated withdrawal in the fentanyl era, low-dose initiation, acute pain on MOUD, and reading X:BOT.
- **Alcohol Withdrawal & Delirium Tremens** (Jul 26) — GABA-A remodeling and kindling, benzodiazepine-resistant withdrawal, and the phenobarbital evidence.
- **Suicide Risk Assessment & Safety Planning** (Jul 23) — risk formulation over category, the evidence on stratification limits, safety planning, and acute pharmacology.
- **MDD — Treatment Selection, Sequencing & Augmentation** (Jul 20) — VAST-D, augmentation agent selection, pharmacogenomics, and esketamine sequencing.
- **Bipolar Mania — Recognition & Acute Management** (Jul 20) — mixed features, secondary mania, and maintenance planning.
- **Acute Agitation & Delirium in the ED** (Jul 13) — hyperactive vs. hypoactive delirium, workup, and pharmacologic strategy.
- **Serotonin Syndrome vs. NMS** (Jul 9) — mechanism, time course, and management of the two hyperthermic syndromes.

New cases are added weekly. A matching MS3-level version of each case lives on the UNE MS3 site.

*Joshua Moss, MD | Psychiatrist*


---

## Catatonia (Aug 31)

- **Slug:** `cotw_20260831_catatonia_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-31_catatonia-recognition-workup-treatment_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 2,182 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-08-31)

**TL;DR (shown above the page text):**

> A mute, motionless patient is an emergency until proven otherwise - screen with the BFCRS, test-and-treat with the lorazepam challenge, hold the antipsychotics, and know the malignant-catatonia triggers that mean early ECT.

**Key points (bulleted card):**

- ~20-30 minute small-group discussion - no pre-reading required.
- De-identified synthetic case; each discussion question is paired with a teaching point.
- Resident level. Facilitator notes are kept separate from the learner-facing stem.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Work the stem cold: take your own history, commit to a differential, and name your next step before reading a single teaching point. The guided questions are written to be answered, not skimmed.
- **mse** — Say out loud what each exam finding in the vignette rules in and rules out — the discrimination between look-alike syndromes is what the case is drilling.
- **safety** — Safety content in every case is oriented to recognition, escalation, and safety planning. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Before moving on, rehearse one sentence you would actually say to this patient or family, in plain language and out loud.
- **collateral** — Ask yourself what collateral would change your differential here, and who you would have to call to get it.
- **rounds** — If you are running the session, the facilitator notes flag the errors this case most often surfaces and the evidence-quality distinctions worth naming out loud.
- **exam** — Teaching takeaway: A mute, motionless patient is an emergency until proven otherwise - screen with the BFCRS, test-and-treat with the lorazepam challenge, hold the antipsychotics, and know the malignant-catatonia triggers that mean early ECT.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `neurocog`, `safety`, `pharm`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA3`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-31"}

#### Page text (as shipped)

# Case of the Week — August 31, 2026 (Resident Version)

## Catatonia: Recognition, Workup, and Treatment

**Learner level:** Psychiatry residents (PGY-2–4; well suited to the C-L service)
**Format:** Facilitator-led discussion, ~20–30 minutes. Assumes DSM-5-TR fluency.
**Note:** This is a fully synthetic, de-identified teaching case. It describes no real patient; any resemblance to a real person is coincidental.

---

## Learner-facing case stem

You are the consultation-liaison resident. Medicine consults you for a 46-year-old man admitted two days ago with "altered mental status and failure to thrive." He has a history of bipolar I disorder, off all medications for about a year. Per his sister, he had a flu-like illness roughly three weeks ago, then over two weeks became progressively withdrawn, near-mute, and stopped eating reliably; for the last five days he has barely taken anything by mouth. In the emergency department three days ago he was "agitated and resistive" and received **haloperidol 5 mg IM twice**. The primary team reports he has since seemed "stiffer and more shut down."

On exam he is awake, eyes open, with fixed staring and almost no spontaneous movement. He does not speak beyond occasional repetition of the same short phrase (**verbigeration**). He holds his head several inches off the pillow for minutes at a time (**psychological pillow**, a form of posturing). Passive movement reveals **gegenhalten** (oppositional paratonia — resistance proportional to the force applied) and intermittent **waxy flexibility**; he mirrors some of your movements (**echopraxia**). He resists mouth opening and eye examination (**negativism**). There is mild diffuse rigidity without cogwheeling and no tremor or clonus.

Vitals: T 37.6 °C, HR 104, BP 142/88 (nurse notes readings from 108/70 to 150/92 today), RR 16, SpO₂ 98%. Labs: Na 148, BUN/Cr 32/1.3, CK 850 U/L, WBC 11.2; TSH and glucose normal; urine toxicology negative. BFCRS screening is positive at 8 of 14 screening items.

---

## Guided discussion questions

**Q1. Make the syndromic diagnosis precisely. How do DSM-5-TR, ICD-11, and the BFCRS each frame catatonia, and why does the framing matter?**

*Teaching point:* He easily meets DSM-5-TR criteria (≥3 of 12 signs — here mutism/verbigeration, posturing, waxy flexibility, negativism, echopraxia, staring on the BFCRS). DSM-5 moved catatonia out from under schizophrenia to a **specifier** applicable across mood, psychotic, and medical conditions, reflecting that mood disorders are the most common psychiatric context [5]. ICD-11 now recognizes catatonia as an **independent diagnostic entity** (since 2022) [3]. The **BFCRS** remains the workhorse instrument: 23-item severity scale, 14-item screen (positive at ≥2), standardized exam, inter-rater reliability ~0.93 [4]. Framing matters clinically: prevalence is roughly **5–18% on psychiatric inpatient units and ~3.3% on medical units** [3], and unrecognized catatonia is what kills — via VTE, aspiration, dehydration, and progression to malignant catatonia.

**Q2. What in this stem demands a workup for secondary (medical) catatonia, and what exactly do you send?**

*Teaching point:* Red flags: first catatonic episode at 46, subacute course after a **viral prodrome**, dysautonomia out of proportion to psychiatric history, and admission to a medical service. The BAP guideline's assessment framework: careful history and physical/neurological exam, then **neuroimaging (MRI preferred), EEG, and neuronal autoantibody testing in serum and CSF** — anti-NMDA-receptor encephalitis is the paradigmatic mimic/cause and can present catatonic [1,2]. Add here: CMP with Ca/Mg/phosphate, LFTs, B12, HIV and syphilis serology, serial CK, and an LP with cell count, protein, oligoclonal bands, and autoimmune panel. EEG also screens for **nonconvulsive status epilepticus**, which belongs on this differential. Delirium and catatonia are *not* mutually exclusive — they frequently co-occur in the medically ill, and both should be coded and tracked [3,6].

**Q3. Haloperidol was given, and he worsened. Disentangle NMS, antipsychotic-worsened catatonia, and malignant catatonia — conceptually and practically.**

*Teaching point:* Many authors treat **NMS as a drug-induced (malignant) variant of catatonia** — the phenotypes overlap almost completely (rigidity, mutism, autonomic instability, elevated CK) [2,6]. Practical synthesis for the bedside: (a) his catatonic signs **predated** haloperidol, so this is primary catatonia **worsened by a dopamine antagonist**, a well-described phenomenon and the reason antipsychotics — especially high-potency D2 blockers — are relatively contraindicated in active catatonia [2]; (b) whatever the label, T 37.6 with labile BP, HR 104, rigidity, and CK 850 means he is **evolving toward malignant catatonia**, which is life-threatening and can be fatal untreated [6]; (c) management converges: **stop dopamine blockers, start lorazepam, escalate monitoring, and mobilize ECT early** [1,2,6]. The BAP guideline gives specific regard to malignant catatonia, NMS, and antipsychotic-induced catatonia as special situations [1].

**Q4. Design the benzodiazepine trial: challenge, titration, endpoints, and what response rates you should quote.**

*Teaching point:* **Lorazepam challenge** (typically 1–2 mg IV in a monitored medical setting; IV is preferred for reliability of effect and because PO absorption is uncertain with poor intake), re-examine with the BFCRS within ~15–60 minutes; video or documented serial exams make response objective. If positive (often dramatic), convert to **scheduled dosing with structured uptitration** — effective regimens frequently exceed conventional anxiolytic dosing, and the BAP guideline explicitly notes lorazepam is "sometimes used in very high doses"; catatonic patients often tolerate these with surprisingly little sedation [1,2]. Titrate to BFCRS resolution, not to sedation. Quote honestly: benzodiazepines are first-line, but **up to ~27% of catatonia fails to respond to benzodiazepines alone** [8] — a pre-committed escalation plan is part of the initial order set. Mechanistically, GABA-A hypofunction is the leading model, consistent with benzodiazepine response and with premotor/motor-network dysfunction on imaging [3,5]. The α1-selective GABA-A agonist **zolpidem** has case-level evidence as an alternative challenge or augmentation agent when lorazepam response is equivocal [8].

**Q5. When does ECT enter, and how do you operationalize it on a medical service?**

*Teaching point:* **ECT is first-line together with benzodiazepines**, and is the treatment of choice for **malignant catatonia, benzodiazepine-refractory catatonia, and when a rapid response is needed** (e.g., no oral intake, dysautonomia) [1,2,6]. Operationally: early ECT consultation (do not wait for a completed benzodiazepine failure if malignant features progress), anesthesia review, capacity assessment — catatonic patients usually lack capacity, so involve surrogate consent per jurisdiction, and know your local emergency-treatment pathway. Discuss with learners: continuing lorazepam during an ECT course is common practice (with attention to seizure threshold and timing of doses) — an excellent point for residents to argue from first principles and local protocol.

**Q6. The patient cannot get ECT quickly and has only partially responded to lorazepam. What are your evidence-informed adjuncts and their cautions?**

*Teaching point:* The adjunct evidence base is largely observational — case series and systematic reviews of cases — which the guideline authors themselves flag as the field's main limitation [1,2]. Best-supported alternatives: **NMDA-receptor antagonists (amantadine, memantine)**, with anti-epileptic drugs and certain atypical antipsychotics also described [3,7]. If psychosis demands antipsychotic treatment, prefer agents with lower D2 antagonism — **clozapine and aripiprazole are effective in some populations** [3] — introduced cautiously after catatonia is improving, with benzodiazepine cover and serial BFCRS/CK monitoring. Never re-challenge with high-potency agents in someone whose catatonia worsened on them.

**Q7. Write the safety-and-systems plan: complications, monitoring, disposition, and prognosis.**

*Teaching point:* Catatonia's morbidity is mostly **medical**: VTE (immobility — prophylaxis from day one), aspiration pneumonia (swallow evaluation before PO; NG feeding if intake fails), dehydration, AKI and electrolyte derangement (already present: Na 148, BUN/Cr 32/1.3), rhabdomyolysis (serial CK), pressure injuries, and contractures. Orders: continuous or q4h vitals with autonomic-instability parameters, strict I/O, daily BFCRS by a consistent examiner, DVT prophylaxis, PT/OT. Escalation triggers to ICU: temperature rise, worsening autonomic lability, CK trajectory, or declining arousal. Prognosis framing for the team and family: with early recognition and appropriate treatment (benzodiazepines/ECT), most catatonia responds well; delayed recognition drives the high morbidity and mortality [3]. As his mood episode declares itself during recovery, complete structured suicide-risk assessment and safety planning before stepping down observation — keep this at the level of recognition, structured assessment, and escalation.

---

## Ranked differential diagnosis (with discriminators)

1. **Catatonia in the context of a bipolar I mood episode, worsened by antipsychotic exposure** — prior bipolar I, subacute psychomotor decline, classic signs predating haloperidol, deterioration after D2 blockade [2,5].
2. **Catatonia due to another medical condition — autoimmune (anti-NMDA-receptor) encephalitis first among them** — viral-like prodrome, first presentation this severe at 46, dysautonomia; requires MRI, EEG, serum + CSF autoantibodies to exclude [1,2].
3. **Evolving malignant catatonia** — low-grade fever, labile BP, tachycardia, rigidity, CK 850; this is a trajectory, not a separate box, and it changes tempo of care [6].
4. **Neuroleptic malignant syndrome** — haloperidol exposure with rigidity and CK elevation; argued against by clear pre-exposure catatonic syndrome and only modest fever/CK; management overlaps with #3 regardless [2,6].
5. **Catatonia–delirium comorbidity / hypoactive delirium** — medically ill, dehydrated, fluctuating vitals; screen attention (e.g., months backward), CAM-ICU-style assessment; the two co-occur and both matter [3,6].
6. **Nonconvulsive status epilepticus** — staring, mutism, minimal movement; EEG is the only way to know.
7. **Serotonin syndrome** — no serotonergic exposure, no clonus/hyperreflexia; include to teach the toxidrome grid (drug history + neuromuscular exam distinguish SS, NMS, and malignant catatonia).
8. **Structural/metabolic akinetic mutism** (frontal or mesodiencephalic lesions, severe hypernatremia contribution) — imaging plus correction of Na 148 and reassessment.

---

## Workup & management summary

**Tier 1 (today):** stop all dopamine antagonists; BFCRS-scored standardized exam and daily re-scoring; CBC, CMP + Ca/Mg/Phos, LFTs, serial CK, TSH, B12, HIV/RPR, blood cultures if febrile; ECG; IV fluids for hypernatremia/prerenal azotemia; VTE prophylaxis; NPO pending swallow evaluation with NG plan; q4h vitals with autonomic parameters.

**Tier 2 (this admission, expedited):** MRI brain, EEG (rule out NCSE; encephalitis patterns), LP with CSF cell count/protein/oligoclonal bands and neuronal autoantibody panel in serum and CSF [1,2].

**Treatment ladder:** lorazepam challenge 1–2 mg IV → scheduled lorazepam with structured uptitration titrated to BFCRS response [1,2] → **early ECT** for malignant features, benzodiazepine failure (up to ~27% [8]), or need for rapid response [1,2,6] → adjuncts where ECT/benzodiazepines are unavailable or insufficient: amantadine/memantine; cautious clozapine or aripiprazole if psychosis requires treatment [3,7]; zolpidem as challenge/augmentation alternative [8].

**Do not:** start or resume high-potency antipsychotics during active catatonia; attribute the syndrome to "noncompliance with bipolar meds" before the secondary workup is done; forget that the mortality lives in the supportive-care column.

---
---

## Facilitator notes — keep separate; not for learner distribution

**Flow (20–30 min):** 3–4 min stem → Q1 briefly (they should nail it) → spend the session's core on Q3, Q4, and Q5 (the NMS/malignant-catatonia disentangling and the treatment ladder are the highest-yield resident content) → Q7 as rapid-fire order-writing → close with evidence-quality caveat.

**Points to press residents on:** Have them defend *why* antipsychotics are held (D2 blockade worsening catatonia/precipitating malignant conversion) rather than reciting the rule. Ask what specifically they would document to make a lorazepam response objective (serial BFCRS, timed video with consent, nursing observations). Ask who consents for ECT when the patient lacks capacity in your state, and what the emergency pathway is. Push on the catatonia–delirium overlap: what does a CAM-positive, BFCRS-positive patient get treated with first, and why (treat catatonia with lorazepam while treating delirium's cause; avoid reflexive antipsychotics).

**Evidence-quality caveat to state explicitly:** the BAP guideline recommendations rest mainly on small observational studies, case series, and case reports — clinical trials are uncommon [1,2]; the zolpidem literature is case-level with likely reporting bias [8]. Model calibrated language for trainees.

**Anticipated wrong turns:** treating this as pure NMS and stopping at "supportive care + dantrolene" (redirect: benzodiazepines/ECT treat the underlying catatonic process); waiting for the full autoimmune panel before any treatment (lorazepam trial and workup proceed in parallel); dosing lorazepam 0.5 mg BID and calling it a failed trial.

**Optional extension (if >30 min):** assign one resident to argue for early ECT and another for maximizing pharmacotherapy first, then debrief using the malignant-features trajectory as the deciding variable.

**Safety framing:** all suicide-risk content stays at recognition, structured assessment, observation, and escalation — no method-level detail in discussion or documentation examples.

---

## References

Based on articles retrieved from PubMed (National Library of Medicine). Citation fields below (journal, year, volume/pages, DOI) were verified against PubMed records on 2026-08-31.

1. Rogers JP, Oldham MA, Fricchione G, et al. Evidence-based consensus guidelines for the management of catatonia: Recommendations from the British Association for Psychopharmacology. *J Psychopharmacol*. 2023;37(4):327-369. [DOI: 10.1177/02698811231158232](https://doi.org/10.1177/02698811231158232)
2. Rogers JP, Zandi MS, David AS. The diagnosis and treatment of catatonia. *Clin Med (Lond)*. 2023;23(3):242-245. [DOI: 10.7861/clinmed.2023-0113](https://doi.org/10.7861/clinmed.2023-0113)
3. Hirjak D, Rogers JP, Wolf RC, et al. Catatonia. *Nat Rev Dis Primers*. 2024;10(1):49. [DOI: 10.1038/s41572-024-00534-w](https://doi.org/10.1038/s41572-024-00534-w)
4. Bush G, Fink M, Petrides G, Dowling F, Francis A. Catatonia. I. Rating scale and standardized examination. *Acta Psychiatr Scand*. 1996;93(2):129-136. [DOI: 10.1111/j.1600-0447.1996.tb09814.x](https://doi.org/10.1111/j.1600-0447.1996.tb09814.x)
5. Walther S, Stegmayer K, Wilson JE, Heckers S. Structure and neural mechanisms of catatonia. *Lancet Psychiatry*. 2019;6(7):610-619. [DOI: 10.1016/S2215-0366(18)30474-7](https://doi.org/10.1016/S2215-0366(18)30474-7)
6. Connell J, Oldham M, Pandharipande P, et al. Malignant Catatonia: A Review for the Intensivist. *J Intensive Care Med*. 2022;38(2):137-150. [DOI: 10.1177/08850666221114303](https://doi.org/10.1177/08850666221114303)
7. Beach SR, Gomez-Bernal F, Huffman JC, Fricchione GL. Alternative treatment strategies for catatonia: A systematic review. *Gen Hosp Psychiatry*. 2017;48:1-19. [DOI: 10.1016/j.genhosppsych.2017.06.011](https://doi.org/10.1016/j.genhosppsych.2017.06.011)
8. Gunther M, Tran N, Jiang S. Zolpidem for the Management of Catatonia: A Systematic Review. *J Acad Consult Liaison Psychiatry*. 2024;66(1):49-56. [DOI: 10.1016/j.jaclp.2024.10.004](https://doi.org/10.1016/j.jaclp.2024.10.004)


---

## Borderline Personality Disorder (Aug 27)

- **Slug:** `cotw_20260827_bpd_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-27_borderline-personality-disorder_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 2,692 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-08-27)

**TL;DR (shown above the page text):**

> A third admission, a five-drug regimen, and a 'treatment-resistant bipolar' label that was never right - BPD is diagnosed from the longitudinal pattern, treated definitively with psychotherapy, and managed on a chronic vs. acute-on-chronic risk frame.

**Key points (bulleted card):**

- ~20-30 minute small-group discussion - no pre-reading required.
- De-identified synthetic case; each discussion question is paired with a teaching point.
- Resident level. Facilitator notes are kept separate from the learner-facing stem.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Work the stem cold: take your own history, commit to a differential, and name your next step before reading a single teaching point. The guided questions are written to be answered, not skimmed.
- **mse** — Say out loud what each exam finding in the vignette rules in and rules out — the discrimination between look-alike syndromes is what the case is drilling.
- **safety** — Safety content in every case is oriented to recognition, escalation, and safety planning. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Before moving on, rehearse one sentence you would actually say to this patient or family, in plain language and out loud.
- **collateral** — Ask yourself what collateral would change your differential here, and who you would have to call to get it.
- **rounds** — If you are running the session, the facilitator notes flag the errors this case most often surfaces and the evidence-quality distinctions worth naming out loud.
- **exam** — Teaching takeaway: A third admission, a five-drug regimen, and a 'treatment-resistant bipolar' label that was never right - BPD is diagnosed from the longitudinal pattern, treated definitively with psychotherapy, and managed on a chronic vs. acute-on-chronic risk frame.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `communication`, `team`, `exam`
- **Shelf blueprint tags:** `personality`, `safety`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-27"}

#### Page text (as shipped)

# Case of the Week — August 27, 2026 (Resident Edition)

## Borderline Personality Disorder: Presentation & Management

> **De-identified synthetic teaching case.** This case is a fictional composite created for teaching. It contains no real patient details. Citations below are based on articles retrieved from PubMed; DOI links are provided in the reference list.
>
> **Learner level:** Psychiatry residents (PGY-1–3) · **Format:** ~25–30 minute guided discussion · **Assumes:** DSM-5-TR fluency, familiarity with common agents

---

# PART 1 — LEARNER-FACING CASE

## Case Stem

Ms. R is a 24-year-old graduate student admitted overnight to the inpatient unit after presenting with escalating suicidal ideation in the context of a rupture with her thesis advisor, whom she describes as "the only person who ever believed in me — until he abandoned me like everyone else." This is her third psychiatric presentation in 14 months; prior discharge diagnoses include "bipolar II, treatment-refractory," "recurrent MDD," and "unspecified mood disorder."

Her current regimen, accumulated across these episodes, is quetiapine 300 mg qHS, lamotrigine 200 mg daily, sertraline 150 mg daily, and lorazepam 1 mg TID PRN, of which she takes "two or three most days." She reports mood shifts measured in hours, nearly always triggered by perceived rejection; chronic emptiness "since middle school"; a string of intense relationships with idealization–devaluation cycles; recurrent superficial self-injury during states of dissociative numbness ("to feel something again"); and stress-related episodes of feeling that people are conspiring against her, lasting hours and resolving with reassurance. She meets no criteria for a current or past hypomanic episode on careful longitudinal review. She reports nightmares and hypervigilance dating to childhood emotional abuse, and drinks to intoxication 2–3 nights weekly, more during crises.

Overnight she was described by night staff as "the most insightful patient on the unit"; by morning she has filed a complaint against her assigned nurse and requested a different treatment team. On rounds she is articulate and engaging, then abruptly hostile when her attending mentions discharge planning, stating, "If you discharge me, whatever happens is on you." She later apologizes tearfully, saying she was terrified of being "thrown away again." She denies current intent or plan; she wants "a medication that finally works."

## Discussion Questions (learner version)

1. Walk through the discriminating features between BPD and bipolar II disorder in this history. Why does the distinction keep getting missed, and what are the costs of the mislabel?
2. How would you formally establish the diagnosis and severity, and how do you handle the co-occurring PTSD and alcohol use in your formulation?
3. Appraise the psychotherapy evidence base for BPD: what do the major meta-analyses actually show, which modalities have the strongest support, and how robust are those effects?
4. Critically evaluate her medication regimen against the pharmacotherapy evidence. Design a concrete deprescribing plan, including sequencing and what you tell her.
5. She says, "If you discharge me, whatever happens is on you." Formulate her suicide risk (chronic vs. acute-on-chronic), and describe how you document and manage risk around discharge, including safety planning.
6. The overnight/day-shift split and the team complaint are already fracturing the milieu. What is happening psychodynamically, and what concrete team-level interventions prevent iatrogenic harm?
7. No DBT program has openings for five months. What does generalist, evidence-informed management (e.g., Good Psychiatric Management) look like as a bridge, and what do you tell her about prognosis?

---

# PART 2 — FACILITATOR GUIDE (not for learner distribution)

## Discussion Questions with Teaching Points

**Q1. BPD vs. bipolar II: discrimination and the cost of mislabeling.**
*Teaching point:* Push residents past the checklist to the **longitudinal architecture**: episode duration (hours–days, interpersonally indexed vs. ≥4-day sustained hypomania), phenomenology of "highs" (relief/excitement within relationships vs. autonomous drive states with decreased need for sleep), inter-episode baseline (chronic emptiness and identity diffusion vs. euthymic intervals), and reactivity signature (rejection-cued vs. spontaneous or seasonal). Stress-related paranoid ideation and dissociation lasting hours are BPD criterion-9 phenomena, not psychotic-spectrum or mixed features. The cost of mislabeling: years of ineffective polypharmacy, escalating regimens each crisis, foreclosed access to the psychotherapies that actually work, and reinforcement of an externalizing illness model ("my meds aren't working") that undermines agency [1,2].

**Q2. Formal diagnosis, severity, and comorbidity in the formulation.**
*Teaching point:* Establish DSM-5-TR criteria via semistructured assessment (e.g., SCID-5-PD module; MSI-BPD as a screen), anchored in longitudinal course and collateral. Expect comorbidity as the rule — mood disorders ~83%, anxiety disorders ~85%, SUD ~78% [1] — and formulate hierarchically: BPD as the organizing diagnosis explaining the pattern; PTSD and AUD as co-primary targets, not afterthoughts. Etiologically, integrate gene–environment interplay: heritable emotional sensitivity plus adverse childhood experiences (her emotional abuse history) shaping rejection hypersensitivity [1,2]. Naming the diagnosis explicitly, with psychoeducation, is guideline-consistent care — concealment predicts treatment incoherence. Severity staging (self-injury frequency, hospitalization pattern, functioning) sets the outcome metrics for everything that follows.

**Q3. What the psychotherapy evidence actually shows.**
*Teaching point:* Residents should be able to cite the numbers, not just the slogan "therapy works." The 2020 Cochrane review (75 RCTs, n=4507): psychotherapy vs. TAU reduces BPD severity with SMD −0.52 (95% CI −0.70 to −0.33; moderate certainty) — the only primary outcome crossing the minimal clinically relevant difference — with smaller, low-certainty effects on self-harm (SMD −0.32) and suicide-related outcomes (SMD −0.34); DBT and MBT are the best-studied modalities, and subgroup analyses show **no clear superiority of any specific brand** vs. TAU [3]. The focused 2022 re-analysis of adult trials: DBT reduced self-harm (SMD −0.54) and improved psychosocial functioning; MBT reduced self-harm (RR 0.51) and suicide-related outcomes (RR 0.10); adjunctive DBT skills training carried moderate-certainty benefit for BPD severity (SMD −0.66) [4]. Cristea et al.'s independent meta-analysis (33 RCTs): borderline-relevant outcomes g≈0.32–0.40, durable at follow-up (g=0.45), with DBT and psychodynamic approaches the only clusters beating controls — but effects are **small-to-moderate, inflated by risk of bias and publication bias, and unstable at follow-up** [5]. Honest synthesis: structured, BPD-specific therapy is clearly better than unstructured care; brand loyalty is weakly supported; common factors (coherent frame, hierarchy of targets, therapist stance) likely carry much of the effect [3,4,5].

**Q4. Pharmacotherapy appraisal and deprescribing design.**
*Teaching point:* The evidence is stark: the 2022 Cochrane review (46 RCTs, n=2769) found **no medication class beat placebo on any primary outcome** — BPD severity, self-harm, suicide-related outcomes, psychosocial functioning — with mostly very-low-certainty evidence; secondary signals are thin (SGAs: slight reduction in interpersonal problems, SMD −0.21; mood stabilizers: interpersonal problems SMD −0.58, low certainty) [6]. Gartlehner et al. similarly: of ~87 agents in clinical use, trials exist for nine; anticonvulsants may improve anger/affective lability on low-certainty, mostly single-study evidence — this against a backdrop where up to 96% of patients with BPD receive psychotropics [7]. No agent is FDA-approved for BPD; guideline-consistent practice reserves medication for discrete comorbid disorders and time-limited crisis use (low-dose antipsychotic or sedative antihistamine preferred; **benzodiazepines avoided** — disinhibition, misuse liability, and she is already using lorazepam daily with alcohol) [1,6,7].
*Deprescribing plan for Ms. R:* (1) Frame first — "we are un-burying you from medications that were never going to treat this" — tie every step to the illness model so taper ≠ abandonment. (2) **Lorazepam first**: it is the active harm (daily use + AUD + disinhibition); convert to scheduled taper with withdrawal monitoring given concurrent alcohol use. (3) Reassess sertraline against a *cleanly established* comorbid MDD or PTSD indication — it may earn its place; if retained, retain deliberately. (4) Taper quetiapine next (metabolic burden, sedation masquerading as mood benefit), possibly retaining a brief low-dose crisis-only plan. (5) Lamotrigine last and slowly. One change at a time, defined outcome metrics (self-injury frequency, crisis presentations), explicit relapse plan, and documentation that this is evidence-based de-escalation, not withdrawal of care.

**Q5. "Whatever happens is on you": risk formulation and discharge management.**
*Teaching point:* Formulate explicitly in the **chronic vs. acute-on-chronic** framework: her chronic risk is elevated at baseline (recurrent SI, self-injury, AUD, trauma history); the assessment question is whether acute-on-chronic elevation persists (intent, plan, preparatory behavior, command phenomena, intoxication, recent severe loss without stabilization). The statement on rounds is best understood functionally — an attachment-driven bid to prevent abandonment — and is managed by **naming the fear, not capitulating or counter-threatening**: validate the terror of discharge, restate the shared plan, and involve her in criteria-based discharge planning. Prolonged nonspecific admission reinforces crisis-contingent care and is itself iatrogenic; brief, goal-defined admission with a structured landing is the evidence-informed middle path [1,2]. Before discharge: collaborative **safety plan** (warning signs → internal coping → social contacts → professional contacts → environment safety with lethal-means counseling → crisis contacts), sobriety-contingent elements given AUD, collateral engagement, and near-term follow-up. **Documentation:** record the chronic/acute-on-chronic formulation, protective factors, the functional analysis of the statement, capacity, the risk-benefit reasoning for discharge *including the risks of continued hospitalization*, and the contingency plan. This is both good care and the correct medicolegal posture.

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

**Q6. Splitting and the milieu: team-level management.**
*Teaching point:* The night/day discrepancy and the complaint are textbook **splitting** — but teach it as a two-person phenomenon: the patient's unintegrated self- and object-representations *recruit* real staff disagreements (projective identification), and teams then enact the split ("she's manipulative" vs. "she's misunderstood"). Interventions are structural, not exhortative: a single voice for the plan (one attending communicates decisions), brief daily staff huddle to surface and metabolize countertransference, explicit behavioral frame shared with the patient, complaint handled through the normal process without either punitive drift or special exception, and supervision that names staff feelings as diagnostic data rather than failings. "Manipulative" is reframed as *the best available strategy of a person with rejection hypersensitivity and few regulation skills* — this single reframe measurably changes team behavior [1,2].

**Q7. Bridging without DBT: generalist management and prognosis.**
*Teaching point:* Brand-name therapy scarcity is the norm, and the trial literature justifies a generalist alternative: **Good Psychiatric Management (GPM)** — case management plus psychodynamically informed supportive therapy, organized around the interpersonal hypersensitivity model: psychoeducation and explicit diagnostic disclosure, "life outside treatment" focus (work/school before intense affect exploration), conservative prescribing with deprescribing, chronic-vs-acute risk frame, and defined intersession contact expectations. GPM performed comparably to DBT in the principal head-to-head trial and is designed for dissemination to general psychiatrists and residents [8]. Weekly GPM-informed individual contact + adjunctive DBT skills group (moderate-certainty adjunctive evidence [4]) + AUD treatment (motivational interviewing ± naltrexone) + trauma-focused therapy sequenced once stabilized is a defensible, evidence-informed bridge. **Prognosis:** communicate honest hope — longitudinal cohorts show most patients achieve symptomatic remission over 5–10 years with low relapse, while *functional* recovery lags and tracks with structured treatment; early intervention in adolescence/young adulthood improves trajectory [1,2].

## Ranked Differential Diagnosis

1. **Borderline personality disorder** — criterion-level fit across all four sectors (interpersonal, identity, affective, behavioral) with criterion-9 stress-related paranoid ideation/dissociation; longitudinal course diagnostic.
2. **PTSD (comorbid, probable)** — childhood emotional abuse, nightmares, hypervigilance; co-primary treatment target, and dissociative self-injury overlaps both constructs.
3. **Alcohol use disorder (comorbid, active)** — 2–3×/week intoxication escalating with crises; independent driver of impulsivity, suicide risk, and benzodiazepine harm.
4. **Bipolar II disorder** — the standing mislabel; excluded on careful longitudinal review (no sustained hypomania, no autonomous episodes); keep on the differential formally given diagnostic stickiness, revisit if course changes.
5. **Recurrent MDD** — discrete episodes may supervene on BPD; requires clean cross-sectional criteria during a period of interpersonal stability to call.
6. **Complex PTSD (ICD-11 frame)** — worth discussing as a formulation alternative; overlapping disturbances of self-organization, but BPD-specific features (abandonment panic, idealization–devaluation) argue for BPD as primary.

## Workup & Management Summary

- **Diagnostics:** SCID-5-PD (BPD module) or equivalent; MSI-BPD screen; PCL-5 and trauma history; AUDIT; longitudinal mood timeline with collateral; CIWA monitoring if withdrawal risk; baseline labs/metabolic panel (quetiapine), LFTs (AUD).
- **Inpatient phase:** Goal-defined brief admission; diagnostic disclosure + psychoeducation; begin lorazepam consolidation/taper; single-voice team frame; safety plan built collaboratively before discharge day.
- **Bridge phase:** GPM-informed weekly individual follow-up; DBT skills group referral (adjunctive evidence moderate [4]); AUD intervention ± naltrexone; deprescribing sequence per Q4; defined crisis pathway (what she does, whom she calls, what the ED does) to break the admission-contingent cycle.
- **Definitive phase:** Full structured psychotherapy (DBT, MBT, TFP, or schema-based per availability) [3,4,5]; sequenced trauma-focused work; medication list minimized to indicated agents only.

## Facilitator Notes

- **Timing (30 min):** Stem 3 min → Q1–Q2 ~7 min (diagnosis/formulation) → Q3–Q4 ~9 min (evidence appraisal — make them cite numbers) → Q5–Q6 ~8 min (risk, milieu) → Q7 ~3 min (systems/prognosis).
- **Level calibration:** PGY-1s: prioritize Q1, Q2, Q5. PGY-2/3s: press hardest on Q3–Q4 (critical appraisal — certainty of evidence, MIREDIF, publication bias) and Q6 (countertransference articulacy).
- **Common resident pitfalls:** (1) accepting the inherited bipolar label; (2) deprescribing abruptly or moralistically; (3) documenting "contracted for safety" instead of a risk formulation; (4) meeting the discharge threat with defensiveness or capitulation rather than functional analysis; (5) letting "manipulative" stand unchallenged in team discourse.
- **Safety framing:** Keep all suicide/self-harm discussion at the level of recognition, formulation, escalation, documentation, and safety planning. Do not discuss methods or lethality specifics; redirect if learners drift there.
- **Discussion spice (if time):** Is the psychotherapy evidence base's brand-agnosticism (Cochrane subgroup null [3]) an argument for common-factors training over expensive certification pipelines? Good 5-minute debate.

---

## References

Based on articles retrieved from PubMed. Citation fields (journal, year, volume/issue/pages, PMID, DOI) verified via PubMed metadata.

1. Leichsenring F, Heim N, Leweke F, Spitzer C, Steinert C, Kernberg OF. Borderline Personality Disorder: A Review. *JAMA*. 2023;329(8):670-679. PMID: 36853245. [DOI: 10.1001/jama.2023.0589](https://doi.org/10.1001/jama.2023.0589)
2. Bohus M, Stoffers-Winterling J, Sharp C, Krause-Utz A, Schmahl C, Lieb K. Borderline personality disorder. *Lancet*. 2021;398(10310):1528-1540. PMID: 34688371. [DOI: 10.1016/S0140-6736(21)00476-1](https://doi.org/10.1016/S0140-6736(21)00476-1)
3. Storebø OJ, Stoffers-Winterling JM, Völlm BA, et al. Psychological therapies for people with borderline personality disorder. *Cochrane Database Syst Rev*. 2020;5(5):CD012955. PMID: 32368793. [DOI: 10.1002/14651858.CD012955.pub2](https://doi.org/10.1002/14651858.CD012955.pub2)
4. Stoffers-Winterling JM, Storebø OJ, Kongerslev MT, et al. Psychotherapies for borderline personality disorder: a focused systematic review and meta-analysis. *Br J Psychiatry*. 2022;221(3):538-552. PMID: 35088687. [DOI: 10.1192/bjp.2021.204](https://doi.org/10.1192/bjp.2021.204)
5. Cristea IA, Gentili C, Cotet CD, Palomba D, Barbui C, Cuijpers P. Efficacy of Psychotherapies for Borderline Personality Disorder: A Systematic Review and Meta-analysis. *JAMA Psychiatry*. 2017;74(4):319-328. PMID: 28249086. [DOI: 10.1001/jamapsychiatry.2016.4287](https://doi.org/10.1001/jamapsychiatry.2016.4287)
6. Stoffers-Winterling JM, Storebø OJ, Pereira Ribeiro J, et al. Pharmacological interventions for people with borderline personality disorder. *Cochrane Database Syst Rev*. 2022;11(11):CD012956. PMID: 36375174. [DOI: 10.1002/14651858.CD012956.pub2](https://doi.org/10.1002/14651858.CD012956.pub2)
7. Gartlehner G, Crotty K, Kennedy S, et al. Pharmacological Treatments for Borderline Personality Disorder: A Systematic Review and Meta-Analysis. *CNS Drugs*. 2021;35(10):1053-1067. PMID: 34495494. [DOI: 10.1007/s40263-021-00855-4](https://doi.org/10.1007/s40263-021-00855-4)
8. Links PS, Ross J. Good Psychiatric Management of Borderline Personality Disorder: Foundations and Future Challenges. *Am J Psychother*. 2024;78(1):4-10. PMID: 38952224. [DOI: 10.1176/appi.psychotherapy.20230044](https://doi.org/10.1176/appi.psychotherapy.20230044)

---

*Prepared for the Psychiatry Clerkship / Residency teaching series — Case of the Week. Joshua Moss, MD | Psychiatrist*


---

## Panic Disorder (Aug 10)

- **Slug:** `cotw_20260810_panic_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-10_anxiety-panic-disorder_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 4,579 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-08-10)

**TL;DR (shown above the page text):**

> The cardiac workup is negative and the patient goes home no better - panic disorder is a positive diagnosis with a short list of must-not-miss mimics, and the disability lives in the avoidance, not the attacks.

**Key points (bulleted card):**

- ~20-30 minute small-group discussion - no pre-reading required.
- De-identified synthetic case; each discussion question is paired with a teaching point.
- Resident level. Facilitator notes are kept separate from the learner-facing stem.

**Clinical-workflow narration (per-stage coaching text):**

- **ask** — Work the stem cold: take your own history, commit to a differential, and name your next step before reading a single teaching point. The guided questions are written to be answered, not skimmed.
- **mse** — Say out loud what each exam finding in the vignette rules in and rules out — the discrimination between look-alike syndromes is what the case is drilling.
- **safety** — Safety content in every case is oriented to recognition, escalation, and safety planning. Escalate to your supervising resident or attending rather than managing acuity alone.
- **say** — Before moving on, rehearse one sentence you would actually say to this patient or family, in plain language and out loud.
- **collateral** — Ask yourself what collateral would change your differential here, and who you would have to call to get it.
- **rounds** — If you are running the session, the facilitator notes flag the errors this case most often surfaces and the evidence-quality distinctions worth naming out loud.
- **exam** — Teaching takeaway: The cardiac workup is negative and the patient goes home no better - panic disorder is a positive diagnosis with a short list of must-not-miss mimics, and the disability lives in the avoidance, not the attacks.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `anxiety`, `pharm`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA3`, `EPA4`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-10"}

#### Page text (as shipped)

# Case of the Week — Resident Edition
## Panic Disorder: Differential Precision, Pharmacologic Optimization, and Undoing Iatrogenic Maintenance

**Date:** 2026-08-10
**Learner level:** Psychiatry residents (PGY-1 through PGY-4). DSM-5-TR fluency assumed.
**Format:** ~20–30 min case conference or didactic block. No required pre-reading.
**Citations:** Based on articles retrieved from PubMed. Full reference list at the end. All patient details are **synthetic and de-identified**.

---

### The Case (learner-facing stem)

A 41-year-old man is referred to your outpatient clinic **by cardiology**, with a note that reads: *"Extensive workup negative. Suspect panic. Please assess — though the blood pressure readings give me pause."*

**History of present illness.** For roughly fourteen months he has had discrete episodes: abrupt pounding in the chest, a band of pressure across the sternum, drenching sweats, a **pounding bifrontal headache**, and a sense of impending doom. Onset is sudden, peak is within five to ten minutes, and the episode fades over thirty to sixty minutes, leaving him drained. He counts eight to ten per month. Several have woken him from sleep. He cannot identify triggers; he insists they are "completely random."

**The finding that stalled the workup.** During an episode in the cardiology waiting room, a nurse recorded **BP 194/112, HR 122**. Between episodes his pressures are consistently 118–128/72–80.

**Workup to date:** ECG in sinus rhythm, no pre-excitation, QTc 424 ms. Echocardiogram normal. 48-hour Holter captured two symptomatic episodes — **sinus tachycardia only**, no arrhythmia. **Plasma free metanephrines normal on two occasions**, one drawn within an hour of an episode. 24-hour urinary fractionated metanephrines normal. **CT abdomen/pelvis with contrast: no adrenal or extra-adrenal mass.** TSH 2.1, free T4 normal. CMP, CBC, HbA1c 5.4% all normal. Urine drug screen negative.

**Psychiatric history.** Never seen psychiatry. Fourteen months ago his primary care physician started **sertraline 25 mg daily** — "it took the edge off a bit" — and it has **never been titrated**. At the same visit he was given **alprazolam 0.5 mg as needed**. He initially used it once or twice a week. He now takes it **three to four times daily**, and describes needing it "before it starts, or I can't stop it." He notes the episodes seem to cluster in the **late morning and mid-afternoon**.

**Course and function.** He has stopped exercising (his cardiologist cleared him; he is afraid to raise his heart rate). He no longer drives outside town. He works from home now, having stepped back from a client-facing role. He drinks two beers most evenings, "to come down." No stimulants, no cocaine, no decongestants. Caffeine: two cups in the morning.

**Relevant background.** Fifteen months ago — one month before symptom onset — his father died suddenly of a myocardial infarction at age 68, at home, with the patient present and performing CPR until EMS arrived. He mentions this flatly, in passing, and moves on.

**Exam.** Afebrile. **BP 124/78, HR 84** in clinic. No thyromegaly, no tremor, no exophthalmos. Cardiac, respiratory, abdominal, and neurologic exams unremarkable. Mildly anxious, guarded, no psychomotor abnormality. Cognition grossly intact. Denies current suicidal ideation; you note he answers quickly and moves on.

---

### Guided Discussion Questions

**Q1. Cardiology's hesitation is reasonable — the blood pressure spikes are real and documented. Formulate the diagnosis. What is the label for this pattern, and does it exclude panic disorder?**

*Teaching point:* This is a **pseudopheochromocytoma** pattern: severe, symptomatic **paroxysmal hypertension without biochemical evidence of catecholamine excess and without a demonstrable tumor** [10]. The negative plasma free metanephrines — a test with high sensitivity for pheochromocytoma, particularly when drawn near an episode — together with negative urinary fractionated metanephrines and a negative CT, make an adrenal or extra-adrenal catecholamine-secreting tumor very unlikely.

The mechanism is not "nothing." The literature describes **augmented cardiovascular responsiveness to endogenous catecholamines alongside heightened sympathetic outflow**, so a normal or near-normal catecholamine surge produces an exaggerated hemodynamic response. Descriptively, the syndrome is often associated with **repressed emotion related to a prior traumatic episode, or a repressive coping style** — patients characteristically do *not* report fear as the leading symptom and may deny distress altogether. Management is described as requiring **collaboration between a hypertension specialist and a psychiatrist or psychologist with expertise in cognitive-behavioral panic management** [10].

Hold two things at once here. Our patient has documented paroxysmal hypertension *and* meets DSM-5-TR criteria for panic disorder: recurrent unexpected panic attacks (≥4 symptoms, peaking within minutes), followed by more than a month of persistent concern about further attacks and conspicuous maladaptive behavior change — stopping exercise, restricting driving, leaving a client-facing role. Assess formally for comorbid **agoraphobia**, which his avoidance pattern suggests.

Note also the **nocturnal panic attacks**. Waking from sleep in panic is well recognized in panic disorder, is *not* a red flag for an endocrine cause, and is a useful discriminator from many medical mimics — though it should prompt you to think about sleep apnea and nocturnal arrhythmia.

And note the **temporal anchor everyone will want to skip**: symptom onset one month after witnessing his father's fatal MI while performing CPR. He reports it flatly and moves on. Screen deliberately for PTSD and for prolonged grief. This does not displace the panic diagnosis, but the catastrophic cognition in his attacks — *this is a heart attack, I am dying* — is not generic. It has a specific and recent origin, and that shapes both formulation and psychotherapy.

**Q2. Give a ranked differential. What is on your list that a medical student's list would miss — and what iatrogenic contributor is hiding in this history?**

*Teaching point:*

| Rank | Diagnosis | For | Against / discriminator |
|---|---|---|---|
| 1 | **Panic disorder ± agoraphobia**, with a **pseudopheochromocytoma** hemodynamic phenotype | Full DSM-5-TR criteria; negative comprehensive workup; documented paroxysmal HTN with negative metanephrines; trauma-linked onset [10] | — |
| 2 | **Benzodiazepine interdose withdrawal** (iatrogenic, and probably now co-driving the picture) | Alprazolam TID–QID escalation from PRN; episodes clustering late morning and mid-afternoon; "need it before it starts" | Predates alprazolam start — so it is an *amplifier*, not the origin |
| 3 | **PTSD and/or prolonged grief disorder** | Witnessed his father's fatal MI one month pre-onset; flat, avoidant recounting; cardiac-specific catastrophic cognition | Needs explicit screening — re-experiencing, avoidance, negative cognitions, hyperarousal |
| 4 | **True pheochromocytoma / paraganglioma** | Documented paroxysmal HTN, headache, diaphoresis, palpitations | **Metanephrines normal ×2 including near-episode; CT negative.** Very unlikely — but the classic triad demands it be formally excluded, which it has been |
| 5 | **Paroxysmal arrhythmia (SVT) or POTS** | Palpitations, abrupt onset/offset, tachycardia to 122 | **Holter captured two symptomatic episodes: sinus tachycardia only.** Effectively excluded. Consider orthostatics if positional |
| 6 | **Alcohol-related — withdrawal or rebound anxiety** | Two beers nightly "to come down" | Volume low for physiologic withdrawal, but quantify carefully; patients underreport |
| 7 | **Temporal lobe epilepsy (ictal fear)** | Stereotyped paroxysmal episodes with autonomic features | Argues against: episodes last 30–60 min (ictal fear is typically seconds to ~2 min), no automatisms, no post-ictal confusion, no aura stereotypy, intact awareness |
| 8 | **Thyrotoxicosis; carcinoid; mast cell activation** | Episodic autonomic symptoms | TSH/free T4 normal. No flushing/diarrhea/wheeze (carcinoid), no urticaria/hypotension/anaphylactoid features (MCAS) |

**The item to push residents on is #2.** Alprazolam has a **short half-life and high potency**, an unfavorable combination that produces pronounced **interdose rebound**: as each dose falls off, sympathetic rebound generates symptoms indistinguishable from spontaneous panic. The patient interprets this as the disorder worsening, uses the drug more, and shortens the interval further. His symptom clustering in the **late morning and mid-afternoon** — plausible troughs after a morning dose — is the tell. His phrase *"I need it before it starts, or I can't stop it"* describes anticipatory dosing, which is the behavioral signature of a **safety behavior**, not of a treatment.

He is, in other words, on a subtherapeutic antidepressant and a rising dose of a drug that is now partly generating the symptom it was prescribed to treat.

**Q3. What is the mechanistic account of panic that makes interoceptive exposure a rational treatment rather than an arbitrary one?**

*Teaching point:* The dominant models are complementary rather than competing.

- **Interoceptive conditioning / fear-of-fear.** Benign somatic sensations become conditioned stimuli for a fear response through pairing with prior attacks. Hypervigilant interoceptive monitoring lowers the detection threshold, catastrophic appraisal amplifies the sympathetic response, and avoidance plus safety behaviors prevent extinction learning. In this patient, the conditioning has an obvious originating event — chest sensations acquired their meaning while he performed CPR on his dying father.
- **Suffocation false-alarm / CO₂ hypersensitivity.** Panic disorder is characterized by heightened sensitivity of a putative suffocation-monitoring system, evidenced by the reproducible panicogenic effect of CO₂ inhalation and sodium lactate infusion in patients but not controls — and by the observation that respiratory symptoms are prominent in a large subset.
- **Pharmacologic challenge as convergent evidence.** The **caffeine challenge** literature is the cleanest demonstration that this is a biologically distinct sensitivity, not a psychological artifact. A systematic review and meta-analysis of blinded placebo-controlled caffeine challenge studies found that at doses of roughly 400–750 mg, **panic attacks occurred in about half of patients with panic disorder (53.9%) versus 1.7% of healthy controls** (log RR 3.47, 95% CI 2.06–4.87), with a large between-group effect on subjective anxiety (Hedges' g = 1.02) [6]. Critically, **no patient panicked after placebo.** The authors note that the narrow dose range studied precludes conclusions about ordinary consumption, so counsel proportionately — the finding establishes mechanism far more strongly than it establishes a threshold.

The therapeutic corollary: if benign interoceptive cues have been conditioned into danger signals, then **repeated, deliberate, un-avoided elicitation of those cues** — hyperventilation, straw breathing, spinning, stair-running, and, for this patient especially, **graded aerobic exercise that raises his heart rate** — is the mechanistically correct intervention. Every PRN alprazolam taken at the first sensation blocks precisely that extinction learning.

**Q4. His sertraline has sat at 25 mg for fourteen months. Walk through the pharmacotherapy decision — and reconcile the two major network meta-analyses.**

*Teaching point:* **He has not had a failed SSRI trial. He has had no SSRI trial.** 25 mg of sertraline for fourteen months is a subtherapeutic dose held indefinitely; documenting this as "sertraline didn't work" would corrupt every subsequent treatment decision. The first move is **dose optimization**, not a switch and not an augmentation.

**Titration.** Escalate sertraline deliberately toward a therapeutic range (commonly 50–200 mg/day for panic disorder), in unhurried increments, with explicit anticipatory guidance about **early activation**. Panic patients are, by the mechanism in Q3, maximally primed to interpret SSRI-induced jitteriness as an attack; this is why the standard of care is to initiate at roughly half the usual starting dose and titrate slowly. Counsel that anti-panic response takes **weeks**.

**Reconciling the evidence base — a worthwhile exercise in reading NMAs.** Two large network meta-analyses address the same question and rank drugs differently:

- The **Cochrane NMA** (70 RCTs) found most agents superior to placebo for response, with **diazepam, alprazolam, and clonazepam ranking highest for response** and benzodiazepines ranking best for **acceptability** (lowest dropout). At the class level, TCAs ranked highest for response, then BDZs and MAOIs, with SSRIs fifth and SNRIs last — **but no statistically significant differences between classes**, and the authors explicitly caution that reliability is limited by **unclear or high risk of bias across multiple domains in all included studies**, with benzodiazepine-versus-placebo evidence rated **low quality** [1].
- The **BMJ NMA** (87 RCTs, 12,800 participants) examined **remission jointly with adverse events**, and concluded that **SSRIs deliver high remission with comparatively low adverse-event risk**, with **sertraline and escitalopram** best-placed among individual SSRIs. It also found TCAs, BDZs, and SSRIs all significantly associated with increased adverse events versus placebo (RR 1.79, 1.76, and 1.19 respectively), and rated its own evidence base moderate to very low certainty [2].

The apparent conflict resolves once you see that they optimize different objective functions. Cochrane ranks **short-term efficacy and trial dropout**; benzodiazepines look excellent on both — of course they do, they work within an hour and they are pleasant to take. The BMJ analysis ranks **remission against adverse events**, and it is over the longer horizon and the harms axis that SSRIs win. Neither analysis captures what matters most in panic disorder specifically: **tolerance, dependence, discontinuation difficulty, and the interference of PRN use with exposure-based learning** — none of which is a "dropout" event in a 8–12 week trial. Broader anxiety pharmacotherapy reviews accordingly continue to place SSRIs and SNRIs first-line [3].

**If optimized sertraline fails:** switch within class (escitalopram) or to venlafaxine XR; TCAs (clomipramine, imipramine) retain genuine efficacy in panic disorder and are a legitimate later-line option with ECG monitoring, anticholinergic burden, and overdose toxicity weighed explicitly; MAOIs remain effective but are rarely the practical next step. **Beta-blockers are not an answer** — a 2024 systematic review and meta-analysis found no evidence of benefit over placebo or benzodiazepines in panic disorder or social anxiety disorder, despite substantially increased prescribing [7].

**Q5. Construct the benzodiazepine plan. What are the failure modes?**

*Teaching point:* The plan is a **slow, negotiated, structured taper, sequenced correctly** — and the sequencing is where residents most often go wrong.

**Sequence.** Do **not** begin the taper before the SSRI is optimized and psychotherapy is engaged. Removing his only functioning coping tool while he is still on a subtherapeutic antidepressant and has no exposure skills is how tapers fail and how patients disengage from care.

**Structure.** Consider converting short-half-life alprazolam to an equivalent dose of a **longer-half-life agent (e.g., clonazepam or diazepam)** to flatten interdose troughs, then reduce gradually — conventionally on the order of 5–10% of the current dose every 1–2 weeks, slowing further at lower doses, with the patient holding a share of control over pace. Move from PRN to a **fixed schedule** before tapering: scheduled dosing severs the reinforcement loop between symptom onset and pill-taking, which is the behavioral core of the problem.

**Failure modes to name explicitly:**
- **Tapering too fast**, producing withdrawal that both patient and physician misread as relapse — leading to reinstatement and a patient now convinced they cannot live without the drug.
- **Tapering before the SSRI works.** Sequencing error; see above.
- **Leaving PRN dosing in place** during CBT, which silently converts exposure sessions into safety-behavior-assisted exposure and blocks extinction.
- **Framing the taper as withdrawal of something he needs**, rather than removal of something now generating his symptoms. The interdose-rebound formulation from Q2 is the single most persuasive thing you can offer him — it reframes the taper as treatment rather than deprivation.
- **Not addressing the nightly alcohol**, which is additive sedation, an independent anxiety amplifier via rebound, and a genuine safety concern in combination.

**Q6. What psychotherapy, delivered how — and what does the long-term outcome evidence actually support?**

*Teaching point:* **CBT with interoceptive exposure is first-line**, not adjunctive. In a meta-analysis of 41 randomized *placebo-controlled* trials across anxiety-related disorders, CBT showed moderate placebo-controlled effects on target symptoms (Hedges' g = 0.56), with smaller effects on comorbid anxiety, depression, and quality of life — and interventions built primarily on **exposure** outperformed those using cognitive techniques alone, though that difference did not reach significance [4]. Note honestly that in this analysis panic disorder was among the disorders with **small-to-moderate** effect sizes, and the authors concluded more effective treatments are still needed for PD.

Components for this patient: psychoeducation and the interdose-rebound formulation; interoceptive exposure targeting cardiac and respiratory sensations; **graded in-vivo exposure** to driving, to exercise, and to client-facing work; systematic elimination of safety behaviors — the PRN alprazolam taken at the first sensation, the avoidance of exercise, driving beyond town, and client-facing work, and any pulse-checking, safe-person accompaniment, or route-and-timing rituals uncovered on further history. If PTSD screening is positive, sequence trauma-focused work deliberately rather than running two protocols in parallel.

**The long-term nuance residents should carry.** A systematic review and meta-analysis of long-term CBT outcomes across 69 RCTs found benefits maintained versus control at post-treatment, 1–6 months, and 6–12 months for panic disorder (Hedges' g 0.22–0.35) — but at **follow-up of 12 months or more, the effect for panic disorder was no longer significant**, in contrast to sustained effects for GAD, social anxiety disorder, and PTSD [5]. Read that as a mandate for **maintenance strategy** — booster sessions, adequate pharmacotherapy duration before any discontinuation attempt, and relapse-prevention planning — not as evidence against CBT.

**Alternatives and adjuncts.** Acceptance- and mindfulness-based interventions (ACT, MBCT, MBSR) show short-term anxiolytic effects added to treatment as usual across DSM-5 anxiety disorders; compared head-to-head with CBT, **ACT and MBCT performed comparably while MBSR was significantly inferior**, with effects not significantly different from TAU or CBT at 6 and 12 months and considerable heterogeneity [11]. Reasonable as an adjunct or for a CBT-refusing patient; not a substitute for exposure. For the broader anxiety-disorder context, the GAD psychotherapy NMA similarly identifies CBT as the first-line psychotherapy with the most durable evidence [12].

**Q7. He denied suicidal ideation quickly and moved on. How hard do you press, and what does the epidemiology say?**

*Teaching point:* Press properly. **Panic disorder is an independent risk factor for suicide**, and the reflex to treat anxiety as low-acuity is not supported.

In a cohort drawn from Taiwan's National Health Insurance Research Database (171,737 individuals with panic disorder versus 686,948 matched comparisons, 2003–2017), panic disorder independently predicted **death by suicide (HR 1.85, 95% CI 1.59–2.14)** after adjustment for psychiatric comorbidity. Risk escalated sharply with comorbidity — **comorbid MDD carried the highest hazard (HR 6.08, 95% CI 5.48–6.74)**, followed by autism (4.52), schizophrenia (3.34), bipolar disorder (3.20), alcohol use disorder (2.99), substance use disorder (2.82), and OCD (2.10) [8].

A separate systematic review and meta-analysis of risk factors *within* panic disorder populations (12 studies, 1,958 participants) identified factors associated with **suicide attempt**: comorbid depression (ES 4.47), depressive symptoms (1.98), older age (1.66), **younger age at panic disorder onset** (0.65), and **history of alcohol dependence** (8.70, wide CI). Factors associated with **suicidal ideation** included depressive symptoms (2.29), anxiety symptoms (1.90), **longer illness duration** (3.31), comorbid depressive disorder (3.88), and **agoraphobia** (4.60) [9].

Map that onto this patient: fourteen months of illness, prominent avoidance consistent with agoraphobia, nightly alcohol use, an unscreened possible PTSD/grief syndrome, escalating benzodiazepine use, and functional contraction across work, driving, and exercise. **Several of the identified risk factors are present.** A rapid denial in a guarded patient with a repressive coping style — the very style described in the pseudopheochromocytoma literature [10] — is not reassurance.

**Practically:** screen formally for MDD and PTSD; quantify alcohol properly; ask about suicidal ideation directly, unhurriedly, and again at follow-up rather than only at intake. **If ideation emerges**, complete a structured risk assessment, and move to **collaborative safety planning** — warning signs, internal coping strategies, social contacts and settings that provide distraction and support, professional and crisis contacts, and reducing access to lethal means, with the alcohol and the benzodiazepine supply both addressed as part of that conversation. Escalate to your attending same-day and document reasoning and disposition.

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

---

### Workup & Management — the short version

**Workup — already sufficient; resist repeating it.** Metanephrines ×2 (one near-episode), 24-hour urinary fractionated metanephrines, CT abdomen/pelvis, echocardiogram, 48-hour Holter capturing two symptomatic episodes, TSH/free T4, CMP, CBC, HbA1c, UDS — all negative or normal. **Add instead:** formal PTSD and prolonged grief screening, structured depression screening, quantified alcohol history, orthostatic vitals, and a sleep history (OSA) given nocturnal attacks. Coordinate blood-pressure follow-up with the referring physician rather than re-opening the endocrine workup [10].

**Management ladder:**
1. **Deliver the formulation** — panic disorder with a pseudopheochromocytoma hemodynamic phenotype, amplified by benzodiazepine interdose rebound, anchored to a specific traumatic bereavement. This explanation is itself an intervention.
2. **Optimize sertraline** toward a therapeutic dose with slow titration and explicit activation counseling [2,3].
3. **Engage CBT with interoceptive exposure** now, in parallel with titration — including graded exercise and driving exposure [4].
4. **Then** convert alprazolam to a longer-half-life agent on a fixed schedule and taper slowly, with the patient sharing control of pace.
5. **Screen and treat comorbidity** — MDD, PTSD/prolonged grief, alcohol use.
6. **Assess suicide risk directly and repeatedly; safety-plan and escalate if ideation emerges** [8,9].
7. **Do not add a beta-blocker for the panic disorder** [7] — it has no anti-panic efficacy; whether the hypertensive paroxysms themselves warrant episodic antihypertensive cover is a decision shared with the hypertension specialist.
8. **Plan for maintenance** — adequate duration before any discontinuation attempt, booster CBT sessions, relapse-prevention plan, given the attenuation of CBT effects for panic disorder beyond 12 months [5].
9. **Close the loop with cardiology** in writing — the referral question deserves an actual answer.

---

### Facilitator Notes *(not for distribution to learners before the session)*

**Learning objectives.** Residents should be able to (1) recognize the pseudopheochromocytoma pattern and articulate why it does not exclude panic disorder; (2) identify benzodiazepine interdose withdrawal as an iatrogenic driver and cite the clinical tells; (3) explain the interoceptive-conditioning and CO₂-hypersensitivity models and derive interoceptive exposure from them; (4) distinguish an inadequate SSRI trial from a failed one; (5) reconcile the Cochrane and BMJ network meta-analyses by identifying their differing outcome hierarchies; (6) sequence SSRI optimization, psychotherapy, and benzodiazepine taper correctly; (7) apply panic-specific suicide-risk epidemiology to a guarded patient.

**Timing (~30 min).** Q1 4 min · Q2 6 min · Q3 4 min · Q4 6 min · Q5 4 min · Q6 3 min · Q7 3 min. If compressed, Q2, Q4, and Q5 carry the most transferable value.

**The three intended "clicks."**
1. **The alprazolam is generating symptoms.** Most groups reach for a taper on general principle; far fewer notice the late-morning/mid-afternoon clustering and connect it to trough timing. If nobody raises it, ask: *"Why late morning and mid-afternoon? What is his blood level doing then?"*
2. **This is not a failed SSRI trial.** Ask: *"Cardiology's note says he's on an antidepressant and still symptomatic. Do you agree he failed sertraline?"* Watch how many accept the framing before someone catches the dose.
3. **The father.** He reports it flatly and the group often glides past it, exactly as he did. If the case discussion reaches Q4 without anyone returning to it, stop and ask why the catastrophic cognition is specifically cardiac.

**Where residents predictably go wrong.**
- Re-ordering metanephrines because the BP spikes feel unresolved. Ask what a third normal result would change, and what the pre-test probability now is after two negatives and a negative CT.
- Switching or augmenting the antidepressant instead of titrating it.
- Tapering the benzodiazepine first, before the SSRI is optimized and CBT is running.
- Treating "denies SI" in a repressive-coping patient with several documented risk factors as an adequate assessment [9].
- Diagnosing PTSD reflexively from the trauma history without applying criteria — screen properly rather than assuming.

**Discussion extension if time allows.** The Cochrane and BMJ NMAs are an excellent 5-minute journal-club digression on why "which drug is best" is an ill-posed question absent a specified outcome, time horizon, and harm weighting — and on how **high risk-of-bias ratings across an entire literature** should temper confident ranking claims [1,2].

**Safety framing.** Keep Q7 oriented to recognition, structured assessment, escalation, and collaborative safety planning. Redirect any real-patient details a participant introduces; identifiable information does not belong in teaching materials.

**Attribution.** Literature retrieved from PubMed; all citations verified against PubMed metadata. Where evidence quality is low or certainty limited, the text says so — model that qualification for the group.

---

### References

Based on articles retrieved from PubMed.

1. Guaiana G, Meader N, Barbui C, Davies SJC, Furukawa TA, Imai H, Dias S, Caldwell DM, Koesters M, Tajika A, Bighelli I, Pompoli A, Cipriani A, Dawson S, Robertson L. Pharmacological treatments in panic disorder in adults: a network meta-analysis. *Cochrane Database of Systematic Reviews*. 2023;11(11):CD012729. [https://doi.org/10.1002/14651858.CD012729.pub3](https://doi.org/10.1002/14651858.CD012729.pub3)

2. Chawla N, Anothaisintawee T, Charoenrungrueangchai K, Thaipisuttikul P, McKay GJ, Attia J, Thakkinstian A. Drug treatment for panic disorder with or without agoraphobia: systematic review and network meta-analysis of randomised controlled trials. *BMJ*. 2022;376:e066084. [https://doi.org/10.1136/bmj-2021-066084](https://doi.org/10.1136/bmj-2021-066084)

3. O'Leary KB, Khan JS. Pharmacotherapy for anxiety disorders. *Psychiatric Clinics of North America*. 2024;47(4):689–709. [https://doi.org/10.1016/j.psc.2024.04.012](https://doi.org/10.1016/j.psc.2024.04.012)

4. Carpenter JK, Andrews LA, Witcraft SM, Powers MB, Smits JAJ, Hofmann SG. Cognitive behavioral therapy for anxiety and related disorders: a meta-analysis of randomized placebo-controlled trials. *Depression and Anxiety*. 2018;35(6):502–514. [https://doi.org/10.1002/da.22728](https://doi.org/10.1002/da.22728)

5. van Dis EAM, van Veen SC, Hagenaars MA, Batelaan NM, Bockting CLH, van den Heuvel RM, Cuijpers P, Engelhard IM. Long-term outcomes of cognitive behavioral therapy for anxiety-related disorders: a systematic review and meta-analysis. *JAMA Psychiatry*. 2020;77(3):265–273. [https://doi.org/10.1001/jamapsychiatry.2019.3986](https://doi.org/10.1001/jamapsychiatry.2019.3986)

6. Klevebrant L, Frick A. Effects of caffeine on anxiety and panic attacks in patients with panic disorder: a systematic review and meta-analysis. *General Hospital Psychiatry*. 2022;74:22–31. [https://doi.org/10.1016/j.genhosppsych.2021.11.005](https://doi.org/10.1016/j.genhosppsych.2021.11.005)

7. Archer C, Wiles N, Kessler D, Turner K, Caldwell DM. Beta-blockers for the treatment of anxiety disorders: a systematic review and meta-analysis. *Journal of Affective Disorders*. 2025;368:90–99. [https://doi.org/10.1016/j.jad.2024.09.068](https://doi.org/10.1016/j.jad.2024.09.068)

8. Tsai SJ, Cheng CM, Chang WH, Bai YM, Su TP, Chen TJ, Chen MH. Panic disorder and suicide. *Psychological Medicine*. 2025;55:e38. [https://doi.org/10.1017/S0033291724003441](https://doi.org/10.1017/S0033291724003441)

9. Tietbohl-Santos B, Chiamenti P, Librenza-Garcia D, Cassidy R, Zimerman A, Manfro GG, Kapczinski F, Passos IC. Risk factors for suicidality in patients with panic disorder: a systematic review and meta-analysis. *Neuroscience and Biobehavioral Reviews*. 2019;105:34–38. [https://doi.org/10.1016/j.neubiorev.2019.07.022](https://doi.org/10.1016/j.neubiorev.2019.07.022)

10. Mamilla D, Gonzales MK, Esler MD, Pacak K. Pseudopheochromocytoma. *Endocrinology and Metabolism Clinics of North America*. 2019;48(4):751–764. [https://doi.org/10.1016/j.ecl.2019.08.004](https://doi.org/10.1016/j.ecl.2019.08.004)

11. Haller H, Breilmann P, Schröter M, Dobos G, Cramer H. A systematic review and meta-analysis of acceptance- and mindfulness-based interventions for DSM-5 anxiety disorders. *Scientific Reports*. 2021;11(1):20385. [https://doi.org/10.1038/s41598-021-99882-w](https://doi.org/10.1038/s41598-021-99882-w)

12. Papola D, Miguel C, Mazzaglia M, Franco P, Tedeschi F, Romero SA, Patel AR, Ostuzzi G, Gastaldon C, Karyotaki E, Harrer M, Purgato M, Sijbrandij M, Patel V, Furukawa TA, Cuijpers P, Barbui C. Psychotherapies for generalized anxiety disorder in adults: a systematic review and network meta-analysis of randomized clinical trials. *JAMA Psychiatry*. 2024;81(3):250–259. [https://doi.org/10.1001/jamapsychiatry.2023.3971](https://doi.org/10.1001/jamapsychiatry.2023.3971)

---

*Educational teaching case. Fictional composite; no protected health information. Pending faculty attestation.*

*Joshua Moss, MD | Psychiatrist*
