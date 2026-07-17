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

const FACULTY_KEY = 'synthetic-faculty-key';
const MANIFEST_PAGES = ['t_mood.md'];
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

test('logs in, filters active items, preserves a forced draft, and recovers from a conflict', async ({ page }) => {
  const api = await installRepositoryApi(page, workflowBank());
  await unlock(page);

  expect(api.gets.at(-1).manifestPages).toEqual(MANIFEST_PAGES);
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
  await expect(page.locator('#save-draft')).toBeDisabled();
  await page.waitForTimeout(50);
  expect(qbankPosts(api)).toHaveLength(postsBeforeBlock);

  const savedStem = 'A fictional adult has five weeks of low mood, anhedonia, early waking, and impaired function without activation. Which diagnosis best explains the syndrome?';
  await page.locator('#question-stem').fill(savedStem);
  await expect(page.locator('.review-heading .gate-label.ready')).toHaveText(/Ready/);
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
    name: 'This question changed in the repository',
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
