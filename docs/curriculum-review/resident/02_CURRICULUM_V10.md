# RESIDENT · Curriculum content — volume 10

Pages appear in sidebar order. Each page carries its `topic_meta.json` overlay (the TL;DR, key points, can't-miss line, rule-outs, first move, embedded quiz and workflow narration the SPA renders around the prose) followed by the page text exactly as shipped. Tools carry their registry metadata and their authored clinical strings.

# SECTION (cont.): Case of the Week

---

## Lithium — Monitoring & Toxicity (Aug 3)

- **Slug:** `cotw_20260803_lithium_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-08-03_lithium-monitoring-toxicity-interactions_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 3,811 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 10 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-08-03)

**TL;DR (shown above the page text):**

> A stable patient, an unchanged dose, and a level that tripled - lithium clearance is what changes, and in chronic toxicity the serum number understates how sick the patient is.

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
- **exam** — Teaching takeaway: A stable patient, an unchanged dose, and a level that tripled - lithium clearance is what changes, and in chronic toxicity the serum number understates how sick the patient is.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `pharm`, `mood`
- **EPA crosswalk:** `EPA3`, `EPA4`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-08-03"}

#### Page text (as shipped)

# Case of the Week — Resident Edition
## Lithium: Monitoring, Toxicity, and Drug Interactions

**Date:** 2026-08-03
**Learner level:** Psychiatry residents (PGY-1 through PGY-4); DSM-5-TR fluency assumed
**Format:** ~20–30 min small-group discussion. No required pre-reading.
**Citations:** Based on articles retrieved from PubMed. Full reference list at the end. All patient details are **synthetic and de-identified**.

---

### The Case (learner-facing stem)

You are the psychiatry consult resident. Medicine admits a **34-year-old woman with bipolar I disorder**, euthymic for six years on lithium monotherapy, for "altered mental status and acute kidney injury." The consult question is: *"Can she stay on lithium?"*

**History from the patient's sister (patient is a poor historian today):**

Her lithium dose has not changed in four years; historical levels have run 0.7–0.9. Eight weeks ago her primary care physician started **semaglutide** for weight management. She has had progressive nausea and early satiety since, eating "maybe one small meal a day," with intermittent vomiting over the past two weeks. She also takes **ibuprofen several times a week** for menstrual migraines — she has done this for years.

Over the last three weeks the family noticed a **worsening hand tremor**, then unsteadiness on stairs, then, in the last 48 hours, word-finding difficulty and confusion.

Two additional threads from the chart:
- She has reported **polyuria and polydipsia for at least two years** — documented as "drinks a lot of water" and never worked up.
- She and her partner have been **trying to conceive** for four months. She has not told her psychiatrist.

**Vitals:** T 36.9 °C, HR 96, BP 108/68 with orthostatic drop, RR 14.
**Neurologic exam:** Somnolent, arousable, oriented ×2. **Coarse action tremor**, **multifocal myoclonus**, **hyperreflexia with sustained clonus**, **truncal and gait ataxia**, dysarthria, gaze-evoked nystagmus. **No rigidity. No fever.** No focal weakness or asymmetry.
**Labs:** Na 138, K 3.6, **Cr 1.5 (baseline 1.0)**, BUN 34, eGFR 45. **Corrected Ca 10.9** (prior 10.4), **intact PTH 78 pg/mL** (elevated), **TSH 9.8 with normal free T4**, CK 180 (normal). Urine osmolality **180 mOsm/kg** with serum osmolality 296. β-hCG negative.
**Serum lithium: 1.9 mEq/L.**
**ECG:** Sinus rhythm, T-wave flattening, QTc 445 ms.

---

### Guided Discussion Questions

**Q1. Reconstruct the pharmacokinetics. Why did a patient on an unchanged dose for four years become toxic over eight weeks?**

*Teaching point:* Build this from lithium's disposition rather than from an interaction list. Lithium is a monovalent cation that is **not protein-bound**, **not hepatically metabolized**, distributes into a volume approximating total body water, and is cleared essentially entirely by the kidney — with the majority of the filtered load reabsorbed in the **proximal tubule in competition with sodium** [1,2]. Clearance therefore tracks GFR and inversely tracks proximal sodium avidity.

Layer her exposures onto that:

| Exposure | Mechanism | Net effect on lithium |
|---|---|---|
| **Semaglutide** (GLP-1 RA) | Reduced oral intake, nausea/vomiting, delayed gastric emptying, volume contraction | ↓ clearance; also erratic absorption |
| **Chronic NSAID** (ibuprofen) | Prostaglandin inhibition → ↓ renal blood flow, ↑ proximal Na/Li reabsorption | ↓ clearance |
| **Lithium-induced NDI** (see Q4) | Obligate free-water loss impairs volume defense | ↓ reserve against any insult |

A 2025 case series from Mayo described exactly this pattern: patients on stable lithium regimens who developed toxicity or unexpectedly elevated levels after semaglutide initiation, with the authors proposing altered kidney function, dehydration from reduced intake or GI losses, and delayed gastric emptying as candidate mechanisms — and recommending baseline renal function and lithium level before starting a GLP-1 RA, with more frequent monitoring during therapy [3]. This is a young literature and the evidence base is case-level, but given prescribing volumes it is a foreseeable interaction rather than an exotic one.

**Push the group:** what is the *rate-limiting* insult here? Most will say the NSAID because it has been chronic. The better answer is that the NSAID set the baseline margin narrow and the GLP-1 RA consumed what was left — a chronic exposure plus a new subacute one. That framing generalizes.

**Q2. Classify the toxicity and explain the dissociation between her serum level and her neurologic exam.**

*Teaching point:* Her level is 1.9 — barely above therapeutic — and she has multifocal myoclonus, sustained clonus, and encephalopathy. Residents should be able to explain this precisely.

Toxicity is conventionally classified as **acute** (naïve overdose), **chronic** (accumulation on maintenance), and **acute-on-chronic** [2]. The clinical distinction is driven by **two-compartment kinetics**: lithium crosses the blood–brain barrier slowly, so the CNS behaves as a deep compartment that equilibrates over hours to days.

- In **acute** poisoning, serum concentration transiently far exceeds CNS concentration → GI-predominant early presentation, level overstates severity.
- In **chronic** toxicity, the deep compartment is saturated → **neurotoxicity at modest serum levels**, level *understates* severity. This is her.

Two corollaries worth stating explicitly:
1. **There is no serum threshold that rules out toxicity in a maintenance patient.** Disposition is driven by exam.
2. **Post-dialysis rebound** is the same physics running backward — lithium redistributes from tissue into plasma after extracorporeal removal, so a reassuring immediate post-treatment level is not an endpoint (see Q5).

**Q3. Give a full differential for this neurologic syndrome, and name the complication that determines her long-term prognosis.**

*Teaching point:* The exam — myoclonus, clonus, ataxia, nystagmus, encephalopathy, **afebrile, normal tone, normal CK** — is fairly specific, but the differential is where residents earn their keep.

1. **Chronic lithium neurotoxicity** — *most likely.* Cerebellar and pyramidal signs with encephalopathy at a near-therapeutic level.
2. **Serotonin syndrome** — the closest mimic; clonus and hyperreflexia overlap almost completely. Distinguishing features: serotonergic agent exposure with a **temporally tight** onset, hyperthermia, diaphoresis, GI hyperactivity, and **lower-extremity-predominant** clonus. She is on lithium monotherapy — but always confirm, since lithium is itself serotonergic and is a recognized contributor when combined.
3. **NMS** — argues against: afebrile, no rigidity, normal CK. Keep it live if an antipsychotic is on board; lithium plus antipsychotic is a described risk combination.
4. **Hypercalcemic encephalopathy** — note the loop-back: her **corrected calcium is 10.9 with an inappropriately elevated PTH**, i.e. lithium-associated hyperparathyroidism (Q6). Hypercalcemia can itself produce confusion and contributes to nephrogenic DI. Two lithium effects converging.
5. **Metabolic/uremic contribution** — eGFR 45 and volume depletion.
6. **Nonconvulsive status epilepticus** — lithium lowers seizure threshold; if the encephalopathy does not track the falling level, get an EEG.
7. **Wernicke encephalopathy** — ataxia, nystagmus, confusion is the triad; poor oral intake for eight weeks makes this non-trivial. Thiamine is cheap.

**The prognostic entity to name: SILENT** — the **S**yndrome of **I**rreversible **L**ithium-**E**ffectuated **N**euro**T**oxicity: persistent neurologic sequelae, most characteristically **cerebellar dysfunction**, continuing beyond about two months after lithium has been cleared [2]. It is the reason "her level came down, she'll be fine" is not a safe assumption, and the reason time-to-clearance matters clinically rather than just numerically.

**Q4. Interpret the urine osmolality of 180 with a serum osmolality of 296. What is the renal syndrome, how is it managed, and how does it differ from lithium nephropathy?**

*Teaching point:* A dilute urine in a volume-contracted, hyperosmolar patient is inappropriate and defines a **concentrating defect** — here, **lithium-induced nephrogenic diabetes insipidus (Li-NDI)**. Mechanism: lithium enters collecting-duct principal cells via ENaC and impairs vasopressin signaling and aquaporin-2 expression, producing ADH resistance.

Distinguish the two renal syndromes clearly, because they have different tempos and different implications:

| | **Li-NDI** | **Lithium nephropathy (Li-NP)** |
|---|---|---|
| Lesion | Collecting-duct ADH resistance | Chronic tubulointerstitial nephropathy |
| Onset | Early, often within months–years | Slow, over many years of exposure |
| Clinical | Polyuria, polydipsia, hypernatremia risk | Rising creatinine, falling eGFR |
| Reversibility | Often partially reversible | Frequently progressive once established |

The 2019 systematic review and practical guideline by Schoot et al. found the evidence base for prevention and treatment of both to be **scarce**, and made pragmatically framed recommendations: **once-daily dosing**, target the **lowest effective serum level**, and **prevent intoxication** — episodes of toxicity being a key modifiable driver of long-term renal injury. They emphasize monitoring for early diagnosis, explicit **collaboration between psychiatry and nephrology**, consideration of cessation or switch when Li-NDI or Li-NP develops, and **off-label amiloride** as a useful option in Li-NDI (it blocks the ENaC through which lithium enters the principal cell) [4].

**The judgment call to put to the group:** her eGFR is 45 *acutely*. Do not make a permanent discontinuation decision on an AKI number. Re-stage her renal function after recovery, then decide with nephrology.

**Q5. She becomes less arousable and her repeat level is 2.4. Walk through the EXTRIP criteria and how you would actually run the treatment.**

*Teaching point:* Lithium is highly dialyzable — small, water-soluble, minimal protein binding, low volume of distribution — and remains one of the small number of poisonings where extracorporeal treatment is genuinely disease-modifying and routinely used [5].

The **EXTRIP workgroup** recommendations (systematic review plus two-round modified Delphi; note the authors' own grading — the evidence was almost entirely case-level, yielding **very low quality of evidence** for every recommendation, hence the 1D/2D grades) [6]:

- **Recommended** in **severe lithium poisoning**.
- **Recommended** if kidney function is impaired and **[Li⁺] > 4.0 mEq/L**, **or** in the presence of **decreased level of consciousness, seizures, or life-threatening dysrhythmias — irrespective of the level**.
- **Suggested** if **[Li⁺] > 5.0 mEq/L**, if **significant confusion** is present, or if the **expected time to reduce [Li⁺] below 1.0 mEq/L exceeds 36 hours**.
- **Continue until** clinical improvement is apparent **or** [Li⁺] < 1.0 mEq/L; a **minimum of 6 hours** if the level is not readily measurable.
- **Hemodialysis is preferred**; **CRRT is an acceptable alternative**.

**Applying it:** she has impaired kidney function and a decreasing level of consciousness. The consciousness criterion alone qualifies her **irrespective of the level of 2.4** — this is the clause residents most often miss, because they anchor on the >4.0 threshold.

**Running it well:**
- Anticipate **rebound**; recheck the level **6–12 hours** after the session, not immediately after.
- The "expected time to <1.0 mEq/L > 36 hours" criterion is the one that quietly captures patients with impaired clearance and unimpressive levels — teach residents to actually estimate it.
- **CRRT's advantage** is slower, sustained removal with less rebound; **intermittent HD's advantage** is speed. In a hemodynamically stable patient, HD first, CRRT after, is a common practical sequence.
- **Activated charcoal has no role** — the 2026 Clinical Toxicology Recommendations Collaborative consensus explicitly lists lithium among the poisons for which activated charcoal is not indicated [7]. Whole-bowel irrigation is a separate consideration confined to large **sustained-release** ingestions, and a toxicology decision.

**Q6. Her TSH is 9.8 with a normal free T4, and her corrected calcium is 10.9 with an elevated PTH. Does either require stopping lithium?**

*Teaching point:* Generally **no** — and this is where residents often over-escalate.

**Thyroid.** Lithium inhibits thyroid hormone release and iodine handling; **hypothyroidism is a relatively common but easily diagnosed and easily treated** consequence, and the standard response is **levothyroxine, not lithium discontinuation** [1]. Her picture is subclinical hypothyroidism (elevated TSH, normal free T4); given that she is actively trying to conceive, the threshold to treat is lower. Check TPO antibodies. Note also that lithium-associated **hyperthyroidism/thyroiditis**, while much less common, exists and behaves differently.

**Parathyroid.** **Lithium-associated hyperparathyroidism** is a more recently characterized effect [1]. Mechanism: lithium raises the set-point of the calcium-sensing receptor, so PTH is inappropriately non-suppressed for the calcium level — hence her **PTH of 78 with a calcium of 10.9**. Consequences include hypercalcemia, contribution to nephrogenic DI and renal stones, and cognitive symptoms that can be mistaken for a mood episode. Management is endocrinology co-management; parathyroidectomy is sometimes indicated in persistent or symptomatic disease.

**The teaching frame:** lithium's endocrine effects are largely **monitorable and treatable**. They belong in a risk–benefit discussion, not on an automatic-stop list. What she actually lacked was surveillance — see the facilitator notes on real-world monitoring rates.

**Q7. She recovers fully. She now tells you she wants to conceive. How do you counsel her, and what changes about monitoring?**

*Teaching point:* This is a shared-decision conversation with real numbers on both sides, and residents should be able to quote them approximately rather than gesturing at "lithium is teratogenic."

**Teratogenic risk.** In a cohort of 1,325,563 Medicaid pregnancies, first-trimester lithium exposure was associated with an **adjusted risk ratio of 1.65 (95% CI 1.02–2.68)** for cardiac malformations overall (2.41% exposed vs 1.15% unexposed). The association was **dose-dependent**: aRR 1.11 for ≤600 mg/day, 1.60 for 601–900 mg/day, and **3.22 (95% CI 1.47–7.02) for >900 mg/day**. Right ventricular outflow tract obstruction defects occurred in **0.60%** of exposed versus **0.18%** of unexposed infants (aRR 2.66, 95% CI 1.00–7.06). The authors' own framing matters: the magnitude was **smaller than had been previously postulated** [8].

**Risk of the alternative.** Discontinuing maintenance lithium in a patient with six years of stability carries a substantial relapse risk, and the peripartum and postpartum periods are among the highest-risk windows in bipolar disorder. Lithium also carries an antisuicide signal that its alternatives largely do not: in a systematic review and meta-analysis, lithium was associated with reduced odds of suicide in bipolar disorder compared with **active controls (OR 0.58, p = 0.005)** and compared with **placebo/no lithium (OR 0.46, p = 0.009)** [9]. A separate point worth making: **abrupt** lithium discontinuation is itself associated with relapse, so if a taper is chosen it should be gradual and planned, not reactive [2].

**Practical monitoring changes in pregnancy:**
- Renal clearance rises through pregnancy → levels tend to **fall**; more frequent level checks are required.
- Plan explicitly for **delivery**, when clearance abruptly normalizes and the risk direction reverses toward toxicity; hydration status during labor matters.
- Fetal echocardiography and coordination with maternal–fetal medicine.
- Use the **lowest effective dose**, given the dose–response signal [8].

**And the process point:** she did not tell her psychiatrist she was trying to conceive. Ask the group why not, and what in their own practice would have surfaced this earlier. Reproductive planning belongs in routine lithium monitoring, not in a crisis consult.

---

### Ranked Differential (summary)

1. **Chronic lithium neurotoxicity** from combined GLP-1 RA and NSAID exposure on a background of Li-NDI — *most likely*
2. **Serotonin syndrome** — closest phenotypic mimic; separate by exposure timeline and fever
3. **Hypercalcemic encephalopathy** from lithium-associated hyperparathyroidism — *concurrent contributor*
4. **NMS** — argued against by normal tone, temperature, and CK, but must be excluded if any antipsychotic is on board
5. **Uremic/metabolic encephalopathy** from AKI and volume depletion
6. **Nonconvulsive status epilepticus** — consider EEG if the exam lags the falling level
7. **Wernicke encephalopathy** — eight weeks of poor intake; treat empirically
8. **SILENT** — not a differential for today, but the outcome the acute management is trying to prevent

---

### Workup & Management

**Stabilize:**
1. Hold lithium; **discontinue ibuprofen**; coordinate with the prescriber on holding **semaglutide**.
2. **Isotonic saline** to restore volume and renal perfusion; watch closely for over-correction given the concentrating defect.
3. **Serial lithium levels q2–4h**; serial creatinine, electrolytes, calcium; strict intake/output.
4. **Serial structured neurologic exams** — the exam drives escalation, not the level.
5. **Empiric thiamine**; telemetry; ECG.
6. **Early nephrology and toxicology/poison center involvement** [5,6].
7. **No activated charcoal** [7].

**Escalate:**
8. **Hemodialysis** per EXTRIP if severe poisoning, impaired renal function with level > 4.0, or **decreased consciousness / seizures / life-threatening dysrhythmias at any level**; CRRT acceptable [6].
9. **Recheck 6–12 h post-treatment** for rebound.

**Characterize the chronic injury:**
10. **Re-stage renal function after AKI resolution**; formal assessment of the concentrating defect; consider **amiloride** for Li-NDI [4].
11. **Thyroid:** free T4, TPO antibodies; levothyroxine for subclinical hypothyroidism, with a lower treatment threshold given conception plans [1].
12. **Parathyroid:** repeat calcium and PTH, vitamin D, 24-hour urine calcium; endocrinology referral [1].
13. **EEG and neuroimaging** if the encephalopathy does not track the falling level.

**Disposition and prevention:**
14. **Decide deliberately** — resume lithium, dose-adjust, or switch — with nephrology input and after renal re-staging [4]. Avoid abrupt discontinuation [2].
15. **Once-daily dosing; lowest effective level** [4].
16. **Documented sick-day rules** and an explicit interaction card (NSAIDs, ACEi/ARBs, thiazides, GLP-1 RAs) for the patient and every prescriber.
17. **Close the loop with primary care** — the interaction was created across a specialty boundary.
18. **Preconception planning** with maternal–fetal medicine [8].

---

### Facilitator Notes (not for the learner handout)

- **Time:** ~30 min. Prioritize **Q2** (level–severity dissociation), **Q5** (EXTRIP), and **Q7** (pregnancy counseling). Q4 and Q6 can be compressed if the group is running long.
- **Best teaching move:** ask each resident to say out loud, for each recommendation they make, **whether it rests on trial data, cohort data, or expert consensus**. This topic is unusually good for that exercise: the pregnancy risk estimate is a large, well-controlled cohort with confidence intervals [8]; the suicide finding is meta-analytic observational data [9]; and **every EXTRIP lithium recommendation is graded D — very low quality of evidence, derived largely from case reports** [6]. Residents routinely cite EXTRIP as though it were RCT-derived. It is authoritative *consensus*, and saying so accurately is a skill.
- **The monitoring-gap data are worth putting on the board.** Guidelines converge on periodic lithium level, creatinine, TSH, and calcium — and real-world performance is poor. In a Swedish cohort of 4,428 adults initiating lithium (median follow-up on drug 4.3 years), only about **16%** had both lithium and creatinine tested annually across their full time on treatment, and **21% started without a baseline creatinine** [10]. A Dutch ambulatory cohort of 1,583 patients found about **16%** monitored in compliance for all three of lithium, creatinine, and TSH [11]. A structured appraisal of nine international guidelines found that while all contained instructions for level, renal, and thyroid monitoring, most scored poorly on **applicability** — missing resource implications, barriers/facilitators, critical values, and instructions on how to respond to aberrant results [12]. The system-level lesson: the failure is rarely ignorance of the recommendation; it is the absence of a mechanism.
- **Common resident errors to correct:**
  1. Anchoring disposition to the serum level rather than the exam.
  2. Missing the EXTRIP clause that decreased consciousness, seizures, or life-threatening dysrhythmias qualify **irrespective of level**.
  3. Declaring a post-dialysis level reassuring without rechecking for rebound.
  4. Discontinuing lithium permanently on the basis of an AKI-era eGFR.
  5. Stopping lithium for subclinical hypothyroidism instead of adding levothyroxine [1].
  6. Not connecting hypercalcemia back to lithium-associated hyperparathyroidism — and therefore missing a treatable contributor to both the encephalopathy and the polyuria [1].
  7. Reflexively citing "Ebstein anomaly" as an absolute contraindication in pregnancy without the actual effect sizes or the dose–response relationship [8].
  8. Abrupt discontinuation, with its own relapse risk [2].
- **For older-adult services:** an ISBD task force Delphi panel recommended lower maintenance targets in older adults with bipolar disorder — roughly **0.4–0.8 mmol/L for ages 60–79** and **0.4–0.7 mmol/L for 80+** — and recommended that laboratories report the older-adult therapeutic range separately [13]. Worth flagging that "0.6–1.2" printed on the lab report is not age-adjusted.
- **If the group moves fast**, push on: *how would you write the interaction warning so a non-psychiatrist actually acts on it?* (Most will produce a list. Push them toward an action: "check a lithium level 5–7 days after starting this.") Or: *what if she had presented with an intentional overdose instead?* — see the safety note below.
- **Safety note:** if the discussion turns to intentional ingestion, keep it oriented to **recognition, escalation, and safety planning** — structured risk assessment, immediate attending involvement, appropriate level of observation, collaborative safety planning, and counseling on safe medication storage and supply as a general principle. Do **not** discuss substances, amounts, or routes. It is legitimate and clinically important to note that lithium's antisuicide signal [9] is part of why the drug is not simply withdrawn from patients at elevated risk — but that decision belongs to the treating attending in the context of a full risk assessment, not to a rule of thumb.
- **Tone note:** two system failures produced this admission — a GLP-1 RA started without a lithium level, and two years of documented polyuria never worked up. Steer the group away from "she should have known" and toward what a functioning monitoring system would have caught. Then ask, honestly, whether their own clinic has one.

---

### References

1. Gitlin M. Lithium side effects and toxicity: prevalence and management strategies. *Int J Bipolar Disord.* 2016. [DOI](https://doi.org/10.1186/s40345-016-0068-y) (PMID 27900734)
2. Prasad S, Sharma V, Sosal W, et al. Lithium: a review of its adverse effects, toxicity and discontinuation. *Dis Mon.* 2026. [DOI](https://doi.org/10.1016/j.disamonth.2026.102064) (PMID 41620355)
3. Al-Soleiti M, Leung JG, Mubaydeen T, et al. Lithium toxicity and altered clearance following initiation of semaglutide in patients with bipolar disorder: a case series and literature review. *J Clin Psychopharmacol.* 2025. [DOI](https://doi.org/10.1097/JCP.0000000000002090) (PMID 40999647)
4. Schoot TS, Molmans THJ, Grootens KP, Kerckhoffs APM. Systematic review and practical guideline for the prevention and management of the renal side effects of lithium therapy. *Eur Neuropsychopharmacol.* 2019. [DOI](https://doi.org/10.1016/j.euroneuro.2019.11.006) (PMID 31837914)
5. King JD, Kern MH, Jaar BG. Extracorporeal removal of poisons and toxins. *Clin J Am Soc Nephrol.* 2019. [DOI](https://doi.org/10.2215/CJN.02560319) (PMID 31439539)
6. Decker BS, Goldfarb DS, Dargan PI, et al. Extracorporeal treatment for lithium poisoning: systematic review and recommendations from the EXTRIP workgroup. *Clin J Am Soc Nephrol.* 2015. [DOI](https://doi.org/10.2215/CJN.10021014) (PMID 25583292)
7. Hoegberg LCG, Gosselin S, Buckley NA, et al. Recommendations from the Clinical Toxicology Recommendations Collaborative on the administration of activated charcoal in acute oral overdose. *Clin Toxicol (Phila).* 2026. [DOI](https://doi.org/10.1080/15563650.2025.2609807) (PMID 41906697)
8. Patorno E, Huybrechts KF, Bateman BT, et al. Lithium use in pregnancy and the risk of cardiac malformations. *N Engl J Med.* 2017. [DOI](https://doi.org/10.1056/NEJMoa1612222) (PMID 28591541)
9. Wilkinson ST, Trujillo Diaz D, Rupp ZW, et al. Pharmacological and somatic treatment effects on suicide in adults: a systematic review and meta-analysis. *Depress Anxiety.* 2021. [DOI](https://doi.org/10.1002/da.23222) (PMID 34762330)
10. Bosi A, Ceriani L, Elinder CG, et al. Quality of laboratory biomarker monitoring during treatment with lithium in patients with bipolar disorder. *Bipolar Disord.* 2023. [DOI](https://doi.org/10.1111/bdi.13302) (PMID 36651925)
11. Nederlof M, Egberts TCG, van Londen L, et al. Compliance with the guidelines for laboratory monitoring of patients treated with lithium: a retrospective follow-up study among ambulatory patients in the Netherlands. *Bipolar Disord.* 2019. [DOI](https://doi.org/10.1111/bdi.12730) (PMID 30472760)
12. Nederlof M, Kupka RW, Braam AM, Egberts ACG, Heerdink ER. Evaluation of clarity of presentation and applicability of monitoring instructions for patients using lithium in clinical practice guidelines for treatment of bipolar disorder. *Bipolar Disord.* 2018. [DOI](https://doi.org/10.1111/bdi.12681) (PMID 30105767)
13. Shulman KI, Almeida OP, Herrmann N, et al. Delphi survey of maintenance lithium treatment in older adults with bipolar disorder: an ISBD task force report. *Bipolar Disord.* 2018. [DOI](https://doi.org/10.1111/bdi.12714) (PMID 30375703)

*Citations retrieved from PubMed. This teaching case uses a synthetic, de-identified scenario for educational purposes only. Monitoring intervals and target ranges vary between guidelines; follow your institution's protocol and applicable local practice.*

*Joshua Moss, MD | Psychiatrist*


---

## Opioid Use Disorder (Jul 27)

- **Slug:** `cotw_20260727_oud_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-07-27_opioid-use-disorder_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 3,399 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 9 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-07-27)

**TL;DR (shown above the page text):**

> Two opposite toxidromes in one encounter: opioid overdose reversed by naloxone, then precipitated withdrawal - and why buprenorphine has to be started in withdrawal.

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
- **exam** — Teaching takeaway: Two opposite toxidromes in one encounter: opioid overdose reversed by naloxone, then precipitated withdrawal - and why buprenorphine has to be started in withdrawal.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `substance`, `pharm`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-07-27"}

#### Page text (as shipped)

# Case of the Week — Resident Edition
## Opioid Use Disorder: Intoxication, Withdrawal, and MOUD in the Fentanyl Era

**Date:** 2026-07-27
**Learner level:** Psychiatry residents (PGY-1–4) — assumes DSM-5-TR fluency; guideline- and evidence-forward
**Format:** ~20–30 min case conference. No required pre-reading.
**Citations:** Based on articles retrieved from PubMed. Full reference list at the end. All patient details are **synthetic and de-identified**.

---

### The Case (learner-facing stem)

**Consult question:** *"34-year-old with OUD, precipitated withdrawal after buprenorphine start, now refusing all opioid treatment and threatening to leave. Please advise."*

A 34-year-old woman was admitted four days ago with fever, progressive low back pain, and lower-extremity weakness. MRI demonstrated **L3–L4 vertebral osteomyelitis with a small epidural phlegmon**; blood cultures grew methicillin-susceptible *Staphylococcus aureus*. Infectious disease recommends **six weeks of IV antibiotics**. Neurosurgery is following non-operatively.

She reports daily use of non-prescribed fentanyl for approximately three years, initially via prescription opioids after a work injury. She estimates her last use as roughly eight hours before ED arrival. She has never been on methadone or buprenorphine; two prior admissions ended in **patient-directed discharge** on hospital day 2 and day 3.

**Hospital course:** On hospital day 1, the primary team obtained a COWS of 11 and administered a standard buprenorphine induction dose. Within 45 minutes she developed severe vomiting, diaphoresis, agitation, and diffuse pain — worse than her pre-treatment state. She was told this was "the medicine working" and refused all further doses. Since then she has received as-needed short-acting full agonists for pain, with escalating requests and increasing conflict with nursing.

**Today (hospital day 4):** T 37.8 °C, HR 112, BP 156/94, RR 20. She is tearful, restless, rating her back pain 9/10, and says: *"That medicine made me sicker than anything I've ever felt. I'm not doing it again. I'll finish the antibiotics at home."* She has a peripheral IV; no PICC has been placed. Chart notes from the primary team describe her as "drug seeking."

**Labs/studies:** WBC 13.2, ESR and CRP elevated. QTc 448 ms. LFTs mildly elevated; HCV antibody positive, HCV RNA pending. HIV negative. Pregnancy test negative. UDS positive for fentanyl; negative for benzodiazepines, stimulants, and alcohol.

---

### Guided Discussion Questions

**Q1. What actually happened on hospital day 1, and why is a COWS of 11 not the reassurance the team thought it was?**

*Teaching point:* This is **buprenorphine-precipitated withdrawal**, and the fentanyl era has changed its epidemiology in ways that invalidate the reflexes many of us trained on.

The mechanism is unchanged: buprenorphine is a **partial mu agonist with very high receptor affinity**. Given while full agonist occupancy is still substantial, it displaces the full agonist and substitutes lower intrinsic activity — a net abrupt drop in mu signaling, and a withdrawal syndrome that is typically **more severe than spontaneous withdrawal** [1,2].

What has changed is the **pharmacokinetics of the drug being displaced**. Illicitly manufactured fentanyl and its analogues are highly lipophilic and, with sustained heavy use, accumulate in peripheral compartments and redistribute. The practical consequence: a patient may display *clinical* withdrawal (COWS 11) while still carrying enough mu occupancy for buprenorphine to precipitate. **COWS-threshold-based standard initiation is less reliable in fentanyl-exposed patients than it was in the heroin era** [2,3].

The magnitude matters for calibration. In a cohort of hospitalized patients using fentanyl who underwent standard buprenorphine initiation, precipitated withdrawal occurred in a **minority** of patients — meaningful and non-trivial, but far from universal [3]. Two implications: standard initiation is not obsolete and should not be abandoned reflexively, *and* the risk is high enough to warrant an explicit consent conversation and a considered choice of strategy.

*Also worth naming:* telling a patient in precipitated withdrawal that this is "the medicine working" is both inaccurate and, predictably, treatment-ending. The iatrogenic harm here is not only physiologic — it is a durable negative association with the single most effective treatment she could receive.

**Q2. She now refuses buprenorphine. Lay out the realistic options and their trade-offs.**

*Teaching point:* Four viable paths. The wrong answer is the one that is happening now — as-needed full agonists with no disease-directed treatment [15].

| Option | Mechanism / approach | Trade-offs |
|---|---|---|
| **Methadone** | Full mu agonist, titrated up | No precipitated withdrawal risk; strongest **retention** data [4]; inpatient initiation is permissible while treating another condition; discharge continuity requires OTP linkage — arrange it *before* discharge. QTc and interaction monitoring. |
| **Low-dose buprenorphine initiation** ("micro-dosing," Bernese method) | Gradually escalating small buprenorphine doses **while continuing the full agonist**, then taper the full agonist | Avoids requiring a withdrawal window; well suited to patients who cannot tolerate withdrawal or who have failed standard initiation [5,6,7]. Requires days, a cooperative team, and a written protocol. |
| **High-dose / rapid initiation** | Larger initial buprenorphine dosing in patients already in clear withdrawal | Faster to therapeutic blockade; still carries precipitation risk; least acceptable to *this* patient. |
| **XR-naltrexone** | Mu antagonist | Requires a **7–10 day opioid-free interval**; not feasible in a patient with acute pain requiring opioid analgesia. Practically excluded here. |

**Two options are genuinely live for her: methadone, or low-dose buprenorphine initiation.** Given a traumatic buprenorphine experience, acute pain requiring full-agonist analgesia, and six weeks of IV antibiotics ahead, **methadone** is often the more pragmatic inpatient answer — it treats withdrawal and craving, is compatible with concurrent full-agonist analgesia, and does not ask her to re-experience the thing that harmed her. Low-dose buprenorphine initiation remains a strong alternative if she prefers buprenorphine's safety profile or if OTP access is a barrier [1,2,5,6,7,13].

**Q3. Take low-dose initiation seriously as a strategy. What is the actual evidence, and what should we tell patients to expect?**

*Teaching point:* Residents should be able to describe this protocol and its limits, not just name it.

- **Principle:** exploit buprenorphine's slow receptor association by escalating gradually from very small doses while the full agonist continues, so that occupancy shifts without an abrupt drop in signaling. The full agonist is then discontinued once buprenorphine reaches a therapeutic dose [5,6].
- **Evidence quality:** predominantly **observational** — case series, retrospective cohorts, and narrative syntheses. There is no large RCT establishing superiority over standard initiation. Protocols vary substantially in starting dose, escalation interval, and total duration [5,6,7].
- **It is not withdrawal-free.** In a retrospective cohort of outpatients using fentanyl who underwent low-dose initiation, withdrawal symptoms during the process were **common**, though generally milder than frank precipitated withdrawal [6]. Promising it as painless sets up a second betrayal.
- **Inpatient advantage:** hospitalization supplies exactly what the protocol needs — supervised administration, reliable dosing intervals, and rapid response to symptoms. Rapid inpatient low-dose protocols have been described and are attractive when length of stay is constrained [7].

**Framing for the patient:** *"This approach is designed to avoid what happened to you on Monday. You may still feel some withdrawal, and we will treat it as it comes. Nothing gets given without telling you first."*

**Q4. Her pain is real, her back is infected, and the chart says "drug seeking." How do you manage acute pain in a patient with OUD?**

*Teaching point:* This is where consult psychiatry adds the most value, and where the evidence base is thinner than the confidence with which people opine.

Core principles:

1. **Treat the OUD and the acute pain as two separate problems.** MOUD dosing does not provide analgesia at the usual dosing interval. **Continue the MOUD and add analgesia on top** — do not withhold or reduce it to "make room."
2. **Expect higher opioid requirements.** Tolerance and opioid-induced hyperalgesia are real; standard opioid-naive dosing will underserve her and drive exactly the escalating-request pattern the team is now interpreting as pathology.
3. **Maximize multimodal analgesia** — non-opioid systemic agents, regional/interventional options where appropriate, and treating the underlying infection, which is the definitive analgesic here.
4. **Buprenorphine's high mu affinity does complicate co-administered full-agonist analgesia**, though it is generally manageable and is not a reason to stop buprenorphine perioperatively or during acute illness. A systematic review of acute pain management in OUD found the overall evidence base **limited and low-certainty**, with no clear superiority among strategies — argue from principles and individualize, and say so out loud rather than asserting false certainty [8].
5. **Set the analgesic plan in writing, with a schedule and a rationale**, and communicate it to nursing. Most "difficult patient" dynamics on this service are actually **undertreated withdrawal plus undertreated pain plus an unwritten plan**.

**On the documentation:** "drug seeking" is not a clinical finding. It is worth addressing directly with the primary team — stigmatizing language in the record propagates, changes downstream care, and is itself a modifiable driver of patient-directed discharge [2].

**Q5. She wants to complete six weeks of IV antibiotics at home. Two prior admissions ended in patient-directed discharge. How do you think about disposition risk?**

*Teaching point:* Patient-directed discharge in this population is best understood as a **treatable symptom of undertreated withdrawal and pain**, not a fixed patient characteristic [2].

Address the modifiable drivers first:
- **Adequate MOUD** — the single most effective retention intervention available on day 4. The principle generalizes across settings: treatment *started at the point of contact* drives downstream engagement far more than a referral does, as the ED-initiated buprenorphine trial showed starkly (78% engaged in treatment at 30 days vs. 37% with referral alone) [14].
- **A written, non-negotiated-daily analgesic plan.**
- **Nicotine replacement** — frequently forgotten, frequently decisive.
- **Autonomy and predictability** — smoking breaks, phone access, visitor policy, and a named point of contact. Rigid unit policies drive more early discharges than craving does.
- **Repair the day-1 rupture explicitly.** Name what happened, name that it was iatrogenic, and apologize. This is often the intervention that changes the trajectory.

If she leaves anyway, the plan should already exist:
- **Naloxone and overdose-prevention counseling regardless of disposition** [1].
- The **highest-risk window for fatal overdose follows any period of reduced use** — hospitalization included. Mortality is roughly **six-fold higher in the four weeks after opioid agonist treatment stops** compared with time in treatment [9]. Say this to her plainly, as information rather than as a threat.
- **Bridge MOUD supply** and a same-week appointment.
- Discuss oral antibiotic alternatives with ID rather than framing the choice as full IV course or nothing.
- **Capacity assessment** if refusal appears driven by delirium, untreated withdrawal, or a treatable psychiatric state — but note that a capacitated refusal of recommended care is a right, not a psychiatric emergency.

**Q6. Compare the agonist and antagonist strategies on outcomes. What does X:BOT actually show, and what is the most common misreading?**

*Teaching point:* Residents should hold both the intention-to-treat and the per-protocol result, because the misreading is consequential.

**X:BOT** was a 24-week, multicentre, open-label RCT comparing **XR-naltrexone** with **buprenorphine-naloxone** for relapse prevention in adults with OUD [10]. The essential findings:

- **Induction failure was markedly asymmetric** — substantially harder for XR-naltrexone, because of the required opioid-free interval.
- In the **intention-to-treat** analysis, relapse was more common in the XR-naltrexone arm, driven largely by that induction hurdle.
- Among participants **successfully inducted**, outcomes were more comparable.

The common misreading is "XR-naltrexone doesn't work." The defensible reading is: **XR-naltrexone is effective once you get patients onto it, and getting them onto it is the problem** — which makes the *setting* decisive. It is a reasonable option after a completed withdrawal period, in controlled settings, or for patients who decline agonist therapy. It is a poor fit for a patient in active withdrawal with acute pain, as here. Comparative effectiveness has also been examined in Black adults specifically, an important consideration given persistent inequities in buprenorphine access [11].

For **mortality**, the agonist evidence is the strongest thing we have: all-cause mortality during opioid agonist treatment is roughly **half** that during time out of treatment, with reductions across drug-related, suicide, alcohol-related, and cardiovascular causes — with elevated risk in the **first four weeks of methadone** and, again, in the **four weeks after any treatment cessation** [9]. Head-to-head, buprenorphine and methadone are broadly comparable on mortality, with **methadone favored on retention** [4].

**Q7. Change one variable: she is 26 weeks pregnant. What changes?**

*Teaching point:* Less than residents expect, and the direction of the answer surprises people.

- **Opioid agonist therapy remains the standard of care in pregnancy** — both methadone and buprenorphine. Medically supervised withdrawal is **not** recommended, because relapse rates are high and relapse carries greater fetal and maternal risk than continued agonist treatment [12].
- **Anticipate neonatal opioid withdrawal syndrome (NOWS)** and plan for it with pediatrics. NOWS is expected, treatable, and is **not** a reason to withhold maternal treatment. Buprenorphine exposure is generally associated with a less severe neonatal course than methadone; both are acceptable.
- **Dose requirements often increase** in the third trimester (volume of distribution, metabolism), and split dosing is sometimes needed. Under-dosing to protect the fetus is a common and harmful error.
- **Coordinate early** with obstetrics, pediatrics, addiction medicine, and — where relevant — child protective reporting requirements, which vary by state and should be discussed with the patient transparently and in advance.
- The infection, the antibiotics, and the imaging all still need managing; pregnancy changes the agents, not the principle.

---

### Ranked Differential (for the presenting picture)

1. **Buprenorphine-precipitated withdrawal** (day 1) evolving into **ongoing untreated opioid withdrawal + undertreated acute pain** — *most likely, and the two are additive*
2. **Progression of spinal infection** — worsening epidural collection or new neurologic compromise; the fever and rising inflammatory markers demand this stay live, and any new deficit is an emergency
3. **Systemic complications of bacteremia** — endocarditis, septic emboli, metastatic foci
4. **Delirium** — infection, sepsis, medication effects; distinguish from withdrawal-driven agitation
5. **Occult sedative or alcohol withdrawal** — negative UDS and history make this less likely but it remains the dangerous miss
6. **Co-occurring psychiatric illness** — depression, PTSD, and suicidality are highly prevalent and worsen acutely in withdrawal
7. **Opioid-induced hyperalgesia** contributing to the pain-request escalation

---

### Workup & Management

**Immediate:**
1. **Repair and re-consent.** Name the day-1 event accurately as precipitated withdrawal, take responsibility, and present the options in Q2 as a genuine choice.
2. **Start disease-directed treatment today** — methadone titration or a written low-dose buprenorphine initiation protocol [1,2,5,6,7].
3. **Write the analgesic plan**: MOUD *plus* scheduled multimodal analgesia *plus* clearly defined breakthrough dosing, with rationale documented [8].
4. **Adjunctive withdrawal management** per institutional protocol; **nicotine replacement**.
5. **Reassess the spine** — neurologic checks, and imaging for any new deficit or clinical deterioration.

**Ongoing:**
6. **Monitor QTc** on methadone (448 ms at baseline) and review interacting medications, including antibiotics and antiemetics.
7. **Serial COWS** — for titration, not gatekeeping.
8. **HCV RNA follow-up** and linkage to treatment; confirm hepatitis A/B immunity; repeat HIV testing per risk.
9. **Screen for depression, PTSD, and suicidality**; treat co-occurring illness rather than deferring it to "after the addiction is stable."
10. **Address stigmatizing documentation** with the primary team directly.

**Discharge planning — start on day 4, not day 40:**
11. **OTP intake arranged before discharge** if methadone, or a confirmed buprenorphine prescriber with a bridge supply. Continuity is the whole ballgame [9].
12. **Naloxone kit and overdose-prevention counseling**, with explicit discussion of reduced tolerance after hospitalization [1,9].
13. **Realistic antibiotic plan** with ID, including oral alternatives, rather than an all-or-nothing IV course.
14. **Contingency plan documented** for patient-directed discharge — what she leaves with, and how she gets back in.

---

### Facilitator Notes (not for the learner handout)

- **Time:** ~30 min. **Q1–Q3** are the pharmacologic core; **Q4–Q5** are where consult psychiatry does the actual work. Q6 is the evidence-appraisal beat. Q7 is optional if time is short.
- **Best teaching move:** ask the group to articulate *why* a COWS of 11 was insufficient reassurance. The answer requires holding receptor affinity, intrinsic activity, and fentanyl pharmacokinetics simultaneously — and it is the conceptual hinge for everything downstream.
- **Second-best move:** ask what the consult note should say about "drug seeking." Residents rarely get explicit coaching on how to challenge stigmatizing documentation without alienating the primary team. Practice the sentence out loud.
- **Common resident errors to correct:**
  1. Treating low-dose initiation as established standard of care rather than an observationally supported alternative with heterogeneous protocols [5,6,7].
  2. Promising low-dose initiation will be withdrawal-free [6].
  3. Reducing or holding MOUD to "make room" for analgesia.
  4. Reading X:BOT as "naltrexone doesn't work" rather than as an induction-barrier finding [10].
  5. Deferring MOUD until the acute medical problem resolves — the admission *is* the treatment window.
  6. Framing patient-directed discharge as a character trait rather than a modifiable outcome [2].
  7. Recommending medically supervised withdrawal in pregnancy [12].
  8. Forgetting nicotine replacement.
  9. Arranging MOUD without arranging the *next dose after discharge* — the four weeks post-cessation are the highest-mortality window [9].
- **Evidence-appraisal beat:** ask the group to rate the certainty of the evidence behind each recommendation they make. Mortality benefit of agonist therapy is strong observational and trial evidence [4,9]. Low-dose initiation is observational [5,6,7]. Acute pain management in OUD is explicitly low-certainty [8]. Residents should be able to say "we do this on principle, not on trial data" without discomfort.
- **Systems note:** if your institution lacks a written low-dose initiation protocol, a same-day OTP linkage pathway, or naloxone-at-discharge, those are QI projects sitting in plain view.
- **Safety note:** keep overdose discussion oriented to **recognition, escalation, and prevention** — tolerance loss, naloxone access, not using alone, continuity of MOUD. Avoid substance, amount, or route specifics. If suicidality surfaces, move to a full risk assessment and safety planning rather than folding it into the addiction discussion.

---

### References

1. Harris MTH, Weinstein ZM, Walley AY. Medications for opioid use disorder, opioid withdrawal, and opioid overdose: a review. *JAMA.* 2026. [DOI](https://doi.org/10.1001/jama.2025.26348) (PMID 41671014)
2. Englander H, Thakrar AP, Bagley SM, et al. Caring for hospitalized adults with opioid use disorder in the era of fentanyl: a review. *JAMA Intern Med.* 2024. [DOI](https://doi.org/10.1001/jamainternmed.2023.7282) (PMID 38683591)
3. Thakrar AP, Christine PJ, Siaw-Asamoah A, et al. Buprenorphine-precipitated withdrawal among hospitalized patients using fentanyl. *JAMA Netw Open.* 2024. [DOI](https://doi.org/10.1001/jamanetworkopen.2024.35895) (PMID 39331392)
4. Degenhardt L, Clark B, Macpherson G, et al. Buprenorphine versus methadone for the treatment of opioid dependence: a systematic review and meta-analysis of randomised and observational studies. *Lancet Psychiatry.* 2023. [DOI](https://doi.org/10.1016/S2215-0366(23)00095-0) (PMID 37167985)
5. Edinoff AN, Fahmy OH, Spillers NJ, et al. Low-dose initiation of buprenorphine: a narrative review. *Curr Pain Headache Rep.* 2023. [DOI](https://doi.org/10.1007/s11916-023-01116-3) (PMID 37083890)
6. Jones BLH, Geier M, Neuhaus J, et al. Withdrawal during outpatient low dose buprenorphine initiation in people who use fentanyl: a retrospective cohort study. *Harm Reduct J.* 2024. [DOI](https://doi.org/10.1186/s12954-024-00998-9) (PMID 38594721)
7. Sokolski E, Skogrand E, Goff A, et al. Rapid low-dose buprenorphine initiation for hospitalized patients with opioid use disorder. *J Addict Med.* 2023. [DOI](https://doi.org/10.1097/ADM.0000000000001133) (PMID 37579112)
8. Buonora MJ, Mackey K, Khalid L, et al. Acute pain management in people with opioid use disorder: a systematic review. *Ann Intern Med.* 2025. [DOI](https://doi.org/10.7326/ANNALS-24-01917) (PMID 40096692)
9. Santo T, Clark B, Hickman M, et al. Association of opioid agonist treatment with all-cause mortality and specific causes of death among people with opioid dependence: a systematic review and meta-analysis. *JAMA Psychiatry.* 2021. [DOI](https://doi.org/10.1001/jamapsychiatry.2021.0976) (PMID 34076676)
10. Lee JD, Nunes EV, Novo P, et al. Comparative effectiveness of extended-release naltrexone versus buprenorphine-naloxone for opioid relapse prevention (X:BOT): a multicentre, open-label, randomised controlled trial. *Lancet.* 2018. [DOI](https://doi.org/10.1016/S0140-6736(17)32812-X) (PMID 29150198)
11. Haeny AM, Montgomery L, Burlew AK, et al. Extended-release naltrexone versus buprenorphine-naloxone to treat opioid use disorder among Black adults. *Addict Behav.* 2020. [DOI](https://doi.org/10.1016/j.addbeh.2020.106514) (PMID 32619868)
12. Sanjanwala AR, Lim G, Krans EE. Opioids and opioid use disorder in pregnancy. *Obstet Gynecol Clin North Am.* 2023. [DOI](https://doi.org/10.1016/j.ogc.2022.10.015) (PMID 36822706)
13. Yakovenko I, Mukaneza Y, Germé K, et al. Management of opioid use disorder: 2024 update to the national clinical practice guideline. *CMAJ.* 2024. [DOI](https://doi.org/10.1503/cmaj.241173) (PMID 39532476)
14. D'Onofrio G, O'Connor PG, Pantalon MV, et al. Emergency department–initiated buprenorphine/naloxone treatment for opioid dependence: a randomized clinical trial. *JAMA.* 2015. [DOI](https://doi.org/10.1001/jama.2015.3474) (PMID 25919527)
15. Bell J, Strang J. Medication treatment of opioid use disorder. *Biol Psychiatry.* 2019. [DOI](https://doi.org/10.1016/j.biopsych.2019.06.020) (PMID 31420089)

*Citations retrieved from PubMed. This teaching case uses a synthetic, de-identified scenario for educational purposes only. Specific dosing is intentionally omitted; follow your institution's protocol and applicable federal and state regulations governing methadone and buprenorphine.*

*Joshua Moss, MD | Psychiatrist*


---

## Alcohol Withdrawal & DT (Jul 26)

- **Slug:** `cotw_20260726_etohwd_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-07-26_alcohol-withdrawal-delirium-tremens_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`moderate`
- **Length:** 3,097 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 9 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-07-26)

**TL;DR (shown above the page text):**

> Time since last drink organizes everything: DT arrives late (48-96 h), PAWSS predicts and CIWA-Ar measures, and thiamine goes before glucose.

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
- **exam** — Teaching takeaway: Time since last drink organizes everything: DT arrives late (48-96 h), PAWSS predicts and CIWA-Ar measures, and thiamine goes before glucose.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `substance`, `neurocog`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-07-26"}

#### Page text (as shipped)

# Case of the Week — Resident Edition
## Alcohol Withdrawal & Delirium Tremens: Risk Stratification, Benzodiazepine-Resistant Withdrawal, and the Phenobarbital Evidence

**Date:** 2026-07-26
**Learner level:** Psychiatry residents (PGY-1–4); consult-liaison and addiction-relevant. DSM-5-TR fluency assumed.
**Format:** ~20–30 min small-group discussion. No required pre-reading.
**Citations:** Based on articles retrieved from PubMed. Full reference list at the end. All patient details are **synthetic and de-identified**.

---

### The Case (learner-facing stem)

You are the psychiatry consult resident. Medicine calls at 21:00 about a 54-year-old man admitted 48 hours ago after a mechanical fall with a distal radius fracture, now post-operative day 0 from open reduction and internal fixation.

**History (partly collateral, with consent):** approximately 1 pint of vodka daily for six years, last drink the morning before admission. Prior hospitalization three years ago for "the shakes." One episode described as "blacked out and woke up in the ER" — records confirm a **witnessed generalized seizure** during a prior withdrawal admission. No prior ICU admission. No psychiatric history, no other substances by history; UDS negative.

**Admission labs:** Na 134, K 3.2, **Mg 1.4 mg/dL**, glucose 96, AST 88, ALT 41 (ratio ~2:1), T. bili 1.6, INR 1.3, **platelets 128,000**. BAL undetectable on arrival.

**Course:** Started on a CIWA-Ar–triggered lorazepam protocol on admission. Scores hovered 8–12 for the first 24 h. Post-operatively he received fentanyl and, on the floor, has now received **26 mg of lorazepam in the preceding 9 hours** with CIWA-Ar scores that have not fallen below 18.

**Now (hour ~62 since last drink):** T 38.6 °C, HR 138, BP 178/102, RR 26. He is inattentive with a fluctuating level of arousal, disoriented to place and time, picking at the bedsheets, and has pulled out one IV. He reports seeing "bugs on the wall" and cannot be reliably redirected. No focal neurologic deficit is appreciated on a limited exam.

---

### Guided Discussion Questions

**Q1. Formulate this. What is the diagnosis, and what is the *mechanistic* reason his benzodiazepine requirement is escalating rather than falling?**

*Teaching point:* This is **delirium tremens** — DSM-5-TR *alcohol withdrawal, with perceptual disturbances*, meeting criteria for a withdrawal delirium: fluctuating attention and awareness, perceptual disturbance, and severe autonomic instability, in a temporal window (~48–96 h) that fits precisely.

The mechanism to articulate: chronic ethanol exposure produces **GABA-A receptor subunit reconfiguration** — not merely fewer receptors, but a shift toward subunit compositions (notably reduced α1 and altered γ2/δ expression) that are **less sensitive to benzodiazepines**, while **NMDA receptor upregulation** (including NR2B-containing receptors) drives glutamatergic excitotoxic hyperarousal [1,2]. Benzodiazepines are **allosteric modulators**: they require an endogenous GABA-A receptor population competent to respond. When that population is remodeled, escalating benzodiazepine doses yield diminishing returns — the definition of **benzodiazepine-resistant alcohol withdrawal**. Barbiturates, by contrast, both potentiate GABA-A **and, at higher concentrations, directly gate the chloride channel independent of GABA**, and additionally antagonize AMPA/kainate glutamatergic transmission — which is the pharmacologic rationale for phenobarbital in exactly this scenario [1,3].

There is also a **"kindling"** dimension: repeated withdrawal episodes progressively sensitize the neural substrate, so each subsequent withdrawal is more severe and more likely to be complicated by seizure or delirium [4,5]. His documented prior withdrawal seizure is therefore not just history — it is a mechanism-level prediction of tonight.

**Q2. Retrospectively: what should have happened on admission that would have changed this trajectory?**

*Teaching point:* Three failures worth naming without blame:

1. **No prospective risk stratification.** The **PAWSS** is a 10-item admission screen derived from a systematic review of 233 articles; a score **≥4** identifies patients at risk for *complicated* withdrawal (hallucinosis, withdrawal seizures, DT) before symptoms emerge [4]. This patient would have scored well above threshold: heavy daily intake, prior withdrawal episodes, **prior withdrawal seizure**, and acute comorbid illness. High PAWSS should have driven a **front-loaded or fixed-schedule** regimen and an appropriate level of care from hour 0 — not a reactive, symptom-triggered protocol on a general floor.
2. **Symptom-triggered dosing applied to a patient in whom CIWA-Ar is not valid.** CIWA-Ar was validated in awake, communicative patients whose symptoms are attributable to withdrawal. Post-operatively — with pain, opioids, and an evolving delirium — the scale becomes uninterpretable: pain and surgical stress inflate the score, while an obtunding delirium can deflate it. Current reviews emphasize this limitation explicitly, and identify **non-symptom-triggered and benzodiazepine-sparing protocols** as an active area of investigation for exactly these populations [1]. The **2020 ASAM guideline** frames symptom-triggered therapy as preferred *where it can be validly and safely applied*, with fixed-dose or front-loading reserved for higher-risk or non-assessable patients [6].
3. **Unaddressed magnesium.** Mg 1.4 mg/dL was never repleted. Hypomagnesemia lowers the seizure threshold and is common in this population [1,2].

**Q3. Build the differential for a hyperthermic, hyperadrenergic delirium in this patient. What are you obligated to exclude tonight, and how does that change your orders?**

*Teaching point:* DT is a **diagnosis of exclusion in the delirious patient**, and this man has three independent reasons to have something else.

| Consideration | Why it's live here | Action tonight |
|---|---|---|
| **Delirium tremens** | Timeline (62 h), prior seizure, escalating requirement | Treat empirically while working up |
| **Intracranial hemorrhage (SDH)** | Mechanical **fall**, platelets 128k, INR 1.3, alcohol-related cortical atrophy → bridging-vein vulnerability | **Non-contrast head CT** — low threshold, do not defer |
| **Sepsis / post-op infection** | POD 0; T 38.6 °C is indistinguishable from DT hyperthermia | Cultures, CXR, wound exam, lactate |
| **Wernicke encephalopathy** | Chronic AUD; classic triad present in a minority — most cases are missed | **Parenteral thiamine now**, before any dextrose |
| **Hepatic encephalopathy** | AST:ALT 2:1, plt 128k, INR 1.3, bili 1.6 → probable cirrhosis | Ammonia is *not* diagnostic; assess clinically; sedatives can precipitate HE [7] |
| **Serotonin syndrome / NMS / anticholinergic delirium** | Perioperative polypharmacy | Med rec; check for clonus, rigidity, mydriasis, dry skin |
| **Opioid/benzodiazepine interaction & post-op delirium** | Fentanyl + 26 mg lorazepam | Consider iatrogenic contribution to the fluctuating sensorium |

The teaching move: **the workup runs in parallel with treatment, not before it.** You do not withhold benzodiazepines pending the CT.

**Q4. Phenobarbital: what does the evidence actually support — monotherapy, adjunct, or rescue? Be specific about the quality of the data.**

*Teaching point:* This is the highest-yield literature discussion in the case, and the honest answer is **"promising, heterogeneous, mostly non-randomized."**

- A **systematic review of 20 studies** (9 ED, 11 floor/ICU) concluded that phenobarbital **as monotherapy without benzodiazepines may be a safe and effective alternative** in AWS, while explicitly flagging **considerable heterogeneity in dosing, outcome measures, and severity scales**, and noting that the two available ED RCTs were substantially underpowered. Its stated future agenda is standardization of dosing [3].
- A **systematic review and meta-analysis** found a statistically significant reduction in **hospital length of stay** with phenobarbital vs. benzodiazepines (mean difference **−2.6 days**, 95% CI −4.48 to −0.72, p = 0.007), but **no significant difference in ICU LOS** (−1.17, p = 0.07) and no significant difference in intubation (RR 0.52, 95% CI 0.25–1.08), both with **considerable heterogeneity (I² 77–80%)** [8].
- A **retrospective cohort of 224 patients with clearly defined severe AWS** (history of DT/seizures, CIWA-Ar >15, or PAWSS ≥4) using **fixed-dose, non-overlapping phenobarbital** found shorter median hospital LOS (**2.8 vs 4.7 days**, p < 0.0001), shorter progressive/ICU LOS (0.7 vs 1.3 days), less dexmedetomidine and antipsychotic use, and fewer patients newly mechanically ventilated (p = 0.045) [9]. Note the design detail worth emphasizing: **non-overlapping** — phenobarbital replaced benzodiazepines rather than stacking on top of them.
- Against that, a **multicenter retrospective study of phenobarbital *added to* benzodiazepines** found faster AWS resolution (141.7 vs 165.7 h) but **higher mechanical ventilation (19.4% vs 1.0%), more aspiration pneumonia (22.3% vs 5.8%), and longer LOS (8 vs 6 days)** — with the important internal finding that **earlier initiation (within 24 h)** was associated with lower cumulative benzodiazepine dose (530 vs 887.5 mg) and shorter LOS (6 vs 10 days) [10]. Confounding by indication is severe here: sicker patients get the adjunct.
- Head-to-head against another adjunct: a retrospective cohort comparing **phenobarbital vs. dexmedetomidine** added to lorazepam found the phenobarbital group had **lower odds of intubation (OR 0.33, 95% CI 0.15–0.70)** and shorter hospital and ICU LOS — but with the protective effect **attenuating as lorazepam dose rose** [11]. Dexmedetomidine, mechanistically, is an α2 agonist: it blunts autonomic signs **without GABAergic or anti-seizure activity**, which is precisely why it is an adjunct and never a substitute [1].

**Synthesis for the resident:** the defensible position is that **early, protocolized, replacement-strategy phenobarbital in prospectively identified severe AWS** has the best supporting data; **late, stacked-on-top-of-high-dose-benzodiazepine phenobarbital** is where the respiratory harms cluster. That distinction — *replacement early* vs. *rescue late* — is the actual clinical lesson, and it is testable at the bedside tonight.

**Q5. Write the plan for the next 4 hours. Level of care, pharmacology, monitoring, and what you personally do as the consultant.**

*Teaching point:*

**Level of care.** Escalate to **ICU or step-down** now. Criteria met: delirium, hyperthermia, hemodynamic instability, escalating sedative requirement, and airway risk. Do not manage refractory DT on a general floor.

**Pharmacology.**
- **Rapid titration to a defined endpoint** — light sedation (calm, rousable), not a CIWA-Ar number. Once delirium supervenes, CIWA-Ar is dead as an instrument; switch to a sedation scale (e.g., RASS) and objective autonomic parameters.
- **Add phenobarbital** per institutional protocol, with an explicit preference for a **loading/replacement strategy rather than open-ended stacking**, given the ventilation and aspiration signal in the adjunct literature [3,9,10]. Airway monitoring is mandatory.
- **Dexmedetomidine** may be added for autonomic control but **never as a benzodiazepine/barbiturate substitute** — no anti-seizure effect [1,11].
- **Antipsychotics** only for refractory perceptual disturbance/agitation *after* adequate GABAergic therapy; they lower the seizure threshold and prolong QTc.
- **Thiamine parenterally, before dextrose** [12]. Replete **magnesium** and potassium.
- **Liver caveat:** with probable cirrhosis, prefer **lorazepam/oxazepam** (glucuronidation, no oxidative metabolism, no active metabolites) and recognize that sedatives can precipitate or worsen **hepatic encephalopathy** — a real reason to favor a controlled barbiturate load over an open-ended benzodiazepine escalation here [7].

**Workup in parallel:** non-contrast head CT, cultures/CXR/lactate, glucose, repeat electrolytes and Mg, medication reconciliation.

**Your job as the consultant:** (1) name the diagnosis explicitly in the note so the primary team stops titrating to a scale that no longer applies; (2) specify the **endpoint** of sedation; (3) specify **what would change the diagnosis** (i.e., the exclusion workup); (4) begin the **AUD treatment** conversation for the post-acute phase; and (5) address **stigma and staff dynamics** — refractory DT reliably generates frustration on the floor, and reframing it as a severe medical illness with a predictable trajectory is part of the consult.

**Q6. He stabilizes over 72 hours. What is your discharge plan, and what does the evidence say about it?**

*Teaching point:* **Detoxification is not treatment.** The withdrawal episode is the single highest-leverage engagement opportunity this patient will have, and it is routinely wasted.

- **Pharmacotherapy.** A systematic review and meta-analysis of **118 trials / 20,976 participants** supports **oral naltrexone 50 mg/d** and **acamprosate** as first-line: NNT **11** (acamprosate) and **18** (naltrexone 50 mg/d) to prevent one person returning to *any* drinking, and NNT **11** for naltrexone to prevent return to *heavy* drinking; injectable naltrexone reduced drinking days (WMD −4.99 days over 30 days). Adverse effects were predominantly GI [13]. Note the naltrexone caveat in this specific patient: he is **post-operative on opioid analgesia**, so naltrexone initiation must be timed accordingly — **acamprosate** is the more practical immediate choice, and it is also the preferred agent in hepatic impairment (renally cleared).
- **Psychosocial linkage** is not optional — the meta-analytic effect sizes above are *in conjunction with* psychosocial intervention [13].
- **Anticipate the kindling problem.** Document the DT episode prominently. His next withdrawal will be worse, and the next admitting team needs to see that on page one [4,5].
- **Counsel on the AUD → withdrawal-risk loop** explicitly, in non-stigmatizing language.

**Q7. Where is this evidence base weakest, and what would you want to see?**

*Teaching point:* Push residents to articulate research gaps — this is the ACGME-relevant "practice-based learning" muscle.

- **Almost no adequately powered RCTs.** The phenobarbital literature is dominated by single-center retrospective cohorts with **confounding by indication**; the two ED RCTs are small [3].
- **No dosing standardization** for phenobarbital across studies — the most-cited limitation in every review [3,8].
- **Outcome heterogeneity** — hospital LOS is the dominant endpoint, which is administratively convenient but a weak proxy for patient-centered outcomes (seizure, DT incidence, mortality, post-discharge AUD engagement).
- **Population gaps** — current reviews explicitly call for greater inclusion of **women and racial/ethnic minority populations**, and for more individualized risk-stratification approaches to guide treatment selection [1].
- **Prediction, not just measurement** — PAWSS remains under-implemented despite being the only validated *predictive* tool for complicated AWS in the medically ill [4].
- Curiosity item: even **ethanol itself** has been systematically reviewed as a withdrawal treatment (10 studies); overall study quality was poor and the review concluded the evidence does not support implementation [14]. Useful as a lesson in why mechanistic plausibility is not sufficient.

---

### Ranked Differential

1. **Alcohol withdrawal delirium (delirium tremens), benzodiazepine-resistant** — timeline, kindling history, escalating requirement.
2. **Traumatic intracranial hemorrhage (subdural hematoma)** — fall + thrombocytopenia + coagulopathy; head CT is not optional.
3. **Post-operative sepsis / occult infection** — POD 0 with fever; clinically indistinguishable from DT.
4. **Wernicke encephalopathy** — treat empirically; do not wait for the triad.
5. **Hepatic encephalopathy** — probable cirrhosis, sedative-precipitated.
6. **Iatrogenic delirium** — opioid + high-dose benzodiazepine burden.
7. **Serotonin syndrome / NMS / anticholinergic toxidrome** — perioperative medication exposure.
8. **Metabolic** — hypomagnesemia, hypokalemia, hyponatremia, hypoglycemia.

---

### Workup & Management (summary)

**Acute:** ICU/step-down; titrate to light sedation on a validated sedation scale (abandon CIWA-Ar once delirious); phenobarbital via a **replacement**, protocolized strategy with airway monitoring; dexmedetomidine only as autonomic adjunct; antipsychotic only as adjunct; parenteral **thiamine before dextrose**; aggressive **magnesium/potassium** repletion; **head CT**, infectious workup, metabolic panel in parallel.

**Sub-acute:** Taper as autonomic parameters normalize; re-orient; delirium-mitigation bundle; nutrition; monitor for re-emergent seizure risk.

**Discharge:** AUD pharmacotherapy (**acamprosate** first here given opioid exposure and hepatic impairment; naltrexone once opioid-free) **plus** psychosocial linkage; explicit documentation of DT for future admissions; PAWSS-informed handoff [4,13].

---

### Facilitator Notes (not for the learner handout)

- **Time:** ~30 min. Q4 (the phenobarbital evidence) is the intellectual centerpiece; Q2 (what should have happened on admission) is the systems lesson; Q5 is the deliverable. If short on time, cut Q7.
- **The single distinction to send them home with:** **early replacement phenobarbital ≠ late stacked phenobarbital.** Kessel et al.'s fixed-dose non-overlapping protocol [9] and Cheng et al.'s adjunct cohort [10] point in *apparently* opposite directions; the reconciliation is design + timing, not drug effect. This is a good live demonstration of reading two studies that "disagree" and finding the actual signal.
- **Push on confounding by indication** whenever a resident cites the retrospective phenobarbital data as if it were causal. Ask: *who got the phenobarbital, and why?*
- **CL-specific teaching:** the moment CIWA-Ar stops being valid is the moment the consult adds the most value. Residents should be able to say out loud, in a note, "CIWA-Ar is no longer an appropriate instrument in this patient; here is what to titrate to instead."
- **Common resident errors:** (1) titrating to a scale rather than a physiologic endpoint; (2) adding antipsychotics early for "agitation" in DT; (3) treating dexmedetomidine as benzodiazepine-sparing in a seizure-risk patient; (4) missing the subdural in a patient who fell; (5) anchoring on withdrawal and never repeating a glucose; (6) discharging without AUD pharmacotherapy; (7) initiating naltrexone in a patient still on opioids.
- **Systems angle worth 3 minutes:** does your institution have a PAWSS-triggered admission order set? If not, that is a genuinely fundable QI project, and residents can build it.
- **Tone note:** model non-stigmatizing, quantified language throughout. Refractory DT generates staff frustration; part of the consultant's job is reframing it as a severe, predictable medical syndrome.

---

### References

1. Kast KA, Sidelnik SA, Nejad SH, Suzuki J. Management of alcohol withdrawal syndromes in general hospital settings. *BMJ.* 2025. [DOI](https://doi.org/10.1136/bmj-2024-080461) (PMID 39778965)
2. Day E, Daly C. Clinical management of the alcohol withdrawal syndrome. *Addiction.* 2021. [DOI](https://doi.org/10.1111/add.15647) (PMID 34288186)
3. Nishimura Y, Choi H, Colgan B, Kistler H, Mercado F. Current evidence and clinical utility of phenobarbital for alcohol withdrawal syndrome. *Eur J Intern Med.* 2023. [DOI](https://doi.org/10.1016/j.ejim.2023.03.006) (PMID 36935249)
4. Maldonado JR, Sher Y, Ashouri JF, et al. The "Prediction of Alcohol Withdrawal Severity Scale" (PAWSS): systematic literature review and pilot study of a new scale for the prediction of complicated alcohol withdrawal syndrome. *Alcohol.* 2014. [DOI](https://doi.org/10.1016/j.alcohol.2014.01.004) (PMID 24657098)
5. Meloy P, Rutz D, Bhambri A. Alcohol withdrawal. *J Educ Teach Emerg Med.* 2025. [DOI](https://doi.org/10.21980/J87S8Q) (PMID 39926251)
6. Ganatra RB, Breu AC, Ronan MV. Clinical guideline highlights for the hospitalist: 2020 American Society of Addiction Medicine clinical practice guideline on alcohol withdrawal management. *J Hosp Med.* 2022. [DOI](https://doi.org/10.12788/jhm.3729) (PMID 34910619)
7. Chand PK, Panda U, Mahadevan J, Murthy P. Management of alcohol withdrawal syndrome in patients with alcoholic liver disease. *J Clin Exp Hepatol.* 2022. [DOI](https://doi.org/10.1016/j.jceh.2022.03.003) (PMID 36340306)
8. Umar Z, Haseeb Ul Rasool M, Muhammad S, et al. Phenobarbital and alcohol withdrawal syndrome: a systematic review and meta-analysis. *Cureus.* 2023. [DOI](https://doi.org/10.7759/cureus.33695) (PMID 36788902)
9. Kessel KM, Olson LM, Kruse DA, et al. Phenobarbital versus benzodiazepines for the treatment of severe alcohol withdrawal. *Ann Pharmacother.* 2024. [DOI](https://doi.org/10.1177/10600280231221241) (PMID 38247044)
10. Cheng XJC, Chung J, Yoo N, et al. Impact of phenobarbital when used in combination with benzodiazepines for the treatment of alcohol withdrawal syndrome: a retrospective analysis. *Am J Emerg Med.* 2025. [DOI](https://doi.org/10.1016/j.ajem.2025.03.008) (PMID 40080990)
11. Matecki M, Noureldin A, Akkari R, et al. Phenobarbital addition to alcohol withdrawal treatment offers better outcomes than dexmedetomidine in hospitalized patients. *J Intensive Care Med.* 2025. [DOI](https://doi.org/10.1177/08850666251328881) (PMID 40152196)
12. Pruckner N, Baumgartner J, Hinterbuchinger B, et al. Thiamine substitution in alcohol use disorder: a narrative review of medical guidelines. *Eur Addict Res.* 2019. [DOI](https://doi.org/10.1159/000499039) (PMID 30897571)
13. McPheeters M, O'Connor EA, Riley S, et al. Pharmacotherapy for alcohol use disorder: a systematic review and meta-analysis. *JAMA.* 2023. [DOI](https://doi.org/10.1001/jama.2023.19761) (PMID 37934220)
14. Quelch D, Davies N, McFauld C, et al. Ethanol for the management of alcohol withdrawal syndrome: a systematic review. *Clin Toxicol (Phila).* 2024. [DOI](https://doi.org/10.1080/15563650.2024.2422964) (PMID 39559850)

*Citations retrieved from PubMed. This teaching case uses a synthetic, de-identified scenario for educational purposes only. Specific dosing is intentionally omitted; follow your institution's protocol and consult pharmacy.*

*Joshua Moss, MD | Psychiatrist*


---

## Suicide Risk & Safety Planning (Jul 23)

- **Slug:** `cotw_20260723_suiciderisk_res.md` · **Type:** md · **Sidebar:** listed
- **Source:** `08_Cases_and_Simulation/case-of-the-week/2026-07-23_suicide-risk-assessment-safety-planning_Resident.md`
- **Governance:** status=`pending` · riskKind=`clinical` · riskLevel=`high`
- **Length:** 2,283 words

<!-- topic_meta overlay -->
#### Structured metadata (`topic_meta.json` → this page)

> est. read 8 min · safetyLevel=`moderate` · cotwLevel=`res` (2026-07-23)

**TL;DR (shown above the page text):**

> Risk formulation over risk category - the limits of stratification scores, and collaborative safety planning as the actual intervention.

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
- **exam** — Teaching takeaway: Risk formulation over risk category - the limits of stratification scores, and collaborative safety planning as the actual intervention.
- **actions** — All Case of the Week cases

**Cross-references and tagging:**

- **Workflow stages:** `diagnosis`, `safety`, `treatment`, `team`, `exam`
- **Shelf blueprint tags:** `safety`
- **EPA crosswalk:** `EPA1`, `EPA2`, `EPA10`
- **Faculty review:** {"status": "pending", "reviewer": "Joshua Moss, MD", "lastReviewed": "2026-07-23"}

#### Page text (as shipped)

# Case of the Week — Resident Edition
## Suicide Risk Assessment & Safety Planning: Evidence-Based Formulation, Risk Stratification's Limits, and Acute Management

**Date:** 2026-07-23
**Learner level:** Psychiatry residents (PGY-1–4) — assumes DSM-5-TR fluency; guideline- and evidence-forward
**Format:** ~20–30 min case conference / small-group discussion. No required pre-reading.
**Citations:** Based on articles retrieved from PubMed. Full reference list at the end. All patient details are **synthetic and de-identified**.

> **Scope note.** This case is deliberately oriented toward **recognition, structured assessment, risk *formulation*, escalation, and collaborative safety planning**. It contains no method detail and requires none. Model that frame for junior learners.

---

### The Case (learner-facing stem)

A 34-year-old is evaluated on the consult service after presenting to the ED with 6 weeks of worsening depression following a relationship dissolution and a job loss. Symptoms include depressed mood, anhedonia, terminal insomnia, anorexia with weight loss, psychomotor slowing, guilt, and prominent **hopelessness**. The patient endorses active suicidal ideation "most of the day" with fluctuating intent but states they "haven't worked out any details." There is **one prior attempt** 8 years ago in a similar context, not previously disclosed to any clinician. The patient has been drinking heavily over the past 2 weeks and describes chronic access to lethal means at home. There is a first-degree family history of suicide.

Mental status: alert, cooperative, tearful, with constricted affect and mood-congruent hopeless cognitions; no perceptual disturbance; insight partial; cognition grossly intact. The patient is reluctant to be admitted and asks to go home "to sleep it off."

---

### Guided Discussion Questions

**Q1. Build a *risk formulation*, not a risk *score*. What are the highest-yield factors here, and how do you weight acute versus chronic and static versus modifiable?**
*Teaching point:* A defensible formulation integrates **chronic/static** vulnerability (prior attempt — the strongest historical predictor; family history of suicide), **acute/dynamic** drivers (active ideation with fluctuating intent, severe depression with hopelessness, terminal insomnia, escalating alcohol use, recent interpersonal and occupational losses), **access to lethal means**, and **protective factors** (which appear thin here). In depressive disorders, the most consistent clinical predictors of subsequent attempts and death include **prior attempt, prior/current suicidal ideation, hopelessness, and severe or psychotic depression** [1]. Frame this as a **narrative formulation** ("this patient's acute risk is elevated above their chronic baseline because…") that directly names the modifiable targets — the format that actually drives management and that documents your reasoning.

**Q2. A resident proposes admitting because the patient is "high-risk." Interrogate the evidentiary limits of risk *categorization*.**
*Teaching point:* Categorical high/low-risk labels are **poor predictors of individual outcomes.** Franklin et al.'s 50-year meta-analysis (365 studies) found risk-factor prediction only **slightly better than chance**, with no improvement across five decades [2]. Large et al. found that inpatient "high-risk" categorization pools to an OR ~7 but with a **positive predictive value under ~1%** and unacceptable heterogeneity — concluding risk models are "not a suitable basis for clinical decisions" [3]. The clinical translation: **do not let a "low-risk" label falsely reassure**, and do not treat "high-risk" as an automatic admission order. Use risk stratification to *identify modifiable factors and allocate intensity of intervention*, then decide disposition on the clinical picture, the patient's ability to engage in safety planning, and the feasibility of means reduction and follow-up.

**Q3. Which structured instruments add value, and where do they stop?**
*Teaching point:* The **C-SSRS** has validated convergent/divergent validity and sensitivity to change across adolescents and adults, and standardizes ideation severity, intensity, and behavior classification [4]. Screening tools such as the **ASQ** are validated for case-finding, particularly in youth and medical settings [5]. But instruments are **screening and standardization aids, not predictive rules** — consistent with Q2, a structured score should feed the formulation, not substitute for it. Teaching pearl: use the tool to ensure you asked the right questions and to communicate/documented severity, not to "clear" a patient.

**Q4. Walk through the Safety Planning Intervention as an *evidence-based* clinical procedure. What is the effect size, and what are its boundaries?**
*Teaching point:* SPI (Stanley & Brown) is a collaboratively constructed, prioritized hierarchy: warning signs → internal coping → social contacts/settings for distraction → people to ask for help → professionals/crisis resources → **means restriction**. In the VA ED cohort (n=1,640), **SPI + structured telephone follow-up** was associated with **~45% fewer suicidal behaviors** over 6 months (OR 0.56; 95% CI 0.33–0.95) and **>2× the odds** of outpatient engagement [6]. A meta-analysis of safety-planning-type interventions found a pooled **RR 0.570** for suicidal behavior (NNT ≈ 16) but **no significant effect on ideation** [7]; a systematic review of 26 studies supports feasibility, acceptability, and improvements across suicidality, hopelessness, and treatment engagement [8]. Boundaries to teach: SPI reduces *behavior*, works best **bundled with follow-up**, and is an adjunct to — not a replacement for — treating the underlying disorder and reducing means access.

**Q5. Means restriction is often the highest-leverage intervention. How do you operationalize lethal-means counseling here without slipping into method detail?**
*Teaching point:* **Means restriction is among the best-supported population- and individual-level suicide-prevention strategies** [9]. Operationally (framed generally, never specifically): collaboratively engage the patient — and, with consent, a trusted other — to **reduce or remove access to lethal means at home** during the high-risk period; leverage the family as partners in enacting the plan; and integrate this step into the written safety plan. The clinical craft is doing this **collaboratively and non-coercively** so the patient remains engaged. Note the acute confound here: heavy alcohol use both **elevates acute risk** (disinhibition, worsened mood/insomnia) and complicates capacity/engagement — address it as a modifiable acute factor.

**Q6. Disposition and legal-ethical dimension: the patient wants to leave. Reason through voluntary vs. involuntary care.**
*Teaching point:* Integrate acuity, modifiable-risk trajectory, capacity, and the feasibility of a safe outpatient plan. Given active ideation with fluctuating intent, a previously undisclosed prior attempt, severe depression with hopelessness, acute intoxication risk, ready means access, and thin supports, **acute risk is substantially above baseline and outpatient management is difficult to secure right now** — favoring admission. Teach the legal framework generically: **involuntary hold criteria vary by jurisdiction** but generally require a mental disorder plus imminent danger to self/others (or grave disability); pursue the **least restrictive option** that maintains safety, always attempt to **build voluntary engagement first**, and document capacity, the risk formulation, and the reasoning. "No-suicide contracts" have **no evidence base** and should not substitute for a safety plan or disposition decision.

**Q7. Acute pharmacology: the team asks whether anything "rapidly reduces suicidal ideation." What can you say from the evidence?**
*Teaching point:* Standard antidepressants **do not** rapidly reduce acute suicidal ideation (weeks to effect). **Esketamine** is FDA-approved (with a REMS) for depressive symptoms in MDD with acute suicidal ideation/behavior: the **ASPIRE I and II** phase-3 RCTs showed rapid, robust reduction in depressive symptoms (MADRS) at 24 hours versus placebo, each *added to comprehensive standard of care including hospitalization* — but in both trials the **between-group difference on the suicidality-specific measure (CGI-SS-r) was not statistically significant** [10,11]. Teaching nuances: (a) esketamine treats **depressive symptoms rapidly**, which is clinically valuable, but is **not** demonstrated to independently resolve suicidality beyond standard care; (b) it is an **adjunct within** a comprehensive plan (hospitalization, means restriction, safety planning, definitive treatment), not a stand-alone; (c) for the small subset with an established diagnosis, **lithium** and **clozapine** carry longer-term anti-suicidal signals (clozapine in schizophrenia/schizoaffective; lithium in mood disorders) — relevant to longitudinal planning, not the acute ED disposition.

**Q8 (Systems/continuity). What converts a good ED encounter into durable risk reduction?**
*Teaching point:* The **post-discharge window is a peak-risk period**; continuity is protective. Evidence-based, low-cost bundles include **structured follow-up contact / "caring contacts,"** rapid outpatient linkage with warm handoff, and system approaches (e.g., Zero Suicide-style care pathways). SPI's demonstrated benefit was **SPI *plus* follow-up** [6] — teach residents to treat the safety plan and the follow-up as a single intervention, and to communicate the formulation across the handoff so the receiving clinician inherits reasoning, not just a disposition.

---

### Ranked Differential (drivers of suicidality — treat the underlying condition)

1. **MDD, severe, single or recurrent episode, with suicidal ideation** (DSM-5-TR) — best fit; assess for **mixed features** and **psychotic features**, both of which raise risk and change treatment [1].
2. **Bipolar disorder, current episode depressed** — mandatory to exclude past (hypo)mania/mixed states before initiating an antidepressant; bipolar depression carries high suicide risk.
3. **Alcohol use disorder, acute intoxication/early withdrawal contribution** — independent acute-risk amplifier and a modifiable target; also a differential for the mood presentation.
4. **Adjustment disorder with depressed mood** vs. acute stress reaction — plausible given losses, but severity/duration and neurovegetative burden favor MDD.
5. **PTSD / complex trauma** — screen given interpersonal history; comorbidity elevates risk.
6. **Personality pathology (e.g., borderline)** with chronic suicidality — different risk trajectory (chronic > acute-on-chronic); management leans on DBT-informed skills and safety planning; do not dismiss acute changes as "characterological."
7. **Medical/organic contributors** — low prior probability with a clean exam, but consider if cognition/vitals change.

---

### Workup & Management (resident-level)

**Assessment/formulation:** Full risk assessment across ideation/intent/plan/means/prior behavior/protective factors; **corroborating collateral** (with consent); intoxication/withdrawal assessment (consider CIWA-Ar if withdrawal emerges); targeted labs as indicated; structured instrument (**C-SSRS**) to standardize and document [4]. Produce a **narrative risk formulation** naming modifiable targets.

**Acute management:**
1. **Safety and containment** appropriate to acuity while the formulation is completed.
2. **Address acute modifiable factors** — intoxication, agitation, insomnia.
3. **Collaborative Safety Plan (SPI)** + **lethal-means counseling** with the patient and (consented) supports [6,7,9].
4. **Disposition** — least-restrictive setting that maintains safety; here, admission is favored; build voluntary engagement first, use involuntary pathways only if criteria are met and voluntary care fails.
5. **Definitive treatment of the underlying disorder** — initiate/optimize evidence-based depression treatment; consider **esketamine within a comprehensive plan** for MDD with acute suicidal ideation where appropriate (with hospitalization/standard of care) [10,11]; consider **ECT** for severe, psychotic, or refractory depression with high acute risk.
6. **Continuity** — structured follow-up/caring contacts, rapid outpatient linkage, warm handoff carrying the formulation [6].

---

### Facilitator Notes (not for the learner handout)

- **Time:** ~30 min. Anchor on Q1 (formulation vs. score), Q2 (limits of stratification), and Q4–Q5 (SPI + means restriction) — the concepts that most change resident practice.
- **The central teaching tension:** we are ethically and medicolegally obligated to *assess* risk, yet the evidence shows we **cannot reliably predict individual acts** [2,3]. Resolve it by shifting from *prediction* to *modification and continuity*: the interventions with real effect sizes (SPI + follow-up, means restriction) act on modifiable factors regardless of predictive precision [6,7,9]. Discourage both false reassurance from "low-risk" labels and reflexive, defensive admission.
- **Documentation coaching:** a strong note contains a **formulation** (why acute risk is above/below this patient's baseline now), the **modifiable factors targeted**, the **collaborative safety plan**, **means-restriction counseling**, the **disposition rationale**, and the **capacity assessment** — not a bare "SI/no plan, contracts for safety" line (which is both clinically and legally weak).
- **Pharmacology caveat (Q7):** be precise — ASPIRE I/II showed rapid **MADRS** improvement but the **CGI-SS-r suicidality endpoint was not significant** vs. standard of care [10,11]. Don't let learners overstate esketamine as an "anti-suicide drug"; it rapidly treats depressive symptoms within a comprehensive plan.
- **Level-adaptation:** for PGY-1s emphasize the assessment domains and SPI mechanics; for senior residents push on the epidemiology of prediction, capacity/legal reasoning, and system-level continuity (Zero Suicide, caring contacts).
- **If a learner discloses personal distress:** exit the academic frame, respond supportively, and know institutional resident-wellness and crisis pathways.

---

### References

1. Riera-Serra P, Navarra-Ventura G, Castro A, et al. Clinical predictors of suicidal ideation, suicide attempts and suicide death in depressive disorder: a systematic review and meta-analysis. *Eur Arch Psychiatry Clin Neurosci.* 2023;274(7):1543–1563. [DOI](https://doi.org/10.1007/s00406-023-01716-5)
2. Franklin JC, Ribeiro JD, Fox KR, et al. Risk factors for suicidal thoughts and behaviors: a meta-analysis of 50 years of research. *Psychol Bull.* 2017;143(2):187–232. [DOI](https://doi.org/10.1037/bul0000084)
3. Large M, Myles N, Myles H, et al. Suicide risk assessment among psychiatric inpatients: a systematic review and meta-analysis of high-risk categories. *Psychol Med.* 2018;48(7):1119–1127. [DOI](https://doi.org/10.1017/S0033291717002537)
4. Posner K, Brown GK, Stanley B, et al. The Columbia-Suicide Severity Rating Scale: initial validity and internal consistency findings from three multisite studies with adolescents and adults. *Am J Psychiatry.* 2011;168(12):1266–1277. [DOI](https://doi.org/10.1176/appi.ajp.2011.10111704)
5. Hughes JL, Horowitz LM, Ackerman JP, et al. Suicide in young people: screening, risk assessment, and intervention. *BMJ.* 2023;381:e070630. [DOI](https://doi.org/10.1136/bmj-2022-070630)
6. Stanley B, Brown GK, Brenner LA, et al. Comparison of the Safety Planning Intervention with follow-up vs usual care of suicidal patients treated in the emergency department. *JAMA Psychiatry.* 2018;75(9):894–900. [DOI](https://doi.org/10.1001/jamapsychiatry.2018.1776)
7. Nuij C, van Ballegooijen W, de Beurs D, et al. Safety planning-type interventions for suicide prevention: meta-analysis. *Br J Psychiatry.* 2021;219(2):419–426. [DOI](https://doi.org/10.1192/bjp.2021.50)
8. Ferguson M, Rhodes K, Loughhead M, McIntyre H, Procter N. The effectiveness of the Safety Planning Intervention for adults experiencing suicide-related distress: a systematic review. *Arch Suicide Res.* 2022;26(3):1022–1045. [DOI](https://doi.org/10.1080/13811118.2021.1915217)
9. Fazel S, Runeson B. Suicide. *N Engl J Med.* 2020;382(3):266–274. [DOI](https://doi.org/10.1056/NEJMra1902944)
10. Fu DJ, Ionescu DF, Li X, et al. Esketamine nasal spray for rapid reduction of major depressive disorder symptoms in patients who have active suicidal ideation with intent: double-blind, randomized study (ASPIRE I). *J Clin Psychiatry.* 2020;81(3):19m13191. [DOI](https://doi.org/10.4088/JCP.19m13191)
11. Ionescu DF, Fu DJ, Qiu X, et al. Esketamine nasal spray for rapid reduction of depressive symptoms in patients with major depressive disorder who have active suicide ideation with intent: results of a phase 3, double-blind, randomized study (ASPIRE II). *Int J Neuropsychopharmacol.* 2021;24(1):22–31. [DOI](https://doi.org/10.1093/ijnp/pyaa068)

*Citations retrieved from PubMed. This teaching case uses a synthetic, de-identified scenario for educational purposes only.*

*If this material raises personal concerns for you or someone you know, in the U.S. you can call or text 988 (Suicide & Crisis Lifeline), available 24/7.*

*Joshua Moss, MD | Psychiatrist*
