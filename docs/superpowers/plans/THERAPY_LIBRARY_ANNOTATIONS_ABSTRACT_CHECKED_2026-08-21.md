# Therapy Library — Annotations Checked Against Abstracts

**Run:** 2026-08-21 · **Scope:** 43 KEEPs + 3 HOLD→D10 + the Flückiger add-by-hand = **46 rows**
**Method:** full abstracts pulled from Europe PMC `resultType=core`, with NCBI efetch and Crossref as second and third passes for empty records. Every claim in every rewritten annotation is traceable to abstract text.

---

## 1. Headline

| | |
|---|---|
| Rows checked | 46 |
| **Needed change** | **25 (54%)** |
| — **CORRECTED** (abstract contradicts the annotation) | **7** |
| — UNSUPPORTED (finding asserted that the abstract does not report) | 3 |
| — SOFTENED (asserted more than the abstract supports) | 12 |
| — NO ABSTRACT (unverifiable) | 3 |
| Confirmed as written | 21 |
| Citation defects found | 1 wrong PMID (Flückiger), 1 confirmed corrupt DOI |

**Four of the seven contradictions are domain anchors.** This is not a copy-editing pass — it changes which papers should anchor which domains, and in two cases the paper now teaches close to the opposite of what the annotation claimed.

The annotated file was honest that its annotations came from titles and warned that 2025–26 rows described "role and question" rather than result. That warning was correct and load-bearing. A 54% amendment rate is what title-level annotation actually costs.

---

## 2. The seven contradictions

### ① 41217072 · D4 anchor · CBT for psychosis — **inverted**
> **Annotation said:** *"the average effect hides real heterogeneity; patient selection is a clinical skill."*
> **Paper says:** *"There was **no reliable evidence** indicating that any of the covariates considered in this evidence synthesis significantly impacted the efficacy of cognitive-behavioural therapy in this client group."* Conclusion: *"Cognitive-behavioural therapy **should continue to be offered equally** to service users irrespective of their demographic or clinical characteristics."*

The covariates tested — age, gender, ethnicity, illness duration, phase, severity, dose, therapist training, manualisation, individual vs group — are precisely the ones a student would use to select. **A student who read the annotation and cited the paper would have argued against its conclusion.**

### ② 38279664 · D9 anchor · MBT for self-harm — **inverted**
> **Annotation said:** *"a psychodynamically derived treatment has meta-analytic support for one of the unit's hardest presentations."*
> **Paper says:** pre-post effects are large (self-harm g = −0.82), but against active controls *"MBT(-A) did not prove to be more efficacious,"* with one exception (adult BPD symptoms, g = −0.56). Conclusion: *"**prioritizing the application of MBT(-A) for the treatment of self-harm is not supported.**"*

### ③ 40177337 · D12 anchor · allegiance — **inverted, and scope overstated**
> **Annotation said:** *"who ran the trial shapes what the trial finds… read the author list and funding with the same care as its methods."*
> **Paper says:** *"We found **no clear evidence** for allegiance or treatment quality impacting upon treatment outcome in this re-examination. Allegiance and treatment quality were **not as relevant** for outcomes… as expected."*

Two defects: the direction is reversed — this paper looked for the allegiance effect and did not find it — and it is confined to trials comparing **humanistic** psychotherapy to other approaches, not comparative-therapy trials generally.

### ④ 40185617 · D3 anchor · lethal means — **overstated on magnitude and causality**
> **Annotation said:** *"The evidence that means restriction changes deaths, not just process measures — the strongest causal lever in suicide prevention."*
> **Paper says:** *"stricter regulations were associated with a **small reduction, if any**, in total and/or firearm-specific suicide deaths"*; non-firearm evidence *"limited, mixed and/or inconclusive"*; *"**no high-quality randomised controlled trials** were identified"*; *"the ecological level of analysis **precluded individual-level causal inference**."*

This is the citation sitting under the safety-planning tool. Handing students "strongest causal lever" over a review whose own finding is "small reduction, if any" is the claim most likely to be challenged by a sharp student — or by Kaitlin.

### ⑤ 34146994 · D2b · BA in co-occurring depression + SUD — **null result reported as efficacy**
> **Annotation said:** *"activation scheduling works when the depression is entangled with substance use — you don't have to sequence 'sobriety first, therapy later.'"*
> **Paper says:** *"**no significant differences** between BA and controls with regard to depression"* (SMD 0.19, CI −0.10 to 0.49, p = 0.20) *"or substance use"*; GRADE **Low** throughout; 5 trials, **195 patients total**. Conclusion: BA *"does not emerge as a differentially efficacious treatment… although it does appear to be an **acceptable** treatment option."*

The title is a question. The answer is "acceptable, not differentially effective." What survives is the tolerability finding.

### ⑥ 38993343 · D1 · proposed on-ramp — **wrong kind of paper**
> **Annotation said:** *"an open-access primer on what 'alliance' actually means (Bordin's bond/goals/tasks) before students meet the outcome literature."*
> **Paper is:** a systematic review of **48 measurement instruments**. Bordin is not mentioned in the abstract. Conclusion: *"The broad variety of conceptualizations and measures of TA makes coherent research on TA difficult."*

This was slated as the **first thing a student reads in the largest domain**. They would get a psychometrics catalogue.

### ⑦ 40392926 · D4 · CBT for negative symptoms — **disappointment pre-assigned**
> **Annotation said:** negative symptoms are where "treatments deliver the least"; this gives "here is what modest looks like in numbers."
> **Paper says:** CBT *"has a significant effect… and is **markedly superior to Treatment as Usual**,"* improving negative symptoms (MD −1.65), overall function (SMD 0.38), social skills (SMD 0.87), social functioning (SMD 0.19).

The original's caution was defensible but misattributed — the magnitudes *are* small, and "limited efficacy" is the review's **background**, not its finding. The rewrite relocates the caution to where it belongs.

---

## 3. Three anchors cannot be verified at all

Every source — Europe PMC, NCBI efetch, Crossref — returns no abstract.

| PMID | Role | Problem |
|---|---|---|
| **41920002** | **D10 anchor** — "The demoralization construct" | No abstract anywhere. DOI `10.4088/jcp.26com16383` — the `com` segment marks it a **commentary**. The annotation's claim that demoralization *"responds to different interventions"* than depression is the kind of statement that changes prescribing, and it currently rests on an unverifiable citation. |
| **42077010** | D10 KEEP — "Desire for hastened death" | No abstract anywhere. Europe PMC types it **`letter`**, article e133. The annotation presents a letter as a substantive teaching paper — a format misrepresentation independent of content. |
| **36525623** | **D12 closing paper** — Dodo bird verdict | No abstract anywhere; three pages (527–529), a commentary. And the article's **own subtitle names a different answer — "prioritizing process observation"** — which is not synonymous with the annotation's "common factors, deliberate practice." The library's designated closing line is currently an unsourced paraphrase the title does not corroborate. |

**None of these three should ship on the current citation.** Either read the full text and re-annotate, or replace the row. `42207918` (StatPearls, Meaning-Centered Psychotherapy) is fine as an orientation link but is a tertiary study guide with no outcome data — use it to orient, never as evidence.

---

## 4. Citation defect — the add-by-hand row had the wrong PMID

The Flückiger 2018 alliance meta-analysis was supplied as **PMID 30335453**. That resolves to **Elliott et al., *"Therapist empathy and client outcome: An updated meta-analysis,"*** Psychotherapy 2018 — reporting **empathy** r = .28.

The correct record for DOI `10.1037/pst0000172` is **PMID 29792475** — Flückiger, Del Re, Wampold & Horvath, *"The alliance in adult psychotherapy: A meta-analytic synthesis,"* reporting **alliance** r = .278.

Same journal, same year, nearly identical coefficient. **This row exists specifically to fix the "Norcross 2011" miscitation in WP-26** — shipping it with 30335453 would have replaced one miscitation with a subtler, harder-to-catch one. Use **29792475**.

---

## 5. Structural consequences — triage decisions to revisit

The corrections are not evenly distributed, and four of them hit anchors. **These are editorial decisions, not fixes:**

| Domain | What changed | Decision needed |
|---|---|---|
| **D3** | The anchor (40185617) is far more cautious than claimed | Promote **41365522** (BMJ Ment Health umbrella, OA) to sole anchor? It has the specific positive findings — physical barriers, platform screen doors, pesticide bans — where 40185617 has "small reduction, if any." |
| **D4** | The anchor (41217072) now argues *against* patient selection | Keep it as anchor with the corrected reading — it is still the best paper in the domain, and "offer it equally" is a cleaner teaching point than the one it replaced. |
| **D9** | The anchor (38279664) does not support MBT for self-harm | Consider promoting **36958077** (STPP for depression, IPD) to anchor. 38279664 remains valuable as a lesson in reading past effect size to the comparator. |
| **D12** | Both the anchor (40177337) and the closing paper (36525623) are compromised | The anchor is salvageable — "allegiance explains the result" is itself a hypothesis that gets tested, and here it failed, which is *arguably a better* evidence-limits lesson. The closing paper needs a full-text read or a replacement. |
| **D1** | The proposed on-ramp (38993343) is an instruments review | The domain now has no on-ramp. **29792475** (Flückiger) is the natural anchor; the on-ramp slot is open. |
| **D2b** | 34146994 is a null result | Keep it — but as a lesson in how thin an evidence base can be under a confident clinical habit. That is a *better* row than the one the annotation described. |

**One cross-cutting inconsistency worth fixing:** four rows involve **pediatric or adolescent populations imported into an adult inpatient list** without a flag — 41267566 (majority children/young people), 38279664's MBT-A arm, 40471224 (five adolescents), and part of 39046622. The file explicitly *cuts* other rows on exactly that basis (40311538, 41281737, 39797890, 42405914). Either the standard applies or it doesn't.

---

## 6. Rewritten annotations

All 46 rewritten annotations are in the three agent reports appended to this run. Representative examples of what the tightening produces:

**41110399** · D1 · CONFIRMED — *now carries the actual finding*
> A systematic review of 48 studies on what is associated with alliance quality in severe mental illness. The sharpest teaching point is a mismatch: *"Clinical symptom severity influenced MHP-rated TA, but not client-rated TA"* — how sick a patient looks changes what the clinician thinks of the alliance, not what the patient thinks of it. These are associations from observational studies, not trial effects.

**30520019** · D2 · SOFTENED — *direction held, magnitude did not*
> Pooled benefit over control is small and durable — g = 0.24, NNT 7.4, holding at 12 months (g = 0.21). One moderator matters: *"Comparisons with waitlist or non-standardized control treatments tended to be associated with larger effect sizes than standardized control treatments,"* so the margin over structured routine care is at the smaller end. The authors' own phrase is *"a small but sustained effect"* — carry the number, not just the slogan.

**21154340** · D6 · SOFTENED — *the hedges are part of the finding*
> Family intervention *"may decrease the frequency of relapse"* (RR 0.55, NNT 7), *"may also reduce hospital admission"* (RR 0.78, **CI 0.6 to 1.0**, NNT 8). The authors' conclusion: *"the treatment effects of these trials may be overestimated due to the poor methodological quality."* The same rigour-versus-effect-size lesson 15500811 teaches in CBTp, arriving in the domain's foundational citation.

**39837259** · D11 · SOFTENED — *the moderator is the finding*
> Adding brief CBT cut post-discharge ED visits by about three quarters (OR 0.25) — *"but **only among participants without SUD**."* On a dual-diagnosis unit that qualifier is the teaching point, and the authors conclude *"additional research is needed to improve the efficacy of BCBT-I for patients with SUD."*

---

## 7. Method notes — two things to carry into the runbook

**① Parallel literature agents can silently cross-contaminate.** Running three agents concurrently against the same API produced two independent incidents: one agent received Europe PMC responses to *other agents' queries* (well-formed JSON, real abstracts, wrong papers), and another had its scratchpad file overwritten by a sibling. **Both were caught only because the agents verified the echoed `request.queryString` and the returned `pmid` against what they sent.** An agent that did not check would have annotated against the wrong paper with no visible error.

**Runbook rule:** any batched literature fetch must assert that the response echoes the request. Isolate scratchpad paths per agent. This failure is silent by construction.

**② Provenance deviation, disclosed.** WebFetch was rate-limited (HTTP 429) on all three agents, and they fell back to direct `curl` against the Europe PMC public API rather than the browser path. The data is from the same public endpoint and each record was verified by PMID echo, so the content is sound — but the method departed from the sanctioned fetch path. **Re-run anything load-bearing through the browser path**, and note that the same rate-limiting is likely on any future parallel run.

---

## 8. Before any of this ships

1. **Fix the Flückiger PMID** → 29792475.
2. **Read the full text of the three unverifiable rows** (41920002, 42077010, 36525623) or replace them. Do not ship the demoralization treatment-response claim on a commentary with no abstract.
3. **Make the six anchor decisions** in §5.
4. **Resolve the adolescent-population inconsistency** — apply the standard or drop it.
5. **Correct the 40471224 DOI** (`10.4081/ripppo.2025.841`; the corruption is in Europe PMC as well as PubMed) and **add the 32428905 erratum note**.
6. **Resolve the Pharoah version question** — Europe PMC maps PMID 21154340 to `.pub2`, 2010, and the abstract's internals are consistent with that ("This 2009-10 update adds 21 additional studies, with a total of 53"). Crossref flags `.pub2` as superseded by `.pub3`. Confirm at the Cochrane Library which version this PMID is, and cite it explicitly.
7. **Your signature.** These annotations are now traceable to abstract text, but they are still drafts written by an agent from abstracts — not by you from the papers. Every one is a claim a student will act on.

---

## 9. What this pass proves

Three gates have now run on this material. Each caught something the previous one could not:

| Gate | Caught |
|---|---|
| Discovery (Europe PMC) | A **retracted** meta-analysis ranked first by relevance |
| Verification (retraction/OA) | A **dead DOI**, an **unflagged erratum**, a possible **superseded Cochrane version**, **14 OA upgrades** |
| Abstract check | **7 contradictions**, **3 unverifiable anchors**, **1 wrong PMID**, 12 overstatements |

None of the three required clinical judgment to run. All three required running.

The corollary is uncomfortable and worth stating plainly: **the annotations that survived unchanged are the ones about papers old enough to be familiar.** Every contradiction but one was in a 2024–26 paper. Recall is not a substitute for the abstract, and the newer the paper, the less it ever was.
