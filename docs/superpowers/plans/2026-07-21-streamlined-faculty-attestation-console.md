# Streamlined Faculty Attestation Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent disabled attestation control with a compact, model-driven checklist and confirmed-save auto-advance while preserving every existing faculty and repository safety gate.

**Architecture:** Add a pure `deriveAttestationChecklist(context)` function beside the existing review eligibility logic, and make `deriveAttestationEligibility()` delegate to it. Render the right rail from that shared result, route its persistent action to the first unmet focus target, and advance through the currently filtered queue only after a POST is confirmed by the existing repository reload.

**Tech Stack:** Native ES modules, dependency-free DOM rendering, Node `node:test`, synthetic DOM contract harness, Playwright faculty-console project, Netlify static frontend and Node 24 function runtime.

## Global Constraints

- Preserve all existing preview, exact-revision, warning, clinical confirmation, no-PHI, immutable snapshot, conflict, authentication, and repository-confirmation gates.
- Keep every faculty assertion separate and explicit; do not add batch or mark-all controls.
- Auto-advance only after the refreshed repository state confirms the requested status and exact question revision.
- Do not change server API payloads, authentication, Netlify environment variables, learner preview protocol, iframe sandbox, or repository schemas.
- Keep credentials, reviewer identity, confirmations, and local edit state out of learner URLs, messages, and storage.
- Maintain visible keyboard focus, text alternatives for progress, reduced-motion behavior, and narrow-screen usability.
- Use `/usr/local/bin/node` for local Node 22 verification when Node 25 conflicts with Playwright.
- Do not regenerate Playwright visual baselines on macOS.

---

### Task 1: Pure attestation checklist contract

**Files:**
- Modify: `faculty-console/review-model.mjs:150-210`
- Modify: `tests/faculty-review-model.test.mjs:1-540`

**Interfaces:**
- Consumes: the existing eligibility context accepted by `deriveAttestationEligibility(context)`.
- Produces: `deriveAttestationChecklist(context) -> { requirements, completedCount, totalCount, firstUnmet, eligible, blockers }`.
- Preserves: `deriveAttestationEligibility(context) -> { eligible, blockers }` with byte-for-byte compatible results for existing cases.

- [ ] **Step 1: Add failing checklist-model tests**

Import `deriveAttestationChecklist` and add focused tests using the existing `contentContext()` and `questionContext()` fixtures:

```js
test('derives an ordered Ready content checklist and first unmet focus target', () => {
  const page = normalizeReviewItems(server)[0];
  const checklist = deriveAttestationChecklist(contentContext(page, {
    completeItemReviewed: false,
    contentChecks: { accuracy: true, interactions: true },
  }));
  assert.deepEqual(checklist.requirements.map(({ id, complete, focusId }) => ({
    id, complete, focusId,
  })), [
    { id: 'preview.ready', complete: true, focusId: 'preview-status' },
    { id: 'review.complete_item', complete: false, focusId: 'review-complete-item' },
    { id: 'content.accuracy', complete: true, focusId: 'review-content-accuracy' },
    { id: 'content.interactions', complete: true, focusId: 'review-content-interactions' },
  ]);
  assert.equal(checklist.completedCount, 3);
  assert.equal(checklist.totalCount, 4);
  assert.equal(checklist.firstUnmet.id, 'review.complete_item');
  assert.equal(checklist.eligible, false);
  assert.deepEqual(checklist.blockers, ['review.complete_item_required']);
});

test('checklist eligibility remains identical to the legacy eligibility result', () => {
  const items = normalizeReviewItems(fullServerFixture);
  const contexts = [
    contentContext(items[0]),
    contentContext(items[0], { previewStatus: 'loading' }),
    questionContext(items.find(item => item.identity === 'qb_moo_902')),
    questionContext(items.find(item => item.identity === 'qb_moo_903'), {
      assessment: WARNING_ASSESSMENT,
      warningAcks: new Set(),
    }),
  ];
  for (const context of contexts) {
    const checklist = deriveAttestationChecklist(context);
    assert.deepEqual(deriveAttestationEligibility(context), {
      eligible: checklist.eligible,
      blockers: checklist.blockers,
    });
  }
});
```

Add explicit cases for terminal page/tool fallback; dirty, blocked, Ready, Warning, and preview-unavailable questions; current warning focus IDs; exact saved-revision focus; and literal-boolean confirmations.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
/usr/local/bin/node --test tests/faculty-review-model.test.mjs
```

Expected: FAIL because `deriveAttestationChecklist` is not exported.

- [ ] **Step 3: Extract the existing blocker calculation unchanged**

Rename the body of the current exported function to a private helper, without changing its
branch or blocker order:

```js
function deriveAttestationBlockers(context = {}) {
  const blockers = [];
  const item = context.item;
  if (!item) return ['selection.missing'];
  if (context.dirty) blockers.push('question.unsaved_changes');
  if (!['loading', 'ready', 'not_found', 'error', 'protocol_unavailable', 'frame_failure']
    .includes(context.previewStatus)) blockers.push('preview.invalid_state');
  const failedPreview = PREVIEW_FAILURES.has(context.previewStatus);
  if (context.previewStatus === 'loading') blockers.push('preview.loading');
  if (item.type === 'question') {
    const assessment = context.assessment;
    const assessmentIsValid = validAssessment(assessment);
    if (item.savedStatus !== 'draft') blockers.push('question.not_draft');
    if (!assessmentIsValid) blockers.push('checks.runtime_failure');
    if (!assessmentIsValid || !['ready', 'warning'].includes(assessment.gate)) {
      blockers.push('question.gate_not_attestable');
    }
    if (context.previewStatus === 'ready' && context.liveReviewed !== true) {
      blockers.push('review.live_required');
    }
    if (['error', 'protocol_unavailable', 'frame_failure'].includes(context.previewStatus)
        && context.retryAttempted !== true) blockers.push('preview.retry_required');
    if (failedPreview && context.liveUnavailableAcknowledged !== true) {
      blockers.push('review.live_unavailable_ack_required');
    }
    if (!reviewedRevisionMatches(item, context.reviewedRevision)) {
      blockers.push('review.saved_revision_required');
    }
    if (assessmentIsValid && assessment.gate === 'blocked') blockers.push('question.blocked');
    const warningCodes = assessmentIsValid
      ? assessment.warnings.map(issue => clean(issue.code)) : [];
    if (assessmentIsValid && assessment.gate === 'warning'
        && warningCodes.some(code => !context.warningAcks?.has?.(code))) {
      blockers.push('question.warning_ack_required');
    }
    if (context.confirmations?.clinical !== true || context.confirmations?.evidence !== true
        || context.confirmations?.originalityAndNoPhi !== true) {
      blockers.push('question.confirmations_required');
    }
  } else {
    if (item.savedStatus !== 'unreviewed') blockers.push('content.status_not_attestable');
    if (context.previewStatus === 'ready' && context.completeItemReviewed !== true) {
      blockers.push('review.complete_item_required');
    }
    if (failedPreview && context.separateTabReviewed !== true) {
      blockers.push('review.separate_tab_required');
    }
    if (context.contentChecks?.accuracy !== true
        || context.contentChecks?.interactions !== true) {
      blockers.push('content.resolve_checks_required');
    }
  }
  return blockers;
}
```

- [ ] **Step 4: Implement requirement construction and compatibility delegation**

Add a pure constructor and checklist derivation. Use stable strings and focus IDs already rendered by the console:

```js
function requirement({
  id, group, label, complete, status = 'actionable', blockerCode = '', focusId,
}) {
  const isComplete = complete === true;
  return Object.freeze({
    id,
    group,
    label,
    complete: isComplete,
    status: isComplete ? 'complete' : status,
    blockerCode,
    focusId,
  });
}

export function deriveAttestationChecklist(context = {}) {
  const requirements = [];
  const blockers = deriveAttestationBlockers(context);
  const add = definition => requirements.push(requirement(definition));
  const item = context.item;
  if (!item) {
    add({
      id: 'selection.present', group: 'Learner review', label: 'Select one review item',
      complete: false, status: 'blocked', blockerCode: 'selection.missing',
      focusId: 'review-item-selector',
    });
  } else if (item.type === 'question') {
    addQuestionRequirements(add, context, blockers);
  } else {
    addContentRequirements(add, context, blockers);
  }
  const completedCount = requirements.filter(item => item.complete).length;
  const firstUnmet = requirements.find(item => !item.complete) || null;
  return Object.freeze({
    requirements: Object.freeze(requirements),
    completedCount,
    totalCount: requirements.length,
    firstUnmet,
    eligible: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
}

export function deriveAttestationEligibility(context = {}) {
  const { eligible, blockers } = deriveAttestationChecklist(context);
  return { eligible, blockers: [...blockers] };
}
```

Implement `addContentRequirements()` with this exact ordered map:

| ID | Complete when | Status if incomplete | Blocker code | Focus ID |
|---|---|---|---|---|
| `content.status` | `savedStatus === "unreviewed"` | blocked | `content.status_not_attestable` | `selected-item-status` |
| `preview.ready` | preview is Ready or an allowed terminal fallback | blocked/unavailable | current preview blocker | `preview-status` |
| `review.complete_item` | Ready and `completeItemReviewed === true` | actionable | `review.complete_item_required` | `review-complete-item` |
| `review.separate_tab` | terminal fallback and `separateTabReviewed === true` | actionable | `review.separate_tab_required` | `review-separate-tab` |
| `content.accuracy` | `contentChecks.accuracy === true` | actionable | `content.resolve_checks_required` | `review-content-accuracy` |
| `content.interactions` | `contentChecks.interactions === true` | actionable | `content.resolve_checks_required` | `review-content-interactions` |

Render only the Ready-specific or fallback-specific human-review row, never both.

Implement `addQuestionRequirements()` with this exact ordered map:

| ID | Complete when | Status if incomplete | Blocker code | Focus ID |
|---|---|---|---|---|
| `question.saved` | no dirty edits and saved status is Draft | blocked | dirty/not-draft blocker | `save-draft` or `selected-item-status` |
| `preview.available` | valid non-loading state and required Retry completed | blocked/unavailable | preview blocker | `preview-status` |
| `review.live` | Ready and `liveReviewed === true` | actionable | `review.live_required` | `review-live-preview` |
| `review.live_unavailable` | fallback and `liveUnavailableAcknowledged === true` | actionable | `review.live_unavailable_ack_required` | `ack-live-unavailable` |
| `review.saved_revision` | `reviewedRevisionMatches()` | actionable | `review.saved_revision_required` | `review-saved-revision` |
| `question.gate` | valid Ready or Warning assessment | blocked | runtime/gate/blocked blocker | `edit-question-from-rail` |
| `warning.<code>` | current warning code is acknowledged | actionable | `question.warning_ack_required` | `ack-<code>` |
| `confirmation.clinical` | literal `true` | actionable | `question.confirmations_required` | `confirm-clinical` |
| `confirmation.evidence` | literal `true` | actionable | `question.confirmations_required` | `confirm-evidence` |
| `confirmation.originality` | literal `true` | actionable | `question.confirmations_required` | `confirm-originality` |

Render only the Ready live-review row or the fallback acknowledgement row. Add one warning
requirement per current warning in assessment order. `deriveAttestationEligibility()` must
return a new mutable blockers array so its public result remains compatible with existing
deep-equality tests.

- [ ] **Step 5: Run model and full focused baseline tests**

Run:

```bash
/usr/local/bin/node --test tests/faculty-review-model.test.mjs
/usr/local/bin/node --test tests/faculty-review-model.test.mjs tests/faculty-console-contract.test.mjs tests/faculty-console-handler.test.mjs
```

Expected: all tests PASS, including the 199-test baseline and the new checklist cases.

- [ ] **Step 6: Commit the model contract**

```bash
git add faculty-console/review-model.mjs tests/faculty-review-model.test.mjs
git commit -m "feat(faculty-console): derive attestation checklist"
```

---

### Task 2: Compact checklist and guidance action

**Files:**
- Modify: `faculty-console/app.mjs:1-20, 1189-1494, 1740-1800, 2516-2570`
- Modify: `faculty-console/index.html:430-510, 760-860`
- Modify: `tests/faculty-console-contract.test.mjs:500-720, 900-950, 2610-2665`

**Interfaces:**
- Consumes: `deriveAttestationChecklist(context)` from Task 1.
- Produces: `currentAttestationChecklist(item, assessment, dirty)`, grouped checklist DOM, `guideOrAttestCurrentItem(item, checklist)`.
- Stable DOM: `#attestation-checklist`, `#attestation-progress`, `#attestation-primary-action`, and existing checkbox/fallback focus IDs.

- [ ] **Step 1: Replace old rail assertions with failing compact-checklist assertions**

Add contract coverage for the live failure that triggered this redesign:

```js
test('compact checklist exposes the first unmet requirement and keeps its action usable', async () => {
  const harness = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [{ slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' }],
      questions: [],
    })),
  });
  const { document } = harness;
  await makeCurrentContentPreviewReady(harness);
  await setChecked(document, 'review-content-accuracy');
  await setChecked(document, 'review-content-interactions');

  assert.match(document.getElementById('attestation-progress').textContent, /3 of 4/);
  const action = document.getElementById('attestation-primary-action');
  assert.equal(action.disabled, false);
  assert.equal(action.textContent, 'Review 1 remaining requirement');
  await action.dispatch('click');
  assert.equal(document.activeElement?.getAttribute('id'), 'review-complete-item');
  assert.match(document.getElementById('requirement-review-complete_item').className, /current/);
});
```

Add tests that all separate content and question controls remain present; guidance does not POST; an eligible checklist changes the action to **Attest & continue**; and checklist-only updates preserve the iframe and its `contentWindow`.

- [ ] **Step 2: Run the interface contract test and verify failure**

Run:

```bash
/usr/local/bin/node --test tests/faculty-console-contract.test.mjs
```

Expected: FAIL because the compact checklist IDs and guidance behavior do not exist.

- [ ] **Step 3: Import the checklist model and centralize context creation**

Update imports and replace `currentAttestationEligibility` with:

```js
function currentAttestationChecklist(item, assessment, dirty) {
  return deriveAttestationChecklist({
    item,
    assessment,
    dirty,
    previewStatus: state.preview?.status,
    retryAttempted: (state.preview?.attempt || 0) > 1,
    completeItemReviewed: state.reviewChecks.completeItemReviewed,
    liveReviewed: state.reviewChecks.liveReviewed,
    separateTabReviewed: state.externalReviewOpenedKey === item.key
      && state.reviewChecks.separateTabReviewed,
    liveUnavailableAcknowledged: state.reviewChecks.liveUnavailableAcknowledged,
    reviewedRevision: state.reviewedRevisions.get(item.identity),
    warningAcks: state.warningAcks,
    confirmations: state.confirmations,
    contentChecks: {
      accuracy: state.reviewChecks.accuracy,
      interactions: state.reviewChecks.interactions,
    },
  });
}
```

All button-time and render-time eligibility checks must call this helper or the same pure function with the same context fields.

- [ ] **Step 4: Render one semantic checklist**

Replace the three `.rail-step` sections with:

```js
el('header', { class: 'rail-heading' }, [
  el('p', { class: 'eyebrow' }, ['Single-item sign-off']),
  el('h2', { id: 'attestation-rail-title' }, ['Review checklist']),
  el('p', { id: 'attestation-progress', class: 'attestation-progress' }, [
    `${checklist.completedCount} of ${checklist.totalCount} required checks complete`,
  ]),
]),
renderActionFeedback(),
el('div', { id: 'attestation-checklist', class: 'attestation-checklist' }, [
  renderLearnerReviewGroup(item, checklist),
  question
    ? renderQuestionResolutionGroup(item, assessment, blocked, checklist)
    : renderContentValidationGroup(item, checklist),
  renderFacultyConfirmationGroup(item, blocked, checklist),
]),
renderAttestationPrimaryAction(item, checklist),
```

Keep the existing checkbox rendering functions so labels and state transitions remain unchanged. Wrap the relevant control in a requirement row whose stable ID is `requirement-${domToken(requirement.id)}` and whose state class is `complete`, `current`, `blocked`, or `unavailable`.

- [ ] **Step 5: Implement the always-actionable primary control**

```js
function focusRequirement(requirement) {
  const target = document.getElementById(requirement?.focusId);
  if (!target) {
    announce('The required review action is unavailable. Reload this item before attesting.');
    document.getElementById('preview-status')?.focus();
    return false;
  }
  target.focus();
  const row = document.getElementById(`requirement-${domToken(requirement.id)}`);
  row?.classList.add('guided');
  announce(`${requirement.label}. Complete this requirement before attesting.`);
  return true;
}

function primaryActionCopy(checklist) {
  if (state.pending) return 'Saving and confirming...';
  if (checklist.eligible) return 'Attest & continue';
  const remaining = checklist.totalCount - checklist.completedCount;
  return `${remaining === 1 ? 'Review' : 'Resolve'} ${remaining} remaining requirement${remaining === 1 ? '' : 's'}`;
}
```

The click handler recomputes the checklist. If ineligible, it calls `focusRequirement(firstUnmet)` and returns without network access. If eligible, it calls the existing content or question attestation path. Do not set `disabled` merely because eligibility is false; disable only while pending or for an already-complete content item whose primary action is replaced by More actions.

- [ ] **Step 6: Replace step-card CSS with the compact review margin**

Add focused classes for `.attestation-checklist`, `.attestation-group`, `.requirement-row`, `.attestation-progress`, and `.attestation-primary`. Use the existing color tokens. The current row gets the primary left border and soft background; completed rows use a check symbol plus text and lower contrast. Make the action sticky inside the rail with `inset-block-end: 0`, and remove stickiness below 900px if it would cover content. Under reduced motion, use immediate focus without smooth scrolling or animation.

- [ ] **Step 7: Run contract and focused tests**

```bash
/usr/local/bin/node --test tests/faculty-review-model.test.mjs tests/faculty-console-contract.test.mjs tests/faculty-console-handler.test.mjs
```

Expected: all PASS; no server-handler contract changes.

- [ ] **Step 8: Commit the compact checklist**

```bash
git add faculty-console/app.mjs faculty-console/index.html tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): guide compact attestation checklist"
```

---

### Task 3: Confirmed receipt and automatic next-item selection

**Files:**
- Modify: `faculty-console/app.mjs:110-160, 386-535, 605-710, 1580-1680, 2280-2335, 2741-2805, 2940-3030`
- Modify: `tests/faculty-console-contract.test.mjs:2665-3050`

**Interfaces:**
- Produces: `state.recentReceipt`, `nextEligibleReviewKey(completedKey)`, `advanceAfterConfirmedAttestation(receipt)`.
- Receipt shape: `{ key, message, commitUrl }`, created only after the existing confirming GET succeeds.

- [ ] **Step 1: Write failing confirmed-auto-advance tests**

Change the successful content expectation from a completed hold to the next eligible tool:

```js
assert.equal(controller.state.selectedKey, 'tool:mse.html');
assert.equal(controller.state.completedHoldKey, null);
assert.deepEqual(controller.state.recentReceipt, {
  key: 'page:t_mood.md',
  message: 'Attested t_mood.md.',
  commitUrl: 'https://github.example/commit/content-page',
});
assert.match(document.getElementById('recent-attestation-receipt').textContent,
  /Attested t_mood\.md/);
assert.equal(document.activeElement?.getAttribute('id'), 'attestation-rail-title');
```

Add cases for question success, wrapping to the first remaining eligible item, queue complete, active type/search filters, and preserving the current item on stale GET, POST error, 401, 409, or unsafe commit URL.

- [ ] **Step 2: Run contract tests and verify failure**

```bash
/usr/local/bin/node --test tests/faculty-console-contract.test.mjs
```

Expected: FAIL because successful actions still hold the completed item.

- [ ] **Step 3: Add recent receipt and next-eligible helpers**

```js
function nextEligibleReviewKey(completedKey) {
  if (state.queueFilters.status === 'complete') return null;
  const orderedScope = filterReviewItems(state.reviewItems, {
    ...state.queueFilters,
    status: 'all',
  });
  const eligible = orderedScope.filter(item => item.completion === 'needs-review');
  if (!eligible.length) return null;
  const completedIndex = orderedScope.findIndex(item => item.key === completedKey);
  const after = orderedScope.slice(Math.max(completedIndex + 1, 0))
    .find(item => item.completion === 'needs-review');
  return after?.key || eligible[0].key;
}

function advanceAfterConfirmedAttestation(receipt) {
  state.recentReceipt = Object.freeze({ ...receipt });
  state.completedHoldKey = null;
  const nextKey = nextEligibleReviewKey(receipt.key);
  if (!nextKey) {
    clearReviewSelection();
    renderShell('review-queue-title');
    announce(`${receipt.message} Review queue complete.`);
    return;
  }
  setSelectedReviewKey(nextKey, { force: true });
  renderShell('attestation-rail-title');
  announce(`${receipt.message} Moving to the next review item.`);
}
```

Implement the helper so it honors the active type/search/question filters and treats a
`complete`-only filter as a queue with no eligible next item rather than silently changing
the user's filter.

- [ ] **Step 4: Invoke advance only after confirmed reload**

In `commitCurrentContent()` and `attestEntries()`, remove completed-hold assignment and the
manual Next focus. After a successful confirming `load()`, create the receipt and call
`advanceAfterConfirmedAttestation()`. Preserve all early returns so failures cannot reach
the helper.

Render `state.recentReceipt` in the header or queue strip using
`#recent-attestation-receipt`; accept only the already-validated safe HTTPS commit URL.

- [ ] **Step 5: Verify success and failure paths**

```bash
/usr/local/bin/node --test tests/faculty-console-contract.test.mjs
/usr/local/bin/node --test tests/faculty-review-model.test.mjs tests/faculty-console-contract.test.mjs tests/faculty-console-handler.test.mjs
```

Expected: all PASS, including no-advance failure assertions.

- [ ] **Step 6: Commit confirmed auto-advance**

```bash
git add faculty-console/app.mjs tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): advance after confirmed attestation"
```

---

### Task 4: Browser workflow, runbook, and repository gates

**Files:**
- Modify: `tests/smoke/faculty-console.spec.js:1190-1450, 1730-1865`
- Modify: `faculty-console/README.md:30-82`

**Interfaces:**
- Verifies: real browser focus, labels, sticky layout, confirmed auto-advance, queue completion, and failure retention.
- Documents: the compact checklist, guidance action, **Attest & continue**, receipt, and confirmed advance.

- [ ] **Step 1: Update browser tests to the approved workflow**

Replace assertions that successful attestation stays on the completed item. For page/tool
and question workflows, assert:

```js
await expect(page.locator('#attestation-rail-title')).toHaveText('Review checklist');
await expect(page.locator('#attestation-progress')).toContainText('required checks complete');
await expect(page.locator('#attestation-primary-action')).toBeEnabled();
await page.locator('#attestation-primary-action').click();
await expect(page.locator('#review-complete-item')).toBeFocused();

// After all checks and a confirmed POST + GET:
await page.locator('#attestation-primary-action').click();
await expect(page.locator('#recent-attestation-receipt')).toContainText('Attested');
await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mental status exam tool');
```

Retain assertions that exactly one item is posted and every API call keeps the faculty key in
the header. Add no-advance assertions to the existing stale-confirmation and error cases.

- [ ] **Step 2: Run the focused browser project**

Use the repository runbook to build and serve the MS3 learner site and faculty console, then:

```bash
cd tests/smoke
/usr/local/bin/npm ci
/usr/local/bin/npx playwright test --project=faculty-console
```

Expected: all faculty-console browser tests PASS. If dependencies are already present and
`npm ci` is unnecessary, record the actual installed state and still report the exact Node
runtime used.

- [ ] **Step 3: Update the faculty runbook**

Document these exact behaviors:

- all required faculty assertions remain separate in one compact checklist;
- the primary control points to the first incomplete requirement;
- it changes to **Attest & continue** only after every requirement is complete;
- automatic advance waits for the repository-confirming reload;
- failures retain the current item and recoverable checks;
- the recent receipt retains the commit link after advance;
- queue complete is explicit when no eligible items remain.

- [ ] **Step 4: Run focused and repository-wide gates**

```bash
/usr/local/bin/node --test tests/faculty-review-model.test.mjs tests/faculty-console-contract.test.mjs tests/faculty-console-handler.test.mjs
/usr/local/bin/node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: all focused and root Node tests PASS; MS3 and resident builds finish with static QA
passing. Report any unrelated LFS or baseline issue separately.

- [ ] **Step 5: Review the final diff and commit**

```bash
git diff --check
git status --short
git add tests/smoke/faculty-console.spec.js faculty-console/README.md
git commit -m "test(faculty-console): verify streamlined attestation flow"
```

- [ ] **Step 6: Final branch verification**

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: clean `codex/faculty-attestation-streamline` worktree with the design, model,
interface, auto-advance, browser-test, and runbook commits present.
