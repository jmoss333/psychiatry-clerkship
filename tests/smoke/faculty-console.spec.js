import { expect, test } from '@playwright/test';

import {
  assessBank,
  assessItem,
} from '../../faculty-console/qbank-rules.mjs';
import {
  itemRevision,
  prepareAttestation,
  prepareDraftSave,
} from '../../faculty-console/netlify/functions/qbank-actions.mjs';

const MS3_URL = process.env.MS3_BASE_URL || 'http://localhost:4200';
const FACULTY_KEY = 'synthetic-faculty-key';
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
        status: 'attested',
        type: 'two-tier',
        difficulty: 3,
      }),
      syntheticQuestion({
        id: 'qb_moo_902',
        correctKey: 'B',
        category: 'psychosis',
        difficulty: 1,
      }),
      syntheticQuestion({
        id: 'qb_moo_905',
        correctKey: 'D',
        category: 'anxiety',
        stem: WARNING_STEM,
      }),
      retiredQuestion(),
    ],
  };
}

function balancedBank() {
  return {
    version: 1,
    items: [
      syntheticQuestion({ id: 'qb_moo_901', correctKey: 'A', type: 'two-tier' }),
      syntheticQuestion({ id: 'qb_moo_902', correctKey: 'B' }),
      syntheticQuestion({ id: 'qb_moo_903', correctKey: 'C' }),
      syntheticQuestion({ id: 'qb_moo_904', correctKey: 'D' }),
      retiredQuestion(),
    ],
  };
}

function warningBank() {
  return {
    version: 1,
    items: [
      syntheticQuestion({
        id: 'qb_moo_905',
        correctKey: 'D',
        category: 'anxiety',
        stem: WARNING_STEM,
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

function buildGetPayload(bank) {
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
  const items = [{
    slug: 't_mood.md',
    title: 'Synthetic mood disorders page',
    kind: 'page',
    status: 'unreviewed',
    at: '',
    by: '',
  }];
  return {
    student: 'https://students.example/',
    items,
    qbankRevision: itemRevision(bank).slice(0, 40),
    manifestRevision: MANIFEST_REVISION,
    manifestPages: [...MANIFEST_PAGES],
    qbank,
    qbankSummary,
    counts: {
      pagesReviewed: 0,
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

async function installRepositoryApi(page, initialBank) {
  let bank = structuredClone(initialBank);
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
      const payload = buildGetPayload(bank);
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

  return {
    calls,
    gets,
    receipts,
    currentBank: () => structuredClone(bank),
    currentPayload: () => buildGetPayload(bank),
    assessmentFor(id) {
      const active = activeItems(bank);
      const item = active.find(candidate => candidate.id === id);
      return assessItem(item, {
        manifestPages: MANIFEST_PAGES,
        activeItems: active,
      });
    },
    conflictNextSave(id, remoteStem) {
      conflict = { id, remoteStem };
    },
  };
}

async function unlock(page) {
  await page.goto('/');
  await expect(page).toHaveTitle('Faculty Question Review Workbench');
  await expect(page.getByRole('heading', {
    name: 'Clinical-question quality workbench',
  })).toBeVisible();
  await expect(page.getByLabel('Faculty key')).toBeFocused();
  await page.getByLabel('Faculty key').fill(FACULTY_KEY);
  await page.getByRole('button', { name: 'Unlock workbench' }).click();
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
}

async function checkConfirmations(page) {
  for (const id of CONFIRMATION_IDS) {
    await page.locator(`#${id}`).check();
  }
}

function qbankPosts(api) {
  return api.calls.filter(call => call.method === 'POST' && call.action.startsWith('qbank.'));
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

test('logs in, filters active items, preserves a forced draft, and recovers from a conflict', async ({ page }) => {
  const api = await installRepositoryApi(page, workflowBank());
  await unlock(page);

  expect(api.gets.at(-1).manifestPages).toEqual(MANIFEST_PAGES);
  expect(api.gets.at(-1).manifestRevision).toBe(MANIFEST_REVISION);
  expect(api.gets.at(-1).items).toHaveLength(1);
  expect(api.gets.at(-1).qbank).toHaveLength(3);
  expect(api.gets.at(-1).qbank.map(item => item.id)).not.toContain('qb_moo_999');
  expect(api.gets.at(-1).qbank.every(item => /^[0-9a-f]{64}$/.test(item.revision))).toBe(true);
  await expect(page.locator('#app')).not.toContainText('qb_moo_999');
  await expect(page.locator('.queue-meta')).toHaveText('2 of 3 questions shown');

  await page.locator('#question-status').selectOption('all');
  await expect(page.locator('.queue-meta')).toHaveText('3 of 3 questions shown');
  await page.locator('#question-gate').selectOption('warning');
  await expect(page.locator('#question-queue')).toContainText('qb_moo_905');
  await expect(page.locator('#question-queue')).not.toContainText('qb_moo_901');
  await page.locator('#question-gate').selectOption('all');
  await page.locator('#filter-question-category').selectOption('mood');
  await expect(page.locator('#question-queue')).toContainText('qb_moo_901');
  await expect(page.locator('#question-queue')).not.toContainText('qb_moo_902');
  await page.locator('#filter-question-category').selectOption('all');
  await page.locator('#filter-question-difficulty').selectOption('3');
  await expect(page.locator('.queue-meta')).toHaveText('1 of 3 questions shown');
  await expect(page.locator('#question-queue')).toContainText('qb_moo_901');
  await page.locator('#filter-question-difficulty').selectOption('all');
  await page.locator('#question-search').fill('qb_moo_999');
  await expect(page.locator('.empty-queue')).toHaveText(/No questions match/);
  await page.locator('#question-search').fill('qb_moo_901');
  await expect(page.locator('#question-queue')).toContainText('qb_moo_901');
  await page.locator('#question-search').fill('');

  await page.locator('#queue-qb_moo_901').click();
  await expect(page.locator('.review-heading .muted')).toHaveText('Attested repository version');
  await expect(page.locator('#tier2-question')).toHaveValue('Which feature most directly supports the selected syndrome?');
  for (const key of ['A', 'B', 'C']) {
    await expect(page.locator(`#tier2-option-${key}-text`)).not.toHaveValue('');
    await expect(page.locator(`#tier2-correct-${key}`)).toBeVisible();
  }
  await expect(page.locator('#tier2-option-D-text')).toHaveCount(0);
  await expect(page.locator('#add-tier2-option-d')).toHaveText('Add fourth option');
  await expect(page.locator('#tier2-why')).not.toHaveValue('');

  const postsBeforeBlock = qbankPosts(api).length;
  await page.locator('#question-stem').fill('');
  await expect(page.locator('.gate-label.blocked')).toHaveText(/Blocked/);
  await expect(page.locator('#safety-issues')).toContainText('stem cannot be empty');
  await expect(page.locator('#question-stem')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#question-stem')).toHaveAttribute(
    'aria-describedby',
    'issue-blocked-required-stem-stem',
  );
  const blockerDescription = page.locator('#issue-blocked-required-stem-stem');
  await expect(blockerDescription).toHaveText('stem: stem cannot be empty.');
  expect(await blockerDescription.evaluate(node => node.tagName)).toBe('LI');
  await blockerDescription.getByRole('link', { name: 'stem' }).click();
  await expect(page.locator('#question-stem')).toBeFocused();
  await expect(page.locator('#save-draft')).toBeDisabled();
  await page.waitForTimeout(50);
  expect(qbankPosts(api)).toHaveLength(postsBeforeBlock);

  const savedStem = 'A fictional adult has five weeks of low mood, anhedonia, early waking, and impaired function without activation. Which diagnosis best explains the syndrome?';
  await page.locator('#question-stem').fill(savedStem);
  await expect(page.locator('.review-heading .gate-label.ready')).toHaveText(/Ready/);
  await expect(page.locator('#question-stem')).not.toHaveAttribute('aria-invalid', /.+/);
  await expect(page.locator('#question-stem')).not.toHaveAttribute('aria-describedby', /.+/);
  await expect(page.locator('#save-draft')).toBeEnabled();
  const saveStart = api.calls.length;
  await page.locator('#save-draft').click();
  await expect(page.locator('#qbank-action-result')).toContainText('Saved draft qb_moo_901');

  const saveCalls = api.calls.slice(saveStart);
  expect(saveCalls.map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
    'POST:qbank.save-draft',
    'GET:state',
  ]);
  expect(saveCalls[0].body.item.status).toBe('attested');
  expect(saveCalls[0].body.manifestRevision).toBe(MANIFEST_REVISION);
  expect(saveCalls[0].body.baseRevision).toMatch(/^[0-9a-f]{64}$/);
  const saved = api.currentBank().items.find(item => item.id === 'qb_moo_901');
  expect(saved.status).toBe('draft');
  expect(saved.stem).toBe(savedStem);
  const saveReceipt = api.receipts.at(-1);
  expect(saveReceipt.revision).toMatch(/^[0-9a-f]{64}$/);
  expect(saveReceipt.commit).toMatch(/^https:\/\//);
  expect(api.gets.at(-1).qbank.find(item => item.id === 'qb_moo_901').revision).toBe(saveReceipt.revision);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
  await page.locator('#queue-qb_moo_901').click();
  await expect(page.locator('#question-stem')).toHaveValue(savedStem);
  await expect(page.locator('.review-heading .muted')).toHaveText('Draft repository version');
  await expect(page.locator('#batch-qb_moo_901')).toBeDisabled();
  await expect(page.locator('#batch-qb_moo_901')).toHaveAttribute(
    'aria-label',
    /Mark reviewed & next before batch selection/,
  );

  const localConflictStem = 'This local edit must remain visible until the reviewer chooses how to recover. Which diagnosis fits?';
  const remoteStem = 'A different faculty reviewer saved this repository version first. Which diagnosis best fits the updated syndrome?';
  await page.locator('#question-stem').fill(localConflictStem);
  api.conflictNextSave('qb_moo_901', remoteStem);
  const conflictStart = api.calls.length;
  await page.locator('#save-draft').click();
  await expect(page.getByRole('heading', {
    name: 'This review context changed in the repository',
  })).toBeVisible();
  await expect(page.locator('#question-stem')).toHaveValue(localConflictStem);
  expect(api.calls.slice(conflictStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
    'POST:qbank.save-draft',
  ]);
  await page.locator('#qbank-conflict').getByRole('button', { name: 'Reload' }).click();
  await expect(page.locator('#question-stem')).toHaveValue(remoteStem);
  await expect(page.locator('#qbank-conflict')).toHaveCount(0);
  expect(api.calls.slice(conflictStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
    'POST:qbank.save-draft',
    'GET:state',
  ]);

  expect(api.calls.every(call => call.key === FACULTY_KEY)).toBe(true);
  expect(api.calls.every(call => new URL(call.url).search === '')).toBe(true);
  expect(qbankPosts(api).every(call => !Object.hasOwn(call.body, 'facultyKey'))).toBe(true);
});

test('attests only a reviewed and answer-balanced green batch', async ({ page }) => {
  const api = await installRepositoryApi(page, balancedBank());
  await unlock(page);

  const ids = ['qb_moo_901', 'qb_moo_902', 'qb_moo_903', 'qb_moo_904'];
  for (const id of ids) {
    expect(api.assessmentFor(id).gate).toBe('ready');
    await page.locator(`#queue-${id}`).click();
    await expect(page.locator('#mark-reviewed-next')).toBeEnabled();
    await page.locator('#mark-reviewed-next').click();
    await expect(page.locator(`#batch-${id}`)).toBeEnabled();
    await page.locator(`#batch-${id}`).check();
  }

  await checkConfirmations(page);
  await expect(page.locator('#batch-safety')).toContainText('4 reviewed green drafts selected');
  await expect(page.locator('#batch-safety')).not.toContainText('strong answer-position cue');
  await expect(page.locator('#open-batch-attest')).toBeEnabled();

  const revisionsBefore = Object.fromEntries(api.currentPayload().qbank.map(item => [item.id, item.revision]));
  await page.locator('#open-batch-attest').click();
  await expect(page.getByRole('dialog', {
    name: 'Confirm green batch attestation',
  })).toBeVisible();
  for (const id of ids) {
    await expect(page.locator('#batch-confirmation')).toContainText(`${id} — revision ${revisionsBefore[id]}`);
  }

  const attestStart = api.calls.length;
  await page.locator('#confirm-batch-attest').click();
  await expect(page.locator('#qbank-action-result')).toContainText('Attested 4 questions');
  expect(api.calls.slice(attestStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
    'POST:qbank.attest',
    'GET:state',
  ]);

  const post = qbankPosts(api).at(-1);
  expect(post.body.manifestRevision).toBe(MANIFEST_REVISION);
  expect(post.body.items).toEqual(ids.map(id => ({
    id,
    revision: revisionsBefore[id],
    reviewedRevision: revisionsBefore[id],
  })));
  expect(post.body.confirmations).toEqual({
    clinical: true,
    evidence: true,
    originalityAndNoPhi: true,
  });
  expect(api.currentBank().items.filter(item => ids.includes(item.id)).map(item => item.status)).toEqual([
    'attested',
    'attested',
    'attested',
    'attested',
  ]);
  const receipt = api.receipts.at(-1);
  expect(Object.keys(receipt.revision)).toEqual(ids);
  expect(Object.values(receipt.revision).every(revision => /^[0-9a-f]{64}$/.test(revision))).toBe(true);
  expect(receipt.commit).toMatch(/^https:\/\//);
  await page.locator('#question-status').selectOption('all');
  await expect(page.locator('.count-strip')).toContainText('Attested4');
});

test('requires individual warning acknowledgement before attestation', async ({ page }) => {
  const api = await installRepositoryApi(page, warningBank());
  await unlock(page);

  expect(api.assessmentFor('qb_moo_905')).toEqual({
    gate: 'warning',
    blockers: [],
    warnings: [{
      code: 'stem.negative_lead_in',
      field: 'stem',
      message: 'Review the negative wording in the final lead-in.',
    }],
  });
  await expect(page.locator('.review-heading .gate-label.warning')).toHaveText(/Warning/);
  await expect(page.locator('#safety-issues')).toContainText('Review the negative wording');
  await expect(page.locator('#question-stem')).toHaveAttribute(
    'aria-describedby',
    'issue-warning-stem-negative_lead_in-stem',
  );
  await expect(page.locator('#question-stem')).not.toHaveAttribute('aria-invalid', /.+/);
  const warningDescription = page.locator('#issue-warning-stem-negative_lead_in-stem');
  await expect(warningDescription).toHaveText(
    'stem: Review the negative wording in the final lead-in.',
  );
  await warningDescription.getByRole('link', { name: 'stem' }).click();
  await expect(page.locator('#question-stem')).toBeFocused();
  await expect(page.locator('#attest-warning')).toBeDisabled();

  await checkConfirmations(page);
  await expect(page.locator('#attest-warning')).toBeDisabled();
  await page.locator('#ack-stem-negative_lead_in').check();
  await expect(page.locator('#attest-warning')).toBeEnabled();

  const attestStart = api.calls.length;
  await page.locator('#attest-warning').click();
  await expect(page.locator('#qbank-action-result')).toContainText('Attested 1 question: qb_moo_905');
  expect(api.calls.slice(attestStart).map(call => `${call.method}:${call.action || 'state'}`)).toEqual([
    'POST:qbank.attest',
    'GET:state',
  ]);
  const post = qbankPosts(api).at(-1);
  expect(post.body.manifestRevision).toBe(MANIFEST_REVISION);
  expect(post.body.items).toEqual([{
    id: 'qb_moo_905',
    revision: post.body.items[0].revision,
    acknowledgedWarnings: ['stem.negative_lead_in'],
  }]);
  expect(post.body.items[0].revision).toMatch(/^[0-9a-f]{64}$/);
  expect(api.currentBank().items.find(item => item.id === 'qb_moo_905').status).toBe('attested');
  expect(api.receipts.at(-1).revision).toEqual({
    qb_moo_905: itemRevision(api.currentBank().items.find(item => item.id === 'qb_moo_905')),
  });
});
