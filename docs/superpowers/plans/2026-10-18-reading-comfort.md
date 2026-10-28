# Reading Comfort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete original brainstorm idea 6 for students and residents: local reader text-size and line-spacing controls that preserve reading position.

**Architecture:** Extend the existing Front Door state and Settings controls. Apply preferences to the mounted reading without replacing it, using the reading-place session to keep its section and offset through reflow. Tools retain their existing layout.

**Tech Stack:** Existing ES5 snippets, CSS tokens, node:test, Chromium smoke tests; no dependencies.

**Spec:** Original six-idea learner UX scope approved in this thread; concrete scope below is an implementation choice under the user's continued-work authorization.

## Global Constraints

- Three text sizes: Standard (existing size), Larger (1.15x), Largest (1.3x).
- Two line spacings: Standard (existing per-reader spacing), Spacious (2).
- Reset returns both values to Standard. Controls live in Settings under Reading comfort.
- Save only bounded preference enums in existing `cw_frontdoor_v1`; preserve progress and reading places. A failed save retains prior preferences and reports the failure honestly.
- Affect reading bodies and their section headings, including enhanced guides; exclude embedded tools, navigation and protocol sheets.
- Preserve mounted resource, section/offset, focus, route and history. Respect reduced motion and browser zoom; retain default appearance.
- Keep clinical text and governance unchanged. No patient information or analytics additions.
- Preserve other branches and worktrees; PR1096 remains independent. No recurring monitoring or model escalation. Stop at weekly usage exhaustion, unavailable usage evidence, verified completion, or external-only waiting after one snapshot.

## Review Focus

- Junk or missing saved preference values fall back safely; no arbitrary CSS or text reaches storage.
- A blocked write keeps the selected segments and rendered reading consistent with the prior preference.
- Reflow during a pending scroll preserves the latest section; synthetic scrolling does not create false reading progress.
- An open modal keeps focus while the reading beneath it changes; a reflow frame cannot act on a destroyed session.
- Guide typography, phone widths and 200% zoom remain readable without changing tool layout.

---

### Task 1: Local reading preferences and position-preserving controls

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js` — bounded normalization and persistence.
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js` — accessible controls and status.
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js` and `frontdoor.css` — reading-only preference markers and typography.
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js` — validated actions, transactional save, paint and reflow.
- Modify: `tests/fd-state.test.mjs`, `fd-sheet.test.mjs`, `fd-reader.test.mjs`, `fd-wire.test.mjs`, `fd-action-contract.test.mjs` — behavior and attribute contracts.
- Modify: `tests/smoke/front-door.spec.js` and `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` — browser validation and layout contract.

**Interfaces:**
- Consumes: existing `fdSave`, `fdResolveState`, `fdDispatch`, `fdInstallReadingPlace`, Settings and Reader renderers.
- Produces: `fdReadingComfort(value) -> {size, spacing}` and reading-session `reflow(change)`; validated `data-fd-reading-size`, `data-fd-reading-spacing`, `data-fd-reading-reset` actions.

- [ ] Write behavioral tests for normalization/persistence, segment selection, validated dispatch, save failure, no resource remount, and section-preserving reflow.
- [ ] Run focused tests and confirm they fail because the controls and reflow API are absent.
- [ ] Implement the interfaces, Settings controls, scoped typography and reading-place reflow.
- [ ] Run focused tests; expect all pass and existing contracts remain green.
- [ ] Add browser coverage for both audiences: size/spacing/reset/reload, keyboard focus, 320/390/1280px widths, 200% zoom, reduced motion, guide and tool boundaries, and saved-section preservation.
- [ ] Build both sites, run browser coverage with retries=0, and preserve failures and screenshots outside source.
- [ ] Run the full local gate through normal push, commit the implementation, and create a draft PR. Take one bounded hosted CI snapshot.

Validation command: `node --test tests/fd-state.test.mjs tests/fd-sheet.test.mjs tests/fd-reader.test.mjs tests/fd-wire.test.mjs tests/fd-tokens.test.mjs tests/fd-action-contract.test.mjs`.
Expected: zero failures. Whole-branch review follows the task; no automatic merge or production deployment is implied by this implementation plan.
