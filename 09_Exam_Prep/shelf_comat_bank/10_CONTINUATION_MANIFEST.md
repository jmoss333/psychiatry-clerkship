# Continuation Manifest — Shelf/COMAT Dual-Exam Bank

State as of **2026-07-13**. Resume drafting from the next uncovered blueprint cells below.

## 1. Completed

- Phase 1 (repo + blueprint review), Phase 2 (canonical schema), blueprint crosswalk, rubric —
  **done** (`01`–`03`).
- **Pilot batch 01: 24/24 items drafted, reviewed (5 passes), schema-valid** — `04`.
- Supporting deliverables `05`–`09`, this manifest `10`, final report `11` — done.
- **Gate:** the pilot pauses here for faculty spot-check before mass production (matches the
  repo's own Wave-1 gate). Do not begin V1 drafting until the pilot's calibration feedback is in.

## 2. Quota ledger — completed vs remaining

Pilot contributes 2 items per category. Remaining counts assume the pilot's 24 count toward each
target (as the repo's Wave-1 exemplars do).

| `category` | Pilot | V1 target (180) | Remaining → 180 | 360 target | 480 target |
|---|---:|---:|---:|---:|---:|
| mood | 2 | 22 | 20 | 44 | 59 |
| anxiety | 2 | 20 | 18 | 40 | 53 |
| neurocog | 2 | 16 | 14 | 32 | 43 |
| pharm | 2 | 20 | 18 | 40 | 53 |
| substance | 2 | 14 | 12 | 28 | 37 |
| safety | 2 | 16 | 14 | 32 | 43 |
| psychosis | 2 | 12 | 10 | 24 | 32 |
| childdev | 2 | 12 | 10 | 24 | 32 |
| otherdx | 2 | 14 | 12 | 28 | 37 |
| relational | 2 | 16 | 14 | 32 | 43 |
| personality | 2 | 8 | 6 | 16 | 21 |
| ethics | 2 | 10 | 8 | 20 | 27 |
| **Total** | **24** | **180** | **156** | **360** | **480** |

## 3. Cross-cutting debts to repay as the bank grows

Track these at every batch (targets in `01_BLUEPRINT_CROSSWALK.md` §6):

- **Site of care:** keep ambulatory 60–65%, ED 20–30%, **inpatient capped 5–10%.** The pilot ran
  inpatient at 16.7% to exercise the setting — V1 batches must run inpatient *low* to pull the
  bank back into band.
- **Physician task (NBME):** Diagnosis 65–70% / Pharm-Intervention-Management 30–35%. The pilot
  is 50/50 (management-rich for teaching balance); V1 must add diagnosis-weighted items.
- **Age:** Birth–12 = 10–15% (pilot 12.5% ✓); keep ≥1 pediatric per relevant batch.
- **Type:** two-tier ~20% (pilot 12.5%); add two-tier in `pharm`/`substance`/`neurocog`/`ethics`.
- **Difficulty:** 25/55/20 (pilot 21/58/21 — add a few more L1 recognition items).
- **exam_alignment:** ~70% both / 15% shelf / 15% comat (pilot 63/17/21 ✓, close).

## 4. Next uncovered blueprint cells (start V1 here)

Ordered to repay the largest debts first. Each is a specific discrimination NOT yet in this
bank; **before drafting, check the live `question_bank.json` (§5) so you fill gaps, not
duplicates.**

1. **mood (ambulatory, dx):** MDD vs persistent depressive disorder vs adjustment; PMDD;
   peripartum-onset depression screening (EPDS context) — diagnosis-weighted.
2. **anxiety (ambulatory):** GAD vs panic vs social anxiety first-line SSRI/SNRI; specific phobia;
   separation anxiety (peds birth–12); PANDAS-context OCD flare.
3. **neurocog (ED/ambulatory, keep inpatient low):** delirium workup sequence; vascular vs
   Alzheimer; frontotemporal behavioral variant; TBI neuropsychiatric sequelae.
4. **pharm (ambulatory):** lithium toxicity + monitoring; valproate teratogenicity/childbearing;
   SSRI discontinuation vs relapse; antipsychotic EPS (acute dystonia, akathisia, tardive
   dyskinesia); metabolic monitoring schedule; **add two-tier mechanism items.**
5. **substance (ED/ambulatory):** CIWA symptom-triggered benzodiazepine dosing; buprenorphine vs
   methadone maintenance retention/mortality; stimulant intoxication; cannabis/hallucinogen.
6. **safety (ED):** violence risk vs suicide risk factors; agitation medication choice when
   de-escalation fails; restraint monitoring; homicidal ideation triage.
7. **psychosis (ambulatory):** first-episode workup; delusional disorder subtypes;
   schizoaffective vs mood-with-psychosis; long-acting injectable indications.
8. **childdev (birth–12 heavy):** autism spectrum core features & screening; Tourette + comorbid
   OCD/ADHD; enuresis; intellectual disability vs specific learning disorder.
9. **otherdx:** illness anxiety vs somatic symptom disorder; factitious disorder vs malingering;
   narcolepsy/insomnia/RLS; bulimia vs binge-eating; sexual dysfunction (SSRI-induced).
10. **relational:** motivational interviewing readiness ruler; delivering a serious diagnosis to a
    family; cultural humility; interpreter use; transitions with collateral consent.
11. **personality:** cluster A vs B vs C discriminations; antisocial vs narcissistic; therapeutic
    alliance/limit-setting scenarios.
12. **ethics:** minor consent/confidentiality; involuntary hold criteria (jurisdiction-neutral);
    informed consent for ECT; surrogate decision hierarchy.

## 5. Mandatory pre-draft check (avoids duplicating the live bank)

The live `question_bank.json` already has **192 attested items (16/category)**. Before writing any
V1 item:

1. Read the live items in that category (their `pearl`/`why` state the central discrimination).
2. Confirm your planned discrimination is **not** already tested (`08_CONCEPT_INDEX.md` shows the
   pilot's near-neighbors — 7 of 24 pilot items were near-neighbors of attested items).
3. If it is already covered, either pick a genuinely uncovered secondary discrimination, or
   deliberately author an **enriched dual-exam/externally-cited replacement** and log the pair in
   the concept index for faculty to reconcile. Never silently duplicate.

## 6. Production waves for the remaining 156 (V1)

Mirrors the repo's wave discipline, reordered to repay cross-cutting debts:

| Wave | Scope | Items | Gate |
|---|---|---:|---|
| P1-gate | **faculty spot-check of pilot 24** | — | **stop until feedback** |
| V1-A | neurocog + safety to target (can't-miss core), diagnosis-weighted | 28 | |
| V1-B | substance + pharm to target, +two-tier mechanism | 30 | |
| V1-C | mood + anxiety to target | 38 | |
| V1-D | psychosis + childdev to target (peds heavy) | 20 | |
| V1-E | personality + ethics + otherdx | 26 | |
| V1-F | relational to target + whole-bank audit vs `01`/§6 mix rules; fix gaps | 14 | final V1 handoff |

## 7. Resume prompt (paste to the next drafting session)

> Resume the Shelf/COMAT dual-exam bank at `09_Exam_Prep/shelf_comat_bank/`. Read `00_README.md`,
> `01_BLUEPRINT_CROSSWALK.md`, `03_ITEM_WRITING_REVIEW_RUBRIC.md`, and `10_CONTINUATION_MANIFEST.md`.
> The pilot (`04_pilot_batch_01.json`, 24 items) is drafted and awaiting faculty spot-check —
> confirm that gate is cleared. Then draft V1 Wave A (neurocog + safety, diagnosis-weighted,
> inpatient kept low), 24 items, using the superset schema (`02_ITEM_SCHEMA.json`), verifying each
> keyed answer against a current authoritative source (real citations only), running the 5-pass
> review, and checking the live `question_bank.json` first so you fill gaps rather than duplicate.
> Output to `04_pilot_batch_02.json` (or `v1_wave_A.json`), update `05` and this manifest.
