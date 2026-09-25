# contentHash backfill — 2026-09-18

Report-only. This file ships to no learner site; it is the durable record of a one-time governance commit, so that a year from now the provenance of any single `contentHash` in `13_Faculty_Resources/reviewed.json` can be recovered without re-deriving it.

## What was bound, and why

Until this commit, an attestation in `reviewed.json` recorded a person, a date and a risk level — and never an answer to "reviewed WHAT?". That is root cause 2 of the 2026-09-16 breach (PRs #640 and #672 added 85 citations to already-attested pages; see `CITATION_AUDIT_2026-09-17.md`): rewriting an attested page afterwards cost nothing and showed nowhere. Each reviewed row now carries a `contentHash` binding it to the text it attested.

## The rule

A row's `contentHash` is the **git blob SHA of a manifest** naming every input the review covered, one line each, itself a blob SHA:

- the slug's shipped **source file(s)** — `source` plus any `extraSources` in `site_build/shipped_pages.json` — sorted by path;
- the slug's **`topic_meta.json` record**, if it has one, canonicalised with `facultyReview` removed (governance state is not content, so attesting a page must not depend on the block that records the attesting).

The defining implementation is `13_Faculty_Resources/_automation/attestation_hash.py`; `bin/check_attestation_hashes.py` is a CLI over it.

**Which tree each row was hashed against.** The owner chose on 2026-09-18 to bind each existing attestation to the text as it stood on its **own `at` date**, not to today's text: the hash records what the reviewer saw. So `rev` is the last commit on `origin/main` touching the page's primary source **on or before** that date. Where no such commit exists — the row predates the first commit that touches its source — the **earliest** recorded blob is used instead and the row is marked `basis=earliest`; there is no earlier tree to hash, and inventing one would be worse than saying so.

**The attestation day ends at 23:59:59 UTC.** Pinned explicitly, because `git rev-list --before=<date>T23:59:59` is read in the caller's local timezone: before the pin, six rows (`withdrawal.html`, `suicide.md`, `violence.md`, `collateral_workflow.md`, `psychotherapy.md`, `case_formulation.md`) resolved to different commits — and different digests — under `TZ=Asia/Tokyo`. UTC and US-Eastern agreed, so the values below are the committed ones; a replay under both zones reproduces `reviewed.json` byte-identically.

## Counts

| | |
|---|---|
| rows bound | **108** |
| `basis=at-date` | 90 |
| `basis=earliest` | 18 |
| stale against today's text | 94 |
| still matching today's text | 14 |
| ledger-only legacy rows (not bound; no site ships them) | 3 |
| unbound · malformed · unresolvable after the backfill | 0 · 0 · 0 |

`at`, `by`, `status`, `risk` and `reason` were untouched. The only key added is `contentHash`.

The 94 rows marked `stale now = yes` **are expected to be re-attested in the faculty console before the drift-aware rendering ships**. Stale is a notice, not a failure: `python3 bin/check_attestation_hashes.py` exits 0 on them. It does not mean those pages are wrong; it means the text moved after the review, and nothing until now could say so.

## Disclosure: how concentrated the revs are

**53 of the 108 rows resolve to the single commit `a7793cc`** (2026-07-02 · Baseline: Psychiatry Clerkship Library source of truth). That is the repository's baseline import, so for those rows "the text as of the attestation date" is "the text as it entered git" — the history genuinely holds nothing finer. The binding is still exact and re-derivable, but it carries less independent information than a row pinned to a commit made for that page. Stated here rather than left for a reader to notice.

Full distribution across 27 distinct commits: 53×`a7793cc` · 10×`44e48b3` · 8×`711a37e` · 8×`05337b2` · 3×`f6655c7` · 2×`70a40c7` · 2×`cf3fde1` · 2×`1e6aa48` · 2×`8f7f6eb`, then 18 singletons.

- `a7793cc` ×53 — 2026-07-02 · Baseline: Psychiatry Clerkship Library source of truth
- `44e48b3` ×10 — 2026-07-02 · content: restore 10 pages dropped by the git cutover (46 -> 56)
- `711a37e` ×8 — 2026-07-09 · Reconcile faculty attestation metadata
- `05337b2` ×8 — 2026-07-03 · Incorporate video handoff: bedside tool bar, video-library scaffolding, orientation-video move to MS3
- `f6655c7` ×3 — 2026-09-03 · WP-5i: eight MS3-COTW gaps, and the pages that then disagreed with themselves
- `70a40c7` ×2 — 2026-09-02 · WP-5b: the eleven S2 findings across seven Case-of-the-Week pages
- `cf3fde1` ×2 — 2026-09-02 · WP-5e/f/g/h: S5 tier, the thiamine myth, untraceable statistics, resident-COTW gaps (#474)
- `1e6aa48` ×2 — 2026-07-04 · content(clinical): clozapine/lithium wording + OSCE scored checklists (#102 #103)
- `8f7f6eb` ×2 — 2026-08-23 · attest(therapy): faculty sign-off on the therapy curriculum — 55 sources, both pages (#390)

## The five SafetyKit pages

The crisis-routing targets in `curriculum.json`'s `safetyKit` are the highest-consequence rows in this table, so they are called out rather than left to be found:

| slug | at | rev | basis | commits since at | stale now |
|---|---|---|---|---|---|
| pg_suicide.md | 2026-07-03 | a7793cc | at-date | 2 | yes |
| agitation.md | 2026-07-03 | a7793cc | at-date | 8 | yes |
| exp_consult.md | 2026-07-03 | a7793cc | at-date | 5 | yes |
| t_sud.md | 2026-07-01 | a7793cc | earliest | 9 | yes |
| delirium.md | 2026-07-03 | a7793cc | at-date | 4 | yes |

All five are stale against today's text and await re-attestation.

## Reproducing any row by hand

```bash
# the manifest and digest as of the row's own rev — re-derives the STORED hash
python3 bin/check_attestation_hashes.py --explain <slug> --rev <rev>

# against today's tree instead (this is what `stale now` compares)
python3 bin/check_attestation_hashes.py --explain <slug>

# and with plain git, from the manifest the command prints
git rev-parse <rev>:<source path>
printf '%s\n' '<manifest line>' '<manifest line>' | git hash-object --stdin
```

**One caveat on what `--rev` reproduces.** `--explain --rev` — and the backfill that wrote
these hashes — applies TODAY's source-path set from `shipped_pages.json` to the blobs at the
historical revision. It does not reconstruct what `shipped_pages.json` said on the `at` date.
So for a slug whose source set has since changed (an `extraSources` entry added by a resident
override, a source file renamed), the manifest is self-consistent with the ledger — it is
exactly what the stored hash covers, and it re-derives — but it is **not** "the manifest as it
would have been computed on that date". Every row here reproduces its stored hash; that is the
property the backfill guarantees, and it is a narrower one than historical fidelity.

## The table

Generated by `python3 bin/check_attestation_hashes.py --write-backfill --as-of-attestation --table <path>` — these are the tool's own rows, not transcribed. `commits since at` counts commits on `origin/main` touching the slug's sources after its attestation day; `stale now` compares the bound hash with the working tree at the time of the backfill commit.

| slug | at | rev | basis | commits since at | stale now |
|---|---|---|---|---|---|
| adv_psychopharm.md | 2026-07-04 | a7793cc | at-date | 4 | yes |
| agitation.md | 2026-07-03 | a7793cc | at-date | 8 | yes |
| anki.md | 2026-08-11 | a96e32f | at-date | 0 | no |
| bfcrs.html | 2026-06-30 | a7793cc | earliest | 10 | yes |
| book_library.md | 2026-07-03 | a7793cc | at-date | 2 | yes |
| brief_psychotherapy.md | 2026-07-03 | a7793cc | at-date | 5 | yes |
| canon_200.md | 2026-07-04 | a7793cc | at-date | 2 | yes |
| capacity.html | 2026-06-30 | a7793cc | earliest | 7 | yes |
| case_formulation.md | 2026-07-09 | 711a37e | at-date | 4 | yes |
| cases.md | 2026-07-03 | a7793cc | at-date | 1 | yes |
| catatonia.md | 2026-07-03 | a7793cc | at-date | 1 | yes |
| cl_reference.md | 2026-07-04 | a7793cc | at-date | 6 | yes |
| collateral_workflow.md | 2026-07-09 | 711a37e | at-date | 2 | yes |
| communication-practice.html | 2026-07-09 | 0b69a61 | at-date | 8 | yes |
| core_readings.md | 2026-06-30 | a7793cc | earliest | 3 | yes |
| cotw_20260713_agitation_ms3.md | 2026-09-04 | f6655c7 | at-date | 0 | no |
| cotw_20260713_agitation_res.md | 2026-09-04 | f6655c7 | at-date | 0 | no |
| cotw_20260720_bipolar_ms3.md | 2026-09-04 | 70a40c7 | at-date | 0 | no |
| cotw_20260720_bipolar_res.md | 2026-09-08 | 70a40c7 | at-date | 0 | no |
| cotw_20260726_etohwd_ms3.md | 2026-09-04 | f6655c7 | at-date | 0 | no |
| cotw_20260726_etohwd_res.md | 2026-09-04 | cf3fde1 | at-date | 0 | no |
| cotw_20260827_bpd_ms3.md | 2026-09-08 | cd1ae13 | at-date | 0 | no |
| cotw_20260827_bpd_res.md | 2026-09-11 | 5b980e9 | at-date | 0 | no |
| cotw_20260831_catatonia_ms3.md | 2026-09-11 | cf3fde1 | at-date | 0 | no |
| cotw_20260831_catatonia_res.md | 2026-09-11 | 8d9bc30 | at-date | 0 | no |
| cotw_20260907_fep_ms3.md | 2026-09-14 | 7c9c6a5 | at-date | 0 | no |
| cotw_index.md | 2026-08-11 | 6178a6b | at-date | 4 | yes |
| cssrs.html | 2026-06-30 | a7793cc | earliest | 7 | yes |
| cultural_psychiatry.md | 2026-07-04 | 44e48b3 | at-date | 1 | yes |
| ddx.md | 2026-07-01 | a7793cc | earliest | 3 | yes |
| decision-aids.html | 2026-06-30 | a7793cc | earliest | 9 | yes |
| delirium.md | 2026-07-03 | a7793cc | at-date | 4 | yes |
| diagnostic-reasoning.html | 2026-07-09 | c265b2c | at-date | 5 | yes |
| doc_oral.md | 2026-07-03 | a7793cc | at-date | 5 | yes |
| ect_neuromodulation.md | 2026-07-04 | 44e48b3 | at-date | 3 | yes |
| ethics_legal.md | 2026-07-04 | 44e48b3 | at-date | 4 | yes |
| evidence_inpatient.md | 2026-07-03 | a7793cc | at-date | 4 | yes |
| exp_consult.md | 2026-07-03 | a7793cc | at-date | 5 | yes |
| exp_family.md | 2026-07-03 | a7793cc | at-date | 7 | yes |
| exp_tx.md | 2026-07-03 | a7793cc | at-date | 0 | yes |
| family-systems.html | 2026-07-09 | 6e4b4f3 | at-date | 9 | yes |
| family_modalities.md | 2026-07-03 | a7793cc | at-date | 0 | yes |
| family_playbook.md | 2026-07-03 | a7793cc | at-date | 2 | yes |
| feedback.html | 2026-07-05 | a7793cc | at-date | 3 | yes |
| interaction-cards.html | 2026-08-23 | 79f344c | at-date | 2 | yes |
| interview-circle.html | 2026-07-05 | 05337b2 | at-date | 6 | yes |
| landmark_trials.md | 2026-07-03 | a7793cc | at-date | 3 | yes |
| med_monitoring.md | 2026-07-10 | 711a37e | at-date | 3 | yes |
| medical_workup.md | 2026-07-10 | 711a37e | at-date | 4 | yes |
| motivational_interviewing.md | 2026-07-03 | a7793cc | at-date | 2 | yes |
| mse.html | 2026-06-30 | a7793cc | earliest | 7 | yes |
| nutrition_metabolic.md | 2026-07-03 | a7793cc | at-date | 3 | yes |
| omm_resources.md | 2026-07-03 | a7793cc | at-date | 0 | yes |
| one-patient-six-weeks.html | 2026-08-11 | 58fd563 | at-date | 2 | yes |
| oral.html | 2026-06-30 | a7793cc | earliest | 5 | yes |
| orientation-video.html | 2026-07-03 | 05337b2 | at-date | 3 | yes |
| orientation.md | 2026-06-30 | a7793cc | earliest | 4 | yes |
| osce.md | 2026-07-04 | 1e6aa48 | at-date | 2 | yes |
| pg_formulation.md | 2026-07-03 | a7793cc | at-date | 0 | yes |
| pg_interview.md | 2026-07-03 | a7793cc | at-date | 1 | yes |
| pg_suicide.md | 2026-07-03 | a7793cc | at-date | 2 | yes |
| podcast_library.md | 2026-07-03 | a7793cc | at-date | 0 | yes |
| protocol_library.md | 2026-07-03 | a7793cc | at-date | 2 | yes |
| psychopharm_primer.md | 2026-08-11 | be90371 | at-date | 1 | yes |
| psychotherapy.md | 2026-07-09 | 711a37e | at-date | 0 | yes |
| question-bank-practice.html | 2026-07-05 | b33a410 | at-date | 20 | yes |
| rapid_review.md | 2026-07-10 | 104ace8 | at-date | 4 | yes |
| reading_map.md | 2026-07-03 | a7793cc | at-date | 1 | yes |
| reflection.html | 2026-06-30 | a7793cc | earliest | 5 | yes |
| review.html | 2026-07-05 | a7793cc | at-date | 16 | yes |
| rotation-curator.html | 2026-08-23 | 21458d3 | at-date | 1 | yes |
| rotation.md | 2026-07-04 | a7793cc | at-date | 0 | yes |
| rp-canon-quiz.html | 2026-07-05 | a7793cc | at-date | 3 | yes |
| screeners.html | 2026-06-30 | a7793cc | earliest | 9 | yes |
| shelf-mode.html | 2026-07-05 | a7793cc | at-date | 6 | yes |
| shelf.md | 2026-07-03 | a7793cc | at-date | 0 | yes |
| sp-interview.html | 2026-09-17 | fb81d95 | at-date | 0 | no |
| suicide.md | 2026-07-09 | 711a37e | at-date | 3 | yes |
| supervision_teaching.md | 2026-07-04 | a7793cc | at-date | 1 | yes |
| systems_medlegal.md | 2026-07-04 | a7793cc | at-date | 4 | yes |
| t_adjustment.md | 2026-07-03 | 44e48b3 | at-date | 3 | yes |
| t_anxiety.md | 2026-07-01 | a7793cc | earliest | 7 | yes |
| t_dissociative.md | 2026-07-03 | 44e48b3 | at-date | 2 | yes |
| t_eating.md | 2026-07-01 | a7793cc | earliest | 3 | yes |
| t_geri.md | 2026-07-01 | a7793cc | earliest | 3 | yes |
| t_impulse.md | 2026-07-03 | 44e48b3 | at-date | 1 | yes |
| t_mood.md | 2026-07-04 | 1e6aa48 | at-date | 7 | yes |
| t_neurocog.md | 2026-07-03 | 44e48b3 | at-date | 4 | yes |
| t_neurodev.md | 2026-07-03 | a7793cc | at-date | 2 | yes |
| t_perinatal.md | 2026-07-01 | a7793cc | earliest | 9 | yes |
| t_personality.md | 2026-07-01 | a7793cc | earliest | 5 | yes |
| t_psychosis.md | 2026-08-11 | 496c85a | at-date | 0 | yes |
| t_sexual.md | 2026-07-04 | 44e48b3 | at-date | 1 | yes |
| t_sleep.md | 2026-07-03 | 44e48b3 | at-date | 1 | yes |
| t_somatic.md | 2026-07-03 | 44e48b3 | at-date | 1 | yes |
| t_sud.md | 2026-07-01 | a7793cc | earliest | 9 | yes |
| therapy_on_the_unit.md | 2026-08-23 | 8f7f6eb | at-date | 3 | yes |
| therapy_reading_room.md | 2026-08-23 | 8f7f6eb | at-date | 2 | yes |
| toxidromes.md | 2026-07-10 | 711a37e | at-date | 1 | yes |
| violence.html | 2026-06-30 | a7793cc | earliest | 7 | yes |
| violence.md | 2026-07-09 | 711a37e | at-date | 3 | yes |
| week1.md | 2026-07-03 | 05337b2 | at-date | 3 | yes |
| week2.md | 2026-07-03 | 05337b2 | at-date | 1 | yes |
| week3.md | 2026-07-03 | 05337b2 | at-date | 2 | yes |
| week4.md | 2026-07-03 | 05337b2 | at-date | 1 | yes |
| week5.md | 2026-07-03 | 05337b2 | at-date | 3 | yes |
| week6.md | 2026-07-03 | 05337b2 | at-date | 1 | yes |
| withdrawal.html | 2026-09-10 | f34e5e4 | at-date | 0 | no |

## Addendum 2026-09-19 — the seven console attestations of 2026-09-18

PR #700 landed the seven rows the faculty console promoted on 2026-09-18 without a `contentHash` (the console gained its hash writer only in Gate A 1a). They were bound with the same rule and the same tool on 2026-09-19, each to the inputs as of the last `origin/main` commit on or before its `at` date (UTC day boundary). `at`, `by` and `status` untouched. Reproduce a row with `python3 bin/check_attestation_hashes.py --explain SLUG --rev REV`.

| slug | at | rev | basis | commits since at | stale now |
|---|---|---|---|---|---|
| cotw_20260720_mdd_ms3.md | 2026-09-18 | afd1863 | at-date | 0 | no |
| cotw_20260720_mdd_res.md | 2026-09-18 | afd1863 | at-date | 0 | no |
| cotw_20260727_oud_ms3.md | 2026-09-18 | afd1863 | at-date | 0 | no |
| cotw_20260803_lithium_ms3.md | 2026-09-18 | afd1863 | at-date | 0 | no |
| cotw_20260803_lithium_res.md | 2026-09-18 | afd1863 | at-date | 0 | no |
| cotw_20260907_fep_res.md | 2026-09-18 | afd1863 | at-date | 0 | no |
| rounds_questions.md | 2026-09-18 | 34fdf4e | at-date | 0 | no |
