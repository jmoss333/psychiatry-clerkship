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
