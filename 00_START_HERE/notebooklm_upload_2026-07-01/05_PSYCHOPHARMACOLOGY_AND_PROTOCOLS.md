# 05 Psychopharmacology And Protocols

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

Grouped source bundle for NotebookLM. It concatenates safe Markdown/text material from the listed library sections while preserving source paths.

PHI rule: this source intentionally excludes known patient-identifying files, audit artifacts with MRN-like paths, source pointer files, and case-specific filenames. Use synthetic or de-identified examples only.

---



---

## Source: `05_Psychopharmacology/Protocol_Library/README.md`

# Protocol Library

Order-set protocols (pull in or keep referenced):
- Benzodiazepine taper -> `~/BHU2_Benzodiazepine_Taper_Checklist.html` + `~/Benzodiazepine_Taper_OrderSet_Spec.docx`
- Clozapine post-REMS -> `~/BHU2_Clozapine_PostREMS_Workflow.html` + `~/Clozapine_PostREMS_OrderSet_Spec.docx`
- Delirium order set -> `~/Delirium_OrderSet_Spec.docx`
- Restraint order set -> `~/Restraint_PhysicalHolding_OrderSet_Spec.docx`


---

## Source: `05_Psychopharmacology/Protocol_Library/protocol_library_inpatient.md`

# Protocol Library - Inpatient Order Sets

> **Review status:** curated index of unit protocols - **confirm against the current institutional order sets before clinical use.**

**What this is.** A teaching index of the structured order sets used on the unit. These are *institutional protocols* - this page orients you to what each is for and when it's used. **Always pull exact medications, doses, and monitoring from the live EHR order set, not from memory or from this page.**

## Withdrawal
- **Alcohol withdrawal (CIWA-Ar-driven).** Symptom-triggered benzodiazepine dosing scored on the CIWA-Ar, with escalation for seizure/delirium-tremens risk; thiamine before glucose. Practice the scoring with the **Withdrawal (CIWA-Ar/COWS) card**.
- **Opioid withdrawal (COWS-driven).** COWS scoring guides supportive care and buprenorphine induction once objective withdrawal is present. Same card.
- **Benzodiazepine taper.** A structured, gradual taper to prevent withdrawal seizures/destabilization (the unit's BHU2 benzodiazepine-taper order-set spec).

## Antipsychotic safety
- **Clozapine workflow.** Initiation and continuation with the required hematologic monitoring (ANC for agranulocytosis), plus vigilance for myocarditis, ileus, seizure, and metabolic effects (the unit's BHU2 clozapine workflow + order-set spec).

## Acute safety
- **Delirium prevention/management order set.** Bundles the non-pharmacologic measures first, plus judicious, time-limited pharmacology (the unit's BHU2 delirium order-set spec). See the **delirium guidance**.
- **Agitation / restraint & physical-holding.** The least-restrictive pathway, time-limited orders, monitoring, and debrief (the unit's BHU2 restraint/physical-holding checklist + order-set spec). See the **agitation & restraint guidance**.

## Suicide & disposition
- **C-SSRS + safety-planning EHR fields** and the **safer-discharge checklist** structure risk documentation and the discharge handoff. See the **suicide-risk & safety tools (C-SSRS)**.

## How to use this as a student
Know *which* protocol applies and *why*; open the EHR order set for the specifics; and never titrate or modify a protocol without your supervising clinician. Protocols encode institutional and regulatory standards - follow them, and ask when a patient doesn't fit.

*Joshua Moss, MD | Psychiatrist * Curated index; confirm against current institutional order sets. Educational; no PHI.*
Included text sources: 5



---

## Source: `05_Psychopharmacology/README.md`

# 05 * Psychopharmacology
Two tiers: a **student primer** (to build) sitting above your **faculty protocol library** (exists).

### Student_Primer_Top10 -  Expand (P1)
Author "Top-10 inpatient drugs" student tier (sources: protocol library below + ASCP Psychopharmacology Curriculum 11th ed in iCloud Gen Psych Resources).

### Protocol_Library - [yes] Exists
- Benzodiazepine taper -> `~/BHU2_Benzodiazepine_Taper_Checklist.html` + `~/Benzodiazepine_Taper_OrderSet_Spec.docx`
- Clozapine post-REMS -> `~/BHU2_Clozapine_PostREMS_Workflow.html` + `~/Clozapine_PostREMS_OrderSet_Spec.docx`
- Delirium / restraint order-set specs -> `~/Delirium_OrderSet_Spec.docx`, `~/Restraint_PhysicalHolding_OrderSet_Spec.docx`

**Status tags:** [yes] Exists *  Revise *  Expand *  Create *  Merge *  Archive


---

## Source: `05_Psychopharmacology/Student_Primer_Top10/README.md`

# Student Psychopharm Primer (Top-10 inpatient)

Draws on the Core-Topics one-pagers (`03_Core_Topics/*`), the Protocol Library (above), and the ASCP Psychopharmacology Curriculum (iCloud  Gen Psych Resources). See `_source/` for pulled references.


---

## Source: `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md`

# Psychopharmacology Primer - Inpatient Essentials

> **Review status:** AI-drafted, evidence-anchored - **pending Dr. Moss's review/attestation before learner use.**

**In one line.** You don't need to dose like an attending; you need to know the high-yield classes, how drugs are chosen, and the medication emergencies you must never miss. Get those three things and you'll be useful on rounds from day one.

**The inpatient toolbox (by class).** Think in classes, not brand names. *Antipsychotics* are the workhorses for psychosis, mania, and agitation. The single most useful framing comes from CATIE: choose by side-effect profile, not by "newer is better" - agents differ more in what they do to weight, glucose, lipids, prolactin, QTc, and movement than in raw efficacy. Whatever the choice, metabolic monitoring is part of the prescription: baseline weight, glucose, and lipids, then ongoing tracking. *Mood stabilizers* split into two anchors. Lithium has a narrow therapeutic window - too little does nothing, too much is toxic - and demands renal and thyroid monitoring over time; it also carries the strongest anti-suicidal evidence in the class, which is worth remembering when the team weighs risk. Valproate is effective but should not be started in people who may become pregnant given teratogenicity; flag this before it's ordered. *Antidepressants/SSRIs* are first-line for depression and anxiety, but two cautions matter on an inpatient unit: screen for bipolarity before starting (an antidepressant alone can destabilize bipolar illness), and remember onset is delayed - symptom relief lags weeks behind the first dose, so manage expectations and keep watching. *Benzodiazepines* are genuinely useful for alcohol/sedative withdrawal, catatonia, and short-term agitation - but avoid standing scheduled use. Dependence, falls, and delirium (especially in older adults) are the price of leaving them on autopilot. *Clozapine* is the agent for treatment-resistant schizophrenia, reserved precisely because it requires mandatory ANC monitoring for agranulocytosis - it is uniquely effective and uniquely demanding.

**Medication emergencies you must recognize.** Your job is recognition and escalation, not titrating an antidote. *Serotonin syndrome:* clonus, hyperreflexia, and autonomic instability with rapid onset, usually after a serotonergic agent was started or increased. *Neuroleptic malignant syndrome:* "lead-pipe" rigidity, hyperthermia, and elevated CK in someone on a dopamine blocker - slower and stiffer than serotonin syndrome. *Lithium toxicity:* tremor, ataxia, and confusion, often when something changed (dehydration, renal function, an interacting drug). *QTc prolongation / torsades:* a quiet risk that becomes loud - know which agents prolong QTc and that the danger is the arrhythmia, not the number alone. *Anticholinergic toxicity:* the classic dry, flushed, agitated, delirious picture from cumulative anticholinergic burden. *Clozapine red flags:* agranulocytosis / low ANC, myocarditis, ileus, and lowered seizure threshold - any of these is a "tell someone now" finding.

**Monitoring essentials.** Tie monitoring to the drug: metabolic panel plus weight for antipsychotics; lithium levels with renal and thyroid studies; the ANC for clozapine on its required schedule; and a QTc when an agent or combination warrants it. Monitoring isn't paperwork - it's how these drugs stay safe, and it operationalizes measurement-based care.

**What the student does.**
- Verify baseline labs are actually back before a new agent starts - metabolic panel, renal/thyroid for lithium, ANC for clozapine.
- Track ongoing metabolic monitoring (weight, glucose, lipids) for every patient on an antipsychotic and surface what's due.
- Recognize a suspected medication emergency early and escalate to your resident or attending immediately - speed matters more than certainty.
- Reconcile the medication list at admission and transitions; catch duplications, interactions, and stacked anticholinergic or QTc-prolonging agents.

**High-yield pearls.**
- Choose antipsychotics by side-effect profile (CATIE), not by recency.
- Lithium is narrow-window and the anti-suicidal anchor - monitor renal and thyroid.
- Don't start an SSRI without screening for bipolarity, and expect delayed onset.
- Benzodiazepines: short-term and targeted, never autopilot - falls, delirium, dependence.
- Clozapine's power comes packaged with mandatory ANC monitoring; respect the red flags.

**Pair with** the protocol library, the Withdrawal (CIWA-Ar/COWS) card, and the Mood and Psychosis pages. This is a recognition and framework primer, not a dosing guide - defer all dosing to those references and your institutional protocol.

*Joshua Moss, MD | Psychiatrist * Educational; fictional composites only, no PHI.*

## Key psychopharmacology papers - a ranked reading list

Twenty trials and analyses that shaped modern prescribing, ranked by impact. Papers tagged *(in the landmark set)* are in the hub's [Landmark Trials - Listen & Test](?page=landmark_trials.md) audio + self-test collection - start there for the deep dive; the rest are worth knowing as you build depth.

1. **Cipriani et al.** - Comparative Efficacy of 21 Antidepressants (SSRIs/SNRIs/Others) * *(in the landmark set)*
2. **STARD** - The Reality of Antidepressant Treatment (SSRIs/Switching/Augmentation) * *(in the landmark set)*
3. **CATIE** - The End of the FGA/SGA Myth (Antipsychotics) * *(in the landmark set)*
4. **Kane et al.** - Clozapine for Treatment-Resistant Schizophrenia (Clozapine) * *(in the landmark set)*
5. **BALANCE Trial** - Lithium vs. Valproate for Bipolar Maintenance (Lithium) * *(in the landmark set)*
6. **Cipriani et al.** - Lithium and Suicide Prevention (Lithium)
7. **UK ECT Review Group** - Definitive ECT Efficacy (ECT) * *(in the landmark set)*
8. **Sackeim et al.** - Post-ECT Relapse Prevention (ECT + Pharmacotherapy) * *(in the landmark set)*
9. **Zarate et al.** - Ketamine for Treatment-Resistant Depression (Ketamine)
10. **Tiihonen et al.** - Real-World Antipsychotic Effectiveness and LAIs (LAIs)
11. **MTA Cooperative Group** - Multimodal Treatment of ADHD (Stimulants) * *(in the landmark set)*
12. **Turner et al.** - Publication Bias in Antidepressant Trials (SSRIs)
13. **Leucht et al.** - Maintenance Antipsychotic Treatment, NNT=3 (Antipsychotics) * *(in the landmark set)*
14. **Fudala et al.** - Buprenorphine/Naloxone for Opioid Use Disorder (Buprenorphine)
15. **Saitz et al.** - Symptom-Triggered Benzodiazepine Dosing for Alcohol Withdrawal (Benzodiazepines)
16. **Pillinger et al.** - Metabolic Effects of 18 Antipsychotics (Antipsychotics)
17. **Kaul et al.** - Xanomeline-Trospium: The First Non-Dopaminergic Antipsychotic (Novel Mechanism)
18. **Hammad et al. / Bridge et al.** - The FDA Black Box Warning (Antidepressants in Youth) * *(in the landmark set)*
19. **Furukawa et al.** - Optimal SSRI Dosing (SSRIs)
20. **Lichtenstein et al.** - ADHD Medication Reduces Criminality (Stimulants)

*Source: a ranked psychopharmacology curriculum (OpenEvidence); AI-drafted, pending faculty attestation - verify citations before clinical use.*
