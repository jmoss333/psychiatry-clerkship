# Signal Coverage Audit — T-013

> **Date:** 2026-03-12
> **Author:** Claude Code (T-013 Sprint Task)
> **Scope:** All production tools under `tools-suite/tools/`

## Architecture Summary

ReConnect uses **two communication layers** for cross-tool continuity:

| Layer | Library | Purpose | Persistence |
|-------|---------|---------|-------------|
| **Context Bus** | `rc-context.js` | Session state (patient hash, screening results, discharge dates) shared via BroadcastChannel | 8-hour session, SHA-256 patient hash |
| **Signal Bus** | `rc-signals.js` | Clinical event history with intensity-weighted signals feeding the Relational State Map | localStorage, 250-event rolling history |

**Key distinction:** Wave 1-2 tools use `RCSignals.emit()` / `RCSignals.emitOnce()`. Wave 3 tools (precompiled JSX) use `emitMeaningfulEvent()` with `ALLOWED_EVENTS` whitelisting and `rcAnalytics.track()` persistence.

---

## Signal Coverage Matrix

### Tools That EMIT Signals

| Tool | Signal Bus | Signal Types Emitted | RSS Layer | Intensity |
|------|-----------|---------------------|-----------|-----------|
| **Discharge Roadmap** | `RCSignals` | `appointment_added` | L4 | 2 |
| | | `med_plan_completed` | L1 | 3 |
| | | `warning_signs_defined` | L2 | 2 |
| | | `support_people_added` | L3 | 2 |
| | | `seventy_two_hour_plan_completed` | L4 | 3 |
| **Spin the Skill** | `RCSignals` | `skill_recommended` | L2 | 1 |
| | | `skill_completed` | L2 | varies |
| | | `skill_usefulness_rated` | L2 | 1-3 |
| **Recovery Companion** | `RCSignals` | `checkin_completed` | L2 | 1-3 |
| | | `distress_level_recorded` | L2 | 1-3 |
| | | `safety_plan_used` | L1 | varies |
| | | `what_to_expect_viewed` | L2 | varies |
| **Drift Detector** | `RCSignals` | `drift_alert` | varies | varies |
| | | `course_correction_completed` | varies | 2 |
| **Common Ground Lite** | `emitMeaningfulEvent` | `conflict_type_selected` | — | — |
| | | `deescalation_script_viewed` | — | — |
| | | `repair_step_selected` | — | — |
| **Shared Calm Mode** | `emitMeaningfulEvent` | `supporter_selected` | — | — |
| | | `co_regulation_completed` | — | — |
| | | `pause_plan_created` | — | — |
| **Family Pulse** | `emitMeaningfulEvent` | `family_checkin_completed` | — | — |
| | | `family_conflict_logged` | — | — |
| | | `connection_moment_logged` | — | — |

### Tools That CONSUME Signals

| Tool | Consumption Method | What It Does |
|------|-------------------|--------------|
| **Relational State Map** | `RCRSSMap.aggregate()` via `rc-relational-state.js` | Reads 14-day signal history, maps to 4 relational regions (ground/weather/bridges/paths), computes 0-100 scores, generates tool recommendations |

### Tools That WRITE Context (No Signals)

| Tool | Context Keys Written |
|------|---------------------|
| **Screening Router** | `relationalScreen`, `concern`, `layer`, `familyDynamics` |
| **Discharge Bundle Generator** | `bundleItems`, `dischargeDate` |
| **Discharge Roadmap** | `dischargeDate`, `warningSignsPlan`, `custom.roadmapSupportPeople`, `custom.roadmapRole`, `custom.first72Hours`, `custom.familyAgreementReady` |

### Tools With NO Signal Integration

| Tool | Current Integration | Gap |
|------|-------------------|-----|
| **Coping Deck** | `rc-context.js` + `rc-context-integration.js` (context bus only) | No signal emission for card views, saves, or strategy selections |
| **Check-In Wheel** | `rc-context.js` + `rc-context-integration.js` (context bus only) | No signal emission for family check-in completions or emotion/need selections |
| **Psychoed Prescription Pad** | `rc-context.js` (context bus only) | No signal emission for prescription generation, print, or export events |

---

## Signal-to-Region Mapping (Relational State Map)

The `rc-relational-state.js` aggregator maps signals to 4 relational regions:

| Region | RSS Layer | Positive Signals (strengthen) | Negative Signals (weaken) |
|--------|-----------|------------------------------|--------------------------|
| **Ground** | L1 | `med_plan_completed`, `safety_plan_used` | — |
| **Weather** | L2 | `checkin_completed`, `warning_signs_defined`, `skill_recommended`, `skill_completed` (high rating), `co_regulation_completed`, `course_correction_completed` | `drift_alert` |
| **Bridges** | L3 | `support_people_added`, `connection_moment_logged` | `family_conflict_logged` |
| **Paths** | L4 | `appointment_added`, `seventy_two_hour_plan_completed` | — |

**Scoring:** intensity 1 = +/-5, intensity 2 = +/-10, intensity 3 = +/-15. Decay: -10 if no supportive signal in 7 days, -5 if none in 72h.

**Dynamic polarity:** `distress_level_recorded` (>=8 negative, else positive), `skill_usefulness_rated` (>=4 positive, else negative).

---

## Gap Analysis

### 1. Wave 3 Signal Bus Mismatch
**Issue:** Wave 3 tools (Common Ground Lite, Shared Calm Mode, Family Pulse) use `emitMeaningfulEvent()` + `rcAnalytics.track()`, but the Relational State Map aggregator reads from `RCSignals` localStorage history.

**Impact:** Wave 3 tool events are NOT currently consumed by the Relational State Map. The `family_conflict_logged` and `connection_moment_logged` events from Family Pulse and the `co_regulation_completed` from Shared Calm Mode appear in the region mapping table but may not flow through correctly.

**Recommendation:** Either (a) bridge `emitMeaningfulEvent` to also call `RCSignals.emit()`, or (b) update `rc-relational-state.js` to also read from `rcAnalytics` storage.

### 2. New Tools Have No Signal Emission
**Issue:** Coping Deck, Check-In Wheel, and Psychoed Prescription Pad do not load `rc-signals.js` or emit any signals.

**Recommended signals for each:**

| Tool | Proposed Signal | Layer | Trigger |
|------|----------------|-------|---------|
| **Coping Deck** | `coping_card_saved` | L2 | User saves a coping card |
| | `coping_strategy_viewed` | L2 | User flips a card to see steps |
| **Check-In Wheel** | `family_checkin_completed` | L2 | All wheels spun for a member |
| | `family_need_identified` | L3 | Need wheel result recorded |
| **Psychoed Prescription Pad** | `prescription_generated` | L4 | Clinician generates a prescription |
| | `prescription_exported` | L4 | Clinician prints or exports |

### 3. L1 (Biological/Ground) Signal Sparsity
**Issue:** Only 2 signal types strengthen Ground: `med_plan_completed` and `safety_plan_used`. This makes the Ground region score heavily dependent on Discharge Roadmap completion and crisis events.

**Recommendation:** Consider adding L1 signals from Recovery Companion (sleep tracking, medication adherence prompts) if those features exist.

### 4. L3 (Relational/Bridges) Limited Positive Sources
**Issue:** Only `support_people_added` (Discharge Roadmap) and `connection_moment_logged` (Family Pulse, but may not flow through — see Gap 1) strengthen Bridges. The `family_conflict_logged` negative signal has no matching repair signal.

**Recommendation:** Wire Common Ground Lite's `repair_step_selected` as a positive L3 Bridge signal, since conflict repair directly strengthens relational containment.

### 5. No Bidirectional Signal Flow
**Issue:** All tools emit unidirectionally. No tool adjusts its behavior based on signals from other tools (except Relational State Map, which only displays recommendations).

**Recommendation:** Low priority for now — the Relational State Map serves as the hub. Future: Recovery Companion could surface contextual prompts based on recent signals.

---

## Unique Signal Type Inventory (21 total)

| # | Signal Type | Source Tool(s) |
|---|-------------|---------------|
| 1 | `appointment_added` | Discharge Roadmap |
| 2 | `med_plan_completed` | Discharge Roadmap |
| 3 | `warning_signs_defined` | Discharge Roadmap |
| 4 | `support_people_added` | Discharge Roadmap |
| 5 | `seventy_two_hour_plan_completed` | Discharge Roadmap |
| 6 | `skill_recommended` | Spin the Skill |
| 7 | `skill_completed` | Spin the Skill |
| 8 | `skill_usefulness_rated` | Spin the Skill |
| 9 | `checkin_completed` | Recovery Companion |
| 10 | `distress_level_recorded` | Recovery Companion |
| 11 | `safety_plan_used` | Recovery Companion |
| 12 | `what_to_expect_viewed` | Recovery Companion |
| 13 | `drift_alert` | Drift Detector |
| 14 | `course_correction_completed` | Drift Detector |
| 15 | `conflict_type_selected` | Common Ground Lite |
| 16 | `deescalation_script_viewed` | Common Ground Lite |
| 17 | `repair_step_selected` | Common Ground Lite |
| 18 | `supporter_selected` | Shared Calm Mode |
| 19 | `co_regulation_completed` | Shared Calm Mode |
| 20 | `pause_plan_created` | Shared Calm Mode |
| 21 | `family_checkin_completed` | Family Pulse |
| 22 | `family_conflict_logged` | Family Pulse |
| 23 | `connection_moment_logged` | Family Pulse |

---

## Priority Recommendations

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Bridge Wave 3 `emitMeaningfulEvent` → `RCSignals` so Relational State Map can consume them | Medium | High — unlocks 9 Wave 3 signals for relational scoring |
| **P1** | Map `repair_step_selected` as positive L3 Bridge signal in `rc-relational-state.js` | Low | Medium — adds repair signal to balance `family_conflict_logged` |
| **P2** | Add `rc-signals.js` to Coping Deck + Check-In Wheel with proposed signals | Medium | Medium — extends signal coverage to patient-facing tools |
| **P3** | Add `rc-signals.js` to Psychoed Prescription Pad for clinician-side tracking | Low | Low — clinician workflow signal, less critical for relational scoring |
