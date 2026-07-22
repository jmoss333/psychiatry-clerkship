# Technical-Lead Audit & Integration Report — Shelf/COMAT Psychiatry Question Bank

**Date:** 2026-07-13 · **Reviewer role:** technical lead / assessment-quality auditor / integrator
**Scope reviewed:** `main` branch state, live `question_bank.json` (192 items), the
`09_Exam_Prep/shelf_comat_bank/` pilot artifact set (24 items + supporting files), schema, CI,
faculty-console, Netlify posture. **Nothing was merged, deployed, or written to the live bank.**

> **Boundaries honored.** All items remain `status: draft`. No model-generated item was marked
> faculty-attested. No clinical-review gate was weakened. No official/commercial item was reproduced.
> No PHI. Unrelated repository files were not modified. New work is additive under
> `shelf_comat_bank/engine/` plus this report.

---

## 1. Headline verdict

The pilot is **clinically sound and structurally clean**: all 24 keyed answers are correct on
independent review, all HARD data-quality gates pass, and every "PMID-verified" landmark citation is
confirmed real against PubMed. The initiative is **ready to proceed to faculty attestation of the
pilot**, gated on three cheap, well-supported fixes (below) and confirmation of the `verified:false`
guideline references.

The single most consequential decision is **not** clinical — it is the **integration mode** (§7).
That is Dr. Moss's call and is placed in front of him rather than executed unilaterally, because it
determines whether the live attested bank is rewritten.

---

## 2. Blueprint verification (independent, access date 2026-07-13)

I re-fetched both official pages directly and compared them line-by-line to
`01_BLUEPRINT_CROSSWALK.md`.

| Source | Fetched | Page last-modified | Result |
|---|---|---|---|
| NBME Psychiatry Subject Exam — Content Outline | 2026-07-13 | 2026-06-17 | **Percentages match verbatim** (Systems, Physician Task, Site of Care, Patient Age) |
| NBOME COMAT Clinical – Psychiatry — Content Outline & Objectives | 2026-07-13 | 2026-06-17 | **Dimension-1 & Dimension-2 ranges and all 6 osteopathic objectives match verbatim** |
| NBME Item-Writing Guide (6th ed.) | — | — | Full PDF still gated behind a request form; rules encoded from public principles (unchanged) |

The two blueprint dimensions are preserved separately with their own percentage ranges (NBME uses
System/Task/Site/Age bands; COMAT uses Presentation + Task bands). No endorsement is implied; only the
published *organization* of the outlines is mirrored. **The crosswalk's transcription is accurate and
current as of today.**

---

## 3. Adversarial content audit — per-item verdicts

Every item was read for: keyed-answer correctness, competing-answer plausibility, missing clinical
info, outdated guidance, unsafe simplification, temporal-course ambiguity, DSM criteria errors,
medication contraindication/adverse-effect/monitoring errors, delirium/dementia/psychosis/substance/
medical confusion, age-appropriateness, jurisdiction-dependent legal/ethical claims, demographic
cueing, unsupported osteopathic content, citation–answer mismatch, and answer leakage.

**Result: 0 keyed-answer errors. 0 unsafe-simplification errors. 0 citation–answer mismatches.**

| ID | Category | Key | Clinical verdict | Class |
|---|---|---|---|---|
| qbx_mood_001 | mood | B | Correct — screen for (hypo)mania before antidepressant (AD-associated hypomania + FDR bipolar) | publishable_after_faculty_attestation |
| qbx_mood_002 | mood | C | Correct — fluoxetine + CBT for moderate adolescent MDD; boxed-warning monitoring noted | publishable_after_faculty_attestation |
| qbx_psy_001 | psychosis | C | Correct — schizophreniform (1–6 mo), duration-based | publishable_after_faculty_attestation |
| qbx_psy_002 | psychosis | B | Correct — clozapine after 2 adequate trials (TRS); ANC monitoring | publishable_after_faculty_attestation |
| qbx_anx_001 | anxiety | D | Correct — PTSD (>1 mo) vs ASD | publishable_after_faculty_attestation |
| qbx_anx_002 | anxiety | A | Correct — CBT/ERP first-line for pediatric OCD | publishable_after_faculty_attestation |
| qbx_sud_001 | substance | A | Correct — thiamine with/before dextrose | publishable_after_faculty_attestation |
| qbx_sud_002 | substance | B | Correct — naloxone for opioid toxidrome | publishable_after_faculty_attestation |
| qbx_cog_001 | neurocog | D | Correct — deprescribe anticholinergics (drug-induced delirium) | publishable_after_faculty_attestation |
| qbx_cog_002 | neurocog | A | Correct — DLB constellation; avoids "pathognomonic" (fixes live-bank flaw) | publishable_after_faculty_attestation |
| qbx_pha_001 | pharm | C | Correct — serotonin syndrome (sertraline + linezolid); clonus/hyperreflexia/onset | publishable_after_faculty_attestation |
| qbx_pha_002 | pharm | D | Correct — avoid olanzapine on metabolic profile. **Item-writing: negative lead-in** | revise (lead-in) |
| qbx_saf_001 | safety | B | Correct & safe — lethal-means counseling; no method detail | publishable_after_faculty_attestation |
| qbx_saf_002 | safety | A | Correct — verbal de-escalation first (Project BETA) | publishable_after_faculty_attestation |
| qbx_per_001 | personality | C | Correct — team holds consistent limits (splitting) | publishable_after_faculty_attestation |
| qbx_per_002 | personality | B | Correct — BPD affective instability vs bipolar episodes | publishable_after_faculty_attestation |
| qbx_cdev_001 | childdev | D | Correct — ADHD (cross-situational, <12, ≥6 mo, impairing) | publishable_after_faculty_attestation |
| qbx_cdev_002 | childdev | C | Correct — ODD vs conduct/IED/ASPD | publishable_after_faculty_attestation |
| qbx_oth_001 | otherdx | A | Correct — falling phosphate (refeeding) | publishable_after_faculty_attestation |
| qbx_oth_002 | otherdx | B | Correct — FND, Hoover sign described correctly (fixes live `qb_otherdx_005`) | publishable_after_faculty_attestation |
| qbx_eth_001 | ethics | D | Correct — assess decision-specific capacity; jurisdiction-neutral | publishable_after_faculty_attestation |
| qbx_eth_002 | ethics | C | Correct — duty to protect, per local law; jurisdiction-neutral | publishable_after_faculty_attestation |
| qbx_rel_001 | relational | A | Clinically correct — validate + concrete means-safety. **Item-writing: coaching text in stem telegraphs key** | revise (stem) |
| qbx_rel_002 | relational | D | Correct — early follow-up + means safety + warm handoff | publishable_after_faculty_attestation |

**Summary of classes:** 22 `publishable_after_faculty_attestation`, 2 `revise` (both item-writing,
not clinical), 0 `evidence_review_required`, 0 `duplicate` (intra-pilot), 0 `retire`.
The 7 near-neighbors of live items flagged in `08_CONCEPT_INDEX.md` are **reconciliation** decisions
for §7, not duplicates within this batch.

---

## 4. Item-writing findings (batch-level, enforced by the validator)

The validator (`engine/qbank_validate.py`) reproduces the audit's three item-writing flags
deterministically:

1. **Longest-answer cue (batch pattern).** The correct option is the *sole longest* option in
   **11/24 items (46%)**. Random expectation is ~25%; the tool gate is ≤35%. This is the same cue the
   July audit found in the live bank, only partly neutralized here. It is *not* individually
   disqualifying, but the fill batches (V1+) should trim keys to the bare decision and push rationale
   into `why`/explanations. **Recommended fix: batch-level, applied going forward and on a light
   editing pass of the flagged 11.**
2. **`qbx_rel_001` — answer leakage in the stem.** The stem contains coaching that telegraphs option
   A ("…consider the function of the best reply: it should validate her fear and then translate 'keep
   him safe' into a concrete, verifiable means-safety step…"). Clinically fine; structurally this
   hands the examinee the answer. **Recommended fix (clear, supported): delete the coaching sentence.**
   A drop-in revised stem is provided in `engine/proposed_fixes.md`.
3. **`qbx_pha_002` — negatively-phrased lead-in** ("most important to avoid"). NBME item-writing
   discourages negative lead-ins. Acceptable but improvable. **Recommended fix: reframe positively**
   (e.g., "…is the *least* appropriate → which agent should be avoided" → convert to a positive
   "best next agent" stem, or retain and flag). Left in the faculty queue as a style call.

Key-position balance is **perfect (A/B/C/D = 6/6/6/6)**. No duplicate IDs, no duplicate/near-duplicate
stems, no prohibited branding, no placeholders, no orphaned structure.

---

## 5. Citation verification

Five landmark citations claimed PMID/DOI-verified. I confirmed all five against PubMed — titles,
authors, and journals match exactly (per PubMed):

- Kane 1988 clozapine — PMID 3046553 — [DOI](https://doi.org/10.1001/archpsyc.1988.01800330013001)
- Boyer 2005 serotonin syndrome — PMID 15784664 — [DOI](https://doi.org/10.1056/NEJMra041867)
- Lieberman 2005 CATIE — PMID 16172203 — [DOI](https://doi.org/10.1056/NEJMoa051688)
- Appelbaum 2007 capacity — PMID 17978292 — [DOI](https://doi.org/10.1056/NEJMcp074045)
- Richmond 2012 Project BETA — PMID 22461917 — [DOI](https://doi.org/10.5811/westjem.2011.9.6864)

*(Source: PubMed.)* No fabricated identifiers. **Outstanding, faculty-side:** the `verified:false`
references (DSM-5-TR is fine; guideline versions — AACAP 2007/2012, ASAM 2020, Beers 2023, VA/DoD
suicide & PTSD, APA schizophrenia 2020 — and FDA label text) must be confirmed current before
attestation, exactly as `07_REFERENCE_LEDGER.md` states. Guideline currency is the main evidence-side
to-do.

---

## 6. Coverage report (pilot vs blueprint)

Machine report: `engine/pilot_validation_report.json`. Against the V1 (180) frame, the pilot is
correctly under every category quota (it is a 2/category calibration sample). Cross-cutting bands
behave as the initiative's own report predicted:

- **In band:** site ambulatory 62.5%, ED 20.8%; age birth-12 12.5% / 13+ 87.5%; difficulty
  20.8/58.3/20.8; exam `both` 62.5%, `shelf` 16.7%.
- **Out of band at pilot scale (expected, to correct in V1):** inpatient 16.7% (cap 5–10%); NBME task
  50/50 vs Dx 65–70%; two-tier 12.5% (target 15–25%); `comat` 20.8% (target 10–20%, marginal).

Deterministic missing-item assignments for the next batches are emitted by the tool (mood +20, anxiety
+18, pharm +18, neurocog/safety/relational +14, …). These match `10_CONTINUATION_MANIFEST.md`.

---

## 7. Integration decision (the one call for Dr. Moss)

The live bank already holds **192 items (143 attested, 49 draft), 16/category**, wired to the SPA and
governed by a "read the library, no external citations" contract. The pilot uses a **strict superset
schema** so items are back-portable, and deliberately **corrects two audit-flagged live items**
(`qb_otherdx_005` Hoover; the DLB "pathognomonic" phrasing).

Two viable modes — this is a genuine fork and I have not chosen it for you:

- **(A) Standalone dual-exam bank.** Keep `qbx_` items as a separate, externally-cited, dual-exam
  bank alongside the live bank. Lowest risk to the attested corpus; two banks to maintain; some
  duplication of high-yield discriminations.
- **(B) Transform live bank onto the superset schema + gap-fill.** Enrich the 192 attested items with
  `blueprint.nbme`/`blueprint.comat`/`exam_alignment` + external `references`, replace the two flagged
  items with the corrected `qbx_` versions, then author net-new items only for uncovered cells. One
  canonical bank; highest leverage; but it edits attested content and therefore **triggers
  re-attestation** of every touched item.

I concur with the prior report's lean toward **(B) + gap-fill**, but (B) rewrites attested material,
so it should not start without your explicit go-ahead. See §8 for exactly what unblocks each path.

---

## 8. Learner UX & faculty console — status and honest gap

These are requested deliverables that **already exist in-repo** and should be *fed by* the engine
layer rather than rebuilt from scratch in this session (heavy SPA work in this repo is routed to local
Claude Code per the repo's own tooling notes, and rebuilding live UI half-way risks the two Netlify
sites):

- **Learner experience:** the SPA already ships quiz/flashcard/explanation features and recent
  adaptive/blueprint work (PRs #208–#216). What the qbank needs added is study-vs-exam mode parity
  (immediate feedback + distractor explanations + key takeaway + related lesson + confidence rating in
  study mode; no disclosure until submit, flag/revisit, accessible timer, end-of-block review in exam
  mode) and the filter set (Shelf/COMAT/topic/task/age/setting/difficulty/incorrect-unseen-bookmarked-
  low-confidence). The item schema already carries every field these need.
- **Faculty console:** `faculty-console/` exists. What attestation needs is one-item-at-a-time review
  showing key + every distractor explanation + references + blueprint coverage, with
  approve/edit/reject/evidence-review actions recording reviewer, date, item version, decision; a
  re-attestation queue for changed items; and a queue export. `09_ATTESTATION_QUEUE.json` is the data
  spine.

**Provenance rule to wire in both UIs and data:** draft / model-reviewed items must be visually and
structurally distinct from faculty-attested items. The schema's `status` field is the discriminator;
the UI must never render a `draft` item as attested.

**Recommendation:** implement the UX/console wiring in local Claude Code against the engine + schema
here. I did not stub a throwaway UI, to avoid presenting unfinished UI as done.

---

## 9. Engine layer delivered this session (runnable, tested)

Under `09_Exam_Prep/shelf_comat_bank/engine/`:

- **`qbank_validate.py`** — data-quality gate + coverage engine. Checks required fields, unique IDs,
  exactly-one-key, distractor explanations, valid blueprint tags, reference presence, key-position
  balance, longest-answer cue, negative lead-ins, lexical + concept-signature duplicate detection,
  prohibited/endorsement branding, unresolved placeholders, and coverage vs the 180/360/480 quotas
  with under/over-filled cells and next-batch assignments. Exits non-zero on HARD failure (CI-ready).
  Uses only stdlib (no external embedding service introduced).
- **`qbank_form.py`** — deterministic (seeded) practice-form generator: topic, mixed-shelf,
  mixed-COMAT, full-length COMAT, cumulative. Meets blueprint cell counts as closely as the pool
  allows and **reports every unavoidable deviation** (verified: a 24-item pool cannot fill a
  5-anxiety COMAT slot and says so).
- **`test_qbank.py`** — 11 regression tests proving each HARD gate catches its failure mode; **all
  pass**. This is the Phase-8 test evidence for the gate.
- **`pilot_validation_report.json`** — machine coverage/flag report for the pilot.

Run:
```
python3 engine/qbank_validate.py --json engine/pilot_validation_report.json 04_pilot_batch_01.json
python3 engine/qbank_form.py full-comat --size 24 04_pilot_batch_01.json
python3 engine/test_qbank.py
```

Suggested CI wiring (new job in `.github/workflows/ci.yml`, additive): run `test_qbank.py` then
`qbank_validate.py` over every `shelf_comat_bank/*batch*.json`; fail the build on non-zero exit.

---

## 10. Exact remaining blockers

1. **Faculty attestation of the pilot** — only Dr. Moss's tooling may set `faculty_attested`. Route
   via `09_ATTESTATION_QUEUE.json` (higher-intensity/emergency + legal items first).
2. **`verified:false` reference confirmation** — guideline versions + FDA label text (§5).
3. **Integration-mode decision (A vs B)** — §7; blocks V1 mass production either way.
4. **Two `revise` fixes** — apply `qbx_rel_001` stem edit; decide `qbx_pha_002` lead-in phrasing
   (`engine/proposed_fixes.md`).
5. **UX/console wiring** — implement in Claude Code against this schema (§8); not a content blocker.
6. **Osteopathic-faculty eyes** on the genuinely DO-framed items (`qbx_cog_001`, `qbx_oth_002`, plus
   holistic-tagged `qbx_sud_001`/`qbx_eth_001`/`qbx_rel_001`) — confirm the osteopathic framing reads
   as authentic, not forced.

---

## 11. PR-ready summary (nothing merged)

> **Title:** Shelf/COMAT qbank: technical-lead audit + data-quality/coverage engine (no content merged)
>
> **What this adds:** an additive `shelf_comat_bank/engine/` directory — a CI-ready validator +
> coverage engine, a deterministic practice-form generator, and passing gate tests — plus this audit
> report. **No change to `question_bank.json`, the SPA, `reviewed.json`, or any deploy config.**
>
> **Findings:** 24/24 pilot items clinically correct; 5/5 landmark PMIDs verified against PubMed;
> blueprint transcription re-verified against live NBME/NBOME pages (2026-07-13). Item-writing: batch
> longest-answer cue (46%), one stem coaching leak, one negative lead-in — all flagged, two revisable.
> Coverage deviations at pilot scale are expected and enumerated with next-batch assignments.
>
> **Gates:** `python3 engine/test_qbank.py` → 11/11 pass; `qbank_validate.py` on the pilot → HARD PASS,
> 3 soft flags. **Not for deploy.** Pilot remains `draft`, pending faculty attestation.
>
> **Decision required:** integration mode A (standalone) vs B (transform live bank + gap-fill).

---

## 12. What I deliberately did NOT do

- Did not edit, reorder, or "attest" any live or pilot item; all stay `draft`.
- Did not rewrite the live attested bank onto the superset schema (that is decision §7).
- Did not build a throwaway learner/faculty UI to appear complete (§8).
- Did not add an external embedding service for duplicate detection (used lexical + concept signature,
  per the brief).
- Did not run the site build or commit (Cowork sandbox lacks Git-LFS; ~100 `.m4a` show as false
  "modified" — untouched here, correctly).
- Did not increase item count by relaxing any citation, ambiguity, duplication, or clinical-review
  standard.

*Access date for all official figures in this report: 2026-07-13. Re-verify before the 360/480
expansion.*

Joshua Moss, MD | Psychiatrist — (report prepared for faculty attestation; content remains AI-drafted)
