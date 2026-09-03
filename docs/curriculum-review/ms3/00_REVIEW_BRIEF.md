# MS3 curriculum — complete content transcript for clinical review

**Site:** `une-ms3-psychiatry` · **Audience:** MS3 — UNE medical students
**Generated:** 2026-09-03 from build `1a26852` · exporter: `13_Faculty_Resources/_automation/export_curriculum_review.py`

## Who this is for

Third-year medical students on a six-week adult inpatient psychiatry clerkship. Most have no prior psychiatry exposure. The terminal assessments are the NBME psychiatry shelf / COMAT and clerkship OSCE stations.

## What is in scope

This transcript is assembled from the **built site**, not the source tree, so it is exactly what a learner can reach: sidebar order, audience-scoped page set, resident overrides, build-injected crisis blocks and all. Everything below is included in full — no summarisation, no truncation of clinical text.

| Content | Count |
|---|---|
| Sidebar sections | 12 |
| Narrative pages (markdown) | 80 |
| Interactive tools | 23 |
| Deep-link-only (hidden) surfaces | 10 |
| Words of narrative curriculum | 100,361 |
| Practice question-bank items | 192 |
| Audio-companion quiz decks / questions | 79 / 437 |
| Communication cases | 12 |
| Diagnostic reasoning cases | 4 |
| Family systems scenarios | 8 |
| Registered evidence sources | 107 |
| Annotated claims with verbatim source spans | 49 |

## Document set

| File | Contents |
|---|---|
| `01_NAVIGATION_MAP.md` | Navigation map — every surface this site ships |
| `02_CURRICULUM_V01.md` | Curriculum volume 1 |
| `02_CURRICULUM_V02.md` | Curriculum volume 2 |
| `02_CURRICULUM_V03.md` | Curriculum volume 3 |
| `02_CURRICULUM_V04.md` | Curriculum volume 4 |
| `02_CURRICULUM_V05.md` | Curriculum volume 5 |
| `02_CURRICULUM_V06.md` | Curriculum volume 6 |
| `02_CURRICULUM_V07.md` | Curriculum volume 7 |
| `02_CURRICULUM_V08.md` | Curriculum volume 8 |
| `02_CURRICULUM_V09.md` | Curriculum volume 9 |
| `02_CURRICULUM_V10.md` | Curriculum volume 10 |
| `02_CURRICULUM_V11.md` | Curriculum volume 11 |
| `02_CURRICULUM_V12.md` | Curriculum volume 12 |
| `02_CURRICULUM_V13.md` | Curriculum volume 13 |
| `A1_QUESTION_BANK.md` | Question bank |
| `A2_CASE_SIMULATIONS.md` | Case simulations and rehearsal banks |
| `A3_AUDIO_COMPANION_QUIZZES.md` | Audio companion quiz decks |
| `A4_EVIDENCE_BASE.md` | Evidence registry and verbatim source spans |
| `A5_COVERAGE_MATRICES.md` | Coverage matrices |

`MS3_CURRICULUM_COMPLETE.md` is every file above concatenated in order — the single running document. The split files exist so a reviewer can work one reviewable pass at a time.

## Standing constraints a reviewer should know

These are deliberate editorial policies, not omissions. Flag a violation; do not flag the policy itself.

1. **The library teaches administration; it does not reproduce instruments.** Pages teach how to elicit and interpret a scale and link to the official form. Verbatim item stems, anchor ladders and fillable reproductions of copyrighted instruments are prohibited. (COWS anchors in `withdrawal.html` ship under a recorded interim waiver.)
2. **Crisis contacts live only in `crisis_resources.json`** and are injected at build time into pages that opt in. A page doing risk work without a crisis block is a finding; a hard-coded 988 in page prose is also a finding.
3. **No PHI.** All clinical material is synthetic or de-identified composite.
4. **No dose literals in rehearsal tools** (`rp-*`, `*-trainer`). Narrative pages and reference pages may carry doses; the trainers may not.
5. **Every claim about a paper must match that paper's own words.** Appendix A4 pairs each claim with the verbatim span that licenses it.

## What a clinical review should return

For each finding, please give: **location** (file + page slug or item id), **severity**, **the claim as written**, **what is wrong**, and **suggested replacement text**. Suggested severity rubric:

| Severity | Meaning |
|---|---|
| **S1 — unsafe** | Following this would harm a patient (wrong drug/route/monitoring, a missed can't-miss, an unsafe first move, a risk assessment that licenses premature discharge). |
| **S2 — wrong** | Factually incorrect but not directly dangerous (mis-stated criteria, wrong mechanism, a trial result mis-summarised, a mis-keyed question). |
| **S3 — outdated / out of step** | True once, or true elsewhere, but not current practice or not how this is done on an adult inpatient unit. |
| **S4 — misleading emphasis** | Accurate but framed so a learner will draw the wrong conclusion, or a nuance omitted that changes management. |
| **S5 — level mismatch** | Correct but pitched wrong for this audience (MS3) — too advanced, too thin, or a responsibility the learner does not actually hold. |

High-yield places to concentrate: the `topic_meta` **can't-miss**, **rule-out** and **first move** fields (these are the site's most assertive clinical claims and they render as standalone cards, stripped of the page's hedging); the keyed answers and rationales in Appendices A1 and A3; the safety pages and their tools; and any place where the `topic_meta` overlay and the page prose beneath it disagree.
