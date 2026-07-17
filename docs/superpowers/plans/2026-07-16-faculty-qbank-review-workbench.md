# Faculty Question-Bank Review Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the faculty console's question-status toggles with a full, revision-safe editor and hybrid safety-gated attestation workflow.

**Architecture:** A dependency-free shared rules module classifies questions identically in the browser and server. A pure server action layer applies draft saves and attestations against per-item revisions, while the Netlify handler owns authentication and GitHub I/O. The browser becomes a queue plus persistent review drawer; it never decides whether a write is authorized.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Netlify Functions v2, Node.js 24 runtime, Node `node:test`, GitHub REST API `2026-03-10`, Playwright 1.46.1.

## Global Constraints

- Work only in the isolated `codex/faculty-qbank-workbench` branch based on `origin/main`; preserve other worktrees and branches.
- Keep `question_bank.json`, item statuses, `reviewed.json`, and learner content unchanged while building the workbench.
- IDs, option keys A-D, retirement fields, bank `_note`/`version`, and reserved `v2` data are governed and immutable through this UI.
- Any content edit forces `status: "draft"`; edit-and-attest in one request is forbidden.
- Red structural edits remain local and cannot be saved; yellow drafts can be saved; red cannot be attested.
- Only opened, explicitly marked-reviewed green drafts may enter a batch; yellow is individual only with every warning acknowledged.
- Every attestation requires human confirmation of clinical correctness, page/evidence grounding, originality, and no PHI.
- Server results are authoritative; browser checks are immediate guidance only.
- Use header-only `x-faculty-key` authentication, same-origin CORS by default, `Cache-Control: no-store`, a 128 KB POST limit, a 4 MB bank-read limit, and a 60-request/minute per-IP/domain rate limit.
- Use no new runtime dependencies and never render repository strings with `innerHTML`.
- Keep content page/tool attestation behavior working and reject the legacy qbank toggle route.
- Do not merge, push, deploy, regenerate visual baselines, or change question statuses.

---

## File map

- Create `faculty-console/qbank-rules.mjs`: browser/server-shared semantic checks, edit merge, diffs, and batch balance.
- Create `faculty-console/netlify/functions/qbank-actions.mjs`: per-item hashing and pure save/attest transitions.
- Modify `faculty-console/netlify/functions/attest.mjs`: authenticated HTTP handler and GitHub repository gateway.
- Create `faculty-console/app.mjs`: console state, queue, editor, save, and attestation interactions.
- Modify `faculty-console/index.html`: semantic shell and Clinical Warm responsive styles.
- Modify `faculty-console/README.md`: accurate workflow, security, setup, and limitations.
- Modify `faculty-console/netlify.toml`: Node 24 build setting.
- Modify `.github/workflows/ci.yml`: run the existing CI gate on pushes to `main` and exercise the console smoke project.
- Create `tests/faculty-qbank-rules.test.mjs`: table-driven rules and real-bank regression.
- Create `tests/faculty-console-actions.test.mjs`: state-transition and concurrency contract.
- Create `tests/faculty-console-handler.test.mjs`: auth, limits, GitHub fallback, and error mapping.
- Create `tests/faculty-console-contract.test.mjs`: static UI/accessibility/security contract.
- Create `tests/smoke/faculty-console.spec.js`: rendered end-to-end workflow with a mocked API.
- Modify `tests/smoke/playwright.config.js`: faculty console project on port 4202.

---

### Task 1: Shared question rules

**Files:**
- Create: `faculty-console/qbank-rules.mjs`
- Create: `tests/faculty-qbank-rules.test.mjs`

**Interfaces:**
- Produces: `assessItem(item, context) -> { gate, blockers, warnings }`
- Produces: `assessBank(items, context) -> { byId, counts, answerKeys, categoryAnswerKeys }`
- Produces: `mergeEditableItem(original, edited) -> item`
- Produces: `diffEditableFields(original, edited) -> string[]`
- Produces: `assessBatch(items) -> { ok, issues, answerKeys }`
- Context shape: `{ manifestPages: string[], activeItems: object[] }`
- Issue shape: `{ code: string, field: string, message: string }`

- [ ] **Step 1: Write the failing semantic-check tests**

Create a valid synthetic fixture and table-driven mutations:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessItem, assessBank, mergeEditableItem,
  diffEditableFields, assessBatch,
} from '../faculty-console/qbank-rules.mjs';

const valid = () => ({
  id: 'qb_moo_900', status: 'draft', type: 'sba', category: 'mood',
  competency: ['dx'], difficulty: 2, pages: ['t_mood.md'],
  link: { label: 'Open Mood Disorders', href: '?page=t_mood.md' },
  stem: 'A fictional patient has a sustained depressive syndrome. Most likely diagnosis?',
  options: [
    { key: 'A', t: 'Major depressive disorder', c: true },
    { key: 'B', t: 'Delirium', trap: { name: 'Timeline miss', note: 'Delirium fluctuates.' } },
    { key: 'C', t: 'Mania', trap: { name: 'Polarity miss', note: 'Mania needs activation.' } },
    { key: 'D', t: 'Adjustment disorder', trap: { name: 'Threshold miss', note: 'The full syndrome is present.' } },
  ],
  why: 'The sustained syndrome supports major depressive disorder.',
  pearl: 'Name the syndrome before choosing treatment.',
  evidence: 't_mood.md — depressive syndrome discriminator.',
});

test('valid item is green', () => {
  const result = assessItem(valid(), { manifestPages: ['t_mood.md'], activeItems: [valid()] });
  assert.equal(result.gate, 'ready');
  assert.deepEqual(result.blockers, []);
});

for (const [name, mutate, code] of [
  ['empty evidence', x => { x.evidence = ' '; }, 'required.evidence'],
  ['duplicate option keys', x => { x.options[3].key = 'A'; }, 'options.keys'],
  ['two correct answers', x => { x.options[1].c = true; }, 'options.correct_count'],
  ['missing trap', x => { delete x.options[1].trap; }, 'options.trap'],
  ['unknown source page', x => { x.pages = ['missing.md']; }, 'pages.unknown'],
  ['broken deep link', x => { x.link.href = '?page=missing.md'; }, 'link.unknown_page'],
]) test(name, () => {
  const item = valid(); mutate(item);
  assert.ok(assessItem(item, { manifestPages: ['t_mood.md'], activeItems: [item] })
    .blockers.some(issue => issue.code === code));
});
```

Add focused fixtures for relational subtype, tier-two shape/correct count, retired items, empty strings, invalid enums, negative lead-ins, weak lead-ins, all/none options, conspicuously long correct answers, evidence/page mismatch, link/page mismatch, and >=85% near-duplicate stems. Ensure `not` in vignette prose does not trigger unless it occurs in the final lead-in.

- [ ] **Step 2: Run the rules tests and confirm the expected failure**

Run: `node --test tests/faculty-qbank-rules.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `faculty-console/qbank-rules.mjs`.

- [ ] **Step 3: Implement constants, normalization, and item classification**

Implement dependency-free exports with stable issue codes:

```js
export const TYPES = ['sba', 'two-tier', 'relational'];
export const CATEGORIES = ['mood','psychosis','anxiety','substance','neurocog','pharm','safety','personality','childdev','otherdx','ethics','relational'];
export const COMPETENCIES = ['dx','next-step','management','safety','pharm','psychosocial'];
export const SUBTYPES = ['family-system','what-would-you-say','transition-of-care'];
export const OPTION_KEYS = ['A','B','C','D'];

const issue = (code, field, message) => ({ code, field, message });
const text = value => typeof value === 'string' ? value.trim() : '';

export function assessItem(item, { manifestPages = [], activeItems = [] } = {}) {
  const blockers = [];
  const warnings = [];
  // Validate every invariant from the design using the stable codes asserted above.
  // Only machine-provable facts are blockers; semantic clinical review remains human.
  return { gate: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ready', blockers, warnings };
}
```

Use Jaccard token overlap matching the existing static QA algorithm. For answer-length cueing, warn only when the correct answer is uniquely longest and exceeds both 2.25x the median distractor length and the median by at least 35 characters, limiting false positives in the real bank.

- [ ] **Step 4: Implement governed edit merging and field-level diffs**

Use an explicit editable allowlist; never spread client data over the original:

```js
const EDITABLE = ['type','subtype','category','competency','difficulty','hy','pages','link','stem','options','why','pearl','evidence','tier2'];

export function mergeEditableItem(original, edited) {
  const next = structuredClone(original);
  for (const key of EDITABLE) {
    if (Object.hasOwn(edited, key)) next[key] = structuredClone(edited[key]);
    else delete next[key];
  }
  next.id = original.id;
  next.status = 'draft';
  if (original.retired) next.retired = true;
  if (original.retiredReason) next.retiredReason = original.retiredReason;
  if (original.v2) next.v2 = structuredClone(original.v2);
  if (next.type !== 'relational') delete next.subtype;
  if (next.type !== 'two-tier') delete next.tier2;
  return next;
}
```

Return dotted labels such as `options.B.trap.note` from `diffEditableFields` so the UI can display a concise flight-recorder summary.

- [ ] **Step 5: Implement bank summaries and batch balance**

`assessBank` must return counts and correct-key distributions without hard-coding 144 or 192. `assessBatch` must reject selections of four or more when one key exceeds half the batch or fewer than three keys are represented:

```js
export function assessBatch(items) {
  const answerKeys = { A: 0, B: 0, C: 0, D: 0 };
  for (const item of items) {
    const correct = (item.options || []).find(option => option.c === true);
    if (correct && Object.hasOwn(answerKeys, correct.key)) answerKeys[correct.key]++;
  }
  const represented = Object.values(answerKeys).filter(Boolean).length;
  const max = Math.max(...Object.values(answerKeys));
  const issues = items.length >= 4 && (represented < 3 || max > items.length / 2)
    ? [issue('batch.answer_key_balance', 'options', 'This batch has a strong answer-position cue. Rebalance or attest individually.')]
    : [];
  return { ok: issues.length === 0, issues, answerKeys };
}
```

- [ ] **Step 6: Add the real-bank regression and run all root tests**

Load `question_bank.json` plus `site_manifest.json` in the test. Assert all 189 active items have zero blockers, all 46 active drafts are reported, retired items are excluded from active summaries, and the draft answer-key distribution is `{A:46,B:0,C:0,D:0}`. This test documents current state without changing it.

Run: `node --test tests/*.test.mjs`

Expected: all existing tests plus the new rules tests PASS.

- [ ] **Step 7: Commit the shared rules**

```bash
git add faculty-console/qbank-rules.mjs tests/faculty-qbank-rules.test.mjs
git commit -m "feat(faculty-console): add qbank safety rules"
```

---

### Task 2: Revision-safe save and attestation transitions

**Files:**
- Create: `faculty-console/netlify/functions/qbank-actions.mjs`
- Create: `tests/faculty-console-actions.test.mjs`

**Interfaces:**
- Consumes: `assessItem`, `assessBank`, `assessBatch`, `mergeEditableItem` from Task 1.
- Produces: `itemRevision(item) -> string` (SHA-256 hex of canonical JSON).
- Produces: `prepareDraftSave({ bank, manifestPages, id, baseRevision, editedItem }) -> { bank, item, assessment, changedFields }`.
- Produces: `prepareAttestation({ bank, manifestPages, entries, confirmations }) -> { bank, ids }`.
- Produces: `QbankActionError(code, message, status, issues)`.

- [ ] **Step 1: Write failing transition tests**

Test forced draft status, immutable IDs, preservation of unrelated items/top-level metadata/`v2`, no-op rejection, unknown/retired rejection, red-save rejection, stale same-item revision, green atomic batch, yellow batch rejection, yellow individual acknowledgment, red rejection, human confirmations, mixed-batch atomicity, and the all-A batch balance gate.

Use the exact confirmation object:

```js
const confirmed = {
  clinical: true,
  evidence: true,
  originalityAndNoPhi: true,
};
```

Expected warning entry shape:

```js
{ id: 'qb_moo_900', revision: itemRevision(item), acknowledgedWarnings: ['stem.negative_lead_in'] }
```

- [ ] **Step 2: Run the transition test and verify failure**

Run: `node --test tests/faculty-console-actions.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `qbank-actions.mjs`.

- [ ] **Step 3: Implement canonical hashing and action errors**

```js
import { createHash } from 'node:crypto';

export class QbankActionError extends Error {
  constructor(code, message, status = 422, issues = []) {
    super(message);
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

export function itemRevision(item) {
  return createHash('sha256').update(JSON.stringify(stableValue(item))).digest('hex');
}
```

- [ ] **Step 4: Implement draft-save preparation**

Find exactly one active item, compare `baseRevision`, merge only editable fields, force draft, reject no-op or blockers, and return a new cloned bank. Never mutate the input bank.

```js
if (itemRevision(original) !== baseRevision) {
  throw new QbankActionError('qbank.conflict', 'This question changed after you loaded it.', 409);
}
const next = mergeEditableItem(original, editedItem);
const assessment = assessItem(next, contextFor(nextBank));
if (assessment.blockers.length) {
  throw new QbankActionError('qbank.blocked_draft', 'Resolve structural blockers before saving.', 422, assessment.blockers);
}
```

- [ ] **Step 5: Implement atomic attestation preparation**

Validate the whole selection before changing any status. Require current revisions, draft status, zero blockers, all human confirmations, individual yellow acknowledgment, green-only batches, and batch answer-key balance. Unknown or retired IDs are errors, never silently skipped.

```js
export function prepareAttestation({ bank, manifestPages, entries, confirmations }) {
  if (!confirmations?.clinical || !confirmations?.evidence || !confirmations?.originalityAndNoPhi) {
    throw new QbankActionError('attest.confirmations_required', 'Complete all faculty confirmations.');
  }
  const active = bank.items.filter(item => !item.retired);
  const selected = entries.map(entry => {
    const item = active.find(candidate => candidate.id === entry.id);
    if (!item) throw new QbankActionError('qbank.unknown_item', `Unknown active item: ${entry.id}`, 404);
    if (itemRevision(item) !== entry.revision) throw new QbankActionError('qbank.conflict', `${entry.id} changed.`, 409);
    return { item, entry, assessment: assessItem(item, { manifestPages, activeItems: active }) };
  });
  // Validate every selected item and the whole batch before cloning and setting status.
  const nextBank = structuredClone(bank);
  for (const { item } of selected) nextBank.items.find(x => x.id === item.id).status = 'attested';
  return { bank: nextBank, ids: selected.map(x => x.item.id) };
}
```

- [ ] **Step 6: Run action tests and all root tests**

Run: `node --test tests/faculty-console-actions.test.mjs tests/faculty-qbank-rules.test.mjs`

Expected: PASS.

Run: `node --test tests/*.test.mjs`

Expected: all root tests PASS.

- [ ] **Step 7: Commit the action layer**

```bash
git add faculty-console/netlify/functions/qbank-actions.mjs tests/faculty-console-actions.test.mjs
git commit -m "feat(faculty-console): enforce qbank review transitions"
```

---

### Task 3: Authenticated GitHub handler and deployment guards

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs`
- Modify: `faculty-console/netlify.toml`
- Modify: `.github/workflows/ci.yml`
- Create: `tests/faculty-console-handler.test.mjs`

**Interfaces:**
- Consumes: Task 2 action functions.
- Produces: `createHandler({ env, fetchImpl }) -> async (Request) => Response` for tests and default Netlify export.
- Produces actions `qbank.save-draft` and `qbank.attest`.
- Preserves legacy `target: "content"`; rejects legacy `target: "qbank"`.

- [ ] **Step 1: Write failing handler tests with a mocked GitHub API**

Cover:

- auth rejected before `request.json()` is reached;
- same-origin accepted and foreign origin rejected;
- `Cache-Control: no-store` on all JSON responses;
- body over 128 KB returns 413;
- object Contents response and raw-media fallback both decode the bank;
- source bank over 4 MB returns a stable error;
- `X-GitHub-Api-Version: 2026-03-10` on every GitHub request;
- full state includes active complete items, per-item revisions, assessments, manifest pages, and bank counts;
- save and attest invoke exactly one commit on success;
- GitHub 409 retries only when all target revisions remain unchanged;
- same-item race returns 409 with no second PUT;
- legacy qbank toggle returns 400;
- GitHub 403/409/422/429 produce stable error codes;
- no-op requests produce no commit.

Inject `fetchImpl` and keep all fixtures synthetic.

- [ ] **Step 2: Run handler tests and confirm failure**

Run: `node --test tests/faculty-console-handler.test.mjs`

Expected: FAIL because `createHandler` is not exported.

- [ ] **Step 3: Refactor configuration, headers, and auth without changing content behavior**

Use request-aware headers and header-only auth:

```js
const MAX_POST_BYTES = 128 * 1024;
const MAX_BANK_BYTES = 4 * 1024 * 1024;
const GITHUB_API_VERSION = '2026-03-10';

function responseHeaders(request, env) {
  const sameOrigin = new URL(request.url).origin;
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || sameOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-faculty-key',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}
```

Reject a mismatched `Origin` before auth. Check `x-faculty-key` before reading a POST body. Parse via `request.text()`, enforce byte length, then `JSON.parse`.

- [ ] **Step 4: Implement the GitHub repository gateway**

First request the object media response to obtain `sha`, `size`, and inline content. If `content` is empty/`encoding` is `none`, make a second GET with `Accept: application/vnd.github.raw+json`; retain the SHA from the object response. Reject raw bank content above 4 MB before parsing.

Every GitHub request uses:

```js
{
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'faculty-attest',
}
```

- [ ] **Step 5: Build the full authenticated state**

Return complete active items only. Add `revision` and server assessment to each item, `qbankRevision` for diagnostics, `manifestPages`, bank-wide counts, answer-key distribution, and category distribution. Do not hard-code item totals.

```js
function buildQbankPayload(bankFile, manifest) {
  const manifestPages = (manifest.json.md || []).map(([, slug]) => slug);
  const active = (bankFile.json.items || []).filter(item => !item.retired);
  const bankAssessment = assessBank(active, { manifestPages, activeItems: active });
  return {
    qbankRevision: bankFile.sha,
    manifestPages,
    qbank: active.map(item => ({
      ...item,
      revision: itemRevision(item),
      assessment: bankAssessment.byId[item.id],
    })),
    qbankSummary: bankAssessment,
  };
}
```

- [ ] **Step 6: Wire explicit qbank actions and safe retry**

For `qbank.save-draft` and `qbank.attest`, fetch latest, run the Task 2 transition, and PUT once. On GitHub 409, refetch and rerun Task 2 with the original expected item revisions. The second attempt succeeds only for unrelated changes; target drift yields 409. Return `{ok, action, updated, commit, revision, assessment}` without clearing client edits on failure.

```js
switch (body.action) {
  case 'qbank.save-draft':
    return await commitQbankMutation(() => prepareDraftSave({
      bank: latestBank, manifestPages, id: body.id,
      baseRevision: body.baseRevision, editedItem: body.item,
    }));
  case 'qbank.attest':
    return await commitQbankMutation(() => prepareAttestation({
      bank: latestBank, manifestPages, entries: body.items,
      confirmations: body.confirmations,
    }));
  default:
    if (body.target === 'qbank') throw httpError('legacy_qbank_action', 400);
}
```

- [ ] **Step 7: Add the Netlify and CI guards**

Set:

```toml
[build.environment]
  NODE_VERSION = "24"
```

Export:

```js
export const config = {
  path: '/api/attest',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
```

Add to `.github/workflows/ci.yml`:

```yaml
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
```

- [ ] **Step 8: Run handler tests and root regression tests**

Run: `node --test tests/faculty-console-handler.test.mjs tests/faculty-console-actions.test.mjs tests/faculty-qbank-rules.test.mjs`

Expected: PASS.

Run: `node --test tests/*.test.mjs`

Expected: all root tests PASS.

- [ ] **Step 9: Commit the guarded API**

```bash
git add faculty-console/netlify/functions/attest.mjs faculty-console/netlify.toml .github/workflows/ci.yml tests/faculty-console-handler.test.mjs
git commit -m "feat(faculty-console): add revision-safe qbank API"
```

---

### Task 4: Queue, filters, and accessible application shell

**Files:**
- Modify: `faculty-console/index.html`
- Create: `faculty-console/app.mjs`
- Create: `tests/faculty-console-contract.test.mjs`

**Interfaces:**
- Consumes: `assessItem`, `diffEditableFields`, and `assessBatch` from Task 1.
- Consumes API state from Task 3.
- Produces browser entry `startFacultyConsole({ document, window, fetchImpl = fetch })`.

- [ ] **Step 1: Write the failing static contract test**

Assert the HTML has no app-wide `aria-live`, loads `app.mjs` as a module, contains a dedicated `role="status"`, and uses semantic tab markup. Assert `app.mjs` contains no assignment to `innerHTML`, includes the expected field labels, `beforeunload`, `aria-current`, `fieldset`, `legend`, and `Ctrl/Cmd+S` handling.

Also calculate the primary-button contrast from the CSS hex values and assert at least 4.5:1.

- [ ] **Step 2: Run the UI contract test and verify failure**

Run: `node --test tests/faculty-console-contract.test.mjs`

Expected: FAIL because `app.mjs` and the new shell do not exist.

- [ ] **Step 3: Replace the inline application with a semantic shell**

Keep the login generated by the module, but make the document root inert:

```html
<main class="wrap" id="app"></main>
<div id="app-status" class="sr-only" role="status" aria-live="polite"></div>
<script type="module" src="./app.mjs"></script>
```

Use the dark existing green `#3f5c45` for white-text primary buttons. Implement a desktop `minmax(280px, 340px) 1fr` workbench grid and a single-column narrow layout with no horizontal scrolling at 320px/200% zoom.

- [ ] **Step 4: Implement login, top-level tabs, and state loading**

`startFacultyConsole` manages:

```js
const state = {
  server: null,
  tab: 'qbank',
  selectedId: null,
  editor: null,
  original: null,
  reviewedInSession: new Set(),
  batch: new Set(),
  filters: { search: '', category: 'all', status: 'draft', gate: 'all', difficulty: 'all' },
  pending: false,
};
```

Preserve sessionStorage key handling and the Content tab behavior. Label the free-text name as `Reviewer label` and explain that the shared-key label is not verified identity.

- [ ] **Step 5: Implement the filterable queue**

Search ID/stem/category/evidence/pages. Show text-and-symbol gate labels. Use real queue buttons with `aria-current`; keep the selected row independent of the review/batch checkbox. Provide category/status/gate/difficulty filters and derived Draft/Ready/Warnings/Blocked/Attested counts.

Do not permit batch selection until a green saved draft is opened and marked reviewed in the current session.

```js
function filteredQuestions(server, filters) {
  const needle = filters.search.trim().toLowerCase();
  return server.qbank.filter(question => {
    const haystack = [question.id, question.stem, question.category, question.evidence, ...(question.pages || [])].join(' ').toLowerCase();
    return (!needle || haystack.includes(needle))
      && (filters.category === 'all' || question.category === filters.category)
      && (filters.status === 'all' || question.status === filters.status)
      && (filters.gate === 'all' || question.assessment.gate === filters.gate)
      && (filters.difficulty === 'all' || String(question.difficulty) === filters.difficulty);
  }).sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}
```

- [ ] **Step 6: Run the contract and root tests**

Run: `node --test tests/faculty-console-contract.test.mjs tests/*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 7: Commit the shell and queue**

```bash
git add faculty-console/index.html faculty-console/app.mjs tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): add accessible qbank review queue"
```

---

### Task 5: Full editor and guarded workflow

**Files:**
- Modify: `faculty-console/app.mjs`
- Modify: `faculty-console/index.html`
- Modify: `tests/faculty-console-contract.test.mjs`

**Interfaces:**
- Consumes Task 3 actions `qbank.save-draft` and `qbank.attest`.
- Produces a complete v1 editor and UI state machine `editing -> saved draft -> checks current -> attested`.

- [ ] **Step 1: Extend the contract test for the full editor**

Require persistent labels and controls for metadata, all A-D option text, correct-answer radio group, traps, conditional subtype, conditional tier-two question/options/why, rationale, pearl, sources, evidence, deep link, changed-field summary, safety issues, all three human confirmations, Revert, Save draft, Mark reviewed & next, individual warning attestation, and green batch attestation.

- [ ] **Step 2: Implement metadata and option editors**

Render every repository string via `textContent`, `value`, or element properties. Keep IDs and option keys read-only. Correct answer uses one radio group. Wrong options show required trap fields; the currently correct option hides/removes its trap inputs.

Use comma/newline parsing for pages and multi-checkbox controls for competencies. Type changes reveal subtype or tier-two sections while preserving only fields valid for the chosen type when the editor model is read.

```js
function renderOptionEditor(option, correctKey) {
  const group = el('fieldset', { class: 'option-card' });
  group.append(el('legend', {}, [`Option ${option.key}`]));
  group.append(labeledRadio('Correct answer', 'correct-key', option.key, correctKey === option.key));
  group.append(labeledTextarea(`Option ${option.key} text`, `option-${option.key}-text`, option.t));
  if (correctKey !== option.key) {
    group.append(labeledInput('Trap name', `option-${option.key}-trap-name`, option.trap?.name || ''));
    group.append(labeledTextarea('Corrective trap note', `option-${option.key}-trap-note`, option.trap?.note || ''));
  }
  return group;
}
```

- [ ] **Step 3: Implement immediate checks and change visibility**

On every editor input:

1. rebuild the candidate object;
2. run `assessItem` against current active items;
3. mark checks stale relative to the saved repository version;
4. show blockers first and warnings second with field links;
5. display `diffEditableFields(original, candidate)`;
6. disable all attestation actions while dirty or blocked.

State plainly: `Automated checks passed` rather than `Evidence verified`.

```js
function refreshEditorAssessment() {
  const candidate = readEditor();
  state.editor = candidate;
  state.dirtyFields = diffEditableFields(state.original, candidate);
  state.localAssessment = assessItem(candidate, {
    manifestPages: state.server.manifestPages,
    activeItems: state.server.qbank.map(item => item.id === candidate.id ? candidate : item),
  });
  renderChangeSummary(state.dirtyFields);
  renderSafetyPanel(state.localAssessment, state.dirtyFields.length > 0);
}
```

- [ ] **Step 4: Implement explicit Save draft**

POST:

```js
{
  action: 'qbank.save-draft',
  id: state.selectedId,
  baseRevision: state.original.revision,
  item: candidate,
  attester: state.reviewerLabel,
}
```

On success, reload while retaining selected ID. On 409, focus a conflict alert with Reload and Keep local copy choices. On other failures, retain the candidate and surface the stable error. Do not autosave.

- [ ] **Step 5: Implement individual and batch attestation**

Require the three confirmation checkboxes. Yellow sends exactly one entry with its current warning codes. Green batch entries come only from `reviewedInSession`, list every ID in the confirmation, and run `assessBatch` before POST. A successful action reloads state and clears only the successfully committed selection.

```js
async function attest(entries) {
  const selected = entries.map(entry => state.server.qbank.find(item => item.id === entry.id));
  const batch = assessBatch(selected);
  if (!batch.ok) return showAlert(batch.issues[0].message);
  return apiPost({
    action: 'qbank.attest',
    items: entries,
    confirmations: readConfirmations(),
    attester: state.reviewerLabel,
  });
}
```

- [ ] **Step 6: Implement navigation and unsaved-change safety**

Use `window.beforeunload` plus a custom in-app three-way prompt: Save draft, Discard, Cancel. `Ctrl/Cmd+S` saves only. Queue-scoped ArrowUp/ArrowDown moves selection. Never add global single-letter shortcuts.

```js
window.addEventListener('beforeunload', event => {
  if (!state.dirtyFields?.length) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveCurrentDraft();
  }
});
```

- [ ] **Step 7: Run focused and root tests**

Run: `node --test tests/faculty-console-contract.test.mjs tests/faculty-qbank-rules.test.mjs tests/faculty-console-actions.test.mjs tests/faculty-console-handler.test.mjs`

Expected: PASS.

Run: `node --test tests/*.test.mjs`

Expected: all root tests PASS.

- [ ] **Step 8: Commit the editor workflow**

```bash
git add faculty-console/app.mjs faculty-console/index.html tests/faculty-console-contract.test.mjs
git commit -m "feat(faculty-console): add full qbank review editor"
```

---

### Task 6: Browser workflow, documentation, and CI smoke coverage

**Files:**
- Create: `tests/smoke/faculty-console.spec.js`
- Modify: `tests/smoke/playwright.config.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `faculty-console/README.md`

**Interfaces:**
- Consumes the completed static console and API contract.
- Produces Playwright project `faculty-console` with `FACULTY_CONSOLE_BASE_URL` defaulting to `http://localhost:4202`.

- [ ] **Step 1: Add a failing Playwright project and browser test**

Add:

```js
const FACULTY_URL = process.env.FACULTY_CONSOLE_BASE_URL || 'http://localhost:4202';
// ...
{
  name: 'faculty-console',
  testMatch: 'faculty-console.spec.js',
  use: { ...devices['Desktop Chrome'], baseURL: FACULTY_URL },
}
```

In the test, intercept `**/api/attest` and maintain an in-memory synthetic state. Exercise login, filters, complete two-tier rendering, edit of an attested item, local blocker, save-to-draft, reload persistence, Mark reviewed & next, balanced green batch, yellow individual warning acknowledgment, red rejection, and a mocked 409 conflict. Assert retired items never render.

- [ ] **Step 2: Run the browser test and verify its initial failure**

Run in one terminal: `python3 -m http.server 4202 --directory faculty-console`

Run in another: `cd tests/smoke && npm ci && npx playwright test --project=faculty-console`

Expected before final wiring: at least one workflow assertion FAILS.

- [ ] **Step 3: Finish browser-visible behavior until the workflow passes**

Make only targeted fixes in `app.mjs` / `index.html`. Do not weaken server rules or browser assertions to obtain a green run.

Run: `cd tests/smoke && npx playwright test --project=faculty-console`

Expected: PASS.

- [ ] **Step 4: Add the console server and smoke command to CI**

In the smoke job's server step add:

```yaml
python3 -m http.server 4202 --directory faculty-console &
```

Wait for port 4202 alongside 4200/4201, then add:

```yaml
- name: "Check 1b: Faculty qbank workbench"
  run: |
    cd tests/smoke
    npx playwright test --project=faculty-console
```

- [ ] **Step 5: Update the faculty console runbook**

Document the queue/editor workflow, blockers versus warnings, reviewed-in-session batching, edit invalidation, conflict recovery, header-only key, same-origin default, `ALLOWED_ORIGIN`, Node 24, GitHub API version, size/rate limits, and verified-identity limitation. Keep secrets out of examples.

- [ ] **Step 6: Run all focused and repository gates**

Run:

```bash
node --test tests/*.test.mjs
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
cd tests/smoke && npx playwright test --project=faculty-console
```

Expected: every command PASS. Report unrelated existing warnings separately from the workbench result.

- [ ] **Step 7: Commit browser coverage and documentation**

```bash
git add tests/smoke/faculty-console.spec.js tests/smoke/playwright.config.js .github/workflows/ci.yml faculty-console/README.md faculty-console/app.mjs faculty-console/index.html
git commit -m "test(faculty-console): verify guarded review workflow"
```

---

### Task 7: Completion audit

**Files:**
- Verify only; no source changes unless an acceptance criterion fails.

**Interfaces:**
- Consumes: the design specification and all Task 1-6 outputs.
- Produces: evidence that each acceptance criterion is met.

- [ ] **Step 1: Verify the diff scope and governed data invariants**

Run:

```bash
git status --short
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- question_bank.json 13_Faculty_Resources/reviewed.json
```

Expected: no diff for question statuses or `reviewed.json`; only planned console/tests/docs/CI files change.

- [ ] **Step 2: Re-run the complete verification matrix from a clean process**

Repeat root tests, validators, both site gates, and the faculty Playwright project. Capture exact test totals and any baseline warnings.

- [ ] **Step 3: Map evidence to all eight design acceptance criteria**

Check each criterion in `docs/superpowers/specs/2026-07-16-faculty-qbank-review-workbench-design.md` against a test, rendered interaction, or diff inspection. Treat missing/indirect evidence as incomplete and fix it before continuing.

- [ ] **Step 4: Review branch history and final diff**

Run:

```bash
git log --oneline origin/main..HEAD
git diff --check origin/main...HEAD
git status --short
```

Expected: focused commits, no whitespace errors, and a clean worktree.
