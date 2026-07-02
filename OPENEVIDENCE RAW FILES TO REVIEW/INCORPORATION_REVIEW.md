# OpenEvidence Content — Incorporation Review

*Reviewed 2026-06-29 against the live MS3 inpatient psychiatry hub. Goal: capture the high-yield material, avoid duplication, and avoid overcomplexity (scope creep beyond an MS3 clerkship).*

## Bottom line

Four files. **Two are clear wins** (incorporate), **one should be merged** into an existing page rather than added as a new one, and **one is out of scope** for an MS3 site and should be deferred.

| # | File | What it is | Overlap with library | Decision | Target | Effort |
|---|------|-----------|----------------------|----------|--------|--------|
| 1 | **100 Questions** | 100 rounds Q&A (model answer + evidence + key paper + pearl), 10 topic blocks | **Low** (new format; also patches COMAT gaps) | **Incorporate** | New page: *High-Yield Rounds Questions* | Low–Med |
| 2 | **Reviews — Inpatient** | 13-domain evidence review (Strongest Evidence / Landmark / Controversies / Practical Rec) | Topic overlap high; **evidence layer is new** | **Incorporate (consolidated)** | New page: *Evidence-Based Inpatient Psychiatry* | Med |
| 3 | **Reviews — Meds (20)** | Ranked psychopharm landmark curriculum | **~50% already in the 50-paper spine** | **Merge, don't duplicate** | Section in `psychopharm_primer` + spine additions | Low–Med |
| 4 | **Top 200 Canon** | 200-paper residency/board canon | **Audience mismatch** (residency-level) | **Defer** | Optional labeled appendix at most | Hold |

---

## 1. 100 Questions → INCORPORATE (new student page)

**What it is.** "100 High-Yield Psychiatry Rounds Questions," organized into Psychotic (1–15), Mood (16–35), Anxiety/OCD (36–45), SUD (46–60), Delirium/Dementia/Capacity (61–68), Personality/Psychotherapy (69–80), Neurodevelopmental (81–87), Sleep (88–90), Eating (91–93), Psychopharm principles (94–100). Each item = **Answer + Evidence + Key paper + Pearl** — i.e., rounds "pimping" prep, not multiple choice.

**Why it doesn't duplicate.** Active Recall is landmark-paper **MCQ**; Shelf Mode is **vignette MCQ**. This is **short-answer + pearl** — a different study mode (what to say when asked on rounds). It also **fills COMAT blueprint gaps** your Core Topics pages don't currently cover: **Neurodevelopmental (ADHD/autism), Sleep, Eating disorders**. And its "Key paper" citations reinforce the landmark spine.

**How to incorporate (minimal).** One new content page, *High-Yield Rounds Questions*, grouped by the site's existing topic order, in the house markdown style. Optional follow-on: also expose as a flip-card Active Recall deck (Q front / answer+pearl back). Place under "Skills, cases & exam" or "Evidence & reading."

**Cleanup required.** Strip the leading OpenEvidence meta lines ("Planning: …", "Now I have comprehensive evidence…"). Decide whether to keep the bracketed `[n]` citation markers (recommend: convert to a short "Key paper" line per question, drop raw bracket numbers).

## 2. Reviews — Inpatient → INCORPORATE as ONE consolidated evidence page

**What it is.** "Evidence-Based Adult Inpatient Psychiatry — Admission Through Discharge." 13 domains — Suicide assessment, Violence risk, Agitation, Rapid tranquilization, Seclusion/restraint, Delirium, Catatonia, Capacity, Involuntary treatment, Family meetings, Discharge planning, Readmission reduction, Follow-up/collaborative care — each with **Strongest Evidence / Landmark Studies / Current Controversies / Practical Recommendations**, plus an evidence-hierarchy summary table.

**Duplication risk + how to avoid it.** The *topics* overlap your teaching pages and tools (cssrs, violence, agitation.md, delirium.md, catatonia.md, capacity), but the *content* is a distinct **evidence/controversies layer** your "how-to" pages don't carry. **Do not** create 13 new per-topic pages (that duplicates and fragments). Instead create **one** consolidated reference page — *Evidence-Based Inpatient Psychiatry* — that students/faculty open when they want the "what does the evidence actually say" view. It pairs naturally with the new topic-template "In 30 seconds / Can't-miss" blocks and can later feed `topic_meta.json` evidence lines.

**Effort.** Medium — mostly clean conversion of the .docx to house-style markdown (preserve the 4-part structure + the summary table).

## 3. Reviews — Meds (20 ranked) → MERGE (don't add a new list)

**What it is.** "The 20 Most Important Papers in Psychopharmacology," ranked, class-tagged, with a summary table, near-misses, and a reading order by training phase.

**Overlap (keyword dedup vs the 50-paper spine).**

- **Already in the spine (~10):** Cipriani (21 antidepressants), STAR*D, CATIE, Kane (clozapine), BALANCE, UK ECT Review, Sackeim, MTA, Leucht (maintenance), Hammad/Bridge (youth black-box).
- **Net-new candidates (~9–10):** **Saitz** (symptom-triggered benzodiazepines — ties to your CIWA tool), **Pillinger** (metabolic effects of 18 antipsychotics — ties to your Nutrition & Metabolic page), **Zarate** (ketamine TRD), **Tiihonen** (real-world LAIs), **Turner** (antidepressant publication bias), **Fudala** (buprenorphine/naloxone OUD), **Furukawa** (optimal SSRI dosing), **Kaul/xanomeline** (KarXT, non-dopaminergic — very current), **Lichtenstein** (ADHD meds and criminality).

**How to incorporate (minimal, no duplication).** Add a concise **"Key psychopharmacology papers (ranked)"** section to `psychopharm_primer.md` that lists the 20 with one-line takeaways, **cross-linking** the ones already in the landmark audio/quiz set rather than re-describing them. Separately, queue the ~9 net-new papers as **candidate spine additions** via the existing `LM_additions.csv` / `practice_changing_2020plus.csv` mechanism — several slot directly under pages you already have. Don't stand up a second standalone "20 papers" page.

## 4. Top 200 Canon → DEFER (this is the overcomplexity line)

**What it is.** "The Psychiatry Canon: 200 Papers Every Graduating Psychiatrist Should Know" — Top 25 + 12 subdomains including **Neuroscience & Genetics** and **Neuromodulation**.

**Why defer.** Explicitly aimed at the **graduating psychiatrist** (residency completion / boards). 200 papers — including basic neuroscience and genetics — is **well beyond MS3 clerkship scope** and would dilute the right-sized 50-paper MS3 spine and overwhelm the audience. Incorporating it wholesale is the main overcomplexity risk in this batch.

**Options (in order of restraint).** (a) **Skip** from the student core (recommended default). (b) Keep as a single, clearly-labeled **optional "Going deeper — residency-level canon"** link, low prominence, so the breadth exists without cluttering the MS3 path. (c) **Mine** it only to validate/augment the 50-spine with a handful of MS3-appropriate additions, and otherwise leave aside. Recommend (a) or (c); avoid surfacing all 200 to students.

---

## Provenance & attestation (applies to all)

- These are **AI/OpenEvidence-generated** → same rule as the rest of the site: **AI-drafted, pending faculty attestation**, routed through **Review & Attest** before student release; the bracketed `[n]` citations want a verification pass.
- **Strip OpenEvidence's "Planning:/Now I have…" preamble** lines on the way in.
- Keep external-facing framing free of internal project terminology (standard site rule).

## Recommended build order

1. **Rounds Questions page** (P1) — biggest net-new student value, lowest duplication, patches COMAT gaps (Sleep/Eating/Neurodevelopmental).
2. **Evidence-Based Inpatient Psychiatry** consolidated page (P1) — one page, distinct evidence layer.
3. **Merge the 20 meds papers** into `psychopharm_primer` + queue the ~9 net-new for the spine (P2).
4. **Top 200** — hold for your decision (skip vs. optional appendix).

*Reviewer: prepared for Joshua Moss, MD · educational; verify citations before student release.*
