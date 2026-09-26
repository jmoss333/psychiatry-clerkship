# Mobile Attestation Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first faculty attestation client at `/m/` on the console's own Netlify site that shows the learner page full-screen and attests one item per press without the desktop's 16-call confirming reload.

**Architecture:** A second front-end (`faculty-console/m/index.html` + `m.mjs`) served from the same origin as the desktop console, importing the existing `review-model.mjs` for queue normalisation, preview requests, deep links, twins and eligibility, and calling the same `/api/attest` function. One server change: the content attest write returns `rows`, the projected ledger rows it wrote, keyed by slug. A pure `m/m-model.mjs` module holds the phone-specific logic (grouping, auto-advance, applying `rows`, flattening diffs) so it is unit-tested with `node --test`; the DOM layer is exercised by Playwright at a 390×844 viewport inside the existing `faculty-console` smoke project.

**Tech Stack:** Vanilla ES modules (no bundler, no framework), Netlify static hosting + the existing Netlify function, `node:test` for units, Playwright (`tests/smoke`, project `faculty-console`) for the browser.

**Spec:** `docs/superpowers/specs/2026-09-26-mobile-attestation-console-design.md`

**Revision 2026-09-26 (preflight):** four corrections before Task 1 was briefed — Task 1's projection test attests the pending `mse-tool`; Task 2's fall-through advance follows the sorted queue; Task 4 mounts the item screen once so the learner iframe is never re-created; Task 6's question test follows the undeployed-draft path (Not found → Retry → acknowledge). The DOM helper flattens nested children. **Revision 6 (Task 4 report):** the learner frame is absolutely positioned inside `.frame-wrap` so it fills the remaining viewport; the item test pins the frame height and the action bar's position. **Revision 5 (Task 3 re-review):** the offline check reports in place and `render()` shows the error screen only when a key is held but nothing has loaded. **Revision 4 (Task 3 review):** a failed first load renders a message and Retry (`renderLoadError`), a 5xx maps to the spec's wording, offline at boot is stated. **Revision 3 (Task 3 report):** the queue mounts once and re-renders only `#queue-groups` on input so the search box keeps focus; screens are `div.screen` inside the single `<main id="m-app">` (no `aria-live` on the root), one `<h1>` per screen (the header bar), the item screen drops its duplicate title heading. **Revision 2 (Task 2 review):** `diffLines` never erases a changed file (too-large / binary / truncated files emit their file line and a `note`), `questionEntry(item, reviewedRevision)` carries the reviewer's receipt instead of echoing the item's revision, and both sign functions re-check eligibility at press time.

## Global Constraints

- Every file under `faculty-console/` is a **governance path** (`bin/check_governance_separation.py`): this work ships in one PR with **no content files, no `reviewed.json`, no `topic_meta.json`, no `question_bank.json`**. Test files under `tests/` (outside `tests/maintenance/`) are neutral and may ride along.
- The faculty key is sent **only** in the `x-faculty-key` header, held **only** in `sessionStorage` under `fac_key`, never in a URL, `localStorage`, or a log line. A 401 clears it and re-prompts, keeping the pending action.
- Exactly **one slug per press**: a content POST body is `{ target: 'content', changes: { [slug]: true }, reasons: {} }` with a single key.
- The preview token is 32 lowercase hex characters from `createReviewToken(window.crypto)`; a new token per attempt.
- Learner-site embedding is allowed only from `https://clerkship-faculty-attest.netlify.app`; `/m/` must stay on that site. The console's own `frame-ancestors 'none'` header stays.
- Server response shapes (do not invent fields): GET `{ student, resident, attester, items[], qbank[], qbankRevision, manifestRevision, manifestPages[], qbankSummary, counts, branchSync, branchFresh, freshness, ... }`; item `{ slug, title, kind:'page'|'tool', site:'ms3'|'res', sites, status:'reviewed'|'unreviewed', at, by, risk|null, stale?:true, reason }`; question `{ id, status, revision (64 hex), assessment:{gate, blockers, warnings}, stem, options[], why, pearl, evidence, category, difficulty, ... }`; errors `{ error: { code, message, issues?, retryable? } }`.
- Never demote, never write the ledger from the client, never set a question's status: the server is the only writer.
- No new `bin/` tools, no CI workflow edits (they trip five pin surfaces), no `CLAUDE.md` edits.
- Node 24 (console site); tests run with the repo's `node --test faculty-console/*.test.mjs`, `node --test tests/*.test.mjs`, and `cd tests/smoke && npx playwright test --project=faculty-console`.

## Review Focus

Inputs the spec implies but no obvious test exercises; each line names the task whose tests pin it.

1. A GET whose `items[]` includes a slug that `?view=changes` lists in **two** groups (a page touched by two corrections) must appear **once** in the queue, in the first (largest) group. → Task 2 test *"a slug named by two groups is placed once"*.
2. A `rows` payload for a slug the phone does not have loaded (another reviewer signed it) must not crash or add a phantom row. → Task 2 test *"applyRows ignores unknown slugs"*.
3. The learner frame answering `ready` for a **different** item (stale message from the previous frame) must be ignored; the desktop's `matchesPreviewStatus` is the guard and the phone must call it with the current request and the current `contentWindow`. → Task 4 smoke test *"a stale readiness message does not unlock Attest"*.
4. A POST that returns 200 but without `rows` (ledger mode today, or an older function) must still show the receipt and schedule a refresh rather than hang in "Signing…". → Task 5 smoke test *"a receipt without rows still completes"*.
5. The confirm sheet must not let a swipe or stray tap sign: **Sign** is disabled until every required acknowledgement is checked, and a second tap while the POST is in flight is a no-op. → Task 5 smoke test *"Sign is disabled until acknowledged and idempotent while pending"*.

---

## File structure

| Path | Responsibility |
|---|---|
| `faculty-console/netlify/functions/attest.mjs` (modify, ~L1920-1933) | `commitContentMutation` returns `rows` beside `commit` when `updated > 0`. |
| `tests/faculty-console-handler.test.mjs` (modify, L2319-2338; add one test) | Pins the `rows` projection and that internal hash fields never leave the server. |
| `faculty-console/m/m-model.mjs` (create) | Pure phone logic: queue, grouping, reasons, auto-advance, applying `rows`, diff flattening, eligibility context, timeout mapping. |
| `faculty-console/m-model.test.mjs` (create) | `node --test` for the module above (must sit directly in `faculty-console/` to match the CI glob). |
| `faculty-console/m/index.html` (create) | Phone shell: styles, `<main id="m-app">`, `<script type="module" src="./m.mjs">`, manifest and icon links. |
| `faculty-console/m/m.mjs` (create) | DOM layer: key gate, API calls, three screens, sheets, receipt, advance, background refresh. |
| `faculty-console/m/manifest.webmanifest`, `faculty-console/m/icon.svg`, `faculty-console/m/apple-touch-icon.png` (create) | Add-to-home-screen. |
| `faculty-console/index.html` (modify, `<style>` + one anchor) | *Use the phone console* link on viewports ≤ 700 px. |
| `tests/smoke/faculty-console.spec.js` (modify) | Stub returns `rows`; new `test.describe('phone client', …)` at a 390×844 viewport. |
| `faculty-console/README.md` (modify) | One section: the phone client, what it reuses, what it does not do. |

---

### Task 1: The attest write returns the rows it wrote

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs:1920-1933` (the success return of `commitContentMutation`)
- Test: `tests/faculty-console-handler.test.mjs` (extend L2319-2338; add one test after it)

**Interfaces:**
- Consumes: `reviewed[slug]` rows written in the loop at L1893-1918 (`next`), `contentApiStatus(entry)` (existing helper that maps `pending` → `unreviewed`), `validRisk(entry.risk)` (existing).
- Produces: POST response `{ ok:true, target:'content', updated:N, commit, rows:{ [slug]: { status:'reviewed'|'unreviewed', at, by, risk, reason } } }` when `updated > 0`; unchanged `{ ok, target, updated:0, commit:null }` otherwise. `rows[slug]` never carries `contentHash`, `note`, `claimsHash`, `evidenceHash`, `evidenceThrough`.

- [ ] **Step 1: Write the failing tests**

Edit the existing test at `tests/faculty-console-handler.test.mjs:2319-2338` so its `deepEqual` expects `rows`, and add a new test directly after it:

```js
test('reopen preserves legacy pending storage and returns canonical unreviewed state', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock);
  const response = await handler(apiRequest('POST', {
    body: {
      target: 'content',
      changes: { 't_mood.md': false, 'mse-tool': true },
      reasons: { 't_mood.md': 'Routine periodic re-review.' },
      attester: 'Synthetic Reviewer',
    },
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(payload, {
    ok: true,
    target: 'content',
    updated: 2,
    commit: 'https://github.example/commit/1',
    rows: {
      't_mood.md': {
        status: 'unreviewed', at: today, by: 'Pending faculty review',
        risk: { kind: 'clinical', level: 'high' }, reason: 'Routine periodic re-review.',
      },
      'mse-tool': {
        status: 'reviewed', at: today, by: 'Synthetic Reviewer',
        risk: { kind: 'general', level: 'low' }, reason: '',
      },
    },
  });
  // (keep the rest of the original test body below this point unchanged)
```

```js
test('rows in the attest response carry only the projected fields, never the hash or note', async () => {
  const mock = createGithubMock();   // defaultFiles(): mse-tool is pending, t_mood.md already reviewed (a no-op)
  const handler = handlerWith(mock);
  const response = await handler(apiRequest('POST', {
    body: { target: 'content', changes: { 'mse-tool': true }, reasons: {} },
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.updated, 1);
  assert.deepEqual(Object.keys(payload.rows), ['mse-tool']);
  assert.deepEqual(Object.keys(payload.rows['mse-tool']).sort(), ['at', 'by', 'reason', 'risk', 'status']);
  assert.equal(payload.rows['mse-tool'].status, 'reviewed');
  assert.equal(JSON.stringify(payload).includes('contentHash'), false);
  assert.equal(JSON.stringify(payload).includes('claimsHash'), false);
});

test('a no-op attest response carries no rows field', async () => {
  const mock = createGithubMock();
  const handler = handlerWith(mock);
  const response = await handler(apiRequest('POST', {
    body: { target: 'content', changes: { 't_mood.md': true }, reasons: {} },  // already reviewed in defaultFiles()
  }));
  const payload = await response.json();
  assert.equal(payload.updated, 0);
  assert.equal('rows' in payload, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/faculty-console-handler.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)'`
Expected: the three tests above fail (`rows` missing); everything else passes.

- [ ] **Step 3: Implement the projection**

In `attest.mjs`, immediately before the `return { ok: true, target: 'content', updated: effectiveChanges.length, commit: saved.commit };` at ~L1933, add a projection over the slugs written, and include it in the return:

```js
    // The rows this write produced, projected exactly as buildContentItems() projects a row
    // for the GET: status (pending → unreviewed), at, by, risk, reason. Never the stored
    // contentHash / note / claimsHash / evidenceHash / evidenceThrough — the GET contract
    // forbids those reaching the browser, and a client uses these rows to update one item
    // in place instead of re-downloading the whole state (ADR: mobile console, 2026-09-26).
    const rows = Object.fromEntries(effectiveChanges.map(([slug]) => {
      const entry = reviewed[slug];
      return [slug, {
        status: contentApiStatus(entry),
        at: typeof entry.at === 'string' ? entry.at : '',
        by: typeof entry.by === 'string' ? entry.by : '',
        risk: validRisk(entry.risk),
        reason: entry.status === 'pending' && typeof entry.reason === 'string' ? entry.reason : '',
      }];
    }));
    return { ok: true, target: 'content', updated: effectiveChanges.length, commit: saved.commit, rows };
```

Confirm `contentApiStatus` and `validRisk` are defined above this point in the file (they are used by `buildContentItems` at ~L1357-1383); if either is declared later, hoisting of `function` declarations still makes them available.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/faculty-console-handler.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)'`
Expected: `# fail 0`.

Also run: `node --test tests/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'` — Expected `# fail 0` (the ledger and branch-sync suites do not deep-equal the content success payload).

- [ ] **Step 5: Commit**

```bash
git add faculty-console/netlify/functions/attest.mjs tests/faculty-console-handler.test.mjs
git commit -m "feat(console): the content attest write returns the projected rows it wrote

A client can update the signed item in place instead of re-downloading the whole state
(~16 GitHub calls). rows[slug] is projected like the GET item: status, at, by, risk, reason,
never contentHash/note/claims/evidence fields. Absent when updated is 0.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The phone model module (pure logic, unit-tested)

**Files:**
- Create: `faculty-console/m/m-model.mjs`
- Test: `faculty-console/m-model.test.mjs`

**Interfaces:**
- Consumes from `../review-model.mjs`: `normalizeReviewItems(server)`, `twinOf(item, items)`, `deriveAttestationEligibility(context)`, `reviewedRevisionMatches(item, reviewedRevision)`.
- Produces (all exported, all pure):
  - `phoneQueue(server) → item[]` — normalized items with `completion === 'needs-review'`.
  - `groupQueue(items, changes) → { id, title, items }[]` — sections in spec order.
  - `reviewReason(item) → string`.
  - `nextAfterSign(signedKey, items, sections) → string|null` — next item key.
  - `applyRows(server, rows) → server` — new payload with updated `items[]`.
  - `diffLines(diff) → { kind:'file'|'context'|'del'|'add'|'note', text }[]` — a changed file always emits its `file` line; `note` lines carry too-large / binary / truncated.
  - `timeoutStatus(frameLoaded) → 'protocol_unavailable'|'frame_failure'`.
  - `contentEligibility(item, ui) → { eligible, blockers }` and `questionEligibility(item, ui) → { eligible, blockers }`.
  - `questionEntry(item, reviewedRevision) → { id, revision, reviewedRevision, acknowledgedWarnings: [] }` — `reviewedRevision` is the reviewer's recorded receipt (`''` when absent), never echoed from the item.

- [ ] **Step 1: Write the failing tests**

Create `faculty-console/m-model.test.mjs`:

```js
/* Phone client model: grouping, advance, applying write rows, diff flattening. Pure functions,
   fixtures inline — never the live ledger (a test may not depend on live governance state). */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRows, contentEligibility, diffLines, groupQueue, nextAfterSign, phoneQueue,
  questionEligibility, questionEntry, reviewReason, timeoutStatus,
} from './m/m-model.mjs';

const REV = 'a'.repeat(64);
const STALE = 'Content changed since faculty review on 2026-09-21; awaiting re-attestation.';

function server() {
  return {
    student: 'https://ms3.example/', resident: 'https://res.example/', attester: 'Dr Test',
    items: [
      { slug: 't_mood.md', title: 'Mood', kind: 'page', site: 'ms3', sites: ['ms3', 'res'], status: 'unreviewed', at: '2026-09-21', by: 'Dr Test', risk: { kind: 'clinical', level: 'high' }, stale: true, reason: STALE },
      { slug: 't_sud.md', title: 'SUD', kind: 'page', site: 'ms3', sites: ['ms3'], status: 'unreviewed', at: '2026-09-21', by: 'Dr Test', risk: { kind: 'clinical', level: 'high' }, stale: true, reason: STALE },
      { slug: 'mse.html', title: 'MSE tool', kind: 'tool', site: 'ms3', sites: ['ms3'], status: 'unreviewed', at: '', by: '', risk: { kind: 'general', level: 'low' }, reason: 'New tool awaiting review' },
      { slug: 'cotw_20260831_catatonia_ms3.md', title: 'Catatonia — MS3', kind: 'page', site: 'ms3', sites: ['ms3'], status: 'unreviewed', at: '', by: '', risk: { kind: 'clinical', level: 'moderate' }, reason: '' },
      { slug: 'cotw_20260831_catatonia_res.md', title: 'Catatonia — Resident', kind: 'page', site: 'res', sites: ['res'], status: 'unreviewed', at: '', by: '', risk: { kind: 'clinical', level: 'moderate' }, reason: '' },
      { slug: 'done.md', title: 'Done', kind: 'page', site: 'ms3', sites: ['ms3'], status: 'reviewed', at: '2026-09-25', by: 'Dr Test', risk: { kind: 'general', level: 'low' }, reason: '' },
    ],
    qbank: [
      { id: 'qb_mood_001', status: 'draft', revision: REV, assessment: { gate: 'ready', blockers: [], warnings: [] }, stem: 'S', options: [], category: 'mood', difficulty: 2, pages: [], evidence: '' },
    ],
  };
}
function changes() {
  return {
    view: 'changes', groups: [
      { id: 'pr:813', pr: 813, sha: 'abc', title: 'WP-9 citations', date: '2026-09-25', url: 'https://x/813', slugs: ['t_mood.md', 't_sud.md'] },
      { id: 'pr:765', pr: 765, sha: 'def', title: 'WP-8', date: '2026-09-24', url: 'https://x/765', slugs: ['t_sud.md'] },
    ],
    unexplained: ['mse.html'], unchecked: [], pages: {},
  };
}

test('phoneQueue keeps only items that need review, questions included', () => {
  const q = phoneQueue(server());
  assert.deepEqual(q.map(i => i.key).sort(), [
    'page:cotw_20260831_catatonia_ms3.md', 'page:cotw_20260831_catatonia_res.md', 'page:t_mood.md', 'page:t_sud.md',
    'question:qb_mood_001', 'tool:mse.html',
  ]);
});

test('groupQueue: corrections first (largest first), then no-text-change, then the rest; a slug named by two groups is placed once', () => {
  const items = phoneQueue(server());
  const sections = groupQueue(items, changes());
  assert.deepEqual(sections.map(s => [s.id, s.items.map(i => i.identity)]), [
    ['pr:813', ['t_mood.md', 't_sud.md']],
    ['no-text-change', ['mse.html']],
    ['pending', ['cotw_20260831_catatonia_ms3.md', 'cotw_20260831_catatonia_res.md', 'qb_mood_001']],
  ]);
  assert.equal(sections[0].title, '#813 WP-9 citations');
});

test('groupQueue without a changes view puts everything under pending', () => {
  const sections = groupQueue(phoneQueue(server()), null);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, 'pending');
});

test('reviewReason prefers the drift reason, then the pending reason, then a default', () => {
  const items = phoneQueue(server());
  const by = k => items.find(i => i.key === k);
  assert.equal(reviewReason(by('page:t_mood.md')), STALE);
  assert.equal(reviewReason(by('tool:mse.html')), 'New tool awaiting review');
  assert.equal(reviewReason(by('page:cotw_20260831_catatonia_ms3.md')), 'Pending faculty review');
  assert.equal(reviewReason(by('question:qb_mood_001')), 'Draft question awaiting attestation');
});

test('nextAfterSign: twin first, then the same group, then the next pending page or tool, never a question', () => {
  const items = phoneQueue(server());
  const sections = groupQueue(items, changes());
  assert.equal(nextAfterSign('page:cotw_20260831_catatonia_ms3.md', items, sections), 'page:cotw_20260831_catatonia_res.md');
  assert.equal(nextAfterSign('page:t_mood.md', items, sections), 'page:t_sud.md');
  assert.equal(nextAfterSign('page:t_sud.md', items, sections), 'page:t_mood.md');   // wraps within the group
  assert.equal(nextAfterSign('tool:mse.html', items, sections), 'page:cotw_20260831_catatonia_ms3.md');   // falls through to the first pending page/tool in sorted order
  const onlyQuestion = items.filter(i => i.type === 'question' || i.key === 'tool:mse.html');
  assert.equal(nextAfterSign('tool:mse.html', onlyQuestion, groupQueue(onlyQuestion, null)), null);
});

test('applyRows updates the matching items in place and drops the stale flag; unknown slugs are ignored', () => {
  const next = applyRows(server(), {
    't_mood.md': { status: 'reviewed', at: '2026-09-26', by: 'Dr Test', risk: { kind: 'clinical', level: 'high' }, reason: '' },
    'ghost.md': { status: 'reviewed', at: '2026-09-26', by: 'Dr Test', risk: null, reason: '' },
  });
  const mood = next.items.find(i => i.slug === 't_mood.md');
  assert.equal(mood.status, 'reviewed');
  assert.equal(mood.at, '2026-09-26');
  assert.equal('stale' in mood, false);
  assert.equal(mood.reason, '');
  assert.equal(next.items.length, server().items.length);
  assert.equal(next.items.some(i => i.slug === 'ghost.md'), false);
  assert.deepEqual(applyRows(server(), undefined), server());
});

test('diffLines flattens hunks into file / context / del / add lines, splitting change rows', () => {
  const diff = { view: 'diff', files: [
    { path: 'a.md', status: 'modified', hunks: [{ oldStart: 1, newStart: 1, rows: [
      { kind: 'context', segments: [{ t: 'eq', s: 'Unchanged line' }] },
      { kind: 'change', segments: [{ t: 'eq', s: 'Dose ' }, { t: 'del', s: 'is 10' }, { t: 'add', s: 'varies' }] },
      { kind: 'del', segments: [{ t: 'del', s: 'Removed line' }] },
      { kind: 'add', segments: [{ t: 'add', s: 'Added line' }] },
    ] }] },
    { path: 'b.md', status: 'unchanged', hunks: [] },
  ] };
  assert.deepEqual(diffLines(diff), [
    { kind: 'file', text: 'a.md' },
    { kind: 'context', text: 'Unchanged line' },
    { kind: 'del', text: 'Dose is 10' },
    { kind: 'add', text: 'Dose varies' },
    { kind: 'del', text: 'Removed line' },
    { kind: 'add', text: 'Added line' },
  ]);
  assert.deepEqual(diffLines(null), []);
});

test('diffLines never erases a changed file: too-large, binary and truncated files emit their file line and a note', () => {
  const big = { view: 'diff', files: [{ path: 'huge.md', status: 'modified', hunks: [], tooLarge: true }] };
  assert.deepEqual(diffLines(big), [
    { kind: 'file', text: 'huge.md' },
    { kind: 'note', text: 'Too much changed to show here; open the comparison on GitHub.' },
  ]);
  const bin = { view: 'diff', files: [{ path: 'img.png', status: 'binary', hunks: [] }] };
  assert.deepEqual(diffLines(bin), [{ kind: 'file', text: 'img.png' }, { kind: 'note', text: 'Binary file changed.' }]);
  const cut = { view: 'diff', files: [{ path: 'a.md', status: 'modified', truncated: true, hunks: [{ oldStart: 1, newStart: 1, rows: [
    { kind: 'add', segments: [{ t: 'add', s: 'New' }] },
  ] }] }] };
  assert.deepEqual(diffLines(cut), [
    { kind: 'file', text: 'a.md' }, { kind: 'add', text: 'New' }, { kind: 'note', text: 'Only the first 60 hunks are shown.' },
  ]);
  assert.deepEqual(diffLines({ files: [{ path: 'same.md', status: 'unchanged', hunks: [] }] }), []);
});

test('timeoutStatus mirrors the desktop: protocol_unavailable once the frame loaded, else frame_failure', () => {
  assert.equal(timeoutStatus(true), 'protocol_unavailable');
  assert.equal(timeoutStatus(false), 'frame_failure');
});

test('contentEligibility is false until the preview is ready and all three acknowledgements are set', () => {
  const item = phoneQueue(server()).find(i => i.key === 'page:t_mood.md');
  assert.equal(contentEligibility(item, { previewStatus: 'loading' }).eligible, false);
  assert.equal(contentEligibility(item, { previewStatus: 'ready' }).eligible, false);
  assert.equal(contentEligibility(item, { previewStatus: 'ready', completeItemReviewed: true, accuracy: true, interactions: true }).eligible, true);
  // A failed preview needs the separate-tab acknowledgement instead.
  assert.equal(contentEligibility(item, { previewStatus: 'frame_failure', retryAttempted: true, separateTabReviewed: true, accuracy: true, interactions: true }).eligible, true);
  assert.equal(contentEligibility(item, { previewStatus: 'frame_failure', accuracy: true, interactions: true }).eligible, false);
});

test('questionEligibility needs the live receipt, the saved-revision receipt and the three confirmations; questionEntry mirrors the desktop body', () => {
  const q = phoneQueue(server()).find(i => i.type === 'question');
  const ok = { previewStatus: 'ready', liveReviewed: true, reviewedRevision: REV, clinical: true, evidence: true, originalityAndNoPhi: true };
  assert.equal(questionEligibility(q, ok).eligible, true);
  assert.equal(questionEligibility(q, { ...ok, reviewedRevision: '' }).eligible, false);
  assert.equal(questionEligibility(q, { ...ok, clinical: false }).eligible, false);
  assert.deepEqual(questionEntry(q, REV), { id: 'qb_mood_001', revision: REV, reviewedRevision: REV, acknowledgedWarnings: [] });
  // The receipt is carried, never echoed: a stale or missing receipt reaches the server and is rejected there.
  assert.equal(questionEntry(q, 'stale').reviewedRevision, 'stale');
  assert.equal(questionEntry(q, undefined).reviewedRevision, '');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test faculty-console/m-model.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module './m/m-model.mjs'`.

- [ ] **Step 3: Write the module**

Create `faculty-console/m/m-model.mjs`:

```js
/* Phone attestation client — pure model. Everything here is deterministic and unit-tested;
   the DOM layer (m.mjs) only calls these. Reuses the desktop's review-model rules so the two
   clients cannot disagree about what needs review, what a twin is, or when Attest is allowed. */
import {
  deriveAttestationEligibility, normalizeReviewItems, twinOf,
} from '../review-model.mjs';

export const NEEDS_REVIEW = 'needs-review';
const PREVIEW_FAILED = new Set(['not_found', 'error', 'protocol_unavailable', 'frame_failure']);

/** Items the phone lists: every page, tool and question whose completion is needs-review. */
export function phoneQueue(server) {
  return normalizeReviewItems(server || {}).filter(item => item.completion === NEEDS_REVIEW);
}

function groupTitle(group) {
  const title = typeof group.title === 'string' ? group.title.trim() : '';
  if (Number.isInteger(group.pr)) return `#${group.pr}${title ? ` ${title}` : ''}`;
  return title || String(group.id || 'Correction');
}

/**
 * Sections in spec order: one per correction from ?view=changes (server order = largest first),
 * then "No text change" (unexplained drift), then everything else. A slug named by two groups
 * lands once, in the first group that names it. Questions always fall to the last section.
 */
export function groupQueue(items, changes) {
  const list = Array.isArray(items) ? items : [];
  const bySlug = new Map(list.filter(i => i.type !== 'question').map(i => [i.identity, i]));
  const placed = new Set();
  const sections = [];
  const groups = Array.isArray(changes?.groups) ? changes.groups : [];
  for (const group of groups) {
    const members = (Array.isArray(group.slugs) ? group.slugs : [])
      .map(slug => bySlug.get(slug))
      .filter(item => item && !placed.has(item.key));
    if (!members.length) continue;
    members.forEach(item => placed.add(item.key));
    sections.push({ id: String(group.id), title: groupTitle(group), items: members });
  }
  const unexplained = new Set(Array.isArray(changes?.unexplained) ? changes.unexplained : []);
  const noText = list.filter(i => i.type !== 'question' && !placed.has(i.key) && unexplained.has(i.identity));
  if (noText.length) {
    noText.forEach(item => placed.add(item.key));
    sections.push({ id: 'no-text-change', title: 'No text change', items: noText });
  }
  const rest = list.filter(i => !placed.has(i.key));
  if (rest.length) sections.push({ id: 'pending', title: 'Also needing review', items: rest });
  return sections;
}

/** One line under a queue row: why it needs review. */
export function reviewReason(item) {
  const record = item?.record && typeof item.record === 'object' ? item.record : {};
  if (typeof record.reason === 'string' && record.reason.trim()) return record.reason.trim();
  return item?.type === 'question' ? 'Draft question awaiting attestation' : 'Pending faculty review';
}

/** Desktop order: the twin, then the next item in the same section (wrapping), then the first pending page/tool. */
export function nextAfterSign(signedKey, items, sections) {
  const list = Array.isArray(items) ? items : [];
  const signed = list.find(i => i.key === signedKey);
  if (!signed) return null;
  const content = i => i.type !== 'question' && i.completion === NEEDS_REVIEW && i.key !== signedKey;
  const twin = twinOf(signed, list);
  if (twin && content(twin)) return twin.key;
  const section = (sections || []).find(s => s.items.some(i => i.key === signedKey));
  if (section) {
    const idx = section.items.findIndex(i => i.key === signedKey);
    const ordered = [...section.items.slice(idx + 1), ...section.items.slice(0, idx)];
    const next = ordered.find(content);
    if (next) return next.key;
  }
  const rest = list.find(content);
  return rest ? rest.key : null;
}

/** Apply the write's rows to the loaded payload: same items array, updated entries, stale dropped. */
export function applyRows(server, rows) {
  if (!server || !rows || typeof rows !== 'object') return server;
  const items = (Array.isArray(server.items) ? server.items : []).map(item => {
    const row = rows[item.slug];
    if (!row || typeof row !== 'object') return item;
    const { stale, ...rest } = item;
    return {
      ...rest,
      status: row.status,
      at: typeof row.at === 'string' ? row.at : '',
      by: typeof row.by === 'string' ? row.by : '',
      risk: row.risk ?? item.risk ?? null,
      reason: typeof row.reason === 'string' ? row.reason : '',
    };
  });
  return { ...server, items };
}

/**
 * Flatten a ?view=diff payload for a phone screen. Change rows split into a del line and an add
 * line. A changed file ALWAYS emits its file line: the server sends `hunks: []` with `tooLarge`
 * for files over 6,000 lines or an edit distance over 2,000, and `binary` for images, and a
 * reviewer about to sign must never be told "no text change" for such a page.
 */
export function diffLines(diff) {
  const out = [];
  for (const file of Array.isArray(diff?.files) ? diff.files : []) {
    if (file.status === 'unchanged' || file.status === 'missing') continue;
    out.push({ kind: 'file', text: String(file.path || '') });
    if (file.tooLarge === true) out.push({ kind: 'note', text: 'Too much changed to show here; open the comparison on GitHub.' });
    if (file.status === 'binary') out.push({ kind: 'note', text: 'Binary file changed.' });
    for (const hunk of Array.isArray(file.hunks) ? file.hunks : []) {
      for (const row of Array.isArray(hunk.rows) ? hunk.rows : []) {
        const segs = Array.isArray(row.segments) ? row.segments : [];
        const before = segs.filter(s => s.t !== 'add').map(s => s.s).join('');
        const after = segs.filter(s => s.t !== 'del').map(s => s.s).join('');
        if (row.kind === 'context') { out.push({ kind: 'context', text: before }); continue; }
        if (row.kind !== 'add' && before) out.push({ kind: 'del', text: before });
        if (row.kind !== 'del' && after) out.push({ kind: 'add', text: after });
      }
    }
    if (file.truncated === true) out.push({ kind: 'note', text: 'Only the first 60 hunks are shown.' });
  }
  return out;
}

/** After the 10 s readiness window: the desktop's two outcomes. */
export function timeoutStatus(frameLoaded) {
  return frameLoaded ? 'protocol_unavailable' : 'frame_failure';
}

/** Content (page/tool) eligibility from the phone's UI flags; the rule itself is the desktop's. */
export function contentEligibility(item, ui = {}) {
  return deriveAttestationEligibility({
    item,
    previewStatus: ui.previewStatus || 'loading',
    retryAttempted: ui.retryAttempted === true,
    completeItemReviewed: ui.completeItemReviewed === true,
    separateTabReviewed: ui.separateTabReviewed === true,
    contentChecks: { accuracy: ui.accuracy === true, interactions: ui.interactions === true },
  });
}

/** Question eligibility: live receipt (or acknowledged unavailability after a retry), saved-revision receipt, confirmations. */
export function questionEligibility(item, ui = {}) {
  const status = ui.previewStatus || 'loading';
  return deriveAttestationEligibility({
    item,
    dirty: false,
    previewStatus: status,
    assessment: item?.record?.assessment,
    liveReviewed: ui.liveReviewed === true,
    retryAttempted: ui.retryAttempted === true,
    liveUnavailableAcknowledged: PREVIEW_FAILED.has(status) && ui.liveUnavailableAcknowledged === true,
    reviewedRevision: typeof ui.reviewedRevision === 'string' ? ui.reviewedRevision : '',
    warningAcks: new Set(),
    confirmations: {
      clinical: ui.clinical === true,
      evidence: ui.evidence === true,
      originalityAndNoPhi: ui.originalityAndNoPhi === true,
    },
  });
}

/**
 * The entry the server validates for qbank.attest. `reviewedRevision` is the receipt the reviewer
 * recorded when they read the saved draft (state.ui.reviewedRevision) — carried, never echoed from
 * the item, so the server's reviewedRevision === revision check can fail for the phone exactly as
 * it can for the desktop. The phone never acknowledges warnings (no Attest for warned items).
 */
export function questionEntry(item, reviewedRevision) {
  return {
    id: item.identity,
    revision: item.revision,
    reviewedRevision: typeof reviewedRevision === 'string' ? reviewedRevision : '',
    acknowledgedWarnings: [],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test faculty-console/m-model.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)'`
Expected: `# fail 0`. If `contentEligibility` or `questionEligibility` cases fail, read `deriveAttestationEligibility` at `faculty-console/review-model.mjs:383-423` and adjust the **context keys** passed (not the test's expectations): the blocker codes it returns name exactly which flag is missing.

Also run: `node --test faculty-console/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'` — Expected `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add faculty-console/m/m-model.mjs faculty-console/m-model.test.mjs
git commit -m "feat(console/m): pure phone model — queue grouping, advance order, applying write rows, diff lines

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Phone shell — key gate, state load, queue screen

**Files:**
- Create: `faculty-console/m/index.html`
- Create: `faculty-console/m/m.mjs`
- Modify: `tests/smoke/faculty-console.spec.js` (append a `test.describe('phone client', …)`)

**Interfaces:**
- Consumes: `phoneQueue`, `groupQueue`, `reviewReason` from `./m-model.mjs`; `parseDeepLink`, `deriveReviewCounts` from `../review-model.mjs`; `GET /api/attest`, `GET /api/attest?view=changes`.
- Produces (module-internal, used by Tasks 4–6): `state` `{ key, server, items, sections, changes, selectedKey, screen:'queue'|'item', preview, ui, pending, receipt, message }`; `api(path, init)`; `load({ silent })`; `render()`; `openItem(key)`; `h(tag, attrs, children)`.

- [ ] **Step 1: Write the failing smoke test**

Append to `tests/smoke/faculty-console.spec.js` (after the last existing test):

```js
// ---- Phone client (/m/) ----------------------------------------------------------------
// A second front-end on the same origin (spec: docs/superpowers/specs/2026-09-26-mobile-
// attestation-console-design.md). Same key, same API, same one-slug-per-press rule.
const PHONE = { width: 390, height: 844 };

async function unlockPhone(page, { path = '/m/' } = {}) {
  await page.addInitScript(() => {
    window.__facultyConsolePreviewMessages = [];
    window.addEventListener('message', event => {
      if (event.data?.type === 'faculty-preview-status') {
        window.__facultyConsolePreviewMessages.push(structuredClone(event.data));
      }
    });
  });
  await page.goto(path);
  await expect(page).toHaveTitle('Faculty attestation — phone');
  await expect(page.getByLabel('Faculty key')).toBeFocused();
  await page.getByLabel('Faculty key').fill(FACULTY_KEY);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
}

test.describe('phone client', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test('unlocks with the shared key, sends it only as a header, and lists the queue grouped', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, {
      view: 'changes', branch: 'main', generatedAt: '2026-09-26T00:00:00.000Z', drifted: 1, partial: false,
      groups: [{ id: 'pr:813', pr: 813, sha: 'a'.repeat(40), title: 'WP-9 citations', date: '2026-09-25', url: 'https://github.example/pull/813', slugs: ['t_mood.md'] }],
      unexplained: [], unchecked: [], pages: { 't_mood.md': { title: 'Synthetic mood disorders page', kind: 'page', at: '', changes: [{ id: 'pr:813', sameDay: false }] } },
    }));
    await unlockPhone(page);
    expect(api.calls.every(call => call.key === FACULTY_KEY)).toBe(true);
    expect(page.url().includes(FACULTY_KEY)).toBe(false);
    await expect(page.getByRole('heading', { name: '#813 WP-9 citations' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Also needing review' })).toBeVisible();
    const rows = page.getByRole('link', { name: /Synthetic|Catatonia/ });
    await expect(rows).toHaveCount(4);
    await expect(page.getByText(/needs? review/)).toBeVisible();
    // No horizontal scroll at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Search filters the groups without stealing focus from the box.
    const search = page.getByLabel('Search the queue');
    await search.click();
    await search.pressSequentially('cat');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('cat');
    await expect(page.getByRole('link', { name: /Catatonia/ })).toHaveCount(2);
    await expect(page.getByRole('link', { name: /Synthetic/ })).toHaveCount(0);
  });

  test('a failed first load shows the message and a Retry, never a bare key gate', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    let gets = 0;
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() !== 'GET' || gets++ > 0) return route.fallback();
      await fulfillJson(route, 503, { error: { code: 'github_unavailable', message: 'upstream down' } });
    });
    await page.goto('/m/');
    await page.getByLabel('Faculty key').fill(FACULTY_KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not reach the repository');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
  });

  test('a wrong key is refused, cleared, and re-prompted without leaking into storage', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.goto('/m/');
    await page.getByLabel('Faculty key').fill('not-the-key');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Key not accepted');
    expect(await page.evaluate(() => window.sessionStorage.getItem('fac_key'))).toBeNull();
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  });
});
```

Also, in `installRepositoryApi`'s content-POST branch (the `receipt` object around L482-487), extend the receipt so later tasks can consume it:

```js
        const receipt = {
          ok: true,
          updated: 1,
          commit: `https://github.example/commit/faculty-${++commitNumber}`,
          rows: {
            [slug]: {
              status: reviewed ? 'reviewed' : 'unreviewed',
              at: reviewed ? '2026-07-17' : '',
              by: reviewed ? SERVER_ATTESTER : 'Pending faculty review',
              risk: item.risk ?? null,
              reason: reviewed ? '' : (body.reasons?.[slug] || ''),
            },
          },
        };
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Start the local servers once for the whole plan (they serve `faculty-console/` on 4202 and the two built sites on 4200/4201; the sites must be built first):

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3 && bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
bash tests/smoke/start-local-servers.sh --print-config   # shows the ports; leave the servers running per its usage line
cd tests/smoke && npm ci && npx playwright test --project=faculty-console -g "phone client" 2>&1 | tail -20
```

Expected: FAIL — `/m/` is a 404 (no `index.html` yet).

- [ ] **Step 3: Create the shell**

Create `faculty-console/m/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#1f3d2e">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<title>Faculty attestation — phone</title>
<style>
  :root {
    color-scheme: light;
    --canvas: #eef2ef; --surface: #ffffff; --ink: #1d2a24; --muted: #5b6b63; --line: #cfd8d2;
    --primary: #1f3d2e; --primary-ink: #ffffff; --warn: #8a5a00; --danger: #8b1e1e; --ok: #1d6b3a;
    --del: #fbe4e4; --add: #e3f5e8;
    --safe-b: env(safe-area-inset-bottom, 0px);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--canvas); color: var(--ink);
    font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { min-height: 100dvh; }
  #m-app { display: flex; flex-direction: column; min-height: 100dvh; }
  header.bar { position: sticky; top: 0; z-index: 2; background: var(--primary); color: var(--primary-ink);
    padding: .75rem 1rem; display: flex; align-items: center; gap: .75rem; }
  header.bar h1 { font-size: 1.05rem; margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header.bar button, header.bar a { color: inherit; background: transparent; border: 1px solid rgba(255,255,255,.5);
    border-radius: 999px; padding: .35rem .8rem; font-size: .9rem; text-decoration: none; }
  .screen { flex: 1; display: flex; flex-direction: column; }
  .gate { margin: auto; width: min(100%, 26rem); padding: 1.5rem; }
  .gate label { display: block; font-weight: 600; margin-bottom: .35rem; }
  .gate input { width: 100%; font-size: 1.1rem; padding: .7rem .8rem; border: 1px solid var(--line); border-radius: .6rem; }
  .btn { appearance: none; border: 0; border-radius: .7rem; padding: .85rem 1rem; font-size: 1rem; font-weight: 600;
    background: var(--primary); color: var(--primary-ink); width: 100%; min-height: 44px; }
  .btn.secondary { background: var(--surface); color: var(--primary); border: 1px solid var(--line); }
  .btn[disabled] { opacity: .45; }
  .field-error { color: var(--danger); margin: .75rem 0 0; }
  .summary { padding: .75rem 1rem; color: var(--muted); font-size: .95rem; }
  .search { padding: 0 1rem .5rem; }
  .search input { width: 100%; padding: .6rem .8rem; border: 1px solid var(--line); border-radius: .6rem; font-size: 1rem; }
  section.group h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted);
    margin: 1rem 1rem .35rem; }
  ul.rows { list-style: none; margin: 0; padding: 0 .75rem; display: grid; gap: .5rem; }
  ul.rows a { display: block; background: var(--surface); border: 1px solid var(--line); border-radius: .8rem;
    padding: .75rem .9rem; color: inherit; text-decoration: none; min-height: 44px; }
  ul.rows .title { font-weight: 600; }
  ul.rows .meta { color: var(--muted); font-size: .85rem; margin-top: .15rem; display: flex; gap: .5rem; flex-wrap: wrap; }
  ul.rows .why { font-size: .85rem; margin-top: .25rem; }
  .pill { display: inline-block; border-radius: 999px; padding: .1rem .55rem; font-size: .75rem; border: 1px solid var(--line); background: var(--surface); }
  .pill.high { border-color: var(--danger); color: var(--danger); }
  .pill.moderate { border-color: var(--warn); color: var(--warn); }
  .pill.ok { border-color: var(--ok); color: var(--ok); }
  .item { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .status { padding: .4rem 1rem; font-size: .85rem; color: var(--muted); display: flex; gap: .5rem; align-items: center; }
  .frame-wrap { flex: 1; min-height: 0; background: var(--surface); position: relative; }
  .frame-wrap iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .frame-note { padding: 1rem; }
  nav.actions { position: sticky; bottom: 0; background: var(--surface); border-top: 1px solid var(--line);
    padding: .6rem .75rem calc(.6rem + var(--safe-b)); display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: .5rem; }
  nav.actions .btn { padding: .7rem .5rem; font-size: .95rem; }
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 5; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 6; background: var(--surface);
    border-radius: 1rem 1rem 0 0; padding: 1rem 1rem calc(1rem + var(--safe-b)); max-height: 85dvh; overflow: auto; }
  .sheet h2 { margin: 0 0 .5rem; font-size: 1.1rem; }
  .sheet .lines { font-size: .9rem; white-space: pre-wrap; word-break: break-word; }
  .sheet .lines .file { font-weight: 700; margin-top: .75rem; color: var(--muted); }
  .sheet .lines .del { background: var(--del); text-decoration: line-through; padding: .1rem .2rem; }
  .sheet .lines .add { background: var(--add); padding: .1rem .2rem; }
  .sheet .lines .context { color: var(--muted); }
  .sheet .lines .note { font-style: italic; color: var(--muted); margin: .25rem 0; }
  .ack { display: flex; gap: .6rem; align-items: flex-start; padding: .55rem 0; border-top: 1px solid var(--line); }
  .ack input { width: 22px; height: 22px; margin: .1rem 0 0; flex: none; }
  .receipt { background: var(--add); border-radius: .8rem; padding: .75rem 1rem; margin: .75rem; }
  .draft h3 { margin: .75rem 0 .25rem; font-size: .95rem; }
  .draft ol { padding-left: 1.25rem; }
  .draft .key { font-weight: 700; }
  [hidden] { display: none !important; }
  @media (min-width: 900px) { .gate, .screen { max-width: 40rem; margin: 0 auto; width: 100%; } }
</style>
</head>
<body>
<main id="m-app"></main>
<script type="module" src="./m.mjs"></script>
</body>
</html>
```

Create `faculty-console/m/m.mjs` with the key gate, API helpers, loader and queue screen (Tasks 4–6 add the item screen, sheets and attest in the marked places):

```js
/* Phone attestation client. Same origin, same key, same /api/attest function as the desktop
   console (../app.mjs). Rules come from ../review-model.mjs and ./m-model.mjs; this file is DOM
   only. Spec: docs/superpowers/specs/2026-09-26-mobile-attestation-console-design.md */
import {
  buildExternalReviewUrl, buildPreviewRequest, createReviewToken, deriveReviewCounts,
  matchesPreviewStatus, parseDeepLink, twinOf,
} from '../review-model.mjs';
import {
  applyRows, contentEligibility, diffLines, groupQueue, nextAfterSign, phoneQueue,
  questionEligibility, questionEntry, reviewReason, timeoutStatus,
} from './m-model.mjs';

const API = '/api/attest';
const KEY_STORAGE = 'fac_key';                 // identical to the desktop: one key, one tab
const PREVIEW_SANDBOX = 'allow-scripts allow-same-origin allow-forms';
const PREVIEW_TIMEOUT_MS = 10_000;
const REFRESH_QUIET_MS = 30_000;

const state = {
  server: null,        // last GET payload (items, qbank, attester, student, resident, manifestRevision…)
  changes: null,       // last ?view=changes payload, or null
  items: [],           // phoneQueue(server)
  sections: [],        // groupQueue(items, changes)
  screen: 'queue',     // 'queue' | 'item'
  selectedKey: null,
  search: '',
  preview: null,       // { request, status, frameLoaded, frameWindow, timerId, attempt }
  ui: {},              // acknowledgement flags for the selected item
  sheet: null,         // null | 'changed' | 'confirm' | 'draft'
  diff: null,          // last ?view=diff payload for the selected item
  pending: false,      // a POST is in flight
  receipt: null,       // { commit, pullRequest, pullRequestError, title }
  message: '',         // one-line error shown above the actions
  deepLink: null,      // ?item= held in memory across the key prompt
  refreshTimer: null,
  reauth: null,        // () => Promise, retried after re-entering the key
};

// ---- tiny DOM helper ---------------------------------------------------------------------
function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'text') node.textContent = String(value);
    else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(name, '');
    else node.setAttribute(name, String(value));
  }
  for (const child of (Array.isArray(children) ? children : [children]).flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
const app = () => document.getElementById('m-app');
function replaceApp(...children) { const root = app(); root.replaceChildren(...children); return root; }

// ---- key + api ----------------------------------------------------------------------------
function getKey() { try { return window.sessionStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
function setKey(value) { try { window.sessionStorage.setItem(KEY_STORAGE, value); } catch { /* private mode */ } }
function clearKey() { try { window.sessionStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ } }

function headers(withBody = false) {
  const out = { 'x-faculty-key': getKey() };
  if (withBody) out['Content-Type'] = 'application/json';
  return out;
}
async function json(response) { try { return await response.json(); } catch { return {}; } }
function errorText(payload, fallback) {
  const code = typeof payload?.error?.code === 'string' ? payload.error.code : '';
  const message = typeof payload?.error?.message === 'string' ? payload.error.message
    : typeof payload?.error === 'string' ? payload.error : fallback;
  return code ? `${code}: ${message}` : message;
}
class Unauthorized extends Error {}

/** GET/POST against /api/attest. A 401 throws Unauthorized after clearing the key. */
async function api(path, init = {}) {
  const response = await fetch(path, { ...init, headers: { ...headers(Boolean(init.body)), ...(init.headers || {}) } });
  if (response.status === 401) { clearKey(); throw new Unauthorized('Key not accepted. Check the shared faculty key and try again.'); }
  const payload = await json(response);
  if (response.status >= 500) throw new Error('Could not reach the repository.');   // spec §8 wording
  if (!response.ok) throw new Error(errorText(payload, `The server answered ${response.status}.`));
  return payload;
}

// ---- load ---------------------------------------------------------------------------------
function validServerState(server) {
  return Boolean(server && Array.isArray(server.items) && Array.isArray(server.qbank)
    && typeof server.student === 'string' && typeof server.manifestRevision === 'string');
}
function recompute() {
  state.items = phoneQueue(state.server);
  state.sections = groupQueue(state.items, state.changes);
}
async function load({ silent = false } = {}) {
  if (!getKey()) { renderGate(); return false; }
  // Offline: report in place — a loaded queue or item stays readable (spec §8); render() shows the
  // error screen only when nothing has loaded yet.
  if (navigator.onLine === false) { state.message = 'You are offline.'; render(); return false; }
  if (!silent) renderBusy('Loading the review queue…');
  try {
    const server = await api(API);
    if (!validServerState(server)) throw new Error('The server returned an incomplete state.');
    state.server = server;
    try { state.changes = await api(`${API}?${new URLSearchParams({ view: 'changes' })}`); }
    catch (error) { if (error instanceof Unauthorized) throw error; state.changes = null; }
    recompute();
    if (state.deepLink) {
      const target = parseDeepLink(state.deepLink, state.items);
      state.deepLink = null;
      if (target) { openItem(target.key); return true; }
      state.message = 'That item is not in the current queue.';
    }
    render();
    return true;
  } catch (error) {
    if (error instanceof Unauthorized) { state.reauth = () => load(); renderGate(error.message); return false; }
    if (!state.server) { renderLoadError(error.message); return false; }   // spec §8: message + Retry, never a bare key gate
    state.message = error.message;
    render();
    return false;
  }
}
function scheduleRefresh() {
  if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => { state.refreshTimer = null; void load({ silent: true }); }, REFRESH_QUIET_MS);
}

// ---- screens ------------------------------------------------------------------------------
function bar(title, { back = false } = {}) {
  return h('header', { class: 'bar' }, [
    back ? h('button', { type: 'button', text: 'Queue', onClick: () => { closeItem(); } }) : null,
    h('h1', { text: title }),
    h('button', { type: 'button', text: 'Lock', 'aria-label': 'Lock the console', onClick: () => { clearKey(); state.server = null; renderGate(); } }),
  ]);
}

function renderGate(message = '') {
  const input = h('input', { id: 'faculty-key', type: 'password', autocomplete: 'current-password', required: true, inputmode: 'text' });
  const form = h('form', { class: 'gate', onSubmit: event => {
    event.preventDefault();
    setKey(input.value);
    const retry = state.reauth; state.reauth = null;
    void (retry ? retry() : load());
  } }, [
    h('h1', { text: 'Faculty attestation' }),
    h('p', { text: 'Enter the shared faculty key. It stays in this tab and is cleared when the tab closes.' }),
    h('label', { for: 'faculty-key', text: 'Faculty key' }),
    input,
    message ? h('p', { class: 'field-error', role: 'alert', text: message }) : null,
    h('p', {}, h('button', { class: 'btn', type: 'submit', text: 'Unlock' })),
  ]);
  replaceApp(h('div', { class: 'screen' }, form));
  input.focus();
}
function renderBusy(text) { replaceApp(bar('Faculty attestation'), h('div', { class: 'screen' }, h('p', { class: 'summary', role: 'status', text }))); }
/** A first load that fails must say why and offer Retry (spec §8); the bar's Lock remains the way out. */
function renderLoadError(message) {
  replaceApp(bar('Faculty attestation'), h('div', { class: 'screen' }, [
    h('p', { class: 'field-error summary', role: 'alert', text: message }),
    h('p', { class: 'summary' }, h('button', { class: 'btn', type: 'button', text: 'Retry', onClick: () => { void load(); } })),
  ]));
}

function riskPill(item) {
  const level = item.risk?.level || '';
  return level ? h('span', { class: `pill ${level}`, text: `${level} risk` }) : null;
}
function siteLabel(item) { return item.site === 'res' ? 'Residents' : 'MS3'; }

function queueRows(sections) {
  return sections.map(section => h('section', { class: 'group' }, [
    h('h2', { text: section.title }),
    h('ul', { class: 'rows' }, section.items.map(item => h('li', {}, h('a', { href: `?item=${encodeURIComponent(item.key)}`,
      onClick: event => { event.preventDefault(); openItem(item.key); } }, [
      h('div', { class: 'title', text: item.title }),
      h('div', { class: 'meta' }, [h('span', { class: 'pill', text: item.type }), h('span', { text: siteLabel(item) }), riskPill(item)]),
      h('div', { class: 'why', text: reviewReason(item) }),
    ])))),
  ]));
}
function visibleSections() {
  const term = state.search.trim().toLowerCase();
  return state.sections
    .map(section => ({ ...section, items: section.items.filter(i => !term || i.searchText.includes(term)) }))
    .filter(section => section.items.length);
}
/** Re-render only the groups: the search box keeps focus and its caret while the reviewer types. */
function refreshQueueGroups() {
  const groups = document.getElementById('queue-groups');
  if (!groups) return;
  const sections = visibleSections();
  groups.replaceChildren(...queueRows(sections), ...(sections.length ? [] : [h('p', { class: 'summary', text: 'Nothing needs review.' })]));
}
function renderQueue() {
  const counts = deriveReviewCounts(state.items);
  const search = h('input', { type: 'search', placeholder: 'Search titles', value: state.search, 'aria-label': 'Search the queue',
    onInput: event => { state.search = event.target.value; refreshQueueGroups(); } });
  replaceApp(
    bar('Faculty attestation'),
    h('div', { class: 'screen' }, [
      h('h2', { class: 'summary', text: 'Needs review' }),
      h('p', { class: 'summary', role: 'status', text: `${counts.page} page${counts.page === 1 ? '' : 's'} · ${counts.tool} tool${counts.tool === 1 ? '' : 's'} · ${counts.question} question${counts.question === 1 ? '' : 's'} need review` }),
      state.message ? h('p', { class: 'field-error summary', role: 'alert', text: state.message }) : null,
      h('div', { class: 'search' }, search),
      h('div', { id: 'queue-groups' }),
    ]),
  );
  refreshQueueGroups();
  // The shareable link is rebuilt from the selected item only; on the queue it carries nothing.
  window.history.replaceState(null, '', window.location.pathname);
}

function render() {
  if (!getKey()) { renderGate(); return; }
  if (!state.server) { renderLoadError(state.message || 'The review queue has not loaded yet.'); return; }
  if (state.screen === 'item' && state.selectedKey) { renderItem(); return; }
  renderQueue();
}

// ---- item screen (Task 4), sheets + attest (Tasks 5–6) ------------------------------------
function openItem(key) { state.selectedKey = key; state.screen = 'item'; state.ui = {}; state.sheet = null; state.diff = null; state.receipt = null; state.message = ''; beginPreview(); render(); }
function closeItem() { cancelPreview(); state.screen = 'queue'; state.selectedKey = null; state.sheet = null; render(); }
function selectedItem() { return state.items.find(i => i.key === state.selectedKey) || null; }
function beginPreview() { /* Task 4 */ }
function cancelPreview() { /* Task 4 */ }
function renderItem() { /* Task 4 */ }

// ---- boot ---------------------------------------------------------------------------------
state.deepLink = window.location.search.includes('item=') ? window.location.search : null;
window.addEventListener('message', event => { /* Task 4 wires handlePreviewStatus here */ if (typeof handlePreviewStatus === 'function') handlePreviewStatus(event); });
window.addEventListener('offline', () => { state.message = 'You are offline.'; render(); });
window.addEventListener('online', () => { state.message = ''; render(); });
void load();
```

- [ ] **Step 4: Run the smoke tests to verify they pass**

Run: `cd tests/smoke && npx playwright test --project=faculty-console -g "phone client" 2>&1 | tail -20`
Expected: the two Task 3 tests pass. If the *grouped* test fails on the heading `#813 WP-9 citations`, check that the stubbed `?view=changes` route is registered **before** `unlockPhone` (Playwright matches the most recently added route first, and `installRepositoryApi` registers `**/api/attest`, which does not match the query URL).

Run the desktop suite too to prove nothing regressed: `npx playwright test --project=faculty-console 2>&1 | tail -3` → all passing.

- [ ] **Step 5: Commit**

```bash
git add faculty-console/m/index.html faculty-console/m/m.mjs tests/smoke/faculty-console.spec.js
git commit -m "feat(console/m): phone shell — key gate, state load, grouped queue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Item screen — learner page full-screen, readiness, What changed, Open in site

**Files:**
- Modify: `faculty-console/m/m.mjs` (replace the three Task-4 stubs; add sheets)
- Modify: `tests/smoke/faculty-console.spec.js` (two tests in the `phone client` describe)

**Interfaces:**
- Consumes: `buildPreviewRequest`, `buildExternalReviewUrl`, `createReviewToken`, `matchesPreviewStatus` (review-model); `diffLines`, `timeoutStatus`, `reviewReason` (m-model); `GET ?view=diff&slug=`.
- Produces: `state.preview.status ∈ {loading, ready, not_found, error, protocol_unavailable, frame_failure}`; `handlePreviewStatus(event)`; `renderItem()`; `openSheet(name)` / `closeSheet()`; `retryPreview()`; the bottom bar with **What changed**, **Open in site**, **Attest** (Attest wired in Task 5).

- [ ] **Step 1: Write the failing smoke tests**

Add inside `test.describe('phone client', …)`:

```js
  test('opening an item shows the learner page in a frame, reports Ready from the real learner shell, and What changed renders the diff', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await page.route('**/api/attest?view=diff&slug=t_mood.md', route => fulfillJson(route, 200, {
      view: 'diff', slug: 't_mood.md', since: '2026-09-21', base: 'a'.repeat(40), head: 'b'.repeat(40), commit: null, compareUrl: null,
      files: [{ path: '03_Core_Topics/Mood/mood.md', status: 'modified', changed: true, truncated: false, tooLarge: false, hunks: [{ oldStart: 1, newStart: 1, rows: [
        { kind: 'context', segments: [{ t: 'eq', s: 'Unchanged sentence.' }] },
        { kind: 'change', segments: [{ t: 'eq', s: 'Lithium ' }, { t: 'del', s: 'always' }, { t: 'add', s: 'usually' }, { t: 'eq', s: ' needs levels.' }] },
      ] }] }],
      record: [],
    }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic mood disorders page' })).toBeVisible();
    const frame = page.locator('iframe#learner-frame');
    await expect(frame).toHaveAttribute('src', /reviewKey=page%3At_mood\.md/);
    await expect(frame).toHaveAttribute('src', /reviewToken=[0-9a-f]{32}/);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    const box = await frame.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(0.6 * PHONE.height);            // the learner page fills the screen
    const actions = await page.getByRole('navigation', { name: 'Review actions' }).boundingBox();
    expect(actions.y + actions.height).toBeLessThanOrEqual(PHONE.height + 1);  // the action bar stays on screen
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get('item')).toBe('page:t_mood.md');
    await page.getByRole('button', { name: 'What changed' }).click();
    await expect(page.getByRole('dialog', { name: 'What changed since you signed' })).toBeVisible();
    await expect(page.getByText('Lithium always needs levels.')).toBeVisible();
    await expect(page.getByText('Lithium usually needs levels.')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    const openInSite = page.getByRole('link', { name: 'Open in site' });
    await expect(openInSite).toHaveAttribute('href', `${MS3_URL}/?page=t_mood.md`);
    await expect(openInSite).toHaveAttribute('target', '_blank');
  });

  test('a stale readiness message does not unlock Attest', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    // Forge a message with the right shape but the wrong token: the guard must ignore it.
    await page.evaluate(() => window.postMessage({ type: 'faculty-preview-status', status: 'not_found', surface: 'page', reviewKey: 'page:t_mood.md', reviewToken: 'f'.repeat(32) }, '*'));
    await expect(page.getByRole('status')).toContainText('Ready');
    await expect(page.getByRole('button', { name: 'Attest' })).toBeEnabled();  // eligibility itself is checked in the confirm sheet (Task 5)
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests/smoke && npx playwright test --project=faculty-console -g "phone client" 2>&1 | tail -12`
Expected: the two new tests fail (no item screen yet); the Task 3 tests still pass.

- [ ] **Step 3: Implement the item screen**

Replace the three Task-4 stubs in `m.mjs` with:

```js
// ---- preview ------------------------------------------------------------------------------
function residentBase() { return typeof state.server?.resident === 'string' && state.server.resident ? state.server.resident : state.server?.student; }

function beginPreview() {
  cancelPreview();
  const item = selectedItem();
  if (!item) return;
  const attempt = (state.preview?.attempt || 0) + 1;
  const request = buildPreviewRequest({ studentBase: state.server.student, residentBase: residentBase(), item, reviewToken: createReviewToken(window.crypto) });
  state.preview = { request, status: 'loading', frameLoaded: false, frameWindow: null, timerId: null, attempt };
  state.preview.timerId = window.setTimeout(() => {
    const preview = state.preview;
    if (!preview || preview.status !== 'loading') return;
    preview.status = timeoutStatus(preview.frameLoaded);
    renderItem();
  }, PREVIEW_TIMEOUT_MS);
}
function cancelPreview() {
  if (state.preview?.timerId) window.clearTimeout(state.preview.timerId);
  state.preview = state.preview ? { ...state.preview, timerId: null } : null;
}
function retryPreview() { state.ui = { ...state.ui, retryAttempted: true }; beginPreview(); renderItem(); }

function handlePreviewStatus(event) {
  const preview = state.preview;
  if (!preview || !['loading', 'ready'].includes(preview.status)) return;
  if (!matchesPreviewStatus(event, preview.request, preview.frameWindow)) return;
  if (preview.status === 'ready' && event.data.status === 'ready') return;
  if (preview.timerId) window.clearTimeout(preview.timerId);
  preview.timerId = null;
  preview.status = event.data.status;
  renderItem();
}

const STATUS_LABEL = {
  loading: 'Loading the learner page…', ready: 'Ready', not_found: 'Not found on the learner site', error: 'The learner page reported an error',
  protocol_unavailable: 'Page loaded, but it never reported ready', frame_failure: 'The learner page did not load',
};
function previewFailed() { return ['not_found', 'error', 'protocol_unavailable', 'frame_failure'].includes(state.preview?.status); }

// ---- sheets -------------------------------------------------------------------------------
function openSheet(name) { state.sheet = name; renderItem(); }
function closeSheet() { state.sheet = null; renderItem(); }

async function loadDiff(item) {
  try {
    state.diff = await api(`${API}?${new URLSearchParams({ view: 'diff', slug: item.identity })}`);
  } catch (error) {
    if (error instanceof Unauthorized) { state.reauth = () => { openSheet('changed'); return loadDiff(item); }; renderGate(error.message); return; }
    state.diff = { error: error.message };
  }
  renderItem();
}
function sheetChanged(item) {
  if (state.diff === null) { state.diff = { loading: true }; void loadDiff(item); }
  const loading = state.diff?.loading === true;
  const lines = state.diff && !state.diff.error && !loading ? diffLines(state.diff) : [];
  return h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'What changed since you signed' }, [
    h('h2', { text: 'What changed since you signed' }),
    loading ? h('p', { text: 'Loading the changes…' }) : null,
    state.diff?.error ? h('p', { class: 'field-error', role: 'alert', text: state.diff.error }) : null,
    !loading && state.diff && !state.diff.error && !lines.length ? h('p', { text: 'No text change was recorded; the record or its fingerprint scope moved.' }) : null,
    // `lines` carries file / context / del / add / note kinds; a note marks a too-large, binary or truncated file.
    h('div', { class: 'lines' }, lines.map(line => h('div', { class: line.kind, text: line.text }))),
    state.diff?.compareUrl ? h('p', {}, h('a', { href: state.diff.compareUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Open the comparison on GitHub' })) : null,
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}

// ---- item screen --------------------------------------------------------------------------
// Mounted ONCE per open (or Retry). Re-inserting an iframe reloads it, and the second-load rule
// below would read that as frame_failure, so state changes refresh only the dynamic regions.
let mountedFor = null;   // `${item.key}#${preview.attempt}` the current DOM was mounted for

function renderItem() {
  const item = selectedItem();
  if (!item) { closeItem(); return; }
  const signature = `${item.key}#${state.preview?.attempt || 0}`;
  if (mountedFor !== signature || !document.getElementById('learner-frame')) mountItem(item);
  refreshItem(item);
}

function mountItem(item) {
  const preview = state.preview;
  const frame = h('iframe', { id: 'learner-frame', title: `Learner view of ${item.title}`, sandbox: PREVIEW_SANDBOX, referrerpolicy: 'no-referrer' });
  frame.addEventListener('load', () => {
    const current = state.preview;
    if (!current || current.request !== preview.request) return;      // a stale frame's event
    if (current.frameLoaded) { current.status = 'frame_failure'; refreshItem(item); return; }
    current.frameLoaded = true;
  });
  frame.addEventListener('error', () => {
    if (state.preview?.request === preview.request) { state.preview.status = 'frame_failure'; refreshItem(item); }
  });
  frame.setAttribute('src', preview.request.url);
  replaceApp(
    bar(item.title, { back: true }),
    h('div', { class: 'screen item' }, [
      h('div', { id: 'item-status', class: 'status', role: 'status' }),
      h('div', { id: 'item-twin' }),
      h('div', { id: 'item-receipt' }),
      h('div', { id: 'item-message' }),
      h('div', { class: 'frame-wrap' }, frame),
    ]),
    h('nav', { id: 'item-actions', class: 'actions', 'aria-label': 'Review actions' }),
    h('div', { id: 'item-sheet' }),
  );
  preview.frameWindow = frame.contentWindow;
  mountedFor = `${item.key}#${preview.attempt}`;
  window.history.replaceState(null, '', `${window.location.pathname}?item=${encodeURIComponent(item.key)}`);
}

function refreshItem(item) {
  const preview = state.preview;
  const twin = item.type === 'page' ? twinOf(item, state.items) : null;
  const external = item.type === 'question' ? null : buildExternalReviewUrl({ studentBase: state.server.student, residentBase: residentBase(), item });
  document.getElementById('item-status').replaceChildren(
    h('span', { class: `pill ${preview.status === 'ready' ? 'ok' : ''}`, text: STATUS_LABEL[preview.status] || preview.status }),
    h('span', { text: `${siteLabel(item)} · ${reviewReason(item)}` }),
    ...(previewFailed() ? [h('button', { type: 'button', class: 'pill', text: 'Retry', onClick: retryPreview })] : []),
  );
  document.getElementById('item-twin').replaceChildren(...(twin ? [h('p', { class: 'summary' }, [
    `Twin: ${twin.title} · ${twin.completion === 'needs-review' ? 'needs review' : 'reviewed'} `,
    h('a', { href: `?item=${encodeURIComponent(twin.key)}`, text: 'Go to twin', onClick: event => { event.preventDefault(); openItem(twin.key); } }),
  ])] : []));
  document.getElementById('item-receipt').replaceChildren(...(state.receipt ? [h('div', { class: 'receipt', role: 'status' }, [
    h('strong', { text: `Signed: ${state.receipt.title}` }), ' ',
    state.receipt.commit ? h('a', { href: state.receipt.commit, target: '_blank', rel: 'noopener noreferrer', text: 'commit' }) : null,
    state.receipt.pullRequest ? [' · ', h('a', { href: state.receipt.pullRequest, target: '_blank', rel: 'noopener noreferrer', text: 'rolling PR' })] : null,
    state.receipt.pullRequestError ? ' · the rolling review request needs attention' : null,
  ])] : []));
  document.getElementById('item-message').replaceChildren(...(state.message ? [h('p', { class: 'field-error summary', role: 'alert', text: state.message })] : []));
  document.getElementById('item-actions').replaceChildren(
    item.type === 'question'
      ? h('button', { class: 'btn secondary', type: 'button', text: 'Saved draft', onClick: () => openSheet('draft') })
      : h('button', { class: 'btn secondary', type: 'button', text: 'What changed', onClick: () => openSheet('changed') }),
    external ? h('a', { class: 'btn secondary', href: external, target: '_blank', rel: 'noopener noreferrer', text: 'Open in site' }) : h('span'),
    h('button', { class: 'btn', type: 'button', text: 'Attest', disabled: state.pending || preview.status === 'loading', onClick: () => openSheet('confirm') }),
  );
  const sheet = state.sheet === 'changed' ? sheetChanged(item)
    : state.sheet === 'confirm' ? sheetConfirm(item)
    : state.sheet === 'draft' ? sheetDraft(item)
    : null;
  document.getElementById('item-sheet').replaceChildren(...(sheet ? [h('div', { class: 'sheet-backdrop', onClick: closeSheet }), sheet] : []));
}
function sheetConfirm() { return h('div'); }   // Task 5
function sheetDraft() { return h('div'); }     // Task 6
```

Also change the boot listener line to call the now-defined function directly: `window.addEventListener('message', handlePreviewStatus);`.

The frame is created once per open or Retry and persists across refreshes (re-inserting an iframe would reload it and trip the second-load rule). `frameWindow` is set at mount so `matchesPreviewStatus` compares against the live window; the `load` handler ignores events from a superseded request. A second `load` on the same frame marks `frame_failure`, as the desktop does.

- [ ] **Step 4: Run to verify they pass**

Run: `cd tests/smoke && npx playwright test --project=faculty-console -g "phone client" 2>&1 | tail -12`
Expected: all four phone tests pass. If *Ready* never arrives, confirm the MS3 server on 4200 is serving a fresh `_build/ms3` (the learner shell posts readiness only for a `reviewToken` matching `/^[0-9a-f]{32}$/`).

- [ ] **Step 5: Commit**

```bash
git add faculty-console/m/m.mjs tests/smoke/faculty-console.spec.js
git commit -m "feat(console/m): item screen — learner page in frame, readiness pill, What changed, Open in site

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Confirm, sign, receipt, advance (pages and tools)

**Files:**
- Modify: `faculty-console/m/m.mjs` (`sheetConfirm`, `signContent`, advance)
- Modify: `tests/smoke/faculty-console.spec.js` (three tests)

**Interfaces:**
- Consumes: `contentEligibility(item, state.ui)`, `applyRows`, `nextAfterSign` (m-model); `POST /api/attest` with `{ target:'content', changes:{ [slug]: true }, reasons:{} }` → `{ ok, updated, commit, rows?, pullRequest?, pullRequestError? }`.
- Produces: `signContent(item)`; `state.receipt`; auto-advance via `openItem(nextKey)`; background `scheduleRefresh()`.

- [ ] **Step 1: Write the failing smoke tests**

```js
  test('Sign is disabled until acknowledged and idempotent while pending; a press sends exactly one slug and the receipt comes from the response', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Catatonia \(Aug 31\) — MS3/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    const getsBefore = api.gets.length;
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Catatonia/ });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(SERVER_ATTESTER)).toBeVisible();
    const sign = sheet.getByRole('button', { name: 'Sign' });
    await expect(sign).toBeDisabled();
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await expect(sign).toBeDisabled();
    await sheet.getByLabel('Links, media and interactions work').check();
    await expect(sign).toBeEnabled();
    await sign.click();
    await sign.click().catch(() => {});   // second tap while pending must not send a second POST
    await expect(page.getByRole('status').filter({ hasText: 'Signed: Catatonia (Aug 31) — MS3' })).toBeVisible();
    const posts = api.calls.filter(call => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ target: 'content', changes: { [COTW_MS3_SLUG]: true }, reasons: {} });
    expect(api.gets.length).toBe(getsBefore);   // no confirming reload
    // Auto-advance: the twin needs review, so it is selected next.
    await expect(page.getByRole('heading', { name: 'Catatonia (Aug 31) — Resident' })).toBeVisible();
  });

  test('a receipt without rows still completes and schedules a refresh', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() !== 'POST') return route.fallback();
      await fulfillJson(route, 200, { ok: true, updated: 1, commit: 'https://github.example/commit/no-rows', ledger: { seq: 7 } });
    });
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mental status exam tool/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mental status exam tool/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Signed: Synthetic mental status exam tool' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attest' })).toBeEnabled();  // not stuck in "Signing…"
  });

  test('a failed preview needs a retry and the separate-tab acknowledgement instead', async ({ page }) => {
    await installRepositoryApi(page, workflowBank(), { contentState: [{ slug: 'nope.md', title: 'Missing page', kind: 'page', site: 'ms3', status: 'pending', at: '', by: '' }] });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Missing page/ }).click();
    await expect(page.getByRole('status')).toContainText('Not found', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Missing page/ });
    await expect(sheet.getByText('The learner page did not report ready. Press Retry once')).toBeVisible();
    await expect(sheet.getByLabel('I reviewed it in the learner site tab')).toBeDisabled();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('status')).toContainText('Not found', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    await sheet.getByLabel('I reviewed it in the learner site tab').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await expect(sheet.getByRole('button', { name: 'Sign' })).toBeEnabled();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd tests/smoke && npx playwright test --project=faculty-console -g "phone client" 2>&1 | tail -12` → the three new tests fail (no confirm sheet).

- [ ] **Step 3: Implement confirm + sign**

Replace `function sheetConfirm() { return h('div'); }` in `m.mjs` with:

```js
function ack(id, label, checked, onChange, { disabled = false } = {}) {
  const input = h('input', { id, type: 'checkbox', checked: checked ? true : undefined, disabled: disabled ? true : undefined,
    onChange: event => onChange(event.target.checked) });
  return h('label', { class: 'ack', for: id }, [input, h('span', { text: label })]);
}
function setUi(patch) { state.ui = { ...state.ui, ...patch }; renderItem(); }

function sheetConfirm(item) {
  if (item.type === 'question') return sheetConfirmQuestion(item);
  const failed = previewFailed();
  const ready = state.preview?.status === 'ready';
  const eligibility = contentEligibility(item, state.ui);
  return h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Sign ${item.title}` }, [
    h('h2', { text: `Sign ${item.title}` }),
    h('p', { text: `As ${state.server.attester}. This signs the text as it is on main right now; if the page changes later it shows as pending again until re-signed.` }),
    failed && !state.ui.retryAttempted ? h('p', { class: 'field-error', text: 'The learner page did not report ready. Press Retry once; if it still fails, review it with Open in site and acknowledge that below.' }) : null,
    ready
      ? ack('ack-complete', 'I reviewed the complete item on this screen', state.ui.completeItemReviewed, v => setUi({ completeItemReviewed: v }))
      : ack('ack-separate', 'I reviewed it in the learner site tab', state.ui.separateTabReviewed, v => setUi({ separateTabReviewed: v }), { disabled: !state.ui.retryAttempted }),
    ack('ack-accuracy', 'Accurate and appropriate for a third-year student', state.ui.accuracy, v => setUi({ accuracy: v })),
    ack('ack-interactions', 'Links, media and interactions work', state.ui.interactions, v => setUi({ interactions: v })),
    h('p', {}, h('button', { class: 'btn', type: 'button', text: state.pending ? 'Signing…' : 'Sign', disabled: !eligibility.eligible || state.pending, onClick: () => { void signContent(item); } })),
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}

function safeHttps(value) { try { const u = new URL(String(value)); return u.protocol === 'https:' ? u.href : null; } catch { return null; } }

async function signContent(item) {
  if (state.pending) return;                       // idempotent while a POST is in flight
  if (!contentEligibility(item, state.ui).eligible) { state.message = 'Complete the acknowledgements before signing.'; renderItem(); return; }
  state.pending = true; state.message = ''; renderItem();
  const body = { target: 'content', changes: { [item.identity]: true }, reasons: {} };
  try {
    const payload = await api(API, { method: 'POST', body: JSON.stringify(body) });
    if (!payload?.ok || payload.updated !== 1) throw new Error(errorText(payload, 'This attestation was not saved.'));
    state.receipt = { title: item.title, commit: safeHttps(payload.commit), pullRequest: safeHttps(payload.pullRequest), pullRequestError: payload.pullRequestError === true };
    if (payload.rows && typeof payload.rows === 'object') {
      state.server = applyRows(state.server, payload.rows);
    } else {
      // Ledger mode or an older function: trust the 200 for this item and refresh soon.
      state.server = applyRows(state.server, { [item.identity]: { status: 'reviewed', at: new Date().toISOString().slice(0, 10), by: state.server.attester, risk: item.risk, reason: '' } });
    }
    const before = state.items; const sections = state.sections;
    recompute();
    scheduleRefresh();
    state.sheet = null; state.pending = false;
    const nextKey = nextAfterSign(item.key, before, sections);
    if (nextKey && state.items.some(i => i.key === nextKey)) { const receipt = state.receipt; openItem(nextKey); state.receipt = receipt; renderItem(); }
    else { state.screen = 'item'; renderItem(); }
  } catch (error) {
    state.pending = false;
    if (error instanceof Unauthorized) { state.reauth = () => { state.sheet = 'confirm'; return signContent(item); }; renderGate(error.message); return; }
    state.message = /github_conflict/.test(error.message) ? 'The branch moved while signing. Press Sign again.' : error.message;
    renderItem();
  }
}
```

Note `nextAfterSign` is computed against the **pre-recompute** items/sections so the just-signed item still anchors its section; after `recompute()` the signed item has left the queue, and the guard `state.items.some(...)` keeps the advance honest.

- [ ] **Step 4: Run to verify they pass**

Run: `cd tests/smoke && npx playwright test --project=faculty-console -g "phone client" 2>&1 | tail -12` → all seven phone tests pass.
Then: `npx playwright test --project=faculty-console 2>&1 | tail -3` → the whole console project passes.

- [ ] **Step 5: Commit**

```bash
git add faculty-console/m/m.mjs tests/smoke/faculty-console.spec.js
git commit -m "feat(console/m): confirm sheet, one-slug sign, receipt from the write, auto-advance

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Questions — saved draft, live preview, attest (read-only)

**Files:**
- Modify: `faculty-console/m/m.mjs` (`sheetDraft`, `sheetConfirmQuestion`, `signQuestion`)
- Modify: `tests/smoke/faculty-console.spec.js` (one test)

**Interfaces:**
- Consumes: `questionEligibility(item, state.ui)`, `questionEntry(item, state.ui.reviewedRevision)` (m-model); `POST /api/attest` with `{ action:'qbank.attest', manifestRevision, items:[entry], confirmations:{clinical, evidence, originalityAndNoPhi} }` → `{ ok, action, updated, commit, revision:{[id]}, assessment:{[id]} }`.
- Produces: read-only draft sheet; question confirm sheet; `signQuestion(item)`.

- [ ] **Step 1: Write the failing smoke test**

```js
  test('a question shows its saved draft read-only and attests only after a retry, the unavailable-live acknowledgement, the saved-revision receipt and the three confirmations', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /qb_moo_901/ }).click();
    // The synthetic question is not in the deployed learner bank, so the shell reports Not found —
    // the same path the desktop suite exercises for undeployed drafts.
    await expect(page.getByRole('status')).toContainText('Not found', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Saved draft' }).click();
    const draft = page.getByRole('dialog', { name: 'Saved draft (not deployed)' });
    await expect(draft.getByText(READY_STEMS.A)).toBeVisible();
    await expect(draft.getByRole('textbox')).toHaveCount(0);   // read-only: no inputs
    await draft.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign qb_moo_901/ });
    const sign = sheet.getByRole('button', { name: 'Sign' });
    await expect(sign).toBeDisabled();
    const unavailable = sheet.getByLabel('The live question is unavailable; I reviewed the saved draft instead');
    await expect(unavailable).toBeDisabled();            // one Retry is required first
    await sheet.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('status')).toContainText('Not found', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    await unavailable.check();
    await sheet.getByLabel(/I reviewed the saved draft, revision/).check();
    await sheet.getByLabel('Clinically accurate').check();
    await sheet.getByLabel('Evidence and rationale hold').check();
    await expect(sign).toBeDisabled();
    await sheet.getByLabel('Original wording, no patient information').check();
    await expect(sign).toBeEnabled();
    await sign.click();
    await expect(page.getByRole('status').filter({ hasText: 'Signed: qb_moo_901' })).toBeVisible();
    const post = api.calls.filter(call => call.method === 'POST').at(-1);
    expect(post.body.action).toBe('qbank.attest');
    expect(post.body.manifestRevision).toBe(MANIFEST_REVISION);
    expect(post.body.items).toHaveLength(1);
    expect(post.body.items[0].id).toBe('qb_moo_901');
    expect(post.body.items[0].reviewedRevision).toBe(post.body.items[0].revision);
    expect(post.body.items[0].acknowledgedWarnings).toEqual([]);
    expect(post.body.confirmations).toEqual({ clinical: true, evidence: true, originalityAndNoPhi: true });
  });
```

The existing stub's `qbank.attest` branch (after L540) already validates `items[].revision` against the bank and returns `{ ok, action, updated, commit, revision, assessment }`; reuse it unchanged.

- [ ] **Step 2: Run to verify it fails** → `-g "phone client"`: the question test fails (no draft sheet).

- [ ] **Step 3: Implement**

Replace `function sheetDraft() { return h('div'); }` and add the question confirm and sign:

```js
function sheetDraft(item) {
  const q = item.record || {};
  const options = Array.isArray(q.options) ? q.options : [];
  return h('div', { class: 'sheet draft', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Saved draft (not deployed)' }, [
    h('h2', { text: 'Saved draft (not deployed)' }),
    h('p', { class: 'summary', text: `${q.category || ''} · difficulty ${q.difficulty ?? '–'} · revision ${String(item.revision).slice(0, 12)}` }),
    h('h3', { text: 'Stem' }), h('p', { text: q.stem || '' }),
    h('h3', { text: 'Options' }),
    h('ol', {}, options.map(option => h('li', { class: option.c ? 'key' : '' }, [`${option.key}. ${option.t}`, option.c ? ' (key)' : '', option.trap?.note ? h('div', { class: 'summary', text: option.trap.note }) : null]))),
    q.tier2 ? [h('h3', { text: 'Second tier' }), h('p', { text: q.tier2.q || '' }), h('ol', {}, (q.tier2.options || []).map(o => h('li', { class: o.c ? 'key' : '', text: `${o.key}. ${o.t}${o.c ? ' (key)' : ''}` })))] : null,
    h('h3', { text: 'Why' }), h('p', { text: q.why || '' }),
    q.pearl ? [h('h3', { text: 'Pearl' }), h('p', { text: q.pearl })] : null,
    h('h3', { text: 'Evidence' }), h('p', { text: q.evidence || '' }),
    (q.assessment?.warnings || []).length ? h('p', { class: 'field-error', text: 'This question carries warnings; attest it on the desktop console, which records each acknowledgement.' }) : null,
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}

function sheetConfirmQuestion(item) {
  const warnings = item.record?.assessment?.warnings || [];
  const eligibility = questionEligibility(item, state.ui);
  const failed = previewFailed();
  return h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Sign ${item.identity}` }, [
    h('h2', { text: `Sign ${item.identity}` }),
    h('p', { text: `As ${state.server.attester}. Attested questions are what learners see in the bank.` }),
    warnings.length ? h('p', { class: 'field-error', text: 'This question has warnings and cannot be attested from the phone.' }) : null,
    state.preview?.status === 'ready'
      ? ack('ack-live', 'I reviewed the live question on this screen', state.ui.liveReviewed, v => setUi({ liveReviewed: v }))
      : ack('ack-live-unavailable', 'The live question is unavailable; I reviewed the saved draft instead', state.ui.liveUnavailableAcknowledged, v => setUi({ liveUnavailableAcknowledged: v }), { disabled: !failed || !state.ui.retryAttempted }),
    ack('ack-revision', `I reviewed the saved draft, revision ${String(item.revision).slice(0, 12)}`, state.ui.reviewedRevision === item.revision, v => setUi({ reviewedRevision: v ? item.revision : '' })),
    ack('ack-clinical', 'Clinically accurate', state.ui.clinical, v => setUi({ clinical: v })),
    ack('ack-evidence', 'Evidence and rationale hold', state.ui.evidence, v => setUi({ evidence: v })),
    ack('ack-phi', 'Original wording, no patient information', state.ui.originalityAndNoPhi, v => setUi({ originalityAndNoPhi: v })),
    h('p', {}, h('button', { class: 'btn', type: 'button', text: state.pending ? 'Signing…' : 'Sign', disabled: warnings.length > 0 || !eligibility.eligible || state.pending, onClick: () => { void signQuestion(item); } })),
    h('p', {}, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onClick: closeSheet })),
  ]);
}

async function signQuestion(item) {
  if (state.pending) return;
  if (!questionEligibility(item, state.ui).eligible) { state.message = 'Complete the acknowledgements before signing.'; renderItem(); return; }
  state.pending = true; state.message = ''; renderItem();
  const body = {
    action: 'qbank.attest',
    manifestRevision: state.server.manifestRevision,
    items: [questionEntry(item, state.ui.reviewedRevision)],
    confirmations: { clinical: state.ui.clinical === true, evidence: state.ui.evidence === true, originalityAndNoPhi: state.ui.originalityAndNoPhi === true },
  };
  try {
    const payload = await api(API, { method: 'POST', body: JSON.stringify(body) });
    if (!payload?.ok || payload.updated !== 1) throw new Error(errorText(payload, 'This attestation was not saved.'));
    state.receipt = { title: item.identity, commit: safeHttps(payload.commit), pullRequest: safeHttps(payload.pullRequest), pullRequestError: payload.pullRequestError === true };
    state.server = { ...state.server, qbank: state.server.qbank.map(q => q.id === item.identity ? { ...q, status: 'attested' } : q) };
    const before = state.items; const sections = state.sections;
    recompute(); scheduleRefresh();
    state.sheet = null; state.pending = false;
    const nextKey = nextAfterSign(item.key, before, sections);
    if (nextKey && state.items.some(i => i.key === nextKey)) { const receipt = state.receipt; openItem(nextKey); state.receipt = receipt; renderItem(); }
    else renderItem();
  } catch (error) {
    state.pending = false;
    if (error instanceof Unauthorized) { state.reauth = () => { state.sheet = 'confirm'; return signQuestion(item); }; renderGate(error.message); return; }
    state.message = /qbank\.conflict/.test(error.message) ? 'This question changed since you loaded it. Pull to refresh and review again.' : error.message;
    renderItem();
  }
}
```

- [ ] **Step 4: Run to verify it passes** → `-g "phone client"`: eight tests pass; then the full `--project=faculty-console`.

- [ ] **Step 5: Commit**

```bash
git add faculty-console/m/m.mjs tests/smoke/faculty-console.spec.js
git commit -m "feat(console/m): questions — read-only saved draft, live receipt, attest with the desktop's confirmations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Home screen, icons, and the desktop hand-off link

**Files:**
- Create: `faculty-console/m/manifest.webmanifest`, `faculty-console/m/icon.svg`, `faculty-console/m/apple-touch-icon.png`
- Modify: `faculty-console/index.html` (`<style>` block + one anchor near the top of `<body>`)
- Test: `faculty-console/m-model.test.mjs` (one file-shape test), `tests/smoke/faculty-console.spec.js` (one test)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests**

Append to `faculty-console/m-model.test.mjs`:

```js
import { readFileSync } from 'node:fs';

test('the web manifest starts the phone client standalone at /m/ and names both icons', () => {
  const manifest = JSON.parse(readFileSync(new URL('./m/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.start_url, '/m/');
  assert.equal(manifest.scope, '/m/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(i => i.src).sort(), ['./apple-touch-icon.png', './icon.svg']);
  const png = readFileSync(new URL('./m/apple-touch-icon.png', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);   // PNG signature
});
```

Add to the `phone client` describe in the smoke spec:

```js
  test('the desktop console offers the phone console on a narrow viewport', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Use the phone console' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', './m/');
  });
```

And a sibling **outside** the phone describe (desktop viewport), asserting the link is hidden there:

```js
test('the phone console link is hidden on a desktop viewport', async ({ page }) => {
  await installRepositoryApi(page, workflowBank());
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Use the phone console' })).toBeHidden();
});
```

- [ ] **Step 2: Run to verify they fail** → node test: manifest missing; smoke: link missing.

- [ ] **Step 3: Create the assets and the link**

`faculty-console/m/manifest.webmanifest`:

```json
{
  "name": "Faculty attestation",
  "short_name": "Attest",
  "start_url": "/m/",
  "scope": "/m/",
  "display": "standalone",
  "background_color": "#eef2ef",
  "theme_color": "#1f3d2e",
  "icons": [
    { "src": "./icon.svg", "sizes": "any", "type": "image/svg+xml" },
    { "src": "./apple-touch-icon.png", "sizes": "180x180", "type": "image/png" }
  ]
}
```

`faculty-console/m/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" role="img" aria-label="Faculty attestation">
  <rect width="180" height="180" rx="36" fill="#1f3d2e"/>
  <path d="M48 96l26 26 58-64" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Generate the PNG with the standard library only (no Pillow on this machine), a 180×180 solid square in the theme colour; iOS uses it for the home-screen tile:

```bash
python3 - <<'PY'
import struct, zlib
w = h = 180
rgb = (0x1f, 0x3d, 0x2e)
raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
def chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) \
    + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
open('faculty-console/m/apple-touch-icon.png', 'wb').write(png)
print(len(png), 'bytes')
PY
```

In `faculty-console/index.html`, inside `<style>` add:

```css
  .phone-link { display: none; margin: 0 0 .75rem; }
  @media (max-width: 700px) { .phone-link { display: block; } }
```

and as the first child of `<body>` (before `<main class="wrap" id="app">`):

```html
<p class="phone-link"><a href="./m/">Use the phone console</a></p>
```

- [ ] **Step 4: Run to verify they pass**

`node --test faculty-console/*.test.mjs 2>&1 | grep -E '^# (pass|fail)'` → `# fail 0`.
`cd tests/smoke && npx playwright test --project=faculty-console 2>&1 | tail -3` → all pass.

- [ ] **Step 5: Commit**

```bash
git add faculty-console/m/manifest.webmanifest faculty-console/m/icon.svg faculty-console/m/apple-touch-icon.png faculty-console/index.html faculty-console/m-model.test.mjs tests/smoke/faculty-console.spec.js
git commit -m "feat(console/m): add-to-home-screen manifest and icons; desktop offers the phone console on narrow viewports

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: README, full local gate, pull request

**Files:**
- Modify: `faculty-console/README.md` (new section after "How it works")

**Interfaces:** none.

- [ ] **Step 1: Document**

Add to `faculty-console/README.md`, after the "How it works" list:

```markdown
## The phone client (`/m/`)

`m/index.html` + `m/m.mjs` is a phone-first front-end on this same site, so the learner sites'
`frame-ancestors` allow-list needs no change. Same faculty key (session only), same `/api/attest`,
same rules: it imports `review-model.mjs` for the queue, preview requests, deep links, twins and
eligibility, and `m/m-model.mjs` (unit-tested in `m-model.test.mjs`) for grouping by correction,
auto-advance order, applying the write's `rows`, and diff lines. Three screens: queue → learner page
full-screen with **What changed** / **Open in site** / **Attest** → a confirm sheet carrying the
desktop's acknowledgements. The attest write returns `rows` (the projected rows it wrote), so the
phone updates the one item in place and never runs the confirming full reload; a `GET` refresh runs
30 s after the sitting goes quiet. Questions are read-only (saved draft + attest); editing, the
Attest-together tray, remember-me and any change to attribution are out of scope. Deep links
(`/m/?item=page:<slug>`) and the bookmarklet work unchanged. Add it to the home screen from the
browser's share sheet; `m/manifest.webmanifest` makes it standalone.
```

- [ ] **Step 2: Run the whole local gate**

```bash
bash bin/verify.sh > /tmp/verify-mobile.log 2>&1; tail -3 /tmp/verify-mobile.log
```

Expected: `ALL CHECKS PASSED`. Then confirm the branch is governance-clean:

```bash
python3 bin/check_governance_separation.py --base "$(git merge-base origin/main HEAD)" --head HEAD --head-branch "$(git branch --show-current)"
```

Expected: `governance separation OK — … 0 content, N governance, 0 promotion(s)`.

- [ ] **Step 3: Commit, push, open the PR**

```bash
git add faculty-console/README.md
git commit -m "docs(console): describe the phone client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --base main --title "feat(console): phone-first attestation client at /m/ (spec 2026-09-26)" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-09-26-mobile-attestation-console-design.md.

- New `faculty-console/m/` client on the console's own origin: grouped queue, learner page full-screen with the existing review-token protocol, What changed (diff view), Open in site, confirm sheet with the desktop's acknowledgements, receipt from the write, auto-advance in the desktop's order, read-only questions with attest.
- One server change: the content attest write returns `rows` (projected like the GET item; never hash/note fields), so the phone skips the 16-call confirming reload.
- Add-to-home-screen manifest and icons; the desktop page links to `/m/` on viewports ≤ 700 px.
- Tests: `faculty-console/m-model.test.mjs` (node), `tests/faculty-console-handler.test.mjs` (`rows`), and a `phone client` describe at 390×844 in `tests/smoke/faculty-console.spec.js`.

Governance PR: `faculty-console/` only plus tests; no content, no ledger, no registry. Review on the deploy preview from a phone: `https://deploy-preview-<N>--clerkship-faculty-attest.netlify.app/m/`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Verify on a phone**

Open `https://deploy-preview-<N>--clerkship-faculty-attest.netlify.app/m/` on the phone, unlock, open one item, confirm *Ready*, open **What changed**, and stop before signing (the preview writes to the real `attest/pending` branch; sign only if that is intended).

---

## Self-review

- **Spec coverage.** §2 scope → Tasks 3–6; §3 architecture (same origin, shared modules) → Tasks 2–3; §4 screens (queue grouping, item, confirm, receipt, advance, questions read-only, home screen, hand-off link) → Tasks 3–7; §5 server change → Task 1 (`rows`, plural, because one press may carry several slugs; the optional `?view=item` is dropped as the spec allows); §6 security (key in header only, token per attempt, one slug per press, governance PR) → Global Constraints + Tasks 3, 5; §7 budget (no confirming reload) → Task 5 asserts `api.gets` unchanged; §8 errors (401 re-prompt with retry, 409 message, `pullRequestError` wording, preview failure with Retry, offline banner) → Tasks 3–5; §9 tests → Tasks 1, 2, 3–7; §10 rollout → Task 8.
- **Placeholder scan.** No TBD/TODO. Every code step is complete. The only "Task N" references are the three stubs in Task 3 that Tasks 4–6 replace, each shown in full there.
- **Type consistency.** `state.ui` keys used by `contentEligibility`/`questionEligibility` (Task 2) match the acknowledgement setters in Tasks 5–6 (`completeItemReviewed`, `separateTabReviewed`, `retryAttempted`, `accuracy`, `interactions`, `liveReviewed`, `liveUnavailableAcknowledged`, `reviewedRevision`, `clinical`, `evidence`, `originalityAndNoPhi`). `rows[slug]` keys (Task 1) match `applyRows` (Task 2) and the stub (Task 3). `questionEntry` matches the server's `entry.id/revision/reviewedRevision/acknowledgedWarnings`.
- **Review Focus.** Items 1–2 → Task 2 tests; item 3 → Task 4 second test; items 4–5 → Task 5 tests.
