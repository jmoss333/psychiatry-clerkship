# Duplicate / Concept Index — Pilot Batch 01

Two scans: (A) intra-pilot (no two pilot items share a central discrimination) and (B) pilot vs the live attested 192-item `question_bank.json` (near-neighbors flagged for faculty reconciliation).

Method: Jaccard similarity on distinctive terms (stem+rationale+takeaway), same category. This is a screening heuristic, not a semantic judgment — faculty decide each flagged pair.

## A. Intra-pilot overlap (should be low — 2 items/category, distinct discriminations)

| Item A | Item B | Jaccard | Shared? |
|---|---|---|---|

_No intra-pilot pair reaches the 0.25 review threshold; the two items per category test distinct discriminations._

## B. Pilot vs live attested bank — near-neighbors (faculty reconciliation)

The live bank already holds 192 attested items (16/category), so core high-yield discriminations are covered. Pilot items below are near-neighbors of an attested item and must be reconciled at integration.

| Pilot item | Nearest live item | Jaccard | Shared discrimination | Recommendation |
|---|---|---|---|---|
| qbx_mood_001 | qb_mood_014 | 0.19 | Manic symptoms emerging on antidepressant monotherapy =… | Enriched dual-exam/externally-cited counterpart of qb_mood_014. Faculty: keep pilot version as the exam-blueprint reference or merge tags into qb_mood_014. |
| qbx_psy_001 | qb_psy_015 | 0.34 | Psychosis duration: <1 mo = brief psychotic; 1–6 mo = s… | Same duration-criterion discrimination as qb_psy_015. Recommend RETIRE one at integration or keep pilot as dual-tagged variant. |
| qbx_psy_002 | qb_psy_007 | 0.21 | Two adequate antipsychotic trial failures = treatment-r… | Same treatment-resistance/clozapine point as qb_psy_007. Pilot adds verified Kane citation + two-tier. Faculty choose one. |
| qbx_sud_001 | qb_sud_002 | 0.21 | Thiamine before glucose, every time — carbohydrate load… | Live qb_sud_002 already teaches thiamine-before-glucose. Pilot adds two-tier mechanism + external cite. RECONCILE (likely retire live or merge). |
| qbx_cog_002 | qb_cog_005 | 0.21 | LBD tetrad: fluctuating cognition + recurrent visual ha… | Same DLB core-feature tetrad as qb_cog_005 (audit noted qb_cog_005 mislabels it 'pathognomonic'). Pilot avoids that error — prefer pilot or fix live. |
| qbx_cdev_002 | qb_cdev_007 | 0.32 | ODD = defiant/argumentative without violating others' r… | Same ODD-vs-conduct discrimination as qb_cdev_007. Keep one; pilot adds dual-exam tags. |
| qbx_oth_002 | qb_otherdx_005 | 0.22 | Functional neurological disorder (conversion) is diagno… | CORRECTED counterpart of qb_otherdx_005 (audit P0: wrong Hoover description). Pilot states Hoover correctly + external cite. RECOMMEND pilot REPLACES qb_otherdx_005. |
| qbx_eth_002 | qb_eth_002 | 0.24 | A specific, credible threat to a reasonably identifiabl… | Same duty-to-protect discrimination as qb_eth_002 (live). Keep jurisdiction-neutral; choose one. |

**Takeaway:** because the live bank is already comprehensive, the highest-leverage path for the 180/360 expansion is to (1) fill genuine blueprint gaps and (2) enrich/re-tag existing items with dual-exam + external evidence, rather than author net-new items that restate attested discriminations. See 11_FINAL_REPORT.md.
