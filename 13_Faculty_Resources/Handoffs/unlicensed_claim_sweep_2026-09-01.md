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
| Lines flagged | 60 |
| …carrying a statistic | **26** |
| …on a page with **no bibliography at all** | **2** |

**The number is small, and that is the finding.** A naive first pass flagged 199 lines.
Five classes of false positive accounted for two-thirds, each removed only after reading
the hits by hand:

| Class | Why it fired |
|---|---|
| CSS in HTML tools | `width:100%` reads as a percentage — **100%** of HTML hits |
| URL percent-encoding | `Episode+126%3A` reads as `26%` |
| `Author et al. (2024)` | the parenthesised year form the library actually uses |
| `[27 ✓, 28 ✓]` | multi-reference anchors, vs a pattern expecting `[27 ✓]` |
| `[^source-id]` | **the repo's own claim-anchor syntax** — the strongest attribution it has |

The last one mattered most: it made seven correctly-anchored teaching pages look unsourced.
Calibration was the work; the first number was noise.

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

### 1. `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md` L34 — **FIXED 2026-09-01**

> **Psychoeducation** has the hardest inpatient numbers (readmission NNT 5) — and it's free.

This is the Xia 2011 Cochrane NNT, and **it is the superlative shape that PR #402
corrected elsewhere.** That fix replaced "the strongest evidence base of any single
psychological intervention" with wording carrying the reviewers' own limits — n = 206 of
5,142, "hospital-based studies of limited quality", "the true size of effect is likely to
be less than demonstrated", last search 2010. This page still carries the uncorrected
form. The correction landed on one page and missed a sibling.

The verified span already exists (`xia-2011`, direction `mixed`). Nothing new needed
verifying — the claim was reworded to match the span the library already holds.

**Fixing it turned up a second instance on the same page that the sweep cannot see.**
The L18 table cell read *"Strongest single inpatient psychological intervention: readmission
NNT 5, relapse NNT 9 (Xia, Cochrane 2011)"* — the exact superlative #402 removed, and it **is**
attributed, which is why the sweep passed it. The citation does not license the superlative.

That claim sits in the gap between both tools: the sweep only finds claims with *nothing*,
and the span gate never sees this page because its `topic_meta.json` entry has no
`evidenceIds`. Both cells are now corrected. Wiring `evidenceIds` on this page is a separate
pass — per the rule 3 lesson in #402, adding ids to a page obligates anchoring it.

### 2–3. Perinatal L27 and L13 — **BOTH FALSE POSITIVES, corrected 2026-09-01**

The sweep did not recognise `[^source-id]`, which is **this repo's own claim-anchor
syntax** — not a markdown footnote. A claim anchor binds one claim to one
`evidence_registry.json` id, is validated by `validate_claim_anchors.py`, and is stripped
by `build_deploy.py` so learners never see it. It is the strongest attribution mechanism
in the library, and the sweep was blind to it.

`validate_claim_anchors.py` reports **20 anchors across 7 opted-in pages, all resolving to
declared evidence.** The perinatal page was correctly anchored the whole time — its L27
incidence figure carries `[^vanderkruik-2017-postpartum-psychosis-prevalence]` and its
recurrence figure `[^wesseloo-2016-postpartum-relapse]`.

The sweep now recognises anchors. Perinatal drops from 2 hits to 1: L13, a long management
paragraph whose "nearly triples postpartum relapse (~66% off medication vs ~23% on
prophylaxis)" is un-anchored on an otherwise-anchored page. Worth an anchor; not an
unsourced claim — and note `validate_claim_anchors.py`'s own docstring records that this
exact figure was already corrected once, from "roughly doubles" to "nearly triples".

### 4. `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` L25

> Choose antipsychotics by side-effect profile (CATIE), not by recency — 74% stopped
> their drug within 18 months…

**Attested, but un-anchored.** The oe_scanner attestation log shows this exact figure
signed off on 2026-07-31 ("CATIE discontinuation figure (74% by 18 mo; perphenazine
comparable) added 2026-07-23 (Lieberman 2005, NEJM)"). The page already carries anchors
elsewhere, so this is the same half-anchored shape as perinatal L13.

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
