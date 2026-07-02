# 02 Clinical Skills And Documentation

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

Grouped source bundle for NotebookLM. It concatenates safe Markdown/text material from the listed library sections while preserving source paths.

PHI rule: this source intentionally excludes known patient-identifying files, audit artifacts with MRN-like paths, source pointer files, and case-specific filenames. Use synthetic or de-identified examples only.

---



---

## Source: `02_Clinical_Skills/Case_Formulation/_source/2026-03-14-mentalization-subsystem-implementation.md`

# Mentalization Subsystem Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-surface mentalization subsystem (clinician formulation tool, family practice tool, PWA module) integrated into the ReConnect tools-suite architecture.

**Architecture:** Two new single-file HTML tools + one PWA JSON module + one shared JS library + ~70 database records. All surfaces share a common `mentalizationContext` RCContext object and emit signals through RCSignals. The shared library (`rc-mentalization.js`) provides computation and validation but not content - content comes from the `mentalizing_exercises` database via `rc-data.js`.

**Tech Stack:** React 18 (CDN UMD), vanilla CSS with `--rc-*` tokens, esbuild JSX precompilation, IndexedDB data caching, BroadcastChannel cross-tool context, Node.js QA harnesses.

**Spec:** `docs/superpowers/specs/2026-03-14-mentalization-subsystem-design.md`

---

## 1. Implementation Architecture

### Data Flow

```
                        MASTER DATABASE
  databases/core/ -> mentalizing_exercises (17th database key)
              |                              |
    rc-data.js load()                build_mentalization_pwa_module.py
              |                              |
              v                              v
     rc-mentalization.js           mentalization_module.json
     (filter, compute,             (Schema A, self-contained
      validate, write)              offline-first)
        |      |                         |
        v      v                         v
   Compass   Family                PWA Module
   (clinic)  (family)             (post-discharge)
        |      |                         |
        | writes | reads                 | standalone
        v      v                         |
   mentalizationContext                  |
   (RCContext)                           |
        |      |                         |
        v      v                         v
              RCSignals (10 signal types)
    -> Relational State Map, Analytics Dashboard
```

### Component Interactions

| From | To | Mechanism | Data |
|------|----|-----------|------|
| Master DB | Compass | rc-data.js `load(['mentalizing_exercises'])` | Pattern card definitions |
| Master DB | Family tool | rc-data.js `load(['mentalizing_exercises'])` | Exercise content |
| Master DB | PWA module | build_mentalization_pwa_module.py (build-time) | Embedded in JSON |
| Compass | Family tool | RCContext `mentalizationContext` | Formulation, route, status bands |
| Compass | Relational State Map | RCSignals (3 types) | Formulation events |
| Family tool | Relational State Map | RCSignals (5 types) | Practice events |
| PWA module | Signal buffer | RCSignals (2 types) | Offline-safe practice events |
| rc-mentalization.js | Compass | Full API | Computation, validation, context I/O |
| rc-mentalization.js | Family tool | Reader + filter | Context reading, exercise filtering |

---

## 2. File-Level Change Plan

### New Files (14)

| File | Type | Sprint |
|------|------|--------|
| `tools-suite/shared-libs/rc-mentalization.js` | Shared library | 1 |
| `tools-suite/tools/Mentalization_Compass.html` | HTML shell | 1 |
| `tools-suite/tools/generated/Mentalization_Compass.app.jsx` | JSX source | 1 |
| `tools-suite/tools/generated/Mentalization_Compass.app.js` | Compiled bundle | 1 |
| `scripts/precompile_mentalization_compass.sh` | Build script | 1 |
| `tools-suite/qa/qa_harness_mentalization_compass.js` | QA harness | 1 |
| `tools-suite/tools/Family_Mentalizing.html` | HTML shell | 2 |
| `tools-suite/tools/generated/Family_Mentalizing.app.jsx` | JSX source | 2 |
| `tools-suite/tools/generated/Family_Mentalizing.app.js` | Compiled bundle | 2 |
| `scripts/precompile_family_mentalizing.sh` | Build script | 2 |
| `tools-suite/qa/qa_harness_family_mentalizing.js` | QA harness | 2 |
| `pwa/data/mentalization_module.json` | PWA module | 3 |
| `databases/maintenance/build_mentalization_pwa_module.py` | Build script | 3 |
| `tools-suite/qa/qa_harness_mentalization_pwa.js` | QA harness | 3 |

### Modified Files (5)

| File | Change | Sprint |
|------|--------|--------|
| `databases/maintenance/database_registry.py` | Register `mentalizing_exercises` database | 1 |
| `databases/maintenance/schema_validator.py` | Add validation rules for mentalizing_exercises records | 1 |
| `tools-suite/shared-libs/rc-data.js` | Add `'mentalizing_exercises'` to `ALL_KEYS` array (line ~52), update comment from "All 16" to "All 17" | 1 |
| `tools-suite/build_netlify.py` | Add `build_mentalization_pwa_module.py` invocation to stage 6 (PWA data copy). Verify new tools auto-discovered in copy stages; if not, register Mentalization_Compass.html and Family_Mentalizing.html explicitly. | 3 |
| `pwa/config/precache_manifest.json` | Regenerated by `scripts/generate_precache_manifest.py` after adding PWA module | 3 |

### Content Authoring (Sprint 2-3, requires clinical input)

~70 exercise records authored into master database under `mentalizing_exercises` key via the rc-database-steward workflow. Categories per the spec's database schema enum: perspective_taking (12-16, includes marked affect examples tagged with `situation_tag: "calm"` and `difficulty: "intermediate"`), pause_and_wonder (8-10), repair (6-8), communication (8-10), psychoed (6-8, includes daily prompts for PWA with `surface: "pwa"`). The 14 daily prompts and clinically nuanced vignettes require Josh's input - flag as a distinct content task. **Note:** Content authoring (T-MZ-019) is the most likely schedule risk since Sprints 2-3 depend on it and it requires clinical time.

---

## 3. Shared Infrastructure

### rc-mentalization.js

**Responsibility:** Computation, validation, and context I/O for the mentalization subsystem. Does NOT contain content - content is loaded from the database.

**Exports (via `window.RCMentalization`):**

| Export | Type | Used By |
|--------|------|---------|
| `OBSERVED_PATTERNS` | Object (5 situation groups, each with card schema: id, label, description, hidden MBT tags). These are structural definitions embedded in the lib - not clinical content from the database. ~20 card schemas, ~3 KB. | Compass Tab 1 |
| `FORMULATION_SCHEMA` | Object (6 field definitions) | Compass Tab 2 |
| `INTERVENTION_ROUTES` | Object (L2/L3/L4 with criteria) | Compass Tab 3 |
| `computeStatusBands(patterns)` | Function -> descriptive labels | Compass Tab 2 |
| `generateFormulationNarrative(formulation)` | Function -> string | Compass Tab 2 |
| `filterExercises(route, ageGroup)` | Function -> filtered records | Family tool |
| `writeMentalizationContext(data)` | Function -> void | Compass |
| `readMentalizationContext()` | Function -> object or null | Family tool |
| `validateMentalizationContext(obj)` | Function -> { valid, errors } | QA harnesses |
| `validateExerciseRecord(record)` | Function -> { valid, errors } | QA harnesses |
| `BANNED_TERMS` | Array of strings | QA harnesses |

### mentalizing_exercises Database

New 17th database key in master database. Each record has: `id`, `category`, `title`, `family_safe_label`, `body` (category-specific), `rss_layer`, `situation_tag`, `difficulty`, `age_group`, `mbt_dimension_tag` (internal), `pre_mentalizing_mode_tag` (internal), `surface`, `word_count`, `reading_level`.

### Signal Contracts

10 signal types across 3 surfaces. All follow existing `rc_signal_events_v1` schema with `sourceTool`, `rssLayer`, `signalType`, `signalValue`, `intensity`, `metadata`. Full contract table in spec Section 4.

### mentalizationContext (RCContext)

Single structured object with 6 top-level keys: `observedPatterns`, `formulation`, `statusBands`, `interventionRoute`, `dischargeSummary`, `prfq`. Written by Compass, read by Family tool, ignored by PWA. Full schema in spec Section 4.

---

## 4. Sprint Plan

### Sprint 1: Foundation + Mentalization Compass

**Goal:** Shared library, database registration, Compass HTML tool with all 4 tabs, QA harness.

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1.1 | Create rc-mentalization.js with OBSERVED_PATTERNS, FORMULATION_SCHEMA, BANNED_TERMS, context I/O, and validators | None |
| 1.2 | Register mentalizing_exercises in database_registry.py and schema_validator.py | None |
| 1.3 | Add mentalizing_exercises to rc-data.js ALL_KEYS | 1.2 |
| 1.4 | Author seed exercise records (~10 starter records) via rc-database-steward | 1.2 |
| 1.5 | Create Mentalization_Compass.html shell + app.jsx skeleton with 4-tab navigation | 1.1 |
| 1.6 | Create precompile_mentalization_compass.sh | 1.5 |
| 1.7 | Create qa_harness_mentalization_compass.js | 1.5 |
| 1.8 | Implement Tab 1 (Observed Interaction Patterns) with pattern card selection | 1.1, 1.5 |
| 1.9 | Implement Tab 2 (Formulation) with structured fields, status bands, narrative generator | 1.8 |
| 1.10 | Implement Tab 3 (Intervention Route) with RSS-layered recommendations | 1.9 |
| 1.11 | Implement Tab 4 (Discharge Summary) with all 8 fields | 1.10 |
| 1.12 | Wire RCContext writes (mentalizationContext) and signal emission | 1.11 |

### Sprint 2: Family Mentalizing Tool

**Goal:** Family-facing practice tool with 4 modes, standalone + routed paths, localStorage persistence.

| Task | Description | Dependencies |
|------|-------------|-------------|
| 2.1 | Create Family_Mentalizing.html shell + app.jsx skeleton with mode navigation | 1.1 |
| 2.2 | Create precompile_family_mentalizing.sh | 2.1 |
| 2.3 | Create qa_harness_family_mentalizing.js (including family-safe language scan) | 2.1 |
| 2.4 | Implement Mode 1 (What's Behind the Behavior) with vignette rendering | 2.1, 1.4 |
| 2.5 | Implement Mode 2 (Pause and Wonder) with standard + high-arousal paths | 2.1 |
| 2.6 | Implement Mode 3 (Repair Together) with safety rule and fill-in templates | 2.1 |
| 2.7 | Implement Mode 4 (Try Saying It This Way) with phrase pairs and starring | 2.1 |
| 2.8 | Wire RCContext reading (mentalizationContext) for clinician-routed path | 2.4, 1.12 |
| 2.9 | Wire signal emission (5 signal types) | 2.4-2.7 |
| 2.10 | Implement "Take This Home" discharge export | 2.7 |
| 2.11 | Author remaining exercise records to reach ~70 total (clinical input needed) | 1.4 |

### Sprint 3: PWA Module + Discharge Integration

**Goal:** Offline-first PWA module, build pipeline, precache integration.

| Task | Description | Dependencies |
|------|-------------|-------------|
| 3.1 | Create build_mentalization_pwa_module.py (database -> Schema A transformation) | 1.4 |
| 3.2 | Run build script to generate mentalization_module.json | 3.1 |
| 3.3 | Regenerate precache_manifest.json via scripts/generate_precache_manifest.py | 3.2 |
| 3.4 | Create qa_harness_mentalization_pwa.js | 3.2 |
| 3.5 | Verify PWA module renders in Recovery Companion | 3.2 |
| 3.6 | Author 14 daily practice prompts (clinical input needed) | None |
| 3.7 | Modify build_netlify.py stage 6 to invoke build_mentalization_pwa_module.py | 3.1 |
| 3.8 | Verify offline behavior (service worker cache, IndexedDB fallback) | 3.3 |

### Sprint 4: Signal Integration + Polish

**Goal:** End-to-end signal flow, Relational State Map visibility, cross-tool workflow testing.

| Task | Description | Dependencies |
|------|-------------|-------------|
| 4.1 | Verify all 10 signals appear in Relational State Map | 1.12, 2.9 |
| 4.2 | Test full clinical workflow: Compass -> Family tool -> PWA | All |
| 4.3 | Test standalone Family tool path (no Compass formulation) | 2.8 |
| 4.4 | Run all 3 QA harnesses, fix failures | All |
| 4.5 | Verify build_netlify.py correctly copies all new files to _site/ | All |
| 4.6 | Bundle budget check (Compass < 40 KB, Family < 45 KB, rc-mentalization.js < 20 KB) | All |

---

## 5. First Pull Request Scope

### PR #1: "feat(mentalization): shared infrastructure + Compass skeleton"

**Branch:** `feat/mentalization-compass-skeleton`

**Scope:** The minimal viable foundation - shared library, database registration, Compass HTML shell with tab navigation, QA harness stub. NO full tab logic yet (that comes in subsequent commits on the same branch).

**Files created:**

| File | Content |
|------|---------|
| `tools-suite/shared-libs/rc-mentalization.js` | OBSERVED_PATTERNS, FORMULATION_SCHEMA, INTERVENTION_ROUTES, BANNED_TERMS, context I/O stubs, validators |
| `tools-suite/tools/Mentalization_Compass.html` | HTML shell: 3 CSS imports, React 18 CDN, 7 shared lib scripts, skip link, root div, generated bundle ref |
| `tools-suite/tools/generated/Mentalization_Compass.app.jsx` | React skeleton: 4-tab navigation (Observed Patterns / Formulation / Intervention Route / Discharge Summary), placeholder content per tab, localStorage persistence of selected tab |
| `tools-suite/tools/generated/Mentalization_Compass.app.js` | Precompiled from JSX via esbuild |
| `scripts/precompile_mentalization_compass.sh` | esbuild script: jsx loader, React.createElement factory, es2019 target |
| `tools-suite/qa/qa_harness_mentalization_compass.js` | QA stub: file existence, RC-META tag, CSS/JS imports, skip link, no runtime Babel, bundle uses createRoot |

**Files modified:**

| File | Change |
|------|--------|
| `databases/maintenance/database_registry.py` | Add `mentalizing_exercises` entry |
| `databases/maintenance/schema_validator.py` | Add validation rules for new database |
| `tools-suite/shared-libs/rc-data.js` | Add `'mentalizing_exercises'` to ALL_KEYS (17th key), update comment |

**What this PR does NOT include:**
- No full Tab 1-4 implementation (just navigation + placeholders)
- No exercise records in master database yet
- No Family Mentalizing tool
- No PWA module
- No signal emission beyond stubs

**Acceptance test:**
1. `node tools-suite/qa/qa_harness_mentalization_compass.js` passes
2. Compass opens in browser, shows 4 tabs with placeholder content
3. Tab selection persists across page reload (localStorage)
4. `rc-mentalization.js` loads without errors (`window.RCMentalization` exists)
5. `RCMentalization.OBSERVED_PATTERNS.duringConflict` returns 4 card schemas (embedded in lib, no database needed)
6. `RCMentalization.BANNED_TERMS` returns array of banned clinical terms
7. `RCMentalization.validateMentalizationContext({})` returns `{ valid: false, errors: [...] }`

---

## 6. Acceptance Criteria

### rc-mentalization.js

- [ ] `window.RCMentalization` exists after script load
- [ ] `OBSERVED_PATTERNS` contains 5 situation groups with 4 card schemas each (20 card schemas total). These are structural definitions embedded in the lib (id, label, description, MBT tags), not database content.
- [ ] `FORMULATION_SCHEMA` contains 6 field definitions
- [ ] `INTERVENTION_ROUTES` contains L2, L3, L4 entries with criteria and readiness indicators
- [ ] `computeStatusBands([])` returns object with 4 keys, all set to lowest value
- [ ] `computeStatusBands(allPatterns)` returns descriptive labels (never numbers)
- [ ] `generateFormulationNarrative({...})` returns a coherent paragraph
- [ ] `writeMentalizationContext(data)` writes to RCContext
- [ ] `readMentalizationContext()` returns null when no context exists
- [ ] `readMentalizationContext()` returns structured object after write
- [ ] `validateMentalizationContext({})` returns `{ valid: false }`
- [ ] `validateExerciseRecord({})` returns `{ valid: false }`
- [ ] `BANNED_TERMS` contains at least: mentalizing, reflective functioning, pre-mentalizing, teleological, psychic equivalence, hypermentalizing, biobehavioral switch, MBT, RF, PRFQ
- [ ] File size less than 20 KB
- [ ] No MBT terminology in any exported function name or return value

### Mentalization Compass

- [ ] RC-META tag: `tool="Mentalization Compass" data-sync="mentalizing_exercises"`
- [ ] Loads all 7 shared libs in correct order
- [ ] Tab 1 renders 5 situation groups with selectable pattern cards
- [ ] Tab 1 supports multi-select and free-text notes per group
- [ ] Tab 2 renders 6 structured fields, all editable
- [ ] Tab 2 shows 4 soft status bands (descriptive labels only)
- [ ] Tab 2 generates editable narrative formulation
- [ ] Tab 3 shows L2/L3/L4 intervention recommendations with entry criteria
- [ ] Tab 3 exercises are selectable by clinician
- [ ] Tab 4 renders all 8 discharge fields
- [ ] Tab 4 includes recovery signals and re-collapse contexts
- [ ] PRFQ section hidden by default, collapsible, includes disclaimer
- [ ] Emits `formulation_completed` signal on Tab 2 completion
- [ ] Emits `intervention_route_selected` signal on Tab 3 selection
- [ ] Emits `discharge_rf_summary` signal on Tab 4 finalization
- [ ] Writes complete `mentalizationContext` to RCContext
- [ ] QA harness passes: `node tools-suite/qa/qa_harness_mentalization_compass.js`
- [ ] Skip link present, ARIA landmarks present
- [ ] No runtime Babel

### Family Mentalizing

- [ ] RC-META tag: `tool="Family Mentalizing" data-sync="mentalizing_exercises"`
- [ ] Loads all 7 shared libs
- [ ] Mode 1 renders vignettes with multiple interpretations (never "correct" answer)
- [ ] Mode 1 vignettes tagged by age_group and situation_tag
- [ ] Mode 2 standard path: pause -> name -> wonder (3 steps)
- [ ] Mode 2 high-arousal path: pause -> name -> stabilize (triggered by "I can't think about them")
- [ ] Mode 3 displays safety rule at entry ("after the heat has come down")
- [ ] Mode 3 provides fill-in-the-blank repair templates
- [ ] Mode 4 shows phrase pairs with starring capability
- [ ] Standalone path works: all modes available when mentalizationContext is null
- [ ] Clinician-routed path works: highlighted mode matches interventionRoute.currentLayer
- [ ] Emits all 5 signal types
- [ ] localStorage persists: fm_completed_exercises, fm_saved_repairs, fm_practice_history, fm_favorite_scripts
- [ ] "Take This Home" generates printable discharge summary
- [ ] Family-safe language scan passes: no BANNED_TERMS in rendered output
- [ ] "Never implies certainty" scan passes: interpretations use "might," "may," "one possibility"
- [ ] Crisis help accessible (footer/affordance)
- [ ] QA harness passes: `node tools-suite/qa/qa_harness_family_mentalizing.js`

### PWA Module

- [ ] Valid Schema A JSON structure with 6 sections
- [ ] contentType field present on all subsections (prose, exercise, script, daily_prompt)
- [ ] 14 daily prompts in sections[4]
- [ ] communityResources includes 988 and Crisis Text Line
- [ ] All text at or below Flesch-Kincaid grade 8
- [ ] No RCContext references in module content
- [ ] Family-safe language scan passes on all text
- [ ] Module precached by service worker
- [ ] Renders correctly in Recovery Companion PWA
- [ ] QA harness passes: `node tools-suite/qa/qa_harness_mentalization_pwa.js`

### Database Integration

- [ ] mentalizing_exercises registered in database_registry.py
- [ ] schema_validator.py validates required fields (id, category, title, family_safe_label, rss_layer, surface)
- [ ] rc-data.js ALL_KEYS contains 17 keys including mentalizing_exercises
- [ ] `RCData.load(['mentalizing_exercises'])` returns exercise records
- [ ] build_mentalization_pwa_module.py transforms records to Schema A
- [ ] build_netlify.py stage 6 invokes build_mentalization_pwa_module.py before PWA data copy
- [ ] build_netlify.py copies all new files to _site/ (both tool HTML + generated bundles + shared libs)

### Cross-Surface Integration

- [ ] Compass formulation -> Family tool receives via RCContext
- [ ] Family tool works standalone when Compass not used
- [ ] PWA module works offline with no RCContext
- [ ] All 10 signals emit correctly and appear in localStorage buffer
- [ ] Relational State Map can display mentalization signals
- [ ] Full workflow: Compass -> Family -> PWA produces coherent clinical arc

---

## 7. Prioritized Ticket List

| Priority | Ticket | Sprint | Dependencies | Effort |
|----------|--------|--------|-------------|--------|
| P0 | T-MZ-001: Create rc-mentalization.js shared library | 1 | None | L |
| P0 | T-MZ-002: Register mentalizing_exercises database | 1 | None | S |
| P0 | T-MZ-003: Add mentalizing_exercises to rc-data.js ALL_KEYS | 1 | T-MZ-002 | S |
| P0 | T-MZ-004: Create Mentalization Compass HTML shell + skeleton | 1 | T-MZ-001 | M |
| P0 | T-MZ-005: Create precompile + QA harness for Compass | 1 | T-MZ-004 | S |
| P1 | T-MZ-006: Implement Compass Tab 1 (Observed Patterns) | 1 | T-MZ-004 | M |
| P1 | T-MZ-007: Implement Compass Tab 2 (Formulation) | 1 | T-MZ-006 | L |
| P1 | T-MZ-008: Implement Compass Tab 3 (Intervention Route) | 1 | T-MZ-007 | M |
| P1 | T-MZ-009: Implement Compass Tab 4 (Discharge Summary) | 1 | T-MZ-008 | M |
| P1 | T-MZ-010: Wire Compass signals + RCContext | 1 | T-MZ-009 | M |
| P1 | T-MZ-011: Create Family Mentalizing HTML shell + skeleton | 2 | T-MZ-001 | M |
| P1 | T-MZ-012: Create precompile + QA harness for Family tool | 2 | T-MZ-011 | S |
| P1 | T-MZ-013: Implement Family Mode 1 (Behind the Behavior) | 2 | T-MZ-011, seed data | M |
| P1 | T-MZ-014: Implement Family Mode 2 (Pause and Wonder) | 2 | T-MZ-011 | M |
| P1 | T-MZ-015: Implement Family Mode 3 (Repair Together) | 2 | T-MZ-011 | M |
| P1 | T-MZ-016: Implement Family Mode 4 (Try Saying It This Way) | 2 | T-MZ-011 | S |
| P1 | T-MZ-017: Wire Family tool RCContext reading + signals | 2 | T-MZ-013-016, T-MZ-010 | M |
| P1 | T-MZ-018: Implement "Take This Home" discharge export | 2 | T-MZ-016 | M |
| P2 | T-MZ-019: Author ~70 exercise records (clinical input) | 2-3 | T-MZ-002 | XL |
| P2 | T-MZ-020: Create build_mentalization_pwa_module.py | 3 | T-MZ-019 | M |
| P2 | T-MZ-021: Generate mentalization_module.json | 3 | T-MZ-020 | S |
| P2 | T-MZ-022: Create PWA QA harness | 3 | T-MZ-021 | S |
| P2 | T-MZ-023: Regenerate precache manifest | 3 | T-MZ-021 | S |
| P2 | T-MZ-024: Verify PWA offline behavior | 3 | T-MZ-023 | M |
| P3 | T-MZ-025: End-to-end signal verification | 4 | All | M |
| P3 | T-MZ-026: Full clinical workflow test | 4 | All | L |
| P3 | T-MZ-027: Bundle budget verification | 4 | All | S |
| P3 | T-MZ-028: Build pipeline verification | 4 | All | S |

**Effort key:** S = small (< 1 hr), M = medium (1-3 hrs), L = large (3-6 hrs), XL = extra large (6+ hrs, needs clinical input)

---

## 8. Dependency Map

```
T-MZ-001 (rc-mentalization.js)
  |-- T-MZ-004 (Compass shell)
  |     |-- T-MZ-005 (precompile + QA)
  |     |-- T-MZ-006 (Tab 1)
  |     |     +-- T-MZ-007 (Tab 2)
  |     |           +-- T-MZ-008 (Tab 3)
  |     |                 +-- T-MZ-009 (Tab 4)
  |     |                       +-- T-MZ-010 (signals + context)
  |     |                             +-- T-MZ-017 (Family context)
  |     |                                   +-- T-MZ-025 (e2e signals)
  |     +-- T-MZ-026 (full workflow)
  +-- T-MZ-011 (Family shell)
        |-- T-MZ-012 (precompile + QA)
        |-- T-MZ-013 (Mode 1) --- needs T-MZ-019 (exercise records)
        |-- T-MZ-014 (Mode 2)
        |-- T-MZ-015 (Mode 3)
        |-- T-MZ-016 (Mode 4)
        |     +-- T-MZ-018 (Take This Home)
        +-- T-MZ-017 (context + signals)

T-MZ-002 (database registration)
  |-- T-MZ-003 (ALL_KEYS)
  +-- T-MZ-019 (exercise records)
        +-- T-MZ-020 (PWA build script)
              +-- T-MZ-021 (PWA module)
                    |-- T-MZ-022 (PWA QA)
                    |-- T-MZ-023 (precache)
                    |     +-- T-MZ-024 (offline verify)
                    +-- T-MZ-026 (full workflow)

T-MZ-027 (bundle budgets) <- All implementation complete
T-MZ-028 (build pipeline) <- All implementation complete
```

**Critical path:** T-MZ-001 -> T-MZ-004 -> T-MZ-006 -> T-MZ-007 -> T-MZ-008 -> T-MZ-009 -> T-MZ-010 -> T-MZ-017 -> T-MZ-025 -> T-MZ-026

**Parallelizable:**
- T-MZ-001 and T-MZ-002 can run in parallel (no dependency)
- T-MZ-013, T-MZ-014, T-MZ-015, T-MZ-016 can run in parallel (independent modes)
- T-MZ-019 (content authoring) can start as soon as T-MZ-002 completes
- T-MZ-005 and T-MZ-006 can run in parallel (QA stub vs Tab 1 implementation)

---

## 9. First PR Exact Scope

### PR #1: `feat(mentalization): shared infrastructure + Compass skeleton`

**Branch:** `feat/mentalization-compass-skeleton`

**What ships:**
1. `rc-mentalization.js` with full OBSERVED_PATTERNS, FORMULATION_SCHEMA, INTERVENTION_ROUTES, BANNED_TERMS, context read/write, and validators
2. `Mentalization_Compass.html` shell with correct imports
3. `Mentalization_Compass.app.jsx` skeleton with 4-tab navigation + placeholder content
4. `Mentalization_Compass.app.js` precompiled bundle
5. `precompile_mentalization_compass.sh`
6. `qa_harness_mentalization_compass.js` (file existence, runtime contract, RC-META)
7. Database registration in `database_registry.py` and `schema_validator.py`
8. `mentalizing_exercises` added to `rc-data.js` ALL_KEYS

**What does NOT ship:**
- No Tab 1-4 full implementation (just navigation skeleton)
- No exercise records in master database
- No Family Mentalizing tool
- No PWA module
- No signal emission beyond console.log stubs

**PR checklist:**
- [ ] `node tools-suite/qa/qa_harness_mentalization_compass.js` exits 0
- [ ] `bash scripts/precompile_mentalization_compass.sh` succeeds
- [ ] Compass opens in browser with 4 navigable tabs
- [ ] `window.RCMentalization` is accessible in console
- [ ] `RCMentalization.OBSERVED_PATTERNS.duringConflict` returns 4 cards
- [ ] `RCMentalization.BANNED_TERMS.length >= 10`
- [ ] `RCMentalization.validateMentalizationContext({})` returns `{ valid: false }`
- [ ] No runtime Babel in HTML source
- [ ] Skip link present and functional
- [ ] Tab selection persists in localStorage


---

## Source: `02_Clinical_Skills/Differential_Diagnosis/inpatient_differential_scaffolds.md`

# Differential Diagnosis Scaffolds - Adult Inpatient Psychiatry

> **Review status:** AI-drafted, evidence-anchored - **pending Dr. Moss's review/attestation before learner use.**

**For:** MS3 on the unit. **Use:** when a patient presents with one of the eight core syndromes below, run the scaffold - *medical mimic first, then the psychiatric differential, then the first move.* Fictional composites only; no PHI.

> **The one rule that prevents most errors:** a new or acutely changed psychiatric presentation is a **medical workup until proven otherwise.** Vitals, glucose, basic labs, tox, and a focused neuro exam come before you anchor on a psychiatric diagnosis - especially in the old, the medically ill, and the first-episode.

---

## 1. New psychosis (hallucinations, delusions, disorganization)
- **Can't-miss mimics:** delirium, substance intoxication/withdrawal (stimulants, cannabis, alcohol/benzo withdrawal), CNS infection, autoimmune/limbic encephalitis, seizure (postictal), steroid/medication-induced, thyroid, B12.
- **Psychiatric DDx:** primary psychotic disorder (schizophrenia spectrum), mood disorder with psychotic features (depression or mania), brief psychotic disorder, substance-induced.
- **First move:** confirm orientation/attention (screen delirium), tox screen, basic labs  neuroimaging for first-episode; *do not* assume primary psychosis in a first episode without a medical workup. -> see the catatonia guidance if mute/immobile.

## 2. Agitation / acute behavioral disturbance
- **Can't-miss mimics:** delirium, hypoglycemia, hypoxia, intoxication/withdrawal, pain, head injury, NMS/serotonin syndrome, akathisia (drug-induced restlessness mistaken for anxiety).
- **Psychiatric DDx:** mania, psychosis, intoxication, personality/impulsivity, trauma response.
- **First move:** ensure team/exit safety; vitals + glucose; verbal de-escalation before PRN. -> the agitation & restraint guidance + the Violence-Risk tool.

## 3. Depressed / suicidal
- **Can't-miss mimics:** hypothyroidism, anemia, occult substance use, medication effects (e.g., interferon, steroids), pancreatic/CNS disease, pseudodementia in elders.
- **Psychiatric DDx:** MDD ( psychotic features), bipolar depression (always screen for past mania -> changes treatment), adjustment disorder, persistent depressive disorder, demoralization.
- **First move:** explicit C-SSRS + collaborative safety plan; screen for bipolarity (MDQ) before starting an antidepressant. -> Suicide tools; MSE module.

## 4. Manic / elevated / irritable
- **Can't-miss mimics:** stimulant or steroid effect, hyperthyroidism, frontal/CNS lesion, delirium, antidepressant-induced switch.
- **Psychiatric DDx:** bipolar I/II, schizoaffective, substance-induced mood disorder.
- **First move:** protect sleep, hold antidepressants, assess capacity/risk; collateral is essential (insight is often low).

## 5. Mute / immobile / minimally responsive (think CATATONIA)
- **Can't-miss mimics:** NMS, nonconvulsive status, stroke, locked-in, akinetic mutism, severe parkinsonism.
- **Psychiatric DDx:** catatonia (mood, psychotic, autistic, or medical), severe depression, malingering (diagnosis of exclusion).
- **First move:** Bush-Francis screen + **lorazepam challenge** (diagnostic and therapeutic); **avoid antipsychotics** until catatonia excluded (NMS risk). -> the catatonia guidance.

## 6. Confused / fluctuating / "not themselves" (think DELIRIUM)
- **Can't-miss mimics:** *delirium is the mimic* - infection (UTI/pneumonia), metabolic, hypoxia, drugs (anticholinergics, benzos, opioids), withdrawal, urinary retention/constipation in elders.
- **Psychiatric DDx:** dementia (chronic, non-fluctuating), depression (pseudodementia), primary psychosis (rare as new onset in elders).
- **First move:** attention testing (months backward), find and treat the cause, deprescribe deliriogenic meds, non-pharm first. -> the delirium guidance.

## 7. Anxiety / panic
- **Can't-miss mimics:** arrhythmia, PE, hyperthyroidism, hypoglycemia, asthma, pheochromocytoma, caffeine/stimulant, alcohol/benzo withdrawal, akathisia.
- **Psychiatric DDx:** panic disorder, GAD, PTSD, OCD, anxious depression, substance-induced.
- **First move:** rule out the cardiopulmonary/withdrawal mimics; favor SSRIs + skills over standing benzodiazepines (dependence, falls, SUD).

## 8. Substance intoxication / withdrawal
- **Can't-miss mimics:** co-occurring head injury, infection, hepatic encephalopathy, Wernicke's (give **thiamine before glucose**), polysubstance masking.
- **Psychiatric DDx:** primary mood/psychotic disorder co-occurring with use; substance-induced disorders.
- **First move:** CIWA-Ar / COWS, withdrawal protocol per institution, naloxone education at discharge. -> the Withdrawal (CIWA-Ar/COWS) card.

---

### How to present a differential on rounds (10 seconds)
"My leading diagnosis is **X** because [2 features]; I'm also considering **Y** and **Z**; and I want to rule out **[the medical can't-miss]** with **[test]**." -> pairs with the Oral Presentation tool.

*Joshua Moss, MD | Psychiatrist * Educational scaffold; not a substitute for supervised assessment.*
Included text sources: 11



---

## Source: `02_Clinical_Skills/Documentation/_source/06_Second_Victim_Script_Card_CLI.md`

# Second Victim Protocol - Script Card

**RSS High-Reliability Integration | Supervisor Reference**

*For the person conducting the clinician support conversation (Step 2, within 24 hours of adverse event)*

---

## Before You Start

- You should NOT have been involved in the event
- This is NOT a clinical review - do not analyze what happened clinically
- Find a private space; allow 20-30 minutes
- Your role: be present, normalize, listen

---

## Opening

> "Thank you for sitting down with me. I want to be clear about what this conversation is and isn't. This is about how you're doing - not about reviewing the clinical decisions. We'll do that separately. Right now I want to know how you're experiencing this."

---

## Core Questions

**Emotions:**
> "What emotions have you noticed since the event?"

*Listen. Do not interpret or fix.*

**Impact:**
> "What is the hardest part of this for you?"

*Listen. Resist the urge to reassure prematurely.*

**Doubt:**
> "What are you second-guessing?"

*This is often where the real distress lives. Stay here.*

**Needs:**
> "What do you need from the team right now?"

*Practical and emotional. Both count.*

---

## Normalization Script

> "What you're feeling is expected after this kind of event. Clinicians who've been through similar situations report [guilt / doubt / anger / replaying the event / difficulty sleeping / wanting to avoid similar patients]. These responses don't mean you made a wrong decision. They mean you're someone who cares about outcomes."

---

## If They Minimize

> "I hear that you're managing. And I want to check - sometimes the impact shows up a day or two later. Would it be alright if I check in with you again tomorrow or the day after?"

---

## If They're in Acute Distress

> "I'm glad you're telling me this. You don't have to carry this alone. Let's talk about what support would help - EAP, a conversation with [name], some time away from the unit."

---

## Closing

> "I appreciate you being honest with me. Here's what happens next: I'll check in with you again in a day or two. The clinical review will happen separately - you'll be part of that when you're ready. And we'll work out a plan for when you return to [full caseload / the unit / similar patients]. You're not doing this alone."

---

## Document

Note that the support conversation occurred. Do NOT document the content of what the clinician shared. This is a support conversation, not a medical record.

---

**Reference:** 21.9 (Adverse Event Response)

*Relational Systems Stabilization Manual | Joshua Moss, MD*


---

## Source: `02_Clinical_Skills/Documentation/_source/07_NotebookLM_Source_Strategy.md`

# NotebookLM Source Strategy for RSSM Audiobook
## Segmentation Plan & Implementation Guide

**Version:** 1.0  
**Date:** April 2026  
**Purpose:** Optimize RSSM Master v10 source manuscript for NotebookLM processing by segmenting into focused, clinically coherent units that respect NotebookLM's character limits while maintaining narrative integrity.

---

## Overview & Rationale

NotebookLM works most effectively with sources that are:
- **Focused** (single coherent topic per source, not monolithic)
- **Self-contained** (readable without extensive cross-references)
- **Well-structured** (clear hierarchy and section breaks)
- **Character-bounded** (~500K characters per source, ~100K ideal for responsive interaction)

The RSSM Master v10 source (14,289 lines) is too large for single-source upload. This strategy segments it into 8 clinically meaningful notebooks that can be processed independently, with cross-linking guidance for comprehensive use.

---

## Segmentation Architecture

### **SEGMENT 1: Philosophical Foundation & Core Architecture**
**NotebookLM Notebook Name:** `RSSM_01_Foundation_Architecture`

#### Content Scope
- File sections: Introduction through Part I (Core Architecture)
- Exact line range: 1-850
- Estimated characters: ~185K

#### What to Include
- Full Introduction: "How to Use This Manual"
- Preface (complete)
- About the Author (complete)
- Part I 1-3: Complete
  - The Predictable Milieu Model (1)
  - The Four Structural Layers (2)
  - The Structural Tension Matrix (3)
- All quick reference materials and reading paths

#### What to Exclude
- Clinical vignettes from Part VII (separate segment)
- Population-specific adaptations from Part VIII (separate segment)
- Appendices (except Quick Reference in this segment)
- Detailed operational procedures (Part VI-separate segment)

#### Rationale
This is the **canonical entry point** for the model. Anyone learning RSSM needs the architecture first. This segment establishes:
- Theoretical foundation
- The four-layer principle
- Why layer emphasis matters
- Reading paths for different audiences

This segment is essential for **all downstream segments**. It should be uploaded first and referenced in prompts to other segments.

#### NotebookLM Recommendations
- **Audio Overview length:** 10 min (comprehensive introduction)
- **Video Overview:** Recommended (visual representation of layer hierarchy)
- **Suggested use cases:**
  - CME introductory modules
  - Staff orientation
  - Family psychoeducation (frame-setting)
  - Research ethics boards (model explanation)

---

### **SEGMENT 2: Biological Stabilization (Sleep, Medication, Substances)**
**NotebookLM Notebook Name:** `RSSM_02_Biological_Layer`

#### Content Scope
- File sections: Part II (Biological Stabilization) complete
- Exact line range: 1098-1850 (approximate; scan for Part II boundaries)
- Estimated characters: ~175K

#### What to Include
- Part II overview
- 4: Sleep and Circadian Architecture (complete)
  - Sleep as foundation, crisis threshold
  - Circadian architecture
  - Assessment protocols
  - Sleep-first protocol
  - Evidence-based circadian interventions (light therapy, blue-blocking glasses, chronotherapy)
- 5: Medication Effects and Iatrogenic Destabilization (complete)
- 6: Substances and Physiological Load (complete)
- 7: Assessing the Biological Baseline (complete)

#### What to Exclude
- Family-level interventions (Part IV)
- Operational implementation (Part VI)
- Clinical case applications (Part VII)
- Clinical vignettes and extended case studies

#### Rationale
Layer 1 is foundational. This segment must be **self-contained and clinically actionable**. Clinicians should be able to use this segment to:
- Understand sleep as a stabilization prerequisite
- Identify medication-induced destabilization
- Apply evidence-based circadian interventions
- Recognize when substance use is driving layer instability

This is the segment for **sleep-focused audiobook chapters** and for **CME credit on circadian medicine in psychiatry**.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (comprehensive clinical depth)
- **Use cases:**
  - Detailed clinical education module
  - Sleep medicine fundamentals for psychiatrists
  - Medication optimization guidance
  - Substance use assessment protocols

---

### **SEGMENT 3: Regulatory Predictability & Environmental Structure**
**NotebookLM Notebook Name:** `RSSM_03_Regulatory_Layer`

#### Content Scope
- File sections: Part III (Regulatory Predictability)
- Exact line range: [Scan for Part III start/end boundaries]
- Estimated characters: ~125K

#### What to Include
- Part III overview
- 8: Arousal, Rhythm, and Environmental Load (complete)
- 9: Signals of Safety (complete)
- 10: Co-Regulation Before Self-Regulation (complete)
- Any clinical scripts related to arousal calibration and environmental modification
- Key passages on neuroception and polyvagal framework

#### What to Exclude
- Family dynamics content (Part IV)
- Functional task engagement (Part V)
- Operational procedures (Part VI)
- Population-specific environmental adaptations (Part VIII-these are separate)

#### Rationale
Layer 2 operationalizes the **external conditions** that enable regulation. This segment answers:
- How does environmental structure reduce arousal load?
- What are "signals of safety" and how do clinicians provide them?
- What is co-regulation and how does it precede self-regulation?
- How do sensory, temporal, and interpersonal elements combine?

This segment is critical for **milieu design, sensory modifications, and team consistency**.

#### NotebookLM Recommendations
- **Audio Overview length:** 15 min (operational and conceptual)
- **Use cases:**
  - Environmental design for psychiatric units
  - Sensory modification protocols
  - Staff training on co-regulation
  - De-escalation and arousal management

---

### **SEGMENT 4: Relational Containment & Family Systems**
**NotebookLM Notebook Name:** `RSSM_04_Relational_Layer`

#### Content Scope
- File sections: Part IV (Relational Containment)
- Exact line range: [Scan for Part IV boundaries, includes 11-15]
- Estimated characters: ~140K

#### What to Include
- Part IV overview
- 11: The Clinician as Container (complete)
- 12: Authority, Roles, and Boundaries (complete)
- 13: Dignity Under Pressure (complete)
- 14: The Family as Relational System (complete)
- 15: Cultural Context and Adaptation (complete)
- Clinical scripts for boundary-setting, authority establishment, and family engagement
- All content on expressed emotion, family psychoeducation readiness, and therapeutic alliance

#### What to Exclude
- Operational family meeting protocol (22, 24-goes to SEGMENT 6)
- Extended case studies (Part VII-separate segment)
- Population-specific family adaptations (Part VIII-separate)

#### Rationale
Layer 3 addresses the **relational field**. This segment defines:
- How clinicians establish containment and safety
- Authority without coercion
- Boundary clarity and dignity preservation
- Family as system, not problem
- Cultural responsiveness in relational work

This is the core for **family therapy integration, therapeutic alliance, and dignity-centered care**.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (relational theory + clinical application)
- **Use cases:**
  - Family therapy training
  - Clinician self-care (understanding the container)
  - Cultural competency training
  - Boundary and authority modules
  - Staff on-boarding (role clarity)

---

### **SEGMENT 5: Functional & Developmental Engagement**
**NotebookLM Notebook Name:** `RSSM_05_Functional_Layer`

#### Content Scope
- File sections: Part V (Functional and Developmental Engagement)
- Exact line range: [Scan for Part V boundaries, includes 16-19]
- Estimated characters: ~120K

#### What to Include
- Part V overview
- 16: Task Introduction and Autonomy Scaling (complete)
- 17: Identity, Trajectory, and Launch (complete)
- 18: Developmental Reengagement After Crisis (complete)
- 19: Meaning-Making After Crisis-Narrative, Values, and Purpose (complete)
- Clinical scripts for autonomy calibration and task sequencing
- Content on identity work and developmental holding

#### What to Exclude
- Operational implementation of task bundles (Part VI-separate)
- Clinical vignettes of task failure and recovery (Part VII-separate)
- Extended case studies

#### Rationale
Layer 4 governs **engagement and forward movement**. This segment covers:
- How tasks are scaled to match relational and regulatory capacity
- Identity work and narrative coherence post-crisis
- Autonomy and launch in developmental context
- Meaning-making and values alignment

This segment is essential for **recovery-focused care, developmental psychology in psychiatry, and meaning-centered interventions**.

#### NotebookLM Recommendations
- **Audio Overview length:** 15 min (development + function)
- **Use cases:**
  - Autonomy scaling training
  - Young adult psychiatry modules
  - Identity work and trauma recovery
  - Values and meaning-making in crisis

---

### **SEGMENT 6: Implementation & Operationalization**
**NotebookLM Notebook Name:** `RSSM_06_Implementation_Operations`

#### Content Scope
- File sections: Part VI (Operationalizing the Predictable Milieu) + Clinical Tools (24-28)
- Exact line range: [Scan for Part VI and 24-28 boundaries]
- Estimated characters: ~160K

#### What to Include
- Part VI overview and all sections (20-23):
  - 20: Daily Rhythm and Environmental Design
  - 21: Team Function and Role Clarity
  - 22: Family Integration Protocols
  - 23: Transitions and Continuity of Milieu
- Clinical Tools (24-28):
  - 24: 60-Minute Family Meeting Playbook
  - 25: First-3-Sessions Clinical Map
  - 26: Bundle Selection Decision Aid
  - 27: Minimum Viable Predictable Milieu Model
  - 28: Failure Modes & Recovery Guide
- All operational checklists, templates, and decision trees

#### What to Exclude
- Theoretical foundation (Part I-Segment 1)
- Individual layer theory (Parts II-V-Segments 2-5)
- Clinical vignettes (Part VII-separate)
- Population-specific operations (Part VIII-separate)

#### Rationale
This segment is **implementation-ready**. It contains:
- Concrete daily procedures
- Team coordination protocols
- Family integration sequences
- Decision aids and failure recovery
- Playbooks that can be deployed immediately

This is the **administrative and operations segment** for program leaders, unit managers, and implementation teams.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (procedures + contingencies)
- **Use cases:**
  - Implementation training for new RSS units
  - Team on-boarding and role clarity
  - Family meeting facilitation training
  - Program director orientation
  - Transition and continuity protocols

---

### **SEGMENT 7: Clinical Applications & Case Studies**
**NotebookLM Notebook Name:** `RSSM_07_Clinical_Applications`

#### Content Scope
- File sections: Part VII (Clinical Applications, 29)
- Exact line range: 9824-10655 (approximate; verify boundaries)
- Estimated characters: ~145K

#### What to Include
- Part VII complete, including all subsections:
  - 29.1: Acute Crisis Stabilization
  - 29.2: Chronic Instability and Repeated Admissions
  - 29.3: Family System Rupture
  - 29.4: Developmental Stall and Failure to Launch
  - 29.5: Extended Case Studies (composites)
- All clinical narratives, decision pathways, and recovery trajectories
- Pattern recognition across presentations

#### What to Exclude
- Theoretical foundation (refer to Segment 1)
- Population-specific applications (Part VIII-Segment 8)
- Operational procedures (Part VI-Segment 6)

#### Rationale
This segment shows **the model in action**. It demonstrates:
- How layer dynamics play out in real presentations
- Where emphasis shifts occur
- What recovery trajectories look like
- Pattern recognition across different crises

This is the **clinical learning and pattern-matching segment** for experienced clinicians.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (case-driven narrative)
- **Use cases:**
  - Advanced clinical education
  - Case conference facilitation
  - Resident training on pattern recognition
  - Supervision material
  - "What does this model actually look like?" education

---

### **SEGMENT 8: Population-Specific Adaptations**
**NotebookLM Notebook Name:** `RSSM_08_Population_Adaptations`

#### Content Scope
- File sections: Part VIII (Population-Specific Adaptations, 30-38)
- Exact line range: [Scan for Part VIII boundaries]
- Estimated characters: ~155K

#### What to Include
- Part VIII overview and all population subsections:
  - 30: Geriatric
  - 31: Perinatal
  - 32: Dual Diagnosis (Mental Health + Substance Use)
  - 33: Pediatric
  - 34: LGBTQ+ Affirming
  - 35: Forensic
  - 36: Refugee
  - 37: IDD (Intellectual and Developmental Disabilities)
  - 38: Cross-Population Integration Principles
- All population-specific modifications to layer emphasis, assessment, and intervention
- Culturally adapted scripts and approaches

#### What to Exclude
- Core architecture (Part I)
- Layer theory (Parts II-V)
- Operational procedures (Part VI)
- Clinical cases from Part VII

#### Rationale
This segment allows **targeted adaptation**. Clinicians working with specific populations can:
- Understand how the four-layer model adapts to geriatric, perinatal, substance-use, pediatric, LGBTQ+, forensic, refugee, and IDD presentations
- Modify emphasis allocation based on population vulnerabilities
- Access culturally responsive language and approach modifications
- Build competency in population-specific implementation

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (multi-population synthesis)
- **Alternative: Individual 5-10 min overviews per population** (recommended for targeted training)
- **Use cases:**
  - Specialized unit training (geriatric, perinatal, etc.)
  - Cultural competency modules
  - Population-specific staff on-boarding
  - Research on RSS adaptability
  - Community mental health center training

---

## Supplementary Segment: Appendices & Reference
**NotebookLM Notebook Name:** `RSSM_99_Appendices_Reference`

#### Content Scope
- File sections: All Appendices (A-G)
- Estimated characters: ~85K

#### What to Include
- Appendix A: Quick Reference (Layer Dynamics)
- Appendix B: Clinical Scripts (organized by layer)
- Appendix C: Assessment Tools
- Appendix D: Family Handouts (patient-facing language)
- Appendix E: Clinical Principles to Resources Map
- Appendix F: References & Evidence Base
- Appendix G: Dyadic Physiological Processes Beyond Polyvagal Theory

#### Rationale
This segment serves as a **reference library**. It's less about learning the model and more about:
- Quick lookup of clinical scripts
- Assessment tools
- Family-facing educational materials
- Evidence citations
- Physiological mechanisms

#### NotebookLM Recommendations
- **Audio Overview length:** 10 min (reference orientation)
- **Best use:** Store for reference, not primary learning
- **Use cases:**
  - Script lookup during clinical encounters
  - Assessment tool guidance
  - Evidence base for publications
  - Family education preparation

---

## Integration Guidance: Cross-Segment References

### **For Learners**
1. Start with **Segment 1** (Foundation & Architecture)
2. Then proceed to **Segment 2, 3, 4, 5** in sequence (the four layers)
3. Then **Segment 6** (Implementation)
4. Then **Segment 7** (Clinical Applications) for pattern recognition
5. Access **Segment 8** (Population Adaptations) when working with that population

### **For Experienced Clinicians**
- Start with **Segment 6** (Implementation)
- Jump to **Segment 7** (Clinical Applications) for your specific case
- Use **Segment 1** as reference when layer emphasis questions arise
- Use **Segment 99** (Appendices) for scripts and tools

### **For Program Implementation**
- **Segment 1** (Foundation) for administrative understanding
- **Segment 6** (Implementation) for operational procedures
- **Segment 8** (Population Adaptations) for your specific setting
- **Segment 99** (Appendices) for daily reference

### **For Research & Evidence**
- **Segment 1** (Foundation) for model architecture
- **Segment 7** (Clinical Applications) for hypothesis generation
- **Segment 99** (Appendices, particularly F) for evidence base

---

## Technical Specifications for NotebookLM Upload

### File Format & Preparation
- Extract each segment from RSSM_Master_v10_source.md
- Save as markdown (.md) with heading structure intact
- Recommended character limit per file: 400K-500K maximum
- All segments fit within this limit

### Naming Convention
```
RSSM_[##]_[Topic]_v1.md
```
- `##` = two-digit segment number (01-99)
- `[Topic]` = lowercase, hyphenated segment name
- `v1` = version (increment if segment updated)

### Metadata for Each Segment
Include at the top of each uploaded file:
```
# [Segment Name]
**Part of RSSM Audiobook Project**  
**Segment [##] of 8**  
**Optimal NotebookLM Length:** [5/10/15/20 min]  
**Primary Use Case:** [Training/Reference/Implementation/Research]  
```

---

## Quality Assurance Checklist

Before uploading each segment to NotebookLM:

- [ ] Heading structure is clean and logical (no skipped levels)
- [ ] All section cross-references are preserved
- [ ] Clinical scripts are complete and unabbreviated
- [ ] Appendix citations are included where referenced
- [ ] Character count is under 500K
- [ ] Segment is self-contained (readable without other segments)
- [ ] No orphaned references to excluded sections
- [ ] File naming follows convention
- [ ] Metadata header included

---

## Estimated Production Timeline

- **Week 1:** Extract and QA segments 1-3 (Foundation, Biological, Regulatory)
- **Week 2:** Extract and QA segments 4-6 (Relational, Functional, Implementation)
- **Week 3:** Extract and QA segments 7-8 (Clinical Applications, Population Adaptations)
- **Week 4:** Final integration testing; prepare segment 99 (Appendices)
- **Week 5:** Upload all segments to NotebookLM; test Audio Overview generation; refine prompts

---

## Next Steps

1. **Extract segments** from RSSM_Master_v10_source.md using this guide
2. **Validate boundaries** for each segment (verify no content loss)
3. **Test character counts** for each segment
4. **Upload to NotebookLM** in this order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 99
5. **Generate Audio Overviews** per recommended lengths above
6. **Test cross-segment linking** in prompts
7. **Proceed to Deliverable 2** (Steering Prompts) once segments are live

---

**Document prepared for:** Josh Moss, MD - ReConnect Psychiatry System  
**Document status:** Ready for implementation  
**Questions/issues:** Contact Claude Cowork for segment extraction assistance


---

## Source: `02_Clinical_Skills/Documentation/_source/08_NotebookLM_Steering_Prompts.md`

# NotebookLM Steering Prompts for RSSM Audiobook
## 20+ Production-Ready Prompts Organized by Use Case

**Version:** 1.0  
**Date:** April 2026  
**Purpose:** Provide field-tested prompts for generating specific audiobook content types using NotebookLM's Audio Overview and Video Overview features, organized by audience and distribution channel.

---

## How to Use This Document

Each prompt below is designed to be **copied verbatim** into NotebookLM's chat interface. The formatting is consistent:

1. **Prompt Title** - identifies the content type
2. **Source Segment** - which NotebookLM notebook to load
3. **Output Type** - Audio Overview vs. Video Overview
4. **Recommended Length** - 5/10/15/20 min
5. **Distribution Channel** - where this content lives (social media, CME platform, etc.)
6. **The Prompt Itself** - copy into NotebookLM, adjust parameters to taste

Each prompt is designed to be **audience-specific** and **format-optimized**. Audio Overview prompts generate narrated summaries; Video Overview prompts add visual elements (though actual video implementation depends on NotebookLM's video capabilities).

---

# SECTION A: MARKETING/SAMPLING PROMPTS
## For social media teasers, event promotion, and general audience sampling

### Prompt A1: "Core Model 5-Minute Introduction"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_01_Foundation_Architecture  
**Distribution Channel:** YouTube Shorts, TikTok, LinkedIn feed  
**Audience:** General clinicians, families, public  

**Copy this prompt into NotebookLM:**
```
Create a 5-minute audio overview explaining the core premise of the 
Relational Systems Stabilization (RSS) model. 

Focus on:
1. What problem RSS solves (when usual interventions fail or escalate conflict)
2. The four-layer principle (biological, regulatory, relational, functional)
3. Why layer emphasis matters (clinical energy allocation, not protocol steps)
4. One concrete example of how the model changes clinical practice

Speak directly to clinicians who feel stuck or teams that feel ineffective. 
Avoid jargon. Use accessible language. End with: "Layer emphasis determines 
whether interventions succeed."

Target length: 4-6 minutes. Tone: authoritative but conversational.
```

**Expected output characteristics:**
- Clear, punchy narrative arc
- Accessible to non-specialists
- 1-2 specific clinical examples
- Call-to-action implied ("learn more about layer emphasis")

---

### Prompt A2: "Sleep as Psychiatric Foundation"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_02_Biological_Layer  
**Distribution Channel:** CME/podcast platforms, LinkedIn professional content  
**Audience:** Psychiatrists, medical doctors, clinical teams  

**Copy this prompt into NotebookLM:**
```
Generate a 5-minute audio overview on sleep as a psychiatric foundation, 
targeting practicing psychiatrists and medical teams.

Focus on:
1. The clinical crisis threshold: why patients decompensate when sleep degrades
2. Sleep as Layer 1 prerequisite (not optional; foundational)
3. Three evidence-based circadian interventions (light therapy, blue-blocking, chronotherapy)
4. One case narrative showing how sleep-first approach changed outcome

Include effect sizes where available. Reference polyvagal and arousal science 
without oversimplifying. End with: "Assess sleep first; it predicts treatment success."

Target length: 4-6 minutes. Tone: evidence-grounded, clinical authority.
```

**Expected output characteristics:**
- Evidence citations included
- Clinically actionable interventions named
- Sleep-outcome linkage established
- Authority voice with practical focus

---

### Prompt A3: "Layer Dynamics in Crisis"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM_07_Clinical_Applications  
**Distribution Channel:** Conference snippets, podcast, YouTube educational series  
**Audience:** Clinical trainees, curious clinicians, program directors  

**Copy this prompt into NotebookLM:**
```
Create a 5-minute audio overview explaining how the four layers interact 
during psychiatric crisis.

Focus on:
1. What "layer emphasis" means in acute presentations
2. How ignoring a lower layer blocks higher-layer work (with example)
3. The intensity gradient: maintaining all layers at reduced energy while 
   prioritizing the most unstable domain
4. One acute case showing layer shift (e.g., "we tried family work, then realized 
   sleep was the issue")

Tone: teaching-focused, shows how model guides decision-making. 
Target length: 4-6 minutes.
```

**Expected output characteristics:**
- Concrete clinical example provided
- Hierarchy of layer stability explained
- Decision-making framework implicit
- Training-appropriate depth

---

### Prompt A4: "Milieu as Medicine"

**Output Type:** Video Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_03_Regulatory_Layer + RSSM_06_Implementation_Operations  
**Distribution Channel:** YouTube educational series, staff orientation videos, hospital training  
**Audience:** Nurses, technicians, administrative staff, program directors  

**Copy this prompt into NotebookLM:**
```
Generate a 5-minute video overview on the psychiatric milieu as an active 
treatment agent (not just a setting).

Focus on:
1. How predictable rhythms, environmental structure, and "signals of safety" 
   reduce arousal load
2. Concrete sensory and temporal modifications (lighting, noise, schedules)
3. Team consistency as treatment mechanism
4. One visual narrative showing what a "predictable milieu" looks like in practice

Include text descriptions suitable for on-screen graphics. Target length: 4-6 minutes.
Tone: professional but warm. End with: "The milieu is the medicine; clinicians execute it."
```

**Expected output characteristics:**
- Visual descriptions provided
- Operational details (not just theory)
- Staff roles clarified
- Concrete physical environment elements

---

### Prompt A5: "Family as System, Not Problem"

**Output Type:** Audio Overview  
**Recommended Length:** 5 min  
**Source Segment:** RSSM_04_Relational_Layer  
**Distribution Channel:** Family-focused podcasts, public health campaigns, community mental health  
**Audience:** Family members, community advocates, clinicians new to family systems  

**Copy this prompt into NotebookLM:**
```
Create a 5-minute audio overview on viewing family as an active system in 
psychiatric stabilization (not as a complicating factor).

Focus on:
1. Family dysregulation as information, not pathology
2. Co-regulation and emotional contagion (how family nervous systems link)
3. Family psychoeducation as safety signal, not blame assignment
4. One family scenario showing shift from "problem family" to "injured system"

Language should be accessible to people without clinical backgrounds. 
Warm, non-judgmental tone. End with: "Family change enables individual change."

Target length: 4-6 minutes.
```

**Expected output characteristics:**
- No clinical jargon
- Dignity-centered language
- Family perspective honored
- Evidence of systemic thinking

---

## SECTION B: CLINICAL EDUCATION PROMPTS
## For CME modules, residency training, and professional development

### Prompt B1: "The Layer Architecture: Full Clinical Depth"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_01_Foundation_Architecture  
**Distribution Channel:** CME platform, residency curriculum, continuing education  
**Audience:** Psychiatrists, psychiatric nurse practitioners, experienced clinicians  

**Copy this prompt into NotebookLM:**
```
Generate a comprehensive 15-minute audio overview of the four-layer architecture, 
designed for psychiatric resident education and CME credit.

Include:
1. Detailed explanation of each layer (biological, regulatory, relational, functional)
2. Layer interaction mechanisms: downward constraints, upward scaffolding, 
   bidirectional effects
3. The intensity gradient: how layers remain active while emphasis shifts
4. Three distinct clinical scenarios (acute crisis, chronic instability, 
   family system rupture) showing different emphasis patterns
5. Evidence level for each layer; evidence level for layer integration
6. Discussion of boundary conditions: when stabilization approaches cause problems

Tone: authoritative, evidence-grounded, assumption of clinical experience.
Include effect sizes and evidence grades. Duration: 14-16 minutes.

End with: "The model is testable; this represents Level V evidence awaiting 
direct randomized evaluation."
```

**Expected output characteristics:**
- All four layers explained in clinical depth
- Evidence citations and effect sizes
- Multiple clinical examples
- Integration mechanisms clarified
- Testability/evidence transparency addressed

---

### Prompt B2: "Sleep and Circadian Medicine in Psychiatric Crisis"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_02_Biological_Layer  
**Distribution Channel:** CME module, medical education conference, psychiatry residency  
**Audience:** Psychiatrists, internal medicine doctors, neurologists with psychiatric interest  

**Copy this prompt into NotebookLM:**
```
Create a comprehensive 20-minute CME module on sleep and circadian neurobiology 
as psychiatric stabilization foundations.

Cover:
1. Sleep architecture: REM/NREM cycles, sleep deprivation cascade, crisis threshold
2. Circadian biology: SCN (suprachiasmatic nucleus), blue light, melatonin, 
   temperature regulation
3. Sleep loss and psychiatric decompensation: specific mechanisms (mood, 
   psychosis risk, behavioral control)
4. Diagnosis-specific sleep vulnerability (bipolar sleep loss sensitivity, 
   depression chronicity)
5. Evidence-based interventions: light therapy (evidence level, timing, intensity), 
   blue-light-blocking glasses, triple chronotherapy
6. Clinical assessment tools and "good-enough sleep" threshold
7. Two detailed case narratives showing sleep-first transformation

Include all cited effect sizes and NCCIH/APA recommendations. 
Tone: authoritative, sleep-medicine-grounded. Duration: 19-21 minutes.
```

**Expected output characteristics:**
- Sleep neurobiology explained accessibly
- All interventions evidence-graded
- Case narratives clinically rich
- Specific protocols provided
- CME-level depth and rigor

---

### Prompt B3: "Co-Regulation and Environmental Structure"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_03_Regulatory_Layer  
**Distribution Channel:** Clinical training, psychiatric nursing education, staff development  
**Audience:** Nurses, therapists, psychiatric technicians, residential staff  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute clinical education module on co-regulation as a 
treatment mechanism and environmental structure as intervention.

Cover:
1. Polyvagal theory basics: vagal tone, social engagement system, autonomic state
2. Co-regulation definition: how one nervous system affects another
3. "Signals of safety" operationalized: facial expressions, tone, proximity, 
   predictability, rhythm
4. Environmental modifications: sensory (lighting, sound, temperature), 
   temporal (scheduling, routines), interpersonal (consistency, predictability)
5. Team function and consistency as environmental element
6. Assessing arousal state and matching environmental intensity
7. One extended narrative: environmental reset in escalating agitation scenario

Tone: teaching-focused but clinically grounded. Reference Porges, Schore, 
and dyadic physiology research. Duration: 14-16 minutes.

Include: "Co-regulation precedes self-regulation; it is not a limitation but 
a necessary phase."
```

**Expected output characteristics:**
- Physiology explained without oversimplification
- Environmental elements concrete and actionable
- Team role clarified
- Co-regulation positioned as mechanism, not weakness

---

### Prompt B4: "Authority Without Coercion"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_04_Relational_Layer  
**Distribution Channel:** Clinician ethics training, leadership development, supervision  
**Audience:** Psychiatrists, senior clinicians, program leaders, supervisors  

**Copy this prompt into NotebookLM:**
```
Create a 15-minute audio overview on establishing clinical authority without 
coercion, designed for clinician development and ethical practice.

Cover:
1. Authority definition: right to make decisions about treatment and safety
2. The clinician as container: self-regulation as prerequisite
3. Boundary clarity without coldness: how respect preserves authority
4. Language and tone as authority tools: the "non-shaming curiosity" approach
5. Authority rupture and repair: what to do when authority is challenged
6. Cultural context: how authority is recognized and established differently 
   across communities
7. Ethics framework: duty, autonomy, and the limits of paternalism
8. Three scenario-based demonstrations: (a) escalating patient, (b) family challenge, 
   (c) team disagreement

Tone: thoughtful, introspective, grounded in relational theory. 
Duration: 14-16 minutes.

Positioning: "Authority is a clinical tool. It is most effective when 
earned through consistency, transparency, and dignity."
```

**Expected output characteristics:**
- Authority positioned as ethical tool
- Concrete language examples
- Cultural humility integrated
- Clinician self-reflection supported

---

### Prompt B5: "The First Three Sessions: Clinical Decision Map"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_06_Implementation_Operations (25: First-3-Sessions Clinical Map)  
**Distribution Channel:** Residency training, new clinician orientation, clinical supervision  
**Audience:** Psychiatric residents, social workers, therapists, new clinicians  

**Copy this prompt into NotebookLM:**
```
Generate a comprehensive 20-minute clinical decision map for the first three 
patient/family encounters in RSS-framed care.

Cover:
1. Session 1 objectives: assessment, alliance-building, layer identification
2. Layer prioritization decision: which domain needs primary attention?
3. Session 2 objectives: family inclusion, narrative gathering, predictability 
   frame-setting
4. Environmental and behavioral interventions (Layer 1 and 2) to initiate 
   regardless of diagnosis
5. Session 3 objectives: milestone review, trajectory clarity, engagement 
   deepening
6. Common decision points and branch logic:
   - If sleep is severely disrupted -> do this
   - If family is dysregulated -> do this
   - If patient is apathetic/withdrawn -> do this
7. Three narrative examples: acute crisis, chronic presentation, family-initiated request

Include timing, decision trees, and concrete phrases. 
Tone: practical, trainee-appropriate, procedural but principle-grounded.
Duration: 19-21 minutes.
```

**Expected output characteristics:**
- Decision trees provided
- Timing explicit
- Concrete language included
- Multiple clinical scenarios covered

---

## SECTION C: ACADEMIC/RESEARCH PROMPTS
## For professional audiences, evidence synthesis, and publication support

### Prompt C1: "Evidence Base and Mechanisms of Action"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM appendices (specifically Appendix F)  
**Distribution Channel:** Research conference, academic seminar, publication preparation  
**Audience:** Researchers, academics, clinician-scientists, peer reviewers  

**Copy this prompt into NotebookLM:**
```
Create a 20-minute academic overview of the RSS model's evidence base, 
mechanisms, and testability.

Cover:
1. Component evidence levels (Layer 1: Level I sleep RCTs; Layer 2: arousal/polyvagal 
   Level II-III; Layer 3: family psychoeducation RCTs, expressed emotion cohorts; 
   Layer 4: autonomy/identity development theory)
2. Effect sizes for individual components (sleep: NNT for relapse prevention; 
   family psychoeducation: NNT = 7; expressed emotion: OR = 4.87)
3. Integration hypothesis: the layer interaction principle as Level V evidence 
   (clinical consensus + convergent mechanism-level science, not yet tested as 
   integrated model)
4. Proposed randomized evaluation design for the integrated model (SMART trial, 
   primary outcomes: LOS, 30-day readmission, family engagement, restrictive 
   interventions)
5. Boundary conditions and failure modes: when does the model NOT work?
6. Disconfirmatory evidence: alternative models (Open Dialogue, DBT, Soteria, TCs) 
   and what RSS claims to add
7. Publication-ready evidence transparency: how the model handles gaps

Tone: rigorous, evidence-grounded, transparent about limitations and Level V evidence.
Include all citations. Duration: 19-21 minutes.

End with: "This model is clinically implemented, empirically testable, and 
awaiting direct randomized evaluation of integrated effect."
```

**Expected output characteristics:**
- All evidence levels cited
- Effect sizes provided
- Integration hypothesis clearly stated as Level V
- Proposed study design outlined
- Publication-ready language

---

### Prompt C2: "Layer Interaction Mechanisms: Neurobiology and Systems Theory"

**Output Type:** Audio Overview  
**Recommended Length:** 20 min  
**Source Segment:** RSSM_01_Foundation_Architecture (3.3: Layer Interactions) + RSSM_03_Regulatory_Layer + Appendix G (Dyadic Physiological Processes)  
**Distribution Channel:** Neuroscience journal club, research seminar, systems medicine conference  
**Audience:** Neuroscientists, researchers, clinician-scientists, systems biologists  

**Copy this prompt into NotebookLM:**
```
Generate a 20-minute research-level overview of the mechanisms by which 
layer instability in one domain constrains or enables work in other domains.

Cover:
1. Downward constraints: how lower-layer instability blocks higher-layer interventions
   - Sleep deprivation -> cortical prefrontal impairment -> task failure even when 
     relational support is in place
   - Arousal dysregulation -> threat perception -> family dynamics become threat-driven
   - Relational rupture -> neuroceptive threat -> arousal escalation -> circadian disruption
2. Upward scaffolding: how lower-layer stability enables higher-layer work
   - Sleep restoration -> prefrontal access -> insight work becomes possible
   - Co-regulation and environmental predictability -> arousal reduction -> 
     capacity for relational processing
   - Relational safety -> reduced threat perception -> autonomy and identity work possible
3. Bidirectional effects: how higher layers feed back on lower layers
   - Identity work -> meaning restoration -> motivation for sleep/circadian adherence
   - Functional success -> mood elevation -> sleep architecture improvement
4. Timing and temporal ordering: sequential vs. parallel engagement
5. Dyadic physiology: nervous system coupling, mirror neurons, vagal tone transmission 
   between clinician and patient, family members and identified patient
6. Measurement and documentation: how to capture layer-interaction effects in clinical notes
7. Mechanistic hypothesis: the thesis that ALL four layers operate simultaneously 
   but with varying intensity allocation

Reference: Porges, Schore, Coan, Seery, attachment theory, family systems theory, 
and computational neurobiology. Tone: rigorous, evidence-grounded.
Duration: 19-21 minutes.

Include: "Layer interaction is the testable hypothesis at the model's core."
```

**Expected output characteristics:**
- Neurobiology integrated with systems theory
- Mechanisms explained at multiple scales
- Measurement/documentation guidance
- Testable hypotheses identified

---

### Prompt C3: "Comparative Effectiveness: RSS vs. Alternative Models"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_01_Foundation_Architecture (3.9: How RSS Relates to Other Models)  
**Distribution Channel:** Health policy forum, comparative effectiveness research conference  
**Audience:** Health services researchers, policymakers, clinical leaders  

**Copy this prompt into NotebookLM:**
```
Create a 15-minute research-focused comparison of the RSS model with other 
major inpatient psychosocial frameworks.

Cover:
1. Open Dialogue: strengths (speed of family engagement, low coercion), 
   limitations for acute crisis, resource requirements
2. DBT in inpatient settings: diary cards and structure vs. milieu-based 
   co-regulation; population fit (chronic suicidality)
3. Soteria: anti-psychiatry foundations, medication minimization, community model
4. Therapeutic Communities: hierarchy, peer structure, long-term vs. acute
5. What RSS claims to add: prioritized layer emphasis, biological integration, 
   testable mechanisms, transportability to standard settings
6. Hybrid approaches: can elements from each be integrated?
7. Comparative outcomes where available: readmission, restraint/seclusion, LOS
8. Implementation barriers: what makes each model challenging to deploy?

Tone: scholarly, comparative, non-partisan. Acknowledge strengths and limitations 
of each approach. Duration: 14-16 minutes.

Positioning: "The optimal model may depend on population, setting, and available 
resources. This comparative lens supports informed implementation choice."
```

**Expected output characteristics:**
- Fair treatment of alternative models
- Strengths and limitations both covered
- Implementation barriers addressed
- Evidence for comparative outcomes cited

---

### Prompt C4: "Population-Specific Adaptation: Research Implications"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_08_Population_Adaptations + 38 (Cross-Population Integration)  
**Distribution Channel:** Health disparities conference, population health seminar  
**Audience:** Public health researchers, health equity leaders, population health clinicians  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute research overview of how the RSS model adapts across 
eight distinct populations and what this suggests about model robustness.

Cover:
1. Geriatric: layer emphasis shifts (medication sensitivity, cognitive scaffolding priority)
2. Perinatal: attachment foundation, postpartum neurobiology, identity preservation
3. Dual diagnosis (MH + SUD): parallel engagement timelines, harm reduction integration
4. Pediatric: developmental stage, family as treatment primary vehicle
5. LGBTQ+: affirming environment as Layer 2 foundation, identity as safety signal
6. Forensic: structure and authority as therapeutic (vs. restraint), transparency 
   as boundary maintenance
7. Refugee: trauma context, cultural adaptation, safety reconstruction
8. IDD: scaffolding, communication adaptation, consent and autonomy
9. Cross-population principles: universals that hold across all eight populations

Include: research gaps, implementation challenges, hypothesized mechanisms 
by population. Tone: scholarly, population-centered, gaps-transparent.
Duration: 14-16 minutes.

End with: "Population adaptation suggests the model's core principle 
(layer emphasis) generalizes; effectiveness measurement needs population-specific 
outcomes."
```

**Expected output characteristics:**
- Each population covered briefly but substantively
- Commonalities identified across populations
- Research gaps named
- Health equity perspective integrated

---

## SECTION D: GENERAL AUDIENCE PROMPTS
## For broader reach, family education, and public health contexts

### Prompt D1: "When Usual Treatment Isn't Working: A New Framework"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM_07_Clinical_Applications  
**Distribution Channel:** Mental health podcast, public health website, family education  
**Audience:** Families, patients, community advocates, general clinicians  

**Copy this prompt into NotebookLM:**
```
Create a 10-minute audio overview for families and patients whose usual psychiatric 
treatment isn't working or is making things worse.

Focus on:
1. When treatment fails, it's often an emphasis problem, not an effort problem
2. Four domains that matter equally: sleep, rhythm/environment, relationships, engagement
3. If one domain is wobbly, the others can't bear weight
4. The clinician's job is to ask: which domain needs the most help right now?
5. One family story: "We tried family therapy, but nothing shifted until we addressed 
   sleep. Then everything became possible."
6. What families can do: ask about all four domains, notice which one clinicians 
   are ignoring

Language: accessible, non-jargon, empowering without being dismissive of 
clinicians. Tone: hopeful, practical. Duration: 9-11 minutes.

End with: "Better treatment is often not more treatment; it's treatment that 
addresses what's actually unstable right now."
```

**Expected output characteristics:**
- No clinical jargon
- Family perspective honored
- Empowerment without blame
- Practical action items for families

---

### Prompt D2: "Sleep as Mental Health Foundation"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_02_Biological_Layer  
**Distribution Channel:** Mental health awareness campaign, family education website, general podcast  
**Audience:** General public, families, patients, community health workers  

**Copy this prompt into NotebookLM:**
```
Generate a 10-minute public health audio overview on sleep as a mental health 
foundation.

Focus on:
1. Sleep isn't optional; it's a treatment mechanism
2. When sleep gets bad, psychiatric symptoms get worse (not just fatigue, but mood, 
   thinking, impulse control)
3. Clinicians often overlook sleep because it seems obvious
4. Three things that help: daylight exposure (midday is best), consistent schedule, 
   dark bedroom at night
5. One patient story: "When I started sleeping better, my whole world shifted"
6. What to ask your doctor: "Is my sleep stable enough for other treatments to work?"

Language: warm, accessible, non-technical. Tone: educational and normalizing.
Duration: 9-11 minutes.

Include practical tips families can use immediately. End with: "Sleep is medicine. 
If sleep is bad, psychiatry should address it first."
```

**Expected output characteristics:**
- Practical, immediately useful tips
- No jargon
- Patient perspective centered
- Sleep positioned as leverage point

---

### Prompt D3: "Family as Healer, Not Burden"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_04_Relational_Layer  
**Distribution Channel:** Family support podcast, NAMI-affiliated content, community health site  
**Audience:** Family members, patients, community advocates  

**Copy this prompt into NotebookLM:**
```
Create a 10-minute audio for family members about their role as healer (not burden) 
in psychiatric recovery.

Focus on:
1. Family isn't the problem; family is the solution (when structured right)
2. Families are dysregulated because they're scared, not because they're broken
3. When clinicians help families calm down, patients improve faster
4. What healthy family involvement looks like: presence, consistency, clarity
5. One family story: transformation from "hovering and controlling" to "present 
   and stable"
6. What clinicians should offer: family psychoeducation, not blame; support, not judgment
7. What families should ask: "How do we participate in treatment in healthy ways?"

Language: non-stigmatizing, dignity-centered, strength-focused. Tone: warm, 
validating. Duration: 9-11 minutes.

Positioning: "Family participation saves lives. Clinicians who engage family 
well see better outcomes."
```

**Expected output characteristics:**
- Family dignity centered
- Blame actively reversed
- Practical family behaviors named
- Clinician responsibility clarified

---

### Prompt D4: "Getting Unstuck: When Recovery Isn't Happening"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_07_Clinical_Applications (29.2: Chronic Instability and Repeated Admissions) + 28 (Failure Modes & Recovery Guide)  
**Distribution Channel:** Support group podcast, patient education site, community mental health  
**Audience:** Patients, families, community health advocates  

**Copy this prompt into NotebookLM:**
```
Generate a 10-minute audio overview for people who feel stuck in psychiatric crisis 
or chronic instability.

Focus on:
1. Feeling stuck usually means something foundational hasn't stabilized yet
2. Four foundations that matter: biological (sleep), environmental (rhythm/safety), 
   relational (trust/consistency), engagement (purpose/meaningful activity)
3. If recovery feels impossible, ask: which foundation is most shaky?
4. What recovery *can* look like: gradual, supported, with setbacks
5. Three stories: acute crisis recovery, chronic instability breakthrough, 
   family-enabled transformation
6. What to ask your clinical team: "Which foundation should we focus on right now?"
7. Red flags: treatment getting busier but nothing improving (emphasis problem)

Language: hopeful without false promises, realistic about complexity. 
Tone: companionable, practical. Duration: 9-11 minutes.

End with: "Feeling stuck doesn't mean treatment doesn't work. It usually means 
treatment needs to shift focus."
```

**Expected output characteristics:**
- Realistic hope
- Pattern recognition provided
- Agency-supporting framing
- Multiple recovery trajectories shown

---

### Prompt D5: "Building Stability: A Practical Guide for Families"

**Output Type:** Audio Overview  
**Recommended Length:** 10 min  
**Source Segment:** RSSM_03_Regulatory_Layer + RSSM_06_Implementation_Operations (Daily Rhythm and Environmental Design)  
**Distribution Channel:** Family support website, practical health podcast, community education  
**Audience:** Families, patients, residential staff, support people  

**Copy this prompt into NotebookLM:**
```
Create a 10-minute practical audio guide for families on building psychiatric 
stability at home.

Focus on:
1. Predictability is medicine: consistent schedules, routines, expectations
2. Sensory environment matters: reduce sudden noise, bright lights, chaos
3. Presence is treatment: be there without trying to "fix"
4. Clear roles and boundaries: everyone knows what they're responsible for
5. Five practical changes families can make immediately:
   - Establish sleep schedule (same bedtime, dark room)
   - Morning daylight exposure (15 min, no sunglasses)
   - One family meal together daily
   - Clear daily rhythm (wake, meals, activity, sleep)
   - No surprise schedule changes
6. How to know it's working: patient calmer, sleeping better, fewer incidents

Language: practical, encouraging, non-blaming. Tone: warm guide, not expert 
lecturing. Duration: 9-11 minutes.

Include: "Stability built at home is just as important as medication. 
Families can provide it."
```

**Expected output characteristics:**
- Immediately actionable steps
- No special equipment needed
- Family empowerment centered
- Success markers clarified

---

## SECTION E: SPECIAL-PURPOSE PROMPTS
## For unique contexts and specialized distributions

### Prompt E1: "RSSM for Program Leaders: Implementation Roadmap"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_01_Foundation_Architecture + RSSM_06_Implementation_Operations  
**Distribution Channel:** Leadership conference, administrative training, implementation consulting  
**Audience:** Program directors, unit managers, hospital leaders, system administrators  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute administrative overview for program leaders implementing RSS.

Cover:
1. Core principle: layer emphasis determines clinical effectiveness and outcomes
2. Operational implications: daily rhythm design, team role clarity, family integration 
   protocols
3. Outcome shifts to expect: LOS, readmission, restraint/seclusion, family engagement, 
   staff burnout
4. Implementation barriers and solutions:
   - Staff skepticism -> education on layer mechanism
   - Medication-centered culture -> balance with milieu (both required)
   - Family resistance -> psychoeducation on co-regulation
   - Resource constraints -> minimum viable RSS model available
5. Data collection: what to measure? (pilot study outcomes listed)
6. Staff training roadmap: orientation, layer education, clinical application, 
   supervision
7. Timeline: realistic implementation phasing

Tone: leadership-focused, practical, outcome-oriented. Include ROI considerations 
and evidence base. Duration: 14-16 minutes.

End with: "RSS implementation requires cultural shift but produces measurable 
outcome improvement."
```

**Expected output characteristics:**
- Administrative language and framing
- Implementation barriers addressed
- Outcome expectations set
- Resource considerations included

---

### Prompt E2: "RSSM in Substance Use Disorder: Layer Integration"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_02_Biological_Layer (6: Substances and Physiological Load) + RSSM_01_Foundation_Architecture (3.8: Substance Use Case)  
**Distribution Channel:** Addiction medicine conference, dual diagnosis training, substance use specialist education  
**Audience:** Addiction psychiatrists, substance use counselors, dual diagnosis specialists  

**Copy this prompt into NotebookLM:**
```
Create a 15-minute clinical education module on RSS application to substance use 
disorder (SUD) in the context of concurrent psychiatric illness.

Cover:
1. SUD and psychiatric illness modify layer engagement timelines
2. Physiological load: how active use/withdrawal disrupts all four layers simultaneously
3. Neurobiological timelines for SUD: acute withdrawal (days), protracted withdrawal 
   (weeks/months), reward system recalibration (months/years)
4. Layer 1 (biological): managing withdrawal, stabilizing sleep/circadian during 
   acute phase, addressing PAWS
5. Layer 2 (regulatory): structure and environmental predictability as craving management
6. Layer 3 (relational): therapeutic alliance rupture risk, family support for harm 
   reduction vs. abstinence
7. Layer 4 (functional): delayed functional recovery; meaning-making around substance 
   role in identity
8. Concurrent vs. sequential engagement: why both happen simultaneously in SUD
9. One detailed case: dual diagnosis (bipolar + alcohol use) showing layer integration 
   during first 90 days

Reference: withdrawal timeline science, reward circuitry, harm reduction principles, 
family impact research. Tone: evidence-grounded, non-judgmental.
Duration: 14-16 minutes.

Include: "SUD and psychiatric illness are intertwined layers; both require 
simultaneous engagement."
```

**Expected output characteristics:**
- Neurobiological specificity
- Harm reduction framework integrated
- Concurrent vs. sequential explained
- Withdrawal timelines clarified

---

### Prompt E3: "RSSM and Perinatal Psychiatry: Mother, Baby, Family"

**Output Type:** Audio Overview  
**Recommended Length:** 15 min  
**Source Segment:** RSSM_08_Population_Adaptations (31: Perinatal) + RSSM_04_Relational_Layer  
**Distribution Channel:** OB/GYN education, perinatal psychiatry conference, women's health CME  
**Audience:** Obstetricians, perinatologists, perinatal mental health specialists, midwives  

**Copy this prompt into NotebookLM:**
```
Generate a 15-minute clinical education module on RSS application to perinatal 
psychiatry (pregnancy, postpartum, postpartum psychosis).

Cover:
1. Perinatal vulnerability: sleep disruption, hormonal change, identity shift, 
   attachment formation
2. Layer 1 (biological): pregnancy-related sleep changes, postpartum circadian 
   disruption, lactation impact on sleep
3. Layer 2 (regulatory): environmental and relational predictability as 
   attachment foundation
4. Layer 3 (relational): mother-baby dyadic regulation, partner role, clinical 
   alliance in context of motherhood
5. Layer 4 (functional): identity integration (woman/mother/clinician), postpartum 
   recovery timeline, meaning-making
6. Special urgency: postpartum psychosis as psychiatric emergency; RSS-structured 
   mother-baby dyad stabilization
7. Family involvement: partner as co-regulator, extended family support, 
   peer support role
8. One detailed case: postpartum depression with treatment resistance, 
   transformed by layer-based approach

Include: attachment neurobiology, lactation and medication, reproductive psychiatric 
ethics. Tone: maternal-centered, women-affirming, evidence-grounded.
Duration: 14-16 minutes.

Positioning: "Perinatal psychiatry is dyadic psychiatry. The mother-baby 
stabilization happens together."
```

**Expected output characteristics:**
- Mother-baby dyad centered
- Pregnancy/postpartum biology integrated
- Attachment neurobiology included
- Women's healthcare perspective

---

## DEPLOYMENT GUIDE

### Audio Overview Setup
1. Load NotebookLM notebook segment (see "Source Segment" in each prompt)
2. Open the "Audio Overview" feature
3. Copy the full prompt (everything from "Copy this prompt" onward)
4. Paste into NotebookLM chat
5. Adjust length recommendation if needed (5/10/15/20 min)
6. Click "Generate"
7. Wait for audio generation (typically 2-5 minutes per segment)

### Video Overview Setup (if available)
1. Same as Audio Overview but select "Video Overview" feature
2. NotebookLM may auto-generate visual elements or allow you to suggest them
3. Specify visual descriptions in prompt if needed (see prompts A4 and others with visual notes)

### Content Use & Licensing
- **Internal use:** All prompts are ready for internal training, CME delivery, staff orientation
- **Publication/distribution:** Confirm with Josh Moss before external sharing or podcast distribution
- **Citation:** If using, cite as "RSSM Audiobook Audio Overview, generated via NotebookLM, Moss 2026"
- **Modification:** You may modify prompts for specific audience/context but maintain accuracy

### Quality Assurance Checklist Before Distribution
- [ ] Audio is clear and professional in tone
- [ ] Clinical content is accurate and evidence-cited (not hallucinated)
- [ ] Duration matches recommendation (within 1-2 minutes acceptable)
- [ ] Audience-appropriate language used (no jargon for general audience; sufficient depth for clinical)
- [ ] No discontinuities or repetitions
- [ ] Visuals (if video overview) align with narration

---

## Next Steps

1. **Select prompts** most relevant to your distribution channels
2. **Load RSSM notebook segments** to NotebookLM in this order: Segment 1, 2, 3, 4, 5, 6, 7, 8
3. **Generate Audio Overviews** using the prompts above
4. **QA each output** for accuracy and tone
5. **Distribute** via designated channels (podcast, CME platform, YouTube, etc.)
6. **Gather feedback** on content quality and clinical accuracy
7. **Iterate** based on audience response

---

**Document prepared for:** Josh Moss, MD - ReConnect Psychiatry System  
**Document status:** Ready for NotebookLM deployment  
**Last updated:** April 2026  
**Questions:** Contact Claude Cowork for prompt refinement or custom prompt creation


---

## Source: `02_Clinical_Skills/Documentation/_source/2026-03-11-continuity-event-quality-audit.md`

# Continuity Event-Quality Audit and QA Hardening

Date: March 12, 2026
Status: Shipped on `main` via `PR #97`
Scope: QA hardening + audit documentation only (no product-feature behavior changes)

## 1) Event Inventory

### ReConnect Tool Suite
- Meaningful continuity events emitted directly by this surface: **none**.
- Role in continuity telemetry: entrypoint and routing surface; event semantics are owned by destination tools.

### Relational State Map
- Tool id: `relational-state-map`
- Analytics events emitted:
  - `page_load` with target `map_open` and detail `preview_mode` or `live_mode`
  - `page_unload` with target `map_close`
  - `button_click` with target `recommendation_primary` or `recommendation_secondary`, detail = recommended tool id
- Meaningful continuity signal: recommendation-click routing behavior.

### Shared Calm Mode
- Tool id: `shared-calm-mode`
- Meaningful events (custom dispatch + analytics feature target):
  - `supporter_selected`
  - `co_regulation_completed`
  - `pause_plan_created`
- Analytics encoding:
  - `feature_use` with target set to each event name above.

### Family Pulse
- Tool id: `family-pulse`
- Meaningful events (custom dispatch + analytics feature target):
  - `family_checkin_completed`
  - `family_conflict_logged`
  - `connection_moment_logged`
- Analytics encoding:
  - `feature_use` with target set to each event name above.

### Common Ground Lite
- Tool id: `common-ground-lite`
- Meaningful events:
  - `conflict_type_selected`
  - `deescalation_script_viewed`
  - `repair_step_selected`
- Analytics encoding:
  - Event name is stored directly in `event`
  - `target` is `common-ground-lite`
  - payload is serialized into `detail`.

### ReConnect Analytics Dashboard
- Continuity metrics sources:
  - `CONTINUITY_TOOLS` includes continuity tools (`relational-state-map`, `shared-calm-mode`, `family-pulse`, `common-ground-lite`, and other continuity surfaces).
  - `recommendationClicks` counts `button_click` events where target matches `recommendation_*`.
  - `completions` = `feature_use` events in `CONTINUITY_COMPLETION_TARGETS` + Common Ground event-name engagements (`COMMON_GROUND_EVENT_TYPES`).
- Interpretation layer:
  - `TOOL_LABELS`, `EVENT_LABELS`, and `getFeatureLabel` provide human-readable labels for tables/charts.

## 2) Dashboard Coverage Verification

Verified in source:
- Continuity tool set contains all audited continuity tools.
- Relational State Map recommendation clicks are counted in continuity metrics.
- Shared Calm Mode and Family Pulse completion targets are included via `feature_use` + target matching.
- Common Ground Lite event names are represented in:
  - `COMMON_GROUND_EVENT_TYPES`
  - `EVENT_TYPES`
  - `EVENT_LABELS`
  - completion rollup (`completionEvents + commonGroundEngagements`).

## 3) QA Gaps Found

Before this pass, QA had several contract gaps:
- Analytics dashboard static harness did not explicitly lock:
  - full continuity tool membership
  - continuity completion target membership
  - recommendation-click continuity metric expression
  - combined completion rollup behavior.
- Relational State Map harness did not verify page-close target semantics (`map_close`) or preview/live mode detail contract.
- Shared Calm Mode harness did not verify that analytics `feature_use` targets exactly matched emitted meaningful event names.
- Family Pulse harness did not verify strict alignment between required meaningful events and analytics `feature_use` targets.
- Common Ground Lite harness validated emitted names but did not lock:
  - `ALLOWED_EVENTS` set membership
  - `rcAnalytics.track(eventName, 'common-ground-lite', payload)` contract.
- Tool Suite harness did not explicitly guard against accidental direct continuity emitter logic in the entrypoint shell.

## 4) Fixes Made (QA-Only)

Updated harnesses:
- `tools-suite/qa/qa_harness_analytics_dashboard_static.js`
  - Added explicit checks for continuity tool/event/target coverage and completion rollup expressions.
- `tools-suite/qa/qa_harness_relational_state_map.js`
  - Added map-open/map-close target checks and preview/live detail checks.
- `tools-suite/qa/qa_harness_shared_calm_mode.js`
  - Added strict assertion that `feature_use` targets are exactly:
    - `co_regulation_completed`
    - `pause_plan_created`
    - `supporter_selected`.
- `tools-suite/qa/qa_harness_family_pulse.js`
  - Added strict assertion that `feature_use` targets match required Family Pulse event names only.
- `tools-suite/qa/qa_harness_common_ground_lite.js`
  - Added checks for exact `ALLOWED_EVENTS` membership and `rcAnalytics.track(eventName, 'common-ground-lite', JSON.stringify(detail.payload))` usage.
- `tools-suite/qa/qa_harness_reconnect_tool_suite.js`
  - Added guard assertion that the suite entrypoint does not emit tool-specific continuity events directly.

## 5) Recommended Follow-Ups

1. Add one small data-driven dashboard contract test (fixture-based) that feeds synthetic continuity events and asserts metric totals (`opens`, `recommendationClicks`, `completions`) numerically.
2. Consider enriching Common Ground Lite dashboard interpretation by decoding event payload detail for more specific labels (for example selected conflict type / repair step), while preserving current aggregate counts.
3. Decide whether `pause_reset`, `one_need_each`, and `small_next_step` should remain in `CONTINUITY_COMPLETION_TARGETS` or be removed if Common Ground continues using event-name semantics rather than `feature_use` targets.


---

## Source: `02_Clinical_Skills/Documentation/_source/2026-03-15-podcasts-youtube-links-design.md`

# Podcasts "Find on YouTube" Feature - Design Spec

**Date:** 2026-03-15
**Status:** Approved
**Scope:** 481 podcast records in canonical database + Resource Finder v6/v7 UI

## Problem

Podcast episodes in the Resource Finder display as cards with title, show name, duration, and description but have no external link. Families cannot click through to watch or listen to the episode. All 481 records also lack verification metadata.

## Design

### Data Layer

Add two fields to each of the 481 podcast records:

**`youtube_search_url`** - auto-generated from `Show Name` + `Title` using a parts-list approach (same pattern as books):
```python
parts = []
if show_name: parts.append(quote_plus(show_name))
if title: parts.append(quote_plus(title))
url = f"https://www.youtube.com/results?search_query={'+'.join(parts)}"
```
- For the ~20 records with blank `Show Name`, URL is generated from `Title` only (no leading `+`).
- One URL per record. YouTube search typically surfaces the exact episode.

**`show_url`** - the show's official homepage or primary web presence:
- One lookup per unique show (~51 shows).
- Hardcoded as a lookup table in the migration script.
- Stored on every episode belonging to that show.
- For blank-show-name episodes, `show_url` is left empty. The "Visit show website" link will not appear for those records.

While touching each record, also set provenance:
- `last_verified_date`: `2026-03-15` (ISO format, consistent with `parse_date()`)
- `source`: `ReConnect clinical library curation`
- `source_confidence`: `high`
- `verification_note`: `Podcast selected for clinical library. YouTube search link auto-generated from show name and title.`

### Migration Script

New script: `databases/maintenance/add_podcast_urls.py`

- Contains a `SHOW_URLS` dict mapping each of the ~51 unique show names to their homepage URL
- Iterates canonical database `podcasts` array
- Computes `youtube_search_url` using parts-list approach (conditional on `Show Name` being non-empty)
- Sets `show_url` from the `SHOW_URLS` lookup table
- Skips records that already have a non-empty `youtube_search_url` (idempotent - note: provenance is also skipped on already-processed records, same trade-off as books script)
- Sets provenance fields on new records
- Writes back to canonical database
- Prints count of records updated

### Normalizer Changes

**`tools-suite/tools/ReConnect_Resource_Finder_v6.html`** - `normalizePodcast()`:
- Add: `youtube_search_url: r['youtube_search_url'] || ''`
- Add: `show_url: r['show_url'] || ''`

**`tools-suite/tools/ReConnect_Resource_Finder_v7.html`** - `normalizePodcast()`:
- Add: `show_name: r['Show Name'] || r['show_name'] || ''` (currently missing in v7 normalizer)
- Add: `youtube_search_url: r['youtube_search_url'] || ''`
- Add: `show_url: r['show_url'] || ''`

### UI Changes

**`tools-suite/tools/generated/ReConnect_Resource_Finder_v6.app.jsx`** - podcast card:
- "Find on YouTube" button in the card action buttons area, rendered only when `resource.youtube_search_url` is truthy and `resource._db === 'podcasts'`.
- Opens in a new tab (`target="_blank" rel="noopener noreferrer"`).
- `aria-label={`Find "${resource.name}" on YouTube`}`.
- Styled as `btn-secondary text-sm` (same as books' "Find on Amazon").
- "Visit show website" link in the expanded Details grid, rendered only when `resource.show_url` is truthy.

**`tools-suite/tools/generated/ReConnect_Resource_Finder_v7.app.jsx`**:
- `buildResourceList()`: add `youtube_search_url: resource.youtube_search_url || ""` and `show_url: resource.show_url || ""` as explicit named properties in the return object (alongside existing `amazon_search_url`).
- `ResourceCard` "Find on YouTube" button: guard uses `resource.dbKey === 'podcasts'` (v7 uses `dbKey`, not `_db` - matches the existing Amazon button which uses `resource.dbKey === "books"`).
- "Visit show website" link: rendered as a standalone `<a>` element after the `detailRows` loop, following the same pattern as the existing `resource.website` link. Not added to `buildDetailRows` (which returns plain text, not clickable links).

### Files Changed

1. Canonical database - 481 podcast records: add `youtube_search_url`, `show_url`, provenance fields
2. `databases/maintenance/add_podcast_urls.py` - new migration script with `SHOW_URLS` lookup table
3. `tools-suite/tools/ReConnect_Resource_Finder_v6.html` - `normalizePodcast()` update
4. `tools-suite/tools/ReConnect_Resource_Finder_v7.html` - `normalizePodcast()` update (add `show_name` + two new URL fields)
5. `tools-suite/tools/generated/ReConnect_Resource_Finder_v6.app.jsx` - podcast card button + details link
6. `tools-suite/tools/generated/ReConnect_Resource_Finder_v6.app.js` - precompiled
7. `tools-suite/tools/generated/ReConnect_Resource_Finder_v7.app.jsx` - `buildResourceList` + card button + details link
8. `tools-suite/tools/generated/ReConnect_Resource_Finder_v7.app.js` - precompiled

Note: `tools-suite/_site/` artifacts are regenerated by `build_netlify.py` and not edited directly.

### Not In Scope

- Books (already done)
- Manual per-episode YouTube URL lookups
- Embedded video players
- Podcast RSS feed integration

### Verification

- `python3 databases/maintenance/add_podcast_urls.py` (run migration)
- `python3 databases/maintenance/build_all.py --stage validate`
- `python3 databases/maintenance/run_quality_guard.py --json`
- Precompile v6 and v7 via esbuild
- `python3 tools-suite/build_netlify.py`
- Visual check: open Resource Finder, find a podcast card, click "Find on YouTube", confirm YouTube search with correct show+title
- Visual check: expand a podcast card, confirm "Visit show website" link appears and works
- Visual check: expand a blank-show-name podcast card, confirm no "Visit show website" link appears
- Deploy to production via `npx netlify deploy --prod`


---

## Source: `02_Clinical_Skills/Documentation/_source/2026-03-17-phase2-testing-results-template.md`

# Phase 2 Manual Testing Results Report
**Date:** 2026-03-17  
**Project:** ReConnect Psychiatry System  
**Feature:** Phase 2 Personalization (Preference Form + Recommendations Banner)  
**Tester:** [Your Name]  
**Testing Duration:** [Start Time] to [End Time]

---

## Executive Summary

**Overall Status:** [ ] PASS [ ] PASS with Warnings [ ] FAIL  
**Total Tests Executed:** ___ / 100  
**Pass Rate:** ___%  
**Critical Issues:** ___  
**Major Issues:** ___  
**Minor Issues / Warnings:** ___  

---

## Device & Browser Coverage

### Desktop Chrome (1920px)

| Test | Result | Notes |
|------|--------|-------|
| 1A: Form Rendering | [yes] / WARNING /  | |
| 1B: Form Validation | [yes] / WARNING /  | |
| 1C: Recommendations Display | [yes] / WARNING /  | |
| 1D: Data Persistence | [yes] / WARNING /  | |
| 1E: Console & Analytics | [yes] / WARNING /  | |
| 1F: Clinician Path | [yes] / WARNING /  | |
| **Subtotal** | | |

### Desktop Safari (1920px)

| Test | Result | Notes |
|------|--------|-------|
| 1A: Form Rendering | [yes] / WARNING /  | |
| 1B: Form Validation | [yes] / WARNING /  | |
| 1C: Recommendations Display | [yes] / WARNING /  | |
| 1D: Data Persistence | [yes] / WARNING /  | |
| 1E: Console & Analytics | [yes] / WARNING /  | |
| 1F: Clinician Path | [yes] / WARNING /  | |
| **Subtotal** | | |

### Tablet (768px)

| Test | Result | Notes |
|------|--------|-------|
| 3: Responsive Design | [yes] / WARNING /  | |
| **Subtotal** | | |

### Mobile (375px)

| Test | Result | Notes |
|------|--------|-------|
| 4: Responsive Design | [yes] / WARNING /  | |
| **Subtotal** | | |

### Caregiver Path (Any Device)

| Test | Result | Notes |
|------|--------|-------|
| 5: Caregiver Path | [yes] / WARNING /  | |
| **Subtotal** | | |

### Additional Tests

| Test | Result | Notes |
|------|--------|-------|
| 6: Mobile Gestures | [yes] / WARNING /  | |
| 7A: Select All Layers | [yes] / WARNING /  | |
| 7B: Minimal Preferences | [yes] / WARNING /  | |
| 7C: Clear & Reload | [yes] / WARNING /  | |
| 7D: Form Reset | [yes] / WARNING /  | |
| 8: CSS & Styling | [yes] / WARNING /  | |
| 9: Keyboard Navigation | [yes] / WARNING /  | |
| 10: Cross-Browser Consistency | [yes] / WARNING /  | |
| **Subtotal** | | |

---

## Detailed Results

### Test 1A: Form Rendering & Flow

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Hero section loads: [ ] Yes [ ] No
- Button visible: [ ] Yes [ ] No
- Modal appears on click: [ ] Yes [ ] No
- Step 1 displays correctly: [ ] Yes [ ] No
- Step 2 displays correctly: [ ] Yes [ ] No
- Step 3 displays correctly: [ ] Yes [ ] No
- Step 4 displays correctly: [ ] Yes [ ] No
- Progress bar works: [ ] Yes [ ] No

**Notes:**
[Enter any notes about this test]

---

### Test 1B: Form Input & Validation

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Step 1 validation works: [ ] Yes [ ] No
- Step 2 optional (no validation): [ ] Yes [ ] No
- Step 3 validation works: [ ] Yes [ ] No
- Step 4 completion works: [ ] Yes [ ] No
- Error messages clear: [ ] Yes [ ] No
- Form advances properly: [ ] Yes [ ] No

**Notes:**
[Enter any notes about this test]

---

### Test 1C: Recommendations Display

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Banner appears: [ ] Yes [ ] No
- Header text correct: [ ] Yes [ ] No
- Top 5 tools listed: [ ] Yes [ ] No
- Reasoning text present: [ ] Yes [ ] No
-  badges visible: [ ] Yes [ ] No
- Badge tooltips work: [ ] Yes [ ] No
- Banner can be closed: [ ] Yes [ ] No

**Notes:**
[Enter any notes about this test]

---

### Test 1D: Data Persistence

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- localStorage key exists: [ ] Yes [ ] No
- JSON structure correct: [ ] Yes [ ] No
- Data persists after reload: [ ] Yes [ ] No
- Clear preferences works: [ ] Yes [ ] No
- Data removed after clear: [ ] Yes [ ] No
- Banner gone after clear: [ ] Yes [ ] No

**Notes:**
[Enter any notes about this test]

---

### Test 1E: Console & Analytics

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- No console errors: [ ] Yes [ ] No
- No TypeScript errors: [ ] Yes [ ] No
- Analytics events fire: [ ] Yes [ ] No [ ] N/A
- Event names correct: [ ] Yes [ ] No [ ] N/A

**Notes:**
[Enter any notes about this test]

---

### Test 1F: Clinician Path (No Regression)

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Existing tools visible: [ ] Yes [ ] No
- Tools work normally: [ ] Yes [ ] No
- No new errors: [ ] Yes [ ] No
- Personalize button still visible: [ ] Yes [ ] No
- Button works on second use: [ ] Yes [ ] No

**Notes:**
[Enter any notes about this test]

---

### Test 2: Desktop Safari (1920px)

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Summary:**
[Brief summary of Safari testing results]

**Safari-Specific Issues (if any):**
- [ ] [Issue 1]
- [ ] [Issue 2]

**Differences from Chrome (if any):**
[Note any differences]

---

### Test 3: Tablet (768px)

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Hero section responsive: [ ] Yes [ ] No
- Modal fits viewport: [ ] Yes [ ] No
- Form inputs touch-friendly: [ ] Yes [ ] No
- No horizontal scroll: [ ] Yes [ ] No
- Banner fits width: [ ] Yes [ ] No
- Tool cards readable: [ ] Yes [ ] No
- Scrolling smooth: [ ] Yes [ ] No

**Notes:**
[Enter any notes about tablet testing]

---

### Test 4: Mobile (375px)

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Hero stacks vertically: [ ] Yes [ ] No
- Button visible: [ ] Yes [ ] No
- Modal fits viewport: [ ] Yes [ ] No
- Form inputs tappable (44px+): [ ] Yes [ ] No
- Text readable: [ ] Yes [ ] No
- NO horizontal scroll: [ ] Yes [ ] No
- Banner fits width: [ ] Yes [ ] No
- Tool cards single column: [ ] Yes [ ] No

**Critical Mobile Issues (if any):**
- [ ] [Issue 1]
- [ ] [Issue 2]

**Notes:**
[Enter any notes about mobile testing]

---

### Test 5: Caregiver Path

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Form accepts "Caregiver" selection: [ ] Yes [ ] No
- Recommendations change for caregiver: [ ] Yes [ ] No
- Reasoning mentions caregiver: [ ] Yes [ ] No
- localStorage reflects caregiver: [ ] Yes [ ] No

**Notes:**
[Enter any notes about caregiver path testing]

---

### Test 6: Mobile Gestures

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Form scrolling works: [ ] Yes [ ] No
- Button tapping accurate: [ ] Yes [ ] No
- Swiping doesn't close modal: [ ] Yes [ ] No
- Focus management logical: [ ] Yes [ ] No

**Notes:**
[Enter any notes about mobile gesture testing]

---

### Test 7: Edge Cases

**7A: Select All Layers**
- [ ] [yes] PASS [ ] WARNING WARNING [ ]  FAIL
- Notes: [Any notes]

**7B: Minimal Preferences**
- [ ] [yes] PASS [ ] WARNING WARNING [ ]  FAIL
- Notes: [Any notes]

**7C: Clear & Reload**
- [ ] [yes] PASS [ ] WARNING WARNING [ ]  FAIL
- Notes: [Any notes]

**7D: Form Reset**
- [ ] [yes] PASS [ ] WARNING WARNING [ ]  FAIL
- Notes: [Any notes]

---

### Test 8: CSS & Styling

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Focus rings visible: [ ] Yes [ ] No
- No horizontal scroll: [ ] Yes [ ] No
- Banner contrast adequate: [ ] Yes [ ] No
- Button states clear: [ ] Yes [ ] No
- No overlapping elements: [ ] Yes [ ] No

**Notes:**
[Enter any notes about styling]

---

### Test 9: Keyboard Navigation

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Details:**
- Tab order logical: [ ] Yes [ ] No
- Enter key submits: [ ] Yes [ ] No
- Escape closes modal: [ ] Yes [ ] No [ ] Not implemented
- Focus always visible: [ ] Yes [ ] No
- Labels associated with inputs: [ ] Yes [ ] No

**Notes:**
[Enter any notes about keyboard navigation]

---

### Test 10: Cross-Browser Consistency

**Result:** [yes] PASS / WARNING WARNING /  FAIL

**Browsers Tested:**
- [ ] Chrome
- [ ] Safari
- [ ] Firefox
- [ ] Other: [List]

**Consistency Results:**
- Form styling identical: [ ] Yes [ ] No
- localStorage works all browsers: [ ] Yes [ ] No
- Modal positioning consistent: [ ] Yes [ ] No
- Tooltips work all browsers: [ ] Yes [ ] No
- No browser-specific issues: [ ] Yes [ ] No

**Notes:**
[Enter any inconsistencies found]

---

## Issues Found

### Critical Issues (Blocking)

**Issue #1**
```
Test: [Number]
Device: [Device/Browser/Viewport]
Severity: CRITICAL

Title: [Short title]

Description:
[Detailed description]

Expected Behavior:
[What should happen]

Actual Behavior:
[What actually happens]

Steps to Reproduce:
1. [Step]
2. [Step]
3. [Step]

Impact:
[How does this affect users?]

Suggested Fix:
[Possible solution]
```

**Issue #2**
[Similar format]

### Major Issues

**Issue #1**
[Similar format]

### Minor Issues / Warnings

**Warning #1**
```
Test: [Number]
Device: [Device/Browser/Viewport]
Severity: MINOR

Title: [Short title]

Description:
[Description]

Impact:
[Non-blocking, cosmetic, or low-impact]
```

---

## Pass/Fail Summary

### By Test Category

| Category | Pass | Warning | Fail | Total |
|----------|------|---------|------|-------|
| Desktop Chrome | _/6 | _/6 | _/6 | 6 |
| Desktop Safari | _/6 | _/6 | _/6 | 6 |
| Tablet | _/1 | _/1 | _/1 | 1 |
| Mobile | _/1 | _/1 | _/1 | 1 |
| Caregiver | _/1 | _/1 | _/1 | 1 |
| Gestures | _/1 | _/1 | _/1 | 1 |
| Edge Cases | _/4 | _/4 | _/4 | 4 |
| Styling | _/1 | _/1 | _/1 | 1 |
| Keyboard | _/1 | _/1 | _/1 | 1 |
| Cross-Browser | _/1 | _/1 | _/1 | 1 |
| **TOTAL** | **_** | **_** | **_** | **24** |

### By Severity

| Severity | Count | Examples |
|----------|-------|----------|
| Critical (Blocking) | ___ | [List issues] |
| Major (High Priority) | ___ | [List issues] |
| Minor (Low Priority) | ___ | [List issues] |
| Warnings (Cosmetic) | ___ | [List issues] |

---

## Recommendations

### Immediate Actions Required

1. [ ] [Fix critical issue #1]
2. [ ] [Fix critical issue #2]
3. [ ] [Test fix to verify resolution]

### Before Next Release

1. [ ] [Fix major issue #1]
2. [ ] [Fix major issue #2]
3. [ ] [Consider minor issue #1]

### Future Improvements

1. [ ] [Enhancement idea #1]
2. [ ] [Enhancement idea #2]

---

## Sign-Off

**Tester Name:** [Your Name]  
**Date Tested:** [Date]  
**Time Spent:** [Hours]  
**Browsers Tested:** [List]  
**Devices Tested:** [List]  

**Overall Assessment:**
[ ] Ready for production
[ ] Ready after critical fixes (ETA: [date])
[ ] Needs more testing
[ ] Major issues require design review

**Notes for Development Team:**
[Any additional context or observations]

**Tester Signature:** ________________  
**Date:** ________________

---

## Appendix: Test Evidence

### Screenshots

If you took screenshots of issues, reference them here:
- [Issue #1 screenshot: screenshot_1_mobile_cutoff.png]
- [Issue #2 screenshot: screenshot_2_safari_error.png]

### Console Logs

If you captured console errors, include them:
```
[Paste console errors or logs here]
```

### Detailed Notes

Additional observations not captured above:
[Add any detailed notes or observations]

---

**Report Generated:** 2026-03-17  
**Document Version:** 1.0  
**Report ID:** PH2-TESTING-[DATE]-[TESTER]


---

## Source: `02_Clinical_Skills/Interviewing/README.md`

# Interviewing

<!-- APA-SURFACE-CARD (auto 2026-06-29) -->
## APA references - linked, not copied

- **[DSM-5-TR Cultural Formulation Interview](../../13_Faculty_Resources/APA_Downloads_2026-06-29/files/fc42b3bcdc_APA-DSM5TR-CulturalFormulationInterview.pdf)** - 16-question structured interview eliciting the patient's cultural understanding of illness.  
  *APA source:* https://www.psychiatry.org/getmedia/5cc5329d-3bd4-4c6a-bae1-dfd0d6496f44/APA-DSM5TR-CulturalFormulationInterview.pdf * *License:* APA free-use measure


---

## Source: `02_Clinical_Skills/README.md`

# 02 * Clinical Skills
Core bedside competencies. Several are the highest-yield gaps in the whole library.

| Subfolder | Status | Anchor / action |
|---|---|---|
| Interviewing |  Expand | video scripts + Gen Psych decks -> author interviewing module (+ agitated/guarded, trauma-informed) |
| Mental_Status_Exam |  **Create (P1)** | Only `Appearance Behavior.pdf` fragment exists -> author module + pocket card + annotated exemplar |
| Case_Formulation |  Expand | Biopsychosocial formulation samples (iCloud Gen Psych) + FTM relational-formulation figure -> worksheet |
| Documentation |  Expand | `psychiatric-documentation-template.md` (iCloud Clinical Tools) -> student note exemplars + checklist |
| Oral_Presentations |  **Create (P1)** | Author "present a psych patient in 3 min" + rounds-prep card |
| Differential_Diagnosis |  Create | DDx scaffolds for top 8 unit presentations |
| Reflection_PIF |  Create | 6 weekly reflection prompts + ethics/professional-identity set |

**Status tags:** [yes] Exists *  Revise *  Expand *  Create *  Merge *  Archive


---

## Source: `02_Clinical_Skills/Screeners/README.md`

# Screeners

<!-- APA-SURFACE-CARD (auto 2026-06-29) -->
## APA references - linked, not copied

- **[DSM-5-TR Level 1 Cross-Cutting Symptom Measure (Adult)](../../13_Faculty_Resources/APA_Downloads_2026-06-29/files/260bb4400e_APA-DSM5TR-Level1MeasureAdult.pdf)** - 23-item, 13-domain self-report screen across psychiatric domains.  
  *APA source:* https://www.psychiatry.org/getmedia/e0b4b299-95b3-407b-b8c2-caa871ca218d/APA-DSM5TR-Level1MeasureAdult.pdf * *License:* APA free-use measure
