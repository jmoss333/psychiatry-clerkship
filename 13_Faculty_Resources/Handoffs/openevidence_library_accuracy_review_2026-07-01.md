# OpenEvidence → Clerkship Library: Accuracy & Completeness Review

**Date:** 2026-07-01 · **For:** Joshua Moss, MD · **Sources this run:** 3 of the 12 new files detected in `OPENEVIDENCE RAW FILES TO REVIEW/` — **QTc Prolongation Risk with Psychotropic and Commonly Co-Prescribed Medications**, **Acute Agitation in Adult Inpatient and Emergency Psychiatry**, and **Alcohol Withdrawal and Alcohol Use Disorder Management on Adult Inpatient Psychiatry Units**.

> **How to read this.** Every item is tagged **[MS3] / [Resident] / [both]** and **P1** (accuracy/safety — fix first) or **P2** (completeness/nuance). Each cites the paper. Nothing here has been edited into the library yet — this is the decision memo. All added clinical numbers should pass your attestation gate before learner release. Where I could not confirm the library's current wording, I wrote "verify."

> **Scope note.** 12 files landed since the last scan (2026-06-30 memo); the automation processes a few per run and tracks progress via the manifest. This run did a full pass on the three most safety-critical/high-yield files above. **Nine files remain for next run:** Brief Psychotherapeutic Interventions, Child and Adolescent Psychiatry for Adult Psychiatrists, Consultation-Liaison Psychiatry, Discharge Planning, Family Involvement and Family Interventions, Perinatal and Reproductive Psychiatry, Social Determinants of Health, and **two files both titled "Inpatient Psychiatric Management of Borderline Personality Disorder"** — one 95,513 chars, one 41,587 chars. These are *not* simple duplicates (very different lengths) and should be manually reconciled/diffed before review — flagging rather than guessing which is authoritative.

---

## Priority actions (do these first)

1. **[both][P1] Fix a wrong citation on the QTc rounds question.** `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` Q14 currently reads: *"Key paper: AHA Scientific Statement, Page et al., Circulation 2016."* That Page et al. 2016 AHA statement is **"Drugs That May Cause or Exacerbate Heart Failure"** — not a QTc/torsades statement. The correct source for the QTc/TdP action thresholds is **Tisdale JE et al., "Drug-Induced Arrhythmias: A Scientific Statement From the American Heart Association," Circulation 2020;142(15):e214-e233** (or Drew BJ et al., "Prevention of Torsade de Pointes in Hospital Settings," Circulation 2010, for the original statement). The QTc ≥500 ms / Δ≥60 ms threshold already in the library text is numerically correct — only the citation is wrong.
2. **[both][P1] The naltrexone/acamprosate "or" framing on the Substance Use page is still uncorrected** (this repeats item 5 from the 2026-06-30 memo, now with sharper numbers from a second source). Current text: *"For ongoing alcohol use disorder, offer **naltrexone or acamprosate**."* COMBINE (N=1,383): naltrexone effective (80.6% vs 75.1% days abstinent; P=.009); **no evidence of efficacy for acamprosate in any arm**. VA/DoD 2021 elevated **topiramate** to first-line alongside naltrexone and downgraded acamprosate to "suggested"; APA 2018 still lists both co-first-line — so this is a genuine guideline split, but presenting them as an undifferentiated "or" is no longer defensible.
3. **[both][P1] CIWA-Ar has no self-report caveat on the Substance Use page — exactly the gap that matters for a psychiatry unit.** Current text: *"score serially with the **CIWA-Ar** and treat symptom-driven with **benzodiazepines**"* — no mention that 6 of 10 CIWA-Ar items require patient self-report, or that ASAM 2020 **explicitly recommends against using CIWA-Ar in patients with delirium**. Psychosis, cognitive impairment, and communication barriers — all disproportionately common on psychiatric units — invalidate the scale. A retrospective review found 57% of patients placed on a CIWA-Ar protocol had zero or one documented AWS risk factor, and benzodiazepine-associated adverse events occurred in 15% of misapplied protocols.
4. **[both][P1] Thiamine dosing has no actual number on the Substance Use page.** Current text: *"Give **thiamine before glucose**"* (correct principle, no dose). The evidence review is explicit that the standard "banana bag" (100 mg oral/IV) is **"pharmacokinetically inadequate for CNS repletion."** Practical standard: **parenteral thiamine 200–500 mg IV/IM daily for ≥3 days** before transitioning to oral; if any Wernicke signs (confusion, ataxia, oculomotor abnormalities — present in <⅓ of cases, so don't wait for the full triad) → **500 mg IV TID**.

---

## A. QTc Prolongation → Psychopharm primer, Advanced Psychopharmacology (resident), Rounds Questions

*Source: QTc Prolongation Risk review — AHA/ACC/HRS, FDA safety communications, Tisdale 2020, network meta-analyses through 2026.*

- **[both][P1] Citation fix (see Priority Action 1 above).**
- **[Resident][P2] The Tisdale Risk Score is citable and numeric but absent from the library.** Validated in 1,200 CCU patients (C-statistic 0.823): **Low (≤6): 15%** incidence of QTc prolongation; **Moderate (7–10): 37%**; **High (≥11): 73%**. In a 92,383-patient multi-center study, a modified Tisdale score carried **OR 4.80 (moderate risk)** and **OR 11.51 (high risk)** for inpatient mortality. High sensitivity (97%) but low specificity (16%) — better for ruling out risk than ruling it in. `adv_psychopharmacology.md` currently says only "audit cumulative QTc burden when stacking agents" — this gives residents an actual scoring tool to do that with.
- **[Resident][P2] Methadone-specific monitoring schedule is missing.** Methadone carries the highest QTc risk of drugs reviewed (34% pooled prevalence of QTc prolongation on MMT; 2% TdP incidence). APS/CPDD/HRS 2014 guideline: **ECG at methadone 30–40 mg/day and again at 100 mg/day**; QTc ≥500 ms → switch or immediate dose reduction. Not currently anywhere in the library that I could find.
- **[both][P2] Bupropion is the outlier worth naming explicitly.** Associated with **QTc shortening** in a large EHR study and not listed on CredibleMeds TdP risk lists — "potentially the safest antidepressant option when QTc risk is a concern." The psychopharm primer's medication-emergency section flags QTc risk conceptually but doesn't name a lowest-risk option; this is a concrete, easy addition.
- **[both][P2] Concrete antipsychotic/antidepressant risk ordering, with numbers, for the primer.** Antipsychotics (Schneider-Thoma, Lancet 2026, k=66 trials, n=21,022): highest QTc effect = sertindole, amisulpride, ziprasidone; lowest = brexpiprazole, aripiprazole, lurasidone; **aripiprazole is the only SGA with a mean QTc *decrease*** (−1.4 ms). Antidepressants: citalopram highest (FDA max 40 mg/d, 20 mg/d if age >60/hepatic impairment/CYP2C19 PM); duloxetine and bupropion lowest/none.
- **[Resident][P2] IV haloperidol nuance worth adding to the medication-emergency framing:** the 2007 FDA warning followed 70 case reports where **97% had additional risk factors**; the more recent MIND-USA secondary analysis (JAMA Network Open 2024) found **no clinically relevant QTc change** from haloperidol or ziprasidone in critically ill delirium patients with baseline QTc <550 ms. Useful nuance against treating IV haloperidol as reflexively dangerous — it's additive risk factors that matter most.
- **[both][P2] Electrolyte correction targets, with numbers:** K⁺ >4.0 mEq/L (acute TdP: 4.5–5.0), Mg²⁺ ≥2.0 mg/dL (IV MgSO₄ 1–2 g is first-line for acute TdP **regardless of serum level**), each 1 mg/dL drop in calcium raises QTc ~13 ms. None of these specific numbers appear in the current primer's "monitoring essentials" paragraph.

---

## B. Acute Agitation → Agitation & Restraint page

*Source: Acute Agitation evidence review — Project BETA, ACEP, 2026 Lancet Psychiatry IPD network meta-analysis, Six Core Strategies literature.*

**Framing note:** the current page is deliberately dose-free by design (*"Do not memorize specific drugs or doses from a teaching page — defer to your institution's agitation order set"*) — that design choice is sound and I am **not** recommending a dosing table. The gaps below are all at the conceptual/evidence level the page already operates at.

- **[both][P2] Antipsychotic monotherapy vs. combination — the page doesn't yet say *why* offered/collaborative PRN beats reaching for one agent alone.** 2026 individual-participant-data network meta-analysis (Siafis et al., Lancet Psychiatry, 18 trials, n=3,411): antipsychotic+benzodiazepine combinations far outperformed haloperidol monotherapy for sedation within 15–30 min (OR 12.93); **haloperidol monotherapy was among the least effective options and carried the highest EPS risk.** Cochrane (Ostinelli 2017): haloperidol alone produced significantly more adverse effects than haloperidol+promethazine (RR 2.01) — dystonia was common enough that the trial steering group deemed continuing monotherapy unethical. This directly supports and sharpens the page's existing "avoid... over-sedation" framing.
- **[both][P2] De-escalation has a citable time window.** Project BETA / APA 2022: verbal de-escalation is expected to work **within 5–10 minutes** for the majority of patients. The page recommends de-escalation "first" but gives no expected timeframe — useful for students who don't know how long to hold that step before escalating.
- **[both][P2] Restraint/seclusion standards are named too generically.** Current text: *"governed by CMS and Joint Commission standards"* — no specifics. Joint Commission 2024/2025 standards (effective Jan 1, 2025): **face-to-face evaluation within 1 hour of restraint initiation**; **maximum order duration 4 hours for adults**; continuous in-person observation required. These are concrete, testable facts (COMAT-relevant) currently missing.
- **[both][P2] The Six Core Strategies (6CS) framework is absent** despite being the best-evidenced restraint-reduction model and a natural fit for the page's existing trauma-informed-care framing. Multisite study (43 facilities): seclusion ↓17% (p=.002), restraint ↓30% (p=.03). Pennsylvania State Hospital System 10-year implementation: restraint duration fell 64% (6.6→2.4 min) with **all safety measures improved or unchanged** — a strong answer to "doesn't reducing restraint increase violence?"
- **[MS3][P2] Akathisia is already flagged as a can't-miss mimic on the page — worth cross-referencing the new agitation review's population-specific antipsychotic contraindication table**, e.g., Parkinson disease (avoid all D2 blockers; pimavanserin/clozapine/quetiapine only) and catatonia (antipsychotics may worsen; hold), both already named on the page's "Pair with" list — the specifics just aren't in the underlying Catatonia/Delirium pages yet per this review (see Next steps).

---

## C. Alcohol Withdrawal & AUD → Substance Use & Withdrawal page

*Source: Alcohol Withdrawal/AUD evidence review — ASAM 2020, VA/DoD 2021, APA 2018, COMBINE, and 2023 JAMA AUD meta-analysis.*

- **[both][P1] Naltrexone/acamprosate framing — see Priority Action 2.**
- **[both][P1] CIWA-Ar self-report caveat — see Priority Action 3.** Add: alternative objective scales exist for exactly the patients a psych unit sees most — **mMINDS** (no self-report required; preferred by 70% of ICU nurses over CIWA-Ar) and **RASS-AW** (no LOS/complication difference vs. CIWA-Ar in 1,073 patients). ASAM recommends CAM-ICU/RASS/Delirium Detection Score specifically for delirious patients.
- **[both][P1] Thiamine dose — see Priority Action 4.**
- **[Resident][P2] Symptom-triggered therapy (STT) needs an applicability caveat before being taught as the unqualified default.** The page says "treat symptom-driven with benzodiazepines" as if STT is simply correct. The 2019 meta-analysis showing STT superiority (6 RCTs, n=664; −60.4 hours treatment duration) was conducted in **specialized detox settings with low-risk patients; applicability to general hospital/inpatient psychiatry was rated low**, with insufficient evidence on hard outcomes (seizures, delirium, mortality) in any setting. ASAM's actual position: STT preferred *when patients can reliably self-report*; **fixed-dose protocols are the correct choice when they cannot** (psychiatric comorbidity, cognitive impairment, communication barriers) — which is a meaningfully different, more nuanced instruction than the page currently gives.
- **[Resident][P2] Phenobarbital is entirely absent from the page** despite growing evidence and increasing use (6.1%→18.4% of US hospitals, 2016–2020). Propensity-matched study (n=4,712/arm): lower seizures (RR 0.70) and DT (RR 0.52) vs. benzodiazepines. **Important caveat for this library specifically:** the review flags that phenobarbital loading is "challenging on most inpatient psychiatry units, which typically lack continuous cardiopulmonary monitoring" — i.e., this is real, citable content, but should probably be framed as "know this exists / resident-level awareness" rather than something to initiate on a psych unit without ICU-level monitoring.
- **[both][P2] Discharge MAUD initiation has a striking, motivating number missing from the page.** Target trial emulation (Medicare, n=9,834): discharge medication-for-AUD initiation associated with **42% reduction in 30-day all-cause mortality/readmission** (IRR 0.58). Yet only **~2% of alcohol-related hospitalizations** currently involve discharge MAUD initiation. The page already says "continuation of any alcohol use disorder pharmacotherapy started inpatient" as a discharge essential — this number gives it teeth.
- **[MS3][P2] Kindling is citable with a number.** Patients with ≥5 prior detoxifications: **48% withdrawal seizure rate** vs. 12% in controls. The page doesn't currently quantify "prior withdrawal/seizures" as a risk factor beyond naming it in the history-taking pearl.
- **[both][P2] Phenytoin pitfall is a clean addition.** Phenytoin is **ineffective for alcohol withdrawal seizures** and should not be used unless there's a concomitant underlying seizure disorder — a common resident misstep not currently addressed anywhere I found.

---

## Cross-cutting attestation flags

1. **QTc rounds-question citation (Page 2016 → Tisdale 2020)** is a clean, low-risk fix — wrong paper, right number — but still needs your sign-off since it's a citation correction in a shelf-facing document.
2. **Naltrexone/acamprosate "or" framing** has now been flagged by two independent OE reviews (BPD/landmark review 2026-06-30, and this Alcohol Withdrawal review) — recommend prioritizing this edit over the newer, single-source items above.
3. **Phenobarbital content** should carry an explicit "resident awareness, not a psych-unit protocol" framing given the monitoring-infrastructure caveat in the source review itself — flag for your judgment on how much operational detail belongs in a psychiatry (vs. medicine/ICU) teaching library.
4. Every number above should pass your "pending attestation" gate before learner release, consistent with the existing review-status banner on each page.

---

## Next steps

- **9 files remain** for subsequent runs: Brief Psychotherapeutic Interventions, Child and Adolescent Psychiatry for Adult Psychiatrists, Consultation-Liaison Psychiatry, Discharge Planning, Family Involvement and Family Interventions, Perinatal and Reproductive Psychiatry, Social Determinants of Health/Structural Competency, and the **two BPD files needing manual dedup** (95,513 vs 41,587 chars — please confirm which is current/authoritative, or whether both should be reviewed as distinct sources, before the next run processes them).
- Discharge Planning is a natural next pick given it directly extends the existing Discharge quality & suicide safety section from the 2026-06-30 memo.
- I can turn any subset of the above into **actual edits** (with the "pending attestation" banner) — say which pages.

---

# RUN 2 (2026-07-01, later) — remaining 9 files reviewed

**Scope:** the 9 files flagged "remain for next run" above — Brief Psychotherapy, Consultation-Liaison, Discharge Planning, Family Involvement, Perinatal, Social Determinants, Child/Adolescent, and the BPD duplicate pair (reconciled: same review, longer file is the superset — no unique content lost). Deduped against the 2026-06-30 memo and Run 1 above.

**Headline:** almost no factual *errors* — pages are conceptually sound. Value = **completeness (numbers) + two real content gaps** (a bedside brief-psychotherapy how-to page; a C-L resident numbers reference). Child/Adolescent is ~90% out of scope; SDOH handled surgically (clinical, not advocacy).

## Accuracy corrections (only two)
- **A1 · family_therapy_modalities_inpatient.md** — "high-EE ≈ 50% vs ≈ 21% relapse" is unsourced / not from the cited Butzlaff & Hooley meta. Replace with OR-based data: high-EE relapse **OR 4.87** (Ma 2021), warmth protective OR 0.35. *Verify original source before deleting.* [both · P1 · Maybe]
- **A2 · personality_disorders_inpatient_teaching.md** — "long stays… may worsen outcomes in chronic BPD" overstated; evidence shows **structure, not duration** drives outcome (Fowler 2018; Kujovic 2024). Reword to "unstructured, open-ended stays — not length itself — risk regression." [both · P2 · Yes]

## TIER 1 — drop-in numbers into existing pages (P1/P2, effort S)
- **Perinatal:** PP psychosis 1–2/1,000, onset 1–4 wk, recurrence 30–50%; BD postpartum relapse 35% (med-free 66% vs prophylaxis 23%); SSRI first-line sertraline/escitalopram. [P1]
- **Discharge/Suicide:** post-discharge suicide first week ≈2,950/100k PY (days 0–3 ≈6,062/100k, Chung 2017); ~12–15% 30-day readmission; firearms ~50% of suicides, CALM 3.3%→0.83% at 180d; family psychoed relapse 37%→10% (OR 0.18). [P1]
- **Family:** dose floor ≤2 sessions ineffective / NICE ≥10; bipolar family therapy OR 0.30 (SUCRA 95%, Miklowitz 2021); implementation 0–53%, barrier = clinician avoidance; ~12-mo benefit lag. [P1/P2]
- **SDOH (surgical):** restraint aOR 1.85 Black (ED OR 2.84) → Agitation page; cumulative SDOH readmission 11.5%→63.5% (aOR 12.55) + 7-day f/u HR 0.82 → evidence_inpatient housing line. [P1]
- **BPD:** benzos = highest suicide risk of any class (HR 1.61); NICE crisis rule (single agent, min dose, ≤1 wk); "skills for pills" + TIPP/chain-analysis unit tools. [P1/P2, attest]
- **Psychopharm primer:** antidepressant black-box spans all agents through age 24 (only in-scope item from Child/Adolescent review). [P1]

## TIER 2 — build (fills a real gap)
1. **Brief Psychotherapy on the Unit** — biggest opportunity; no learner-facing how-to exists (Week 3 README points to a nonexistent Psychotherapy folder). Match skill to crisis mechanism: BA (SMD −0.78), DBT/TIPP, chain analysis, MI, psychoeducation (readmission NNT 5), PST for repeat self-harm (13.5% vs 22.1%, NNT 12). [both · P1 · L]
2. **C-L resident quick-reference** — GAP. Serotonin syndrome vs NMS (Hunter criteria; restraints contraindicated in SS; cyproheptadine 12–32 mg), lithium toxicity (≥1.5; dialysis >4.0; charcoal ineffective), QTc thresholds. Resident-only; MS3 stays number-light. [Resident · P2 · M]
3. **Short SDOH/disparities page** (optional) — Housing First (SMD 1.24; ED IRR 0.63), CTI (OR 0.22), SDOH admission screen + structural discharge checklist, DSM-5-TR Cultural Formulation Interview as named tool. Keep clinical; drop advocacy framing. [both · P2 · M]

## TIER 3 — attestation-gated (stage, publish after Dr. Moss sign-off)
Perinatal teratogenicity/lactation numbers (lithium RR 1.65/NNT 3 vs NNH 33/fetal echo 16–20 wk; valproate ~9.3%/spina bifida 1–2%/IQ↓/ASD ×2.9; lamotrigine PK +230% by wk 32, cut ~25%/wk postpartum; lactation RIDs); catatonia lorazepam dosing (page currently says "don't quote a dose"); BPD benzo/stimulant HRs (observational — "verify"). **SDOH staged export had a corrupted (BPD) reference list — re-verify each SDOH number against primary source.**

## SKIP / scope boundary
Child/Adolescent review (~90% pediatric-specific) — deliberate adult boundary; C-L niche (transplant, steroid/PD psychosis) — optional resident reading; CTI/Housing-First for MS3 (resident overlay only).

## Recommended sequence
1) Tier 1 batch (one pass, ~15 numbers across 6 pages). 2) Tier 2 #1 Brief Psychotherapy page. 3) Tier 2 #2 C-L resident reference. 4) Tier 3 → attestation. 5) Tier 2 #3 SDOH page (optional).

*Joshua Moss, MD | Psychiatrist — decision memo; no pages edited.*

---

## SHIPPED 2026-07-01 (Tier 1 batch + Brief Psychotherapy page) — live on both sites

**Accuracy fixes:** A1 (family EE numbers → OR 4.87 / warmth 0.35, Butzlaff & Hooley reframed) · A2 (BPD "long stays" → "unstructured, open-ended stays, not length").

**Tier 1 numbers added:**
- Perinatal (`t_perinatal.md`): PP psychosis 1–2/1,000, onset 1–4 wk, recurrence 30–50%; BD relapse 66% off-med vs 23% on prophylaxis; SSRI first-line sertraline/escitalopram.
- Psychopharm primer: antidepressant black-box through age 24 (+ pearl).
- Discharge module (`exp_family.md`): post-discharge suicide window (2,950/100k first week), 12–15% 30-day readmission, firearms/CALM means-safety, family psychoed 37%→10%.
- Family modalities: ≤2-session dose floor, bipolar OR 0.30 (SUCRA 95%), implementation 0–53%/clinician avoidance. Playbook: 12-month benefit lag pearl.
- Agitation & Restraint: Black patients aOR 1.85 restraint (ED 2.84).
- Evidence-Based Inpatient (§12): cumulative SDOH readmission 11.5%→63.5% (aOR 12.55) + 7-day f/u HR 0.82.
- BPD (`t_personality.md`): benzos highest suicide risk (HR 1.61), NICE crisis-med rule, "skills not pills," TIPP/chain-analysis unit tools.

**New page:** **Brief Psychotherapy on the Unit** (`02_Clinical_Skills/Brief_Psychotherapy/`) — skill-to-mechanism table (BA, DBT/TIPP, chain analysis, PST, MI, psychoeducation, safety planning) + MGH bedside frame. Wired into MS3 + resident nav; Week 3 dead "Psychotherapy folder" link now points here.

**Still pending your eyes (worth a spot-check before you fully rely on them):** benzo suicide HR 1.61 (observational), restraint aOR 1.85, SDOH aOR 12.55 — newer/observational figures. **Tier 3 (teratogenicity/lactation/dosing) NOT shipped** — staged for attestation per your call.
