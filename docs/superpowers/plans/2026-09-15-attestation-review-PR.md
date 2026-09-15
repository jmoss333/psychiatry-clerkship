# Prepared pull request — NOT SUBMITTED

Branch `claude/attest-review-2026-09-14`, based on `origin/main` at `a898778`.
Nothing has been pushed, opened, merged, or deployed. This file holds the prepared title
and body for your review.

---

## Title

```
fix(cotw): correct 13 case pages and the console's audience claim from the 2026-09-14 attestation review
```

## Body

```markdown
Implements the supported corrections from the 2026-09-14 faculty attestation review.
De-identified synthetic teaching cases (no PHI). All 14 reviewed pages were already
`pending` in `reviewed.json` and **stay pending** — this PR attests nothing and marks
nothing learner-ready.

## Clinical corrections (13 pages, both learner levels)

Each was reproduced against canonical source before editing, and each claim was checked
against primary guidance rather than applied from the review's wording.

- **First-episode psychosis (resident)** — adequate antipsychotic trial corrected from
  "2–6 weeks at therapeutic dose" to **4–6 weeks at optimum dosage** per NICE CG178
  rec 1.3.6.3, separating judging *efficacy* from changing earlier for intolerability or
  deterioration, and requiring trial adequacy (incl. adherence) to be established before
  declaring non-response (CG178 1.5.7.1). Q7 no longer assumes engaged family and
  treatment engagement the stem never establishes; disposition is now contingent on a
  complete assessment, collateral, verified supports, basic needs and a confirmed prompt
  follow-up, and denial of ideation alone is explicitly not sufficient.
- **Lithium (MS3 + resident)** — post-dialysis monitoring corrected to EXTRIP's actual
  recommendation, **serial levels over 12 h after interrupting ECTR**, nephrology/
  toxicology guided, replacing a single 6–12 h recheck. The blanket "not immediately
  after" is gone (it contradicts serial measurement). MS3: a creatinine rise now
  establishes AKI with prerenal as the likely mechanism, rather than "confirms she is
  prerenal". Resident: "1.9 — barely above therapeutic" replaced with wording that keeps
  the level/severity dissociation without minimising. The AKI-vs-permanent-discontinuation
  distinction is preserved on both.
- **MDD (MS3 + resident)** — MS3: the Q2/Q3 contradiction is resolved in favour of the
  page's own correct teaching (16→13 is a **minimal** response, below the ~5-point
  meaningful step), and the decision no longer hinges on the mislabel. Near-universal
  cross-tapering replaced with **drug-pair-specific** switching per NHS SPS: direct
  switches for SSRI→SSRI and SSRI→venlafaxine/duloxetine (except from fluoxetine),
  cross-taper for mirtazapine/trazodone, taper-and-washout from fluoxetine and into MAOIs,
  and the explicit warning that cross-tapering is **not** recommended into an MAOI,
  moclobemide or clomipramine. Resident: Q1 no longer declares genuine non-response from
  dose and duration alone — adherence and change from pretreatment symptoms must be
  established, or the conclusion is conditional. Esketamine's accurate limitation
  (depressive symptoms, not demonstrated suicide prevention) preserved verbatim.
- **OUD (MS3 + resident)** — MS3: the withdrawal-first rule is now scoped to **standard
  initiation**, with protocol-directed low-dose initiation named as the alternative,
  consistent with the resident twin; the common-errors list no longer restates the
  absolute. Resident: removed the claim that buprenorphine is the single most effective
  treatment *for this patient*, which contradicted Q2's correct presentation of methadone
  as potentially the better fit. Shared choice, continuity, pain treatment and the honest
  low-dose-evidence caveats are untouched. No local protocols invented.
- **Panic (MS3 + resident)** — MS3: "her heart is structurally fine and the ED workup
  confirmed it" narrowed to what ECG and troponins actually support. The generic 2–4 week
  follow-up replaced with NICE CG113: review **within 2 weeks** then 4, 6 and 12 weeks
  (1.3.41), plus — because she is 24 — the under-30 SSRI recommendation imported into the
  panic pathway: warn, **see within 1 week**, and monitor for suicidal thinking weekly for
  the first month (1.2.30 via 1.3.22–1.3.23). Resident: taper pace corrected to the 2025
  joint guideline's **5–10% every 2–4 weeks** with the 25%/2-week ceiling, individualized,
  slowing or pausing on symptoms. The absolute "do not taper before the SSRI is optimized
  and CBT engaged" becomes a strong default with risk-based sequencing, since the guideline
  sequences on the risks of continued use and offers psychosocial treatment *during* a
  taper. Longer-acting conversion, alcohol assessment and shared pace control preserved.
- **Serotonin syndrome vs NMS (MS3 + resident)** — MS3: removed the upgrade of the stem's
  ankle clonus to "spontaneous clonus"; the case now qualifies on tremor + hyperreflexia
  (independently sufficient) and teaches the learner to go and elicit whether clonus is
  spontaneous or inducible. Cyproheptadine is no longer "the specific antidote": on both
  pages it is an adjunct of limited evidence, and the treatment sequence no longer places
  ICU escalation downstream of it. Resident: the categorical **"never a long-acting
  injectable"** is replaced by the scoped precaution the literature supports — avoid an LAI
  *for the rechallenge itself*, because a depot cannot be withdrawn and failure to stop the
  antipsychotic is the strongest predictor of NMS mortality — while stating plainly that
  this is not a lifetime prohibition, that no guideline or label bars it, and that later
  reintroduction is a specialist risk–benefit judgment. **This one changes a clinical
  teaching stance and is flagged for your confirmation** (see below).
- **Suicide risk (MS3 + resident)** — MS3: Q1 no longer reads the stem's death wishes as
  movement toward *active* ideation; it teaches the direct clarifying question instead, and
  the common-errors list names the upgrade as an error. Both: the no-method-detail framing
  is explicitly separated from clinical assessment — it governs what the document prints,
  not what you ask, and the required domains (ideation type, intent, plan existence,
  specificity and **feasibility**, preparatory behaviour, prior attempts, means access) are
  spelled out. Collaborative means-safety counselling, narrative formulation and follow-up
  preserved; the resident page's esketamine limitations preserved. The resident legal
  paragraph was **left as written** — it is already jurisdiction-generic and no
  Maine-specific claim was added.

## Console: the attestation says who it is for

`renderContentChecks` asked every reviewer to affirm the item was "accurate and appropriate
for a third-year student", as a hard-coded literal. That was wrong on all **22
resident-only** pages and understated on the **91** that ship to both audiences.

Root cause: audience was never carried. `site` (the one deployment a preview is fetched
from) and `sites` (every deployment that publishes the item) are different facts that
disagree for 91 pages, and only `site` existed on the item. This PR carries `sites` through
`content-universe.mjs` → the server payload in `attest.mjs` → `normalizeReviewItems`, and
derives the checkbox copy and the one-click button label from it.

An unknown audience is stated as unknown and is deliberately **not** defaulted to MS3 — the
silent default is how the original defect survived unnoticed.

New `faculty-console/attestation-audience.test.mjs` pins the defect class as properties over
the real `shipped_pages.json` rather than restating the sentences: no resident-only item may
carry an MS3 claim, a dual-audience item must name both, audience must not be derivable from
`site`, and unknown must not become MS3. Reverting the fix turns 4 of its 7 tests red.
Deliberate review, exact-item and revision checks, preview readiness, receipt behaviour and
keyboard/focus paths are untouched.

## Facilitator material — one correction, one decision left open

All 13 pages display facilitator material whose labels restrict it. **The labels were left
exactly as authored** — removing them to clear the mismatch would be the wrong fix.

What *was* fixed is a false statement: `cotw_meta.py` generated a bullet on every case page
reading "Facilitator notes are kept separate from the learner-facing stem." Nothing in the
build does that. It now states only what is true.

The delivery decision is yours, with options, costs and a recommendation in
`docs/superpowers/plans/2026-09-15-facilitator-material-release.md`.

## Validation

`bin/verify.sh`: **ALL CHECKS PASSED** (89 checks). Both sites built sequentially and green.
Corrections confirmed present in `_build/ms3` and `_build/res`, and the superseded claims
confirmed absent. Welcome verified against built output: Orientation Packet and all six week
links resolve on both sites, the orientation video is real media (35.5 MB, 7:50) with a
149-cue WebVTT track wired as a default caption track and a transcript parsed from that same
VTT. Video **playback was not exercised** and is not claimed as tested.

## Coordination

Overlaps `#646` (content-universe/console tests, shipped_pages, reviewed.json) — this PR
touches **neither `reviewed.json` nor `shipped_pages.json`**, since every affected row was
already `pending`. It does add a `sites:` line to two expected objects in
`content-universe.test.mjs`, which `#646` also edits for its count pins; if `#646` lands
first this is a small mechanical merge.
```

---

## What still needs you

1. **Confirm the NMS/LAI rechallenge change** — evidence-supported, but it revises a
   clinical teaching stance. Details and alternatives in the session report.
2. **Decide facilitator delivery** — `docs/superpowers/plans/2026-09-15-facilitator-material-release.md`.
3. **Confirm the resident suicide page's legal paragraph** against current MaineHealth /
   Maine policy. Left generic on purpose; nothing local was invented.
4. **Authorize the six-attestation recovery** — separate matter, read-only note at
   `docs/superpowers/plans/2026-09-15-six-attestation-recovery.md`.
