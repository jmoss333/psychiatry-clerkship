# Learner search sweep — 2026-10-18

- **Date:** 2026-10-18
- **Status:** PROPOSED — data fixes applied on this branch; every alias and synonym line awaits the owner's approval before merge
- **Owner / reviewer of record:** Joshua Moss, MD
- **Branch:** `claude/search-sweep-2026-10-18` from `origin/main` @ `0c0ac0f` (includes #1081 aliases and #1091 C2)
- **Class:** design spec (neutral under `check_policy_content_separation.py`)

## 1. Why

On 2026-10-17 a hand probe of ~20 terms found that *schizophrenia*, *pregnancy* and *adolescent* returned
nothing on both learner sites and that *bipolar*, *mania*, *borderline* and *panic* opened a Case-of-the-Week
edition instead of the guide. #1081 fixed those with `searchAliases` and an exact-title tier; #1091 (C2) then
changed the engine (page text blended into ranking, one bidirectional synonym list, track-scoped results).
Nothing had measured the engine as it now stands beyond the pinned fixtures. This is that measurement, and
the data-only fixes it justifies.

## 2. Method

- **The real search.** A scratch probe evaluates the shipped `frontdoor/fd_data.js` + `frontdoor/fd_search.js`
  (no copy, no second scorer) and calls `fdSearchResults(index, query, FD_CURRICULUM.synonyms, {bodyIndex})` —
  the call the shell makes (`spa_index.html` → `fdSearchOverlay`). Inputs are read from the **built** sites:
  each site's `FD_CURRICULUM` / `FD_TOPIC_META` / `FD_TOOL_REGISTRY` / `FD_SITE_MANIFEST` payloads out of
  `_build/<site>/index.html` (the projection `build_frontdoor_payload` produced) and that site's own
  `search-index.json` (the page-text index the shell loads) — the path `frontdoor-search-gate.mjs`'s
  `checkBuiltSearch` uses. A second mode builds the same inputs from source (the `tests/search-golden.test.mjs`
  harness); on the baseline the two agree on the first result for 331 of 332 rows (the exception, resident
  *QTc*, flips between `cl_reference.md` and `psychopharm_primer.md`, both accepted by `search-golden.json`).
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
- **Collateral.** Every candidate line was kept only if (1) the nine search test files stayed green
  (`fd-search`, `search-ward-benchmark`, `search-golden`, `search-discovery`, `medication-search`,
  `pharmacy-search`, `fd-care-search`, `frontdoor-search-gate`, `search-scorer-parity`) and (2) a sweep of
  1,634 combined queries per site (each of the 38 new terms × 21 clinical context words, both orders; 3,268
  rows) showed **no change to any query's set of safety-protocol rows and no lost lead for a trigger-matched
  (crisis) row** (§6.3). Two candidates were corrected on evidence: `lithium` → primer broke
  `tests/medication-search.test.mjs` (a drug name must not lift the primer above the specific reading), so it
  went to `med_monitoring.md`; and the `lithobid` group alone opened the lithium COTW on the **built** sites
  (not in source mode, not in the no-page-text harness), so the brand also got a direct alias.
- **Environment.** Built in a cloud container with `CONTEXT=deploy-preview` (the soft-LFS context
  `check_lfs_media.is_soft_context()` grants previews), because its Git-LFS media are pointer stubs. Media
  bytes do not enter the search payloads or `search-index.json`. Both `build_and_check.sh ms3` and `… res`
  passed every gate, before and after.

## 3. Results

| Site | Queries | OK before → after | zero results before → after | wrong page before → after | OK but ≠ guide before → after |
|---|---|---|---|---|---|
| MS3 | 166 | 143 → 163 | 16 → **3** | 7 → **0** | 12 → 7 |
| Resident | 166 | 142 → 163 | 15 → **1** | 9 → **2** | 10 → 7 |

What is left: MS3 *fluphenazine*, *prolixin* (no MS3 page names the drug) and *cogentin* (held); resident
*cogentin* (held) and *chlorpromazine*, *thorazine* (no guide teaches the drug). All in §6.

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

C2 changed none of the seven first results; it only added recall underneath them (match counts from the
source harness, the only mode that runs at older commits). This branch does not change them either; all seven
stay pinned in `tests/fixtures/search-ward.json` (maxRank 1, both sites).

## 5. The fixes — one home per fix, and why

**Rule.** `curriculum.json` `searchAliases` = a word that should land on ONE guide, and only a guide whose
source teaches it. `site_build/data/search-synonyms.v1.json` = two learner words that mean the same thing,
both ways. *Nothing* = page text already lands on the right guide. No scorer, trigger, schema, `bin/` or
`frontdoor/*.js` change. Totals: **17 alias phrases on 9 guides** (two new keys, `t_sud.md` and
`t_somatic.md`) and **14 synonym groups**.

**Pins.** 22 new `served` rows in `tests/fixtures/search-ward.json` (maxRank 1, both sites) — every fix that
holds on titles, aliases and synonyms alone. That harness does not load the page-text index, so the five
brand names that resolve only through page text are pinned in `tests/fixtures/search-golden.json` instead
(it runs with the index, in `tests/search-golden.test.mjs` and on every build in the QA gate).

| Query | MS3 before | MS3 after | Resident before | Resident after | Home | Line | Why this home |
|---|---|---|---|---|---|---|---|
| mdd | `cotw_20260720_mdd_ms3.md` (wrong page) | `t_mood.md` (OK) | `cotw_20261005_mddaug_res.md` (wrong page) | `t_mood.md` (OK) | alias | t_mood.md: "mdd" | Two COTW editions carry MDD in their titles and outscored the guide. One page answers it; 3 letters, so the alias fires only on the whole query. |
| addiction | `book_library.md` (wrong page) | `t_sud.md` (OK) | `book_library.md` (wrong page) | `t_sud.md` (OK) | alias | t_sud.md: "addiction" | The Book Library's summary outscored the Substance Use guide. One page answers it. |
| substance-related and addictive disorders | `t_dissociative.md` (OK ≠ guide) | `t_sud.md` (OK) | `t_dissociative.md` (OK ≠ guide) | `t_sud.md` (OK) | alias | t_sud.md: "substance related and addictive disorders" | DSM-5-TR chapter name landed on Dissociative Disorders (shared words 'related disorders'). |
| diazepam | `cotw_20260726_etohwd_ms3.md` (wrong page) | `t_sud.md` (OK) | `cotw_20260810_panic_res.md` (wrong page) | `t_sud.md` (OK) | alias | t_sud.md: "diazepam" | Taught in t_sud (hepatic metabolism, withdrawal) but found only by page text, and the text tier never adds a safety-kit page, so a COTW won. |
| chlordiazepoxide | `cotw_20260726_etohwd_ms3.md` (wrong page) | `t_sud.md` (OK) | — (zero results) | `t_sud.md` (OK) | alias | t_sud.md: "chlordiazepoxide" | Same as diazepam: taught in t_sud, invisible to the text tier because t_sud is a safety-kit page. |
| valium | — (zero results) | `t_sud.md` (OK) | — (zero results) | `t_sud.md` (OK) | synonyms | group diazepam: [diazepam, valium] | Brand appears on no shipped page; the group makes it search as diazepam, both ways. |
| librium | — (zero results) | `t_sud.md` (OK) | — (zero results) | `t_sud.md` (OK) | synonyms | group chlordiazepoxide: [chlordiazepoxide, librium] | Brand appears on no shipped page. |
| lithium | `cotw_20260803_lithium_ms3.md` (wrong page) | `med_monitoring.md` (OK) | `cotw_20260803_lithium_res.md` (wrong page) | `med_monitoring.md` (OK) | alias | med_monitoring.md: "lithium" | The Aug 3 lithium COTW (title + filename) outscored every guide. Not the primer: tests/medication-search.test.mjs forbids a drug name lifting the primer above the specific reading ("lithium monitoring" must open med_monitoring). Josh's call between the two. |
| lithobid | — (zero results) | `med_monitoring.md` (OK) | — (zero results) | `med_monitoring.md` (OK) | alias + synonyms | med_monitoring.md: "lithobid"; group lithium: [lithium, lithobid] | Brand appears on no page. With the group alone the built site opened the lithium COTW: its title and filename contain 'lithium', so the swapped query scores it within a few points of the page the alias reaches through the group (source mode and the no-page-text harness both still showed med_monitoring). A direct alias puts it in the positional alias tier. |
| desyrel | — (zero results) | `psychopharm_primer.md` (OK) | — (zero results) | `psychopharm_primer.md` (OK) | alias + synonyms | psychopharm_primer.md: "desyrel"; group trazodone: [trazodone, desyrel] | Brand appears on no page. The group alone lands on a COTW: trazodone reaches the primer through medicationTerms, which synonym alternatives do not carry, so the brand also needs an alias on the page that teaches it. |
| vivitrol | — (zero results) | `psychopharm_primer.md` (OK) | — (zero results) | `psychopharm_primer.md` (OK) | alias + synonyms | psychopharm_primer.md: "vivitrol"; group naltrexone: [naltrexone, vivitrol] | As desyrel: the group alone lands on the OUD COTW on res. |
| zolpidem | `rounds_questions.md` (OK ≠ guide) | `t_sleep.md` (OK) | `cotw_20260831_catatonia_res.md` (wrong page) | `t_sleep.md` (OK) | alias | t_sleep.md: "zolpidem" | Named only in a catatonia COTW and rounds questions; t_sleep teaches z-drugs as a class. Josh's call (content gap). |
| ambien | — (zero results) | `t_sleep.md` (OK) | — (zero results) | `t_sleep.md` (OK) | synonyms | group zolpidem: [zolpidem, ambien] | Brand appears on no shipped page. |
| thorazine | — (zero results) | `rounds_questions.md` (OK ≠ guide) | — (zero results) | `canon_200.md` (wrong page) | synonyms | group chlorpromazine: [chlorpromazine, thorazine] | Brand appears on no page; now searches as chlorpromazine. No guide teaches chlorpromazine (needs Josh). |
| prolixin | — (zero results) | — (zero results) | — (zero results) | `adv_psychopharm.md` (OK ≠ guide) | synonyms | group fluphenazine: [fluphenazine, prolixin] | Brand appears on no page; resident search now finds adv_psychopharm (fluphenazine decanoate). No MS3 page names fluphenazine (needs Josh). |
| benadryl | — (zero results) | `t_sleep.md` (OK) | — (zero results) | `t_sleep.md` (OK) | synonyms | group diphenhydramine: [diphenhydramine, benadryl] | Brand appears on no page; now finds what diphenhydramine finds (t_sleep, by page text). |
| inderal | — (zero results) | `t_anxiety.md` (OK) | — (zero results) | `t_anxiety.md` (OK) | synonyms | group propranolol: [propranolol, inderal] | Brand appears on no page; now finds t_anxiety (akathisia hierarchy), by page text. |
| minipress | — (zero results) | `rapid_review.md` (OK ≠ guide) | — (zero results) | `rapid_review.md` (OK ≠ guide) | synonyms | group prazosin: [prazosin, minipress] | Brand appears on no page; now finds what prazosin finds (Rapid Review, then t_anxiety), by page text. |
| neurontin | — (zero results) | `t_sleep.md` (OK) | — (zero results) | `t_sleep.md` (OK) | synonyms | group gabapentin: [gabapentin, neurontin] | Brand appears on no page; now finds t_sleep, by page text. |
| 1:1 | — (zero results) | `suicide.md` (OK) | — (zero results) | `suicide.md` (OK) | alias | suicide.md: "1 1" | Normalised form of 1:1 (aliases are stored normalised). suicide.md is the one guide that names 1:1 observation (one line). Observation levels are taught nowhere else (needs Josh). |
| sitter | — (zero results) | `suicide.md` (OK) | `cotw_20260713_agitation_res.md` (wrong page) | `suicide.md` (OK) | synonyms | group observation: [1 1, sitter] | Ward word for 1:1 observation, both ways; lands on suicide.md through the 1:1 alias. |
| obsessive compulsive | `podcast_library.md` (wrong page) | `t_anxiety.md` (OK) | `podcast_library.md` (wrong page) | `t_anxiety.md` (OK) | synonyms | group ocd: [ocd, obsessive compulsive, obsessive compulsive disorder] | Spelled-out OCD found only the Podcast Library's text; 'ocd' already found the Anxiety/Trauma/OCD guide by title. |
| obsessive-compulsive and related disorders | `t_dissociative.md` (OK ≠ guide) | `t_anxiety.md` (OK) | `t_dissociative.md` (OK ≠ guide) | `t_anxiety.md` (OK) | alias | t_anxiety.md: "obsessive compulsive and related disorders" | DSM-5-TR chapter name landed on Dissociative Disorders ('related disorders'). |
| trauma- and stressor-related disorders | `t_somatic.md` (OK ≠ guide) | `t_anxiety.md` (OK) | `t_adjustment.md` (OK) | `t_anxiety.md` (OK) | alias | t_anxiety.md: "trauma and stressor related disorders" | DSM-5-TR chapter name landed on Somatic Symptom (ms3). |
| conversion disorder | `t_adjustment.md` (OK ≠ guide) | `t_somatic.md` (OK) | `t_adjustment.md` (OK ≠ guide) | `t_somatic.md` (OK) | alias | t_somatic.md: "conversion disorder" | Taught in t_somatic; landed on Adjustment Disorders. |
| functional neurological disorder | `cotw_20260827_bpd_ms3.md` (wrong page) | `t_somatic.md` (OK) | `cotw_20260810_panic_res.md` (wrong page) | `t_somatic.md` (OK) | alias | t_somatic.md: "functional neurological disorder" | Current DSM-5-TR name for conversion disorder; landed on a COTW edition. |
| elimination disorders | `t_sleep.md` (OK ≠ guide) | `t_neurodev.md` (OK) | `t_sleep.md` (OK ≠ guide) | `t_neurodev.md` (OK) | alias | t_neurodev.md: "elimination disorders" | DSM-5-TR chapter; enuresis and encopresis are taught in t_neurodev, but the query landed on Sleep-Wake. |
| medication-induced movement disorders | `t_sleep.md` (OK ≠ guide) | `med_monitoring.md` (OK) | `t_sleep.md` (OK ≠ guide) | `med_monitoring.md` (OK) | alias | med_monitoring.md: "medication induced movement disorders" | DSM-5-TR chapter name landed on Sleep-Wake; EPS/TD/akathisia monitoring lives in med_monitoring. |

## 6. Needs Josh

### 6.1 Rows this branch does not resolve

| Query (site) | Now | Why not fixed with data | Proposed |
|---|---|---|---|
| cogentin (both) | zero results | Held: `search-ward.json` `deferred` — "Anticholinergics: the only page naming benztropine or diphenhydramine is the toxidromes page's anticholinergic-toxicity content; routing a dystonia question there could mislead." Its premise looks stale: `benztropine` is now named in `psychopharm_primer.md` (in `medicationTerms`) and in `t_anxiety.md` (the akathisia hierarchy), and the query `benztropine` already opens the primer. | Lift the hold → one group `[benztropine, cogentin]` (and a ward row). |
| fluphenazine, prolixin (MS3) | zero results | No page on the MS3 site names fluphenazine; only the resident-only `adv_psychopharm.md` does ("first-generation depots — haloperidol and fluphenazine decanoate"). An alias would point at a page that does not teach the drug. | Content, not data: name the first-generation depots in the primer's LAI paragraph, as `adv_psychopharm.md` already does. The `prolixin` group then works on MS3 too. |
| chlorpromazine, thorazine (resident) | `canon_200.md` (reading list) | No guide teaches chlorpromazine (it appears only in `canon_200.md` and `rounds_questions.md`; MS3 lands on the latter). | Same content fix: a first-generation antipsychotic line in the primer. |
| serotonin syndrome (both) | ⚑ `t_sud.md` · haystack | Held: `deferred` — an alias to `toxidromes.md` would move the Substance Use protocol (matched on "syndrome") off the top row. | Faculty decision on the held placement. |
| ANC (both) | ⚑ `t_sud.md` · haystack | Held: `deferred` — "anc" matches inside other words in two protocols; retry once the protocol pass is strict. | As held. |
| ECT (both) | ⚑ `pg_suicide.md` · haystack | Held: `deferred` — the safety-kit pass keeps substring matching ("ect" inside a word on that card) until faculty turn accidental crisis routes into explicit triggers. | As held. |

The last three read `OK` under the brief's verdict (a protocol row is not in the wrong-page list), but the
guide is not first; they are listed so that is not mistaken for a pass.

### 6.2 Judgment calls inside this branch — approve or strike line by line

1. **`lithium` → `med_monitoring.md`**, not the primer. The bare drug name opened the Aug 3 lithium COTW. The
   primer is the overview, but `tests/medication-search.test.mjs` forbids a drug name lifting the primer above
   the specific reading ("lithium monitoring" must open `med_monitoring.md`), and an alias would do exactly
   that inside every lithium query. Side effect to approve: "lithium toxicity" now opens `med_monitoring.md`
   above the COTW "Lithium — Monitoring & Toxicity (Aug 3)".
2. **`zolpidem` → `t_sleep.md`.** The guide teaches z-drugs as a class; zolpidem by name appears only in the
   resident catatonia COTW (the zolpidem challenge) and the rounds questions. Content gap either way.
3. **`1:1` → `suicide.md`, and the group `[1:1, sitter]`.** `suicide.md` is the one guide that names 1:1
   observation (one line: "determine the level of care (e.g., 1:1 observation, environmental safety) with your
   supervisor"). Observation levels are taught nowhere else — a content gap; sitters are also used for delirium
   and agitation.
4. **Four aliases on `t_sud.md`** (`addiction`, the chapter name, `diazepam`, `chlordiazepoxide`). `t_sud.md` is
   a safety-kit page, and the page-text tier never adds kit pages, which is why the two benzodiazepines it
   teaches lost to a COTW. With the alias it appears as an ordinary Page row for these words. When the query
   also triggers the protocol ("diazepam withdrawal"), the protocol row leads and no duplicate page row
   appears (the existing `seenRefs` dedup) — checked.
5. **Brand aliases on top of their groups: `desyrel`, `vivitrol` → `psychopharm_primer.md`; `lithobid` →
   `med_monitoring.md`.** Rule applied: group first; a brand alias only where the measured first result was
   still wrong. The generic reaches the primer through `medicationTerms`, which synonym alternatives do not
   carry, so the group alone left *desyrel* on the MDD COTW (MS3) and *vivitrol* on the OUD COTW (resident);
   *lithobid* reached the lithium COTW on the built sites. The other brands land through their generic's alias
   (*valium*, *librium*, *ambien*) or through page text (*benadryl*, *inderal*, *minipress*, *neurontin*).
   A future page whose title names a generic could out-score a group-only brand the same way *lithobid* was
   out-scored; a direct alias is positional and cannot be.
6. **`benadryl` group** touches the subject of the cogentin hold (diphenhydramine), but it routes the brand
   exactly where the generic already goes (`t_sleep.md` first, by page text), not to a dystonia answer.

### 6.3 Aliases outrank haystack-matched protocols inside longer queries — by design, now with more aliases

In the collateral sweep (1,634 combined queries × 2 sites = 3,268 rows), **no query's set of safety-protocol
rows changed and no trigger-matched (crisis) row lost its lead**. In 188 rows a new alias page now sits above a protocol that matched only by a word
in its title or summary — e.g. "lithium delirium" opens `med_monitoring.md` above the Delirium sheet, and
"zolpidem withdrawal" puts `t_sleep.md` between the trigger-matched Substance Use protocol and the
haystack-matched Consult sheet. That is the #429 alias rule ("an alias is a recorded faculty statement that a
phrasing means a resource"), and the 30 existing aliases already behave the same at `origin/main`
("haldol delirium", "insomnia delirium", "collateral delirium", "psychosis delirium"). The ward benchmark
gates only the bare alias phrase. Wanting combined-query protection would be a scorer/test change, out of
scope here.

## 7. Observations (not changed here)

1. **`node 13_Faculty_Resources/_automation/site_build/frontdoor-search-gate.mjs` checks nothing** — the module
   has no CLI entry and exits 0. The gate is `checkBuiltSearch()` inside `check-static-site.mjs`; it ran in both
   builds, and called directly on `_build/ms3` and `_build/res` it returns 0 errors.
2. **The ward benchmark cannot see page text.** `tests/search-ward-benchmark.test.mjs` calls `fdSearchResults`
   without `bodyIndex`, so a fix that resolves through page text can only be pinned in `search-golden.json`.
3. **`medicationTerms` is the engine's designed home for drug names** — an exact name lifts the teaching page
   among ordinary readings without the alias tier's power over haystack protocols (§6.3). The brief limited
   homes to aliases and synonym groups, so brands went there; moving the brand names (and `diazepam`,
   `chlordiazepoxide`, `zolpidem`, `lithium`) into `medicationTerms` on their teaching pages is the alternative
   if the combined-query side effect is unwanted.
4. **The one-way `synonyms` map overlaps the bidirectional list.** `mdd` → "mood depression" in the map did
   not beat a COTW title; `bpad`, `sz`, `szq`, `bpd`, `cows`, `ciwa` there do the same job as groups would.
   Consolidating is a separate change.
5. **`search-synonyms.v1.json`'s `_note` cites `tests/search-synonyms.test.mjs`, which does not exist**; the
   bidirectionality pin is in `tests/search-golden.test.mjs`.
6. **Full DSM-5-TR chapter names** ("substance-related and addictive disorders", "obsessive-compulsive and
   related disorders", …) landed on the wrong guide through shared words such as "related disorders". Not
   `wrong page` under the brief's definition; fixed anyway (§5) because the first result was a different guide.
7. *prazosin* / *minipress* open Rapid Review — Buzzwords before `t_anxiety.md` (#2). OK under the definition; left.

## 8. Per-site tables (before → after)

Legend: ⚑ = safety-protocol row; ″ = after unchanged from before. Grp: `10-17` the seven 2026-10-17 queries,
`a·N` DSM-5-TR chapter N, `b` medication, `c` ward task. "Fix home" names the line(s) that changed the row,
`nothing` where the row was already right, `needs Josh` for §6.1.

### MS3 site (une-ms3-psychiatry)

| # | Query | Grp | Before: first result | Before: tier | Before | After: first result | After: tier | After | Fix home |
|---|---|---|---|---|---|---|---|---|---|
| 1 | schizophrenia | 10-17 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 2 | pregnancy | 10-17 | `t_perinatal.md` | alias | OK | ″ | ″ | OK |  |
| 3 | adolescent | 10-17 | `t_neurodev.md` | alias | OK | ″ | ″ | OK |  |
| 4 | bipolar | 10-17 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 5 | mania | 10-17 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 6 | borderline | 10-17 | `t_personality.md` | alias | OK | ″ | ″ | OK |  |
| 7 | panic | 10-17 | `t_anxiety.md` | alias | OK | ″ | ″ | OK |  |
| 8 | neurodevelopmental disorders | a·1 | `t_neurodev.md` | exact title | OK | ″ | ″ | OK |  |
| 9 | adhd | a·1 | `t_neurodev.md` | alias | OK | ″ | ″ | OK |  |
| 10 | autism | a·1 | `t_neurodev.md` | alias | OK | ″ | ″ | OK |  |
| 11 | intellectual disability | a·1 | `t_neurodev.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 12 | schizophrenia spectrum and other psychotic disorders | a·2 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 13 | psychotic disorders | a·2 | `t_psychosis.md` | exact title + alias | OK | ″ | ″ | OK |  |
| 14 | psychosis | a·2 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 15 | schizoaffective | a·2 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 16 | bipolar and related disorders | a·3 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 17 | depressive disorders | a·4 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 18 | depression | a·4 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 19 | major depressive disorder | a·4 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 20 | mdd | a·4 | `cotw_20260720_mdd_ms3.md` | scored: title/summary words | **wrong page** | `t_mood.md` | alias | OK | alias — t_mood.md: "mdd" |
| 21 | anxiety disorders | a·5 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 22 | anxiety | a·5 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 23 | gad | a·5 | `screeners.html` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 24 | obsessive-compulsive and related disorders | a·6 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_anxiety.md` #9) | `t_anxiety.md` | alias | OK | alias — t_anxiety.md: "obsessive compulsive and related disorders" |
| 25 | obsessive compulsive | a·6 | `podcast_library.md` | scored: page text only | **wrong page** | `t_anxiety.md` | scored: synonym group (as 'ocd') | OK | synonyms — group ocd: [ocd, obsessive compulsive, obsessive compulsive disorder] |
| 26 | ocd | a·6 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 27 | trauma- and stressor-related disorders | a·7 | `t_somatic.md` | scored: title/summary words | OK (≠ guide: `t_anxiety.md` #2) | `t_anxiety.md` | alias | OK | alias — t_anxiety.md: "trauma and stressor related disorders" |
| 28 | ptsd | a·7 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 29 | adjustment disorder | a·7 | `t_adjustment.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 30 | dissociative disorders | a·8 | `t_dissociative.md` | exact title | OK | ″ | ″ | OK |  |
| 31 | somatic symptom and related disorders | a·9 | `t_somatic.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 32 | somatic symptom disorder | a·9 | `t_somatic.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 33 | conversion disorder | a·9 | `t_adjustment.md` | scored: title/summary words | OK (≠ guide: `t_somatic.md` #11) | `t_somatic.md` | alias | OK | alias — t_somatic.md: "conversion disorder" |
| 34 | functional neurological disorder | a·9 | `cotw_20260827_bpd_ms3.md` | scored: title/summary words | **wrong page** | `t_somatic.md` | alias | OK | alias — t_somatic.md: "functional neurological disorder" |
| 35 | feeding and eating disorders | a·10 | `t_eating.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 36 | eating disorders | a·10 | `t_eating.md` | exact title | OK | ″ | ″ | OK |  |
| 37 | anorexia | a·10 | `t_eating.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 38 | bulimia | a·10 | `t_eating.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 39 | elimination disorders | a·11 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `t_neurodev.md` #3) | `t_neurodev.md` | alias | OK | alias — t_neurodev.md: "elimination disorders" |
| 40 | enuresis | a·11 | `t_neurodev.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 41 | sleep-wake disorders | a·12 | `t_sleep.md` | exact title | OK | ″ | ″ | OK |  |
| 42 | insomnia | a·12 | `t_sleep.md` | alias | OK | ″ | ″ | OK |  |
| 43 | sexual dysfunctions | a·13 | `t_sexual.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 44 | gender dysphoria | a·14 | `t_sexual.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 45 | disruptive, impulse-control, and conduct disorders | a·15 | `t_impulse.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 46 | conduct disorder | a·15 | `t_impulse.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 47 | oppositional defiant | a·15 | `t_impulse.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 48 | substance-related and addictive disorders | a·16 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_sud.md` #2) | `t_sud.md` | alias | OK | alias — t_sud.md: "substance related and addictive disorders" |
| 49 | substance use | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 50 | addiction | a·16 | `book_library.md` | scored: title/summary words | **wrong page** | `t_sud.md` | alias | OK | alias — t_sud.md: "addiction" |
| 51 | alcohol use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 52 | opioid use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 53 | neurocognitive disorders | a·17 | `t_neurocog.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 54 | dementia | a·17 | `t_neurocog.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 55 | delirium | a·17 | ⚑ `delirium.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 56 | personality disorders | a·18 | `t_personality.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 57 | antisocial | a·18 | `t_impulse.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 58 | paraphilic disorders | a·19 | `t_sexual.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 59 | other mental disorders | a·20 | ⚑ `delirium.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 60 | medication-induced movement disorders | a·21 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `med_monitoring.md` #8) | `med_monitoring.md` | alias | OK | alias — med_monitoring.md: "medication induced movement disorders" |
| 61 | other conditions that may be a focus of clinical attention | a·22 | ⚑ `delirium.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 62 | haloperidol | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 63 | haldol | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 64 | olanzapine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 65 | zyprexa | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 66 | quetiapine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 67 | seroquel | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 68 | risperidone | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 69 | risperdal | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 70 | aripiprazole | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 71 | abilify | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 72 | ziprasidone | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 73 | geodon | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 74 | paliperidone | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 75 | invega | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 76 | clozapine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 77 | clozaril | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 78 | lurasidone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 79 | latuda | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 80 | chlorpromazine | b | `rounds_questions.md` | scored: page text only | OK (≠ guide: `psychopharm_primer.md` absent) | ″ | ″ | OK (≠ guide: `psychopharm_primer.md` absent) | needs Josh |
| 81 | thorazine | b | — | — | **zero results** | `rounds_questions.md` | scored: page text only | OK (≠ guide: `psychopharm_primer.md` absent) | synonyms — group chlorpromazine: [chlorpromazine, thorazine] |
| 82 | fluphenazine | b | — | — | **zero results** | ″ | ″ | **zero results** | needs Josh |
| 83 | prolixin | b | — | — | **zero results** | ″ | ″ | **zero results** | needs Josh (§6.1); synonyms — group fluphenazine: [fluphenazine, prolixin] |
| 84 | cariprazine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 85 | vraylar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 86 | lithium | b | `cotw_20260803_lithium_ms3.md` | scored: title/summary words | **wrong page** | `med_monitoring.md` | alias | OK | alias — med_monitoring.md: "lithium" |
| 87 | lithobid | b | — | — | **zero results** | `med_monitoring.md` | alias | OK | alias + synonyms — med_monitoring.md: "lithobid"; group lithium: [lithium, lithobid] |
| 88 | divalproex | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 89 | depakote | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 90 | lamotrigine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 91 | lamictal | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 92 | carbamazepine | b | `med_monitoring.md` | alias | OK | ″ | ″ | OK |  |
| 93 | tegretol | b | `med_monitoring.md` | alias | OK | ″ | ″ | OK |  |
| 94 | sertraline | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 95 | zoloft | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 96 | fluoxetine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 97 | prozac | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 98 | escitalopram | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 99 | lexapro | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 100 | citalopram | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 101 | celexa | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 102 | paroxetine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 103 | paxil | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 104 | venlafaxine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 105 | effexor | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 106 | duloxetine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 107 | cymbalta | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 108 | bupropion | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 109 | wellbutrin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 110 | mirtazapine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 111 | remeron | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 112 | trazodone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 113 | desyrel | b | — | — | **zero results** | `psychopharm_primer.md` | alias | OK | alias + synonyms — psychopharm_primer.md: "desyrel"; group trazodone: [trazodone, desyrel] |
| 114 | lorazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 115 | ativan | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 116 | clonazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 117 | klonopin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 118 | diazepam | b | `cotw_20260726_etohwd_ms3.md` | scored: page text only | **wrong page** | `t_sud.md` | alias | OK | alias — t_sud.md: "diazepam" |
| 119 | valium | b | — | — | **zero results** | `t_sud.md` | scored: synonym group (as 'diazepam') | OK | synonyms — group diazepam: [diazepam, valium] |
| 120 | chlordiazepoxide | b | `cotw_20260726_etohwd_ms3.md` | scored: page text only | **wrong page** | `t_sud.md` | alias | OK | alias — t_sud.md: "chlordiazepoxide" |
| 121 | librium | b | — | — | **zero results** | `t_sud.md` | scored: synonym group (as 'chlordiazepoxide') | OK | synonyms — group chlordiazepoxide: [chlordiazepoxide, librium] |
| 122 | hydroxyzine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 123 | vistaril | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 124 | buspirone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 125 | buspar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 126 | zolpidem | b | `rounds_questions.md` | scored: page text only | OK (≠ guide: `t_sleep.md` absent) | `t_sleep.md` | alias | OK | alias — t_sleep.md: "zolpidem" |
| 127 | ambien | b | — | — | **zero results** | `t_sleep.md` | scored: synonym group (as 'zolpidem') | OK | synonyms — group zolpidem: [zolpidem, ambien] |
| 128 | benztropine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 129 | cogentin | b | — | — | **zero results** | ″ | ″ | **zero results** | needs Josh |
| 130 | diphenhydramine | b | `t_sleep.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 131 | benadryl | b | — | — | **zero results** | `t_sleep.md` | scored: page text only | OK | synonyms — group diphenhydramine: [diphenhydramine, benadryl] |
| 132 | propranolol | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 133 | inderal | b | — | — | **zero results** | `t_anxiety.md` | scored: page text only | OK | synonyms — group propranolol: [propranolol, inderal] |
| 134 | prazosin | b | `rapid_review.md` | scored: page text only | OK (≠ guide: `t_anxiety.md` #2) | ″ | ″ | OK (≠ guide: `t_anxiety.md` #2) |  |
| 135 | minipress | b | — | — | **zero results** | `rapid_review.md` | scored: page text only | OK (≠ guide: `t_anxiety.md` #2) | synonyms — group prazosin: [prazosin, minipress] |
| 136 | gabapentin | b | `t_sleep.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 137 | neurontin | b | — | — | **zero results** | `t_sleep.md` | scored: page text only | OK | synonyms — group gabapentin: [gabapentin, neurontin] |
| 138 | buprenorphine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 139 | suboxone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 140 | naltrexone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 141 | vivitrol | b | — | — | **zero results** | `psychopharm_primer.md` | alias | OK | alias + synonyms — psychopharm_primer.md: "vivitrol"; group naltrexone: [naltrexone, vivitrol] |
| 142 | capacity | c | `capacity.html` | alias | OK | ″ | ″ | OK |  |
| 143 | restraint | c | ⚑ `agitation.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 144 | seclusion | c | ⚑ `agitation.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 145 | 1:1 | c | — | — | **zero results** | `suicide.md` | alias | OK | alias — suicide.md: "1 1" |
| 146 | sitter | c | — | — | **zero results** | `suicide.md` | scored: synonym group (as '1 1') | OK | synonyms — group observation: [1 1, sitter] |
| 147 | discharge | c | `exp_family.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 148 | collateral | c | `collateral_workflow.md` | alias | OK | ″ | ″ | OK |  |
| 149 | AMA | c | ⚑ `exp_consult.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 150 | involuntary | c | `ethics_legal.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 151 | blue paper | c | `ethics_legal.md` | alias | OK | ″ | ″ | OK |  |
| 152 | CIWA | c | ⚑ `t_sud.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 153 | COWS | c | ⚑ `t_sud.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 154 | QTc | c | `psychopharm_primer.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 155 | lithium level | c | `med_monitoring.md` | alias | OK | ″ | ″ | OK |  |
| 156 | ANC | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `med_monitoring.md` #6) | ″ | ″ | OK (≠ guide: `med_monitoring.md` #6) | needs Josh |
| 157 | NMS | c | `toxidromes.md` | alias | OK | ″ | ″ | OK |  |
| 158 | serotonin syndrome | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `toxidromes.md` #4) | ″ | ″ | OK (≠ guide: `toxidromes.md` #4) | needs Josh |
| 159 | catatonia | c | `catatonia.md` | exact title + alias | OK | ″ | ″ | OK |  |
| 160 | ECT | c | ⚑ `pg_suicide.md` | protocol · haystack | OK (≠ guide: `ect_neuromodulation.md` #2) | ″ | ″ | OK (≠ guide: `ect_neuromodulation.md` #2) | needs Josh |
| 161 | consent | c | ⚑ `exp_consult.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 162 | HIPAA | c | `ethics_legal.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 163 | duty to warn | c | `ethics_legal.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 164 | Tarasoff | c | `ethics_legal.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 165 | safety plan | c | ⚑ `pg_suicide.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 166 | means restriction | c | ⚑ `pg_suicide.md` | protocol · haystack | OK | ″ | ″ | OK |  |

### Resident site (mmc-psychiatry-residents-sanford)

| # | Query | Grp | Before: first result | Before: tier | Before | After: first result | After: tier | After | Fix home |
|---|---|---|---|---|---|---|---|---|---|
| 1 | schizophrenia | 10-17 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 2 | pregnancy | 10-17 | `t_perinatal.md` | alias | OK | ″ | ″ | OK |  |
| 3 | adolescent | 10-17 | `t_neurodev.md` | alias | OK | ″ | ″ | OK |  |
| 4 | bipolar | 10-17 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 5 | mania | 10-17 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 6 | borderline | 10-17 | `t_personality.md` | alias | OK | ″ | ″ | OK |  |
| 7 | panic | 10-17 | `t_anxiety.md` | alias | OK | ″ | ″ | OK |  |
| 8 | neurodevelopmental disorders | a·1 | `t_neurodev.md` | exact title | OK | ″ | ″ | OK |  |
| 9 | adhd | a·1 | `t_neurodev.md` | alias | OK | ″ | ″ | OK |  |
| 10 | autism | a·1 | `t_neurodev.md` | alias | OK | ″ | ″ | OK |  |
| 11 | intellectual disability | a·1 | `t_neurodev.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 12 | schizophrenia spectrum and other psychotic disorders | a·2 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 13 | psychotic disorders | a·2 | `t_psychosis.md` | exact title + alias | OK | ″ | ″ | OK |  |
| 14 | psychosis | a·2 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 15 | schizoaffective | a·2 | `t_psychosis.md` | alias | OK | ″ | ″ | OK |  |
| 16 | bipolar and related disorders | a·3 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 17 | depressive disorders | a·4 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 18 | depression | a·4 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 19 | major depressive disorder | a·4 | `t_mood.md` | alias | OK | ″ | ″ | OK |  |
| 20 | mdd | a·4 | `cotw_20261005_mddaug_res.md` | scored: title/summary words | **wrong page** | `t_mood.md` | alias | OK | alias — t_mood.md: "mdd" |
| 21 | anxiety disorders | a·5 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 22 | anxiety | a·5 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 23 | gad | a·5 | `screeners.html` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 24 | obsessive-compulsive and related disorders | a·6 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_anxiety.md` #9) | `t_anxiety.md` | alias | OK | alias — t_anxiety.md: "obsessive compulsive and related disorders" |
| 25 | obsessive compulsive | a·6 | `podcast_library.md` | scored: page text only | **wrong page** | `t_anxiety.md` | scored: synonym group (as 'ocd') | OK | synonyms — group ocd: [ocd, obsessive compulsive, obsessive compulsive disorder] |
| 26 | ocd | a·6 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 27 | trauma- and stressor-related disorders | a·7 | `t_adjustment.md` | scored: title/summary words | OK | `t_anxiety.md` | alias | OK | alias — t_anxiety.md: "trauma and stressor related disorders" |
| 28 | ptsd | a·7 | `t_anxiety.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 29 | adjustment disorder | a·7 | `t_adjustment.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 30 | dissociative disorders | a·8 | `t_dissociative.md` | exact title | OK | ″ | ″ | OK |  |
| 31 | somatic symptom and related disorders | a·9 | `t_somatic.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 32 | somatic symptom disorder | a·9 | `t_somatic.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 33 | conversion disorder | a·9 | `t_adjustment.md` | scored: title/summary words | OK (≠ guide: `t_somatic.md` #11) | `t_somatic.md` | alias | OK | alias — t_somatic.md: "conversion disorder" |
| 34 | functional neurological disorder | a·9 | `cotw_20260810_panic_res.md` | scored: title/summary words | **wrong page** | `t_somatic.md` | alias | OK | alias — t_somatic.md: "functional neurological disorder" |
| 35 | feeding and eating disorders | a·10 | `t_eating.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 36 | eating disorders | a·10 | `t_eating.md` | exact title | OK | ″ | ″ | OK |  |
| 37 | anorexia | a·10 | `t_eating.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 38 | bulimia | a·10 | `t_eating.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 39 | elimination disorders | a·11 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `t_neurodev.md` #3) | `t_neurodev.md` | alias | OK | alias — t_neurodev.md: "elimination disorders" |
| 40 | enuresis | a·11 | `t_neurodev.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 41 | sleep-wake disorders | a·12 | `t_sleep.md` | exact title | OK | ″ | ″ | OK |  |
| 42 | insomnia | a·12 | `t_sleep.md` | alias | OK | ″ | ″ | OK |  |
| 43 | sexual dysfunctions | a·13 | `t_sexual.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 44 | gender dysphoria | a·14 | `t_sexual.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 45 | disruptive, impulse-control, and conduct disorders | a·15 | `t_impulse.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 46 | conduct disorder | a·15 | `t_impulse.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 47 | oppositional defiant | a·15 | `t_impulse.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 48 | substance-related and addictive disorders | a·16 | `t_dissociative.md` | scored: title/summary words | OK (≠ guide: `t_sud.md` #2) | `t_sud.md` | alias | OK | alias — t_sud.md: "substance related and addictive disorders" |
| 49 | substance use | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 50 | addiction | a·16 | `book_library.md` | scored: title/summary words | **wrong page** | `t_sud.md` | alias | OK | alias — t_sud.md: "addiction" |
| 51 | alcohol use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 52 | opioid use disorder | a·16 | ⚑ `t_sud.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 53 | neurocognitive disorders | a·17 | `t_neurocog.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 54 | dementia | a·17 | `t_neurocog.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 55 | delirium | a·17 | ⚑ `delirium.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 56 | personality disorders | a·18 | `t_personality.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 57 | antisocial | a·18 | `t_impulse.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 58 | paraphilic disorders | a·19 | `t_sexual.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 59 | other mental disorders | a·20 | ⚑ `delirium.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 60 | medication-induced movement disorders | a·21 | `t_sleep.md` | scored: title/summary words | OK (≠ guide: `med_monitoring.md` #8) | `med_monitoring.md` | alias | OK | alias — med_monitoring.md: "medication induced movement disorders" |
| 61 | other conditions that may be a focus of clinical attention | a·22 | ⚑ `delirium.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 62 | haloperidol | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 63 | haldol | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 64 | olanzapine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 65 | zyprexa | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 66 | quetiapine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 67 | seroquel | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 68 | risperidone | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 69 | risperdal | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 70 | aripiprazole | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 71 | abilify | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 72 | ziprasidone | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 73 | geodon | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 74 | paliperidone | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 75 | invega | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 76 | clozapine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 77 | clozaril | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 78 | lurasidone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 79 | latuda | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 80 | chlorpromazine | b | `canon_200.md` | scored: page text only | **wrong page** | ″ | ″ | **wrong page** | needs Josh |
| 81 | thorazine | b | — | — | **zero results** | `canon_200.md` | scored: page text only | **wrong page** | needs Josh (§6.1); synonyms — group chlorpromazine: [chlorpromazine, thorazine] |
| 82 | fluphenazine | b | `adv_psychopharm.md` | scored: page text only | OK (≠ guide: `psychopharm_primer.md` absent) | ″ | ″ | OK (≠ guide: `psychopharm_primer.md` absent) | needs Josh |
| 83 | prolixin | b | — | — | **zero results** | `adv_psychopharm.md` | scored: page text only | OK (≠ guide: `psychopharm_primer.md` absent) | synonyms — group fluphenazine: [fluphenazine, prolixin] |
| 84 | cariprazine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 85 | vraylar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 86 | lithium | b | `cotw_20260803_lithium_res.md` | scored: title/summary words | **wrong page** | `med_monitoring.md` | alias | OK | alias — med_monitoring.md: "lithium" |
| 87 | lithobid | b | — | — | **zero results** | `med_monitoring.md` | alias | OK | alias + synonyms — med_monitoring.md: "lithobid"; group lithium: [lithium, lithobid] |
| 88 | divalproex | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 89 | depakote | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 90 | lamotrigine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 91 | lamictal | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 92 | carbamazepine | b | `med_monitoring.md` | alias | OK | ″ | ″ | OK |  |
| 93 | tegretol | b | `med_monitoring.md` | alias | OK | ″ | ″ | OK |  |
| 94 | sertraline | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 95 | zoloft | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 96 | fluoxetine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 97 | prozac | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 98 | escitalopram | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 99 | lexapro | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 100 | citalopram | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 101 | celexa | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 102 | paroxetine | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 103 | paxil | b | `psychopharm_primer.md` | alias | OK | ″ | ″ | OK |  |
| 104 | venlafaxine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 105 | effexor | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 106 | duloxetine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 107 | cymbalta | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 108 | bupropion | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 109 | wellbutrin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 110 | mirtazapine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 111 | remeron | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 112 | trazodone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 113 | desyrel | b | — | — | **zero results** | `psychopharm_primer.md` | alias | OK | alias + synonyms — psychopharm_primer.md: "desyrel"; group trazodone: [trazodone, desyrel] |
| 114 | lorazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 115 | ativan | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 116 | clonazepam | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 117 | klonopin | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 118 | diazepam | b | `cotw_20260810_panic_res.md` | scored: page text only | **wrong page** | `t_sud.md` | alias | OK | alias — t_sud.md: "diazepam" |
| 119 | valium | b | — | — | **zero results** | `t_sud.md` | scored: synonym group (as 'diazepam') | OK | synonyms — group diazepam: [diazepam, valium] |
| 120 | chlordiazepoxide | b | — | — | **zero results** | `t_sud.md` | alias | OK | alias — t_sud.md: "chlordiazepoxide" |
| 121 | librium | b | — | — | **zero results** | `t_sud.md` | scored: synonym group (as 'chlordiazepoxide') | OK | synonyms — group chlordiazepoxide: [chlordiazepoxide, librium] |
| 122 | hydroxyzine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 123 | vistaril | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 124 | buspirone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 125 | buspar | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 126 | zolpidem | b | `cotw_20260831_catatonia_res.md` | scored: page text only | **wrong page** | `t_sleep.md` | alias | OK | alias — t_sleep.md: "zolpidem" |
| 127 | ambien | b | — | — | **zero results** | `t_sleep.md` | scored: synonym group (as 'zolpidem') | OK | synonyms — group zolpidem: [zolpidem, ambien] |
| 128 | benztropine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 129 | cogentin | b | — | — | **zero results** | ″ | ″ | **zero results** | needs Josh |
| 130 | diphenhydramine | b | `t_sleep.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 131 | benadryl | b | — | — | **zero results** | `t_sleep.md` | scored: page text only | OK | synonyms — group diphenhydramine: [diphenhydramine, benadryl] |
| 132 | propranolol | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 133 | inderal | b | — | — | **zero results** | `t_anxiety.md` | scored: page text only | OK | synonyms — group propranolol: [propranolol, inderal] |
| 134 | prazosin | b | `rapid_review.md` | scored: page text only | OK (≠ guide: `t_anxiety.md` #2) | ″ | ″ | OK (≠ guide: `t_anxiety.md` #2) |  |
| 135 | minipress | b | — | — | **zero results** | `rapid_review.md` | scored: page text only | OK (≠ guide: `t_anxiety.md` #2) | synonyms — group prazosin: [prazosin, minipress] |
| 136 | gabapentin | b | `t_sleep.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 137 | neurontin | b | — | — | **zero results** | `t_sleep.md` | scored: page text only | OK | synonyms — group gabapentin: [gabapentin, neurontin] |
| 138 | buprenorphine | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 139 | suboxone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 140 | naltrexone | b | `psychopharm_primer.md` | scored: medication name (exact) | OK | ″ | ″ | OK |  |
| 141 | vivitrol | b | — | — | **zero results** | `psychopharm_primer.md` | alias | OK | alias + synonyms — psychopharm_primer.md: "vivitrol"; group naltrexone: [naltrexone, vivitrol] |
| 142 | capacity | c | `capacity.html` | alias | OK | ″ | ″ | OK |  |
| 143 | restraint | c | ⚑ `agitation.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 144 | seclusion | c | ⚑ `agitation.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 145 | 1:1 | c | — | — | **zero results** | `suicide.md` | alias | OK | alias — suicide.md: "1 1" |
| 146 | sitter | c | `cotw_20260713_agitation_res.md` | scored: page text only | **wrong page** | `suicide.md` | scored: synonym group (as '1 1') | OK | synonyms — group observation: [1 1, sitter] |
| 147 | discharge | c | `exp_family.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 148 | collateral | c | `collateral_workflow.md` | alias | OK | ″ | ″ | OK |  |
| 149 | AMA | c | ⚑ `exp_consult.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 150 | involuntary | c | `systems_medlegal.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 151 | blue paper | c | `systems_medlegal.md` | alias | OK | ″ | ″ | OK |  |
| 152 | CIWA | c | ⚑ `t_sud.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 153 | COWS | c | ⚑ `t_sud.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 154 | QTc | c | `cl_reference.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 155 | lithium level | c | `med_monitoring.md` | alias | OK | ″ | ″ | OK |  |
| 156 | ANC | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `med_monitoring.md` #4) | ″ | ″ | OK (≠ guide: `med_monitoring.md` #4) | needs Josh |
| 157 | NMS | c | `toxidromes.md` | alias | OK | ″ | ″ | OK |  |
| 158 | serotonin syndrome | c | ⚑ `t_sud.md` | protocol · haystack | OK (≠ guide: `toxidromes.md` #5) | ″ | ″ | OK (≠ guide: `toxidromes.md` #5) | needs Josh |
| 159 | catatonia | c | `catatonia.md` | exact title + alias | OK | ″ | ″ | OK |  |
| 160 | ECT | c | ⚑ `pg_suicide.md` | protocol · haystack | OK (≠ guide: `ect_neuromodulation.md` #2) | ″ | ″ | OK (≠ guide: `ect_neuromodulation.md` #2) | needs Josh |
| 161 | consent | c | ⚑ `exp_consult.md` | protocol · trigger | OK | ″ | ″ | OK |  |
| 162 | HIPAA | c | `ethics_legal.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 163 | duty to warn | c | `ethics_legal.md` | scored: page text only | OK | ″ | ″ | OK |  |
| 164 | Tarasoff | c | `ethics_legal.md` | scored: title/summary words | OK | ″ | ″ | OK |  |
| 165 | safety plan | c | ⚑ `pg_suicide.md` | protocol · haystack | OK | ″ | ″ | OK |  |
| 166 | means restriction | c | ⚑ `pg_suicide.md` | protocol · haystack | OK | ″ | ″ | OK |  |

