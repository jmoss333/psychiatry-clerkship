# `safetyLevel` audit — all 71 topics

**Date:** 2026-08-08 · **Against:** `origin/main` @ `88bd411` · **Author:** Joshua Moss, MD (with Claude)
**Status:** D-1 through D-7 **approved by faculty and implemented** (PR #326). **D-17 implemented**
— caution lines added to the four unguarded pages. D-8 through D-16 still open.

> **Faculty attestation, 2026-08-08:** Joshua Moss, MD reviewed the content of all seven pages and
> confirmed them clinically accurate and safe. `facultyReview` on those topics records that review.
>
> **One finding blocked a promotion until it was fixed.** `t_anxiety.md` cited Lima et al.
> (Cochrane 2004) twice as "the strongest evidence" for propranolol in akathisia. Verification
> against PubMed showed the review is real (PMID 15495022) but concludes the opposite: three RCTs,
> total n=51, *"insufficient data to recommend beta-blocking drugs for akathisia."* Its scope is
> central-action beta-blockers, not propranolol. The clinical recommendation is standard practice
> and unchanged; the **evidence claim** was corrected to state the trial base honestly. This is the
> mis-attribution pattern the gate exists to catch, and it would not have surfaced without
> verifying rather than trusting a remembered citation.

Read the **Decisions needed** table, mark each row agree / disagree / defer. Every row is
independently changeable.

---

## Why this exists

`validate_topic_meta.py:297-302` is the only hard clinical gate in the repository:

```python
if v.get("safetyLevel") == "high":
    if not v.get("evidenceIds"):
        bad(k, "high-risk page requires non-empty evidenceIds")
    fr = v.get("facultyReview")
    if not isinstance(fr, dict) or not fr.get("status") or not fr.get("lastReviewed"):
        bad(k, "high-risk page requires facultyReview.status and facultyReview.lastReviewed")
```

It works. All 7 topics tagged `high` carry evidence and a review record. **But the tag is opt-in,
and it is unset on most of the pages that carry dosing, thresholds, antidotes, teratogenicity, and
legal standards.** Current state across 71 topics:

| | count |
|---|---|
| `safetyLevel: high` | 7 (all reviewed, all with evidence) |
| `safetyLevel: moderate` | 6 (`collateral_workflow`, `cotw_index`, `ethics_legal`, `med_monitoring`, `medical_workup`, `protocol_library`, `toxidromes`) — **all with zero `evidenceIds`** |
| `safetyLevel` unset | 58 |
| `facultyReview` record present | 13 (+1 pending) |
| `evidenceIds` present | 7 |

**The risk here is unverified content, not known-wrong content.** The site already shows a blanket
"some pages are pending faculty review" notice. The gap is that the mechanism built to distinguish
*reviewed* from *probably fine* isn't reaching the pages where the distinction matters most.

---

## Three structural findings

**1. `moderate` currently enforces nothing.** The validator branches only on `high`. A `moderate`
tag is advisory — it buys no evidence requirement, no review requirement, no build failure. Six
pages carry it and none has evidence. Either that is intentional (a triage label) or `moderate`
should require `facultyReview` without requiring `evidenceIds`. **Decision D-15 below.**

**2. Two of the highest-risk pages are invisible to every governance loop.**
`adv_psychopharm.md` and `systems_medlegal.md` are resident-track pages injected by `RES_EXTRA`
in `resident_section.py:55-56`. They are **not in `site_manifest.json`**, so
`validate_attestation_consistency.py` never iterates them (it loops the manifest). They ship to
MMC residents with no manifest entry, no evidence, and no review record — and
`adv_psychopharm.md` is the single densest unguarded page in the curriculum.

**3. Page-level guarding does not track page-level risk.** This is independent of `safetyLevel`
and cheaper to fix:

| Page | Safety-bearing content | Caution / deferral present |
|---|---|---|
| `t_anxiety.md` | propranolol 20–40 mg BID, clonazepam 0.5–1 mg, mirtazapine 15 mg, β-blocker contraindications | ~~none~~ → footer deferral (D-17) |
| `adv_psychopharm.md` | MAOI contraindications, clozapine ileus/myocarditis, lithium interactions | ~~none~~ → footer deferral (D-17) |
| `t_psychosis.md` | NMS vs SS discriminator, dantrolene/bromocriptine/cyproheptadine | ~~none~~ → footer deferral (D-17) |
| `t_mood.md` | lithium 0.6–1.2 mEq/L, NSAID/ACE/thiazide interaction, valproate teratogenicity | ~~none~~ → footer deferral (D-17) |
| `t_eating.md` | admission thresholds (HR <40–50), refeeding, fluoxetine 60 mg | 2 in-body deferrals |
| `nutrition_metabolic.md` | timed metabolic schedule, tyramine restriction | 3 layers |
| `systems_medlegal.md` | commitment procedure, restraints, medication over objection | strongest in repo, in-body |

`t_anxiety.md` was the sharpest single item in this audit: **four explicit mg doses, a
contraindication list, and not one word of caution or deferral.** D-17 closed that gap on all
four pages; the deferral names each page's own hazard rather than repeating a generic disclaimer.

---

## Decisions needed

Rubric used: **high** = a learner acting on a wrong detail could directly cause serious patient
harm before anyone catches it. **moderate** = a wrong detail misleads, but supervision, pharmacy,
or an order set intercepts it first. **low** = no dosing, thresholds, toxicity, emergencies, or
legal standards.

### Promote to `high` — recommended (10)

| # | Topic | Now | Why | Worst realistic consequence |
|---|---|---|---|---|
| D-1 | `med_monitoring.md` | moderate | Lithium trough targets, clozapine ANC schedule, QTc ceilings, HLA-B*1502 | ANC interval extended on a misremembered schedule → undetected agranulocytosis, fatal sepsis |
| D-2 | `toxidromes.md` | moderate | Antidote table for 4 lethal syndromes; "never give an antipsychotic in NMS" | Anticholinergic toxicity read as NMS → wrong antidote; or antipsychotic given to a rigid febrile patient |
| D-3 | `t_anxiety.md` | unset | 4 explicit mg doses + β-blocker contraindications, zero guarding | Propranolol to an asthmatic/bradycardic patient → bronchospasm, heart block |
| D-4 | `adv_psychopharm.md` | unset | MAOI contraindications, clozapine ileus/myocarditis, lithium, valproate NTD | Missed clozapine ileus → bowel perforation; MAOI + serotonergic → hypertensive crisis |
| D-5 | `t_psychosis.md` | unset | NMS vs SS discriminator with antidote-level management | Wrong syndrome identified → wrong antidote, continued dopamine blockade, death |
| D-6 | `t_mood.md` | unset | Lithium 0.6–1.2 mEq/L + interaction list; valproate teratogenicity | Level misread or NSAID interaction missed → lithium toxicity, permanent neuro sequelae |
| D-7 | `t_eating.md` | unset | Medical-admission thresholds, refeeding, fluoxetine 60 mg, bupropion contraindication | AN patient with HR 42 kept on a psych bed → arrest; bupropion in a purger → seizure |
| D-8 | `t_perinatal.md` | unset → **high** ✅ | Pregnancy/lactation drug guidance; postpartum psychosis as emergency | Missed postpartum psychosis → maternal suicide or infanticide; teratogenic exposure |
| D-9 | `t_neurocog.md` | unset → **high** ✅ | Black-box mortality; **avoid antipsychotics in Lewy body dementia** | Typical antipsychotic in unrecognized LBD → neuroleptic sensitivity reaction, death |
| D-10 | `psychopharm_primer.md` | unset → **high** ✅ | MAOI washout intervals (≥2 wk; ≥5 wk fluoxetine) | Wrong washout acted on → serotonin syndrome or hypertensive crisis |

> **D-10 surfaced a limit of the evidence model.** The washout intervals are a *regulatory
> labeling* statement, not a literature finding — no PubMed-indexed study reports them as a
> result. `fda-drug-safety` is a generic monitoring endpoint and citing it for a specific number
> would be the same loose attribution the gate exists to catch. The interval is instead sourced to
> the FDA-approved PROZAC labeling §2.9, quoted verbatim in the registry entry's `identity.note`,
> with `identity.status: exception` because there is no bibliographic record to resolve. This is
> the second strain on the literature assumption after `ethics_legal`'s statutes (D-11) — a
> first-class `labeling` / `regulatory` source type is worth considering if a third appears.

### Promote to `high` — judgment calls, your call (3)

| # | Topic | Now | The argument for `high` | The argument against |
|---|---|---|---|---|
| D-11 | `ethics_legal.md` | moderate | Duty to warn, commitment criteria, capacity standard, involuntary medication. Harm is unlawful detention or an unmet duty — serious, if not physiologic | Already carries an in-body state-variability caveat and a footer deferral; harm is medicolegal, and the gate was built for clinical risk |
| D-12 | `systems_medlegal.md` | unset | Maine Title 34-B procedure, restraint rules, medication over objection. Resident-only and outside the manifest, so nothing governs it today | Best-guarded page in the repo — four separate in-body "verify, never quote a remembered number" statements |
| D-13 | `ect_neuromodulation.md` | unset | "There are no absolute contraindications" is exactly the line that gets repeated on rounds without its relative-risk caveat; describes a general-anesthesia procedure | An MS3 never orders ECT; the decision always passes through an ECT service and anesthesia |

### Keep / set `moderate` (no build change, advisory only)

`medical_workup.md` (orders tests, not doses) · `nutrition_metabolic.md` (well-guarded; schedule
errors surface at the next visit) · `t_personality.md` (benzodiazepine rule with HR/CI, but a
student is not prescribing) · `t_neurodev.md` (stimulant contraindications) · `t_sleep.md` (avoid
anticholinergics in elderly) · `t_somatic.md` and `t_sexual.md` (mandatory-reporting duties) ·
`collateral_workflow.md`, `cotw_index.md`, `protocol_library.md` (already moderate)

### Set `low` (explicitly, so "unset" stops meaning two different things)

`t_impulse.md` · `t_adjustment.md` · `t_dissociative.md` · plus the ~40 non-clinical pages
(week1–6, orientation, welcome, reading maps, libraries, OSCE, shelf, experience pages, pg_*
guides, doc_oral, rounds_questions, cases, ddx, anki).

**D-14:** worth doing? It converts "unset" from ambiguous ("nobody looked" vs "looked, it's fine")
into a positive statement, at the cost of 40 mechanical edits.

### Structural

| # | Question |
|---|---|
| D-15 | Should `moderate` require `facultyReview` (but not `evidenceIds`)? Today it enforces nothing. This would add 6–15 review obligations but make the middle tier mean something. |
| D-16 | Should `adv_psychopharm.md` and `systems_medlegal.md` be added to `site_manifest.json` so `validate_attestation_consistency.py` covers them? They are resident-only today and invisible to it. |
| ~~D-17~~ | ~~Separate from tagging: add a caution/deferral line to the 4 unguarded high-risk pages (D-3, D-4, D-5, D-6).~~ **Done.** Each footer now carries a deferral naming that page's specific hazard — β-blocker contraindications (`t_anxiety`), NMS/SS antidote selection (`t_psychosis`), lithium levels and interactions (`t_mood`), washouts and clozapine REMS (`adv_psychopharm`). |

---

## Sequencing constraint

**You cannot flip the tags first.** Promoting a topic to `high` without `evidenceIds` **and**
`facultyReview.lastReviewed` fails the build immediately (`validate_topic_meta.py:297-302`), and
that validator runs in CI *and* in the publish gate. So each promotion is:

1. gather candidate evidence for the page's safety-bearing claims
2. you attest — `attest_serve.py` for `topic_meta`, or PR review
3. flip `safetyLevel` to `high` in the same commit as the evidence + review fields

Batching 2–3 topics per PR keeps each reviewable. **D-17 is the exception** — caution lines need
no evidence and no attestation, so they can ship immediately and independently.

## What I can prepare, and what only you can decide

I can: resolve each page's safety-bearing claims into a citation-needed list, run the evidence
pipeline to propose candidate sources per claim, draft the `evidenceIds` entries, and stage them
in `attest_serve.py` so you are approving prepared items rather than starting cold.

You decide: whether each claim is correct, whether the proposed citation supports it, and whether
the page is ready to carry a `reviewed` stamp. That is the whole point of the gate.

Rough scale if D-1 through D-10 are approved: 10 topics, ~4–6 claims each. With evidence
pre-pulled, this is an afternoon of review, not a project.
