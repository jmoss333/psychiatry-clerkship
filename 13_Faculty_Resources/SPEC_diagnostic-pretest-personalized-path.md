# Spec — Diagnostic Pretest → Personalized 6-Week Path (Adaptive Engine v2)

**Author:** Joshua Moss, MD · **Status:** proposed · **Date:** 2026-07-13
**Depends on (all merged):** shelfBlueprint/EPA crosswalk (#208), adaptive weak-topic engine v1 (#210), confidence-calibration (#214).
**Owner:** Codex build; faculty review of the week↔blueprint map + pretest item set.

---

## 1. Problem

The 6-week curriculum (`01_Six_Week_Curriculum/`) is a fixed scaffold everyone sees identically, and the mastery engine only has signal *after* a learner has practiced. A student arriving day 0 — or a repeat learner who's already strong in mood but weak in neurocog — gets no personalization and no starting direction. We have the substrate (mastery model, blueprint tags, Start-here that already captures track/start-week/shelf-date) but nothing that seeds it or turns it into a plan.

## 2. Goals / Non-goals

**Goals**
- A short (~12-item), attested-only **diagnostic pretest** sampling all 12 blueprint categories.
- Seed `masteryByBlueprint()` from pretest results so the home is useful on day 0.
- Produce a **personalized study plan** overlaid on the fixed 6-week scaffold: per-week "focus these weak areas first," prioritized practice/reading, and shelf-countdown-aware intensity.
- Fully client-side, `cw_`-namespaced, no clinical content authored.

**Non-goals (v2)**
- **No reshuffling of week order.** The clinical sequence (Foundations → … → Acute → Integration) is pedagogically deliberate; personalization changes *emphasis within/across the fixed order*, not the order itself. (Key decision — see §6.)
- No server-side storage / accounts (stays inside the shipped opt-in export; FERPA gate P2-12 unchanged).
- No new question content — pretest draws from the existing attested `question_bank.json`.

## 3. Users & entry point

Slots into **Start-here** (`renderStart`, item `__start__`, `spa_index.html:1245`), which already collects `cw_track`, `cw_start_week`, `cw_shelf_date`. Add a third mode card beside "Follow the Path" / "Browse the Library" (`spa_index.html:1253`): **"Take the 2-minute placement."** On completion it writes the plan and routes to the personalized path view.

## 4. UX flow

1. Start-here → "Take the 2-minute placement" (optional; skippable).
2. 12 single-best-answer items (1 per blueprint category), no confidence step, ~10s each, immediate correctness, no teaching interruptions (it's a probe, not a lesson).
3. Results screen: the 12-bar **Mastery by blueprint** panel (reuses v1 rendering) seeded from the pretest, + top-3 weak areas.
4. **"Your 6-week plan"**: the fixed W1–W6 scaffold, each week annotated with the learner's weak blueprint areas that fall in that week + a one-tap "practice this now" (reuses `cw_qb_focus` handoff) and the week's topic pages.
5. Plan persists; re-openable from Start-here and linked from the home.

## 5. Data model (all `cw_`-namespaced, client-side)

| Key | Shape | Notes |
|---|---|---|
| `cw_pretest_v1` | `{ takenAt, answers:[{id,cat,correct}], byCat:{<cat>:{n,correct}} }` | Raw pretest result; one-time (re-takeable, overwrites). |
| `cw_qb_v1` | *(existing)* | Pretest answers **also** written here as normal responses so `masteryByBlueprint()` picks them up with zero change — tag records `source:"pretest"` to allow later exclusion. |
| `cw_plan_v1` | `{ generatedAt, shelfDate, weeks:[{week,focus:[cat],pages:[slug]}] }` | Derived plan; recomputable. |

Export (`exportStudy`) already carries `qb` + `mastery` + `calibration`; add `pretest` + `plan` snapshots (additive).

## 6. Algorithm

**Pretest item selection.** For each of the 12 categories, pick one attested item (`status:"attested"`) at difficulty 2 (shelf-standard) where available, `hy:true` preferred, chosen deterministically by a rotating seed so retakes vary. Skip categories with no attested item (shouldn't happen — the #208 coverage check guarantees ≥1).

**Scoring → mastery seed.** Write each pretest answer into `cw_qb_v1` (so the existing `masteryByBlueprint()` rollup handles it). A single item/category yields "low confidence" mastery by design — honest, and it improves as they practice.

**Personalized plan (emphasis, not reordering).** Fixed week order; for each week, intersect its blueprint coverage with the learner's weak categories (mastery <70 or not-started) → that week's "focus lane." Weeks with no weak overlap show "on track — maintain." Shelf-countdown (`cw_shelf_date`) sets intensity copy (e.g., <14 days → "compress: hit focus lanes + practice daily").

**Proposed week ↔ blueprint map** (faculty-reviewable default, from week objectives):

| Week | Title | Blueprint categories |
|---|---|---|
| 1 | Foundations & Orientation | safety (recognition), + interview/MSE/capacity skills (cross-cutting) |
| 2 | Mood, Psychosis & Pharmacology | mood, psychosis, pharm, neurocog (catatonia screen) |
| 3 | Psychotherapy, Personality & Relationship | personality, anxiety, relational |
| 4 | Family, Systems & Expressed Emotion | relational |
| 5 | Acute & Emergency | safety, neurocog (delirium/catatonia), substance |
| 6 | Integration, Disposition & Exam | otherdx, ethics, + full-blueprint review |

Stored as a small constant in `spa_index.html` (or a `curriculum_map.json` mirroring the crosswalk pattern), labeled a proposed default.

## 7. Integration points (exact)

- `spa_index.html` `renderStart` (`:1245`) — add the placement card + a `renderPretest()` / `renderPlan()` view.
- Start-here click handler (`:1274`, `:1282`) — add `data-act="pretest"`.
- Reuse `masteryByBlueprint()` (`:~1150`), the `cw_qb_focus` handoff (`:1274`), the `.hm-bars/.brow` bar styling (no new CSS).
- Pretest needs the bank: fetch `question_bank.json` once in the SPA (the practice tool already does `fetch('../question_bank.json')`; mirror it), or ship a slim `pretest_pool.json` at build time (12 pre-selected attested items) to avoid loading the full bank on the home. **Leaning: build-time `pretest_pool.json`** (smaller, keeps the home light, and the selection is auditable).
- Optional build step in `build_deploy.py`: emit `pretest_pool.json` (1 attested item/category); add to the QA gate that it has exactly 12 categories covered.

## 8. Attestation, safety, privacy

- **No clinical content authored.** Pretest items are existing attested bank items; the plan is derived scaffolding. Sits outside the attestation-risk surface (same posture as v1/calibration).
- If `pretest_pool.json` is a build artifact, it contains only `status:"attested"` items → the harness should assert that (soft→hard).
- Privacy unchanged: client-side, `cw_`-namespaced, rides the existing opt-in de-identified export. No accounts.

## 9. Verification / QA gate

- Inline `<script>` `node --check` (both sites).
- Unit tests: pretest selection picks exactly 1 attested item/category; plan focus-lane intersection correct for a synthetic weak profile; cold-start (skipped pretest) leaves home unchanged.
- If build artifact added: harness check that `pretest_pool.json` covers 12 categories, attested-only.
- Both sites build **hard:0**; MS3 home + Start-here unaffected when the pretest is skipped.

## 10. Effort & phasing

- **Phase A (S–M):** pretest flow + mastery seeding (write to `cw_qb_v1`) + results screen. Highest value, smallest surface.
- **Phase B (M):** personalized plan view (week↔blueprint map + focus lanes + shelf intensity) + `cw_plan_v1`.
- **Phase C (S):** build-time `pretest_pool.json` + harness assertion; export enrichment.

Ship Phase A alone if we want the fastest win; A+B is the complete feature.

## 11. Risks

- **Over-reading one item/category** → mislabeling a learner. Mitigate: pretest yields *low-confidence* mastery (shrinkage already does this in v1), copy says "starting estimate — refines as you practice."
- **Week↔category map is a clinical judgment** → ship as proposed/faculty-reviewable (like the EPA map), keep any harness check soft.
- **Home-weight**: don't load the full bank on the home → use `pretest_pool.json`.
- **Clinical-sequence integrity**: do NOT reorder weeks (§6).

## 12. Open questions (highest-leverage)

1. **Plan model:** emphasis-overlay on the fixed sequence (this spec's recommendation) vs. true week reordering? Recommendation: overlay — clinically safer, still personalized.
2. Pretest length: 12 (one/category, ~2 min) vs. 24 (two/category, better signal, ~4 min)? Recommendation: 12 for completion rate; expand later if data shows noise.

## 13. Definition of done (A+B)

Placement card in Start-here; 12-item attested pretest; results seed `masteryByBlueprint()`; personalized 6-week plan with per-week focus lanes + shelf-intensity + `cw_qb_focus` practice CTAs; `cw_pretest_v1`/`cw_plan_v1` persisted; export enriched; skipping leaves home unchanged; both sites hard:0; JS syntax-checked + logic unit-tested.

_Joshua Moss, MD | Psychiatrist_
