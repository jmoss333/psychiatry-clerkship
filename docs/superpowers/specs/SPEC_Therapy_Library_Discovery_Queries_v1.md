# Therapy Evidence Library — Discovery Query Set v1

**For:** WP-36 · therapy evidence library (Taplinger feedback item 5)
**Created:** 2026-08-20 · **Status:** queries authored and ready; discovery run blocked on an upstream outage (see §4)

---

## 1. How to run this

**Two-step per domain — this matters.** PubMed's `&format=pubmed` deep link fails with `[Invalid form]` on a fresh tab because it needs prior form state. Load the plain results URL first, then re-navigate the *same tab* adding `&format=pubmed`. That returns full MEDLINE records for every hit on one page, which is what makes the harvest parseable.

**Rate discipline.** One domain at a time. Do not open twelve tabs and fire simultaneously — that is the burst pattern that gets flagged, and NCBI's own guidance is a few requests per second at most. This is discovery, not harvesting.

**No login required.** Discovery runs against public PubMed. Reserve the Tufts/Hirsh authenticated session for confirming full-text access on the shortlist only — smaller exposure surface, same result.

**Discovery is not verification.** The scrape gives you candidates. Retraction status, OA status and citation integrity come from `Scholar_Sidekick` (`resolveIdentifier` → `checkOpenAccess` → `checkRetraction` → `formatCitation`) as a separate pass. See §3 for why this is non-negotiable.

---

## 2. The twelve domains

Common suffix unless noted: `&filter=pubt.meta-analysis&filter=pubt.systematicreview&size=30&sort=relevance`
Base: `https://pubmed.ncbi.nlm.nih.gov/?term=`

| # | Domain | `term=` (unencoded) | Filter note |
|---|---|---|---|
| 1 | Alliance, common factors, rupture & repair | `("therapeutic alliance"[Title] OR "working alliance"[Title] OR "common factors"[Title] OR "alliance rupture"[Title]) AND psychotherapy[Title/Abstract]` | default |
| 2 | Brief interventions on an inpatient unit | `inpatient[Title] AND (psychotherapy[Title] OR "psychological intervention"[Title] OR "brief intervention"[Title] OR "psychological therapy"[Title])` | default |
| 2b | Behavioral activation *(pilot — already run)* | `"behavioral activation"[Title] AND depress*[Title]` | default · **18 hits, harvested** |
| 3 | Safety planning & lethal means | `("safety planning"[Title] OR "safety plan"[Title] OR "lethal means"[Title] OR "means restriction"[Title] OR "means safety"[Title]) AND suicid*[Title/Abstract]` | **add** `&filter=pubt.randomizedcontrolledtrial` — this literature is mostly trials |
| 4 | CBT for psychosis | `("cognitive behavioral therapy"[Title] OR "cognitive behaviour therapy"[Title] OR CBT[Title]) AND (psychosis[Title] OR schizophrenia[Title])` | default |
| 5 | DBT principles on a non-DBT unit + GPM for BPD | `("dialectical behavior therapy"[Title] OR "dialectical behaviour therapy"[Title] OR "good psychiatric management"[Title] OR "general psychiatric management"[Title]) AND "borderline personality"[Title/Abstract]` | **add** RCT filter — GPM literature is thin and trial-based |
| 6 | Family psychoeducation & family intervention | `("family psychoeducation"[Title] OR "family intervention"[Title] OR "family therapy"[Title] OR "expressed emotion"[Title]) AND (schizophrenia[Title/Abstract] OR psychosis[Title/Abstract] OR "serious mental illness"[Title/Abstract] OR bipolar[Title/Abstract])` | default |
| 7 | Motivational interviewing | `"motivational interviewing"[Title] AND (substance[Title/Abstract] OR alcohol[Title/Abstract] OR adherence[Title/Abstract])` | default |
| 8 | Trauma-informed care, inpatient | `("trauma-informed"[Title] OR "trauma informed"[Title]) AND (care[Title] OR inpatient[Title] OR psychiatric[Title/Abstract])` | default |
| 9 | Psychodynamic & mentalization-based | `("psychodynamic psychotherapy"[Title] OR psychoanalytic[Title] OR mentalization[Title] OR "transference-focused"[Title])` | default |
| 10 | Therapy in the medically ill / CL | `(demoralization[Title] OR "desire for hastened death"[Title] OR "dignity therapy"[Title] OR "meaning-centered"[Title]) OR (psychotherapy[Title] AND ("medically ill"[Title] OR palliative[Title] OR cancer[Title]))` | default · **merge with Kaitlin's CL list** |
| 11 | Post-discharge contact & continuity | `("caring contacts"[Title] OR "brief contact"[Title] OR "post-discharge"[Title] OR postdischarge[Title] OR "discharge planning"[Title]) AND (suicid*[Title/Abstract] OR psychiatric[Title/Abstract])` | **add** RCT filter |
| 12 | Evidence limits — allegiance, equivalence, dropout | `(allegiance[Title] OR "dodo bird"[Title] OR equivalence[Title] OR dropout[Title] OR "publication bias"[Title]) AND psychotherapy[Title/Abstract]` | default |

**Fallback index if PubMed is unavailable:** Europe PMC, same corpus, different syntax —
`https://europepmc.org/search?query=(TITLE:"…" OR TITLE:"…") AND (PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review")`

---

## 3. Why verification is a separate, mandatory pass

The pilot run on domain 2b returned 18 hits. **The top relevance-ranked result was retracted:**

> Chan ATY, Sun GYY, Tam WWS, Tsoi KKF, Wong SYS. *The effectiveness of group-based behavioral activation in the treatment of depression: an updated meta-analysis of randomized controlled trials.* J Affect Disord. 2017;208:345–354. PMID 27810717.
> **Retraction in: J Affect Disord. 2018;241:634.**

Had that gone onto a reading list on relevance rank alone, students would have been assigned a retracted meta-analysis.

**Second lesson from the same run:** the structured parse of the harvested page captured 13 of 18 records and **did not flag the retraction**. The scrape is a candidate generator. It is not a quality gate. Every shortlisted PMID goes through `checkRetraction` before it reaches the registry, no exceptions.

### Domain 2b harvest — ready for triage

| Year | Journal | Title |
|---|---|---|
| 2026 | Clin Psychol Rev | Behavioral activation for depression: comprehensive systematic review and meta-analysis |
| 2026 | J Affect Disord | BA and prevention of depression in at-risk adults |
| 2025 | J Med Internet Res | Digital behavioral activation for depression and anxiety |
| 2024 | Nurs Rep | BA for women with postnatal depression |
| 2023 | Psychother Res | Individual behavioral activation in the treatment of depression |
| 2023 | J Med Internet Res | Internet-based behavioral activation for depression |
| 2022 | J Subst Abuse Treat | BA for co-occurring depression and substance use disorder |
| 2022 | J Psychiatr Res | Internet-delivered BA for depressive symptoms |
| 2021 | J Consult Clin Psychol | Cognitive restructuring vs BA vs CBT — network meta-analysis |
| 2021 | Psychol Med | Beyond depression: BA effect on depression, anxiety and activation |
| 2019 | Behav Ther | Acceptability and efficacy of group BA |
| 2016 | — | CBT and BA apps for depression (systematic review) |
| 2007 | Clin Psychol Rev | BA treatments of depression: meta-analysis *(the anchor paper)* |
| — | J Affect Disord 2017 | **RETRACTED — do not use** |

---

## 4. Run status, 2026-08-20

Discovery halted after domain 1. **Both indexes were simultaneously degraded:**

- **PubMed** — every query, including a deliberately simplified one, returned `[Invalid form]` with an empty results region and a site banner reading *"Clipboard, Search History, and several other advanced features are temporarily unavailable."* The same query pattern succeeded roughly twenty minutes earlier, so this is a service condition, not a syntax error.
- **Europe PMC** — site banner: *"EuropePMC is under maintenance and you may experience some interruption."* Zero results rendered.

Europe PMC is developed with NLM as part of the PMC International network, so a shared upstream cause is plausible.

**Deliberately not done:** retried in a loop, or assembled the reading list from memory. A therapy reading list generated from model recall rather than a live index is precisely the failure this project has spent the week eliminating — it would look correct and be unverifiable, and at least one entry would be wrong in a way nobody would catch until a student cited it.

**To resume:** re-run §2 top to bottom. Each domain is two navigations plus one text extraction; twelve domains is roughly thirty minutes of wall clock at a polite pace.

---

## 5. Output contract

Staging file `therapy_library.json`; curated batches promoted into `evidence_registry.json` (schema v2, CI-validated).

```
{ id, domain, citation, pmid, doi, oaStatus, linkType: "open" | "proxy",
  annotation, learnerLevel: "ms3" | "resident" | "both",
  linkedPages: [...], addedBy, addedAt, verifiedAt }
```

**No PDFs. No copied abstracts.** One annotation in your words — why an MS3 should read it and what to take from it. A paper without an annotation does not ship; that rule is the only thing preventing a second decorative registry.
