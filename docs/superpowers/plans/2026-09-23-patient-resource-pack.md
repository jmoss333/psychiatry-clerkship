# Patient Resource Pack Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transient, printable patient-care resource pack with up to three canonical ReConnect resources, offline QR codes, and the centrally governed crisis block included automatically.

**Architecture:** A new pure ES5 module validates selections and renders both the builder and handout. The existing Front Door controller owns transient selection and the explicit print effect, while the shell passes its already build-injected crisis HTML into the renderer. CSS isolates the paper preview on print; no patient data or pack state leaves memory.

**Tech Stack:** ES5 browser JavaScript, static Python build-time snippet injection, token-driven CSS, Node `node:test`, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-09-23-patient-resource-pack-design.md`

## Global Constraints

- Crisis contacts remain sourced only from `crisis_resources.json` through the existing shell template.
- No free text, patient information, persistence, URL state, cookies, analytics, or network request is added.
- A pack contains zero to three unique validated canonical `careResources` records.
- QR payloads are exact canonical HTTPS URLs and are generated locally with the already vendored QR library.
- Front Door JavaScript remains ES5 and audience-neutral.
- The complete five-resource shelf remains visible and unchanged.
- Shared MS3 and Resident builds must both pass; build them sequentially.
- Native screen-reader speech and physical-printer QR scanning remain manual verification boundaries.

## Review Focus

- A forged or inherited resource ID must never select or print an attacker-controlled URL; Task 1 tests malformed and prototype-key identifiers.
- A fourth selection must not silently replace an earlier resource; Task 2 tests that the three-item pack remains unchanged.
- Leaving Care, reloading, or history navigation must not preserve the pack; Task 2 unit and Task 4 browser tests cover every reset path.
- Missing QR support must retain canonical links; missing crisis HTML must disable Print without inventing crisis text; Tasks 1 and 4 test both paths.
- Print media must hide every control while retaining all selected URLs and the complete governed crisis block; Tasks 3 and 4 verify computed print display and source equality.

---

### Task 1: Pure pack model, QR renderer, and markup

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_pack.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_care.js`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Create: `tests/fd-care-pack.test.mjs`
- Modify: `tests/fd-care.test.mjs`

**Interfaces:**
- Consumes: `index.careResources`, global `fdEsc`, optional global `qrcode`, and trusted build output `crisisHtml`.
- Produces: `fdCarePackResources(index)`, `fdCarePackIds(index, ids)`, `fdCarePackToggle(index, ids, id)`, `fdCarePackQrSvg(url, label)`, and `fdCarePack(index, ids, crisisHtml)`.

- [ ] **Step 1: Write the failing pure-module tests**

  Add literal expectations proving that resource validation drops malformed IDs/URLs, selection de-duplicates and caps at three, a fourth toggle leaves the three-item selection unchanged, toggling an included ID removes it, and QR generation receives the exact canonical URL. Render assertions must verify the five selectors, selected count, disabled fourth choices, exact full URLs, automatic trusted crisis HTML, no patient fields, and no browser/storage/network globals in the module.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run: `node --test tests/fd-care-pack.test.mjs tests/fd-care.test.mjs`

  Expected: failure because `fd_care_pack.js`, its exported functions, and its snippet marker do not exist.

- [ ] **Step 3: Implement the minimal pure module and register it**

  Implement strict record validation using own-property-free lookup maps, an ID pattern of `^[a-z0-9]+(?:-[a-z0-9]+)*$`, exact HTTPS URLs, stable curriculum order, and a hard three-item ceiling. Render native pressed buttons, a visible `N of 3 selected` count, full link text, local SVG QR output, and `String(crisisHtml || '')` only at the trusted crisis slot. Disable Print at zero selections or when crisis HTML is absent. Inject the already pinned `/*__QR_GENERATOR_1_4_4__*/` vendor marker into the shell before the pack module, then register `/*__FD_CARE_PACK__*/` before `/*__FD_CARE__*/` and `/*__FD_WIRE__*/`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Run: `node --test tests/fd-care-pack.test.mjs tests/fd-care.test.mjs`

  Expected: all focused tests pass with no warnings.

- [ ] **Step 5: Commit Task 1**

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_pack.js \
    13_Faculty_Resources/_automation/site_build/common.py \
    13_Faculty_Resources/_automation/site_build/frontdoor/fd_care.js \
    13_Faculty_Resources/_automation/site_build/spa_index.html \
    tests/fd-care-pack.test.mjs tests/fd-care.test.mjs \
    docs/superpowers/specs/2026-09-23-patient-resource-pack-design.md \
    docs/superpowers/plans/2026-09-23-patient-resource-pack.md
  git commit -m "feat(care): add resource pack renderer"
  ```

### Task 2: Transient controller state and explicit print effect

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `tests/fd-action-contract.test.mjs`
- Create: `tests/fd-care-pack-wire.test.mjs`

**Interfaces:**
- Consumes: Task 1's validation/toggle/render functions and the shell's existing `fdCrisisHtml`.
- Produces: controller actions `data-fd-care-pack`, `data-fd-care-pack-clear`, `data-fd-care-pack-print`; transient `carePackIds`; effect `{type:'print-care-pack'}`.

- [ ] **Step 1: Write failing dispatch and reset tests**

  Assert literal patches for add/remove/clear, unchanged selection at the three-item limit, an effect-only print action, distinct action semantics, no saved/history representation, reset on leaving Care/opening content/popstate, and focus restoration to the rebuilt equivalent button.

- [ ] **Step 2: Run the controller tests and verify RED**

  Run: `node --test tests/fd-care-pack-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-wire.test.mjs`

  Expected: failures naming the unregistered pack actions and missing `carePackIds` transitions.

- [ ] **Step 3: Implement controller integration**

  Add the three action attributes and unique semantics, normalize toggles through `fdCarePackToggle`, mark `carePackIds` as visit-only transient state, reset it anywhere `careIntentId` resets, render it through `fdCare(FD_INDEX, careIntentId, carePackIds, fdCrisisHtml)`, and call `window.print()` only for the explicit print effect. Do not add a storage key or route field.

- [ ] **Step 4: Run the controller tests and verify GREEN**

  Run: `node --test tests/fd-care-pack-wire.test.mjs tests/fd-action-contract.test.mjs tests/fd-wire.test.mjs`

  Expected: all controller tests pass with no warnings.

- [ ] **Step 5: Commit Task 2**

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js \
    13_Faculty_Resources/_automation/site_build/spa_index.html \
    tests/fd-action-contract.test.mjs tests/fd-care-pack-wire.test.mjs
  git commit -m "feat(care): wire transient resource packs"
  ```

### Task 3: Workbench, responsive behavior, and print sheet

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Modify: `tests/fd-care-pack.test.mjs`

**Interfaces:**
- Consumes: Task 1 markup classes under `.fd-care-pack` and existing Clinical Warm tokens.
- Produces: a 7/5 desktop workbench, single-column small-screen flow, and print isolation of `.fd-care-pack__sheet`.

- [ ] **Step 1: Add failing CSS-contract tests**

  Assert a touch-sized resource button, non-color selected state, explicit two-column and `max-width:640px` one-column layouts, focus-visible coverage, disabled styling, QR size constraints, and `@media print` rules that hide shell controls while showing the sheet and expanded crisis content.

- [ ] **Step 2: Run the CSS-contract tests and verify RED**

  Run: `node --test tests/fd-care-pack.test.mjs`

  Expected: failure because the workbench and print selectors do not exist.

- [ ] **Step 3: Implement token-only styling and update the human class contract**

  Use only `var(--fd-*)` dimensions/colors in `frontdoor.css`. Keep the selection side flat and list-like; place visual emphasis on the white paper preview. Add reduced-motion-safe behavior by introducing no new animation. Document nesting, transient selected state, crisis-template ownership, and print-only visibility in `CLASS-INVENTORY.md`.

- [ ] **Step 4: Run the CSS-contract tests and verify GREEN**

  Run: `node --test tests/fd-care-pack.test.mjs tests/fd-care.test.mjs tests/fd-tokens.test.mjs`

  Expected: all design tests pass without increasing raw design drift.

- [ ] **Step 5: Commit Task 3**

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css \
    docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md \
    tests/fd-care-pack.test.mjs
  git commit -m "style(care): add printable resource workbench"
  ```

### Task 4: Browser behavior, builds, and complete verification

**Files:**
- Create: `tests/smoke/care-resource-pack.spec.js`
- Modify only if a defect is reproduced first: files owned by Tasks 1–3.

**Interfaces:**
- Consumes: the complete built MS3 and Resident Care surface.
- Produces: end-to-end evidence for selection, privacy, print, crisis inclusion, exact links, QR presence, reset, keyboard use, and responsive layout.

- [ ] **Step 1: Write the failing browser journeys**

  Cover both audiences; select three resources; verify fourth choices disable without replacement;
  verify exact canonical hrefs and QR SVGs; compare every rendered crisis item with the
  build-injected `#fdCrisisTemplate`; assert no storage/cookie/URL change; stub `window.print` and
  verify one explicit call; emulate print and verify only the handout surface is visible; clear and
  leave/re-enter Care to prove reset; check 320px width and keyboard focus.

- [ ] **Step 2: Run the focused browser suite and verify RED or expose missing integration**

  Run: `cd tests/smoke && npx playwright test care-resource-pack.spec.js`

  Expected before final integration: at least one new journey fails because the full interaction or print CSS is absent.

- [ ] **Step 3: Implement only browser-proven integration fixes**

  Fix each reproduced defect through a failing unit/browser assertion before changing production code. Do not add new product scope.

- [ ] **Step 4: Run complete verification**

  Run sequentially:

  ```bash
  node --test tests/*.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  cd tests/smoke && npx playwright test care-resource-pack.spec.js front-door.spec.js
  cd ../.. && bash bin/verify.sh
  git diff --check
  ```

  Expected: every command exits 0; the browser suite may retain only predeclared environment skips.

- [ ] **Step 5: Commit Task 4**

  ```bash
  git add tests/smoke/care-resource-pack.spec.js
  git add -u
  git commit -m "test(care): verify printable resource packs"
  ```
