# APP Psychiatry Fellowship Pathway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a preview-only APP entry with two optional starting bridges, a shared On shift workspace, private formative reflection, reusable development-only scenario infrastructure, and complete G01-G42 traceability without publishing unreviewed clinical content or inferring local policy.

**Architecture:** Extend the current static Front Door rather than creating a third site. `curriculum.json` owns the APP structure and canonical resource references; the build projects that structure only into the resident preview, `fd_app.js` resolves those references through the existing joined index, and the existing controller persists only the selected bridge inside `cw_frontdoor_v1`. A separate pure scenario player is tested with nonclinical fixtures but is not injected into either learner build until faculty-reviewed packs exist.

**Tech Stack:** Static HTML/CSS, ES5-compatible JavaScript snippets, Python build projection/validation, JSON Schema, Node test runner, Playwright, sequential MS3/resident builders.

**Spec:** `/Users/jm/Documents/Codex Handoffs/APP Psychiatry Fellowship/2026-09-21/01-Content-Gap-Inventory.md` and `/Users/jm/Documents/Codex Handoffs/APP Psychiatry Fellowship/2026-09-21/02-Implementation-Handoff.md`

## Global Constraints

- Preserve existing clinical wording and existing clinical case feedback.
- Keep the APP preview on the resident build; this placement does not confer resident authority or decide the production host.
- The learner may use either bridge and may change bridges.
- No APP score, pass/fail state, readiness claim, competence label, certificate, entrustment output, or clinical-responsibility unlock.
- No calibration response, bridge choice, reflection, or revisit choice may be sent through analytics, network requests, URLs, AI services, error payloads, or supervisor dashboards.
- Persist only the selected bridge as minimal nonidentifying UI state in `cw_frontdoor_v1`; keep formative responses in memory and collect no free text.
- Do not edit `13_Faculty_Resources/reviewed.json`, faculty-review metadata, or attestation hashes.
- New clinical scenarios and feedback remain outside shipped learner inputs until faculty disposition and any required local policy exist.
- Build MS3 and resident outputs sequentially.

---

### Task 1: Recover the verified On shift foundation on current main

**Files:**
- Modify: `curriculum.json`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Test: `tests/fd-data.test.mjs`
- Test: `tests/fd-reader.test.mjs`
- Test: `tests/fd-shell.test.mjs`
- Test: `tests/fd-wire.test.mjs`
- Test: `tests/smoke/front-door.spec.js`

**Interfaces:**
- Consumes: existing `FD_ROLES`, `fdResolveState(url, stored)`, `fdDispatch(attrs, context, state)`, and reader origin state.
- Produces: raw role id `app`, two-tab APP chrome, direct entry without week setup, and reader return label `On shift`.

- [ ] **Step 1: Add focused failing contracts for the APP role and direct-entry state**

```js
assert.equal(CUR.roles.resident.some((role) => role.id === 'app'), true);
assert.equal(F.fdResolveState('/', { role: 'app', browsing: true }).screen, 'app');
assert.equal(F.fdReaderBackLabel('today', 'app'), 'On shift');
```

- [ ] **Step 2: Run focused tests and confirm they fail for missing APP behavior**

Run: `node --test tests/fd-data.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-wire.test.mjs`

- [ ] **Step 3: Port the previously verified APP shell changes onto current main**

Implement `fdTabs(tab, appMode)`, preserve `roleId` before converting the role to display text, bypass week setup for `role === 'app'`, hide Path/week controls in APP mode, and keep the MS3/resident flows unchanged.

- [ ] **Step 4: Run the focused contracts**

Run: `node --test tests/fd-data.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-wire.test.mjs`

- [ ] **Step 5: Commit the recovered foundation**

```bash
git add curriculum.json 13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css 13_Faculty_Resources/_automation/site_build/spa_index.html tests/fd-data.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-wire.test.mjs tests/smoke/front-door.spec.js
git commit -m "feat(frontdoor): restore APP on-shift foundation"
```

### Task 2: Add a canonical, audience-projected APP curriculum structure

**Files:**
- Modify: `curriculum.schema.json`
- Modify: `curriculum.json`
- Modify: `13_Faculty_Resources/_automation/validate_curriculum.py`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py`
- Test: `13_Faculty_Resources/_automation/test_validate_registry_schemas.py`
- Test: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`
- Create: `tests/app-pathway.test.mjs`

**Interfaces:**
- Consumes: derived shipped-page audiences and final resident catalog entries.
- Produces: `FD_CURRICULUM.appPathway` only in the resident build with exact `pa` and `pmhnp` bridge ids, eight refs per bridge, three shared activities, and self-check prompts containing no answer key.

- [ ] **Step 1: Write schema, validator, and projection tests that reject missing, duplicate, or wrong-audience refs**

```js
assert.deepEqual(Object.keys(CUR.appPathway.bridges), ['pa', 'pmhnp']);
assert.equal(CUR.appPathway.bridges.pa.refs.length, 8);
assert.equal(CUR.appPathway.activities.length, 3);
```

- [ ] **Step 2: Run the focused tests and confirm the APP structure is absent**

Run: `python3 -B 13_Faculty_Resources/_automation/test_validate_registry_schemas.py && python3 -B 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py && node --test tests/app-pathway.test.mjs`

- [ ] **Step 3: Add the strict APP structure and validation**

Use exact route names `PA psychiatry bridge` and `PMHNP medical-systems bridge`; store refs and nonclinical navigation/purpose copy only. Validate stable ids, uniqueness, allowed actions, resident availability, and exact bridge/activity cardinality. Strip `appPathway` from the MS3 projection.

- [ ] **Step 4: Run curriculum and projection validation**

Run: `python3 -B 13_Faculty_Resources/_automation/validate_registry_schemas.py && python3 -B 13_Faculty_Resources/_automation/validate_curriculum.py && python3 -B 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py && node --test tests/app-pathway.test.mjs`

- [ ] **Step 5: Commit the canonical APP contract**

```bash
git add curriculum.schema.json curriculum.json 13_Faculty_Resources/_automation/validate_curriculum.py 13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py 13_Faculty_Resources/_automation/test_validate_registry_schemas.py 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py tests/app-pathway.test.mjs
git commit -m "feat(curriculum): define APP fellowship preview structure"
```

### Task 3: Render dual-entry bridges and shared preparation cards

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Test: `tests/app-pathway.test.mjs`
- Test: `tests/fd-action-contract.test.mjs`
- Test: `tests/fd-tokens.test.mjs`

**Interfaces:**
- Consumes: `fdAppModel(FD_CURRICULUM.appPathway, FD_INDEX, state)`.
- Produces: `fdApp(index, pathway, state)` markup and handled actions `data-fd-app-bridge`, `data-fd-app-shift`, `data-fd-app-start`, `data-fd-app-reflect`, and `data-fd-app-reset`.

- [ ] **Step 1: Write failing pure-render tests for both bridge lists, canonical titles/governance, and the three activity cards**

```js
const html = F.fdApp(index, pathway, { roleId: 'app', appBridge: 'pa' });
assert.match(html, /PA psychiatry bridge/);
assert.equal((html.match(/data-fd-app-activity=/g) || []).length, 3);
assert.doesNotMatch(html, /competent|entrusted|safe independently|pass|fail/i);
```

- [ ] **Step 2: Run the APP and action-contract tests and confirm the new module/actions are missing**

Run: `node --test tests/app-pathway.test.mjs tests/fd-action-contract.test.mjs tests/fd-tokens.test.mjs`

- [ ] **Step 3: Implement the pure APP renderer and snippet injection**

Resolve every displayed resource through `index.byRef`; render a named failure when a configured ref is absent; retain the item object so its title, kind, minutes, and governance come from canonical data. Each activity card must visibly separate `Prepare independently`, `Rehearse here`, and `Arrange observation`.

- [ ] **Step 4: Implement controller actions and private in-memory reflection choices**

Persist only `appBridge`; keep `appReflection` controller-only and resettable. Do not add APP events to `cwAnalytics.record()` or route parameters.

- [ ] **Step 5: Run the focused render/action/style contracts**

Run: `node --test tests/app-pathway.test.mjs tests/fd-action-contract.test.mjs tests/fd-data.test.mjs tests/fd-reader.test.mjs tests/fd-shell.test.mjs tests/fd-wire.test.mjs tests/fd-tokens.test.mjs`

- [ ] **Step 6: Commit the APP experience**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_app.js 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_reader.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_shell.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md tests/app-pathway.test.mjs tests/fd-action-contract.test.mjs tests/fd-tokens.test.mjs
git commit -m "feat(frontdoor): add dual-entry APP preparation workspace"
```

### Task 4: Build development-only reusable practice infrastructure

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_app_practice.js`
- Create: `tests/fixtures/app-practice/nonclinical-cases.json`
- Create: `tests/app-practice.test.mjs`

**Interfaces:**
- Produces: `fdAppPracticeValidate(pack)`, `fdAppPracticeStart(pack)`, `fdAppPracticeAdvance(session, choiceId)`, `fdAppPracticeReset()`, and `fdAppPracticeRender(session)`.
- Does not produce: a snippet marker, shipped registry row, navigation entry, learner route, network request, score, or clinical answer key.

- [ ] **Step 1: Write failing tests for ordered reveal, one-detail changes, missing-feedback rejection, reset, and forbidden fields**

```js
assert.throws(() => F.fdAppPracticeValidate({ stages: [] }), /stage/);
assert.equal(F.fdAppPracticeAdvance(session, 'revisit').stageIndex, 1);
assert.doesNotMatch(F.fdAppPracticeRender(session), /score|pass|competent/i);
```

- [ ] **Step 2: Run the player tests and confirm the API is missing**

Run: `node --test tests/app-practice.test.mjs`

- [ ] **Step 3: Implement the pure player against nonclinical fixture data**

Reject free-text capture, dose fields, score/threshold fields, proprietary item fields, missing evidence refs, and missing policy-dependency declarations. Keep session state in the caller and include no DOM, storage, network, clock, or model access.

- [ ] **Step 4: Prove fixtures and player are excluded from both shipped inventories**

Run: `python3 -B 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check && node --test tests/app-practice.test.mjs`

- [ ] **Step 5: Commit the development-only player**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_app_practice.js tests/fixtures/app-practice/nonclinical-cases.json tests/app-practice.test.mjs
git commit -m "test(app): add development-only staged practice player"
```

### Task 5: Add G01-G42 traceability and faculty decision packets

**Files:**
- Create: `docs/app-fellowship/implementation-status.md`
- Create: `docs/app-fellowship/research-backlog.md`
- Create: `docs/app-fellowship/local-policy-questions.md`
- Create: `docs/app-fellowship/pilot-decision-record.md`
- Create: `docs/app-fellowship/faculty-review-packets/role-supervision-observation.md`
- Create: `docs/app-fellowship/faculty-review-packets/medical-assessment-and-results.md`
- Create: `docs/app-fellowship/faculty-review-packets/medication-workflows.md`
- Create: `docs/app-fellowship/faculty-review-packets/documentation-consult-transition.md`
- Create: `docs/app-fellowship/draft-scenarios/pa-formulation-follow-through.json`
- Create: `docs/app-fellowship/draft-scenarios/pmhnp-medical-consult.json`
- Test: `tests/app-fellowship-docs.test.mjs`

**Interfaces:**
- Produces: one row for every G01-G42 with separate software, clinical-content, local-policy, observation, verification, and remaining-action states.
- Keeps: every packet and scenario outside shipped learner-content producers.

- [ ] **Step 1: Write a failing totality test for all 42 gap ids and required state columns**

```js
for (let n = 1; n <= 42; n += 1) assert.match(status, new RegExp(`G${String(n).padStart(2, '0')}`));
assert.match(status, /Software state \| Clinical-content state \| Local-policy dependency \| Observation dependency/);
```

- [ ] **Step 2: Run the documentation test and confirm the packet set is absent**

Run: `node --test tests/app-fellowship-docs.test.mjs`

- [ ] **Step 3: Write the traceability register and exact decision packets**

Mark each row as `implemented`, `drafted`, `not started`, `requires faculty input`, `requires institutional policy`, or `requires real observation` as applicable. Link candidate primary/authoritative sources, label draft scenario material, assign no human owner, and add no clinical feedback.

- [ ] **Step 4: Verify the documents are unshipped and complete**

Run: `node --test tests/app-fellowship-docs.test.mjs && python3 -B 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check`

- [ ] **Step 5: Commit traceability and review packets**

```bash
git add docs/app-fellowship tests/app-fellowship-docs.test.mjs
git commit -m "docs(app): map fellowship gaps and faculty decisions"
```

### Task 6: Add browser coverage, screenshots, and privacy proof

**Files:**
- Create: `tests/smoke/app-pathway.spec.js`
- Modify: `tests/smoke/playwright.config.js` only if an existing project selector is required; do not add a new deployment target.
- Create outside git: `/tmp/app-fellowship-screenshots/`

**Interfaces:**
- Consumes: built MS3 and resident sites.
- Produces: both-bridge navigation coverage, canonical reader return, keyboard/touch checks, narrow-screen proof, reset proof, and captured request/analytics assertions.

- [ ] **Step 1: Write browser tests for both bridges, three shared activities, APP reset, and MS3 non-exposure**

```js
await expect(page.getByRole('button', { name: /PA psychiatry bridge/ })).toBeVisible();
await expect(page.locator('[data-fd-app-activity]')).toHaveCount(3);
expect(requestBodies.join('\n')).not.toMatch(/appBridge|appReflection|revisit/i);
```

- [ ] **Step 2: Build MS3 then resident sequentially**

Run: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`

Run: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`

- [ ] **Step 3: Run focused browser projects for both audiences**

Run from `tests/smoke`: `npx playwright test app-pathway.spec.js --project=nav-ms3 --project=nav-res`

- [ ] **Step 4: Capture desktop and narrow-screen screenshots for both bridge selections, On shift, and the formative reflection state**

Save only nonclinical synthetic UI states under `/tmp/app-fellowship-screenshots/`; do not add macOS visual baselines to git.

- [ ] **Step 5: Commit browser coverage**

```bash
git add tests/smoke/app-pathway.spec.js
git commit -m "test(app): cover pathway navigation and privacy"
```

### Task 7: Complete repository verification and integration review

**Files:**
- Review: all branch changes against `origin/main`
- Update: `docs/app-fellowship/implementation-status.md` verification column with actual evidence only

**Interfaces:**
- Produces: a reviewable branch with no learner-facing draft clinical packs and no governance promotions.

- [ ] **Step 1: Run focused validators and root tests**

Run: `python3 -B 13_Faculty_Resources/_automation/validate_registry_schemas.py`

Run: `python3 -B 13_Faculty_Resources/_automation/validate_topic_meta.py`

Run: `python3 -B 13_Faculty_Resources/_automation/validate_attestation_consistency.py`

Run: `python3 -B 13_Faculty_Resources/_automation/validate_curriculum.py`

Run: `python3 -B 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check`

Run: `node --test tests/*.test.mjs`

- [ ] **Step 2: Rebuild both sites sequentially and rerun APP browser coverage**

Run: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`

Run: `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`

Run from `tests/smoke`: `npx playwright test app-pathway.spec.js --project=nav-ms3 --project=nav-res`

- [ ] **Step 3: Run the complete local gate**

Run: `bash bin/verify.sh`

- [ ] **Step 4: Review the exact diff and refresh collision evidence**

Run: `git diff --check origin/main...HEAD`

Run: `python3 -B tools/coordination/collision_report.py --check --paths-file <generated-exact-changed-path-list>`

Verify no review ledger, attestation hash, clinical source, analytics setting, or draft-scenario build input changed.

- [ ] **Step 5: Commit the verification record update**

```bash
git add docs/app-fellowship/implementation-status.md
git commit -m "docs(app): record pathway verification evidence"
```

### Task 8: Push, open the PR, monitor CI, and merge

**Files:**
- No additional source files unless CI identifies a branch-caused defect.

**Interfaces:**
- Produces: one PR attached to this task and a merge only after required checks pass.

- [ ] **Step 1: Push the feature branch**

Run: `git push -u origin codex/app-fellowship-pathway`

- [ ] **Step 2: Open a PR describing software completion separately from pilot readiness**

The PR body must name tests, screenshots, G01-G42 traceability, faculty packets, and unresolved institutional decisions; it must explicitly say no deployment or fellowship-readiness claim is included.

- [ ] **Step 3: Attach the PR to this task and monitor every required CI check**

If CI fails, inspect the exact logs, reproduce the branch-caused failure locally, repair with focused tests, rerun the relevant gate, push, and monitor again.

- [ ] **Step 4: Refresh branch/collision evidence after the final push**

Confirm the PR head, final diff, checks, and collision report all describe the same revision.

- [ ] **Step 5: Squash-merge the PR after all required checks pass**

Do not deploy, enable analytics, alter faculty review records, or claim the APP fellowship is ready. Report the merged revision and exact remaining human decisions.
