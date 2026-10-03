# Faculty decisions — pharmacy drafts, 2026-10-03

Educational authoring for Joshua Moss, MD to review. No patient-specific advice, faculty signature, clinical promotion, rights change or publication approval is recorded here. Base: `15433fa`. Registry before: 45 records, five reviewed, 40 pending. After: 51 records, five reviewed, 46 pending. The ten priority records' clinical text and review blocks are unchanged. Six new records are pending/high safety; all their J fields are explicitly declared newly authored. The five reviewed records remain unchanged.

Review in the order below. For each existing card, decide whether its clinical fields are acceptable, resolve the named qualifications, and independently approve its ask-to-field mapping through the faculty console. For each new card, approve or revise every authored field and the mapping. This PR does not record those decisions.

## Exact clinical decisions for Josh

| Priority | Card | Decision required before sign-off |
|---|---|---|
| 1 | valproate | Confirm pregnancy counseling/avoidance language and product-specific indications. Add or explicitly accept omissions of POLG-related mitochondrial disease and urea-cycle-disorder contraindications, hepatic disease and pancreatitis warnings. Assess thrombocytopenia/coagulation monitoring and carbapenem interactions. The card spans divalproex, liquid and IV products; the selected label alone does not cover all of them. |
| 2 | lorazepam | Confirm catatonia/withdrawal uses as off-label against the selected oral anxiety label. Qualify the claim that glucuronidation is preserved in cirrhosis: hepatic encephalopathy and severe hepatic insufficiency still require caution. Decide whether to add dependence/withdrawal taper planning and valproate/probenecid interactions. Distinguish oral from injectable and sublingual use. |
| 3 | buprenorphine | Confirm that this ingredient card intentionally uses a buprenorphine/naloxone sublingual film label; it does not establish LAI labeling. Approve the induction wording for fentanyl and the separate off-label pathways. Add or explicitly accept omissions of respiratory monitoring, hepatic risk and the instruction not to categorically deny MOUD solely because benzodiazepines are present. |
| 4 | naltrexone | Resolve oral versus VIVITROL scope: the configured brand is VIVITROL but the verifier's default ORAL selection chooses an oral generic label. Do not attribute injectable labeling to that receipt. Review prolonged precipitated withdrawal after buprenorphine/methadone, overdose vulnerability after discontinuation or missed injections, and hepatic monitoring/contraindications for the intended product. |
| 5 | risperidone | Qualify “bloodMonitoring: No” and “ekgRequired: No” as no universal routine requirement, not exemptions from metabolic or risk-based monitoring. Review renal/hepatic adjustment, prolactin and CYP2D6/inducer interactions; LAI instructions require the specific product label. |
| 6 | quetiapine | Resolve the unsupported blanket “IR and XR are not interchangeable one-for-one”: selected immediate-release labeling does not establish an XR conversion rule, and XR requires its own label. Separate adjunct MDD/XR indication from the selected SEROQUEL label. Review CYP3A4 adjustments, orthostasis, falls and QT risk; qualify binary monitoring flags. |
| 7 | aripiprazole | Confirm akathisia assessment and add or explicitly accept omission of pathological gambling/other compulsive behaviors. Review CYP2D6/CYP3A4 adjustments and product-specific LAI initiation. Reassess the comparative metabolic and weight-management pearls against their cited evidence. |
| 8 | bupropion | Revise or justify the absolute “No sexual side effects or weight gain”; it is a comparative tendency, not a guarantee. Qualify the blanket IR/SR/XL non-interchangeability claim against the intended product's conversion instructions. Review seizure/eating-disorder/withdrawal contraindications, hypertension, CYP2D6 inhibition and renal/hepatic adjustment. |
| 9 | escitalopram | Reassess the superlative “safest SSRI” interaction pearl. Qualify QT, electrolyte, bleeding and age-based monitoring instead of treating “EKG required: No” as universal. Confirm age/formulation labeling, mania screening, hyponatremia and tapering. |
| 10 | mirtazapine | Confirm or revise the asserted lower-dose sedation relationship; it is not established by the selected label. Review weight/lipid monitoring, rare neutropenia/agranulocytosis, QT-risk circumstances and renal/hepatic clearance. |
| New | buspirone | Approve scheduled anxiety role and delayed benefit wording; confirm it does not replace a benzodiazepine withdrawal plan. Approve CYP3A4/MAOI/serotonin-syndrome and severe renal/hepatic cautions. |
| New | fluvoxamine | Approve adult ER-reference scope without implying ER pediatric approval. Confirm IR versus ER distinctions, complete contraindicated combinations, clozapine/TCA interactions, suicidality and serotonin-syndrome wording. |
| New | clomipramine | Approve specialist OCD framing, overdose-risk quantities, cardiac/seizure monitoring and CYP2D6/1A2 interaction wording. Decide whether risk-based ECG assessment and plasma levels need more explicit wording. |
| New | naloxone | Approve selected nasal OTC rescue-device scope and emergency-response wording. No parenteral dosing or automatic extension to other devices is implied. Confirm product-instruction teach-back and overdose recurrence warnings. |
| New | valbenazine | Confirm TD diagnosis and separate TD from Huntington chorea. Preserve Huntington-specific boxed-warning scope. Approve QT-risk assessment, CYP adjustments, NMS/angioedema/parkinsonism monitoring and formulation cautions. |
| New | deutetrabenazine | Preserve Huntington-specific suicidality/depression contraindication and boxed warning. Approve hepatic contraindication, prohibited VMAT2 combinations/MAOIs/reserpine, CYP2D6 restrictions and formulation-specific food instructions. |

## Source coverage and limitations

Every selected FDA JSON label was retrieved directly and compared independently with DailyMed SPL XML for set ID and effective date; boxed-warning presence was checked from FDA label content. See `independent-label-check.json` for all 16 URLs and document digests. Direct selected-label checks were completed on 2026-10-03; digests are retrieval evidence, never faculty signatures. All 16 full multi-label agreement refreshes completed without recorded problems. Full multi-label agreement counts are separately recorded by the repository's existing receipt pipeline with each entry's own `verifiedOn` (2026-10-02, the Mac's local date during the 2026-10-03 UTC session). Do not infer a current full-inventory check from a direct selected-label check.

New-card clinical summaries are authored paraphrases of the selected label's indications, clinical pharmacology, contraindications, warnings, precautions, adverse reactions, interactions, specific populations, patient counseling and formulation instructions. Baseline monitoring and emergency “first move” choices add clinical judgment; their label anchor does not attest them. The local source matrix below identifies the sections for faculty comparison. FDA label text does not validate comparative efficacy claims. Existing cards retain their stored attested-page/ReConnect provenance; a matching quote proves transcription, not that a clinical assertion remains current or correctly qualified.

Evidence links: naloxone links `samhsa-tip63-2021` and `asam-oud-2020`. Other new cards have no fabricated evidence IDs. Question links: naloxone → `qb_sud_008`; fluvoxamine/clomipramine → `qb_anx_014` (broad OCD treatment, not a drug-specific efficacy endorsement). Buspirone and the VMAT2 agents have no matching drug-specific question. The only interaction-card IDs available are lithium, clozapine and lamotrigine; empty new-card lists are intentional. Monitoring references resolve to `med_monitoring.md` or `t_sud.md` as general teaching context, not a claim those pages attest each new drug. No new handout or perinatal snapshot is invented.

Family explainers pass the repository's heuristic Flesch–Kincaid check below grade eight (2.0–4.2); this is a readability calculation, not user testing. No numeric medication doses are added. Detailed raw labels stay in local scratch storage because they contain numeric doses; use the authoritative linked labels for clinical review.

## New-card field-to-label matrix

| Clinical fields | Selected-label sections | Faculty judgment beyond the label |
|---|---|---|
| mechanism, class | Clinical pharmacology / mechanism of action | Educational simplification and drug-class grouping |
| fdaIndications, boxedWarning | Indications and usage; boxed warning | Product/formulation scope must remain explicit |
| inpatientUses | Indications; counseling | Inpatient relevance, specialist framing and treatment context |
| dosing (qualitative) | Dosage and administration; specific populations; instructions for use | Selection, pacing, medication reconciliation and pharmacy escalation |
| monitoring | Warnings/precautions; interactions; specific populations | What to assess at baseline versus follow-up |
| adverseEffects | Adverse reactions; warnings/precautions | Recognition language and urgent escalation |
| interactions | Contraindications; drug interactions; clinical pharmacology | Which traps to prioritize and when to involve pharmacy |
| familyExplainer | Patient counseling / medication guide / instructions for use | Plain-language selection and teach-back wording |
| attendingAsks / retrieval | Corresponding classified card fields | Educational question and reveal mapping, separately pending |

# Pharmacy review packet

Records: risperidone, quetiapine, aripiprazole, valproate, lorazepam, escitalopram, bupropion, mirtazapine, buprenorphine, naltrexone, buspirone, fluvoxamine, clomipramine, naloxone, valbenazine, deutetrabenazine. The offline validator checks stored quote matching, reference resolution, receipt parity, authored-field coverage and readability. It does not attest clinical correctness or prove that every cited page is currently faculty-attested.

---

## risperidone (risperidone)

Safety level **high** · review status **pending** · J-field hash `3936559e5e53`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Atypical Antipsychotic | second-generation antipsychotic | Card uses a more specific class term — reviewer to confirm. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `inpatientUses[0]`, `interactions.cyp`, `mechanism.t1`, `pearls.t1[0]`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 35636 (risperidone, IN) |
| Reference label | [RISPERDAL · 2026-05-28](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7e117c7e-02fc-4343-92a1-230061dfc5e0) — Janssen Pharmaceuticals, Inc., chosen by referenceBrand |
| Boxed warning | present on reference; 69 of 70 matched labels carry one |
| Brands seen in openFDA | RISPERDAL; RISPERDAL CONSTA; RISPERDAL M-TAB; Rykindo extended-release microspheres |

> **Label indications (lead):** 1 INDICATIONS AND USAGE RISPERDAL is an atypical antipsychotic indicated for: Treatment of schizophrenia ( 1.1 ) As monotherapy or adjunctive therapy with lithium or valproate, for the treatment of acute manic or mixed episodes associated with Bipolar I Disorder ( 1.2 ) Treatment of irritability associated with autistic disorder ( 1.3 ) 1.1 Schizophrenia RISPERDAL (risperidone) is indicated for the treatment of schizophrenia. Efficacy was established in 4 short-term trials in adults, 2 short-term trials in adolescents (ages 13 to 17 years), and one long-term maintenance trial in adults [see Clinical Studies (14.1) ] . 1.2 Bipolar Mania Monotherapy RISPERDAL is indicated for the treatment of acute manic or mixed episodes associated with Bipolar I Disorder. Efficacy was established in 2 short-term trials in adults and one short-term trial in children and adolescents (ages 10 to 17 years) [

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | EPS; Hyperprolactinemia; Sedation; Weight Gain; Orthostatic Hypotension | *reconnect:common_side_effects*: “EPS; Hyperprolactinemia; Sedation; Weight Gain; Orthostatic Hypotension” |
| `adverseEffects.dangerous` | J | **Neuroleptic malignant syndrome** — recognize: Neuroleptic malignant syndrome: "lead-pipe" rigidity, hyperthermia, and elevated CK in someone on a dopamine blocker — slower and stiffer than serotonin syndrome.; firstMove: Tell the senior now; stop the antipsychotic pending evaluation.<br>**Hyperprolactinemia** — recognize: Galactorrhea, amenorrhea, sexual dysfunction.; firstMove: Check prolactin if symptomatic; consider a prolactin-sparing agent. | *psychopharmacology_primer_inpatient.md*: “*Neuroleptic malignant syndrome:* "lead-pipe" rigidity, hyperthermia, and elevated CK in someone on a dopamine blocker — slower and stiffer than serotonin syndrome.”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize` |
| `attendingAsks` | J | Which lab would you send for galactorrhea on risperidone?; Which co-medications raise risperidone exposure?; What metabolic monitoring is due? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Increased mortality in elderly patients with dementia-related psychosis. | label receipt |
| `brands` | L | Risperdal; Risperdal M-Tab; Risperdal Consta | label receipt |
| `class` | R | second-generation antipsychotic | ReConnect (hash-pinned) |
| `dailymedSetId` | L | 7e117c7e-02fc-4343-92a1-230061dfc5e0 | label receipt |
| `dosing.forms` | J | PO; ODT; liquid; LAI | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7e117c7e-02fc-4343-92a1-230061dfc5e0 | label receipt |
| `dosing.titration` | J | Titrate over days; ODT, liquid, and several long-acting injectable forms exist. Confirm dose with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.handoutRef` | R | FH-MED03 | ReConnect (hash-pinned) |
| `familyExplainer.text` | J | Risperidone treats psychosis, mania, and some kinds of irritability. It can raise a hormone called prolactin, which can cause breast changes or missed periods. It can also cause weight gain. The team will check weight and blood tests. | *reconnect:counseling*: “Can cause movement problems and elevated prolactin. Women: report missed periods, breast discharge. LAI available.”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Schizophrenia; Bipolar I: acute manic or mixed episodes (monotherapy or with lithium/valproate); Irritability associated with autistic disorder | label receipt |
| `flags` | R | qtcRisk: Low<br>weightImpact: Moderate Gain<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | risperidone | label receipt |
| `inpatientUses` | J | **Psychosis and mania** — offLabel: False; evidenceIds: []<br>**Autism-associated irritability (not the core features)** — offLabel: False; evidenceIds: [] | *neurodevelopmental_disorders_inpatient_teaching.md*: “- Antipsychotics (risperidone, aripiprazole) treat autism-*associated* irritability, not the core social-communication features.”<br>**authored:** `inpatientUses[0]` |
| `interactions.cyp` | J | substrateOf: 2D6 | *reconnect:cyp_pathways*: “2D6 substrate”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Fluoxetine and paroxetine are potent CYP2D6 inhibitors; fluvoxamine is a potent CYP1A2 and CYP2C19 inhibitor.; CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline. | *rounds_questions.md*: “- **Answer:** Fluoxetine and paroxetine are potent CYP2D6 inhibitors; fluvoxamine is a potent CYP1A2 and CYP2C19 inhibitor.”<br>*rounds_questions.md*: “- **Evidence:** CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline.” |
| `labelVersionDate` | L | 2026-05-28 | label receipt |
| `mechanism.t1` | J | D2 and 5-HT2A antagonist; behaves like a high-potency agent at higher doses. | *reconnect:mechanism_of_action*: “D2 antagonist; 5-HT2A antagonist”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: Weight/BMI and waist; Fasting glucose or A1c; Lipids; Blood pressure<br>ongoing: Glucose/lipids at ~12 weeks then annually; Weight each visit; AIMS for tardive dyskinesia; Prolactin if symptomatic<br>sourcePage: med_monitoring.md | *medication_monitoring_inpatient_teaching.md*: “\| **Antipsychotics (metabolic)** \| Weight/BMI, waist, fasting glucose/A1c, lipids, blood pressure \| Glucose/lipids at ~12 weeks then annually; weight each visit; AIMS for tardive dyskinesia \|” |
| `pearls` | J | t1: Among second-generation agents, risperidone raises prolactin most.; Baseline and ongoing metabolic monitoring is part of prescribing an antipsychotic, not optional.<br>t2: CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline. | *medication_monitoring_inpatient_teaching.md*: “Baseline and ongoing metabolic monitoring is part of prescribing an antipsychotic, not optional.”<br>*rounds_questions.md*: “- **Evidence:** CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline.”<br>**authored:** `pearls.t1[0]` |
| `pk` | R | halfLifeHours: 20<br>timeToEffect: 1-2 weeks | ReConnect (hash-pinned) |
| `rxcui` | L | 35636 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| Which lab would you send for galactorrhea on risperidone? | `adverseEffects.dangerous[1]`, `monitoring.ongoing[3]` | name: Hyperprolactinemia<br>recognize: Galactorrhea, amenorrhea, sexual dysfunction.<br>firstMove: Check prolactin if symptomatic; consider a prolactin-sparing agent.<br>Prolactin if symptomatic |
| Which co-medications raise risperidone exposure? | `interactions.keyTraps` | Fluoxetine and paroxetine are potent CYP2D6 inhibitors; fluvoxamine is a potent CYP1A2 and CYP2C19 inhibitor.; CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline. |
| What metabolic monitoring is due? | `monitoring.ongoing` | Glucose/lipids at ~12 weeks then annually; Weight each visit; AIMS for tardive dyskinesia; Prolactin if symptomatic |

Mapping hash `5da45b0d6493` · pending

Linked: evidence lieberman-2005-catie · questions qb_pha_004

---

## quetiapine (quetiapine)

Safety level **high** · review status **pending** · J-field hash `414faad4196b`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Atypical Antipsychotic | second-generation antipsychotic | Card uses a more specific class term — reviewer to confirm. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `interactions.cyp`, `interactions.keyTraps[0]`, `interactions.keyTraps[1]`, `mechanism.t1`, `pearls.t2[0]`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 51272 (quetiapine, IN) |
| Reference label | [SEROQUEL · 2026-04-10](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ae62aaf-f8c5-417f-baac-0098369ca322) — H2-Pharma, LLC, chosen by referenceBrand |
| Boxed warning | present on reference; 98 of 100 matched labels carry one |
| Brands seen in openFDA | SEROQUEL; SEROQUEL XR |

> **Label indications (lead):** 1 INDICATIONS AND USAGE SEROQUEL is an atypical antipsychotic indicated for the treatment of: • Schizophrenia ( 1.1 ) • Bipolar I disorder manic episodes (1.2) • Bipolar disorder, depressive episodes (1.2) 1.1 Schizophrenia SEROQUEL is indicated for the treatment of schizophrenia. The efficacy of SEROQUEL in schizophrenia was established in three 6-week trials in adults and one 6-week trial in adolescents (13-17 years). The effectiveness of SEROQUEL for the maintenance treatment of schizophrenia has not been systematically evaluated in controlled clinical trials [see Clinical Studies (14.1) ]. 1.2 Bipolar Disorder SEROQUEL is indicated for the acute treatment of manic episodes associated with bipolar I disorder, both as monotherapy and as an adjunct to lithium or divalproex. Efficacy was established in two 12-week monotherapy trials in adults, in one 3-week adjunctive trial in adults, an

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Sedation; Orthostatic Hypotension; Weight Gain; Dry Mouth; Dizziness | *reconnect:common_side_effects*: “Sedation; Orthostatic Hypotension; Weight Gain; Dry Mouth; Dizziness” |
| `adverseEffects.dangerous` | J | **Neuroleptic malignant syndrome** — recognize: Neuroleptic malignant syndrome: "lead-pipe" rigidity, hyperthermia, and elevated CK in someone on a dopamine blocker — slower and stiffer than serotonin syndrome.; firstMove: Tell the senior now; stop the antipsychotic pending evaluation.<br>**Orthostatic hypotension and sedation** — recognize: Dizziness, falls, oversedation, especially early in titration.; firstMove: Orthostatic vitals; fall precautions. | *psychopharmacology_primer_inpatient.md*: “*Neuroleptic malignant syndrome:* "lead-pipe" rigidity, hyperthermia, and elevated CK in someone on a dopamine blocker — slower and stiffer than serotonin syndrome.”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize` |
| `attendingAsks` | J | Which mood stabilizers prevent both poles?; Why might you switch to quetiapine for akathisia?; What is the problem with quetiapine for sleep? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Increased mortality in elderly patients with dementia-related psychosis. Also carries the antidepressant suicidality warning (pediatric and young adult patients). | label receipt |
| `brands` | L | Seroquel; Seroquel XR | label receipt |
| `class` | R | second-generation antipsychotic | ReConnect (hash-pinned) |
| `dailymedSetId` | L | 8ae62aaf-f8c5-417f-baac-0098369ca322 | label receipt |
| `dosing.forms` | J | PO; ER | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8ae62aaf-f8c5-417f-baac-0098369ca322 | label receipt |
| `dosing.titration` | J | Titrate over several days for sedation and orthostasis; IR and XR are not interchangeable one-for-one. Confirm dose with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.handoutRef` | R | FH-MED03 | ReConnect (hash-pinned) |
| `familyExplainer.text` | J | Quetiapine treats bipolar disorder, depression, and psychosis. It is very sedating and can make people dizzy when they stand. It can also cause weight gain and raise blood sugar. The team will check weight and blood tests. | *reconnect:counseling*: “Very sedating - take at bedtime. Causes weight gain. Monitor blood sugar. Report vision changes. XR for once daily dosing.”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Schizophrenia; Bipolar I: manic episodes; Bipolar depression; XR: adjunct in major depressive disorder | label receipt |
| `flags` | R | qtcRisk: Low<br>weightImpact: Moderate Gain<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | quetiapine | label receipt |
| `inpatientUses` | J | **Bipolar depression and maintenance (prevents both poles)** — offLabel: False; evidenceIds: []<br>**Switch option when akathisia or EPS limit another agent** — offLabel: False; evidenceIds: [] | *rounds_questions.md*: “- **Pearl:** Match the mood stabilizer to the **polarity** — lithium and quetiapine prevent both poles; lamotrigine prevents depression; valproate and carbamazepine are better for mania.”<br>*anxiety_trauma_ocd_inpatient_teaching.md*: “First step: **reduce the antipsychotic dose or switch to a lower-dopamine-affinity agent** (e.g., quetiapine, which has lower D2 occupancy at clinical doses)” |
| `interactions.cyp` | J | substrateOf: 3A4 | *reconnect:cyp_pathways*: “3A4 substrate”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Strong CYP3A4 inhibitors or inducers; Other sedating or QT-prolonging agents | **authored:** `interactions.keyTraps[0]`, `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2026-04-10 | label receipt |
| `mechanism.t1` | J | Low D2 occupancy with strong H1 and α1 antagonism; its metabolite norquetiapine inhibits norepinephrine reuptake. | *reconnect:mechanism_of_action*: “D2 antagonist; 5-HT2A antagonist; H1 antagonist; alpha-1 antagonist”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: Weight/BMI and waist; Fasting glucose or A1c; Lipids; Blood pressure<br>ongoing: Glucose/lipids at ~12 weeks then annually; Weight each visit; AIMS for tardive dyskinesia<br>sourcePage: med_monitoring.md | *medication_monitoring_inpatient_teaching.md*: “\| **Antipsychotics (metabolic)** \| Weight/BMI, waist, fasting glucose/A1c, lipids, blood pressure \| Glucose/lipids at ~12 weeks then annually; weight each visit; AIMS for tardive dyskinesia \|” |
| `pearls` | J | t1: Match the mood stabilizer to the polarity — lithium and quetiapine prevent both poles; lamotrigine prevents depression; valproate and carbamazepine are better for mania.<br>t2: Low-dose quetiapine for sleep carries the full metabolic and fall risk without an antipsychotic indication — question it at reconciliation. | *rounds_questions.md*: “- **Pearl:** Match the mood stabilizer to the **polarity** — lithium and quetiapine prevent both poles; lamotrigine prevents depression; valproate and carbamazepine are better for mania.”<br>**authored:** `pearls.t2[0]` |
| `pk` | R | halfLifeHours: 7<br>timeToEffect: Days (sedation/sleep); 1-2 weeks (psychosis) | ReConnect (hash-pinned) |
| `rxcui` | L | 51272 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| Which mood stabilizers prevent both poles? | `pearls.t1[0]` | Match the mood stabilizer to the polarity — lithium and quetiapine prevent both poles; lamotrigine prevents depression; valproate and carbamazepine are better for mania. |
| Why might you switch to quetiapine for akathisia? | `inpatientUses[1].use` | Switch option when akathisia or EPS limit another agent |
| What is the problem with quetiapine for sleep? | `pearls.t2[0]` | Low-dose quetiapine for sleep carries the full metabolic and fall risk without an antipsychotic indication — question it at reconciliation. |

Mapping hash `1e237b2aee60` · pending

Linked: evidence lieberman-2005-catie · questions qb_pha_003

---

## aripiprazole (aripiprazole)

Safety level **high** · review status **pending** · J-field hash `f5ef8f401b5e`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Atypical Antipsychotic | second-generation antipsychotic (D2 partial agonist) | Card uses a more specific class term — reviewer to confirm. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `adverseEffects.dangerous[2].firstMove`, `adverseEffects.dangerous[2].recognize`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `inpatientUses[1]`, `interactions.cyp`, `interactions.keyTraps[1]`, `mechanism.t1`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 89013 (aripiprazole, IN) |
| Reference label | [ABILIFY · 2025-01-29](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c040bd1d-45b7-49f2-93ea-aed7220b30ac) — Otsuka America Pharmaceutical, Inc., chosen by referenceBrand |
| Boxed warning | present on reference; 114 of 115 matched labels carry one |
| Brands seen in openFDA | ABILIFY; Abilify Asimtufii; ABILIFY MAINTENA; OPIPZA |

> **Label indications (lead):** 1 INDICATIONS AND USAGE ABILIFY (aripiprazole) Tablets are indicated for the treatment of: Schizophrenia Acute Treatment of Manic and Mixed Episodes associated with Bipolar I Disorder Adjunctive Treatment of Major Depressive Disorder Irritability Associated with Autistic Disorder Treatment of Tourette's Disorder ABILIFY is an atypical antipsychotic. ABILIFY is indicated for: Schizophrenia ( 14.1 ) Acute Treatment of Manic and Mixed Episodes associated with Bipolar I Disorder ( 14.2 ) Adjunctive Treatment of Major Depressive Disorder ( 14.3 ) Irritability Associated with Autistic Disorder ( 14.4 ) Treatment of Tourette's Disorder ( 14.5 )

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Akathisia; Restlessness; Insomnia; Nausea; Headache | *reconnect:common_side_effects*: “Akathisia; Restlessness; Insomnia; Nausea; Headache” |
| `adverseEffects.dangerous` | J | **Neuroleptic malignant syndrome** — recognize: Neuroleptic malignant syndrome: "lead-pipe" rigidity, hyperthermia, and elevated CK in someone on a dopamine blocker — slower and stiffer than serotonin syndrome.; firstMove: Tell the senior now; stop the antipsychotic pending evaluation.<br>**Akathisia** — recognize: Inner restlessness, often early — the most common reason it is stopped.; firstMove: Reduce dose or switch before adding drugs.<br>**Impulse-control problems** — recognize: New gambling, spending, or other compulsive urges.; firstMove: Ask directly; report to the team. | *psychopharmacology_primer_inpatient.md*: “*Neuroleptic malignant syndrome:* "lead-pipe" rigidity, hyperthermia, and elevated CK in someone on a dopamine blocker — slower and stiffer than serotonin syndrome.”<br>*anxiety_trauma_ocd_inpatient_teaching.md*: “Akathisia management hierarchy: reduce dose or switch the antipsychotic → **propranolol** (first-line by consensus; thin trial evidence, Lima et al. Cochrane 2004) → benztropine if co-existing parkinsonism → benzodiazepi”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `adverseEffects.dangerous[2].firstMove`, `adverseEffects.dangerous[2].recognize` |
| `attendingAsks` | J | What side effect most often limits aripiprazole early?; Where does aripiprazole sit on metabolic risk?; What would you do before adding metformin for weight gain? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Increased mortality in elderly patients with dementia-related psychosis. Also carries the antidepressant suicidality warning (pediatric and young adult patients). | label receipt |
| `brands` | L | Abilify; Abilify Maintena; Abilify Asimtufii | label receipt |
| `class` | R | second-generation antipsychotic (D2 partial agonist) | ReConnect (hash-pinned) |
| `dailymedSetId` | L | c040bd1d-45b7-49f2-93ea-aed7220b30ac | label receipt |
| `dosing.forms` | J | PO; ODT; liquid; LAI | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c040bd1d-45b7-49f2-93ea-aed7220b30ac | label receipt |
| `dosing.titration` | J | Long half-life: changes take about two weeks to reach steady state. LAIs require oral overlap or a loading strategy. Confirm with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.handoutRef` | R | FH-MED03 | ReConnect (hash-pinned) |
| `familyExplainer.text` | J | Aripiprazole treats psychosis, bipolar disorder, and depression. It causes less weight gain than many similar drugs. It can cause a strong restless feeling. Tell the team about restlessness. Also tell them about new urges to gamble or spend. | *reconnect:counseling*: “Weight-neutral antipsychotic. Watch for restlessness/akathisia. Report any compulsive behaviors (gambling, shopping). LAI available.”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Schizophrenia; Bipolar I: acute manic and mixed episodes; Adjunct in major depressive disorder; Irritability associated with autistic disorder; Tourette's disorder | label receipt |
| `flags` | R | qtcRisk: Minimal<br>weightImpact: Mild Gain<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | aripiprazole | label receipt |
| `inpatientUses` | J | **Psychosis or mania when metabolic risk matters** — offLabel: False; evidenceIds: []<br>**Antidepressant augmentation** — offLabel: False; evidenceIds: [] | *rounds_questions.md*: “- **Pearl:** If a patient gains >7% body weight on an antipsychotic, consider switching to a lower-risk agent (aripiprazole, ziprasidone, lurasidone) before adding metformin.”<br>**authored:** `inpatientUses[1]` |
| `interactions.cyp` | J | substrateOf: 2D6; 3A4 | *reconnect:cyp_pathways*: “2D6 substrate; 3A4 substrate”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline.; Strong CYP2D6 or 3A4 inhibitors raise levels | *rounds_questions.md*: “- **Evidence:** CYP2D6 and CYP2C19 poor/intermediate metabolizer status significantly affects exposure to aripiprazole, haloperidol, risperidone, escitalopram, and sertraline.”<br>**authored:** `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2025-01-29 | label receipt |
| `mechanism.t1` | J | D2 partial agonist and 5-HT1A partial agonist; 5-HT2A antagonist. | *reconnect:mechanism_of_action*: “Dopamine D2 partial agonist; 5-HT1A partial agonist; 5-HT2A antagonist”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: Weight/BMI and waist; Fasting glucose or A1c; Lipids; Blood pressure<br>ongoing: Glucose/lipids at ~12 weeks then annually; Weight each visit; AIMS for tardive dyskinesia<br>sourcePage: med_monitoring.md | *medication_monitoring_inpatient_teaching.md*: “\| **Antipsychotics (metabolic)** \| Weight/BMI, waist, fasting glucose/A1c, lipids, blood pressure \| Glucose/lipids at ~12 weeks then annually; weight each visit; AIMS for tardive dyskinesia \|” |
| `pearls` | J | t1: If a patient gains >7% body weight on an antipsychotic, consider switching to a lower-risk agent (aripiprazole, ziprasidone, lurasidone) before adding metformin.<br>t2: Aripiprazole and lurasidone carry the lowest risk. (metabolic) | *rounds_questions.md*: “- **Pearl:** If a patient gains >7% body weight on an antipsychotic, consider switching to a lower-risk agent (aripiprazole, ziprasidone, lurasidone) before adding metformin.”<br>*rounds_questions.md*: “Aripiprazole and lurasidone carry the lowest risk.” |
| `pk` | R | halfLifeHours: 75<br>timeToEffect: 1-2 weeks (psychosis); days-weeks (mood) | ReConnect (hash-pinned) |
| `rxcui` | L | 89013 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What side effect most often limits aripiprazole early? | `adverseEffects.dangerous[1]` | name: Akathisia<br>recognize: Inner restlessness, often early — the most common reason it is stopped.<br>firstMove: Reduce dose or switch before adding drugs. |
| Where does aripiprazole sit on metabolic risk? | `pearls.t2[0]` | Aripiprazole and lurasidone carry the lowest risk. (metabolic) |
| What would you do before adding metformin for weight gain? | `pearls.t1[0]` | If a patient gains >7% body weight on an antipsychotic, consider switching to a lower-risk agent (aripiprazole, ziprasidone, lurasidone) before adding metformin. |

Mapping hash `71d28bb3a333` · pending

Linked: evidence lieberman-2005-catie · questions qb_cdev_002

---

## divalproex sodium (valproate) (valproate)

Safety level **high** · review status **pending** · J-field hash `8f92af3a0837`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Mood Stabilizer/Anticonvulsant | mood stabilizer (anticonvulsant) | Card uses a more specific class term — reviewer to confirm. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `adverseEffects.dangerous[2].firstMove`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `interactions.cyp`, `interactions.keyTraps[0]`, `interactions.keyTraps[1]`, `mechanism.t1`, `pearls.t1[0]`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 11118 (valproic acid, PIN) |
| Reference label | [Depakote · 2026-03-31](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=08a65cf4-7749-4ceb-6895-8f4805e2b01f) — AbbVie Inc., chosen by referenceBrand |
| Boxed warning | present on reference; 119 of 123 matched labels carry one |
| Brands seen in openFDA | Depakote; Depakote ER; Depakote Sprinkles |

> **Label indications (lead):** 1 INDICATIONS AND USAGE Depakote is an anti-epileptic drug indicated for: Treatment of manic episodes associated with bipolar disorder ( 1.1 ) Monotherapy and adjunctive therapy of complex partial seizures and simple and complex absence seizures; adjunctive therapy in patients with multiple seizure types that include absence seizures ( 1.2 ) Prophylaxis of migraine headaches ( 1.3 ) 1.1 Mania Depakote (divalproex sodium) is a valproate and is indicated for the treatment of the manic episodes associated with bipolar disorder. A manic episode is a distinct period of abnormally and persistently elevated, expansive, or irritable mood. Typical symptoms of mania include pressure of speech, motor hyperactivity, reduced need for sleep, flight of ideas, grandiosity, poor judgment, aggressiveness, and possible hostility. The efficacy of Depakote was established in 3-week trials with patients meeti

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Nausea; Weight Gain; Tremor; Alopecia; Sedation | *reconnect:common_side_effects*: “Nausea; Weight Gain; Tremor; Alopecia; Sedation” |
| `adverseEffects.dangerous` | J | **Hyperammonemic encephalopathy** — recognize: Worsening confusion or delirium, even with normal LFTs.; firstMove: Send an ammonia level, not just a hepatic panel; tell the senior.<br>**Hepatotoxicity and pancreatitis** — recognize: Nausea, vomiting, abdominal pain, jaundice.; firstMove: Check LFTs and lipase; hold and escalate.<br>**Teratogenicity** — recognize: Valproate is the most teratogenic (~9–10% MCM rate; neural tube defects, dose-dependent IQ reduction of 7–10 points).; firstMove: β-hCG before starting; avoid in anyone who may become pregnant when alternatives exist. | *medication_monitoring_inpatient_teaching.md*: “\| **Valproate** \| LFTs, CBC (platelets), β-hCG \| Level; LFTs and CBC periodically; **send an ammonia level if the patient gets confused** — hyperammonaemic encephalopathy occurs with normal LFTs \|”<br>*cl_reference.md*: “valproate-induced **hyperammonaemic encephalopathy** presents as worsening delirium and can occur with normal LFTs, so send an **ammonia level**, not just a hepatic panel.”<br>*rounds_questions.md*: “- **Answer:** Valproate is the most teratogenic (~9–10% MCM rate; neural tube defects, dose-dependent IQ reduction of 7–10 points).”<br>*medication_monitoring_inpatient_teaching.md*: “- Valproate and lithium are teratogenic — β-hCG before starting, and avoid valproate in anyone who may become pregnant.”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `adverseEffects.dangerous[2].firstMove` |
| `attendingAsks` | J | Your patient on valproate is newly confused with normal LFTs. What do you send?; What must you check before starting it in someone who could become pregnant?; What does BALANCE say about valproate maintenance? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Life-threatening hepatotoxicity, fetal risk (major malformations and decreased IQ), and pancreatitis. | label receipt |
| `brands` | L | Depakote; Depakote ER | label receipt |
| `class` | R | mood stabilizer (anticonvulsant) | ReConnect (hash-pinned) |
| `dailymedSetId` | L | 08a65cf4-7749-4ceb-6895-8f4805e2b01f | label receipt |
| `dosing.forms` | J | PO; ER; liquid; IV | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=08a65cf4-7749-4ceb-6895-8f4805e2b01f | label receipt |
| `dosing.titration` | J | Titrated to a serum level; delayed- and extended-release forms are not interchangeable one-for-one. Confirm dose with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.handoutRef` | R | FH-MED02 | ReConnect (hash-pinned) |
| `familyExplainer.text` | J | Valproate helps control mania. It needs blood tests for levels, the liver, and blood counts. It can harm an unborn baby, so pregnancy must be avoided. Call the team for new confusion, belly pain, vomiting, or yellow skin. | *reconnect:counseling*: “AVOID in women of childbearing potential (severe birth defects). Monitor LFTs and platelets. Report abdominal pain, bruising, or jaundice.”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Bipolar disorder: manic episodes; Epilepsy (complex partial and absence seizures); Migraine prophylaxis | label receipt |
| `flags` | R | qtcRisk: Minimal<br>weightImpact: Significant Gain<br>bloodMonitoring: Yes<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | divalproex sodium (valproate) | label receipt |
| `inpatientUses` | J | **Acute mania, including mixed and rapid-cycling presentations** — offLabel: False; evidenceIds: ['canmat-isbd-bipolar-2018'] | *adv_psychopharmacology.md*: “Valproate is effective, particularly for mixed/rapid-cycling presentations, but is teratogenic (neural tube defects) and associated with PCOS and weight gain — generally avoid in people who can become pregnant when alter” |
| `interactions.cyp` | J | inhibits: UGT (glucuronidation); 2C9 | *reconnect:cyp_pathways*: “2C9 inhibitor; 2C19 inhibitor; glucuronidation”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Lamotrigine: valproate roughly doubles lamotrigine levels — adjust the titration; Carbamazepine and other enzyme inducers lower valproate levels | *adv_psychopharmacology.md*: “dosing must be adjusted when combined with valproate or estrogen-containing contraceptives”<br>**authored:** `interactions.keyTraps[0]`, `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2026-03-31 | label receipt |
| `mechanism.t1` | J | Enhances GABA and blocks voltage-gated sodium channels; mood mechanism incompletely understood. | *reconnect:mechanism_of_action*: “GABA enhancement; histone deacetylase inhibition; sodium channel blockade”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: LFTs; CBC with platelets; β-hCG<br>ongoing: Level; LFTs and CBC periodically; Ammonia if the patient becomes confused<br>sourcePage: med_monitoring.md | *medication_monitoring_inpatient_teaching.md*: “\| **Valproate** \| LFTs, CBC (platelets), β-hCG \| Level; LFTs and CBC periodically; **send an ammonia level if the patient gets confused** — hyperammonaemic encephalopathy occurs with normal LFTs \|” |
| `pearls` | J | t1: Confusion on valproate: send an ammonia, even if the LFTs are normal.; Match the mood stabilizer to the polarity — lithium and quetiapine prevent both poles; lamotrigine prevents depression; valproate and carbamazepine are better for mania.<br>t2: The BALANCE trial showed lithium monotherapy and lithium + valproate were both superior to valproate monotherapy for relapse prevention. | *medication_monitoring_inpatient_teaching.md*: “\| **Valproate** \| LFTs, CBC (platelets), β-hCG \| Level; LFTs and CBC periodically; **send an ammonia level if the patient gets confused** — hyperammonaemic encephalopathy occurs with normal LFTs \|”<br>*rounds_questions.md*: “- **Pearl:** Match the mood stabilizer to the **polarity** — lithium and quetiapine prevent both poles; lamotrigine prevents depression; valproate and carbamazepine are better for mania.”<br>*rounds_questions.md*: “- **Evidence:** The BALANCE trial showed lithium monotherapy and lithium + valproate were both superior to valproate monotherapy for relapse prevention.”<br>**authored:** `pearls.t1[0]` |
| `pk` | R | halfLifeHours: 15<br>timeToEffect: 1-2 weeks | ReConnect (hash-pinned) |
| `populations` | J | pregnancy: Most teratogenic mood stabilizer: β-hCG before starting; avoid in people who can become pregnant when alternatives exist.<br>hepatic: Contraindicated in significant hepatic impairment. | *medication_monitoring_inpatient_teaching.md*: “- Valproate and lithium are teratogenic — β-hCG before starting, and avoid valproate in anyone who may become pregnant.”<br>*cl_reference.md*: “**Valproate is contraindicated in significant hepatic impairment**” |
| `rxcui` | L | 11118 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| Your patient on valproate is newly confused with normal LFTs. What do you send? | `pearls.t1[0]`, `adverseEffects.dangerous[0]` | Confusion on valproate: send an ammonia, even if the LFTs are normal.<br>name: Hyperammonemic encephalopathy<br>recognize: Worsening confusion or delirium, even with normal LFTs.<br>firstMove: Send an ammonia level, not just a hepatic panel; tell the senior. |
| What must you check before starting it in someone who could become pregnant? | `populations.pregnancy` | Most teratogenic mood stabilizer: β-hCG before starting; avoid in people who can become pregnant when alternatives exist. |
| What does BALANCE say about valproate maintenance? | `pearls.t2[0]` | The BALANCE trial showed lithium monotherapy and lithium + valproate were both superior to valproate monotherapy for relapse prevention. |

Mapping hash `85363eda85db` · pending

Linked: evidence canmat-isbd-bipolar-2018 · questions qb_pha_005, qb_pha_006, qb_mood_011

---

## lorazepam (lorazepam)

Safety level **high** · review status **pending** · J-field hash `e0f659b85e0b`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Benzodiazepine | benzodiazepine (intermediate-acting) | Card uses a more specific class term — reviewer to confirm. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize`, `adverseEffects.dangerous[1].firstMove`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `inpatientUses[2]`, `interactions.cyp`, `interactions.keyTraps[0]`, `mechanism.t1`, `monitoring`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 6470 (lorazepam, IN) |
| Reference label | [Ativan · 2025-07-09](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=89057c93-8155-4040-acec-64e877bd2b4c) — Bausch Health US LLC, chosen by referenceBrand |
| Boxed warning | present on reference; 94 of 102 matched labels carry one |
| Brands seen in openFDA | Ativan; LOREEV XR |

> **Label indications (lead):** INDICATIONS AND USAGE Ativan (lorazepam) is indicated for the management of anxiety disorders or for the short-term relief of the symptoms of anxiety or anxiety associated with depressive symptoms. Anxiety or tension associated with the stress of everyday life usually does not require treatment with an anxiolytic. The effectiveness of Ativan (lorazepam) in long-term use, that is, more than 4 months, has not been assessed by systematic clinical studies. The physician should periodically reassess the usefulness of the drug for the individual patient.

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Sedation; Dizziness; Weakness; Confusion | *reconnect:common_side_effects*: “Sedation; Dizziness; Weakness; Confusion” |
| `adverseEffects.dangerous` | J | **Respiratory depression with opioids or alcohol** — recognize: Oversedation, slow breathing.; firstMove: Check the MAR for opioids; escalate.<br>**Withdrawal seizures after abrupt stop** — recognize: Alcohol and benzodiazepine withdrawal can be lethal; opioid and stimulant withdrawal are miserable but rarely fatal — match your urgency accordingly.; firstMove: Taper; never stop abruptly after regular use. | *substance_use_inpatient_teaching.md*: “- Alcohol and benzodiazepine withdrawal can be lethal; opioid and stimulant withdrawal are miserable but rarely fatal — match your urgency accordingly.”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize`, `adverseEffects.dangerous[1].firstMove` |
| `attendingAsks` | J | What does a positive lorazepam challenge tell you?; Which benzodiazepines are safer in cirrhosis, and why?; What combination causes respiratory depression? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Concomitant opioids can cause profound sedation, respiratory depression, coma, and death; abuse, misuse, and addiction; dependence and withdrawal reactions. | label receipt |
| `brands` | L | Ativan | label receipt |
| `class` | R | benzodiazepine (intermediate-acting) | ReConnect (hash-pinned) |
| `dailymedSetId` | L | 89057c93-8155-4040-acec-64e877bd2b4c | label receipt |
| `dosing.forms` | J | PO; SL; IM; IV | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=89057c93-8155-4040-acec-64e877bd2b4c | label receipt |
| `dosing.titration` | J | No active metabolites (glucuronidated). PO, SL, IM, and IV forms. Confirm dose with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.handoutRef` | R | FH-MED05 | ReConnect (hash-pinned) |
| `familyExplainer.text` | J | Lorazepam calms severe anxiety. It also treats catatonia and alcohol withdrawal. It makes people sleepy. It is not safe with alcohol or opioid pain pills. Do not stop it all at once after daily use. | *reconnect:counseling*: “Fast-acting but habit-forming. Do not use with alcohol or opioids. Do not stop abruptly - seizure risk. No drug interactions via CYP.”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Anxiety disorders and short-term relief of anxiety | label receipt |
| `flags` | R | qtcRisk: Minimal<br>weightImpact: Neutral<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | lorazepam | label receipt |
| `inpatientUses` | J | **Catatonia (lorazepam challenge)** — offLabel: True; evidenceIds: ['bap-catatonia-2023']<br>**Alcohol withdrawal in liver disease** — offLabel: True; evidenceIds: ['asam-alcohol-withdrawal-2020']<br>**Acute agitation** — offLabel: True; evidenceIds: ['project-beta-psychopharm-agitation-2012'] | *catatonia_inpatient_teaching.md*: “**The lorazepam challenge.** A test dose of lorazepam (IV or IM) is both a diagnostic maneuver and the start of treatment.”<br>*substance_use_inpatient_teaching.md*: “- In hepatic impairment, reach for a **LOT drug** (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not.”<br>**authored:** `inpatientUses[2]` |
| `interactions.cyp` | J | — | *reconnect:cyp_pathways*: “Glucuronidation (no CYP)”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Opioids, alcohol, and other sedatives; In hepatic impairment, reach for a LOT drug (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not. | *substance_use_inpatient_teaching.md*: “- In hepatic impairment, reach for a **LOT drug** (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not.”<br>**authored:** `interactions.keyTraps[0]` |
| `labelVersionDate` | L | 2025-07-09 | label receipt |
| `mechanism.t1` | J | Positive allosteric modulator of the GABA-A receptor. | *reconnect:mechanism_of_action*: “GABA-A receptor positive allosteric modulator”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: Respiratory status; Opioid and alcohol use<br>ongoing: Sedation and respiratory rate; Falls | **authored:** `monitoring` |
| `pearls` | J | t1: A positive lorazepam challenge both supports the diagnosis and begins treatment.<br>t2: In hepatic impairment, reach for a LOT drug (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not. | *catatonia_inpatient_teaching.md*: “- A positive lorazepam challenge both supports the diagnosis and begins treatment.”<br>*substance_use_inpatient_teaching.md*: “- In hepatic impairment, reach for a **LOT drug** (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not.” |
| `pk` | R | halfLifeHours: 12<br>timeToEffect: 15-30 minutes (anxiety); 5 minutes (IV) | ReConnect (hash-pinned) |
| `populations` | J | hepatic: A 'LOT' drug: conjugated by glucuronidation, which is preserved in cirrhosis. | *substance_use_inpatient_teaching.md*: “- In hepatic impairment, reach for a **LOT drug** (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not.” |
| `rxcui` | L | 6470 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What does a positive lorazepam challenge tell you? | `pearls.t1[0]` | A positive lorazepam challenge both supports the diagnosis and begins treatment. |
| Which benzodiazepines are safer in cirrhosis, and why? | `pearls.t2[0]` | In hepatic impairment, reach for a LOT drug (Lorazepam, Oxazepam, Temazepam) — glucuronidation is preserved in cirrhosis; the oxidative CYP450 pathway (chlordiazepoxide, diazepam) is not. |
| What combination causes respiratory depression? | `adverseEffects.dangerous[0]` | name: Respiratory depression with opioids or alcohol<br>recognize: Oversedation, slow breathing.<br>firstMove: Check the MAR for opioids; escalate. |

Mapping hash `17c86d4f0ad2` · pending

Linked: evidence bap-catatonia-2023, bot-2026-benzodiazepines-catatonia, asam-alcohol-withdrawal-2020 · questions qb_cog_013, qb_pha_010

---

## escitalopram (escitalopram)

Safety level **high** · review status **pending** · J-field hash `97507118b162`

### 1. Decide

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `interactions.cyp`, `interactions.keyTraps[1]`, `mechanism.t1`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 321988 (escitalopram, IN) |
| Reference label | [Lexapro · 2023-10-01](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=13bb8267-1cab-43e5-acae-55a4d957630a) — Allergan, Inc., chosen by referenceBrand |
| Boxed warning | present on reference; 111 of 111 matched labels carry one |
| Brands seen in openFDA | Lexapro |

> **Label indications (lead):** 1 INDICATIONS AND USAGE Lexapro is indicated for the treatment of: • major depressive disorder (MDD) in adults and pediatric patients 12 years of age and older. • generalized anxiety disorder (GAD) in adults and pediatric patients 7 years of age and older. Lexapro is a selective serotonin reuptake inhibitor (SSRI) indicated for the: treatment of major depressive disorder (MDD) in adults and pediatric patients 12 years of age and older ( 1 ) treatment of generalized anxiety disorder (GAD) in adults and pediatric patients 7 years and older ( 1 )

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Nausea; Headache; Insomnia; Sexual Dysfunction; Fatigue | *reconnect:common_side_effects*: “Nausea; Headache; Insomnia; Sexual Dysfunction; Fatigue” |
| `adverseEffects.dangerous` | J | **Serotonin syndrome** — recognize: Serotonin syndrome: clonus, hyperreflexia, and autonomic instability with rapid onset, usually after a serotonergic agent was started or increased; firstMove: Tell the senior now; stop serotonergic agents pending evaluation.<br>**Switch to mania in unrecognized bipolar disorder** — recognize: Emerging mania or mixed features after starting.; firstMove: Screen for bipolarity before the first dose. | *psychopharmacology_primer_inpatient.md*: “*Serotonin syndrome:* clonus, hyperreflexia, and autonomic instability with rapid onset, usually after a serotonergic agent was started or increased”<br>*psychopharmacology_primer_inpatient.md*: “Don't start an SSRI without screening for bipolarity, and expect delayed onset. The suicidality black-box covers antidepressants through age 24 — monitor young adults closely early.”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize` |
| `attendingAsks` | J | Which SSRIs are cleanest on interactions?; What do you screen for before the first dose?; What monitoring matters in older adults? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Suicidal thoughts and behaviors: antidepressants increased the risk in pediatric and young adult patients in short-term studies; monitor closely for worsening and emergent suicidality. | label receipt |
| `brands` | L | Lexapro | label receipt |
| `class` | R | SSRI | ReConnect (hash-pinned) |
| `dailymedSetId` | L | 13bb8267-1cab-43e5-acae-55a4d957630a | label receipt |
| `dosing.forms` | J | PO; liquid | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=13bb8267-1cab-43e5-acae-55a4d957630a | label receipt |
| `dosing.titration` | J | Start low and titrate; expect delayed onset. Taper rather than stopping abruptly. Confirm dose with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | Escitalopram treats depression and anxiety. It usually takes 2 to 4 weeks to help. Upset stomach is common at first. Do not stop it suddenly. In young adults, watch for new thoughts of self-harm early on. | **authored:** `familyExplainer.text` |
| `fdaIndications` | L | Major depressive disorder (adults and adolescents 12+); Generalized anxiety disorder (adults and children 7+) | label receipt |
| `flags` | R | qtcRisk: Moderate<br>weightImpact: Neutral<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | escitalopram | label receipt |
| `inpatientUses` | J | **Depression and anxiety when interactions are a concern** — offLabel: False; evidenceIds: ['cipriani-2018-antidepressant-nma'] | *rounds_questions.md*: “- **Pearl:** If a patient is on multiple medications, **escitalopram or sertraline** are the safest SSRI choices from a drug-interaction standpoint.” |
| `interactions.cyp` | J | substrateOf: 2C19; 3A4 | *reconnect:cyp_pathways*: “2C19 substrate; 3A4 substrate”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Citalopram, escitalopram, and sertraline have the fewest drug interactions.; Serotonergic stacking | *rounds_questions.md*: “Citalopram, escitalopram, and sertraline have the fewest drug interactions.”<br>**authored:** `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2023-10-01 | label receipt |
| `mechanism.t1` | J | Selective serotonin reuptake inhibitor (S-enantiomer of citalopram). | *reconnect:mechanism_of_action*: “Selective serotonin reuptake inhibitor (S-enantiomer of citalopram)”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: No routine labs required; Screen for bipolarity<br>ongoing: Activation and suicidality under age 25; Sodium in older adults; Bleeding risk; Discontinuation symptoms<br>sourcePage: med_monitoring.md | *medication_monitoring_inpatient_teaching.md*: “\| **SSRIs/SNRIs** \| (Clinical) — no routine labs required \| Clinical monitoring \| Hyponatremia (elderly), bleeding risk, activation and suicidality monitoring under age 25, discontinuation syndrome \|” |
| `pearls` | J | t1: Don't start an SSRI without screening for bipolarity, and expect delayed onset. The suicidality black-box covers antidepressants through age 24 — monitor young adults closely early.<br>t2: If a patient is on multiple medications, escitalopram or sertraline are the safest SSRI choices from a drug-interaction standpoint. | *psychopharmacology_primer_inpatient.md*: “Don't start an SSRI without screening for bipolarity, and expect delayed onset. The suicidality black-box covers antidepressants through age 24 — monitor young adults closely early.”<br>*rounds_questions.md*: “- **Pearl:** If a patient is on multiple medications, **escitalopram or sertraline** are the safest SSRI choices from a drug-interaction standpoint.” |
| `pk` | R | halfLifeHours: 27<br>timeToEffect: 2-4 weeks | ReConnect (hash-pinned) |
| `rxcui` | L | 321988 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| Which SSRIs are cleanest on interactions? | `pearls.t2[0]` | If a patient is on multiple medications, escitalopram or sertraline are the safest SSRI choices from a drug-interaction standpoint. |
| What do you screen for before the first dose? | `pearls.t1[0]` | Don't start an SSRI without screening for bipolarity, and expect delayed onset. The suicidality black-box covers antidepressants through age 24 — monitor young adults closely early. |
| What monitoring matters in older adults? | `monitoring.ongoing` | Activation and suicidality under age 25; Sodium in older adults; Bleeding risk; Discontinuation symptoms |

Mapping hash `66ed53377ebc` · pending

Linked: evidence cipriani-2018-antidepressant-nma, boyer-shannon-2005-serotonin-syndrome · questions qb_pha_015, qb_mood_003

---

## bupropion (bupropion)

Safety level **high** · review status **pending** · J-field hash `11dfab5e694c`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Other | NDRI (aminoketone) | Card uses a more specific class term — reviewer to confirm. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `inpatientUses[0]`, `inpatientUses[1]`, `interactions.cyp`, `interactions.keyTraps[0]`, `interactions.keyTraps[1]`, `mechanism.t1`, `monitoring`, `pearls`, `pearls.t1[0]`, `pearls.t2[0]`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 42347 (bupropion, IN) |
| Reference label | [WELLBUTRIN XL · 2026-02-10](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a435da9d-f6e8-4ddc-897d-8cd2bf777b21) — Bausch Health US LLC, chosen by referenceBrand |
| Boxed warning | present on reference; 232 of 233 matched labels carry one |
| Brands seen in openFDA | bupropion; Forfivo XL; WELLBUTRIN SR; WELLBUTRIN XL |

> **Label indications (lead):** 1 INDICATIONS AND USAGE Wellbutrin XL is an aminoketone antidepressant, indicated for: • treatment of major depressive disorder (MDD) ( 1.1 ) • prevention of seasonal affective disorder (SAD) ( 1.2 ) 1.1 Major Depressive Disorder (MDD) Wellbutrin XL ® (bupropion hydrochloride extended-release) tablets is indicated for the treatment of major depressive disorder (MDD), as defined by the Diagnostic and Statistical Manual (DSM). The efficacy of the immediate-release formulation of bupropion was established in two 4-week controlled inpatient trials and one 6-week controlled outpatient trial of adult patients with MDD. The efficacy of the sustained-release formulation of bupropion in the maintenance treatment of MDD was established in a long-term (up to 44 weeks), placebo-controlled trial in patients who had responded to bupropion in an 8-week study of acute treatment [ see Clinical Studies (1

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Insomnia; Dry Mouth; Headache; Agitation; Nausea | *reconnect:common_side_effects*: “Insomnia; Dry Mouth; Headache; Agitation; Nausea” |
| `adverseEffects.dangerous` | J | **Seizures** — recognize: Dose-related; higher risk with eating disorders, alcohol or sedative withdrawal, or other seizure-lowering drugs.; firstMove: Avoid in those groups; escalate any seizure. | **authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize` |
| `attendingAsks` | J | Who should not get bupropion?; What is its advantage over SSRIs?; Which enzyme does it strongly inhibit? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Suicidal thoughts and behaviors: antidepressants increased the risk in pediatric and young adult patients in short-term studies; monitor closely for worsening and emergent suicidality. | label receipt |
| `brands` | L | Wellbutrin XL; Wellbutrin SR | label receipt |
| `class` | R | NDRI (aminoketone) | ReConnect (hash-pinned) |
| `dailymedSetId` | L | a435da9d-f6e8-4ddc-897d-8cd2bf777b21 | label receipt |
| `dosing.forms` | J | PO; ER | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a435da9d-f6e8-4ddc-897d-8cd2bf777b21 | label receipt |
| `dosing.titration` | J | IR, SR, and XL are not interchangeable one-for-one; seizure risk is dose-related. Confirm dose with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.handoutRef` | R | FH-MED01 | ReConnect (hash-pinned) |
| `familyExplainer.text` | J | Bupropion treats depression and helps people quit smoking. It does not cause weight gain or sexual side effects. It can rarely cause seizures, so tell the team about any eating disorder or heavy drinking. | *reconnect:counseling*: “Activating - take in morning. No sexual side effects. SEIZURE RISK - never exceed max dose. Avoid in eating disorders/seizure history.”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Major depressive disorder; Prevention of seasonal affective disorder | label receipt |
| `flags` | R | qtcRisk: Minimal<br>weightImpact: Loss<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | bupropion | label receipt |
| `inpatientUses` | J | **Depression when sexual side effects, weight gain, or sedation are the problem** — offLabel: False; evidenceIds: []<br>**Smoking cessation (labeled for the SR product marketed for cessation)** — offLabel: False; evidenceIds: [] | **authored:** `inpatientUses[0]`, `inpatientUses[1]` |
| `interactions.cyp` | J | inhibits: 2D6 (strong) | *reconnect:cyp_pathways*: “2B6 substrate; 2D6 inhibitor”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Contraindicated with bulimia/anorexia and during abrupt alcohol or benzodiazepine withdrawal; Strong 2D6 inhibitor: raises many antipsychotics and beta-blockers | **authored:** `interactions.keyTraps[0]`, `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2026-02-10 | label receipt |
| `mechanism.t1` | J | Norepinephrine and dopamine reuptake inhibitor; no meaningful serotonergic activity. | *reconnect:mechanism_of_action*: “Norepinephrine-dopamine reuptake inhibitor (NDRI)”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: Seizure history, eating-disorder history, alcohol or sedative withdrawal risk; Blood pressure<br>ongoing: Blood pressure; Activation and suicidality under age 25 | **authored:** `monitoring` |
| `pearls` | J | t1: No sexual side effects or weight gain — but it lowers the seizure threshold.<br>t2: Not an anxiolytic or a sleep aid; it can be activating. | **authored:** `pearls`, `pearls.t1[0]`, `pearls.t2[0]` |
| `pk` | R | halfLifeHours: 21<br>timeToEffect: 2-4 weeks | ReConnect (hash-pinned) |
| `rxcui` | L | 42347 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| Who should not get bupropion? | `interactions.keyTraps[0]`, `adverseEffects.dangerous[0]` | Contraindicated with bulimia/anorexia and during abrupt alcohol or benzodiazepine withdrawal<br>name: Seizures<br>recognize: Dose-related; higher risk with eating disorders, alcohol or sedative withdrawal, or other seizure-lowering drugs.<br>firstMove: Avoid in those groups; escalate any seizure. |
| What is its advantage over SSRIs? | `pearls.t1[0]` | No sexual side effects or weight gain — but it lowers the seizure threshold. |
| Which enzyme does it strongly inhibit? | `interactions.keyTraps[1]` | Strong 2D6 inhibitor: raises many antipsychotics and beta-blockers |

Mapping hash `62ed1e2d3e70` · pending

Linked: evidence cipriani-2018-antidepressant-nma · questions —

---

## mirtazapine (mirtazapine)

Safety level **high** · review status **pending** · J-field hash `f3e1bc29a432`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Other | NaSSA (α2 antagonist) | Card uses a more specific class term — reviewer to confirm. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize`, `adverseEffects.dangerous[1].firstMove`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `inpatientUses[0]`, `interactions.cyp`, `interactions.keyTraps[0]`, `interactions.keyTraps[1]`, `mechanism.t1`, `monitoring`, `pearls`, `pearls.t1[0]`, `pearls.t2[0]`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 15996 (mirtazapine, IN) |
| Reference label | [REMERONSOLTAB · 2025-08-06](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=98ad1917-a094-44f5-a28f-a64a8cfcd887) — Organon LLC, chosen by referenceBrand |
| Boxed warning | present on reference; 88 of 90 matched labels carry one |
| Brands seen in openFDA | REMERON; REMERONSOLTAB |

> **Label indications (lead):** 1 INDICATIONS AND USAGE REMERON/REMERONSolTab are indicated for the treatment of major depressive disorder (MDD) in adults [see Clinical Studies (14) ] . REMERON/REMERONSolTab is indicated for the treatment of major depressive disorder (MDD) in adults. ( 1 )

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Sedation; Weight Gain; Increased Appetite; Dry Mouth; Dizziness | *reconnect:common_side_effects*: “Sedation; Weight Gain; Increased Appetite; Dry Mouth; Dizziness” |
| `adverseEffects.dangerous` | J | **Agranulocytosis (rare)** — recognize: Fever or sore throat.; firstMove: CBC now.<br>**Serotonin syndrome** — recognize: Serotonin syndrome: clonus, hyperreflexia, and autonomic instability with rapid onset, usually after a serotonergic agent was started or increased; firstMove: Tell the senior now; stop serotonergic agents pending evaluation. | *psychopharmacology_primer_inpatient.md*: “*Serotonin syndrome:* clonus, hyperreflexia, and autonomic instability with rapid onset, usually after a serotonergic agent was started or increased”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[0].recognize`, `adverseEffects.dangerous[1].firstMove` |
| `attendingAsks` | J | Which patient benefits from mirtazapine's sedation and appetite effects?; What is the usual trade-off?; Which rare blood problem should prompt a CBC? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Suicidal thoughts and behaviors: antidepressants increased the risk in pediatric and young adult patients in short-term studies; monitor closely for worsening and emergent suicidality. | label receipt |
| `brands` | L | Remeron; RemeronSolTab | label receipt |
| `class` | R | NaSSA (α2 antagonist) | ReConnect (hash-pinned) |
| `dailymedSetId` | L | 98ad1917-a094-44f5-a28f-a64a8cfcd887 | label receipt |
| `dosing.forms` | J | PO; ODT | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=98ad1917-a094-44f5-a28f-a64a8cfcd887 | label receipt |
| `dosing.titration` | J | Sedation is often greatest at lower doses. ODT available. Confirm dose with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.handoutRef` | R | FH-MED01 | ReConnect (hash-pinned) |
| `familyExplainer.text` | J | Mirtazapine treats depression. It helps with sleep and appetite. It often causes weight gain and sleepiness. Tell the team about fever or sore throat. | *reconnect:counseling*: “Very sedating - take at bedtime. Causes significant weight gain. Paradoxically LESS sedating at higher doses. No sexual side effects.”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Major depressive disorder (adults) | label receipt |
| `flags` | R | qtcRisk: Minimal<br>weightImpact: Significant Gain<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | mirtazapine | label receipt |
| `inpatientUses` | J | **Depression with insomnia, poor appetite, or weight loss** — offLabel: False; evidenceIds: ['cipriani-2018-antidepressant-nma'] | **authored:** `inpatientUses[0]` |
| `interactions.cyp` | J | substrateOf: 3A4; 2D6; 1A2 | *reconnect:cyp_pathways*: “3A4 substrate; 2D6 substrate; 1A2 substrate”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Other sedating agents; Serotonergic stacking | **authored:** `interactions.keyTraps[0]`, `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2025-08-06 | label receipt |
| `mechanism.t1` | J | α2-adrenergic antagonist with 5-HT2 and 5-HT3 blockade and strong H1 antagonism. | *reconnect:mechanism_of_action*: “Alpha-2 antagonist; 5-HT2/5-HT3 antagonist; H1 antagonist”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: Weight; Screen for bipolarity<br>ongoing: Weight and lipids; Activation and suicidality under age 25 | **authored:** `monitoring` |
| `pearls` | J | t1: Sleep and appetite are features, not side effects, for the right patient.<br>t2: Little sexual dysfunction; weight gain is the usual trade-off. | **authored:** `pearls`, `pearls.t1[0]`, `pearls.t2[0]` |
| `pk` | R | halfLifeHours: 26<br>timeToEffect: 2-4 weeks | ReConnect (hash-pinned) |
| `rxcui` | L | 15996 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| Which patient benefits from mirtazapine's sedation and appetite effects? | `pearls.t1[0]`, `inpatientUses[0].use` | Sleep and appetite are features, not side effects, for the right patient.<br>Depression with insomnia, poor appetite, or weight loss |
| What is the usual trade-off? | `pearls.t2[0]` | Little sexual dysfunction; weight gain is the usual trade-off. |
| Which rare blood problem should prompt a CBC? | `adverseEffects.dangerous[0]` | name: Agranulocytosis (rare)<br>recognize: Fever or sore throat.<br>firstMove: CBC now. |

Mapping hash `f25de0ba5694` · pending

Linked: evidence cipriani-2018-antidepressant-nma · questions —

---

## buprenorphine (± naloxone) (buprenorphine)

Safety level **high** · review status **pending** · J-field hash `a8ee97b299c0`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Opioid Partial Agonist (MOUD) | partial μ-opioid agonist | Card uses a more specific class term — reviewer to confirm. |
| black_box_warning | Yes | No | Reference label (receipt) does not carry a boxed warning. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `interactions.cyp`, `interactions.keyTraps[0]`, `interactions.keyTraps[1]`, `mechanism.t1`, `monitoring`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 1819 (buprenorphine, IN) |
| Reference label | [Suboxone · 2025-12-22](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8a5edcf9-828c-4f97-b671-268ab13a8ecd) — INDIVIOR INC., chosen by referenceBrand |
| Boxed warning | absent on reference; 5 of 48 matched labels carry one |
| Brands seen in openFDA | BELBUCA; Buprenorphine HCl and Naloxone HCl; Suboxone; Zubsolv |

> **Label indications (lead):** 1 INDICATIONS AND USAGE SUBOXONE sublingual film is indicated for treatment of opioid dependence. SUBOXONE sublingual film should be used as part of a complete treatment plan that includes counseling and psychosocial support. SUBOXONE® sublingual film contains buprenorphine, a partial‐opioid agonist, and naloxone, an opioid antagonist, and is indicated for treatment of opioid dependence. ( 1 ) SUBOXONE sublingual film should be used as part of a complete treatment plan that includes counseling and psychosocial support. ( 1 )

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Constipation; Headache; Sweating; Insomnia; Nausea | *reconnect:common_side_effects*: “Constipation; Headache; Sweating; Insomnia; Nausea” |
| `adverseEffects.dangerous` | J | **Precipitated withdrawal** — recognize: Buprenorphine is a partial agonist — it can precipitate withdrawal if given while full agonists are still present.; firstMove: With fentanyl, precipitated withdrawal is uncommon; the first treatment is more buprenorphine.<br>**Respiratory depression with benzodiazepines or alcohol** — recognize: Oversedation.; firstMove: Review sedatives; do not withhold MOUD — coordinate. | *rounds_questions.md*: “- **Pearl:** Buprenorphine is a **partial agonist** — it can precipitate withdrawal if given while full agonists are still present.”<br>*rounds_questions.md*: “With fentanyl, precipitated withdrawal is uncommon; the first treatment is more buprenorphine.”<br>**authored:** `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize` |
| `attendingAsks` | J | How do you time buprenorphine induction?; What causes precipitated withdrawal, and what is the first treatment with fentanyl?; What must happen before discharge? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | False | label receipt |
| `brands` | L | Suboxone; Zubsolv | label receipt |
| `class` | R | partial μ-opioid agonist | ReConnect (hash-pinned) |
| `dailymedSetId` | L | 8a5edcf9-828c-4f97-b671-268ab13a8ecd | label receipt |
| `dosing.forms` | J | SL; LAI | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=8a5edcf9-828c-4f97-b671-268ab13a8ecd | label receipt |
| `dosing.titration` | J | Start once objective withdrawal is present; newer low-dose and high-dose inductions exist for fentanyl. Confirm the induction plan with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | Buprenorphine treats opioid addiction and lowers the risk of overdose. It dissolves under the tongue. Keep a naloxone kit at home. Tell the team about any alcohol or sleeping pills. | *reconnect:counseling*: “Wait until you are in mild–moderate withdrawal (COWS ~8-12) before the first dose, or it can trigger sudden withdrawal. Let it dissolve fully under the tongue — do not chew or swallow. Do NOT combine with benzodiazepines”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Opioid dependence (sublingual buprenorphine/naloxone) | label receipt |
| `flags` | R | qtcRisk: Low<br>weightImpact: Neutral<br>bloodMonitoring: No<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | buprenorphine (± naloxone) | label receipt |
| `inpatientUses` | J | **Opioid use disorder: start before discharge** — offLabel: False; evidenceIds: ['asam-oud-2020', 'larochelle-2018-moud-mortality'] | *substance_use_inpatient_teaching.md*: “Arrange **linkage to medication for opioid use disorder (MOUD)** — buprenorphine or methadone — before the patient leaves, since the post-discharge window carries elevated overdose risk.” |
| `interactions.cyp` | J | substrateOf: 3A4 | *reconnect:cyp_pathways*: “3A4 substrate”<br>**authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Full-agonist opioids still on board at induction; Benzodiazepines and alcohol | **authored:** `interactions.keyTraps[0]`, `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2025-12-22 | label receipt |
| `mechanism.t1` | J | High-affinity partial μ-opioid agonist; naloxone is added to deter injection. | *reconnect:mechanism_of_action*: “Partial mu-opioid receptor agonist; kappa antagonist”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: COWS; Recent opioid type and last use; LFTs; Pregnancy test<br>ongoing: Withdrawal and cravings; Naloxone kit at discharge | **authored:** `monitoring` |
| `pearls` | J | t1: COWS assesses objective signs (pupil size, pulse, gooseflesh, yawning) — it is more reliable than patient self-report for timing buprenorphine induction.<br>t2: Arrange linkage to medication for opioid use disorder (MOUD) — buprenorphine or methadone — before the patient leaves, since the post-discharge window carries elevated overdose risk. | *rounds_questions.md*: “- **Pearl:** COWS assesses **objective** signs (pupil size, pulse, gooseflesh, yawning) — it is more reliable than patient self-report for timing buprenorphine induction.”<br>*substance_use_inpatient_teaching.md*: “Arrange **linkage to medication for opioid use disorder (MOUD)** — buprenorphine or methadone — before the patient leaves, since the post-discharge window carries elevated overdose risk.” |
| `pk` | R | halfLifeHours: 24-42<br>timeToEffect: 30-60 minutes (relieves withdrawal) | ReConnect (hash-pinned) |
| `rxcui` | L | 1819 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| How do you time buprenorphine induction? | `pearls.t1[0]` | COWS assesses objective signs (pupil size, pulse, gooseflesh, yawning) — it is more reliable than patient self-report for timing buprenorphine induction. |
| What causes precipitated withdrawal, and what is the first treatment with fentanyl? | `adverseEffects.dangerous[0]` | name: Precipitated withdrawal<br>recognize: Buprenorphine is a partial agonist — it can precipitate withdrawal if given while full agonists are still present.<br>firstMove: With fentanyl, precipitated withdrawal is uncommon; the first treatment is more buprenorphine. |
| What must happen before discharge? | `pearls.t2[0]` | Arrange linkage to medication for opioid use disorder (MOUD) — buprenorphine or methadone — before the patient leaves, since the post-discharge window carries elevated overdose risk. |

Mapping hash `1048c3aa0f6c` · pending

Linked: evidence asam-oud-2020, asam-hpso-bup-2023, larochelle-2018-moud-mortality, samhsa-tip63-2021 · questions qb_sud_001, qb_sud_005, qb_sud_008

---

## naltrexone (naltrexone)

Safety level **high** · review status **pending** · J-field hash `f456a16561ea`

### 1. Decide

| ReConnect field | Upstream says | Card uses | Basis |
|---|---|---|---|
| drug_class | Opioid Antagonist (MOUD/AUD) | μ-opioid antagonist | Card uses a more specific class term — reviewer to confirm. |
| black_box_warning | Yes | No | Reference label (receipt) does not carry a boxed warning. |

**Authored with no attested source (read these closely):** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize`, `attendingAsks`, `dosing.forms`, `dosing.titration`, `familyExplainer.text`, `inpatientUses[1]`, `interactions.cyp`, `interactions.keyTraps[0]`, `interactions.keyTraps[1]`, `mechanism.t1`, `monitoring`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 7243 (naltrexone, IN) |
| Reference label | [Naltrexone Hydrochloride · 2026-09-08](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db911559-26f5-43a0-b61f-3425176c936f) — REMEDYREPACK INC., chosen by latest-oral |
| Boxed warning | absent on reference; 0 of 46 matched labels carry one |
| Brands seen in openFDA | VIVITROL |

> **Label indications (lead):** INDICATIONS AND USAGE Naltrexone Hydrochloride Tablets USP are indicated in the treatment of alcohol dependence and for the blockade of the effects of exogenously administered opioids. Naltrexone Hydrochloride Tablets USP have not been shown to provide any therapeutic benefit except as part of an appropriate plan of management for the addictions.

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects.common` | J | Nausea; Headache; Dizziness; Fatigue; Insomnia | *reconnect:common_side_effects*: “Nausea; Headache; Dizziness; Fatigue; Insomnia” |
| `adverseEffects.dangerous` | J | **Precipitated opioid withdrawal** — recognize: Naltrexone is a μ-opioid antagonist — it is contraindicated in patients currently using opioids (precipitates withdrawal) and in acute hepatitis.; firstMove: Confirm opioid-free status before the first dose.<br>**Overdose after stopping** — recognize: Loss of tolerance makes a return to opioids more dangerous.; firstMove: Naloxone kit and counseling at discharge. | *rounds_questions.md*: “- **Pearl:** Naltrexone is a μ-opioid antagonist — it is **contraindicated** in patients currently using opioids (precipitates withdrawal) and in acute hepatitis.”<br>**authored:** `adverseEffects.dangerous[0].firstMove`, `adverseEffects.dangerous[1].firstMove`, `adverseEffects.dangerous[1].recognize` |
| `attendingAsks` | J | Who cannot receive naltrexone?; How do naltrexone and acamprosate differ in what they prevent?; What liver history changes the decision? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | False | label receipt |
| `brands` | L | Vivitrol | label receipt |
| `class` | R | μ-opioid antagonist | ReConnect (hash-pinned) |
| `dailymedSetId` | L | db911559-26f5-43a0-b61f-3425176c936f | label receipt |
| `dosing.forms` | J | PO; LAI | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=db911559-26f5-43a0-b61f-3425176c936f | label receipt |
| `dosing.titration` | J | Must be opioid-free first (typically 7–10 days for short-acting opioids, longer for methadone) to avoid precipitated withdrawal. Confirm with pharmacy. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | Naltrexone lowers cravings for alcohol and blocks the effects of opioids. It cannot be taken with opioid pain pills. After stopping, a return to opioids is more dangerous, so keep a naloxone kit. | *reconnect:counseling*: “For opioids: you must be completely off all opioids for 7-10 days first, or it causes sudden withdrawal. It blocks opioid effects — if you relapse, your tolerance is lower and overdose risk is high. For alcohol: reduces ”<br>**authored:** `familyExplainer.text` |
| `fdaIndications` | L | Alcohol dependence; Blockade of exogenous opioids (opioid dependence, after detoxification) | label receipt |
| `flags` | R | qtcRisk: Minimal<br>weightImpact: Neutral<br>bloodMonitoring: Yes<br>ekgRequired: No | ReConnect (hash-pinned) |
| `generic` | L | naltrexone | label receipt |
| `inpatientUses` | J | **Alcohol use disorder maintenance** — offLabel: False; evidenceIds: []<br>**Opioid use disorder (XR injection) after full detoxification** — offLabel: False; evidenceIds: [] | *substance_use_inpatient_teaching.md*: “**Alcohol use disorder pharmacotherapy anchor** — Naltrexone and acamprosate are first-line maintenance medications for alcohol use disorder when not contraindicated.”<br>**authored:** `inpatientUses[1]` |
| `interactions.cyp` | J | — | **authored:** `interactions.cyp` |
| `interactions.keyTraps` | J | Any opioid analgesic (blocked; plan pain control); Acute hepatitis | **authored:** `interactions.keyTraps[0]`, `interactions.keyTraps[1]` |
| `labelVersionDate` | L | 2026-09-08 | label receipt |
| `mechanism.t1` | J | Competitive μ-opioid antagonist. | *reconnect:mechanism_of_action*: “Mu-opioid receptor antagonist (blocks opioid effects; reduces alcohol reward/craving)”<br>**authored:** `mechanism.t1` |
| `monitoring` | E | baseline: LFTs; Urine toxicology for opioids<br>ongoing: LFTs; Cravings and drinking | **authored:** `monitoring` |
| `pearls` | J | t1: Naltrexone reduces heavy drinking but cannot be used with opioids and requires liver-risk review; in compensated cirrhosis it may be considered with monitoring, while acute hepatitis or advanced decompensation pushes you away from it.<br>t2: Naltrexone NNT = 11 for preventing return to heavy drinking; acamprosate NNT = 11 for preventing any drinking. | *substance_use_inpatient_teaching.md*: “Naltrexone reduces heavy drinking but cannot be used with opioids and requires liver-risk review; in compensated cirrhosis it may be considered with monitoring, while acute hepatitis or advanced decompensation pushes you”<br>*rounds_questions.md*: “- **Evidence:** Naltrexone NNT = 11 for preventing return to heavy drinking; acamprosate NNT = 11 for preventing any drinking.” |
| `pk` | R | halfLifeHours: 4 (active metabolite ~13)<br>timeToEffect: 1-2 hours (blockade); days–weeks for craving | ReConnect (hash-pinned) |
| `rxcui` | L | 7243 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| Who cannot receive naltrexone? | `adverseEffects.dangerous[0]` | name: Precipitated opioid withdrawal<br>recognize: Naltrexone is a μ-opioid antagonist — it is contraindicated in patients currently using opioids (precipitates withdrawal) and in acute hepatitis.<br>firstMove: Confirm opioid-free status before the first dose. |
| How do naltrexone and acamprosate differ in what they prevent? | `pearls.t2[0]` | Naltrexone NNT = 11 for preventing return to heavy drinking; acamprosate NNT = 11 for preventing any drinking. |
| What liver history changes the decision? | `pearls.t1[0]` | Naltrexone reduces heavy drinking but cannot be used with opioids and requires liver-risk review; in compensated cirrhosis it may be considered with monitoring, while acute hepatitis or advanced decompensation pushes you away from it. |

Mapping hash `ed0ef8c312a9` · pending

Linked: evidence — · questions qb_sud_009

---

## buspirone (buspirone)

Safety level **high** · review status **pending** · J-field hash `24c5ea802856`

### 1. Decide

**Authored with no attested source (read these closely):** `class`, `mechanism.t1`, `inpatientUses`, `dosing.titration`, `dosing.forms`, `monitoring`, `adverseEffects`, `interactions`, `attendingAsks`, `familyExplainer.text`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 1827 (buspirone, IN) |
| Reference label | [BUSPIRONE HYDROCHLORIDE · 2026-09-04](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fa4d5cac-f687-4440-99d2-8bb27cf2f4ed) — REMEDYREPACK INC., chosen by latest-oral |
| Boxed warning | absent on reference; 0 of 163 matched labels carry one |
| Brands seen in openFDA | Bucapsol; busPIRone HCl |

> **Label indications (lead):** INDICATIONS AND USAGE Buspirone hydrochloride tablets are indicated for the management of anxiety disorders or the short-term relief of the symptoms of anxiety. Anxiety or tension associated with the stress of everyday life usually does not require treatment with an anxiolytic. The efficacy of buspirone hydrochloride tablets has been demonstrated in controlled clinical trials of outpatients whose diagnosis roughly corresponds to Generalized Anxiety Disorder (GAD). Many of the patients enrolled in these studies also had coexisting depressive symptoms and buspirone hydrochloride tablets relieved anxiety in the presence of these coexisting depressive symptoms. The patients evaluated in these studies had experienced symptoms for periods of 1 month to over 1 year prior to the study, with an average symptom duration of 6 months. Generalized Anxiety Disorder (300.02) is described in the America

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects` | J | common: Dizziness; Nausea; Headache; Nervousness<br>dangerous: **Serotonin syndrome** — recognize: New agitation, fever, tremor or rigidity with serotonergic combinations.; firstMove: Urgently notify the senior and obtain medical assessment; stop suspected serotonergic agents pending evaluation. | **authored:** `adverseEffects` |
| `attendingAsks` | J | What is the labeled role of this medication?; Which interactions or contraindications need review?; What should you monitor during treatment? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | False | label receipt |
| `brands` | L | — | label receipt |
| `class` | J | Azapirone anxiolytic | **authored:** `class` |
| `dailymedSetId` | L | fa4d5cac-f687-4440-99d2-8bb27cf2f4ed | label receipt |
| `dosing.forms` | J | PO | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=fa4d5cac-f687-4440-99d2-8bb27cf2f4ed | label receipt |
| `dosing.titration` | J | Use scheduled administration consistently with or without food. Adjust gradually with pharmacy; severe hepatic or renal impairment is not recommended in the label. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | This drug helps with anxiety. It is taken on a schedule. It will not stop a panic spell right away. It may make you dizzy or sick to your stomach. Tell the team about all other drugs you take. | **authored:** `familyExplainer.text` |
| `fdaIndications` | L | Management of anxiety disorders or short-term relief of symptoms of anxiety | label receipt |
| `generic` | L | buspirone | label receipt |
| `inpatientUses` | J | **Scheduled treatment of anxiety; not a rescue medication for acute agitation** — offLabel: False; evidenceIds: [] | **authored:** `inpatientUses` |
| `interactions` | J | cyp: substrateOf: 3A4<br>keyTraps: MAOIs, including linezolid and intravenous methylene blue, can cause serotonin syndrome or elevated blood pressure; confirm label washout intervals.; Strong CYP3A4 inhibitors increase exposure; inducers decrease exposure. Review grapefruit intake and all interacting drugs with pharmacy.<br>interactionCardIds: — | **authored:** `interactions` |
| `labelVersionDate` | L | 2026-09-04 | label receipt |
| `mechanism.t1` | J | The anxiolytic mechanism is not fully established; buspirone has high affinity for serotonin 5-HT1A receptors. | **authored:** `mechanism.t1` |
| `monitoring` | J | baseline: Review serotonergic drugs and MAOI exposure; Review renal and hepatic function<br>ongoing: Anxiety response and dizziness; Symptoms of serotonin syndrome<br>sourcePage: med_monitoring.md | **authored:** `monitoring` |
| `rxcui` | L | 1827 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What is the labeled role of this medication? | `fdaIndications` | Management of anxiety disorders or short-term relief of symptoms of anxiety |
| Which interactions or contraindications need review? | `interactions.keyTraps` | MAOIs, including linezolid and intravenous methylene blue, can cause serotonin syndrome or elevated blood pressure; confirm label washout intervals.; Strong CYP3A4 inhibitors increase exposure; inducers decrease exposure. Review grapefruit intake and all interacting drugs with pharmacy. |
| What should you monitor during treatment? | `monitoring.ongoing` | Anxiety response and dizziness; Symptoms of serotonin syndrome |

Mapping hash `fd2f5ba99335` · pending

Linked: evidence — · questions —

---

## fluvoxamine (fluvoxamine)

Safety level **high** · review status **pending** · J-field hash `45c7533f7e6d`

### 1. Decide

**Authored with no attested source (read these closely):** `class`, `mechanism.t1`, `inpatientUses`, `dosing.titration`, `dosing.forms`, `monitoring`, `adverseEffects`, `interactions`, `attendingAsks`, `familyExplainer.text`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 42355 (fluvoxamine, IN) |
| Reference label | [Fluvoxamine Maleate · 2026-06-24](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d492230c-f56a-4759-ba86-7090b9f44063) — Par Health USA, LLC, chosen by latest-oral |
| Boxed warning | present on reference; 22 of 22 matched labels carry one |
| Brands seen in openFDA | — |

> **Label indications (lead):** 1 INDICATIONS AND USAGE Fluvoxamine maleate extended-release capsules are a selective serotonin reuptake inhibitor (SSRI) indicated for the treatment of obsessive compulsive disorder (OCD) ( 1 ) . Efficacy was demonstrated in: One 12-week study with fluvoxamine maleate extended-release capsules in adults ( 14.1 ) . Two 10-week studies with immediate-release (IR) fluvoxamine tablets in adults and one 10-week study with IR fluvoxamine tablets in children and adolescents ( 14.1 , 14.3 ) . One maintenance study with IR fluvoxamine tablets ( 14.2 ) . 1.1 Obsessive Compulsive Disorder Fluvoxamine maleate extended-release capsules are indicated for the treatment of obsessive compulsive disorder (OCD), as defined in the DSM-IV. Obsessive compulsive disorder is characterized by recurrent and persistent ideas, thoughts, impulses, or images (obsessions) that are ego-dystonic and/or repetitive, purp

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects` | J | common: Nausea; Somnolence; Insomnia; Sexual adverse effects<br>dangerous: **Serotonin syndrome** — recognize: New clonus, fever, agitation or autonomic instability after serotonergic stacking.; firstMove: Stop suspected serotonergic agents and obtain urgent senior assessment. | **authored:** `adverseEffects` |
| `attendingAsks` | J | What is the labeled role of this medication?; Which interactions or contraindications need review?; What should you monitor during treatment? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Antidepressants increase the risk of suicidal thoughts and behavior in children, adolescents and young adults; monitor all patients for clinical worsening. | label receipt |
| `brands` | L | — | label receipt |
| `class` | J | SSRI | **authored:** `class` |
| `dailymedSetId` | L | d492230c-f56a-4759-ba86-7090b9f44063 | label receipt |
| `dosing.forms` | J | PO; ER | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d492230c-f56a-4759-ba86-7090b9f44063 | label receipt |
| `dosing.titration` | J | Confirm immediate-release versus extended-release product before prescribing. Titrate gradually and taper when stopping; elderly patients and hepatic impairment need cautious adjustment. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | This drug can help with unwanted thoughts and repeated acts. It may take time to help. It can upset your stomach or change your sleep. Do not stop it all at once. Tell the team right away about new thoughts of self-harm. | **authored:** `familyExplainer.text` |
| `fdaIndications` | L | Obsessive-compulsive disorder (selected extended-release label; adult efficacy established) | label receipt |
| `generic` | L | fluvoxamine | label receipt |
| `inpatientUses` | J | **Treatment of OCD; verify the formulation and pair medication planning with exposure and response prevention** — offLabel: False; evidenceIds: [] | **authored:** `inpatientUses` |
| `interactions` | J | cyp: inhibits: 1A2; 2C19; 2C9; 3A4<br>keyTraps: Contraindicated with thioridazine, tizanidine, pimozide, alosetron and ramelteon; MAOI combinations and specified washout periods also matter.; Can raise clozapine and TCA concentrations. Pharmacy must review CYP1A2, CYP2C19, CYP2C9 and CYP3A4 interactions.<br>interactionCardIds: — | **authored:** `interactions` |
| `labelVersionDate` | L | 2026-06-24 | label receipt |
| `mechanism.t1` | J | Serotonin reuptake inhibition is thought to mediate the effect in OCD. | **authored:** `mechanism.t1` |
| `monitoring` | J | baseline: Screen for bipolar disorder and suicide risk; Review the complete interaction list and formulation<br>ongoing: Clinical worsening, activation and suicidality; Serotonin syndrome, hyponatremia and bleeding; Levels or effects of interacting narrow-therapeutic-index drugs<br>sourcePage: med_monitoring.md | **authored:** `monitoring` |
| `rxcui` | L | 42355 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What is the labeled role of this medication? | `fdaIndications` | Obsessive-compulsive disorder (selected extended-release label; adult efficacy established) |
| Which interactions or contraindications need review? | `interactions.keyTraps` | Contraindicated with thioridazine, tizanidine, pimozide, alosetron and ramelteon; MAOI combinations and specified washout periods also matter.; Can raise clozapine and TCA concentrations. Pharmacy must review CYP1A2, CYP2C19, CYP2C9 and CYP3A4 interactions. |
| What should you monitor during treatment? | `monitoring.ongoing` | Clinical worsening, activation and suicidality; Serotonin syndrome, hyponatremia and bleeding; Levels or effects of interacting narrow-therapeutic-index drugs |

Mapping hash `fd2f5ba99335` · pending

Linked: evidence — · questions qb_anx_014

---

## clomipramine (clomipramine)

Safety level **high** · review status **pending** · J-field hash `b1054c05328e`

### 1. Decide

**Authored with no attested source (read these closely):** `class`, `mechanism.t1`, `inpatientUses`, `dosing.titration`, `dosing.forms`, `monitoring`, `adverseEffects`, `interactions`, `attendingAsks`, `familyExplainer.text`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 2597 (clomipramine, IN) |
| Reference label | [ANAFRANIL · 2024-11-26](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4074b555-7635-41a9-809d-fae3b3610059) — SpecGx LLC, chosen by referenceBrand |
| Boxed warning | present on reference; 18 of 18 matched labels carry one |
| Brands seen in openFDA | ANAFRANIL |

> **Label indications (lead):** INDICATIONS AND USAGE Anafranil ™ (clomipramine hydrochloride) Capsules USP is indicated for the treatment of obsessions and compulsions in patients with Obsessive-Compulsive Disorder (OCD). The obsessions or compulsions must cause marked distress, be time-consuming, or significantly interfere with social or occupational functioning, in order to meet the DSM-III-R (circa 1989) diagnosis of OCD. Obsessions are recurrent, persistent ideas, thoughts, images, or impulses that are ego-dystonic. Compulsions are repetitive, purposeful, and intentional behaviors performed in response to an obsession or in a stereotyped fashion, and are recognized by the person as excessive or unreasonable. The effectiveness of Anafranil for the treatment of OCD was demonstrated in multicenter, placebo-controlled, parallel-group studies, including two 10-week studies in adults and one 8-week study in children and

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects` | J | common: Dry mouth; Constipation; Somnolence; Dizziness; Sexual adverse effects<br>dangerous: **Seizure or cardiac toxicity** — recognize: Seizure, syncope, arrhythmia or suspected overdose.; firstMove: Obtain emergency medical assessment and notify the senior immediately.<br>**Serotonin syndrome** — recognize: Fever, clonus and autonomic instability with serotonergic exposure.; firstMove: Stop suspected serotonergic drugs and obtain urgent medical assessment. | **authored:** `adverseEffects` |
| `attendingAsks` | J | What is the labeled role of this medication?; Which interactions or contraindications need review?; What should you monitor during treatment? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Antidepressants increase the risk of suicidal thoughts and behavior in children, adolescents and young adults; monitor all patients for clinical worsening. | label receipt |
| `brands` | L | ANAFRANIL | label receipt |
| `class` | J | Tricyclic antidepressant | **authored:** `class` |
| `dailymedSetId` | L | 4074b555-7635-41a9-809d-fae3b3610059 | label receipt |
| `dosing.forms` | J | PO | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4074b555-7635-41a9-809d-fae3b3610059 | label receipt |
| `dosing.titration` | J | Start cautiously and increase gradually with the prescriber and pharmacy. Give with meals during initial titration. Limit quantities when overdose risk is present and taper when stopping. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | This drug helps with unwanted thoughts and repeated acts. It may cause dry mouth, hard stools or sleepiness. Do not stop it all at once. Tell the team about fainting or new thoughts of self-harm. Taking too much can be very dangerous. | **authored:** `familyExplainer.text` |
| `fdaIndications` | L | Obsessions and compulsions in obsessive-compulsive disorder | label receipt |
| `generic` | L | clomipramine | label receipt |
| `inpatientUses` | J | **OCD treatment when a specialist judges the benefits to outweigh seizure, cardiac and overdose risks** — offLabel: False; evidenceIds: [] | **authored:** `inpatientUses` |
| `interactions` | J | cyp: substrateOf: 2D6; 1A2<br>keyTraps: Contraindicated with MAOIs and during acute recovery after myocardial infarction; confirm switch and washout intervals.; CYP2D6 inhibitors and fluvoxamine can raise TCA exposure. Review plasma-level monitoring with pharmacy.; Other anticholinergic or sedating drugs add adverse effects; overdose can be fatal.<br>interactionCardIds: — | **authored:** `interactions` |
| `labelVersionDate` | L | 2024-11-26 | label receipt |
| `mechanism.t1` | J | The mechanism in OCD is uncertain; inhibition of serotonin reuptake is thought to be important. | **authored:** `mechanism.t1` |
| `monitoring` | J | baseline: Assess suicide and overdose risk, bipolar history, seizures and cardiac disease; Review anticholinergic burden and interacting antidepressants<br>ongoing: Orthostasis, pulse and cardiac symptoms; Clinical worsening, suicidality and mania; Seizures and anticholinergic effects; consider TCA levels with interacting drugs<br>sourcePage: med_monitoring.md | **authored:** `monitoring` |
| `rxcui` | L | 2597 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What is the labeled role of this medication? | `fdaIndications` | Obsessions and compulsions in obsessive-compulsive disorder |
| Which interactions or contraindications need review? | `interactions.keyTraps` | Contraindicated with MAOIs and during acute recovery after myocardial infarction; confirm switch and washout intervals.; CYP2D6 inhibitors and fluvoxamine can raise TCA exposure. Review plasma-level monitoring with pharmacy.; Other anticholinergic or sedating drugs add adverse effects; overdose can be fatal. |
| What should you monitor during treatment? | `monitoring.ongoing` | Orthostasis, pulse and cardiac symptoms; Clinical worsening, suicidality and mania; Seizures and anticholinergic effects; consider TCA levels with interacting drugs |

Mapping hash `fd2f5ba99335` · pending

Linked: evidence — · questions qb_anx_014

---

## naloxone (naloxone)

Safety level **high** · review status **pending** · J-field hash `c71b6869f1c1`

### 1. Decide

**Authored with no attested source (read these closely):** `class`, `mechanism.t1`, `inpatientUses`, `dosing.titration`, `dosing.forms`, `monitoring`, `adverseEffects`, `interactions`, `attendingAsks`, `familyExplainer.text`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 7242 (naloxone, IN) |
| Reference label | [NARCAN · 2026-08-17](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a0ebc83d-2892-40de-bc0a-775ce90b30db) — Emergent Devices Inc., chosen by referenceBrand |
| Boxed warning | absent on reference; 0 of 78 matched labels carry one |
| Brands seen in openFDA | NARCAN; NARCAN NALOXONE HCI; Narcan Naloxone HCL; RiVive; ZIMHI |

> **Label indications (lead):** Uses to “revive” someone during an overdose from many prescription pain medications or street drugs such as heroin this medicine can save a life

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects` | J | common: Opioid withdrawal symptoms, including shaking, sweating and nausea<br>dangerous: **Recurrent opioid toxicity** — recognize: The person becomes very sleepy again or is not breathing well.; firstMove: Activate emergency response, support breathing under the emergency protocol and follow product instructions for further naloxone. | **authored:** `adverseEffects` |
| `attendingAsks` | J | What is the labeled role of this medication?; Which interactions or contraindications need review?; What should you monitor during treatment? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | False | label receipt |
| `brands` | L | NARCAN | label receipt |
| `class` | J | Opioid antagonist | **authored:** `class` |
| `dailymedSetId` | L | a0ebc83d-2892-40de-bc0a-775ce90b30db | label receipt |
| `dosing.forms` | J | other | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=a0ebc83d-2892-40de-bc0a-775ce90b30db | label receipt |
| `dosing.titration` | J | This card refers to the nasal rescue device. Follow its current instructions for use; each device is single-use. Do not test it before use. Emergency assessment is required even after awakening. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | This spray can save a life in an opioid overdose. Use it if the person will not wake up or is not breathing well. Get emergency help at once. Stay with the person. They may get sleepy again. Follow the spray box steps. | **authored:** `familyExplainer.text` |
| `fdaIndications` | L | Emergency treatment of known or suspected opioid overdose (selected nasal product) | label receipt |
| `generic` | L | naloxone | label receipt |
| `inpatientUses` | J | **Opioid overdose rescue and discharge education for patients and families at opioid risk** — offLabel: False; evidenceIds: [] | **authored:** `inpatientUses` |
| `interactions` | J | cyp: —<br>keyTraps: Reversal may wear off before the opioid effect; remain with the person and follow the device instructions for additional treatment.; Naloxone does not replace emergency medical care or ongoing treatment of opioid use disorder.<br>interactionCardIds: — | **authored:** `interactions` |
| `labelVersionDate` | L | 2026-08-17 | label receipt |
| `mechanism.t1` | J | Opioid receptor antagonism reverses opioid effects, including respiratory depression. | **authored:** `mechanism.t1` |
| `monitoring` | J | baseline: Assess responsiveness and breathing in suspected overdose; Arrange emergency help and review the selected device instructions<br>ongoing: Breathing and responsiveness until emergency help arrives; Recurrent sedation and withdrawal symptoms<br>sourcePage: t_sud.md | **authored:** `monitoring` |
| `rxcui` | L | 7242 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What is the labeled role of this medication? | `fdaIndications` | Emergency treatment of known or suspected opioid overdose (selected nasal product) |
| Which interactions or contraindications need review? | `interactions.keyTraps` | Reversal may wear off before the opioid effect; remain with the person and follow the device instructions for additional treatment.; Naloxone does not replace emergency medical care or ongoing treatment of opioid use disorder. |
| What should you monitor during treatment? | `monitoring.ongoing` | Breathing and responsiveness until emergency help arrives; Recurrent sedation and withdrawal symptoms |

Mapping hash `fd2f5ba99335` · pending

Linked: evidence samhsa-tip63-2021, asam-oud-2020 · questions qb_sud_008

---

## valbenazine (valbenazine)

Safety level **high** · review status **pending** · J-field hash `4847ff8b9495`

### 1. Decide

**Authored with no attested source (read these closely):** `class`, `mechanism.t1`, `inpatientUses`, `dosing.titration`, `dosing.forms`, `monitoring`, `adverseEffects`, `interactions`, `attendingAsks`, `familyExplainer.text`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 1918219 (valbenazine, IN) |
| Reference label | [INGREZZA · 2026-04-17](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4c970164-cafb-421f-9eb5-c226ef0a3417) — Neurocrine Biosciences, Inc., chosen by referenceBrand |
| Boxed warning | present on reference; 1 of 1 matched labels carry one |
| Brands seen in openFDA | INGREZZA; INGREZZA Sprinkle |

> **Label indications (lead):** 1 INDICATIONS AND USAGE INGREZZA and INGREZZA SPRINKLE are indicated for the treatment of adults with: - tardive dyskinesia [see Clinical Studies ( 14.1 )] . - chorea associated with Huntington’s disease [see Clinical Studies ( 14.2 )] . INGREZZA and INGREZZA SPRINKLE are vesicular monoamine transporter 2 (VMAT2) inhibitors indicated for the treatment of adults with: - tardive dyskinesia. ( 1 ) - chorea associated with Huntington’s disease. ( 1 )

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects` | J | common: Somnolence; Sedation<br>dangerous: **Neuroleptic malignant syndrome** — recognize: Fever, rigidity, altered mental status and autonomic instability.; firstMove: Discontinue the drug and obtain emergency medical assessment.<br>**Angioedema** — recognize: Face or throat swelling, especially with trouble breathing.; firstMove: Discontinue the drug and obtain emergency care. | **authored:** `adverseEffects` |
| `attendingAsks` | J | What is the labeled role of this medication?; Which interactions or contraindications need review?; What should you monitor during treatment? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Increased risk of depression and suicidal thoughts and behavior in patients with Huntington disease. | label receipt |
| `brands` | L | INGREZZA | label receipt |
| `class` | J | VMAT2 inhibitor | **authored:** `class` |
| `dailymedSetId` | L | 4c970164-cafb-421f-9eb5-c226ef0a3417 | label receipt |
| `dosing.forms` | J | PO | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4c970164-cafb-421f-9eb5-c226ef0a3417 | label receipt |
| `dosing.titration` | J | Confirm capsule versus sprinkle product instructions. Adjust with pharmacy for hepatic impairment and CYP interactions. Avoid use with congenital long QT syndrome or arrhythmias associated with prolonged QT. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | This drug can help with unwanted movements. It may make you sleepy or slow. Tell the team about stiff muscles, fever or trouble breathing. If you have Huntington disease, it may worsen mood. Tell the team right away about new thoughts of self-harm. | **authored:** `familyExplainer.text` |
| `fdaIndications` | L | Tardive dyskinesia in adults; Chorea associated with Huntington disease in adults | label receipt |
| `generic` | L | valbenazine | label receipt |
| `inpatientUses` | J | **Treatment of established tardive dyskinesia after confirming the movement-disorder diagnosis** — offLabel: False; evidenceIds: [] | **authored:** `inpatientUses` |
| `interactions` | J | cyp: substrateOf: 3A4<br>inhibits: —<br>keyTraps: Avoid MAOI combinations; strong CYP3A4 inducers are not recommended.; Strong CYP3A4 or CYP2D6 inhibitors and CYP2D6 poor metabolizer status require label-specific adjustment; monitor digoxin concentrations when coadministered.<br>interactionCardIds: — | **authored:** `interactions` |
| `labelVersionDate` | L | 2026-04-17 | label receipt |
| `mechanism.t1` | J | Reversible VMAT2 inhibition is thought to mediate the effect; the exact mechanism in tardive dyskinesia and Huntington chorea is unclear. | **authored:** `mechanism.t1` |
| `monitoring` | J | baseline: Confirm tardive dyskinesia versus other movement disorders; Assess depression and suicide risk, especially in Huntington disease; Review QT risk and CYP interactions<br>ongoing: Movement symptoms, sedation, akathisia and parkinsonism; New or worsening depression or suicidality; Assess QT interval before increases in patients at increased QT risk<br>sourcePage: med_monitoring.md | **authored:** `monitoring` |
| `rxcui` | L | 1918219 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What is the labeled role of this medication? | `fdaIndications` | Tardive dyskinesia in adults; Chorea associated with Huntington disease in adults |
| Which interactions or contraindications need review? | `interactions.keyTraps` | Avoid MAOI combinations; strong CYP3A4 inducers are not recommended.; Strong CYP3A4 or CYP2D6 inhibitors and CYP2D6 poor metabolizer status require label-specific adjustment; monitor digoxin concentrations when coadministered. |
| What should you monitor during treatment? | `monitoring.ongoing` | Movement symptoms, sedation, akathisia and parkinsonism; New or worsening depression or suicidality; Assess QT interval before increases in patients at increased QT risk |

Mapping hash `fd2f5ba99335` · pending

Linked: evidence — · questions —

---

## deutetrabenazine (deutetrabenazine)

Safety level **high** · review status **pending** · J-field hash `b543a18e5a04`

### 1. Decide

**Authored with no attested source (read these closely):** `class`, `mechanism.t1`, `inpatientUses`, `dosing.titration`, `dosing.forms`, `monitoring`, `adverseEffects`, `interactions`, `attendingAsks`, `familyExplainer.text`

### 2. Label facts (script-verified 2026-10-02)

| Item | Value |
|---|---|
| RxNorm | 1876905 (deutetrabenazine, IN) |
| Reference label | [Austedo · 2025-02-28](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7ea3c60a-45c7-44cc-afc2-d87fa53993c0) — Teva Neuroscience, Inc., chosen by referenceBrand |
| Boxed warning | present on reference; 1 of 1 matched labels carry one |
| Brands seen in openFDA | Austedo; AUSTEDO XR |

> **Label indications (lead):** 1 INDICATIONS AND USAGE AUSTEDO XR ® and AUSTEDO ® are indicated in adults for the treatment of: chorea associated with Huntington’s disease [see Clinical Studies ( 14.1 )] tardive dyskinesia [see Clinical Studies ( 14.2 )] AUSTEDO XR and AUSTEDO are vesicular monoamine transporter 2 (VMAT2) inhibitors indicated in adults for the treatment of: Chorea associated with Huntington’s disease ( 1 ) Tardive dyskinesia ( 1 )

### 3. Card fields

| Field | Class | Value | Drawn from |
|---|---|---|---|
| `adverseEffects` | J | common: Somnolence; Diarrhea; Dry mouth; Fatigue<br>dangerous: **Neuroleptic malignant syndrome** — recognize: Fever, rigidity, altered mental status and autonomic instability.; firstMove: Discontinue the drug and obtain emergency medical assessment. | **authored:** `adverseEffects` |
| `attendingAsks` | J | What is the labeled role of this medication?; Which interactions or contraindications need review?; What should you monitor during treatment? | **authored:** `attendingAsks` |
| `boxedWarning.present` | L | True | label receipt |
| `boxedWarning.summary` | L | Increased risk of depression and suicidal thoughts and behavior in patients with Huntington disease. | label receipt |
| `brands` | L | Austedo | label receipt |
| `class` | J | VMAT2 inhibitor | **authored:** `class` |
| `dailymedSetId` | L | 7ea3c60a-45c7-44cc-afc2-d87fa53993c0 | label receipt |
| `dosing.forms` | J | PO; ER | **authored:** `dosing.forms` |
| `dosing.labelLink` | L | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7ea3c60a-45c7-44cc-afc2-d87fa53993c0 | label receipt |
| `dosing.titration` | J | Verify immediate-release versus extended-release formulation and food instructions. Titrate individually with pharmacy and use label-specific restrictions for CYP2D6 inhibitors or poor metabolizers; hepatic impairment is contraindicated. | **authored:** `dosing.titration` |
| `familyExplainer.text` | J | This drug can help with unwanted movements. It may make you tired or slow. Tell the team about stiff muscles or fever. If you have Huntington disease, it may worsen mood. Tell the team right away about new thoughts of self-harm. | **authored:** `familyExplainer.text` |
| `fdaIndications` | L | Chorea associated with Huntington disease in adults; Tardive dyskinesia in adults | label receipt |
| `generic` | L | deutetrabenazine | label receipt |
| `inpatientUses` | J | **Treatment of established tardive dyskinesia after confirming the movement-disorder diagnosis** — offLabel: False; evidenceIds: [] | **authored:** `inpatientUses` |
| `interactions` | J | cyp: substrateOf: 2D6<br>keyTraps: Contraindicated with hepatic impairment, reserpine, MAOIs, tetrabenazine or valbenazine; confirm washout requirements in the label.; Contraindicated in Huntington disease with suicidality or untreated or inadequately treated depression.; Strong CYP2D6 inhibitors, including bupropion, increase active-metabolite exposure; alcohol and sedatives add sedation. Antipsychotics can increase parkinsonism, akathisia and NMS risk.<br>interactionCardIds: — | **authored:** `interactions` |
| `labelVersionDate` | L | 2025-02-28 | label receipt |
| `mechanism.t1` | J | Active metabolites reversibly inhibit VMAT2; the exact mechanism for the therapeutic effect is unclear. | **authored:** `mechanism.t1` |
| `monitoring` | J | baseline: Confirm movement-disorder diagnosis and hepatic status; Assess depression and suicide risk, especially in Huntington disease; Review interacting VMAT2 agents, MAOIs and CYP2D6 inhibitors<br>ongoing: Movement symptoms, mood and suicide risk; Sedation, akathisia and parkinsonism; Review QT risk when clinical factors or other drugs increase risk<br>sourcePage: med_monitoring.md | **authored:** `monitoring` |
| `rxcui` | L | 1876905 | label receipt |

### 4. Flashcard mapping (gate G1b: which approved field answers each ask)

| Ask | Revealed from | Card back (verbatim) |
|---|---|---|
| What is the labeled role of this medication? | `fdaIndications` | Chorea associated with Huntington disease in adults; Tardive dyskinesia in adults |
| Which interactions or contraindications need review? | `interactions.keyTraps` | Contraindicated with hepatic impairment, reserpine, MAOIs, tetrabenazine or valbenazine; confirm washout requirements in the label.; Contraindicated in Huntington disease with suicidality or untreated or inadequately treated depression.; Strong CYP2D6 inhibitors, including bupropion, increase active-metabolite exposure; alcohol and sedatives add sedation. Antipsychotics can increase parkinsonism, akathisia and NMS risk. |
| What should you monitor during treatment? | `monitoring.ongoing` | Movement symptoms, mood and suicide risk; Sedation, akathisia and parkinsonism; Review QT risk when clinical factors or other drugs increase risk |

Mapping hash `fd2f5ba99335` · pending

Linked: evidence — · questions —
