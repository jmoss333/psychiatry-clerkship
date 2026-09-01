# Unlicensed-claim sweep — 2026-09-01

Run: `python3 bin/sweep_unlicensed_claims.py`

**Why this exists.** The evidence gate protects every claim that *has* an annotation.
It is structurally blind to a sentence that asserts a finding and was never annotated —
there is nothing for it to check. Q39 on `rounds_questions.md` (issue #441) was found by
accident while triaging an unrelated P0. This sweep looks for the rest on purpose.

## Result

| | |
|---|---:|
| Shipped surfaces swept (`site_manifest.json`) | 91 |
| Lines flagged | 66 |
| …carrying a statistic | **28** |
| …on a page with **no bibliography at all** | **4** |

**The number is small, and that is the finding.** A naive first pass flagged 199 lines.
Three classes of false positive accounted for two-thirds of them and were removed before
anything was reported: CSS in HTML tools (`width:100%` reads as a percentage — 100% of
HTML hits), URL percent-encoding (`Episode+126%3A`), and the `Author et al. (2024)` form
the library actually uses, which the first attribution pattern did not match.

## The distinction that matters

24 of the 28 statistic hits sit on **one** page — `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` —
and that page **has a full bibliography with DOIs**. Its numbers are sourced at page
level and untraceable claim by claim. That is a real gap, and it is not the same defect
as having no source at all. Do not read "24" as "24 unsourced claims."

The clearest instance is the page's own summary table (L358–L370): thirteen rows, each
pairing an effect size with a study *design* — "Meta-analysis of 14 studies", "RCT
(n=200)", "Cochrane review (33 RCTs)" — and no study *identity*. A student cannot get
from a number to a paper.

## The four hard findings — a number, no bibliography, nothing to trace

### 1. `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md` L34 — **highest priority**

> **Psychoeducation** has the hardest inpatient numbers (readmission NNT 5) — and it's free.

This is the Xia 2011 Cochrane NNT, and **it is the superlative shape that PR #402
corrected elsewhere.** That fix replaced "the strongest evidence base of any single
psychological intervention" with wording carrying the reviewers' own limits — n = 206 of
5,142, "hospital-based studies of limited quality", "the true size of effect is likely to
be less than demonstrated", last search 2010. This page still carries the uncorrected
form. The correction landed on one page and missed a sibling.

The verified span already exists (`xia-2011`, direction `mixed`). Nothing new needs
verifying — the claim needs rewording to match the span the library already holds.

### 2. `03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md` L27

> Reported incidence across population studies is **~0.9…**

A specific incidence for postpartum psychosis attributed to "population studies." No
study named, no bibliography on the page.

### 3. `03_Core_Topics/Perinatal/…` L13 — weaker

A management-recommendation line combining a comparative with a figure. Worth a read;
lower confidence than #2.

### 4. `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` L25

> Choose antipsychotics by side-effect profile (CATIE), not by recency — 74% stopped
> their drug within 18 months…

**Attested, but un-anchored.** The oe_scanner attestation log shows this exact figure
signed off on 2026-07-31 ("CATIE discontinuation figure (74% by 18 mo; perphenazine
comparable) added 2026-07-23 (Lieberman 2005, NEJM)"). CATIE is named, so it is traceable
in principle. What is missing is the inline citation — a low-severity instance of the
same pattern.

## Recommended disposition

1. Fix #1 in the same change as its span reference. It is a known-corrected claim in an
   uncorrected place.
2. Source or soften #2.
3. Anchor #4 to Lieberman 2005; the fact is right and already attested.
4. Treat `evidence_inpatient.md` as its own work package, not 24 separate items. The
   summary table is the natural unit: thirteen rows, each needing a study identity.

## What the sweep cannot do

It cannot tell a wrong claim from a right one — only where a reader cannot check. Every
hit needs a human read. It also flags nothing on the 43 shipped pages that carry no
statistics at all, which is most of them.
