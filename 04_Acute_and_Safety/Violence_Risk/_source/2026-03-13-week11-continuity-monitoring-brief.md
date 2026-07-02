# Week 11+ Continuity Monitoring Brief

Date: 2026-03-13 (updated 2026-03-14)
Branch: `codex/continuity-monitoring-brief`
Verified against source: 2026-03-13 (original verification); 2026-03-14 signal-coverage update (Coping Deck, Check-In Wheel, Psychoed Prescription Pad now emit signals)

## Purpose

Week 6 through Week 10 shipped the first continuity toolset, a continuity snapshot, and continuity-aware recommendations. Week 11+ should shift from shipping-only mode to steady monitoring:

- confirm continuity tools are still being opened and used
- confirm recommendation paths are still getting picked up
- catch event-quality drift before the dashboard silently undercounts
- keep a lightweight QA spot-audit cadence on the highest-risk surfaces

This brief stays inside the current event contracts. It does not propose new analytics events or shared-library changes.

## Current Coverage Snapshot

### Dashboard-visible today

`tools-suite/tools/ReConnect_Analytics_Dashboard.html` currently rolls up:

- continuity opens: `page_load` for tools in `CONTINUITY_TOOLS`
- recommendation clicks: `button_click` with targets matching `recommendation_*`
- continuity completions:
  - `feature_use` targets in `CONTINUITY_COMPLETION_TARGETS`
  - Common Ground Lite event names in `COMMON_GROUND_EVENT_TYPES`
- continuity snapshot cards from `RCRSSMap.aggregate(...)`

### Verified set memberships (source-of-truth)

These are the exact sets defined in `ReConnect_Analytics_Dashboard.html` that drive metric computation:

```
CONTINUITY_TOOLS = {
  'recovery-companion', 'discharge-roadmap', 'relational-state-map',
  'shared-calm-mode', 'family-pulse', 'spin-the-skill',
  'drift-detector', 'common-ground-lite'
}

CONTINUITY_COMPLETION_TARGETS = {
  'co_regulation_completed', 'pause_plan_created',
  'family_checkin_completed', 'family_conflict_logged',
  'connection_moment_logged'
}

COMMON_GROUND_EVENT_TYPES = {
  'conflict_type_selected', 'deescalation_script_viewed',
  'repair_step_selected'
}
```

Metric formulas (verified):
- **opens** = count of `page_load` events where `tool` is in `CONTINUITY_TOOLS`
- **recommendationClicks** = count of `button_click` events where `target` matches `/^recommendation_/`
- **completions** = count of `feature_use` events with `target` in `CONTINUITY_COMPLETION_TARGETS` + count of events with `event` name in `COMMON_GROUND_EVENT_TYPES`

### Raw-signal only today

These are emitted now but are not first-class continuity metric cards in the dashboard:

- Discharge Roadmap `signalType` events (all via `RCSignals.emitOnce`):
  - `appointment_added` (layer: L4)
  - `med_plan_completed` (layer: L1)
  - `warning_signs_defined` (layer: L2)
  - `support_people_added` (layer: L3)
  - `seventy_two_hour_plan_completed` (layer: L4)
- Recovery Companion `signalType` events (mix of `emitOnce` and per-occurrence):
  - `checkin_completed`
  - `distress_level_recorded`
  - `safety_plan_used`
  - `what_to_expect_viewed`

### Newly wired tools (added 2026-03-14, commit `4401ba2`)

Three tools that previously had no signal emission now emit via `RCSignals.emitOnce()`:

| Tool | Signal Types | RSS Layer | Intensity | Dedup Key Pattern |
|---|---|---|---|---|
| Coping Deck | `coping_card_saved` | per-card layer | 1 | `coping-deck:save:{cardId}` — one per unique card |
| Check-In Wheel | `family_need_identified`, `family_checkin_completed` | L3 | 1, 2 | per-member per round / one per day |
| Psychoed Prescription Pad | `prescription_generated`, `prescription_exported` | L2 | 1, 2 | per unique filter combo / per export action |

All five signal types are registered as positive in `rc-relational-state.js` and contribute to Relational State Map region scoring. They are **not** dashboard cards in the Analytics Dashboard and are **not** consumed for Discharge Roadmap continuity routing.

**`emitOnce` monitoring note:** These tools emit deduplicated signals keyed to unique meaningful actions, not raw click volume. Re-saving the same coping card or re-generating the same prescription does not produce a second signal. Do not interpret flat signal counts from these tools as low engagement without checking the dedup key pattern.

### Discharge Roadmap continuity routing (verified)

Discharge Roadmap reads incoming signals from `recovery-companion`, `shared-calm-mode`, and `common-ground-lite` to select one of three continuity route variants:

| Route | Trigger condition | Behavior |
|---|---|---|
| `SAFETY_FIRST` | Recent safety-plan signals or high distress | Prioritizes warning signs and 72-hour plan sections |
| `REPAIR_FIRST` | Recent conflict/repair signals from Common Ground Lite or Recovery Companion | Emphasizes relational prep and support-person planning |
| `STANDARD` | Default (no strong signal pattern) | Standard linear worksheet flow |

Discharge Roadmap also writes context back to `rc-context`:
- `dischargeDate`, `warningSignsPlan`, `custom.roadmapSupportPeople`, `custom.roadmapRole`, `custom.first72Hours`, `custom.familyAgreementReady`

This bi-directional context flow means that Discharge Roadmap drift can affect downstream tool behavior, not just its own completions.

### Notable analytics gap: Recovery Companion

Recovery Companion emits `RCSignals` events but has **no `rcAnalytics.track()` calls**. This means Recovery Companion opens do appear in the dashboard (via the suite-level `page_load` event), but no in-tool engagement events reach the analytics layer. Engagement is only visible through raw `RCSignals` inspection.

Additionally, Wave 3 repair/conflict screens (rupture logging, two-truths reflection, conflict replay, repair planning, cycle mapping) are defined in source but **do not emit signals yet**. When Wave 3 signal wiring ships, the signal inventory in this brief should be updated.

## Top 5 Metrics To Watch

| Metric | Why it matters | Exact source events | Where to review | Recommended owner | What to flag |
|---|---|---|---|---|---|
| 1. Continuity tool opens by tool | Confirms overall continuity adoption and quickly shows whether any shipped surface has gone cold. | `event === "page_load"` for tools in `CONTINUITY_TOOLS`: `recovery-companion`, `discharge-roadmap`, `relational-state-map`, `shared-calm-mode`, `family-pulse`, `spin-the-skill`, `drift-detector`, `common-ground-lite` | Analytics Dashboard continuity opens card plus tool table | Analytics dashboard owner | Any continuity tool dropping to zero, or a week-over-week drop large enough to suggest a broken entry point instead of normal variance |
| 2. Relational State Map recommendation-path usage | This is the clearest signal that the map is turning continuity state into an actionable next step. | `tool === "relational-state-map"` and `event === "button_click"` and `target` matches `recommendation_primary` or `recommendation_secondary` | Analytics Dashboard recommendation clicks card and event table | Continuity workflow owner | Opens rising while recommendation clicks flatten, or recommendation clicks going to zero after map changes |
| 3. Dashboard continuity completions | Confirms whether users are getting past opens into a concrete action in Shared Calm, Family Pulse, and Common Ground Lite. | Shared Calm `feature_use` targets: `co_regulation_completed`, `pause_plan_created` ; Family Pulse `feature_use` targets: `family_checkin_completed`, `family_conflict_logged`, `connection_moment_logged` ; Common Ground Lite event names: `conflict_type_selected`, `deescalation_script_viewed`, `repair_step_selected` | Analytics Dashboard continuity completions card and event table | Analytics dashboard owner with continuity tool owner | Completions falling while opens stay flat, or one tool family disappearing from the event table |
| 4. Discharge Roadmap continuity handoff signals | Confirms discharge planning is still feeding continuity context instead of becoming a dead-end worksheet. | `sourceTool === "discharge-roadmap"` and `signalType` in `appointment_added`, `med_plan_completed`, `warning_signs_defined`, `support_people_added`, `seventy_two_hour_plan_completed` | Raw `RCSignals` review during weekly QA spot-audit | Discharge Roadmap owner | Missing one or more expected signal types during a fresh completion pass, or signals only appearing once because emit-once keys no longer match actual edits |
| 5. Recovery Companion continuity support signals | Confirms post-discharge support behaviors are still producing continuity state that downstream tools can read. | `sourceTool === "recovery-companion"` and `signalType` in `checkin_completed`, `distress_level_recorded`, `safety_plan_used`, `what_to_expect_viewed` | Raw `RCSignals` review during weekly QA spot-audit | Recovery Companion owner | Check-in signals appearing without distress pairs, safety-plan/timeline usage stopping abruptly after navigation changes, or only onboarding paths emitting while return visits go dark |

## Metric Notes

### 1. Continuity tool opens by tool

Use this as the first adoption screen. It is broad, cheap to review, and catches broken links fast. It is also the only single metric that covers all current continuity surfaces already listed in `CONTINUITY_TOOLS`.

### 2. Relational State Map recommendation-path usage

Treat this as the main recommendation-funnel health check. The current contract only supports directional monitoring, not user-level conversion. That is still enough to catch regressions where recommendation buttons stop firing or stop being used.

### 3. Dashboard continuity completions

This is the best current “did someone do something useful?” summary metric, but it has contract caveats:

- Shared Calm `supporter_selected` is emitted but is not counted in the dashboard completion rollup
- Common Ground Lite uses event names directly, not `feature_use` targets
- the current rollup is a completion-and-engagement mix, not a strict end-of-flow metric

That makes it useful for trend monitoring, but not for clinical or workflow success claims.

### 4. Discharge Roadmap continuity handoff signals

These signals matter because they are the clearest discharge-to-continuity bridge now shipping. They are also higher drift risk because they are not surfaced in the dashboard cards and several are emitted through `emitOnce` semantics keyed from user-entered values.

Verified `emitOnce` key construction: keys are built from user-entered data (e.g., appointment names, medication names), so edits to the same plan entry will not re-emit. A user adding two different appointments produces two signals; editing the same appointment does not.

Additionally, Discharge Roadmap's continuity routing (SAFETY_FIRST / REPAIR_FIRST / STANDARD) reads signals from three upstream tools. If upstream signal formats change, routing can silently fall to STANDARD without visible breakage.

### 5. Recovery Companion continuity support signals

These are the main return-support continuity markers currently emitted from Recovery Companion. Interpretation should stay grounded in the current implementation:

- onboarding `checkin_completed` and `distress_level_recorded` can emit once-per-device through explicit keys
- session check-ins can emit per occurrence
- `safety_plan_used` and `what_to_expect_viewed` depend on screen navigation events

Note: Recovery Companion currently has 6 total signal emissions producing 4 unique `signalType` values. It does not call `rcAnalytics.track()`, so in-tool engagement is invisible to the Analytics Dashboard beyond `page_load`. This is a monitoring gap, not a bug — the tool predates the analytics integration pattern used by Shared Calm, Family Pulse, and Common Ground Lite.

When Wave 3 repair/conflict screens ship signal wiring, expect new `signalType` values for rupture logging, repair planning, and cycle mapping. Until then, those screens are UI-functional but telemetry-silent.

## Weekly QA Spot-Audit Checklist

Run this once per week after any continuity-surface merge, or at minimum once every Friday before closeout.

| Check | Exact action | Owner |
|---|---|---|
| 1. Dashboard contract scan | Run `node tools-suite/qa/qa_harness_analytics_dashboard_static.js` and confirm continuity tool inventory, completion targets, and Common Ground event coverage still match source | QA / reliability owner |
| 2. Relational State Map recommendation audit | Run `node tools-suite/qa/qa_harness_relational_state_map.js` and manually verify one `recommendation_primary` click and one `recommendation_secondary` click appear in the dashboard event table | Relational State Map owner |
| 3. Shared Calm and Family Pulse completion audit | Run `node tools-suite/qa/qa_harness_shared_calm_mode.js` and `node tools-suite/qa/qa_harness_family_pulse.js`, then complete one real browser pass in each tool and verify expected `feature_use` targets appear | Continuity tool owner |
| 4. Common Ground event-shape audit | Run `node tools-suite/qa/qa_harness_common_ground_lite.js`, then trigger `conflict_type_selected`, `deescalation_script_viewed`, and `repair_step_selected` in one browser session and confirm they still appear as event names, not as renamed targets | Common Ground Lite owner |
| 5. Discharge Roadmap signal audit | Run `node tools-suite/qa/qa_harness_discharge_roadmap.js`, then complete appointment, medication, warning sign, support person, and 72-hour sections in a fresh session and inspect raw `RCSignals` entries for all five `signalType` values | Discharge Roadmap owner |
| 6. Recovery Companion continuity signal audit | Run `node tools-suite/qa/qa_harness_recovery_companion.js`, then perform one check-in, open `shared-safety-plan` or `crisis-concern`, and open `timeline` or `relational-reentry`; confirm all expected `signalType` values are present | Recovery Companion owner |
| 7. Dashboard interpretation spot-check | Open the Analytics Dashboard after the browser scenarios above and confirm continuity opens, recommendation clicks, and continuity completions move in the expected direction | Analytics dashboard owner |

## Likely Drift / Failure Modes

### Event-name or target drift

Highest-risk examples:

- Relational State Map recommendation buttons stop using `recommendation_*` targets
- Shared Calm or Family Pulse renames a `feature_use` target without matching dashboard updates
- Common Ground Lite moves from event-name semantics to target semantics, or vice versa

Result:

- dashboard cards look healthy structurally but silently undercount

### Raw-signal-only coverage drift

Discharge Roadmap and Recovery Companion currently emit useful continuity signals that are not first-class dashboard cards. If those signals drift, the dashboard can still look normal while continuity handoff quality degrades.

Result:

- false sense of continuity health from dashboard-visible metrics alone

### `emitOnce` interpretation issues

Discharge Roadmap uses `emitOnce` whenever available, and Recovery Companion mixes once-per-device onboarding events with per-occurrence events.

Result:

- repeat-user behavior can look artificially flat
- edits to the same plan can fail to produce a second event even when the workflow still works

### Event-window truncation

Several continuity surfaces review only recent signal windows:

- Analytics Dashboard reads `window.RCSignals.list({ limit: 250 })`
- Discharge Roadmap continuity context review reads a smaller recent window

Result:

- older activity can fall out of view during manual review
- low-volume tools can appear inactive if reviewers only inspect a narrow sample

### Continuity routing fallback

Discharge Roadmap selects a continuity route variant (SAFETY_FIRST, REPAIR_FIRST, or STANDARD) based on upstream signals. If upstream signal formats change — for example, Recovery Companion renames a `signalType` or Common Ground Lite changes its `sourceTool` string — routing silently falls to STANDARD.

Result:

- discharge planning still works but loses personalization
- no error or warning is visible in either the dashboard or raw signals

### Navigation-dependent signal loss

Recovery Companion `safety_plan_used` and `what_to_expect_viewed` are emitted off screen transitions. If routing changes, those counts can drop without obvious UI breakage.

Result:

- support-path usage appears to decline when the real issue is event wiring

### Analytics layer gaps

Recovery Companion does not call `rcAnalytics.track()`. This means the Analytics Dashboard can count opens (via suite-level `page_load`) but cannot count any in-tool engagement for Recovery Companion. If a future update adds `rcAnalytics.track()` calls, the dashboard's `CONTINUITY_COMPLETION_TARGETS` set will need updating to include the new targets.

Result:

- Recovery Companion engagement is only visible through raw `RCSignals` inspection, not dashboard cards

## Recommended Weekly Review Order

1. Check continuity opens and recommendation clicks first.
2. Check continuity completions second.
3. If anything looks off, run the surface QA harness for the affected tool.
4. For Discharge Roadmap and Recovery Companion, inspect raw `RCSignals` rather than waiting for dashboard card changes.
5. Log whether the issue is a real usage drop, a dashboard interpretation gap, or an event wiring regression.

## Concrete Monitoring Conclusions For Week 11+

- The dashboard already supports a useful weekly continuity adoption readout.
- Recommendation-path usage is measurable now through Relational State Map recommendation button clicks.
- The current completion rollup is good enough for trend monitoring, but it is not a strict funnel completion metric.
- Discharge Roadmap and Recovery Companion continuity signals are present and useful, but they still require raw-signal QA review instead of dashboard-only monitoring.
- The main Week 11+ operational risk is silent undercounting from event drift, not total absence of telemetry.

## Source Verification Summary

All event names, set memberships, metric formulas, signal inventories, and routing contracts in this brief were verified against tool source code on 2026-03-13. Verification covered:

| Surface | Source file | Key findings |
|---|---|---|
| Analytics Dashboard | `ReConnect_Analytics_Dashboard.html` | All set memberships (`CONTINUITY_TOOLS`, `CONTINUITY_COMPLETION_TARGETS`, `COMMON_GROUND_EVENT_TYPES`) confirmed; metric formulas match source |
| Relational State Map | `relational-state-map.html` | Recommendation button targets (`recommendation_primary`, `recommendation_secondary`) confirmed |
| Shared Calm Mode | `shared-calm-mode.html` | `feature_use` targets confirmed: `co_regulation_completed`, `pause_plan_created`, `supporter_selected` |
| Family Pulse | `family-pulse.html` | `feature_use` targets confirmed: `family_checkin_completed`, `family_conflict_logged`, `connection_moment_logged` |
| Common Ground Lite | `common-ground-lite.html` | Event-name semantics confirmed (not `feature_use` targets); `rcAnalytics.track(eventName, 'common-ground-lite', payload)` pattern confirmed |
| Discharge Roadmap | `discharge-roadmap.app.jsx` | 5 `emitOnce` signal types confirmed with layer annotations; 3 continuity route variants confirmed; bi-directional context flow confirmed |
| Recovery Companion | `ReConnect_Recovery_Companion.app.jsx` | 6 signal emissions producing 4 unique `signalType` values confirmed; **no `rcAnalytics.track()` calls** confirmed; Wave 3 screens present but telemetry-silent |
| rc-signals.js | `shared-libs/rc-signals.js` | 250-event cap, 14-day lookback, `emitOnce` dedup via separate key registry confirmed |
| rc-relational-state.js | `shared-libs/rc-relational-state.js` | 4-region scoring, decay thresholds, strain routing to Common Ground Lite confirmed; positive types `coping_card_saved`, `family_need_identified`, `prescription_generated`, `prescription_exported` added (2026-03-14) |
| Coping Deck | `Coping_Deck.app.jsx` | `coping_card_saved` emission via `emitOnce` confirmed (2026-03-14) |
| Check-In Wheel | `Check_In_Wheel.app.jsx` | `family_need_identified` and `family_checkin_completed` emission via `emitOnce` confirmed (2026-03-14) |
| Psychoed Prescription Pad | `Psychoed_Prescription_Pad.app.jsx` | `prescription_generated` and `prescription_exported` emission via `emitOnce` confirmed (2026-03-14) |

**Real bugs found:** None. All event contracts, signal inventories, and metric formulas are internally consistent as of verification date.

**Monitoring-only observations (not bugs):**
- Recovery Companion has no `rcAnalytics.track()` calls — engagement is invisible to the dashboard beyond `page_load` (known gap, not a regression)
- Wave 3 repair/conflict screens are defined in source but do not emit signals yet (expected — signal wiring has not shipped)
- Discharge Roadmap continuity routing can silently fall to STANDARD if upstream signal formats change (by design, but worth monitoring)

## Layman Summary

In plain terms: the repo already tells us whether people are opening the continuity tools, whether the “next step” recommendations are being clicked, and whether users are finishing the simple support flows. The weak spot is that some important Discharge Roadmap and Recovery Companion activity is still only visible in the raw signal stream, so the weekly check needs one quick dashboard pass plus one quick spot-audit of those raw events.
