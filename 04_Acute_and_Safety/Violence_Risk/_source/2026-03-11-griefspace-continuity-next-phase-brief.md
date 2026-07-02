# GriefSpace Continuity Integration Brief

**Date:** March 11, 2026
**Status:** Recommendation
**Author:** Claude
**Audience:** Josh, Codex owner

---

## Situation

Wave 3 (Recovery Companion repair and conflict layer) is shipping. Discharge Roadmap continuity linking is the approved next implementation. GriefSpace was explicitly parked during Weeks 10–11 planning because three architectural questions were unresolved:

1. Is GriefSpace a new tool or sidebar feature inside existing tools?
2. Does it integrate at the Recovery Companion level or at the PWA level?
3. Does it extract shared-libs (like `rc-signals` for grief milestones)?

This brief answers those questions based on what actually exists in the codebase today.

---

## Current GriefSpace State

GriefSpace is a **feature-complete standalone tool** with zero continuity infrastructure:

| Attribute | Value |
|-----------|-------|
| Source | `tools-suite/tools/generated/griefspace-app.app.jsx` (6,234 lines) |
| Bundle | 339 KB of 400 KB budget |
| Loss pathways | 3 (Death Loss, Loved One Changed, Personal Self-Grief) |
| Developmental modes | 3 (Child 8–12, Teen 13–17, Adult 18+) |
| Modules | 18+ (check-ins, letters, milestones, canvas, radar, guilt repairs, etc.) |
| Persistence | 21 localStorage buckets (`rc-grief-*`) |
| Design system | Compliant (rc-tokens.css, rc-a11y.css) |
| QA harness | Exists (9 design system v2 checks) |
| rc-context.js | **Not imported** |
| rc-signals.js | **Not imported** |
| Tool registry entry | **None** |
| relational_state_v1 | **Not used** |
| Cross-tool references | **None outbound** (Analytics Dashboard tracks it inbound) |

GriefSpace is architecturally a side-channel tool that shares the design system but nothing else. Unlike Discharge Roadmap (which already imported `rc-context.js`), GriefSpace requires foundational wiring before any continuity integration is possible.

---

## Options Compared

### Option A: Standalone Continuity Integration

Wire GriefSpace into the continuity infrastructure as a side-channel tool (same pattern as Drift Detector and Spin the Skill).

**What this means:**
- Import `rc-context.js` and `rc-signals.js` into `griefspace-app.html`
- Add GriefSpace to the tool registry in `rc-context-integration.js` as a side channel
- Emit grief-specific signal events (milestone reached, check-in completed, letter written)
- Read family context (patient hash, safety status) for session continuity
- Add context banner and continue button for cross-tool navigation

**Effort:** Medium. The side-channel pattern is well-established (Drift Detector, Spin the Skill both followed it). No new shared-libs extraction needed. GriefSpace's 21 localStorage buckets remain local; only signal events cross the bus.

**Benefit:** Grief activity appears in Analytics Dashboard metrics, Recovery Companion can surface grief-related context in relational tools, and families navigating between tools maintain session continuity. GriefSpace stays self-contained — it gains connectivity without losing independence.

**Risk:** Bundle budget is tight (339 KB / 400 KB). Adding rc-context.js + rc-signals.js + rc-context-integration.js adds ~15–20 KB. Feasible but requires confirming the bundle stays under budget after integration.

### Option B: Sidebar or Module Inside Recovery Companion

Embed GriefSpace content as a section or module within Recovery Companion rather than maintaining it as a standalone tool.

**What this means:**
- Extract GriefSpace's core modules into Recovery Companion's JSX
- Merge grief state into `relational_state_v1`
- Grief tools appear alongside repair, reflection, and safety tools in the relational hub

**Effort:** Very high. GriefSpace is 6,234 lines of JSX with its own routing, 21 localStorage buckets, 3 pathway branches, and 3 developmental modes. Merging this into Recovery Companion (already a large app) would roughly double the relational hub's complexity. The 21 `rc-grief-*` localStorage keys would need migration into `relational_state_v1`, which is a breaking-change risk for both tools.

**Benefit:** Single entry point for families. Grief and repair tools coexist in one hub.

**Risk:** Unacceptable. Recovery Companion is already the largest tool in the suite. Adding 6,000+ lines of grief tooling creates a maintenance and bundle problem. GriefSpace's developmental modes (child/teen/adult) and loss pathways (death/change/self) are orthogonal to Recovery Companion's relational/repair model. Forced cohabitation would blur both tools' clinical purpose.

### Option C: Defer Again

Park GriefSpace integration until a future planning cycle.

**What this means:**
- No code changes
- GriefSpace continues operating as a fully isolated standalone tool
- Families access it separately from the continuity pathway

**Effort:** None.

**Benefit:** No risk of regression, no bundle pressure, no shared-libs changes.

**Risk:** GriefSpace remains invisible to the continuity pathway. Analytics Dashboard cannot track grief engagement alongside other family metrics. Families grieving during recovery (common in psychiatric settings) get no continuity signal between grief work and relational/repair work. The longer GriefSpace stays isolated, the harder the eventual integration because its localStorage conventions diverge further from the continuity model.

---

## Recommendation: Option A — Standalone Continuity Integration

**Wire GriefSpace into the continuity infrastructure as a side-channel tool.**

### Why This Is the Right Next Step

**The three blocking architectural questions are now answerable:**

1. *Is GriefSpace a new tool or sidebar feature?* **Standalone tool.** It is already a complete, large, clinically distinct tool. Embedding it inside another tool (Option B) creates more problems than it solves.

2. *Does it integrate at the Recovery Companion level or at the PWA level?* **At the suite level via rc-context + rc-signals.** GriefSpace does not need to be inside Recovery Companion. It needs to be on the same bus so its activity is visible to the pathway. This is the same integration level used by Drift Detector and Spin the Skill.

3. *Does it extract shared-libs?* **No extraction needed.** GriefSpace imports the existing shared-libs (rc-context.js, rc-signals.js, rc-context-integration.js). It does not create new shared infrastructure. Its 21 localStorage buckets stay local — only signal events cross the bus.

**Infrastructure readiness:** The side-channel integration pattern is proven and documented. Drift Detector and Spin the Skill both import `rc-context.js` and `rc-signals.js` and emit events that Analytics Dashboard consumes. GriefSpace would follow the identical pattern.

**Clinical value:** Grief is deeply intertwined with relational repair and family stabilization. Families using Recovery Companion's Wave 3 conflict tools while also processing grief (of a relationship, of a loved one's illness, of their former self) benefit from a system that can see both activities. Signal-level awareness — not data merging — is the appropriate clinical boundary.

---

## Scope and Constraints

### Files and Surfaces

| File | Change |
|------|--------|
| `tools-suite/tools/griefspace-app.html` | Add rc-context.js, rc-signals.js, rc-context-integration.js imports |
| `tools-suite/tools/generated/griefspace-app.app.jsx` | Add context init, signal emission at key milestones, context banner |
| `tools-suite/shared-libs/rc-context-integration.js` | Add GriefSpace to tool registry as side channel |
| `tools-suite/qa/qa_harness_griefspace_app.js` | Add signal emission and context integration assertions |
| `scripts/precompile_griefspace_app.sh` | No changes expected (rebuild after JSX edits) |

### Shared-Libs Changes

**Minimal.** One addition to `rc-context-integration.js` (tool registry entry). No changes to `rc-context.js`, `rc-signals.js`, or `rc-relational-state.js`. No new shared-libs files.

### Signal Events to Design

GriefSpace should emit a small set of signal events for Analytics Dashboard and cross-tool awareness:

- `grief_checkin_completed` — daily/weekly grief check-in finished
- `grief_milestone_reached` — milestone reflection saved
- `grief_letter_written` — letter to/from loved one completed
- `grief_pathway_started` — user entered a loss pathway for the first time

These events follow existing conventions in `rc-signals.js` (string key + timestamp + metadata). No new signal infrastructure needed.

### What Does NOT Change

- GriefSpace's 21 `rc-grief-*` localStorage buckets remain local
- GriefSpace's internal routing, pathways, and developmental modes stay self-contained
- No grief data is shared cross-tool — only signal events
- No new persistence namespace
- No relational_state_v1 integration
- No Recovery Companion changes

### Likely Implementation Pattern

1. **Phase A: Bus wiring (30% effort)**
   - Import shared-libs into griefspace-app.html
   - Initialize RCContext on load
   - Add tool registry entry as side channel
   - Add context banner and continue button

2. **Phase B: Signal emission (50% effort)**
   - Identify 4–6 key milestone points in GriefSpace's module flow
   - Emit signal events at those points
   - Verify Analytics Dashboard picks up grief signals
   - Verify 250-event cap behavior with grief signals added

3. **Phase C: QA expansion (20% effort)**
   - Extend QA harness for context integration checks
   - Assert signal events emit correctly
   - Assert bundle stays under 400 KB budget
   - Assert no localStorage key collisions

### Owner Recommendation

**Codex** — product implementation. GriefSpace is Codex-owned JSX. The shared-libs change (one tool registry entry) is small enough to include in the same PR.

**Claude Code** — QA harness expansion and signal contract verification only.

---

## Risks

1. **Bundle budget pressure:** GriefSpace is at 339 KB / 400 KB. Adding three shared-lib imports (~15–20 KB) pushes to ~355–360 KB. Feasible but tight. If future GriefSpace features grow the bundle, the budget may need revisiting. Mitigate by confirming final bundle size before merge.

2. **Signal event naming:** No grief-specific signal events exist yet. The 4 events proposed above need design review to confirm they match Analytics Dashboard's consumption patterns and `rc-signals.js` conventions. Low risk — the pattern is well-established.

3. **No clinical re-review needed for bus wiring.** Unlike Discharge Roadmap's Phase B/C (which creates new clinical framing from signal data), GriefSpace's integration is infrastructure-only: it emits events and gains a context banner. No new clinical content, no cross-tool data exposure, no signal-driven personalization of other tools. If a future phase adds signal-driven content (e.g., Recovery Companion showing grief-aware prompts), that phase would require clinical review.

4. **localStorage key collision:** GriefSpace uses `rc-grief-*` prefix, continuity tools use `rc_context_*` and `rc_signal_events_v1`. No collision expected, but QA harness should assert prefix isolation.

---

## Implementation Readiness

**Ready to implement. No formal spec required.**

The integration follows a proven pattern (side-channel tool wiring) with no new architectural decisions. The three blocking questions from the March 11 deferral are resolved by codebase evidence. Signal event names need brief design review but not a full spec cycle.

**Prerequisite:** Discharge Roadmap continuity linking should ship first (as already approved). GriefSpace integration can begin immediately after, or in parallel if schedules allow.

---

## Timeline Estimate

Week 12 design + implementation, or immediate slot after Discharge Roadmap linking ships. Estimated 1-week sprint for a clean side-channel integration.
