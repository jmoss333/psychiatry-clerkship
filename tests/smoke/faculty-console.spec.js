import { expect, test } from '@playwright/test';

import {
  assessBank,
} from '../../faculty-console/qbank-rules.mjs';
import {
  itemRevision,
  prepareAttestation,
  prepareDraftSave,
} from '../../faculty-console/netlify/functions/qbank-actions.mjs';

const MS3_URL = process.env.MS3_BASE_URL || 'http://localhost:4200';
const FACULTY_KEY = 'synthetic-faculty-key';
// Attribution is server-derived (ATTESTER_NAME); the mock GET payload carries it
// and the mock POST handler stamps it, mirroring attest.mjs.
const SERVER_ATTESTER = 'Dr Server Attribution';
const MANIFEST_PAGES = ['t_mood.md'];
const MANIFEST_REVISION = 'b'.repeat(40);
const REVIEW_TOKEN = '0123456789abcdef0123456789abcdef';
const REVIEW_PROGRESS_SENTINELS = Object.freeze({
  cw_qb_v1: 'question-bank-progress::byte-sentinel',
  cw_srs_v1: 'spaced-review-progress::byte-sentinel',
  cw_qb_focus: 'adaptive-focus::byte-sentinel',
});
const CONFIRMATION_IDS = [
  'confirm-clinical',
  'confirm-evidence',
  'confirm-originality',
];
const READY_STEMS = {
  A: 'A fictional adult reports five weeks of low mood, loss of interest, early awakening, and impaired function without elevated energy. Which diagnosis best organizes this presentation?',
  B: 'A fictional patient develops several days of expansive mood, little need for sleep, pressured speech, and risky spending. Which syndrome best accounts for these findings?',
  C: 'A fictional older inpatient has abrupt fluctuating attention, disorientation, and visual misperceptions after surgery. Which syndrome best explains this course?',
  D: 'A fictional survivor experiences intrusive memories, avoidance, hyperarousal, and distress for two months after a collision. Which diagnosis best fits this pattern?',
};
const WARNING_STEM = 'A fictional trainee describes persistent worry, muscle tension, and poor sleep for eight months. Which diagnosis is least likely?';

function answerOptions(correctKey) {
  const labels = {
    A: 'Depressive syndrome',
    B: 'Manic syndrome',
    C: 'Delirium syndrome',
    D: 'Trauma-related syndrome',
  };
  return Object.entries(labels).map(([key, label]) => {
    if (key === correctKey) return { key, t: label, c: true };
    return {
      key,
      t: label,
      trap: {
        name: `${key} pattern mismatch`,
        note: `${label} does not match the time course and findings in this fictional vignette.`,
      },
    };
  });
}

function syntheticQuestion({
  id,
  correctKey = 'A',
  status = 'draft',
  type = 'sba',
  category = 'mood',
  difficulty = 2,
  stem = READY_STEMS[correctKey],
  tier2,
  ...overrides
}) {
  const item = {
    id,
    status,
    type,
    category,
    competency: ['dx'],
    difficulty,
    pages: ['t_mood.md'],
    link: {
      label: 'Open the synthetic teaching page',
      href: '?page=t_mood.md',
    },
    stem,
    options: answerOptions(correctKey),
    why: 'The time course and defining findings identify the best-matching syndrome.',
    pearl: 'Name the syndrome and time course before selecting an answer.',
    evidence: 't_mood.md - synthetic browser-test evidence anchor.',
    ...overrides,
  };
  if (type === 'two-tier') {
    item.tier2 = tier2 || {
      q: 'Which feature most directly supports the selected syndrome?',
      options: [
        { key: 'A', t: 'The duration and functional impairment', c: true },
        { key: 'B', t: 'One isolated symptom without a time course' },
        { key: 'C', t: 'An unrelated historical detail' },
      ],
      why: 'The selected feature is the intended synthetic rationale for this browser fixture.',
    };
  }
  return item;
}

function retiredQuestion() {
  return syntheticQuestion({
    id: 'qb_moo_999',
    stem: 'This retired synthetic item must never cross the active API boundary. Which disposition is correct?',
    retired: true,
    retiredReason: 'Synthetic retired browser fixture.',
  });
}

function workflowBank() {
  return {
    version: 1,
    items: [
      syntheticQuestion({
        id: 'qb_moo_901',
        type: 'two-tier',
        difficulty: 3,
      }),
      syntheticQuestion({
        id: 'qb_moo_902',
        correctKey: 'B',
        category: 'psychosis',
        difficulty: 1,
        stem: '',
      }),
      syntheticQuestion({
        id: 'qb_moo_905',
        correctKey: 'D',
        category: 'anxiety',
        stem: WARNING_STEM,
      }),
      syntheticQuestion({
        id: 'qb_moo_906',
        correctKey: 'C',
        category: 'neurocog',
        stem: READY_STEMS.C,
      }),
      retiredQuestion(),
    ],
  };
}

function exactReviewBank() {
  return {
    version: 1,
    items: [
      syntheticQuestion({
        id: 'qb_moo_902',
        correctKey: 'B',
        status: 'attested',
        stem: 'Exact synthetic review stem: which syndrome best fits this fictional presentation?',
      }),
      retiredQuestion(),
    ],
  };
}

function exactReviewUrl(reviewItem = 'qb_moo_902') {
  const url = new URL('/tools/question-bank-practice.html', MS3_URL);
  url.searchParams.set('reviewItem', reviewItem);
  url.searchParams.set('reviewKey', `question:${reviewItem}`);
  url.searchParams.set('reviewToken', REVIEW_TOKEN);
  return url;
}

function learnerPreviewUrl({
  page,
  tool,
  reviewItem,
  reviewKey,
  reviewToken = REVIEW_TOKEN,
}) {
  const url = new URL('/', MS3_URL);
  if (page !== undefined) url.searchParams.set('page', page);
  if (tool !== undefined) url.searchParams.set('tool', tool);
  if (reviewItem !== undefined) url.searchParams.set('reviewItem', reviewItem);
  if (reviewKey !== undefined) url.searchParams.set('reviewKey', reviewKey);
  if (reviewToken !== undefined) url.searchParams.set('reviewToken', reviewToken);
  return url;
}

function expectedLearnerPreviewStatus(surface, reviewKey, status) {
  return {
    type: 'faculty-preview-status',
    reviewKey,
    reviewToken: REVIEW_TOKEN,
    status,
    surface,
  };
}

function validInnerQuestionStatus(overrides = {}) {
  return {
    type: 'faculty-preview-question-status',
    reviewKey: 'question:qb_moo_902',
    reviewToken: REVIEW_TOKEN,
    reviewItem: 'qb_moo_902',
    status: 'ready',
    surface: 'question',
    ...overrides,
  };
}

async function installLearnerPreviewHarness(page) {
  await page.addInitScript(() => {
    window.__facultyPreviewStatuses = [];
    window.__facultyPreviewStatusSnapshots = [];
    window.addEventListener('message', event => {
      if (event.data?.type !== 'faculty-preview-status') return;
      let framePath = '';
      let frameReady = false;
      const frame = document.querySelector('#content .toolframe');
      try {
        framePath = frame?.contentWindow?.location?.pathname || '';
        frameReady = frame?.contentDocument?.readyState === 'complete';
      } catch {
        framePath = 'cross-origin';
      }
      window.__facultyPreviewStatuses.push(event.data);
      window.__facultyPreviewStatusSnapshots.push({
        status: event.data.status,
        heading: document.querySelector('#content h1')?.textContent || '',
        framePath,
        frameReady,
      });
    });
  });
}

async function learnerPreviewStatuses(page) {
  return page.evaluate(() => window.__facultyPreviewStatuses);
}

async function installControlledQuestionShell(page) {
  await page.route('**/tools/question-bank-practice.html*', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><h1>Controlled question shell</h1></body></html>',
  }));
}

async function installExactReviewHarness(page, bank = exactReviewBank()) {
  await page.addInitScript(sentinels => {
    for (const [key, value] of Object.entries(sentinels)) {
      localStorage.setItem(key, value);
    }
    localStorage.setItem('cw_theme', 'dark');
    window.__facultyReviewStatuses = [];
    window.__facultyReviewStatusSnapshots = [];
    window.addEventListener('message', event => {
      if (event.data?.type !== 'faculty-preview-question-status') return;
      window.__facultyReviewStatuses.push(event.data);
      window.__facultyReviewStatusSnapshots.push({
        status: event.data.status,
        visibleError: document.querySelector('.err-box')?.textContent || '',
      });
    });
  }, REVIEW_PROGRESS_SENTINELS);
  await page.route('**/question_bank.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(bank),
  }));
}

async function reviewStatuses(page) {
  return page.evaluate(() => window.__facultyReviewStatuses);
}

async function protectedProgress(page) {
  return page.evaluate(keys => Object.fromEntries(
    keys.map(key => [key, localStorage.getItem(key)]),
  ), Object.keys(REVIEW_PROGRESS_SENTINELS));
}

function activeItems(bank) {
  return bank.items.filter(item => item.retired !== true);
}

function initialContentState() {
  return [
    {
      slug: 't_mood.md',
      title: 'Synthetic mood disorders page',
      kind: 'page',
      status: 'pending',
      at: '',
      by: '',
    },
    {
      slug: 'mse.html',
      title: 'Synthetic mental status exam tool',
      kind: 'tool',
      status: 'pending',
      at: '',
      by: '',
    },
  ];
}

function apiContentStatus(status) {
  return status === 'pending' ? 'unreviewed' : status;
}

function buildGetPayload(bank, contentState = initialContentState()) {
  const active = activeItems(bank);
  const qbankSummary = assessBank(active, {
    manifestPages: MANIFEST_PAGES,
    activeItems: active,
  });
  const qbank = active.map(item => ({
    ...structuredClone(item),
    revision: itemRevision(item),
    assessment: qbankSummary.byId[item.id],
  }));
  const items = contentState.map(item => ({
    ...structuredClone(item),
    status: apiContentStatus(item.status),
  }));
  return {
    student: `${MS3_URL}/`,
    attester: SERVER_ATTESTER,
    items,
    qbankRevision: itemRevision(bank).slice(0, 40),
    manifestRevision: MANIFEST_REVISION,
    manifestPages: [...MANIFEST_PAGES],
    qbank,
    qbankSummary,
    counts: {
      pagesReviewed: items.filter(item => item.status === 'reviewed').length,
      pagesTotal: items.length,
      qbankAttested: active.filter(item => item.status === 'attested').length,
      qbankTotal: active.length,
    },
  };
}

async function fulfillJson(route, status, payload) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload),
  });
}

async function installRepositoryApi(page, initialBank, {
  missingDeployedIds = [],
  contentState: suppliedContentState = null,
} = {}) {
  let bank = structuredClone(initialBank);
  const contentState = suppliedContentState
    ? structuredClone(suppliedContentState) : initialContentState();
  const missingDeploy = new Set(missingDeployedIds);
  let conflict = null;
  let commitNumber = 0;
  const calls = [];
  const gets = [];
  const receipts = [];

  await page.route('**/api/attest', async route => {
    const request = route.request();
    const headers = await request.allHeaders();
    const method = request.method();
    const call = {
      method,
      url: request.url(),
      key: headers['x-faculty-key'] || '',
      action: null,
      body: null,
    };
    calls.push(call);

    if (call.key !== FACULTY_KEY) {
      await fulfillJson(route, 401, {
        error: { code: 'unauthorized', message: 'Faculty key not accepted.' },
      });
      return;
    }

    if (method === 'GET') {
      const payload = buildGetPayload(bank, contentState);
      gets.push(structuredClone(payload));
      await fulfillJson(route, 200, payload);
      return;
    }

    if (method !== 'POST') {
      await fulfillJson(route, 405, {
        error: { code: 'method_not_allowed', message: 'Method not allowed.' },
      });
      return;
    }

    try {
      const body = JSON.parse(request.postData() || 'null');
      call.body = structuredClone(body);
      call.action = body?.action || body?.target || '';

      if (body?.action?.startsWith('qbank.') && body.manifestRevision !== MANIFEST_REVISION) {
        await fulfillJson(route, 400, {
          error: { code: 'qbank.invalid_input', message: 'Synthetic manifest revision mismatch.' },
        });
        return;
      }

      if (body?.target === 'content') {
        const changes = body.changes && typeof body.changes === 'object'
          ? Object.entries(body.changes) : [];
        if (changes.length !== 1 || typeof changes[0][1] !== 'boolean') {
          await fulfillJson(route, 400, {
            error: { code: 'invalid_input', message: 'Exactly one content item is required.' },
          });
          return;
        }
        const [slug, reviewed] = changes[0];
        const item = contentState.find(candidate => candidate.slug === slug);
        if (!item) {
          await fulfillJson(route, 400, {
            error: { code: 'invalid_input', message: 'Unknown content item.' },
          });
          return;
        }
        item.status = reviewed ? 'reviewed' : 'pending';
        item.at = reviewed ? '2026-07-17T12:00:00.000Z' : '';
        item.by = reviewed ? SERVER_ATTESTER : '';
        const receipt = {
          ok: true,
          updated: 1,
          commit: `https://github.example/commit/faculty-${++commitNumber}`,
        };
        receipts.push(structuredClone(receipt));
        await fulfillJson(route, 200, receipt);
        return;
      }

      if (body?.action === 'qbank.save-draft') {
        if (conflict && conflict.id === body.id) {
          const current = activeItems(bank).find(item => item.id === conflict.id);
          const external = prepareDraftSave({
            bank,
            manifestPages: MANIFEST_PAGES,
            id: conflict.id,
            baseRevision: itemRevision(current),
            editedItem: { ...structuredClone(current), stem: conflict.remoteStem },
          });
          bank = external.bank;
          conflict = null;
          await fulfillJson(route, 409, {
            error: {
              code: 'qbank.conflict',
              message: 'A selected question changed after you loaded it.',
            },
          });
          return;
        }

        const result = prepareDraftSave({
          bank,
          manifestPages: MANIFEST_PAGES,
          id: body.id,
          baseRevision: body.baseRevision,
          editedItem: body.item,
        });
        bank = result.bank;
        const receipt = {
          ok: true,
          action: body.action,
          updated: 1,
          commit: `https://github.example/commit/faculty-${++commitNumber}`,
          revision: itemRevision(result.item),
          assessment: result.assessment,
        };
        receipts.push(structuredClone(receipt));
        await fulfillJson(route, 200, receipt);
        return;
      }

      if (body?.action === 'qbank.attest') {
        const result = prepareAttestation({
          bank,
          manifestPages: MANIFEST_PAGES,
          entries: body.items,
          confirmations: body.confirmations,
        });
        bank = result.bank;
        const active = activeItems(bank);
        const summary = assessBank(active, {
          manifestPages: MANIFEST_PAGES,
          activeItems: active,
        });
        const revision = {};
        const assessment = {};
        for (const id of result.ids) {
          const item = active.find(candidate => candidate.id === id);
          revision[id] = itemRevision(item);
          assessment[id] = summary.byId[id];
        }
        const receipt = {
          ok: true,
          action: body.action,
          updated: result.ids.length,
          commit: `https://github.example/commit/faculty-${++commitNumber}`,
          revision,
          assessment,
        };
        receipts.push(structuredClone(receipt));
        await fulfillJson(route, 200, receipt);
        return;
      }

      await fulfillJson(route, 400, {
        error: { code: 'invalid_action', message: 'Unsupported synthetic action.' },
      });
    } catch (error) {
      await fulfillJson(route, Number.isInteger(error?.status) ? error.status : 500, {
        error: {
          code: typeof error?.code === 'string' ? error.code : 'synthetic_api_failure',
          message: error instanceof Error ? error.message : 'Synthetic API failure.',
          ...(Array.isArray(error?.issues) && error.issues.length
            ? { issues: error.issues }
            : {}),
        },
      });
    }
  });

  await page.route('**/question_bank.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...structuredClone(bank),
      items: activeItems(bank).filter(item => !missingDeploy.has(item.id)),
    }),
  }));

  return {
    calls,
    gets,
    receipts,
    currentBank: () => structuredClone(bank),
    currentPayload: () => buildGetPayload(bank, contentState),
    currentContent: () => structuredClone(contentState),
    conflictNextSave(id, remoteStem) {
      conflict = { id, remoteStem };
    },
  };
}

async function unlock(page) {
  await page.addInitScript(() => {
    window.__facultyConsolePreviewMessages = [];
    window.addEventListener('message', event => {
      if (event.data?.type === 'faculty-preview-status') {
        window.__facultyConsolePreviewMessages.push(structuredClone(event.data));
      }
    });
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Faculty attestation workspace');
  await expect(page.getByRole('heading', {
    name: 'Faculty attestation workspace',
  })).toBeVisible();
  await expect(page.getByLabel('Faculty key')).toBeFocused();
  await page.getByLabel('Faculty key').fill(FACULTY_KEY);
  await page.getByRole('button', { name: 'Unlock workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Choose one curriculum item' })).toBeVisible();
}

async function checkConfirmations(page) {
  for (const id of CONFIRMATION_IDS) {
    await page.locator(`#${id}`).check();
  }
}

function qbankPosts(api) {
  return api.calls.filter(call => call.method === 'POST' && call.action.startsWith('qbank.'));
}

// Auto-advance (2026-08-12 efficiency pass, Task 4). Recording a compound receipt on
// a clean, ready draft (#review-compound) auto-advances the selection to the next
// unreceipted draft in the filter — a long queue no longer needs one click per item.
// Two tests below attest one SPECIFIC question at a time via #attest-current-item
// (not the batch tray), so each deliberately keeps the sitting on exactly the
// question it is currently verifying: scoping the visible list to that one question
// via search first means the advance has nowhere to go (the terminal "all drafts
// hold receipts" case), and the selection stays put with nothing further to click.
//
// Navigating away and back is NOT a safe alternative here, despite looking simpler:
// re-selecting a question reloads its learner preview, and the resulting 'ready'
// postMessage runs handlePreviewStatus's unconditional clearReviewAcknowledgements()
// (no preserveQuestionReceipts flag — that guard is specific to setSelectedReviewKey's
// own internal call) — which revokes the exact-revision receipt for whatever question
// is selected when the message arrives. A receipted question that is merely
// re-selected loses its receipt the moment its preview reports ready again.
async function recordReceiptScopedToOneQuestion(page, id) {
  await page.locator('#review-search').fill(id);
  await page.locator('#review-compound').click();
  await expect(page.locator('#review-compound')).toBeChecked();
  await expect(page.locator('#selected-item-identity')).toHaveText(id);
  await page.locator('#review-search').fill('');
}

// Keyboard-driven counterpart of recordReceiptScopedToOneQuestion, for the test that
// demonstrates the review controls are fully keyboard-operable. Explicitly refocuses
// #view-draft (a button, not a form field) before pressing R — .fill() leaves focus
// on #review-search itself, which the R shortcut's own form-field guard would ignore.
async function recordReceiptScopedToOneQuestionByKeyboard(page, id) {
  await page.locator('#review-search').fill(id);
  await page.locator('#view-draft').focus();
  await page.keyboard.press('r');
  await expect(page.locator('#review-compound')).toBeChecked();
  await expect(page.locator('#selected-item-identity')).toHaveText(id);
  await page.locator('#review-search').fill('');
}

test.describe('learner exact-question review route', () => {
  test('renders and answers only the requested question without changing learner progress', async ({ page }) => {
    await installExactReviewHarness(page);
    await page.goto(exactReviewUrl().href);

    await expect(page.locator('.qcard-stem')).toHaveText(
      'Exact synthetic review stem: which syndrome best fits this fictional presentation?',
    );
    await expect(page.locator('.setup')).toHaveCount(0);
    await expect(page.locator('.qcard')).not.toContainText('This retired synthetic item');
    await expect.poll(() => reviewStatuses(page)).toEqual([{
      type: 'faculty-preview-question-status',
      reviewKey: 'question:qb_moo_902',
      reviewToken: REVIEW_TOKEN,
      reviewItem: 'qb_moo_902',
      status: 'ready',
      surface: 'question',
    }]);

    await page.locator('[data-conf="likely"]').click();
    await page.locator('[data-key="B"]').click();
    await expect(page.locator('#feedbackPanel')).toBeVisible();
    await expect(page.locator('.verdict')).toContainText('Correct');
    await expect(page.locator('#nextBtn')).toHaveCount(0);
    await expect(page.locator('.fb-link')).toHaveCount(0);
    expect(await protectedProgress(page)).toEqual(REVIEW_PROGRESS_SENTINELS);
  });

  for (const [label, reviewItem] of [
    ['missing', 'qb_moo_903'],
    ['retired', 'qb_moo_999'],
  ]) {
    test(`${label} review item reports not_found without rendering another question`, async ({ page }) => {
      await installExactReviewHarness(page);
      await page.goto(exactReviewUrl(reviewItem).href);

      await expect(page.locator('.err-box')).toContainText(
        'This question is not present on the current deployment',
      );
      await expect(page.locator('.qcard')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(
        'Exact synthetic review stem: which syndrome best fits this fictional presentation?',
      );
      await expect.poll(() => reviewStatuses(page)).toEqual([{
        type: 'faculty-preview-question-status',
        reviewKey: `question:${reviewItem}`,
        reviewToken: REVIEW_TOKEN,
        reviewItem,
        status: 'not_found',
        surface: 'question',
      }]);
      expect(await protectedProgress(page)).toEqual(REVIEW_PROGRESS_SENTINELS);
    });
  }

  test('failed question-bank fetch shows an error before reporting error status', async ({ page }) => {
    await installExactReviewHarness(page);
    await page.unroute('**/question_bank.json');
    await page.route('**/question_bank.json', route => route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'Synthetic unavailable',
    }));
    await page.goto(exactReviewUrl().href);

    await expect(page.locator('.err-box')).toContainText('Could not load question bank');
    await expect.poll(() => page.evaluate(() => window.__facultyReviewStatusSnapshots)).toEqual([{
      status: 'error',
      visibleError: expect.stringContaining('Could not load question bank'),
    }]);
    await expect.poll(() => reviewStatuses(page)).toEqual([{
      type: 'faculty-preview-question-status',
      reviewKey: 'question:qb_moo_902',
      reviewToken: REVIEW_TOKEN,
      reviewItem: 'qb_moo_902',
      status: 'error',
      surface: 'question',
    }]);
    expect(await protectedProgress(page)).toEqual(REVIEW_PROGRESS_SENTINELS);
  });

  test('malformed or duplicate review parameters stay in normal practice mode', async ({ page }) => {
    await installExactReviewHarness(page);
    const malformedUrls = [];

    const malformedItem = exactReviewUrl();
    malformedItem.searchParams.set('reviewItem', 'qb_BAD_2');
    malformedItem.searchParams.set('reviewKey', 'question:qb_BAD_2');
    malformedUrls.push(malformedItem);

    const mismatchedKey = exactReviewUrl();
    mismatchedKey.searchParams.set('reviewKey', 'question:qb_moo_903');
    malformedUrls.push(mismatchedKey);

    const malformedToken = exactReviewUrl();
    malformedToken.searchParams.set('reviewToken', 'not-a-32-character-hex-token');
    malformedUrls.push(malformedToken);

    const duplicateItem = exactReviewUrl();
    duplicateItem.searchParams.append('reviewItem', 'qb_moo_903');
    malformedUrls.push(duplicateItem);

    for (const url of malformedUrls) {
      await page.goto(url.href);
      await expect(page.locator('.setup')).toBeVisible();
      await expect(page.locator('.qcard')).toHaveCount(0);
      await expect.poll(() => reviewStatuses(page)).toEqual([]);
    }
  });

  test('review mode preserves theme load and message behavior without changing progress', async ({ page }) => {
    await installExactReviewHarness(page);
    await page.goto(exactReviewUrl().href);

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => {
      window.postMessage({ type: 'theme', mode: 'light' }, location.origin);
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_theme'))).toBe('light');
    expect(await protectedProgress(page)).toEqual(REVIEW_PROGRESS_SENTINELS);
  });
});

test.describe('learner preview protocol', () => {
  test('reports a page ready only after the requested Markdown is visible', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });

    await page.goto(url.href);

    await expect(page.locator('#content h1')).toHaveText('Mood Disorders on the Inpatient Unit');
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);
    await expect.poll(() => page.evaluate(
      () => window.__facultyPreviewStatusSnapshots,
    )).toEqual([{
      status: 'ready',
      heading: 'Mood Disorders on the Inpatient Unit',
      framePath: '',
      frameReady: false,
    }]);
  });

  test('maps Markdown 404, HTTP failure, and network failure truthfully', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    const cases = [
      {
        name: '404',
        handler: route => route.fulfill({ status: 404, body: 'Synthetic missing page' }),
        expected: 'not_found',
      },
      {
        name: '500',
        handler: route => route.fulfill({ status: 500, body: 'Synthetic page failure' }),
        expected: 'error',
      },
      {
        name: 'network failure',
        handler: route => route.abort('failed'),
        expected: 'error',
      },
    ];

    for (const scenario of cases) {
      await test.step(scenario.name, async () => {
        await page.route('**/content/t_mood.md', scenario.handler);
        await page.goto(url.href);
        await expect(page.locator('#content [role="alert"]')).toContainText('Page unavailable');
        await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
          expectedLearnerPreviewStatus('page', 'page:t_mood.md', scenario.expected),
        ]);
        await page.unroute('**/content/t_mood.md', scenario.handler);
      });
    }
  });

  for (const [label, tool] of [
    ['manifest tool', 'mse.html'],
    ['generic question bank', 'question-bank-practice.html'],
  ]) {
    test(`reports ${label} ready only after its exact nested iframe loads`, async ({ page }) => {
      await installLearnerPreviewHarness(page);
      const url = learnerPreviewUrl({ tool, reviewKey: `tool:${tool}` });

      await page.goto(url.href);

      const frame = page.locator('#content .toolframe');
      await expect(frame).toHaveAttribute('src', new RegExp(`^tools/${tool}(?:\\?|$)`));
      await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
        expectedLearnerPreviewStatus('tool', `tool:${tool}`, 'ready'),
      ]);
      await expect.poll(() => page.evaluate(
        () => window.__facultyPreviewStatusSnapshots,
      )).toEqual([{
        status: 'ready',
        heading: '',
        framePath: `/tools/${tool}`,
        frameReady: true,
      }]);
    });
  }

  test('maps manifest tool and exact-question shell failures at preflight', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const mseUrl = learnerPreviewUrl({ tool: 'mse.html', reviewKey: 'tool:mse.html' });
    const cases = [
      {
        name: 'generic 404',
        handler: route => route.fulfill({ status: 404, body: 'Synthetic missing tool' }),
        expected: 'not_found',
      },
      {
        name: 'generic 500',
        handler: route => route.fulfill({ status: 500, body: 'Synthetic failed tool' }),
        expected: 'error',
      },
      {
        name: 'generic network failure',
        handler: route => route.abort('failed'),
        expected: 'error',
      },
    ];

    for (const scenario of cases) {
      await test.step(scenario.name, async () => {
        await page.route('**/tools/mse.html', scenario.handler);
        await page.goto(mseUrl.href);
        await expect(page.locator('#content [role="alert"]')).toContainText('Tool unavailable');
        await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
          expectedLearnerPreviewStatus('tool', 'tool:mse.html', scenario.expected),
        ]);
        await page.unroute('**/tools/mse.html', scenario.handler);
      });
    }

    const questionUrl = learnerPreviewUrl({
      tool: 'question-bank-practice.html',
      reviewItem: 'qb_moo_902',
      reviewKey: 'question:qb_moo_902',
    });
    const questionHandler = route => route.fulfill({
      status: 404,
      body: 'Synthetic missing question shell',
    });
    await page.route('**/tools/question-bank-practice.html', questionHandler);
    await page.goto(questionUrl.href);
    await expect(page.locator('#content [role="alert"]')).toContainText('Tool unavailable');
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('question', 'question:qb_moo_902', 'error'),
    ]);
    await page.unroute('**/tools/question-bank-practice.html', questionHandler);
  });

  test('reports an unknown tool not_found without falling back to Home', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      tool: 'unknown-faculty-preview.html',
      reviewKey: 'tool:unknown-faculty-preview.html',
    });

    await page.goto(url.href);

    await expect(page.locator('#content [role="alert"]')).toContainText('Preview route unavailable');
    await expect(page.locator('#content')).not.toContainText('Today / Progress');
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus(
        'tool',
        'tool:unknown-faculty-preview.html',
        'not_found',
      ),
    ]);
    expect(page.url()).toBe(url.href);
  });

  test('waits for a validated inner question status and relays only five fields', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    await installControlledQuestionShell(page);
    const url = learnerPreviewUrl({
      tool: 'question-bank-practice.html',
      reviewItem: 'qb_moo_902',
      reviewKey: 'question:qb_moo_902',
    });

    await page.goto(url.href);

    await expect(page.frameLocator('.toolframe').getByRole('heading', {
      name: 'Controlled question shell',
    })).toBeVisible();
    await page.waitForTimeout(100);
    expect(await learnerPreviewStatuses(page)).toEqual([]);

    const questionFrame = page.frames().find(frame => (
      new URL(frame.url()).pathname === '/tools/question-bank-practice.html'
    ));
    expect(questionFrame).toBeTruthy();
    await questionFrame.evaluate(
      data => window.parent.postMessage(data, location.origin),
      validInnerQuestionStatus(),
    );

    const expected = expectedLearnerPreviewStatus(
      'question',
      'question:qb_moo_902',
      'ready',
    );
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([expected]);
    expect(Object.keys((await learnerPreviewStatuses(page))[0]).sort()).toEqual([
      'reviewKey',
      'reviewToken',
      'status',
      'surface',
      'type',
    ]);
  });

  test('ignores spoofed or malformed inner question statuses', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    await installControlledQuestionShell(page);
    const url = learnerPreviewUrl({
      tool: 'question-bank-practice.html',
      reviewItem: 'qb_moo_902',
      reviewKey: 'question:qb_moo_902',
    });
    await page.goto(url.href);
    await expect(page.frameLocator('.toolframe').getByRole('heading', {
      name: 'Controlled question shell',
    })).toBeVisible();

    const valid = validInnerQuestionStatus();
    await page.evaluate(data => {
      const frame = document.querySelector('.toolframe');
      window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: 'https://spoofed.example',
        source: frame.contentWindow,
      }));
      window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: location.origin,
        source: window,
      }));
    }, valid);

    const questionFrame = page.frames().find(frame => (
      new URL(frame.url()).pathname === '/tools/question-bank-practice.html'
    ));
    expect(questionFrame).toBeTruthy();
    await questionFrame.evaluate(messages => {
      for (const message of messages) {
        window.parent.postMessage(message, location.origin);
      }
    }, [
      validInnerQuestionStatus({ reviewKey: 'question:qb_moo_903' }),
      validInnerQuestionStatus({ reviewToken: 'f'.repeat(32) }),
      validInnerQuestionStatus({ reviewItem: 'qb_moo_903' }),
      validInnerQuestionStatus({ surface: 'tool' }),
      validInnerQuestionStatus({ status: 'pending' }),
      validInnerQuestionStatus({ unexpected: 'must be rejected' }),
    ]);

    await page.waitForTimeout(100);
    expect(await learnerPreviewStatuses(page)).toEqual([]);

    await questionFrame.evaluate(
      data => window.parent.postMessage(data, location.origin),
      valid,
    );
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('question', 'question:qb_moo_902', 'ready'),
    ]);
  });

  test('never reports ready for duplicate or mismatched route parameters', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    await installControlledQuestionShell(page);

    const duplicatePage = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    duplicatePage.searchParams.append('page', 't_anxiety.md');
    const duplicateTool = learnerPreviewUrl({ tool: 'mse.html', reviewKey: 'tool:mse.html' });
    duplicateTool.searchParams.append('tool', 'screeners.html');
    const duplicateKey = learnerPreviewUrl({ page: 't_mood.md', reviewKey: 'page:t_mood.md' });
    duplicateKey.searchParams.append('reviewKey', 'page:t_anxiety.md');
    const duplicateToken = learnerPreviewUrl({ page: 't_mood.md', reviewKey: 'page:t_mood.md' });
    duplicateToken.searchParams.append('reviewToken', 'f'.repeat(32));
    const pageAndTool = learnerPreviewUrl({
      page: 't_mood.md',
      tool: 'mse.html',
      reviewKey: 'page:t_mood.md',
    });
    const mismatchedPage = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_anxiety.md',
    });
    const mismatchedTool = learnerPreviewUrl({
      tool: 'mse.html',
      reviewKey: 'tool:screeners.html',
    });
    const duplicateReviewItem = learnerPreviewUrl({
      tool: 'question-bank-practice.html',
      reviewItem: 'qb_moo_902',
      reviewKey: 'question:qb_moo_902',
    });
    duplicateReviewItem.searchParams.append('reviewItem', 'qb_moo_903');
    const emptyTool = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    emptyTool.searchParams.append('tool', '');
    const emptyFirstDuplicateTool = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    emptyFirstDuplicateTool.searchParams.append('tool', '');
    emptyFirstDuplicateTool.searchParams.append('tool', 'mse.html');
    const emptyReviewItem = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    emptyReviewItem.searchParams.append('reviewItem', '');
    const emptyFirstDuplicateReviewItem = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    emptyFirstDuplicateReviewItem.searchParams.append('reviewItem', '');
    emptyFirstDuplicateReviewItem.searchParams.append('reviewItem', 'qb_moo_902');

    for (const url of [
      duplicatePage,
      duplicateTool,
      duplicateKey,
      duplicateToken,
      pageAndTool,
      mismatchedPage,
      mismatchedTool,
      duplicateReviewItem,
      emptyTool,
      emptyFirstDuplicateTool,
      emptyReviewItem,
      emptyFirstDuplicateReviewItem,
    ]) {
      await page.goto(url.href);
      await expect.poll(() => page.evaluate(() => Boolean(
        document.querySelector('#content h1, #content .toolframe'),
      ))).toBe(true);
      await page.waitForTimeout(50);
      expect(await learnerPreviewStatuses(page)).toEqual([]);
    }
  });

  test('locks a ready page against sidebar, mode, message, and history navigation', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    await page.goto(url.href);
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);

    await page.evaluate(() => {
      document.querySelector('.navitem[data-f="t_anxiety.md"]').click();
      document.querySelector('#mPath').click();
      window.postMessage({ type: 'openPage', f: 't_psychosis.md' }, location.origin);
      window.postMessage({ type: 'openLibrary' }, location.origin);
      history.pushState({}, '', '?page=t_anxiety.md');
      window.dispatchEvent(new PopStateEvent('popstate'));
      const search = document.querySelector('#search');
      search.value = 'psychosis';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      window.postMessage({ type: 'search', q: 'psychosis' }, location.origin);
    });

    await page.waitForTimeout(200);
    await expect(page.locator('#content h1')).toHaveText('Mood Disorders on the Inpatient Unit');
    const notice = page.locator('#faculty-preview-lock-notice');
    await expect(notice).toHaveText(
      'Open the full page from the faculty console to navigate elsewhere',
    );
    expect(await notice.evaluate(node => !document.querySelector('#content').contains(node))).toBe(true);
    expect(page.url()).toBe(url.href);
    expect(await learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);
  });

  test('blocks parent-document companion links from leaving a ready page', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    await page.goto(url.href);
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);

    await page.locator('#modeCompanion .mc-toggle').click();
    const companionTool = page.locator('#modeCompanion .mc-item.is-tool').first();
    await expect(companionTool).toBeVisible();
    await companionTool.click();

    await expect(page.locator('#content h1')).toHaveText('Mood Disorders on the Inpatient Unit');
    await expect(page.locator('#faculty-preview-lock-notice')).toHaveText(
      'Open the full page from the faculty console to navigate elsewhere',
    );
    expect(page.url()).toBe(url.href);
    expect(await learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);
  });

  test('reports error when the reviewed nested tool reloads and keeps its frame reference', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({ tool: 'mse.html', reviewKey: 'tool:mse.html' });
    await page.goto(url.href);
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('tool', 'tool:mse.html', 'ready'),
    ]);
    await page.evaluate(() => {
      window.__facultyPreviewToolFrame = document.querySelector('.toolframe');
      window.__facultyPreviewToolWindow = window.__facultyPreviewToolFrame.contentWindow;
      window.__facultyPreviewToolWindow.location.reload();
    });

    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('tool', 'tool:mse.html', 'ready'),
      expectedLearnerPreviewStatus('tool', 'tool:mse.html', 'error'),
    ]);
    expect(await page.evaluate(() => (
      document.querySelector('.toolframe') === window.__facultyPreviewToolFrame
      && document.querySelector('.toolframe').contentWindow === window.__facultyPreviewToolWindow
    ))).toBe(true);
  });

  test('keeps the exact-question iframe and route when Practice Questions is opened again', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    await page.route('**/question_bank.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(exactReviewBank()),
    }));
    const url = learnerPreviewUrl({
      tool: 'question-bank-practice.html',
      reviewItem: 'qb_moo_902',
      reviewKey: 'question:qb_moo_902',
    });
    await page.goto(url.href);
    const questionFrame = page.frameLocator('.toolframe');
    await expect(questionFrame.locator('.qcard-stem')).toHaveText(
      'Exact synthetic review stem: which syndrome best fits this fictional presentation?',
    );
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('question', 'question:qb_moo_902', 'ready'),
    ]);
    await page.evaluate(() => {
      window.__facultyExactQuestionFrame = document.querySelector('.toolframe');
      window.__facultyExactQuestionWindow = window.__facultyExactQuestionFrame.contentWindow;
      document.querySelector('.navitem[data-f="question-bank-practice.html"]').click();
    });

    expect(await page.evaluate(() => (
      document.querySelector('.toolframe') === window.__facultyExactQuestionFrame
      && document.querySelector('.toolframe').contentWindow === window.__facultyExactQuestionWindow
    ))).toBe(true);
    await expect(questionFrame.locator('.qcard-stem')).toHaveText(
      'Exact synthetic review stem: which syndrome best fits this fictional presentation?',
    );
    await expect(questionFrame.locator('.setup')).toHaveCount(0);
    await expect(page.locator('#faculty-preview-lock-notice')).toHaveText(
      'Open the full page from the faculty console to navigate elsewhere',
    );
    await page.locator('#modeCompanion .mc-toggle').click();
    await page.locator('#modeCompanion [data-mc-mode="shelf"]').click();
    const shelfQuestionBank = page.locator(
      '#modeCompanion .mc-item.is-tool[href="?tool=question-bank-practice.html"]',
    );
    await expect(shelfQuestionBank).toBeVisible();
    await shelfQuestionBank.click();
    expect(await page.evaluate(() => (
      document.querySelector('.toolframe') === window.__facultyExactQuestionFrame
      && document.querySelector('.toolframe').contentWindow === window.__facultyExactQuestionWindow
    ))).toBe(true);
    expect(page.url()).toBe(url.href);
    expect(await learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('question', 'question:qb_moo_902', 'ready'),
    ]);
  });
});

test.describe.serial('faculty unified attestation workspace', () => {
  test('logs in to one accessible queue for page, tool, and question review', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank());
    await unlock(page);

    expect(api.gets.at(-1).student).toBe(`${MS3_URL}/`);
    expect(api.gets.at(-1).manifestPages).toEqual(MANIFEST_PAGES);
    expect(api.gets.at(-1).manifestRevision).toBe(MANIFEST_REVISION);
    expect(api.gets.at(-1).qbank.map(item => item.id)).not.toContain('qb_moo_999');

    const selector = page.locator('#review-item-selector');
    await expect(selector.locator('option')).toHaveCount(6);
    await expect(selector).toContainText('Page · Synthetic mood disorders page · Not reviewed');
    await expect(selector).toContainText('Tool · Synthetic mental status exam tool · Not reviewed');
    await expect(selector).toContainText('Question · qb_moo_901 · Draft');
    await expect(selector.locator('option:checked')).toHaveAttribute('aria-current', 'true');

    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mood disorders page');
    await expect(page.locator('#selected-item-type')).toHaveText('Page');
    await expect(page.locator('#selected-item-view')).toHaveText('Live deploy');
    await expect(page.locator('#attestation-rail-title')).toHaveText('Review → Resolve → Confirm');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');

    const frame = page.locator('#learner-preview-frame');
    await expect(frame).toHaveAttribute('title', 'Live learner preview for Synthetic mood disorders page');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect(frame).toHaveAttribute('src', new RegExp(
      '^http://localhost:4200/\\?page=t_mood\\.md&reviewKey=page%3At_mood\\.md&reviewToken=[0-9a-f]{32}$',
    ));

    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByText('Mark all', { exact: false })).toHaveCount(0);
    await expect(page.locator('[id*="batch"], [class*="batch"]')).toHaveCount(0);
    expect(api.calls.every(call => call.key === FACULTY_KEY)).toBe(true);
    expect(api.calls.every(call => new URL(call.url).search === '')).toBe(true);
    const previewMessages = await page.evaluate(() => window.__facultyConsolePreviewMessages);
    expect(previewMessages).toHaveLength(1);
    expect(Object.keys(previewMessages[0]).sort()).toEqual([
      'reviewKey',
      'reviewToken',
      'status',
      'surface',
      'type',
    ]);
    const previewMessageJson = JSON.stringify(previewMessages);
    for (const privateValue of [
      FACULTY_KEY,
      'Joshua Moss, MD',
      'originalityAndNoPhi',
      READY_STEMS.A,
      'commit',
    ]) expect(previewMessageJson).not.toContain(privateValue);
  });

  test('attests one page and tool, stays on each receipt, and reopens one page for re-attestation', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank());
    await unlock(page);
    await expect(page.locator('#reviewer-label')).toHaveText(SERVER_ATTESTER);

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    await expect(page.locator('#attest-current-item')).toBeEnabled();

    const pageStart = api.calls.length;
    await page.locator('#attest-current-item').click();
    // Auto-advance (2026-08-12 efficiency pass): mse.html is still pending, so a
    // successful content attest lands there directly instead of holding on
    // t_mood.md — #content-action-result is a console-wide banner (state.contentMessage
    // is not scoped to the selected item), so t_mood.md's own receipt is still
    // verified through it, the commit link, and the server-side content state below,
    // even though the selection has already moved on.
    await expect(page.locator('#content-action-result')).toContainText('Attested t_mood.md.');
    await expect(page.locator('#content-action-result').getByRole('link', {
      name: 'View commit',
    })).toHaveAttribute('href', /^https:\/\/github\.example\/commit\/faculty-/);
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mental status exam tool');
    expect(api.calls.slice(pageStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
      'POST:content',
      'GET:state',
    ]);
    expect(api.calls[pageStart].body).toEqual({
      target: 'content',
      changes: { 't_mood.md': true },
      reasons: {},
    });
    expect(api.currentContent().find(item => item.slug === 't_mood.md').status).toBe('reviewed');

    await expect(page.locator('#selected-item-type')).toHaveText('Tool');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await expect(page.locator('#learner-preview-frame')).toHaveAttribute('src', new RegExp(
      '^http://localhost:4200/\\?tool=mse\\.html&reviewKey=tool%3Amse\\.html&reviewToken=[0-9a-f]{32}$',
    ));
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    const toolStart = api.calls.length;
    await page.locator('#attest-current-item').click();
    await expect(page.locator('#content-action-result')).toContainText('Attested mse.html.');
    // No other content item is pending: the none-remain case holds on mse.html (the
    // pre-existing completed-hold behavior) rather than advancing anywhere. This bank
    // still has draft questions needing review, so "Next" stays enabled — but its
    // "Next item" label (vs plain "Next") is the hold's own signature either way.
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mental status exam tool');
    await expect(page.locator('#selected-item-status')).toHaveText('Reviewed');
    await expect(page.locator('#next-review-item')).toHaveText('Next item');
    expect(api.calls.slice(toolStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
      'POST:content',
      'GET:state',
    ]);
    expect(api.calls[toolStart].body.changes).toEqual({ 'mse.html': true });

    await page.locator('#review-status-filter').selectOption('all');
    await page.locator('#review-item-selector').selectOption('page:t_mood.md');
    await expect(page.locator('#selected-item-status')).toHaveText('Reviewed');
    await page.locator('details.more-actions summary').click();
    await page.getByRole('button', { name: 'Reopen review' }).click();
    const reopenDialog = page.getByRole('alertdialog', { name: 'Reopen this review?' });
    await expect(reopenDialog).toContainText('This changes only t_mood.md.');
    const confirmReopen = reopenDialog.getByRole('button', { name: 'Confirm reopen' });
    await expect(confirmReopen).toBeDisabled();
    await reopenDialog.getByLabel('Reason for reopening').fill('Guideline changed; re-verify the dosing table.');
    await expect(confirmReopen).toBeEnabled();
    const reopenStart = api.calls.length;
    await confirmReopen.click();
    await expect(page.locator('#content-action-result')).toContainText('Reopened t_mood.md for review.');
    await expect(page.locator('#selected-item-status')).toHaveText('Not reviewed');
    expect(api.calls.slice(reopenStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
      'POST:content',
      'GET:state',
    ]);
    expect(api.calls[reopenStart].body).toEqual({
      target: 'content',
      changes: { 't_mood.md': false },
      reasons: { 't_mood.md': 'Guideline changed; re-verify the dosing table.' },
    });
    expect(api.currentContent().find(item => item.slug === 't_mood.md').status).toBe('pending');
    expect(api.gets.at(-1).items.find(item => item.slug === 't_mood.md').status).toBe('unreviewed');

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    const reattestStart = api.calls.length;
    await page.locator('#attest-current-item').click();
    await expect(page.locator('#content-action-result')).toContainText('Attested t_mood.md.');
    expect(api.calls[reattestStart].body.changes).toEqual({ 't_mood.md': true });
  });

  test('attests Ready, Warning, fixed Blocked, and missing-deploy questions one at a time', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), {
      missingDeployedIds: ['qb_moo_906'],
    });
    await unlock(page);
    await expect(page.locator('#reviewer-label')).toHaveText(SERVER_ATTESTER);

    await page.locator('#review-item-selector').selectOption('question:qb_moo_901');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.getByRole('button', { name: 'Draft preview' }).click();
    await expect(page.locator('#draft-preview-title')).toHaveText('Saved Draft preview · Not deployed');
    // A clean ready draft is compound-eligible (#review-compound, not the separate
    // #review-saved-revision), and recording that receipt auto-advances the selection
    // (2026-08-12 efficiency pass) — but the edit below invalidates any receipt
    // immediately anyway, and edit-invalidates-receipt is already covered precisely
    // by the contract suite, so this pass goes straight to editing rather than
    // recording (and then discarding) a receipt first.
    await page.getByRole('button', { name: 'Edit question' }).first().click();
    const readySavedStem = 'A fictional adult reports five weeks of low mood, anhedonia, early waking, and impaired function without activation. Which syndrome best fits?';
    await page.locator('#question-stem').fill(readySavedStem);
    const readySaveStart = api.calls.length;
    await page.locator('#save-draft').click();
    await expect(page.locator('#qbank-action-result')).toContainText('Saved draft qb_moo_901');
    expect(api.calls.slice(readySaveStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
      'POST:qbank.save-draft',
      'GET:state',
    ]);
    const readySavePost = api.calls[readySaveStart];
    expect(readySavePost.body.id).toBe('qb_moo_901');
    expect(readySavePost.body.item.stem).toBe(readySavedStem);
    const savedReady = api.currentPayload().qbank.find(item => item.id === 'qb_moo_901');
    expect(savedReady.revision).toMatch(/^[0-9a-f]{64}$/);
    await expect(page.locator('#selected-item-revision')).toHaveText(savedReady.revision);

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-live-preview').check();
    await page.getByRole('button', { name: 'Draft preview' }).click();
    // Scoped to this one question (see recordReceiptScopedToOneQuestion): this test
    // attests each gate state individually via #attest-current-item, so recording the
    // receipt here must not auto-advance the sitting elsewhere.
    await recordReceiptScopedToOneQuestion(page, 'qb_moo_901');
    await checkConfirmations(page);
    const readyAttestStart = api.calls.length;
    await page.locator('#attest-current-item').click();
    await expect(page.locator('#qbank-action-result')).toContainText('Attested 1 question: qb_moo_901.');
    expect(api.calls.slice(readyAttestStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
      'POST:qbank.attest',
      'GET:state',
    ]);
    expect(api.calls[readyAttestStart].body.items).toEqual([{
      id: 'qb_moo_901',
      revision: savedReady.revision,
      reviewedRevision: savedReady.revision,
    }]);
    expect(api.calls[readyAttestStart].body.confirmations).toEqual({
      clinical: true,
      evidence: true,
      originalityAndNoPhi: true,
    });

    await page.locator('#review-item-selector').selectOption('question:qb_moo_905');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await expect(page.locator('#attestation-rail')).toContainText('Warning');
    await page.locator('#review-live-preview').check();
    await page.getByRole('button', { name: 'Draft preview' }).click();
    // A Warning gate does not block the compound receipt itself (only the final
    // attest, below, once the warning is acknowledged) — scoped for the same reason.
    await recordReceiptScopedToOneQuestion(page, 'qb_moo_905');
    await checkConfirmations(page);
    await expect(page.locator('#attest-current-item')).toBeDisabled();
    await page.locator('#ack-stem-negative_lead_in').check();
    const warningRevision = api.currentPayload().qbank.find(item => item.id === 'qb_moo_905').revision;
    await page.locator('#attest-current-item').click();
    await expect(page.locator('#qbank-action-result')).toContainText('Attested 1 question: qb_moo_905.');
    expect(qbankPosts(api).at(-1).body.items).toEqual([{
      id: 'qb_moo_905',
      revision: warningRevision,
      reviewedRevision: warningRevision,
      acknowledgedWarnings: ['stem.negative_lead_in'],
    }]);

    await page.locator('#review-item-selector').selectOption('question:qb_moo_902');
    await expect(page.locator('#attestation-rail')).toContainText('Blocked');
    await page.getByRole('button', { name: 'Edit question' }).first().click();
    await expect(page.locator('#save-draft')).toBeDisabled();
    await expect(page.locator('#attest-current-item')).toBeDisabled();
    const repairedStem = 'A fictional patient develops several days of expansive mood, little sleep, pressured speech, and risky spending. Which syndrome best explains this pattern?';
    await page.locator('#question-stem').fill(repairedStem);
    await expect(page.locator('#attestation-rail')).toContainText('Ready');
    await expect(page.locator('#save-draft')).toBeEnabled();
    await expect(page.locator('#attest-current-item')).toBeDisabled();
    await page.locator('#save-draft').click();
    await expect(page.locator('#qbank-action-result')).toContainText('Saved draft qb_moo_902');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-live-preview').check();
    await page.getByRole('button', { name: 'Draft preview' }).click();
    await recordReceiptScopedToOneQuestion(page, 'qb_moo_902');
    await checkConfirmations(page);
    await page.locator('#attest-current-item').click();
    await expect(page.locator('#qbank-action-result')).toContainText('Attested 1 question: qb_moo_902.');

    await page.locator('#review-item-selector').selectOption('question:qb_moo_906');
    await expect(page.locator('#preview-status-label')).toHaveText('Not found');
    await expect(page.locator('#learner-preview-frame')).toHaveAttribute('src', /reviewItem=qb_moo_906/);
    await expect(page.frameLocator('#learner-preview-frame')
      .frameLocator('.toolframe').locator('.qcard-stem')).toHaveCount(0);
    await page.getByRole('button', { name: 'Draft preview' }).click();
    await expect(page.locator('#draft-preview-title')).toHaveText('Saved Draft preview · Not deployed');
    await expect(page.locator('.draft-stem').first()).toContainText('fluctuating attention');
    // Preview never reaches ready (missing deploy): compoundReviewEligible requires
    // preview.status === 'ready', so this keeps the separate-checkbox path unchanged.
    await page.locator('#review-saved-revision').check();
    await page.locator('#ack-live-unavailable').check();
    await checkConfirmations(page);
    const missingRevision = api.currentPayload().qbank.find(item => item.id === 'qb_moo_906').revision;
    await page.locator('#attest-current-item').click();
    await expect(page.locator('#qbank-action-result')).toContainText('Attested 1 question: qb_moo_906.');
    expect(qbankPosts(api).at(-1).body.items).toEqual([{
      id: 'qb_moo_906',
      revision: missingRevision,
      reviewedRevision: missingRevision,
    }]);
    expect(api.calls.filter(call => call.method === 'POST').every(call => (
      !Object.hasOwn(call.body || {}, 'facultyKey')
      && !JSON.stringify(call.body || {}).includes(FACULTY_KEY)
    ))).toBe(true);
  });

  test('surfaces preview failures honestly, retries with fresh tokens, and opens clean fallbacks', async ({ page }) => {
    await page.clock.install();
    const contentState = [
      ...initialContentState(),
      {
        slug: 'wrong_route.md',
        title: 'Synthetic wrong learner route',
        kind: 'page',
        status: 'pending',
        at: '',
        by: '',
      },
    ];
    await installRepositoryApi(page, workflowBank(), { contentState });

    let markdownMode = 'error';
    let toolMode = 'pass';
    let outerMode = 'pass';
    await page.route('**/content/t_mood.md', route => {
      if (markdownMode === 'error') return route.fulfill({ status: 500, body: 'Synthetic Markdown failure' });
      return route.continue();
    });
    await page.route('**/tools/mse.html', route => {
      if (toolMode === 'error') return route.fulfill({ status: 500, body: 'Synthetic nested-tool failure' });
      return route.continue();
    });
    await page.route(url => (
      url.origin === new URL(MS3_URL).origin
      && url.pathname === '/'
      && url.searchParams.has('reviewKey')
    ), route => {
      if (outerMode === 'silent') {
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body><h1>Silent learner shell</h1></body></html>',
        });
      }
      if (outerMode === 'abort') return route.abort('failed');
      return route.continue();
    });

    await unlock(page);
    await expect(page.locator('#preview-status-label')).toHaveText('Error');
    await expect(page.locator('#preview-status')).toBeFocused();
    await expect(page.locator('#review-separate-tab')).toBeDisabled();
    const pagePopupPromise = page.waitForEvent('popup');
    await page.locator('#open-full-page').click();
    const pagePopup = await pagePopupPromise;
    await expect(pagePopup).toHaveURL(`${MS3_URL}/?page=t_mood.md`);
    expect(new URL(pagePopup.url()).searchParams.has('reviewKey')).toBe(false);
    expect(new URL(pagePopup.url()).searchParams.has('reviewToken')).toBe(false);
    await pagePopup.close();
    await expect(page.locator('#review-separate-tab')).toBeEnabled();
    await page.locator('#review-separate-tab').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    await expect(page.locator('#attest-current-item')).toBeEnabled();

    markdownMode = 'pass';
    outerMode = 'silent';
    const firstFailureSrc = await page.locator('#learner-preview-frame').getAttribute('src');
    await page.locator('#retry-preview').click();
    const silentSrc = await page.locator('#learner-preview-frame').getAttribute('src');
    expect(silentSrc).not.toBe(firstFailureSrc);
    await expect(page.frameLocator('#learner-preview-frame').getByRole('heading', {
      name: 'Silent learner shell',
    })).toBeVisible();
    await page.clock.runFor(10_000);
    await expect(page.locator('#preview-status-label')).toHaveText('Preview protocol unavailable');

    await page.frameLocator('#learner-preview-frame').locator('body').evaluate(() => {
      location.reload();
    });
    await expect(page.locator('#preview-status-label')).toHaveText('Network or embedded-preview failure');
    await expect(page.locator('#preview-status')).toBeFocused();
    await expect(page.locator('#app-status')).toContainText('Use Retry or the documented fallback');

    outerMode = 'pass';
    await page.locator('#retry-preview').click();
    const readySrc = await page.locator('#learner-preview-frame').getAttribute('src');
    expect(readySrc).not.toBe(silentSrc);
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');

    toolMode = 'error';
    await page.locator('#review-item-selector').selectOption('tool:mse.html');
    await expect(page.locator('#preview-status-label')).toHaveText('Error');
    await expect(page.locator('#preview-status')).toBeFocused();
    const toolPopupPromise = page.waitForEvent('popup');
    await page.locator('#open-full-page').click();
    const toolPopup = await toolPopupPromise;
    await expect(toolPopup).toHaveURL(`${MS3_URL}/?tool=mse.html`);
    expect(new URL(toolPopup.url()).searchParams.has('reviewKey')).toBe(false);
    expect(new URL(toolPopup.url()).searchParams.has('reviewToken')).toBe(false);
    await toolPopup.close();
    await page.locator('#review-separate-tab').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    await expect(page.locator('#attest-current-item')).toBeEnabled();

    toolMode = 'pass';
    await page.locator('#review-item-selector').selectOption('page:wrong_route.md');
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic wrong learner route');
    await expect(page.locator('#preview-status-label')).toHaveText('Not found');
    await expect(page.locator('#preview-status')).toContainText('exact item');
  });

  test('rejects spoofed preview messages, locks the selected route, and revokes checks on reload', async ({ page }) => {
    await page.clock.install();
    await installRepositoryApi(page, workflowBank());
    let outerMode = 'silent';
    await page.route(url => (
      url.origin === new URL(MS3_URL).origin
      && url.pathname === '/'
      && url.searchParams.has('reviewKey')
    ), route => {
      if (outerMode === 'silent') {
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><body><h1>Controlled silent preview</h1></body></html>',
        });
      }
      return route.continue();
    });

    await unlock(page);
    await expect(page.locator('#preview-status-label')).toHaveText('Loading');
    const loadingSrc = await page.locator('#learner-preview-frame').getAttribute('src');
    const loadingUrl = new URL(loadingSrc);
    const valid = {
      type: 'faculty-preview-status',
      reviewKey: loadingUrl.searchParams.get('reviewKey'),
      reviewToken: loadingUrl.searchParams.get('reviewToken'),
      status: 'ready',
      surface: 'page',
    };
    await page.evaluate(({ validMessage, learnerOrigin }) => {
      const frame = document.querySelector('#learner-preview-frame');
      const emit = (data, origin = learnerOrigin, source = frame.contentWindow) => {
        window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
      };
      emit(validMessage, 'https://spoofed.example');
      emit(validMessage, learnerOrigin, window);
      emit({ ...validMessage, reviewKey: 'page:t_anxiety.md' });
      emit({ ...validMessage, reviewToken: 'f'.repeat(32) });
      emit({ ...validMessage, surface: 'tool' });
      emit({ ...validMessage, status: 'pending' });
      emit({ ...validMessage, unexpected: 'reject this shape' });
      emit(null);
      window.postMessage(validMessage, '*');
      window.__staleFacultyPreviewSource = frame.contentWindow;
    }, { validMessage: valid, learnerOrigin: new URL(MS3_URL).origin });
    await expect(page.locator('#preview-status-label')).toHaveText('Loading');
    await expect(page.locator('#review-complete-item')).toHaveCount(0);
    await expect(page.locator('#attest-current-item')).toBeDisabled();

    await page.clock.runFor(10_000);
    await expect(page.locator('#preview-status-label')).toHaveText('Preview protocol unavailable');
    await page.locator('#retry-preview').click();
    const retrySrc = await page.locator('#learner-preview-frame').getAttribute('src');
    expect(retrySrc).not.toBe(loadingSrc);
    const retryUrl = new URL(retrySrc);
    const currentValid = {
      ...valid,
      reviewToken: retryUrl.searchParams.get('reviewToken'),
    };
    await page.evaluate(({ data, origin }) => {
      window.dispatchEvent(new MessageEvent('message', {
        data,
        origin,
        source: window.__staleFacultyPreviewSource,
      }));
    }, { data: valid, origin: new URL(MS3_URL).origin });
    await expect(page.locator('#preview-status-label')).toHaveText('Loading');
    await page.evaluate(({ data, origin }) => {
      const frame = document.querySelector('#learner-preview-frame');
      window.dispatchEvent(new MessageEvent('message', {
        data,
        origin,
        source: frame.contentWindow,
      }));
    }, { data: currentValid, origin: new URL(MS3_URL).origin });
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    await expect(page.locator('#attest-current-item')).toBeEnabled();

    outerMode = 'pass';
    await page.locator('#review-item-selector').selectOption('tool:mse.html');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-item-selector').selectOption('page:t_mood.md');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    const lockedSrc = await page.locator('#learner-preview-frame').getAttribute('src');
    await page.frameLocator('#learner-preview-frame').locator('.navitem[data-f="t_anxiety.md"]').click();
    await expect(page.frameLocator('#learner-preview-frame').locator('#content h1')).toHaveText(
      'Mood Disorders on the Inpatient Unit',
    );
    await expect(page.locator('#learner-preview-frame')).toHaveAttribute('src', lockedSrc);
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');

    await page.locator('#review-item-selector').selectOption('tool:mse.html');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    await expect(page.locator('#attest-current-item')).toBeEnabled();
    const nestedTool = page.frames().find(frame => {
      try { return new URL(frame.url()).pathname === '/tools/mse.html'; } catch { return false; }
    });
    expect(nestedTool).toBeTruthy();
    await nestedTool.evaluate(() => location.reload());
    await expect(page.locator('#preview-status-label')).toHaveText('Error');
    await expect(page.locator('#review-complete-item')).toHaveCount(0);
    await expect(page.locator('#review-content-accuracy')).not.toBeChecked();
    await expect(page.locator('#attest-current-item')).toBeDisabled();

    await page.locator('#review-item-selector').selectOption('page:t_mood.md');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    await expect(page.locator('#attest-current-item')).toBeEnabled();
    const outerFrame = page.frames().find(frame => {
      try {
        return frame.parentFrame() === page.mainFrame()
          && new URL(frame.url()).origin === new URL(MS3_URL).origin;
      } catch { return false; }
    });
    expect(outerFrame).toBeTruthy();
    await outerFrame.evaluate(() => location.reload());
    await expect(page.locator('#preview-status-label')).toHaveText('Network or embedded-preview failure');
    await expect(page.locator('#review-complete-item')).toHaveCount(0);
    await expect(page.locator('#review-content-accuracy')).not.toBeChecked();
    await expect(page.locator('#attest-current-item')).toBeDisabled();
  });

  test('supports keyboard review, guards dirty navigation, recovers conflicts, and invalidates stale receipts', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank());
    await unlock(page);

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#next-review-item').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#selected-item-type')).toHaveText('Tool');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#previous-review-item').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#selected-item-type')).toHaveText('Page');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');

    await page.locator('#review-item-selector').selectOption('question:qb_moo_901');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#view-edit').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-edit')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#selected-item-view')).toHaveText('Edit question');
    const keyboardStem = 'A fictional adult reports five weeks of low mood, anhedonia, early waking, and impaired function without elevated energy. Which syndrome best fits this presentation?';
    await page.locator('#question-stem').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(keyboardStem);
    await page.locator('#next-review-item').focus();
    await page.keyboard.press('Enter');
    const guard = page.getByRole('alertdialog', { name: 'Unsaved question changes' });
    await expect(guard).toBeVisible();
    await expect(guard).toBeFocused();
    await expect(page.locator('#selected-item-identity')).toHaveText('qb_moo_901');
    await page.keyboard.press('Escape');
    await expect(guard).toHaveCount(0);
    await expect(page.locator('#question-stem')).toHaveValue(keyboardStem);

    const saveStart = api.calls.length;
    await page.locator('#question-stem').focus();
    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.locator('#qbank-action-result')).toContainText('Saved draft qb_moo_901');
    expect(api.calls.slice(saveStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
      'POST:qbank.save-draft',
      'GET:state',
    ]);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Choose one curriculum item' })).toBeVisible();
    await page.locator('#review-item-selector').selectOption('question:qb_moo_901');
    // The preview must settle before entering Edit: a still-pending preview can
    // time out or fail later, and that lifecycle handler resets the workspace to
    // the Live view mid-edit (observed on slow CI runners under Playwright 1.62).
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#view-edit').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#question-stem')).toHaveValue(keyboardStem);

    const localConflictStem = 'This local keyboard edit must remain until the reviewer chooses recovery. Which syndrome best fits?';
    const remoteStem = 'Another faculty reviewer saved this repository version first. Which syndrome now best fits?';
    await page.locator('#question-stem').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(localConflictStem);
    api.conflictNextSave('qb_moo_901', remoteStem);
    await page.keyboard.press('ControlOrMeta+S');
    const conflict = page.locator('#qbank-conflict');
    await expect(conflict).toBeVisible();
    await expect(conflict).toBeFocused();
    await expect(page.locator('#question-stem')).toHaveValue(localConflictStem);
    await conflict.getByRole('button', { name: 'Reload' }).focus();
    await page.keyboard.press('Enter');
    await expect(conflict).toHaveCount(0);
    await page.locator('#view-edit').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#question-stem')).toHaveValue(remoteStem);

    await page.locator('#view-live').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-live-preview').focus();
    await page.keyboard.press('Space');
    await page.locator('#view-draft').focus();
    await page.keyboard.press('Enter');
    // R toggles the compound receipt (Task 1's #review-compound) directly — a clean
    // ready draft in Draft view is compound-eligible, so this is the same control
    // Space would check, just the global keyboard shortcut Task 4 adds for it.
    // Draft preview just focused #view-draft (a button, not a form field), so R fires.
    // Scoped to this one question (see recordReceiptScopedToOneQuestionByKeyboard):
    // recording the receipt would otherwise auto-advance the sitting elsewhere, and
    // this test continues qb_moo_901's own edit/revert narrative right after.
    await recordReceiptScopedToOneQuestionByKeyboard(page, 'qb_moo_901');

    await page.locator('#view-edit').focus();
    await page.keyboard.press('Enter');
    await page.locator('#question-stem').focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' Updated locally.');
    await page.locator('#view-draft').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#draft-preview-title')).toHaveText('Unsaved local preview · Not deployed');
    // Dirty again: compoundReviewEligible requires zero dirty fields, so this reverts
    // to the separate-checkbox path — #review-compound is gone, #review-saved-revision
    // is back, unchecked and disabled.
    await expect(page.locator('#review-compound')).toHaveCount(0);
    await expect(page.locator('#review-saved-revision')).not.toBeChecked();
    await expect(page.locator('#review-saved-revision')).toBeDisabled();

    await page.locator('#view-edit').focus();
    await page.keyboard.press('Enter');
    await page.locator('#revert-question').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#question-stem')).toHaveValue(remoteStem);
    await page.locator('#view-live').focus();
    await page.keyboard.press('Enter');
    await page.locator('#review-live-preview').focus();
    await page.keyboard.press('Space');
    await page.locator('#view-draft').focus();
    await page.keyboard.press('Enter');
    // Scoped again (search) for the same reason as above: recording this receipt
    // would otherwise auto-advance the sitting away before the attest right below.
    await recordReceiptScopedToOneQuestionByKeyboard(page, 'qb_moo_901');
    for (const id of CONFIRMATION_IDS) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press('Space');
    }
    await expect(page.locator('#attest-current-item')).toBeEnabled();
    await page.locator('#attest-current-item').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#qbank-action-result')).toContainText('Attested 1 question: qb_moo_901.');
    expect(qbankPosts(api).at(-1).body.items).toHaveLength(1);
    expect(qbankPosts(api).at(-1).body.items[0].id).toBe('qb_moo_901');
  });

  test('keeps clean full-page behavior and a queue-preview-rail order at 390 by 844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installRepositoryApi(page, workflowBank());
    await page.route('**/content/t_mood.md', route => route.fulfill({
      status: 500,
      body: 'Synthetic fallback trigger',
    }));
    await unlock(page);
    await expect(page.locator('#reviewer-label')).toHaveText(SERVER_ATTESTER);
    await expect(page.locator('#preview-status-label')).toHaveText('Error');
    const embeddedUrl = await page.locator('#learner-preview-frame').getAttribute('src');
    for (const privateValue of [
      FACULTY_KEY,
      SERVER_ATTESTER,
      encodeURIComponent(SERVER_ATTESTER),
      'confirm-clinical',
      'originalityAndNoPhi',
      'commit',
    ]) expect(embeddedUrl).not.toContain(privateValue);

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#open-full-page').click();
    const fullPage = await popupPromise;
    await expect(fullPage).toHaveURL(`${MS3_URL}/?page=t_mood.md`);
    const fullUrl = fullPage.url();
    for (const privateValue of [
      FACULTY_KEY,
      SERVER_ATTESTER,
      encodeURIComponent(SERVER_ATTESTER),
      'reviewKey',
      'reviewToken',
      'confirm-clinical',
      'originalityAndNoPhi',
      'commit',
    ]) expect(fullUrl).not.toContain(privateValue);
    await expect(fullPage.locator('#faculty-preview-lock-notice')).toHaveCount(0);
    await expect(fullPage.locator('#content h1')).toHaveText('Mood Disorders on the Inpatient Unit');
    await fullPage.locator('.navitem[data-f="t_anxiety.md"]').click();
    await expect(fullPage.locator('#content h1')).toContainText('Anxiety');
    await fullPage.locator('.navitem[data-f="t_mood.md"]').click();
    const externalPromise = fullPage.waitForEvent('popup');
    await fullPage.locator('#content').getByRole('link', {
      name: 'Mental Status Exam tool',
    }).click();
    const externalTool = await externalPromise;
    await expect(externalTool).toHaveURL(`${MS3_URL}/tools/mse.html`);
    await externalTool.close();
    // The study-export surface lives on the Progress view since the Today/Progress split.
    await fullPage.locator('.navitem[data-f="__progress__"]').click();
    await expect(fullPage.locator('[data-act="studyexport"]')).toBeVisible();
    const [download] = await Promise.all([
      fullPage.waitForEvent('download', { timeout: 5_000 }),
      fullPage.locator('[data-act="studyexport"]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^clerkship_study_.*\.json$/);
    await fullPage.close();

    await page.unroute('**/content/t_mood.md');
    await page.locator('#retry-preview').click();
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-item-selector').selectOption('question:qb_moo_901');
    await page.locator('#view-edit').click();
    await expect(page.locator('#view-edit')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#question-view-edit')).toBeVisible();
    await expect(page.locator('#review-item-selector option:checked')).toHaveAttribute('aria-current', 'true');
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const queue = box('#review-queue-strip');
      const editor = box('.preview-column');
      const rail = box('#attestation-rail');
      return {
        queueBottom: queue.bottom,
        editorTop: editor.top,
        editorBottom: editor.bottom,
        railTop: rail.top,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    expect(layout.queueBottom).toBeLessThanOrEqual(layout.editorTop);
    expect(layout.editorBottom).toBeLessThanOrEqual(layout.railTop);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  });

  test('batch tray: three reviewed drafts attest in one POST; warnings stay individual', async ({ page }) => {
    const api = await installRepositoryApi(page, {
      version: 1,
      items: [
        syntheticQuestion({ id: 'qb_moo_901' }),
        syntheticQuestion({ id: 'qb_moo_902', correctKey: 'B', category: 'psychosis' }),
        syntheticQuestion({ id: 'qb_moo_906', correctKey: 'C', category: 'neurocog' }),
        syntheticQuestion({ id: 'qb_moo_905', correctKey: 'D', category: 'anxiety', stem: WARNING_STEM }),
        retiredQuestion(),
      ],
    });
    await unlock(page);

    // Content-flow keyboard assertion (2026-08-12 efficiency pass, Task 4): the same
    // sitting's A shortcut attests the default-selected pending page and auto-advances
    // straight to the next pending content item — this fixture's two default content
    // items (t_mood.md, mse.html) are otherwise untouched by the rest of this test.
    // No explicit focus target: unlock() just replaced the whole DOM (destroying
    // whatever was focused in the login form), so a real browser has already reverted
    // focus to <body> — exactly the "no form field focused" case the shortcut expects.
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mood disorders page');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.keyboard.press('a');
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mental status exam tool');

    // Recording a compound receipt on a clean ready draft auto-advances straight to
    // the next unreceipted draft in list order (2026-08-12 efficiency pass) —
    // qb_moo_901, then qb_moo_902, then qb_moo_905 (sorted by id; the Warning draft
    // sits between 902 and 906). 905 is deliberately skipped — it never grows a tray
    // checkbox and must be attested individually — so the sitting jumps past it to
    // qb_moo_906 explicitly instead of checking a box there.
    await page.locator('#review-item-selector').selectOption('question:qb_moo_901');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-live-preview').check();
    await page.getByRole('button', { name: 'Draft preview' }).click();
    await page.locator('#review-compound').click();
    await expect(page.locator('#selected-item-identity')).toHaveText('qb_moo_902');

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-live-preview').check();
    await page.getByRole('button', { name: 'Draft preview' }).click();
    await page.locator('#review-compound').click();
    await expect(page.locator('#selected-item-identity')).toHaveText('qb_moo_905');

    await page.locator('#review-item-selector').selectOption('question:qb_moo_906');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-live-preview').check();
    await page.getByRole('button', { name: 'Draft preview' }).click();
    await page.locator('#review-compound').click();
    // Nothing lies after qb_moo_906 in the list; qb_moo_905 lies earlier and is still
    // unreceipted, so the sitting reports that instead of moving (no wrap).
    await expect(page.locator('#selected-item-identity')).toHaveText('qb_moo_906');

    // Auto-enroll (2026-08-12 efficiency pass): each receipt above already checked
    // itself into the batch tray — nothing left to tick by hand.
    for (const id of ['qb_moo_901', 'qb_moo_902', 'qb_moo_906']) {
      await expect(page.locator(`#batch-select-${id}`)).toBeVisible();
      await expect(page.locator(`#batch-select-${id}`)).toBeChecked();
    }

    // Sticky exclusion (2026-08-12 efficiency pass): an explicit uncheck drops an
    // item from the batch without touching its receipt, and survives an unrelated
    // re-render (a confirmation checkbox). Demonstrated on the last-enrolled item so
    // re-checking it restores the same batch order the final POST assertion below
    // expects (Set insertion order — re-adding a removed entry appends it).
    await page.locator('#batch-select-qb_moo_906').uncheck();
    await expect(page.locator('#batch-readout')).toContainText('Selected 2');
    await page.locator('#confirm-clinical').check();
    await expect(page.locator('#batch-select-qb_moo_906')).not.toBeChecked();
    await page.locator('#confirm-clinical').uncheck();
    await page.locator('#batch-select-qb_moo_906').check();
    await expect(page.locator('#batch-readout')).toContainText('Selected 3');

    // The warning draft never grows a tray checkbox, and the tray says why.
    await expect(page.locator('#batch-select-qb_moo_905')).toHaveCount(0);
    await expect(page.locator('#rail-step-batch')).toContainText('must be attested individually');

    await expect(page.locator('#batch-readout')).toContainText('Selected 3');
    await expect(page.locator('#batch-readout')).toContainText('Batch checks pass');
    await expect(page.locator('#attest-selected-drafts')).toBeDisabled();
    await checkConfirmations(page);
    await expect(page.locator('#attest-selected-drafts')).toBeEnabled();

    const attestStart = api.calls.length;
    await page.locator('#attest-selected-drafts').click();
    await expect(page.locator('#qbank-action-result'))
      .toContainText('Attested 3 questions: qb_moo_901, qb_moo_902, qb_moo_906.');
    expect(api.calls.slice(attestStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
      'POST:qbank.attest',
      'GET:state',
    ]);
    const post = api.calls[attestStart];
    expect(post.body.items.map(entry => entry.id)).toEqual(['qb_moo_901', 'qb_moo_902', 'qb_moo_906']);
    for (const entry of post.body.items) {
      expect(entry.revision).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.reviewedRevision).toBe(entry.revision);
    }
    expect(post.body.confirmations).toEqual({
      clinical: true,
      evidence: true,
      originalityAndNoPhi: true,
    });

    // The attested trio has left the tray; nothing eligible remains selected.
    await expect(page.locator('#batch-select-qb_moo_901')).toHaveCount(0);
    await expect(page.locator('#batch-select-qb_moo_902')).toHaveCount(0);
    await expect(page.locator('#batch-select-qb_moo_906')).toHaveCount(0);
  });
});
