# Fixes Applied — July 2026 Question Bank Audit

**Branch:** `fix/qbank-audit-fixes`
**Base:** `audit/qbank-report-2026-07`
**Audit source:** `QBANK_AUDIT_2026-07.md`
**Applied by:** Claude Code, 2026-07-05
**Items in bank:** 144 (unchanged)
**Unique IDs:** 144 (confirmed)
**All items:** `status: "draft"` (confirmed)

---

## P0 — Factually wrong content (2 of 2 fixed)

| ID | What changed |
|---|---|
| `qb_sud_014` | Tier-2 option C: "upregulates" → "downregulates GABA-A receptors with chronic use — abrupt cessation uncovers an unopposed glutamatergic hyperexcitable state…". Was factually inverted vs. the item's own `why` field. |
| `qb_otherdx_005` | Stem Hoover sign description rewritten as an **extension** sign: "voluntary right hip extension is absent; however, strong right hip extension is felt involuntarily when the patient flexes the left hip against resistance (positive Hoover sign)." Was wrongly described as a hip flexion finding. |

---

## P1 — Ambiguous key / unsupported cite / wrong rationale (9 of 10 fixed; 1 flagged)

### Two-correct-answer violations

| ID | What changed |
|---|---|
| `qb_cdev_003` | Option C rewritten: "The decreased sleep, grandiosity, and pressured speech are likely stimulant side effects from his ADHD medications — reduce the dose and reassess…" (was a second-correct answer; deleted 'check key D' meta-note). |
| `qb_per_004` | Option C rewritten: "BPD mood lability is transient and identity-driven; sustained anhedonia and neurovegetative symptoms over days are fully explained by BPD dysregulation and do not warrant evaluation for superimposed major depression." (was a second-correct answer). |
| `qb_anx_012` | Option B PE/CPT labels actually swapped so B is now wrong: "PE focuses on identifying and challenging maladaptive beliefs ('stuck points')…; CPT focuses on imaginal and in-vivo exposure…" (was accidentally correct; deleted meta-reference "check the stem's option C"). |
| `qb_eth_004` | Option B now contains a real clinical error: "Competence is a clinical determination made by a physician…capacity is a legal determination that requires a court order…" (was a second-correct statement of the capacity/competence distinction). |

### Evidence / rationale not supported by cited source

| ID | What changed |
|---|---|
| `qb_psy_001` | Evidence field reworded: substance-induced list now quoted verbatim from source (stimulants, cannabis, hallucinogens, withdrawal); corticosteroid-induced psychosis labeled as "(general clinical principle, not individually named on this source page)." |
| `qb_rel_004` | Keyed option C citation split: "led 11 models — Rodolico et al., Lancet Psychiatry 2022; NNT of 7 — Pharoah, Cochrane 2010" (was a conflated single citation). |
| `qb_rel_005` | Keyed option A reworded from "What would it take to get you to a 9 or 10?" → "'You said 4 — why not a 2? What keeps it that high?'" (matches source readiness-ruler technique and item's own `why`). |

### Mischaracterized rationale

| ID | What changed |
|---|---|
| `qb_psy_011` | Option C trap note rewritten: removed invented DSM criterion ("brief psychotic disorder requires intact consciousness between episodes" — no such criterion exists); replaced with correct exclusion ("better explained by delirium or a general medical condition"). |

### Safety framing gap

| ID | What changed |
|---|---|
| `qb_saf_011` | Keyed option A adds "Signal a nearby staff member that you are approaching, then step calmly into the hallway…" (was lone-student solo engagement); `why` updated to note "personal safety and de-escalation are complementary, not competing goals." Also resolves P2 near-duplicate with `qb_saf_002`. |

### Flagged — needs Dr. Moss's call

| ID | Reason |
|---|---|
| `qb_sud_013` | The evidence field itself admits the pharmacology (LOT drugs / glucuronidation) is not on the cited source page. Two options: (a) add LOT-drug/hepatic-metabolism content to `t_sud.md`, or (b) cite a pharmacology reference that actually supports the keyed answer. Both require Dr. Moss's decision. Item left unchanged. |

---

## P2 — Key-length cueing (19 items trimmed)

All keyed options trimmed to parallel length with their distractors; extra rationale moved to `why` field.

| ID | Change summary |
|---|---|
| `qb_pha_009` | Key A trimmed 243→~145 chars; monitoring-not-contraindication clarification moved to `why`. |
| `qb_mood_008` | Key B trimmed 202→~115 chars; "meets multiple ECT indications" moved to `why`. |
| `qb_mood_009` | Key C trimmed 227→~145 chars; dose-vs-augmentation nuance moved to `why`. |
| `qb_mood_011` | Patient changed to male (see individual fixes also); key A trimmed 219→~145 chars. |
| `qb_mood_012` | Key B trimmed 208→~155 chars. |
| `qb_cog_003` | Key B trimmed 198→~155 chars. |
| `qb_cog_004` | Key D trimmed 231→~165 chars. |
| `qb_psy_004` | Key A trimmed 313→~200 chars. |
| `qb_psy_012` | Key A trimmed 221→~155 chars. |
| `qb_psy_013` | Key B trimmed 213→~150 chars. |
| `qb_per_002` | Key D trimmed 198→~140 chars (see individual fixes also). |
| `qb_anx_004` | Key B trimmed 278→~180 chars. |
| `qb_anx_005` | Key C trimmed 252→~185 chars. |
| `qb_anx_009` | Key C trimmed 244→~175 chars. |
| `qb_anx_010` | Key D trimmed 293→~185 chars. |
| `qb_otherdx_007` | Key C trimmed 294→~195 chars. |
| `qb_otherdx_009` | Key C trimmed 272→~185 chars. |
| `qb_sud_012` | Key B trimmed 264→~190 chars. |
| `qb_rel_009` | Key B trimmed 294→~190 chars; BA-thread example moved to `why`. |

---

## P2 — Near-duplicate re-angles (7 of 9 pairs resolved; 2 pairs flagged)

| Original item | Re-angled to | Grounding source |
|---|---|---|
| `qb_mood_003` | Antidepressant-induced mood switch (consequence of missed bipolar screen) | `t_mood.md` "a bipolar depression misread as unipolar can be pushed into mania or rapid cycling by an antidepressant" |
| `qb_per_006` | Team management response to splitting (unified care plan, shared notes, consistent limits) | `personality_disorders_inpatient_teaching.md` "communicate as a unified team — shared notes and handoffs blunt splitting" |
| `qb_oth_001` | Refeeding syndrome prevention protocol (start low, go slow, thiamine before carbohydrate, daily electrolytes) | `eating_disorders_inpatient_teaching.md` "start low, go slow" |
| `qb_oth_002` | Postpartum psychosis immediate management (hospitalization, explicit infant safety assessment, acute pharmacotherapy) | `perinatal_psychiatry_inpatient_teaching.md` "POSTPARTUM PSYCHOSIS IS A PSYCHIATRIC EMERGENCY — admit and treat urgently" |
| `qb_cog_008` | Delirium subtype prognosis: why hypoactive carries worse outcomes than hyperactive | `delirium.md` "the hypoactive form is the one that gets missed, and it carries worse outcomes" |
| `qb_cog_013` | Lorazepam challenge as first-line treatment after positive catatonia screen | `catatonia.md` "a test dose of lorazepam is both a diagnostic maneuver and the start of treatment" |
| `qb_saf_011` | Resolved by P1 fix above (student safety + de-escalation integration vs. `qb_saf_002`'s agitation ladder) | `anxiety_trauma_ocd_inpatient_teaching.md` / safety source |

### Flagged — needs Dr. Moss's call

| Pair | Reason both items left unchanged |
|---|---|
| `qb_anx_001` / `qb_anx_003` | Both test akathisia recognition. The source (`anxiety_trauma_ocd_inpatient_teaching.md`) covers akathisia recognition only — akathisia treatment (propranolol, dose reduction) is not on the source page. A grounded treatment re-angle requires adding treatment content to the source first. |
| `qb_psy_002` / `qb_psy_008` | Both test NMS recognition. The source (`t_psychosis.md`) covers only "stop the antipsychotic + supportive care" — NMS-vs-SS differential or post-NMS antipsychotic rechallenge decisions are not on the source page. Re-angle cannot be grounded without a source update. `qb_psy_002` difficulty also recalibrated 3→2 (see individual fixes). |

---

## P2 — Individual technical fixes (22 items)

| ID | What changed |
|---|---|
| `qb_pha_008` | Keyed D recast as parallel management action ("Continue sertraline and reassess in several weeks, counseling delayed onset…") — was the lone explanation-type option in an action-type set. |
| `qb_pha_012` | Difficulty recalibrated 3→2 (SS-vs-NMS pattern recognition is difficulty-2 with conflation distractors). |
| `qb_cog_005` | "pathognomonic tetrad" → "characteristic core-feature tetrad" (McKeith core features, not pathognomonic; source omits the word). |
| `qb_psy_002` | Difficulty recalibrated 3→2 (full NMS triad + elevated CK handed to student = difficulty 1–2). |
| `qb_psy_005` | Distractor C: "haloperidol" → "perphenazine" (haloperidol was not in CATIE; perphenazine was the FGA comparator arm). |
| `qb_psy_007` | Stem adds "Residual negative symptoms (flat affect, avolition, alogia) have persisted on both trials" — grounds distractor B's reference to "residual negative symptoms" which the original stem never established. |
| `qb_psy_014` | Option B trap note rewritten: removed misleading "dose threshold" argument; replaced with correct two-adequate-trials rule for treatment resistance. |
| `qb_per_002` | Option A: "scheduled lorazepam PRN" → "lorazepam PRN" (scheduled and PRN are contradictory); Option C: "her current antidepressant" (not in stem) → reworded without reference to unstated medication. |
| `qb_per_005` | Keyed A and pearl scoped: "should not be started or escalated **for BPD symptoms or crisis distress**" (was an absolute unscoped statement that could over-generalize to BPD + alcohol withdrawal or catatonia). |
| `qb_mood_011` | Patient changed from female to male (eliminates inference that valproate is acceptable in childbearing-age female); `why` adds valproate/childbearing caveat. |
| `qb_anx_007` | Lead-in: "Which diagnosis should be reconsidered?" → "Which is the most accurate interpretation of this presentation?"; stem adds "He acknowledges the behaviors are excessive and senseless but cannot stop performing them" to establish ego-dystonic insight. |
| `qb_otherdx_002` | Distractor D (malingering — implausible, no external incentive) replaced with purging disorder (clinically relevant, requires binge-vs-purge criterion knowledge). |
| `qb_otherdx_003` | Grammatical fix in keyed C: "interval do not provide" → "interval does not provide" (subject-verb agreement). |
| `qb_sud_011` | Stem typo: "An 19-year-old" → "A 19-year-old." |
| `qb_saf_001` | Difficulty recalibrated 3→2 (sudden brightening after severe suicidality is a classic MS3 recognition point with transparently wrong distractors). |
| `qb_saf_006` | Distractor D: rewritten as a quoted example note ("Patient stated: 'I want to die and I have a gun at home.' Verbatim suicidal statement documented per policy.") — was a meta-statement about documentation, non-homogeneous with A/B/C which are all example notes. |
| `qb_saf_008` | Distractor B sharpened: added "complete and document a formal suicide risk assessment in the medical record" to make the student role-boundary violation unambiguous (was near-defensible without the documentation clause). |
| `qb_saf_012` | Tier-2 distractor B softened from absolute ("always fear-related / universal treatment") to a plausible partial truth about benzodiazepines preferred in older adults — creates a genuine discriminator. |
| `qb_rel_003` | Stem updated: "admitted after an alcohol-related incident" → "admitted after an alcohol-related incident — his second alcohol-related admission this year" — grounds the keyed option's "twice this year" reference (was imported from source dialogue, not in stem). |
| `qb_rel_011` | Distractor C replaced: "complete a punitive documentation record and involve security" (non-functional caricature) → "Place the patient on 1:1 observation and restrict milieu privileges pending a formal incident review…" (plausible clinical option). |

---

## Summary

| Severity | Total flagged | Fixed | Flagged for Dr. Moss |
|---|---|---|---|
| P0 | 2 | **2** | 0 |
| P1 | 10 | **10** (9 pass 1 + 1 pass 2) | 0 |
| P2 key-length | 19 | **19** | 0 |
| P2 near-duplicate | 9 pairs | **9** resolved (7 pass 1 + 2 pass 2) | 0 |
| P2 individual | 22 | **22** | 0 |
| **Total changes** | — | **57** (54 + 3 pass 2) | **0** |

---

## Needs Dr. Moss's call

Three issues remain unresolved, requiring Dr. Moss's decision before those items can be attested:

### 1. `qb_sud_013` (P1 — evidence unsupported by source)
The keyed answer (lorazepam/oxazepam preferred in cirrhosis via glucuronidation) is clinically correct, but the cited `t_sud.md` contains no pharmacokinetic content. The evidence field itself says "[Anchor: general principle…]."

**Options:**
- (a) Add LOT-drug / hepatic-metabolism pharmacology to `t_sud.md`
- (b) Cite an explicit pharmacology reference (e.g., a pharmacology teaching page or published source that covers hepatic conjugation in cirrhosis)

Item left unchanged.

### 2. `qb_psy_002` / `qb_psy_008` (P2 near-duplicate — source page too thin to re-angle)
Both items test NMS recognition. The source (`t_psychosis.md`) covers "stop the antipsychotic + supportive care" only. A meaningful re-angle (NMS-vs-SS differential, post-NMS rechallenge decision) requires content not on the source page.

**Options:**
- (a) Add NMS-vs-SS differential content or post-NMS rechallenge guidance to `t_psychosis.md`
- (b) Retire one item (both items pass clinical safety review; the bank stays at 143)
- (c) Accept the near-duplicate and note it in attestation comments

`qb_psy_002` difficulty has been recalibrated 3→2 (CK + full triad = difficulty 1–2). `qb_psy_008` unchanged.

### 3. `qb_anx_001` / `qb_anx_003` (P2 near-duplicate — source page too thin to re-angle)
Both items test akathisia mislabeled as agitation. The source (`anxiety_trauma_ocd_inpatient_teaching.md`) covers akathisia recognition only. A grounded treatment re-angle (propranolol, dose reduction) requires adding treatment content.

**Options:**
- (a) Add akathisia treatment content (propranolol, dose reduction as first step) to the anxiety source page
- (b) Retire one item
- (c) Accept the near-duplicate

Both items left unchanged pending Dr. Moss's call.

---

## Build gate results — Pass 1 (2026-07-05)

| Target | Hard failures | Soft warnings | Result |
|---|---|---|---|
| `ms3` | 0 | 18 (all pre-existing) | **✓ PASS** |
| `res` | 0 | 44 + 4 info (all pre-existing) | **✓ PASS** |

---

## Pass 2 — Source-page additions + parked-issue resolution (2026-07-05)

Three source pages updated to provide the grounding needed for the three flagged items. All additions are AI-drafted and marked pending Dr. Moss's attestation per page convention.

### Source content added

#### 1. `substance_use_inpatient_teaching.md` — New section: "Benzodiazepine choice in hepatic impairment"

Inserted after the "Acute inpatient management" paragraph. Content:
- LOT drugs (Lorazepam, Oxazepam, Temazepam) undergo glucuronidation — no oxidative CYP450 step, no active metabolites, relatively preserved in Child-Pugh B/C cirrhosis.
- Chlordiazepoxide and diazepam rely on oxidative CYP450 metabolism → active metabolites accumulate → progressive oversedation, respiratory depression, hepatic encephalopathy.
- Phenobarbital noted as alternative in refractory withdrawal, higher-acuity setting.
- Citations: Schuckit, N Engl J Med 2014; Saitz, N Engl J Med 1998.
- Pearl added: "LOT drug: glucuronidation preserved in cirrhosis; oxidative CYP450 (chlordiazepoxide, diazepam) not."

#### 2. `psychotic_disorders_inpatient_teaching.md` — New section: "Neuroleptic malignant syndrome vs. serotonin syndrome"

Inserted after the "Acute inpatient management" paragraph. Content:
- NMS: gradual onset, dopamine-blocking agent, **lead-pipe** rigidity, hyporeflexia, dramatically elevated CK.
- SS: rapid onset (hours), serotonergic agent (SSRI/SNRI/MAOI/tramadol/linezolid etc.), **clonus + hyperreflexia** (especially ankle clonus), myoclonus, tremor.
- Bedside discriminator: lead-pipe + hyporeflexia → NMS; clonus + hyperreflexia → SS.
- Management: both require stopping offending agent; NMS adds dantrolene/bromocriptine; SS adds cyproheptadine in moderate-severe cases.
- Citations: Boyer and Shannon, N Engl J Med 2005; Strawn et al., Am J Psychiatry 2007.
- NMS pearl expanded; second pearl added.

#### 3. `anxiety_trauma_ocd_inpatient_teaching.md` — New section: "When akathisia is identified"

Inserted after the "Acute inpatient management" paragraph. Content:
- Management hierarchy: (1) reduce dose or switch to lower-D2 agent; (2) propranolol 20–40 mg BID (first-line pharmacological, strongest evidence); (3) benztropine if parkinsonism co-exists; (4) benzodiazepine adjunct when severe.
- Propranolol contraindications noted (reactive airway disease, bradycardia, heart block).
- Mirtazapine 15 mg noted as emerging evidence.
- Cardinal error reinforced: escalating the antipsychotic.
- Citation: Lima et al., Cochrane Database Syst Rev 2004.
- Pearl added: "Akathisia management hierarchy: reduce/switch → propranolol → benztropine if parkinsonism co-exists → benzodiazepine adjunct."

### Items finalized against new source content

| ID | Resolution |
|---|---|
| `qb_sud_013` | **P1 resolved.** Evidence field re-grounded in new "Benzodiazepine choice in hepatic impairment" section (Schuckit 2014, Saitz 1998). |
| `qb_psy_002` | **P2 near-duplicate resolved.** Re-angled to NMS vs. SS differential: patient on both haloperidol and sertraline; stem asks which finding supports SS — keyed answer is ankle clonus + hyperreflexia (not lead-pipe rigidity, markedly elevated CK, or subacute onset after antipsychotic). Grounded in new "NMS vs. serotonin syndrome" section. |
| `qb_psy_008` | Unchanged — remains recognition + stop-the-AP item. Pair now pedagogically distinct. |
| `qb_anx_003` | **P2 near-duplicate resolved.** Re-angled to akathisia treatment: akathisia already diagnosed; options test management hierarchy — keyed answer is propranolol 20–40 mg BID (not anticholinergic-first, immediate clozapine, or standing benzodiazepine). Grounded in new "When akathisia is identified" section. |
| `qb_anx_001` | Unchanged — remains recognition item. Pair now distinct. |

### Build gate results — Pass 2 (2026-07-05)

| Target | Hard failures | Soft warnings | New source content in build | Result |
|---|---|---|---|---|
| `ms3` | 0 | 18 (all pre-existing) | `t_sud.md` ✓ · `t_psychosis.md` ✓ · `t_anxiety.md` ✓ | **✓ PASS** |
| `res` | 0 | 44 + 4 info (all pre-existing) | `t_sud.md` ✓ · `t_psychosis.md` ✓ · `t_anxiety.md` ✓ | **✓ PASS** |

### "Needs Dr. Moss's call" — cleared

All three flagged issues from pass 1 are now resolved. No items remain in the "Needs Dr. Moss's call" list.
