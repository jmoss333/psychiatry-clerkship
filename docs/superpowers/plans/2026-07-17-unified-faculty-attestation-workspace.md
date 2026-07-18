# Unified Faculty Attestation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the faculty console's separate content and question workflows with one calm, one-item-at-a-time review workspace that embeds the real learner deployment and preserves exact-revision question safety.

**Architecture:** Add a small pure review model that normalizes pages, tools, and questions and owns safe preview URLs and UI eligibility. Keep the existing console as the authenticated workflow coordinator, but reorganize it around one queue, one preview surface, and one Review -> Resolve -> Confirm rail. The learner SPA reports typed readiness only after the requested inner page, tool, or exact question succeeds; the server remains authoritative for writes and requires an exact saved-revision review receipt for every question.

**Tech Stack:** Vanilla HTML/CSS/ES modules, dependency-free learner HTML/JavaScript, Netlify Functions v2 on Node 24, Node `node:test`, Playwright 1.46.1, existing MS3/resident static-site build pipeline.

## Global Constraints

- Work only in the isolated `codex/faculty-qbank-workbench` worktree and preserve unrelated branches, worktrees, and user changes.
- Do not change curriculum prose, question content, `reviewed.json`, question statuses, or production credentials while implementing or testing.
- Use one shared queue and one selected item; remove the top-level Content/Question tabs, Mark-all UI, batch checkboxes, batch confirmation UI, and batch attestation UI.
- Keep the server's array-shaped qbank request and batch validation for backward compatibility; the redesigned browser submits exactly one item per mutation.
- Preserve question editing, structural assessment, warning acknowledgement, clinical/evidence/originality confirmations, revision conflicts, safe reloads, reauthentication snapshots, and unsaved-change protection.
- Treat Ready as a structural result only. Never describe a preview, automated check, or review receipt as proof of clinical correctness, evidence support, originality, reviewer identity, or deployed/saved parity.
- Require every question, Ready or Warning, to carry `reviewedRevision === revision` after explicit review of the exact saved Draft preview.
- Build preview routes only from the authenticated server's configured student base URL. Never send the faculty key, GitHub token, reviewer label, edits, confirmations, or commit data to the learner deployment.
- Generate a fresh 128-bit correlation token for each preview load with `crypto.getRandomValues`; the token is correlation data, not authorization.
- Accept preview messages only from the configured student origin, current outer iframe, current stable key/token, and expected surface. Ignore late, malformed, wrong-route, wrong-source, wrong-origin, and spoofed messages.
- Use iframe sandbox `allow-scripts allow-same-origin allow-forms`, `referrerpolicy="no-referrer"`, and a specific accessible title. Do not add popup, download, or top-navigation permissions.
- In exact-question review mode, leave `cw_qb_v1`, `cw_srs_v1`, and `cw_qb_focus` byte-for-byte unchanged. Preserve the existing `cw_theme` behavior.
- Keep repository strings on safe DOM text paths; do not add `innerHTML` to the faculty console.
- Do not add a framework or runtime dependency, deploy, push, merge, or regenerate visual baselines.
- Report focused success separately from unrelated baseline, environment, or Git LFS failures.

## File Map

- Create `faculty-console/review-model.mjs`: normalized review items, stable keys, filtering/counts, correlation tokens, preview URL/message validation, and pure UI eligibility.
- Modify `faculty-console/app.mjs`: unified state, queue, preview controller, question views, shared sign-off rail, individual mutations, and existing safety workflows.
- Modify `faculty-console/index.html`: unified clinical-chart workspace, dominant preview, narrow sign-off rail, and preview-first responsive layout.
- Modify `faculty-console/netlify/functions/qbank-actions.mjs`: require exact reviewed revisions for Warning as well as Ready questions.
- Modify `13_Faculty_Resources/_automation/site_build/question-bank-practice.html`: exact `reviewItem` mode, no-progress interaction, and inner status message.
- Modify `13_Faculty_Resources/_automation/site_build/spa_index.html`: page/tool readiness, exact-question message validation, and sanitized outer relay.
- Create `tests/faculty-review-model.test.mjs`: pure review-model coverage.
- Create `tests/question-bank-review-mode.test.mjs`: focused static contracts for the exact-question path and storage choke point.
- Modify `tests/faculty-console-actions.test.mjs`: Warning-question review-receipt rule.
- Modify `tests/faculty-console-handler.test.mjs`: HTTP-boundary review-receipt regression and retained batch compatibility.
- Modify `tests/faculty-console-contract.test.mjs`: unified DOM/state/accessibility/security contracts while preserving editor and conflict regressions.
- Modify `tests/smoke/faculty-console.spec.js`: real local learner frames, typed protocol, failure/fallback paths, exact question review, individual mutations, keyboard, and mobile behavior.
- Modify `tests/smoke/README.md`: current smoke-test scope and local server requirements.
- Modify `faculty-console/README.md`: unified faculty runbook, security model, preview limitations, and fallback behavior.
- Modify `.github/workflows/ci.yml`: rename the faculty smoke step to describe the unified workspace; no new job or secret.

## Browser Test Prerequisite

Browser steps in Tasks 3, 4, 9, and 10 assume the current MS3 build and faculty console are served from the worktree. Start these in separate terminals from the repository root:

```bash
python3 -m http.server 4200 --directory _build/ms3
python3 -m http.server 4202 --directory faculty-console
```

Before each Playwright command, fail closed unless both surfaces respond:

```bash
curl -sf http://localhost:4200/ >/dev/null
curl -sf http://localhost:4202/ >/dev/null
```

Rebuild before the relevant browser run, restart a server only if its process does not serve the rebuilt files, and stop locally started server processes when the task ends. CI already starts ports 4200, 4201, and 4202 and performs its own health loop.

---

### Task 1: Establish the pure shared review model

**Files:**
- Create: `tests/faculty-review-model.test.mjs`
- Create: `faculty-console/review-model.mjs`

**Interfaces:**
- `normalizeReviewItems(server) -> ReviewItem[]`
- `filterReviewItems(items, filters) -> ReviewItem[]`
- `deriveReviewCounts(items) -> { total, needsReview, complete, page, tool, question }`
- `createReviewToken(cryptoImpl) -> string`
- `normalizeStudentBase(studentBase) -> { href, origin }`
- `buildExternalReviewUrl({ studentBase, item }) -> string`
- `buildPreviewRequest({ studentBase, item, reviewToken }) -> PreviewRequest`
- `matchesPreviewStatus(event, request, expectedSource) -> boolean`
- `reviewedRevisionMatches(item, reviewedRevision) -> boolean`
- `deriveAttestationEligibility({ item, assessment, ...context }) -> { eligible, blockers }`

`ReviewItem` is exactly:

```js
{
  key: 'page:t_mood.md' | 'tool:mse.html' | 'question:qb_moo_902',
  type: 'page' | 'tool' | 'question',
  identity: 't_mood.md' | 'mse.html' | 'qb_moo_902',
  title: string,
  savedStatus: string,
  completion: 'needs-review' | 'complete',
  revision: string,
  gate: '' | 'ready' | 'warning' | 'blocked',
  searchText: string,
  record: object,
}
```

- [ ] **Step 1: Write failing normalization, filtering, URL, message, and eligibility tests**

Create `tests/faculty-review-model.test.mjs`. Use a fixture containing one unreviewed page, one reviewed tool, one Ready draft question, one Warning draft question, and one attested question. Assert all of the following before production code exists:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreviewRequest,
  buildExternalReviewUrl,
  createReviewToken,
  deriveAttestationEligibility,
  deriveReviewCounts,
  filterReviewItems,
  matchesPreviewStatus,
  normalizeReviewItems,
  normalizeStudentBase,
  reviewedRevisionMatches,
} from '../faculty-console/review-model.mjs';

const REVISION = 'a'.repeat(64);
const TOKEN = '0123456789abcdef0123456789abcdef';

const server = {
  items: [
    { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', status: 'unreviewed' },
    { slug: 'mse.html', title: 'Mental Status Exam', kind: 'tool', status: 'reviewed' },
  ],
  qbank: [{
    id: 'qb_moo_902', stem: 'A fictional patient has low mood.', category: 'mood',
    evidence: 't_mood.md - syndrome discriminator', pages: ['t_mood.md'],
    difficulty: 2, status: 'draft', revision: REVISION,
    assessment: { gate: 'ready', blockers: [], warnings: [] },
  }],
};

test('normalizes all review surfaces with collision-proof keys', () => {
  const items = normalizeReviewItems(server);
  assert.deepEqual(items.map(item => item.key), [
    'page:t_mood.md', 'tool:mse.html', 'question:qb_moo_902',
  ]);
  assert.deepEqual(items.map(item => item.completion), [
    'needs-review', 'complete', 'needs-review',
  ]);
  assert.deepEqual(deriveReviewCounts(items), {
    total: 3, needsReview: 2, complete: 1, page: 1, tool: 1, question: 1,
  });
});

test('shared search and filters retain question-only dimensions', () => {
  const items = normalizeReviewItems(server);
  assert.deepEqual(filterReviewItems(items, {
    search: 'syndrome', type: 'all', status: 'all',
    category: 'all', gate: 'all', difficulty: 'all',
  }).map(item => item.key), ['question:qb_moo_902']);
  assert.deepEqual(filterReviewItems(items, {
    search: '', type: 'page', status: 'needs-review',
    category: 'mood', gate: 'blocked', difficulty: '3',
  }).map(item => item.key), ['page:t_mood.md']);
});

test('builds only configured public learner routes', () => {
  assert.deepEqual(normalizeStudentBase('https://students.example/?old=1#fragment'), {
    href: 'https://students.example/', origin: 'https://students.example',
  });
  const [page, tool, question] = normalizeReviewItems(server);
  assert.equal(new URL(buildPreviewRequest({
    studentBase: 'https://students.example/', item: page, reviewToken: TOKEN,
  }).url).search, `?page=t_mood.md&reviewKey=page%3At_mood.md&reviewToken=${TOKEN}`);
  assert.equal(new URL(buildPreviewRequest({
    studentBase: 'https://students.example/', item: tool, reviewToken: TOKEN,
  }).url).search, `?tool=mse.html&reviewKey=tool%3Amse.html&reviewToken=${TOKEN}`);
  assert.equal(new URL(buildPreviewRequest({
    studentBase: 'https://students.example/', item: question, reviewToken: TOKEN,
  }).url).search, `?tool=question-bank-practice.html&reviewItem=qb_moo_902&reviewKey=question%3Aqb_moo_902&reviewToken=${TOKEN}`);
  const external = new URL(buildExternalReviewUrl({
    studentBase: 'https://students.example/', item: page,
  }));
  assert.equal(external.search, '?page=t_mood.md');
  assert.equal(external.searchParams.has('reviewKey'), false);
  assert.equal(external.searchParams.has('reviewToken'), false);
  assert.throws(() => buildExternalReviewUrl({
    studentBase: 'https://students.example/', item: question,
  }));
  for (const studentBase of ['javascript:alert(1)', 'file:///tmp/site', 'https://user:pass@students.example/']) {
    assert.throws(() => buildPreviewRequest({ studentBase, item: page, reviewToken: TOKEN }));
  }
});

test('accepts only the exact current outer-frame status message', () => {
  const item = normalizeReviewItems(server)[0];
  const request = buildPreviewRequest({
    studentBase: 'https://students.example/', item, reviewToken: TOKEN,
  });
  const source = {};
  const good = {
    origin: 'https://students.example', source,
    data: {
      type: 'faculty-preview-status', reviewKey: item.key, reviewToken: TOKEN,
      status: 'ready', surface: 'page',
    },
  };
  assert.equal(matchesPreviewStatus(good, request, source), true);
  assert.equal(matchesPreviewStatus({ ...good, origin: 'https://evil.example' }, request, source), false);
  assert.equal(matchesPreviewStatus({ ...good, source: {} }, request, source), false);
  assert.equal(matchesPreviewStatus({ ...good, data: { ...good.data, reviewToken: 'f'.repeat(32) } }, request, source), false);
  assert.equal(matchesPreviewStatus({ ...good, data: { ...good.data, extra: 'reject' } }, request, source), false);
});
```

Add table-driven eligibility cases for page/tool Ready, external fallback, question Ready, question `not_found`, first-failure Retry required, post-Retry protocol unavailable, dirty edits, stale Draft review, Blocked assessment, incomplete Warning acknowledgements, and incomplete faculty confirmations. Every question case must pass the freshly calculated `assessment` separately from the normalized item. Include a case where the item still says Ready but the fresh assessment is Blocked, plus null, malformed, internally inconsistent, and unknown-gate assessments; each must fail closed. Also cover hostile initial/unknown preview states, non-draft questions, reviewed/unknown content statuses, and truthy non-boolean confirmation values. Assert malformed server content kinds, duplicate stable keys, blank identities, unsafe bases, malformed tokens, and unknown preview surfaces fail closed.

- [ ] **Step 2: Run the new test and verify the expected red state**

Run:

```bash
node --test tests/faculty-review-model.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `faculty-console/review-model.mjs`.

- [ ] **Step 3: Implement the dependency-free review model**

Create `faculty-console/review-model.mjs` with these fixed invariants:

```js
const TYPE_ORDER = { page: 0, tool: 1, question: 2 };
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const REVISION_PATTERN = /^[0-9a-f]{64}$/;
const PREVIEW_FAILURES = new Set([
  'not_found', 'error', 'protocol_unavailable', 'frame_failure',
]);

const clean = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];

function completion(type, status) {
  return type === 'question'
    ? (status === 'attested' ? 'complete' : 'needs-review')
    : (status === 'reviewed' ? 'complete' : 'needs-review');
}

function compareItems(left, right) {
  return TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
    || left.title.localeCompare(right.title)
    || left.identity.localeCompare(right.identity);
}

export function normalizeReviewItems(server = {}) {
  const items = [];
  for (const record of list(server.items)) {
    const type = clean(record?.kind);
    const identity = clean(record?.slug);
    if (!Object.hasOwn(TYPE_ORDER, type) || !identity) throw new TypeError('Invalid content review item.');
    items.push({
      key: `${type}:${identity}`, type, identity,
      title: clean(record.title) || identity,
      savedStatus: clean(record.status), completion: completion(type, record.status),
      revision: '', gate: '',
      searchText: [record.title, identity].map(clean).join(' ').toLowerCase(),
      record,
    });
  }
  for (const record of list(server.qbank)) {
    const identity = clean(record?.id);
    if (!identity) throw new TypeError('Invalid question review item.');
    items.push({
      key: `question:${identity}`, type: 'question', identity,
      title: identity, savedStatus: clean(record.status),
      completion: completion('question', record.status),
      revision: clean(record.revision), gate: clean(record.assessment?.gate),
      searchText: [identity, record.stem, record.category, record.evidence, ...list(record.pages)]
        .map(clean).join(' ').toLowerCase(),
      record,
    });
  }
  const keys = new Set();
  for (const item of items) {
    if (keys.has(item.key)) throw new TypeError(`Duplicate review key: ${item.key}`);
    keys.add(item.key);
  }
  return items.sort(compareItems);
}

export function filterReviewItems(items, filters = {}) {
  const search = clean(filters.search).toLowerCase();
  return list(items).filter(item => {
    if (search && !item.searchText.includes(search)) return false;
    if (clean(filters.type) && filters.type !== 'all' && item.type !== filters.type) return false;
    if (clean(filters.status) && filters.status !== 'all' && item.completion !== filters.status) return false;
    if (item.type !== 'question') return true;
    if (clean(filters.category) && filters.category !== 'all' && item.record.category !== filters.category) return false;
    if (clean(filters.gate) && filters.gate !== 'all' && item.gate !== filters.gate) return false;
    return !(clean(filters.difficulty) && filters.difficulty !== 'all'
      && String(item.record.difficulty) !== String(filters.difficulty));
  });
}

export function deriveReviewCounts(items) {
  const counts = { total: 0, needsReview: 0, complete: 0, page: 0, tool: 0, question: 0 };
  for (const item of list(items)) {
    counts.total += 1; counts[item.type] += 1;
    counts[item.completion === 'complete' ? 'complete' : 'needsReview'] += 1;
  }
  return counts;
}

export function createReviewToken(cryptoImpl) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new TypeError('Secure random values are unavailable.');
  }
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeStudentBase(studentBase) {
  const url = new URL(studentBase);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Unsafe student deployment URL.');
  }
  url.search = ''; url.hash = '';
  return Object.freeze({ href: url.href, origin: url.origin });
}

export function buildPreviewRequest({ studentBase, item, reviewToken }) {
  const identity = clean(item?.identity);
  if (!item || !Object.hasOwn(TYPE_ORDER, item.type) || !identity
      || item.key !== `${item.type}:${identity}`
      || !TOKEN_PATTERN.test(clean(reviewToken))) {
    throw new TypeError('Invalid preview request.');
  }
  const base = normalizeStudentBase(studentBase);
  const url = new URL(base.href);
  if (item.type === 'page') url.searchParams.set('page', item.identity);
  if (item.type === 'tool') url.searchParams.set('tool', item.identity);
  if (item.type === 'question') {
    url.searchParams.set('tool', 'question-bank-practice.html');
    url.searchParams.set('reviewItem', item.identity);
  }
  url.searchParams.set('reviewKey', item.key);
  url.searchParams.set('reviewToken', reviewToken);
  return Object.freeze({
    url: url.href, origin: url.origin, key: item.key,
    token: reviewToken, surface: item.type,
  });
}

export function buildExternalReviewUrl({ studentBase, item }) {
  const identity = clean(item?.identity);
  if (!item || !['page', 'tool'].includes(item.type)
      || !identity || item.key !== `${item.type}:${identity}`) {
    throw new TypeError('External review is available only for a valid page or tool.');
  }
  const base = normalizeStudentBase(studentBase);
  const url = new URL(base.href);
  url.searchParams.set(item.type, item.identity);
  return url.href;
}

export function matchesPreviewStatus(event, request, expectedSource) {
  const data = event?.data;
  return event?.origin === request?.origin
    && event?.source === expectedSource
    && data && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).sort().join(',') === 'reviewKey,reviewToken,status,surface,type'
    && data.type === 'faculty-preview-status'
    && data.reviewKey === request.key && data.reviewToken === request.token
    && data.surface === request.surface
    && ['ready', 'not_found', 'error'].includes(data.status);
}

export function reviewedRevisionMatches(item, reviewedRevision) {
  return item?.type === 'question' && REVISION_PATTERN.test(item.revision)
    && reviewedRevision === item.revision;
}

function validAssessment(assessment) {
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)
      || !['ready', 'warning', 'blocked'].includes(assessment.gate)
      || !Array.isArray(assessment.blockers) || !Array.isArray(assessment.warnings)
      || ![...assessment.blockers, ...assessment.warnings]
        .every(issue => issue && typeof issue === 'object' && clean(issue.code))) return false;
  if (assessment.gate === 'ready') {
    return assessment.blockers.length === 0 && assessment.warnings.length === 0;
  }
  if (assessment.gate === 'warning') {
    return assessment.blockers.length === 0 && assessment.warnings.length > 0;
  }
  return assessment.blockers.length > 0;
}

export function deriveAttestationEligibility(context = {}) {
  const blockers = [];
  const item = context.item;
  if (!item) return { eligible: false, blockers: ['selection.missing'] };
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
    if (context.previewStatus === 'ready' && context.liveReviewed !== true) blockers.push('review.live_required');
    if (['error', 'protocol_unavailable', 'frame_failure'].includes(context.previewStatus)
        && context.retryAttempted !== true) blockers.push('preview.retry_required');
    if (failedPreview && context.liveUnavailableAcknowledged !== true) blockers.push('review.live_unavailable_ack_required');
    if (!reviewedRevisionMatches(item, context.reviewedRevision)) blockers.push('review.saved_revision_required');
    if (assessmentIsValid && assessment.gate === 'blocked') blockers.push('question.blocked');
    const warningCodes = assessmentIsValid
      ? assessment.warnings.map(issue => clean(issue.code)) : [];
    if (assessmentIsValid && assessment.gate === 'warning'
        && warningCodes.some(code => !context.warningAcks?.has?.(code))) {
      blockers.push('question.warning_ack_required');
    }
    if (context.confirmations?.clinical !== true || context.confirmations?.evidence !== true
        || context.confirmations?.originalityAndNoPhi !== true) blockers.push('question.confirmations_required');
  } else {
    if (item.savedStatus !== 'unreviewed') blockers.push('content.status_not_attestable');
    if (context.previewStatus === 'ready' && context.completeItemReviewed !== true) blockers.push('review.complete_item_required');
    if (failedPreview && context.separateTabReviewed !== true) blockers.push('review.separate_tab_required');
    if (context.contentChecks?.accuracy !== true || context.contentChecks?.interactions !== true) {
      blockers.push('content.resolve_checks_required');
    }
  }
  return { eligible: blockers.length === 0, blockers };
}
```

- [ ] **Step 4: Run focused tests and verify green**

Run:

```bash
node --test tests/faculty-review-model.test.mjs
```

Expected: PASS, including exact-key, exact-field-whitelist, unsafe-URL, stale-token, and failure-matrix cases.

- [ ] **Step 5: Commit the pure seam**

```bash
git add faculty-console/review-model.mjs tests/faculty-review-model.test.mjs
git commit -m "feat(faculty-console): add unified review model"
```

---

### Task 2: Close the Warning-question review-receipt loophole

**Files:**
- Modify: `tests/faculty-console-actions.test.mjs:694-816`
- Modify: `tests/faculty-console-handler.test.mjs:751-815`
- Modify: `faculty-console/netlify/functions/qbank-actions.mjs:363-375`

- [ ] **Step 1: Add the failing pure action regression**

Add beside the existing green-item receipt test:

```js
test('prepareAttestation requires an exact matching reviewed revision for a warning item', () => {
  const item = validItem({
    stem: 'A fictional patient has sustained low mood. Which diagnosis is NOT most likely?',
  });
  const bank = makeBank([item]);
  const revision = itemRevision(item);
  const acknowledgedWarnings = ['stem.negative_lead_in'];

  for (const reviewedRevision of [
    undefined,
    'not-a-revision',
    itemRevision({ ...item, pearl: 'An earlier reviewed version.' }),
  ]) {
    const entry = { id: item.id, revision, acknowledgedWarnings };
    if (reviewedRevision !== undefined) entry.reviewedRevision = reviewedRevision;
    expectActionError(() => prepareAttestation({
      bank, manifestPages, entries: [entry], confirmations: confirmed,
    }), { code: 'attest.review_required', status: 422 });
  }

  const result = prepareAttestation({
    bank, manifestPages,
    entries: [{ id: item.id, revision, reviewedRevision: revision, acknowledgedWarnings }],
    confirmations: confirmed,
  });
  assert.deepEqual(result.ids, [item.id]);
});
```

In the existing successful yellow-item test, replace:

```js
entries: [entryFor(item, [...currentWarnings].reverse(), false)],
```

with:

```js
entries: [entryFor(item, [...currentWarnings].reverse())],
```

- [ ] **Step 2: Add the failing HTTP-boundary regression**

Add after the existing legacy-green receipt test:

```js
test('qbank.attest rejects a legacy warning request without reviewed-revision evidence', async () => {
  const item = validItem({
    stem: 'A fictional patient has sustained low mood. Which diagnosis is NOT most likely?',
  });
  const mock = createGithubMock({ files: defaultFiles(makeBank([item])) });
  const response = await handlerWith(mock)(apiRequest('POST', {
    body: {
      action: 'qbank.attest', manifestRevision: MANIFEST_SHA,
      items: [{
        id: item.id, revision: itemRevision(item),
        acknowledgedWarnings: ['stem.negative_lead_in'],
      }],
      confirmations: confirmed, attester: 'Synthetic Reviewer',
    },
  }));
  await expectError(response, { status: 422, code: 'attest.review_required' });
  assert.equal(mock.putBodies.length, 0);
});
```

Also retain or add a two-item server success assertion proving array-shaped compatibility, `updated === 2`, one PUT, and two returned revisions.

- [ ] **Step 3: Run the focused suites and verify the expected red state**

Run:

```bash
node --test tests/faculty-console-actions.test.mjs tests/faculty-console-handler.test.mjs
```

Expected: the new Warning-without-receipt tests FAIL because current code checks only questions without warnings; the existing unrelated action/handler tests remain green.

- [ ] **Step 4: Require the receipt for every selected question**

In `prepareAttestation()`, replace `unreviewedReady` with:

```js
const unreviewed = selected.filter(({ entry }) => (
  typeof entry.reviewedRevision !== 'string'
  || !REVISION_PATTERN.test(entry.reviewedRevision)
  || entry.reviewedRevision !== entry.revision
));
if (unreviewed.length) {
  throw new QbankActionError(
    'attest.review_required',
    'Mark every question reviewed at its exact saved revision before attestation.',
    422,
  );
}
```

Keep this check after `attest.warning_individual_only` and before warning acknowledgements so current error precedence and server batch semantics remain stable. Do not alter `attest.mjs`.

- [ ] **Step 5: Verify the server invariant and commit**

Run:

```bash
node --test tests/faculty-console-actions.test.mjs tests/faculty-console-handler.test.mjs
```

Expected: PASS with no write on a missing/stale Warning receipt and retained batch compatibility.

```bash
git add faculty-console/netlify/functions/qbank-actions.mjs \
  tests/faculty-console-actions.test.mjs tests/faculty-console-handler.test.mjs
git commit -m "fix(faculty-console): require review receipts for warnings"
```

---

### Task 3: Add exact, progress-neutral question review mode

**Files:**
- Create: `tests/question-bank-review-mode.test.mjs`
- Modify: `tests/smoke/faculty-console.spec.js`
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html:147-260,367-437,577-789`

**Inner message shape:**

```js
{
  type: 'faculty-preview-question-status',
  reviewKey,
  reviewToken,
  reviewItem,
  status: 'ready' | 'not_found' | 'error',
  surface: 'question',
}
```

- [ ] **Step 1: Add a focused source contract before changing learner code**

Create `tests/question-bank-review-mode.test.mjs` to read the canonical tool source and assert:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/question-bank-practice.html',
  import.meta.url,
), 'utf8');

test('exact-question review mode is explicit and precedes adaptive focus', () => {
  assert.match(source, /function readReviewContext\(/);
  assert.match(source, /function postReviewItemStatus\(/);
  assert.match(source, /function showReviewItem\(/);
  assert.ok(source.indexOf('showReviewItem(reviewItem)') < source.indexOf("localStorage.getItem('cw_qb_focus')"));
  assert.match(source, /This question is not present on the current deployment/);
});

test('review responses bypass learner progress and progression', () => {
  const commit = source.slice(
    source.indexOf('function commitResponse('),
    source.indexOf('function showFeedback('),
  );
  assert.match(commit, /SESSION\s*&&\s*SESSION\.reviewOnly/);
  assert.ok(commit.indexOf('SESSION.reviewOnly') < commit.indexOf('qbRecord('));
  const feedback = source.slice(
    source.indexOf('function getFeedbackHtml('),
    source.indexOf('function renderQuestion('),
  );
  assert.match(feedback, /SESSION\s*&&\s*SESSION\.reviewOnly/);
  assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)\(['"]cw_qb_focus['"][^)]*reviewOnly/);
});
```

- [ ] **Step 2: Add failing real-browser behavior tests**

In `tests/smoke/faculty-console.spec.js`, define `MS3_URL = process.env.MS3_BASE_URL || 'http://localhost:4200'`. Add a `test.describe('learner exact-question review route', ...)` group that:

- intercepts `**/question_bank.json` with one active synthetic question plus a retired question;
- seeds string sentinel values into `cw_qb_v1`, `cw_srs_v1`, and `cw_qb_focus`;
- installs a pre-navigation `message` listener that records inner status objects;
- navigates directly to `/tools/question-bank-practice.html?reviewItem=qb_moo_902&reviewKey=question%3Aqb_moo_902&reviewToken=<32-hex>`;
- verifies the exact stem renders, setup does not render, confidence/answer/feedback works, no Next or in-frame route-changing source link exists, and all three storage strings are unchanged;
- verifies a missing and retired ID display **This question is not present on the current deployment**, emit `not_found`, and never render another question;
- verifies a failed bank fetch emits `error` after a visible error.
- verifies malformed/duplicate protocol parameters do not enter review mode or emit a faculty status.
- verifies existing `cw_theme` load/message behavior still works while the three protected progress keys remain unchanged.

- [ ] **Step 3: Build and prove the expected red state**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
node --test tests/question-bank-review-mode.test.mjs
cd tests/smoke && npx playwright test --project=faculty-console --grep "learner exact-question"
```

Expected: the Node contract and browser cases FAIL because `reviewItem` is ignored and normal setup/progress behavior runs.

- [ ] **Step 4: Parse and validate the immutable review context**

Beside `BANK`/`SESSION`, add:

```js
var REVIEW_CONTEXT = readReviewContext();

function readReviewContext(){
  var sp = new URLSearchParams(location.search);
  var reviewItem = sp.get('reviewItem') || '';
  var reviewKey = sp.get('reviewKey') || '';
  var reviewToken = sp.get('reviewToken') || '';
  if(sp.getAll('reviewItem').length !== 1 || sp.getAll('reviewKey').length !== 1
      || sp.getAll('reviewToken').length !== 1) return null;
  if(!/^qb_[a-z]+_[0-9]{3}$/.test(reviewItem)) return null;
  if(reviewKey !== 'question:' + reviewItem) return null;
  if(!/^[0-9a-f]{32}$/.test(reviewToken)) return null;
  return Object.freeze({reviewItem:reviewItem, reviewKey:reviewKey, reviewToken:reviewToken});
}

function postReviewItemStatus(status){
  if(!REVIEW_CONTEXT || ['ready','not_found','error'].indexOf(status) < 0) return;
  window.parent.postMessage({
    type:'faculty-preview-question-status',
    reviewKey:REVIEW_CONTEXT.reviewKey,
    reviewToken:REVIEW_CONTEXT.reviewToken,
    reviewItem:REVIEW_CONTEXT.reviewItem,
    status:status,
    surface:'question'
  }, location.origin);
}
```

- [ ] **Step 5: Render only the exact active item and bypass persistence**

Add:

```js
function showReviewItem(item){
  SESSION = {
    queue:[item], idx:0, responses:[], confidence:null, tier1Key:null,
    displayOrder:[], tier2DisplayOrder:[], state:'conf', reviewOnly:true
  };
  showQuestion();
  postReviewItemStatus('ready');
}
```

At the beginning of the bank-fetch success branch, before `showSetup()` and the `cw_qb_focus` handoff:

```js
if(REVIEW_CONTEXT){
  var reviewItem = (data.items || []).find(function(item){
    return item && item.id === REVIEW_CONTEXT.reviewItem && item.retired !== true;
  });
  if(!reviewItem){
    root.innerHTML = '<div class="err-box"><strong>This question is not present on the current deployment</strong></div>';
    postReviewItemStatus('not_found');
    return;
  }
  showReviewItem(reviewItem);
  return;
}
```

In `commitResponse()`:

```js
if(SESSION && SESSION.reviewOnly){
  SESSION.responses.push({
    item:item, key:key, tier2Key:tier2Key, confidence:confidence,
    correct:correct, twoTierResult:twoTierResult, ts:Date.now()
  });
  return;
}
```

Make `getFeedbackHtml()` omit both its Next control and in-frame SPA navigation link when `SESSION.reviewOnly`, and do not bind `advance()` in `showFeedback()` for review mode. This keeps the embedded surface on the exact question. Unlike pages and tools, questions expose no separate-tab review shortcut; broader learner navigation stays outside this attestation flow. On bank-fetch failure, keep the visible error and call `postReviewItemStatus('error')`.

- [ ] **Step 6: Rebuild, verify storage neutrality, and commit**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
node --test tests/question-bank-review-mode.test.mjs
cd tests/smoke && npx playwright test --project=faculty-console --grep "learner exact-question"
```

Expected: PASS; exact item only, no random fallback/Next, interactive feedback works, and the three protected storage values remain byte-for-byte unchanged.

```bash
git add 13_Faculty_Resources/_automation/site_build/question-bank-practice.html \
  tests/question-bank-review-mode.test.mjs tests/smoke/faculty-console.spec.js
git commit -m "feat(learner): add exact question review mode"
```

---

### Task 4: Report real page, tool, and question readiness from the learner SPA

**Files:**
- Modify: `tests/smoke/faculty-console.spec.js`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html:565-566,680-773`

- [ ] **Step 1: Add failing learner-protocol browser cases**

Extend the learner describe group to exercise the built outer SPA at `MS3_URL` and record messages before navigation. Cover:

1. `?page=t_mood.md&reviewKey=page:t_mood.md&reviewToken=<token>` emits Page `ready` only after the requested Markdown is visible.
2. A controlled Markdown 404 emits `not_found`; a 500/network failure emits `error`.
3. `?tool=mse.html&reviewKey=tool:mse.html&reviewToken=<token>` emits Tool `ready` only after its exact nested iframe loads.
   The same generic-tool rule applies to `tool:question-bank-practice.html` when no `reviewItem` is present.
4. An unknown tool emits `not_found` and never falls back to Home.
5. A question-bank iframe load alone does not emit Question `ready`.
6. Correct inner question status becomes a five-field sanitized outer status.
7. Wrong `event.origin`, source frame, key, token, question ID, surface, status, and extra fields are ignored.
8. Duplicate or mismatched page/tool/review parameters never emit Ready.
9. After Ready, sidebar/page navigation away from the requested item is blocked; a nested tool reload/navigation emits Error and revokes readiness.
10. After exact-question Ready, clicking **Practice Questions** again (or calling `show()` for that same tool without the exact immutable suffix) leaves the current exact-question iframe and its `contentWindow` unchanged; it never opens the generic question bank under the still-Ready outer route.

- [ ] **Step 2: Build and confirm protocol tests are red**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
cd tests/smoke && npx playwright test --project=faculty-console --grep "learner preview protocol"
```

Expected: FAIL because the current SPA reports no typed readiness and silently falls back for unknown routes.

- [ ] **Step 3: Parse one valid outer preview request and centralize status output**

Near the SPA's route globals, add a parser that accepts only one value for each protocol parameter, exact page/tool/question key agreement, and a 32-lowercase-hex token. Store one immutable request for the current route:

```js
function readFacultyPreviewRequest(){
  var sp = new URLSearchParams(location.search);
  var page = sp.get('page') || '', tool = sp.get('tool') || '';
  var reviewItem = sp.get('reviewItem') || '';
  var reviewKey = sp.get('reviewKey') || '';
  var reviewToken = sp.get('reviewToken') || '';
  var protocolKeys = ['reviewKey','reviewToken'];
  if(reviewItem) protocolKeys.push('reviewItem');
  for(var i=0;i<protocolKeys.length;i++){
    if(sp.getAll(protocolKeys[i]).length !== 1) return null;
  }
  if(!/^[0-9a-f]{32}$/.test(reviewToken)) return null;
  if(page && sp.getAll('page').length === 1 && !tool && !reviewItem
      && reviewKey === 'page:' + page){
    return Object.freeze({surface:'page', reviewKey:reviewKey, reviewToken:reviewToken});
  }
  if(tool && sp.getAll('tool').length === 1 && !page && !reviewItem
      && reviewKey === 'tool:' + tool){
    return Object.freeze({surface:'tool', reviewKey:reviewKey, reviewToken:reviewToken});
  }
  if(tool === 'question-bank-practice.html' && sp.getAll('tool').length === 1
      && !page && reviewItem
      && reviewKey === 'question:' + reviewItem){
    return Object.freeze({
      surface:'question', reviewItem:reviewItem,
      reviewKey:reviewKey, reviewToken:reviewToken
    });
  }
  return null;
}
var facultyPreviewRequest = readFacultyPreviewRequest();
```

Then add:

```js
function postFacultyPreviewStatus(status, surface){
  if(!facultyPreviewRequest) return;
  if(['ready','not_found','error'].indexOf(status) < 0) return;
  if(surface !== facultyPreviewRequest.surface) return;
  window.parent.postMessage({
    type:'faculty-preview-status',
    reviewKey:facultyPreviewRequest.reviewKey,
    reviewToken:facultyPreviewRequest.reviewToken,
    status:status,
    surface:surface
  }, '*');
}
```

The outer `'*'` target is intentional because the no-referrer embed does not reveal the console origin; the console must enforce origin/source/key/token. Do not include `reviewItem`, URLs, titles, faculty data, or error details in the outer message.

- [ ] **Step 4: Attach reporting to actual success/failure boundaries**

- For Markdown pages, preserve the HTTP status. Emit `ready` only at the end of the successful fetch/render/enhancement path; map 404 to `not_found` and other fetch/HTTP failures to `error`.
- For tools, first `fetch()` the exact same-origin `tools/<encoded manifest filename>` and require `response.ok` plus a final same-origin URL; map a generic-tool 404 to `not_found`, other failures to `error`, and a missing question-tool shell to question `error`. Only after this deterministic preflight may the SPA create the nested iframe with DOM methods. Attach `load` and `error` listeners before setting `src`, retain the exact current frame reference, and emit generic Tool `ready` on its first load. A later load from that same nested frame emits `error`, because the reviewed surface has changed.
- For `question-bank-practice.html` with `reviewItem`, do not emit on frame load. Wait for the validated inner message.
- If a valid preview route is absent from `nav.json`, show a visible route-unavailable state and emit `not_found`; do not fall through to Welcome/Home.

Add this route guard. For a question, matching only the tool filename is insufficient: the call must carry the exact immutable `reviewItem`, `reviewKey`, and `reviewToken` suffix from the original outer URL.

```js
function exactQuestionSuffixMatches(extra){
  var sp = new URLSearchParams(String(extra || '').replace(/^&/, ''));
  if(Array.from(sp.keys()).sort().join(',') !== 'reviewItem,reviewKey,reviewToken') return false;
  return sp.getAll('reviewItem').length === 1
    && sp.getAll('reviewKey').length === 1
    && sp.getAll('reviewToken').length === 1
    && sp.get('reviewItem') === facultyPreviewRequest.reviewItem
    && sp.get('reviewKey') === facultyPreviewRequest.reviewKey
    && sp.get('reviewToken') === facultyPreviewRequest.reviewToken;
}

function facultyPreviewMatchesItem(item, opts){
  if(!facultyPreviewRequest || !item) return true;
  if(facultyPreviewRequest.surface === 'page'){
    return item.k === 'md' && facultyPreviewRequest.reviewKey === 'page:' + item.f;
  }
  if(facultyPreviewRequest.surface === 'tool'){
    return item.k === 'tool' && facultyPreviewRequest.reviewKey === 'tool:' + item.f;
  }
  return facultyPreviewRequest.surface === 'question'
    && item.k === 'tool' && item.f === 'question-bank-practice.html'
    && exactQuestionSuffixMatches(opts && opts.toolExtra);
}
```

Call `facultyPreviewMatchesItem(item, opts)` before `show()` changes `currentItem`, route state, CSS, or `contentEl`. Guard `showPath()`, `popstate`, nav-button clicks, and the existing `openPage`/`openLibrary` message branches as well. A rejected attempt updates a visible route-lock notice outside the current content but must not replace or reload `currentToolFrame`. While a valid faculty preview is active, attempts to leave the requested page or tool remain on the exact surface and display **Open the full page from the faculty console to navigate elsewhere**. Same-page anchors and in-tool controls that do not load a different document remain usable. The initial exact-question `openByFile()` call passes the suffix and succeeds; a later sidebar `show(item, button)` call has no suffix and is rejected.

- [ ] **Step 5: Validate and sanitize the exact-question inner relay**

In the existing `message` listener, accept an inner status only when:

```js
ev.origin === location.origin
&& ev.source === currentToolFrame.contentWindow
&& currentItem.f === 'question-bank-practice.html'
&& data.type === 'faculty-preview-question-status'
&& data.reviewItem === facultyPreviewRequest.reviewItem
&& data.reviewKey === facultyPreviewRequest.reviewKey
&& data.reviewToken === facultyPreviewRequest.reviewToken
&& data.surface === 'question'
&& ['ready','not_found','error'].indexOf(data.status) >= 0
&& Object.keys(data).sort().join(',')
   === 'reviewItem,reviewKey,reviewToken,status,surface,type'
```

Relay only through `postFacultyPreviewStatus(data.status, 'question')`.

- [ ] **Step 6: Verify both learner builds and commit**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke && npx playwright test --project=faculty-console --grep "learner preview protocol"
```

Expected: PASS for page render/failure, nested tool load/failure, exact question relay, and spoof rejection in the controlled local learner build.

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/smoke/faculty-console.spec.js
git commit -m "feat(learner): report faculty preview readiness"
```

---

### Task 5: Replace the split console with one unified queue and workspace shell

**Files:**
- Modify: `tests/faculty-console-contract.test.mjs:1-940,1281-1355,1720-2055,2090-2300`
- Modify: `faculty-console/app.mjs:1-160,247-415,483-1040,1497-2110,2390-2413`
- Modify: `faculty-console/index.html:1-914`

**State transition:**

```js
// Remove in Task 5: tab navigation state and contentFilters.
// Keep temporarily until their last consumers migrate in Tasks 7-8:
// batch, reviewedInSession, batchConfirmation, and contentChanges.
// Keep: server, selectedId (question-editor internal only), editor, original,
// reviewerLabel, reviewedRevisions, confirmations,
// warningAcks, pending, conflict, navigationGuard, reauthAction, loadGeneration.
// Add:
selectedKey: null,
completedHoldKey: null,
reviewItems: [],
queueFilters: {
  search: '', type: 'all', status: 'needs-review',
  category: 'all', gate: 'all', difficulty: 'all',
},
viewMode: 'live',
preview: null,
previewAttempt: 0,
reviewChecks: emptyReviewChecks(),
contentMessage: '',
contentCommitUrl: null,
reopenConfirmation: null,
```

- [ ] **Step 1: Replace obsolete tab/batch contract assertions with unified-shell assertions**

In `tests/faculty-console-contract.test.mjs`:

- import the new review-model helpers instead of `filteredQuestions`, `deriveQueueCounts`, and `isBatchEligible` from `app.mjs`;
- delete tests whose sole contract is tabs, batch selection, Mark reviewed & next, batch confirmation, answer-position gating in the browser, or Mark all content;
- retain server batch tests in the action/handler suites;
- preserve editor field, safe-text, authentication, request snapshot, conflict, stale reload, focus, caret, issue-link, and unsaved-navigation tests;
- add assertions for one queue selector, Previous/Next, type/status filters, disclosed question filters, one workspace, and one sign-off rail;
- assert the shared item header always shows title/ID, type, saved status, current view, and a revision when present;
- assert rendered DOM contains no `role="tablist"`, `batch-`, `mark-all-content`, `open-batch-attest`, or `Attest selected green drafts`, and source no longer contains the obsolete tab/batch render functions or faculty-facing batch copy.

Add a DOM test with page/tool/question fixtures:

```js
test('renders one ordered queue for pages, tools, and questions', async () => {
  const { controller, document } = await startHarness({
    fetchImpl: async () => jsonResponse(serverState({
      items: [
        { slug:'t_mood.md', title:'Mood disorders', kind:'page', status:'unreviewed' },
        { slug:'mse.html', title:'Mental Status Exam', kind:'tool', status:'reviewed' },
      ],
      questions: [validDomQuestion()],
    })),
  });
  assert.deepEqual(controller.state.reviewItems.map(item => item.key), [
    'page:t_mood.md', 'tool:mse.html', 'question:qb_moo_902',
  ]);
  assert.ok(document.getElementById('review-item-selector'));
  assert.ok(document.getElementById('previous-review-item'));
  assert.ok(document.getElementById('next-review-item'));
  assert.ok(document.getElementById('review-workspace'));
  assert.ok(document.getElementById('attestation-rail'));
  assert.equal(document.getElementById('tab-qbank'), null);
  assert.equal(document.getElementById('mark-all-content'), null);
});
```

- [ ] **Step 2: Run the contract suite and verify the expected red state**

Run:

```bash
node --test tests/faculty-console-contract.test.mjs
```

Expected: the new unified-shell tests FAIL while preserved authentication/editor/conflict tests identify any accidental regressions.

- [ ] **Step 3: Import the review model and inject deterministic platform seams**

Change the browser entry to:

```js
export function startFacultyConsole({
  document,
  window,
  fetchImpl = fetch,
  assessItemImpl = assessItem,
  tokenFactory = () => createReviewToken(window.crypto),
  scheduleTimeout = (callback, delay) => window.setTimeout(callback, delay),
  cancelTimeout = id => window.clearTimeout(id),
  openExternal = url => window.open(url, '_blank', 'noopener,noreferrer'),
}) {
```

Import `normalizeReviewItems`, `normalizeStudentBase`, `filterReviewItems`, `deriveReviewCounts`, and the preview helpers from `./review-model.mjs`. Extend `FakeWindow` with deterministic `crypto.getRandomValues`, controllable timers, and captured `open()` calls; extend `FakeElement` so iframe test doubles expose a stable `contentWindow`.

- [ ] **Step 4: Normalize authenticated state and select by stable key**

Before assigning a successful GET payload to state, call `normalizeStudentBase(payload.student)` and calculate a temporary `reviewItems = normalizeReviewItems(payload)`. If either step fails, use the existing incomplete-state load error and leave prior state intact. After both pass, assign `state.server = { ...payload, student: studentBase.href }` and `state.reviewItems = reviewItems`. Replace `findQuestion(id)`, `setSelected(id)`, and `chooseSelection()` at the navigation boundary with:

```js
function findReviewItem(key) {
  return state.reviewItems.find(item => item.key === key) || null;
}

function currentReviewItem() {
  return findReviewItem(state.selectedKey);
}

function visibleReviewItems() {
  return filterReviewItems(state.reviewItems, state.queueFilters);
}

function setSelectedReviewKey(key, { force = false, preserveCompletedHold = false } = {}) {
  const item = findReviewItem(key);
  if (!item) return false;
  if (!preserveCompletedHold) state.completedHoldKey = null;
  if (!force && state.selectedKey === key) return true;
  if (state.preview?.timerId) cancelTimeout(state.preview.timerId);
  state.reviewedRevisions.clear();
  state.selectedKey = key;
  state.viewMode = 'live';
  state.preview = null;
  state.previewAttempt = 0;
  state.reviewChecks = emptyReviewChecks();
  resetApprovalInputs();
  if (item.type === 'question') setSelected(item.identity, { force: true });
  else {
    state.selectedId = null;
    state.original = null;
    state.editor = null;
    state.dirtyFields = [];
    state.localAssessment = null;
  }
  return true;
}
```

If a faculty filter change removes the selected item, choose the first visible key, clear its prior review state, and announce the selection change. If no items remain, render an empty filter result without mutating saved data. The sole exception is a just-completed mutation: set `completedHoldKey` to the current key after its confirming reload so the completed item remains in the header/workspace even under Needs review. Its focused **Next item** action clears the hold and selects the first remaining filtered item; any manual selection or filter change also clears the hold. This implements the approved stay-on-success behavior without silently changing the faculty's filter.

- [ ] **Step 5: Render the shared queue strip and common workspace skeleton**

Remove tab navigation, the left question queue, batch summary/dialog, and the separate content panel. Add clearly named render functions:

```js
renderSharedQueueStrip(items)
renderItemHeader(item)
renderViewSwitcher(item)
renderWorkspaceSurface(item)
renderAttestationRail(item)
```

Remove all rendered batch IDs/copy/actions in this task, but leave the non-rendered legacy batch/content state and mutation functions in place until Tasks 7 and 8 replace their final callers. This keeps intermediate editor, before-unload, keyboard, reauthentication, and server-request paths executable. Task 7 deletes `batch`, `reviewedInSession`, `batchConfirmation`, and their mutation helpers; Task 8 deletes `contentChanges` and its remaining bulk helpers. No legacy state may remain after Task 8.

`renderSharedQueueStrip()` must include native Previous/Next buttons, a labeled searchable selector, type/status filters, active counts, and a disclosure containing category/gate/difficulty controls. Question-only filters do not exclude pages/tools. Selection changes use the existing unsaved-question navigation guard.

Previous/Next traverse only the currently visible filtered order and never wrap silently. Update the document title, login copy, console heading, and subtitle from question-only wording to **Faculty attestation workspace** and one consistent page/tool/question review description.

`renderShell()` must produce this semantic order:

```text
header
reviewer context
shared queue strip
selected-item header
workspace
  preview/editor column
  Review -> Resolve -> Confirm rail
modal, when required
```

The outer learner iframe is a long-lived DOM node for the selected item. Queue-filter changes, reviewer-label edits, preview status messages, view switching, editor mutations, and rail checkboxes update only their own regions; they must not call full `renderShell()` and silently reload the iframe. A full shell render is reserved for initial load, item selection, and repository reload/conflict. An editor mutation rebuilds only the Edit/Draft panes and rail, while clearing approvals; merely opening Draft preview or Edit question does not invalidate an otherwise current Live review.

- [ ] **Step 6: Replace layout CSS while retaining editor styles and color contrast**

In `index.html`:

- keep the approved palette (`#EEF2EF`, `#FFFFFF`, `#17211B`, `#5A665E`, `#3F5C45`, existing warning/blocked colors);
- remove `.tab-nav`, old `.workbench` queue grid, batch, and old content-list rules;
- retain editor, field, issue, modal, screen-reader, focus-visible, and reduced-motion rules;
- add `.queue-strip`, `.queue-primary`, `.queue-filters`, `.workspace`, `.preview-column`, `.preview-shell`, `.view-switcher`, `.signoff-rail`, and `.rail-step`;
- use desktop `grid-template-columns: minmax(0, 7fr) minmax(280px, 3fr)`;
- at `max-width: 900px`, stack queue, preview, then rail; do not create horizontal clipping.

- [ ] **Step 7: Run the focused contract suite and commit the shell**

Run:

```bash
node --test tests/faculty-review-model.test.mjs tests/faculty-console-contract.test.mjs
```

Expected: unified queue/shell tests PASS; preserved editor/auth/conflict contracts remain green. Preview and mutation actions may still be visibly disabled pending later tasks.

```bash
git add faculty-console/app.mjs faculty-console/index.html tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): add unified review workspace"
```

---

### Task 6: Add the tokenized embedded-preview controller and honest fallback states

**Files:**
- Modify: `tests/faculty-console-contract.test.mjs`
- Modify: `faculty-console/app.mjs`
- Modify: `faculty-console/index.html`

**Preview state:**

```js
{
  request: PreviewRequest,
  status: 'loading' | 'ready' | 'not_found' | 'error'
    | 'protocol_unavailable' | 'frame_failure',
  frameLoaded: boolean,
  frameWindow: object | null,
  timerId: unknown,
}
```

- [ ] **Step 1: Add deterministic failing preview-controller tests**

Use injected tokens and timers to cover:

- selecting each item creates its exact page/tool/question URL;
- every retry creates a new token, iframe, and timeout;
- Question Error/protocol/frame failure requires one Retry before live-unavailable acknowledgement can unlock review; Question Not found does not;
- iframe has exact sandbox, referrer policy, and title;
- iframe load without a typed message becomes `protocol_unavailable` at 10 seconds;
- iframe error/no load becomes `frame_failure`;
- correct status changes current state and cancels the timeout;
- a current-frame Error/Not found after Ready clears Live/content review checks and revokes eligibility;
- a second top-level iframe load after Ready is treated as a changed surface and revokes eligibility;
- wrong origin/source/key/token/surface/shape remains Loading until timeout;
- a late message from the prior selected item cannot unlock the current item;
- errors and fallbacks are visible and focusable;
- Open full page calls the injected external opener with a clean page/tool URL containing no `reviewKey`, `reviewToken`, or faculty-preview lock, never carries private data, and exposes a separate-tab confirmation only for page/tool failures;
- popup/download permission tokens do not appear in the sandbox.

- [ ] **Step 2: Run the new tests and confirm the expected red state**

```bash
node --test --test-name-pattern="preview|iframe|fallback|spoof|token" tests/faculty-console-contract.test.mjs
```

Expected: FAIL because the shared shell has no preview lifecycle yet.

- [ ] **Step 3: Start every preview with a fresh request and timeout**

Implement:

```js
function beginPreviewLoad(item) {
  if (state.preview?.timerId) cancelTimeout(state.preview.timerId);
  const request = buildPreviewRequest({
    studentBase: state.server.student,
    item,
    reviewToken: tokenFactory(),
  });
  state.previewAttempt += 1;
  const preview = {
    request, status: 'loading', frameLoaded: false,
    frameWindow: null, timerId: null, loadCount: 0, attempt: state.previewAttempt,
  };
  preview.timerId = scheduleTimeout(() => {
    if (state.preview !== preview || preview.status !== 'loading') return;
    preview.status = preview.frameLoaded ? 'protocol_unavailable' : 'frame_failure';
    announce(preview.frameLoaded
      ? 'Preview protocol unavailable. Use Retry or the documented fallback.'
      : 'Network or embedded-preview failure. Use Retry or the documented fallback.');
    refreshPreviewChromeAndRail('preview-status');
  }, 10_000);
  state.preview = preview;
  return preview;
}
```

Reset `previewAttempt` to zero on item or repository change. Create a new iframe only for Live deploy. Attach `load`/`error` before assigning `src`; capture `contentWindow` after insertion; keep the timer running after outer load because only the typed message proves the inner surface. Call `beginPreviewLoad(item)` after a new selected item or confirmed repository reload has been installed, and from Retry. Do not call it from ordinary rail or filter rendering. Pass `retryAttempted: state.preview?.attempt > 1` into eligibility; Question Error/protocol/frame failure cannot expose an enabled live-unavailable acknowledgement until a Retry has also failed. Exact Question Not found may use the deployment-lag acknowledgement on the first attempt.

Implement `refreshPreviewChromeAndRail(focusId)` as a targeted DOM update: replace only `#preview-status-slot` and `#attestation-rail`, preserve the current iframe node/browsing context, reapply issue associations for the rail, and restore the requested focus. Add a contract assertion that the iframe's `contentWindow` object is identical before and after toggling a review checkbox or receiving Ready.

- [ ] **Step 4: Validate the current typed status and invalidate old loads**

Add one window `message` listener:

```js
function handlePreviewStatus(event) {
  const preview = state.preview;
  if (!preview || !['loading', 'ready'].includes(preview.status)) return;
  if (!matchesPreviewStatus(event, preview.request, preview.frameWindow)) return;
  if (preview.status === 'ready' && event.data.status === 'ready') return;
  cancelTimeout(preview.timerId);
  preview.timerId = null;
  preview.status = event.data.status;
  state.reviewChecks.completeItemReviewed = false;
  state.reviewChecks.liveReviewed = false;
  state.reviewChecks.separateTabReviewed = false;
  state.reviewChecks.liveUnavailableAcknowledged = false;
  announce(`Deployed ${event.data.surface} preview: ${event.data.status.replace('_', ' ')}.`);
  refreshPreviewChromeAndRail('preview-status');
}
window.addEventListener('message', handlePreviewStatus);
```

Track the outer iframe's load count. The first load only sets `frameLoaded = true`; any later outer load for the same token sets `frame_failure`, clears all Live/content/fallback checks, and uses the targeted status/rail refresh. This catches a full-document navigation or reload after Ready without pretending to identify its cause.

Selection, reload, retry, save, conflict, and manifest change must cancel the timer and clear all preview/draft/fallback acknowledgements. Queue filtering and targeted rail/status refreshes must preserve the selected iframe and valid acknowledgements when the selected key does not change.

- [ ] **Step 5: Render failure-specific, non-overclaiming actions**

Render Loading, Ready, Not found, Error, Preview protocol unavailable, and Network or embedded-preview failure as text plus icon, never color alone. Page/tool failures expose **Retry preview**, **Open full page**, and then **I reviewed this item in the separate tab**. Question failures expose Retry and the later Draft/live-unavailable path, not the page/tool external-review shortcut.

Open full page must use `buildExternalReviewUrl({ studentBase: state.server.student, item })`, not `preview.request.url`, and open it with `noopener,noreferrer`. The new tab therefore contains only `?page=<slug>` or `?tool=<slug>`, permits the learner site's normal navigation/download behavior, and cannot activate the faculty-preview route lock. Do not add popup/download sandbox permissions. Questions do not use this separate-tab eligibility shortcut.

- [ ] **Step 6: Verify the preview controller and commit**

Run:

```bash
node --test tests/faculty-review-model.test.mjs tests/faculty-console-contract.test.mjs
```

Expected: PASS for exact URLs, 10-second classification, fresh retry tokens, message whitelisting, stale/spoof rejection, sandbox policy, and fallback visibility.

```bash
git add faculty-console/app.mjs faculty-console/index.html tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): validate embedded previews"
```

---

### Task 7: Add Live deploy, Draft preview, Edit question, and exact one-question sign-off

**Files:**
- Modify: `tests/faculty-console-contract.test.mjs:940-2055`
- Modify: `faculty-console/app.mjs:1042-1922,2111-2413`
- Modify: `faculty-console/index.html`

- [ ] **Step 1: Add failing view and exact-review tests while preserving editor regressions**

Add contract tests proving:

- questions show exactly three mutually exclusive controls: Live deploy, Draft preview, Edit question;
- Draft preview displays the exact saved/editor question through text nodes, is labeled **Not deployed**, and never includes learner iframe markup;
- **I reviewed this exact saved revision** can be checked only in Draft preview with no unsaved edits;
- the receipt stored in `state.reviewedRevisions` exactly equals the current 64-hex revision;
- edit, save, reload to a different revision, conflict, manifest change, or item change clears the receipt;
- Live Ready additionally requires an explicit Live review check;
- Live Not found/error/protocol/frame failure requires the exact Draft receipt plus **The live question is unavailable; I reviewed the saved revision that will be deployed**;
- dirty edits, Blocked gate, missing Warning acknowledgements, or missing three faculty confirmations keep attestation disabled;
- Ready and Warning requests each contain one entry with `reviewedRevision`;
- no UI path auto-populates `reviewedRevision` merely because a preview loaded;
- success stays on the completed item, focuses the result/Next action, and does not auto-advance;
- a successful POST whose confirming GET is stale/missing remains **unconfirmed** and never announces **Attested**;
- all existing draft save, conflict, reauthentication snapshot, caret, tier-two editor, and issue association tests remain green.

- [ ] **Step 2: Run the question-focused contract tests and verify red**

```bash
node --test --test-name-pattern="Draft preview|Live deploy|reviewed revision|warning|attest|conflict|save" tests/faculty-console-contract.test.mjs
```

Expected: new three-view and exact-receipt cases FAIL; preserved save/conflict tests show any accidental behavior loss.

- [ ] **Step 3: Split the existing question workbench into reusable views**

Keep existing field-editor helpers. Replace `renderQuestionOverview()`/`renderQuestionWorkbench()` with a container that creates all three panes once and hides the two inactive panes without detaching the Live iframe:

```js
function renderQuestionSurfaces(item) {
  return el('div', { class: 'question-surfaces' }, [
    el('section', {
      id: 'question-view-live', hidden: state.viewMode === 'live' ? null : true,
      'aria-labelledby': 'view-live',
    }, [renderLivePreview(item)]),
    el('section', {
      id: 'question-view-draft', hidden: state.viewMode === 'draft' ? null : true,
      'aria-labelledby': 'view-draft',
    }, [renderDraftPreview(state.editor || item.record)]),
    el('section', {
      id: 'question-view-edit', hidden: state.viewMode === 'edit' ? null : true,
      'aria-labelledby': 'view-edit',
    }, [renderQuestionEditor(item.record)]),
  ]);
}
```

`switchQuestionView(mode)` must update `state.viewMode`, the three native view buttons' selected state, the panes' `hidden` attributes, the item header's current-view label, and the rail—without rebuilding the Live pane. `renderDraftPreview()` must use `el()`/text nodes for the stem, ordered options, correct-answer indicator, tier-two content when present, rationale, pearl, evidence, links, and source pages. When clean, the visible heading is **Saved Draft preview · Not deployed**; when edits are dirty, it is **Unsaved local preview · Not deployed**, and the saved-revision review control stays disabled. `renderQuestionEditor()` reuses the existing full editor, assessment, changed-fields, Save draft, and Revert behavior.

When an editor input changes, replace `applyEditorChange()`'s full `renderShell(focusId)` call with `refreshQuestionEditDraftAndRail(focusId)`. That targeted helper rebuilds the Edit and Draft panes, assessment/changed-field regions, and rail, but does not touch the Live pane or iframe. The edit clears Live/Draft/fallback acknowledgements immediately, so the next successful save/reload deliberately starts a fresh preview.

- [ ] **Step 4: Bind the explicit saved-revision receipt to Draft preview**

Implement:

```js
function confirmDraftReview(question, checked) {
  refreshEditorState();
  const saved = findQuestion(question.id);
  if (!checked) {
    state.reviewedRevisions.delete(question.id);
  } else if (state.viewMode === 'draft' && saved
      && !state.dirtyFields.length && saved.revision === question.revision) {
    state.reviewedRevisions.set(question.id, question.revision);
  }
  refreshPreviewChromeAndRail('confirm-draft-review');
}
```

Never call this from iframe readiness or view switching. Reuse `invalidateSessionReview()` but remove its batch side effects. Ensure every edit input invalidates the receipt before rerendering. Convert the existing faculty-confirmation and warning-acknowledgement handlers to the same targeted rail refresh; none of these checkboxes may call full `renderShell()` or replace the Live iframe.

- [ ] **Step 5: Replace warning/batch actions with one current-question action**

Implement `attestCurrentQuestion(question)` so it:

1. refreshes editor/assessment state;
2. assigns `const assessment = state.localAssessment` only after that refresh and validates its gate/issues shape;
3. finds the exact current saved draft;
4. uses that one local `assessment` for eligibility and warning-code construction;
5. creates exactly one entry;
6. calls the existing immutable `attestEntries()` request/reload machinery.

Use this complete fail-closed action. The normalized item supplies saved identity/status/revision, but the fresh local assessment supplies the attestation gate and Warning codes:

```js
async function attestCurrentQuestion(question) {
  refreshEditorState();
  const assessment = state.localAssessment;
  const current = findQuestion(question?.id);
  const item = currentReviewItem();
  if (!current || !item || item.type !== 'question'
      || item.identity !== question?.id || item.identity !== current.id
      || item.savedStatus !== current.status || item.revision !== current.revision) {
    showQbankError('attest.stale_selection: Reload before attesting this question.');
    return false;
  }
  const eligibility = deriveAttestationEligibility({
    item,
    assessment,
    dirty: state.dirtyFields.length > 0,
    previewStatus: state.preview?.status,
    retryAttempted: state.preview?.attempt > 1,
    liveReviewed: state.reviewChecks.liveReviewed,
    liveUnavailableAcknowledged: state.reviewChecks.liveUnavailableAcknowledged,
    reviewedRevision: state.reviewedRevisions.get(current.id),
    warningAcks: state.warningAcks,
    confirmations: state.confirmations,
  });
  if (!eligibility.eligible) {
    showQbankError(`attest.ineligible: ${eligibility.blockers.join(', ')}`);
    return false;
  }
  const entry = {
    id: current.id,
    revision: current.revision,
    reviewedRevision: state.reviewedRevisions.get(current.id),
  };
  if (assessment.gate === 'warning') {
    entry.acknowledgedWarnings = assessment.warnings.map(issue => issue.code);
  }
  return attestEntries([entry], [current.id]);
}
```

Remove `attestWarning()`, `attestBatch()`, `sameAttestationEntries()`, `batch`, `reviewedInSession`, `batchConfirmation`, and all batch state clearing. Keep `attestEntries()` frozen-request, 401 retry, 409 conflict, commit URL validation, and mandatory confirming reload behavior. Refine the success timing: keep **Saving and confirming this attestation…** visible after the POST, hold the final message/commit URL in local variables, and assign/announce **Attested** only after `load({ expectedRevisions, ... })` returns true. A failed confirming GET must show `refresh_failed` and retain the item without a success claim.

After that confirming reload, set `state.completedHoldKey` to the selected question key, keep it selected, render the success receipt, and focus **Next item**. Do not let normal filter reconciliation auto-select a different Needs-review item during this one reload.

- [ ] **Step 6: Render the question-specific three-stage rail**

Review:

- Live Ready: **I reviewed the complete item in the learner view**.
- Every question: **I reviewed this exact saved revision** in Draft preview.
- Live unavailable: exact acknowledgement from the approved design.

Resolve:

- existing Ready/Warning/Blocked assessment and field-linked issues;
- Warning acknowledgements;
- Edit question route.

Confirm:

- current reviewer label;
- the three server-enforced clinical/evidence/originality-no-PHI confirmations;
- one **Attest this question** button.

Keep Ready copy explicit that structural checks are not clinical approval.

- [ ] **Step 7: Verify question workflow and commit**

Run:

```bash
node --test tests/faculty-qbank-rules.test.mjs \
  tests/faculty-review-model.test.mjs \
  tests/faculty-console-actions.test.mjs \
  tests/faculty-console-contract.test.mjs \
  tests/faculty-console-handler.test.mjs
```

Expected: PASS for Ready and Warning exact-revision receipts, all preserved editor/server safety checks, one-item requests, and no browser batch controls.

```bash
git add faculty-console/app.mjs faculty-console/index.html tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): unify question signoff"
```

---

### Task 8: Convert page and tool attestation to the same individual sign-off rail

**Files:**
- Modify: `tests/faculty-console-contract.test.mjs:2090-2300`
- Modify: `faculty-console/app.mjs:1924-2110`
- Modify: `faculty-console/index.html`

- [ ] **Step 1: Add failing individual content workflow tests**

Replace old Mark-all/content-list tests with page and tool cases proving:

- both types use the same item header, Live preview surface, and Review -> Resolve -> Confirm rail;
- Ready requires **I reviewed the complete item**, content accuracy/learner-level confirmation, and links/media/interactions confirmation;
- failed preview requires Open full page followed by **I reviewed this item in the separate tab**;
- exactly one content slug is submitted per click;
- a 401 login retry resubmits the frozen slug, boolean status, and reviewer label even if visible state changes;
- a successful POST followed by a stale/missing GET status remains unconfirmed and never announces success;
- success stays on the same item, announces the commit, and focuses **Next item**;
- an unsafe/HTTP commit receipt remains rejected as today;
- a reviewed page/tool offers **Reopen review** only under More actions, requires confirmation, and submits exactly that slug as `false`;
- selection changes clear all local content checks;
- Ctrl/Command-S saves only a dirty question in Edit question and never bulk-saves content.

- [ ] **Step 2: Run content-focused tests and verify red**

```bash
node --test --test-name-pattern="page|tool|content|Reopen|commit URL|shortcut" tests/faculty-console-contract.test.mjs
```

Expected: the new rail/individual submission cases FAIL; retained unsafe receipt tests remain green or identify regression.

- [ ] **Step 3: Replace contentChanges with a one-item mutation**

Extract this exact snapshot constructor, then refactor the existing `commitContent()` network/retry/reload flow to call it from `commitCurrentContent()`:

```js
function contentMutationSnapshot(item, reviewed) {
  if (!item || !['page', 'tool'].includes(item.type) || typeof reviewed !== 'boolean') {
    throw new TypeError('Invalid content review mutation.');
  }
  return freezeSnapshot({
    key: item.key,
    reviewed,
    body: {
      target: 'content',
      changes: { [item.identity]: reviewed },
      attester: state.reviewerLabel,
    },
  });
}
```

Extend `load()` with `expectedContentStatus: { slug, status } | null` and `errorScope: 'qbank' | 'content'`. Before assigning the GET payload, find that exact slug and require its status to match; on mismatch or missing content, preserve current state and show `refresh_failed` in the content result rather than claiming success.

Implement `commitCurrentContent(item, reviewed, retrySnapshot = null)` with this exact order:

```js
async function commitCurrentContent(item, reviewed, retrySnapshot = null) {
  let snapshot = retrySnapshot;
  if (!snapshot) {
    if (state.pending) return false;
    snapshot = contentMutationSnapshot(item, reviewed);
  }
  state.pending = true;
  state.contentMessage = 'Saving this content review…';
  state.contentCommitUrl = null;
  refreshPreviewChromeAndRail('content-action-result');
  try {
    const response = await fetchImpl(API, {
      method: 'POST', headers: apiHeaders(true),
      body: JSON.stringify(snapshot.body),
    });
    const payload = await responseJson(response);
    if (response.status === 401) {
      clearKey();
      state.pending = false;
      state.reauthAction = {
        kind: 'content.attest',
        retry: () => commitCurrentContent(null, null, snapshot),
      };
      renderLogin('Key not accepted. Your exact one-item review is retained; enter the faculty key to retry.');
      return false;
    }
    state.reauthAction = null;
    if (!response.ok || payload.updated !== 1) {
      throw new Error(responseMessage(payload, 'This content review was not saved.'));
    }
    const commitUrl = safeExternalUrl(payload.commit);
    if (payload.commit && !commitUrl) throw new Error('invalid_response: Commit receipt was not a safe HTTPS URL.');
    const slug = snapshot.body.changes && Object.keys(snapshot.body.changes)[0];
    const expectedStatus = snapshot.reviewed ? 'reviewed' : 'unreviewed';
    const refreshed = await load({
      silent: true,
      focusId: 'content-action-result',
      expectedContentStatus: { slug, status: expectedStatus },
      preserveOnError: true,
      errorScope: 'content',
    });
    if (!refreshed) return false;
    state.contentMessage = snapshot.reviewed
      ? `Attested ${slug}.`
      : `Reopened ${slug} for review.`;
    state.contentCommitUrl = commitUrl;
    if (snapshot.reviewed) state.completedHoldKey = snapshot.key;
    resetApprovalInputs();
    refreshPreviewChromeAndRail('content-action-result');
    announce(state.contentMessage);
    return true;
  } catch (error) {
    state.pending = false;
    state.reauthAction = null;
    state.contentMessage = error instanceof Error
      ? error.message : 'This content review was not saved.';
    state.contentCommitUrl = null;
    refreshPreviewChromeAndRail('content-action-result');
    announce(state.contentMessage);
    return false;
  }
}
```

The successful POST message remains **Saving this content review…** until the confirming GET matches the requested status. Add a regression where POST returns `updated: 1` but GET returns the old status; it must retain the current item, focus the `refresh_failed` result, and never announce **Attested** or **Reopened**.

For a positive attestation, set `completedHoldKey` after the confirming reload exactly as the question path does. Reopen review stays selected naturally because it returns to Needs review. Manual Next/selection/filter behavior clears the hold as defined in Task 5.

Before creating a positive mutation, call `deriveAttestationEligibility()` with the current page/tool preview and content checks. Do not retain a cross-item `contentChanges` object.

- [ ] **Step 4: Add the shared content rail and secondary reopen confirmation**

For page/tool Review, use embedded-complete or external-fallback checks according to preview state. For Resolve, require:

- **I verified that this is accurate and appropriate for a third-year student.**
- **I tested the relevant links, media, or interactions.**

For Confirm, show reviewer label and **Attest this page** or **Attest this tool**. Completed content has no primary attestation action; More actions contains Reopen review, and a confirmation dialog freezes `{key, reviewed:false}` before submission.

- [ ] **Step 5: Verify individual content behavior and commit**

Run:

```bash
node --test tests/faculty-review-model.test.mjs tests/faculty-console-contract.test.mjs
```

Expected: PASS for one-slug writes, shared rail, fallback eligibility, safe receipts, deliberate reopen, and no Mark-all/bulk local state.

```bash
git add faculty-console/app.mjs faculty-console/index.html tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): make content review individual"
```

---

### Task 9: Prove the complete cross-origin workflow in a real browser

**Files:**
- Modify: `tests/smoke/faculty-console.spec.js`
- Modify: `tests/smoke/playwright.config.js` only if test matching must include a new helper/spec; prefer keeping the existing project unchanged.

- [ ] **Step 1: Point synthetic authenticated state at the controlled local learner build**

Change the smoke fixture's `student` from `https://students.example/` to:

```js
const MS3_URL = process.env.MS3_BASE_URL || 'http://localhost:4200';
// ...
student: `${MS3_URL}/`,
```

Keep `/api/attest` intercepted by the synthetic in-memory repository. Route the built learner's `question_bank.json` to the same synthetic bank used by the faculty API so exact-question cases are deterministic without mutating canonical data.

- [ ] **Step 2: Replace legacy tab/batch scenarios with acceptance scenarios**

The suite must cover, in this order:

1. shared-key login and one queue containing page, tool, and question;
2. page selection, exact embedded URL, typed Ready, common rail, one-slug attestation, commit receipt, stay-on-item, manual Next;
3. tool selection, nested-frame Ready, interaction check, one-slug attestation;
4. Ready question Live deploy -> exact Draft preview -> Edit question, exact revision confirmation, three faculty confirmations, one-entry attestation;
5. Warning question with current warning acknowledgement and the same explicit saved-revision receipt;
6. Blocked question cannot save/attest until structural issue is resolved;
7. missing deployed question uses exact Draft plus live-unavailable acknowledgement and never shows another question;
8. Markdown failure, nested-tool failure, wrong route, protocol timeout, frame failure, Retry with new token, page/tool separate-tab fallback;
9. stale/wrong-origin/wrong-source/wrong-key/wrong-token/malformed/spoofed messages cannot enable review;
10. an attempted route change after Ready stays on the selected page, while a nested-frame or outer-frame reload revokes eligibility;
11. dirty-edit navigation guard, save/reload, revision conflict recovery, and receipt invalidation;
12. reviewed content Reopen review under More actions;
13. absence of tabs, Mark all, batch selection, and batch attestation controls.

For timeouts, use Playwright's fake clock or a controlled test-only injected timer path; do not wait ten wall-clock seconds per case.

- [ ] **Step 3: Add accessibility, keyboard, privacy, and responsive assertions**

Assert:

- iframe title names the selected item;
- sandbox is exactly `allow-scripts allow-same-origin allow-forms`;
- `referrerpolicy` is `no-referrer`;
- preview URLs/messages contain no faculty key, reviewer label, confirmations, edits, or commit data;
- Open full page contains no review key/token, is not route-locked, and supports normal external-link/download behavior in the new tab;
- keyboard can use queue Previous/Next, switch question views, complete checks, edit, save, and attest;
- active selection/view is programmatically exposed;
- errors receive focus and announce corrective action through the dedicated status region;
- at 390x844 the order is queue, preview/editor, then rail with no horizontal overflow;
- no screenshot baseline is created or updated.

- [ ] **Step 4: Run the focused browser suite**

From the repo root, ensure current local builds and servers exist as documented, then run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke
npx playwright test --project=faculty-console
```

Expected: PASS against ports 4200/4202 with no credentials and no canonical curriculum/status writes.

- [ ] **Step 5: Commit the acceptance suite**

```bash
git add tests/smoke/faculty-console.spec.js tests/smoke/playwright.config.js
git commit -m "test(faculty-console): cover unified attestation workflow"
```

If `playwright.config.js` is unchanged, do not stage it.

---

### Task 10: Update the runbook and execute every release gate

**Files:**
- Modify: `faculty-console/README.md`
- Modify: `tests/smoke/README.md`
- Modify: `.github/workflows/ci.yml:149-152`

- [ ] **Step 1: Update faculty-facing documentation**

Rewrite the console file map and runbook to describe:

- one shared queue and one-item-at-a-time review;
- the common Review -> Resolve -> Confirm rail;
- Live deploy versus Draft preview versus Edit question;
- exact saved-revision review for both Ready and Warning questions;
- embedded preview Ready, Not found, Error, protocol unavailable, and network/frame failure;
- Retry and the page/tool separate-tab fallback;
- individual page/tool attestation and secondary Reopen review;
- self-asserted reviewer labels and structural checks/previews not proving clinical correctness;
- no deployed/saved parity claim in this MVP;
- the iframe sandbox and absence of popup/download permission;
- local testing now requires both the built learner server on 4200 and console server on 4202.

Delete instructions for tabs, Mark all, Mark reviewed & next, green batch selection, and browser batch confirmation. Retain server compatibility/security notes where still accurate.

- [ ] **Step 2: Update smoke documentation and CI wording**

Change the Check 1b description to the unified queue, real local learner preview, exact-question route, individual content/question attestations, failure fallback, conflict recovery, and accessibility/mobile checks. Rename the CI step from **Faculty qbank workbench** to **Unified faculty attestation workspace**; do not change secrets, permissions, triggers, server ports, or baseline behavior.

- [ ] **Step 3: Run the complete focused Node gate**

```bash
node --test tests/faculty-qbank-rules.test.mjs \
  tests/faculty-review-model.test.mjs \
  tests/question-bank-review-mode.test.mjs \
  tests/faculty-console-actions.test.mjs \
  tests/faculty-console-contract.test.mjs \
  tests/faculty-console-handler.test.mjs
```

Expected: PASS. Record the exact test count.

- [ ] **Step 4: Run the repository-wide Node gate**

```bash
node --test tests/*.test.mjs
```

Expected: PASS, or report unrelated pre-existing failures separately with exact names and output. Do not weaken tests to hide baseline failures.

- [ ] **Step 5: Build and statically validate both learner sites**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both targeted builds and static QA gates PASS. If a Git LFS pointer stub causes an unrelated failure, verify the pointer and restore it with the normal LFS checkout path before diagnosing application code.

- [ ] **Step 6: Run final browser acceptance**

With ports 4200, 4201, and 4202 serving the current build/console as documented:

```bash
cd tests/smoke
npx playwright test --project=faculty-console
```

Expected: PASS with artifacts only on failure. Do not update visual baselines.

- [ ] **Step 7: Perform the release-only production framing check**

Read-only check the configured production learner URL's response headers and manually open one real page plus one exact-question preview in the console. Confirm the learner response does not newly block embedding and that the typed protocol arrives. Do not attest, change content, or deploy during this check.

If production is temporarily older than the branch protocol, record the console's visible **Preview protocol unavailable** fallback as expected rollout behavior; do not claim production support until both surfaces are deployed.

- [ ] **Step 8: Inspect scope and commit documentation**

```bash
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

Confirm no generated build output, secrets, curriculum changes, status mutations, visual baselines, or unrelated files are included.

```bash
git add faculty-console/README.md tests/smoke/README.md .github/workflows/ci.yml
git commit -m "docs(faculty-console): document unified review flow"
```

---

## Final Review Checklist

- [ ] Pages, tools, and questions share one queue, item header, preview/editor region, and three-stage rail.
- [ ] The console UI has no Content/Question tabs, Mark-all control, batch checkbox, or batch attestation action.
- [ ] Server array input, atomic validation, and batch compatibility still pass their tests.
- [ ] Page Ready occurs only after Markdown success; Tool Ready only after its exact nested frame; Question Ready only after exact item render and validated relay.
- [ ] Preview status acceptance enforces exact origin, outer frame, key, token, surface, field whitelist, and current selection.
- [ ] Retry invalidates the old token/frame and starts a new timeout.
- [ ] Exact-question review never substitutes an item, never advances, and never changes `cw_qb_v1`, `cw_srs_v1`, or `cw_qb_focus`.
- [ ] Every Ready or Warning question requires explicit Draft preview review and `reviewedRevision === revision` in both browser and server.
- [ ] Live deploy is context, Draft preview is the saved revision, and no parity claim appears.
- [ ] Page/tool failures require the separate-tab path; question failures require exact Draft review plus live-unavailable acknowledgement.
- [ ] All mutations contain exactly one UI-selected item and require a confirming repository reload.
- [ ] Existing editor, warnings, confirmations, conflicts, reauthentication, safe links, and unsaved-change protections remain green.
- [ ] Sandbox excludes popups, downloads, and top navigation; preview routes/messages contain no private faculty data.
- [ ] Desktop, mobile, keyboard, focus, status announcement, and no-horizontal-overflow checks pass.
- [ ] Focused Node, full Node, MS3 build, resident build, and faculty Playwright gates have exact recorded results.
- [ ] Production embedding is claimed only after the release-time header and real-frame check.

## Concrete Next Best Option

Implement Task 1 first with `superpowers:subagent-driven-development`: it creates the shared vocabulary and fail-closed URL/eligibility rules without touching curriculum data, repository writes, or the current interface.

## Innovative Follow-up (separate scope)

After this MVP is stable, canonicalize the deployed exact question and compare a content fingerprint with the saved repository revision. Show **Live matches saved** only when that comparison succeeds; otherwise keep the present honest Live/Draft distinction. This must remain a separate increment so the MVP never implies parity it cannot prove.
