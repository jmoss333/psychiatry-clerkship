# Attestation Review-Sitting Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the per-item cost of a faculty attestation sitting from ~4 clicks to 1 deliberate action (compound receipt + auto-enroll + auto-advance + keyboard) without changing what is asserted, recorded, or committed.

**Architecture:** Client-only changes inside `faculty-console/app.mjs` (single-file console app, framework-free `el()` DOM builders, in-memory `state`). The compound receipt replaces two checkboxes only in the exact conditions where both are meaningful today; batch enrollment derives from receipt possession; advancement reuses `setSelectedReviewKey`. No server, schema, or storage changes.

**Tech Stack:** Vanilla ES modules, Node `node:test` contract suites that mount the real app against a mocked fetch (`tests/faculty-console-contract.test.mjs` `startHarness`), Playwright smoke project `faculty-console`.

**Approved design:** `docs/superpowers/specs/2026-08-12-attestation-flow-efficiency-design.md`

## Global Constraints

- Client-only: `faculty-console/netlify/functions/attest.mjs`, `qbank-actions.mjs`, schemas, and the attest request payload are untouched.
- Every assertion stays explicit and fully labeled; a keyboard key fires only when a control whose label states the full assertion is rendered (`aria-keyshortcuts` marks it) — the existing `A`-shortcut integrity rule.
- Compound receipt label, verbatim: `I reviewed this draft at its saved revision and its live rendering`.
- The compound control renders ONLY when `item.type === 'question'` AND preview status is `ready` AND the draft-review `canReview` conditions hold (draft view, no dirty fields, saved revision matches). Every degraded/other path renders today's separate controls unchanged.
- Receipts stay revision-anchored (`state.reviewedRevisions`); `assessBatch` cohort limits and the three batch confirmations are untouched.
- Auto-advance never fires while a navigation guard is active; it stops at the end of the filtered list (no wrap).
- Preserve `preserveQuestionReceipts` navigation persistence and revision-anchored self-invalidation.
- No new localStorage keys; no new live regions (reuse `announce()`).
- Existing suites that pin this area must stay green after updates: `tests/faculty-console-contract.test.mjs`, `tests/faculty-console-actions.test.mjs`, `tests/faculty-batch-selection.test.mjs`, `tests/faculty-console-handler.test.mjs`, `tests/faculty-review-model.test.mjs`, `tests/smoke/faculty-console.spec.js`.
- Root suite `node --test tests/*.test.mjs` currently passes 679; it must pass (plus additions) after every task.

---

### Task 1: Compound receipt control

**Files:**
- Modify: `faculty-console/app.mjs` (`renderDraftReviewControl` ~:1240, `renderDeploymentReviewPath` ~:1270, `confirmDraftReview` ~:1212)
- Test: `tests/faculty-console-contract.test.mjs`

**Interfaces:**
- Consumes: `state.reviewedRevisions` (Map id→revision), `state.reviewChecks.liveReviewed`, `state.preview.status`, `findQuestion(id)`, `refreshPreviewChromeAndRail(focusId)`, `el()`.
- Produces: `compoundReviewEligible(item)` → boolean; `confirmCompoundReview(question, checked)` → sets/clears BOTH `reviewedRevisions` and `reviewChecks.liveReviewed` atomically; DOM: `#review-compound` checkbox with `aria-keyshortcuts="r"` rendered from `renderDraftReviewControl`; when it renders, `renderDeploymentReviewPath` returns `null` for questions. Task 2 keys auto-enroll off `confirmCompoundReview`/`confirmDraftReview`; Task 4's `R` key targets `#review-compound`.

- [ ] **Step 1: Write the failing contract tests** — append to `tests/faculty-console-contract.test.mjs`, following the file's harness idiom (each test: `const harness = await startHarness({...})` with a draft question fixture, drive DOM via `harness.window.document`):

```js
test('a clean ready-preview draft renders ONE compound receipt control', async () => {
  const harness = await startHarnessWithReadyPreviewDraft();
  const doc = harness.window.document;
  const compound = doc.getElementById('review-compound');
  assert.ok(compound, 'compound checkbox renders');
  assert.equal(compound.getAttribute('aria-keyshortcuts'), 'r');
  assert.match(
    compound.closest('label').textContent,
    /I reviewed this draft at its saved revision and its live rendering/,
  );
  assert.equal(doc.getElementById('review-saved-revision'), null, 'separate draft box gone');
  assert.equal(doc.getElementById('review-live-preview'), null, 'separate live box gone');
});

test('checking the compound receipt records both state slices atomically; unchecking clears both', async () => {
  const harness = await startHarnessWithReadyPreviewDraft();
  const doc = harness.window.document;
  const compound = doc.getElementById('review-compound');
  compound.click();
  const item = harness.controller.state.reviewItems.find(i => i.type === 'question');
  assert.equal(
    harness.controller.state.reviewedRevisions.get(item.identity), item.revision,
    'revision-anchored receipt recorded',
  );
  assert.equal(harness.controller.state.reviewChecks.liveReviewed, true);
  doc.getElementById('review-compound').click();
  assert.equal(harness.controller.state.reviewedRevisions.has(item.identity), false);
  assert.equal(harness.controller.state.reviewChecks.liveReviewed, false);
});

test('a degraded preview keeps the separate explicit acknowledgments', async () => {
  const harness = await startHarnessWithFailedPreviewDraft(); // preview status in PREVIEW_FAILURES
  const doc = harness.window.document;
  assert.equal(doc.getElementById('review-compound'), null, 'no compound on degraded path');
  assert.ok(doc.getElementById('review-saved-revision'), 'separate draft box present');
});

test('a dirty draft renders no compound control and the hint remains', async () => {
  const harness = await startHarnessWithReadyPreviewDraft({ dirty: true });
  const doc = harness.window.document;
  assert.equal(doc.getElementById('review-compound'), null);
  assert.ok(doc.getElementById('review-saved-revision'));
});
```

Write the two harness helpers (`startHarnessWithReadyPreviewDraft`, `startHarnessWithFailedPreviewDraft`) beside the file's existing fixture builders, reusing its draft-question fixture and preview-status stubbing — read how the existing preview-ready tests in this file force `state.preview.status` and copy that mechanism exactly.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/faculty-console-contract.test.mjs`
Expected: the four new tests FAIL (`review-compound` null), everything else green.

- [ ] **Step 3: Implement** in `faculty-console/app.mjs`:

```js
function compoundReviewEligible(item) {
  if (item?.type !== 'question') return false;
  if ((state.preview?.status || 'frame_failure') !== 'ready') return false;
  const question = state.editor || item.record;
  const saved = findQuestion(item.identity);
  return state.viewMode === 'draft'
    && state.dirtyFields.length === 0
    && saved?.revision === question?.revision
    && item.revision === saved?.revision;
}

function confirmCompoundReview(question, checked) {
  confirmDraftReview(question, checked);
  const receipted = reviewedRevisionMatches(
    findQuestion(question?.id),
    state.reviewedRevisions.get(question?.id),
  );
  state.reviewChecks.liveReviewed = checked === true && receipted;
  refreshPreviewChromeAndRail('review-compound');
}
```

In `renderDraftReviewControl(item)`: when `compoundReviewEligible(item)`, return the compound control instead of the pair:

```js
if (compoundReviewEligible(item)) {
  const question = state.editor || item.record;
  const checked = reviewedRevisionMatches(item, state.reviewedRevisions.get(item.identity))
    && state.reviewChecks.liveReviewed === true;
  return el('div', { class: 'draft-review-control' }, [
    el('label', { class: 'checkbox-line', for: 'review-compound' }, [
      el('input', {
        id: 'review-compound',
        type: 'checkbox',
        checked,
        disabled: state.pending,
        'aria-keyshortcuts': 'r',
        onChange: event => confirmCompoundReview(question, event.target.checked),
      }),
      'I reviewed this draft at its saved revision and its live rendering',
    ]),
  ]);
}
```

In `renderDeploymentReviewPath(item)`: at the top, `if (compoundReviewEligible(item)) return null;` so the ready-path checkbox never double-renders for questions (content items are unaffected — `compoundReviewEligible` is question-only).

`reviewPathComplete` (~:1224) needs no change: the compound path sets exactly the two slices it already checks.

- [ ] **Step 4: Run the focused suite**

Run: `node --test tests/faculty-console-contract.test.mjs`
Expected: PASS, including all pre-existing tests. If a pre-existing test drove the two separate checkboxes on a clean ready draft, update it to drive `#review-compound` — the scenario it covered now legitimately renders the compound control; do not weaken assertions, re-target them.

- [ ] **Step 5: Run the full root suite**

Run: `node --test tests/*.test.mjs`
Expected: 679+ pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add faculty-console/app.mjs tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): compound receipt for clean ready-preview drafts"
```

---

### Task 2: Batch auto-enroll with sticky exclusion

**Files:**
- Modify: `faculty-console/app.mjs` (`confirmCompoundReview`/`confirmDraftReview` ~:1212, `toggleBatchMember` ~:3261, `renderBatchTray` ~:3267, state init ~:151)
- Test: `tests/faculty-batch-selection.test.mjs`

**Interfaces:**
- Consumes: Task 1's `confirmCompoundReview`; existing `state.batchSelection` (Set), `batchCandidateSurvey()`, `assessBatch()`.
- Produces: `state.batchExclusions` (Set of ids the reviewer explicitly unchecked); enrollment rule: an id is selected iff it holds a current receipt AND is not excluded; `toggleBatchMember(id, false)` adds to exclusions, `toggleBatchMember(id, true)` removes from exclusions and adds to selection. Task 3 does not depend on this; Task 4's smoke flow asserts the tray fills itself.

- [ ] **Step 1: Write the failing tests** — append to `tests/faculty-batch-selection.test.mjs` following its existing extract-and-execute or harness idiom (read the file first; it pins `deriveBatchEligibility`/tray behavior — add flow-level tests via the contract harness only if that is the file's style, otherwise put DOM-flow tests in `tests/faculty-console-contract.test.mjs` and keep pure-logic tests here):

```js
test('earning a receipt auto-enrolls the item in the batch selection', async () => {
  const harness = await startHarnessWithReadyPreviewDraft();
  const doc = harness.window.document;
  doc.getElementById('review-compound').click();
  const item = harness.controller.state.reviewItems.find(i => i.type === 'question');
  assert.equal(harness.controller.state.batchSelection.has(item.identity), true);
});

test('an explicit uncheck is a sticky exclusion that survives re-render', async () => {
  const harness = await startHarnessWithReadyPreviewDraft();
  const doc = harness.window.document;
  doc.getElementById('review-compound').click();
  const item = harness.controller.state.reviewItems.find(i => i.type === 'question');
  const trayBox = doc.getElementById(`batch-select-${item.identity}`);
  trayBox.click(); // exclude
  assert.equal(harness.controller.state.batchSelection.has(item.identity), false);
  assert.equal(harness.controller.state.batchExclusions.has(item.identity), true);
  harness.controller.state.reviewChecks.liveReviewed = true; // simulate unrelated re-render trigger
  // re-render happens via the app's own refresh; assert exclusion still holds
  assert.equal(harness.controller.state.batchSelection.has(item.identity), false);
});

test('losing and re-earning a receipt clears the exclusion and re-enrolls', async () => {
  const harness = await startHarnessWithReadyPreviewDraft();
  const doc = harness.window.document;
  doc.getElementById('review-compound').click();
  const item = harness.controller.state.reviewItems.find(i => i.type === 'question');
  doc.getElementById(`batch-select-${item.identity}`).click(); // exclude
  doc.getElementById('review-compound').click();               // uncheck receipt (loses it)
  assert.equal(harness.controller.state.batchExclusions.has(item.identity), false,
    'receipt loss clears the exclusion');
  doc.getElementById('review-compound').click();               // re-earn
  assert.equal(harness.controller.state.batchSelection.has(item.identity), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/faculty-batch-selection.test.mjs tests/faculty-console-contract.test.mjs`
Expected: new tests FAIL (`batchExclusions` undefined / not enrolled).

- [ ] **Step 3: Implement** in `faculty-console/app.mjs`:

State init (beside `batchSelection`): `batchExclusions: new Set(),`

Enrollment hook — at the end of `confirmDraftReview(question, checked)` (which the compound path calls first):

```js
const id = question?.id;
if (id) {
  if (state.reviewedRevisions.has(id)) {
    if (!state.batchExclusions.has(id)) state.batchSelection.add(id);
  } else {
    state.batchSelection.delete(id);
    state.batchExclusions.delete(id); // receipt loss clears the exclusion
  }
}
```

`toggleBatchMember(id, checked, focusId)` — record intent:

```js
if (checked) { state.batchExclusions.delete(id); state.batchSelection.add(id); }
else { state.batchSelection.delete(id); state.batchExclusions.add(id); }
```

(adapt to the function's existing body — it already mutates `batchSelection`; add the exclusion bookkeeping beside it). `renderBatchTray`'s existing pruning of ineligible ids stays; add the same pruning for `batchExclusions` against `eligibleIds` ∪ receipt-holders so stale exclusions do not accumulate.

- [ ] **Step 4: Run focused suites**

Run: `node --test tests/faculty-batch-selection.test.mjs tests/faculty-console-contract.test.mjs`
Expected: PASS. The pre-existing "Selected N" tray tests may now see auto-filled selections — re-target their setup (explicitly exclude, or assert the new default) without weakening what they prove.

- [ ] **Step 5: Full root suite**

Run: `node --test tests/*.test.mjs`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add faculty-console/app.mjs tests/faculty-batch-selection.test.mjs tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): auto-enroll receipted drafts with sticky exclusions"
```

---

### Task 3: Auto-advance (qbank receipts and content attests)

**Files:**
- Modify: `faculty-console/app.mjs` (`confirmCompoundReview` from Task 1; the attest-success selection logic around `chooseSelection()` ~:539 and `completedHoldKey` ~:713; `visibleReviewItems()` ~:405; `setSelectedReviewKey` ~:467)
- Test: `tests/faculty-console-contract.test.mjs`

**Interfaces:**
- Consumes: `visibleReviewItems()`, `setSelectedReviewKey(key)`, `state.navigationGuard`, `announce(message)`, Task 1's `confirmCompoundReview`.
- Produces: `advanceToNextUnreceipted(fromKey)` → selects the next `type === 'question'` item in `visibleReviewItems()` order after `fromKey` lacking a current receipt; returns boolean advanced. `advanceToNextPendingContent(fromKey)` → same for content items whose `savedStatus` is pending. Task 4's `R` handler and smoke flow rely on both.

- [ ] **Step 1: Write the failing tests** (contract harness, multi-item fixtures — the file already builds multi-question servers for navigation tests; reuse that builder):

```js
test('checking the compound receipt advances to the next unreceipted draft', async () => {
  const harness = await startHarnessWithTwoReadyDrafts(); // q1 selected, q2 unreceipted
  const doc = harness.window.document;
  doc.getElementById('review-compound').click();
  assert.equal(harness.controller.state.selectedKey, keyForQuestion2(harness),
    'selection moved to the next unreceipted draft');
});

test('the last receipt announces completion and stays put', async () => {
  const harness = await startHarnessWithTwoReadyDrafts();
  const doc = harness.window.document;
  doc.getElementById('review-compound').click(); // q1 → advance to q2
  doc.getElementById('review-compound').click(); // q2 = last
  assert.equal(harness.controller.state.selectedKey, keyForQuestion2(harness), 'stays on last');
  assert.match(lastAnnouncement(harness), /all drafts .* hold receipts/i);
});

test('auto-advance never fires while a navigation guard is active', async () => {
  const harness = await startHarnessWithTwoReadyDrafts();
  harness.controller.state.navigationGuard = { kind: 'unsaved' }; // match the real guard shape from the file
  const before = harness.controller.state.selectedKey;
  // receipt via state path (guard blocks UI nav, not the checkbox)
  harness.window.document.getElementById('review-compound')?.click();
  assert.equal(harness.controller.state.selectedKey, before);
});

test('a successful content attest advances to the next pending content item', async () => {
  const harness = await startHarnessWithTwoPendingContentItems();
  const doc = harness.window.document;
  doc.getElementById('attest-current-item').click();
  await settle(harness); // the file's idiom for awaiting the mocked round-trip
  assert.equal(harness.controller.state.selectedKey, keyForContent2(harness));
});

test('the last content attest keeps the completed-hold receipt view', async () => {
  const harness = await startHarnessWithOnePendingContentItem();
  const doc = harness.window.document;
  doc.getElementById('attest-current-item').click();
  await settle(harness);
  assert.equal(harness.controller.state.completedHoldKey, keyForContent1(harness),
    'no further pending items: existing hold-to-show-receipt behavior kept');
});
```

Adapt helper names to the file's real fixture builders; `lastAnnouncement` reads the announcer node's textContent.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/faculty-console-contract.test.mjs`
Expected: new tests FAIL (selection does not move).

- [ ] **Step 3: Implement** in `faculty-console/app.mjs`:

```js
function advanceToNextUnreceipted(fromKey) {
  if (state.navigationGuard) return false;
  const visible = visibleReviewItems();
  const start = visible.findIndex(item => item.key === fromKey);
  for (let i = start + 1; i < visible.length; i += 1) {
    const item = visible[i];
    if (item.type !== 'question') continue;
    if (reviewedRevisionMatches(item, state.reviewedRevisions.get(item.identity))) continue;
    return setSelectedReviewKey(item.key);
  }
  announce('All drafts in this filter hold receipts.');
  return false;
}
```

Call it at the end of `confirmCompoundReview` only when `checked === true` and the receipt actually recorded. For content: in the attest-success path (where `contentHoldKey` is computed ~:713), when the attested item was content and another pending content item exists in `visibleReviewItems()`, select it instead of holding; otherwise keep the existing `completedHoldKey` behavior:

```js
function advanceToNextPendingContent(fromKey) {
  const visible = visibleReviewItems();
  const start = visible.findIndex(item => item.key === fromKey);
  for (let i = start + 1; i < visible.length; i += 1) {
    const item = visible[i];
    if (item.type === 'question') continue;
    if (item.savedStatus !== 'pending') continue;
    return item.key;
  }
  return null;
}
```

Wire: `const advanceKey = contentHoldKey ? advanceToNextPendingContent(contentHoldKey) : null;` then prefer `advanceKey` for selection (via the existing `chooseSelection`/hold mechanism: set `state.completedHoldKey = null` and select `advanceKey`) and fall back to today's hold when `advanceKey` is null. Read the exact field names on review items (`savedStatus` vs equivalent) in `review-model.mjs` before coding and match them.

- [ ] **Step 4: Run focused suite**

Run: `node --test tests/faculty-console-contract.test.mjs`
Expected: PASS, including the pre-existing hold-behavior tests (the no-further-pending case preserves them; if one drove a two-pending-content fixture through an attest expecting a hold, re-target it to the single-pending fixture — the behavior it pinned now applies only there).

- [ ] **Step 5: Full root suite**

Run: `node --test tests/*.test.mjs`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add faculty-console/app.mjs tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): auto-advance through the review sitting"
```

---

### Task 4: Keyboard flow + smoke coverage + full battery

**Files:**
- Modify: `faculty-console/app.mjs` (keydown handler ~:3363)
- Modify: `tests/smoke/faculty-console.spec.js`
- Test: `tests/faculty-console-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1's `#review-compound` (`aria-keyshortcuts="r"`), Task 3's advancement, existing `A` handler pattern (~:3380-3390), `visibleReviewItems()`, `setSelectedReviewKey`.
- Produces: `R` toggles the compound receipt; `ArrowUp`/`ArrowDown` move the review-list selection. Both follow the existing handler's target/modifier guards verbatim.

- [ ] **Step 1: Write the failing contract tests:**

```js
test('R toggles the compound receipt and advances; ignored in form fields and without the control', async () => {
  const harness = await startHarnessWithTwoReadyDrafts();
  const doc = harness.window.document;
  pressKey(harness, 'r');
  const q1 = harness.controller.state.reviewItems.find(i => i.type === 'question');
  assert.equal(harness.controller.state.reviewedRevisions.has(q1.identity), true);
  assert.equal(harness.controller.state.selectedKey, keyForQuestion2(harness), 'advanced');
  // focus a textarea → R must not fire
  focusFirstTextarea(harness);
  const before = harness.controller.state.reviewedRevisions.size;
  pressKey(harness, 'r');
  assert.equal(harness.controller.state.reviewedRevisions.size, before);
});

test('ArrowDown/ArrowUp move the review selection through the visible list', async () => {
  const harness = await startHarnessWithTwoReadyDrafts();
  pressKey(harness, 'ArrowDown');
  assert.equal(harness.controller.state.selectedKey, keyForQuestion2(harness));
  pressKey(harness, 'ArrowUp');
  assert.equal(harness.controller.state.selectedKey, keyForQuestion1(harness));
});
```

`pressKey` dispatches a `KeyboardEvent` on `window` matching the file's existing keyboard-test idiom (the `A`-shortcut tests — reuse their helper if one exists).

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/faculty-console-contract.test.mjs`
Expected: new tests FAIL.

- [ ] **Step 3: Implement** — extend the existing `keydown` listener (~:3363) after the `A` block, copying its guard structure exactly:

```js
if (event.key.toLowerCase() === 'r'
  && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
  const target = event.target;
  const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
  const box = document.getElementById('review-compound');
  if (!box || box.disabled || box.getAttribute('aria-keyshortcuts') !== 'r') return;
  event.preventDefault();
  box.click();
  return;
}

if ((event.key === 'ArrowDown' || event.key === 'ArrowUp')
  && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
  const target = event.target;
  const tag = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
  const visible = visibleReviewItems();
  const index = visible.findIndex(item => item.key === state.selectedKey);
  const next = visible[index + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  setSelectedReviewKey(next.key);
  return;
}
```

- [ ] **Step 4: Update the smoke spec** — in `tests/smoke/faculty-console.spec.js`, find the existing batch-attestation scenario and rewrite its per-item phase to the sitting flow: select first draft → check `#review-compound` → expect selection to advance → repeat → expect the tray to already list all as selected → the three confirmations → batch attest → receipts render. Add one content-flow assertion: attest a pending content item via keyboard `A` and expect the next pending content item to become selected. Keep every governance assertion the scenario already makes (receipt persistence, cohort messaging) — re-path them through the new flow rather than deleting.

- [ ] **Step 5: Run the focused suites**

```bash
node --test tests/faculty-console-contract.test.mjs tests/faculty-batch-selection.test.mjs tests/faculty-console-actions.test.mjs
node --test tests/*.test.mjs
```
Expected: all pass.

- [ ] **Step 6: Run the console smoke project against a fresh build**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke && npx playwright test --project=faculty-console
```
Expected: all pass (27+ tests).

- [ ] **Step 7: Commit**

```bash
git add faculty-console/app.mjs tests/faculty-console-contract.test.mjs tests/smoke/faculty-console.spec.js
git commit -m "feat(faculty-console): R/arrow keyboard flow for review sittings"
```

---

## Completion checklist

- 12 clean drafts: 12 compound actions (mouse or `R`) + 3 confirmations + 1 attest, keyboard-drivable end to end.
- Degraded-preview drafts still demand separate explicit acknowledgments.
- Tray fills itself; one uncheck excludes an item and sticks until its receipt is re-earned.
- Content sweep: `A` … `A` walks the pending queue.
- Attest payloads byte-identical to before (verify: the handler suite passes unchanged).
- Full battery green: root suite, all console suites, `faculty-console` smoke project, both builds.
