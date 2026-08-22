# Therapy Evidence Library — Triage Queue

**Run date:** 2026-08-20 · **Source:** Europe PMC REST API (PubMed was degraded; see §5)
**Domains run:** 13 of 13 (12 planned + behavioral-activation pilot) · **Candidates surfaced:** ~250

---

## 1. How to triage this

For each row: **keep · cut · annotate.**

**The annotation is the product.** One sentence: *why an MS3 should read this, and what to take from it.* A paper without an annotation does not ship — that single rule is the only thing preventing a second decorative registry.

Target **3–6 keeps per domain**, plus 1–2 "go deeper." You are building a reading list, not a bibliography.

**Nothing here is verified yet.** These are search results. Before anything enters `evidence_registry.json` it must pass, in order:

```
resolveIdentifier → checkOpenAccess → checkRetraction → formatCitation
```
(`Scholar_Sidekick` MCP, already on your machine.)

**Why that is not optional — the pilot's near-miss.** The top relevance-ranked meta-analysis for behavioral activation was **retracted**:

> Chan ATY et al. *Group-based behavioral activation in depression: updated meta-analysis.* J Affect Disord 2017;208:345–354. PMID 27810717. **Retraction in: J Affect Disord 2018;241:634.**

And the structured parse of that harvest captured 13 of 18 records and **did not flag the retraction**. Discovery generates candidates. It is not a quality gate.

**Legend:** `OA` = open access (link freely) · blank = proxy link only via Tufts · ⚠ = flagged as likely off-target, see §4

---

## 2. Domains

### D1 · Alliance, common factors, rupture & repair — 56 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2025 | Clin Psychol Rev | 41110399 | | Associated factors of therapeutic alliance quality in people with severe mental illnesses: systematic review |
| 2025 | Psychotherapy (Chic) | 41114940 | | Multilevel meta-analysis of client and therapist predictors for alliance quality |
| 2025 | Clin Psychol Psychother | 39930548 | | Influence of therapist attachment style on the working alliance: SR and meta-analysis |
| 2025 | Psychother Res | 39086008 | | Updated meta-analysis: adult attachment style and working alliance |
| 2025 | JMIR Ment Health | 39924298 | **Y** | Does the digital therapeutic alliance exist? Integrative review |
| 2025 | Clin Psychol Rev | 40311538 | | Assessment instruments for working alliance with adolescents |
| 2024 | Clin Psychol Rev | 39098267 | | Client and therapist perspectives on alliance in the context of suicidal experiences |
| 2024 | Psychotherapy (Chic) | 38780549 | | Interpersonal problems and therapeutic alliance: three-level meta-analysis |
| 2024 | Clin Psychol Rev | 38636207 | | Alliance quality and outcomes in teletherapy: SR and meta-analysis |
| 2024 | Front Psychol | 38993343 | **Y** | Alliance in individual adult psychotherapy: conceptualizations and measures |
| 2024 | J Telemed Telecare | 36974478 | | Alliance in videoconferencing vs in-person psychotherapy |
| 2022 | Clin Psychol Psychother | 35168297 | **Y** | Therapeutic alliance and suicidal experiences: systematic review |
| 2022 | Clin Psychol Psychother | 34237173 | | Alliance in psychological therapy for PTSD: SR and meta-analysis |
| 2022 | Front Psychiatry | 36147968 | **Y** | Alliance in CBT for OCD: SR and meta-analysis |
| 2022 | Front Psychol | 35910993 | **Y** | Working Alliance Inventory measurement properties |
| 2021 | Psychol Psychother | 33569885 | | Alliance, engagement and outcome in psychological therapies for psychosis |
| 2018 | Clin Psychol Psychother | 30014606 | | Working alliance and outcome in videoconferencing psychotherapy (148 citations) |

> **Note:** the canonical Flückiger alliance meta-analysis is not in this slice because it was published in *Psychotherapy* outside the title-match pattern. Add it by hand — DOI `10.1037/pst0000172`, already miscited on your landmark page as "Norcross 2011" (WP-26).

### D2 · Brief interventions on an inpatient unit — 6 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2023 | Clin Psychol Psychother | 35997039 | **Y** | Indirect psychological intervention in acute mental health inpatient settings: SR and narrative synthesis |
| 2022 | Psychiatry | 35442174 | | Meta-analysis of psychotherapy in an inpatient setting — moderating role of diagnosis and approach |
| 2019 | Acta Psychiatr Scand | 30520019 | | Efficacy of inpatient psychotherapy for major depressive disorder: meta-analysis |
| 2016 | Psychother Psychosom Med Psychol | 26764903 | | [Study quality and treatment outcome in inpatient psychotherapy — meta-analysis] (German) |
| 2014 | Psychother Psychosom Med Psychol | 24760412 | | [Premature termination of inpatient psychotherapy] (German) |
| 2013 | Am J Geriatr Psychiatry | 23395190 | | Integrated psychological therapy in schizophrenia inpatient settings, by age |

> **Only 6 hits — and that is itself the finding.** The literature on what psychotherapy an inpatient team can actually deliver is thin. Worth saying out loud on the page rather than papering over.

### D2b · Behavioral activation (pilot) — 18 hits

| Year | Journal | Title |
|---|---|---|
| 2026 | Clin Psychol Rev | Behavioral activation for depression: comprehensive SR and meta-analysis |
| 2026 | J Affect Disord | BA and prevention of depression in at-risk adults |
| 2025 | J Med Internet Res | Digital behavioral activation for depression and anxiety |
| 2024 | Nurs Rep | BA for women with postnatal depression |
| 2023 | Psychother Res | Individual behavioral activation in the treatment of depression |
| 2023 | J Med Internet Res | Internet-based behavioral activation for depression |
| 2022 | J Subst Abuse Treat | BA for co-occurring depression and substance use disorder |
| 2022 | J Psychiatr Res | Internet-delivered BA for depressive symptoms |
| 2021 | J Consult Clin Psychol | Cognitive restructuring vs BA vs CBT — network meta-analysis |
| 2021 | Psychol Med | Beyond depression: BA effect on depression, anxiety, activation |
| 2019 | Behav Ther | Acceptability and efficacy of group BA |
| 2007 | Clin Psychol Rev | BA treatments of depression: meta-analysis *(anchor paper)* |
| 2017 | J Affect Disord | ❌ **RETRACTED — PMID 27810717. Do not use.** |

### D3 · Safety planning and lethal means — 236 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2026 | JAMA Netw Open | 42213437 | **Y** | Group-based suicide safety planning and skills training for veterans at high risk: RCT |
| 2026 | Inj Prev | 40185617 | | SR: impact of interventions changing access to lethal means on attempts and deaths |
| 2026 | Int J Nurs Stud Adv | 42088533 | **Y** | Training health care professionals in safety plan implementation: systematic review |
| 2026 | Suicide Life Threat Behav | 41999074 | **Y** | Increasing safety plan use and reducing SI in emerging adults: pilot RCT |
| 2026 | Psychiatr Serv | 41881844 | | National implementation of suicide safety planning in the VHA |
| 2026 | J Affect Disord | 42066852 | | Safety plan engagement: temporal dynamics and momentary predictors |
| 2026 | Sci Rep | 42209662 | | Six-month outcomes after a safety-planning-type intervention post-attempt (France) |
| 2025 | BMJ Ment Health | 41365522 | **Y** | Effectiveness of suicide means restriction: overview of systematic reviews |
| 2025 | J Am Coll Emerg Physicians Open | 41281737 | **Y** | Safety planning for youth in the ED with suicide risk |
| 2025 | J Pediatr Health Care | 39797890 | | Preventing suicide through lethal means restriction in pediatric care |
| 2026 | Ann Emerg Med | 42405914 | | Teen and caregiver perspectives on lethal means safety planning in the ED |
| 2026 | Asia Pac Psychiatry | 42601665 | | Means restriction activities for suicide prevention: scoping review |
| 2026 | J Rural Health | 41588871 | | Rural community perceptions of lethal means safety |
| 2026 | PLoS One | 41785209 | **Y** | Military-affiliated women on lethal means safety: systematic review |
| 2025 | Health Soc Work | 39752325 | | ELMS: means safety training for mental health first responders |
| 2025 | Crisis | 40888051 | | Veterans Crisis Line lethal means safety pilot |

> **Richest domain in the run**, and it directly feeds the safety-planning tool (WP-06R-b). The two overview papers — Inj Prev 40185617 and BMJ Ment Health 41365522 — are the obvious anchors.

### D4 · CBT for psychosis — 18 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2025 | Health Technol Assess | 41217072 | **Y** | Treatment effect modifiers of CBT in psychosis: individual participant data meta-analysis |
| 2025 | PLoS One | 40392926 | **Y** | CBT for negative symptoms and functioning in schizophrenia: SR and meta-analysis |
| 2025 | J Psychiatr Res | 41061442 | | CBT for insomnia in people with schizophrenia: SR and meta-analysis |
| 2024 | Medicine (Baltimore) | 39252302 | **Y** | CBT for negative symptoms of schizophrenia |
| 2024 | Psychol Serv | 38829347 | | Culturally adapted CBT for psychosis: key features |
| 2022 | Schizophr Bull | 33944949 | | CBT for prodromal psychosis: transition, functioning, distress, QoL |
| 2016 | Clin Psychol Rev | 27048980 | | Low-intensity CBT for psychosis: SR and meta-analysis |
| 2016 | BMC Psychiatry | 27400680 | **Y** | Disability and recovery in schizophrenia: CBT interventions |
| 2014 | Psychiatr Serv | 24686725 | | CBT for medication-resistant psychosis: meta-analytic review |
| 2012 | Cochrane | 22513966 | | CBT vs other psychosocial treatments for schizophrenia |
| 2004 | Behav Res Ther | 15500811 | | Is CBT effective for schizophrenia? A cautious or cautionary tale (156 citations) |
| 2002 | Psychol Med | 12171372 | | Psychological treatments in schizophrenia I: family intervention and CBT (388 citations) |

> Keep **15500811** — the cautionary paper is exactly the "evidence limits, honestly" posture your OMM page already models.

### D5 · DBT and Good Psychiatric Management for BPD — 366 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2026 | JAMA Psychiatry | 42018336 | | DBT vs schema therapy for BPD: BOOTS multicenter RCT |
| 2025 | Am J Psychiatry | 41190740 | | DBT vs SSRI for suicidal behavior in BPD: RCT |
| 2026 | Personal Disord | 42275028 | | Stand-alone DBT skills training for BPD: SR and meta-analysis |
| 2026 | Psychiatry Res | 41819776 | | Effect of DBT on affective symptoms in BPD: SR and meta-analysis |
| 2026 | Borderline Personal Disord Emot Dysregul | 42458542 | | Follow-up effects of **brief Good Psychiatric Management** for BPD |
| 2025 | Am J Psychother | 38952224 | | **Good Psychiatric Management: foundations and future challenges** |
| 2025 | Am J Psychother | 39623951 | | Clinical pearls: GPM and transference-focused psychotherapy |
| 2025 | Am J Psychother | 39083007 | | General psychiatric management for adolescents with BPD and eating disorders |
| 2026 | Psychodyn Psychiatry | 41849148 | | Family engagement in BPD: integrating TFP and GPM principles |
| 2026 | J Psychiatr Res | 41519105 | | DBT, MBT and IFS for BPD with comorbid depression/anxiety |
| 2026 | Personal Disord | 41973815 | | Inpatient DBT for men and women with BPD: effectiveness and premature termination |
| 2026 | J Palliat Med | 42596557 | | Distress intolerance: DBT-informed communication for serious illness care |

> **GPM is well represented here** — which matters, because the review flagged its absence as a real gap and it is the right generalist frame for a non-DBT unit. `38952224` is the natural anchor. Also note `41849148` (family engagement in BPD) sits directly on your strongest domain.

### D6 · Family psychoeducation and family intervention — 18 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2026 | Alpha Psychiatry | 42416178 | | Expressed emotion and relapse in bipolar disorder: systematic review |
| 2021 | Psychol Med | 33568244 | | Predictive power of expressed emotion in schizophrenia relapse: meta-analysis |
| 2020 | Schizophr Bull | 31050757 | | Family intervention preventing relapse in first-episode psychosis to 24 months |
| 2019 | Schizophr Res | 31028000 | | Caregiving processes and expressed emotion in psychosis: cross-cultural meta-analysis |
| 2018 | Early Interv Psychiatry | 29076263 | | Family intervention for caregivers in recent-onset psychosis |
| 2017 | JBI Database | 28398985 | | Family interventions on distress and expressed emotion in first-episode psychosis |
| 2014 | Psychiatr Serv | 24445678 | | Consumer and family psychoeducation: assessing the evidence |
| 2014 | Cochrane | 24595545 | | Family intervention (brief) for schizophrenia |
| 2010 | Cochrane | 21154340 | | Family intervention for schizophrenia (Pharoah — 149 citations) |
| 2010 | Br J Psychiatry | 21037211 | **Y** | Early intervention services, CBT and family intervention in early psychosis |
| 2002 | Psychol Med | 12171372 | | Psychological treatments in schizophrenia I (388 citations) |

### D7 · Motivational interviewing — 144 hits ⚠ see §4

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2023 | Cochrane | 38084817 | | **Motivational interviewing for substance use reduction** |
| 2025 | J Dual Diagn | 39798118 | | Outcomes and challenges of MI in dual diagnosis treatment: systematic review |
| 2025 | Psychol Addict Behav | 40372876 | | MI-informed interventions for problem gambling: SR and meta-analysis |
| 2025 | Psychosoc Interv | 40405915 | **Y** | Effectiveness of MI with justice-involved people |
| 2024 | Clin Psychol Psychother | 38855846 | | Effects of CBT and MI training on mental health practitioner behaviour |
| 2025 | Clin Child Psychol Psychiatry | 39666334 | | CBT and MI for adolescent and young adult sleep concerns |
| 2024 | BMJ | 38986547 | **Y** | Behavioural interventions with MI on physical activity outcomes |
| ⚠ | — | — | | 12 further results are physiotherapy, dentistry, diabetes, hypertension, stroke and pediatric obesity — skip |

### D8 · Trauma-informed care — 40 hits ⚠ see §4

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2026 | Crisis | 41267566 | | **Trauma-informed approaches to suicide prevention** |
| 2025 | Community Ment Health J | 39641885 | | Trauma-informed care in substance use settings: systematic review |
| 2024 | Community Ment Health J | 39046622 | | Umbrella review of systematic reviews on trauma-informed approaches |
| 2024 | Perm J | 38444328 | **Y** | Effectiveness of TIC implementation in health care settings: review of reviews (72 citations) |
| 2023 | Psychol Serv | 36689374 | | Effectiveness of TIC interventions at the organizational level |
| 2024 | J Psychiatr Ment Health Nurs | 37697899 | | TIC outcomes for women experiencing intimate partner violence |
| 2026 | Child Abuse Negl | 42030780 | | Dyadic and systemic TIC in adolescent residential settings |
| ⚠ | — | — | | Remainder is schools, early-childhood education, midwifery, primary care, forced migration, physical activity — skip |

### D9 · Psychodynamic and mentalization-based therapy — 54 hits ⚠ see §4

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2024 | Suicide Life Threat Behav | 38279664 | | **Efficacy of mentalization-based therapy in treating self-harm: SR and meta-analysis** |
| 2023 | Clin Psychol Rev | 36958077 | | Efficacy and moderators of short-term psychodynamic psychotherapy for depression (IPD) |
| 2023 | Psychol Med | 36404677 | **Y** | Who benefits from adding STPP to antidepressants? IPD meta-analysis |
| 2023 | J Affect Disord | 36623570 | | Efficacy of STPP in depressive disorders: SR and meta-analysis |
| 2025 | Death Stud | 38865193 | | **Psychodynamic psychotherapy in serious physical illness** — existential distress |
| 2021 | J Psychosom Res | 33814192 | | STPP for functional somatic disorders: within-treatment effects (46 citations) |
| 2020 | Psychother Psychosom | 32428905 | | STPP for functional somatic disorders: meta-analysis of RCTs |
| 2026 | BMC Psychol | 41787584 | **Y** | STPP for social anxiety disorder: meta-analysis of RCTs |
| 2025 | Psychol Med | 40626951 | **Y** | The shadow of trauma: impaired mentalization in clinical populations |
| ⚠ | — | — | | Parental/developmental mentalization and school-based programs — skip |

> `38865193` and the two somatic-disorder papers are strong **consult-service** content — flag them for D10 as well.

### D10 · Therapy in the medically ill / CL — 657 hits ⚠ see §4

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2026 | J Clin Psychiatry | 41920002 | | **The demoralization construct in clinical practice and research** |
| 2026 | StatPearls | 42207918 | **Y** | Meaning-centered psychotherapy (open reference chapter) |
| 2026 | Psychooncology | 42271659 | **Y** | Demoralization and associated factors in palliative oncology outpatients |
| 2026 | Palliat Support Care | 42077010 | **Y** | Desire for hastened death in terminal cancer: whole-person implications |
| 2025 | J Psychosom Res | 41108807 | | Correlates of desire for hastened death in chronic illness: network analysis |
| 2025 | Eur J Oncol Nurs | 40706412 | | Dignity therapy on demoralization syndrome during chemotherapy: RCT |
| 2026 | Fam Process | 42403270 | | Demoralization and illness-related communication in cardiac disease |
| 2026 | Evid Based Nurs | 42321001 | | Dignity therapy supports meaning and emotional well-being in palliative care |
| ⚠ | — | — | | Spiritual Meaning-Centred *Leadership* scale (schoolteachers), a nursing "collective healing" concept paper, and a generative-AI commentary — clear false matches, skip |

> **This is the domain to merge with Kaitlin's CL reading list.** Ask her before you triage it.

### D11 · Post-discharge contact and continuity — 111 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2025 | Gen Hosp Psychiatry | 39837259 | | **Inpatient brief CBT for suicide prevention and post-discharge ED utilization** |
| 2026 | Australas Psychiatry | 41664893 | | Suicide rate post-discharge from a psychiatric hospital: time for a rethink |
| 2026 | Suicide Life Threat Behav | 42267748 | | Couples Crisis Response Plan to reduce post-discharge suicide risk: RCT |
| 2026 | Gen Hosp Psychiatry | 42492418 | | App-enhanced inpatient-to-post-discharge model for suicidal patients |
| 2024 | Suicide Life Threat Behav | 38934489 | **Y** | Caring contacts using patient feedback after psychiatric hospitalization |
| 2025 | Contemp Clin Trials | 39938610 | | Two-way vs one-way caring contacts vs enhanced usual care: SPRING protocol |
| 2025 | J Psychiatr Res | 39581017 | | Brief contact interventions in VigilanS: role of PTSD and anxiety |
| 2025 | Suicide Life Threat Behav | 40899634 | **Y** | SMS-based brief contact for people bereaved by suicide: RCT |
| 2024 | J Am Coll Emerg Physicians Open | 39430665 | **Y** | Caring contacts for youth suicide prevention in an ED |
| 2025 | Npj Ment Health Res | 39987238 | **Y** | Post-discharge suicide prediction using NLP-enriched social determinants |

> `41664893` — *"time for a rethink"* — pairs perfectly with the review's finding that the peri-discharge window is the highest-risk period of the whole episode.

### D12 · Evidence limits — allegiance, dropout, equivalence — 133 hits

| Year | Journal | PMID | OA | Title |
|---|---|---|---|---|
| 2025 | Clin Psychol Eur | 40177337 | **Y** | **Allegiance and treatment quality as moderators of comparative effectiveness** |
| 2024 | Clin Psychol Psychother | 38616708 | | Does researcher allegiance bias outcomes? Quasi-experimental secondary analysis |
| 2026 | Psychother Res | 41973075 | | Allegiance bias in systemic therapy: three-level meta-regression |
| 2023 | Psychother Res | 36525623 | | **Implications of the Dodo bird verdict for training in psychotherapy** |
| 2025 | Clin Psychol Psychother | 40325843 | | Dropout in psychotherapy for personality disorders: predictors |
| 2023 | Clin Psychol Psychother | 37522280 | | Predictors of psychotherapy dropout in BPD |
| 2025 | Psychol Trauma | 41248050 | | The protocol matters: dropout from PTSD treatments in service members |
| 2025 | Res Psychother | 40471224 | **Y** | Unresolved alliance ruptures preceding dropout in adolescent psychotherapy |
| 2026 | NPJ Digit Med | 41845039 | **Y** | Defining and reporting treatment dropout in blended therapy |

> `36525623` is the single best candidate for the section's closing page. Training implications of the equivalence debate is exactly the honest framing the section needs.

---

## 3. Suggested keeps to start from

Not a decision — a starting shortlist to argue with. One anchor per domain:

| Domain | Anchor candidate |
|---|---|
| Alliance | 41110399 (alliance in severe mental illness) — closest to your population |
| Inpatient brief interventions | 35997039 **OA** + 30520019 |
| Behavioral activation | Clin Psychol Rev 2026 comprehensive SR + the 2007 anchor |
| Safety planning / means | 40185617 (means-access interventions) + 41365522 **OA** (overview of SRs) |
| CBT for psychosis | 41217072 **OA** (IPD effect modifiers) + 15500811 (the cautionary tale) |
| DBT / GPM | 38952224 (GPM foundations) + 42018336 (BOOTS RCT) |
| Family | 31050757 (FEP relapse prevention) + 33568244 (EE meta-analysis) |
| Motivational interviewing | 38084817 (Cochrane, substance use) |
| Trauma-informed | 41267566 (suicide prevention) + 38444328 **OA** |
| Psychodynamic / MBT | 38279664 (MBT for self-harm) + 36958077 |
| Medically ill / CL | 41920002 (demoralization construct) + 42207918 **OA** |
| Post-discharge | 39837259 + 41664893 |
| Evidence limits | 40177337 **OA** + 36525623 |

---

## 4. Four domains need a query refinement before triage

The bare title terms pulled in adjacent literatures. Re-run these four; the rest are usable as-is.

**D7 · Motivational interviewing** — 12 of 20 results were physiotherapy, dentistry, diabetes, hypertension, stroke and pediatric obesity.
```
TITLE:"motivational interviewing" AND (TITLE:"substance" OR TITLE:"alcohol" OR TITLE:"drug use"
OR TITLE:"adherence" OR TITLE:"ambivalence" OR TITLE:"dual diagnosis")
```

**D8 · Trauma-informed care** — dominated by schools, early-childhood education, midwifery and primary care.
```
(TITLE:"trauma-informed" OR TITLE:"trauma informed") AND (TITLE:"psychiatric" OR TITLE:"inpatient"
OR TITLE:"mental health" OR TITLE:"suicide")
```

**D9 · Mentalization** — the bare term pulls parental/developmental research rather than MBT.
```
(TITLE:"psychodynamic psychotherapy" OR TITLE:"mentalization-based" OR TITLE:"mentalization based
treatment" OR TITLE:"transference-focused") AND (PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review")
```

**D10 · Meaning-centered** — matched a leadership scale for schoolteachers and a nursing concept paper.
```
(TITLE:"demoralization" OR TITLE:"desire for hastened death" OR TITLE:"dignity therapy"
OR TITLE:"meaning-centered psychotherapy" OR TITLE:"meaning-centred psychotherapy")
AND (TITLE:"cancer" OR TITLE:"palliative" OR TITLE:"medically ill" OR ABSTRACT:"palliative")
```

Base URL: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=<encoded>&format=json&pageSize=20&resultType=lite`

---

## 5. Run notes

- **PubMed was unusable** for the whole run — every query, including deliberately simplified ones, returned `[Invalid form]` with an empty results region and a banner reading *"Clipboard, Search History, and several other advanced features are temporarily unavailable."* The Europe PMC **web UI** was also under maintenance. Its **REST API was fully functional**, which is what carried the run.
- **Lesson for the runbook:** query the Europe PMC REST endpoint directly rather than either HTML interface. Cleaner data, one call per domain, no form state, no scraping.
- Three navigations returned the previous query's JSON on first read (tab had not committed). Each was caught by matching the `queryString` echoed in the response body against the intended query — **keep that check**; without it a domain silently duplicates its neighbour.
- Several rows are **preprints** (Research Square, PsyArXiv, medRxiv) with no PMID. Do not ship preprints to students without a specific reason.
- Some records show `isOpenAccess: N` while sitting in PMC. Confirm with `checkOpenAccess` before choosing link type — a proxy link where an open one exists is a small, avoidable friction for a student at 11pm.
- Europe PMC assigns `pubYear` 2026 to many ahead-of-print items first indexed in late 2025.

---

## 6. What happens after triage

1. Verify every keep: `resolveIdentifier → checkOpenAccess → checkRetraction → formatCitation`
2. Write one annotation per keep — why an MS3 reads it, what to take from it
3. Stage into `therapy_library.json`
4. Promote curated batches into `evidence_registry.json` (schema v2, CI-validated)
5. Wire `topic_meta.evidenceIds` → this is what closes review finding **F19** (registry ~90% decorative) as a side effect
6. Build the therapy reading page and the per-topic "go deeper" rails (Taplinger items 4 and 5)

**No PDFs. No copied abstracts. No publisher content on the Netlify sites.**
