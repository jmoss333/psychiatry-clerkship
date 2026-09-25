# Publication-level peer review: Psychiatry Clerkship Library

**Reviewed:** everything both learner sites ship, rebuilt from `origin/main` @ `2b18fd0` on 2026-09-24. That covers the MS3 site (82 narrative pages, 23 tools) and the resident site (88 pages, 26 tools), plus the 192 question-bank items, 437 audio-quiz questions across 79 decks, all case simulations (communication, reasoning, family-systems, longitudinal) and the evidence appendix (52 annotated claims, 109 registered sources).
**Standard:** current US academic adult-inpatient practice and major guidance (APA, VA/DoD 2024, ASAM, AASM, EXTRIP, CMS, FDA labels to Sept 2026, DSM-5-TR). The review assumes **national adoption**, so any rule that holds only in Maine or only in the UK counts as a finding.
**Reviewer posture:** conservative. A candidate finding survived only if a learner who acted on the exact sentence would do something wrong or come to believe something false.

---

## 1 · Bottom line

The library is **clinically safe and, for its size, unusually accurate.** After adversarial verification, **no finding is Critical.**
- **Accurate throughout:** doses, clozapine REMS status, CMS restraint rules, Appelbaum capacity, NMS vs serotonin syndrome discriminators, EXTRIP thresholds (on the MS3 lithium case), and thiamine/glucose sequencing were correct nearly everywhere.
- **No mis-keyed items** in the human-authored question bank. Every keyed answer was independently re-derived and matched.

What remains falls into three groups:
- **17 Major findings.** Wrong facts that change what a learner believes or does. Nine of them are in the machine-extracted audio decks.
- **187 Moderate findings.** Point-of-action omissions, rules stated too absolutely, and state or UK rules taught as universal.
- **154 Minor findings.** Terminology, stigmatising wording, and citation identity.

**The single most important thing to fix** is a process failure, not a clinical one. The 2026-09-01 remediation cycle left two kinds of defect behind:
- **Pasted instructions.** In three audio-quiz items (AR-34 Q6, AR-20 Q2, AR-27 Q3), the previous review's *correction instructions* were pasted into what learners see, as a stem, a keyed option or feedback.
- **Half-applied fixes.** In a further eight items and pages, a fix reached one layer and not its siblings. For example, the keyed option was corrected but the rationale and pearl still teach the old error (qb_sud_014), or the TL;DR was corrected but the prose was not (t_anxiety).

The clinical fixes below are small. The process fix is what stops the next review from finding these defects again.

## 2 · Method and ledger

1. **Fresh build.** Both sites were built from `origin/main` (the local checkout is 26 commits behind) and exported with `export_curriculum_review.py`. That produced 172 changed files since the last transcript, including two new Case-of-the-Week pairs.
2. **Deduplication.** 53 resident pages are byte-identical to MS3 and were reviewed once. For 38, only the resident-specific hunks were reviewed. 23 are resident-only and were reviewed in full.
3. **Review passes.** There were **29 independent review passes**, one per ~110 KB chunk and each a full read. Every pass applied the 14 requested lenses plus the repo's standing editorial policies. Each pass knew the 7 findings rejected in the prior review and did not re-raise them.
4. **Adversarial verification** of **137 findings** in a fresh context: all Major findings, plus every Moderate finding under suicide assessment, emergency psychiatry, psychopharmacology or legal/ethical. Verifiers checked primary sources with PubMed, FDA labels (DailyMed), EXTRIP, ASAM, statutes and the CFR, and re-graded severity.
5. **Quote check.** Every quote was confirmed to resolve **exactly once** against its chunk, so each correction is a drop-in string replacement.

| Stage | Count |
|---|---|
| Raw findings from 29 passes | 361 (0 Critical · 27 Major · 198 Moderate · 136 Minor) |
| Adversarially verified | 137 → 76 confirmed · 58 modified · **3 rejected** |
| Severity changes at verification | 28 (all downgrades; 10 Majors → Moderate) |
| **Final findings** | **358: 0 Critical · 17 Major · 187 Moderate · 154 Minor** |
| Verified vs first-pass-only | 134 verified · 224 reviewer judgment (Moderate/Minor outside the four high-stakes lenses) |
| Findings persisting from the 2026-09-01 review | 13 (all partial or instruction-pasted remediations) |

**Severity scale** (maps to the repo's S-scale):
- **Critical** = S1. Direct patient harm.
- **Major** = S2, or a serious S3. Wrong or outdated in a way that changes belief or action.
- **Moderate** = S3/S4. Misleading, a jurisdiction rule taught as universal, an overlay that conflicts with its prose, or an omission that changes management.
- **Minor** = S4/S5. Terminology, wording, or citation formatting.

## 3 · Critical: none. The safety-first queue

No finding survived verification as Critical. The findings below are the ones nearest that line: a resident or student acting on the text at the bedside could do the wrong thing. **Fix these first**, whatever their grade.

| # | ID | Page | Defect | Smallest fix |
|---|---|---|---|---|
| 1 | R01-001/-002 | `cl_reference.md` (resident 2 a.m. card) | Lithium dialysis uses the pre-EXTRIP ">2.5 with severe signs" floor. A seizing chronic-toxicity patient at 2.2 would not trigger it. | EXTRIP 2015: dialyse for decreased consciousness, seizures or life-threatening dysrhythmias **at any level**, or >4.0 with impaired kidney function. |
| 2 | R02-001/-002/-004 | `cotw_20260914_ssnms_res.md` (new) | In a case built on a confounded drug mix, the ladder stops only the D2 antagonists and never holds venlafaxine. It recommends bromocriptine without the serotonin syndrome warning, and paralysis without "avoid succinylcholine" despite CK >28,000. | Add "hold venlafaxine and all serotonergic agents until SS is excluded", "bromocriptine only once SS is excluded", and "non-depolarizing agent". |
| 3 | M05-001/-002/-003 | `toxidromes.md` rule-out card + first move | The febrile/rigid/altered differential omits **alcohol/sedative withdrawal (DTs)** and **sympathomimetic toxicity**. | Add both lines to the rule-out list and the first-move card. |
| 4 | M06-001 | `interaction-cards.html` | Clozapine plus smoking cessation (including enforced abstinence on admission): the card's one action is to "check a level in a week". | "Tell the prescriber the same day. A pre-emptive dose reduction is usually needed." |
| 5 | Q2-001/-002/-003 | `qb_cog_014` | The malignant catatonia/NMS key and pearl omit **lorazepam**, and the tier-2 feedback says benzodiazepines are "insufficient". | "…continue lorazepam…". Reconcile tier 2. |
| 6 | M06-005/-006 | `ect_neuromodulation.md` | "Hold benzodiazepines and anticonvulsants pre-ECT" is unqualified. | Continue antiepileptics given for epilepsy, and don't abruptly stop lorazepam in catatonia. |
| 7 | M05-005, M05-007 | `agitation.md`, `catatonia.md` | "Avoid benzodiazepines in delirium" has no withdrawal/catatonia exception. "Hold antipsychotics until catatonia is excluded" has no end point. | Add the exception, and give the hold an end point. The catatonia pearl carries the same wording and needs the same fix. |
| 8 | M01-001/-002/-003 | MS3 `orientation.md` + `week1.md` | Students are told to escalate at intent, plan or "threats". SI disclosed without intent, and HI not voiced as a threat, are never routed to the resident, which contradicts the pocket guide. | "Any new or newly disclosed suicidal thoughts (even passive)… thoughts of harming someone…" |
| 9 | M02-006/-007, M02-010 | `sp-interview.html` (attested) | A passive death-wish question earns full "asked directly about suicide" credit. Firearms and weapons are never prompted in any of the three cases. | Structural change, not a drop-in: require a killing-yourself/ending-your-life question for the must-ask item. Add a means/weapons prompt. |
| 10 | Q4-001/-002 | `qb_sud_014` | The rationale and pearl still teach CIWA-score-gated dosing after a withdrawal seizure, which contradicts the corrected key. Saitz 1994 excluded seizure history. | Replace the rationale and pearl to match the key: front-loaded/fixed dosing plus symptom-triggered supplementation. |
| 11 | R04-001 | `cotw_20260723_suiciderisk_res.md` | "Imminent danger" is taught as the general standard for a hold. Many states, Maine included, use "likelihood of serious harm" instead, so a resident taught imminence could discharge a holdable patient. | Rephrase as the statute's standard, and note that many states don't require imminence. |
| 12 | M13-001 | `rotation-curator.html` (shared catalog string) | "CIWA-Ar q4h through the risk window." | q1h while at or above threshold, then q4h. Fix it in `topic_meta.json` so every surface picks it up. |
| 13 | R03-004 | `cotw_20260727_oud_res.md` | The "bridge MOUD supply" line doesn't say that methadone for OUD cannot be prescribed at discharge. | Buprenorphine Rx; methadone = OTP next day, or the DEA 3-day dispensing rule. |

## 4 · The 17 Major findings, in full

### M08-002 · rounds_questions.md · `page`
*Severity: **Major** · DSM-5-TR accuracy · both · verified — confirmed · confidence high · source `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md`*

> **As written:** lasting ≥7 days (or any duration if hospitalization required), plus ≥3 of: **DIG FAST**

- **Problem:** The manic-episode criterion B omits the rule that four symptoms (not three) are required when the mood is only irritable.
- **Why it matters:** Applying a threshold of 3 to irritable-only presentations over-diagnoses mania, and bipolar I is then a lifelong diagnosis with major treatment consequences. This distinction is also routinely tested on the shelf exam.
- **Supporting evidence:** DSM-5-TR manic episode Criterion B: three or more symptoms (four if the mood is only irritable). · *Verifier:* DSM-5-TR manic episode Criterion B (recall)
- **Smallest safe correction:** lasting ≥7 days (or any duration if hospitalization required), plus ≥3 (≥4 if mood is only irritable) of: **DIG FAST**

### M09-001 · rapid_review.md · `page`
*Severity: **Major** · factual inaccuracies · both · verified — modified · confidence high · source `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md`*

> **As written:** MOUD (buprenorphine/methadone/naltrexone) reduces mortality.

- **Problem:** Groups naltrexone with the opioid agonists as mortality-reducing. The mortality benefit is established for methadone and buprenorphine; naltrexone has shown no such association.
- **Why it matters:** Learners who memorize this recall line will treat XR-naltrexone as interchangeable with agonist therapy on the outcome that most separates them. That affects how they counsel and choose a medication after an overdose.
- **Supporting evidence:** Larochelle MR et al., Ann Intern Med 2018;169:137-145 (PMID 29913516, doi:10.7326/M17-3107): methadone AHR 0.47 and buprenorphine AHR 0.63 for all-cause mortality after nonfatal overdose; naltrexone showed no association (AHR 1.44, CI 0.84-2.46). · *Verifier:* Larochelle MR et al., Ann Intern Med 2018;169:137-145 (PMID 29913516, doi:10.7326/M17-3107), abstract
- **Smallest safe correction:** methadone and buprenorphine reduce mortality; naltrexone has not been shown to (and requires an opioid-free window before starting).

### M11-001 · cotw_20260727_oud_ms3.md · `topic_meta.tldr`
*Severity: **Major** · factual inaccuracies · MS3 · verified — confirmed · confidence high · source `08_Cases_and_Simulation/case-of-the-week/2026-07-27_opioid-use-disorder_MS3.md`*

> **As written:** > One encounter, two failures: a COWS-threshold buprenorphine start precipitated withdrawal in a fentanyl-exposed patient, and the recovery is methadone or low-dose initiation - with acute pain treated alongside the MOUD, never instead of it.

- **Problem:** The TL;DR (repeated verbatim as the 'Shelf-level takeaway' exam card) describes a different case. In the MS3 page, naloxone precipitated the withdrawal, no buprenorphine was given, and acute pain is never managed. The page's own answer is to start buprenorphine in the ED now, not methadone or low-dose initiation.
- **Why it matters:** A learner who reads only the card takes away the wrong mechanism for this patient's withdrawal and the wrong next step (avoid a standard buprenorphine start). The page teaches the opposite. As a free-standing claim, 'the recovery is methadone or low-dose initiation' also leaves out that buprenorphine-precipitated withdrawal is usually treated first with more buprenorphine plus adjuncts.
- **Supporting evidence:** Page text Q1/Q2 (naloxone-precipitated withdrawal) and Q5 'In this case... Buprenorphine is the practical answer — start it here'; Englander et al., JAMA Intern Med 2024 (ref 3), on managing precipitated withdrawal. · *Verifier:* Page text of cotw_20260727_oud_ms3.md (Q1, Q2, Q5, Q7) compared with the resident page in R03.md; recall for precipitated-withdrawal management
- **Smallest safe correction:** > Two toxidromes, one encounter: naloxone reversed the overdose and precipitated withdrawal. Observe for re-sedation, treat the withdrawal, start buprenorphine in the building, and send him out with naloxone and a named follow-up.

### M11-002 · cotw_20260726_etohwd_ms3.md · `page`
*Severity: **Major** · factual inaccuracies · MS3 · verified — confirmed · confidence medium · source `08_Cases_and_Simulation/case-of-the-week/2026-07-26_alcohol-withdrawal-delirium-tremens_MS3.md`*

> **As written:** a shorter interval since the last drink at presentation

- **Problem:** The direction is reversed. In the cohort usually cited for this risk factor, patients who developed DT had gone MORE days since their last drink. Neither PAWSS nor the major reviews lists a short interval as a predictor of complicated withdrawal.
- **Why it matters:** A learner would treat someone who presents 2-3 days after the last drink (already inside the DT window) as lower risk, which is exactly the patient who goes on to DT.
- **Supporting evidence:** Ferguson JA et al. Risk factors for delirium tremens development. J Gen Intern Med 1996;11:410-4 (PMID 8842933): on multivariable analysis, more days since last drink (OR 1.3, 95% CI 1.09-1.61) and concurrent acute illness (OR 5.1) predicted DT. · *Verifier:* Ferguson JA et al., J Gen Intern Med 1996;11:410-4 (PMID 8842933, doi:10.1007/BF02600188), abstract
- **Smallest safe correction:** a longer interval since the last drink at presentation (already late in the withdrawal timeline)

### Q4-001 · qb_sud_014 · `item`
*Severity: **Major** · emergency psychiatry · both · verified — confirmed · confidence high · persists from A1C3-F001 · source `question_bank.json`*

> **As written:** Prior withdrawal seizure = highest predictor of future seizures; aggressive CIWA-Ar-guided benzodiazepines + DT monitoring is the standard.

- **Problem:** The keyed option was corrected (after A1C3-F001) to teach prompt benzodiazepine plus front-loaded or fixed-schedule dosing, 'not score-gated dosing alone', but the pearl still teaches CIWA-Ar-guided (score-gated) dosing as the standard. The item now contradicts itself.
- **Why it matters:** The pearl is the line learners remember. A resident who acts on it writes a symptom-triggered-only order for a patient admitted after a withdrawal seizure. Benzodiazepine is then withheld whenever the score dips, during the window when recurrent seizures cluster, and those seizures can occur at low CIWA-Ar scores.
- **Supporting evidence:** ASAM Clinical Practice Guideline on Alcohol Withdrawal Management (2020): patients with a withdrawal seizure should receive a benzodiazepine promptly, and front-loading or fixed-schedule dosing is appropriate for patients at high risk of complicated withdrawal. The item's own keyed option says the same thing. · *Verifier:* Saitz R et al., JAMA 1994;272:519-23, PMID 8046805 (enrolled only patients with 'no history of seizures'); ASAM Alcohol Withdrawal Management Guideline 2020 (recall on the exact front-loading wording); keyed option in the same item.
- **Smallest safe correction:** Prior withdrawal seizure = strong predictor of future seizures; give a benzodiazepine promptly with front-loaded or fixed-schedule dosing plus symptom-triggered supplementation (not score-gated dosing alone) + DT monitoring.

### Q4-002 · qb_sud_014 · `rationale`
*Severity: **Major** · emergency psychiatry · both · verified — confirmed · confidence high · persists from A1C3-F001 · source `question_bank.json`*

> **As written:** CIWA-Ar-guided benzodiazepines are the treatment, and DT vigilance is the priority.

- **Problem:** The rationale's closing sentence says CIWA-Ar-guided dosing is the treatment. That contradicts the corrected key, which says 'not score-gated dosing alone' for a patient with a withdrawal seizure.
- **Why it matters:** The item teaches two incompatible regimens. A learner who reads the rationale as the explanation of the key will leave with the score-gated regimen, which is the unsafe one for this patient.
- **Supporting evidence:** ASAM Alcohol Withdrawal Management Guideline (2020), on benzodiazepine dosing after a withdrawal seizure and front-loading for high-risk patients. The keyed option in the same item agrees. · *Verifier:* Saitz 1994, PMID 8046805 (seizure history excluded); ASAM 2020 guideline (recall); keyed option in the item.
- **Smallest safe correction:** Prompt benzodiazepine with front-loaded or fixed-schedule dosing, supplemented by CIWA-Ar-triggered doses, is the treatment, and DT vigilance is the priority.

### R01-001 · cl_reference.md · `page`
*Severity: **Major** · emergency psychiatry · Resident · verified — confirmed · confidence high · source `14_Tracks/Resident/cl_reference.md`*

> **As written:** - **Hemodialysis** if level **>4.0** mEq/L (any patient), or **>2.5** with severe neuro/renal signs or life-threatening features.

- **Problem:** The dialysis rule uses the pre-EXTRIP level floor. Under EXTRIP, decreased consciousness, seizures or life-threatening dysrhythmias are indications for dialysis at any lithium level, and >4.0 is recommended when kidney function is impaired (>5.0 is suggested regardless).
- **Why it matters:** In chronic toxicity, severe neurotoxicity often occurs at levels of 1.5–2.5. A resident using this 2 a.m. reference would not call for dialysis for a seizing or obtunded patient at a level of 2.2, which risks lasting neurologic injury (SILENT). The page's own advice to 'treat the patient, not the number' contradicts the rule.
- **Supporting evidence:** Decker BS et al., EXTRIP Workgroup, 'Extracorporeal treatment for lithium poisoning', Clin J Am Soc Nephrol 2015;10:875-887. Recommended: [Li] >4.0 mEq/L with impaired kidney function, OR decreased consciousness, seizures or life-threatening dysrhythmias irrespective of [Li]. Suggested: [Li] >5.0, significant confusion, or expected time to [Li] <1.0 >36 h. · *Verifier:* Decker BS et al., EXTRIP, Clin J Am Soc Nephrol 2015;10:875-87 (PMID 25583292, doi:10.2215/CJN.10021014).
- **Smallest safe correction:** - **Hemodialysis (EXTRIP 2015):** recommended if level **>4.0** mEq/L with impaired kidney function, or with decreased consciousness, seizures, or life-threatening dysrhythmias **at any level**; suggested if **>5.0**, significant confusion, or expected time to <1.0 mEq/L exceeds 36 h despite optimal care.

### R01-002 · cl_reference.md · `topic_meta.points`
*Severity: **Major** · emergency psychiatry · Resident · verified — modified · confidence high · source `14_Tracks/Resident/cl_reference.md`*

> **As written:** Lithium: toxicity generally ≥1.5 mEq/L, dialysis if >4.0 (or >2.5 with severe signs) — treat the patient, not the number, in chronic toxicity.

- **Problem:** The key-point card repeats the outdated '>2.5 with severe signs' dialysis floor. EXTRIP makes decreased consciousness, seizures or life-threatening dysrhythmias an indication at any level, and ties >4.0 to impaired kidney function.
- **Why it matters:** The card is shown on its own above the page, so a resident could screen out a symptomatic patient with a lower level from dialysis.
- **Supporting evidence:** Decker BS et al., EXTRIP, CJASN 2015;10:875-887. · *Verifier:* Decker BS et al., EXTRIP, CJASN 2015;10:875-87 (PMID 25583292, doi:10.2215/CJN.10021014).
- **Smallest safe correction:** Lithium: toxicity generally ≥1.5 mEq/L; dialysis for >4.0 with impaired kidney function, >5.0 regardless, or decreased consciousness, seizures or life-threatening dysrhythmias at any level — treat the patient, not the number, in chronic toxicity.

### AQ2-001 · AR-34 Q6 · `item`
*Severity: **Major** · factual inaccuracies · both · verified — confirmed · confidence high · persists from A3C2-F003 · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** Re-key the item to match the deck's own overstatement-item convention (the key is the false claim): key 'The benefits of the program are uniform regardless of how long the patient was psychotic before treatment' as the common overstatement (its existing feedback already explains the DUP moderation), and reword the current keyed option into a true-statement distractor: 'The benefits were concentrated in patients with shorter duration of untreated psychosis (below the ~74-week median), so gains may be smaller when treatment starts late' — with feedback that this is an accurate limitation, not an overstatement: RAISE-ETP's moderator analysis showed greater benefit with shorter DUP, not that CSC is ineffective beyond 74 weeks.

- **Problem:** The keyed answer option is a pasted editorial remediation instruction, not an answer choice; the prior fix (A3C2-F003) was applied as literal text into the option slot, so learners see a paragraph of reviewer instructions marked 'keyed correct'.
- **Why it matters:** The item is unanswerable as shipped and exposes internal editorial text to learners; the stem remains double-keyed because the 'uniform benefit' distractor's feedback calls itself 'a common overstatement'.
- **Supporting evidence:** Prior finding A3C2-F003 (2026-09-01) on this item; Kane JM et al., Am J Psychiatry 2016 (RAISE-ETP 2-year: benefit greater with DUP below the 74-week median). Note Robinson DG et al., Schizophr Bull 2022;48(5):1021-1031 (doi:10.1093/schbul/sbac053): at 5 years DUP did NOT moderate the QLS advantage (P=.32), so the DUP moderation is a 2-year finding. · *Verifier:* Robinson DG et al., Schizophr Bull 2022;48:1021-31, PMID 35689478, doi:10.1093/schbul/sbac053; recall of Kane JM et al., Am J Psychiatry 2016 (DUP<74-week median moderation)
- **Smallest safe correction:** The 2-year benefits were concentrated in patients with shorter duration of untreated psychosis (below the 74-week median), so gains may be smaller when treatment starts late.

### AQ3-001 · AR-20 Q2 · `item`
*Severity: **Major** · citation problems · both · verified — confirmed · confidence high · persists from A3C2-F007 · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** Rewrite the item to the review's actual result, e.g. stem: 'A 2022 Cochrane review of 15 RCTs evaluated Shared Decision-Making (SDM) interventions in mental health care. Which outcome showed some evidence of improvement?' keyed to 'Patients' perceived involvement in the decision-making process immediately after the encounter', with feedback that effects on knowledge, overall satisfaction, and clinical outcomes were uncertain (low- to very-low-certainty evidence). Align Q6's feedback with the same summary, and attribute knowledge/decisional-conflict gains to the general patient decision-aid literature if that teaching point is kept.

- **Problem:** The prior review's remediation instruction (A3C2-F007 'replacement') was pasted verbatim into the learner-facing stem; the options, key and feedback were never rewritten, so the item still keys 'Patient satisfaction and knowledge' while its own stem says that finding is uncertain.
- **Why it matters:** Learners see an editorial instruction instead of a question and a key that contradicts it; the item teaches the Cochrane review backwards.
- **Supporting evidence:** Aoki Y et al., Shared decision-making interventions for people with mental health conditions, Cochrane Database Syst Rev 2022;11:CD007297 (doi:10.1002/14651858.CD007297.pub3): 15 RCTs; SDM 'may improve SDM-specific user-reported outcomes from encounters immediately after intervention' (SMD 0.63, low certainty); 'We are uncertain if SDM interventions improve users' overall satisfaction'; 'uncertain whether SDM interventions improve knowledge ... and the relationship between users and healthcare professionals'; clinical outcomes uncertain (very low certainty). · *Verifier:* Aoki Y et al., Cochrane Database Syst Rev 2022;11:CD007297, PMID 36367232, doi:10.1002/14651858.CD007297.pub3
- **Smallest safe correction:** A 2022 Cochrane review of 15 RCTs evaluated shared decision-making (SDM) interventions in mental health care. Which outcome showed some evidence of improvement?

### AQ3-002 · AR-20 Q2 · `item`
*Severity: **Major** · citation problems · both · verified — confirmed · confidence high · persists from A3C2-F007 · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** Patient satisfaction and knowledge

- **Problem:** The keyed answer is the one outcome set the named Cochrane review explicitly called uncertain; the only improved outcome was patients' perceived involvement immediately after the encounter (low-certainty evidence).
- **Why it matters:** Learners and residents would cite the Cochrane review as showing SDM improves knowledge and satisfaction, which it does not.
- **Supporting evidence:** Aoki Y et al., Shared decision-making interventions for people with mental health conditions, Cochrane Database Syst Rev 2022;11:CD007297 (doi:10.1002/14651858.CD007297.pub3): 15 RCTs; SDM 'may improve SDM-specific user-reported outcomes from encounters immediately after intervention' (SMD 0.63, low certainty); 'We are uncertain if SDM interventions improve users' overall satisfaction'; 'uncertain whether SDM interventions improve knowledge ... and the relationship between users and healthcare professionals'; clinical outcomes uncertain (very low certainty). · *Verifier:* Aoki Y et al., Cochrane Database Syst Rev 2022;11:CD007297, PMID 36367232, doi:10.1002/14651858.CD007297.pub3
- **Smallest safe correction:** Patients' perceived involvement in the decision immediately after the encounter

### AQ3-003 · AR-20 Q2 · `rationale`
*Severity: **Major** · citation problems · both · verified — modified · confidence high · persists from A3C2-F007 · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** The meta-analysis found that SDM interventions effectively enhanced how much patients knew about their treatment and how satisfied they were with the process.

- **Problem:** The rationale says SDM improved knowledge and satisfaction, but Aoki 2022 was uncertain on both. The replacement should not give one certainty grade to every outcome.
- **Why it matters:** Teaches an efficacy claim the cited review does not support.
- **Supporting evidence:** Aoki Y et al., Shared decision-making interventions for people with mental health conditions, Cochrane Database Syst Rev 2022;11:CD007297 (doi:10.1002/14651858.CD007297.pub3): 15 RCTs; SDM 'may improve SDM-specific user-reported outcomes from encounters immediately after intervention' (SMD 0.63, low certainty); 'We are uncertain if SDM interventions improve users' overall satisfaction'; 'uncertain whether SDM interventions improve knowledge ... and the relationship between users and healthcare professionals'; clinical outcomes uncertain (very low certainty). · *Verifier:* Aoki Y et al., Cochrane Database Syst Rev 2022;11:CD007297, PMID 36367232, doi:10.1002/14651858.CD007297.pub3
- **Smallest safe correction:** The review found low-certainty evidence that SDM interventions increase patients' perceived involvement in the decision immediately after the encounter; it was uncertain whether they improve knowledge, overall satisfaction or clinical outcomes.

### AQ3-006 · AR-27 Q3 · `rationale`
*Severity: **Major** · citation problems · both · verified — modified · confidence medium · persists from A3C2-F006 · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** Rewrite the item to the trial's published finding, e.g. stem: 'In BALANCE, how did lithium monotherapy compare with valproate monotherapy for relapse prevention?' keyed to 'Lithium was superior at preventing new intervention for an emergent mood episode of either pole (HR 0.71, 95% CI 0.51-1.00)', with feedback noting the primary outcome covered relapse of any polarity and the trial did not establish a specific depressive-pole advantage. Do not key a polarity-specific claim or the 0.63 figure unless it is verified against the paper's polarity-specific secondary outcomes in the full report.

- **Problem:** The keyed feedback is a pasted editorial instruction. The key 'Depressive relapses' is supported by BALANCE's reported secondary analysis (HR 0.63), so the feedback should explain that result and mark it as secondary, not deny it.
- **Why it matters:** Learners see an editorial instruction, and the item still teaches an unverified polarity-specific claim for choosing a maintenance agent; the stem/key need rewriting (or the item withdrawn) along the lines the instruction describes.
- **Supporting evidence:** Geddes JR et al. (BALANCE), Lancet 2010;375:385-95 (doi:10.1016/S0140-6736(09)61828-6): primary outcome new intervention for an emergent mood episode of either pole; lithium vs valproate HR 0.71 (95% CI 0.51-1.00), combination vs valproate HR 0.59. · *Verifier:* Geddes JR et al. (BALANCE), Lancet 2010;375:385-95, PMID 20092882, doi:10.1016/S0140-6736(09)61828-6 (abstract: primary HR 0.71); full-text Findings sentence read via the reprint at psychiatryonline.org/doi/full/10.1176/foc.9.4.foc488 (two independent fetches returned the same verbatim sentence; exact-phrase web search also matches it)
- **Smallest safe correction:** In the full report, lithium's advantage over valproate was most apparent for depressive relapses (HR 0.63, 95% CI 0.41–0.96) — a secondary, polarity-specific analysis; the primary outcome, new intervention for an emergent mood episode of either pole, favored lithium overall (HR 0.71, 95% CI 0.51–1.00).

### AQ3-011 · AR-29 Q1 · `item`
*Severity: **Major** · citation problems · both · verified — confirmed · confidence high · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** The 2024 paper by Kirkbride et al. in 'World Psychiatry' used which of the following methods to establish the evidence base for social determinants of mental health?

- **Problem:** Misattribution: the 'umbrella review of 26 meta-analyses' (keyed) and the food-insecurity medium-effect finding (Q2) belong to Alon et al., Psychiatry Research 2024, not Kirkbride et al., World Psychiatry 2024, which is a narrative roadmap review.
- **Why it matters:** Learners (and residents citing it) attach the wrong method and findings to a landmark paper; anyone checking Kirkbride will not find the keyed content.
- **Supporting evidence:** Alon N, ... Jeste DV. Social determinants of mental health in major depressive disorder: umbrella review of 26 meta-analyses and systematic reviews. Psychiatry Res 2024;335:115854 (doi:10.1016/j.psychres.2024.115854): childhood abuse/neglect, IPV in females and food insecurity associated with MDD with medium effect sizes. Kirkbride JB et al., World Psychiatry 2024;23:58-90 (doi:10.1002/wps.21160) is a narrative evidence-and-prevention roadmap across disorders, not a 26-meta-analysis umbrella review. · *Verifier:* PubMed PMID 38214615 (Kirkbride, doi:10.1002/wps.21160); PMID 38554496 (Alon, doi:10.1016/j.psychres.2024.115854)
- **Smallest safe correction:** The 2024 umbrella review by Alon et al. in 'Psychiatry Research' used which of the following methods to establish the evidence base for social determinants of major depressive disorder?

### AQ3-013 · AR-23 Q2 · `rationale`
*Severity: **Major** · factual inaccuracies · both · verified — confirmed · confidence high · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** The study found an MMSE decline of −2.4 points over 36 weeks in the antipsychotic group compared to placebo, representing significant acceleration of the disease process.

- **Problem:** The −2.4-point MMSE figure is the overall decline across all CATIE-AD patients (drug and placebo) over 36 weeks, not the antipsychotic-minus-placebo difference.
- **Why it matters:** Learners would quote a drug effect roughly an order of magnitude too large as the CATIE-AD cognitive harm.
- **Supporting evidence:** Vigen CL et al., Am J Psychiatry 2011;168:831-9 (doi:10.1176/appi.ajp.2011.08121844): 'Overall, patients showed steady, significant declines ... MMSE; -2.4 points over 36 weeks'; cognition declined more with antipsychotics than placebo on MMSE, BPRS cognitive subscale and a cognitive summary score, 'consistent with 1 year's deterioration compared with placebo'. · *Verifier:* Vigen CL et al., Am J Psychiatry 2011;168:831-9, PMID 21572163, doi:10.1176/appi.ajp.2011.08121844
- **Smallest safe correction:** All patients declined (MMSE −2.4 points over 36 weeks overall), and decline was significantly greater with antipsychotics than with placebo on the MMSE, BPRS cognitive subscale and a cognitive summary score — a magnitude the authors equated to about one year's additional deterioration.

### AQ3-016 · AR-18 Q3 · `item`
*Severity: **Major** · factual inaccuracies · both · verified — confirmed · confidence high · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** Combined treatment is superior to either pharmacotherapy or psychotherapy alone.

- **Problem:** Mis-keyed: the cited meta-analysis found combined treatment superior to pharmacotherapy alone but NOT more effective than CBT alone at short or long term.
- **Why it matters:** Learners would state on rounds and exams that the paper showed combination beats psychotherapy, the opposite of its finding.
- **Supporting evidence:** Cuijpers P et al., World Psychiatry 2023;22:105-15 (doi:10.1002/wps.21069): 'Combined treatment was more effective than pharmacotherapies alone ... but it was not more effective than CBT alone at either time point'; 'CBT was significantly more effective than other psychotherapies, but the difference was small (g=0.06) and became non-significant in most sensitivity analyses.' · *Verifier:* Cuijpers P et al., World Psychiatry 2023;22:105-15, PMID 36640411, doi:10.1002/wps.21069
- **Smallest safe correction:** Combined treatment is superior to pharmacotherapy alone but was not significantly more effective than CBT alone.

### AQ3-017 · AR-18 Q3 · `rationale`
*Severity: **Major** · factual inaccuracies · both · verified — confirmed · confidence high · source `audio-companion quiz deck data (see A3 transcript)`*

> **As written:** The meta-analysis confirmed that the synergy of medication and therapy provides better outcomes than either treatment modality used in isolation.

- **Problem:** Rationale inverts the finding for CBT alone.
- **Why it matters:** Same false belief as the key.
- **Supporting evidence:** Cuijpers P et al., World Psychiatry 2023;22:105-15 (doi:10.1002/wps.21069): 'Combined treatment was more effective than pharmacotherapies alone ... but it was not more effective than CBT alone at either time point'; 'CBT was significantly more effective than other psychotherapies, but the difference was small (g=0.06) and became non-significant in most sensitivity analyses.' · *Verifier:* Cuijpers P et al., World Psychiatry 2023;22:105-15, PMID 36640411, doi:10.1002/wps.21069
- **Smallest safe correction:** The meta-analysis found combined treatment more effective than pharmacotherapy alone at short and longer-term follow-up, but not more effective than CBT alone.


## 5 · Systemic patterns: each is one decision, not N tickets

| Pattern | Findings | What it looks like | One-decision fix |
|---|---|---|---|
| **A. Remediation that shipped as instructions, or reached one layer only** | AQ2-001, AQ3-001/-002/-003/-004/-006/-008/-009/-010, Q4-001/-002, Q1-001/-002/-003, M03-001/-002, M04-001/-002, M10-001, M11-008, R05-010 | A prior `replacement` field that was an instruction was pasted verbatim into learner text. Or the key was fixed but not the rationale, pearl, stem or distractor feedback. Or the TL;DR was fixed but not the prose. | Make the completion check layer-complete: grep the *concept* across stem, options, feedback, rationale, pearl, overlay and prose, not just the quote. Add a lint: learner-facing registries may not contain editorial imperatives ("Rewrite the item", "Re-key", "Replace with", "reviewer"). |
| **B. Jurisdiction taught as universal** | M05-008, M06-008, Q1-009, M09-006 (Tarasoff); M06-009/-010, Q1-012 (elder abuse); R04-001 (imminence); M12-001 (involuntary meds: criminal cases only); R02-008 (ECT surrogate); Q1-016 (voluntary discharge); M04-017/-018 (paraphilia reporting); **UK-as-US:** R04-005 (valproate PPP), M11-003 (MAOI washout) | Correct for Maine or the UK, wrong somewhere in the US. | One standard footnote pattern: "varies by state: mandatory / permissive / none. Check your statute (Maine: …)". The resident `systems_medlegal.md` already does this well; copy its convention. |
| **C. Fentanyl-era buprenorphine taught as "wait for COWS 8–12"** | M05-014, M08-008, M09-007, Q4-003/-004, AQ1-006; related M09-001 (naltrexone mortality), M11-001, R03-004 | COWS threshold presented as *the* rule, with low-dose initiation excluded. | One canonical sentence (ASAM 2023 high-potency synthetic opioid guidance), reused on all 7 surfaces. |
| **D. DSM-5-TR criteria drift** | M08-002 (irritable-only mania needs 4), M09-002, M09-003 (PTSD 3 clusters), M11-005 (MDD 5 of 9), Q1-006/-007 (ADHD "two settings"), Q1-013/-014 & M02-001/-002 (mixed features counting agitation/insomnia, or a single thought), M08-001 (schizoaffective), Q3-003 | Recall-grade paraphrases of criteria, mostly on high-memorisation surfaces (rapid review, rounds Q&A, pearls). | Pin the criteria sentences for the ~10 most-tested diagnoses as one canonical string set, and reuse it. |
| **E. Point-of-action omissions in hyperthermia / withdrawal / catatonia** | §3 rows 1–7, plus M10-002/-003, M06-004, R01-009, R01-006, M05-006, M06-007, R03-005 | The text is right in what it says, and incomplete at the moment of action. | Same fix as the 2026-09-01 S1 class: audit every rule-out and first-move card against a single master differential. |
| **F. Suicide-inquiry thresholds** | M01-001/-002/-003, M01-010, M02-005/-006/-007/-008/-009/-012, M03-004, M13-002, R05-001, AQ2-003/-004, C1-005 | Passive wish credited as direct inquiry. Escalation set at intent. C-SSRS treated as assessment. Lithium anti-suicide evidence not updated for Katz 2022 (VA, stopped for futility). | Bring these surfaces into line with `pg_interview.md`, which is already right. |
| **G. Machine-extracted audio decks** | 50 findings, 9 Major (AQ3 alone: 8 Major) | Misattributed papers (AR-29: Alon, not Kirkbride), inverted results (AR-18: combined not > CBT alone), whole-sample vs between-group (AR-23), subgroup comparisons that never happened (AR-44, AR-26). | Treat A3 as unattested until each deck is checked against the paper's **results section**. The four AQ chunk files are ready-made work packages. |
| **H. Statistic without identity, or overstated design** | M07-001/-002/-003/-011, M12-003, E1-002/-003/-004, Q3-009/-010/-011, R01-005/-013, AQ4-003 | Subgroup or cohort data stated as a trial result; a review cited for a setting it excluded. | This is the existing `sweep_unlicensed_claims.py` class, and it needs an `evidence_annotations.json` span per fix. |

## 6 · Linked edits the drop-in quotes do not cover

Verifiers found sibling text that repeats a defect but falls outside its quote. **Apply these in the same edit as the finding**, or the fix will be half-applied again (pattern A).

- **AR-18 (AQ3-016/-017):** Q3 option 4 feedback still says combined beats both monotherapies, and Q6 option 1 will contradict the new key.
- **AR-20 (AQ3-001–-004):** Q6 feedback still says "satisfaction and engagement improve". The options and key for Q2 must be rebuilt, not just the stem.
- **AR-23 (AQ3-013/-014):** Q2 distractor feedback repeats "−2.4 point difference".
- **AR-26 Q5 (AQ3-008–-010):** the keyed feedback says "medication-only outcomes" (both arms took medication), and the distractors still say "both trials".
- **AR-29 (AQ3-011):** Q2's feedback and Q3–Q5 still name Kirkbride.
- **AR-34 Q6 (AQ2-001/-002):** still double-keyed after the fix. Change the stem to "limitation", or re-key to the "uniform benefit" option.
- **AR-48 Q4 (AQ1-002):** the 2018 NMA *does* name escitalopram and sertraline among five "better balance" drugs, but paroxetine and agomelatine are also in that group. The distractor "paroxetine and agomelatine" is therefore also defensible, so rewrite the distractor.
- **AR-41 (AQ1-004/-006):** the stem still attributes the withdrawal threshold to Fudala 2003.
- **AR-37 Q5 (AQ2-006):** the "tapering phase" distractor now overlaps the corrected answer, because a taper is a dose change.
- **qb_anx_003 (Q1-001–-003):** "strongest evidence" also appears in the evidence line.
- **qb_mood_005 (Q1-013/-014):** the linked mood-page line still counts agitation as a mixed feature. In `sp-interview.html`, "mixed features" also appears in checklist labels and a tag, and "mixed states" appears in `criticalMiss.missed`.
- **qb_cog_014 (Q2-003):** tier-2 option C ("effectiveness does not depend on removing the antipsychotic") needs its own edit.
- **`catatonia.md`:** the pearl "hold them until catatonia is excluded" needs the M05-007 fix.
- **`t_sexual.md` (M04-017/-018):** the same over-broad "reporting duty" appears in the can't-miss paragraph and the "What the student does" list.
- **`cotw_20260727_oud_ms3.md` (M11-001):** the same TL;DR text is the "Shelf-level takeaway" line.
- **`sp-interview.html` (M02-011):** if the CO-exposure hint lands, add a matching line to Ray's script, or the SP will be asked something it cannot answer.
- **Crisis blocks.** These pages do risk work with no block: MS3 MDD COTW (M11-008, persisting), resident FEP COTW (R02-006), OSCE page (M09-011). The resident MDD COTW (Q8, passive SI) likely has the same gap. Remember that opting a markdown page in removes its collapsible sections, so check `front-door.spec.js` pins.

## 7 · Rejected at verification (do not apply)

These three first-pass findings were overturned. They are recorded, as `rejected.json` is, because applying them would introduce errors.

| ID | Page | Claim | Why rejected |
|---|---|---|---|
| R01-003 | `systems_medlegal.md` | "Most" suicides were rated low-risk should read "about half". | NCISH (UK national inquiry) data show 76–89% were judged low or no immediate risk at last contact. The ~44% figure is Large 2016, which measures a different construct. The page is right. (R01-004 kept a Minor wording fix.) |
| R04-003 | `cotw_20260720_mdd_res.md` | Lithium is a poor fit for a weight-concerned patient. | The paper cited (Gomes-da-Costa 2021, PMID 34265322) found lithium weight gain not significant vs placebo. |
| R04-008 | `cotw_20260726_etohwd_res.md` | Missing ASAM nuance on the seizure line. | The line concerns this patient's documented prior seizure, and the next point already states the ASAM nuance. The finding also misread the patient's age. |

## 8 · Applying the fixes inside this repo's governance

- **Attestation will drift, correctly.** Nearly every page touched here carries a `reviewed` row. Any authored-content edit changes its `contentHash`, and the page will render as pending until re-attested through the **faculty console**. That is the designed behaviour; don't touch `reviewed.json` from a content PR.
  - Attested question-bank items (`qb_eth_002`, `qb_eth_003`, `qb_mood_015`, `qb_sud_014`, `qb_anx_003`, …) must go `attested → draft` first. Gate B forbids editing an attested item in place.
  - `sp-interview.html` (M02-*) is attested; its row moves to pending.
- **Every corrected claim about a paper needs its span.** New or changed paper claims need an `evidence_annotations.json` `sourceSpan` in the same change: the Studdert 2020, PRELAPSE, Katz 2022, Larochelle 2018 and Alon 2024 additions, and the corrections to Hatcher, Uphoff, Stanley, Miklowitz, Bensken, Chawla and Cuijpers. Read the results section, not the abstract conclusion.
- **E1-001 is a registry change.** `sall-2019` (VA/DoD 2019 synopsis) is superseded. Swap it for the 2024 CPG synopsis (Brenner et al., *Ann Intern Med* 2025;178:416–425, PMID 39903866), then recheck every page that cites it.
- **Suggested work packages**, sized to the repo's per-WP PR convention:
  1. Safety-first queue (§3).
  2. Audio decks (AQ1–AQ4, plus §6 siblings).
  3. Jurisdiction footnotes (pattern B).
  4. Buprenorphine sentence (C).
  5. DSM-5-TR criteria strings (D).
  6. Suicide-inquiry alignment (F).
  7. Citation/span repairs (H).
  8. Minor terminology sweep.

## 9 · Limitations and confidence

- **224 findings are first-pass judgment only.** These are Moderate/Minor findings under citation, wording, terminology and cultural lenses. Their precision is probably lower: verification rejected 3 of 137 and modified 58 of the checked set, mostly to tighten a correction.
- **Some verdicts rest on recall.** Eight rest on guidance that could not be opened (paywall or CAPTCHA) and are marked `confidence: medium`. These include the Maudsley clozapine–smoking reduction, the AASLD disulfiram-in-cirrhosis wording, the Boyer & Shannon full text, and some CIWA reassessment intervals, which vary by protocol.
- **Tools were judged from recovered string literals**, not from running them. Tools that load their questions from JSON (the question bank, Daily Review, Shelf Mode) were covered through appendices A1 and A3.
- **Not reviewed:** A5 coverage matrices and the navigation map, which are non-clinical generated artefacts. Uncommitted work on the local checkout (branch `codex/on-the-go-learning-design`) was also excluded.
- **Not verified here:** ICD-10-CM codes. The FY2027 code set takes effect **2026-10-01**, one week from now, so run `bin/check_icd_codes.py` before then.

## 10 · Coverage: every surface reviewed

Rows with 0 findings were read in full and found sound. Silence is the signal.

| Chunk | Surface | Findings | Maj / Mod / Min |
|---|---|---|---|
| M01 | `welcome.md` | 0 | — |
| M01 | `orientation.md` | 4 | 0 / 2 / 2 |
| M01 | `core_readings.md` | 0 | — |
| M01 | `orientation-video.html` | 0 | — |
| M01 | `week1.md` | 3 | 0 / 3 / 0 |
| M01 | `week2.md` | 2 | 0 / 2 / 0 |
| M01 | `week3.md` | 0 | — |
| M01 | `week4.md` | 0 | — |
| M01 | `week5.md` | 0 | — |
| M01 | `week6.md` | 0 | — |
| M01 | `pg_interview.md` | 0 | — |
| M01 | `mse.html` | 1 | 0 / 1 / 0 |
| M01 | `interview-circle.html` | 0 | — |
| M02 | `sp-interview.html` | 13 | 0 / 12 / 1 |
| M03 | `screeners.html` | 0 | — |
| M03 | `ddx.md` | 3 | 0 / 2 / 1 |
| M03 | `diagnostic-reasoning.html` | 0 | — |
| M03 | `pg_formulation.md` | 0 | — |
| M03 | `case_formulation.md` | 0 | — |
| M03 | `medical_workup.md` | 1 | 0 / 1 / 0 |
| M03 | `t_mood.md` | 2 | 0 / 1 / 1 |
| M03 | `t_psychosis.md` | 1 | 0 / 0 / 1 |
| M03 | `t_anxiety.md` | 2 | 0 / 2 / 0 |
| M03 | `t_personality.md` | 3 | 0 / 2 / 1 |
| M03 | `t_sud.md` | 2 | 0 / 0 / 2 |
| M04 | `t_geri.md` | 1 | 0 / 1 / 0 |
| M04 | `t_perinatal.md` | 2 | 0 / 2 / 0 |
| M04 | `t_neurodev.md` | 3 | 0 / 0 / 3 |
| M04 | `t_eating.md` | 4 | 0 / 3 / 1 |
| M04 | `t_neurocog.md` | 3 | 0 / 0 / 3 |
| M04 | `t_somatic.md` | 2 | 0 / 0 / 2 |
| M04 | `t_sleep.md` | 1 | 0 / 1 / 0 |
| M04 | `t_dissociative.md` | 0 | — |
| M04 | `t_sexual.md` | 2 | 0 / 2 / 0 |
| M04 | `t_impulse.md` | 1 | 0 / 0 / 1 |
| M04 | `t_adjustment.md` | 2 | 0 / 0 / 2 |
| M05 | `cultural_psychiatry.md` | 3 | 0 / 1 / 2 |
| M05 | `pg_suicide.md` | 0 | — |
| M05 | `suicide.md` | 0 | — |
| M05 | `cssrs.html` | 0 | — |
| M05 | `violence.md` | 1 | 0 / 1 / 0 |
| M05 | `violence.html` | 0 | — |
| M05 | `agitation.md` | 1 | 0 / 1 / 0 |
| M05 | `catatonia.md` | 2 | 0 / 2 / 0 |
| M05 | `bfcrs.html` | 0 | — |
| M05 | `toxidromes.md` | 4 | 0 / 4 / 0 |
| M05 | `delirium.md` | 0 | — |
| M05 | `withdrawal.html` | 1 | 0 / 1 / 0 |
| M05 | `capacity.html` | 1 | 0 / 0 / 1 |
| M05 | `exp_consult.md` | 1 | 0 / 1 / 0 |
| M06 | `ethics_legal.md` | 4 | 0 / 3 / 1 |
| M06 | `psychopharm_primer.md` | 3 | 0 / 0 / 3 |
| M06 | `med_monitoring.md` | 3 | 0 / 3 / 0 |
| M06 | `protocol_library.md` | 1 | 0 / 0 / 1 |
| M06 | `ect_neuromodulation.md` | 5 | 0 / 2 / 3 |
| M06 | `exp_tx.md` | 0 | — |
| M06 | `decision-aids.html` | 1 | 0 / 1 / 0 |
| M06 | `interaction-cards.html` | 1 | 0 / 1 / 0 |
| M06 | `nutrition_metabolic.md` | 0 | — |
| M06 | `omm_resources.md` | 0 | — |
| M06 | `communication-practice.html` | 0 | — |
| M06 | `psychotherapy.md` | 1 | 0 / 0 / 1 |
| M06 | `motivational_interviewing.md` | 0 | — |
| M07 | `brief_psychotherapy.md` | 4 | 0 / 3 / 1 |
| M07 | `therapy_on_the_unit.md` | 4 | 0 / 3 / 1 |
| M07 | `reflection.html` | 0 | — |
| M07 | `family-systems.html` | 0 | — |
| M07 | `collateral_workflow.md` | 1 | 0 / 0 / 1 |
| M07 | `exp_family.md` | 2 | 0 / 0 / 2 |
| M07 | `family_playbook.md` | 3 | 0 / 1 / 2 |
| M07 | `family_modalities.md` | 2 | 0 / 1 / 1 |
| M08 | `doc_oral.md` | 1 | 0 / 0 / 1 |
| M08 | `oral.html` | 0 | — |
| M08 | `rounds_questions.md` | 24 | 1 / 9 / 14 |
| M09 | `question-bank-practice.html` | 0 | — |
| M09 | `one-patient-six-weeks.html` | 0 | — |
| M09 | `review.html` | 0 | — |
| M09 | `shelf-mode.html` | 0 | — |
| M09 | `shelf.md` | 2 | 0 / 1 / 1 |
| M09 | `rapid_review.md` | 7 | 1 / 5 / 1 |
| M09 | `osce.md` | 2 | 0 / 0 / 2 |
| M10 | `cases.md` | 1 | 0 / 1 / 0 |
| M10 | `landmark_trials.md` | 0 | — |
| M10 | `anki.md` | 0 | — |
| M10 | `cotw_index.md` | 0 | — |
| M10 | `cotw_20260914_ssnms_ms3.md` | 4 | 0 / 2 / 2 |
| M10 | `cotw_20260907_fep_ms3.md` | 1 | 0 / 1 / 0 |
| M10 | `cotw_20260831_catatonia_ms3.md` | 2 | 0 / 0 / 2 |
| M10 | `cotw_20260827_bpd_ms3.md` | 0 | — |
| M10 | `cotw_20260810_panic_ms3.md` | 0 | — |
| M11 | `cotw_20260803_lithium_ms3.md` | 0 | — |
| M11 | `cotw_20260727_oud_ms3.md` | 1 | 1 / 0 / 0 |
| M11 | `cotw_20260726_etohwd_ms3.md` | 1 | 1 / 0 / 0 |
| M11 | `cotw_20260723_suiciderisk_ms3.md` | 0 | — |
| M11 | `cotw_20260720_mdd_ms3.md` | 6 | 0 / 3 / 3 |
| M12 | `cotw_20260720_bipolar_ms3.md` | 1 | 0 / 0 / 1 |
| M12 | `cotw_20260713_agitation_ms3.md` | 2 | 0 / 0 / 2 |
| M12 | `cotw_20260709_ssnms_ms3.md` | 1 | 0 / 0 / 1 |
| M12 | `reading_map.md` | 0 | — |
| M12 | `evidence_inpatient.md` | 9 | 0 / 3 / 6 |
| M13 | `therapy_reading_room.md` | 1 | 0 / 1 / 0 |
| M13 | `book_library.md` | 4 | 0 / 2 / 2 |
| M13 | `podcast_library.md` | 0 | — |
| M13 | `feedback.html` | 0 | — |
| M13 | `rotation-curator.html` | 1 | 0 / 1 / 0 |
| RD | `welcome.md` | 1 | 0 / 1 / 0 |
| RD | `t_eating.md` | 0 | — |
| RD | `agitation.md` | 0 | — |
| RD | `capacity.html` | 0 | — |
| RD | `nutrition_metabolic.md` | 0 | — |
| RD | `brief_psychotherapy.md` | 0 | — |
| RD | `collateral_workflow.md` | 0 | — |
| RD | `exp_family.md` | 0 | — |
| RD | `family_playbook.md` | 0 | — |
| RD | `oral.html` | 0 | — |
| RD | `rounds_questions.md` | 0 | — |
| RD | `question-bank-practice.html` | 0 | — |
| RD | `shelf-mode.html` | 0 | — |
| RD | `landmark_trials.md` | 0 | — |
| RD | `cotw_index.md` | 1 | 0 / 0 / 1 |
| RD | `therapy_reading_room.md` | 0 | — |
| RD | `book_library.md` | 0 | — |
| RD | `podcast_library.md` | 0 | — |
| RD | `orientation.md` | 0 | — |
| RD | `week6.md` | 0 | — |
| RD | `cultural_psychiatry.md` | 0 | — |
| RD | `ethics_legal.md` | 0 | — |
| RD | `exp_tx.md` | 0 | — |
| RD | `ect_neuromodulation.md` | 0 | — |
| RD | `omm_resources.md` | 0 | — |
| RD | `t_neurocog.md` | 0 | — |
| RD | `t_somatic.md` | 0 | — |
| RD | `t_sleep.md` | 0 | — |
| RD | `t_dissociative.md` | 0 | — |
| RD | `t_sexual.md` | 0 | — |
| RD | `t_impulse.md` | 0 | — |
| RD | `t_adjustment.md` | 0 | — |
| RD | `reading_map.md` | 0 | — |
| RD | `shelf.md` | 0 | — |
| RD | `osce.md` | 0 | — |
| RD | `cases.md` | 0 | — |
| RD | `feedback.html` | 0 | — |
| RD | `rotation-curator.html` | 0 | — |
| R01 | `rotation.md` | 0 | — |
| R01 | `supervision_teaching.md` | 0 | — |
| R01 | `rp-agitation.html` | 4 | 0 / 2 / 2 |
| R01 | `cl_reference.md` | 3 | 2 / 1 / 0 |
| R01 | `systems_medlegal.md` | 1 | 0 / 0 / 1 |
| R01 | `adv_psychopharm.md` | 3 | 0 / 2 / 1 |
| R01 | `rp-brief-psych.html` | 3 | 0 / 2 / 1 |
| R02 | `rp-post-event-huddle.html` | 0 | — |
| R02 | `rp-canon-quiz.html` | 0 | — |
| R02 | `cotw_20260914_ssnms_res.md` | 5 | 0 / 4 / 1 |
| R02 | `cotw_20260907_fep_res.md` | 2 | 0 / 0 / 2 |
| R02 | `cotw_20260831_catatonia_res.md` | 2 | 0 / 0 / 2 |
| R02 | `cotw_20260827_bpd_res.md` | 2 | 0 / 0 / 2 |
| R03 | `cotw_20260810_panic_res.md` | 2 | 0 / 2 / 0 |
| R03 | `cotw_20260803_lithium_res.md` | 1 | 0 / 0 / 1 |
| R03 | `cotw_20260727_oud_res.md` | 2 | 0 / 2 / 0 |
| R04 | `cotw_20260726_etohwd_res.md` | 1 | 0 / 0 / 1 |
| R04 | `cotw_20260723_suiciderisk_res.md` | 2 | 0 / 1 / 1 |
| R04 | `cotw_20260720_mdd_res.md` | 1 | 0 / 1 / 0 |
| R04 | `cotw_20260720_bipolar_res.md` | 2 | 0 / 1 / 1 |
| R04 | `cotw_20260713_agitation_res.md` | 1 | 0 / 0 / 1 |
| R05 | `cotw_20260709_ssnms_res.md` | 0 | — |
| R05 | `canon_200.md` | 11 | 0 / 3 / 8 |
| Q1 | `Appendix A1 (4 sections)` | 19 | 0 / 15 / 4 |
| Q2 | `Appendix A1 (4 sections)` | 17 | 0 / 8 / 9 |
| Q3 | `Appendix A1 (3 sections)` | 16 | 0 / 6 / 10 |
| Q4 | `Appendix A1 (1 sections)` | 8 | 2 / 4 / 2 |
| C1 | `Appendix A2 (1 sections)` | 9 | 0 / 5 / 4 |
| AQ1 | `Appendix A3 (20 sections)` | 13 | 0 / 8 / 5 |
| AQ2 | `Appendix A3 (22 sections)` | 9 | 1 / 5 / 3 |
| AQ3 | `Appendix A3 (18 sections)` | 23 | 8 / 11 / 4 |
| AQ4 | `Appendix A3 (19 sections)` | 5 | 0 / 4 / 1 |
| E1 | `Appendix A4 (1 sections)` | 11 | 0 / 4 / 7 |

*Chunk key: M = MS3 site (shared with residents unless in RD) · RD = resident-specific hunks of 38 shared pages · R = resident-only · Q = question bank · C1 = case simulations · AQ = audio-companion decks · E1 = evidence appendix.*

---

**Companion files:** `FINDINGS_BY_PAGE.md` (every finding with all four required elements) · `findings.json` (machine-applicable; `quote` → `correction`) · `findings_tracker.csv` (triage sheet) · `rejected_at_verification.json`.
