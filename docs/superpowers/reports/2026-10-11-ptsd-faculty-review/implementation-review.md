# F01–F03 implementation review

Prepared October 11, 2026. **Teaching drafts; faculty review pending. Both AI features remain disabled.**

**Current staging update:** this draft incorporates the review-only workflow in [PR #1024](https://github.com/jmoss333/psychiatry-clerkship/pull/1024). The pending medication question remains a draft and is excluded from learner publication. See the staging follow-up below and the exact-head validation in [PR #1015](https://github.com/jmoss333/psychiatry-clerkship/pull/1015).

**Historical record before staging:** the existing draft PR was #1015. The applied content was saved locally in commit `f956508b7818967d4d58a083f19919e2946032e1`, based on `15ec232b2b34d1245d32bfd62a11ae2ec685adc8`. At that point it had not been pushed, merged or deployed; the remote PR did not contain these corrections. The original comparison remains in README.md and source-receipt.json. This document describes the applied follow-up, not a faculty approval or benchmark label.

## What changed

- **F01:** corrected the 2017/2023 attribution, retained prazosin's nightmare-specific scope, preserved the orthostasis pearl, and separated the verified initial dose from the guideline rating. Replaced the secondary article citation with the original guidelines and exact locations.
- **F02:** aligned the core page, summary, exam anchor, discharge paragraph and pearls around CPT/PE/EMDR and the three named medications. Removed a universal combined-treatment implication. Separate anxiety/OCD, withdrawal and akathisia teaching remains. The optional secure-video and co-occurring-SUD expansion was not added.
- **F03:** retained the pharmacotherapy stem and correct answer B; updated option B, option C's explanation, rationale, pearl and evidence together. Returned the edited question from attested to draft. Other questions are unchanged.

## F01 — full revised Q40

**40. What medication is used for PTSD-related nightmares?**

- **Answer:** Prazosin (alpha-1 adrenergic antagonist) is suggested for trauma-related nightmares.

- **Evidence:** The 2017 VA/DoD guideline found insufficient evidence for or against prazosin for PTSD-related nightmares (Recommendation 28b). The 2023 guideline suggests prazosin for those nightmares, with a weak recommendation (Recommendation 32), while continuing to suggest against prazosin for PTSD overall (Recommendation 18). The negative PACT trial is part of the evidence considered; it does not replace the later guideline's symptom-specific conclusion.

- **Dose:** The 2023 guideline lists an initial dose of 1 mg at bedtime, titrated to clinical response (Appendix B, p. 102).

- **Key references:** VA/DoD PTSD guidelines: [2017, Version 3.0](https://www.ptsd.va.gov/professional/articles/article-pdf/id88366.pdf), Recommendation 28b (p. 35; recommendation text p. 62; discussion pp. 63–64); [2023, Version 4.0, original release](https://web.archive.org/web/20230721190354id_/https://www.healthquality.va.gov/guidelines/MH/ptsd/VA-DoD-CPG-PTSD-Full-CPG.pdf), Recommendations 18 and 32 (pp. 37–38; nightmare discussion pp. 80–81), Appendix B (p. 102). The [current VA-hosted edited copy](https://www.healthquality.va.gov/HEALTHQUALITY/guidelines/MH/ptsd/VA-DoD-CPG-PTSD-Full-CPG-Edited-111624-V5-81825.pdf) retains these recommendations and the initial-dose wording.

- **Pearl:** Monitor for orthostatic hypotension, especially with the first dose — advise patients to sit on the edge of the bed before standing at night.

## Source and dose verification

| Teaching point | Original source location | Check |
|---|---|---|
| 2017 nightmare uncertainty | Rec28b, table p35; recommendation text p62; discussion pp63–64 | Historical insufficient-evidence position |
| 2017 global PTSD | Rec28a, pp35/62 | Weak against; not a new 2023 reversal |
| 2023 nightmares | Rec32, p38; discussion pp80–81 | Weak for, including the negative PACT trial in the evidence considered |
| 2023 PTSD overall | Rec18, p37; discussion pp62–63 | Weak against; p63 specifies prazosin monotherapy and redirects nightmare treatment to Rec32 |
| Prazosin initiation | Appendix B, Table B-1, p102, **Initial Dose** column | “1 mg at bedtime; titrate to clinical response.” |
| Dose safety | p102 safety column and p80 discussion | First-dose syncope, additive hypotension, orthostasis and slow titration |
| Therapy and medication | Recs7–8, pp35–36; Rec15/19/21, p37 | Preferred individual trauma-focused therapy; named agents; against benzodiazepines; insufficient evidence for the specified combinations |

The starting-dose cell is distinct from the dose-range column. The dose remains a teaching statement from this guideline, not an individualized prescription or a new dosing protocol. The original July 2023 and saved August/later-edited copies have matching selected recommendation and dose text; this turn did not obtain fresh bytes of the current edited PDF. The live VA clinician guide corroborated the nightmare/global distinction.

Both original guideline records have facultyReviewStatus **pending**. Their blank DOI/PMID fields are intentional: they identify full guideline documents, not the journal synopsis. Two source annotations hold complete selected sentences; independently extracted broader passages support the span audit. [implementation-source-checks.json](implementation-source-checks.json) records PDF hashes, page conventions, exact spans, offsets and dose-table column identity. The original archived/source URLs are in the revised teaching and the registry.

## F02 — revised teaching passages

**In one line** — On the unit, anxiety, OCD, and PTSD are usually layered onto a primary admission diagnosis; your job is to separate the medical and substance mimics from the psychiatric disorder, choose among disorder-specific psychotherapy and medication options according to evidence, patient preference, and access, and resist the reflex to standing benzodiazepines.

**Acute inpatient management** — Use disorder-specific treatment, skills, and milieu. **SSRIs are first-line medication options for anxiety disorders and OCD**; SNRIs are also first-line medication options for anxiety disorders, but not for OCD. For PTSD, prioritize individual trauma-focused psychotherapy with **cognitive processing therapy (CPT)**, **prolonged exposure (PE)**, or **eye movement desensitization and reprocessing (EMDR)**. When medication is chosen, the 2023 VA/DoD guideline recommends **sertraline, paroxetine, or venlafaxine**. Discuss preference and access when making a treatment plan; medication plus psychotherapy is not a universal requirement. Counsel patients starting an antidepressant on delayed benefit and transient early activation. **Avoid standing benzodiazepines on the unit** — they drive dependence, falls, and delirium, and are especially hazardous with comorbid SUD or in older adults; reserve them for specific, time-limited indications (e.g., a structured alcohol or sedative withdrawal protocol). Plan disorder-specific behavioral care: **exposure and response prevention (ERP)** for OCD, CPT, PE, or EMDR for PTSD, and **interoceptive exposure** for panic. During a short stay, assess acute stability and arrange access to appropriate therapy with the supervising team. Wrap all of it in **trauma-informed care** — predictability, explained procedures, offered choices, and minimized restraint/seclusion — which both reduces retraumatization and lowers behavioral escalation.

**Exam treatment anchors** — Panic disorder is treated first-line with an SSRI or SNRI plus CBT, especially interoceptive exposure; benzodiazepines are short-term bridges at most, not maintenance monotherapy. OCD is treated first-line with ERP and an SSRI, often at higher doses than depression; clomipramine or antipsychotic augmentation is reserved for refractory cases. PTSD care prioritizes individual trauma-focused psychotherapy with CPT, PE, or EMDR; sertraline, paroxetine, or venlafaxine are recommended when medication is chosen. The guideline recommends against benzodiazepines for PTSD and suggests prazosin specifically for PTSD-related nightmares, not for PTSD overall. Generalized social anxiety is treated with CBT/exposure and an SSRI or SNRI when medication is needed. Performance-only social anxiety is limited to discrete public performances; a PRN beta-blocker can reduce tremor, tachycardia, and sweating for those events when medically appropriate.

**Disposition & discharge essentials** — If medication is prescribed, confirm a tolerated dose and a clear titration plan. Arrange disorder-specific follow-up, including access to ERP for OCD and a feasible plan for the patient's chosen evidence-based PTSD treatment, such as CPT, PE, or EMDR. Discuss preference and access without implying that every patient with PTSD must receive both medication and psychotherapy. Reconcile medications so no patient leaves on a new standing benzodiazepine without an explicit, time-limited rationale and taper. Give the patient and family a relapse-warning plan and crisis contacts, and communicate trauma-informed considerations to the next setting.

- SSRIs are first-line medication options for anxiety disorders and OCD; SNRIs are also options for anxiety disorders, not OCD. For PTSD, choose sertraline, paroxetine, or venlafaxine when medication is selected; benzodiazepines are not recommended for PTSD.

- Disorder-specific psychotherapy — ERP for OCD, CPT/PE/EMDR for PTSD, interoceptive exposure for panic; for PTSD, individual trauma-focused psychotherapy is preferred over medication.

## F03 — medication question review

**Stem, unchanged:** A 28-year-old woman admitted for a severe depressive episode is also found to have untreated PTSD — she endorses daily nightmares, hypervigilance, and avoidance behaviors that have persisted for two years since an assault. She has no history of substance use disorder. After addressing the acute safety concern, which is the most appropriate first-line pharmacotherapy for her PTSD?

### Option B

**Before:** Start an SSRI or SNRI, counsel her about delayed onset, and plan trauma-focused therapy (prolonged exposure or CPT) as a discharge goal

**Draft now:** Choose sertraline, paroxetine or venlafaxine when medication is selected, discuss delayed benefit, and arrange a discussion of trauma-focused therapy options such as CPT, PE or EMDR.

### Option C explanation

**Before:** Propranolol is studied as an acute peritraumatic adjunct — it is not first-line pharmacotherapy for established PTSD; SSRIs and SNRIs are.

**Draft now:** Propranolol is not a recommended first-line medication for established PTSD. The 2023 VA/DoD guideline recommends sertraline, paroxetine or venlafaxine when medication is selected.

### Rationale

**Before:** The reflexive benzodiazepine is the most common trap — standing benzos for PTSD create dependence without treating the disorder and are explicitly avoided on the inpatient unit. SSRIs and SNRIs are first-line across all anxiety disorders and PTSD; definitive treatment pairs medication with trauma-focused therapy (prolonged exposure or CPT) planned at discharge. Propranolol is studied in acute peritraumatic settings, not as first-line pharmacotherapy for established PTSD. Antipsychotics conflate re-experiencing with psychosis.

**Draft now:** Sertraline, paroxetine and venlafaxine are the medications recommended for PTSD by the 2023 VA/DoD guideline. The recommendation applies to named drugs, not every SSRI or SNRI. Individual trauma-focused psychotherapy with CPT, PE or EMDR is preferred over medication when feasible and acceptable; treatment planning should reflect preference and access, and combined care is not a universal requirement. The guideline recommends against benzodiazepines for PTSD. Propranolol and antipsychotics are not recommended first-line medications for established PTSD, and intrusive re-experiencing alone does not establish a psychotic disorder.

### Pearl

**Before:** SSRIs/SNRIs are first-line for PTSD — benzodiazepines are a liability on the unit; pair medication with trauma-focused therapy (PE or CPT) at discharge.

**Draft now:** For PTSD, prefer individual trauma-focused psychotherapy (CPT, PE or EMDR); choose sertraline, paroxetine or venlafaxine when medication is selected. Avoid benzodiazepines for PTSD; discuss preference and access rather than requiring combined treatment.

### Evidence

**Before:** t_anxiety.md 'Acute inpatient management' — SSRIs and SNRIs are first-line across anxiety disorders, OCD, and PTSD; avoid standing benzodiazepines on the unit; pair pharmacology with disorder-specific behavioral work — prolonged exposure (PE) and cognitive processing therapy (CPT) for PTSD.

**Draft now:** t_anxiety.md 'Acute inpatient management' and 'Exam treatment anchors' — individual trauma-focused psychotherapy (CPT, PE or EMDR) is preferred; sertraline, paroxetine or venlafaxine when medication is chosen; benzodiazepines are not recommended for PTSD. Original 2023 VA/DoD PTSD guideline, Recommendations 7–8 (pp. 35–36), 15, 19 and 21 (p. 37); evidence ID vadod-2023-ptsd-cpg. Recommendation 21 finds insufficient evidence for the specified medication/psychotherapy combinations or augmentation; combined treatment is not a universal requirement.

## Dependent teaching and review impact

- `topic_meta.json`: PTSD summary, point and evidence link aligned; existing facultyReview record preserved. The core page keeps its existing ordinary-reference style, with an explicit PTSD guideline reference and exact locations. It does not partially opt into the separate all-sources claim-anchor/exercise system: the legacy Project BETA page attachment has no matching stored claim for current core prose and needs its own review. No misleading anchor was added to clear that check.
- `pharmacy.json`: paroxetine/prazosin source quotations and clonazepam's pearl aligned with the source page. Prazosin's nightmare evidence now points directly to the original guideline. All three medication review statuses remain pending; no dose literals were added to pharmacy data.
- Concept selections: summary target revision 2→3; each of the three therapy-card targets 1→2. Crosswalk keeps historical fronts/backs/GUIDs and requires new notes for the changed faces. The already-withdrawn medication pearl remains excluded. The selected evidence-link file was checked against the catalog.
- Both audiences withhold all nine anxiety concept cards while their source is awaiting re-attestation. Historical `pearl_cards.json` and committed Anki packages were not hand-edited.
- Removed static historical sign-off claims from the two edited pages; existing ledger-derived banners remain the review-status authority.
- The evidence exercise was regenerated after the registry additions: seven distractor lists changed, all 23 exercises remain draft, and correct sources, claims, explanations and citations are unchanged.
- Registry inventory tests now expect the two original sources and explicitly check the 2017→2023 supersession. No validation rule or approval policy was weakened.
- The five source signatures reopened by this change are `t_anxiety.md`, `rounds_questions.md`, `question-bank-practice.html`, `shelf-mode.html`, and `review.html`. The attestation ledger was not edited and no signature was created. `qb_anx_002` independently needs renewed item review.
- Q39, other question-bank items, historical PACT/fluoxetine summaries, and the remaining optional F04–F07 teaching proposals are unchanged. F06 source support was added only as necessary for F01–F03.

## Historical validation and delivery hold

The edited question passes the console's phone-review readiness check. The existing question draft-exposure policy has a cap of **zero**, however, so the required demotion to draft fails that separate gate: `qb_anx_002` is unlisted and the open count is 1 above a cap of 0. Keeping it attested, marking it retired, or modifying the cap/allowlist to clear this content change would misstate review or bypass the rule.

Full local verification completed at `f956508b` with **exit 1**. Five steps failed, all tied to the draft-exposure policy: its self-test, its live ratchet, the root application test suite, and both audience build commands. An independent complete capture of the root suite found **3,726 passed, 5 failed, 15 skipped, 0 cancelled** out of 3,746 tests. All five failed assertions are in `tests/deck-governance.test.mjs` and derive from `qb_anx_002` being draft with an open count of 1, cap 0 and no allowlist entry. Temporary cleanup passed.

Source registry, citation attribution, evidence annotations, pharmacy, question coherence, phone-review readiness, derived evidence exercise and governance-separation checks passed. Both new guideline spans are clean. The whole-corpus span ratchet also passed with 11 pre-existing flagged sources (9 truncated and 6 edited sentences), so that pass is not a claim that the entire corpus is clean. Both audience build commands stopped at the root tests, before assembling fresh sites; later checks of existing build output do not establish a new successful build.

The full diagnostic run used the host environment, with Node 25.9.0, Python 3.13.7 and Bash 3.2.57 observed for this handoff. The runtime-contract step checks repository declarations by default; it does not certify that this run used the declared Node 22/Python 3.11/Bash 5 environment. CI, new site builds, deployed behavior and native screen-reader checks are not established by this result.

[implementation-validation.json](implementation-validation.json) records the verified content commit, exact failed steps, root-test inventory, preserved approval boundaries and log hashes. Local full logs are in `output/ai-pilot/ptsd-faculty-review/`. A merge analysis against inspected main `615b8c838c6cf6f7d96ff3e9e4acfe6fabec1baf` found no conflicts; no merge was performed.

Delivery remains held. Do not push through the failed pre-push gate. The next faculty step is to review this exact wording, then separately resolve a review-only staging path for reopened questions that cannot expose drafts to learners. The current console cannot import this local patch. Human acceptance of prose is not an agent-written attestation; no cap, allowlist or approval record was changed to clear the hold.

`READING_COMPANION_ENABLED` and `FACULTY_EVIDENCE_BRIEF_ENABLED` remain `false` in `sp-preview/netlify.toml`. No hosting settings, API credentials or provider calls were changed.

Potential follow-up: use Q40 as a benchmark with two traps—confusing nightmares with overall PTSD, and confusing an initial-dose column with a dose-range column. This is an unimplemented evaluation idea, not an approved benchmark.


## Review-only staging follow-up

The failed validation above and [implementation-validation.json](implementation-validation.json) remain the historical record for `f956508b`. The separate governance foundation at `204f1afa6a1e3ab29298489578fb4acd6d9c7a23` passed the complete local gate, including both audience builds and download parity, and is available as draft [PR #1024](https://github.com/jmoss333/psychiatry-clerkship/pull/1024). It is incorporated into this branch; the clinical draft depends on it landing first. Nothing has been merged to main or release by this work.

Faculty source data can now retain a valid saved draft. Both learner builds publish the complete approved, active subset, including placement questions, saved-question inventories, and Anki/CSV downloads. The revised question is temporarily omitted; its earlier approved wording is not kept as a separate published copy. The accompanying Daily Review change accepts a valid empty approved inventory while still refusing a missing or malformed inventory.

The source check now names `qb_anx_002` as **STAGED — faculty review only**, and the phone-review check reports that this one live draft is ready for faculty review. It remains `status: draft`; the source contains 192 questions and the approved projection contains 188. It is the only changed question relative to the workflow foundation. The QB exposure cap is still zero, the exception list is unchanged, and no approval record differs from that foundation.

Baseline question approval is bound to the exact IDs, saved item revisions, and manifest shown in its preview. Changed selected questions require a fresh preview, and new drafts cannot silently join a previous selection. This binding does not replace human review of the wording.

The Validation section of [PR #1015](https://github.com/jmoss333/psychiatry-clerkship/pull/1015) records the completed combined-head local checks and online checks as they become available. A passing foundation check alone does not establish a successful combined build. Local checks, CI, preview deployment, production delivery and faculty approval remain separate facts. The old failed receipt has not been relabeled successful.

Both AI flags remain `false`. No live provider call, credential change, hosting-setting change or faculty attestation was made. The next review is the staging workflow followed by F01–F03 and the exact saved medication-question revision.

Potential later improvement: a faculty-only view placing the last approved wording beside the saved draft, with its exact revision and learner publication status. This is not implemented here.
