# MS3 · Appendix A4 — Evidence base

104 registered sources and 46 annotated claims. Each annotation stores the verbatim span from the paper that licenses the claim the library makes — the highest-value target for clinical review, because a claim that drifts from its span is a factual error with a citation attached.

**Annotation policy.** {
 "rule": "Every claim the library makes about a source must be licensed by a stored verbatim span from that source.",
 "maxAgeDays": 730,
 "onInversion": "Rewrite the claim to match the paper. Do not edit the span, and do not move the claim to a paper that does not support it.",
 "orphanBacklog": [
  "appelbaum-grisso-1988-capacity",
  "border-2019-candidate-gene",
  "brown-1972-expressed-emotion",
  "bush-1996-catatonia-rating-scale",
  "caspi-2003-5htt-stress",
  "engel-1977-biopsychosocial-model",
  "felitti-1998-ace",
  "franklin-2017-suicide-risk-meta-analysis",
  "lieberman-2005-catie",
  "linehan-1991-dbt",
  "march-2004-tads",
  "rosenhan-1973-sane-places",
  "rush-2006-stard",
  "stanley-brown-2012-safety-planning",
  "volkow-2016-addiction-brain-disease",
  "wampold-1997-bona-fide-psychotherapies"
 ],
 "orphanBacklogNote": "Required sources that predate the gate (seeded 2026-08-21, n=17). This list may only shrink. Clearing it is the therapy-library verification backlog."
}

## Annotated claims (claim vs. the paper's own words)

### `fluckiger-2018`

- span type `abstract` · retrieved 2026-08-21 · PMID 29792475 · DOI —

**Verbatim source span.**

> The overall alliance-outcome correlation was r = .278 (95% CI .256-.299; d = .579) across 295 studies and more than 30,000 patients, and the association was consistent across rater perspective, alliance measure, treatment approach, patient characteristics, and country.

**Claim `alliance-effect-size`** (direction: `positive`, used by T1)

> The alliance-outcome correlation is r = .278 (d = .579) across 295 studies and more than 30,000 patients, and it holds across rater, measure, treatment approach and country.

- claim terms: `alliance-outcome correlation`, `consistent across rater perspective`

### `varese-2025`

- span type `conclusion` · retrieved 2026-08-21 · PMID 41217072 · DOI —

**Verbatim source span.**

> There was no reliable evidence indicating that any of the covariates considered in this evidence synthesis significantly impacted the efficacy of cognitive-behavioural therapy in this client group. Cognitive-behavioural therapy should continue to be offered equally to service users irrespective of their demographic or clinical characteristics.

**Claim `no-covariate-moderation`** (direction: `negative`, used by T5)

> No covariate reliably moderated the efficacy of cognitive-behavioural therapy in this group, and the review concludes it should continue to be offered equally irrespective of demographic or clinical characteristics.

- claim terms: `no reliable evidence`, `offered equally`, `irrespective of their demographic or clinical characteristics`

### `hajek-gross-2024`

- span type `conclusion` · retrieved 2026-08-21 · PMID 38279664 · DOI —

**Verbatim source span.**

> Pre-post effects were large for self-harm (g = -0.82), but against active controls MBT(-A) did not prove to be more efficacious, with the exception of borderline personality disorder symptoms in adults (g = -0.56). Prioritizing the application of MBT(-A) for the treatment of self-harm is not supported.

**Claim `mbt-not-superior-active-control`** (direction: `negative`, used by T7)

> Pre-post effects for self-harm are large at g = -0.82, but against active controls MBT(-A) did not prove more efficacious except for adult borderline personality disorder symptoms at g = -0.56, and prioritizing it for self-harm is not supported.

- claim terms: `did not prove to be more efficacious`, `is not supported`

### `pott-2022`

- span type `abstract` · retrieved 2026-08-21 · PMID 34146994 · DOI —

**Verbatim source span.**

> There were no significant differences between behavioural activation and controls with regard to depression (SMD 0.19, 95% CI -0.10 to 0.49, p = 0.20) or substance use, across 5 trials including 195 patients, with GRADE ratings of Low throughout. Behavioural activation does not emerge as a differentially efficacious treatment, although it does appear to be an acceptable treatment option.

**Claim `ba-acceptable-not-superior`** (direction: `negative`, used by T4)

> Behavioural activation showed no significant difference from controls for depression (SMD 0.19, p = 0.20) or substance use across 5 trials and 195 patients at GRADE Low, and does not emerge as differentially efficacious although it is an acceptable option.

- claim terms: `no significant differences`, `does not emerge`, `acceptable treatment option`

### `shank-2026`

- span type `abstract` · retrieved 2026-08-21 · PMID 40185617 · DOI 10.1136/ip-2024-045611

**Verbatim source span.**

> Stricter regulations were associated with a small reduction, if any, in total and/or firearm-specific suicide deaths. Evidence for non-firearm means was limited, mixed and/or inconclusive. No high-quality randomised controlled trials were identified, and the ecological level of analysis precluded individual-level causal inference.

**Claim `means-legislation-ceiling`** (direction: `negative`, used by T3, safety-planning-practice-tool)

> Stricter firearm regulations were associated with a small reduction, if any, in suicide deaths; no high-quality randomised controlled trials were identified; and the ecological design precluded individual-level causal inference.

- claim terms: `small reduction, if any`, `no high-quality randomised controlled trials`, `precluded individual-level causal inference`

### `cuijpers-2026`

- span type `abstract` · retrieved 2026-08-23 · PMID 42492146 · DOI 10.1016/j.cpr.2026.102783

**Verbatim source span.**

> We included 105 trials (13,933 patients), including 40 with low risk of bias. The standardized mean difference (SMD) of BA for adult outpatients compared with control conditions was 0.67 (95% confidence interval [CI]: 0.54 to 0.80; k = 61) with high heterogeneity. This remained significant in most sensitivity analyses, and at 12 months after randomization. We found no significant difference between BA and other therapies (k = 27; SMD = 0.04; 95% CI: -0.10 to 0.18). Self-guided BA was also effective (k = 15; SMD = 0.36; 95% CI: 0.20 to 0.51).

**Claim `ba-effect-and-equivalence`** (direction: `mixed`, used by T2)

> Across 105 trials (13,933 patients), behavioural activation outperformed control conditions with an SMD of 0.67 and remained significant at 12 months after randomization, with no significant difference between BA and other therapies (SMD 0.04); self-guided BA was also effective (SMD 0.36).

- claim terms: `standardized mean difference`, `no significant difference between BA and other therapies`, `Self-guided BA was also effective`

### `stanley-brown-2018`

- span type `abstract` · retrieved 2026-08-23 · PMID 29998307 · DOI 10.1001/jamapsychiatry.2018.1776

**Verbatim source span.**

> Cohort comparison design with 6-month follow-up at 9 EDs (5 intervention sites and 4 control sites) in Veterans Health Administration hospital EDs. Of the 1640 total patients, 1186 were in the intervention group and 454 were in the comparison group. The SPI+ was associated with 45% fewer suicidal behaviors, approximately halving the odds of suicidal behavior over 6 months (odds ratio, 0.56; 95% CI, 0.33-0.95, P = .03). Intervention patients had more than double the odds of attending at least 1 outpatient mental health visit (odds ratio, 2.06; 95% CI, 1.57-2.71; P < .001).

**Claim `spi-suicidal-behaviour`** (direction: `positive`, used by T1, T3)

> In a cohort comparison of 1640 emergency-department patients, the Safety Planning Intervention with follow-up was associated with 45% fewer suicidal behaviors over 6 months (odds ratio 0.56) and more than double the odds of attending at least 1 outpatient mental health visit (odds ratio 2.06).

- claim terms: `Cohort comparison design`, `was associated with 45% fewer suicidal behaviors`

### `links-ross-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 38952224 · DOI 10.1176/appi.psychotherapy.20230044

**Verbatim source span.**

> Good psychiatric management (GPM) was developed for patients with borderline personality disorder with the purpose of supporting wider community adoption and dissemination compared with existing therapies. GPM is in development but shows promise as a therapy that is effective and accessible and that can be widely disseminated.

**Claim `gpm-generalist-frame`** (direction: `descriptive`, used by T5)

> Good psychiatric management was developed to support wider community adoption and dissemination than existing therapies, and shows promise as a therapy that is effective and accessible.

- claim terms: `supporting wider community adoption and dissemination`, `effective and accessible`

### `pharoah-2010-family-intervention`

- span type `abstract` · retrieved 2026-08-23 · PMID 21154340 · DOI 10.1002/14651858.cd000088.pub3

**Verbatim source span.**

> This 2009-10 update adds 21 additional studies, with a total of 53 randomised controlled trials included. Family intervention may decrease the frequency of relapse (n = 2981, 32 RCTs, RR 0.55 CI 0.5 to 0.6, NNT 7 CI 6 to 8), although some small but negative studies might not have been identified by the search. Family intervention may also reduce hospital admission (n = 481, 8 RCTs, RR 0.78 CI 0.6 to 1.0, NNT 8 CI 6 to 13).

**Claim `family-intervention-relapse`** (direction: `positive`, used by T6)

> Across 53 randomised controlled trials, family intervention may decrease the frequency of relapse (RR 0.55, NNT 7) and may also reduce hospital admission (RR 0.78).

- claim terms: `may decrease the frequency of relapse`, `may also reduce hospital admission`

### `modini-large-2026`

- span type `abstract` · retrieved 2026-08-23 · PMID 41664893 · DOI 10.1177/10398562261425069

**Verbatim source span.**

> Research has repeatedly failed to account for the high suicide rate post-discharge from a psychiatric hospital. It is apparent that research in this field largely focuses on simple categorical variables and fails to consider inpatient experiences of their admission and treatment. Empirically investigating how the treatment experience itself can contribute to post-discharge adverse outcomes is required.

**Claim `post-discharge-research-critique`** (direction: `negative`, used by T3)

> Research has repeatedly failed to account for the high suicide rate post-discharge, focusing on simple categorical variables and failing to consider inpatient experiences of admission and treatment.

- claim terms: `failed to account for the high suicide rate`, `simple categorical variables`

### `tetzlaff-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 41110399 · DOI 10.1016/j.cpr.2025.102656

**Verbatim source span.**

> Parallel literature searches in PsycInfo, Medline, and PubMed between 2000-June 2025 identified 5198 potential articles, of which 48 met inclusion. Clinical symptom severity influenced MHP-rated TA, but not client-rated TA. A secure attachment of the client favored TA quality, while other attachment styles appeared to be unrelated to TA.

**Claim `alliance-smi-rater-mismatch`** (direction: `descriptive`, used by RR)

> Across 48 included studies in severe mental illness, clinical symptom severity influenced clinician-rated therapeutic alliance but not client-rated alliance.

- claim terms: `48 met inclusion`, `Clinical symptom severity influenced MHP-rated TA, but not client-rated TA`

### `huggett-2022`

- span type `abstract` · retrieved 2026-08-23 · PMID 35168297 · DOI 10.1002/cpp.2726

**Verbatim source span.**

> Findings failed to demonstrate a clear link between suicidal experiences prior to or during psychotherapy and the subsequent development and maintenance of the therapeutic alliance during psychotherapy. However, a robust therapeutic alliance reported early on in psychotherapy was related to a subsequent reduction in suicidal ideation and attempts.

**Claim `alliance-and-suicidality`** (direction: `mixed`, used by RR)

> Suicidal experiences before or during psychotherapy showed no clear link to whether a therapeutic alliance formed, while a robust alliance reported early in psychotherapy was related to a subsequent reduction in suicidal ideation and attempts.

- claim terms: `failed to demonstrate a clear link`, `robust therapeutic alliance reported early on`

### `man-2023`

- span type `abstract` · retrieved 2026-08-23 · PMID 35997039 · DOI 10.1002/cpp.2780

**Verbatim source span.**

> Ten studies were included in the review, and all utilized a small to moderate sample size. The most common type of indirect intervention employed was case formulation sessions. Other types of indirect interventions included formal clinical supervision, reflective practice and staff practice-based education sessions. Overall, the utilization of indirect psychological interventions shows promise, particularly case formulation sessions. However, additional larger scale research is required to further develop the evidence base of indirect interventions for this setting.

**Claim `indirect-psychological-interventions`** (direction: `mixed`, used by RR)

> Indirect psychological interventions on inpatient units — most commonly case formulation sessions, plus clinical supervision and reflective practice — show promise across a small evidence base, but additional larger scale research is required.

- claim terms: `case formulation sessions`, `shows promise`, `additional larger scale research is required`

### `schefft-2019`

- span type `abstract` · retrieved 2026-08-23 · PMID 30520019 · DOI 10.1111/acps.12995

**Verbatim source span.**

> The meta-analysis of 19 available comparisons resulted in a moderate pooled effect size showing a small and statistically significant benefit of the psychotherapeutic intervention over control conditions (g = 0.24, P < 0.001, I2 = 0%). This corresponds to a number needed to treat of 7.4. The effects of the interventions were stable over 12-month follow-up (g = 0.21, P < 0.01, I2 = 30%). Comparisons with waitlist or non-standardized control treatments tended to be associated with larger effect sizes than standardized control treatments. This meta-analysis provides evidence for a small but sustained effect of inpatient psychotherapy in patients with major depressive disorders.

**Claim `inpatient-psychotherapy-effect`** (direction: `positive`, used by RR)

> Inpatient psychotherapy for major depression showed a small but sustained benefit over control conditions (g = 0.24, number needed to treat 7.4), stable at 12-month follow-up (g = 0.21), with waitlist or non-standardized controls tending to produce larger effect sizes than standardized ones.

- claim terms: `small but sustained effect`, `number needed to treat of 7.4`

### `cohen-chazani-2022`

- span type `abstract` · retrieved 2026-08-23 · PMID 35442174 · DOI 10.1080/00332747.2022.2062660

**Verbatim source span.**

> In total, 37 samples were included for the meta-analysis with a total of 4,443 patients. The meta-analysis of 15 samples with a control group resulted in the upper end of the low effect size for the contribution of psychotherapy to the improvement of patients' clinical status measured by symptomatic and functional measures (k = 15, Cohen's d = 0.43, and 95% CI 0.06 to 0.81). No significant effects were uncovered for psychotherapy orientation. Diagnosis was found to moderate the contribution of psychotherapy in an inpatient setting to the improvement of patients' clinical condition.

**Claim `inpatient-psychotherapy-specific-contribution`** (direction: `mixed`, used by RR)

> Across 37 samples (4,443 patients), the specific contribution of psychotherapy during psychiatric hospitalization was d = 0.43 (95% CI 0.06 to 0.81); no significant effects were found for psychotherapy orientation, while diagnosis moderated the contribution.

- claim terms: `No significant effects were uncovered for psychotherapy orientation`, `Diagnosis was found to moderate`

### `cuijpers-2007`

- span type `abstract` · retrieved 2026-08-23 · PMID 17184887 · DOI 10.1016/j.cpr.2006.11.001

**Verbatim source span.**

> Sixteen studies with 780 subjects were included. The pooled effect size indicating the difference between intervention and control conditions at post-test was 0.87 (95% CI: 0.60 - 1.15). This is a large effect. In ten studies activity scheduling was compared to cognitive therapy, and the pooled effect size indicating the difference between these two types of treatment was 0.02. The differences between activity scheduling and cognitive therapy at follow-up were also non-significant.

**Claim `activity-scheduling-vs-cognitive-therapy`** (direction: `mixed`, used by RR)

> Activity scheduling differed from control conditions by a pooled effect size of 0.87, while the difference between activity scheduling and cognitive therapy was 0.02 and non-significant at follow-up — activation is a treatment in its own right, not a preliminary to cognitive work.

- claim terms: `difference between these two types of treatment was 0.02`, `also non-significant`

### `ciharova-2021`

- span type `abstract` · retrieved 2026-08-23 · PMID 34264703 · DOI 10.1037/ccp0000654

**Verbatim source span.**

> A total of 45 studies with 3,382 participants were included. There was no evidence of a difference in effectiveness between CR, BA, and CBT. All three interventions were superior to CAU; SMD 0.57, 95% confidence interval [CI 0.08-1.07]; 0.52 [0.34-0.71]; 0.44 [0.28-0.60], respectively. No difference in tolerability was found.

**Claim `cr-ba-cbt-indistinguishable`** (direction: `mixed`, used by RR)

> There was no evidence of a difference in effectiveness between cognitive restructuring, behavioural activation and full CBT, while all three were superior to care-as-usual (SMD 0.57, 0.52 and 0.44 respectively).

- claim terms: `no evidence of a difference in effectiveness between CR, BA, and CBT`, `superior to CAU`

### `simmonds-buckley-2019`

- span type `abstract` · retrieved 2026-08-23 · PMID 31422844 · DOI 10.1016/j.beth.2019.01.003

**Verbatim source span.**

> Nineteen trials were quantitatively synthesized. Depression outcomes postgroup BA treatment were superior to controls (SMD 0.72, CI 0.34 to 1.10, k=13, N=461) and were equivalent to other active therapies (SMD 0.14, CI -0.18 to 0.46, k=15, N=526). The dropout rate for group BA (14%) was no different from other active treatments for depression (17%).

**Claim `group-ba-efficacy-and-dropout`** (direction: `mixed`, used by RR)

> Group behavioural activation was superior to controls (SMD 0.72) and equivalent to other active therapies, with a dropout rate of 14% that was no different from other active treatments.

- claim terms: `superior to controls`, `equivalent to other active therapies`, `was no different from other active treatments`

### `steeg-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 41365522 · DOI 10.1136/bmjment-2025-302069

**Verbatim source span.**

> We included 20 systematic reviews, synthesising evidence from 179 unique primary studies. Physical barriers to prevent jumping showed strong effect sizes, although primary study overlap was high. Train platform screen doors were associated with reduced site-specific suicide mortality, with no evidence of displacement to other sites, although the number of studies was small. Paracetamol pack size limitation reduced self-poisoning admissions, with mixed impacts on mortality. Bans on highly hazardous pesticides reduced suicide rates.

**Claim `means-restriction-population-wins`** (direction: `positive`, used by RR)

> Across 20 systematic reviews and 179 unique primary studies, physical barriers to prevent jumping showed strong effect sizes, train platform screen doors were associated with reduced site-specific suicide mortality with no evidence of displacement, paracetamol pack size limitation reduced self-poisoning admissions, and bans on highly hazardous pesticides reduced suicide rates.

- claim terms: `no evidence of displacement to other sites`, `Bans on highly hazardous pesticides reduced suicide rates`

### `hong-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 40392926 · DOI 10.1371/journal.pone.0324685

**Verbatim source span.**

> CBT significantly improved negative symptoms in patients with schizophrenia compared to treatment as usual (TAU) (MD = -1.65, 95% CI = -2.10 to -1.21, p < 0.001, I2 = 41%). CBT significantly improved overall function in patients with schizophrenia (SMD = 0.38, 95% CI = 0.13 to 0.63, p < 0.05, I2 = 0%). Additionally, CBT significantly enhanced social skills (SMD = 0.87, 95% CI = 0.58 to 1.16, p < 0.001, I2 = 0%) and social functioning (SMD = 0.19, 95% CI = 0.03 to 0.36, p < 0.05, I2 = 24%) in these patients.

**Claim `cbtp-negative-symptoms-magnitude`** (direction: `positive`, used by RR)

> CBT improved negative symptoms of schizophrenia versus treatment as usual by a mean difference of -1.65 on the rating scale, with improvement in overall function (SMD 0.38) and social skills (SMD 0.87) — statistically robust and clinically modest.

- claim terms: `compared to treatment as usual`, `significantly enhanced social skills`

### `tarrier-wykes-2004`

- span type `abstract` · retrieved 2026-08-23 · PMID 15500811 · DOI 10.1016/j.brat.2004.06.020

**Verbatim source span.**

> A review of these studies indicates modest effect sizes, with the strongest evidence available for chronic patients. There is evidence that the effect size of the trials is significantly and negatively correlated to their methodological quality. We conclude cautiously that overall there is good evidence for the efficacy and effectiveness of CBTp in the treatment of schizophrenia.

**Claim `cbtp-quality-effect-correlation`** (direction: `mixed`, used by RR)

> Across CBT for psychosis trials, effect sizes are modest and the effect size of the trials is significantly and negatively correlated to their methodological quality — better-designed trials report smaller effects.

- claim terms: `significantly and negatively correlated to their methodological quality`, `modest effect sizes`

### `wibbelink-2026`

- span type `abstract` · retrieved 2026-08-23 · PMID 42018336 · DOI 10.1001/jamapsychiatry.2026.0418

**Verbatim source span.**

> Of 204 participants (172 female [84.3%]; mean [SD] age, 32.21 [9.57] years), 95 (46.6%) received DBT and 109 (53.4%) received ST. Intention-to-treat analysis revealed no significant difference between DBT and ST in reducing BPD severity (P = .27, r = 0.09), with large improvements in both treatments. At 36-month follow-up, the estimated mean difference was -1.09 on the BPDSI-5 (Cohen d = 0.15; 95% CI, -0.17 to 0.47). Dropout did not differ significantly (DBT: 34% at 1 year, 52% at 2 years; ST: 29% at 1 year, 46% at 2 years).

**Claim `dbt-vs-schema-no-difference`** (direction: `mixed`, used by RR)

> In a multicentre trial of 204 outpatients, there was no significant difference between DBT and schema therapy in reducing BPD severity (Cohen d = 0.15) with large improvements in both, and dropout by 2 years reached 52% and 46% respectively.

- claim terms: `no significant difference between DBT and ST`, `large improvements in both treatments`

### `brodsky-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 41190740 · DOI 10.1176/appi.ajp.20240298

**Verbatim source span.**

> Significantly fewer SREs occurred in the DBT arm compared with the SSRI/M arm during the 6-month treatment phase. Significantly fewer suicide attempts occurred in the DBT arm compared with the SSRI/M arm. DBT participants had significantly lower NSSI counts than SSRI/M participants. Severity of depression and suicidal ideation decreased comparably in both treatment groups. After 6 months of treatment, the rate of major depressive disorder was significantly lower in the SSRI/M arm compared with the DBT arm. At 12-month follow-up (6 months after completion of the treatment phase), outcomes were comparable between the two groups.

**Claim `dbt-vs-ssri-suicide-events`** (direction: `mixed`, used by RR)

> Over a 6-month treatment phase, DBT produced significantly fewer suicide-related events, fewer suicide attempts and lower non-suicidal self-injury counts than SSRI plus clinical management, while severity of depression and suicidal ideation decreased comparably in both groups and outcomes were comparable between the two groups at 12-month follow-up.

- claim terms: `Significantly fewer SREs occurred in the DBT arm`, `decreased comparably in both treatment groups`, `outcomes were comparable between the two groups`

### `arqueros-2026`

- span type `abstract` · retrieved 2026-08-23 · PMID 42275028 · DOI 10.1037/per0000774

**Verbatim source span.**

> Seven studies met criteria; five entered meta-analysis. BPD clinical severity showed large within-arm improvement (d = -1.32, 95% confidence interval [CI; -1.99, -0.64]) with substantial heterogeneity. Pooled dropout was 29% (95% CI [23%, 36%]), implying 71% retention. Stand-alone DBT-ST is associated with large symptom reductions and acceptable retention, providing skills-specific benchmarks to inform implementation, whereas heterogeneity indicates the need for more robust comparative trials.

**Claim `dbt-skills-only-benchmarks`** (direction: `mixed`, used by RR)

> Stand-alone DBT skills training showed large within-arm improvement in BPD severity (d = -1.32) with 71% retention, but these are within-arm benchmarks and heterogeneity indicates the need for more robust comparative trials.

- claim terms: `large within-arm improvement`, `implying 71% retention`, `need for more robust comparative trials`

### `appel-2026`

- span type `abstract` · retrieved 2026-08-23 · PMID 41849148 · DOI 10.1521/pdps.2026.54.1.97

**Verbatim source span.**

> The goal of this article is to outline a set of simple, commonsense interventions for generalist providers informed by two evidence-based treatments for patients with borderline personality organization or other moderate to severe personality disorder presentations, transference-focused psychotherapy (TFP), and good psychiatric management for borderline personality disorder. Clinicians can benefit from familiarity with the guidance for working with families outlined in these modalities, even if they are not motivated to offer either of these two treatments themselves.

**Claim `family-work-generalist-roadmap`** (direction: `descriptive`, used by RR)

> Commonsense interventions for generalist providers working with the families of patients with personality disorder, drawn from transference-focused psychotherapy and good psychiatric management — a road map rather than trial data.

- claim terms: `simple, commonsense interventions for generalist providers`, `even if they are not motivated to offer either of these two treatments`

### `ma-2021`

- span type `abstract` · retrieved 2026-08-23 · PMID 33568244 · DOI 10.1017/S0033291721000209

**Verbatim source span.**

> Findings revealed that global HEE significantly predicted more on early relapse (<=12 months) [OR 4.87 (95% CI 3.22-7.36)] than that on late relapse (>12 months) [OR 2.13 (95% CI 1.36-3.35)]. Higher level of critical comments (CC) significantly predicted relapse [OR 2.22 (95% CI 1.16-4.26)], whereas higher level of warmth significantly protected patients from relapse [OR 0.35 (95% CI 0.15-0.85)]. Results also confirmed the foci of family interventions on reducing CC and improving warmth in relationship.

**Claim `expressed-emotion-relapse-prediction`** (direction: `positive`, used by RR)

> High expressed emotion significantly predicted early relapse within 12 months (OR 4.87), critical comments significantly predicted relapse (OR 2.22), and higher warmth significantly protected patients from relapse (OR 0.35).

- claim terms: `significantly predicted more on early relapse`, `higher level of warmth significantly protected patients from relapse`

### `camacho-gomez-2020`

- span type `abstract` · retrieved 2026-08-23 · PMID 31050757 · DOI 10.1093/schbul/sbz038

**Verbatim source span.**

> Pooled results showed that FIp was effective for preventing relapse (RR = 0.42; 95% CI = 0.29 to 0.61) compared to TAU and/or other psychosocial interventions. FIp showed benefits in reducing duration of hospitalization (TAU, MD = -3.31; other interventions, MD = -4.57) and psychotic symptoms (TAU, SMD = -0.68), and increased functionality (TAU, SMD = 1.36; other interventions, SMD = 1.41). These findings suggest that FIp is effective for reducing relapse rates, duration of hospitalization, and psychotic symptoms, and for increasing functionality in FEP patients up to 24 months.

**Claim `family-intervention-first-episode`** (direction: `positive`, used by RR)

> In first-episode psychosis, family intervention was effective for preventing relapse (RR 0.42) and reduced duration of hospitalization and psychotic symptoms while increasing functionality, holding up to 24 months.

- claim terms: `effective for preventing relapse`, `up to 24 months`

### `schwenker-2023`

- span type `abstract` · retrieved 2026-08-23 · PMID 38084817 · DOI 10.1002/14651858.CD008063.pub3

**Verbatim source span.**

> We included 93 studies with 22,776 participants. Motivational interviewing may reduce substance use compared with no intervention up to a short follow-up period. MI probably reduces substance use slightly compared with assessment and feedback over medium- and long-term periods. MI may make little to no difference to substance use compared to treatment as usual and another active intervention. Overall, we have moderate to no confidence in the evidence, which forces us to be careful about our conclusions.

**Claim `mi-calibrated-effects`** (direction: `mixed`, used by RR)

> Across 93 studies with 22,776 participants, motivational interviewing may reduce substance use compared with no intervention over short follow-up, but may make little to no difference compared to treatment as usual or another active intervention, on evidence of moderate to no certainty.

- claim terms: `may make little to no difference to substance use`, `moderate to no confidence in the evidence`

### `bastos-maia-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 39798118 · DOI 10.1080/15504263.2024.2434218

**Verbatim source span.**

> 8 RCTs were included in this review. The patients who underwent MI interventions showed an improvement in functioning, psychiatric symptoms, medication compliance and substance use, although without statistical significance. The number of relapses, total days in relapse and alcohol binge days showed a significant improvement in favor of the intervention group. Although there was a clear improvement in most of these outcomes, most studies failed to detect significant results. A significant clinical outcome of MI application was found in lower relapse occurrence and alcohol abuse.

**Claim `mi-dual-diagnosis-narrow-benefit`** (direction: `mixed`, used by RR)

> Motivational interviewing improved functioning, psychiatric symptoms, medication compliance and substance use without reaching statistical significance, while number of relapses, days in relapse and alcohol binge days showed significant improvement in favour of the intervention group.

- claim terms: `although without statistical significance`, `significant improvement in favor of the intervention group`

### `ferguson-2026`

- span type `abstract` · retrieved 2026-08-23 · PMID 41267566 · DOI 10.1027/0227-5910/a001031

**Verbatim source span.**

> 27 papers (n = 1 systematic review, n = 2 mixed methods, n = 8 qualitative, n = 5 quantitative, n = 11 discussion papers) were eligible for inclusion, primarily published in the past five years, mostly from the United States. The majority focus on children/young people, at the selective or indicated level. Lived experience leadership is lacking, and most do not explore suicide-specific outcomes. Limitations: The results may not represent global trauma-informed suicide prevention strategies, and the paper does not evaluate the effectiveness of these approaches.

**Claim `tic-suicide-prevention-scoping`** (direction: `descriptive`, used by RR)

> Across 27 papers on trauma-informed suicide prevention, the majority focus on children and young people, most do not explore suicide-specific outcomes, and the review does not evaluate the effectiveness of these approaches.

- claim terms: `majority focus on children/young people`, `most do not explore suicide-specific outcomes`, `does not evaluate the effectiveness`

### `goldstein-2024`

- span type `abstract` · retrieved 2026-08-23 · PMID 38444328 · DOI 10.7812/TPP/23.127

**Verbatim source span.**

> Realist synthesis methodology was used to develop context-mechanism-outcome configurations. Sixteen articles featuring varied review types were included. The results, highlighting the strategies that lead to improved outcomes for patients and systems, were mapped to SAMHSA's 10 TIC implementation domains, including engagement and involvement; training and workforce development; cross-sector collaboration; screening, assessment, and treatment services; governance and leadership; policy; evaluation; progress monitoring and quality assurance; financing; and physical environment.

**Claim `tic-implementation-domains`** (direction: `descriptive`, used by RR)

> Mechanisms and outcomes of trauma-informed care implementation were mapped to SAMHSA's 10 implementation domains, spanning engagement, workforce training, cross-sector collaboration, screening and treatment services, governance, policy, evaluation, financing and physical environment.

- claim terms: `mapped to SAMHSA's 10 TIC implementation domains`, `training and workforce development`

### `mahon-2024`

- span type `abstract` · retrieved 2026-08-23 · PMID 39046622 · DOI 10.1007/s10597-024-01317-z

**Verbatim source span.**

> The search strategy yielded 5,297 articles, of which (N = 14) systematic reviews are included. Critical appraisal categorised the reviews as 28% high quality, 22% moderate quality, and 50% as low quality. Most reviews (50%), were conducted on youth populations, with school settings being the most studied context. The composition of the individual studies included in each systematic review were generally of low quality with mixed findings of effectiveness and implementation. Trauma-informed care is proposed as a system wide intervention to improve outcomes for service users, however the research base is still under scrutiny.

**Claim `tic-evidence-still-mixed`** (direction: `mixed`, used by RR)

> Across 14 systematic reviews of trauma-informed care, 50% were rated low quality, most were conducted on youth populations in school settings, and the constituent studies were generally of low quality with mixed findings of effectiveness — the research base is still under scrutiny.

- claim terms: `50% as low quality`, `mixed findings of effectiveness`, `research base is still under scrutiny`

### `wienicke-2023`

- span type `abstract` · retrieved 2026-08-23 · PMID 36958077 · DOI 10.1016/j.cpr.2023.102269

**Verbatim source span.**

> IPD were obtained from 11 of the 13 (84.6%) studies identified (n = 771/837, 92.1%; mean age = 40.8, SD = 13.3; 79.3% female). STPP resulted in significantly lower depressive symptom levels than control conditions at post-treatment (d = -0.62, 95%CI [-0.76, -0.47], p < .001). At post-treatment, STPP was more efficacious for participants with longer rather than shorter current depressive episode durations. This moderator finding, however, is observational and requires prospective validation in future large-scale trials.

**Claim `stpp-depression-ipd`** (direction: `positive`, used by RR)

> Individual participant data from 11 of the 13 eligible trials (n = 771) showed short-term psychodynamic psychotherapy produced significantly lower depressive symptom levels than control conditions at post-treatment (d = -0.62), with greater efficacy for longer current episode durations — a moderator finding that is observational and requires prospective validation.

- claim terms: `significantly lower depressive symptom levels than control conditions`, `observational and requires prospective validation`

### `driessen-2023`

- span type `abstract` · retrieved 2026-08-23 · PMID 36404677 · DOI 10.1017/S0033291722003270

**Verbatim source span.**

> Data were obtained for all seven trials identified (100%, n = 482, combined: n = 238, antidepressants: n = 244). Adding STPP to antidepressants was more efficacious for patients with high rather than low baseline depression levels [B = -0.49, 95% confidence interval (CI) -0.61 to -0.37, p < 0.0001] and for patients with a depressive episode duration of >2 years rather than <1 year (B = -0.68, 95% CI -1.31 to -0.05, p = 0.03) and than 1-2 years (B = -0.86, 95% CI -1.66 to -0.06, p = 0.04). These findings need validation but suggest that depression severity and episode duration are factors to consider when adding STPP to antidepressants.

**Claim `stpp-plus-antidepressants-moderators`** (direction: `positive`, used by RR)

> Adding short-term psychodynamic psychotherapy to antidepressants was more efficacious for patients with high rather than low baseline depression levels and for those with a depressive episode duration of >2 years rather than <1 year; these findings need validation.

- claim terms: `more efficacious for patients with high rather than low baseline depression levels`, `These findings need validation`

### `abbass-2020`

- span type `abstract` · retrieved 2026-08-23 · PMID 32428905 · DOI 10.1159/000507738

**Verbatim source span.**

> In meta-analyses of 17 RCTs, STPP significantly outperformed minimal treatment, treatment as usual, or waiting list controls on somatic symptom measures at all time frames, with small to large magnitude effect sizes. Descriptive reviews of 5 RCTs suggest that STPP performed at least as well as other bona fide psychological therapies. Limitations of this meta-analysis include small samples of studies and possible publication bias. STPP is a valid treatment option for diverse FSD conditions resulting in somatic symptom reductions that persist over time.

**Claim `stpp-functional-somatic-disorders`** (direction: `positive`, used by RR)

> Across 17 RCTs, short-term psychodynamic psychotherapy significantly outperformed minimal treatment, treatment as usual, or waiting list controls on somatic symptom measures at all time frames, with small to large magnitude effect sizes.

- claim terms: `significantly outperformed minimal treatment`, `at all time frames`

### `diefenbach-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 39837259 · DOI 10.1016/j.genhosppsych.2025.01.007

**Verbatim source span.**

> Inpatients with a history of suicide attempt were assigned to BCBT-I + TAU (n = 94) or TAU alone (n = 106). Adding BCBT-I to TAU reduced the odds and rate of post-discharge ED visits by three quarters [Odds Ratio estimate = 0.25, 95 % CI:(0.12, 0.46); Rate Ratio estimate = 0.24, 95 % CI:(0.11, 0.53)], but only among participants without SUD. Over one-third (36 %) of ED visits were related to suicide. Additional research is needed to improve the efficacy of BCBT-I for patients with SUD.

**Claim `bcbt-post-discharge-ed-use`** (direction: `mixed`, used by RR)

> Adding brief CBT for inpatients to treatment as usual reduced the odds of post-discharge emergency department visits by three quarters (odds ratio 0.25), but only among participants without a substance use disorder; additional research is needed for patients with SUD.

- claim terms: `but only among participants without SUD`, `Additional research is needed`

### `steinberg-2024`

- span type `abstract` · retrieved 2026-08-23 · PMID 38934489 · DOI 10.1111/sltb.13108

**Verbatim source span.**

> Individuals with a suicide-related concern following discharge from an inpatient psychiatric hospitalization (n = 27), sending CCs on days 2 and 7 post-discharge (phase 3). Phase 3 participants demonstrated reductions in depressive symptoms at day-7 post-discharge (-6.4% mean score on Hopkins-Symptom-Checklist, -9.0% mean score on Entrapment-Scale). Most participants agreed that CC messages helped them feel more connected to the hospital and encouraged help-seeking behavior post-discharge. This study supports the use of an iterative process, including patient feedback, to improve CC messages and provides further pilot evidence that CC can have beneficial effects.

**Claim `caring-contacts-pilot`** (direction: `positive`, used by RR)

> Caring-contact messages sent on days 2 and 7 after discharge to 27 participants produced reductions in depressive symptoms at day 7 and left most participants feeling more connected to the hospital — pilot evidence, not a trial result.

- claim terms: `reductions in depressive symptoms at day-7 post-discharge`, `further pilot evidence`

### `schunemann-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 40177337 · DOI 10.32872/cpe.9709

**Verbatim source span.**

> However, allegiance and bona fide were significant moderators only for two (allegiance) resp. one (bona fide) of five outcome comparison. We found no clear evidence for allegiance or treatment quality impacting upon treatment outcome in this re-examination. Allegiance and treatment quality were not as relevant for outcomes in this meta-analysis of RCTs as expected.

**Claim `allegiance-tested-not-confirmed`** (direction: `negative`, used by RR)

> In this re-examination of humanistic-versus-other psychotherapy trials, there was no clear evidence for researcher allegiance or treatment quality impacting upon treatment outcome — allegiance and treatment quality were not as relevant for outcomes as expected.

- claim terms: `no clear evidence for allegiance or treatment quality impacting upon treatment outcome`, `not as relevant for outcomes`

### `desalve-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 40325843 · DOI 10.1002/cpp.70080

**Verbatim source span.**

> Dropout rates ranged from 10.4% to 58%, depending on treatment modality and patient characteristics. Younger age, comorbid substance use disorders, emotional dysregulation, distress tolerance difficulties were significant predictors of dropout. Conversely, strong therapeutic alliances, mindfulness-based skills and engagement in phone coaching were associated with improved retention.

**Claim `pd-psychotherapy-dropout`** (direction: `descriptive`, used by RR)

> Dropout in personality-disorder psychotherapy ranged from 10.4% to 58% depending on modality and patient characteristics, predicted by younger age, comorbid substance use disorders and emotional dysregulation, while strong therapeutic alliances and engagement in phone coaching were associated with improved retention.

- claim terms: `Dropout rates ranged from`, `associated with improved retention`

### `saxler-2024`

- span type `abstract` · retrieved 2026-08-23 · PMID 38993343 · DOI 10.3389/fpsyg.2024.1293851

**Verbatim source span.**

> A current overview of 48 instruments for measuring TA (46 for F2F-PT, 2 for Online-PT) including their conceptual backgrounds, characteristics and main content aspects is presented. The broad variety of conceptualizations and measures of TA makes coherent research on TA difficult. There are conceptual challenges such as the role of attachment style in TA that remain to be clarified.

**Claim `alliance-measurement-fragmentation`** (direction: `descriptive`, used by RR)

> An overview of 48 instruments for measuring therapeutic alliance found that the broad variety of conceptualizations and measures of TA makes coherent research on TA difficult.

- claim terms: `48 instruments for measuring TA`, `makes coherent research on TA difficult`

### `huggett-2024`

- span type `abstract` · retrieved 2026-08-23 · PMID 39098267 · DOI 10.1016/j.cpr.2024.102469

**Verbatim source span.**

> Thirty-seven papers were included, generating two overarching themes; 'Working on the edge' and 'Being ready, willing, and able to build an alliance in the context of suicidal experiences'. Clinical implications emphasise the need to improve training, supervision, and support for therapists. Flexibly interweaving risk assessment into therapeutic conversation was beneficial to the alliance with suicidal clients and enhanced their safety.

**Claim `risk-assessment-woven-into-conversation`** (direction: `positive`, used by RR)

> Flexibly interweaving risk assessment into therapeutic conversation was beneficial to the alliance with suicidal clients and enhanced their safety — weaving risk assessment into the conversation rather than bolting it on.

- claim terms: `Flexibly interweaving risk assessment into therapeutic conversation`, `enhanced their safety`

### `difronzo-2025`

- span type `abstract` · retrieved 2026-08-23 · PMID 40471224 · DOI 10.4081/ripppo.2025.841

**Verbatim source span.**

> This study investigated the psychotherapeutic process in short-term psychoanalytic psychotherapy (STPP) with five adolescents with moderate/severe depression who had dropped out of STPP in a large randomized controlled trial and reported dissatisfaction with treatment. In each case, sessions were rated as featuring unresolved ruptures with the therapist. Results revealed a weak alliance preceding the adolescent dropping out of therapy, with a mismatch between self-reliant and disengaged adolescents presenting with strong negative affects and therapists seeking to maintain an active exploration of the adolescents' difficulties.

**Claim `unresolved-ruptures-precede-dropout`** (direction: `descriptive`, used by RR)

> In five adolescents with moderate/severe depression who dropped out of short-term psychoanalytic psychotherapy, sessions featured unresolved ruptures with the therapist and a weak alliance preceding dropout — a qualitative adolescent sample, not an adult inpatient one.

- claim terms: `five adolescents with moderate/severe depression`, `unresolved ruptures with the therapist`

### `penzenik-2026`

- span type `abstract` · retrieved 2026-08-23 · PMID 41588871 · DOI 10.1111/jrh.70103

**Verbatim source span.**

> Across these communities, 3,846 individuals responded to the survey. Whereas most respondents were at least somewhat willing to discuss access to firearms with health care providers, only 3.8%-10.8% reported that any provider had asked about such access. A low proportion reported discussions with providers regarding safe storage of medications (14.1%-21.66%). Many respondents did not agree that gun locks and safes reduce suicide risk (16.9%-23.5%).

**Claim `lethal-means-counselling-rarely-happens`** (direction: `descriptive`, used by RR)

> Most respondents were at least somewhat willing to discuss access to firearms with health care providers, yet only 3.8%-10.8% reported that any provider had asked about such access, and a low proportion reported discussions about safe storage of medications (14.1%-21.66%).

- claim terms: `at least somewhat willing to discuss access to firearms`, `only 3.8%-10.8% reported that any provider had asked`

### `xia-2011`

- span type `abstract` · retrieved 2026-08-23 · PMID 21678337 · DOI 10.1002/14651858.CD002831.pub2

**Verbatim source span.**

> Relapse appeared to be lower in psychoeducation group (n = 1214, RR 0.70 CI 0.61 to 0.81, NNT 9 CI 7 to 14) and this also applied to readmission (n = 206, RR 0.71 CI 0.56 to 0.89, NNT 5 CI 4 to 13). Psychoeducation does seem to reduce relapse, readmission and encourage medication compliance, as well as reduce the length of hospital stay in these hospital-based studies of limited quality. The true size of effect is likely to be less than demonstrated in this review - but, nevertheless, some sort of psychoeducation could be clinically effective and potentially cost beneficial.

**Claim `psychoeducation-relapse-readmission`** (direction: `mixed`, used by T4)

> Psychoeducation in schizophrenia reduced relapse (NNT 9) and readmission (NNT 5), on hospital-based studies of limited quality whose true size of effect is likely to be less than demonstrated in the review.

- claim terms: `NNT 9`, `NNT 5`, `studies of limited quality`, `true size of effect is likely to be less than demonstrated`

### `chung-2017-postdischarge-suicide`

- span type `abstract` · retrieved 2026-08-24 · PMID 28564699 · DOI 10.1001/jamapsychiatry.2017.1044

**Verbatim source span.**

> A total of 100 studies reported 183 patient samples. The pooled estimate postdischarge suicide rate was 484 suicides per 100 000 person-years (95% CI, 422-555 suicides per 100 000 person-years; prediction interval, 89-2641), with high between-sample heterogeneity (I2 = 98%). The suicide rate was highest within 3 months after discharge (1132; 95% CI, 874-1467) and among patients admitted with suicidal ideas or behaviors (2078; 95% CI, 1512-2856). Pooled suicide rates per 100 000 patients-years were 277 for studies with follow-up periods longer than 10 years. The immediate postdischarge period is a time of marked risk, but rates of suicide remain high for many years after discharge.

**Claim `postdischarge-rate-and-gradient`** (direction: `positive`, used by T3)

> Pooled across 100 studies, the post-discharge suicide rate was 484 per 100 000 person-years overall, 1132 within 3 months after discharge and 2078 among patients admitted with suicidal ideas or behaviors, with rates remaining high for many years after discharge.

- claim terms: `highest within 3 months after discharge`, `rates of suicide remain high for many years after discharge`

### `chung-2019-first-week-month`

- span type `abstract` · retrieved 2026-08-24 · PMID 30904843 · DOI 10.1136/bmjopen-2018-023883

**Verbatim source span.**

> The pooled estimate of the suicide rate in the first month postdischarge suicide was 2060 per 100 000 person years (95% CI=1300 to 3280, I2=90). The pooled estimate of the suicide rate in the first week postdischarge suicide was 2950 suicides per 100 000 person years (95% CI=1740 to 5000, I2=88). Eight studies that were included after personal communication had lower pooled rates of suicide than studies included after data extraction and there was evidence of publication bias towards papers reporting a higher rate of postdischarge suicide. Acknowledging the presence of marked heterogeneity between studies and the likelihood of bias towards publication of studies reporting a higher postdischarge suicide rate, the first week and first month postdischarge following psychiatric hospitalisation are periods of extraordinary suicide risk.

**Claim `first-week-and-month-rates`** (direction: `mixed`, used by T3)

> The pooled suicide rate was 2950 per 100 000 person years in the first week and 2060 in the first month after psychiatric hospitalisation, acknowledging marked heterogeneity and evidence of publication bias towards papers reporting a higher rate of postdischarge suicide.

- claim terms: `first week postdischarge`, `evidence of publication bias towards papers reporting a higher rate`

## Full source registry

| id | type | access | citation |
|---|---|---|---|
| `cssrs-columbia-lighthouse` | instrument | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'The Columbia Lighthouse Project', 'pages': '', 'pmid': '', 'title': 'Columbia-Suicide Severity Rating Scale (C-SSRS)', 'url': 'https://cssrs.columbia.edu/', 'volume': '', 'year': 2011} |
| `va-dod-suicide-cpg-2024` | guideline | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'U.S. Department of Veterans Affairs / Department of Defense', 'pages': '', 'pmid': '', 'title': 'VA/DoD Clinical Practice Guideline for Assessment and Management of Patients at Risk for Suicide', 'url': 'https://www.healthquality.va.gov/guidelines/mh/srb/', 'volume': '', 'year': 2024} |
| `joint-commission-suicide-prevention` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'The Joint Commission', 'pages': '', 'pmid': '', 'title': 'Suicide Prevention Resources', 'url': 'https://www.jointcommission.org/en-us/knowledge-library/suicide-prevention', 'volume': '', 'year': 2026} |
| `nice-violence-aggression-ng10` | guideline | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'National Institute for Health and Care Excellence', 'pages': '', 'pmid': '', 'title': 'Violence and aggression: short-term management in mental health, health and community settings', 'url': 'https://www.nice.org.uk/guidance/ng10', 'volume': '', 'year': 2015} |
| `apa-violence-risk-assessment-2011` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'American Psychiatric Association', 'pages': '', 'pmid': '', 'title': 'Resource Document on Psychiatric Violence Risk Assessment', 'url': 'https://www.psychiatry.org/psychiatrists/search-directories-databases/resource-documents/2011/psychiatric-violence-risk-assessment', 'volume': '', 'year': 2011} |
| `asam-alcohol-withdrawal-2020` | guideline | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'American Society of Addiction Medicine', 'pages': '', 'pmid': '', 'title': 'The ASAM Clinical Practice Guideline on Alcohol Withdrawal Management', 'url': 'https://www.asam.org/quality-care/clinical-guidelines/alcohol-withdrawal-management-guideline', 'volume': '', 'year': 2020} |
| `bap-catatonia-2023` | consensus | metadata | {'authors': [], 'doi': '10.1177/02698811231158232', 'journal': '', 'organization': 'British Association for Psychopharmacology', 'pages': '', 'pmid': '', 'title': 'Evidence-based consensus guidelines for the management of catatonia', 'url': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10101189/', 'volume': '', 'year': 2023} |
| `nice-delirium-cg103` | guideline | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'National Institute for Health and Care Excellence', 'pages': '', 'pmid': '', 'title': 'Delirium: prevention, diagnosis and management in hospital and long-term care', 'url': 'https://www.nice.org.uk/guidance/cg103', 'volume': '', 'year': 2023} |
| `project-beta-deescalation-2012` | consensus | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'American Association for Emergency Psychiatry Project BETA', 'pages': '', 'pmid': '', 'title': 'Verbal De-escalation of the Agitated Patient: Consensus Statement of the AAEP Project BETA De-escalation Workgroup', 'url': 'https://pubmed.ncbi.nlm.nih.gov/22461917/', 'volume': '', 'year': 2012} |
| `project-beta-psychopharm-agitation-2012` | consensus | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'American Association for Emergency Psychiatry Project BETA', 'pages': '', 'pmid': '', 'title': 'The Psychopharmacology of Agitation: Consensus Statement of the AAEP Project BETA Psychopharmacology Workgroup', 'url': 'https://escholarship.org/uc/item/5fz8c8gs', 'volume': '', 'year': 2012} |
| `engel-1977-biopsychosocial-model` | primary-study | fulltext | {'authors': [{'family': 'Engel', 'given': 'G L'}], 'doi': '10.1126/science.847460', 'journal': 'Science', 'organization': '', 'pages': '129-136', 'pmid': '847460', 'title': 'The need for a new medical model: a challenge for biomedicine.', 'url': 'https://doi.org/10.1126/science.847460', 'volume': '196', 'year': 1977} |
| `rosenhan-1973-sane-places` | primary-study | fulltext | {'authors': [{'family': 'Rosenhan', 'given': 'D L'}], 'doi': '10.1126/science.179.4070.250', 'journal': 'Science', 'organization': '', 'pages': '250-258', 'pmid': '4683124', 'title': 'On being sane in insane places.', 'url': 'https://doi.org/10.1126/science.179.4070.250', 'volume': '179', 'year': 1973} |
| `appelbaum-grisso-1988-capacity` | primary-study | fulltext | {'authors': [{'family': 'Appelbaum', 'given': 'P S'}, {'family': 'Grisso', 'given': 'T'}], 'doi': '10.1056/nejm198812223192504', 'journal': 'The New England Journal of Medicine', 'organization': '', 'pages': '1635-1638', 'pmid': '3200278', 'title': "Assessing patients' capacities to consent to treatment.", 'url': 'https://doi.org/10.1056/nejm198812223192504', 'volume': '319', 'year': 1988} |
| `stanley-brown-2012-safety-planning` | primary-study | fulltext | {'authors': [{'family': 'Stanley', 'given': 'Barbara'}, {'family': 'Brown', 'given': 'Gregory K.'}], 'doi': '10.1016/j.cbpra.2011.01.001', 'journal': 'Cognitive and Behavioral Practice', 'organization': '', 'pages': '256-264', 'pmid': '', 'title': 'Safety Planning Intervention: A Brief Intervention to Mitigate Suicide Risk', 'url': 'https://doi.org/10.1016/j.cbpra.2011.01.001', 'volume': '19', 'year': 2012} |
| `lieberman-2005-catie` | primary-study | fulltext | {'authors': [{'family': 'Lieberman', 'given': 'Jeffrey A'}, {'family': 'Stroup', 'given': 'T Scott'}, {'family': 'McEvoy', 'given': 'Joseph P'}, {'family': 'Swartz', 'given': 'Marvin S'}, {'family': 'Rosenheck', 'given': 'Robert A'}, {'family': 'Perkins', 'given': 'Diana O'}, {'family': 'Keefe', 'given': 'Richard S E'}, {'family': 'Davis', 'given': 'Sonia M'}, {'family': 'Davis', 'given': 'Clarence E'}, {'family': 'Lebowitz', 'given': 'Barry D'}, {'family': 'Severe', 'given': 'Joanne'}, {'family': 'Hsiao', 'given': 'John K'}], 'doi': '10.1056/nejmoa051688', 'journal': 'The New England Journal of Medicine', 'organization': 'Clinical Antipsychotic Trials of Intervention Effectiveness (CATIE) Investigators', 'pages': '1209-1223', 'pmid': '16172203', 'title': 'Effectiveness of antipsychotic drugs in patients with chronic schizophrenia.', 'url': 'https://doi.org/10.1056/nejmoa051688', 'volume': '353', 'year': 2005} |
| `rush-2006-stard` | primary-study | fulltext | {'authors': [{'family': 'Rush', 'given': 'A John'}, {'family': 'Trivedi', 'given': 'Madhukar H'}, {'family': 'Wisniewski', 'given': 'Stephen R'}, {'family': 'Nierenberg', 'given': 'Andrew A'}, {'family': 'Stewart', 'given': 'Jonathan W'}, {'family': 'Warden', 'given': 'Diane'}, {'family': 'Niederehe', 'given': 'George'}, {'family': 'Thase', 'given': 'Michael E'}, {'family': 'Lavori', 'given': 'Philip W'}, {'family': 'Lebowitz', 'given': 'Barry D'}, {'family': 'McGrath', 'given': 'Patrick J'}, {'family': 'Rosenbaum', 'given': 'Jerrold F'}, {'family': 'Sackeim', 'given': 'Harold A'}, {'family': 'Kupfer', 'given': 'David J'}, {'family': 'Luther', 'given': 'James'}, {'family': 'Fava', 'given': 'Maurizio'}], 'doi': '10.1176/ajp.2006.163.11.1905', 'journal': 'American Journal of Psychiatry', 'organization': '', 'pages': '1905-1917', 'pmid': '17074942', 'title': 'Acute and longer-term outcomes in depressed outpatients requiring one or several treatment steps: a STAR*D report.', 'url': 'https://doi.org/10.1176/ajp.2006.163.11.1905', 'volume': '163', 'year': 2006} |
| `brown-1972-expressed-emotion` | primary-study | fulltext | {'authors': [{'family': 'Brown', 'given': 'G W'}, {'family': 'Birley', 'given': 'J L T'}, {'family': 'Wing', 'given': 'J K'}], 'doi': '10.1192/bjp.121.3.241', 'journal': 'The British Journal of Psychiatry', 'organization': '', 'pages': '241-258', 'pmid': '5073778', 'title': 'Influence of family life on the course of schizophrenic disorders: a replication.', 'url': 'https://doi.org/10.1192/bjp.121.3.241', 'volume': '121', 'year': 1972} |
| `bush-1996-catatonia-rating-scale` | primary-study | fulltext | {'authors': [{'family': 'Bush', 'given': 'G'}, {'family': 'Fink', 'given': 'M'}, {'family': 'Petrides', 'given': 'G'}, {'family': 'Dowling', 'given': 'F'}, {'family': 'Francis', 'given': 'A'}], 'doi': '10.1111/j.1600-0447.1996.tb09814.x', 'journal': 'Acta Psychiatrica Scandinavica', 'organization': '', 'pages': '129-136', 'pmid': '8686483', 'title': 'Catatonia. I. Rating scale and standardized examination.', 'url': 'https://doi.org/10.1111/j.1600-0447.1996.tb09814.x', 'volume': '93', 'year': 1996} |
| `wampold-1997-bona-fide-psychotherapies` | systematic-review | fulltext | {'authors': [{'family': 'Wampold', 'given': 'Bruce E.'}, {'family': 'Mondin', 'given': 'Gregory W.'}, {'family': 'Moody', 'given': 'Marcia'}, {'family': 'Stich', 'given': 'Frederick'}, {'family': 'Benson', 'given': 'Kurt'}, {'family': 'Ahn', 'given': 'Hyun-nie'}], 'doi': '10.1037/0033-2909.122.3.203', 'journal': 'Psychological Bulletin', 'organization': '', 'pages': '203-215', 'pmid': '', 'title': 'A meta-analysis of outcome studies comparing bona fide psychotherapies: Empirically, "all must have prizes."', 'url': 'https://doi.org/10.1037/0033-2909.122.3.203', 'volume': '122', 'year': 1997} |
| `linehan-1991-dbt` | primary-study | fulltext | {'authors': [{'family': 'Linehan', 'given': 'Marsha M.'}, {'family': 'Armstrong', 'given': 'Hubert E.'}, {'family': 'Suarez', 'given': 'Alejandra'}, {'family': 'Allmon', 'given': 'Douglas'}, {'family': 'Heard', 'given': 'Heidi L.'}], 'doi': '10.1001/archpsyc.1991.01810360024003', 'journal': 'Archives of General Psychiatry', 'organization': '', 'pages': '1060-1064', 'pmid': '1845222', 'title': 'Cognitive-Behavioral Treatment of Chronically Parasuicidal Borderline Patients', 'url': 'https://doi.org/10.1001/archpsyc.1991.01810360024003', 'volume': '48', 'year': 1991} |
| `pharoah-2010-family-intervention` | systematic-review | fulltext | {'authors': [{'family': 'Pharoah', 'given': 'Fiona'}, {'family': 'Mari', 'given': 'Jair'}, {'family': 'Rathbone', 'given': 'John'}, {'family': 'Wong', 'given': 'Winson'}], 'doi': '10.1002/14651858.cd000088.pub3', 'journal': 'Cochrane Database of Systematic Reviews', 'organization': '', 'pages': 'CD000088', 'pmid': '21154340', 'title': 'Family intervention for schizophrenia', 'url': 'https://doi.org/10.1002/14651858.cd000088.pub3', 'volume': '', 'year': 2010} |
| `march-2004-tads` | primary-study | fulltext | {'authors': [{'family': 'March', 'given': 'John'}, {'family': 'Silva', 'given': 'Susan'}, {'family': 'Petrycki', 'given': 'Stephen'}, {'family': 'Curry', 'given': 'John'}, {'family': 'Wells', 'given': 'Karen'}, {'family': 'Fairbank', 'given': 'John'}, {'family': 'Burns', 'given': 'Barbara'}, {'family': 'Domino', 'given': 'Marisa'}, {'family': 'McNulty', 'given': 'Steven'}, {'family': 'Vitiello', 'given': 'Benedetto'}, {'family': 'Severe', 'given': 'Joanne'}], 'doi': '10.1001/jama.292.7.807', 'journal': 'JAMA', 'organization': 'Treatment for Adolescents With Depression Study (TADS) Team', 'pages': '807-820', 'pmid': '15315995', 'title': 'Fluoxetine, Cognitive-Behavioral Therapy, and Their Combination for Adolescents With Depression: Treatment for Adolescents With Depression Study (TADS) Randomized Controlled Trial', 'url': 'https://doi.org/10.1001/jama.292.7.807', 'volume': '292', 'year': 2004} |
| `felitti-1998-ace` | primary-study | fulltext | {'authors': [{'family': 'Felitti', 'given': 'Vincent J.'}, {'family': 'Anda', 'given': 'Robert F.'}, {'family': 'Nordenberg', 'given': 'Dale'}, {'family': 'Williamson', 'given': 'David F.'}, {'family': 'Spitz', 'given': 'Alison M.'}, {'family': 'Edwards', 'given': 'Valerie'}, {'family': 'Koss', 'given': 'Mary P.'}, {'family': 'Marks', 'given': 'James S.'}], 'doi': '10.1016/s0749-3797(98)00017-8', 'journal': 'American Journal of Preventive Medicine', 'organization': '', 'pages': '245-258', 'pmid': '9635069', 'title': 'Relationship of Childhood Abuse and Household Dysfunction to Many of the Leading Causes of Death in Adults: The Adverse Childhood Experiences (ACE) Study', 'url': 'https://doi.org/10.1016/s0749-3797(98)00017-8', 'volume': '14', 'year': 1998} |
| `caspi-2003-5htt-stress` | primary-study | fulltext | {'authors': [{'family': 'Caspi', 'given': 'Avshalom'}, {'family': 'Sugden', 'given': 'Karen'}, {'family': 'Moffitt', 'given': 'Terrie E.'}, {'family': 'Taylor', 'given': 'Alan'}, {'family': 'Craig', 'given': 'Ian W.'}, {'family': 'Harrington', 'given': 'HonaLee'}, {'family': 'McClay', 'given': 'Joseph'}, {'family': 'Mill', 'given': 'Jonathan'}, {'family': 'Martin', 'given': 'Judy'}, {'family': 'Braithwaite', 'given': 'Antony'}, {'family': 'Poulton', 'given': 'Richie'}], 'doi': '10.1126/science.1083968', 'journal': 'Science', 'organization': '', 'pages': '386-389', 'pmid': '12869766', 'title': 'Influence of Life Stress on Depression: Moderation by a Polymorphism in the 5-HTT Gene', 'url': 'https://doi.org/10.1126/science.1083968', 'volume': '301', 'year': 2003} |
| `border-2019-candidate-gene` | primary-study | fulltext | {'authors': [{'family': 'Border', 'given': 'Richard'}, {'family': 'Johnson', 'given': 'Emma C.'}, {'family': 'Evans', 'given': 'Luke M.'}, {'family': 'Smolen', 'given': 'Andrew'}, {'family': 'Berley', 'given': 'Noah'}, {'family': 'Sullivan', 'given': 'Patrick F.'}, {'family': 'Keller', 'given': 'Matthew C.'}], 'doi': '10.1176/appi.ajp.2018.18070881', 'journal': 'American Journal of Psychiatry', 'organization': '', 'pages': '376-387', 'pmid': '30845820', 'title': 'No Support for Historical Candidate Gene or Candidate Gene-by-Interaction Hypotheses for Major Depression Across Multiple Large Samples', 'url': 'https://doi.org/10.1176/appi.ajp.2018.18070881', 'volume': '176', 'year': 2019} |
| `franklin-2017-suicide-risk-meta-analysis` | systematic-review | fulltext | {'authors': [{'family': 'Franklin', 'given': 'Joseph C.'}, {'family': 'Ribeiro', 'given': 'Jessica D.'}, {'family': 'Fox', 'given': 'Kathryn R.'}, {'family': 'Bentley', 'given': 'Kate H.'}, {'family': 'Kleiman', 'given': 'Evan M.'}, {'family': 'Huang', 'given': 'Xieyining'}, {'family': 'Musacchio', 'given': 'Katherine M.'}, {'family': 'Jaroszewski', 'given': 'Adam C.'}, {'family': 'Chang', 'given': 'Bernard P.'}, {'family': 'Nock', 'given': 'Matthew K.'}], 'doi': '10.1037/bul0000084', 'journal': 'Psychological Bulletin', 'organization': '', 'pages': '187-232', 'pmid': '27841450', 'title': 'Risk factors for suicidal thoughts and behaviors: A meta-analysis of 50 years of research.', 'url': 'https://doi.org/10.1037/bul0000084', 'volume': '143', 'year': 2017} |
| `volkow-2016-addiction-brain-disease` | other-authoritative | fulltext | {'authors': [{'family': 'Volkow', 'given': 'Nora D.'}, {'family': 'Koob', 'given': 'George F.'}, {'family': 'McLellan', 'given': 'A. Thomas'}], 'doi': '10.1056/nejmra1511480', 'journal': 'New England Journal of Medicine', 'organization': '', 'pages': '363-371', 'pmid': '26816013', 'title': 'Neurobiologic Advances from the Brain Disease Model of Addiction', 'url': 'https://doi.org/10.1056/nejmra1511480', 'volume': '374', 'year': 2016} |
| `fda-drug-safety` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'U.S. Food and Drug Administration', 'pages': '', 'pmid': '', 'title': 'FDA Drug Safety Communications', 'url': 'https://www.fda.gov/drugs/drug-safety-and-availability/drug-safety-communications', 'volume': '', 'year': 2026} |
| `clozapine-rems` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'U.S. Food and Drug Administration', 'pages': '', 'pmid': '', 'title': 'FDA Clozapine Safety / REMS Removed', 'url': 'https://www.fda.gov/drugs/drug-safety-communications/fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine', 'volume': '', 'year': 2025} |
| `spravato-rems` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'SPRAVATO REMS', 'pages': '', 'pmid': '', 'title': 'Spravato (esketamine) REMS', 'url': 'https://www.spravatorems.com/pdfs/REMSProgramOverview', 'volume': '', 'year': 2026} |
| `apa-practice-guidelines` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'American Psychiatric Association', 'pages': '', 'pmid': '', 'title': 'APA Practice Guidelines (index)', 'url': 'https://www.psychiatry.org/psychiatrists/practice/clinical-practice-guidelines', 'volume': '', 'year': 2026} |
| `dsm-5-tr` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'American Psychiatric Association Publishing', 'pages': '', 'pmid': '', 'title': 'DSM-5-TR (APPI)', 'url': 'https://www.appi.org/products/dsm', 'volume': '', 'year': 2022} |
| `uspstf-mental-health` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'U.S. Preventive Services Task Force', 'pages': '', 'pmid': '', 'title': 'USPSTF Recommendations (mental health topics)', 'url': 'https://www.uspreventiveservicestaskforce.org/uspstf/topic_search_results?topic_status=P', 'volume': '', 'year': 2026} |
| `samhsa-guidelines` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'Substance Abuse and Mental Health Services Administration', 'pages': '', 'pmid': '', 'title': 'SAMHSA Evidence-Based Practices Resource Center', 'url': 'https://www.samhsa.gov/libraries/evidence-based-practices-resource-center', 'volume': '', 'year': 2026} |
| `aacap-parameters` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'American Academy of Child and Adolescent Psychiatry', 'pages': '', 'pmid': '', 'title': 'AACAP Clinical Practice Guidelines / Practice Parameters', 'url': 'https://www.aacap.org/AACAP/Practice/Clinical%20Practice%20Guidelines/AACAP/Resources_for_Primary_Care/Practice_Parameters_and_Resource_Centers/Practice_Parameters.aspx', 'volume': '', 'year': 2026} |
| `canmat-isbd-bipolar-2018` | guideline | metadata | {'authors': [{'family': 'Yatham', 'given': 'LN'}, {'family': 'Kennedy', 'given': 'SH'}, {'family': 'Parikh', 'given': 'SV'}, {'family': 'et al.', 'given': ''}], 'doi': '10.1111/bdi.12609', 'journal': 'Bipolar Disorders', 'organization': 'Canadian Network for Mood and Anxiety Treatments / International Society for Bipolar Disorders', 'pages': '97-170', 'pmid': '29536616', 'title': 'Canadian Network for Mood and Anxiety Treatments (CANMAT) and International Society for Bipolar Disorders (ISBD) 2018 guidelines for the management of patients with bipolar disorder', 'url': 'https://pubmed.ncbi.nlm.nih.gov/29536616/', 'volume': '20', 'year': 2018} |
| `boyer-shannon-2005-serotonin-syndrome` | other-authoritative | fulltext | {'authors': [{'family': 'Boyer', 'given': 'Edward W'}, {'family': 'Shannon', 'given': 'Michael'}], 'doi': '10.1056/NEJMra041867', 'journal': 'The New England Journal of Medicine', 'organization': '', 'pages': '1112-1120', 'pmid': '15784664', 'title': 'The serotonin syndrome.', 'url': 'https://doi.org/10.1056/NEJMra041867', 'volume': '352', 'year': 2005} |
| `strawn-2007-neuroleptic-malignant-syndrome` | other-authoritative | fulltext | {'authors': [{'family': 'Strawn', 'given': 'Jeffrey R'}, {'family': 'Keck', 'given': 'Paul E'}, {'family': 'Caroff', 'given': 'Stanley N'}], 'doi': '10.1176/ajp.2007.164.6.870', 'journal': 'The American Journal of Psychiatry', 'organization': '', 'pages': '870-876', 'pmid': '17541044', 'title': 'Neuroleptic malignant syndrome.', 'url': 'https://doi.org/10.1176/ajp.2007.164.6.870', 'volume': '164', 'year': 2007} |
| `lima-2004-betablockers-akathisia` | systematic-review | fulltext | {'authors': [{'family': 'Lima', 'given': 'A R'}, {'family': 'Bacalcthuk', 'given': 'J'}, {'family': 'Barnes', 'given': 'T R E'}, {'family': 'Soares-Weiser', 'given': 'K'}], 'doi': '10.1002/14651858.CD001946.pub2', 'journal': 'Cochrane Database of Systematic Reviews', 'organization': '', 'pages': 'CD001946', 'pmid': '15495022', 'title': 'Central action beta-blockers versus placebo for neuroleptic-induced acute akathisia.', 'url': 'https://doi.org/10.1002/14651858.CD001946.pub2', 'volume': '2004', 'year': 2004} |
| `cipriani-2013-lithium-suicide` | systematic-review | fulltext | {'authors': [{'family': 'Cipriani', 'given': 'Andrea'}, {'family': 'Hawton', 'given': 'Keith'}, {'family': 'Stockton', 'given': 'Sarah'}, {'family': 'Geddes', 'given': 'John R'}], 'doi': '10.1136/bmj.f3646', 'journal': 'BMJ', 'organization': '', 'pages': 'f3646', 'pmid': '23814104', 'title': 'Lithium in the prevention of suicide in mood disorders: updated systematic review and meta-analysis.', 'url': 'https://doi.org/10.1136/bmj.f3646', 'volume': '346', 'year': 2013} |
| `apa-eating-disorders-2023` | guideline | fulltext | {'authors': [{'family': 'Crone', 'given': 'Catherine'}, {'family': 'Fochtmann', 'given': 'Laura J'}, {'family': 'Attia', 'given': 'Evelyn'}], 'doi': '10.1176/appi.ajp.23180001', 'journal': 'The American Journal of Psychiatry', 'organization': 'American Psychiatric Association', 'pages': '167-171', 'pmid': '36722117', 'title': 'The American Psychiatric Association Practice Guideline for the Treatment of Patients With Eating Disorders.', 'url': 'https://doi.org/10.1176/appi.ajp.23180001', 'volume': '180', 'year': 2023} |
| `schneider-2005-antipsychotic-dementia-mortality` | systematic-review | fulltext | {'authors': [{'family': 'Schneider', 'given': 'Lon S'}, {'family': 'Dagerman', 'given': 'Karen S'}, {'family': 'Insel', 'given': 'Philip'}], 'doi': '10.1001/jama.294.15.1934', 'journal': 'JAMA', 'organization': '', 'pages': '1934-1943', 'pmid': '16234500', 'title': 'Risk of death with atypical antipsychotic drug treatment for dementia: meta-analysis of randomized placebo-controlled trials.', 'url': 'https://doi.org/10.1001/jama.294.15.1934', 'volume': '294', 'year': 2005} |
| `mckeith-2017-dlb-consensus` | consensus | fulltext | {'authors': [{'family': 'McKeith', 'given': 'Ian G'}, {'family': 'Boeve', 'given': 'Bradley F'}, {'family': 'Dickson', 'given': 'Dennis W'}, {'family': 'Halliday', 'given': 'Glenda'}, {'family': 'Taylor', 'given': 'John-Paul'}], 'doi': '10.1212/WNL.0000000000004058', 'journal': 'Neurology', 'organization': 'DLB Consortium', 'pages': '88-100', 'pmid': '28592453', 'title': 'Diagnosis and management of dementia with Lewy bodies: Fourth consensus report of the DLB Consortium.', 'url': 'https://doi.org/10.1212/WNL.0000000000004058', 'volume': '89', 'year': 2017} |
| `nasreddine-2005-moca` | instrument | fulltext | {'authors': [{'family': 'Nasreddine', 'given': 'Ziad S'}, {'family': 'Phillips', 'given': 'Natalie A'}, {'family': 'Bédirian', 'given': 'Valérie'}, {'family': 'Charbonneau', 'given': 'Simon'}, {'family': 'Whitehead', 'given': 'Victor'}], 'doi': '10.1111/j.1532-5415.2005.53221.x', 'journal': 'Journal of the American Geriatrics Society', 'organization': '', 'pages': '695-699', 'pmid': '15817019', 'title': 'The Montreal Cognitive Assessment, MoCA: a brief screening tool for mild cognitive impairment.', 'url': 'https://doi.org/10.1111/j.1532-5415.2005.53221.x', 'volume': '53', 'year': 2005} |
| `wesseloo-2016-postpartum-relapse` | systematic-review | fulltext | {'authors': [{'family': 'Wesseloo', 'given': 'Richard'}, {'family': 'Kamperman', 'given': 'Astrid M'}, {'family': 'Munk-Olsen', 'given': 'Trine'}, {'family': 'Pop', 'given': 'Victor J M'}, {'family': 'Kushner', 'given': 'Steven A'}, {'family': 'Bergink', 'given': 'Veerle'}], 'doi': '10.1176/appi.ajp.2015.15010124', 'journal': 'The American Journal of Psychiatry', 'organization': '', 'pages': '117-127', 'pmid': '26514657', 'title': 'Risk of Postpartum Relapse in Bipolar Disorder and Postpartum Psychosis: A Systematic Review and Meta-Analysis.', 'url': 'https://doi.org/10.1176/appi.ajp.2015.15010124', 'volume': '173', 'year': 2016} |
| `vanderkruik-2017-postpartum-psychosis-prevalence` | systematic-review | fulltext | {'authors': [{'family': 'VanderKruik', 'given': 'Rachel'}, {'family': 'Barreix', 'given': 'Maria'}, {'family': 'Chou', 'given': 'Doris'}, {'family': 'Allen', 'given': 'Tomas'}, {'family': 'Say', 'given': 'Lale'}, {'family': 'Cohen', 'given': 'Lee S'}], 'doi': '10.1186/s12888-017-1427-7', 'journal': 'BMC Psychiatry', 'organization': '', 'pages': '272', 'pmid': '28754094', 'title': 'The global prevalence of postpartum psychosis: a systematic review.', 'url': 'https://doi.org/10.1186/s12888-017-1427-7', 'volume': '17', 'year': 2017} |
| `fda-prozac-label-maoi-switching` | other-authoritative | metadata | {'authors': [], 'doi': '', 'journal': '', 'organization': 'U.S. Food and Drug Administration', 'pages': '', 'pmid': '', 'title': 'PROZAC (fluoxetine) FDA-approved prescribing information, section 2.9: Switching a Patient To or From a Monoamine Oxidase Inhibitor (MAOI) Intended to Treat Psychiatric Disorders', 'url': 'https://api.fda.gov/drug/label.json?search=openfda.brand_name:%22PROZAC%22&limit=1', 'volume': '', 'year': 2026} |
| `fluckiger-2018` | systematic-review | metadata | {'authors': [{'family': 'Flückiger', 'given': 'C'}, {'family': 'Del', 'given': 'Re AC'}, {'family': 'Wampold', 'given': 'BE'}, {'family': 'Horvath', 'given': 'AO'}], 'doi': '10.1037/pst0000172', 'journal': 'Psychotherapy (Chic)', 'organization': '', 'pages': '316-340', 'pmid': '29792475', 'title': 'The alliance in adult psychotherapy: A meta-analytic synthesis', 'url': 'https://doi.org/10.1037/pst0000172', 'volume': '55', 'year': 2018} |
| `tetzlaff-2025` | systematic-review | metadata | {'authors': [{'family': 'Tetzlaff', 'given': 'M'}, {'family': 'Bruins', 'given': 'J'}, {'family': 'Castelein', 'given': 'S'}], 'doi': '10.1016/j.cpr.2025.102656', 'journal': 'Clin Psychol Rev', 'organization': '', 'pages': '102656', 'pmid': '41110399', 'title': 'Associated factors of the quality of therapeutic alliance in people with severe mental illnesses: A systematic review', 'url': 'https://doi.org/10.1016/j.cpr.2025.102656', 'volume': '122', 'year': 2025} |
| `huggett-2022` | systematic-review | metadata | {'authors': [{'family': 'Huggett', 'given': 'C'}, {'family': 'Gooding', 'given': 'P'}, {'family': 'Haddock', 'given': 'G'}, {'family': 'Quigley', 'given': 'J'}, {'family': 'Pratt', 'given': 'D'}], 'doi': '10.1002/cpp.2726', 'journal': 'Clin Psychol Psychother', 'organization': '', 'pages': '1203-1235', 'pmid': '35168297', 'title': 'The relationship between the therapeutic alliance in psychotherapy and suicidal experiences: A systematic review', 'url': 'https://doi.org/10.1002/cpp.2726', 'volume': '29', 'year': 2022} |
| `saxler-2024` | systematic-review | metadata | {'authors': [{'family': 'Saxler', 'given': 'E'}, {'family': 'Schindler', 'given': 'T'}, {'family': 'Philipsen', 'given': 'A'}, {'family': 'Schulze', 'given': 'M'}, {'family': 'Lux', 'given': 'S'}], 'doi': '10.3389/fpsyg.2024.1293851', 'journal': 'Front Psychol', 'organization': '', 'pages': '1293851', 'pmid': '38993343', 'title': 'Therapeutic alliance in individual adult psychotherapy: a systematic review of conceptualizations and measures for face-to-face- and online-psychotherapy', 'url': 'https://doi.org/10.3389/fpsyg.2024.1293851', 'volume': '15', 'year': 2024} |
| `huggett-2024` | systematic-review | metadata | {'authors': [{'family': 'Huggett', 'given': 'C'}, {'family': 'Peters', 'given': 'S'}, {'family': 'Gooding', 'given': 'P'}, {'family': 'Berry', 'given': 'N'}, {'family': 'Pratt', 'given': 'D'}], 'doi': '10.1016/j.cpr.2024.102469', 'journal': 'Clin Psychol Rev', 'organization': '', 'pages': '102469', 'pmid': '39098267', 'title': 'A systematic review and meta-ethnography of client and therapist perspectives of the therapeutic alliance in the context of psychotherapy and suicidal experiences', 'url': 'https://doi.org/10.1016/j.cpr.2024.102469', 'volume': '113', 'year': 2024} |
| `difronzo-2025` | primary-study | metadata | {'authors': [{'family': 'Difronzo', 'given': 'MJ'}, {'family': 'Thackeray', 'given': 'L'}, {'family': "O'Keeffe", 'given': 'S'}, {'family': 'Calderon', 'given': 'A'}, {'family': 'Midgley', 'given': 'N'}], 'doi': '10.4081/ripppo.2025.841', 'journal': 'Res Psychother', 'organization': '', 'pages': '', 'pmid': '40471224', 'title': '"Maybe you don\'t know what answers I want": unresolved alliance ruptures preceding dropout in short-term psychoanalytic psychotherapy with depressed adolescents', 'url': 'https://doi.org/10.4081/ripppo.2025.841', 'volume': '28', 'year': 2025} |
| `man-2023` | systematic-review | metadata | {'authors': [{'family': 'Man', 'given': 'H'}, {'family': 'Wood', 'given': 'L'}, {'family': 'Glover', 'given': 'N'}], 'doi': '10.1002/cpp.2780', 'journal': 'Clin Psychol Psychother', 'organization': '', 'pages': '24-37', 'pmid': '35997039', 'title': 'A systematic review and narrative synthesis of indirect psychological intervention in acute mental health inpatient settings', 'url': 'https://doi.org/10.1002/cpp.2780', 'volume': '30', 'year': 2023} |
| `schefft-2019` | systematic-review | metadata | {'authors': [{'family': 'Schefft', 'given': 'C'}, {'family': 'Guhn', 'given': 'A'}, {'family': 'Brakemeier', 'given': 'EL'}, {'family': 'Sterzer', 'given': 'P'}, {'family': 'Köhler', 'given': 'S'}], 'doi': '10.1111/acps.12995', 'journal': 'Acta Psychiatr Scand', 'organization': '', 'pages': '322-335', 'pmid': '30520019', 'title': 'Efficacy of inpatient psychotherapy for major depressive disorder: a meta-analysis of controlled trials', 'url': 'https://doi.org/10.1111/acps.12995', 'volume': '139', 'year': 2019} |
| `cohen-chazani-2022` | systematic-review | metadata | {'authors': [{'family': 'Cohen-Chazani', 'given': 'Y'}, {'family': 'Lavidor', 'given': 'M'}, {'family': 'Gilboa-Schechtman', 'given': 'E'}, {'family': 'Roe', 'given': 'D'}, {'family': 'Hasson-Ohayon', 'given': 'I'}], 'doi': '10.1080/00332747.2022.2062660', 'journal': 'Psychiatry', 'organization': '', 'pages': '399-417', 'pmid': '35442174', 'title': 'Meta-Analysis of the Effect of Psychotherapy in an Inpatient Setting: Examining the Moderating Role of Diagnosis and Therapeutic Approach', 'url': 'https://doi.org/10.1080/00332747.2022.2062660', 'volume': '85', 'year': 2022} |
| `cuijpers-2026` | systematic-review | metadata | {'authors': [{'family': 'Cuijpers', 'given': 'P'}, {'family': 'Ciharova', 'given': 'M'}, {'family': 'Tong', 'given': 'L'}, {'family': 'Liu', 'given': 'Y'}, {'family': 'Sprenger', 'given': 'AA'}, {'family': 'Miguel', 'given': 'C'}, {'family': 'Karyotaki', 'given': 'E'}, {'family': 'Harrer', 'given': 'M'}], 'doi': '10.1016/j.cpr.2026.102783', 'journal': 'Clin Psychol Rev', 'organization': '', 'pages': '102783', 'pmid': '42492146', 'title': 'Behavioral activation for depression: A comprehensive systematic review and meta-analysis', 'url': 'https://doi.org/10.1016/j.cpr.2026.102783', 'volume': '128', 'year': 2026} |
| `cuijpers-2007` | systematic-review | metadata | {'authors': [{'family': 'Cuijpers', 'given': 'P'}, {'family': 'van', 'given': 'Straten A'}, {'family': 'Warmerdam', 'given': 'L'}], 'doi': '10.1016/j.cpr.2006.11.001', 'journal': 'Clin Psychol Rev', 'organization': '', 'pages': '318-326', 'pmid': '17184887', 'title': 'Behavioral activation treatments of depression: a meta-analysis', 'url': 'https://doi.org/10.1016/j.cpr.2006.11.001', 'volume': '27', 'year': 2007} |
| `ciharova-2021` | systematic-review | metadata | {'authors': [{'family': 'Ciharova', 'given': 'M'}, {'family': 'Furukawa', 'given': 'TA'}, {'family': 'Efthimiou', 'given': 'O'}, {'family': 'Karyotaki', 'given': 'E'}, {'family': 'Miguel', 'given': 'C'}, {'family': 'Noma', 'given': 'H'}, {'family': 'Cipriani', 'given': 'A'}, {'family': 'Riper', 'given': 'H'}, {'family': 'Cuijpers', 'given': 'P'}], 'doi': '10.1037/ccp0000654', 'journal': 'J Consult Clin Psychol', 'organization': '', 'pages': '563-574', 'pmid': '34264703', 'title': 'Cognitive restructuring, behavioral activation and cognitive-behavioral therapy in the treatment of adult depression: A network meta-analysis', 'url': 'https://doi.org/10.1037/ccp0000654', 'volume': '89', 'year': 2021} |
| `simmonds-buckley-2019` | systematic-review | metadata | {'authors': [{'family': 'Simmonds-Buckley', 'given': 'M'}, {'family': 'Kellett', 'given': 'S'}, {'family': 'Waller', 'given': 'G'}], 'doi': '10.1016/j.beth.2019.01.003', 'journal': 'Behav Ther', 'organization': '', 'pages': '864-885', 'pmid': '31422844', 'title': 'Acceptability and Efficacy of Group Behavioral Activation for Depression Among Adults: A Meta-Analysis', 'url': 'https://doi.org/10.1016/j.beth.2019.01.003', 'volume': '50', 'year': 2019} |
| `pott-2022` | systematic-review | metadata | {'authors': [{'family': 'Pott', 'given': 'SL'}, {'family': 'Delgadillo', 'given': 'J'}, {'family': 'Kellett', 'given': 'S'}], 'doi': '10.1016/j.jsat.2021.108478', 'journal': 'J Subst Abuse Treat', 'organization': '', 'pages': '108478', 'pmid': '34146994', 'title': 'Is behavioral activation an effective and acceptable treatment for co-occurring depression and substance use disorders? A meta-analysis of randomized controlled trials', 'url': 'https://doi.org/10.1016/j.jsat.2021.108478', 'volume': '132', 'year': 2022} |
| `stanley-brown-2018` | primary-study | metadata | {'authors': [{'family': 'Stanley', 'given': 'B'}, {'family': 'Brown', 'given': 'GK'}, {'family': 'Brenner', 'given': 'LA'}, {'family': 'Galfalvy', 'given': 'HC'}, {'family': 'Currier', 'given': 'GW'}, {'family': 'Knox', 'given': 'KL'}, {'family': 'Chaudhury', 'given': 'SR'}, {'family': 'Bush', 'given': 'AL'}, {'family': 'Green', 'given': 'KL'}], 'doi': '10.1001/jamapsychiatry.2018.1776', 'journal': 'JAMA Psychiatry', 'organization': '', 'pages': '894-900', 'pmid': '29998307', 'title': 'Comparison of the Safety Planning Intervention With Follow-up vs Usual Care of Suicidal Patients Treated in the Emergency Department', 'url': 'https://doi.org/10.1001/jamapsychiatry.2018.1776', 'volume': '75', 'year': 2018} |
| `steeg-2025` | systematic-review | metadata | {'authors': [{'family': 'Steeg', 'given': 'S'}, {'family': 'Ledden', 'given': 'S'}, {'family': 'Marzano', 'given': 'L'}, {'family': 'Dutta', 'given': 'R'}, {'family': 'Quinlivan', 'given': 'L'}, {'family': 'Kapur', 'given': 'N'}, {'family': 'John', 'given': 'A'}, {'family': 'Webb', 'given': 'RT'}], 'doi': '10.1136/bmjment-2025-302069', 'journal': 'BMJ Ment Health', 'organization': '', 'pages': '', 'pmid': '41365522', 'title': 'Effectiveness of suicide means restriction: an overview of systematic reviews', 'url': 'https://doi.org/10.1136/bmjment-2025-302069', 'volume': '28', 'year': 2025} |
| `shank-2026` | systematic-review | metadata | {'authors': [{'family': 'Shank', 'given': 'LM'}, {'family': 'Smolenski', 'given': 'DJ'}, {'family': 'Boyd', 'given': 'C'}, {'family': 'Bellanti', 'given': 'DM'}, {'family': 'Nair', 'given': 'R'}, {'family': 'Cowansage', 'given': 'K'}, {'family': 'Libretto', 'given': 'S'}, {'family': 'Frazier', 'given': 'K'}, {'family': 'Evatt', 'given': 'DP'}, {'family': 'Kelber', 'given': 'MS'}], 'doi': '10.1136/ip-2024-045611', 'journal': 'Inj Prev', 'organization': '', 'pages': '7-15', 'pmid': '40185617', 'title': 'Systematic review of the impact of interventions changing access to lethal means on suicide attempts and deaths', 'url': 'https://doi.org/10.1136/ip-2024-045611', 'volume': '32', 'year': 2026} |
| `penzenik-2026` | primary-study | metadata | {'authors': [{'family': 'Penzenik', 'given': 'ME'}, {'family': 'Schneider', 'given': 'AL'}, {'family': 'Hoffmire', 'given': 'CA'}, {'family': 'Sells', 'given': 'JR'}, {'family': 'Stearns-Yoder', 'given': 'KA'}, {'family': 'Brenner', 'given': 'LA'}], 'doi': '10.1111/jrh.70103', 'journal': 'J Rural Health', 'organization': '', 'pages': 'e70103', 'pmid': '41588871', 'title': "Rural community members' experiences and perceptions regarding lethal means safety in the context of suicide and accidental death rates", 'url': 'https://doi.org/10.1111/jrh.70103', 'volume': '42', 'year': 2026} |
| `varese-2025` | systematic-review | metadata | {'authors': [{'family': 'Varese', 'given': 'F'}, {'family': 'Sudell', 'given': 'M'}, {'family': 'Morrison', 'given': 'AP'}, {'family': 'Longden', 'given': 'E'}, {'family': 'Tudur', 'given': 'Smith C'}], 'doi': '10.3310/ncfr5074', 'journal': 'Health Technol Assess', 'organization': '', 'pages': '1-115', 'pmid': '41217072', 'title': 'Treatment effect modifiers of cognitive behaviour therapy in people with psychosis: an individual participant data meta-analysis of RCTs', 'url': 'https://doi.org/10.3310/ncfr5074', 'volume': '29', 'year': 2025} |
| `hong-2025` | systematic-review | metadata | {'authors': [{'family': 'Hong', 'given': 'Y'}, {'family': 'Chen', 'given': 'Y'}, {'family': 'Bai', 'given': 'Y'}, {'family': 'Tan', 'given': 'W'}], 'doi': '10.1371/journal.pone.0324685', 'journal': 'PLoS One', 'organization': '', 'pages': 'e0324685', 'pmid': '40392926', 'title': 'Cognitive-behavioral therapy for the improvement of negative symptoms and functioning in schizophrenia: A systematic review and meta-analysis of randomized controlled trials', 'url': 'https://doi.org/10.1371/journal.pone.0324685', 'volume': '20', 'year': 2025} |
| `tarrier-wykes-2004` | systematic-review | metadata | {'authors': [{'family': 'Tarrier', 'given': 'N'}, {'family': 'Wykes', 'given': 'T'}], 'doi': '10.1016/j.brat.2004.06.020', 'journal': 'Behav Res Ther', 'organization': '', 'pages': '1377-1401', 'pmid': '15500811', 'title': 'Is there evidence that cognitive behaviour therapy is an effective treatment for schizophrenia? A cautious or cautionary tale?', 'url': 'https://doi.org/10.1016/j.brat.2004.06.020', 'volume': '42', 'year': 2004} |
| `links-ross-2025` | other-authoritative | metadata | {'authors': [{'family': 'Links', 'given': 'PS'}, {'family': 'Ross', 'given': 'J'}], 'doi': '10.1176/appi.psychotherapy.20230044', 'journal': 'Am J Psychother', 'organization': '', 'pages': '4-10', 'pmid': '38952224', 'title': 'Good Psychiatric Management of Borderline Personality Disorder: Foundations and Future Challenges', 'url': 'https://doi.org/10.1176/appi.psychotherapy.20230044', 'volume': '78', 'year': 2025} |
| `wibbelink-2026` | primary-study | metadata | {'authors': [{'family': 'Wibbelink', 'given': 'CJM'}, {'family': 'Kamphuis', 'given': 'JH'}, {'family': 'Sinnaeve', 'given': 'R'}, {'family': 'Grasman', 'given': 'RPPP'}, {'family': 'Alberts', 'given': 'J'}, {'family': 'Alkema', 'given': 'M'}, {'family': 'Dek', 'given': 'ECP'}, {'family': 'Hupkes', 'given': 'M'}, {'family': 'James', 'given': 'C'}, {'family': 'Koppeschaar', 'given': 'AM'}, {'family': 'Ploegmakers', 'given': 'M'}, {'family': 'Schuur', 'given': 'RJ'}, {'family': 'van', 'given': 'Vliet M'}, {'family': 'Arntz', 'given': 'A'}], 'doi': '10.1001/jamapsychiatry.2026.0418', 'journal': 'JAMA Psychiatry', 'organization': '', 'pages': '669-681', 'pmid': '42018336', 'title': 'Dialectical Behavior Therapy vs Schema Therapy for Patients With Borderline Personality Disorder: The BOOTS Multicenter Randomized Clinical Trial', 'url': 'https://doi.org/10.1001/jamapsychiatry.2026.0418', 'volume': '83', 'year': 2026} |
| `brodsky-2025` | primary-study | metadata | {'authors': [{'family': 'Brodsky', 'given': 'BS'}, {'family': 'Galfalvy', 'given': 'H'}, {'family': 'Mann', 'given': 'JJ'}, {'family': 'Grunebaum', 'given': 'MF'}, {'family': 'Stanley', 'given': 'B'}], 'doi': '10.1176/appi.ajp.20240298', 'journal': 'Am J Psychiatry', 'organization': '', 'pages': '1083-1092', 'pmid': '41190740', 'title': 'Dialectical Behavior Therapy Versus Serotonin Reuptake Inhibitor Treatment for Suicidal Behavior in Borderline Personality Disorder: A Randomized Controlled Trial', 'url': 'https://doi.org/10.1176/appi.ajp.20240298', 'volume': '182', 'year': 2025} |
| `arqueros-2026` | systematic-review | metadata | {'authors': [{'family': 'Arqueros', 'given': 'M'}, {'family': 'Soler', 'given': 'J'}, {'family': 'Pascual', 'given': 'JC'}], 'doi': '10.1037/per0000774', 'journal': 'Personal Disord', 'organization': '', 'pages': '', 'pmid': '42275028', 'title': 'Stand-alone dialectical behavior therapy skills training for borderline personality disorder: A systematic review and meta-analysis', 'url': 'https://doi.org/10.1037/per0000774', 'volume': '', 'year': 2026} |
| `appel-2026` | other-authoritative | metadata | {'authors': [{'family': 'Appel', 'given': 'G'}, {'family': 'Arac-Orhun', 'given': 'S'}, {'family': 'Hersh', 'given': 'R'}], 'doi': '10.1521/pdps.2026.54.1.97', 'journal': 'Psychodyn Psychiatry', 'organization': '', 'pages': '97-109', 'pmid': '41849148', 'title': 'Guidance for Family Engagement With Patients With Borderline Personality Disorder: Integrating Principles From Transference-Focused Psychotherapy and Good Psychiatric Management', 'url': 'https://doi.org/10.1521/pdps.2026.54.1.97', 'volume': '54', 'year': 2026} |
| `ma-2021` | systematic-review | metadata | {'authors': [{'family': 'Ma', 'given': 'CF'}, {'family': 'Chan', 'given': 'SKW'}, {'family': 'Chung', 'given': 'YL'}, {'family': 'Ng', 'given': 'SM'}, {'family': 'Hui', 'given': 'CLM'}, {'family': 'Suen', 'given': 'YN'}, {'family': 'Chen', 'given': 'EYH'}], 'doi': '10.1017/S0033291721000209', 'journal': 'Psychol Med', 'organization': '', 'pages': '365-375', 'pmid': '33568244', 'title': 'The predictive power of expressed emotion and its components in relapse of schizophrenia: a meta-analysis and meta-regression', 'url': 'https://doi.org/10.1017/S0033291721000209', 'volume': '51', 'year': 2021} |
| `camacho-gomez-2020` | systematic-review | metadata | {'authors': [{'family': 'Camacho-Gomez', 'given': 'M'}, {'family': 'Castellvi', 'given': 'P'}], 'doi': '10.1093/schbul/sbz038', 'journal': 'Schizophr Bull', 'organization': '', 'pages': '98-109', 'pmid': '31050757', 'title': 'Effectiveness of Family Intervention for Preventing Relapse in First-Episode Psychosis Until 24 Months of Follow-up: A Systematic Review With Meta-analysis of Randomized Controlled Trials', 'url': 'https://doi.org/10.1093/schbul/sbz038', 'volume': '46', 'year': 2020} |
| `schwenker-2023` | systematic-review | metadata | {'authors': [{'family': 'Schwenker', 'given': 'R'}, {'family': 'Dietrich', 'given': 'CE'}, {'family': 'Hirpa', 'given': 'S'}, {'family': 'Nothacker', 'given': 'M'}, {'family': 'Smedslund', 'given': 'G'}, {'family': 'Frese', 'given': 'T'}, {'family': 'Unverzagt', 'given': 'S'}], 'doi': '10.1002/14651858.CD008063.pub3', 'journal': 'Cochrane Database Syst Rev', 'organization': '', 'pages': 'CD008063', 'pmid': '38084817', 'title': 'Motivational interviewing for substance use reduction', 'url': 'https://doi.org/10.1002/14651858.CD008063.pub3', 'volume': '12', 'year': 2023} |
| `bastos-maia-2025` | systematic-review | metadata | {'authors': [{'family': 'Bastos', 'given': 'Maia M'}, {'family': 'Martins', 'given': 'PM'}, {'family': 'Figueiredo-Braga', 'given': 'M'}], 'doi': '10.1080/15504263.2024.2434218', 'journal': 'J Dual Diagn', 'organization': '', 'pages': '56-69', 'pmid': '39798118', 'title': 'Outcomes and Challenges of Motivational Interviewing in Dual Diagnosis Treatment-A Systematic Review', 'url': 'https://doi.org/10.1080/15504263.2024.2434218', 'volume': '21', 'year': 2025} |
| `ferguson-2026` | systematic-review | metadata | {'authors': [{'family': 'Ferguson', 'given': 'M'}, {'family': 'Loughhead', 'given': 'M'}, {'family': 'McIntyre', 'given': 'H'}, {'family': 'Procter', 'given': 'N'}], 'doi': '10.1027/0227-5910/a001031', 'journal': 'Crisis', 'organization': '', 'pages': '41-52', 'pmid': '41267566', 'title': 'Trauma-Informed Approaches to Suicide Prevention', 'url': 'https://doi.org/10.1027/0227-5910/a001031', 'volume': '47', 'year': 2026} |
| `goldstein-2024` | systematic-review | metadata | {'authors': [{'family': 'Goldstein', 'given': 'E'}, {'family': 'Chokshi', 'given': 'B'}, {'family': 'Melendez-Torres', 'given': 'GJ'}, {'family': 'Rios', 'given': 'A'}, {'family': 'Jelley', 'given': 'M'}, {'family': "Lewis-O'Connor", 'given': 'A'}], 'doi': '10.7812/TPP/23.127', 'journal': 'Perm J', 'organization': '', 'pages': '135-150', 'pmid': '38444328', 'title': 'Effectiveness of Trauma-Informed Care Implementation in Health Care Settings: Systematic Review of Reviews and Realist Synthesis', 'url': 'https://doi.org/10.7812/TPP/23.127', 'volume': '28', 'year': 2024} |
| `mahon-2024` | systematic-review | metadata | {'authors': [{'family': 'Mahon', 'given': 'D'}], 'doi': '10.1007/s10597-024-01317-z', 'journal': 'Community Ment Health J', 'organization': '', 'pages': '1627-1651', 'pmid': '39046622', 'title': 'An Umbrella Review of Systematic Reviews on Trauma Informed Approaches', 'url': 'https://doi.org/10.1007/s10597-024-01317-z', 'volume': '60', 'year': 2024} |
| `hajek-gross-2024` | systematic-review | metadata | {'authors': [{'family': 'Hajek', 'given': 'Gross C'}, {'family': 'Oehlke', 'given': 'SM'}, {'family': 'Prillinger', 'given': 'K'}, {'family': 'Goreis', 'given': 'A'}, {'family': 'Plener', 'given': 'PL'}, {'family': 'Kothgassner', 'given': 'OD'}], 'doi': '10.1111/sltb.13044', 'journal': 'Suicide Life Threat Behav', 'organization': '', 'pages': '317-337', 'pmid': '38279664', 'title': 'Efficacy of mentalization-based therapy in treating self-harm: A systematic review and meta-analysis', 'url': 'https://doi.org/10.1111/sltb.13044', 'volume': '54', 'year': 2024} |
| `wienicke-2023` | systematic-review | metadata | {'authors': [{'family': 'Wienicke', 'given': 'FJ'}, {'family': 'Beutel', 'given': 'ME'}, {'family': 'Zwerenz', 'given': 'R'}, {'family': 'Brähler', 'given': 'E'}, {'family': 'Fonagy', 'given': 'P'}, {'family': 'Luyten', 'given': 'P'}, {'family': 'Constantinou', 'given': 'M'}, {'family': 'Barber', 'given': 'JP'}, {'family': 'McCarthy', 'given': 'KS'}, {'family': 'Solomonov', 'given': 'N'}, {'family': 'Cooper', 'given': 'PJ'}, {'family': 'De', 'given': 'Pascalis L'}, {'family': 'Johansson', 'given': 'R'}, {'family': 'Andersson', 'given': 'G'}, {'family': 'Lemma', 'given': 'A'}, {'family': 'Town', 'given': 'JM'}, {'family': 'Abbass', 'given': 'AA'}, {'family': 'Ajilchi', 'given': 'B'}, {'family': 'Connolly', 'given': 'Gibbons MB'}, {'family': 'López-Rodríguez', 'given': 'J'}, {'family': 'Villamil-Salcedo', 'given': 'V'}, {'family': 'Maina', 'given': 'G'}, {'family': 'Rosso', 'given': 'G'}, {'family': 'Twisk', 'given': 'JWR'}, {'family': 'Burk', 'given': 'WJ'}, {'family': 'Spijker', 'given': 'J'}, {'family': 'Cuijpers', 'given': 'P'}, {'family': 'Driessen', 'given': 'E'}], 'doi': '10.1016/j.cpr.2023.102269', 'journal': 'Clin Psychol Rev', 'organization': '', 'pages': '102269', 'pmid': '36958077', 'title': 'Efficacy and moderators of short-term psychodynamic psychotherapy for depression: A systematic review and meta-analysis of individual participant data', 'url': 'https://doi.org/10.1016/j.cpr.2023.102269', 'volume': '101', 'year': 2023} |
| `driessen-2023` | systematic-review | metadata | {'authors': [{'family': 'Driessen', 'given': 'E'}, {'family': 'Fokkema', 'given': 'M'}, {'family': 'Dekker', 'given': 'JJM'}, {'family': 'Peen', 'given': 'J'}, {'family': 'Van', 'given': 'HL'}, {'family': 'Maina', 'given': 'G'}, {'family': 'Rosso', 'given': 'G'}, {'family': 'Rigardetto', 'given': 'S'}, {'family': 'Cuniberti', 'given': 'F'}, {'family': 'Vitriol', 'given': 'VG'}, {'family': 'Andreoli', 'given': 'A'}, {'family': 'Burnand', 'given': 'Y'}, {'family': 'López', 'given': 'Rodríguez J'}, {'family': 'Villamil', 'given': 'Salcedo V'}, {'family': 'Twisk', 'given': 'JWR'}, {'family': 'Wienicke', 'given': 'FJ'}, {'family': 'Cuijpers', 'given': 'P'}], 'doi': '10.1017/S0033291722003270', 'journal': 'Psychol Med', 'organization': '', 'pages': '6090-6101', 'pmid': '36404677', 'title': 'Which patients benefit from adding short-term psychodynamic psychotherapy to antidepressants in the treatment of depression? A systematic review and meta-analysis of individual participant data', 'url': 'https://doi.org/10.1017/S0033291722003270', 'volume': '53', 'year': 2023} |
| `statpearls-mcp-2026` | other-authoritative | metadata | {'authors': [{'family': 'Gunturu', 'given': 'S'}, {'family': 'McGee', 'given': 'M'}, {'family': 'Javaid', 'given': 'A'}], 'doi': '', 'journal': '', 'organization': 'StatPearls Publishing', 'pages': '', 'pmid': '42207918', 'title': 'Meaning-Centered Psychotherapy', 'url': 'https://pubmed.ncbi.nlm.nih.gov/42207918/', 'volume': '', 'year': 2026} |
| `abbass-2020` | systematic-review | metadata | {'authors': [{'family': 'Abbass', 'given': 'A'}, {'family': 'Town', 'given': 'J'}, {'family': 'Holmes', 'given': 'H'}, {'family': 'Luyten', 'given': 'P'}, {'family': 'Cooper', 'given': 'A'}, {'family': 'Russell', 'given': 'L'}, {'family': 'Lumley', 'given': 'MA'}, {'family': 'Schubiner', 'given': 'H'}, {'family': 'Allinson', 'given': 'J'}, {'family': 'Bernier', 'given': 'D'}, {'family': 'De', 'given': 'Meulemeester C'}, {'family': 'Kroenke', 'given': 'K'}, {'family': 'Kisely', 'given': 'S'}], 'doi': '10.1159/000507738', 'journal': 'Psychother Psychosom', 'organization': '', 'pages': '363-370', 'pmid': '32428905', 'title': 'Short-Term Psychodynamic Psychotherapy for Functional Somatic Disorders: A Meta-Analysis of Randomized Controlled Trials', 'url': 'https://doi.org/10.1159/000507738', 'volume': '89', 'year': 2020} |
| `modini-large-2026` | other-authoritative | metadata | {'authors': [{'family': 'Modini', 'given': 'M'}, {'family': 'Large', 'given': 'M'}], 'doi': '10.1177/10398562261425069', 'journal': 'Australas Psychiatry', 'organization': '', 'pages': '227-230', 'pmid': '41664893', 'title': 'Understanding the suicide rate post-discharge from a psychiatric hospital: Time for a rethink', 'url': 'https://doi.org/10.1177/10398562261425069', 'volume': '34', 'year': 2026} |
| `diefenbach-2025` | primary-study | metadata | {'authors': [{'family': 'Diefenbach', 'given': 'GJ'}, {'family': 'Collett', 'given': 'S'}, {'family': 'Black', 'given': 'S'}, {'family': 'Rudd', 'given': 'MD'}, {'family': 'Gueorguieva', 'given': 'R'}, {'family': 'Tolin', 'given': 'DF'}], 'doi': '10.1016/j.genhosppsych.2025.01.007', 'journal': 'Gen Hosp Psychiatry', 'organization': '', 'pages': '73-79', 'pmid': '39837259', 'title': 'The effect of inpatient brief cognitive-behavioral therapy for suicide prevention on post-discharge emergency department utilization: Secondary analysis of a randomized clinical trial', 'url': 'https://doi.org/10.1016/j.genhosppsych.2025.01.007', 'volume': '93', 'year': 2025} |
| `steinberg-2024` | primary-study | metadata | {'authors': [{'family': 'Steinberg', 'given': 'R'}, {'family': 'Amini', 'given': 'J'}, {'family': 'Sinyor', 'given': 'M'}, {'family': 'Mitchell', 'given': 'RHB'}, {'family': 'Schaffer', 'given': 'A'}], 'doi': '10.1111/sltb.13108', 'journal': 'Suicide Life Threat Behav', 'organization': '', 'pages': '1041-1052', 'pmid': '38934489', 'title': 'Implementation of caring contacts using patient feedback to reduce suicide-related outcomes following psychiatric hospitalization', 'url': 'https://doi.org/10.1111/sltb.13108', 'volume': '54', 'year': 2024} |
| `schunemann-2025` | systematic-review | metadata | {'authors': [{'family': 'Schünemann', 'given': 'O'}, {'family': 'Jansen', 'given': 'A'}, {'family': 'Willutzki', 'given': 'U'}, {'family': 'Heinrichs', 'given': 'N'}], 'doi': '10.32872/cpe.9709', 'journal': 'Clin Psychol Eur', 'organization': '', 'pages': 'e9709', 'pmid': '40177337', 'title': 'Allegiance and Treatment Quality as Moderators of the Comparative Effectiveness of Psychotherapy? A Systematic Review and Meta-Analysis of Studies Comparing Humanistic Psychotherapy to Other Psychotherapy Approaches', 'url': 'https://doi.org/10.32872/cpe.9709', 'volume': '7', 'year': 2025} |
| `desalve-2025` | systematic-review | metadata | {'authors': [{'family': 'De', 'given': 'Salve F'}, {'family': 'Rossi', 'given': 'C'}, {'family': 'Gioacchini', 'given': 'E'}, {'family': 'Messina', 'given': 'I'}, {'family': 'Oasi', 'given': 'O'}], 'doi': '10.1002/cpp.70080', 'journal': 'Clin Psychol Psychother', 'organization': '', 'pages': 'e70080', 'pmid': '40325843', 'title': 'Dropout in Psychotherapy for Personality Disorders: A Systematic Review of Predictors', 'url': 'https://doi.org/10.1002/cpp.70080', 'volume': '32', 'year': 2025} |
| `xia-2011` | systematic-review | metadata | {'authors': [{'family': 'Xia', 'given': 'J'}, {'family': 'Merinder', 'given': 'LB'}, {'family': 'Belgamwar', 'given': 'MR'}], 'doi': '10.1002/14651858.CD002831.pub2', 'journal': 'Cochrane Database Syst Rev', 'organization': '', 'pages': 'CD002831', 'pmid': '21678337', 'title': 'Psychoeducation for schizophrenia', 'url': 'https://doi.org/10.1002/14651858.CD002831.pub2', 'volume': '2011', 'year': 2011} |
| `kleiman-2026` | other-authoritative | metadata | {'authors': [{'family': 'Kleiman', 'given': 'EM'}, {'family': 'Hawes-Sousa', 'given': 'MT'}, {'family': 'Rizvi', 'given': 'SL'}, {'family': 'Nock', 'given': 'MK'}], 'doi': '10.1001/jamapsychiatry.2026.0443', 'journal': 'JAMA Psychiatry', 'organization': '', 'pages': '559-560', 'pmid': '42018314', 'title': 'Updating Psychological Treatment During Inpatient Psychiatric Care', 'url': 'https://doi.org/10.1001/jamapsychiatry.2026.0443', 'volume': '83', 'year': 2026} |
| `diefenbach-2024-primary` | primary-study | metadata | {'authors': [{'family': 'Diefenbach', 'given': 'GJ'}, {'family': 'Lord', 'given': 'KA'}, {'family': 'Stubbing', 'given': 'J'}, {'family': 'Rudd', 'given': 'MD'}, {'family': 'Levy', 'given': 'HC'}, {'family': 'Worden', 'given': 'B'}, {'family': 'Sain', 'given': 'KS'}, {'family': 'Bimstein', 'given': 'JG'}, {'family': 'Rice', 'given': 'TB'}, {'family': 'Everhardt', 'given': 'K'}, {'family': 'Gueorguieva', 'given': 'R'}, {'family': 'Tolin', 'given': 'DF'}], 'doi': '10.1001/jamapsychiatry.2024.2349', 'journal': 'JAMA Psychiatry', 'organization': '', 'pages': '1177-1186', 'pmid': '39259550', 'title': 'Brief Cognitive Behavioral Therapy for Suicidal Inpatients: A Randomized Clinical Trial', 'url': 'https://doi.org/10.1001/jamapsychiatry.2024.2349', 'volume': '81', 'year': 2024} |
| `kearns-2025` | primary-study | metadata | {'authors': [{'family': 'Kearns', 'given': 'JC'}, {'family': 'Crasta', 'given': 'D'}, {'family': 'Spitzer', 'given': 'EG'}, {'family': 'Gorman', 'given': 'KR'}, {'family': 'Green', 'given': 'JD'}, {'family': 'Nock', 'given': 'MK'}, {'family': 'Keane', 'given': 'TM'}, {'family': 'Marx', 'given': 'BP'}, {'family': 'Britton', 'given': 'PC'}], 'doi': '10.1016/j.beth.2024.08.001', 'journal': 'Behav Ther', 'organization': '', 'pages': '438-451', 'pmid': '40010911', 'title': 'Evaluating the Effectiveness of Safety Plans for Mitigating Suicide Risk in Two Samples of Psychiatrically Hospitalized Military Veterans', 'url': 'https://doi.org/10.1016/j.beth.2024.08.001', 'volume': '56', 'year': 2025} |
| `sall-2019` | guideline | metadata | {'authors': [{'family': 'Sall', 'given': 'J'}, {'family': 'Brenner', 'given': 'L'}, {'family': 'Millikan', 'given': 'Bell AM'}, {'family': 'Colston', 'given': 'MJ'}], 'doi': '10.7326/M19-0687', 'journal': 'Ann Intern Med', 'organization': '', 'pages': '343-353', 'pmid': '31450237', 'title': 'Assessment and Management of Patients at Risk for Suicide: Synopsis of the 2019 U.S. Department of Veterans Affairs and U.S. Department of Defense Clinical Practice Guidelines', 'url': 'https://doi.org/10.7326/M19-0687', 'volume': '171', 'year': 2019} |
| `belkin-2021` | primary-study | metadata | {'authors': [{'family': 'Belkin', 'given': 'MR'}, {'family': 'Briggs', 'given': 'MC'}, {'family': 'Candan', 'given': 'K'}, {'family': 'Risola', 'given': 'K'}, {'family': 'Kane', 'given': 'JM'}, {'family': 'Birnbaum', 'given': 'ML'}], 'doi': '10.1176/appi.ps.201900633', 'journal': 'Psychiatr Serv', 'organization': '', 'pages': '582-585', 'pmid': '33691485', 'title': 'Psychoeducation for Inpatients With First-Episode Psychosis: Results From a Survey of Psychiatry Trainees in New York City', 'url': 'https://doi.org/10.1176/appi.ps.201900633', 'volume': '72', 'year': 2021} |
| `linehan-2015` | primary-study | metadata | {'authors': [{'family': 'Linehan', 'given': 'MM'}, {'family': 'Korslund', 'given': 'KE'}, {'family': 'Harned', 'given': 'MS'}, {'family': 'Gallop', 'given': 'RJ'}, {'family': 'Lungu', 'given': 'A'}, {'family': 'Neacsiu', 'given': 'AD'}, {'family': 'McDavid', 'given': 'J'}, {'family': 'Comtois', 'given': 'KA'}, {'family': 'Murray-Gregory', 'given': 'AM'}], 'doi': '10.1001/jamapsychiatry.2014.3039', 'journal': 'JAMA Psychiatry', 'organization': '', 'pages': '475-482', 'pmid': '25806661', 'title': 'Dialectical behavior therapy for high suicide risk in individuals with borderline personality disorder: a randomized clinical trial and component analysis', 'url': 'https://doi.org/10.1001/jamapsychiatry.2014.3039', 'volume': '72', 'year': 2015} |
| `bohus-lancet-2021` | other-authoritative | metadata | {'authors': [{'family': 'Bohus', 'given': 'M'}, {'family': 'Stoffers-Winterling', 'given': 'J'}, {'family': 'Sharp', 'given': 'C'}, {'family': 'Krause-Utz', 'given': 'A'}, {'family': 'Schmahl', 'given': 'C'}, {'family': 'Lieb', 'given': 'K'}], 'doi': '10.1016/S0140-6736(21)00476-1', 'journal': 'Lancet', 'organization': '', 'pages': '1528-1540', 'pmid': '34688371', 'title': 'Borderline personality disorder', 'url': 'https://doi.org/10.1016/S0140-6736(21)00476-1', 'volume': '398', 'year': 2021} |
| `leichsenring-2023` | other-authoritative | metadata | {'authors': [{'family': 'Leichsenring', 'given': 'F'}, {'family': 'Heim', 'given': 'N'}, {'family': 'Leweke', 'given': 'F'}, {'family': 'Spitzer', 'given': 'C'}, {'family': 'Steinert', 'given': 'C'}, {'family': 'Kernberg', 'given': 'OF'}], 'doi': '10.1001/jama.2023.0589', 'journal': 'JAMA', 'organization': '', 'pages': '670-679', 'pmid': '36853245', 'title': 'Borderline Personality Disorder: A Review', 'url': 'https://doi.org/10.1001/jama.2023.0589', 'volume': '329', 'year': 2023} |
| `soler-2022` | primary-study | metadata | {'authors': [{'family': 'Soler', 'given': 'J'}, {'family': 'Casellas-Pujol', 'given': 'E'}, {'family': 'Fernández-Felipe', 'given': 'I'}, {'family': 'Martín-Blanco', 'given': 'A'}, {'family': 'Almenta', 'given': 'D'}, {'family': 'Pascual', 'given': 'JC'}], 'doi': '10.1111/acps.13403', 'journal': 'Acta Psychiatr Scand', 'organization': '', 'pages': '332-342', 'pmid': '35088405', 'title': '"Skills for pills": The dialectical-behavioural therapy skills training reduces polypharmacy in borderline personality disorder', 'url': 'https://doi.org/10.1111/acps.13403', 'volume': '145', 'year': 2022} |
| `tham-solomon-2024` | systematic-review | metadata | {'authors': [{'family': 'Tham', 'given': 'SS'}, {'family': 'Solomon', 'given': 'P'}], 'doi': '10.1176/appi.ps.20230452', 'journal': 'Psychiatr Serv', 'organization': '', 'pages': '1009-1030', 'pmid': '38938096', 'title': 'Family Involvement in Routine Services for Individuals With Severe Mental Illness: Scoping Review of Barriers and Strategies', 'url': 'https://doi.org/10.1176/appi.ps.20230452', 'volume': '75', 'year': 2024} |
| `hansson-2022` | primary-study | metadata | {'authors': [{'family': 'Hansson', 'given': 'KM'}, {'family': 'Romøren', 'given': 'M'}, {'family': 'Weimand', 'given': 'B'}, {'family': 'Heiervang', 'given': 'KS'}, {'family': 'Hestmark', 'given': 'L'}, {'family': 'Landeweer', 'given': 'EGM'}, {'family': 'Pedersen', 'given': 'R'}], 'doi': '10.1186/s12888-022-04461-6', 'journal': 'BMC Psychiatry', 'organization': '', 'pages': '812', 'pmid': '36539741', 'title': 'The duty of confidentiality during family involvement: ethical challenges and possible solutions in the treatment of persons with psychotic disorders', 'url': 'https://doi.org/10.1186/s12888-022-04461-6', 'volume': '22', 'year': 2022} |
| `chung-2017-postdischarge-suicide` | systematic-review | metadata | {'authors': [{'family': 'Chung', 'given': 'DT'}, {'family': 'Ryan', 'given': 'CJ'}, {'family': 'Hadzi-Pavlovic', 'given': 'D'}, {'family': 'Singh', 'given': 'SP'}, {'family': 'Stanton', 'given': 'C'}, {'family': 'Large', 'given': 'MM'}], 'doi': '10.1001/jamapsychiatry.2017.1044', 'journal': 'JAMA Psychiatry', 'organization': '', 'pages': '694-702', 'pmid': '28564699', 'title': 'Suicide Rates After Discharge From Psychiatric Facilities: A Systematic Review and Meta-analysis', 'url': 'https://doi.org/10.1001/jamapsychiatry.2017.1044', 'volume': '74', 'year': 2017} |
| `chung-2019-first-week-month` | systematic-review | metadata | {'authors': [{'family': 'Chung', 'given': 'D'}, {'family': 'Hadzi-Pavlovic', 'given': 'D'}, {'family': 'Wang', 'given': 'M'}, {'family': 'Swaraj', 'given': 'S'}, {'family': 'Olfson', 'given': 'M'}, {'family': 'Large', 'given': 'M'}], 'doi': '10.1136/bmjopen-2018-023883', 'journal': 'BMJ Open', 'organization': '', 'pages': 'e023883', 'pmid': '30904843', 'title': 'Meta-analysis of suicide rates in the first week and the first month after psychiatric hospitalisation', 'url': 'https://doi.org/10.1136/bmjopen-2018-023883', 'volume': '9', 'year': 2019} |
