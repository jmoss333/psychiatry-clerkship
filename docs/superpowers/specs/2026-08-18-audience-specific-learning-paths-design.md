# Audience-Specific Four-Week and Six-Week Learning Paths — Design

**Date:** 2026-08-18

**Status:** Approved in conversation; written specification awaiting final user review

**Scope:** MS3 and resident Front Door learning paths, path-aware progress/placement behavior, and build-time validation

## Purpose

Give each audience the rotation structure it actually follows:

- The MS3 site keeps its existing six-week sequence unchanged.
- The resident site receives a four-week competency arc designed for inpatient residency rather than a compressed copy of the student sequence.
- The correct path is selected by the site build. Learners do not choose an audience or toggle between paths.

The feature must make the selected duration consistent everywhere a learner encounters a week: first-run setup, Today, Path, Progress, the placement-generated plan, date-derived week calculation, and next-week previews.

## Problem statement

`curriculum.json` currently has one shared six-week `weeks` array. Both site builds inject that same array into the shared Front Door, so the resident site presents the MS3 duration even though its own navigation includes a four-week resident rotation plan. Several browser functions also hard-code week 6, and the placement plan has a second six-week map embedded in `spa_index.html`.

This creates three risks:

1. Residents receive the wrong pacing and sequence.
2. Visible surfaces can disagree because week structure has more than one source.
3. Future duration changes can pass one layer while leaving another at six weeks.

## Design decisions

### Audience selection

The build target is authoritative:

| Build target | Canonical path | Duration |
|---|---|---:|
| `ms3` | `ms3-six-week` | 6 weeks |
| `resident` | `resident-four-week` | 4 weeks |

There is no learner-facing audience selector, URL switch, or local-storage preference. This prevents a learner from entering a path whose resources do not match the site being viewed.

### Source of truth

Replace the shared top-level `weeks` array in `curriculum.json` with exactly two site-keyed paths:

```json
{
  "learningPaths": {
    "ms3": {
      "id": "ms3-six-week",
      "weeks": []
    },
    "resident": {
      "id": "resident-four-week",
      "weeks": []
    }
  }
}
```

Each week has this exact shape:

```json
{
  "n": 1,
  "title": "Foundations & the MSE",
  "theme": "Orientation · interviewing · MSE",
  "focusCategories": ["safety"],
  "items": [
    { "ref": "pg_interview.md", "kind": "read" },
    { "ref": "mse.html", "kind": "tool" }
  ]
}
```

Rules:

- The source does not store a separate week count. It is derived from `weeks.length`.
- Path IDs are stable storage/migration identifiers, not display copy.
- Week numbers must be consecutive integers starting at 1.
- `title`, `theme`, and `focusCategories` are path-owned teaching structure.
- Resource titles, time estimates, summaries, governance, and attestation remain owned by the final site navigation, `topic_meta.json`, and their existing registries.
- `focusCategories` uses only the existing question-bank blueprint codes: `anxiety`, `childdev`, `ethics`, `mood`, `neurocog`, `otherdx`, `personality`, `pharm`, `psychosis`, `relational`, `safety`, and `substance`.
- A ref may occur in multiple weeks when repetition is intentional, but it may occur only once within one week.

`curriculum.schema.json` requires exactly `ms3` and `resident`, exact IDs, exactly six MS3 weeks, exactly four resident weeks, the allowed focus-category enum, and the existing item-kind contract. Procedural validation enforces contiguous numbering, uniqueness, site availability, and kind agreement.

## Canonical path content

### MS3: six weeks

The existing six-week sequence, titles, themes, item order, and item kinds remain unchanged. `focusCategories` moves the existing placement-map emphasis into the canonical path.

#### Week 1 — Foundations & the MSE

Theme: `Orientation · interviewing · MSE`

Focus: `safety`

1. `welcome.md` — read
2. `pg_interview.md` — read
3. `pg_suicide.md` — read
4. `agitation.md` — read
5. `delirium.md` — read
6. `withdrawal.html` — tool
7. `doc_oral.md` — read
8. `mse.html` — tool
9. `question-bank-practice.html` — tool

#### Week 2 — Mood, Psychosis & Pharm

Theme: `Dx frameworks · the top-10 drugs`

Focus: `mood`, `psychosis`, `pharm`, `neurocog`

1. `t_mood.md` — read
2. `t_psychosis.md` — read
3. `psychopharm_primer.md` — read
4. `ddx.md` — read
5. `question-bank-practice.html` — tool

#### Week 3 — Psychotherapy & Personality

Theme: `Alliance · brief therapy · PDs`

Focus: `personality`, `anxiety`, `relational`

1. `t_personality.md` — read
2. `exp_tx.md` — read
3. `brief_psychotherapy.md` — read
4. `reflection.html` — tool
5. `question-bank-practice.html` — tool

#### Week 4 — Family Systems & EE

Theme: `Family meetings · collateral`

Focus: `relational`

1. `exp_family.md` — read
2. `family_modalities.md` — read
3. `family_playbook.md` — read
4. `collateral_workflow.md` — read
5. `family-systems.html` — tool
6. `question-bank-practice.html` — tool

#### Week 5 — Acute & Emergency

Theme: `Safety · agitation · withdrawal`

Focus: `safety`, `neurocog`, `substance`

1. `suicide.md` — read
2. `agitation.md` — read
3. `delirium.md` — read
4. `catatonia.md` — read
5. `cssrs.html` — tool
6. `withdrawal.html` — tool
7. `capacity.html` — tool
8. `question-bank-practice.html` — tool

#### Week 6 — Integration & Exam

Theme: `Exam · OSCE · putting it together`

Focus: `otherdx`, `ethics`

1. `shelf.md` — read
2. `osce.md` — read
3. `cases.md` — read
4. `landmark_trials.md` — read
5. `oral.html` — tool
6. `one-patient-six-weeks.html` — tool
7. `question-bank-practice.html` — tool

### Resident: four-week competency arc

The resident path uses existing resident-accessible resources. It changes pacing and curation only; it does not rewrite clinical content.

#### Week 1 — Foundations and safety

Theme: `Interview · MSE · acute risk · bedside syndromes`

Focus: `safety`, `neurocog`, `substance`

1. `pg_interview.md` — read
2. `mse.html` — tool
3. `pg_suicide.md` — read
4. `agitation.md` — read
5. `violence.html` — tool
6. `delirium.md` — read
7. `withdrawal.html` — tool
8. `bfcrs.html` — tool
9. `capacity.html` — tool

Clinical intent: establish a safe, reproducible first-pass assessment and practice recognition of high-acuity conditions that require prompt supervision and escalation.

#### Week 2 — Diagnosis and psychopharmacology

Theme: `Diagnostic reasoning · major syndromes · medication decisions`

Focus: `mood`, `psychosis`, `pharm`, `substance`

1. `diagnostic-reasoning.html` — tool
2. `t_mood.md` — read
3. `t_psychosis.md` — read
4. `t_sud.md` — read
5. `psychopharm_primer.md` — read
6. `adv_psychopharm.md` — read
7. `med_monitoring.md` — read
8. `interaction-cards.html` — tool

Clinical intent: move from symptom recognition to prioritized diagnosis, treatment selection, monitoring, and supervised response to common inpatient interactions.

#### Week 3 — Systems, med-legal, and disposition

Theme: `Consultation · collateral · family systems · defensible transitions`

Focus: `ethics`, `relational`

1. `systems_medlegal.md` — read
2. `cl_reference.md` — read
3. `exp_consult.md` — read
4. `collateral_workflow.md` — read
5. `family-systems.html` — tool
6. `exp_family.md` — read
7. `doc_oral.md` — read

Clinical intent: organize consultation questions, obtain and integrate collateral, work with families, and document the reasoning that supports disposition and transitions of care. Existing local-policy and legal disclaimers remain controlling.

#### Week 4 — Integration, supervision, and scholarship

Theme: `Formulation · rounds · EPAs · evidence retrieval`

Focus: `otherdx`, `ethics`, `relational`

1. `case_formulation.md` — read
2. `oral.html` — tool
3. `supervision_teaching.md` — read
4. `evidence_inpatient.md` — read
5. `landmark_trials.md` — read
6. `canon_200.md` — read
7. `rp-canon-quiz.html` — tool

Clinical intent: integrate formulation and communication with graduated supervision, then connect bedside decisions to a concise evidence spine and retrieval practice.

`one-patient-six-weeks.html` remains available in the resident library as optional longitudinal material but is not part of the resident core path.

## Build projection

`build_frontdoor_payload(site, curriculum, catalog)` selects exactly one source path after the final site navigation is assembled. The browser receives no other audience path.

The projected `FD_CURRICULUM` shape is:

```json
{
  "path": {
    "id": "resident-four-week",
    "weekCount": 4
  },
  "weeks": [
    {
      "n": 1,
      "title": "Foundations and safety",
      "theme": "Interview · MSE · acute risk · bedside syndromes",
      "focusCategories": ["safety", "neurocog", "substance"],
      "items": []
    }
  ],
  "libraryColumns": [],
  "libraryExclude": [],
  "safetyKit": [],
  "synonyms": {}
}
```

Projection requirements:

1. `learningPaths`, `roles`, and `siteLibrary` do not ship to the browser.
2. `path.weekCount` is derived from the selected `weeks.length` during projection.
3. Every path ref must exist in that site's final annotated navigation, including any resident-only extras.
4. Its `kind` must agree with the final navigation kind.
5. The small projected `FD_SITE_MANIFEST` title/governance index covers the ordered union of library refs and path refs. A path item must not need a duplicate library placement merely to obtain its title.
6. Missing site paths, malformed paths, absent refs, and kind disagreements abort the build. They never degrade into raw slugs on a deployed site.

`fdBuildIndex` preserves `focusCategories` and returns:

```js
{
  path: { id: 'resident-four-week', weekCount: 4 },
  weeks: [...],
  columns: [...],
  kit: [...],
  byRef: {...}
}
```

The runtime treats `index.weeks` as the valid week set and `index.path.weekCount` as display metadata. It does not infer an audience from branding or role IDs.

## Learner-facing behavior

### First-run setup

- The MS3 build shows six week tiles.
- The resident build shows four week tiles.
- The existing `Not on rotation — just browse` choice remains.
- No new controls or explanatory audience copy are added.

### Today

- Today accepts only a week that exists in `FD_INDEX.weeks`.
- Completing a non-final week previews the next week from the array, not `Math.min(6, week + 1)`.
- Completing the final week opens the final week in Path with the label `Review Week N`; it must not invent or repeat a next week under `Preview Week N`.
- Current-week rows, completion counts, and reading-time estimates continue to derive from that week's items.

### Path

- The heading is `Your 4-week path` or `Your 6-week path`, derived from the projected count.
- The timeline contains exactly the selected site's weeks.
- Selecting, setting, and rendering details for a week use membership in the projected week set, not a numeric upper bound.
- An invalid saved `viewWeek` falls back to the first projected week without claiming it is the learner's current week.

### Date-derived rotation week

`rotationWeek()` takes the current path length:

- A future start date remains the existing pre-rotation sentinel.
- Dates from day 0 through the last day of the selected path return weeks `1..N`.
- A date after the selected path returns the existing post-rotation sentinel, now expressed as `N + 1` rather than as the literal `7`.
- A malformed or otherwise invalid selected or derived current week never renders a nonexistent week. Today shows its existing setup state while learner progress remains intact.

`fdRotationStartForWeek` validates against the projected week numbers. The fallback exam countdown appears only in the final two weeks of the selected path and is anchored to Friday of the final week. A learner-supplied `cw_shelf_date` remains authoritative. Thus MS3 retains its week-6 fallback, while resident fallback pacing uses week 4 without asserting that either program has a mandatory exam.

### Progress and placement-generated plan

The hard-coded `WEEK_MAP` is removed. `buildPlan()` uses `FD_INDEX.weeks` and each week's `focusCategories`.

New `cw_plan_v1` shape:

```json
{
  "pathId": "resident-four-week",
  "weekCount": 4,
  "generatedAt": "2026-08-18T12:00:00.000Z",
  "shelfDate": "",
  "weeks": [
    {
      "week": 1,
      "title": "Week 1 — Foundations and safety",
      "allCats": ["safety", "neurocog", "substance"],
      "focus": ["safety"]
    }
  ]
}
```

Rules:

- Keep the existing storage key `cw_plan_v1`; add `pathId` and `weekCount` to its value.
- Keep `cw_progress_v1`, question-bank history, placement answers, completion state, and all other storage keys unchanged.
- Plan headings and Progress links say `4-week` or `6-week` from the active path.
- A plan card's `Open Week N` action opens that week on the Front Door Path surface. It does not depend on MS3-only `weekN.md` pages.
- Weak-area selection remains an emphasis overlay. It does not reorder or remove weeks.
- A stored plan is valid only when its path ID, count, week numbers, and focus-category arrays match the active path contract.
- If a legacy or mismatched plan exists and a valid `cw_pretest_v1` placement record exists, rebuild and replace only `cw_plan_v1` from current local mastery plus the active path.
- If regeneration is impossible, do not guess. Show the placement entry state so the learner can retake it.
- Corrupt local storage must not blank the app.

## Retired legacy learning-path page

The standalone `01_Six_Week_Curriculum/learning-path.html` was already retired before this design's `origin/main` baseline. It is absent from the current source tree and from both built sites.

- Do not restore or recreate it.
- The shared Front Door Path remains the only learning-path interface.
- A build test preserves its absence from both sites so an obsolete parallel source of week structure cannot return unnoticed.
- The six inherited `weekN.md` pages may remain hidden in resident navigation for current build/progress compatibility; removing them belongs to the broader audience-data-model migration and is outside this feature.

## Failure behavior

The feature fails closed at two boundaries:

### Build time

Abort with an actionable error when:

- either site path is absent or has the wrong stable ID;
- MS3 is not exactly six weeks or resident is not exactly four;
- numbers are non-integer, duplicated, gapped, or out of order;
- a title, theme, focus category, ref, or kind is malformed;
- a ref is unavailable on its target site;
- a ref's declared kind disagrees with final navigation; or
- projection would expose both site paths to one browser payload.

### Browser runtime

- Missing or empty projected path data displays the existing Front Door fallback instead of throwing.
- Invalid selected or derived current-week data shows the week-setup state.
- Invalid `viewWeek` selects the first available week for browsing only.
- Invalid plan data regenerates only when the existing placement record makes that safe; otherwise it returns to placement.
- No recovery path clears `cw_progress_v1`, question history, or unrelated local storage.

## Accessibility and usability

- Reuse the existing semantic buttons, focus movement, route announcements, modal behavior, and 44-pixel mobile targets.
- Dynamic copy is visible text, not color-only state.
- Four resident tiles must preserve the current grid's keyboard order and fit at the existing mobile breakpoints without horizontal scrolling.
- Path rows retain their current completion/current/selected distinctions and accessible labels.
- The implementation adds no audience choice, onboarding step, account, telemetry, or server storage.

## Verification contract

Implementation is complete only when all of the following pass from the isolated worktree.

### Data and projection tests

- Schema accepts the exact two-path model and rejects wrong counts, missing sites, extra sites, bad IDs, bad categories, and malformed items.
- `validate_curriculum.py` checks each path against its own site's shipped set and reports site/path/week in every error.
- Validator fixtures cover resident-only refs, refs available only on the other site, duplicate/gapped weeks, duplicate refs within a week, and kind mismatches.
- `test_frontdoor_catalog.py` proves that MS3 receives only six weeks and resident only four, that the source object is not mutated, and that all path refs receive final title/governance metadata.

### Browser-unit tests

- `fdBuildIndex` propagates path metadata and focus categories.
- Setup renders exactly 6 or 4 tiles from injected data.
- Today previews the actual next week and uses `Review Week N` at the path end.
- Path headings/counts and invalid `viewWeek` behavior are dynamic.
- Rotation start/date calculations cover first day, weekly boundaries, last day, post-rotation, leap/month boundaries, and both path lengths.
- Exam fallback anchors to the final Friday for both counts; an explicit exam date still wins.
- Placement plans use canonical focus categories, carry the path ID/count, render dynamic labels, and open Path weeks.
- Legacy, mismatched, and corrupt plan fixtures exercise regeneration and placement fallback without deleting progress.

### Built-site and interaction tests

- Build both sites with `build_and_check.sh ms3` and `build_and_check.sh res`.
- Assert the built MS3 payload has `ms3-six-week`, six weeks, and no resident path data.
- Assert the built resident payload has `resident-four-week`, four weeks, and no MS3 path data.
- Assert the retired `tools/learning-path.html` is absent from both builds.
- Exercise first-run setup, Today, Path, Progress, placement results, and stored-plan restoration on both site builds.
- Exercise keyboard navigation and mobile-width rendering for the four- and six-tile setup screens.
- Run all Python validators, `node --test tests/*.test.mjs`, and the Playwright smoke suite.
- If learner-visible screenshot baselines change, refresh them only through the Ubuntu/Chromium workflow; do not record macOS baselines.

## Expected implementation surface

Likely modified files:

- `curriculum.json`
- `curriculum.schema.json`
- `13_Faculty_Resources/_automation/validate_curriculum.py`
- `13_Faculty_Resources/_automation/test_validate_curriculum.py`
- `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py`
- `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js`
- `13_Faculty_Resources/_automation/site_build/spa_index.html`
- focused `tests/*.test.mjs` and `tests/smoke/*.spec.js` coverage

No new production file is required. The implementation plan may narrow this list after test-first seams are chosen, but it may not widen the product scope without approval.

## Explicit non-goals and protected boundaries

- No clinical-prose, medication-dose, legal-guidance, evidence-claim, question-bank, or case-content edits.
- No faculty-review, governance-ledger, or attestation-state changes.
- No claims that resident content has received new faculty approval.
- No change to the content or availability of `one-patient-six-weeks.html` on MS3; on resident it remains optional library content.
- No deletion of hidden inherited resident pages in this feature.
- No navigation/manifest architecture migration. The broader `2026-07-27-audience-as-a-data-model.md` plan remains separate.
- No local-storage key rename, account system, server-side learner record, PHI collection, telemetry, deployment, or merge.
- No edits to `CLAUDE.md` or `AGENTS.md` are expected because the build commands and contributor contracts do not change.

## Acceptance summary

A learner opening the MS3 site sees and receives one coherent six-week experience. A learner opening the resident site sees and receives one coherent four-week experience. The distinction comes from build-projected curriculum data, not branding checks or duplicated browser constants. Existing progress is preserved, stale personalized plans migrate safely, invalid path data fails before deploy, and no clinical or governance content changes as part of the feature.
