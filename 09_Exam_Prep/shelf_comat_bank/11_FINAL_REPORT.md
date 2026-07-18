# Final Report — Shelf/COMAT Dual-Exam Psychiatry Question Bank (Pilot)

**Prepared:** 2026-07-13 · **Learner level:** MS3 (UNE osteopathic + other MS3s), six-week
clerkship · **Exams served:** NBME Psychiatry Subject Exam + NBOME COMAT Clinical Psychiatry ·
**Status of all content:** AI-drafted, `status: draft`, pending attestation by Joshua Moss, MD.

---

## 1. Executive summary

Delivered the full Phase-1/Phase-2 foundation and a complete, reviewed **24-item pilot** for an
original dual-exam psychiatry question bank, as a parallel superset-schema artifact set that
Sol/Codex can validate and integrate without touching the live attested bank.

The single most consequential finding: **the repository already contains a mature, attested
192-item `question_bank.json`** (16/category × 12, SPA-wired, library-grounded, single-exam
framing, no external citations by design). That changes the initiative's highest-leverage work
from "write 360 net-new items" to **"add the dual-exam blueprint layer + external-evidence
verification + richer schema on top of the existing bank, and fill genuine gaps"** — because
net-new core items largely duplicate what is already attested (7 of 24 pilot items are
near-neighbors of existing items). Details in §7.

---

## 2. Items completed and review status

| Deliverable | State |
|---|---|
| Blueprint crosswalk (NBME×COMAT, real percentages, 180/360/480 quotas) | ✅ `01` |
| Canonical item schema (superset JSON Schema) | ✅ `02` |
| Item-writing + 5-pass review rubric | ✅ `03` |
| **Pilot: 24 items** | ✅ `04` — all `draft` |
| Coverage dashboard, faculty packet, reference ledger, concept index, attestation queue, continuation manifest | ✅ `05`–`10` |

**Pilot review status (all 5 passes run):**

- **Schema validation:** passes `02_ITEM_SCHEMA.json` with **0 errors**.
- **Structural self-check:** 0 problems — every item has 4 options, exactly one key, `correct_option`
  matches the `c` flag, every distractor carries a `trap` + a per-key explanation, two-tier items
  carry a valid `tier2`, relational items carry a `subtype`.
- **Psychometric pass:** correct keys balanced **A/B/C/D = 6/6/6/6**; the "key-is-longest" cueing
  defect (the dominant flaw in the July audit of the live bank) was measured and fixed on all 7
  reasoning-laden keys by trimming the key to the bare decision and moving rationale into `why`.
  Three residual flags are benign (short diagnosis-name length artifacts in `qbx_per_002`,
  `qbx_oth_002`; a 13%-margin utterance in `qbx_rel_001`) and are documented, not gameable.
- **Clinical-accuracy pass:** every keyed answer verified against a current authoritative source;
  **5 landmark citations PMID/DOI-verified against PubMed** (CATIE, Kane clozapine, Appelbaum
  capacity, Boyer serotonin syndrome, Richmond Project BETA).
- **Language/bias pass:** person-first language throughout; demographics only where clinically
  relevant; safety items model risk language without method detail; content warnings set.
- **Duplicate pass:** intra-pilot distinct; near-neighbors vs the live bank logged in `08`.

**Composition:** 2/category × 12 · type 19 SBA / 3 two-tier / 2 relational · difficulty 5/14/5
(≈21/58/21%) · settings 15 ambulatory / 5 ED / 4 inpatient · ages 3 birth–12, 1 adolescent, 18
adult, 2 older-adult · exam_alignment 15 both / 4 shelf / 5 comat · 4 items with genuine
osteopathic/holistic framing (not forced).

**All explicit pilot requirements met:** every diagnostic family; diagnosis and management
decisions; ambulatory + ED + inpatient; child/adolescent + adult; pharmacologic + non-pharmacologic;
psychiatric emergencies (serotonin syndrome, Wernicke/thiamine, opioid overdose, agitation,
refeeding); ethics + communication; meaningful COMAT differentiation; and relational/family-centered
decisions (means-safety family meeting, discharge transition).

---

## 3. Coverage achieved against each blueprint

**NBME (pilot, n=24):** Site 62.5% ambulatory / 20.8% ED / 16.7% inpatient (inpatient above the
5–10% band by design at pilot scale — flagged to correct in V1). Task 50/50 Dx vs
Pharm-Intervention-Management (management-rich for teaching balance; V1 shifts toward the 65–70%
Dx target). Age 12.5% birth–12 / 87.5% ≥13 (in band). Systems spanned Behavioral Health, Nervous
System, Other Systems, and Social Sciences.

**COMAT (pilot, n=24):** all nine Dimension-1 presentation clusters represented; Dimension-2 tasks
span History & Physical/Dx, Management, Scientific Mechanisms, and Health-Care-Delivery. Osteopathic
learner objectives touched: holistic care (obj 1), risk assessment (obj 2), inpatient+outpatient
integration (obj 3), multi-facet treatment plans (obj 4), psychotropic + non-pharm mastery (obj 5),
and psychiatric-emergency recognition (obj 6).

Full machine tallies: `05_coverage_dashboard.json`. Quotas for 180/360/480: `01` §5.

---

## 4. Areas still underrepresented (to fix in V1)

- **Inpatient over-weight and Dx/Management 50/50** at pilot scale — V1 batches must run ambulatory-
  and diagnosis-heavy to pull both into band (`10` §3).
- **Two-tier** at 12.5% (target ~20%) — add mechanism items in pharm/substance/neurocog/ethics.
- **Level-1 recognition** slightly light (21% vs 25%).
- Specific uncovered discriminations enumerated in `10` §4 (e.g., lithium/valproate monitoring,
  CIWA dosing, EPS spectrum, autism screening, involuntary-hold criteria, MI readiness ruler).

---

## 5. Items requiring psychiatrist / osteopathic-faculty review

Priority order in `09_ATTESTATION_QUEUE.json`. Summary: **8 higher-intensity** (emergency/legal):
`qbx_sud_001`, `qbx_sud_002`, `qbx_pha_001`, `qbx_oth_001`, `qbx_saf_001`, `qbx_saf_002`,
`qbx_eth_001`, `qbx_eth_002`. **9 medication/pediatric.** **7 standard.** Two items carry genuine
osteopathic framing worth DO-faculty eyes: `qbx_cog_001` (deprescribing/holistic) and `qbx_oth_002`
(mind-body/positive-sign FND); `qbx_sud_001`, `qbx_eth_001`, and `qbx_rel_001` also carry holistic
tags. Legal items (`qbx_eth_001`, `qbx_eth_002`) are written jurisdiction-neutral and flagged
`legal-jurisdiction`.

---

## 6. Unresolved evidence conflicts / caveats

- **No factual conflicts** were left unresolved in the keyed content. The pilot deliberately
  **corrects** a defect the July audit found in the live bank: `qbx_oth_002` states the Hoover sign
  correctly (the live `qb_otherdx_005` was flagged P0 for describing it wrong), and `qbx_cog_002`
  avoids calling the DLB tetrad "pathognomonic" (a flaw noted in live `qb_cog_005`).
- **Verification status:** 5 landmark citations are PMID/DOI-verified. The remaining references are
  real, standard sources (DSM-5-TR; APA/AACAP/AAP/ASAM/VA-DoD/Beers guidelines; FDA labeling) cited
  by title/body/year but marked `verified: false` because their exact document version/URL was not
  machine-confirmed this session. **No identifier was fabricated.** Faculty should confirm the
  `verified:false` items in `07_REFERENCE_LEDGER.md` before attesting (especially the guideline
  versions and FDA label text, which update over time). This is the main evidence-side to-do.
- **Guideline currency:** several cited guidelines (AACAP depression 2007, ASAM 2020, Beers 2023,
  VA/DoD suicide/PTSD) should be checked for newer editions at attestation.

---

## 7. Repository limitations & the integration decision (important)

**Architecture chosen.** Per the brief's role division ("don't redesign the app; produce clean
artifacts Sol/Codex integrates" + "one canonical source, don't duplicate"), this initiative is a
**parallel, superset-schema artifact set** under `09_Exam_Prep/shelf_comat_bank/`. It does not
edit the live attested `question_bank.json`, the SPA, the build, or `reviewed.json`. Item ids use
a distinct `qbx_` prefix to prevent any collision with the attested `qb_` ids and their SRS/response
histories.

**The tension it resolves.** The live bank's contract is "examine the library, never extend it;
the drafting model never adds outside citations." The initiative brief requires the opposite —
external authoritative verification with real citations and a richer dual-exam schema. These cannot
both govern one file, so the new evidence standard governs **this** bank while the schema stays a
strict superset so items remain back-portable.

**The finding that should reshape scope.** Because the live bank is already comprehensive
(192 attested items, 16/category), a breadth-first pilot lands on the same high-yield
discriminations already attested — **7 of 24 pilot items are near-neighbors of live items**
(`08_CONCEPT_INDEX.md`). Writing 360 net-new items would therefore largely duplicate attested
content. The higher-leverage program is:

1. **Transform, don't duplicate.** Enrich the existing 192 items in place with the dual-exam
   blueprint tags (`blueprint.nbme`/`blueprint.comat`, `exam_alignment`) and external `references`,
   using the superset schema — turning the existing bank into a dual-exam, externally-cited bank.
2. **Fill genuine gaps** with net-new items only where the crosswalk shows uncovered cells (`10` §4).
3. **Correct the audit-flagged items** using the pilot's corrected versions (e.g., `qbx_oth_002` →
   replace `qb_otherdx_005`).

This pilot is the reference standard and schema proof for that program.

**Other limitations:** the NBME Item-Writing Guide (6th ed.) full PDF is gated behind a request
form, so item-writing rules were encoded from its public principles + the repo's existing standard.
Neither board publishes exact per-category weights, so quotas are curriculum-weighted (stated
openly in `01`). The Cowork sandbox lacks Git-LFS, so no build/commit was run here (correct — the
brief scopes this to content artifacts, not engineering).

---

## 8. Exact next task for ChatGPT Sol/Codex

1. **Validate** `04_pilot_batch_01.json` against `02_ITEM_SCHEMA.json` (expect 0 errors) and run the
   structural self-check in `03` §F. Confirm keys 6/6/6/6, no `c`/`correct_option` mismatch.
2. **Decide the integration mode** with Dr. Moss (see §7): (a) keep as a standalone dual-exam bank,
   or (b) begin transforming the live 192-item bank onto the superset schema. Recommendation: (b) +
   gap-fill.
3. **Reconcile the 8 near-neighbor pairs** in `08_CONCEPT_INDEX.md` §B — in particular, replace the
   audit-flagged `qb_otherdx_005` (wrong Hoover) with `qbx_oth_002`.
4. **Confirm the `verified:false` references** in `07_REFERENCE_LEDGER.md` (guideline versions, FDA
   label text) before any attestation; set `verified:true` when confirmed.
5. **Route the pilot to faculty** via `09_ATTESTATION_QUEUE.json` (P1 higher-intensity first). Only
   Dr. Moss's tooling sets `status: faculty_attested`.
6. **After the pilot gate clears,** resume V1 drafting from `10_CONTINUATION_MANIFEST.md` §4/§6/§7,
   checking the live bank first (`10` §5) so new items fill gaps rather than duplicate.

*If context limits interrupt V1, finish the current reviewed batch, update `05` and `10` precisely,
and leave the resume prompt (`10` §7). Do not compress quality to hit a count.*
