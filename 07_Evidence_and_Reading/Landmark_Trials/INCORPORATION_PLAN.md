# Incorporation Plan — OpenEvidence "Landmark Psychiatry" into the MS3 Clerkship Library

*Drafted from `OPENEVIDENCE REVIEWS.docx` (parsed 2026-06-28). Faculty planning doc — not student-facing.*

## 1. What the document actually is

Three OpenEvidence outputs in one file:

| Block | Content | Count | Where it goes |
|---|---|---|---|
| A. The 50 Landmark Articles | Per-paper: why-it-matters, key findings, clinical pearls, ★ importance, difficulty, "still practice-changing?", follow-up | 50 papers (deduped from 2 partial copies) | New **Landmark Trials** evidence section + cross-links |
| B. Final Synthesis | Top-20, **6-week progressive reading order**, high-yield table, the canon | — | Wires into Week 1–6 pages |
| C. Practice-Changing 2020–Present | FDA approvals, RCTs, meta-analyses, systems of care | 16 items | New **"What's New (2020–present)"** page |

**Audience = student/clinician (evidence layer), not patients.** This belongs in the clerkship hub's `07_Evidence_and_Reading`, *not* the patient `psychoed-library/`. Naming it "psychoeducation" in conversation is fine, but routing matters: these are trial summaries for MS3s, so they live with the curriculum, behind the same faculty-attestation gate as the rest of the student site.

## 2. The backbone is already built (Phase 0 — done)

Parsed into a single source of truth that all three workstreams (your pages, Codex quizzes, NotebookLM audio) key off:

- `LM_master_index.csv` / `.json` — 50 papers, IDs **LM-01…LM-50**, with topic bucket, ★ importance, difficulty, DOI, verbatim citation (+ PubMed IDs).
- `reading_order_by_week.md` — the 6-week order + Top-20.
- `practice_changing_2020plus.csv` — the 16 recent items (PC-01…PC-16).

**Quality check:** 49/50 carry a DOI (the lone gap, #47 Delay & Deniker 1952, is genuinely pre-DOI). I verified a sample against Crossref — CATIE `10.1056/NEJMoa051688` → exact match (Lieberman, NEJM 2005;353:1209). DOIs were taken verbatim from each paper's own citation line, not fuzzy-matched.

**Topic distribution of the 50:** Psychosis 9 · Mood 9 · Acute & Safety 8 · Skills/Therapy/Systems 8 · Geriatric/Delirium 7 · Substance Use 4 · Anxiety/Trauma/OCD 4 · Personality 1. *(Perinatal and Psychopharmacology drew 0 — that material is in the 2020+ block; see §7 gap note.)*

## 3. Shared IDs + naming convention (so the 3 workstreams auto-link)

The single most important coordination decision: **everything keys off the LM ID.**

| Workstream | Owner | Unit | Filename convention | Renders as |
|---|---|---|---|---|
| Evidence pages | Claude | 50 cards + 6 week blocks + 2020 page | `content/landmark_trials.md` (+ anchors `#lm-01`) | hub pages |
| Quizzes | Codex | per-paper item set | `quiz_LM-01.json` | "Quiz yourself" button on each card |
| Audio overviews | You (NotebookLM) | per-paper (Top 20) + per-week (rest) | `audio_LM-01.mp3` / `audio_week3.mp3` | "Listen" button on each card / week header |

Each card checks for a matching `quiz_*`/`audio_*` asset and lights up the button when present — so you and Codex can drop files in at any time and they appear automatically. **Hand Codex the LM IDs + the quiz JSON schema below; tell NotebookLM to name exports by LM ID or week number.**

```
quiz_LM-01.json  →  { "id":"LM-01", "items":[ {"stem":"…","options":["…"],"answer":1,"rationale":"…","difficulty":"intermediate","doi":"10.1056/NEJMoa051688"} ] }
```

## 4. Per-paper card template (reusable, renders from the manifest)

```
### {number}. {short_title}   ★{importance}/5 · {difficulty}
**Bottom line.** {one-sentence takeaway}
**Why it matters / key findings.** {why_matters → key_findings, paraphrased}
**Clinical pearls.** {bulleted pearls}
**Changes practice?** {practice_changing}
**Source.** {primary_citation}  ·  [DOI](https://doi.org/{doi}) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/{pmid})
**On the unit →** {linked Core-Topic page} · {linked tool}   |   🎧 Listen · ✅ Quiz yourself
```

## 5. Wiring into the existing hub (Phase 2)

- **Week pages (1–6):** append "📚 This week's landmark papers" using the doc's 6-week order — which already lines up with your week themes:

  | Hub week | Theme | Landmark papers (LM #) |
  |---|---|---|
  | 1 Foundations | model, alliance, recovery, safety basics | 48, 49, 47, 33, 43, 11, 10, 37 |
  | 2 Mood/Psychosis/Pharm | depression, ECT, ketamine, bipolar | 3,4,36,32,42,20,16,21,13,22,9,14,8,46 |
  | 3 Psychotherapy/Personality | CATIE/clozapine, antipsychotic MA, FEP | 1,2,30,19,17,31,18 |
  | 4 Family/Systems | delirium, catatonia, neurocognitive | 5,6,35,12,39,40,38,50 |
  | 5 Acute/Emergency | DBT, CBT, PTSD, SUD, MI | 7,26,27,28,29,25,23,24,34 |
  | 6 Integration | collaborative care, recovery, systems | 15,41,43,44,45 |

  *(The doc's week labels differ slightly from your hub's; I've aligned them above — confirm or tweak.)*
- **Core Topic pages:** add a "Landmark evidence" callout linking the topic's LM cards (mapping already in the manifest's `topic_bucket`).
- **Tools ↔ papers:** C-SSRS tool ↔ LM-11 (Posner) · Catatonia page ↔ LM-12 (Bush-Francis) · Delirium ↔ LM-05/06 (CAM/HELP) · Withdrawal ↔ COMBINE/buprenorphine (LM-23/24) · Suicide tools ↔ LM-09/10/37.
- **Search:** the existing build auto-indexes new pages — no extra work. I'll add a few synonyms (e.g., `catie`→antipsychotic, `cssrs`→suicide, `help`→delirium) so trial acronyms resolve.

## 6. QA / risk gates (before any student release)

1. **DOI verification — all 49.** Spot-check passed (CATIE ✓). Run the full set through Crossref; flag any DOI whose title ≠ the cited paper. *(I can do this now.)*
2. **Verify the post-cutoff 2020+ items.** A few reference 2025–2026 events — e.g., "Auvelity agitation-in-Alzheimer's indication (2026)," "psilocybin meta-analysis (Kishi 2026)," "DBT vs SSRI in BPD (AJP 2025)." These are after my knowledge cutoff and are exactly where an AI source can hallucinate. **Flag: verify each against a primary source before publishing.** *(I can web-verify these.)*
3. **Copyright.** OpenEvidence prose is AI-generated; don't paste it verbatim onto the public site. Cards **paraphrase** into your own pearls and **attribute to the original trial/journal**, not "per OpenEvidence."
4. **Editorial judgments are the source's, not yours.** The ★ importance / difficulty / "still practice-changing?" calls are OpenEvidence's opinions — present as editorial and confirm on attestation.
5. **Attestation gate.** These are evidence claims → same per-page sign-off as the rest of the hub; ships behind the "pending faculty review" banner until you stamp it.

## 7. Gaps & decisions

- **Perinatal & Psychopharmacology have 0 core papers.** Both are covered in the 2020+ block (zuranolone, brexanolone, Pillinger metabolic MA). Decide whether to promote 1–2 into the core set so every Core-Topic page has a landmark anchor. *Recommend: yes — add brexanolone/zuranolone (perinatal) and Leucht/Huhn (already #19/#30) as the psychopharm anchors.*
- **Audio granularity (the one high-leverage choice).** Per-paper audio = 50 NotebookLM runs; per-week = 6. **Recommended default: per-week audio for all six weeks + per-paper audio only for the Top-20.** Naming convention above supports both. Tell me if you'd rather do all-50.

## 8. Phased rollout

- **Phase 0 — done.** Parse → manifest + DOI spot-check.
- **Phase 1 — verify.** All 49 DOIs + the 2025–26 items; you attest the editorial ratings.
- **Phase 2 — build.** Generate the 50 cards + master index + "What's New 2020–present" page from the manifest; wire week/topic/tool cross-links; add search synonyms.
- **Phase 3 — converge.** Codex quizzes + your NotebookLM audio drop in by LM ID; buttons light up.
- **Phase 4 — ship.** Rebuild search, deploy behind attestation banner, you stamp.

## 9. What I can do next (your call)

a. **Verify** all 49 DOIs + the handful of 2025–26 "practice-changing" claims, and report any that don't check out.
b. **Build Phase 2** now — the Landmark Trials index page + the 2020-present page from the manifest, deployed behind the review banner, with quiz/audio buttons stubbed and ready.
c. **Spec for Codex** — a one-pager giving the LM IDs + quiz JSON schema so its quizzes target the right anchors, plus the audio naming convention for your NotebookLM exports.

*Joshua Moss, MD | Psychiatrist · Educational; evidence claims pending faculty attestation. No PHI.*
