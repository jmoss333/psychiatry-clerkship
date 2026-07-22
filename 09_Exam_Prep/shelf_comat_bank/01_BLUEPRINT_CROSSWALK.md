# Blueprint Crosswalk — NBME Psychiatry Shelf × NBOME COMAT Clinical Psychiatry

> **Initiative:** Shelf-style / COMAT-aligned original question bank for the UNE MS3 (and
> other MS3) six-week psychiatry clerkship. Serves the NBME Psychiatry Clinical Science
> Subject Exam **and** the NBOME COMAT Clinical Psychiatry exam.
> **Status:** AI-drafted, pending faculty attestation (Joshua Moss, MD).
> **Relationship to the live bank:** This is a *parallel, superset-schema* artifact set for
> Sol/Codex to reconcile with the existing attested `question_bank.json`. It does not modify
> the live file, SPA, build, or `reviewed.json`. See `00_README.md`.

---

## 1. Authoritative sources (accessed 2026-07-13)

| Source | URL | Page last modified | Notes |
|---|---|---|---|
| NBME Psychiatry Subject Exam — Content Outline | https://www.nbme.org/institutions/assess-learn/subject-exams/clinical-science/psychiatry/ | 2026-06-17 | Percentages transcribed verbatim in §2 |
| NBOME COMAT Clinical – Psychiatry — Content Outline & Assessment Objectives | https://www.nbome.org/assessments/comat/clinical-subject-exams/comat-clinical-psychiatry/ | 2026-06-17 | Two-dimension blueprint transcribed verbatim in §3 |
| NBME Item-Writing Guide (6th ed.) | https://www.nbme.org/institutions/nbme-item-writing-guide/ | 2026-06-04 | Full PDF is gated behind a request form; item-writing rules encoded in `03_ITEM_WRITING_REVIEW_RUBRIC.md` from the guide's public principles + the repo's existing standard |

**Provenance rule honored:** percentages below are copied from the official pages as accessed,
not from memory. If a future editor finds the official pages differ, re-transcribe and
re-derive the quotas — do not trust this snapshot past its access date.

**Copyright/security:** categories mirror the *organization* of the official outlines (a fair
use of published blueprints). No official item, sample item, or commercial-bank item is
reproduced, paraphrased, or reverse-engineered anywhere in this initiative.

---

## 2. NBME Psychiatry Subject Exam — official dimensions (verbatim ranges)

**Systems**
| System | Range |
|---|---|
| General Principles (incl. normal age-related findings, care of the well patient) | 5–10% |
| **Behavioral Health** (normal processes/adaptive responses; psychotic; anxiety; mood; somatic symptom & related; factitious; eating & impulse-control; disorders of infancy/childhood; personality; psychosocial disorders/behaviors; substance abuse; adverse effects of drugs) | **65–70%** |
| Nervous System & Special Senses | 10–15% |
| Other Systems, incl. Multisystem Processes & Disorders | 5–10% |
| Social Sciences (communication & interpersonal skills; medical ethics & jurisprudence) | 1–5% |

**Physician Task**
| Task | Range |
|---|---|
| Diagnosis, incl. Foundational Science Concepts | 65–70% |
| Pharmacotherapy, Intervention & Management | 30–35% |

**Site of Care**
| Site | Range |
|---|---|
| Ambulatory | 60–65% |
| Emergency Department | 20–30% |
| Inpatient | 5–10% |

**Patient Age**
| Age | Range |
|---|---|
| Birth to 12 | 10–15% |
| 13 and older | 85–90% |

---

## 3. NBOME COMAT Clinical Psychiatry — official dimensions (verbatim ranges)

**Dimension 1 — Patient/Clinical Presentations**
| Presentation cluster | Range |
|---|---|
| Anxiety; Trauma & Stressor-Related/Dissociative; OCD & Related | 20–25% |
| Neurocognitive Disorders | 9–10% |
| Neurodevelopmental; Gender Dysphoria; Disruptive, Impulse-Control & Conduct | 9–15% |
| Depressive, Bipolar & Related | 20–25% |
| Personality Disorders | 5–8% |
| Schizophrenia Spectrum & Other Psychotic | 8–10% |
| Psychiatric Illness due to Another Medical Condition; Somatic Symptom & Related; Sleep-Wake | 6–10% |
| Substance-Related & Addictive | 8–10% |
| Feeding/Eating/Elimination; Sexual Dysfunctions & Paraphilic | 5–6% |

**Dimension 2 — Physician Tasks**
| Task | Range |
|---|---|
| Health Promotion / Disease Prevention / Health Care Delivery | 8–20% |
| History & Physical (incl. Diagnosis) | 30–45% |
| Diagnostic Technologies | 5–6% |
| Management | 30–45% |
| Scientific Mechanisms of Disease | 8–10% |

**Osteopathic learner objectives (Dimension-spanning):** (1) holistic care — physical, mental,
emotional, spiritual, plus social determinants; (2) diagnose/treat across disorders incl.
suicide/homicide risk assessment, MSE; (3) integrate didactic + clinical across inpatient and
outpatient; (4) treatment plans addressing multiple facets of health; (5) mastery of
psychotropics + non-pharm (psychotherapy, ECT, TMS); (6) recognize/manage psychiatric
emergencies incl. acute crises and substance withdrawal.

**COMAT reference texts (for our evidence grounding, not for item reuse):** DSM-5-TR (APA,
2022); Kaplan & Sadock's Synopsis 12e (2021); Black & Andreasen 7e (2020); DiGiovanna
*Osteopathic Approach* 4e (2020); *Foundations of Osteopathic Medicine* 5e (2025).

---

## 4. Combined crosswalk — content clusters mapped to both exams

Rows are the bank's **content clusters** (aligned to the repo's existing 12 `category` values
for back-portability). Columns carry each exam's dimension tags so any item inherits both
mappings from its cluster and can be re-tallied against either blueprint.

| Bank cluster (`category`) | NBME System | NBME Physician Task (typical) | NBME Site (typical) | NBME Age | COMAT Presentation (Dim 1) | COMAT Task (Dim 2) | Osteopathic competency when applicable |
|---|---|---|---|---|---|---|---|
| `mood` | Behavioral Health | Dx; Pharm/Intervention | Ambulatory > ED | 13+ (peds subset) | Depressive, Bipolar & Related (20–25%) | H&P/Dx; Management; SciMech | Holistic fx assessment; suicide risk (obj 2,6) |
| `psychosis` | Behavioral Health; Nervous System (secondary causes) | Dx; Pharm | Ambulatory + ED | 13+ | Schizophrenia Spectrum & Other Psychotic (8–10%) | H&P/Dx; Management; SciMech | Secondary/medical mimics; holistic (obj 1,2) |
| `anxiety` | Behavioral Health | Dx; Intervention/Management | Ambulatory | 13+ (peds: separation, OCD, PANDAS) | Anxiety/Trauma/Dissociative/OCD (20–25%) | H&P/Dx; Management | Mind-body, somatic overlap (obj 1,4) |
| `substance` | Behavioral Health | Pharm/Management; Dx | ED + Inpatient + Ambulatory | 13+ | Substance-Related & Addictive (8–10%) | Management; H&P/Dx; SciMech | Withdrawal emergencies (obj 6); holistic |
| `neurocog` | Nervous System (10–15%); Behavioral Health; Other Systems | Dx; Management | Inpatient + Ambulatory + ED | 13+ (geriatric skew) | Neurocognitive (9–10%) | H&P/Dx; SciMech; Dx Technologies | Medical mimics; deprescribing; holistic (obj 1) |
| `pharm` | Behavioral Health ("adverse effects of drugs"); Nervous System | **Pharmacotherapy, Intervention & Management** | Ambulatory + Inpatient + ED (emergencies) | 13+ (peds dosing subset) | (rides all clusters) | **Management; Scientific Mechanisms** | Mastery of psychotropics + neuromodulation (obj 5) |
| `safety` | Behavioral Health; Social Sciences (subset) | Dx (risk); Intervention/Management | **ED** + Inpatient + Ambulatory | 13+ (peds subset) | (rides clusters; esp. mood/psychosis/substance) | Management; Health Care Delivery | **Psychiatric emergencies, risk assessment (obj 2,6)** |
| `personality` | Behavioral Health | Dx; Management (psychosocial) | Ambulatory + ED | 13+ | Personality Disorders (5–8%) | H&P/Dx; Management | Alliance, holistic formulation (obj 1,4) |
| `childdev` | Behavioral Health ("infancy/childhood"); Nervous System | Dx; Management | Ambulatory | **Birth–12 (primary)** + adolescent | Neurodevelopmental; Gender Dysphoria; Disruptive/Impulse/Conduct (9–15%) | H&P/Dx; Management | Developmental, family-centered (obj 1,4) |
| `otherdx` | Behavioral Health; Other Systems; Nervous System (FND) | Dx; Management | Ambulatory + ED (refeeding, perinatal) | 13+ (peds: enuresis, ARFID, pica) | Somatic/Factitious/Sleep-Wake + Psych-due-to-medical (6–10%); Feeding/Eating/Elim + Sexual/Paraphilic (5–6%) | H&P/Dx; Management; Dx Technologies | Somatic-mind integration; holistic (obj 1) |
| `ethics` | **Social Sciences** (medical ethics & jurisprudence) | Dx (capacity); Intervention | Inpatient + Ambulatory + ED | 13+ | Health Care Delivery (subset) | Health Promotion/Health Care Delivery | Autonomy, holistic, informed consent (obj 1,4) |
| `relational` | **Social Sciences** (communication & interpersonal skills) | Intervention/Management | Ambulatory + Inpatient (family mtg, discharge) | 13+ (peds via family) | Health Care Delivery; (rides clusters) | **Health Promotion/Health Care Delivery**; Management | Holistic, family, social determinants (obj 1,4) — clerkship signature |

**Reading the crosswalk:** clusters 1–5, 8–10 are *disorder* content and carry a direct
COMAT-presentation percentage. Clusters 6–7, 11–12 (`pharm`, `safety`, `ethics`, `relational`)
are *skill/task* axes that the official blueprints test **through** disorders (pharmacotherapy,
management, risk, communication) rather than as standalone content buckets. The repo already
made them first-class `category` values; we keep that for back-portability, and every
skill-category item **also carries a disorder tag** (via `blueprint.comat.presentation` and
`nbme.system`) so it still counts toward the disorder clusters' exam coverage. This is the
honest reconciliation of "the exams weight disorders" with "the clerkship emphasizes the
skills."

---

## 5. Integer item quotas — Version 1 (180), Comprehensive (360), Expansion (480)

Quotas below are **curriculum-weighted**, anchored to the COMAT presentation midpoints
(the only officially *quantified* content axis) and the NBME system emphasis, then adjusted so
the clerkship's signature skill categories (`pharm`, `safety`, `relational`, `ethics`) receive
defensible shares that sit **inside** the exams' task/care-delivery bands. They are **not** a
claimed copy of any official distribution — neither board publishes exact per-category weights.

| `category` | 180 (V1) | 360 (Comprehensive) | 480 (Expansion) | Anchored to |
|---|---:|---:|---:|---|
| `mood` | 22 | 44 | 59 | COMAT Depressive/Bipolar 20–25% |
| `anxiety` | 20 | 40 | 53 | COMAT Anxiety/Trauma/OCD 20–25% |
| `neurocog` | 16 | 32 | 43 | COMAT Neurocog 9–10% + NBME Nervous System 10–15% |
| `pharm` | 20 | 40 | 53 | NBME Pharmacotherapy task 30–35%; COMAT Management + SciMech |
| `substance` | 14 | 28 | 37 | COMAT Substance 8–10% |
| `safety` | 16 | 32 | 43 | Psychiatric emergencies (obj 6); NBME ED site 20–30% |
| `psychosis` | 12 | 24 | 32 | COMAT Schizophrenia spectrum 8–10% |
| `childdev` | 12 | 24 | 32 | COMAT Neurodev/Impulse/Conduct 9–15% |
| `otherdx` | 14 | 28 | 37 | COMAT Somatic/Sleep 6–10% + Eating/Sexual 5–6% |
| `relational` | 16 | 32 | 43 | NBME Social Sci comm; COMAT Health Care Delivery 8–20%; signature category |
| `personality` | 8 | 16 | 21 | COMAT Personality 5–8% |
| `ethics` | 10 | 20 | 27 | NBME Social Sci ethics/jurisprudence 1–5%; COMAT Health Care Delivery |
| **Total** | **180** | **360** | **480** | |

Scaling rule: V1 → 360 is ×2 exact; 360 → 480 is ×(4/3) with integer rounding reconciled to
the total. The **pilot (24)** is 2 per category (breadth-first calibration sample), matching
the repo's own Wave-1 contract and maximizing back-portability.

---

## 6. Cross-cutting quota tables (applied over the whole bank, orthogonal to `category`)

These are the constraints that keep the bank exam-shaped regardless of content mix. **They are
the guard against the inpatient clerkship distorting the ambulatory/ED distribution.**

### 6a. NBME Site of Care — the anti-inpatient-bias guard
| Site | NBME target | 180 count | 360 count | Enforcement |
|---|---|---:|---:|---|
| Ambulatory | 60–65% | 108–117 | 216–234 | Default setting; write clinic/outpatient stems even for "inpatient" diagnoses when the *decision* is ambulatory |
| Emergency Department | 20–30% | 36–54 | 72–108 | Holds most emergencies (agitation, overdose, catatonia, SS/NMS, acute suicidality) |
| Inpatient | 5–10% | 9–18 | 18–36 | **Capped** — the clerkship is inpatient-heavy; deliberately *under*-weight inpatient stems to match the exam, not the rotation |

> **Design note.** Because our clinical exposure is inpatient, the natural drift is to write
> inpatient vignettes. Every batch's site tally is checked against this table; ambulatory is the
> default and inpatient is rationed. A "delirium" or "mania" item can and usually should be set
> in the ED or a clinic follow-up rather than on the ward.

### 6b. NBME Physician Task
| Task | Target | 180 | 360 |
|---|---|---:|---:|
| Diagnosis (incl. foundational science) | 65–70% | 117–126 | 234–252 |
| Pharmacotherapy, Intervention & Management | 30–35% | 54–63 | 108–126 |

### 6c. NBME Patient Age
| Age band | Target | 180 | 360 |
|---|---|---:|---:|
| Birth to 12 | 10–15% | 18–27 | 36–54 |
| 13 and older | 85–90% | 153–162 | 306–324 |

### 6d. COMAT Physician Task (Dimension 2) — tracked in parallel
| Task | Target | 180 | 360 |
|---|---|---:|---:|
| History & Physical (incl. Dx) | 30–45% | 54–81 | 108–162 |
| Management | 30–45% | 54–81 | 108–162 |
| Scientific Mechanisms of Disease | 8–10% | 14–18 | 29–36 |
| Health Promotion/Prevention/Care Delivery | 8–20% | 14–36 | 29–72 |
| Diagnostic Technologies | 5–6% | 9–11 | 18–22 |

### 6e. Item type mix (repo mechanics preserved)
| Type | Target | Rationale |
|---|---|---|
| `sba` (single best answer) | ~65–70% | Default |
| `two-tier` (answer + reason) | ~20% | Concentrated where mechanism decides action (`pharm`, `substance`, `neurocog`, `ethics` ≥3 each at V1) |
| `relational` | ~10–12% bank-wide | All 16 `relational`-category items + ≥6 embedded in other categories at V1 (signature) |

### 6f. Intended difficulty
| Level | Meaning | Target |
|---|---|---|
| 1 (foundational) | one classic cue; pattern names itself | ~25% |
| 2 (standard) | competing cues; pattern → first action | ~55% |
| 3 (advanced) | attractive mimic / confidently-wrong bait | ~20% |
Per category, not just globally.

### 6g. Exam alignment tag (`exam_alignment`)
| Value | Meaning | Target share |
|---|---|---|
| `both` | Shared/core — high-yield on Shelf and COMAT | ~70% |
| `shelf` | NBME-emphasis (e.g., adverse-effect ID, ambulatory next-step framing, foundational-science mechanism) | ~15% |
| `comat` | COMAT-emphasis (osteopathic holistic framing, health-care-delivery/prevention, DO-relevant presentations) | ~15% |

---

## 7. Pilot (24) — required blueprint cells

2 items per `category`. The pair per category is chosen to satisfy, *across the 24*, every
explicit pilot requirement in the brief:

| Requirement | How the 24 satisfy it |
|---|---|
| ≥1 item from every major diagnostic family | 12 categories × 2 = all families represented |
| Diagnosis **and** management decisions | ~15 dx-primary, ~9 management-primary |
| Ambulatory, ED, **and** inpatient settings | ~15 ambulatory · ~6 ED · ~3 inpatient |
| Child/adolescent **and** adult | ≥3 pediatric (both `childdev`, +1 peds anxiety/OCD); rest adult |
| Pharmacology **and** non-pharmacologic treatment | `pharm` pair + psychotherapy/MI items in `anxiety`/`relational` |
| One psychiatric emergency | ≥3 (serotonin syndrome, alcohol-withdrawal/DTs, catatonia, agitation, overdose across `safety`/`neurocog`/`substance`/`pharm`) |
| One ethics/communication item | `ethics` pair + `relational` pair |
| Meaningful COMAT differentiation | ≥4 `comat`-emphasis items with genuine osteopathic/holistic framing (not forced OMT) |
| ≥1 relational/family-centered clinical decision | `relational` pair (family-system + what-would-you-say) + embedded means-safety in `safety` |

Pilot cross-cutting actuals (achieved): 3 two-tier (`qbx_psy_002`, `qbx_sud_001`,
`qbx_pha_001`) · 2 relational-type items plus ≥3 additional relational/communication
decisions embedded in `safety`/`ethics` (`qbx_saf_001`, `qbx_saf_002`, `qbx_eth_002`) ·
difficulty 5/14/5 (L1/L2/L3 ≈ 21/58/21%) · correct keys balanced A–D (6/6/6/6) ·
site 15/5/4 (ambulatory/ED/inpatient). Inpatient runs slightly high at pilot scale (16.7%)
to exercise the setting; the 180/360 banks enforce the 5–10% cap.

Exact per-item cell assignments are recorded in `05_coverage_dashboard.json` and the
`blueprint` block of every item in `04_pilot_batch_01.json`.

---

## 8. What this crosswalk deliberately does *not* claim

- It does **not** assert exact official per-category weights — neither board publishes them.
- It does **not** treat `pharm`/`safety`/`relational`/`ethics` as if the official blueprints
  carve them out as content buckets; §4 documents that they are skill/task axes we elevate for
  curriculum reasons, cross-tagged to disorders.
- It does **not** reuse any official or commercial item; category *organization* only is drawn
  from the published outlines.

*Access date for all official figures: 2026-07-13. Re-verify against the live pages before the
360- or 480-item expansion.*
