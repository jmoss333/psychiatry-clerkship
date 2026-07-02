# 11 Ai Prompts Media And Platform

Generated: 2026-07-01

Prepared for: Joshua Moss, MD | Psychiatrist

Grouped source bundle for NotebookLM. It concatenates safe Markdown/text material from the listed library sections while preserving source paths.

PHI rule: this source intentionally excludes known patient-identifying files, audit artifacts with MRN-like paths, source pointer files, and case-specific filenames. Use synthetic or de-identified examples only.

---



---

## Source: `11_AI_and_Prompts/README.md`

# 11 * AI & Prompts
- [yes] **Notion Teaching Curriculum DB + Agent 9 (Teaching-Prep Assistant)** -> wire to the weekly curriculum.
- [yes] **prompt-stack** (`~/Code/reconnect-psychiatry-system/prompt-stack/`) -> surface a **student-safe** subset.
-  Student prompt set (case formulation helper, MSE practice, shelf-question explainer) with PHI guardrails.

**Status tags:** [yes] Exists *  Revise *  Expand *  Create *  Merge *  Archive


---

## Source: `11_AI_and_Prompts/_source/2026-03-07-recovery-companion-wave3-pr2-safety-revision-summary.md`

# Recovery Companion Wave 3 PR 2 Safety Revision Summary

Date: March 7, 2026  
Source: Claude Code pre-implementation clinical safety review of the Wave 3 spec  
Audience: Codex, Claude Code, human clinical reviewers

## Summary
Wave 3 PR 1 reflection tooling was approved to proceed.  
Wave 3 PR 2 repair/de-escalation tooling was **not approved as originally specified** and required a spec rewrite before implementation.

## Review Outcome
- `PR 1` (`rupture-log`, `two-truths`, `conflict-replay`): approved with minor wording review gates
- `PR 2` (`repair-lab`, `cycle-map`, `conflict-pause-plan`): blocked pending safety rewrite and re-approval

## Critical Design Corrections Adopted
1. Removed `accountability-forward` as a planned repair tone.
2. Replaced `accountability points` with neutral contribution / impact / next-step framing.
3. Added explicit routing for:
   - minors
   - dependent young adults
   - power-imbalanced relationships
   - coercive / monitored / retaliatory contexts
4. Required unsafe contexts to fall back to safety, grounding, support seeking, or private planning instead of direct repair scripting.
5. Tightened pause-plan wording so distance is framed as regulation/safety, not punishment or leverage.

## Revised PR 2 Rules
- Repair work is optional and never implied as required.
- The app must not pressure users toward apology, confrontation, or contact in unsafe contexts.
- The other person's truth, need, or motive must stay clearly framed as a guess.
- Private reflection remains a valid completion path for every PR 2 feature.

## Implementation Status
- Canonical spec updated in:
  - `docs/plans/2026-03-07-recovery-companion-wave3-repair-conflict.md`
- Re-approval recorded on March 11, 2026; PR 2 implementation may proceed with Section 6 guardrails enforced as hard behavioral rules.
Included text sources: 19



---

## Source: `11_AI_and_Prompts/_source/2026-03-13-T013-signal-audit.md`

# T-013 Signal Audit - Week 11 Discharge Roadmap

**Date:** 2026-03-13 (updated 2026-03-14)
**Owner:** Claude T-012 / T-013 lane
**Status:** Complete - canonical source-of-truth table for Week 11, with routing-role decisions now frozen on `main`
**Status:** Complete - suite-wide signal coverage achieved as of commit `4401ba2` (2026-03-14)

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
| `distress_level_recorded` | Recovery Companion | L2 | 2 | numeric (0-10) | recovery-companion.app.jsx |
| `safety_plan_used` | Recovery Companion | L1 | 3 | completion flag | recovery-companion.app.jsx |
| `what_to_expect_viewed` | Recovery Companion | L4 | 1 | completion flag | recovery-companion.app.jsx |
| `skill_recommended` | Spin the Skill | L2 | 1 | skill name | spin-the-skill.app.jsx |
| `skill_completed` | Spin the Skill | L2 | 2 | skill name | spin-the-skill.app.jsx |
| `skill_usefulness_rated` | Spin the Skill | - | 1 | rating value | spin-the-skill.app.jsx |
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

These are the signals that `deriveContinuityRoute()` uses for route determination (from `discharge-roadmap.app.jsx` lines 246-247, 290-308):

### Safety-route signals (`CONTINUITY_SAFETY_SIGNAL_TYPES` in code)

| Signal Type | Source | Effect in `deriveContinuityRoute` |
|---|---|---|
| `safety_plan_used` | Recovery Companion (native) | Pushes to `safety-first` |
| `distress_level_recorded` | Recovery Companion (native) | `>= 7` pushes to `safety-first`; also general safety presence check |

> `warning_signs_defined` was removed from this array (4.3) to prevent sticky false-positive safety routing. Safety routing now uses the `warningSignsPlan` context field for current-session state.

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

## 3. Speculative Signal Names - Confirmed Absent

The following signal names are **explicitly invalid** for Week 11 and are confirmed absent from all shipped code:

| Invalid Name | Confirmed Absent |
|---|---|
| `conflict.paused` | [yes] Not in any JSX, bridge, or shared lib |
| `repair.lab.completed` | [yes] Not in any JSX, bridge, or shared lib |
| `cycle.mapped` | [yes] Not in any JSX, bridge, or shared lib |
| `family.pulse.harmony` | [yes] Not in any JSX, bridge, or shared lib |
| `safety.plan.updated` | [yes] Not in any JSX, bridge, or shared lib |

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

### 4.1 `conflict_type_selected` - RESOLVED

**Was:** In code's `CONTINUITY_REPAIR_SIGNAL_TYPES` but missing from design doc routing table.

**Resolution:** Design doc updated to include `conflict_type_selected` in both the canonical signal table (line 63) and repair-first route rules (line 109). Code and doc now match.

### 4.2 `pause_plan_created` - RESOLVED

**Was:** In design doc as repair signal but missing from code's `CONTINUITY_REPAIR_SIGNAL_TYPES`.

**Resolution:** Code updated to add `pause_plan_created` to `CONTINUITY_REPAIR_SIGNAL_TYPES`. Code and doc now match.

### 4.3 `warning_signs_defined` - RESOLVED

**Was:** In code's `CONTINUITY_SAFETY_SIGNAL_TYPES` but design doc marked it as output-only, creating sticky false-positive safety routing from prior sessions.

**Resolution:** Removed `warning_signs_defined` from `CONTINUITY_SAFETY_SIGNAL_TYPES`. Safety array now contains only `['safety_plan_used', 'distress_level_recorded']`. Safety routing relies on `warningSignsPlan` context field for current-session state, not stale signal history. Code and doc now match.

---

## 5. Continuity Signal Filter Shape

`listRecentContinuitySignals()` (lines 274-288) filters the RCSignals list with:

- **Source tool match:** `CONTINUITY_SIGNAL_SOURCES = ['recovery-companion', 'shared-calm-mode', 'common-ground-lite']`
- **OR signal type match:** `CONTINUITY_SAFETY_SIGNAL_TYPES` or `CONTINUITY_REPAIR_SIGNAL_TYPES`

This means signals from Family Pulse (bridged as source tool `'family-pulse'`) only pass through if their `signalType` matches a safety or repair type. Currently no Family Pulse signal types are in those arrays, so Family Pulse signals are **not** consumed for routing. `family_conflict_logged` does not route.

**Query limit:** `{ limit: 40 }` - well within the 250-event FIFO cap.

---

## 6. Context Fields Available for Week 11

From `RCContextUI.readWorkflowContext()`:

| Field | Available | Use in Routing |
|---|---|---|
| `diagnosis` | [yes] | Informational context only |
| `category` | [yes] | Informational context only |
| `layer` | [yes] | **Strongest route signal** - `L1` pushes to `safety-first` |
| `dischargeDate` | [yes] | Informational / sequencing |
| `screeningScores` | [yes] | Future content hints only |
| `resources` | [yes] | Support-depth / resource emphasis |
| `medications` | [yes] | Readiness / planning support |
| `bundleItems` | [yes] | Continuity carry-forward |
| `warningSignsPlan` | [yes] | **Safety marker** - has-entries pushes to `safety-first` |
| `handoff` | [yes] | Continuity carry-forward |
| `familyDynamics` | [yes] | Caregiver-overwhelm / support-complexity hint |

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
- Monitoring dashboards should not interpret flat counts from these tools as low engagement - check the dedup key pattern first

---

## 8. Future Work

| Item | Resolution Path |
|---|---|
| `pause_plan_created` routing role | Resolved on current `main`; preserve in repair-routing set |
| `conflict_type_selected` routing role | Resolved on current `main`; preserve in repair-routing set |
| `warning_signs_defined` dual role | Resolved on current `main`; keep output-only and rely on `warningSignsPlan` context state |
| ~~`pause_plan_created` routing role~~ | Resolved - added to code repair array (4.2) |
| ~~`conflict_type_selected` routing role~~ | Resolved - added to design doc (4.1) |
| ~~`warning_signs_defined` dual role~~ | Resolved - removed from safety array (4.3) |
| `family_conflict_logged` routing potential | Currently context-only; could support repair-first in future |
| `relational_state_v1` fields | Separate shared-lib expansion; not Week 11 |
| Family Pulse source-tool passthrough | Bridge writes `'family-pulse'` as source tool, not in `CONTINUITY_SIGNAL_SOURCES` - intentional or gap? |
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


---

## Source: `11_AI_and_Prompts/_source/2026-04-26-tool-nav-toolbar-and-cache-bust.md`

# Tool Nav Toolbar + Cache-Bust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-style tool navigation toolbar ( back, -> forward,  all tools) to all ~80 ReConnect tools, and cache-bust shared-libs / design-system / generated-bundle URLs in tool HTML at build time so deploys invalidate browser caches without users needing a hard refresh.

**Architecture:** Two coordinated components. (1) A new vanilla-JS shared library `rc-tool-nav.js` that auto-mounts a sticky toolbar on DOMContentLoaded, modeled on the IIFE pattern of `rc-toolbox.js`. Tracks tool path in `sessionStorage` for  / -> enabled-state; navigation itself uses native `history.back()` / `history.forward()`. (2) An extension to `tools-suite/build_netlify.py` that stamps `?v=<build_stamp>` on `<script src="../shared-libs/rc-*.js">`, `<link href="../design-system/rc-*.css">`, and `<script src="generated/<tool>.app.js">` references in every `_site/tools/*.html`, using the same `datetime.now(timezone.utc).strftime('%Y%m%d%H%M')` pattern already used at `build_netlify.py:673`.

**Tech Stack:** Vanilla JavaScript (IIFE), Node.js + jsdom (QA harness), Python 3 (build & inject scripts), bash (canary check), Playwright (e2e). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-26-tool-nav-toolbar-and-cache-bust-design.md`

**Worktree:** This plan is intended to run in `.claude/worktrees/crazy-villani-9f80f1/` (already active).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `tools-suite/shared-libs/rc-tool-nav.js` | Create | The toolbar component itself; auto-mount, history tracking, opt-out checks, public `RCToolNav` API |
| `tools-suite/qa/qa_harness_rc-tool-nav.js` | Create | jsdom-based QA harness covering mount, suppression, history, button enablement |
| `scripts/inject_rc_tool_nav.py` | Create | One-shot script that adds `<script src="../shared-libs/rc-tool-nav.js"></script>` to tool HTML files; idempotent, with skip-list |
| `tests/e2e/tool-nav-toolbar.spec.ts` | Create | Playwright e2e validating click-through navigation between landing -> tool -> tool,  / -> /  behavior |
| `tools-suite/build_netlify.py` | Modify | Add `stamp_tool_html_cache_bust()` post-copy step + invocation |
| `scripts/check_generated_canary_bundles.sh` | Modify | Add `check_html_cache_bust()` function asserting every `_site/tools/*.html` carries `?v=` on the three URL patterns |
| `tools-suite/tools/*.html` (~80 files) | Modify (mechanical, via inject script) | One new `<script>` line each |
| `tools-suite/tools/recovery-companion.html` | Modify | Add `data-rc-no-tool-nav` to body (iframe-embedded) |

---

## Task 1: Scaffold `rc-tool-nav.js` with mount +  home button + a11y

**Files:**
- Create: `tools-suite/shared-libs/rc-tool-nav.js`
- Create: `tools-suite/qa/qa_harness_rc-tool-nav.js`

**Goal:** End of task - opening any HTML page that includes `<script src="../shared-libs/rc-tool-nav.js"></script>` shows a sticky 44-px toolbar with three buttons.  and -> are disabled (no history yet);  navigates to `../landing/`. Toolbar is keyboard-focusable with proper ARIA.

- [ ] **Step 1: Create the QA harness with failing assertions**

Create `tools-suite/qa/qa_harness_rc-tool-nav.js`:

```javascript
#!/usr/bin/env node
/**
 * 
 * rc-tool-nav.js - Automated QA Harness
 * 
 * TDD harness - validates auto-mount behavior, suppression rules,
 * history tracking, and button enable/disable logic.
 *
 * Usage:  node tools-suite/qa/qa_harness_rc-tool-nav.js
 * 
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LIB_PATH = path.join(REPO_ROOT, 'tools-suite', 'shared-libs', 'rc-tool-nav.js');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) { console.log('  [yes] ' + label); passed++; }
  else           { console.error('   FAIL: ' + label); failed++; }
}
function group(name) { console.log('\n' + name); }

function loadLib(dom) {
  const code = fs.readFileSync(LIB_PATH, 'utf8');
  const script = dom.window.document.createElement('script');
  script.textContent = code;
  dom.window.document.head.appendChild(script);
}

function makeDOM(opts) {
  opts = opts || {};
  const html = '<!DOCTYPE html><html><head><title>' +
    (opts.title || 'Coping Deck | ReConnect') +
    '</title></head><body' +
    (opts.bodyAttrs || '') + '><div id="root"></div></body></html>';
  const dom = new JSDOM(html, {
    url: opts.url || 'http://localhost/tools/coping-deck.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  // sessionStorage stub (jsdom provides one but ensure clean state)
  dom.window.sessionStorage.clear();
  // performance.getEntriesByType stub
  dom.window.performance.getEntriesByType = function (type) {
    if (type === 'navigation') return [{ type: opts.navType || 'navigate' }];
    return [];
  };
  return dom;
}

function fireDOMReady(dom) {
  const ev = new dom.window.Event('DOMContentLoaded', { bubbles: true });
  dom.window.document.dispatchEvent(ev);
}

//  Test: basic auto-mount 
group('Auto-mount on DOMContentLoaded');
{
  const dom = makeDOM();
  loadLib(dom);
  fireDOMReady(dom);
  const header = dom.window.document.querySelector('.rc-tool-nav');
  assert('toolbar element appended to body', !!header);
  assert('toolbar uses semantic <header>', header && header.tagName === 'HEADER');
  assert('toolbar has role="banner"', header && header.getAttribute('role') === 'banner');

  const buttons = header ? header.querySelectorAll('button') : [];
  assert('toolbar has exactly 3 buttons', buttons.length === 3);

  const labels = Array.from(buttons).map(b => b.getAttribute('aria-label') || '');
  assert('back button has aria-label', labels[0] && /back/i.test(labels[0]));
  assert('forward button has aria-label', labels[1] && /forward/i.test(labels[1]));
  assert('home button has aria-label', labels[2] && /tools|home|index/i.test(labels[2]));
}

//  Test: title detection 
group('Title detection');
{
  const dom = makeDOM({ title: 'Crisis Moment Navigator | ReConnect' });
  loadLib(dom);
  fireDOMReady(dom);
  const titleEl = dom.window.document.querySelector('.rc-tool-nav__title');
  assert('title element rendered', !!titleEl);
  assert('title strips " | ReConnect" suffix',
    titleEl && titleEl.textContent.trim() === 'Crisis Moment Navigator');
}

//  Test: home button navigates 
group('Home button navigates to ../landing/');
{
  const dom = makeDOM();
  loadLib(dom);
  fireDOMReady(dom);
  const buttons = dom.window.document.querySelectorAll('.rc-tool-nav button');
  const homeBtn = buttons[2];
  let navigatedTo = null;
  // jsdom doesn't actually follow window.location.href - capture the assignment
  Object.defineProperty(dom.window, 'location', {
    value: { href: 'http://localhost/tools/coping-deck.html',
             set href(v) { navigatedTo = v; } },
    writable: true,
  });
  // The above stub is fragile in jsdom; alternative: spy on the lib's
  // internal LANDING_HREF by intercepting click. For simplicity use
  // window.location assign via Object.assign trick:
  Object.assign(dom.window.location, { href: '__sentinel__' });
  homeBtn.click();
  // Verify either: navigation attempted or location.href changed away from sentinel
  assert('clicking home button changes location.href',
    dom.window.location.href !== '__sentinel__');
}

//  Summary 
console.log('\n' + (failed === 0 ? '[yes] ALL PASSED' : ' ' + failed + ' FAILED') +
            ' (' + passed + ' passed, ' + failed + ' failed)');
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run harness - expect FAIL (lib doesn't exist)**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: error like `ENOENT: no such file or directory, open '...rc-tool-nav.js'`

- [ ] **Step 3: Implement `rc-tool-nav.js` (mount + a11y + home button)**

Create `tools-suite/shared-libs/rc-tool-nav.js`:

```javascript
/**
 * rc-tool-nav.js - ReConnect Tool Navigation Toolbar
 *
 * Auto-mounting browser-style nav toolbar shown above every tool's content.
 * Provides  back, -> forward, and  all tools buttons.
 *
 * Mount: Auto-mounts on DOMContentLoaded unless suppressed (see init()).
 *
 * @version 1.0.0
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'rc_tool_nav_v1';
  var STACK_CAP = 50;
  var TOOLBAR_CLASS = 'rc-tool-nav';
  var STYLE_ID = 'rc-tool-nav-styles';
  var LANDING_HREF = '../landing/';

  //  Title detection 
  function readToolTitle() {
    var html = document.documentElement;
    var node = html ? html.firstChild : null;
    while (node && node.nodeType !== 8) { node = node.nextSibling; }
    if (node && node.nodeValue) {
      var m = node.nodeValue.match(/tool="([^"]+)"/);
      if (m) return m[1];
    }
    var t = document.title || '';
    return t.replace(/\s*\|\s*ReConnect\s*$/, '').trim() || 'ReConnect';
  }

  //  Styles 
  var STYLES = [
    '.rc-tool-nav {',
    '  position: sticky; top: 0; z-index: 9000;',
    '  display: flex; align-items: center; gap: 0.5rem;',
    '  padding: 0.375rem 0.75rem;',
    '  background: var(--rc-surface, #fff);',
    '  border-bottom: 1px solid var(--rc-border-light, #ebe3d8);',
    '  font-family: var(--rc-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);',
    '  font-size: 0.875rem; min-height: 44px; box-sizing: border-box;',
    '}',
    '.rc-tool-nav__btn {',
    '  background: transparent; border: 1px solid transparent;',
    '  color: var(--rc-text-mid, #64574b);',
    '  padding: 0.375rem 0.625rem; border-radius: 0.25rem;',
    '  font-family: inherit; font-size: inherit; cursor: pointer;',
    '  display: inline-flex; align-items: center; gap: 0.25rem;',
    '}',
    '.rc-tool-nav__btn:hover:not([aria-disabled="true"]) {',
    '  background: var(--rc-surface-quiet, #f1ece6);',
    '}',
    '.rc-tool-nav__btn:focus-visible {',
    '  outline: 2px solid var(--rc-accent, #2a6b5e); outline-offset: 2px;',
    '}',
    '.rc-tool-nav__btn[aria-disabled="true"] { opacity: 0.4; cursor: not-allowed; }',
    '.rc-tool-nav__title {',
    '  flex: 1; text-align: center;',
    '  color: var(--rc-text, #3b332c); font-weight: 500;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
    '}',
    '@media (max-width: 640px) {',
    '  .rc-tool-nav__btn .rc-tool-nav__btn-label { display: none; }',
    '  .rc-tool-nav__title { font-size: 0.8125rem; }',
    '}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  //  Button factory 
  function makeButton(iconChar, labelText, ariaLabel, onClick) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rc-tool-nav__btn';
    btn.setAttribute('aria-label', ariaLabel);
    var icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconChar;
    var label = document.createElement('span');
    label.className = 'rc-tool-nav__btn-label';
    label.textContent = labelText;
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(' '));
    btn.appendChild(label);
    btn.addEventListener('click', function (e) {
      if (btn.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        return;
      }
      onClick(e);
    });
    return btn;
  }

  function setDisabled(btn, isDisabled) {
    btn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
  }

  //  Mount 
  function mount() {
    injectStyles();

    var header = document.createElement('header');
    header.className = TOOLBAR_CLASS;
    header.setAttribute('role', 'banner');

    var btnBack = makeButton('', 'Back', 'Go back to previous tool',
                             function () { window.history.back(); });
    var btnFwd = makeButton('->', 'Forward', 'Go forward to next tool',
                            function () { window.history.forward(); });

    var titleEl = document.createElement('div');
    titleEl.className = 'rc-tool-nav__title';
    titleEl.textContent = readToolTitle();

    var btnHome = makeButton('', 'All Tools', 'Return to all tools index',
                             function () { window.location.href = LANDING_HREF; });

    header.appendChild(btnBack);
    header.appendChild(btnFwd);
    header.appendChild(titleEl);
    header.appendChild(btnHome);

    // disabled-by-default until history tracking lands in Task 2
    setDisabled(btnBack, true);
    setDisabled(btnFwd, true);

    document.body.insertBefore(header, document.body.firstChild);

    return { header: header, btnBack: btnBack, btnFwd: btnFwd,
             btnHome: btnHome, titleEl: titleEl };
  }

  function unmount() {
    var existing = document.querySelector('.' + TOOLBAR_CLASS);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var styleEl = document.getElementById(STYLE_ID);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
  }

  //  Init 
  var _refs = null;

  function init() {
    _refs = mount();
    global.RCToolNav = {
      mount: function () { _refs = mount(); return _refs; },
      unmount: function () { unmount(); _refs = null; },
      setTitle: function (str) {
        if (_refs && _refs.titleEl) _refs.titleEl.textContent = String(str);
      },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run harness - expect mount + title PASS, home-click test may PASS or be flaky**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: All assertions pass except possibly the "clicking home button changes location.href" assertion - jsdom restricts setting `window.location.href`. If that one fails, leave it: it'll be replaced with a more robust event-spy check in Task 4.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/shared-libs/rc-tool-nav.js tools-suite/qa/qa_harness_rc-tool-nav.js
git commit -m "feat(shared-libs): rc-tool-nav.js scaffold + QA harness

Auto-mounting toolbar with  ->  buttons.  and -> disabled by
default; history tracking lands in next task.

Refs: docs/superpowers/specs/2026-04-26-tool-nav-toolbar-and-cache-bust-design.md"
```

---

## Task 2: History tracking + /-> button enablement

**Files:**
- Modify: `tools-suite/shared-libs/rc-tool-nav.js`
- Modify: `tools-suite/qa/qa_harness_rc-tool-nav.js`

**Goal:** Toolbar tracks tool path in `sessionStorage` and toggles  / -> enabled state correctly. Native `history.back()` / `history.forward()` still does the actual navigation.

- [ ] **Step 1: Add failing harness tests for history**

Append to `tools-suite/qa/qa_harness_rc-tool-nav.js` before the summary:

```javascript
//  Test: fresh navigation pushes to stack 
group('History tracking - fresh navigation');
{
  const dom = makeDOM({ navType: 'navigate',
                        url: 'http://localhost/tools/coping-deck.html' });
  loadLib(dom);
  fireDOMReady(dom);
  const raw = dom.window.sessionStorage.getItem('rc_tool_nav_v1');
  assert('sessionStorage entry written', !!raw);
  const state = JSON.parse(raw || '{}');
  assert('stack has 1 entry after fresh nav',
    state.stack && state.stack.length === 1);
  assert('cursor === 0 after fresh nav', state.cursor === 0);
  assert('stack entry has url + title',
    state.stack[0].url && state.stack[0].title);
}

//  Test: back/forward type does NOT push 
group('History tracking - back/forward navigation');
{
  const dom = makeDOM({ navType: 'navigate',
                        url: 'http://localhost/tools/coping-deck.html' });
  // pre-seed sessionStorage with a prior visit
  dom.window.sessionStorage.setItem('rc_tool_nav_v1', JSON.stringify({
    stack: [
      { url: 'http://localhost/tools/coping-deck.html', title: 'Coping Deck' },
      { url: 'http://localhost/tools/crisis-moment-navigator.html', title: 'Crisis Moment Navigator' }
    ],
    cursor: 1,
  }));
  // simulate back navigation: type='back_forward', URL = first entry
  dom.window.performance.getEntriesByType = function (t) {
    return t === 'navigation' ? [{ type: 'back_forward' }] : [];
  };
  loadLib(dom);
  fireDOMReady(dom);
  const state = JSON.parse(dom.window.sessionStorage.getItem('rc_tool_nav_v1'));
  assert('stack length unchanged on back/forward', state.stack.length === 2);
  assert('cursor moved to matching URL (0)', state.cursor === 0);
}

//  Test: button enabled/disabled state 
group('Button enable/disable state');
{
  const dom = makeDOM({ navType: 'navigate' });
  loadLib(dom);
  fireDOMReady(dom);
  const btns = dom.window.document.querySelectorAll('.rc-tool-nav button');
  assert('back button disabled at cursor 0',
    btns[0].getAttribute('aria-disabled') === 'true');
  assert('forward button disabled at end of stack',
    btns[1].getAttribute('aria-disabled') === 'true');
  assert('home button always enabled',
    btns[2].getAttribute('aria-disabled') !== 'true');
}

group('Button enable/disable - mid-stack');
{
  const dom = makeDOM({ url: 'http://localhost/tools/coping-deck.html' });
  dom.window.sessionStorage.setItem('rc_tool_nav_v1', JSON.stringify({
    stack: [
      { url: 'http://localhost/tools/safety-plan-builder.html', title: 'Safety Plan' },
      { url: 'http://localhost/tools/coping-deck.html', title: 'Coping Deck' },
      { url: 'http://localhost/tools/goal-tracker.html', title: 'Goal Tracker' }
    ],
    cursor: 1,
  }));
  dom.window.performance.getEntriesByType = function (t) {
    return t === 'navigation' ? [{ type: 'back_forward' }] : [];
  };
  loadLib(dom);
  fireDOMReady(dom);
  const btns = dom.window.document.querySelectorAll('.rc-tool-nav button');
  assert('back enabled when cursor > 0',
    btns[0].getAttribute('aria-disabled') === 'false');
  assert('forward enabled when cursor < stack.length - 1',
    btns[1].getAttribute('aria-disabled') === 'false');
}
```

- [ ] **Step 2: Run harness - expect new tests FAIL**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: New tests fail (no `rc_tool_nav_v1` sessionStorage entry, buttons disabled regardless of stack).

- [ ] **Step 3: Add history tracking to `rc-tool-nav.js`**

In `tools-suite/shared-libs/rc-tool-nav.js`, add helper functions just below the `readToolTitle()` function:

```javascript
  //  History state 
  function getState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return { stack: [], cursor: -1 };
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.stack) && typeof parsed.cursor === 'number') {
        return parsed;
      }
      return { stack: [], cursor: -1 };
    } catch (e) {
      return { stack: [], cursor: -1 };
    }
  }

  function saveState(state) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* quota or denied - ignore */ }
  }

  function readNavType() {
    try {
      var entries = performance.getEntriesByType('navigation');
      if (entries && entries[0] && entries[0].type) return entries[0].type;
    } catch (e) { /* old browsers - fall through */ }
    return 'navigate';
  }

  function updateHistory() {
    var navType = readNavType();
    var state = getState();
    var entry = { url: window.location.href, title: readToolTitle() };

    if (navType === 'reload') {
      // no change
    } else if (navType === 'back_forward') {
      for (var i = 0; i < state.stack.length; i++) {
        if (state.stack[i].url === entry.url) {
          state.cursor = i;
          break;
        }
      }
    } else {
      // 'navigate' or unknown - push, truncate forward
      var current = state.stack[state.cursor];
      if (current && current.url === entry.url) {
        // dedupe: same URL as current entry, no change
      } else {
        state.stack = state.stack.slice(0, state.cursor + 1);
        state.stack.push(entry);
        if (state.stack.length > STACK_CAP) {
          var drop = state.stack.length - STACK_CAP;
          state.stack = state.stack.slice(drop);
          state.cursor -= drop;
        }
        state.cursor = state.stack.length - 1;
      }
    }
    saveState(state);
    return state;
  }
```

Then update `mount()` to accept the state and apply it. Replace the existing `mount()` function with:

```javascript
  function mount(state) {
    state = state || { stack: [], cursor: -1 };
    injectStyles();

    var header = document.createElement('header');
    header.className = TOOLBAR_CLASS;
    header.setAttribute('role', 'banner');

    var btnBack = makeButton('', 'Back', 'Go back to previous tool',
                             function () { window.history.back(); });
    var btnFwd = makeButton('->', 'Forward', 'Go forward to next tool',
                            function () { window.history.forward(); });

    var titleEl = document.createElement('div');
    titleEl.className = 'rc-tool-nav__title';
    titleEl.textContent = readToolTitle();

    var btnHome = makeButton('', 'All Tools', 'Return to all tools index',
                             function () { window.location.href = LANDING_HREF; });

    header.appendChild(btnBack);
    header.appendChild(btnFwd);
    header.appendChild(titleEl);
    header.appendChild(btnHome);

    setDisabled(btnBack, state.cursor <= 0);
    setDisabled(btnFwd, state.cursor >= state.stack.length - 1);

    document.body.insertBefore(header, document.body.firstChild);

    return { header: header, btnBack: btnBack, btnFwd: btnFwd,
             btnHome: btnHome, titleEl: titleEl };
  }
```

And update `init()`:

```javascript
  function init() {
    var state = updateHistory();
    _refs = mount(state);
    global.RCToolNav = {
      mount: function () { _refs = mount(getState()); return _refs; },
      unmount: function () { unmount(); _refs = null; },
      setTitle: function (str) {
        if (_refs && _refs.titleEl) _refs.titleEl.textContent = String(str);
      },
      get history() { return getState(); }
    };
  }
```

- [ ] **Step 4: Run harness - expect all history tests PASS**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: All "History tracking" and "Button enable/disable" assertions pass.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/shared-libs/rc-tool-nav.js tools-suite/qa/qa_harness_rc-tool-nav.js
git commit -m "feat(rc-tool-nav): sessionStorage history tracking + button enable state

Tracks tool path in rc_tool_nav_v1 (50-entry cap, FIFO eviction).
Native history.back()/forward() still owns navigation; sessionStorage
is purely cosmetic (button disabled state)."
```

---

## Task 3: Opt-out, iframe detection, idempotency

**Files:**
- Modify: `tools-suite/shared-libs/rc-tool-nav.js`
- Modify: `tools-suite/qa/qa_harness_rc-tool-nav.js`

**Goal:** Toolbar self-suppresses when (a) running inside an iframe, (b) `<body data-rc-no-tool-nav>` is set, (c) `<body class="rc-no-chrome">` is set, or (d) a `.rc-tool-nav` element already exists.

- [ ] **Step 1: Add failing harness tests for suppression**

Append to `qa_harness_rc-tool-nav.js`:

```javascript
//  Suppression rules 
group('Suppression - data-rc-no-tool-nav');
{
  const dom = makeDOM({ bodyAttrs: ' data-rc-no-tool-nav' });
  loadLib(dom);
  fireDOMReady(dom);
  assert('toolbar NOT mounted when data-rc-no-tool-nav set',
    !dom.window.document.querySelector('.rc-tool-nav'));
}

group('Suppression - rc-no-chrome class');
{
  const dom = makeDOM({ bodyAttrs: ' class="rc-no-chrome"' });
  loadLib(dom);
  fireDOMReady(dom);
  assert('toolbar NOT mounted when body has rc-no-chrome',
    !dom.window.document.querySelector('.rc-tool-nav'));
}

group('Suppression - iframe context');
{
  const dom = makeDOM();
  // simulate iframe: window.self !== window.top
  Object.defineProperty(dom.window, 'top', { value: {}, writable: false });
  loadLib(dom);
  fireDOMReady(dom);
  assert('toolbar NOT mounted when window.self !== window.top',
    !dom.window.document.querySelector('.rc-tool-nav'));
}

group('Suppression - idempotency');
{
  const dom = makeDOM();
  // pre-seed an existing toolbar
  const fake = dom.window.document.createElement('header');
  fake.className = 'rc-tool-nav';
  fake.setAttribute('data-existing', 'true');
  dom.window.document.body.appendChild(fake);
  loadLib(dom);
  fireDOMReady(dom);
  const all = dom.window.document.querySelectorAll('.rc-tool-nav');
  assert('only the pre-existing toolbar remains', all.length === 1);
  assert('pre-existing toolbar untouched',
    all[0].getAttribute('data-existing') === 'true');
}

group('RCToolNav public API');
{
  const dom = makeDOM();
  loadLib(dom);
  fireDOMReady(dom);
  const api = dom.window.RCToolNav;
  assert('window.RCToolNav exists', !!api);
  assert('RCToolNav.mount is a function', typeof (api && api.mount) === 'function');
  assert('RCToolNav.unmount is a function', typeof (api && api.unmount) === 'function');
  assert('RCToolNav.setTitle is a function', typeof (api && api.setTitle) === 'function');
  assert('RCToolNav.history is a getter', api && typeof api.history === 'object');
}
```

- [ ] **Step 2: Run harness - expect 4 suppression tests FAIL**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: Suppression assertions fail; toolbar mounts even when it should be suppressed.

- [ ] **Step 3: Add suppression logic to `init()`**

In `tools-suite/shared-libs/rc-tool-nav.js`, replace the `init()` function with:

```javascript
  function shouldSuppress() {
    try {
      if (window.self !== window.top) return 'iframe';
    } catch (e) { /* cross-origin frame access threw - treat as iframe */
      return 'iframe';
    }
    if (!document.body) return null;
    if (document.body.hasAttribute('data-rc-no-tool-nav')) return 'opt-out';
    if (document.body.classList.contains('rc-no-chrome')) return 'no-chrome';
    if (document.querySelector('.' + TOOLBAR_CLASS)) return 'already-mounted';
    return null;
  }

  function init() {
    var reason = shouldSuppress();
    if (reason) {
      if (window.console && window.console.debug) {
        window.console.debug('[rc-tool-nav] suppressed:', reason);
      }
      // expose API as a no-op so consumers don't crash
      global.RCToolNav = global.RCToolNav || {
        mount: function () { return null; },
        unmount: function () {},
        setTitle: function () {},
        get history() { return getState(); },
        suppressed: reason
      };
      return;
    }
    var state = updateHistory();
    _refs = mount(state);
    global.RCToolNav = {
      mount: function () { _refs = mount(getState()); return _refs; },
      unmount: function () { unmount(); _refs = null; },
      setTitle: function (str) {
        if (_refs && _refs.titleEl) _refs.titleEl.textContent = String(str);
      },
      get history() { return getState(); }
    };
  }
```

- [ ] **Step 4: Run harness - expect all suppression tests PASS**

Run: `node tools-suite/qa/qa_harness_rc-tool-nav.js`
Expected: All assertions pass; final summary shows 0 failures.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/shared-libs/rc-tool-nav.js tools-suite/qa/qa_harness_rc-tool-nav.js
git commit -m "feat(rc-tool-nav): suppression rules + RCToolNav public API

Toolbar self-suppresses inside iframes, when body has
data-rc-no-tool-nav or .rc-no-chrome, or when an existing
.rc-tool-nav already mounted. Public API stays available
in suppressed mode (as no-ops) so callers don't crash."
```

---

## Task 4: Inject script + pilot 5 tools

**Files:**
- Create: `scripts/inject_rc_tool_nav.py`
- Modify: 5 tool HTML files (Coping Deck, Crisis Moment Navigator, Daily Reflection, Goal Tracker, Safety Plan Builder)

**Goal:** A single Python script that adds `<script src="../shared-libs/rc-tool-nav.js"></script>` to a tool's `<head>`. Idempotent. Skip-list aware. Apply to 5 pilot tools and run their existing QA harnesses to verify no regressions.

- [ ] **Step 1: Create the inject script**

Create `scripts/inject_rc_tool_nav.py`:

```python
#!/usr/bin/env python3
"""
Inject `<script src="../shared-libs/rc-tool-nav.js"></script>` into tool HTML.

Idempotent: skips files that already include the line.
Skip-list aware: never touches files in SKIP_FILENAMES.
Inserts after the LAST existing `<script src="../shared-libs/rc-*.js">` line in <head>,
or just before </head> if no such line exists.

Usage:
    python3 scripts/inject_rc_tool_nav.py [TOOL_FILES...]
    python3 scripts/inject_rc_tool_nav.py --all

Examples:
    # Pilot - only the named files
    python3 scripts/inject_rc_tool_nav.py \\
        tools-suite/tools/coping-deck.html \\
        tools-suite/tools/crisis-moment-navigator.html

    # Full rollout - all .html in tools-suite/tools/, minus skip-list
    python3 scripts/inject_rc_tool_nav.py --all
"""
import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = REPO_ROOT / "tools-suite" / "tools"

INJECT_LINE = '  <script src="../shared-libs/rc-tool-nav.js"></script>'

SKIP_FILENAMES = {
    "recovery-companion.html",
    # add more during rollout if discovered
}

EXISTING_INCLUDE_PATTERN = re.compile(
    r'<script\s+src="\.\./shared-libs/rc-[^"]+\.js"[^>]*>\s*</script>',
    re.IGNORECASE,
)
INJECT_MARKER = "rc-tool-nav.js"
HEAD_CLOSE = re.compile(r'</head>', re.IGNORECASE)


def already_injected(content: str) -> bool:
    return INJECT_MARKER in content


def inject(content: str) -> str:
    """Return modified content with the inject line added.

    Strategy:
      1. Find all existing rc-*.js shared-libs includes.
      2. Insert our line on a new line after the LAST such include.
      3. If no such include, insert just before </head>.
    """
    matches = list(EXISTING_INCLUDE_PATTERN.finditer(content))
    if matches:
        last = matches[-1]
        insert_at = last.end()
        return content[:insert_at] + "\n" + INJECT_LINE + content[insert_at:]
    head_match = HEAD_CLOSE.search(content)
    if not head_match:
        raise RuntimeError("Tool HTML has no </head> - cannot inject")
    insert_at = head_match.start()
    return content[:insert_at] + INJECT_LINE + "\n" + content[insert_at:]


def process_file(path: Path) -> str:
    if path.name in SKIP_FILENAMES:
        return "skip-list"
    if not path.exists():
        return "missing"
    content = path.read_text(encoding="utf-8")
    if already_injected(content):
        return "already-injected"
    new_content = inject(content)
    path.write_text(new_content, encoding="utf-8")
    return "injected"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", type=Path,
                        help="Specific tool HTML files to inject into")
    parser.add_argument("--all", action="store_true",
                        help="Inject into every .html in tools-suite/tools/")
    args = parser.parse_args()

    if args.all:
        files = sorted(TOOLS_DIR.glob("*.html"))
    else:
        if not args.files:
            parser.error("Pass either --all or one or more tool HTML paths")
        files = [Path(f) for f in args.files]

    counts = {"injected": 0, "already-injected": 0, "skip-list": 0,
              "missing": 0, "error": 0}
    for f in files:
        try:
            status = process_file(f)
        except Exception as e:
            print(f"  ERROR  {f.name}: {e}", file=sys.stderr)
            counts["error"] += 1
            continue
        counts[status] += 1
        print(f"  {status:18s} {f.name}")

    print()
    print("Summary:")
    for k, v in counts.items():
        print(f"  {k:18s} {v}")
    return 0 if counts["error"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Make script executable and test on a temp copy**

Run:
```bash
chmod +x scripts/inject_rc_tool_nav.py
cp tools-suite/tools/coping-deck.html /tmp/coping-deck-test.html
python3 scripts/inject_rc_tool_nav.py /tmp/coping-deck-test.html
grep -c 'rc-tool-nav.js' /tmp/coping-deck-test.html
```

Expected: prints `injected ... coping-deck-test.html`, summary line shows `injected 1`, grep returns `1`.

Idempotency check:
```bash
python3 scripts/inject_rc_tool_nav.py /tmp/coping-deck-test.html
grep -c 'rc-tool-nav.js' /tmp/coping-deck-test.html
```
Expected: `already-injected 1` in summary, grep still returns `1`.

- [ ] **Step 3: Apply to 5 pilot tools**

Run:
```bash
python3 scripts/inject_rc_tool_nav.py \
  tools-suite/tools/coping-deck.html \
  tools-suite/tools/crisis-moment-navigator.html \
  tools-suite/tools/daily-reflection.html \
  tools-suite/tools/goal-tracker.html \
  tools-suite/tools/safety-plan-builder.html
```

Expected: summary shows `injected 5`.

Verify with `grep -l 'rc-tool-nav.js' tools-suite/tools/*.html | wc -l`. Expected: `5`.

(Note: the actual filenames may differ - `goal-tracker.html` vs `Goal_Tracker.html`. If a path doesn't exist, the script reports `missing` and continues. Adjust filenames based on `ls tools-suite/tools/`.)

- [ ] **Step 4: Run the 5 pilot tools' existing QA harnesses**

Run for each pilot tool that has a harness:
```bash
node tools-suite/qa/qa_harness_coping_deck.js
node tools-suite/qa/qa_harness_crisis-moment-navigator.js  # adjust per actual filename
node tools-suite/qa/qa_harness_daily-reflection.js
node tools-suite/qa/qa_harness_goal-tracker.js
node tools-suite/qa/qa_harness_safety-plan-builder.js
```

Expected: All harnesses pass. The toolbar shouldn't break anything because tools attach their UI to `#root`, and we insert above (not into) `#root`.

If a harness fails because it asserts on `document.body.firstChild` (or similar), update the assertion to skip past the toolbar - flag it during this step rather than papering over.

- [ ] **Step 5: Commit pilot rollout**

```bash
git add scripts/inject_rc_tool_nav.py tools-suite/tools/coping-deck.html \
  tools-suite/tools/crisis-moment-navigator.html \
  tools-suite/tools/daily-reflection.html \
  tools-suite/tools/goal-tracker.html \
  tools-suite/tools/safety-plan-builder.html
git commit -m "feat(tools): rc-tool-nav.js include - pilot rollout (5 tools)

Inject script + 5 pilot tools (Coping Deck, Crisis Moment Navigator,
Daily Reflection, Goal Tracker, Safety Plan Builder). Existing QA
harnesses for these tools still pass."
```

---

## Task 5: Playwright e2e - toolbar navigation flow

**Files:**
- Create: `tests/e2e/tool-nav-toolbar.spec.ts`

**Goal:** Validate the toolbar end-to-end on the deployed (or preview) site: click landing -> click a tool -> verify toolbar mount +  enabled / -> disabled, click , verify return to landing.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/tool-nav-toolbar.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8903';

test.describe('Tool nav toolbar', () => {
  test('mounts on a piloted tool and  returns to landing', async ({ page }) => {
    await page.goto(`${BASE}/landing/`);
    await page.getByRole('link', { name: /coping deck/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    const home = page.locator('.rc-tool-nav button[aria-label*="all tools" i]');
    await expect(home).toBeVisible();

    // Back is disabled for the first tool in the session - no prior history
    const back = page.locator('.rc-tool-nav button[aria-label*="back" i]');
    await expect(back).toHaveAttribute('aria-disabled', 'true');

    await home.click();
    await expect(page).toHaveURL(/\/landing\/?$/);
  });

  test(' returns to previous tool after navigating between two tools', async ({ page }) => {
    await page.goto(`${BASE}/landing/`);
    await page.getByRole('link', { name: /coping deck/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    // navigate to a second tool from inside the suite (use  then click another)
    await page.locator('.rc-tool-nav button[aria-label*="all tools" i]').click();
    await page.getByRole('link', { name: /crisis moment navigator/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    const back = page.locator('.rc-tool-nav button[aria-label*="back" i]');
    await expect(back).toHaveAttribute('aria-disabled', 'false');
    await back.click();
    await expect(page).toHaveURL(/\/landing\/?(?:$|[?#])/);
  });

  test('toolbar is keyboard-accessible', async ({ page }) => {
    await page.goto(`${BASE}/landing/`);
    await page.getByRole('link', { name: /coping deck/i }).first().click();
    await expect(page.locator('.rc-tool-nav')).toBeVisible();

    // Skip-link is the first tab stop, then  Forward Title 
    await page.keyboard.press('Tab'); // skip-link
    await page.keyboard.press('Tab'); // back
    let focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(focused).toMatch(/back/i);

    await page.keyboard.press('Tab'); // forward
    focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(focused).toMatch(/forward/i);
  });
});
```

- [ ] **Step 2: Run e2e against local dev preview - expect tests PASS**

Run:
```bash
# In one terminal: start the local preview server (serves _site)
python3 tools-suite/build_netlify.py
cd tools-suite/_site && python3 -m http.server 8903 &

# In another: run Playwright (or use the dev server already configured)
npx playwright test tests/e2e/tool-nav-toolbar.spec.ts --project=chromium
```

Expected: 3 tests PASS. If the third test (keyboard accessibility) fails because the skip-link tab-order varies by tool, adjust the number of `Tab` presses to match - or replace with `page.locator('button[aria-label*="back" i]').focus()` followed by an active-element check.

- [ ] **Step 3: Stop the preview server, commit**

```bash
kill %1  # kill the http.server background job
git add tests/e2e/tool-nav-toolbar.spec.ts
git commit -m "test(e2e): tool nav toolbar Playwright suite

Validates toolbar mount,  -> landing navigation,  inter-tool
navigation, and keyboard accessibility on the pilot 5 tools."
```

---

## Task 6: Roll out to all remaining tools

**Files:**
- Modify: ~75 tool HTML files (mechanical, via inject script)
- Modify: `tools-suite/tools/recovery-companion.html` (add `data-rc-no-tool-nav`)

**Goal:** Every patient/family/clinician/admin tool in `tools-suite/tools/` includes `rc-tool-nav.js`, except known iframe-embedded tools. Full QA harness suite still passes.

- [ ] **Step 1: Identify any other iframe-embedded tools**

Run:
```bash
grep -ln '<iframe[^>]*src="[^"]*tools/' tools-suite/tools/*.html
```

For each match, check whether the embedded tool would mount a toolbar inside the iframe. If yes, add the embedded tool's filename to `SKIP_FILENAMES` in `scripts/inject_rc_tool_nav.py` (the `window.self !== window.top` runtime check is the primary guard - this is just a belt-and-suspenders skip).

- [ ] **Step 2: Add `data-rc-no-tool-nav` to recovery-companion.html**

Find the `<body>` opening tag in `tools-suite/tools/recovery-companion.html`:

```bash
grep -n '<body' tools-suite/tools/recovery-companion.html
```

Edit that line to add the attribute. For example, if the line is `<body class="rc-rc-shell">`, change it to `<body class="rc-rc-shell" data-rc-no-tool-nav>`.

- [ ] **Step 3: Run the inject script in --all mode**

```bash
python3 scripts/inject_rc_tool_nav.py --all
```

Expected: summary shows `injected ~75`, `already-injected 5` (the pilot), `skip-list 1+` (recovery-companion + any iframe-embedded ones found in step 1).

Verify:
```bash
grep -l 'rc-tool-nav.js' tools-suite/tools/*.html | wc -l
```
Expected: ~79 (all tools minus the skip-list).

- [ ] **Step 4: Run the full QA harness suite**

```bash
npm run qa
```

Expected: All harnesses pass. If a harness fails on `document.body.firstChild` or similar selector that the toolbar invalidates, fix the harness to be toolbar-aware. Common pattern: replace `document.body.firstChild` with `document.querySelector('#root')` or similar tool-specific anchor.

If a harness fails for a substantive reason (the tool's actual UI broke), revert that one tool's inject by removing the line and add the filename to `SKIP_FILENAMES` for follow-up investigation.

- [ ] **Step 5: Run Playwright suite**

```bash
npx playwright test --project=chromium
```

Expected: All tests pass, including the new `tool-nav-toolbar.spec.ts`.

- [ ] **Step 6: Commit full rollout**

```bash
git add tools-suite/tools/*.html scripts/inject_rc_tool_nav.py
git commit -m "feat(tools): rc-tool-nav.js include - full rollout (~75 tools)

Toolbar now present on all patient/family/clinician/admin tools in
tools-suite/tools/. recovery-companion opted out via
data-rc-no-tool-nav (iframe embed). All QA harnesses pass."
```

---

## Task 7: Build-time cache-bust extension to `build_netlify.py`

**Files:**
- Modify: `tools-suite/build_netlify.py`

**Goal:** Every `_site/tools/*.html` produced by the build has `?v=<build_stamp>` appended to its `<script src="../shared-libs/rc-*.js">`, `<link href="../design-system/rc-*.css">`, and `<script src="generated/<tool>.app.js">` URLs. One shared timestamp per build (so cross-tool caching within a deploy still works).

- [ ] **Step 1: Add a failing integration test (shell-level)**

First ensure the integration test dir exists:

```bash
mkdir -p tests/integration
```

Then create `tests/integration/test_cache_bust.sh`:

```bash
#!/usr/bin/env bash
# Test that build_netlify.py stamps ?v= on shared-libs, design-system,
# and generated bundle URLs in every _site/tools/*.html.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_DIR="$REPO_ROOT/tools-suite/_site"

cd "$REPO_ROOT/tools-suite"
python3 build_netlify.py >/dev/null

# Spot-check one tool HTML
sample="$SITE_DIR/tools/coping-deck.html"
if [ ! -f "$sample" ]; then
  echo "FAIL: sample tool HTML not found at $sample"
  exit 1
fi

fail=0
grep -E 'src="\.\./shared-libs/rc-[^"]+\.js"' "$sample" | grep -v '?v=' && {
  echo "FAIL: shared-libs include without ?v= in $sample"; fail=1; }
grep -E 'href="\.\./design-system/rc-[^"]+\.css"' "$sample" | grep -v '?v=' && {
  echo "FAIL: design-system include without ?v= in $sample"; fail=1; }

# Cross-file: every script/link match across all tools must carry ?v=
total=0
unstamped=0
while IFS= read -r f; do
  while IFS= read -r line; do
    total=$((total + 1))
    if [[ "$line" != *'?v='* ]]; then
      unstamped=$((unstamped + 1))
      [ "$unstamped" -le 3 ] && echo "  unstamped: $f :: $line"
    fi
  done < <(grep -oE '(src|href)="\.\./shared-libs/rc-[^"]+\.js"|(src|href)="\.\./design-system/rc-[^"]+\.(js|css)"|src="generated/[^"]+\.app\.js"' "$f")
done < <(find "$SITE_DIR/tools" -maxdepth 1 -name '*.html')

echo "Inspected $total URL refs across all tool HTML."
if [ "$unstamped" -gt 0 ]; then
  echo "FAIL: $unstamped unstamped URLs found"
  exit 1
fi
[ "$fail" -eq 0 ] || exit 1
echo "PASS: all tool HTML URLs cache-busted"
```

```bash
chmod +x tests/integration/test_cache_bust.sh
```

- [ ] **Step 2: Run the test - expect FAIL**

Run: `bash tests/integration/test_cache_bust.sh`
Expected: After the build runs, the test reports unstamped URLs (no cache-bust step exists yet).

- [ ] **Step 3: Add the cache-bust function to `build_netlify.py`**

Open `tools-suite/build_netlify.py`. Find the existing `build_stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M')` line (around line 673) inside `build_landing_index()`.

Add a new top-level function above `build_landing_index()`:

```python
import re

CACHE_BUST_PATTERNS = [
    re.compile(r'(<script\s+src="\.\./shared-libs/rc-[^"]+\.js)(")', re.IGNORECASE),
    re.compile(r'(<link\s+rel="stylesheet"\s+href="\.\./design-system/rc-[^"]+\.css)(")', re.IGNORECASE),
    re.compile(r'(<link\s+href="\.\./design-system/rc-[^"]+\.css)(")', re.IGNORECASE),
    re.compile(r'(<script\s+src="generated/[^"?]+\.app\.js)(")', re.IGNORECASE),
]


def stamp_tool_html_cache_bust(site_dir, build_stamp):
    """Append `?v=<build_stamp>` to shared-libs / design-system / generated
    bundle URLs in every _site/tools/*.html.

    Idempotent: skips URLs that already carry `?v=`.

    The same build_stamp is used across every tool in a single build, so the
    browser reuses the cached rc-toolbox.js (etc.) when the user opens a
    second tool within the same deploy. Only deploys invalidate.
    """
    tools_dir = site_dir / 'tools'
    if not tools_dir.exists():
        print(f'  WARNING: {tools_dir} not found - skipping cache-bust step')
        return
    suffix = f'?v={build_stamp}'
    files_touched = 0
    urls_stamped = 0
    for html_path in sorted(tools_dir.glob('*.html')):
        content = html_path.read_text(encoding='utf-8')
        original = content
        for pattern in CACHE_BUST_PATTERNS:
            def _replace(match):
                nonlocal urls_stamped
                # match.group(1) = up to and including the file extension
                # match.group(2) = closing quote
                # Only stamp if not already stamped
                if '?v=' in match.group(0):
                    return match.group(0)
                urls_stamped += 1
                return match.group(1) + suffix + match.group(2)
            content = pattern.sub(_replace, content)
        if content != original:
            html_path.write_text(content, encoding='utf-8')
            files_touched += 1
    print(f'  Cache-bust: stamped {urls_stamped} URLs across {files_touched} tool HTML files (v={build_stamp})')
```

Then find the main build orchestration function (look for a `def main():` or a function that calls `build_landing_index()`, `build_clinician_landing()`, etc.). Add a call to the new function near the end, after tool HTML has been copied to `_site` but before any further compression/post-processing:

```python
    #  Cache-bust: stamp shared-libs / design-system / generated URLs 
    cache_bust_stamp = datetime.now(timezone.utc).strftime('%Y%m%d%H%M')
    stamp_tool_html_cache_bust(SITE_DIR, cache_bust_stamp)
```

(If `build_landing_index()`'s existing `build_stamp` runs *before* tool HTML is copied, use a fresh stamp here and document why - they don't need to match. The landing's stamp is for the landing's `app.js`; this stamp is for tool HTML.)

- [ ] **Step 4: Run the test - expect PASS**

Run: `bash tests/integration/test_cache_bust.sh`
Expected: `PASS: all tool HTML URLs cache-busted`. The script reports a positive total count and zero unstamped URLs.

- [ ] **Step 5: Commit**

```bash
git add tools-suite/build_netlify.py tests/integration/test_cache_bust.sh
git commit -m "feat(build): cache-bust shared-libs, design-system, and generated URLs

build_netlify.py stamps ?v=<YYYYMMDDHHMM> on every shared-libs /
design-system / generated bundle URL in _site/tools/*.html. Single
shared timestamp per build -> cross-tool intra-deploy caching
preserved, cross-deploy invalidation guaranteed.

Resolves the 'hard refresh required when switching tools' symptom
caused by 24h browser cache on assets that lack version stamps."
```

---

## Task 8: Canary check for cache-bust

**Files:**
- Modify: `scripts/check_generated_canary_bundles.sh`

**Goal:** CI fails if a deploy somehow ships tool HTML without `?v=` cache-bust stamps. Catches regressions if the build step is removed or the regex breaks.

- [ ] **Step 1: Add the cache-bust check function to the canary script**

Edit `scripts/check_generated_canary_bundles.sh`. After the last `check_bundle` call (and before the final pass/fail summary), add:

```bash
#  Tool HTML cache-bust verification 
check_html_cache_bust() {
  local site_tools="$REPO_ROOT/tools-suite/_site/tools"
  if [ ! -d "$site_tools" ]; then
    echo "SKIP: $site_tools not found - run python3 tools-suite/build_netlify.py first"
    return 0
  fi
  local unstamped=0
  local samples=()
  while IFS= read -r f; do
    while IFS= read -r line; do
      if [[ "$line" != *'?v='* ]]; then
        unstamped=$((unstamped + 1))
        if [ "${#samples[@]}" -lt 3 ]; then
          samples+=("${f##*/}: $line")
        fi
      fi
    done < <(grep -oE '(src|href)="\.\./shared-libs/rc-[^"]+\.js"|(src|href)="\.\./design-system/rc-[^"]+\.css"|src="generated/[^"]+\.app\.js"' "$f")
  done < <(find "$site_tools" -maxdepth 1 -name '*.html')

  if [ "$unstamped" -gt 0 ]; then
    echo "FAIL: $unstamped tool-HTML URLs missing ?v= cache-bust stamp" >&2
    for s in "${samples[@]}"; do echo "  $s" >&2; done
    FAILED_LABELS+=("tool_html_cache_bust")
    return 1
  fi
  echo "PASS: all tool-HTML URLs carry ?v= cache-bust stamps"
}

check_html_cache_bust
```

- [ ] **Step 2: Run the canary script - expect PASS (cache-bust step from Task 7 already ran)**

Run:
```bash
python3 tools-suite/build_netlify.py >/dev/null
bash scripts/check_generated_canary_bundles.sh
```

Expected: existing bundle checks pass, new `PASS: all tool-HTML URLs carry ?v= cache-bust stamps` line appears.

- [ ] **Step 3: Verify the canary catches regressions**

Temporarily strip a `?v=` stamp from one HTML file:

```bash
sed -i '' '0,/?v=[0-9]*/{s//$NOSTAMP/}' tools-suite/_site/tools/coping-deck.html
bash scripts/check_generated_canary_bundles.sh
```

Expected: script exits non-zero, prints `FAIL: 1 tool-HTML URLs missing ?v=`. Then re-run the build to restore:

```bash
python3 tools-suite/build_netlify.py >/dev/null
bash scripts/check_generated_canary_bundles.sh
```

Expected: PASS again.

- [ ] **Step 4: Commit**

```bash
git add scripts/check_generated_canary_bundles.sh
git commit -m "ci(canary): add tool-HTML cache-bust verification

scripts/check_generated_canary_bundles.sh now also asserts every
shared-libs / design-system / generated URL in _site/tools/*.html
carries ?v= - catches regressions if the build's cache-bust step
breaks."
```

---

## Final Verification

- [ ] **Step 1: Confirm full green build**

```bash
python3 tools-suite/build_netlify.py
bash scripts/check_generated_canary_bundles.sh
npm run qa
npx playwright test --project=chromium
```

All four should report success.

- [ ] **Step 2: Manual smoke on local preview**

```bash
cd tools-suite/_site && python3 -m http.server 8903
```

Open `http://localhost:8903/landing/` in a browser:
- [ ] Click any tool -> toolbar visible at top
- [ ]  shows as disabled (first visit in session)
- [ ]  All Tools -> returns to landing
- [ ] Click two different tools sequentially ->  becomes enabled, clicking it returns to first tool
- [ ] Open recovery-companion.html directly -> toolbar NOT shown (data-rc-no-tool-nav)
- [ ] DevTools -> Network tab -> reload a tool -> all `rc-*.js`, `rc-*.css`, `generated/*.app.js` requests carry `?v=YYYYMMDDHHMM`

- [ ] **Step 3: Push branch, open PR**

```bash
git push -u origin claude/crazy-villani-9f80f1
gh pr create --title "feat: tool nav toolbar + build-time cache-bust" --body "$(cat <<'EOF'
## Summary
- New `rc-tool-nav.js` shared lib auto-mounts a browser-style  / -> /  nav toolbar on every tool in `tools-suite/tools/` (~79 tools; recovery-companion opted out as iframe embed)
- `build_netlify.py` now stamps `?v=<timestamp>` on shared-libs / design-system / generated URLs in every `_site/tools/*.html` so deploys invalidate browser caches automatically - fixes the "hard refresh required when switching tools" symptom
- New canary check ensures the cache-bust step never silently breaks
- Spec: `docs/superpowers/specs/2026-04-26-tool-nav-toolbar-and-cache-bust-design.md`
- Plan: `docs/superpowers/plans/2026-04-26-tool-nav-toolbar-and-cache-bust.md`

## Test plan
- [ ] Local preview smoke (see plan "Final Verification")
- [ ] Netlify deploy preview: open 3 tools, hard-refresh nothing, confirm toolbar +  / -> behavior on real device
- [ ] DevTools -> Network: confirm `?v=` stamps present on rc-* and generated assets
- [ ] No console errors on any pilot tool

 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- Component A (rc-tool-nav.js) - Tasks 1, 2, 3 [yes]
- Component B (build_netlify.py cache-bust) - Task 7 [yes]
- Per-tool integration - Tasks 4, 6 [yes]
- Testing strategy (QA harness, e2e, cache-bust verification) - Tasks 1-3 (QA), 5 (e2e), 7-8 (cache-bust) [yes]
- Rollout plan (3 PRs) - Plan delivers as one branch with clean commits per task; reviewer can split into 3 PRs if preferred [yes]
- Risks (toolbar layout, sessionStorage quota, build-stamp regex collision,  path resolution) - addressed in implementation [yes]

**Type / API consistency:**
- `RCToolNav` API surface (`mount`, `unmount`, `setTitle`, `history` getter) consistent across Tasks 1-3 [yes]
- `STORAGE_KEY = 'rc_tool_nav_v1'` consistent [yes]
- `LANDING_HREF = '../landing/'` consistent (relative path, works in both prod and dev) [yes]
- `data-rc-no-tool-nav` attribute name consistent in inject script and lib [yes]

**Open items deferred to implementation (per spec "Open Questions"):**
- Mobile label fallback finalized as "icons only on <=640px" (CSS media query in Task 1) [yes]
-  button text "All Tools" - locked in Task 1 [yes]
- Toolbox/bookmarks integration - deferred (out of scope) [yes]


---

## Source: `11_AI_and_Prompts/_source/CLI.md`

# Audience Adapter - CLI (Clinician)

Write for psychiatrists, nurses, social workers, and allied clinical staff.

- **Reading level:** Grade 12+. Professional, evidence-dense; clinical terminology expected.
- **Layer language:** use L1-L4 notation and RSS vocabulary precisely (lowest unstable layer,
  intensity gradient, concurrent engagement, containment).
- **Evidence:** cite with evidence levels and qualifiers; effect sizes and replication status
  where available. Clinicians should be able to audit every claim.
- **Format:** lead with the actionable assessment (priority, sequencing, next actions), then
  rationale. Respect their time - dense, structured, skimmable.
- **Stance:** collegial decision support. Offer prioritization and trade-offs, not orders;
  flag uncertainty explicitly rather than projecting false confidence.


---

## Source: `11_AI_and_Prompts/_source/CONTRIBUTING.md`




---

## Source: `12_Media/README.md`

# 12 * Media
- [yes] **RSS video scripts (10)** -> `teaching/video-scripts/` ( merge the duplicate `teaching/video-content/Scripts/` dir).
- [yes] **Video QR system** -> `teaching/video-qr-system/`.
- [yes] **NotebookLM audio overviews (13 projects)** -> `teaching/notebooklm-projects/`.
- [yes] **FTM audio library** -> `_assets/ftm-audio/` (by-topic).
-  **Book + Podcast library** (verified seed catalog) -> build from `~/Library_Plan_and_Audit_Roadmap.md`.

**Status tags:** [yes] Exists *  Revise *  Expand *  Create *  Merge *  Archive


---

## Source: `12_Media/_source/Black Music Month - Artists & Mental Health 2b849b94b18d80a5b586f3dda41d54d4.md`




---

## Source: `12_Media/_source/Black Music Month - Artists & Mental Health 2b849b94b18d80d39016ce6adce10b83.md`




---

## Source: `12_Media/_source/Cannabis & Mental Health Deep Dive 2b849b94b18d803caa8adb8287376d06.md`




---

## Source: `12_Media/_source/Cannabis & Mental Health Deep Dive 2b849b94b18d80febc37eb3b83bb2c13.md`




---

## Source: `12_Media/_source/Compassion Fatigue in Professional and Family Care 38742c09997b4d4ebdf804bd8cd6777f.md`




---

## Source: `12_Media/_source/Dr Phil McGraw - Mental Health in America 2b849b94b18d8071bb35f9cc938a5bca.md`




---

## Source: `12_Media/_source/Episode 001 The Basics of the Psychiatric Intervie 2b849b94b18d809cbf56f77cd13ba3c0.md`




---

## Source: `12_Media/_source/Episode 031 Psychiatric Approach to Delirium 2b849b94b18d805fbf17e95d75603307.md`




---

## Source: `12_Media/_source/Episode 056 Neuralink and Mental Health 2b849b94b18d804f8bf8ce9a42fa98c6.md`




---

## Source: `12_Media/_source/Episode 059 Foods for Mental Health 2b849b94b18d80fda355d6ed0ca032b4.md`




---

## Source: `12_Media/_source/Episode 061 Involuntary Holds and Capacity 2b849b94b18d80018391cdb2f1249c04.md`




---

## Source: `12_Media/psychiatry_psychotherapy_podcast_library.md`

# Psychiatry & Psychotherapy Podcast - Episode Library (categorized)

> Dr. David Puder's **Psychiatry & Psychotherapy Podcast**, organized by topic from your podcast database. Items marked ** YouTube** link straight to the verified video; a few marked ** search channel** had no exact public-video match. Full episode pages + CME: [psychiatrypodcast.com](https://www.psychiatrypodcast.com/). Suggested listening, not required.

## Foundations & the psychiatric interview  (38)
- Episode 1: The Basics of the Psychiatric Interview - [ YouTube](https://www.youtube.com/watch?v=-9SekuYZ1_Y)
- Episode 3: Psychopathy with Michael A. Cummings M.D. - [ YouTube](https://www.youtube.com/watch?v=rlBZ-jvXClw)
- Episode 4: Inpatient Child and Adolescent Suicidality - [ YouTube](https://www.youtube.com/watch?v=AW8SLOXsWXk)
- Episode 15: Microexpressions Part 1 - [ YouTube](https://www.youtube.com/watch?v=AkWMEe9pDCA)
- Episode 16: Microexpressions Part 2 - [ YouTube](https://www.youtube.com/watch?v=jFhFcoVTZdI)
- Episode 17: Microexpressions in Psychotherapy Part 3 - [ YouTube](https://www.youtube.com/watch?v=kb_cXrVFjsY)
- Episode 28: Therapeutic Alliance Part 1 - [ YouTube](https://www.youtube.com/watch?v=AAl2JRBcoJc)
- Episode 32: Therapeutic Alliance Part 2: Logotherapy - [ YouTube](https://www.youtube.com/watch?v=ezgEMZFR0LY)
- Episode 36: Therapeutic Alliance Part 3: Empathy - [ YouTube](https://www.youtube.com/watch?v=-5IavceeEqU)
- Episode 47: Schizophrenia Differential Diagnosis - [ YouTube](https://www.youtube.com/watch?v=C9AhzCcSbek)
- Episode 54: Suicide Epidemiology and Prevention - [ YouTube](https://www.youtube.com/watch?v=_5ebgHRNmCw)
- Episode 61: Involuntary Holds and Capacity - [ YouTube](https://www.youtube.com/watch?v=PSL5rF7UJdY)
- Episode 62: Therapeutic Alliance Part 5: Emotion - [ YouTube](https://www.youtube.com/watch?v=CQgnLZ4c1bw)
- Episode 68: IQ and Environmental Factors - [ YouTube](https://www.youtube.com/watch?v=-jmXWOCsXts)
- Episode 69: Therapeutic Alliance Part 6: Attachment - [ YouTube](https://www.youtube.com/watch?v=ZBapSvanmMg)
- Episode 82: Mental Pain and Suicidality - [ YouTube](https://www.youtube.com/watch?v=8jwrIf-s3v4)
- Episode 92: Big Five Neuroticism Part 1 - [ YouTube](https://www.youtube.com/watch?v=kxGGuQgfBUk)
- Episode 93: Forensic Pedophilia - [ YouTube](https://www.youtube.com/watch?v=fZ5CkBfuXbU)
- Episode 95: Big Five Neuroticism Part 2 - [ YouTube](https://www.youtube.com/watch?v=t-rKwbtHF8k)
- Episode 97: Big Five Conscientiousness Part 1 - [ YouTube](https://www.youtube.com/watch?v=Rb7JuaarA7s)
- Episode 98: Big Five Openness - [ YouTube](https://www.youtube.com/watch?v=kE7UYVy7hPU)
- Episode 100: Big Five Agreeableness - [ YouTube](https://www.youtube.com/watch?v=iMNk2Z7h_GM)
- Episode 101: Big Five Extraversion - [ YouTube](https://www.youtube.com/watch?v=rsC9WT4K1LU)
- Episode 103: Acceptance and Commitment Therapy - [ YouTube](https://www.youtube.com/watch?v=5TAYCeD1QGs)
- Episode 114: Female Psychopathy - [ YouTube](https://www.youtube.com/watch?v=7c3SwebWYtQ)
- Episode 116: Psychopathy Expert Interview - [ YouTube](https://www.youtube.com/watch?v=Mgw9rHHjjqg)
- Episode 118: Microexpressions for Empathy - [ YouTube](https://www.youtube.com/watch?v=jEOU_ukX61s)
- Episode 166: Identifying Malingering - [ YouTube](https://www.youtube.com/watch?v=RpFBtfFezEY)
- Episode 171: Nancy McWilliams Interview - [ YouTube](https://www.youtube.com/watch?v=b1M2RBvHMhM)
- Episode 195: Robert Sapolsky Interview - [ YouTube](https://www.youtube.com/watch?v=BxpKp0Zp6OA)
- Episode 197: Eating Disorders Medical Care - [ YouTube](https://www.youtube.com/watch?v=dZOH0jbPXo4)
- Episode 199: Motivational Interviewing - [ YouTube](https://www.youtube.com/watch?v=FpnaJFStVGQ)
- Episode 203: Adverse Childhood Experiences - [ YouTube](https://www.youtube.com/watch?v=TuAJ__CrMaE)
- Episode 204: ACEs Part 2 - [ YouTube](https://www.youtube.com/watch?v=xMkt1WyZzAw)
- Episode 207: 5 Domains of Psychiatric Care - [ YouTube](https://www.youtube.com/watch?v=3EZEnMDduQs)
- Episode 213: Reflective Functioning - [ YouTube](https://www.youtube.com/watch?v=zleBvvm5kfU)
- Episode 215: Complex PTSD vs BPD - [ YouTube](https://www.youtube.com/watch?v=OXDDY5vsm2g)
- Episode 217: ACEs and Brain Changes - [ YouTube](https://www.youtube.com/watch?v=kxSSwesz7oQ)

## Psychotherapy process - transference & dynamics  (25)
- Episode 21: How to Fix Emotional Detachment - [ YouTube](https://www.youtube.com/watch?v=4wM_cw7qY5A)
- Episode 29: What is Psychodynamic Theory? - [ YouTube](https://www.youtube.com/watch?v=nYk2C42WHgY)
- Episode 41: Transference and Countertransference - [ YouTube](https://www.youtube.com/watch?v=Xxa7-tC-ypM)
- Episode 50: The Process of Grief - [ YouTube](https://www.youtube.com/watch?v=qvXptukXxOc)
- Episode 87: Disorganized Attachment Part 1 - [ YouTube](https://www.youtube.com/watch?v=ZS45l18sWAg)
- Episode 88: Disorganized Attachment Part 2 - [ YouTube](https://www.youtube.com/watch?v=Y3eW7mvX4f0)
- Episode 144: Psychodynamic Therapy Evidence - [ YouTube](https://www.youtube.com/watch?v=Wxmzk8IE0ew)
- Episode 164: Listening Psychodynamically - [ YouTube](https://www.youtube.com/watch?v=8PKUD6XVHz4)
- Episode 168: Obsessive-Compulsive Personality - [ YouTube](https://www.youtube.com/watch?v=4ZRLXSZZECo)
- Episode 170: Using Transference - [ YouTube](https://www.youtube.com/watch?v=nEw449ACUUo)
- Episode 185: Narcissism with Shedler - [ YouTube](https://www.youtube.com/watch?v=KZSD3lauzDo)
- Episode 194: Emotionally Focused Therapy - [ YouTube](https://www.youtube.com/watch?v=wwXroEAMbOU)
- Episode 198: Connection in Medical Education - [ YouTube](https://www.youtube.com/watch?v=QYEf5vbfDWo)
- Episode 205: Beginning Treatment - [ YouTube](https://www.youtube.com/watch?v=puddZhRgRNI)
- Episode 209: Cognitive Processing Therapy - [ YouTube](https://www.youtube.com/watch?v=-cOXrHsp0Js)
- Episode 220: Writing for Trauma Healing - [ YouTube](https://www.youtube.com/watch?v=Zk281N43rt8)
- Episode 222: Paul Wachtel on Attachment - [ YouTube](https://www.youtube.com/watch?v=SloGQ88Bi6E)
- Episode 231: BPD Splitting and Identity - [ search channel](https://www.youtube.com/@psychiatrypsychotherapy6939/search?query=Psychiatry+Psychotherapy+Podcast+Episode+231%3A+BPD+Splitting+and+Identity)
- Episode 234: Transference Focused Psychotherapy - [ YouTube](https://www.youtube.com/watch?v=uyPquOVhO-c)
- Episode 239: Transference Focused Psychotherapy & Personality Disorders with Dr. Otto Kernberg - [ YouTube](https://www.youtube.com/watch?v=uyPquOVhO-c)
- Episode 242: The Bear - Trauma, Personality, and Attachment with Dr. Eric Bender and Dr. David Puder - [ YouTube](https://www.youtube.com/watch?v=IewBzMztsB4)
- Episode 244: Psychodynamic Psychopharmacology - Insights from Dr. David Mintz - [ YouTube](https://www.youtube.com/watch?v=kqRlbzU3ukw)
- Episode 249: Intergenerational Trauma Explained - The Role of Reflective Function and Mentalization in Healing Attachment - [ YouTube](https://www.youtube.com/watch?v=2S9wXrEJOIY)
- Episode 250: Devaluation, Transference, Narcissism with Diana Diamond - [ YouTube](https://www.youtube.com/watch?v=oy-2eDCZaQY)
- Episode 254: Countertransference and Transference with Frank Yeomans, MD - [ YouTube](https://www.youtube.com/watch?v=P3nUeqD7l0Q)

## Trauma & PTSD  (9)
- Episode 23: Emotional Shutdown - Polyvagal Theory - [ YouTube](https://www.youtube.com/watch?v=dVrT_QqqyZs)
- Episode 27: How to Treat Emotional Trauma - [ YouTube](https://www.youtube.com/watch?v=CRwlo7AP4tc)
- Episode 43: How to Help Patients with Sexual Abuse - [ YouTube](https://www.youtube.com/watch?v=W_K1Rcx4XWA)
- Episode 48: The Unspeakable Mind - PTSD - [ YouTube](https://www.youtube.com/watch?v=MTSvqVNgZy0)
- Episode 83: Racism and Trauma - [ YouTube](https://www.youtube.com/watch?v=bnAd_LfHRj0)
- Episode 177: Anxiety Leading to Growth - [ YouTube](https://www.youtube.com/watch?v=mzEfyoTL_2M)
- Episode 188: Depersonalization and Derealization - [ YouTube](https://www.youtube.com/watch?v=Vj-Z9du3gJg)
- Episode 212: Bruce Perry on Trauma - [ YouTube](https://www.youtube.com/watch?v=wH24aM-enzc)
- Episode 246: Cannabis and Depression, Anxiety, PTSD, Sleep, and Cognitive Function Update and Review - [ YouTube](https://www.youtube.com/watch?v=lnbindCcQbM)

## Mood & bipolar; suicide  (28)
- Episode 2: Cognitive Distortions and Practicing Truth - [ YouTube](https://www.youtube.com/watch?v=-KqHdPspSYo)
- Episode 10: Exercise as a Prescription for Depression - [ YouTube](https://www.youtube.com/watch?v=s9yJsv6O3yQ)
- Episode 13: Postpartum Depression - [ YouTube](https://www.youtube.com/watch?v=KIeGlbrqfJM)
- Episode 14: Hormonal Contraceptives and Mental Health - [ YouTube](https://www.youtube.com/watch?v=Z_MRaEZ-4NI)
- Episode 18: Prescribing Strength Training for Depression - [ YouTube](https://www.youtube.com/watch?v=NI9_MsKuUxc)
- Episode 24: History and Use of Antidepressants - [ YouTube](https://www.youtube.com/watch?v=6-t8_RN2vX4)
- Episode 25: The History and Nuances of Bipolar Illness - [ YouTube](https://www.youtube.com/watch?v=vBeB6V-KA70)
- Episode 30: Ketamine and Psychedelics - [ YouTube](https://www.youtube.com/watch?v=KhLS5uPTeKQ)
- Episode 33: Perinatal Mood and Anxiety Disorders - [ YouTube](https://www.youtube.com/watch?v=7TeeK8ruaA8)
- Episode 39: Depression in Geriatric Patients - [ YouTube](https://www.youtube.com/watch?v=uoXypIuHpo0)
- Episode 57: Why Lithium Works for Bipolar - [ YouTube](https://www.youtube.com/watch?v=-j67sto5OZs)
- Episode 60: Genetics and Suicide - [ YouTube](https://www.youtube.com/watch?v=Dwu5TRhl2jA)
- Episode 71: Valproic Acid Deep Dive - [ YouTube](https://www.youtube.com/watch?v=8dnqdB03bks)
- Episode 75: Cancer and Mental Health - [ YouTube](https://www.youtube.com/watch?v=Ilv9OoMaZW4)
- Episode 81: Unemployment Depression and Suicide - [ YouTube](https://www.youtube.com/watch?v=lGbKbeh4CwE)
- Episode 91: Tricyclic Antidepressants - [ YouTube](https://www.youtube.com/watch?v=ClU2wUvw9wk)
- Episode 96: Best Exercise for Depression - [ YouTube](https://www.youtube.com/watch?v=n1pxAsGo4Dw)
- Episode 131: Diet for Depression and Anxiety - [ YouTube](https://www.youtube.com/watch?v=PCDuyanhr-w)
- Episode 137: Ketamine Update - [ YouTube](https://www.youtube.com/watch?v=2mw7Fv8N-WU)
- Episode 155: Is Depression Chemical Imbalance? - [ YouTube](https://www.youtube.com/watch?v=AnZ98Iq7CV4)
- Episode 161: Conrad Roy Case Analysis - [ YouTube](https://www.youtube.com/watch?v=Ri3Z-2nLssk)
- Episode 187: Best Diet for Mood Update - [ YouTube](https://www.youtube.com/watch?v=bLS8qhXGU5k)
- Episode 201: Psychotic Depression - [ YouTube](https://www.youtube.com/watch?v=OoXGcXxvojQ)
- Episode 230: Exercise vs Medications - [ YouTube](https://www.youtube.com/watch?v=AC3P-SrTj1M)
- Episode 235: Serotonin Hypothesis Debate - [ YouTube](https://www.youtube.com/watch?v=zrHrjQOIqhw)
- Episode 237: Ketogenic Diet Review and Update with Dr. Matt Bernstein - [ YouTube](https://www.youtube.com/watch?v=4AtMlzuqiRI)
- Episode 238: Creatine for Mental Health - [ YouTube](https://www.youtube.com/watch?v=ZA9IqozNCFI)
- Episode 241: Depressive Personality Style with Jonathan Shedler - [ YouTube](https://www.youtube.com/watch?v=J2TiCHMsOls)

## Psychosis & schizophrenia  (19)
- Episode 8: Schizophrenia with Dr. Cummings - [ YouTube](https://www.youtube.com/watch?v=Hoj5M5iDOn0)
- Episode 20: The History and Use of Antipsychotics - [ YouTube](https://www.youtube.com/watch?v=bpAYy5Yf6ZA)
- Episode 45: Schizophrenia in Film and History - [ YouTube](https://www.youtube.com/watch?v=IU_SSEt51AU)
- Episode 46: Do I Have Schizophrenia? - [ YouTube](https://www.youtube.com/watch?v=Gp5kJdV6shc)
- Episode 49: Clozapine for Treatment Resistant Schizophrenia - [ YouTube](https://www.youtube.com/watch?v=aRY_U-7K520)
- Episode 70: Connecting with Psychotic Patients - [ YouTube](https://www.youtube.com/watch?v=i2CUaHlXtRw)
- Episode 117: Psychotic Disorders Comorbidity - [ YouTube](https://www.youtube.com/watch?v=u-w8TrQY34A)
- Episode 127: Antipsychotic Plasma Levels - [ YouTube](https://www.youtube.com/watch?v=ScTU1TaCH30)
- Episode 129: Complex Psychosis Management - [ YouTube](https://www.youtube.com/watch?v=TW5RuzvZ4aw)
- Episode 143: Schizophrenia Overdiagnosis in Black Patients - [ YouTube](https://www.youtube.com/watch?v=RPqWgAoaAlo)
- Episode 167: Long-Acting Injectables - [ YouTube](https://www.youtube.com/watch?v=Qf53Cajvfbc)
- Episode 180: Psychotherapy for Psychosis - [ YouTube](https://www.youtube.com/watch?v=2tW7YYRwyH8)
- Episode 190: Schizophrenia Treatment Equity - [ YouTube](https://www.youtube.com/watch?v=p9rB9okhhS8)
- Episode 211: Early Psychosis - [ YouTube](https://www.youtube.com/watch?v=Pw63OFaC4uQ)
- Episode 229: Beyond Psychosis Myths - [ YouTube](https://www.youtube.com/watch?v=i0aiGArW9x4)
- Episode 236: Clozapine Update - [ YouTube](https://www.youtube.com/watch?v=3nv3XLluQ1Q)
- Episode 240: Cannabis and Psychosis - The Link Between THC Use and Mental Health Risks - [ YouTube](https://www.youtube.com/watch?v=cHez9-uS-8I)
- Episode 252: Genetic and Environmental Influences of Schizophrenia - [ YouTube](https://www.youtube.com/watch?v=MZ90Gthvj8w)
- Episode 253: AI Psychosis - Emerging Cases of Delusion Amplification Associated with ChatGPT and LLM Chatbot Use - [ YouTube](https://www.youtube.com/watch?v=CllJPWmm9So)

## Anxiety, OCD & stress  (11)
- Episode 12: Performance Enhancement - [ YouTube](https://www.youtube.com/watch?v=TMgZrh5KS7E)
- Episode 22: The Psychology of Procrastination - [ YouTube](https://www.youtube.com/watch?v=UQEyqNDbMf0)
- Episode 76: COVID-19 Mental Health - [ YouTube](https://www.youtube.com/watch?v=W6pNUNPZ7vs)
- Episode 90: How to Rock the USMLE - [ YouTube](https://www.youtube.com/watch?v=kyJcF5GQLT8)
- Episode 119: Obsessive Compulsive Disorder - [ search channel](https://www.youtube.com/@psychiatrypsychotherapy6939/search?query=Psychiatry+Psychotherapy+Podcast+Episode+119%3A+Obsessive+Compulsive+Disorder)
- Episode 126: OCD Psychotherapy - [ search channel](https://www.youtube.com/@psychiatrypsychotherapy6939/search?query=Psychiatry+Psychotherapy+Podcast+Episode+126%3A+OCD+Psychotherapy)
- Episode 169: Social Anxiety Treatment - [ YouTube](https://www.youtube.com/watch?v=4hR4UUz70KI)
- Episode 178: Social Anxiety and Blushing - [ YouTube](https://www.youtube.com/watch?v=IC3HHazYINo)
- Episode 228: OCD Treatment Guide - [ YouTube](https://www.youtube.com/watch?v=flP_z4XByk4)
- Episode 245: Regulating Our Emotions as Parents with Alissa Jerud, PhD - [ YouTube](https://www.youtube.com/watch?v=9CalH5Qzc-Y)
- Episode 248: Understanding Real Event OCD - When the Past Fuels Obsession - [ YouTube](https://www.youtube.com/watch?v=bYZwFZ4ZKGs)

## Personality  (9)
- Episode 38: The Dark Triad - [ YouTube](https://www.youtube.com/watch?v=06zorLRqk8o)
- Episode 115: Borderline Personality Disorder Overview - [ YouTube](https://www.youtube.com/watch?v=dfSLHXaPTek)
- Episode 130: Schema Therapy for BPD - [ YouTube](https://www.youtube.com/watch?v=AOJaCM-GiMo)
- Episode 140: BPD Common Factors - [ YouTube](https://www.youtube.com/watch?v=VE8ObBUp96c)
- Episode 148: Karen Horney - [ YouTube](https://www.youtube.com/watch?v=AiuntNGdc10)
- Episode 206: Mentalization-Based Therapy - [ YouTube](https://www.youtube.com/watch?v=OlaHnCCi8kE)
- Episode 224: BPD Medications and Treatment - [ YouTube](https://www.youtube.com/watch?v=EOQXLFdzCUU)
- Episode 227: Mentalization for Narcissism - [ YouTube](https://www.youtube.com/watch?v=fJ3fVZ0GegI)
- Episode 247: Identity Diffusion Borderline Personality Organization - [ YouTube](https://www.youtube.com/watch?v=4pR4E8s0dgQ)

## Substance use & addiction  (6)
- Episode 11: Sensorium Part 4: Medications and Substances - [ YouTube](https://www.youtube.com/watch?v=VwU8bQpofiE)
- Episode 66: Fentanyl and the Opioid Crisis - [ YouTube](https://www.youtube.com/watch?v=7ZiJKV-sy9Q)
- Episode 133: Blitzed - Drugs in Nazi Germany - [ YouTube](https://www.youtube.com/watch?v=8FpRSd0YQOo)
- Episode 181: Alcohol Use Disorder - [ YouTube](https://www.youtube.com/watch?v=W5-dbQFqVbs)
- Episode 182: Opioid Use Disorder - [ YouTube](https://www.youtube.com/watch?v=6tLzBZNTvZA)
- Episode 193: Buprenorphine Management - [ YouTube](https://www.youtube.com/watch?v=YhKvhaQwUs4)

## Psychopharmacology  (20)
- Episode 19: How Psychiatric Medications Work - [ YouTube](https://www.youtube.com/watch?v=if5eQeIMcEw)
- Episode 34: Understanding Placebo - [ YouTube](https://www.youtube.com/watch?v=OLQb-WVfitw)
- Episode 35: ADHD Diagnosis and Treatment - [ YouTube](https://www.youtube.com/watch?v=-6aVGlYUBas)
- Episode 58: Lithium Monitoring and Side Effects - [ search channel](https://www.youtube.com/@psychiatrypsychotherapy6939/search?query=Psychiatry+Psychotherapy+Podcast+Episode+058%3A+Lithium+Monitoring+and+Side+Effects)
- Episode 102: Anticholinergic Burden - [ YouTube](https://www.youtube.com/watch?v=K_e_aKu2Wu0)
- Episode 106: Psilocybin Therapy Part 2 - [ YouTube](https://www.youtube.com/watch?v=XC7KP43U3DY)
- Episode 109: SNRIs Deep Dive Part 1 - [ YouTube](https://www.youtube.com/watch?v=MsOVGtstdEM)
- Episode 112: SNRIs Deep Dive Part 2 - [ YouTube](https://www.youtube.com/watch?v=5a8BdHV9Go0)
- Episode 124: Sleep Medications and Insomnia - [ YouTube](https://www.youtube.com/watch?v=yXJxkQqXRtY)
- Episode 132: Practical Psychopharmacology - [ YouTube](https://www.youtube.com/watch?v=W1XhEaBLnZI)
- Episode 141: Psychopharmacology Mediators - [ YouTube](https://www.youtube.com/watch?v=jmrOCOOEEjA)
- Episode 145: Managing Inpatient Aggression - [ YouTube](https://www.youtube.com/watch?v=5CwSReUrvjY)
- Episode 152: ECT Efficacy and Controversies - [ YouTube](https://www.youtube.com/watch?v=QynkM07nvk0)
- Episode 157: Polypharmacy in Psychiatry - [ YouTube](https://www.youtube.com/watch?v=s-N87s9VJ0s)
- Episode 174: Serotonin Syndrome - [ YouTube](https://www.youtube.com/watch?v=T2zOj6S72bs)
- Episode 183: Emerging Drugs - [ YouTube](https://www.youtube.com/watch?v=0lQlRRSOiZM)
- Episode 184: Pregnancy and Psych Meds - [ YouTube](https://www.youtube.com/watch?v=ba8MyUs3I2g)
- Episode 210: Q&A with Dr. Cummings - [ YouTube](https://www.youtube.com/watch?v=FOlmOKGCBIE)
- Episode 214: Q&A Part 2 - [ YouTube](https://www.youtube.com/watch?v=KgrpJEcExps)
- Episode 223: Weight Gain from Psych Meds - [ YouTube](https://www.youtube.com/watch?v=JMHLFLCU7Qc)

## Neuroscience & the brain  (12)
- Episode 6: Sensorium Part 1: Total Brain Function Optimization - [ YouTube](https://www.youtube.com/watch?v=HKzGWEZLbe0)
- Episode 9: Diet Optimization for Cognitive Function - [ YouTube](https://www.youtube.com/watch?v=d-4jH4ftszg)
- Episode 53: Frontal Lobe Damage - [ YouTube](https://www.youtube.com/watch?v=3nvjTIl3kcw)
- Episode 56: Neuralink and Mental Health - [ YouTube](https://www.youtube.com/watch?v=PhxZ33kAhMI)
- Episode 73: Catatonia Diagnosis and Treatment - [ YouTube](https://www.youtube.com/watch?v=lwOHZfRYw8c)
- Episode 78: COVID-19 and the Brain - [ YouTube](https://www.youtube.com/watch?v=FUw6b_QZW2s)
- Episode 134: Strengths of Dyslexia - [ YouTube](https://www.youtube.com/watch?v=DBReAcmaXcE)
- Episode 139: Affective Neuroscience - [ YouTube](https://www.youtube.com/watch?v=hTmUZF2zJrk)
- Episode 153: Consciousness and Emotion - [ YouTube](https://www.youtube.com/watch?v=G70CLtf2RYo)
- Episode 165: Exercise for the Brain - [ YouTube](https://www.youtube.com/watch?v=NdNJ7F8bmdo)
- Episode 232: Cold Exposure Benefits - [ YouTube](https://www.youtube.com/watch?v=Xnvy6MA4jGY)
- Episode 243: Catatonia in Children and Teens - [ YouTube](https://www.youtube.com/watch?v=nZCav67MXBs)

## Child, adolescent & development  (9)
- Episode 5: A Journey Learning Psychotherapy - [ YouTube](https://www.youtube.com/watch?v=orJL8LrK8FA)
- Episode 94: Oversexualization of Children - [ YouTube](https://www.youtube.com/watch?v=W1YeewVRSsU)
- Episode 99: Big Five Conscientiousness Part 2 - [ YouTube](https://www.youtube.com/watch?v=QsbuCMJs56o)
- Episode 110: Hero's Journey for Professionals - [ YouTube](https://www.youtube.com/watch?v=XX-eDb6JLjY)
- Episode 136: Turn Autism Around - [ YouTube](https://www.youtube.com/watch?v=fmVaXoLwfaY)
- Episode 159: Parental Alienation - [ YouTube](https://www.youtube.com/watch?v=y5HOCMWYjtY)
- Episode 162: The Autism Wave - [ YouTube](https://www.youtube.com/watch?v=UlmNqJqEC-Y)
- Episode 175: IOP for Psychosomatic Illness - [ YouTube](https://www.youtube.com/watch?v=WddsbY7QQa8)
- Episode 225: Inside Out 2 Psychology - [ YouTube](https://www.youtube.com/watch?v=IaRSIGa_pDs)

## Clinician wellbeing & professional growth  (7)
- Episode 7: Physicians Receiving Treatment - [ YouTube](https://www.youtube.com/watch?v=LK3y3Hef84I)
- Episode 42: The Science Behind Forgiveness - [ YouTube](https://www.youtube.com/watch?v=101PWhbQaSQ)
- Episode 80: Meaning in Crisis - [ YouTube](https://www.youtube.com/watch?v=GSNxceY-JoE)
- Episode 135: From Survive to Thrive - [ YouTube](https://www.youtube.com/watch?v=7yHOrRleEOo)
- Episode 173: Real Self-Care - [ YouTube](https://www.youtube.com/watch?v=yVHeHCaNPzs)
- Episode 219: Eating Disorders Psychology - [ YouTube](https://www.youtube.com/watch?v=6xl4b2v538o)
- Episode 226: Healthcare Burnout - [ YouTube](https://www.youtube.com/watch?v=LDFch7RSSyY)

## Other & special topics  (52)
- Episode 26: Setting Boundaries in Relationships - [ YouTube](https://www.youtube.com/watch?v=BCf6x9FmZ-Q)
- Episode 31: Psychiatric Approach to Delirium - [ YouTube](https://www.youtube.com/watch?v=bsOt4z33PNU)
- Episode 37: How to Treat Violent Patients - [ YouTube](https://www.youtube.com/watch?v=QTwzuuF1hP4)
- Episode 40: Reducing Inpatient Violence - [ YouTube](https://www.youtube.com/watch?v=MiuULzAdls4)
- Episode 51: Eating Disorders Overview - [ YouTube](https://www.youtube.com/watch?v=ZZgEz8c_NzI)
- Episode 52: Psychodermatology - [ YouTube](https://www.youtube.com/watch?v=9zMi8Yba8oc)
- Episode 55: How to Pick a Good Therapist - [ YouTube](https://www.youtube.com/watch?v=f2LR9LADvOI)
- Episode 59: Foods for Mental Health - [ YouTube](https://www.youtube.com/watch?v=yhtDEu4FA2g)
- Episode 65: Is Social Media Good for Mental Health - [ YouTube](https://www.youtube.com/watch?v=ISGpNJnImPM)
- Episode 67: Joker Character Analysis - [ YouTube](https://www.youtube.com/watch?v=_xv240cm_to)
- Episode 72: Violence and Mental Illness - [ YouTube](https://www.youtube.com/watch?v=F61IriYEyRQ)
- Episode 77: Getting Better Therapy Results - [ YouTube](https://www.youtube.com/watch?v=gdhg97_RKwQ)
- Episode 79: Tough Conversations in COVID-19 - [ YouTube](https://www.youtube.com/watch?v=gsI3fw8fj-U)
- Episode 84: Free Will in Psychiatry Part 1 - [ YouTube](https://www.youtube.com/watch?v=N9gYwgMkT-k)
- Episode 85: Free Will Part 2 - [ YouTube](https://www.youtube.com/watch?v=zxM9opzlycI)
- Episode 86: Free Will Part 3 - [ YouTube](https://www.youtube.com/watch?v=4HRjlTn1adM)
- Episode 89: How to Retire Happy - [ search channel](https://www.youtube.com/@psychiatrypsychotherapy6939/search?query=Psychiatry+Psychotherapy+Podcast+Episode+089%3A+How+to+Retire+Happy)
- Episode 104: Psilocybin Therapy Part 1 - [ YouTube](https://www.youtube.com/watch?v=6atRgjYIip0)
- Episode 105: Vulnerability and Imposter Syndrome - [ YouTube](https://www.youtube.com/watch?v=LqA5PPtoFkY)
- Episode 107: Hero's Journey - [ YouTube](https://www.youtube.com/watch?v=cWXrKYqRUUE)
- Episode 113: Man's Search for Meaning - [ YouTube](https://www.youtube.com/watch?v=r_cm4K8hzZk)
- Episode 120: Marcus Aurelius Meditations - [ YouTube](https://www.youtube.com/watch?v=-qsiRkjzjNM)
- Episode 121: Britney Spears Conservatorship - [ YouTube](https://www.youtube.com/watch?v=KKpTQIgj_EE)
- Episode 122: Alzheimer's Dementia - [ YouTube](https://www.youtube.com/watch?v=4qGRGtiuIDg)
- Episode 123: Mass Shootings Research - [ YouTube](https://www.youtube.com/watch?v=9EQ6XjSZOiE)
- Episode 125: Treating VIP Patients - [ YouTube](https://www.youtube.com/watch?v=WFzhMU2z7Pw)
- Episode 128: Crime and Punishment - [ YouTube](https://www.youtube.com/watch?v=eGefv4fjE20)
- Episode 138: Spiritual Struggles in Therapy - [ YouTube](https://www.youtube.com/watch?v=K4ZULYyJTJI)
- Episode 142: Exercise as Medicine - [ YouTube](https://www.youtube.com/watch?v=YQrhLzKcDW4)
- Episode 150: Couples Therapy Approaches - [ YouTube](https://www.youtube.com/watch?v=KQ8d_fxKIbw)
- Episode 151: Learning Psychotherapy - [ YouTube](https://www.youtube.com/watch?v=NAjJP_recak)
- Episode 154: Integrating Psychotherapy - [ YouTube](https://www.youtube.com/watch?v=p2XkYUZRsJ0)
- Episode 156: What Causes Mass Shootings - [ YouTube](https://www.youtube.com/watch?v=ojyFnZG-loc)
- Episode 158: Obesity and Weight Loss - [ YouTube](https://www.youtube.com/watch?v=tmCH6ti1K2c)
- Episode 160: Psychology of Catfishing - [ YouTube](https://www.youtube.com/watch?v=VPrysQ-XT3c)
- Episode 163: Ketogenic Diet for Mental Health - [ YouTube](https://www.youtube.com/watch?v=T89FWNZjKcM)
- Episode 172: Ancient Prisons - [ YouTube](https://www.youtube.com/watch?v=IeahWYAoCW8)
- Episode 176: Microdosing Psychedelics - [ YouTube](https://www.youtube.com/watch?v=e4l1TiKnX9s)
- Episode 179: Exercise Mental Health Update - [ YouTube](https://www.youtube.com/watch?v=2yU-mVntcnk)
- Episode 186: Deliberate Practice in Therapy - [ YouTube](https://www.youtube.com/watch?v=0EiwZRdnIx4)
- Episode 189: Non-Violent Communication - [ search channel](https://www.youtube.com/@psychiatrypsychotherapy6939/search?query=Psychiatry+Psychotherapy+Podcast+Episode+189%3A+Non-Violent+Communication)
- Episode 191: Body Dysmorphic Disorder - [ YouTube](https://www.youtube.com/watch?v=gOdvEPQs-d4)
- Episode 196: Resisting Conformity - [ YouTube](https://www.youtube.com/watch?v=1LlxOHciMZg)
- Episode 200: 200 Episodes Milestone - [ YouTube](https://www.youtube.com/watch?v=zmXNSMvKn_Y)
- Episode 202: CBT with Judith Beck - [ YouTube](https://www.youtube.com/watch?v=hTFPAO8bwYM)
- Episode 208: What People Want From Therapy - [ YouTube](https://www.youtube.com/watch?v=qWlY0t_quLo)
- Episode 216: Shrink Next Door Analysis - [ YouTube](https://www.youtube.com/watch?v=1KzTqSTSDoo)
- Episode 218: The Goldwater Rule - [ YouTube](https://www.youtube.com/watch?v=DCKRQ0zC7Qk)
- Episode 221: Sauna and Mental Health - [ YouTube](https://www.youtube.com/watch?v=WFqL8Yf-_go)
- Episode 233: Therapy Termination - [ YouTube](https://www.youtube.com/watch?v=uvtw_zsSDjw)
- Episode 251: Combatting the Negative Effects of Sleep Deprivation - [ YouTube](https://www.youtube.com/watch?v=WPbIGywn-MI)
- Episode 255: Disavowed Anger and Positive Emotions with Paul Wachtel - [ YouTube](https://www.youtube.com/watch?v=5TQKQslAFmA)

*Joshua Moss, MD | Psychiatrist * Built from the library podcast database; exact video links resolved against the show's YouTube channel. Educational; suggested listening.*
