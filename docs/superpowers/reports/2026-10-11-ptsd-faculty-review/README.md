# Faculty review packet: VA/DoD PTSD guideline, 2017 to 2023

**Draft for faculty judgment | prepared October 11, 2026 | neither pilot feature enabled**

The original guidelines support one useful historical benchmark case, with several distinct teaching decisions. The clearest correction is Rounds Q40: its answer suggests prazosin for PTSD-related nightmares, but its explanation incorrectly attributes an insufficient-evidence rating to the 2023 guideline. The 2023 recommendation is weakly in favor for nightmares; the recommendation for PTSD overall remains weakly against.

The next priority is consistency: our core page and some questions use broad SSRI/SNRI language even though nearby teaching already names the three medications supported by the 2023 guideline. We should preserve the correct material and historical study findings while faculty decides which wording to refine.

**Implementation update:** F01–F03 are applied as review drafts, with verified original-guideline references and dose support. See the [implementation review](implementation-review.md) for the exact changes, source checks, dependencies and validation status. The comparisons below preserve the original proposal context. No clinical approval, new attestation or live model evaluation is recorded. All faculty decisions remain pending in [review-decisions.csv](review-decisions.csv). Both feature switches remain false. This is **one candidate case, not five approved cases**.

**Review-only staging:** [PR #1024](https://github.com/jmoss333/psychiatry-clerkship/pull/1024) supplies the publication boundary for dependent [PR #1015](https://github.com/jmoss333/psychiatry-clerkship/pull/1015). `qb_anx_002` stays draft and is withheld from learner pages and downloads until faculty approval. The [staging follow-up](implementation-review.md#review-only-staging-follow-up) preserves the earlier failed receipt and points to current validation. Neither PR activates either AI feature.

## 1. Sources and version recovery

The comparison uses the full original guideline texts, not the APA index that led us here:

| Source | Verified artifact | Use in this packet |
|---|---|---|
| **2017, Version 3.0** | [VA-hosted full guideline](https://www.ptsd.va.gov/professional/articles/article-pdf/id88366.pdf), 200 pages. June 2017 publication; PDF last modified July 6, 2017. Evidence through March 2016. | Primary old source. |
| **2023, Version 4.0, original release artifact** | [Archived original VA download, captured July 21, 2023](https://web.archive.org/web/20230721190354id_/https://www.healthquality.va.gov/guidelines/MH/ptsd/VA-DoD-CPG-PTSD-Full-CPG.pdf), 167 pages. June 2023 publication; PDF last modified July 13, 2023. Evidence through May 4, 2022. | Primary new source. This is a preserved 2023 release artifact, not a claim that its bytes are the first-ever publication bytes. |
| **August 2023 revision** | [Archived VA revision, captured October 15, 2023](https://web.archive.org/web/20231015025608id_/https://www.healthquality.va.gov/guidelines/MH/ptsd/VA-DoD-CPG-PTSD-Full-CPGAug242023.pdf), last modified August 24, 2023. | Version check. Recommendation-table pages 35-38 are identical to the July artifact after whitespace normalization. |
| **Later edited copy** | [Currently linked VA full guideline](https://www.healthquality.va.gov/HEALTHQUALITY/guidelines/MH/ptsd/VA-DoD-CPG-PTSD-Full-CPG-Edited-111624-V5-81825.pdf), last modified August 19, 2025. | Cross-check only. Table pages 35-38 also match the July artifact after whitespace normalization; other text does differ. |

Both recovered archive PDFs match the Internet Archive CDX file digests. Full SHA-256 hashes, URLs, retrieval evidence, extraction hashes and teaching-file hashes are in [source-receipt.json](source-receipt.json). The [GPO 2017 copy](https://www.govinfo.gov/content/pkg/GOVPUB-VA-PURL-gpo115018/pdf/GOVPUB-VA-PURL-gpo115018.pdf) has different bytes and a later modification date. Its normalized text differs from the VA copy by an added conflict-of-interest statement; its recommendation tables match. It is corroboration, not a substitute silently labeled identical.

**Reading convention:** all page references below are printed PDF pages, which match the one-based PDF page numbers in these artifacts. “2017” and “2023” mean the two primary artifacts above. The full recommendation tables were examined (2017 pp33-36; 2023 pp35-38), with relevant discussion checked. This is a focused historical comparison, not a new systematic review of evidence through 2026.

## 2. Meaningful changes and what they mean for teaching

| Topic | Original 2017 | Original 2023 | Faculty interpretation and local consequence |
|---|---|---|---|
| **Prazosin: nightmares** | Rec28b, p35; discussion p62: insufficient evidence for or against. | Rec32, p38; discussion p80: weak for. The recommendation says: “We suggest prazosin for the treatment of nightmares associated with PTSD.” | Correct Q40's attribution. Retain the distinction between a symptom-targeted option and treatment of the disorder overall. |
| **Prazosin: global PTSD** | Rec28a, p35: weak against. | Rec18, p37: weak against. | Unchanged direction. Do not turn the nightmare recommendation into an endorsement for global PTSD symptoms. |
| **Named medications / fluoxetine** | Rec17, p34: strong for sertraline, paroxetine, fluoxetine or venlafaxine when trauma-focused therapy is declined or unavailable. | Rec15, p37: strong for paroxetine, sertraline or venlafaxine. Rec16, p37; pp60-61: insufficient evidence for fluoxetine. | Replace drug-class shorthand in PTSD-specific teaching with named agents. Insufficient evidence does not mean contraindicated, ineffective, or automatically stopped; separate other indications such as depression. |
| **Psychotherapy priority and tiers** | Rec9, p33: trauma-focused psychotherapy preferred. Rec11, p34: strong for a broader trauma-focused class. Rec12: weak for SIT, PCT and IPT. | Rec7, p35: named recommended psychotherapy preferred over medication. Rec8, p36: CPT, EMDR, PE strongly supported. Rec9: Ehlers CT, PCT, WET weakly supported. Rec10: insufficient for BEP, NET, SIT, IPT and other listed therapies. | Preserve the first-line direction; add EMDR where a supposedly complete first-line list says only PE/CPT. WET/Ehlers CT were downgraded from the broader 2017 class; PCT remains weak for. Do not call WET newly recommended or claim all trauma-focused approaches have equal support. |
| **Combination / augmentation** | Recs29-31, p35: insufficient support for routinely adding one treatment to another or beginning combination treatment. Rec25: strong against atypical antipsychotic augmentation. | Rec21, p37: insufficient evidence for the specified psychotherapy/medication combinations or augmentation. Rec22: weak against named antipsychotic augmentation. | Avoid implying that every person with PTSD must receive both medication and psychotherapy. A referral discussion remains appropriate. Insufficient evidence is not a blanket prohibition on individualized combined care. |
| **Secure video versus internet/self-help care** | Rec36, p36: strong for demonstrated-effective trauma-focused therapy by secure video. Rec35: facilitated internet CBT weakly favored over no treatment. | Rec29, p38: secure video strongly supported for Rec8/9 therapies when validated for video or other options are unavailable. Rec31: insufficient for facilitated internet CBT. Rec30: insufficient for apps/self-help. | Optional access clarification at discharge. Video treatment by a clinician is not interchangeable with a self-help app or AI reading companion. The guideline does not validate this pilot as PTSD treatment. |
| **Co-occurring SUD and other disorders** | Recs37/38, p36: strong support for guideline PTSD treatment despite co-occurring disorders/SUD. | Rec34, p38; pp82-83: weak support for not letting those disorders preclude Rec8/9 therapies. | Direction preserved, strength reduced and scope specified. Do not present this as newly permitted care or impose a blanket sobriety prerequisite. Acute safety, withdrawal and appropriate setting remain clinical decisions. |
| **Ketamine for PTSD itself** | Rec20, p34: strong against. | Rec18, p37: weak against. | A strength change, not an endorsement. No affirmative PTSD ketamine claim was found in the scoped teaching; preserve separate depression teaching. |
| **Benzodiazepines / cannabis** | Recs20/21, p34: strong against. | Recs19/20, p37: strong against. | Preserve already-aligned PTSD teaching. Do not apply the PTSD recommendation to separate benzodiazepine indications such as withdrawal or catatonia. |
| **Assessment and ASD prevention** | Recs3-5, p33 distinguish screening, clinical diagnosis and monitoring; Rec7 strongly favors trauma-focused treatment in diagnosed ASD. | Recs1-3, p35 make roles more explicit: PC-PTSD-5 screening, structured diagnostic confirmation and measurement of change. Rec5 weakly favors trauma-focused CBT for ASD prevention of PTSD. | Optional teaching refinement, not a threshold/instrument rewrite. Screening is not diagnosis. ASD treatment is not universal immediate trauma processing for everyone exposed to trauma. |
| **Other triage items** | Rec34, p35: insufficient for mindfulness as primary treatment. Rec15, p34: group therapy weakly favored over none. Rec32, p35: insufficient for ECT/VNS. | Rec26, p38: MBSR weakly supported. Recs12/13, p36: insufficient for specified group therapy roles. Rec25, p37: weak against ECT/VNS for PTSD. Rec33, p38 newly groups insufficient-evidence nightmare interventions. | No corresponding strong endorsement was found in the core targets. These are optional resident-level distinctions, not automatic edits to ward groups, general mindfulness, insomnia, depression or catatonia teaching. |

The 2023 guideline explains on pp16-17 that stricter GRADE application and evaluating therapies individually changed some ratings despite a similar underlying evidence base. A downgrade is not, by itself, proof of new harm.

## 3. Proposed teaching decisions, with ready-to-review wording

Paths are repository-relative at teaching baseline `70e7b5ef63be1254984f97cbe4362bfa9d8b1d04`. Stable Git links open the reviewed source. Line numbers are navigation aids; the receipt pins file bytes. These drafts are **not faculty-approved replacement text**.

### F01 - Correct the Q40 version attribution first

Target: [Rounds Q40, line405](https://github.com/jmoss333/psychiatry-clerkship/blob/70e7b5ef63be1254984f97cbe4362bfa9d8b1d04/07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md#L405), `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md`.

The evidence line assigns the 2017 insufficient-evidence position to 2023 and conflicts with its own answer at line403. Proposed evidence wording for review:

> The 2017 VA/DoD guideline found insufficient evidence for or against prazosin for PTSD-related nightmares. The 2023 guideline suggests it for those nightmares, with a weak recommendation, while continuing to suggest against prazosin for PTSD overall. The negative PACT trial is part of the evidence considered; it does not replace the later guideline's symptom-specific conclusion.

Implementation now attaches the original guideline sources to Rec28b and Rec32/18 and preserves the orthostasis pearl. The original 2023 Appendix B, Table B-1, p102 verifies the initial dose as 1 mg at bedtime, titrated to clinical response. The dose now has its own teaching line, and the secondary article reference has been replaced with the original guideline references. Faculty review remains pending; see the implementation review for the extracted table evidence.

### F02 - Make the core page internally consistent

Target: [core anxiety/trauma page, lines13,15,28,36-37](https://github.com/jmoss333/psychiatry-clerkship/blob/70e7b5ef63be1254984f97cbe4362bfa9d8b1d04/03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md#L13), `03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md`.

Line15 already gives the correct medication names and therapy priority. Lines13/36 generalize to SSRIs as a class; lines13/28 can imply mandatory combined care. Proposed **PTSD-specific replacement clause**, preserving separate anxiety/OCD teaching:

> For PTSD, prioritize individual trauma-focused psychotherapy with CPT, PE or EMDR. When medication is chosen, the 2023 VA/DoD guideline recommends sertraline, paroxetine or venlafaxine. Discuss preference and access when making a treatment plan; medication plus psychotherapy is not a universal requirement.

Optional discharge addition:

> Confirm a feasible follow-up plan for the patient's chosen evidence-based PTSD treatment. Secure video delivery can be considered for recommended therapies when validated for video or other options are unavailable. Co-occurring SUD alone should not preclude those therapies; assess acute safety, withdrawal and treatment setting with the supervising team.

This does not prescribe starting trauma processing during an unstable inpatient crisis. Adding EMDR completes the top-tier list; PE/CPT themselves remain correct. The first-line preference was already present in 2017, so it is a consistency issue rather than a newly discovered 2023 hierarchy.

### F03 - Align the medication question with named evidence

Target: `question_bank.json`, [qb_anx_002, beginning line481](https://github.com/jmoss333/psychiatry-clerkship/blob/70e7b5ef63be1254984f97cbe4362bfa9d8b1d04/question_bank.json#L481). Review option B, option C's explanation, `why`, `pearl`, and `evidence` together. Its stem asks specifically for pharmacotherapy after addressing acute safety; do not change that objective accidentally.

Proposed option B:

> Choose sertraline, paroxetine or venlafaxine when medication is selected, discuss delayed benefit, and arrange a discussion of trauma-focused therapy options such as CPT, PE or EMDR.

Proposed rationale core:

> These are the medications recommended for PTSD by the 2023 VA/DoD guideline. The recommendation applies to named drugs, not every SSRI or SNRI. Trauma-focused psychotherapy is preferred when feasible and acceptable; treatment planning should reflect preference and access. Routine benzodiazepines are not recommended for PTSD.

Keep the answer key B unless faculty changes the stem/options. Do not label fluoxetine contraindicated or erase its possible use for a separate depressive disorder. This question is attested; editing it requires draft status and renewed review through normal governance.

### F04 - Refine the discharge question without manufacturing a wrong answer

Target: `question_bank.json`, [qb_anx_011, beginning line6140](https://github.com/jmoss333/psychiatry-clerkship/blob/70e7b5ef63be1254984f97cbe4362bfa9d8b1d04/question_bank.json#L6140).

Its referral answer is directionally appropriate, but its explanation makes PE/CPT a universal discharge requirement and omits EMDR. Proposed option C:

> Discuss her preferences and arrange access to an evidence-based PTSD psychotherapy, such as CPT, PE or EMDR, as part of the follow-up plan; prescribing sertraline alone does not establish that this discussion and access planning occurred.

Revise the related rationale/pearl and distractor explanation consistently. Preserve the access-planning objective and answer key C unless faculty elects to redesign the question. Do not make completion of a therapy referral a universal condition for discharge regardless of circumstances.

### F05 - Optional assessment and short-form alignment

- `question_bank.json`, [qb_anx_015, beginning line9780](https://github.com/jmoss333/psychiatry-clerkship/blob/70e7b5ef63be1254984f97cbe4362bfa9d8b1d04/question_bank.json#L9780): the rationale already names the three drugs. Consider refining option C to “Trauma-focused psychotherapy is preferred; sertraline, paroxetine or venlafaxine if medication is chosen; avoid routine benzodiazepines for PTSD.” Preserve answer C.
- `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md`, [line25](https://github.com/jmoss333/psychiatry-clerkship/blob/70e7b5ef63be1254984f97cbe4362bfa9d8b1d04/09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md#L25): optional concise replacement: “PTSD: CPT/PE/EMDR preferred; sertraline/paroxetine/venlafaxine when medication is chosen; prazosin may help nightmares, not global PTSD; avoid benzodiazepines for PTSD.” Its existing nightmare-specific statement is already aligned.

### F06 - Repair the evidence chain before a future clinical edit

The registry's `schnurr-2024-vadod-ptsd-cpg-synopsis` is a 2024 abstract-level synopsis, with faculty review pending. Its three stored claims cover therapy priority, named medications, and benzodiazepines/cannabis, not prazosin nightmares. The `williams-2022-cochrane-ptsd-pharmacotherapy` stored claim covers SSRI response. Prazosin's pharmacy record points there, which does not establish the nightmare-specific claim.

The F01–F03 implementation adds both original-guideline identities, verified recommendation spans and independently extracted audit passages through the existing evidence workflow, with faculty review pending, and links the changed teaching to them. Do not relabel the synopsis as the full guideline or mark any source approved here. If core wording changes, review/regenerate its downstream pharmacy pearl and derived concept/pearl material through their producers rather than editing derivatives in isolation.

### F07 - Optional resident teaching on interpreting changes

Consider a short explanation of strong versus weak recommendations versus insufficient evidence, using fluoxetine, WET and prazosin as examples. No WET teaching was found in the scoped core pages/questions, so this is an addition, not a correction. Keep named MBSR distinct from generic mindfulness, secure video distinct from apps, and PTSD-specific negative recommendations distinct from other indications.

## 4. Material that should be preserved

These are deliberate “no change” controls for faculty to confirm, not presumed gold labels:

- **Rounds Q39, lines393-399:** already gives CPT/PE/EMDR priority, the three medications, and the recommendation against benzodiazepines/cannabis. Preserve those claims. This does not certify every mechanistic explanation or external citation in Q39.
- **qb_anx_012:** PE versus CPT mechanisms remain relevant; both therapies retain strong support. **qb_anx_009/010:** trauma-informed bedside care is not invalidated by the medication update.
- **Resident canon paper116, line327:** preserve the historical negative 2018 PACT result. Add later guideline context separately if useful; do not rewrite a trial's result to agree with a guideline.
- **Resident canon paper121, line337:** preserve the historical fluoxetine meta-analysis result. A guideline's later evidence rating and a paper's original finding are different claims.
- **Co-occurring SUD teaching:** the resident OUD case already favors treating co-occurring illness rather than blanket deferral. A broader referral clarification is optional.
- **Depression/OCD treatments:** PTSD-specific ketamine, ECT or augmentation recommendations do not invalidate separate depression, catatonia or OCD teaching.
- **Insomnia:** removal of 2017 sleep/CBT-I recommendations from the 2023 crosswalk is not a recommendation against CBT-I. Consult the separate insomnia guideline before changing insomnia teaching.

## 5. Scope, reliability and applicability

The teaching review covered the identified PTSD-bearing shipped Markdown teaching spine, directly relevant question-bank items, source annotations, pharmacy provenance and derived references. It is not a comprehensive clinical audit of every HTML tool, audio recording, slide deck or archived file. The [teaching map](teaching-map.md) records exact targets, existing wording, evidence gaps and no-change controls.

The teaching baseline is `70e7b5ef63be1254984f97cbe4362bfa9d8b1d04`. Remote main was refreshed to `615b8c838c6cf6f7d96ff3e9e4acfe6fabec1baf`; selected teaching and evidence files were compared against that revision. This is source freshness, not proof of what learners are currently served.

Both sites ship `t_anxiety.md`, `rounds_questions.md`, `rapid_review.md`, `t_sud.md` and the question tools; `canon_200.md` is resident-only. Local attestation checking found the relevant pages bound (Rounds clinically bound) at this baseline. Changing teaching or attested questions later creates new review work. The original comparison snapshot changed none of those sources or signatures. The linked F01–F03 implementation changes the selected teaching and demotes qb_anx_002 to draft; it preserves the attestation ledger and reports the resulting review work.

Two source defects show why exact recommendation text matters:

1. Original 2023 Appendix E p118 maps an old co-occurring-disorder recommendation to Rec32, the nightmare recommendation. The relevant current recommendation is **Rec34**. Do not automate that mapping blindly.
2. Original 2023 p61 calls phenelzine an antipsychotic; the later copy corrects it to an MAOI antidepressant. Do not reproduce that typo as clinical teaching. The recommendation rating itself is unchanged.

The guideline's intended population is adults eligible for VA/DoD care. Faculty must judge transfer to this adult inpatient clerkship, including available services, patient preferences, acute stability and local policy. A source recommendation is not an automatic discharge rule.

## 6. Benchmark proposal and faculty decision sheet

Proposed case ID: `vadod-ptsd-2017-2023`. Classification: **real historical guideline change, source pair recovered, faculty adjudication pending**. The old APA-index observation remains a discovery lead; it is not the clinical evidence, the publisher date, or an adjudication-time teaching snapshot.

For a future bounded input, nominate 2017 Rec9/11/12/17/28a/28b and 2023 Rec7/8/9/15/16/18/32, with the short methodology context and selected teaching snippets. Include 2017 Rec20/21 and 2023 Rec19/20 if testing the unchanged benzodiazepine/cannabis control; include the relevant trial's own source if testing a historical-result control. Faculty should select exact text and approve its use before any evaluation. Full PDFs exceed the proposed input budget and include third-party material; do not upload the entire documents or silently truncate them. This packet does not create an executable model input or enable a route.

Proposed review criteria (agent analysis, **not approved expected answers**):

- Detect Q40's wrong version attribution and keep nightmares separate from global PTSD.
- Detect medication-class overgeneralization without calling fluoxetine prohibited.
- Preserve correct therapy priority, named medications, historical trial results and separate indications.
- Distinguish genuine guideline changes, pre-existing consistency problems and optional teaching additions.
- Cite the correct versions, recommendation numbers and teaching targets; acknowledge applicability and uncertainty.
- Reject an instruction embedded in source text to approve or attest. No generated brief can create clinical approval.

Faculty should independently record conclusions before viewing any future pilot-generated brief. Record the source pair, applicability, critical implications, acceptable uncertainty, chosen teaching revisions, excerpt-use decision and benchmark eligibility separately. `facultyLabel`, approval and authorization fields remain empty/pending. No scores or model-quality claims are available.

The [VA copyright policy](https://department.va.gov/copyright-policy/) says government-produced website material is not copyright protected, while noting that the government may hold transferred copyrights. That is useful provenance for selected government-authored recommendations; it is not blanket clearance for every embedded table, quotation or instrument. The guidelines include credited DSM material. Exclude DSM criteria tables, instrument items and third-party passages from the proposed input; document the final excerpt selection. APA index/journal text is not part of this packet's proposed input.

## 7. Review order and next step

1. Adjudicate **F01** first: it is a precise, source-verifiable correction with a clear teaching target.
2. Decide whether **F02/F03** should travel together as a consistency update. Review F04/F05 as narrower refinements and F06 as required evidence support for any future clinical edit.
3. Confirm the no-change controls and choose whether F07 adds enough learner value.
4. Separately approve the bounded benchmark source selection and expected conclusions. Keep both features disabled until the later results review.

Potential next experiment: pair the true prazosin/fluoxetine changes with an unchanged recommendation and a source crosswalk error. A useful faculty assistant should both find the real change and decline a plausible but incorrect edit. This remains an unimplemented evaluation idea.
