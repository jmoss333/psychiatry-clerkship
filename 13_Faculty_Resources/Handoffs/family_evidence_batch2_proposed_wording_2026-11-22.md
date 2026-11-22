# Family evidence — Batch 2: proposed wording for Dr. Moss

Drafted 2026-11-22 alongside the Batch 1 corrections PR (branch `claude/family-evidence-corrections-2026-11-22`).
**Nothing in this file has been applied.** Each item gives the current text, two or three options with exact
replacement wording, the primary source and the verbatim words behind each option, a recommendation, and the
files it would touch. Every option includes keeping your wording as labelled faculty opinion.

Sources were read from their primary records on 2026-11-22 (PubMed abstracts via E-utilities; NICE CG178 live
page and its 15 November 2026 Wayback capture; 45 CFR 164.510 via the Cornell LII mirror of the eCFR). Quotes
below are verbatim from those records. J9–J15 (added the same day) also draw on full texts you saved to
Drive; those figures are marked as full-text where they are not in the abstract.

---

## J1. Framing: "Bringing the family in changes outcomes"

**Current text**
- Family & Discharge (`exp_family.md`): **"Bringing the family in changes outcomes."** (bold lead-in; Batch 1 left it unchanged)
- Family Therapy Modalities: section heading **"Why it's worth the friction — the evidence in numbers"**
- `topic_meta.json` › `exp_family.md` › point 3 ends: **"— bringing family in is treatment, not logistics."**

**What the sources support.** The relapse evidence is for multi-session programs in samples that were not all
acutely ill. No trial found shows that a single inpatient meeting prevents relapse.
- Rodolico 2022 (PMID 35093198): "We excluded studies in which all patients were acutely ill"; "All interventions,
  with the exception of crisis-oriented interventions and family psychoeducation with two sessions or fewer,
  reduced the relapse rate significantly".
- NICE CG178 rec. 1.4.4.2: family intervention "can be started either during the acute phase or later, including
  in inpatient settings."
- Haselden 2019 (PMID 31310186): any family–staff involvement "was significantly associated with patients'
  attending an outpatient appointment by 7 days (odds ratio [OR]=2.79 ...)" (observational).

**Options**
- **A. Keep, labelled as your view.** Lead-in: **"Bringing the family in changes outcomes (faculty view)."**
  Heading unchanged. topic_meta tail: **"— in our view, bringing family in is treatment, not logistics."**
- **B. Say what the inpatient meeting does.** Lead-in: **"Bringing the family in is part of the treatment."**
  Heading: **"Why it's worth the friction — what the evidence does and does not show"**. topic_meta tail:
  **"— the inpatient meeting gathers collateral, shapes the safety plan, and is the doorway to longer family work."**
- **C. Point at the time course.** Lead-in: **"Family work changes outcomes over months."** Heading unchanged.
  topic_meta tail: **"— start family work in hospital; its relapse benefit comes from the months that follow."**

**Recommendation: B.** It keeps the teaching force. It claims nothing a trial has not shown, and it names the jobs the meeting
actually does. NICE's "including in inpatient settings" is the citable anchor for starting on the unit.

**Files:** `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md`,
`06_Family_and_Relational/family_therapy_modalities_inpatient.md`, `topic_meta.json` (`exp_family.md`).

---

## J2. A "what the evidence does and does not show" paragraph

**Current text:** none. The modalities page lists numbers; nothing says what they do not cover.

**Draft paragraph** (for the modalities page, directly under the numbers list):

> **What the evidence does and does not show.** Multi-session family psychoeducation lowers 12-month relapse odds
> in schizophrenia (Rodolico 2022), but those trials excluded samples in which every patient was acutely ill, and
> programs of two sessions or fewer did not significantly reduce relapse. Brief family intervention has little
> trial evidence: four studies with 163 people, results equivocal for relapse and admission, all rated low or very
> low quality (Okpokoro 2014). A randomized trial of family intervention given only during the admission (a mean
> of 8.6 sessions; 92 patients with schizophrenia) found little effect at discharge; by 18 months women, most
> clearly those with poor prehospital functioning, did better, while men were unaffected or did slightly worse.
> It did not report relapse (Glick 1990). Involving family during the admission is associated with prompt
> follow-up (Haselden 2019), a good reason to do it, but not proof that one meeting prevents relapse.

*Revised after reading Glick 1990 in full (see J13). The first draft said the benefit was limited to women with poor
prehospital functioning; the full text shows it in women generally, most clearly that subgroup, and adds the
session count, the null result at discharge and the absence of relapse data.*

**Verbatim support**
- Okpokoro 2014 (PMID 24595545): "Four studies randomising 163 people could be included"; "Data for relapse are
  also equivocal by medium term (n = 40, 1 RCT, RR 0.50, 95% CI 0.10 to 2.43, low quality evidence)"; "All outcomes
  in the 'Summary of findings' table were rated low or very low quality evidence."
- Glick 1990 (PMID 2278982): "this therapeutic effect appears to be limited to females and does not appear until 18
  months postadmission". Spencer 1988 (PMID 3046383): "this therapeutic effect was restricted to female patients
  with schizophrenia or major affective disorder." Haas 1988 (PMID 3277578): "169 patients".
- Rodolico 2022 and Haselden 2019: as in J1.

**Options**
- **A. Add the paragraph as drafted** (modalities page).
- **B. Add a one-line version** to the playbook's "When to use it" section instead: **"The relapse evidence is for
  multi-session programs; a single inpatient meeting starts that work rather than delivering it (Rodolico 2022;
  Okpokoro 2014)."**
- **C. Keep your current wording** and add nothing (the Batch 1 corrections already carry the setting caveat).

**Recommendation: A.** This is the clearest place to teach the setting limit once. Adopting it needs
registry rows and spans for Okpokoro 2014 and Glick 1990 (both abstracts already read). No numbered reference is
needed.

**Files:** `06_Family_and_Relational/family_therapy_modalities_inpatient.md` (or the playbook for B),
`evidence_registry.json`, `evidence_annotations.json`, `13_Faculty_Resources/_automation/span_audit/abstract_cache.json`.

---

## J3. Clinician-side reluctance as a teaching point

**Current text:** Batch 1 removed every "main barrier is clinician avoidance" claim, because no source ranks it.
The point it was making (that we sometimes don't call) is now unstated.

**What the sources support.** Tham & Solomon 2024 (PMID 38938096) name provider-level barriers without ranking
them: "Inconsistencies in family involvement stemmed from organizational culture, societal attitudes, and
providers' negating of family expertise. Uncertainty regarding confidentiality policies and the absence of
practice guidelines posed challenges for providers." Eassom 2014 (PMID 25280809): staff "Reservations about family
involvement regarding power relations, fear of negative outcomes and the need for an exclusive
patient-professional relationship may be explored and addressed".

**Options**
- **A. Your teaching point, labelled as experience** (Therapy on the Unit, after the barriers sentence):
  **"In our experience, the family call that never happens is often ours to make: a confidentiality worry we could
  have checked, or a busy day. Check before you assume the patient or family said no."**
- **B. A sourced version:** **"Reviews describe provider-level barriers too — discounting what families know,
  uncertainty about confidentiality rules, and reservations about involving them (Tham & Solomon 2024; Eassom
  2014)."**
- **C. Leave it out.**

**Recommendation: A and B together.** B carries the evidence; A keeps your clinical voice and is honestly labelled.

**Files:** `02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md` (Eassom would need a
registry row; for a numbered reference it would also need the citation-cache refresh, so keep it in prose).

---

## J4. Expressed-emotion caveats

**Current text**
- Modalities page: "high-EE roughly **quintuples the odds of relapse within 12 months (OR ~4.87 ...)**"
- `topic_meta.json` › `family_modalities.md` › point 3: "...family warmth is protective — lowering expressed emotion
  is a **modifiable clinical target**."
- Therapy on the Unit already says: "Read those as odds, not risk".

**What the sources support**
- Ma 2021 (PMID 33568244): ORs only; no absolute rates in the abstract. On culture: "Putative effect moderators
  including culture ... None of the moderators included significantly change the results." **Culture did not
  significantly moderate the pooled association**, so a "varies by culture" caveat is not supported by this source.
- Chien 2024 (PMID 39364773): family-based interventions "may result in more family members shifting from high to
  low expressed emotion (RR 3.90 ...; low-certainty evidence)".
- Two-way causality (relapse raising family criticism): no primary source was retrieved for this work. Do not assert it
  until one is.

**Options**
- **A. Keep "modifiable clinical target", labelled:** **"— in our view, lowering expressed emotion is a modifiable
  clinical target."**
- **B. Match the evidence:** **"— family programs may shift relatives from high to low expressed emotion
  (low-certainty evidence), which makes it a reasonable treatment target."** Plus, on the modalities page after the
  Ma figures: **"These are odds from cohort studies, not risks: relapse is common, so the absolute difference is
  smaller than \"five-fold\" suggests."**
- **C. B plus a causality caveat**, once a primary source is retrieved.

**Recommendation: B.** It mirrors the odds-not-risk wording Therapy on the Unit already carries. No cultural caveat
(Ma's moderator analysis argues against it), and no causality sentence until it has a source.

**Files:** `topic_meta.json` (`family_modalities.md`), `06_Family_and_Relational/family_therapy_modalities_inpatient.md`.

---

## J5. Toolbox table: evidence and setting

**Current text:** the 10-row toolbox table has no evidence column. Batch 1 added an evidence note to the Open
Dialogue row only.

**What was verified for this work:** family psychoeducation / multifamily groups (Rodolico 2022: outcomes at 12
months; acutely ill samples excluded); Open Dialogue (Pilling 2026: community crisis services, not an inpatient
trial). **Not verified** for this work: behavioral family therapy, structural, Bowenian, EFT, CRAFT, SPACE/ERP,
DBT-informed family skills, solution-focused / single-session.

**Options**
- **A. Add a column "Evidence and setting"**: family psychoeducation row **"Relapse evidence at 12 months;
  multi-session; not acutely ill samples (Rodolico 2022)"**; Open Dialogue row **"First RCT: no statistically significant
  difference in time to relapse; community crisis care (Pilling 2026)"**; every other row **"Not checked for this page"**.
- **B. One line under the table instead:** **"Only the family-psychoeducation and Open Dialogue rows carry outcome
  evidence checked for this page, and none of those trials tested a single inpatient meeting."**
- **C. Keep the table as is.**

**Recommendation: B.** It is honest at a tenth of the visual weight. A column that says "not checked" eight times
reads as a defect list to a learner.

**Files:** `06_Family_and_Relational/family_therapy_modalities_inpatient.md`.

---

## J6. Confidentiality: what the rules permit when a patient does not object

**Current text**
- `qb_rel_016` (attested) key: "No specifics without consent; offer general support"; why: "Without the patient's
  consent, do not confirm or share specific diagnosis or medication information."
- Maine law navigator already teaches 34-B §1207(5-A): sharing information "directly relevant to the person's
  involvement with the client's care" when a client with capacity consents, "does not object when given the
  chance", or the professional can reasonably infer no objection.
- Therapy on the Unit: "Consent governs what you share, not what you hear."

**What the federal text says** (45 CFR 164.510(b)(2)): "If the individual is present for, or otherwise available
prior to, a use or disclosure permitted by paragraph (b)(1) of this section and has the capacity to make health care
decisions, the covered entity may use or disclose the protected health information if it: (i) Obtains the
individual's agreement; (ii) Provides the individual with the opportunity to object to the disclosure, and the
individual does not express an objection; or (iii) Reasonably infers from the circumstances, based on the exercise
of professional judgment, that the individual does not object to the disclosure."

**Where they agree and where to look:** federal and Maine text both allow sharing information relevant to the
family's involvement when a patient with capacity agrees, does not object when asked, or can reasonably be inferred
not to object. `qb_rel_016`'s stem says the patient "has not authorized this", and the key withholds specifics. That
is consistent with both texts **if** the patient has not yet been asked. The why's "Without the patient's consent"
is narrower than the rules, which also allow "does not object".

**Options**
- **A. Keep qb_rel_016 and add a teaching note** (ethics page or Therapy on the Unit): **"Ask the patient first.
  If a patient with capacity agrees, or does not object when given the chance, you may share what is directly
  relevant to the family's involvement in care (45 CFR 164.510(b); Maine 34-B §1207(5-A)). Listening never needs
  permission."**
- **B. Also amend qb_rel_016's why** to: **"Until the patient has been asked, do not confirm or share specific
  diagnosis or medication information. If the patient agrees or does not object, you may share what is relevant to
  the son's involvement in care."** (Needs demotion to draft and re-attestation.)
- **C. Keep everything as is.**

**Recommendation: A now, B with a legal read.** **Flag for a legal read:** whether Maine's stricter mental-health
confidentiality default (34-B §1207(1)) or facility policy narrows the federal "does not object" pathway on a
psychiatric unit. This draft does not decide that.

**Files:** `03_Core_Topics/Ethics_Legal/` ethics page (or `therapy_on_the_unit_inpatient_teaching.md`),
`question_bank.json` (`qb_rel_016`, option B only).

---

## J7. Candidate additions (one sentence each)

- **Norheim 2025** (PMID 41345598), for the modalities page: **"A cluster-randomised implementation trial (231
  patients) found no significant change in patients' interpersonal difficulties, though patients in the
  intervention units perceived less criticism from relatives (Norheim 2025)."** Verbatim: "There were no
  significant differences in the primary outcome ... (Cohen's d = -0.19, p = 0.2)"; "less perceived criticism from
  the relatives (Perceived Criticism sub-score; d = - 0.4, p = 0.01)".
- **Stokholm 2026** (DOI 10.1186/s40345-026-00443-9; not in PubMed): Crossref confirms the title "Group-based
  psychoeducation for relatives of patients with bipolar disorder — a large-scale real-world randomised controlled
  trial - the R-bipolar RCT", *Int J Bipolar Disord*, 8 October 2026. **Its results were not read** (Crossref
  carries no abstract). Proposed sentence, pending a read of the paper: **"In a real-world RCT of group
  psychoeducation for relatives in bipolar disorder, relatives' knowledge improved but their burden did not
  (Stokholm 2026)."** Do not adopt until the results are verified.
- **APA 2020 schizophrenia guideline**, family-intervention statement: the registry's existing span for
  `apa-2020-schizophrenia` covers the long-acting injectable statement only. The family-intervention statement was
  **not retrieved** for this work. A sentence needs that text first.
- **Patients declining family involvement** (Therapy on the Unit or the playbook): **"Some patients decline family
  involvement for privacy reasons or because they expect a different kind of involvement. Ask what they would be
  comfortable with, and offer to revisit it before discharge (Tham & Solomon 2024)."** Verbatim: "Some service users
  declined family involvement because of privacy concerns and differing expectations regarding the extent of
  involvement." ("revisit before discharge" is advice, not a finding; label it if you prefer.)

**Recommendation:** add Norheim and the declining-patients sentence. Hold Stokholm and APA until their text is read.

---

## J8. Found while working (not in the review; each needs your call)

1. **`evidence_inpatient.md`, Practical Recommendations:** "Offer family psychoeducation to all patients with
   psychotic disorders and their families — **even brief, simple formats are effective**". Rodolico 2022 found
   two-session programs did not significantly reduce relapse; Okpokoro 2014 rates brief-intervention evidence low
   to very low. Options: (A) **"— start with simple psychoeducation and plan for a multi-session course"**; (B) keep,
   labelled as faculty view. Recommend A.
2. **`topic_meta.json` › `family_modalities.md` › point 1:** "the **single strongest** psychosocial intervention for
   schizophrenia relapse prevention". *Superseded by J10, which has the full-text evidence and more exact wording.*
3. **Landmark index (`LM_master_index.json`), Miklowitz 2003 pearl:** "Even simple psychoeducation (12 sessions)
   is effective". *Updated after the full text:* Rodolico reports that the family-psychoeducation trials delivered
   a median of 12 sessions, so the number is real but is a median, not a fixed program. Options: (A) **"Even simple
   psychoeducation (a median of 12 sessions in the trials) is effective"**; (B) remove the parenthesis. Recommend A.
4. **Finnish Open Dialogue figures** (82% no or mild symptoms, 35% needing neuroleptics). Batch 1 removed them. They
   appear verbatim in Seikkula & Olson 2003, *Family Process* (PMID 14606203), a narrative paper by the
   investigators. Their primary data paper (*Ethical Human Sciences and Services* 2003) is not in PubMed and was not
   retrieved. Options: (A) leave removed; (B) restore, attributed: **"the investigators reported, from a
   non-randomized two-year follow-up, ... (Seikkula & Olson 2003)"**. Recommend A.
5. **ReConnect family companion** (`06_Family_and_Relational/_source/index.html`) still says ODDESSI "has not
   reported its main results yet". That file is a pinned ReConnect snapshot (`reconnect_snapshot_provenance.json`,
   exact copy), so it was not edited here; the fix belongs upstream in the ReConnect repository.
6. **Pre-existing paraphrased quotes.** These live questions quote their page in words the page does not carry; it
   was the same on the base commit, and none was caused by Batch 1: `qb_rel_001`, `qb_rel_007`, `qb_rel_008`,
   `qb_rel_012`, `qb_rel_016`. `qb_rel_002`'s keyed answer is also its longest option (QUESTION_BANK_STANDARD §2.4).
   It was left as you attested it, apart from the experience label.

---

## J9–J15. From the full texts you saved on 2026-11-22

Added later on 2026-11-22, after reading the ten PDFs in your Drive folder "Saved from Chrome". Eight are family
evidence. Four errors they exposed in the Batch 1 wording are already fixed in the PR:
- the 0.18–0.63 range now covers only the models that reduced relapse;
- "confidence moderate to very low" now says it spans the review's comparisons;
- the Family & Discharge module now gives the right reason why the review is not evidence for a single meeting;
- the Rodolico registry note no longer says the 37%/10% figures could not be confirmed.

The items below change clinical wording, so they are yours. A figure that appears only in a full text needs an
evidence row with `spanType: "fulltext"`; the annotation gate already accepts that, and seven rows use it. The PDFs
stay in your Drive; only short spans would be stored.

### J9. Restore "37% → 10%"?

**Current:** removed everywhere in Batch 1, and regression test 6 blocks it.

**What the full text says** (Rodolico 2022, Results and Figure 3). At 12 months, 37% of participants on treatment as
usual relapsed. Applying the 0.18 odds ratio to that rate gives about 10% (7–14%) for family psychoeducation alone. The
authors say the event rates were "calculated from ORs (appendix p 8)". So 10% is a model estimate, not a rate
observed in any one trial. The same paper reports that no included study was at low risk of bias (49 moderate, 33
high) and that the family-psychoeducation studies were, on average, at high risk.

**Options**
- **A. Leave them removed.**
- **B. Restore on the modalities page, labelled**, as a new line under the OR 0.18 bullet: **"About 10% vs 37% — in
  these trials 37% of patients on usual care relapsed within 12 months; applying the odds ratio to that rate, the
  authors estimate about 10% (7–14%) with family psychoeducation alone. That is a model estimate, not a rate seen in
  one trial, and none of the included trials was at low risk of bias (Rodolico 2022)."**
- **C. B, plus** the same figures in the evidence page's family-psychoeducation paragraph.

**Recommendation: B.** Absolute rates are what learners remember and what families understand, and the label keeps it
honest. One page is enough.

**Files:** `06_Family_and_Relational/family_therapy_modalities_inpatient.md`; `evidence_annotations.json` (one
`fulltext` row); `tests/family-claims-regression.test.mjs` test 6 (allow the figures only beside "estimate").

### J10. "The single strongest psychosocial intervention" (replaces J8 item 2)

**Current:** `topic_meta.json` › `family_modalities.md` › point 1: "the single strongest psychosocial intervention for
schizophrenia relapse prevention … supported by 90 RCTs".

**What the sources say.** Rodolico compared only family models. Bighelli 2021 (*Lancet Psychiatry*; 72 RCTs, 10 364
participants; 20 psychosocial interventions) compared them all against treatment as usual:
- family interventions OR 0.35 (16% relapse);
- relapse-prevention programmes OR 0.33;
- CBT OR 0.45;
- family psychoeducation OR 0.56 (23% relapse);
- treatment as usual: 35% relapse.

At least three interventions had lower odds than family psychoeducation. The "90 RCTs" also covers all 11 family
models, not family psychoeducation alone.

**Options**
- **A.** **"Family psychoeducation ranked first of 11 family-intervention models for schizophrenia relapse prevention
  in a network meta-analysis of 90 RCTs (more than 10,000 patients)."**
- **B.** J8's earlier wording: **"the strongest-supported family intervention for schizophrenia relapse prevention"**.
- **C. Keep.**

**Recommendation: A.** It says exactly what the paper compared.

**Related, lower stakes:**
- The Canon Quiz feedback for AR-35 option D uses the abstract's phrase "superior to the more complex models". The
  full text says more effective than *most* of them. Recommend **"had lower relapse odds than most of the more
  complex models"**.
- The topic quiz `why` says "strongest evidence for schizophrenia relapse prevention". Recommend **"strongest
  evidence among family interventions for schizophrenia relapse prevention"**.

**Files:** `topic_meta.json` (`family_modalities.md`), `07_Evidence_and_Reading/Landmark_Trials/quizzes.json` (then
`bin/check_deck_card_stability.py --update-fingerprints`), `evidence_registry.json` and `evidence_annotations.json`
(a Bighelli 2021 row).

### J11. The Miklowitz bipolar bullet

**Current** (modalities page): "**OR 0.56 (95% CI 0.43–0.74)** — in bipolar disorder, adjunctive manualized
psychotherapies reduced recurrence vs. control; psychoeducation delivered in a family or group format reduced
recurrence relative to the same content delivered individually (OR 0.12, 0.02–0.94), and family/conjoint therapy was
associated with better retention than standard psychoeducation (OR 0.46, 0.26–0.82)…"

**What the full text says** (Miklowitz 2021, *JAMA Psychiatry* 78(2):141–150). Every number is correct, but:
- **0.56** is all manualized therapies against control conditions, not family therapy.
- The family-specific figure is **family or conjoint therapy vs treatment as usual, OR 0.30 (0.17–0.53)**, the
  top-ranked treatment. It is in the full text, not the abstract.
- **0.12** is an estimate from a component model, with a credible interval, for psychoeducation *with guided skill
  practice* delivered in a family **or group** format.
- Brief psychoeducation shared the retention advantage (OR 0.44, 0.23–0.85).
- The paper describes associations, and draws its conclusions for outpatients.
- "Family or conjoint" includes multifamily and caregiver groups, not only Family-Focused Therapy.

**Options**
- **A. Rewrite:** **"OR 0.56 (95% CI 0.43–0.74) — in bipolar disorder (39 RCTs, 3,863 participants; conclusions drawn
  for outpatients), manualized psychotherapies added to medication were associated with lower recurrence than control
  treatments; family or conjoint therapy (Family-Focused Therapy, multifamily and caregiver groups) had the lowest
  recurrence odds versus treatment as usual (OR 0.30, 0.17–0.53). A component model estimated that psychoeducation
  with guided skill practice lowered recurrence more in a family or group format than individually (OR 0.12, 95%
  credible interval 0.02–0.94). Family or conjoint therapy and brief psychoeducation were each associated with higher
  study retention than standard-length psychoeducation (OR 0.46 and 0.44); the effect on depressive symptoms was less
  certain (SMD −0.46, −1.01 to 0.08) (Miklowitz et al., JAMA Psychiatry 2021)."**
  The FFT line above the list becomes: **"… psychoeducation + communication + problem-solving alongside medication;
  family or conjoint therapy was associated with fewer recurrences than treatment as usual (Miklowitz 2021)."**
- **B. Minimal:** change "reduced" to "were associated with lower", add "(conclusions drawn for outpatients)", and
  leave the rest.
- **C. Keep.**

**Recommendation: A.** The 0.30 is the number that actually belongs to family therapy.

**Files:** `06_Family_and_Relational/family_therapy_modalities_inpatient.md`; `evidence_annotations.json` (the existing
abstract row, plus a `fulltext` row for 0.30); `evidence_registry.json` (`miklowitz-2021` clerkshipRelevance: use
"associated with").

### J12. A caveat on family therapy for depression

**Current** (evidence page): the Lemmens 2009 trial of 83 hospitalized patients (response 49% / 24% / 9%), and "For mood
disorders, consider multi-family group therapy during hospitalization".

**What the source says** (Henken 2007, *Cochrane* CD006728, edited without change to its conclusions in 2010):
- Six trials with 519 people were too heterogeneous to pool or to judge whether family therapy works for depression.
- In its one inpatient trial (Glick 1985), the 29 patients with unipolar depression did better *without* the
  inpatient family intervention. Henken calls this limited evidence.
- Not checked: whether a newer Cochrane version exists.

**Options**
- **A. Add after the Lemmens sentence:** **"An earlier Cochrane review (6 trials, 519 participants) found the evidence
  too heterogeneous and sparse to judge family therapy for depression; in its one inpatient trial, patients with
  unipolar depression did better without the inpatient family intervention (Henken et al., Cochrane 2007)."**
- **B. Soften only the recommendation:** **"For mood disorders, multi-family group therapy started in hospital has
  single-trial support (Lemmens 2009); the wider evidence is sparse and mixed (Henken 2007)."**
- **C. Keep.**

**Recommendation: A and B.** A single positive trial reads stronger than the field is.

**Files:** `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md`; registry and annotation rows for
Henken 2007.

### J13. Glick 1990 and Spencer 1988: the only family intervention confined to the admission

**What the full texts say.** One randomized trial at Payne Whitney covered 169 inpatients with mixed diagnoses (Spencer
1988), including 92 with schizophrenia (Glick 1990). The family intervention ran only during the admission: a mean of
8.6 sessions, mostly psychoeducation, once or twice a week, over a mean stay of 51 days.
- Little effect at discharge.
- By 18 months, better global and role functioning in women, most clearly those with poor prehospital functioning.
- Men were unaffected or did slightly worse.
- In the mixed sample, women with diagnoses other than psychosis or major mood disorder did *worse* with it.
- Relapse and readmission were not reported, and P<0.10 was reported as significant.
- The authors ask for caution and replication.

**What this changes**
- **J2:** the Glick sentence is revised above.
- **J1:** this is the strongest reason for option B. The one trial of inpatient-only family work does not show that
  the meeting changes outcomes; it shows a delayed, sex-limited benefit.

**Options**
- **A.** Adopt J2 with the revised Glick sentence.
- **B.** Adopt J2 without Glick, citing Okpokoro only.
- **C.** Leave J2 as first drafted.

**Recommendation: A.**

**Files:** as J2, plus `fulltext` rows for the session count and the result at discharge.

### J14. The Munich PIP trial: family work that starts on the unit

**Current:** no learner page cites it. A design spec (`docs/superpowers/specs/SPEC_Therapy_Curriculum_Domains_v2_2026-08-21.md`
line 217) calls it "the strongest inpatient-initiated evidence, with 54% vs 88% rehospitalisation at 7 years". Those
figures are a 7-year follow-up reported by Bäuml et al. and cited in the paper, not the trial's own results.

**What the full text says** (Pitschel-Walz 2006, *J Clin Psychiatry* 67:443–452):
- 236 inpatients with schizophrenia or schizoaffective disorder were randomized.
- Patients had eight group sessions, starting during the admission; relatives had eight separate sessions, over 4–5
  months in all.
- Readmission among completers: 21% vs 38% at 12 months (p=.025) and 41% vs 58% at 24 months (p=.036).
- Counting everyone randomized: 37% vs 45% (p=.301) and 54% vs 66% (p=.107), not significant.
- Good medication adherence at 24 months: 80% vs 55%.
- The benefit was concentrated in patients with 2–5 previous episodes.

**Options**
- **A. Add to the modalities numbers list:** **"Started on the unit — in a German trial of 236 inpatients with
  schizophrenia, eight patient sessions and eight separate relatives' sessions, beginning during the admission, were
  followed by fewer readmissions at 2 years among patients who completed follow-up (41% vs 58%); counting everyone
  randomized, the difference was not significant (54% vs 66%) (Pitschel-Walz 2006)."**
- **B. Correct the spec line only:** **"…the strongest inpatient-initiated evidence (2-year readmission 41% vs 58% in
  completers, not significant by intention to treat; a 7-year follow-up by Bäuml et al. reported 54% vs 88%)…"**
- **C. Nothing.**

**Recommendation: A and B.** It is the best example of the pattern the pages teach (start inpatient, continue
outpatient), and the intention-to-treat caveat is the honest part.

**Files:** modalities page; registry and annotation rows for Pitschel-Walz 2006; the spec (B).

### J15. When the benefit appears

**What the sources say.** The two reviews disagree at 6 months:
- Bighelli 2021: family interventions and family psychoeducation were not more efficacious than treatment as usual at
  6 months, only after a year.
- Rodolico 2022, in its family-only analysis: family psychoeducation already had OR 0.19 (0.08–0.44) at 6 months.

The pages already anchor every figure at 12 months.

**Options**
- **A. Add a timing line:** **"Most of the evidence measures relapse at 12 months; at 6 months the reviews disagree
  (Rodolico 2022; Bighelli 2021)."**
- **B. Add nothing.** The 12-month framing is already on every page.

**Recommendation: B.** I first suggested adding a line, but checking Rodolico's 6-month figure showed the reviews
conflict. A line that only says "they disagree" teaches less than the current 12-month anchor. J1 option C ("family
work changes outcomes over months") remains available if you want the time course said in words.

---

## Appendix: research-dock registration (held, not applied)

Registration is held because `bin/research-dock.py check --strict` treats a missing return file as **blocking** in
the checkout that holds the returns (your main checkout). One command, run after copying the verbatim report:

```bash
pbpaste > "/Users/jm/Psychiatry-Clerkship-Library/Evidence Inbox/_research-returns/rq-11-2026-11-22.md"
```

Then say so, and this entry is added to `research_returns.json` in its own commit:

- **Question `RQ-11`** — "Family psychiatry content against primary sources", primaryTool `claude`, status `answered`.
- **Return `rq-11-2026-11-22`** — tool `claude`, asked and returned 2026-11-22, sourceKind `secondary`, status
  `triage`, returnFile `Evidence Inbox/_research-returns/rq-11-2026-11-22.md`.
- **Findings, all `needs-primary`** (proposed disposition and `landedIn` for your promotion):

| Finding | Primary | Proposed disposition | Proposed landedIn |
|---|---|---|---|
| f1 Open Dialogue out of date (F01) | PMID 42648300 | supersedes | `pilling-2026-oddessi`; `evidence_inpatient.md`; `family_therapy_modalities_inpatient.md` |
| f2 Cochrane estimate superseded (F02) | PMID 39364773 | cite (related newer review, not a formal supersession) | `chien-2024-family-cochrane`; modalities, Therapy on the Unit, Reading Room |
| f3 Rodolico dose, certainty, setting (F03) | PMID 35093198 | adopt | `rodolico-2022-family-nma`; `nice-cg178-psychosis-schizophrenia`; modalities, playbook |
| f4 "37% to 10%" and "over 100 RCTs" (F04) | PMID 35093198 | adopt | `rodolico-2022-family-nma`; `exp_family`, `evidence_inpatient`, landmark index and quiz AR-35#6 |
| f5 Haselden association, not effect (F05) | PMID 31310186 | adopt | `haselden-2019-family-involvement-followup`; modalities, `exp_family`, topic_meta |
| f6 Barriers ranking (F06) | PMID 26537838; PMID 38938096; PMID 10030482 | adopt | `ince-2016-implementation`; `tham-solomon-2024`; `dixon-1999-family-services`; modalities, Therapy on the Unit, `qb_rel_010` |
| f7 EE attribution (F07) | PMID 33568244; PMID 9633674; PMID 39364773 | adopt | `butzlaff-hooley-1998-ee-meta`; modalities, `qb_rel_006`, `qb_rel_014` |
| f8 Follow-up and suicide risk (F08) | PMID 32780122 | adopt | `fontanella-2020-youth-followup-suicide`; `exp_family`, topic_meta `evidence_inpatient.md` |
| f9 Question bank (F09) | as f2–f7 | adopt | `question_bank.json` qb_rel_002/004/006/010/013/014 |
| f10 Verify-only items (F10) | PMID 30904843; PMID 19218828; AHRQ HCUP SB #189 (url) | adopt (Chung clause removed; Lemmens cited) / no-action (HCUP) | `exp_family.md`; `lemmens-2009-family-therapy-depression` |

*Joshua Moss, MD | Psychiatrist · Drafted for faculty decision; nothing here is applied until you choose.*
