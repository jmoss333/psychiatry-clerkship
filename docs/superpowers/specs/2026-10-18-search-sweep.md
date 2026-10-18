# Learner search sweep — 2026-10-18

- **Date:** 2026-10-18
- **Status:** BASELINE — measured, no fixes applied yet (the fixes and the after-columns follow in the next commit)
- **Owner / reviewer of record:** Joshua Moss, MD — approves every alias and synonym line before merge
- **Branch:** `claude/search-sweep-2026-10-18` from `origin/main` @ `0c0ac0f` (includes #1081 aliases and #1091 C2)
- **Class:** design spec (neutral under `check_policy_content_separation.py`)

## 1. Why

On 2026-10-17 a hand probe of ~20 terms found that *schizophrenia*, *pregnancy* and *adolescent* returned
nothing on both learner sites and that *bipolar*, *mania*, *borderline* and *panic* opened a Case-of-the-Week
edition instead of the guide. #1081 fixed those with `searchAliases` and an exact-title tier; #1091 (C2) then
changed the engine (page text blended into ranking, one bidirectional synonym list, track-scoped results).
Nothing had measured the engine as it now stands beyond the pinned fixtures. This is that measurement.

## 2. Method

- **The real search.** A scratch probe evaluates the shipped `frontdoor/fd_data.js` + `frontdoor/fd_search.js`
  (no copy, no second scorer) and calls `fdSearchResults(index, query, FD_CURRICULUM.synonyms, {bodyIndex})` —
  the call the shell makes (`spa_index.html` → `fdSearchOverlay`). Inputs are read from the **built** sites:
  each site's `FD_CURRICULUM` / `FD_TOPIC_META` / `FD_TOOL_REGISTRY` / `FD_SITE_MANIFEST` payloads out of
  `_build/<site>/index.html` (the projection `build_frontdoor_payload` produced) and that site's own
  `search-index.json` (the page-text index the shell loads) — the path `frontdoor-search-gate.mjs`'s
  `checkBuiltSearch` uses. A second mode builds the same inputs from source (the `tests/search-golden.test.mjs`
  harness); the two agree on the first result for 331 of 332 rows (the exception, resident *QTc*, flips
  between `cl_reference.md` and `psychopharm_primer.md`, both accepted by `search-golden.json`).
- **Faithfulness check.** Run at `471f29e` (the commit before #1081), the probe reproduces the 2026-10-17
  hand probe exactly on both sites: *schizophrenia*, *pregnancy*, *adolescent* → zero results; *bipolar*,
  *mania*, *borderline*, *panic* → their COTW editions (§4).
- **Vocabulary (166 queries, both sites).** (a) every DSM-5-TR chapter name and its common short forms;
  (b) 40 common inpatient psychiatric medications, generic **and** brand (80 queries); (c) the ward-task list
  verbatim; plus the seven 2026-10-17 queries. Each query carries the guide(s) that teach it, checked against
  the page source.
- **Tier** names which branch of `fdSearchMatches` produced the first result, re-derived with the module's
  own predicates (`fdSearchTriggerHit`, `fdSearchAliasHit`, `fdSearchAlternatives`, …):
  `protocol · trigger` (a safety-kit trigger phrase — the crisis contract), `protocol · haystack` (a kit page
  whose title/summary contains a query word), `alias`, `exact title`, or `scored` with its evidence
  (title/summary words, an exact medication name, the one-way `synonyms` map, a synonym group, or page text only).
- **Verdict.** `zero results`; `wrong page` = the first result is a week page, a COTW edition, a podcast /
  book / reading-list row (`podcast_library`, `book_library`, `canon_200`, `core_readings`, `landmark_trials`,
  `therapy_reading_room`, `cotw_index`, `anki`), or a tool when a guide answers the query; otherwise `OK`.
  `OK (≠ guide …)` marks an OK row whose first result is a different guide from the one that teaches the
  query — not a `wrong page` under the definition above, reported so it is not mistaken for a pass.
- **Environment.** Built in a cloud container with `CONTEXT=deploy-preview` (the soft-LFS context
  `check_lfs_media.is_soft_context()` grants previews), because its Git-LFS media are pointer stubs. Media
  bytes do not enter the search payloads or `search-index.json`. Both `build_and_check.sh ms3` and `… res`
  passed every gate.

## 3. Baseline numbers

| Site | Queries | OK | zero results | wrong page | OK but ≠ guide |
|---|---|---|---|---|---|
| MS3 | 166 | 143 | 16 | 7 | 12 |
| Resident | 166 | 142 | 15 | 9 | 10 |

## 4. The seven 2026-10-17 queries, re-measured

| Query | Before #1081 (`471f29e`) | After #1081, before C2 (`ebb6f1c`) | Now (`0c0ac0f`) | Did C2 change it? |
|---|---|---|---|---|
| schizophrenia | zero results (both) | `t_psychosis.md` · alias | `t_psychosis.md` · alias | No — first result identical; C2 added page-text rows below it (MS3 1 → 11 matches, resident 1 → 11) |
| pregnancy | zero results (both) | `t_perinatal.md` · alias | `t_perinatal.md` · alias | No — rows added below (1 → 5 / 1 → 7) |
| adolescent | zero results (both) | `t_neurodev.md` · alias | `t_neurodev.md` · alias | No — rows added below (1 → 6 / 1 → 7) |
| bipolar | `cotw_20260720_bipolar_*` | `t_mood.md` · alias | `t_mood.md` · alias | No — rows added below (4 → 8 / 4 → 10) |
| mania | `cotw_20260928_mania_*` | `t_mood.md` · alias | `t_mood.md` · alias | No — (6 → 7 / 6 → 6) |
| borderline | `cotw_20260827_bpd_*` | `t_personality.md` · alias | `t_personality.md` · alias | No — (4 → 6 / 4 → 5) |
| panic | `cotw_20260810_panic_*` | `t_anxiety.md` · alias | `t_anxiety.md` · alias | No — (2 → 2 / 2 → 2) |

C2 changed none of the seven first results; it only added recall underneath them (match counts from the source harness, the only mode that runs at older commits). All seven stay pinned in
`tests/fixtures/search-ward.json` (maxRank 1, both sites).

## 5. Per-site tables (baseline)

Legend: ⚑ = safety-protocol row. Grp: `10-17` the seven 2026-10-17 queries, `a·N` DSM-5-TR chapter N,
`b` medication, `c` ward task.

### MS3 site (une-ms3-psychiatry)

| # | Query | Grp | First result | Tier | Verdict |
|---|---|---|---|---|---|
| 1 | schizophrenia | 10-17 | `t_psychosis.md` | alias | OK |
| 2 | pregnancy | 10-17 | `t_perinatal.md` | alias | OK |
| 3 | adolescent | 10-17 | `t_neurodev.md` | alias | OK |
| 4 | bipolar | 10-17 | `t_mood.md` | alias | OK |
| 5 | mania | 10-17 | `t_mood.md` | alias | OK |
| 6 | borderline | 10-17 | `t_personality.md` | alias | OK |
| 7 | panic | 10-17 | `t_anxiety.md` | alias | OK |
| 8 | neurodevelopmental disorders | a·1 | `t_neurodev.md` | exact title | OK |
| 9 | adhd | a·1 | `t_neurodev.md` | alias | OK |
| 10 | autism | a·1 | `t_neurodev.md` | alias | OK |
| 11 | intellectual disability | a·1 | `t_neurodev.md` | scored: title/summary words | OK |
| 12 | schizophrenia spectrum and other psychotic disorders | a·2 | `t_psychosis.md` | alias | OK |
| 13 | psychotic disorders | a·2 | `t_psychosis.md` | exact title + alias | OK |
| 14 | psychosis | a·2 | `t_psychosis.md` | alias | OK |
| 15 | schizoaffective | a·2 | `t_psychosis.md` | alias | OK |
| 16 | bipolar and related disorders | a·3 | `t_mood.md` | alias | OK |
| 17 | depressive disorders | a·4 | `t_mood.md` | alias | OK |
| 18 | depression | a·4 | `t_mood.md` | alias | OK |
| 19 | major depressive disorder | a·4 | `t_mood.md` | alias | OK |
| 20 | mdd | a·4 | `cotw_20260720_mdd_ms3.md` | scored: title/summary words | **wrong page** |
| 21 | anxiety disorders | a·5 | `t_anxiety.md` | scored: title/summary words | OK |
| 22 | anxiety | a·5 | `t_anxiety.md` | scored: title/summary words | OK |
| 23 | gad | a·5 | `screeners.html` | scored: title/summary words | OK |
| 24 | obsessive-compulsive and related disorders | a·6 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_anxiety.md` #9) |
| 25 | obsessive compulsive | a·6 | `podcast_library.md` | scored: page text only | **wrong page** |
| 26 | ocd | a·6 | `t_anxiety.md` | scored: title/summary words | OK |
| 27 | trauma- and stressor-related disorders | a·7 | `t_somatic.md` | scored: title/summary words | OK (≠ guide: `t_anxiety.md` #2) |
| 28 | ptsd | a·7 | `t_anxiety.md` | scored: title/summary words | OK |
| 29 | adjustment disorder | a·7 | `t_adjustment.md` | scored: title/summary words | OK |
| 30 | dissociative disorders | a·8 | `t_dissociative.md` | exact title | OK |
| 31 | somatic symptom and related disorders | a·9 | `t_somatic.md` | scored: title/summary words | OK |
| 32 | somatic symptom disorder | a·9 | `t_somatic.md` | scored: title/summary words | OK |
| 33 | conversion disorder | a·9 | `t_adjustment.md` | scored: title/summary words | OK (≠ guide: `t_somatic.md` #11) |
| 34 | functional neurological disorder | a·9 | `cotw_20260827_bpd_ms3.md` | scored: title/summary words | **wrong page** |
| 35 | feeding and eating disorders | a·10 | `t_eating.md` | scored: title/summary words | OK |
| 36 | eating disorders | a·10 | `t_eating.md` | exact title | OK |
| 37 | anorexia | a·10 | `t_eating.md` | scored: title/summary words | OK |
| 38 | bulimia | a·10 | `t_eating.md` | scored: title/summary words | OK |
| 39 | elimination disorders | a·11 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `t_neurodev.md` #3) |
| 40 | enuresis | a·11 | `t_neurodev.md` | scored: page text only | OK |
| 41 | sleep-wake disorders | a·12 | `t_sleep.md` | exact title | OK |
| 42 | insomnia | a·12 | `t_sleep.md` | alias | OK |
| 43 | sexual dysfunctions | a·13 | `t_sexual.md` | scored: title/summary words | OK |
| 44 | gender dysphoria | a·14 | `t_sexual.md` | scored: title/summary words | OK |
| 45 | disruptive, impulse-control, and conduct disorders | a·15 | `t_impulse.md` | scored: title/summary words | OK |
| 46 | conduct disorder | a·15 | `t_impulse.md` | scored: title/summary words | OK |
| 47 | oppositional defiant | a·15 | `t_impulse.md` | scored: page text only | OK |
| 48 | substance-related and addictive disorders | a·16 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_sud.md` #2) |
| 49 | substance use | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK |
| 50 | addiction | a·16 | `book_library.md` | scored: title/summary words | **wrong page** |
| 51 | alcohol use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK |
| 52 | opioid use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK |
| 53 | neurocognitive disorders | a·17 | `t_neurocog.md` | scored: title/summary words | OK |
| 54 | dementia | a·17 | `t_neurocog.md` | scored: title/summary words | OK |
| 55 | delirium | a·17 | ⚑ `delirium.md` | protocol · haystack | OK |
| 56 | personality disorders | a·18 | `t_personality.md` | scored: title/summary words | OK |
| 57 | antisocial | a·18 | `t_impulse.md` | scored: title/summary words | OK |
| 58 | paraphilic disorders | a·19 | `t_sexual.md` | scored: title/summary words | OK |
| 59 | other mental disorders | a·20 | ⚑ `delirium.md` | protocol · haystack | OK |
| 60 | medication-induced movement disorders | a·21 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `med_monitoring.md` #8) |
| 61 | other conditions that may be a focus of clinical attention | a·22 | ⚑ `delirium.md` | protocol · haystack | OK |
| 62 | haloperidol | b | `psychopharm_primer.md` | alias | OK |
| 63 | haldol | b | `psychopharm_primer.md` | alias | OK |
| 64 | olanzapine | b | `psychopharm_primer.md` | alias | OK |
| 65 | zyprexa | b | `psychopharm_primer.md` | alias | OK |
| 66 | quetiapine | b | `psychopharm_primer.md` | alias | OK |
| 67 | seroquel | b | `psychopharm_primer.md` | alias | OK |
| 68 | risperidone | b | `psychopharm_primer.md` | alias | OK |
| 69 | risperdal | b | `psychopharm_primer.md` | alias | OK |
| 70 | aripiprazole | b | `psychopharm_primer.md` | alias | OK |
| 71 | abilify | b | `psychopharm_primer.md` | alias | OK |
| 72 | ziprasidone | b | `psychopharm_primer.md` | alias | OK |
| 73 | geodon | b | `psychopharm_primer.md` | alias | OK |
| 74 | paliperidone | b | `psychopharm_primer.md` | alias | OK |
| 75 | invega | b | `psychopharm_primer.md` | alias | OK |
| 76 | clozapine | b | `psychopharm_primer.md` | alias | OK |
| 77 | clozaril | b | `psychopharm_primer.md` | alias | OK |
| 78 | lurasidone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 79 | latuda | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 80 | chlorpromazine | b | `rounds_questions.md` | scored: page text only | OK (≠ guide: `psychopharm_primer.md` absent) |
| 81 | thorazine | b | — | — | **zero results** |
| 82 | fluphenazine | b | — | — | **zero results** |
| 83 | prolixin | b | — | — | **zero results** |
| 84 | cariprazine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 85 | vraylar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 86 | lithium | b | `cotw_20260803_lithium_ms3.md` | scored: title/summary words | **wrong page** |
| 87 | lithobid | b | — | — | **zero results** |
| 88 | divalproex | b | `psychopharm_primer.md` | alias | OK |
| 89 | depakote | b | `psychopharm_primer.md` | alias | OK |
| 90 | lamotrigine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 91 | lamictal | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 92 | carbamazepine | b | `med_monitoring.md` | alias | OK |
| 93 | tegretol | b | `med_monitoring.md` | alias | OK |
| 94 | sertraline | b | `psychopharm_primer.md` | alias | OK |
| 95 | zoloft | b | `psychopharm_primer.md` | alias | OK |
| 96 | fluoxetine | b | `psychopharm_primer.md` | alias | OK |
| 97 | prozac | b | `psychopharm_primer.md` | alias | OK |
| 98 | escitalopram | b | `psychopharm_primer.md` | alias | OK |
| 99 | lexapro | b | `psychopharm_primer.md` | alias | OK |
| 100 | citalopram | b | `psychopharm_primer.md` | alias | OK |
| 101 | celexa | b | `psychopharm_primer.md` | alias | OK |
| 102 | paroxetine | b | `psychopharm_primer.md` | alias | OK |
| 103 | paxil | b | `psychopharm_primer.md` | alias | OK |
| 104 | venlafaxine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 105 | effexor | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 106 | duloxetine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 107 | cymbalta | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 108 | bupropion | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 109 | wellbutrin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 110 | mirtazapine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 111 | remeron | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 112 | trazodone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 113 | desyrel | b | — | — | **zero results** |
| 114 | lorazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 115 | ativan | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 116 | clonazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 117 | klonopin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 118 | diazepam | b | `cotw_20260726_etohwd_ms3.md` | scored: page text only | **wrong page** |
| 119 | valium | b | — | — | **zero results** |
| 120 | chlordiazepoxide | b | `cotw_20260726_etohwd_ms3.md` | scored: page text only | **wrong page** |
| 121 | librium | b | — | — | **zero results** |
| 122 | hydroxyzine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 123 | vistaril | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 124 | buspirone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 125 | buspar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 126 | zolpidem | b | `rounds_questions.md` | scored: page text only | OK (≠ guide: `t_sleep.md` absent) |
| 127 | ambien | b | — | — | **zero results** |
| 128 | benztropine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 129 | cogentin | b | — | — | **zero results** |
| 130 | diphenhydramine | b | `t_sleep.md` | scored: page text only | OK |
| 131 | benadryl | b | — | — | **zero results** |
| 132 | propranolol | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 133 | inderal | b | — | — | **zero results** |
| 134 | prazosin | b | `rapid_review.md` | scored: page text only | OK (≠ guide: `t_anxiety.md` #2) |
| 135 | minipress | b | — | — | **zero results** |
| 136 | gabapentin | b | `t_sleep.md` | scored: page text only | OK |
| 137 | neurontin | b | — | — | **zero results** |
| 138 | buprenorphine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 139 | suboxone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 140 | naltrexone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 141 | vivitrol | b | — | — | **zero results** |
| 142 | capacity | c | `capacity.html` | alias | OK |
| 143 | restraint | c | ⚑ `agitation.md` | protocol · trigger | OK |
| 144 | seclusion | c | ⚑ `agitation.md` | protocol · trigger | OK |
| 145 | 1:1 | c | — | — | **zero results** |
| 146 | sitter | c | — | — | **zero results** |
| 147 | discharge | c | `exp_family.md` | scored: title/summary words | OK |
| 148 | collateral | c | `collateral_workflow.md` | alias | OK |
| 149 | AMA | c | ⚑ `exp_consult.md` | protocol · trigger | OK |
| 150 | involuntary | c | `ethics_legal.md` | scored: page text only | OK |
| 151 | blue paper | c | `ethics_legal.md` | alias | OK |
| 152 | CIWA | c | ⚑ `t_sud.md` | protocol · trigger | OK |
| 153 | COWS | c | ⚑ `t_sud.md` | protocol · trigger | OK |
| 154 | QTc | c | `psychopharm_primer.md` | scored: title/summary words | OK |
| 155 | lithium level | c | `med_monitoring.md` | alias | OK |
| 156 | ANC | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `med_monitoring.md` #6) |
| 157 | NMS | c | `toxidromes.md` | alias | OK |
| 158 | serotonin syndrome | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `toxidromes.md` #4) |
| 159 | catatonia | c | `catatonia.md` | exact title + alias | OK |
| 160 | ECT | c | ⚑ `pg_suicide.md` | protocol · haystack | OK (≠ guide: `ect_neuromodulation.md` #2) |
| 161 | consent | c | ⚑ `exp_consult.md` | protocol · trigger | OK |
| 162 | HIPAA | c | `ethics_legal.md` | scored: page text only | OK |
| 163 | duty to warn | c | `ethics_legal.md` | scored: page text only | OK |
| 164 | Tarasoff | c | `ethics_legal.md` | scored: title/summary words | OK |
| 165 | safety plan | c | ⚑ `pg_suicide.md` | protocol · haystack | OK |
| 166 | means restriction | c | ⚑ `pg_suicide.md` | protocol · haystack | OK |

### Resident site (mmc-psychiatry-residents-sanford)

| # | Query | Grp | First result | Tier | Verdict |
|---|---|---|---|---|---|
| 1 | schizophrenia | 10-17 | `t_psychosis.md` | alias | OK |
| 2 | pregnancy | 10-17 | `t_perinatal.md` | alias | OK |
| 3 | adolescent | 10-17 | `t_neurodev.md` | alias | OK |
| 4 | bipolar | 10-17 | `t_mood.md` | alias | OK |
| 5 | mania | 10-17 | `t_mood.md` | alias | OK |
| 6 | borderline | 10-17 | `t_personality.md` | alias | OK |
| 7 | panic | 10-17 | `t_anxiety.md` | alias | OK |
| 8 | neurodevelopmental disorders | a·1 | `t_neurodev.md` | exact title | OK |
| 9 | adhd | a·1 | `t_neurodev.md` | alias | OK |
| 10 | autism | a·1 | `t_neurodev.md` | alias | OK |
| 11 | intellectual disability | a·1 | `t_neurodev.md` | scored: title/summary words | OK |
| 12 | schizophrenia spectrum and other psychotic disorders | a·2 | `t_psychosis.md` | alias | OK |
| 13 | psychotic disorders | a·2 | `t_psychosis.md` | exact title + alias | OK |
| 14 | psychosis | a·2 | `t_psychosis.md` | alias | OK |
| 15 | schizoaffective | a·2 | `t_psychosis.md` | alias | OK |
| 16 | bipolar and related disorders | a·3 | `t_mood.md` | alias | OK |
| 17 | depressive disorders | a·4 | `t_mood.md` | alias | OK |
| 18 | depression | a·4 | `t_mood.md` | alias | OK |
| 19 | major depressive disorder | a·4 | `t_mood.md` | alias | OK |
| 20 | mdd | a·4 | `cotw_20261005_mddaug_res.md` | scored: title/summary words | **wrong page** |
| 21 | anxiety disorders | a·5 | `t_anxiety.md` | scored: title/summary words | OK |
| 22 | anxiety | a·5 | `t_anxiety.md` | scored: title/summary words | OK |
| 23 | gad | a·5 | `screeners.html` | scored: title/summary words | OK |
| 24 | obsessive-compulsive and related disorders | a·6 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_anxiety.md` #9) |
| 25 | obsessive compulsive | a·6 | `podcast_library.md` | scored: page text only | **wrong page** |
| 26 | ocd | a·6 | `t_anxiety.md` | scored: title/summary words | OK |
| 27 | trauma- and stressor-related disorders | a·7 | `t_adjustment.md` | scored: title/summary words | OK |
| 28 | ptsd | a·7 | `t_anxiety.md` | scored: title/summary words | OK |
| 29 | adjustment disorder | a·7 | `t_adjustment.md` | scored: title/summary words | OK |
| 30 | dissociative disorders | a·8 | `t_dissociative.md` | exact title | OK |
| 31 | somatic symptom and related disorders | a·9 | `t_somatic.md` | scored: title/summary words | OK |
| 32 | somatic symptom disorder | a·9 | `t_somatic.md` | scored: title/summary words | OK |
| 33 | conversion disorder | a·9 | `t_adjustment.md` | scored: title/summary words | OK (≠ guide: `t_somatic.md` #11) |
| 34 | functional neurological disorder | a·9 | `cotw_20260810_panic_res.md` | scored: title/summary words | **wrong page** |
| 35 | feeding and eating disorders | a·10 | `t_eating.md` | scored: title/summary words | OK |
| 36 | eating disorders | a·10 | `t_eating.md` | exact title | OK |
| 37 | anorexia | a·10 | `t_eating.md` | scored: title/summary words | OK |
| 38 | bulimia | a·10 | `t_eating.md` | scored: title/summary words | OK |
| 39 | elimination disorders | a·11 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `t_neurodev.md` #3) |
| 40 | enuresis | a·11 | `t_neurodev.md` | scored: page text only | OK |
| 41 | sleep-wake disorders | a·12 | `t_sleep.md` | exact title | OK |
| 42 | insomnia | a·12 | `t_sleep.md` | alias | OK |
| 43 | sexual dysfunctions | a·13 | `t_sexual.md` | scored: title/summary words | OK |
| 44 | gender dysphoria | a·14 | `t_sexual.md` | scored: title/summary words | OK |
| 45 | disruptive, impulse-control, and conduct disorders | a·15 | `t_impulse.md` | scored: title/summary words | OK |
| 46 | conduct disorder | a·15 | `t_impulse.md` | scored: title/summary words | OK |
| 47 | oppositional defiant | a·15 | `t_impulse.md` | scored: page text only | OK |
| 48 | substance-related and addictive disorders | a·16 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_sud.md` #2) |
| 49 | substance use | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK |
| 50 | addiction | a·16 | `book_library.md` | scored: title/summary words | **wrong page** |
| 51 | alcohol use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK |
| 52 | opioid use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK |
| 53 | neurocognitive disorders | a·17 | `t_neurocog.md` | scored: title/summary words | OK |
| 54 | dementia | a·17 | `t_neurocog.md` | scored: title/summary words | OK |
| 55 | delirium | a·17 | ⚑ `delirium.md` | protocol · haystack | OK |
| 56 | personality disorders | a·18 | `t_personality.md` | scored: title/summary words | OK |
| 57 | antisocial | a·18 | `t_impulse.md` | scored: title/summary words | OK |
| 58 | paraphilic disorders | a·19 | `t_sexual.md` | scored: title/summary words | OK |
| 59 | other mental disorders | a·20 | ⚑ `delirium.md` | protocol · haystack | OK |
| 60 | medication-induced movement disorders | a·21 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `med_monitoring.md` #8) |
| 61 | other conditions that may be a focus of clinical attention | a·22 | ⚑ `delirium.md` | protocol · haystack | OK |
| 62 | haloperidol | b | `psychopharm_primer.md` | alias | OK |
| 63 | haldol | b | `psychopharm_primer.md` | alias | OK |
| 64 | olanzapine | b | `psychopharm_primer.md` | alias | OK |
| 65 | zyprexa | b | `psychopharm_primer.md` | alias | OK |
| 66 | quetiapine | b | `psychopharm_primer.md` | alias | OK |
| 67 | seroquel | b | `psychopharm_primer.md` | alias | OK |
| 68 | risperidone | b | `psychopharm_primer.md` | alias | OK |
| 69 | risperdal | b | `psychopharm_primer.md` | alias | OK |
| 70 | aripiprazole | b | `psychopharm_primer.md` | alias | OK |
| 71 | abilify | b | `psychopharm_primer.md` | alias | OK |
| 72 | ziprasidone | b | `psychopharm_primer.md` | alias | OK |
| 73 | geodon | b | `psychopharm_primer.md` | alias | OK |
| 74 | paliperidone | b | `psychopharm_primer.md` | alias | OK |
| 75 | invega | b | `psychopharm_primer.md` | alias | OK |
| 76 | clozapine | b | `psychopharm_primer.md` | alias | OK |
| 77 | clozaril | b | `psychopharm_primer.md` | alias | OK |
| 78 | lurasidone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 79 | latuda | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 80 | chlorpromazine | b | `canon_200.md` | scored: page text only | **wrong page** |
| 81 | thorazine | b | — | — | **zero results** |
| 82 | fluphenazine | b | `adv_psychopharm.md` | scored: page text only | OK (≠ guide: `psychopharm_primer.md` absent) |
| 83 | prolixin | b | — | — | **zero results** |
| 84 | cariprazine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 85 | vraylar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 86 | lithium | b | `cotw_20260803_lithium_res.md` | scored: title/summary words | **wrong page** |
| 87 | lithobid | b | — | — | **zero results** |
| 88 | divalproex | b | `psychopharm_primer.md` | alias | OK |
| 89 | depakote | b | `psychopharm_primer.md` | alias | OK |
| 90 | lamotrigine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 91 | lamictal | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 92 | carbamazepine | b | `med_monitoring.md` | alias | OK |
| 93 | tegretol | b | `med_monitoring.md` | alias | OK |
| 94 | sertraline | b | `psychopharm_primer.md` | alias | OK |
| 95 | zoloft | b | `psychopharm_primer.md` | alias | OK |
| 96 | fluoxetine | b | `psychopharm_primer.md` | alias | OK |
| 97 | prozac | b | `psychopharm_primer.md` | alias | OK |
| 98 | escitalopram | b | `psychopharm_primer.md` | alias | OK |
| 99 | lexapro | b | `psychopharm_primer.md` | alias | OK |
| 100 | citalopram | b | `psychopharm_primer.md` | alias | OK |
| 101 | celexa | b | `psychopharm_primer.md` | alias | OK |
| 102 | paroxetine | b | `psychopharm_primer.md` | alias | OK |
| 103 | paxil | b | `psychopharm_primer.md` | alias | OK |
| 104 | venlafaxine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 105 | effexor | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 106 | duloxetine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 107 | cymbalta | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 108 | bupropion | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 109 | wellbutrin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 110 | mirtazapine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 111 | remeron | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 112 | trazodone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 113 | desyrel | b | — | — | **zero results** |
| 114 | lorazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 115 | ativan | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 116 | clonazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 117 | klonopin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 118 | diazepam | b | `cotw_20260810_panic_res.md` | scored: page text only | **wrong page** |
| 119 | valium | b | — | — | **zero results** |
| 120 | chlordiazepoxide | b | — | — | **zero results** |
| 121 | librium | b | — | — | **zero results** |
| 122 | hydroxyzine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 123 | vistaril | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 124 | buspirone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 125 | buspar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 126 | zolpidem | b | `cotw_20260831_catatonia_res.md` | scored: page text only | **wrong page** |
| 127 | ambien | b | — | — | **zero results** |
| 128 | benztropine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 129 | cogentin | b | — | — | **zero results** |
| 130 | diphenhydramine | b | `t_sleep.md` | scored: page text only | OK |
| 131 | benadryl | b | — | — | **zero results** |
| 132 | propranolol | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 133 | inderal | b | — | — | **zero results** |
| 134 | prazosin | b | `rapid_review.md` | scored: page text only | OK (≠ guide: `t_anxiety.md` #2) |
| 135 | minipress | b | — | — | **zero results** |
| 136 | gabapentin | b | `t_sleep.md` | scored: page text only | OK |
| 137 | neurontin | b | — | — | **zero results** |
| 138 | buprenorphine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 139 | suboxone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 140 | naltrexone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK |
| 141 | vivitrol | b | — | — | **zero results** |
| 142 | capacity | c | `capacity.html` | alias | OK |
| 143 | restraint | c | ⚑ `agitation.md` | protocol · trigger | OK |
| 144 | seclusion | c | ⚑ `agitation.md` | protocol · trigger | OK |
| 145 | 1:1 | c | — | — | **zero results** |
| 146 | sitter | c | `cotw_20260713_agitation_res.md` | scored: page text only | **wrong page** |
| 147 | discharge | c | `exp_family.md` | scored: title/summary words | OK |
| 148 | collateral | c | `collateral_workflow.md` | alias | OK |
| 149 | AMA | c | ⚑ `exp_consult.md` | protocol · trigger | OK |
| 150 | involuntary | c | `systems_medlegal.md` | scored: title/summary words | OK |
| 151 | blue paper | c | `systems_medlegal.md` | alias | OK |
| 152 | CIWA | c | ⚑ `t_sud.md` | protocol · trigger | OK |
| 153 | COWS | c | ⚑ `t_sud.md` | protocol · trigger | OK |
| 154 | QTc | c | `cl_reference.md` | scored: title/summary words | OK |
| 155 | lithium level | c | `med_monitoring.md` | alias | OK |
| 156 | ANC | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `med_monitoring.md` #4) |
| 157 | NMS | c | `toxidromes.md` | alias | OK |
| 158 | serotonin syndrome | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `toxidromes.md` #5) |
| 159 | catatonia | c | `catatonia.md` | exact title + alias | OK |
| 160 | ECT | c | ⚑ `pg_suicide.md` | protocol · haystack | OK (≠ guide: `ect_neuromodulation.md` #2) |
| 161 | consent | c | ⚑ `exp_consult.md` | protocol · trigger | OK |
| 162 | HIPAA | c | `ethics_legal.md` | scored: page text only | OK |
| 163 | duty to warn | c | `ethics_legal.md` | scored: page text only | OK |
| 164 | Tarasoff | c | `ethics_legal.md` | scored: title/summary words | OK |
| 165 | safety plan | c | ⚑ `pg_suicide.md` | protocol · haystack | OK |
| 166 | means restriction | c | ⚑ `pg_suicide.md` | protocol · haystack | OK |

