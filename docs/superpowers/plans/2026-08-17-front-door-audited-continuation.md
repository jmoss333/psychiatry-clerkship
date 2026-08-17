# Front Door Audited Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Claude's approved Front Door shell redesign without losing learner progress,
resident-only browse paths, deep links, governance surfaces, safety content, or the existing
Progress/mastery workflow.

**Architecture:** Keep the nine reviewed ES5 render snippets and add two integration snippets:
`fd_due.js` for store-derived Today rows and `fd_wire.js` for state/routing/event control. Build a
normalized per-site Front Door payload after each site's navigation is final, then switch the shell
only after all state, data, route, and accessibility contracts are independently green. The shell
swap, legacy-surface retirement, and structurally coupled test migration land as one atomic task so
no checkpoint intentionally leaves the root suite red.

**Tech Stack:** Python 3 standard library + existing `jsonschema`; ES5-compatible vanilla
JavaScript; `node:test`; Playwright; two static-site builds.

**Spec:** [`docs/superpowers/specs/2026-08-15-front-door-design.md`](../specs/2026-08-15-front-door-design.md)

**Supersedes for execution order:**
[`docs/superpowers/plans/2026-08-16-front-door-swap.md`](2026-08-16-front-door-swap.md).
That document remains the detailed visual/module handoff, but its Tasks 3-8 deliberately create
red intermediate states and omit load-bearing adapters. This continuation records the audited
sequence and the additional acceptance gates.

## Global Constraints

- Front Door snippets are build-injected and ES5 only: `var`/`function`; no imports, exports,
  `const`, `let`, arrow functions, or template literals.
- Shared localStorage keys remain namespaced `cw_*` or `rp_*`. Completion stays in
  `cw_progress_v1`; no parallel done-state store is permitted.
- Existing `cw_progress_v1` entries use `{done: Boolean, at: YYYY-MM-DD}`. A Front Door renderer
  may consume a boolean projection, but writers must preserve that object shape.
- URL `page`/`tool`/`tab` values beat stored Front Door state. A bare URL restores stored state.
- `data-fd-week` means setup-only rotation selection. Path preview uses
  `data-fd-view-week`; adopting a week uses `data-fd-setweek`.
- A wizard-selected rotation writes a Monday-aligned `cw_rotation_start`; browse mode writes no
  date. Existing non-Monday dates are not mutated and the fallback exam calculation remains
  monotonic by deriving from the stored start date.
- Shared shell copy stays audience-neutral: no `MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford`
  unless the string passes through a verified per-site replacement. Say `Exam`, never `Shelf`.
- Protocol bodies render only from `topic_meta[ref].safetySteps` and `.safetyDoc`. Crisis contacts
  render only from `crisis_resources.json` through the build marker.
- A faculty-attested affordance renders only when `facultyReview.status === "reviewed"` and the
  protocol body is non-empty. Non-reviewed content gets an affirmative pending-review label.
- Preserve theme initialization and a visible `cw_theme` toggle, service worker registration, governance notices, exact faculty
  preview routing, SRS/question-bank state, session resume, ward capture, Progress/mastery,
  calibration, pretest, and anonymous study export.
- Progress/mastery is demoted to an internal reading-pane view reachable from Today; it is not
  deleted and it is not a fourth top-level tab.
- Freeze the approved palette in this work. Its 11 allowlisted light-mode contrast debts remain a
  documented owner decision; do not claim WCAG AA conformance.
- No new dependencies, no workflow YAML edits, no hard-coded `/Users` or `/sessions` paths, no PHI,
  and no dose literals in resident/trainer tools.
- Run MS3 and resident builds sequentially. Visual baselines are generated only on Ubuntu/Chromium.

## Audited rulings

1. **Site payload:** generate normalized string-ref columns per site; do not introduce mixed
   string/object `libraryColumns[].refs` values. Expected placed links after retirement are 81
   MS3 and 90 resident (81 shared + 3 resident tools + 6 resident markdown pages).
2. **Progress:** retain the existing derived mastery/calibration/pretest logic and mount it as a
   Front Door internal reader view from a Today `Progress & mastery` action.
3. **Architecture drift:** keep the reviewed global `fd*` functions. Do not refactor nine modules
   into an `FD` namespace merely because the older spec prose says so.
4. **Palette:** preserve approved values and report known contrast debt separately.
5. **Safety membership:** make the five-item kit a cross-registry build contract. A future change
   needs an explicit reviewed data update, not a silently accepted substitution.
6. **Browser failure copy:** the exact missing-protocol sentence remains an owner-controlled copy
   decision. All other safety gates can land; the final task cannot be marked complete until that
   sentence is supplied and tested.

---

### Task 1: Harden schema, safety-kit, completion, date, and event contracts

**Files:**
- Modify: `13_Faculty_Resources/_automation/validate_registry_schemas.py`
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_curriculum.py`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_state.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js`
- Modify: `tests/fd-state.test.mjs`
- Modify: `tests/fd-today.test.mjs`
- Modify: `tests/fd-path.test.mjs`
- Create: `tests/fd-progress-compat.test.mjs`

**Interfaces:**
- Produces: `fdProgressDoneMap(raw) -> {ref:Boolean}`.
- Produces: `fdProgressToggle(raw, ref, done, nowMs) -> rawObject` using the legacy object shape.
- Produces: `fdRotationStartForWeek(selectedWeek, nowMs) -> YYYY-MM-DD | ''`.
- Changes: `fdExamCountdown(week, nowMs, rotationStart)`; stored exam date still wins.
- Changes markup: Path/preview emit `data-fd-view-week`; setup alone emits `data-fd-week`.

- [ ] **Step 1: Write failing schema and safety-kit tests**

  Add negative tests proving the registry runner validates `curriculum.json` against
  `curriculum.schema.json`, rejects unknown/root-missing properties, rejects malformed synonyms
  and accents, and rejects each of these safety-kit failures independently: wrong count, duplicate
  ref, non-high safety level, missing/unknown evidence ID, missing `safetySteps`, fewer than three
  or more than five steps, missing `safetyDoc`, or non-reviewed faculty status.

- [ ] **Step 2: Verify the validator tests fail for the expected missing contracts**

  Run:

  ```bash
  python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
  python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
  ```

  Expected: the new negative controls are accepted or curriculum is absent from the schema runner.

- [ ] **Step 3: Implement schema-first and cross-registry validation**

  Add curriculum to the registry-schema mapping. Extend `validate_curriculum.py` to read
  `topic_meta.json` and `evidence_registry.json` from the repository unless fixture paths are
  supplied. Require the current five unique kit refs and, for each, a high-safety reviewed record,
  3-5 non-empty steps, a non-empty documentation line, and at least one evidence ID present in the
  canonical evidence registry. Emit every violation in one run.

- [ ] **Step 4: Write failing legacy progress and week-action tests**

  Test these exact cases:

  ```js
  const legacy = {
    'mse.md': { done: true, at: '2026-08-10' },
    'sleep.md': { done: false, at: '2026-08-10' },
  };
  assert.deepEqual(fdProgressDoneMap(legacy), {'mse.md': true, 'sleep.md': false});
  assert.deepEqual(fdProgressToggle(legacy, 'sleep.md', true, now), {
    'mse.md': { done: true, at: '2026-08-10' },
    'sleep.md': { done: true, at: localDayStr(now) },
  });
  assert.equal(fdProgressToggle(legacy, 'mse.md', false, now)['mse.md'], undefined);
  ```

  Also prove `{done:false}` is not counted, a Front Door write is readable by the retained
  `progLoad` contract, Path emits only `data-fd-view-week`, Continue preview does not emit
  `data-fd-week`, and setup still does.

- [ ] **Step 5: Run the focused tests and observe the expected failures**

  ```bash
  node --test tests/fd-progress-compat.test.mjs tests/fd-state.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs
  ```

- [ ] **Step 6: Implement the state adapters and split the attributes**

  `fdProgressDoneMap` must shape-check entries instead of using truthiness. `fdProgressToggle`
  must clone the input, write `{done:true, at:localDayStr(nowMs)}`, and delete on uncheck.
  `fdRotationStartForWeek` computes the current local Monday, then subtracts
  `(selectedWeek - 1) * 7` days; `0` returns an empty string. For legacy non-Monday starts,
  `fdExamCountdown` computes the fallback as `39 + shelfDaysUntil(rotationStart, nowMs)`; only
  when no usable start exists may it use the current week/day fallback.

- [ ] **Step 7: Verify and commit**

  ```bash
  python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
  python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
  python3 13_Faculty_Resources/_automation/validate_curriculum.py
  node --test tests/fd-progress-compat.test.mjs tests/fd-state.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs
  node --test tests/*.test.mjs
  ```

  Commit message: `fix(frontdoor): lock state and safety data contracts`.

---

### Task 2: Generate and inject normalized site-specific Front Door payloads

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py`
- Create: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`
- Modify: `curriculum.json`
- Modify: `curriculum.schema.json`
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_curriculum.py`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `tests/parallel-ceilings.test.mjs`
- Create: `tests/fd-inject.test.mjs`

**Interfaces:**
- Produces Python `build_frontdoor_payload(site, curriculum, catalog) -> dict` with keys
  `curriculum`, `roles`, and `manifest`.
- Adds `curriculum.json.siteLibrary.{ms3,resident}` entries as site-specific column additions and
  exclusions; the emitted `curriculum.libraryColumns[].refs` remain arrays of strings.
- Injects `FD_CURRICULUM`, `FD_TOPIC_META`, `FD_TOOL_REGISTRY`, `FD_SITE_MANIFEST`, `FD_ROLES`.

- [ ] **Step 1: Write failing projection tests**

  Fixtures must prove MS3 emits 81 placed refs, resident emits 90, resident titles exist for all
  nine extra refs, every emitted ref resolves in the emitted manifest, roles differ by site, and a
  duplicate/unplaced ref fails. Assert the input curriculum object is not mutated.

- [ ] **Step 2: Run the tests and observe the missing module failure**

  ```bash
  python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
  ```

- [ ] **Step 3: Add site-specific placement data and the normalized projection**

  Put the six resident markdown pages and three `rp-*` tools into named existing columns through
  `siteLibrary.resident.additions`. Keep case-of-the-week pages outside the hard guard. Build the
  catalog from each site's final nav metadata so title/kind are not duplicated in JavaScript.

- [ ] **Step 4: Write failing marker/order/data-needle tests**

  Pin this order exactly once in the source shell:

  ```text
  PHASE_POLICY -> FD_STATE -> FD_DATA -> FD_TODAY -> FD_SHELL -> FD_PATH ->
  FD_LIBRARY -> FD_READER -> FD_SEARCH -> FD_SHEET
  ```

  Add `test_common.py` coverage for every Front Door marker and bump the marker ceiling from 7 to
  15 in the same diff.

- [ ] **Step 5: Register markers, copy `frontdoor.css`, and inject verified payload needles**

  A missing or duplicate needle aborts the build. `build_deploy.py` injects the MS3 payload after
  MS3 nav is final. `resident_section.py` replaces all five globals with the resident payload after
  resident nav and extra pages are final; copying the already-injected MS3 value is forbidden.

- [ ] **Step 6: Verify source, builds, and per-site artifact evidence**

  ```bash
  python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
  python3 13_Faculty_Resources/_automation/site_build/test_common.py
  node --test tests/fd-inject.test.mjs tests/parallel-ceilings.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

  Inspect built `FD_ROLES` and placed-ref counts; they must differ as specified. In an LFS-pointer
  sandbox, record the media preflight as an environment limitation only after every preceding
  validator/static gate passes.

- [ ] **Step 7: Commit**

  Commit message: `feat(frontdoor): inject site-specific catalogs and modules`.

---

### Task 3: Complete reader typography and pre-wire accessibility semantics

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_search.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Modify: `tests/fd-tokens.test.mjs`
- Modify: `tests/fd-reader.test.mjs`
- Modify: `tests/fd-shell.test.mjs`
- Modify: `tests/fd-search.test.mjs`
- Modify: `tests/fd-sheet.test.mjs`

**Interfaces:**
- Produces `.fd-article__body` typography at `16.5px`, `1.72`, `62ch`.
- Adds labelled search/sheet dialogs and accessible labels for close, dismiss, and mobile-back
  controls.
- Adds a labelled header theme toggle without changing the approved tab hierarchy.
- Adds a visually hidden completed suffix to reader rail rows; does not use `aria-pressed` on
  navigation controls.

- [ ] **Step 1: Add failing CSS and accessibility tests**

  Require styled `h2`, `h3`, `ul`, `ol`, `li`, `a`, `code`, and `blockquote` descendants; zero raw
  hex values in `frontdoor.css`; labelled dialog markup for both overlays; `aria-label` on every
  icon-only control; a labelled `data-fd-theme` header control; and a hidden `Completed` suffix
  only for done rail rows.

- [ ] **Step 2: Run the focused tests and observe failures**

  ```bash
  node --test tests/fd-tokens.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-search.test.mjs tests/fd-sheet.test.mjs
  ```

- [ ] **Step 3: Implement the smallest matching markup/CSS and update the class inventory**

  Mount-ready overlays must carry their own `:focus-visible` rule because the runtime may portal
  them outside `.fd-shell`. Keep responsive visibility in CSS, never conditional JS.

- [ ] **Step 4: Verify and commit**

  ```bash
  node --test tests/fd-tokens.test.mjs tests/fd-contrast.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-search.test.mjs tests/fd-sheet.test.mjs
  node --test tests/*.test.mjs
  ```

  Commit message: `fix(frontdoor): finish reader type and overlay semantics`.

---

### Task 4: Build the route/resource/event controller while the old shell remains live

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `tests/parallel-ceilings.test.mjs`
- Create: `tests/fd-wire.test.mjs`
- Create: `tests/fd-resource.test.mjs`
- Create: `tests/fd-action-contract.test.mjs`

**Interfaces:**
- Produces `fdResolveState(url, stored) -> state`.
- Produces `fdDispatch(attrs, context, state) -> {patch, route, effect}`.
- Produces `fdResourceRequest(ref, search) -> {kind, url, frameSuffix}`.
- Runtime shell adapter produces `fdOpenResource(ref, opts) -> Promise` and preserves existing
  governed markdown/tool/faculty-preview behavior.

- [ ] **Step 1: Derive the complete action vocabulary and write failing tests**

  Scan every `frontdoor/*.js` source for `data-fd-*` and assert the controller handles each emitted
  name. The contract must include open, sheet preview, safety protocol, toggle, tab, setup week,
  view week, set week, role, protocol step, back, home, search, change week, progress,
  theme, close-search, close-sheet, close-nudge, and try-now.

- [ ] **Step 2: Add state/dispatch tests**

  Cover URL-over-store precedence; navigate versus preview sheet versus protocol; sheet-kit
  context; week preview that leaves rotation unchanged; Monday-aligned set-week writes; all close
  actions; keyboard `Escape`, arrows, digits, command-K, slash, and Enter; and suppression while an
  input/textarea/select/contenteditable owns focus. Add a pre-existing-rotation case with no stored
  Front Door role: it skips setup and selects the first role from that site's injected list. Prove
  `autoAdvance` defaults true, advances to the next unread item after a done toggle, and returns to
  the originating tab at week end. Prove the unread-protocol nudge auto-dismisses after 8 seconds.

- [ ] **Step 3: Add resource-adapter tests**

  Markdown requests fetch `content/<slug>`, pass through `marked.parse`, and render the Reader.
  Tools render the existing governed iframe and preserve `case`, `scenario`, `resume`, and faculty
  preview query parameters. A failed resource load renders a scoped fallback without blanking the
  header. Browser back/forward restores the URL-named resource.

- [ ] **Step 4: Run tests and observe the missing controller failures**

  ```bash
  node --test tests/fd-wire.test.mjs tests/fd-resource.test.mjs tests/fd-action-contract.test.mjs
  ```

- [ ] **Step 5: Implement `fd_wire.js` and register it last**

  Use one delegated click listener, one input listener for live search, one keydown listener, and
  one popstate listener. Overlays either remain under the delegated root or receive an explicit
  overlay-root listener. Search Enter opens the first result as a preview sheet. Dialog open/close
  captures focus, traps Tab, restores the still-connected invoker, and resets session-only protocol
  checks per open. Theme toggling writes `cw_theme` and updates `data-theme` without reloading.

- [ ] **Step 6: Add the inactive runtime resource adapter to the existing shell**

  Keep the old render boot active in this task. Reuse, rather than duplicate, governance,
  faculty-preview, query-suffix, marked, iframe, and route helpers. This keeps the full root suite
  green before the visual cutover.

- [ ] **Step 7: Verify and commit**

  ```bash
  node --test tests/fd-wire.test.mjs tests/fd-resource.test.mjs tests/fd-action-contract.test.mjs tests/parallel-ceilings.test.mjs
  node --test tests/*.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

  Commit message: `feat(frontdoor): add routed controller and resource adapter`.

---

### Task 5: Atomically switch the shell and preserve due, resume, capture, and Progress

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_due.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `13_Faculty_Resources/_automation/validate_tool_governance.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_tool_governance.py`
- Modify: `13_Faculty_Resources/_automation/surface_governance.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_curriculum.py`
- Modify: `_prototypes/sp-interview/tests/ci-build-contract.test.mjs`
- Modify: `tests/smoke/playwright.config.js`
- Delete: `01_Six_Week_Curriculum/learning-path.html`
- Delete: `tests/smoke/mode-companion.spec.js`
- Create: `tests/fd-due.test.mjs`
- Create: `tests/fd-shell-boot.test.mjs`
- Modify: all structurally coupled root tests listed below.

**Interfaces:**
- Produces `fdDueRow(breakdown)`, `fdResumeCard(capsule)`, and `fdCaptureTriage(items)`.
- Produces live `fdRender(state)` with independent surface guards.
- Produces internal `progress` view using the retained mastery/calibration/pretest/export logic.

- [ ] **Step 1: Write failing pure tests for due, resume, capture, and progress access**

  Require zero-due omission, singular/plural labels, escaped values, empty-capture omission, the
  existing PHI warning byte-for-byte, a session-resume action only for a valid capsule, and a Today
  `Progress & mastery` action that opens an internal reader view without adding a fourth tab.

- [ ] **Step 2: Write the shell survival test before replacing the body**

  Pin governance notice functions, faculty-preview functions, theme initialization, service worker
  marker, page/tool routing, marked rendering, SRS stores, capture store, calibration/mastery,
  pretest, export, route live-region, and independently guarded Today/Path/Library/Reader renders.
  Assert the old sidebar/mode companion/dashboard functions are absent.

- [ ] **Step 3: Run focused tests and observe expected failures**

  ```bash
  node --test tests/fd-due.test.mjs tests/fd-shell-boot.test.mjs
  ```

- [ ] **Step 4: Implement the pure rows and switch the body/boot**

  The body contains one `.fd-shell`, sticky header/tabs, one `<main id="content">`, route status,
  governance mount, and overlay mounts. Compose due/resume/capture around `fdToday`; open resources
  through Task 4's adapter. Each top-level surface gets its own `try/catch` fallback. The mobile
  action bar stays a sibling of the animated reader.

- [ ] **Step 5: Preserve Progress/mastery as an internal reader view**

  Reuse the existing derived functions and event handlers. Keep calibration thresholds, weak-topic
  semantics, placement test, personalized plan, and anonymous export behavior unchanged. The entry
  lives on Today and the back action returns to its originating tab.

- [ ] **Step 6: Retire Learning Path and move every count/consumer pin in this same change**

  Remove its manifest/nav/copy/rebrand/governance entries; set tool counts to MS3 22/resident 24;
  update CI inventory assertions; remove Playwright `testMatch` references; and migrate
  `srs-home-counters` before any full root run.

- [ ] **Step 7: Triage and migrate the structurally coupled tests**

  Retain `fd-contrast` unchanged. Repoint or update:
  `calib-panel`, `calib-wiring`, `mastery-weakflag`, `phase-chip`, `phase-wiring`,
  `qbank-due-first`, `resume-card`, `shell-copy`, `spa-shell-a11y`, `srs-home-counters`,
  `surface-governance-ui`, and `ward-capture-store`. Delete a test only when its user surface is
  explicitly retired and name the replacement contract in the commit message.

- [ ] **Step 8: Verify both sites and commit**

  ```bash
  python3 13_Faculty_Resources/_automation/validate_tool_governance.py
  python3 13_Faculty_Resources/_automation/validate_curriculum.py
  node --test _prototypes/sp-interview/tests
  node --test tests/*.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

  Commit message: `feat(shell): atomically switch to the governed front door`.

---

### Task 6: Finish shell crisis injection, safety states, and accessibility contracts

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_sheet.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Modify: `tests/crisis-block.test.mjs`
- Modify: `tests/fd-sheet.test.mjs`
- Modify: `tests/spa-shell-a11y.test.mjs`

**Interfaces:**
- Adds a shell-specific build injection/check after `index.html` is copied; it does not misuse the
  markdown/tool-only crisis loops.
- Adds reviewed, not-yet-reviewed, and missing-data protocol states.

- [ ] **Step 1: Write failing source-and-built crisis tests**

  Require exactly one `<!-- crisis-block-html -->` marker in the source shell and prove both built
  indices contain rendered crisis resources with no unexpanded marker and no hand-maintained
  number.

- [ ] **Step 2: Add a shell-specific crisis injection pass**

  Run it after the index copy and before the page contract/static gate. A missing or duplicate
  marker aborts the build for both sites.

- [ ] **Step 3: Write safety-state and dialog-behavior tests**

  Attested copy renders only for reviewed non-empty data. Pending-review copy renders only for
  non-reviewed non-empty data. Missing data renders the exact owner-approved failure sentence,
  never an empty normal protocol. Test sheet/search `role="dialog"`, `aria-modal`, labels, focus
  capture/trap/restore, Escape order, and 44px mobile primary targets.

- [ ] **Step 4: Implement and verify**

  Do not invent the missing-data sentence. This step remains open until the repo owner supplies it.

  ```bash
  node --test tests/crisis-block.test.mjs tests/fd-sheet.test.mjs tests/spa-shell-a11y.test.mjs
  node --test tests/*.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

- [ ] **Step 5: Commit**

  Commit message: `fix(frontdoor): fail closed on shell safety surfaces`.

---

### Task 7: Rewrite smoke journeys, run rendered QA, and complete the branch gate

**Files:**
- Modify: `tests/smoke/nav-crawl.spec.js`
- Modify: `tests/smoke/aria-live.spec.js`
- Modify: `tests/smoke/governance-warnings.spec.js`
- Modify: `tests/smoke/faculty-console.spec.js`
- Modify: `tests/smoke/ward-capture.spec.js`
- Create: `tests/smoke/front-door.spec.js`

**Interfaces:**
- Browser journeys consume the final built MS3 and resident indices on ports 4200/4201/4202.

- [ ] **Step 1: Rewrite chrome-coupled smoke tests**

  Library crawl proves all 81 MS3 and 90 resident placed refs are reachable. Governance/faculty
  tests preserve governed iframes and exact preview locks. Ward capture verifies the unchanged PHI
  warning and triage path.

- [ ] **Step 2: Add Front Door journeys**

  Cover first run to Today, browse mode to Library, tab switching, Path preview without changing
  rotation, set-week Monday alignment, legacy completion migration, reader previous/next,
  command-K and `/` search, Enter opening a preview sheet, Safety Kit dialog, Progress/mastery,
  browser back/forward, dark mode, reduced motion, and mobile fixed action bar during scroll.

- [ ] **Step 3: Run the full source/build gate**

  ```bash
  python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
  python3 13_Faculty_Resources/_automation/validate_topic_meta.py
  python3 13_Faculty_Resources/_automation/validate_curriculum.py
  python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
  python3 13_Faculty_Resources/_automation/validate_tool_governance.py
  python3 13_Faculty_Resources/_automation/site_build/test_common.py
  node --test tests/*.test.mjs
  node --test _prototypes/sp-interview/tests
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

- [ ] **Step 4: Run rendered desktop/mobile QA**

  Use the Browser plugin first. The target flow is: fresh index -> setup -> Today -> Path ->
  reader -> search preview -> Safety Kit -> Progress -> back to Today. Verify page identity,
  meaningful DOM, no error overlay, console health, one interaction per surface, desktop and
  390x844 mobile screenshots, focus order, clipping/overlap, and fixed action-bar behavior.

- [ ] **Step 5: Run Playwright smoke**

  Start the repository's three server launcher targets, then:

  ```bash
  cd tests/smoke
  npm ci
  npx playwright test
  ```

- [ ] **Step 6: Request final independent whole-branch review and fix any load-bearing findings**

  Review the complete diff against the approved spec, this plan, both build artifacts, and the
  known contrast/LFS environment limitations.

- [ ] **Step 7: Commit smoke changes and prepare the visual-baseline handoff**

  Commit message: `test(frontdoor): verify the complete learner journey`.

  Visual baseline refresh occurs only after a branch is published and requires the repository's
  Ubuntu/Chromium workflow. Do not create macOS baselines.
