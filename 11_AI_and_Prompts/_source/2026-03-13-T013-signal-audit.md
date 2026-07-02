# T-013 Signal Audit — Week 11 Discharge Roadmap

**Date:** 2026-03-13 (updated 2026-03-14)
**Owner:** Claude T-012 / T-013 lane
**Status:** Complete — canonical source-of-truth table for Week 11, with routing-role decisions now frozen on `main`
**Status:** Complete — suite-wide signal coverage achieved as of commit `4401ba2` (2026-03-14)

---

## Purpose

This audit publishes the canonical signal table from **shipped code only**. Codex must reference this table verbatim in the routing design doc. No speculative signal names are used.

As of commit `4401ba2` (2026-03-14), every production tool in the suite emits signals. There are no remaining signal-coverage gaps.

---

## 1. Complete Signal Inventory (Shipped Code)

### 1A. Native Signal Emitters (19 unique types across 7 tools)

| Signal Type | Source Tool | RSS Layer | Intensity | Value Shape | File |
|---|---|---|---|---|---|
| `checkin_completed` | Recovery Companion | L2 | 1 | completion flag | recovery-companion.app.jsx |
| `distress_level_recorded` | Recovery Companion | L2 | 2 | numeric (0–10) | recovery-companion.app.jsx |
| `safety_plan_used` | Recovery Companion | L1 | 3 | completion flag | recovery-companion.app.jsx |
| `what_to_expect_viewed` | Recovery Companion | L4 | 1 | completion flag | recovery-companion.app.jsx |
| `skill_recommended` | Spin the Skill | L2 | 1 | skill name | spin-the-skill.app.jsx |
| `skill_completed` | Spin the Skill | L2 | 2 | skill name | spin-the-skill.app.jsx |
| `skill_usefulness_rated` | Spin the Skill | — | 1 | rating value | spin-the-skill.app.jsx |
| `drift_alert` | Drift Detector | L4 | 2 | alert category | drift-detector.app.jsx |
| `course_correction_completed` | Drift Detector | L4 | 2 | correction type | drift-detector.app.jsx |
| `appointment_added` | Discharge Roadmap | L4 | 2 | datetime ISO | discharge-roadmap.app.jsx |
| `med_plan_completed` | Discharge Roadmap | L1 | 3 | confidence score | discharge-roadmap.app.jsx |
| `warning_signs_defined` | Discharge Roadmap | L2 | 2 | first sign text | discharge-roadmap.app.jsx |
| `support_people_added` | Discharge Roadmap | L3 | 2 | supporter name | discharge-roadmap.app.jsx |
| `seventy_two_hour_plan_completed` | Discharge Roadmap | L4 | 3 | `true` | discharge-roadmap.app.jsx |
| `coping_card_saved` | Coping Deck | per-card layer | 1 | card title | Coping_Deck.app.jsx |
| `family_need_identified` | Check-In Wheel | L3 | 1 | need value | Check_In_Wheel.app.jsx |
| `family_checkin_completed` | Check-In Wheel | L3 | 2 | `null` | Check_In_Wheel.app.jsx |
| `prescription_generated` | Psychoed Prescription Pad | L2 | 1 | total item count | Psychoed_Prescription_Pad.app.jsx |
| `prescription_exported` | Psychoed Prescription Pad | L2 | 2 | format (print/csv) | Psychoed_Prescription_Pad.app.jsx |

> `family_checkin_completed` is emitted by both Check-In Wheel (native) and Family Pulse (bridged). Both contribute to the Bridges region score in `rc-relational-state.js`.

### 1B. Bridged Signal Types (9 types via rc-signal-bridge.js)

| Signal Type | Source Tool (bridge origin) | RSS Layer | Intensity | Bridge Map |
|---|---|---|---|---|
| `conflict_type_selected` | Common Ground Lite | L3 | 1 | CGL_MAP |
| `deescalation_script_viewed` | Common Ground Lite | L3 | 1 | CGL_MAP |
| `repair_step_selected` | Common Ground Lite | L3 | 1 | CGL_MAP |
| `family_checkin_completed` | Family Pulse | L3 | 1 | FP_MAP |
| `family_conflict_logged` | Family Pulse | L3 | 1 | FP_MAP |
| `connection_moment_logged` | Family Pulse | L3 | 1 | FP_MAP |
| `supporter_selected` | Shared Calm Mode | L3 | 1 | SCM_MAP |
| `co_regulation_completed` | Shared Calm Mode | L3 | 2 | SCM_MAP |
| `pause_plan_created` | Shared Calm Mode | L3 | 2 | SCM_MAP |

**Total: 19 native types across 7 tools + 9 bridged types across 3 tools = 28 shipped signal types** (27 unique, since `family_checkin_completed` appears in both native and bridged)

---

## 2. Routing-Relevant Signals

These are the signals that `deriveContinuityRoute()` uses for route determination (from `discharge-roadmap.app.jsx` lines 246–247, 290–308):

### Safety-route signals (`CONTINUITY_SAFETY_SIGNAL_TYPES` in code)

| Signal Type | Source | Effect in `deriveContinuityRoute` |
|---|---|---|
| `safety_plan_used` | Recovery Companion (native) | Pushes to `safety-first` |
| `distress_level_recorded` | Recovery Companion (native) | `>= 7` pushes to `safety-first`; also general safety presence check |

> `warning_signs_defined` was removed from this array (§4.3) to prevent sticky false-positive safety routing. Safety routing now uses the `warningSignsPlan` context field for current-session state.

### Repair-route signals (`CONTINUITY_REPAIR_SIGNAL_TYPES` in code)

| Signal Type | Source | Effect in `deriveContinuityRoute` |
|---|---|---|
| `co_regulation_completed` | Shared Calm Mode (bridged) | Supports `repair-first` when no safety markers |
| `conflict_type_selected` | Common Ground Lite (bridged) | Supports `repair-first` when no safety markers |
| `repair_step_selected` | Common Ground Lite (bridged) | Supports `repair-first` when no safety markers |
| `deescalation_script_viewed` | Common Ground Lite (bridged) | Supports `repair-first` when no safety markers |
| `pause_plan_created` | Shared Calm Mode (bridged) | Supports `repair-first` when no safety markers |

### Additional routing inputs (non-signal)

| Field | Source | Effect |
|---|---|---|
| `workflowContext.layer === 'L1'` | `readWorkflowContext()` | Pushes to `safety-first` |
| `workflowContext.warningSignsPlan` (has entries) | `readWorkflowContext()` | Pushes to `safety-first` |

### Context-only signals (no routing effect)

| Signal Type | Notes |
|---|---|
| `checkin_completed` | General engagement; not a route driver |
| `what_to_expect_viewed` | Discharge-orientation engagement; not a route driver |
| `family_conflict_logged` | Keeps conflict-sensitive framing; may remain `standard` if no acute markers |

### Output-only signals (emitted by Discharge Roadmap, not consumed for routing)

| Signal Type | Notes |
|---|---|
| `appointment_added` | Downstream continuity only |
| `med_plan_completed` | Downstream continuity only |
| `support_people_added` | Downstream continuity only |
| `seventy_two_hour_plan_completed` | Downstream continuity only |

### Not consumed for routing

| Signal Type | Notes |
|---|---|
| `skill_recommended` | Spin the Skill; no routing contract |
| `skill_completed` | Spin the Skill; no routing contract |
| `skill_usefulness_rated` | Spin the Skill; no routing contract |
| `drift_alert` | Drift Detector; no routing contract |
| `course_correction_completed` | Drift Detector; no routing contract |
| `family_checkin_completed` | Family Pulse / Check-In Wheel; Relational State Map scoring only |
| `family_need_identified` | Check-In Wheel; Relational State Map scoring only |
| `connection_moment_logged` | Family Pulse; context enrichment only |
| `supporter_selected` | Shared Calm Mode; context enrichment only |
| `coping_card_saved` | Coping Deck; Relational State Map scoring only |
| `prescription_generated` | Psychoed Prescription Pad; Relational State Map scoring only |
| `prescription_exported` | Psychoed Prescription Pad; Relational State Map scoring only |

---

## 3. Speculative Signal Names — Confirmed Absent

The following signal names are **explicitly invalid** for Week 11 and are confirmed absent from all shipped code:

| Invalid Name | Confirmed Absent |
|---|---|
| `conflict.paused` | ✓ Not in any JSX, bridge, or shared lib |
| `repair.lab.completed` | ✓ Not in any JSX, bridge, or shared lib |
| `cycle.mapped` | ✓ Not in any JSX, bridge, or shared lib |
| `family.pulse.harmony` | ✓ Not in any JSX, bridge, or shared lib |
| `safety.plan.updated` | ✓ Not in any JSX, bridge, or shared lib |

---

## 4. Routing-Role Decisions On Current `main`

The earlier discrepancy snapshot is now resolved on current `main` and frozen by `2026-03-13-week11-routing-decision-memo.md`.

### 4.1 `conflict_type_selected`

- **Decision:** keep as a `repair-first` routing signal
- **Current main status:** included in `CONTINUITY_REPAIR_SIGNAL_TYPES`

### 4.2 `pause_plan_created`

- **Decision:** keep as a `repair-first` routing signal
- **Current main status:** included in `CONTINUITY_REPAIR_SIGNAL_TYPES`

### 4.3 `warning_signs_defined`

- **Decision:** output-only, not a route-driving safety signal
- **Current main status:** excluded from `CONTINUITY_SAFETY_SIGNAL_TYPES`; `warningSignsPlan` context state remains the relevant safety input
Three discrepancies were identified between the routing design doc and shipped code. **All three resolved on 2026-03-13** (commit `6e159db`).

### 4.1 `conflict_type_selected` — RESOLVED

**Was:** In code's `CONTINUITY_REPAIR_SIGNAL_TYPES` but missing from design doc routing table.

**Resolution:** Design doc updated to include `conflict_type_selected` in both the canonical signal table (line 63) and repair-first route rules (line 109). Code and doc now match.

### 4.2 `pause_plan_created` — RESOLVED

**Was:** In design doc as repair signal but missing from code's `CONTINUITY_REPAIR_SIGNAL_TYPES`.

**Resolution:** Code updated to add `pause_plan_created` to `CONTINUITY_REPAIR_SIGNAL_TYPES`. Code and doc now match.

### 4.3 `warning_signs_defined` — RESOLVED

**Was:** In code's `CONTINUITY_SAFETY_SIGNAL_TYPES` but design doc marked it as output-only, creating sticky false-positive safety routing from prior sessions.

**Resolution:** Removed `warning_signs_defined` from `CONTINUITY_SAFETY_SIGNAL_TYPES`. Safety array now contains only `['safety_plan_used', 'distress_level_recorded']`. Safety routing relies on `warningSignsPlan` context field for current-session state, not stale signal history. Code and doc now match.

---

## 5. Continuity Signal Filter Shape

`listRecentContinuitySignals()` (lines 274–288) filters the RCSignals list with:

- **Source tool match:** `CONTINUITY_SIGNAL_SOURCES = ['recovery-companion', 'shared-calm-mode', 'common-ground-lite']`
- **OR signal type match:** `CONTINUITY_SAFETY_SIGNAL_TYPES` or `CONTINUITY_REPAIR_SIGNAL_TYPES`

This means signals from Family Pulse (bridged as source tool `'family-pulse'`) only pass through if their `signalType` matches a safety or repair type. Currently no Family Pulse signal types are in those arrays, so Family Pulse signals are **not** consumed for routing. `family_conflict_logged` does not route.

**Query limit:** `{ limit: 40 }` — well within the 250-event FIFO cap.

---

## 6. Context Fields Available for Week 11

From `RCContextUI.readWorkflowContext()`:

| Field | Available | Use in Routing |
|---|---|---|
| `diagnosis` | ✓ | Informational context only |
| `category` | ✓ | Informational context only |
| `layer` | ✓ | **Strongest route signal** — `L1` pushes to `safety-first` |
| `dischargeDate` | ✓ | Informational / sequencing |
| `screeningScores` | ✓ | Future content hints only |
| `resources` | ✓ | Support-depth / resource emphasis |
| `medications` | ✓ | Readiness / planning support |
| `bundleItems` | ✓ | Continuity carry-forward |
| `warningSignsPlan` | ✓ | **Safety marker** — has-entries pushes to `safety-first` |
| `handoff` | ✓ | Continuity carry-forward |
| `familyDynamics` | ✓ | Caregiver-overwhelm / support-complexity hint |

### Explicitly unavailable for Week 11

| Field | Status |
|---|---|
| `relational_state_v1` | Not in `readWorkflowContext()` |
| `trust_level` | Not available |
| `role_clarity` | Not available |
| `communication_patterns` | Not available |
| `family_coordination` | Not available |

---

## 7. `emitOnce` Deduplication Semantics

The three newly wired tools (Coping Deck, Check-In Wheel, Psychoed Prescription Pad) use `RCSignals.emitOnce(key, event)`. The `emitOnce` call stores the key in a separate dedup registry and silently drops subsequent calls with the same key.

**Key construction patterns:**

| Tool | Key pattern | Dedup effect |
|---|---|---|
| Coping Deck | `coping-deck:save:{cardId}` | One signal per unique card saved |
| Check-In Wheel | `check-in-wheel:need:{memberKey}` | One signal per member per round |
| Check-In Wheel | `check-in-wheel:complete:{dateString}` | One signal per calendar day |
| Psychoed Prescription Pad | `psychoed-pad:generate:{filters}` | One signal per unique filter combination |
| Psychoed Prescription Pad | `psychoed-pad:print:{timestamp}` | One signal per print action |
| Psychoed Prescription Pad | `psychoed-pad:csv:{timestamp}` | One signal per CSV export action |

**Interpretation impact:**
- Signal counts from these tools reflect **unique meaningful actions**, not raw click volume
- Re-saving the same coping card or re-generating the same prescription does not produce a second signal
- Monitoring dashboards should not interpret flat counts from these tools as low engagement — check the dedup key pattern first

---

## 8. Future Work

| Item | Resolution Path |
|---|---|
| `pause_plan_created` routing role | Resolved on current `main`; preserve in repair-routing set |
| `conflict_type_selected` routing role | Resolved on current `main`; preserve in repair-routing set |
| `warning_signs_defined` dual role | Resolved on current `main`; keep output-only and rely on `warningSignsPlan` context state |
| ~~`pause_plan_created` routing role~~ | Resolved — added to code repair array (§4.2) |
| ~~`conflict_type_selected` routing role~~ | Resolved — added to design doc (§4.1) |
| ~~`warning_signs_defined` dual role~~ | Resolved — removed from safety array (§4.3) |
| `family_conflict_logged` routing potential | Currently context-only; could support repair-first in future |
| `relational_state_v1` fields | Separate shared-lib expansion; not Week 11 |
| Family Pulse source-tool passthrough | Bridge writes `'family-pulse'` as source tool, not in `CONTINUITY_SIGNAL_SOURCES` — intentional or gap? |
| Screening score routing | `screeningScores` available but not used for routing in Week 11 |
| Dashboard card coverage for new tools | Coping Deck, Check-In Wheel, and Psychoed Prescription Pad feed Relational State Map scoring but are not yet first-class dashboard cards in the Analytics Dashboard |

---

## 9. Acceptance Criteria Met

- [x] Canonical signal table published from shipped code only
- [x] No speculative signal names used
- [x] All 5 explicitly-invalid signal names confirmed absent
- [x] Routing-role discrepancies resolved and frozen against current `main`
- [x] Gaps listed as future work, not Week 11 assumptions
- [x] Signal availability confirmed within 250-event cap (40-event query limit)
- [x] Context fields validated against `readWorkflowContext()` shape
