# Supervised Resource Builder — ReConnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, no-PHI ReConnect tool that lets a supervised trainee select a controlled topic, broad area, and resource types, understand exactly why each resource appeared, and build a printable five-resource handout.

**Architecture:** Add a separate static tool route rather than weakening the clinician planner's role gate. A pure loader reads allowlisted category slices with a named `data_all.json` fallback; a pure matcher returns a public resource plus structured match facts; an in-memory plan module carries the same reason label into copy/print; a crisis adapter reads the canonical `RCCrisisBar.resources` registry and fails closed when it is unavailable. A plain-JavaScript DOM controller implements the accessible comboboxes, suggestion groups, and transient supervisor acknowledgement.

**Tech Stack:** Static HTML/CSS, plain JavaScript IIFEs with browser and CommonJS exports, existing local ReConnect design tokens and crisis library, Vitest, Playwright Chromium, Node QA harnesses, Python/Node publication generators. No runtime Babel, new backend, database migration, storage, analytics payload, or generative model.

**Spec:** `docs/superpowers/specs/2026-09-27-supervised-resource-builder-design.md` in the Psychiatry Clerkship Library design PR. Copy that approved spec and this plan unchanged into the ReConnect implementation branch before coding so review and implementation travel together.

## Global Constraints

- Work in a fresh ReConnect worktree based on current `origin/main`; run the ReConnect coordination/collision report before editing. Do not implement on the existing clinician-planner worktree or stack this feature on draft PR #1717.
- Keep `clinician-support-planner.html` and `RCAuth.requireRole('clinician')` unchanged. The new route is `tools/supervised-resource-builder.html` and contains no `RCAuth` bypass or query-string mode.
- Load only `/data/categories/<category>.json`, with one optional `../data_all.json` fallback after a slice failure. Never use deprecated `/slices/`, Resource Database API paths, or the capped search index.
- First-release inputs are a selected controlled topic, a selected broad area, and selected resource-type chips. Typed-but-unselected text never influences matching.
- Inputs, result state, selected resources, acknowledgement, and print state remain in memory. Prohibit `localStorage`, `sessionStorage`, IndexedDB, cookies, URL state, and topic/location/result analytics.
- Include only explicit public fields. Never accept or export a patient name, initials, date of birth, street address, diagnosis assertion, symptom narrative, medication, disposition, insurance ID, or free-text note.
- A source/review date is provenance, not proof of availability. Missing verification/status/date renders `unknown` or `unavailable`; no code path upgrades absence to a positive claim.
- Treat `recovery_meetings` rows as governed directory resources only in this first release. Do not claim that a meeting is upcoming or live; the separate Recovery Meeting Calendar remains the canonical schedule surface.
- Every visible suggestion and every printed resource must carry one identical `matchReason.label`. A resource without honest structured match facts is suppressed and reported as a nonclinical data-quality notice.
- Location language must be literal. A statewide or telehealth fallback says so; a location-independent book or podcast never mentions the selected area.
- Crisis literals remain solely in `tools-suite/shared-libs/rc-crisis-bar.js`. The new tool consumes its exported registry and disables Copy and Print when that registry is absent or invalid.
- Classify the route as a clinician/workforce tool in ToolRecord metadata, but do not add an authentication gate. The direct route is public because the Clerkship launch link must work without sharing credentials.
- Human ReConnect data/clinical owners review category inclusion, token fields, ordering, reason copy, and print copy. Clerkship faculty review the supervised-trainee framing. Passing tests is not clinical approval, merge, deployment, or served-state proof.
- Do not deploy a feature branch. Production evidence must be tied to the exact merged `main` revision and canonical served URL.

## Review Focus

1. A trainee types `bipolar` and `Portland` but does not select controlled options: no match runs and no raw text appears in the page, URL, network, logs, or print output (Tasks 1, 2, and 4).
2. A selected `Bipolar` topic plus `Education` type and `Greater Portland` area yields only records with exact controlled match facts; the badge and print line are byte-identical (Tasks 2 and 3).
3. A statewide, telehealth, or location-independent fallback never claims a local Portland match, and an unmatched topic/location phrase never enters a badge (Task 2).
4. One category slice fails or falls back while others load: named source state remains visible and the UI never converts unavailable sources into `0 results` (Tasks 1 and 4).
5. Crisis registry load fails, clipboard rejects, the sixth resource is chosen, or the page reloads: Copy/Print fail closed, the first five remain, and reload clears all state (Tasks 3 and 4).
6. At 320 CSS pixels, 200% zoom, grayscale print, and keyboard-only operation, the whole workflow remains readable and operable with announced changes and 44-pixel targets (Task 4).

---

### Task 1: Normalize canonical slices and controlled selector options

**Files:**
- Create in ReConnect: `tools-suite/tools/supervised-resource-builder.resources.js`
- Create in ReConnect: `tests/unit/supervised-resource-builder.resources.test.js`

**Interfaces:**
- `SRBResources.CATEGORY_CONTRACTS` is the reviewed allowlist for `psychoeducation`, `community_services`, `peer_support`, `recovery_meetings`, `aftercare`, `telehealth_providers`, `books`, and `podcasts`.
- `SRBResources.loadCategories(fetcher): Promise<{categories,sourceStates,failures,fallbackUsed}>` fetches each slice once, then fetches `../data_all.json` once only when at least one slice failed.
- `SRBResources.normalizeRecord(row,category,index,sourceKind): PublicResource|null` returns only allowlisted public fields and normalized exact tokens.
- `SRBResources.deriveOptions(categories): {topics:ControlledOption[],areas:ControlledOption[]}` derives selectable values from reviewed fields already governed in the canonical database. Typing filters these options; it does not mint new tokens.
- `ControlledOption` is `{id:string,label:string}` where `id` is a deterministic normalized comparison key and `label` is the exact governed display value. `sourceStates` maps each category to `loaded`, `fallback`, or `failed`; `failures` names every unresolved category; `fallbackUsed` is a boolean.

`PublicResource` must have this shape:

```js
{
  key: 'psychoeducation:42', category: 'psychoeducation', group: 'learn',
  typeId: 'education', title: 'Synthetic education resource', description: 'Public description',
  website: 'https://example.test/resource', phone: '', servedArea: 'National',
  topicTokens: ['Bipolar'], regionTokens: [], stateToken: 'national', telehealth: false,
  provenance: { sourceKind: 'category-slice', sourceName: 'Synthetic source',
    recordedAt: '2026-09-01', verificationStatus: 'unknown', freshnessStatus: 'current' }
}
```

- [ ] **Step 1: Write failing loader/normalizer tests.** Use synthetic records for every category. Assert public HTTP(S) URL normalization, phone/title/description/source/date/status fields, exact comma-token parsing for `clinical_category`, `symptom_cluster`, and `conditions`, and generated `regions_normalized` handling. Assert arbitrary notes, internal IDs, opaque raw objects, and blocked-public rows never leave the adapter.

```js
const item = resources.normalizeRecord({
  name: 'Synthetic guide', clinical_category: 'Bipolar Disorder',
  symptom_cluster: 'Bipolar, Mood', website: 'https://example.test/guide',
  last_verified_date: '2026-09-01'
}, 'psychoeducation', 0, 'category-slice');
expect(item.topicTokens).toEqual(['Bipolar Disorder', 'Bipolar', 'Mood']);
expect(item.provenance.verificationStatus).toBe('unknown');
expect(item).not.toHaveProperty('notes');
```

- [ ] **Step 2: Verify red.** Run `pnpm exec vitest run tests/unit/supervised-resource-builder.resources.test.js`; expect a missing-module failure.
- [ ] **Step 3: Implement the reviewed category contract.** Map categories to display group, resource type, topic fields, region fields, and location capability. Split comma-separated governed tags, trim and de-duplicate exact values, and preserve source order. Do not lowercase display values; use a separate normalized comparison key.
- [ ] **Step 4: Add failing controlled-option and fallback tests.** Assert typing `portland` can filter and select the governed `Greater Portland` option but the selected value remains `Greater Portland`. Simulate one failed slice: fallback recovers that category from `data_all.json`, sets `sourceKind:'data-all-fallback'`, and does not invent `regions_normalized`. Simulate fallback failure and assert the named category remains failed, not empty.
- [ ] **Step 5: Implement one-shot slice loading and fail-closed fallback.** Cache fetch promises for the current page. Recovered raw fallback rows may provide exact topic, state, and explicitly governed telehealth facts, but `regionTokens` stays empty unless the row actually contains a validated normalized-region array.
- [ ] **Step 6: Verify and commit.** Run the targeted Vitest file plus `git diff --check`; expect PASS. Commit as `feat: normalize supervised resource sources`.

---

### Task 2: Match deterministically and build the transparent reason label

**Files:**
- Create in ReConnect: `tools-suite/tools/supervised-resource-builder.match.js`
- Create in ReConnect: `tests/unit/supervised-resource-builder.match.test.js`

**Interfaces:**
- `SRBMatch.matchResources(resources,selection): MatchResult` consumes only selected controlled values.
- `selection` is `{topic:{id,label},area:{id,label}|null,typeIds:string[]}`.
- `MatchResult` is `{groups:{learn:Suggestion[],localSupport:Suggestion[],practicalStep:Suggestion[]},suppressedCount,notices}`.
- `Suggestion` is a `PublicResource` plus:

```js
matchReason: {
  topicLabel: 'Bipolar', typeLabel: 'Education', locationLabel: 'Greater Portland',
  locationMode: 'local',
  label: 'Matched: Bipolar + Education + Greater Portland'
}
```

- [ ] **Step 1: Write failing local/statewide/telehealth/none tests.** Use synthetic records and exact controlled selections. Assert maximum group sizes of two Learn, two Local support, and one Next practical step. Assert stable category/source order over repeated calls.
- [ ] **Step 2: Add negative transparency tests before implementation.** Prove `Portland` is absent when only statewide, telehealth, or location-independent facts matched. Prove an unmatched topic, type, or region never enters `matchReason`. Prove a record that cannot produce all required facts is suppressed with a data-quality notice.

```js
const suggestion = result.groups.learn[0];
expect(suggestion.matchReason).toEqual({
  topicLabel: 'Bipolar', typeLabel: 'Education', locationLabel: null,
  locationMode: 'none', label: 'Matched: Bipolar + Education'
});
expect(suggestion.matchReason.label).not.toContain('Portland');
```

- [ ] **Step 3: Verify red.** Run `pnpm exec vitest run tests/unit/supervised-resource-builder.match.test.js`; expect a missing-module failure.
- [ ] **Step 4: Implement exact comparisons and reason construction.** Topic and area compare normalized controlled IDs; no prose scan, semantic similarity, popularity, score, or patient state participates. Resolve location mode in this order: exact normalized region, explicit statewide state match, explicit telehealth capability, none for location-independent types. Build `label` only from the returned structured fields.
- [ ] **Step 5: Add property-style invariants.** Iterate fixture combinations and assert every returned suggestion has a nonempty reason; every label segment equals one structured fact; no arbitrary selection text appears; input arrays are not mutated; ordering is deterministic.
- [ ] **Step 6: Verify and commit.** Run resource and matcher unit suites plus `git diff --check`; expect PASS. Commit as `feat: explain supervised resource matches`.

---

### Task 3: Keep a five-resource plan and fail closed on crisis governance

**Files:**
- Create in ReConnect: `tools-suite/tools/supervised-resource-builder.plan.js`
- Create in ReConnect: `tools-suite/tools/supervised-resource-builder.crisis.js`
- Create in ReConnect: `tests/unit/supervised-resource-builder.plan.test.js`
- Create in ReConnect: `tests/unit/supervised-resource-builder.crisis.test.js`

**Interfaces:**
- `SRBPlan.add(plan,suggestion)`, `.remove(plan,key)`, and `.move(plan,key,direction)` are immutable and cap the list at five.
- `SRBPlan.exportHandout(plan,crisisActions,reviewed)` returns `{ok,text,error}` from an explicit public-field allowlist. It never serializes a raw object.
- `SRBCrisis.fromRegistry(RCCrisisBar): {ok,actions,error}` accepts the existing exported `resources` array, validates required public fields and safe `tel:`/`sms:` schemes, and returns printable actions without duplicating their literals.

- [ ] **Step 1: Write failing plan tests.** Add five synthetic suggestions, reject a sixth without eviction, de-duplicate by stable key, remove/reorder, and preserve the input array. Inject sentinel `patientName`, `diagnosis`, `notes`, and `raw` fields and assert none enter export.
- [ ] **Step 2: Pin reason identity in export.** Assert the exact `matchReason.label` string shown on a selected card appears once under the same resource in the handout and is not recomputed from user inputs.
- [ ] **Step 3: Write failing crisis tests.** Pass a synthetic registry with call/text actions and assert printable output. Remove the registry, duplicate an ID, omit a label, or use `https:` and assert `{ok:false}`. Statically assert the new builder modules contain no known crisis phone/text literals.
- [ ] **Step 4: Verify red.** Run `pnpm exec vitest run tests/unit/supervised-resource-builder.plan.test.js tests/unit/supervised-resource-builder.crisis.test.js`; expect missing-module failures.
- [ ] **Step 5: Implement immutable plan/export and the crisis adapter.** Require at least one plan item, a true transient reviewed flag, and a valid crisis result. Use only title, public description, phone, canonical HTTP(S) website, served area, source/date/status, exact reason label, and validated crisis actions.

```js
function exportHandout(plan, crisisActions, reviewed) {
  if (!reviewed) return {ok:false, text:'', error:'Review with a supervisor before copying or printing.'};
  if (!crisisActions || crisisActions.ok !== true) {
    return {ok:false, text:'', error:'Crisis resources are unavailable, so this handout cannot be prepared.'};
  }
  // Append allowlisted plan lines, each item's existing matchReason.label, then governed actions.
}
```

- [ ] **Step 6: Verify and commit.** Run all four builder unit suites plus `git diff --check`; expect PASS. Commit as `feat: build governed resource handouts in memory`.

---

### Task 4: Build the accessible public tool and browser failure shields

**Files:**
- Create in ReConnect: `tools-suite/tools/supervised-resource-builder.html`
- Create in ReConnect: `tools-suite/tools/supervised-resource-builder.js`
- Create in ReConnect: `tools-suite/qa/qa_harness_supervised_resource_builder.js`
- Create in ReConnect: `tests/e2e/flows/supervised-resource-builder.spec.js`

**Interfaces and markup contract:**
- The page loads local token/theme/design-system CSS, `rc-nav.js`, `rc-crisis-bar.js`, the four pure modules, and the controller. It does not load `rc-auth.js`.
- Both controlled selectors use the WAI-ARIA combobox pattern: input with `role="combobox"`, `aria-autocomplete="list"`, `aria-controls`, `aria-expanded`, and active-descendant management; listbox options are selected only by click, Enter, or Space.
- Suggestion cards expose a visible `Why this appeared` heading/badge and Add/Remove button. Plan rows expose Remove, Move up, and Move down.
- The transient `Reviewed with supervisor` checkbox gates Copy and Print. Reload starts unchecked with an empty plan.
- The print region is semantic HTML, not a screenshot or hidden preformatted text, and repeats every exact reason label plus the governed printable crisis actions.

- [ ] **Step 1: Write the static QA harness first.** Assert complete RC-META, no auth import, no storage/URL/analytics APIs, fixed same-origin data paths, local CSS/runtime only, no crisis literals, all required labels/live regions, print CSS, and 44-pixel control declarations. Register the harness with the existing QA discovery convention.
- [ ] **Step 2: Write failing browser journeys tagged `@browser-journey`.** Stub category slices and fallback with synthetic public records. Cover: controlled typing/selection; truthful local/statewide/telehealth/none badges; exact print reason identity; named partial source failure; fallback banner/date; five-item limit; keyboard reorder; clipboard rejection; crisis-registry absence; reload clearing state; and no storage or URL mutation.
- [ ] **Step 3: Add accessibility and responsive cases.** At 320 CSS pixels and 200% zoom assert no horizontal page overflow, every interactive target is at least 44-by-44 CSS pixels, listboxes and status messages have correct accessible names, full keyboard operation works, reduced motion is respected, and print output remains legible in grayscale.
- [ ] **Step 4: Verify red.** Run `node tools-suite/qa/qa_harness_supervised_resource_builder.js` and `pnpm exec playwright test tests/e2e/flows/supervised-resource-builder.spec.js --project=chromium`; expect missing-route failures.
- [ ] **Step 5: Implement HTML/CSS/controller.** Keep typed strings only in input elements. On selection, store the controlled option object in memory. Render suggestions with DOM text nodes or escaped template output, never `innerHTML` from resource data. Cache data loads for the page session and announce all state changes through concise live regions.
- [ ] **Step 6: Exercise network privacy.** In Playwright, record requests after initial fixed data loads; typing, matching, adding, reordering, acknowledging, copying, and printing must create zero requests. Assert the URL remains exactly `/tools/supervised-resource-builder.html`.
- [ ] **Step 7: Verify and commit.** Run the four unit files, QA harness, focused Chromium spec, and `git diff --check`; expect PASS. Commit as `feat: add supervised resource builder interface`.

---

### Task 5: Register, publish, and validate generated consumers

**Files:**
- Create in ReConnect: `tools-suite/tools/metadata/supervised-resource-builder.yaml`
- Modify in ReConnect: `tools-suite/build_netlify.py`
- Modify in ReConnect: `tools-suite/tools/metadata/crisis-support-capability.json`
- Regenerate in ReConnect: `tools-suite/tool-manifest.json`
- Regenerate in ReConnect: `tools-suite/product-registry.json`
- Regenerate in ReConnect: `tools-suite/product-registry.js`
- Regenerate in ReConnect: `tools-suite/landing/tools-index.json`
- Regenerate in ReConnect: `tools-suite/landing/search-index.json`
- Regenerate in ReConnect: `tools-suite/dev-checks/integration-debt-dashboard.html`
- Regenerate in ReConnect: `pwa/config/precache_manifest.json`
- Regenerate in ReConnect: `pwa/src/precache_manifest.js`
- Regenerate in ReConnect: `docs/generated/repository-facts.json`
- Regenerate in ReConnect: `docs/generated/repository-facts.md`

- [ ] **Step 1: Add the preview metadata contract.** Use `id: supervised-resource-builder`, `status: preview`, `audience: [clinician]`, `roles: [clinician]`, and notes stating that the route is public, nonidentifying, supervised, and pending clinical/data-owner review. RC-META uses `status="preview"`, `audience="clinician"`, a summary at or below 120 characters, `data-sync="data_all.json"`, and an explicit literal `RCData.load([...])` declaration only if the manifest generator requires it for the category list.
- [ ] **Step 2: Publish all builder sidecars.** Extend `TOOL_SIDECAR_PATTERNS` with `supervised-resource-builder*.js`. Add/extend build tests so a clean and incremental build both contain the HTML and every sidecar and never copy a hand-edited generated bundle.
- [ ] **Step 3: Add the crisis capability through its authoritative allowlist.** Append `supervised-resource-builder` to `crisis-support-capability.json` because the tool renders canonical crisis actions and fails closed without them. Do not add a regex heuristic.
- [ ] **Step 4: Regenerate in dependency order.** Run:

```bash
python3 scripts/generate_tool_manifest.py
python3 tools-suite/scripts/generate_product_registry.py
python3 tools-suite/scripts/build_tools_index.py --strict --out tools-suite/landing/tools-index.json
python3 scripts/generate_integration_data.py
python3 scripts/generate_precache_manifest.py
python3 scripts/generate_repository_facts.py
python3 tools-suite/build_netlify.py
```

Inspect every generated diff. Keep only deterministic changes caused by the new preview ToolRecord and QA harness; revert unrelated generated churn with a non-destructive patch, not a reset.
- [ ] **Step 5: Assert preview behavior.** The ToolRecord exists, route publishes, preview remains fail-closed from active generated launch URLs, and the direct local route is testable. Record the exact inventory/catalog delta from generator output rather than assuming counts.
- [ ] **Step 6: Run focused generated checks and commit.** Run `python3 scripts/generate_tool_manifest.py --check`, `python3 tools-suite/scripts/generate_product_registry.py --check`, `python3 tools-suite/scripts/build_tools_index.py --strict --out /tmp/srb-tools-index.json`, `python3 scripts/generate_precache_manifest.py --check --json`, `python3 scripts/generate_repository_facts.py --check`, `python3 tools-suite/build_netlify.py`, and the focused QA/browser suites. Commit as `build: register supervised resource builder preview`.

---

### Task 6: Complete review, full verification, and release evidence

**Files:**
- Modify in ReConnect after review: `tools-suite/tools/supervised-resource-builder.html`
- Modify in ReConnect after review: `tools-suite/tools/supervised-resource-builder.resources.js`
- Modify in ReConnect after review: `tools-suite/tools/supervised-resource-builder.match.js`
- Modify in ReConnect after review: `tools-suite/tools/metadata/supervised-resource-builder.yaml`
- Modify/regenerate the Task 5 generated outputs only when approved source metadata changes.

- [ ] **Step 1: Obtain named human reviews.** Data owner reviews category/field allowlists and source order; clinical owner reviews resource-type grouping, reason wording, and handout boundary; crisis owner confirms registry consumption; accessibility reviewer checks both comboboxes, plan controls, live regions, 320-pixel layout, 200% zoom, and print.
- [ ] **Step 2: Apply review changes with tests first.** For each requested behavior change, add the smallest failing unit/QA/browser assertion, verify red, implement, verify green, and commit with the relevant scope. Do not turn a human wording decision into an inferred clinical mapping.
- [ ] **Step 3: Run the complete local release gate.** Run the full targeted tests plus:

```bash
pnpm test
pnpm exec playwright test --project=chromium --grep "@browser-journey" --fail-on-flaky-tests --forbid-only
python3 tools-suite/build_netlify.py
python3 scripts/generate_tool_manifest.py --check
pnpm run check:tailwind
bash scripts/check_no_runtime_babel_in_tools.sh
bash scripts/check_all_tools_reliability_strict.sh
python3 scripts/reliability_gate_scan.py --config scripts/reliability_canary_surfaces.json --strict --json
python3 scripts/generate_precache_manifest.py --check --json
python3 scripts/check_cross_surface_data_checksums.py --json
python3 scripts/check_shared_surface_parity.py --json
python3 scripts/check_canary_bundle_budgets.py --json
node scripts/validate_rc_state_contract.js
python3 scripts/check_canary_state_recovery.py
bash scripts/check_generated_canary_bundles.sh
```

- [ ] **Step 4: Open a draft PR and preserve evidence boundaries.** Report unit/QA/browser/build/release checks separately. Explicitly state that local green does not establish clinical approval, CI, merge, deployment, or served content.
- [ ] **Step 5: Promote only after approvals.** Change `status: preview` and RC-META status to `stable` in a reviewed commit, regenerate the same consumers, rerun the full gate, and obtain required PR checks. Merge authority remains human.
- [ ] **Step 6: Verify production before Clerkship work.** After merge/deploy, record the exact ReConnect commit SHA, ready production deploy ID, and the canonical HTTPS URL. Fetch that URL and verify the title, the fixed asset references, a representative reason badge workflow using synthetic selections, and the governed print block. This served-revision receipt is the prerequisite for the separate Clerkship plan.

## Completion Evidence

Implementation is complete only when all six tasks are checked, the full gate is green at the reviewed ReConnect revision, human owners approved their named surfaces, the stable route is merged, and the exact canonical served URL is verified. The later Clerkship launch link is deliberately excluded from this implementation PR.
