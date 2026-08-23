# SPEC · Therapy Curriculum Domains v2

**Date:** 2026-08-21 · **Status:** DRAFT — author decisions marked ⚑
**Supersedes:** the D1–D13 domain list in `SPEC_Therapy_Library_Discovery_Queries_v1.md`
**Inputs:** `THERAPY_LIBRARY_ANNOTATIONS_ABSTRACT_CHECKED_2026-08-21.md` (46 rows, abstract-verified) + four completed OpenEvidence Deep Consults from Dr. Moss's account (alliance, suicide-risk components, family psychoeducation, hospital addiction) + `OPENEVIDENCE RAW FILES TO REVIEW/Brief Psychotherapeutic Interventions on Adult Inpatient Psychiatry Units.docx`

---

## 0. Why the domains change

The v1 domains were organised as **modality → anchor paper that proves it works**. The abstract check broke that architecture: four of the papers meant to anchor a domain say close to the opposite of what the domain claimed, and one anchor turned out to be a review of measurement instruments rather than a concept primer.

Replacing the papers would preserve a curriculum whose implicit promise — *for each therapy, here is the study that shows it works* — is not what this literature supports. The literature's actual shape is:

- effects are real but modest and **largely independent of orientation**;
- the **therapist**, not the modality, carries most of the between-arm variance;
- several widely-taught interventions are **supported pre-post and null against active control**;
- several are **supported in adults and null in adolescents**;
- and the strongest single predictor of whether any of it happens is **implementation**, which runs at 4–8%.

v2 therefore reorganises around **the clinical decision the learner actually faces**, and treats each domain's null result as the teaching content rather than as an embarrassment to be routed around. Eight domains replace thirteen; consolidation is part of the correction.

> **Repo rule this extends.** *The library teaches administration; it does not reproduce instruments.* v2 adds a second: **the library teaches what the evidence found, including when that is "no difference."**

---

## 1. The eight domains

| | Domain | Replaces | The decision it trains | The null that does the teaching |
|---|---|---|---|---|
| **T1** | What actually carries the effect | D1, D12 | Where to put effort in a first encounter | Empathic *reflections* as a technique ≈ 0 |
| **T2** | Ruptures: seeing them, and the order of repair | new (was buried in D1) | What to do when the patient goes quiet or pushes back | Rupture-resolution *training* is null for patient outcome |
| **T3** | The suicidal patient: what these interventions do and don't do | D3 (rebuilt) | Which parts of the bundle to spend the encounter on | Screening alone does nothing; SPI is null in youth |
| **T4** | Behavioural activation and the modality question | D2, D2b | Choosing a first behavioural intervention | BA is *acceptable*, not differentially efficacious, in co-occurring SUD |
| **T5** | CBT for psychosis and the selection fallacy | D4 (inverted) | Whether to "select the right patient" | No covariate reliably moderates CBTp efficacy |
| **T6** | Motivational interviewing: where the effect actually lives | D7 (contaminated → rebuilt) | When MI is the right tool | No clear benefit vs TAU at most timepoints |
| **T7** | Mentalisation, personality pathology, and the limits of a claim | D9 (inverted) | Reading "has evidence" correctly | MBT(-A) not superior to active controls for self-harm |
| **T8** | The family is a therapy, and its components disagree | D8, D11, family-systems content | What to actually deliver to a family | Education alone did not reduce relapse in high-EE families |

Retired or relocated: **D10 (meaning-centred)** → held pending Kaitlin's CL reading list. **Four adolescent rows** → moved into a labelled *Adolescent annex* under T3 rather than mixed into an adult list (this resolves the internal inconsistency flagged in the abstract check). **D12 allegiance framing** → deleted, not re-anchored; see T1.

---

## 2. T1 · What actually carries the effect

**The decision:** you have twenty minutes with a patient you have never met. Where does the effort go?

**Spine.**
- Alliance–outcome **r = .278** (95% CI .256–.299; d = .579) across 295 studies, >30,000 patients, stable across rater, measure, orientation, patient characteristics and country — Flückiger et al. 2018, *Psychotherapy*. **PMID 29792475.**
- The alliance is a **therapist** variable: therapist variability in alliance predicts outcome, patient variability does not (Baldwin 2007); confirmed as a moderator across 152 studies / 827 effect sizes (Del Re 2021). → **trainable competency, not a patient trait.**
- Orientation explains ~1% of outcome variance; CBT, person-centred and psychodynamic therapies produce similar large pre-post effects in routine NHS care (Stiles 2006).

**The null that does the teaching.** Elliott et al. 2023 (43 samples): the presence or absence of **empathic reflections** shows essentially no relationship to effectiveness at within-session, post-session or post-treatment level. Machine-learning-rated analysis of ~3,000 sessions found open questions and reflections related to symptom reduction while *rated empathy per se* did not (Zhang 2025). Client-*perceived* empathy predicts outcome (r = .28, Elliott 2018) better than therapist self-report.

> **Teaching line.** Increasing the number of reflective statements is not the skill. Calibrating to empathic opportunities and checking whether the patient confirms or disconfirms you — that is the skill.

**Two corrections v1 carried.**
1. ⚑ **PMID fix.** The Flückiger row was filed under **30335453**, which is Elliott's *empathy* meta-analysis (r = .28), not Flückiger's *alliance* meta-analysis (r = .278). Same journal, same year, near-identical coefficient. Correct to **29792475**; keep 30335453 as the separate empathy row.
2. ⚑ **Delete the allegiance framing.** v1 taught "who ran the trial shapes what the trial finds — read the author list with the same care as the methods," sourced to PMID 40177337. That paper found **no clear evidence** for allegiance or treatment quality impacting outcome, and is confined to trials comparing humanistic therapy to other approaches. Do not re-anchor this claim to a different paper; the honest version is the equivalence paradox above.

**Also stock:** positive regard g = .28–.36 (Farber 2018) — but affirmation of *maladaptive* statements differentiated patients who did not achieve clinically significant change (Karpiak 2004); congruence r = .23 (Kolden 2018); real relationship r = .38 (Gelso 2018); goal consensus r = .24 and collaboration r = .29 (Tryon 2018).

**Responsiveness as the meta-skill.** Moderate turn-to-turn interpersonal flexibility and moderate technique diversity outperform both rigidity and excessive switching — a curvilinear optimum (An 2025; Chen 2020). Preference accommodation: dropout RR 0.62, alliance d = 0.48, but symptom effect only d ≈ .14 (Windle 2020 *JAMA Psychiatry*; Bennett 2025) — worth doing, oversold as a symptom lever.

---

## 3. T2 · Ruptures: seeing them, and the order of repair

**The decision:** the patient has gone flat, or has just told you the plan is pointless. What now?

**Spine.**
- Successful repair r = .29 (d = .62), 11 studies (Eubanks, Muran & Safran 2018). Ruptures themselves r = −.21. **Confrontation markers predict dropout at d = .74.**
- Two subtypes: **withdrawal** (moving away — disengagement, minimal responses, acquiescence) and **confrontation** (moving against — complaint, anger, disagreement).
- **Recognition is the rate-limiting step.** Therapists and patients frequently disagree that a rupture occurred; patient–therapist congruence on rupture occurrence predicts better subsequent session outcome (Zilcha-Mano 2020). **Trainees are especially prone to miss the quiet withdrawal ruptures** (Kline 2019).
- **Order matters.** Immediate strategies (acceptance, validation, curiosity, re-engagement) are foundational — they repair directly *and* create the safety prerequisite. Expressive metacommunication is powerful in successful cases but **can exacerbate the rupture when attempted without that safety** (Ingvardsen Vemmelund 2026). Metacommunication predicts subsequent collaboration mainly **later in a session and at low therapist dominance**; early in a session, warmth buffers it (Li 2016).

**The null that does the teaching.** The **rupture-resolution training** meta-analysis was **non-significant for patient outcome (d = 0.22, p = .28)** (Eubanks 2018). The process evidence is good; the evidence that we can *train* it into better patient outcomes is not there yet.

> **Teaching line.** We are teaching you a skill whose process evidence is solid and whose training evidence is not. That is a reason to practise it carefully and measure it, not a reason to skip it — and you should know the difference.

**Cautions.** In personality disorders ruptures are more frequent, repair is more complex, expressive strategies are more likely to backfire, and rupture-resolution training shows *weaker* effects (Schenk 2020). A session-by-session alliance drop >2 SD below a patient's own mean converges with observer-rated ruptures and can screen — but alliance normally dips *between* sessions and rises *within* them, so a routine post-session decrease is not a rupture proxy (Babl 2024; Zlotnick 2020).

---

## 4. T3 · The suicidal patient: what these interventions do and don't do

**This is the domain that changes most, and the one with live learner exposure** (safety-planning practice tool, WP-06R-b).

### 4.1 The honest hierarchy

| Layer | Evidence | Strength |
|---|---|---|
| **Population-level means restriction** | Jumping-site barriers: Cochrane pooled IRR ≈ 0.05. Sri Lanka pesticide bans: ~93,000 deaths averted. Paracetamol pack limits: reduced overdose deaths without substitution. 30–50% declines in method-specific rates. | **Strong** |
| **Individual lethal-means counselling** | Boggs 2020 (Kaiser, quasi-experimental): among adults endorsing ideation, documented lethal-means assessment associated with 180-day attempt/death risk **3.3% → 0.83%** (P = .034) — but only **33%** received it, and unmeasured co-occurring practices are possible. 2024 SR of 22 counselling studies: 14 of 19 reported improved safe-storage behaviour, **77% high risk of bias**. VA/DoD: **weak** recommendation. | **Thin but favourable** |
| **Firearm-legislation ecological reviews** | *"Stricter regulations were associated with a small reduction, if any, in total and/or firearm-specific suicide deaths"*; non-firearm evidence *"limited, mixed and/or inconclusive"*; **no high-quality RCTs identified**; ecological design *"precluded individual-level causal inference."* — Shank et al., *Inj Prev* 2026, **PMID 40185617** | **Weak, and honestly so** |

⚑ **The v1 annotation on 40185617 said "the strongest causal lever in suicide prevention." Delete that.** The replacement framing is in §4.4 and is already drafted into the safety-planning spec.

### 4.2 Safety planning — supported, and narrower than advertised

- **SPI+** (plan + structured telephone follow-up), 9 VA EDs, N = 1,640: **45% fewer suicidal behaviours** over 6 months (3.03% vs 5.29%; OR 0.56, 95% CI 0.33–0.95) and **more than double** the odds of attending outpatient care (OR 2.06). Mediation showed the behavioural reduction was **not** explained by increased engagement — an independent effect of the plan (Stanley 2018, *JAMA Psychiatry*).
- Nuij 2021 meta-analysis: pooled **RR 0.57 (NNT 16) for suicidal behaviour — and no effect on ideation.**
- Crisis response planning (abbreviated): HR 0.24 vs contract-for-safety in 97 soldiers (Bryan 2017).
- **No completed RCT of the full six-step Stanley–Brown SPI exists.** VA/DoD 2024 rates the evidence low quality and states there is **insufficient evidence to recommend for or against** a CRP/SPI.
- **Quality, not completion, is the lever.** Whole-plan quality associated with fewer attempts (AHR 0.79, 95% CI 0.66–0.95); **Step 1 (warning signs) quality most strongly protective (HR 0.48)**; lethal-means documentation quality averaged **1.29 / 3**; **52.5%** of at-risk inpatients had no plan at all.

**The null that does the teaching.** Albaum et al., *JAMA Pediatrics* 2025 — first paediatric meta-analysis (10 studies, N = 1,002): safety-planning interventions showed **no significant association** with ideation (g = 0.11), suicide-related behaviour (g = −0.09), attempts (RR 1.03) or re-presentation (RR 0.99). Adult-derived plans plausibly fail to address adolescent drivers; family-integrated adaptations are the field's next move.

> **Teaching line.** Safety planning reduces suicidal *behaviour*, not suicidal *ideation*; it works in adults and is null as a standalone in adolescents; and its effect depends on the quality of step one. A completed form is not the intervention.

### 4.3 What the rest of the bundle does

- **Screening alone is inert.** ED-SAFE: universal screening alone changed nothing; screening + self-administered safety plan + up to 52 weeks of telephone follow-up produced a **30% reduction in total attempts** (IRR 0.72, NNT 13–22). ED-SAFE 2 (stepped-wedge, N = 2,761): **43% reduction** in the suicide composite in maintenance (aOR 0.57).
- **Risk scales do not stratify individuals.** 64 prediction models, AUC ≥ 0.80 in most, **PPV for suicide mortality ≤ 0.01**. In the UK, ~**90%** of mental-health patients who died by suicide had been rated no or low risk at last contact. UK/AU/NZ guidance advises against using scales for prediction and allocation. → *assessment produces a formulation of modifiable drivers, not a number that gates care.*
- **Hospitalisation is not uniformly protective.** Ross 2024 (196,610 VHA ED visits, precision-treatment analysis): 7.5% absolute reduction in 12-month attempts **only** for patients with an attempt in the past day (25.9% → 18.3%); no benefit for ideation alone or remote attempts; estimated to reduce risk in 28% of patients and **increase it in 24%**.
- **Brief interventions + sustained contact** is the package with the meta-analytic signal: Doupnik 2020 pooled **OR 0.69** for attempts and **OR 2.74** for linkage; Homan 2026 (36 RCTs, N = 9,552) **OR 0.72**, moderate certainty. Follow-up dose: SAMHSA 24 h + 7 d; VA/DoD 12–24 months; **single or <6-month contact is ineffective**, and the largest caring-letters trial (N = 102,709) was **null** for attempts.
- **The largest inpatient psychotherapy signal:** BCBT-Inpatient, up to 4 sessions added to a TAU that *already included* safety planning and caring contacts — **60% reduction in post-discharge attempts (OR 0.40, NNT 7)** and 71% fewer readmissions in patients without SUD (Diefenbach 2024, *JAMA Psychiatry*); replicated in MSPIRE (Bryan 2025).

### 4.4 Replacement copy for the lethal-means module ⚑ author-confirm

> **Why this conversation is worth having.** Suicidal crises are often short-lived, and case fatality differs enormously between methods — so *which* method is within reach during the crisis matters. At the population level the evidence is strong: barriers at jumping sites, pesticide bans and analgesic pack-size limits all reduce deaths, with far less method substitution than people expect. At the level of a single conversation with a single patient the evidence is thinner — one large quasi-experimental study found documented means assessment associated with a lower attempt rate, and a systematic review of counselling studies found most improved safe-storage behaviour but at high risk of bias. Reviews of firearm legislation, which are ecological, find a small reduction if any and cannot support individual-level causal claims.
>
> **So the case for doing it rests on three things, and you should be able to say all three:** the mechanism is sound, the intervention is cheap and low-risk, and guidelines recommend it — *not* on a demonstrated mortality reduction from counselling itself.

### 4.5 Adolescent annex (labelled, not merged)

SPI standalone: null (Albaum 2025). What does have evidence: **SAFETY** (12-week CBT/DBT-informed family treatment, NNT 3 in its RCT); **FISP** (ED-based single family crisis session + structured callbacks, AAP-endorsed for same-day discharge); **ASAP + BRITE** (re-hospitalisation 15.6% vs 26.5%); **Youth-Nominated Support Team** — the only intervention associated with reduced long-term mortality (2 vs 13 deaths at 11–14 years), though post hoc. DBT-A is **well-established (Level 1)** for reducing adolescent attempts; family therapy **probably efficacious (Level 2)** (Esposito 2026). Not everything family-based works: ABFT and family-focused CBT did not outperform strong comparators, and the Cochrane pooled estimate for family interventions on self-harm repetition was **null** (OR 1.00).

---

## 5. T4 · Behavioural activation and the modality question

**The decision:** the patient is depressed, flat and on a unit for four days. What do you actually do?

**Spine.** BA vs TAU for depression **SMD −0.78** (Cochrane, Uphoff 2020; 15 RCTs, 2,208 participants), anxiety −0.33. Against usual care, the 2024 *JAMA* review puts BA at SMD 0.73, CBT 0.67, PST 0.64 — and **BA is not significantly different from other active treatments.** Inpatient specifically: Schefft 2019 (14 RCTs, 1,080 MDD inpatients) **SMD 0.24, NNT 7.4, zero heterogeneity across CBT, BA, psychodynamic and IPT**; Cohen-Chazani 2022 (37 samples, 4,443 patients) **d = 0.43 with no significant effect of orientation — diagnosis moderated outcome more than modality did.**

**The null that does the teaching.** ⚑ **PMID 34146994** — BA for depression in co-occurring substance use: **SMD 0.19 (CI −0.10 to 0.49, p = 0.20)**, no difference on substance use either, **GRADE Low**, 5 trials, **195 patients total**. The paper's own conclusion: BA *"does not emerge as a differentially efficacious treatment… although it does appear to be an acceptable treatment option."* The v1 annotation claimed the opposite ("you don't have to sequence sobriety first"). **What survives is the tolerability finding**, which is still worth teaching — you may offer BA to a patient who is drinking, and you should not promise it will outperform.

> **Teaching line.** The equivalence paradox is the finding, not a failure of the trials. Pick the intervention the patient can execute in the time you have — which on a four-day stay is usually the simplest one.

---

## 6. T5 · CBT for psychosis and the selection fallacy

**The decision:** should you try to pick which psychotic patients get offered CBTp?

**Spine.** ⚑ **PMID 41217072** — the covariates tested were age, gender, ethnicity, illness duration, illness phase, symptom severity, dose, therapist training, manualisation, and individual vs group. **"There was no reliable evidence indicating that any of the covariates considered in this evidence synthesis significantly impacted the efficacy of cognitive-behavioural therapy in this client group."** Conclusion: CBT **"should continue to be offered equally to service users irrespective of their demographic or clinical characteristics."** The v1 annotation said *"patient selection is a clinical skill"* — inverted. A student who read v1 and cited the paper would have argued against its conclusion.

Also: **PMID 40392926** reports the intervention *"markedly superior to Treatment as Usual"* — v1 pre-assigned it a disappointing result on the strength of its title.

**Context to teach alongside.** NICE recommends CBTp in the acute phase including inpatient care, ≥16 planned sessions following a manual — *"rarely achieved in practice."* Implementation: only **8%** of patients with schizophrenia-spectrum disorders received CBTp or family intervention in the year after inpatient discharge in one UK study; **4%** of Norwegian patients with psychotic disorders had received family psychoeducation. Alliance in psychosis predicts engagement and change at magnitudes comparable to non-psychotic populations — with the wrinkle that **symptom severity depresses provider-rated but not client-rated alliance**, so clinicians systematically underestimate the alliance with their sickest patients.

> **Teaching line.** Your instinct will be to select. The evidence says the selection variables you would use do not moderate the effect — and that the real variance is in whether anyone offers it at all.

---

## 7. T6 · Motivational interviewing: where the effect actually lives

**The decision:** the patient is ambivalent about the medication, the detox, the follow-up. Is MI the tool?

**Spine and its null, together.** Cochrane 2023 (93 studies, 22,776 participants): MI shows **small-to-moderate benefit vs no intervention post-treatment (SMD 0.48), weakening over time, and no clear benefit vs treatment as usual at most timepoints.**

**Where the effect does live:**
- **Engagement.** MI as a *pre-treatment* intervention significantly increases subsequent attendance, with the effect concentrated in **non-treatment-seeking populations (OR ≈ 5, no heterogeneity)** — Lawrence 2017.
- **Adherence.** Pooled RR 1.17 (Palacio 2016, 17 RCTs).
- **A brief dose in an acute setting can carry.** Bagøien 2013: two MI sessions on a psychiatric emergency unit → **7.3 fewer days of substance use per month at two-year follow-up** (95% CI 1.9–12.6).
- **VA/DoD SUD guidance:** MI *style* during all therapeutic encounters, as an engagement strategy.

**The contrast that belongs in the same module.** For stimulant use disorder there is **no FDA-approved pharmacotherapy**, and **contingency management is the standard of care — ASAM/AAAP strong recommendation, high certainty, NNT 6–10 for abstinence.** This is the single strongest behavioural-therapy recommendation anywhere in addiction medicine and it is almost certainly absent from the current library. ⚑ **Add.**

> **Teaching line.** MI is an engagement intervention with a modest direct effect that fades. Use it where ambivalence is the gate to care. Do not present it as a substance-use *treatment* and then be surprised by the Cochrane result.

⚑ **D7 was one of the four queries hit by parallel-agent cache contamination. This domain's reading list must be re-run from scratch, not repaired.**

---

## 8. T7 · Mentalisation, personality pathology, and the limits of a claim

**The decision:** a resident says "MBT has meta-analytic support for self-harm." Is that true?

**Spine.** ⚑ **PMID 38279664** — pre-post effects are large (self-harm g = −0.82), but **against active controls MBT(-A) did not prove more efficacious**, with one exception (adult BPD symptoms, g = −0.56). The paper's conclusion: **"prioritizing the application of MBT(-A) for the treatment of self-harm is not supported."** The v1 annotation asserted meta-analytic support for exactly that use.

**This domain's real subject is how to read an evidence claim.** Pre-post vs active control is the entire argument. Teach it here, once, explicitly, and reference it from T4 and T8.

**What does have comparative evidence:**
- **DBT skills training is the active ingredient.** Linehan 2015 dismantling (N = 99): conditions *including* skills training were significantly superior for reducing NSSI (F = 59.1, p < .001) and depression; all three arms reduced attempts comparably. → **justifies skills-only, open-enrolment groups on inpatient units, where individual DBT is impractical.**
- DeCou 2019 (18 controlled trials): DBT reduced self-directed violence **d = −0.32** and crisis-service use **d = −0.38**; **effect on suicidal ideation not significant.** VA/DoD 2024: insufficient evidence to recommend for or against DBT specifically for attempts.
- Brodsky 2025 (*AJP*): DBT superior to SSRI-plus-management for suicide-related events and NSSI in BPD.
- **Motive-Oriented Therapeutic Relationship** added to general psychiatric management: pooled **SMD −0.45 to −0.56** (Cochrane BPD synthesis) — the most direct experimental test of *responsiveness* as an addable ingredient.

**The safety warning that belongs here.** Routine outcome-monitoring feedback, which helps overall (d ≈ 0.15, rising to 0.36–0.53 when clinical support tools fire for not-on-track cases), was **adverse in personality disorders** in a day-treatment/inpatient RCT (de Jong 2018), and discouraging feedback without support tools worsened outcome in severely ill patients (Errázuriz 2018). Feedback is not universally benign.

---

## 9. T8 · The family is a therapy, and its components disagree

**The decision:** you have one family meeting on day three. What goes in it?

**Spine.**
- **Expressed emotion is the mechanism.** High EE predicts relapse **OR 4.87 (95% CI 3.22–7.36)** at ≤12 months; critical comments OR 2.22; **low warmth protective, OR 0.35**. Family interventions reduce critical comments **g = −0.81** and emotional overinvolvement **g = −0.92** in early psychosis.
- **Effect sizes are large.** Rodolico 2022 NMA (90 RCTs, 10,340 participants): family psychoeducation **OR 0.18** for 12-month relapse — **10% relapse vs 37% with TAU**. Xia 2011 Cochrane: readmission **RR 0.71 (NNT 5)**, relapse RR 0.70 (NNT 9), non-compliance RR 0.52 (NNT 11). Bipolar: family/conjoint therapy ranked highest (SUCRA 95%) for recurrence, **OR 0.30** (Miklowitz 2021).

**The disagreement — this is the domain's actual teaching content.**

| Finding | Says |
|---|---|
| Rodolico 2022 NMA | **Information-only** psychoeducation ranks **first** for relapse prevention |
| Gleeson 2025 (36 RCTs, early psychosis) | Overall hospitalisation effect g = −0.52, **but not maintained when psychoeducation is the sole component** |
| Tarrier 1988 dismantling | In high-EE families, **education alone did not reduce relapse**; only the behavioural arms reduced hostility |
| Lobban 2013 (50 RCTs) | 11 candidate components identified; **none reliably distinguished effective from ineffective interventions** |
| Sin & Norman 2013 (44 studies) | Psychoeducation reliably improves knowledge, coping and perceived support; **less successful at changing caregiver burden, psychological morbidity or EE** |

> **Teaching line.** Four good syntheses of the same literature disagree, and they disagree *by outcome*: what prevents relapse, what prevents hospitalisation, what lowers expressed emotion and what lowers carer burden are not the same thing. This is the cleanest worked example in the whole curriculum of why "does it work?" is an incomplete question.

**Practical parameters worth memorising.**
- **≤2 sessions is ineffective.** Successful programmes run 2–6 months, 60–90 minute sessions; effects are marked when the intervention continues **>3 months**.
- Purely inpatient-confined interventions (≤5 sessions, no post-discharge continuation) have **not** shown readmission reduction. The Munich PIP study — the strongest inpatient-initiated evidence, with 54% vs 88% rehospitalisation at 7 years — *bridged into outpatient continuation.*
- **Format:** McFarlane 1995 — multi-family groups 50% vs single-family 78% relapse at 4 years, and MFG *without* psychoeducation (57%) approximated MFG *with* it, implying an independent group-format effect. But Kopelowicz 2012: culturally adapted MFG reduced rehospitalisation while **standard MFG did not differ from TAU** — content and cultural tailoring may matter as much as format.
- **Even unstructured family contact helps the handoff.** Family involvement with inpatient staff was associated with outpatient attendance at 7 days (OR 2.79) and 30 days (OR 3.07).
- **Implementation is the binding constraint:** 8% (UK, any recommended therapy post-discharge), 4% (Norway, family psychoeducation). Barriers: confidentiality concerns, medical-model dominance on acute wards, no protected staff time, short stays.

⚑ **Pending item resolved.** The Pharoah 2010 Cochrane `.pub2`/`.pub3` question: it is superseded by **Chien WT, Ma DCF, Bressington D, Mou H. *Family-Based Interventions Versus Standard Care for People With Schizophrenia.* Cochrane Database Syst Rev. 2024.** Update the registry `supersededBy` and cite Chien 2024.

---

## 10. Cross-cutting: the two things every domain now carries

**(a) A dose/feasibility line.** Every domain states what is deliverable in the time the learner actually has. The consolidated version lives in `SPEC_Therapy_Curriculum_Content_v1_2026-08-21.md` §2 (the 5/10/20-minute table).

**(b) An implementation line.** Every domain states what fraction of eligible patients actually receive it. Across psychosis, family work and safety planning the number is **4–52%**. A curriculum that teaches efficacy and omits this teaches learners to be surprised by their own wards.

---

## 11. Author decision queue ⚑

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Adopt eight domains, retire thirteen | Yes — consolidation is the correction |
| D-2 | Fix Flückiger PMID 30335453 → **29792475**; keep Elliott 2018 as separate empathy row | Yes |
| D-3 | Delete the allegiance framing rather than re-anchor it | Yes |
| D-4 | Adopt the replacement lethal-means copy (§4.4) | Yes — already drafted into the safety-planning spec |
| D-5 | Move the four adolescent rows into a labelled annex under T3 | Yes |
| D-6 | Re-run D7 (MI), D8 (trauma-informed), D9 (mentalisation), D10 (meaning-centred) queries — cache-contaminated | Yes, before any of those rows ship |
| D-7 | Add **contingency management** (ASAM/AAAP strong, high certainty, NNT 6–10) to T6 | Yes — currently absent from the library |
| D-8 | Add **BCBT-Inpatient** (Diefenbach 2024, NNT 7) to T3 | Yes — largest inpatient suicide-prevention psychotherapy RCT |
| D-9 | Replace Pharoah 2010 with **Chien 2024 Cochrane** | Yes |
| D-10 | Hold D10 (meaning-centred) pending Kaitlin's CL reading list | Yes |
| D-11 | Route `Brief Psychotherapeutic Interventions…docx` through Review & Attest — it postdates `INCORPORATION_REVIEW.md` (2026-06-29) and has never been triaged | ⚑ **Your call — it is the single highest-yield unreviewed file in the repo for this curriculum** |

---

*AI-drafted. Every effect size in this document is traceable to an abstract or a completed OpenEvidence Deep Consult in Dr. Moss's account. Faculty attestation required before student release. No dose literals; no reproduced instrument content.*
