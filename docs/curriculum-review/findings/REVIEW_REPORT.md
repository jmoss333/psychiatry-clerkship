# Clinical-accuracy review — findings report

**Reviewed:** the complete per-audience curriculum transcripts in `docs/curriculum-review/`
(MS3 + resident), generated 2026-09-01 from build `455ee87`, transcript tree at `099ef62`.
**Method:** `REVIEW_PROMPT.md` §1 applied one reviewable pass at a time per the §2 pass
schedule; every S1/S2 finding then re-adjudicated in a fresh context per §3, with primary
sources (PubMed abstracts) consulted where a finding turned on what a paper actually reported.
**Date:** 2026-09-01.

## How the passes were organised

- The two audiences were deduplicated at surface level before spending passes: A1/A3/A4 are
  byte-identical across sites (reviewed once, findings `audience: "both"`); 335 of 424
  resident content blocks are identical to MS3, so resident passes covered only the real
  deltas (resident V10/V11 in full, delta assemblies for V01/V04/V05/V06/V07/V09/V13/V14 and
  the resident A2 cases).
- The two oversized appendices were chunked (A1 → 3 passes, A3 → 3 passes) so each got a
  real read rather than a shallow one — 26 review passes in all, each a full read of its
  material before any finding was written.
- `bin/sweep_unlicensed_claims.py`'s 2026-09-01 handoff was read first; its four hard hits
  were handed to the relevant passes to judge on the merits (outcomes below).

## Ledger

| Stage | Count |
|---|---|
| Raw findings returned by the 26 passes | 171 (8 S1 · 87 S2 · 7 S3 · 67 S4 · 2 S5) |
| S1/S2 adversarially verified (§3, fresh context) | 95 of 95 |
| — confirmed as filed | 59 |
| — partially confirmed (corrected finding substituted) | 29 |
| — **rejected** (the finding itself was wrong) | 7 |
| **Final findings** (`findings.json`) | **164 (8 S1 · 76 S2 · 10 S3 · 68 S4 · 2 S5)** |
| By audience | both sites 94 · resident-only 53 · MS3-only 17 |

Every quote in `findings.json` resolves verbatim, exactly once, against the transcript file
it names. S3–S5 findings were not individually re-verified; treat them as reviewer judgment.
`rejected.json` keeps the seven findings that failed verification, with reasoning — they are
part of the record precisely because acting on them would have *introduced* errors.

## Overall verdict

The library is in strong clinical shape for its size: across ~210 K words, 192 question-bank
items, 437 audio-quiz questions, 46 evidence annotations and both audiences' case material,
the reviewers found **no mis-keyed item in the human-authored question bank**, correct keyed
answers on nearly every embedded quiz, accurate high-stakes teaching on toxidromes,
catatonia, capacity, withdrawal and med-legal content, and an evidence appendix (A4) in far
better condition than the 2026-08-21 pass found it (no claim inverts its span; what remains
is qualifier drift). The defects that survive verification cluster in five systemic patterns
rather than being scattered randomly — which is good news, because each pattern has a
one-decision fix.

## The eight S1 findings (fix first)

| id | Where | What |
|---|---|---|
| RSAF-F001 | resident `agitation.md` can't-miss card | Catatonia absent from the pre-D2-blocker exclusion list — excited catatonia matches the page's own scenario and an antipsychotic there risks precipitating NMS/malignant catatonia. |
| RSAF-F002 | resident `rp-agitation.html` trainer pack | The SGA choice carries no hazard for parkinsonism/Lewy body or catatonia — the trainer stays silent in the two scenarios it exists to rehearse. Corrected splice (hazardIf, no dose literals) supplied. |
| RSAF-F003 | resident `cl_reference.md` SS/NMS row | The 2 a.m. reference omits sedation→intubation→paralysis for severe hyperthermia, fluid resuscitation for NMS rhabdomyolysis, and dopaminergic reinstatement in withdrawal-precipitated NMS. |
| RSAF-F009 | resident `cl_reference.md` rule-out card | The febrile-rigid-altered differential lists only drug syndromes — CNS infection and heat stroke are missing (plus a magnesium unit error, corrected in verification). |
| RV11-F001 | resident SS-vs-NMS case | NMS rechallenge guidance omits the prohibition on depot/LAI antipsychotics — in a group-home adherence stem where an LAI is exactly what a resident would reach for. |
| MS3V10-F001 | MS3 suicide-risk COTW | "No method detail" safe-messaging framing over-applied: the firearm-access question and secure-storage counselling have been deleted from means restriction. |
| A1C2-F001 | `qb_otherdx_009` | Keyed option teaches command hallucinations are "ego-syntonic and acted upon" — a false discriminator that licenses reassuring a postpartum mother distressed by commands about her infant. |
| A2MS3-F001 | delirium reasoning case | Keyed-best workup omits alcohol/sedative withdrawal in a post-op-day-2 vignette where it is the one rapidly fatal, benzodiazepine-treated cause. |

Note the concentration: five of eight sit in the resident safety delta (the C-L numbers
reference and the agitation surfaces). The pattern across all five is the same — the
material is right in what it asserts and dangerous in what it omits at the point of action.

## Systemic patterns (each is one work package, not N tickets)

1. **Overlay cards drift from their own prose.** The predicted failure mode was confirmed
   repeatedly: TL;DR/can't-miss/key-point cards strip the hedge or invert the number their
   own page states correctly (firearms filed as "static" on `suicide.md` while the page
   teaches means restriction; "doubles" vs the prose's "nearly triples" on perinatal; an
   OUD TL;DR describing a naloxone reversal that isn't in the case; the clozapine–smoking
   mechanism inverted in a can't-miss card over correct prose; "82% reduction" beside rates
   that compute to 67%). The card is what a rushed learner reads — audit overlays against
   prose as a class.
2. **The machine-extracted audio decks (A3) are the highest-defect content**, exactly as
   the pass schedule predicted: 13 surviving S2s, dominated by trial mis-summaries —
   comparators invented (STEP-BD psychosocial vs "medication alone"), landmark results
   inverted (TDCRP "all active treatments beat placebo"; CATIE's EPS signal denied),
   acceptability outliers swapped (Cipriani 2018). Every claim in these decks that names a
   trial needs its results section, not its title.
3. **Citation integrity is the quiet failure of the reference surfaces**: seven of fifty
   DOI links on the Landmark Trials page open a different paper than the entry names
   (verified digit-for-digit); the resident Canon carries four wrong paper-summaries, an
   unedited chatbot artifact, and an unmappable reference dump; `evidence_inpatient.md`
   ships a chat closer and dangling figure captions. Generated output reached learners
   without an editing pass — the provenance cluster, not each link, is the fix.
4. **Crisis-block scope has real gaps**: `t_anxiety.md` (safetyLevel-high, coaches suicide
   and DV screening) was never in the required-marker set; the FRST violence tool is the
   one active risk surface in the safety section without a block; the resident COTW risk
   pages hard-code 988 in prose — and verification established that resident-only markdown
   never passes through `crisis_block.inject_markdown` at all, so the fix is partly build
   infrastructure, partly a governance decision on scope.
5. **Absolutist safety slogans that drop their own exception**, taught in multiple places:
   "thiamine before glucose, every time" (three surfaces; the never-delay-emergent-dextrose
   nuance survives only where one item states it), CIWA-driven dosing extended to
   established DT and to post-seizure presentations, and suicide-risk phrasing that lets
   euphemistic asks grade as "plain" screening in the SP tool.

## Sweep follow-ups (from the 2026-09-01 unlicensed-claim handoff)

- **Xia 2011 / "readmission NNT 5"**: verification *overturned* the wrongness claim — the
  Cochrane abstract itself reports NNT 5. What survives (S3/S4, corrected findings) is the
  superlative framing stripped of the reviewers' own limits, per PR #402's precedent.
- **Perinatal incidence figures**: verified correct and traceable (VanderKruik 2017,
  Wesseloo 2016); the real defect on that page is the overlay's "doubles" (S2).
- **Q39 / issue #441**: confirmed — RR 0.66 is Cochrane 2022's *failure-to-respond* RR,
  deployed as if it were symptom improvement; re-express with the review's identity.
- **CATIE 74%**: judged accurate and fairly framed; unflagged.
- **`evidence_inpatient.md` summary table**: the design-not-identity pattern confirmed as a
  work package; its flagship "82%" is internally wrong (two-paper conflation, corrected
  finding supplies provenance) and one OR is glossed as a risk reduction.

## Per-pass results (post-verification)

| Pass | Material | Findings |
|---|---|---|
| MS3V05 | safety curriculum (14 surfaces) | 3 S2 · 3 S4 |
| A1C1/A1C2/A1C3 | question bank, 204 items | 1 S1 · 5 S2 · 1 S3 · 5 S4 |
| A3C1/A3C2/A3C3 | audio decks, 79 decks / 437 q | 13 S2 · 1 S3 · 5 S4 (2 rejected) |
| A4 | evidence spans, 46 annotations | 1 S2 · 3 S4 |
| A2MS3 | case simulations | 1 S1 · 1 S4 |
| MS3V01–V04 | orientation, SP tool, core topics | 6 S2 · 2 S3 · 8 S4 |
| MS3V06–V07 | psychopharm, therapy, family | 3 S2 · 3 S3 · 5 S4 (1 rejected) |
| MS3V08–V09 | rounds Q&A, exam prep, COTW | 14 S2 · 1 S3 · 2 S4 (1 rejected) |
| MS3V10–V12 | COTW MS3 editions, evidence page, libraries | 1 S1 · 6 S2 · 16 S4 · 1 S5 (1 rejected) |
| RSAF | resident safety delta | 4 S1 · 6 S2 · 7 S4 |
| RV09–RV11 | resident COTW editions + deep dives | 1 S1 · 13 S2 · 1 S3 · 9 S4 · 1 S5 (2 rejected) |
| RV13 | Psychiatry Canon (200) | 4 S2 · 3 S4 |
| RMISC | rotation pages, adv. psychopharm, tools | 2 S2 · 1 S3 · 1 S4 |

## What verification killed (why §3 earns its cost)

Seven findings were rejected because the *page* was right and the *finding* was wrong —
each would have introduced an error if applied: Rodolico 2022's OR 0.18 is genuine (killed
twice), Santo 2021's six-fold post-cessation mortality is genuine, Gomes 2023 really used a
no-treatment comparator, McPheeters 2023's NNT 11/18 split was transposed by the reviewer,
and the "phantom" 2025 DBT-vs-SSRI RCT is Brodsky et al., AJP 2025 — real and accurately
summarized. A further 29 findings survived only after correction (severities moved in both
directions: one thiamine finding S1→S4, one rule-out omission S2→S1; several replacements
were themselves fixed against abstracts). **No S1/S2 finding in `findings.json` should be
applied without reading its `verification` block, and nothing in `rejected.json` should be
applied at all.**

## Coverage limits and exporter notes (not clinical findings)

- *One Patient, Six Weeks* fetches its weekly case content from JSON at runtime; the
  transcript carries only the shell, so the week-by-week choices were **not** reviewed.
  Worth adding to the exporter.
- A1's `Evidence:` lines render one character at a time (exporter iterates a string as a
  list) — repaired in the review working copies; worth fixing in
  `export_curriculum_review.py`.
- Some A3 option strings carry their feedback merged into the option text; reviewers judged
  strings standalone per the prompt.
- S3–S5 findings carry reviewer-level confidence only. Low-confidence findings name in
  `basis` what would settle them.

## Suggested disposition order

1. The eight S1s (five are one editing session on the resident C-L/agitation surfaces).
2. Pattern 4 (crisis-block scope + resident markdown injection) — safety infrastructure,
   small diff, governance sign-off on scope.
3. Pattern 2 + Q39 + the DOI/Canon provenance cluster — one "citations tell the truth"
   work package across A3, landmark links, and the Canon.
4. Pattern 1 as an overlay-vs-prose audit (the topic-meta skill's conditional invariants
   are the natural enforcement point).
5. The remaining S2s file-by-file per `findings.json`, which carries a ready-to-paste
   `replacement` for every finding.

## Round-trip

`file` + `surface` + `locus` + `quote` resolves each finding to its shipped source via the
`- **Source:**` line on the surface in the transcript. Raw per-pass output is under
`raw/`, verifier verdicts under `raw/verdicts/`, keyed by finding id. Regenerate transcripts
after content changes per `REVIEW_PROMPT.md` §4.
