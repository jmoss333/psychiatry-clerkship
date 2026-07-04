# QUESTION_BANK_BLUEPRINT — Shelf categories, target counts, and source pages

> **Status:** AI-drafted, pending faculty attestation. Companion to
> `QUESTION_BANK_STANDARD.md` (quality bar) and `QUESTION_BANK_EXECUTION_BRIEF.md` (work order).

## The exam this serves

Per the site's own shelf guide (`shelf.md`), **UNE COM students take the NBOME COMAT Clinical
Psychiatry exam**, not the NBME shelf — the same high-yield content serves both, and this
blueprint is written to both. Categories below follow the NBME-subject-exam style of
organization (disorder clusters × physician tasks) and map one-to-one onto the shelf guide's
own High-Yield Domains. **Neither NBME nor NBOME publishes exact per-category weights**, so the
counts are curriculum-weighted: proportional to exam emphasis as the shelf guide teaches it,
and to the depth of owned library content — never a claimed copy of an official distribution.

Every item is tagged `category` × `competency` (§8 of the standard). Competency tags:
`dx` · `next-step` · `management` · `safety` · `pharm` · `psychosocial`.

## Categories and targets — 144 items total

| # | `category` | Name | Target | Source pages (item `pages` must include ≥1) | Competency emphasis |
|---|---|---|---|---|---|
| 1 | `mood` | Mood disorders | 16 | `t_mood.md`, `ect_neuromodulation.md` | dx, next-step, pharm; ≥2 safety |
| 2 | `psychosis` | Psychotic disorders | 14 | `t_psychosis.md` | dx (mimics!), next-step, pharm |
| 3 | `anxiety` | Anxiety, OCD & trauma | 12 | `t_anxiety.md` | dx, management, psychosocial |
| 4 | `substance` | Substance use & withdrawal | 14 | `t_sud.md`, `protocol_library.md` | next-step, safety, pharm |
| 5 | `neurocog` | Neurocognitive & medical mimics (delirium, dementia, catatonia) | 16 | `delirium.md`, `t_neurocog.md`, `t_geri.md`, `catatonia.md`, `exp_consult.md` | dx, safety, next-step |
| 6 | `pharm` | Psychopharmacology & neuromodulation | 16 | `psychopharm_primer.md`, `protocol_library.md`, `ect_neuromodulation.md`, `landmark_trials.md` | pharm, safety (medication emergencies), management (monitoring) |
| 7 | `safety` | Suicide risk, violence, agitation & restraint | 12 | `pg_suicide.md`, `agitation.md` | safety (all), next-step, psychosocial |
| 8 | `personality` | Personality disorders | 6 | `t_personality.md` | dx, psychosocial, safety |
| 9 | `childdev` | Neurodevelopmental & impulse-control | 6 | `t_neurodev.md`, `t_impulse.md` | dx, management, pharm |
| 10 | `otherdx` | Eating, somatic, sleep, dissociative, sexual/gender, adjustment, perinatal, nutrition | 12 | `t_eating.md`, `t_somatic.md`, `t_sleep.md`, `t_dissociative.md`, `t_sexual.md`, `t_adjustment.md`, `t_perinatal.md`, `nutrition_metabolic.md` | dx, next-step; ≥1 item per listed page; ≥2 safety (refeeding, perinatal) |
| 11 | `ethics` | Ethics, law & capacity | 8 | `ethics_legal.md`, `exp_consult.md` | dx (capacity ≠ refusal), next-step, safety |
| 12 | `relational` | Relational, communication & transitions of care — **signature category** | 12 | `exp_family.md`, `family_playbook.md`, `family_modalities.md`, `motivational_interviewing.md`, `doc_oral.md`, `brief_psychotherapy.md`, `cultural_psychiatry.md` | psychosocial (all), safety (means safety, discharge), management |

**Totals:** 16+14+12+14+16+16+12+6+6+12+8+12 = **144 items**.

## Cross-cutting mix requirements

- **Item types:** ~20% two-tier bank-wide, concentrated where mechanism decides action
  (`pharm`, `substance`, `neurocog`, `ethics` ≥3 each). All 12 `relational`-category items are
  `type: "relational"`, plus ≥4 relational-type items embedded in other categories (`safety`
  discharge scenarios, `substance` MI moments, `otherdx` perinatal, `ethics` collateral/
  confidentiality conversations) — target ≥16 relational items bank-wide.
- **Competency spread:** each category ≥3 distinct competency tags across its items; every
  category that touches a can't-miss (mood, psychosis, substance, neurocog, safety, otherdx,
  ethics) carries ≥1 `safety`-tagged item.
- **Difficulty:** ~25% level 1, ~55% level 2, ~20% level 3 — per category, not just globally
  (a category of all-easy or all-stretch items is mis-calibrated).
- **Correct-key rotation:** authored correct keys approximately balanced A–D within each
  category (the JSON must not develop a positional tell).
- **`hy` scarcity:** ≤ ⅓ of items, same discipline as `topic_meta.json`.

## Grounding map notes

- Categories deliberately overlap pages (e.g., `protocol_library.md` serves `substance` and
  `pharm`; `exp_consult.md` serves `neurocog` and `ethics`) — the item's *discrimination*
  decides the category, the `pages` field records the grounding.
- Archetype-C resource pages (week pages, reading lists, libraries) are **not** item sources —
  same rationale as the topic-meta rule keeping them out of the review denominator. Exception:
  `landmark_trials.md` grounds `pharm` items only where a trial's practice-changing point is
  stated on a page (choose-by-side-effect-profile per CATIE, clozapine for treatment
  resistance per Kane) — never "which study showed X" recall.
- Tools are deep-link targets (`tools/withdrawal.html`, `tools/cssrs.html`,
  `tools/capacity.html`, `tools/decision-aids.html`, `tools/oral.html`), matching the existing
  `PAGE_TOOLS` pairings in the SPA — one `link` per item.

## Phase-2 production waves (contract for the drafting model)

| Wave | Scope | Items |
|---|---|---|
| 1 | 2 per category — breadth first, faculty calibration sample | 24 |
| 2 | `neurocog` + `safety` to target (the can't-miss core) | 24 |
| 3 | `substance` + `pharm` to target | 26 |
| 4 | `mood` + `psychosis` to target | 26 |
| 5 | `anxiety` + `ethics` + `personality` + `childdev` to target | 24 |
| 6 | `relational` + `otherdx` to target + gap fill against this blueprint's mix rules | 20 |

Wave 1 pauses for faculty spot-check before Wave 2 begins — calibration feedback there is worth
more than 100 uncorrected items later.
