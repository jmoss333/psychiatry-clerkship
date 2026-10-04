import { expect, test } from '@playwright/test';
import { syntheticMedicationSnapshot } from '../fixtures/medication-review.mjs';
import { medicationView, prepareMedicationApproval } from '../../faculty-console/netlify/functions/pharmacy-actions.mjs';

import {
  assessBank,
} from '../../faculty-console/qbank-rules.mjs';
import {
  itemRevision,
  prepareAttestation,
  prepareDraftSave,
} from '../../faculty-console/netlify/functions/qbank-actions.mjs';

const MS3_URL = process.env.MS3_BASE_URL || 'http://localhost:4200';
// The resident deployment. Case-of-the-Week ships an MS3 page and a resident twin from
// one registry week, and the resident half exists only here — previewing it against the
// MS3 site would report not_found for a page that is live.
const RES_URL = process.env.RES_BASE_URL || 'http://localhost:4201';
// Real slugs from cotw_registry.json, so the previews below load the pages the two
// builds actually publish rather than a fixture that only resembles them.
const COTW_MS3_SLUG = 'cotw_20260831_catatonia_ms3.md';
const COTW_RES_SLUG = 'cotw_20260831_catatonia_res.md';
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
      site: 'ms3',
      status: 'pending',
      at: '',
      by: '',
    },
    {
      slug: 'mse.html',
      title: 'Synthetic mental status exam tool',
      kind: 'tool',
      site: 'ms3',
      status: 'pending',
      at: '',
      by: '',
    },
  ];
}

/* The registry-derived half of the content universe: an MS3 page and its resident twin
   from one Case-of-the-Week week. Titles carry the audience exactly as
   content-universe.mjs builds them, which is what sorts the pair adjacently. */
function cotwContentState() {
  return [
    ...initialContentState(),
    {
      slug: COTW_MS3_SLUG,
      title: 'Catatonia (Aug 31) — MS3',
      kind: 'page',
      site: 'ms3',
      status: 'pending',
      at: '',
      by: '',
    },
    {
      slug: COTW_RES_SLUG,
      title: 'Catatonia (Aug 31) — Resident',
      kind: 'page',
      site: 'res',
      status: 'pending',
      at: '',
      by: '',
    },
  ];
}

// Every console URL after any action must carry the item key and nothing else. The
// faculty key, the review token, and the reviewer label never belong in an address bar.
async function expectNoSecretsInUrl(page) {
  const href = await page.evaluate(() => location.href);
  const url = new URL(href);
  expect([...url.searchParams.keys()].filter(key => key !== 'item')).toEqual([]);
  for (const secret of [FACULTY_KEY, REVIEW_TOKEN, SERVER_ATTESTER, 'faculty-key', 'reviewToken']) {
    expect(href).not.toContain(secret);
  }
  return url;
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
    resident: `${RES_URL}/`,
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
  // Extra top-level GET state fields (branch-sync probe, derived-listing source). The
  // server adds these advisory fields beside the queue; a test that needs one supplies
  // it here rather than reshaping buildGetPayload for every caller.
  stateExtras = null,
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
      const payload = { ...buildGetPayload(bank, contentState), ...(stateExtras || {}) };
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

// `path` lets a test arrive by deep link (?item=<key>) at a LOCKED console, which is the
// case that matters: the request has to survive the key prompt.
async function unlock(page, { path = '/' } = {}) {
  await page.addInitScript(() => {
    window.__facultyConsolePreviewMessages = [];
    window.addEventListener('message', event => {
      if (event.data?.type === 'faculty-preview-status') {
        window.__facultyConsolePreviewMessages.push(structuredClone(event.data));
      }
    });
  });
  await page.goto(path);
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
// The search-scoping is for test isolation, not to dodge a receipt-wiping bug: as of
// the final-review fix wave (2026-08-12), handlePreviewStatus preserves the selected
// question's revision-anchored receipt when its preview re-reports ready
// (clearReviewAcknowledgements({ preserveQuestionReceipts: event.data.status ===
// 'ready' })) — navigating away and back no longer revokes it. Each test still scopes
// to one question so its assertions do not depend on where auto-advance would
// otherwise land, which the auto-advance tests elsewhere already cover on their own.
async function recordReceiptScopedToOneQuestion(page, id) {
  await page.locator('#review-search').fill(id);
  await page.locator('#review-compound').click();
  await expect(page.locator('#review-compound')).toBeChecked();
  await expect(page.locator('#selected-item-identity')).toHaveText(id);
  await page.locator('#review-search').fill('');
}

// Keyboard-driven counterpart of recordReceiptScopedToOneQuestion — same test-isolation
// rationale (see above), driven via the R shortcut instead of a click. Explicitly
// refocuses #view-draft (a button, not a form field) before pressing R — .fill() leaves
// focus on #review-search itself, which the R shortcut's own form-field guard would
// ignore.
async function recordReceiptScopedToOneQuestionByKeyboard(page, id) {
  await page.locator('#review-search').fill(id);
  await page.locator('#view-draft').focus();
  await page.keyboard.press('r');
  await expect(page.locator('#review-compound')).toBeChecked();
  await expect(page.locator('#selected-item-identity')).toHaveText(id);
  await page.locator('#review-search').fill('');
}

test('red-team revisions show exact deploys and fail closed without remounting the learner preview', async ({ page }) => {
  await installRepositoryApi(page, workflowBank());
  let available = true;
  let seenKey = '';
  const sha = 'a'.repeat(40);
  const deployment = (id, host) => ({
    deployId: id,
    commitRef: sha,
    deployUrl: `https://${id}--${host}.netlify.app`,
    publishedAt: '2026-09-27T03:18:29.119Z',
  });
  await page.route('**/api/red-team-revisions', async route => {
    seenKey = (await route.request().allHeaders())['x-faculty-key'];
    await fulfillJson(route, available ? 200 : 503, available ? {
      state: 'metadata-verified',
      fetchedAt: '2026-09-27T03:50:00.000Z',
      pack: { sourceCommit: sha, sha256: 'b'.repeat(64), version: '0.1.0', model: 'synthetic-model' },
      deployments: {
        proxy: deployment('1'.repeat(24), 'sp-interview-proxy'),
        ms3: deployment('2'.repeat(24), 'une-ms3-psychiatry'),
        res: deployment('3'.repeat(24), 'mmc-psychiatry-residents-sanford'),
      },
    } : { state: 'unverified' });
  });
  await unlock(page);
  await page.evaluate(() => { window.__redTeamOriginalFrame = document.querySelector('#learner-preview-frame'); });

  await page.getByRole('button', { name: 'Show current revisions' }).click();
  await expect(page.locator('#red-team-revisions')).toContainText('Pack source on main');
  await expect(page.locator('#red-team-revisions')).toContainText('Resident learner site');
  await expect(page.locator('#red-team-revisions')).toContainText('not a red-team pass');
  await expect(page.locator('#red-team-revisions a', { hasText: 'Open this exact deploy' })).toHaveCount(3);
  expect(seenKey).toBe(FACULTY_KEY);
  expect(await page.evaluate(() => document.querySelector('#learner-preview-frame') === window.__redTeamOriginalFrame)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('#red-team-revisions').evaluate(panel => panel.scrollWidth - panel.clientWidth)).toBeLessThanOrEqual(1);

  available = false;
  await page.getByRole('button', { name: 'Refresh revisions' }).click();
  await expect(page.locator('#red-team-revisions')).toContainText('Unverified: exact revision evidence is unavailable');
  await expect(page.locator('#red-team-revisions a', { hasText: 'Open this exact deploy' })).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('#learner-preview-frame') === window.__redTeamOriginalFrame)).toBe(true);
});

test('release status says what learners see, lists merged work that is not live, and fails closed', async ({ page }) => {
  await installRepositoryApi(page, workflowBank());
  let available = true;
  let seenKey = '';
  const live = '1'.repeat(40);
  const site = id => ({
    commitRef: live,
    publishedAt: '2026-09-26T21:18:00.000Z',
    deployUrl: `https://${id}--example.netlify.app`,
  });
  await page.route('**/api/release-status', async route => {
    seenKey = (await route.request().allHeaders())['x-faculty-key'];
    await fulfillJson(route, available ? 200 : 503, available ? {
      state: 'partial',
      fetchedAt: '2026-09-27T13:00:00.000Z',
      main: '3'.repeat(40),
      release: live,
      live,
      liveBasis: 'published deploys',
      sites: { ms3: site('2'.repeat(24)), res: site('3'.repeat(24)) },
      sitesDisagree: false,
      releaseUnserved: false,
      mainChecks: { verdict: 'running', conclusions: {} },
      waiting: {
        status: 'waiting',
        complete: true,
        changes: [
          { sha: '3'.repeat(40), pr: 846, title: 'Phone dock label', signoff: false, at: '2026-09-27T12:47:46Z' },
          { sha: '2'.repeat(40), pr: 781, title: 'attest: faculty review', signoff: true, at: '2026-09-27T10:00:00Z' },
        ],
      },
      train: {
        workflowUrl: 'https://github.com/jmoss333/psychiatry-clerkship/actions/workflows/production-release-train.yml',
        nextSlot: '2026-09-27T15:05:00.000Z',
        lastRun: { at: '2026-09-27T09:21:01Z', event: 'schedule', status: 'completed', conclusion: 'failure', url: 'https://github.com/jmoss333/psychiatry-clerkship/actions/runs/1' },
        week: { days: 7, complete: true, scheduled: 21, publishNow: 2, ok: 18, before: 4, after: 1, unknown: 0, running: 0 },
      },
      signoffs: {
        items: [{ slug: 'sp-interview.html', kind: 'tool', signedAt: '2026-09-26', sites: ['ms3', 'res'] }],
        unread: [],
        complete: true,
      },
      ledgerMode: false,
      gaps: ["main's required checks: GitHub answered 403"],
      headline: { tone: 'attention', text: '2 merged changes (1 faculty sign-off) are not live for learners yet.' },
    } : { state: 'unavailable' });
  });
  await unlock(page);
  await page.evaluate(() => { window.__releaseOriginalFrame = document.querySelector('#learner-preview-frame'); });

  await page.getByRole('button', { name: 'Show release status' }).click();
  const panel = page.locator('#release-status');
  await expect(panel.locator('#release-headline')).toHaveText('2 merged changes (1 faculty sign-off) are not live for learners yet.');
  await expect(panel.locator('#release-waiting li')).toHaveCount(2);
  await expect(panel.locator('#release-waiting a', { hasText: '#846' })).toHaveAttribute('href', 'https://github.com/jmoss333/psychiatry-clerkship/pull/846');
  await expect(panel.locator('.release-status__tag')).toHaveText('Faculty sign-off');
  await expect(panel).toContainText('Resident learner site');
  await expect(panel).toContainText('scheduled · failure');
  await expect(panel).toContainText("main's required checks: GitHub answered 403");
  await expect(panel).toContainText('never publishes');
  await expect(panel.locator('#release-week')).toHaveText(
    'Release train, last 7 days: 21 scheduled runs and 2 publish-now — 18 published or had nothing new, '
    + '4 stopped before publishing (held by the spend tripwire, refused, or could not check), 1 failed after publishing.',
  );
  await expect(panel.locator('#release-signoffs')).toHaveText(
    'Learners see 1 page as awaiting your re-signature — the content changed after it was signed: '
    + 'sp-interview.html (signed 2026-09-26). Re-attest under Needs review.',
  );
  // Re-sign before the next publish: the countdown runs from the panel's own check time
  // (13:00 UTC), and a served-pending page the queue does not list is "now", never "signed".
  await expect(panel.locator('#resign-now-heading')).toHaveText(
    'Re-sign 1 page before the next publish — 15:05 UTC, in 2 h 5 min.',
  );
  await expect(panel.locator('.resign-now-row--now')).toHaveText(
    'sp-interview.html · Learners see it pending now (signed 2026-09-26)',
  );
  expect(seenKey).toBe(FACULTY_KEY);
  expect(await page.evaluate(() => document.querySelector('#learner-preview-frame') === window.__releaseOriginalFrame)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);

  available = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  // The refresh settles (its button re-enables) before the fail-closed state is judged.
  await expect(panel.locator('#release-refresh')).toBeEnabled();
  await expect(panel.locator('.release-status__error')).toHaveText(/^Release status is unavailable right now/);
  await expect(panel.locator('#release-waiting')).toHaveCount(0);
  await expect(panel.locator('#release-headline')).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('#learner-preview-frame') === window.__releaseOriginalFrame)).toBe(true);
});

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
    // PAINT ONLY, NEVER PERSIST -- this assertion used to read 'light' and was inverted with the
    // behaviour it pins. The shell can push only a RESOLVED attribute into a frame, so a child
    // that wrote what it was pushed converted a learner's 'system' choice into a pinned
    // light/dark mode with no gesture anywhere in the chain (retired in 4970087; the page's own
    // handler carries the reason, and tests/fd-settings.test.mjs pins it at source level). The
    // seeded mode therefore has to survive the push.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_theme'))).toBe('dark');
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

  test('reports an unknown tool not_found without falling back to Today', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      tool: 'unknown-faculty-preview.html',
      reviewKey: 'tool:unknown-faculty-preview.html',
    });

    await page.goto(url.href);

    await expect(page.locator('#content [role="alert"]')).toContainText('Tool unavailable');
    await expect(page.locator('#content')).not.toContainText('Good morning');
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

  test('locks a ready page against Front Door tabs, search, safety, Reader links, messages, and history', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    await page.goto(url.href);
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);

    const storageBefore = await page.evaluate(() => ({
      progress: localStorage.getItem('cw_progress_v1'),
      frontdoor: localStorage.getItem('cw_frontdoor_v1'),
      rotation: localStorage.getItem('cw_rotation_start'),
    }));
    await page.evaluate(() => {
      document.querySelector('[data-fd-tab="library"]').click();
      document.querySelector('[data-fd-search]').click();
      document.querySelector('.fd-safetybtn[data-fd-safety]').click();
      document.querySelector('#content a[href^="?tool="]').click();
      window.postMessage({ type: 'openPage', f: 't_psychosis.md' }, location.origin);
      window.postMessage({ type: 'openLibrary' }, location.origin);
      history.pushState({}, '', '?page=t_anxiety.md');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.postMessage({ type: 'search', q: 'psychosis' }, location.origin);
    });

    await page.waitForTimeout(200);
    await expect(page.locator('#content h1')).toHaveText('Mood Disorders on the Inpatient Unit');
    const notice = page.locator('#faculty-preview-lock-notice');
    await expect(notice).toHaveText(
      'Open the full page from the faculty console to navigate elsewhere',
    );
    expect(await notice.evaluate(node => !document.querySelector('#content').contains(node))).toBe(true);
    await expect(page.locator('.fd-search, .fd-sheet')).toHaveCount(0);
    expect(page.url()).toBe(url.href);
    expect(await page.evaluate(() => ({
      progress: localStorage.getItem('cw_progress_v1'),
      frontdoor: localStorage.getItem('cw_frontdoor_v1'),
      rotation: localStorage.getItem('cw_rotation_start'),
    }))).toEqual(storageBefore);
    expect(await learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);
  });

  test('blocks parent-document Reader links from leaving a ready page', async ({ page }) => {
    await installLearnerPreviewHarness(page);
    const url = learnerPreviewUrl({
      page: 't_mood.md',
      reviewKey: 'page:t_mood.md',
    });
    await page.goto(url.href);
    await expect.poll(() => learnerPreviewStatuses(page)).toEqual([
      expectedLearnerPreviewStatus('page', 'page:t_mood.md', 'ready'),
    ]);

    const readerTool = page.locator('#content a[href^="?tool="]:visible').first();
    await expect(readerTool).toBeVisible();
    await readerTool.click();

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

  test('keeps the exact-question iframe and route through Front Door lock attempts', async ({ page }) => {
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
      document.querySelector('[data-fd-tab="library"]').click();
      document.querySelector('[data-fd-search]').click();
      document.querySelector('.fd-safetybtn[data-fd-safety]').click();
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
    await expect(page.locator('.fd-search, .fd-sheet')).toHaveCount(0);
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

/* Branch lag (2026-09-04 → 2026-09-07). shipped_pages.json landed on `main` while the
   attestation branch sat five attestations ahead, so every console load 404'd reading
   the derived listing from that branch and showed "The console could not load / The
   repository request failed. Try again later." for three days. The listing is derived
   and never written by the console, so GET now reads it from the base branch when the
   attestation branch does not carry it: the queue loads in full and one line says
   where it came from. */
test('a derived listing missing from the attestation branch shows a notice, not a dead console', async ({ page }) => {
  await installRepositoryApi(page, workflowBank(), {
    stateExtras: {
      shippedPagesSource: 'base',
      shippedPagesBranch: 'main',
      shippedPagesRevision: 'a'.repeat(40),
    },
  });
  await unlock(page);

  const notice = page.locator('#shipped-pages-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Review queue derived from `main`');
  await expect(notice).toContainText('missing shipped_pages.json');
  await expect(notice).toContainText('merge the rolling review request');

  // The whole point of the fallback: the queue is still there, in full.
  await expect(page.locator('#review-item-selector').locator('option')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'The console could not load' })).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'Open learner surface' })).toBeVisible();

    const frame = page.locator('#learner-preview-frame');
    await expect(frame).toHaveAttribute('title', 'Live learner preview for Synthetic mood disorders page');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    const frameUrl = new URL(await frame.getAttribute('src'));
    expect(frameUrl.origin).toBe(new URL(MS3_URL).origin);
    expect(frameUrl.pathname).toBe('/');
    expect([...frameUrl.searchParams.keys()]).toEqual(['page', 'reviewKey', 'reviewToken']);
    expect(frameUrl.searchParams.get('page')).toBe('t_mood.md');
    expect(frameUrl.searchParams.get('reviewKey')).toBe('page:t_mood.md');
    expect(frameUrl.searchParams.get('reviewToken')).toMatch(/^[0-9a-f]{32}$/);

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

  test('attests one page and tool, keeps session receipts, and reopens one page for re-attestation', async ({ page }) => {
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
    // t_mood.md. Its item-level receipt must not appear under the newly selected tool;
    // the persistent sitting ledger retains the confirmed action and commit instead.
    await expect(page.locator('#content-action-result')).toHaveCount(0);
    await expect(page.locator('#session-action-ledger')).toContainText('Attested t_mood.md.');
    await page.locator('#session-action-ledger summary').click();
    await expect(page.locator('#session-action-ledger').getByRole('link', {
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
    const toolPreviewSrc = await page.locator('#learner-preview-frame').getAttribute('src');
    const toolPreviewUrl = new URL(toolPreviewSrc);
    const learnerBase = new URL(MS3_URL);
    expect(toolPreviewUrl.origin).toBe(learnerBase.origin);
    expect(toolPreviewUrl.pathname).toBe(learnerBase.pathname);
    expect([...toolPreviewUrl.searchParams.keys()]).toEqual(['tool', 'reviewKey', 'reviewToken']);
    expect(toolPreviewUrl.searchParams.get('tool')).toBe('mse.html');
    expect(toolPreviewUrl.searchParams.get('reviewKey')).toBe('tool:mse.html');
    expect(toolPreviewUrl.searchParams.get('reviewToken')).toMatch(/^[0-9a-f]{32}$/);
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
    await page.frameLocator('#learner-preview-frame').locator('[data-fd-tab="library"]').click();
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
    await fullPage.evaluate(() => {
      localStorage.setItem('cw_rotation_start', '2026-08-17');
      localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
        role: 'staff', tab: 'library', viewWeek: 1,
      }));
    });
    await fullPage.goto(`${MS3_URL}/?page=t_mood.md`);
    await expect(fullPage.locator('#faculty-preview-lock-notice')).toHaveCount(0);
    await expect(fullPage.locator('.fd-article__h1')).toHaveText('Mood');
    await fullPage.locator('[data-fd-tab="library"]').click();
    await fullPage.locator('.fd-kit__reading[data-fd-open="t_anxiety.md"]').click();
    await expect(fullPage.locator('.fd-article__h1')).toContainText('Anxiety');
    await fullPage.locator('[data-fd-tab="library"]').click();
    await fullPage.locator('.fd-kit__reading[data-fd-open="t_mood.md"]').click();
    const externalPromise = fullPage.waitForEvent('popup');
    await fullPage.locator('#content').getByRole('link', {
      name: 'Mental Status Exam tool',
    }).click();
    const externalTool = await externalPromise;
    await expect(externalTool).toHaveURL(`${MS3_URL}/tools/mse.html`);
    await externalTool.close();
    // The study-export surface lives in the internal Progress Reader reached from Today.
    await fullPage.locator('[data-fd-home]').first().click();
    await fullPage.locator('[data-fd-progress]').click();
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
    await expect(page.getByRole('button', { name: 'Open learner surface' })).toBeVisible();
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
    // unlock() replaced the whole DOM, so focus starts at <body> — exactly the "no form
    // field focused" case the shortcut expects. That state is not stable, though: once
    // the learner preview finishes loading, focus can land on #learner-preview-frame, and
    // a key pressed while an IFRAME holds focus is delivered to THAT frame's document.
    // The console's window-level keydown listener never sees it, so A silently does
    // nothing, the auto-advance never happens, and the assertion below burns its timeout
    // pointing at the wrong cause (~10% of runs). Establish the documented precondition
    // rather than assuming it survived the preview load.
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mood disorders page');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.evaluate(() => {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press('a');
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mental status exam tool');

    // Recording a compound receipt on a clean ready draft auto-advances straight to
    // the next unreceipted draft in list order (2026-08-12 efficiency pass) —
    // qb_moo_901, then qb_moo_902, then qb_moo_905 (sorted by id; the Warning draft
    // sits between 902 and 906). 905 is deliberately skipped — it never grows a tray
    // checkbox and must be attested individually — so the sitting jumps past it to
    // qb_moo_906 explicitly instead of checking a box there.
    // Entering the sitting is manual navigation, so this first draft opens on Live
    // deploy and takes a "Draft preview" click. The compound receipt records BOTH
    // halves, so no separate #review-live-preview tick is needed on the way in.
    await page.locator('#review-item-selector').selectOption('question:qb_moo_901');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.getByRole('button', { name: 'Draft preview' }).click();
    await page.locator('#review-compound').click();
    await expect(page.locator('#selected-item-identity')).toHaveText('qb_moo_902');
    await expect(page.locator('#batch-enrollment-feedback'))
      .toContainText('qb_moo_901 was added to this batch');
    await page.locator('#undo-batch-enrollment').click();
    await expect(page.locator('#batch-enrollment-feedback'))
      .toContainText('qb_moo_901 was removed from this batch');
    await expect(page.locator('#batch-select-qb_moo_901')).not.toBeChecked();
    await page.locator('#batch-select-qb_moo_901').check();

    // ...and from here the sitting costs ONE action per draft: the advance carried
    // Draft preview forward, so the compound control is already rendered on arrival.
    // No view click, and #review-live-preview is deliberately absent (the compound
    // control replaces the pair whenever the draft is clean and the preview Ready).
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await expect(page.getByRole('button', { name: 'Draft preview' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#review-live-preview')).toHaveCount(0);
    await page.locator('#review-compound').click();
    await expect(page.locator('#selected-item-identity')).toHaveText('qb_moo_905');

    // Jumping past 905 is manual navigation again, so Live deploy and a view click.
    await page.locator('#review-item-selector').selectOption('question:qb_moo_906');
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
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

    // One-press confirmations (2026-08-13): the commit is enabled on the per-item
    // receipts and the cohort check alone, and its label states the three assertions
    // the press records. checkConfirmations() is deliberately NOT called here — the
    // POST assertion below proves the same three flags still commit without a single
    // confirmation checkbox being ticked.
    await expect(page.locator('#attest-selected-drafts')).toBeEnabled();
    await expect(page.locator('#attest-selected-drafts'))
      .toContainText('answer & rationale verified · evidence anchored · original, no PHI');
    for (const id of CONFIRMATION_IDS) {
      await expect(page.locator(`#${id}`)).not.toBeChecked();
    }

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

/* Case-of-the-Week visibility, deep links, the bookmarklet, and twin navigation
   (2026-09). The first test here is the regression guard for the original bug: before
   the content-universe change the console's queue was the manifest and nothing else, so
   a pending page that only cotw_registry.json knows about could not appear at all. */
test.describe.serial('faculty console: registry pages, deep links, and twins', () => {
  test('lists both Case-of-the-Week twins and previews each against its own site', async ({ page }) => {
    await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await unlock(page);

    // Default filters are Needs review / All types, and all four content items are
    // pending — the two manifest items plus both registry-derived twins.
    await expect(page.locator('#review-status-filter')).toHaveValue('needs-review');
    await expect(page.locator('#review-type-filter')).toHaveValue('all');
    const options = page.locator('#review-item-selector option');
    await expect(options.filter({ hasText: 'Catatonia (Aug 31) — MS3' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'Catatonia (Aug 31) — Resident' })).toHaveCount(1);
    // The pair sorts adjacently under the existing title order — no custom sort needed.
    const pageTitles = await page.locator('#review-item-selector option').evaluateAll(
      nodes => nodes.map(node => node.textContent).filter(text => text.startsWith('Page · ')),
    );
    const catatonia = pageTitles.filter(title => title.includes('Catatonia (Aug 31)'));
    expect(catatonia).toHaveLength(2);
    expect(pageTitles.indexOf(catatonia[1]) - pageTitles.indexOf(catatonia[0])).toBe(1);

    // The whole-queue summary counts the registry pages as work outstanding.
    await expect(page.locator('#review-pending-summary')).toHaveText(/^3 pages · 1 tool · \d+ questions need review$/);

    // The MS3 half previews against the MS3 site.
    await page.locator('#review-item-selector').selectOption(`page:${COTW_MS3_SLUG}`);
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    const ms3Preview = new URL(await page.locator('#learner-preview-frame').getAttribute('src'));
    expect(ms3Preview.origin).toBe(new URL(MS3_URL).origin);
    expect(ms3Preview.searchParams.get('page')).toBe(COTW_MS3_SLUG);

    // The resident half previews against the RESIDENT site — the whole point of `site`.
    await page.locator('#review-item-selector').selectOption(`page:${COTW_RES_SLUG}`);
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    const resPreview = new URL(await page.locator('#learner-preview-frame').getAttribute('src'));
    expect(resPreview.origin).toBe(new URL(RES_URL).origin);
    expect(resPreview.origin).not.toBe(new URL(MS3_URL).origin);
    expect(resPreview.searchParams.get('page')).toBe(COTW_RES_SLUG);
    expect([...resPreview.searchParams.keys()]).toEqual(['page', 'reviewKey', 'reviewToken']);
    expect(resPreview.searchParams.get('reviewKey')).toBe(`page:${COTW_RES_SLUG}`);

    // The separate-tab fallback picks the resident origin too.
    await expect(page.getByRole('button', { name: 'Open learner surface (new tab)' })).toBeEnabled();
    await expectNoSecretsInUrl(page);
  });

  test('a deep link survives the key prompt and selects that exact item', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    // Arrive locked, on a link naming the resident twin.
    await unlock(page, { path: `/?item=page%3A${COTW_RES_SLUG}` });

    await expect(page.locator('#selected-item-title')).toHaveText('Catatonia (Aug 31) — Resident');
    await expect(page.locator('#selected-item-identity')).toHaveText(COTW_RES_SLUG);
    await expect(page.locator('#deep-link-notice')).toHaveCount(0);
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    const preview = new URL(await page.locator('#learner-preview-frame').getAttribute('src'));
    expect(preview.origin).toBe(new URL(RES_URL).origin);
    expect(preview.searchParams.get('page')).toBe(COTW_RES_SLUG);
    expect((await expectNoSecretsInUrl(page)).searchParams.get('item')).toBe(`page:${COTW_RES_SLUG}`);

    // Selecting another item rewrites the link in place — no navigation, no reload.
    await page.locator('#review-item-selector').selectOption('tool:mse.html');
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mental status exam tool');
    expect((await expectNoSecretsInUrl(page)).searchParams.get('item')).toBe('tool:mse.html');
    // The rewrite is history.replaceState, not a fresh load: the API was called once.
    expect(api.calls.filter(call => call.method === 'GET').length).toBe(1);

    // Copy link hands back the same address the bar already shows.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#copy-item-link').click();
    await expect(page.locator('#app-status')).toContainText('Copied a link to');
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toBe(await page.evaluate(() => location.href));
  });

  test('an unknown deep link falls back to the default selection with one neutral notice', async ({ page }) => {
    await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await unlock(page, { path: '/?item=page%3Anot_in_this_queue.md' });

    await expect(page.locator('#deep-link-notice')).toHaveText('That item is not in the current queue.');
    // The default selection stands: the first item in the Needs review queue.
    await expect(page.locator('#selected-item-title')).toHaveText('Catatonia (Aug 31) — MS3');
    await expectNoSecretsInUrl(page);

    // A hostile value is compared against item keys and never reaches the page.
    await page.goto(`/?item=${encodeURIComponent('<img src=x onerror=alert(1)>')}`);
    await expect(page.getByRole('heading', { name: 'Choose one curriculum item' })).toBeVisible();
    await expect(page.locator('#deep-link-notice')).toHaveText('That item is not in the current queue.');
    expect(await page.locator('#console-background').innerHTML()).not.toContain('onerror');
    await expectNoSecretsInUrl(page);
  });

  test('the bookmarklet renders only when unlocked and points at this console', async ({ page }) => {
    await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await page.goto('/');
    // Locked: the disclosure does not exist.
    await expect(page.locator('#bookmarklet-disclosure')).toHaveCount(0);

    await page.getByLabel('Faculty key').fill(FACULTY_KEY);
    await page.getByRole('button', { name: 'Unlock workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Choose one curriculum item' })).toBeVisible();

    await page.locator('#bookmarklet-disclosure summary').click();
    const href = await page.locator('#attest-this-page-bookmarklet').getAttribute('href');
    expect(href.startsWith('javascript:')).toBe(true);
    const consoleOrigin = await page.evaluate(() => location.origin);
    expect(href).toContain(encodeURIComponent(consoleOrigin));
    expect(href.length).toBeLessThan(600);
    // The copyable form is the identical address.
    expect(await page.locator('#bookmarklet-source').inputValue()).toBe(href);

    // Evaluate it the way a browser would, against a learner page's own query string.
    const opened = await page.evaluate(([bookmarklet, search]) => {
      const source = decodeURIComponent(bookmarklet.slice('javascript:'.length));
      const calls = [];
      const win = { open: (...args) => calls.push(args) };
      // eslint-disable-next-line no-new-func
      new Function('window', 'location', 'URLSearchParams', source)(win, { search }, URLSearchParams);
      return calls;
    }, [href, `?page=${COTW_RES_SLUG}`]);
    expect(opened).toEqual([[
      `${consoleOrigin}/?item=page%3A${COTW_RES_SLUG}`, '_blank', 'noopener',
    ]]);
  });

  test('attesting one twin advances to the other and writes only the pressed slug', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await unlock(page, { path: `/?item=page%3A${COTW_MS3_SLUG}` });
    await expect(page.locator('#selected-item-title')).toHaveText('Catatonia (Aug 31) — MS3');

    // The rail names the twin and offers one hop to it — never a second attestation.
    await expect(page.locator('#attestation-twin')).toContainText('Catatonia (Aug 31) — Resident');
    await expect(page.locator('#attestation-twin')).toContainText('Needs review');
    await page.locator('#go-to-twin').click();
    await expect(page.locator('#selected-item-title')).toHaveText('Catatonia (Aug 31) — Resident');
    await expect(page.locator('#attestation-twin')).toContainText('Catatonia (Aug 31) — MS3');
    await page.locator('#go-to-twin').click();
    await expect(page.locator('#selected-item-title')).toHaveText('Catatonia (Aug 31) — MS3');

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    const start = api.calls.length;
    await page.locator('#attest-current-item').click();

    // Twin-first advance: the resident half, not the next alphabetical page.
    await expect(page.locator('#selected-item-title')).toHaveText('Catatonia (Aug 31) — Resident');
    await expect(page.locator('#session-action-ledger')).toContainText(`Attested ${COTW_MS3_SLUG}.`);
    expect(api.calls[start].body).toEqual({
      target: 'content',
      changes: { [COTW_MS3_SLUG]: true },
      reasons: {},
    });
    // Exactly one slug changed. The twin is still pending and still needs a judgement.
    const content = api.currentContent();
    expect(content.find(item => item.slug === COTW_MS3_SLUG).status).toBe('reviewed');
    expect(content.find(item => item.slug === COTW_RES_SLUG).status).toBe('pending');
    await expect(page.locator('#selected-item-status')).toHaveText('Not reviewed');
    // The resident preview follows the advance to the resident origin.
    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    expect(new URL(await page.locator('#learner-preview-frame').getAttribute('src')).origin)
      .toBe(new URL(RES_URL).origin);
    expect((await expectNoSecretsInUrl(page)).searchParams.get('item')).toBe(`page:${COTW_RES_SLUG}`);
  });

  test('a page with no twin keeps the previous next-pending advance', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await unlock(page, { path: '/?item=page%3At_mood.md' });
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mood disorders page');
    // No Case-of-the-Week pair, so no pair badge and no twin hop.
    await expect(page.locator('#attestation-twin')).toHaveCount(0);
    await expect(page.locator('#go-to-twin')).toHaveCount(0);

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    const start = api.calls.length;
    await page.locator('#attest-current-item').click();

    // advanceToNextPendingContent, unchanged: the attested item has left the Needs
    // review queue, so the scan resumes at the top of the filtered list and lands on the
    // first content item still pending. Twin-first advance did not participate.
    await expect(page.locator('#selected-item-title')).toHaveText('Catatonia (Aug 31) — MS3');
    expect(api.calls[start].body.changes).toEqual({ 't_mood.md': true });
    await expectNoSecretsInUrl(page);
  });

  test('a twin that is already reviewed does not capture the advance', async ({ page }) => {
    const reviewedTwin = cotwContentState().map(item => (
      item.slug === COTW_RES_SLUG
        ? { ...item, status: 'reviewed', at: '2026-09-01', by: SERVER_ATTESTER }
        : item
    ));
    const api = await installRepositoryApi(page, workflowBank(), { contentState: reviewedTwin });
    await unlock(page, { path: `/?item=page%3A${COTW_MS3_SLUG}` });

    // The pair badge still names the twin — and says it is done.
    await expect(page.locator('#attestation-twin')).toContainText('Catatonia (Aug 31) — Resident');
    await expect(page.locator('#attestation-twin')).toContainText('Reviewed');

    await expect(page.locator('#preview-status-label')).toHaveText('Ready');
    await page.locator('#review-complete-item').check();
    await page.locator('#review-content-accuracy').check();
    await page.locator('#review-content-interactions').check();
    const start = api.calls.length;
    await page.locator('#attest-current-item').click();

    // Not the twin: it needs no further review. The ordinary next-pending advance runs.
    await expect(page.locator('#selected-item-title')).toHaveText('Synthetic mood disorders page');
    expect(api.calls[start].body.changes).toEqual({ [COTW_MS3_SLUG]: true });
    await expectNoSecretsInUrl(page);
  });
});

// ---- Phone client (/m/) ----------------------------------------------------------------
// A second front-end on the same origin (spec: docs/superpowers/specs/2026-09-26-mobile-
// attestation-console-design.md). Same key, same API, same one-slug-per-press rule.
const PHONE = { width: 390, height: 844 };

// `heading` is what the first screen after unlock must show: the queue by default, or the
// item's title when `path` deep-links straight into an item.
async function unlockPhone(page, { path = '/m/', heading = 'Needs review' } = {}) {
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
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
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

  test('a wrong key is refused, cleared, and re-prompted without leaking into storage', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.goto('/m/');
    await page.getByLabel('Faculty key').fill('not-the-key');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Key not accepted');
    expect(await page.evaluate(() => window.sessionStorage.getItem('fac_key'))).toBeNull();
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  });

  test('going offline at the key prompt says so in place and keeps a half-typed key', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.goto('/m/');
    const key = page.getByLabel('Faculty key');
    await key.fill('half-a-k');
    await page.context().setOffline(true);
    await expect(page.getByRole('alert')).toHaveText('You are offline.');
    await expect(key).toHaveValue('half-a-k');
    await expect(key).toBeFocused();
    await page.context().setOffline(false);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(key).toHaveValue('half-a-k');
  });

  test('a failed first load says so and offers Retry instead of a bare key prompt', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    // Registered after installRepositoryApi so it is matched first: the first GET is a 5xx,
    // everything after falls through to the synthetic repository.
    let gets = 0;
    await page.route('**/api/attest', async route => {
      if (route.request().method() === 'GET' && ++gets === 1) {
        await fulfillJson(route, 503, { error: { code: 'github_unavailable', message: 'upstream down' } });
        return;
      }
      await route.fallback();
    });
    await page.goto('/m/');
    await page.getByLabel('Faculty key').fill(FACULTY_KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not reach the repository');
    await expect(page.getByLabel('Faculty key')).toHaveCount(0);
    const retry = page.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    expect(gets).toBe(2);
  });

  test('losing the network before the queue loads keeps the error and Retry, never a bare key prompt', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    let gets = 0;
    await page.route('**/api/attest', async route => {
      if (route.request().method() === 'GET' && ++gets === 1) {
        await fulfillJson(route, 503, { error: { code: 'github_unavailable', message: 'upstream down' } });
        return;
      }
      await route.fallback();
    });
    await page.goto('/m/');
    await page.getByLabel('Faculty key').fill(FACULTY_KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not reach the repository');
    await page.context().setOffline(true);
    await expect(page.getByRole('alert')).toContainText('You are offline');
    await expect(page.getByLabel('Faculty key')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('alert')).toContainText('You are offline');
    expect(gets).toBe(1);
    // Coming back online retries the load by itself while nothing has loaded yet (no Retry press).
    await page.context().setOffline(false);
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    await expect(page.getByLabel('Faculty key')).toHaveCount(0);
    expect(gets).toBe(2);
    // Once a queue IS loaded, going offline reports in place: the queue as last loaded stays
    // readable. (The silent-refresh path, scheduleRefresh, arrives with Task 5 and its test.)
    await page.context().setOffline(true);
    await expect(page.getByRole('alert')).toContainText('You are offline');
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Synthetic/ })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await page.context().setOffline(false);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    expect(gets).toBe(2);   // online over a loaded queue repaints; it does not reload
  });

  test('opening an item shows the learner page in a frame, reports Ready from the real learner shell, and What changed renders the diff', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await page.route('**/api/attest?view=diff&slug=t_mood.md', route => fulfillJson(route, 200, {
      view: 'diff', slug: 't_mood.md', since: '2026-09-21', base: 'a'.repeat(40), head: 'b'.repeat(40), compareUrl: null,
      commit: { sha: 'c'.repeat(40), pr: 813, title: 'WP-9 citations', date: '2026-09-25', url: 'https://github.example/pull/813' },
      files: [{ path: '03_Core_Topics/Mood/mood.md', status: 'modified', changed: true, truncated: false, tooLarge: false, hunks: [{ oldStart: 1, newStart: 1, rows: [
        { kind: 'context', segments: [{ t: 'eq', s: 'Unchanged sentence.' }] },
        { kind: 'change', segments: [{ t: 'eq', s: 'Lithium ' }, { t: 'del', s: 'always' }, { t: 'add', s: 'usually' }, { t: 'eq', s: ' needs levels.' }] },
      ] }] }],
      record: [{ key: 'quiz', status: 'modified', changed: true, truncated: false, tooLarge: false, hunks: [{ oldStart: 1, newStart: 1, rows: [
        { kind: 'change', segments: [{ t: 'eq', s: 'Key: ' }, { t: 'del', s: 'B' }, { t: 'add', s: 'C' }] },
      ] }] }],
    }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic mood disorders page' })).toBeVisible();
    const frame = page.locator('iframe#learner-frame');
    await expect(frame).toHaveAttribute('src', /reviewKey=page%3At_mood\.md/);
    await expect(frame).toHaveAttribute('src', /reviewToken=[0-9a-f]{32}/);
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    const box = await frame.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(0.6 * PHONE.height);
    const actions = await page.getByRole('navigation', { name: 'Review actions' }).boundingBox();
    expect(actions.y + actions.height).toBeLessThanOrEqual(PHONE.height + 1);   // the bar stays on screen
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get('item')).toBe('page:t_mood.md');
    await page.getByRole('button', { name: 'What changed' }).click();
    const changed = page.getByRole('dialog', { name: 'What changed since you signed' });
    await expect(changed).toBeVisible();
    await expect(changed.getByText('#813 · WP-9 citations · 2026-09-25')).toBeVisible();
    await expect(changed.getByRole('link', { name: '#813' })).toHaveAttribute('href', 'https://github.example/pull/813');
    await expect(page.getByText('Lithium always needs levels.')).toBeVisible();
    await expect(page.getByText('Lithium usually needs levels.')).toBeVisible();
    // The page record (quiz, key points, evidence) is part of what was signed: it must show too.
    await expect(changed.getByText('Page record field quiz')).toBeVisible();
    await expect(changed.getByText('Key: B')).toBeVisible();
    await expect(changed.getByText('Key: C')).toBeVisible();
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

  test('What changed with no correction commit says since when you signed, takes focus, and closes on Escape', async ({ page }) => {
    // The production path: the phone never sends a sha, so the server answers with `since` and `commit: null`.
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await page.route('**/api/attest?view=diff&slug=t_mood.md', route => fulfillJson(route, 200, {
      view: 'diff', slug: 't_mood.md', since: '2026-09-21', base: 'a'.repeat(40), head: 'b'.repeat(40), compareUrl: null,
      commit: null, files: [], record: [],
    }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await page.getByRole('button', { name: 'What changed' }).click();
    const changed = page.getByRole('dialog', { name: 'What changed since you signed' });
    await expect(changed).toBeFocused();
    await expect(changed.getByText('Since you signed on 2026-09-21')).toBeVisible();
    await expect(changed.getByText("Neither this page's source files nor its record changed since you signed; its fingerprint moved for another reason.")).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(changed).toHaveCount(0);
  });

  test('Sign is disabled until acknowledged and idempotent while pending; a press sends exactly one slug and the receipt comes from the response', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    // Hold the write open until released, so the second tap below lands while it is pending.
    let releaseWrite;
    const writeHeld = new Promise(resolve => { releaseWrite = resolve; });
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() === 'POST') await writeHeld;
      await route.fallback();
    });
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
    await expect(sheet.getByLabel('Links, media and interactions work')).toBeFocused();   // a tick rebuilds the sheet; focus stays put
    await expect(sign).toBeEnabled();
    await sign.click();
    await expect(sheet.getByRole('button', { name: 'Signing…' })).toBeDisabled();
    // Second tap while pending must not send a second POST. Bounded: the button is disabled and
    // then gone, so an unbounded click would wait out the whole test.
    await sign.click({ timeout: 1_000 }).catch(() => {});
    releaseWrite();
    await expect(page.getByText('Signed: Catatonia (Aug 31) — MS3')).toBeVisible();
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
    await expect(page.getByText('Signed: Synthetic mental status exam tool')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attest' })).toBeEnabled();  // not stuck in "Signing…"
  });

  test('a silent refresh while offline leaves the loaded screen in place (no error screen, no fetch)', async ({ page }) => {
    await page.clock.install();
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Catatonia \(Aug 31\) — MS3/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Catatonia/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    await expect(page.getByText('Signed: Catatonia (Aug 31) — MS3')).toBeVisible();
    // Let the advanced item's preview settle first, so the only Retry that could appear is the
    // load-error screen's (a preview still loading would time out inside runFor and offer its own).
    await expect(page.getByRole('heading', { name: 'Catatonia (Aug 31) — Resident' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    const getsBefore = api.gets.length;
    await page.context().setOffline(true);
    await page.clock.runFor(31_000);                 // past REFRESH_QUIET_MS: the scheduled refresh fires offline
    await expect(page.getByRole('heading', { name: 'Catatonia (Aug 31) — Resident' })).toBeVisible();   // still on the advanced item
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('You are offline');
    expect(api.gets.length).toBe(getsBefore);
    await page.context().setOffline(false);
  });

  test('a silent refresh over the queue updates it in place: the search box keeps focus and text', async ({ page }) => {
    await page.clock.install();
    const api = await installRepositoryApi(page, workflowBank(), { contentState: cotwContentState() });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mental status exam tool/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mental status exam tool/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    await expect(page.getByText('Signed: Synthetic mental status exam tool')).toBeVisible();
    await page.getByRole('button', { name: 'Queue' }).click();
    const search = page.getByLabel('Search the queue');
    await search.click();
    await search.pressSequentially('cat');
    await expect(page.getByRole('status')).toContainText('3 pages · 0 tools');
    await expect(page.getByRole('link', { name: /Catatonia/ })).toHaveCount(2);
    // The refresh finds the MS3 twin signed elsewhere (on the desktop) in the meantime.
    const signedElsewhere = cotwContentState().map(item => ([COTW_MS3_SLUG, 'mse.html'].includes(item.slug)
      ? { ...item, status: 'reviewed', at: '2026-09-26', by: SERVER_ATTESTER } : item));
    let refreshes = 0;
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() !== 'GET' || new URL(request.url()).search) return route.fallback();
      refreshes += 1;
      await fulfillJson(route, 200, buildGetPayload(workflowBank(), signedElsewhere));
    });
    await page.clock.runFor(31_000);                 // past REFRESH_QUIET_MS: the scheduled refresh fires
    await expect.poll(() => refreshes).toBe(1);
    await expect(page.getByRole('status')).toContainText('2 pages · 0 tools');
    await expect(page.getByRole('link', { name: /Catatonia/ })).toHaveCount(1);
    await expect(search).toBeFocused();              // updated in place, not remounted
    await expect(search).toHaveValue('cat');
    expect(api.gets).toHaveLength(1);                // the unlock GET only: no confirming reload after the sign
  });

  test('the last sign of a sitting still shows its receipt, over the emptied queue', async ({ page }) => {
    // One pending page and no draft questions: after this sign nothing is left to advance to.
    await installRepositoryApi(page, { version: 1, items: [] }, {
      contentState: [{ slug: 't_mood.md', title: 'Synthetic mood disorders page', kind: 'page', site: 'ms3', status: 'pending', at: '', by: '' }],
    });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mood disorders page/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    await expect(page.getByText('Signed: Synthetic mood disorders page')).toBeVisible();
    await expect(page.getByText('Nothing needs review.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'commit' })).toHaveAttribute('href', 'https://github.example/commit/faculty-1');
    expect(new URL(page.url()).searchParams.get('item')).toBeNull();   // back on the queue, not a vanished item
  });

  test('a sign error shows inside the open sheet and Sign works again', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    let presses = 0;
    // The refresh after the conflict is held until the test releases it, so the in-flight state
    // (message and disabled Sign) can be observed without a sleep.
    let releaseRefresh;
    const refreshHeld = new Promise(resolve => { releaseRefresh = resolve; });
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() === 'POST' && ++presses === 1) {
        await fulfillJson(route, 409, { error: { code: 'github_conflict', message: 'branch moved', retryable: true } });
        return;
      }
      if (request.method() === 'GET' && presses === 1 && !new URL(request.url()).search) await refreshHeld;
      await route.fallback();
    });
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mood disorders page/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    const sign = sheet.getByRole('button', { name: 'Sign' });
    const getsBefore = api.gets.length;
    await sign.click();
    // A conflict means the loaded state is out of date: say so and refresh it in place. Until the
    // refresh lands, Sign (and Attest under the sheet) cannot re-send against the stale state.
    await expect(sheet.getByRole('alert')).toHaveText('The queue was out of date; refreshing…');
    await expect(sign).toBeDisabled();
    await expect(page.getByRole('navigation', { name: 'Review actions' }).getByRole('button', { name: 'Attest' })).toBeDisabled();
    releaseRefresh();
    await expect.poll(() => api.gets.length).toBe(getsBefore + 1);
    await expect(sheet.getByRole('alert')).toHaveText('The queue was out of date; refreshed.');
    await expect(sign).toBeEnabled();
    await sign.click();
    await expect(page.getByText('Signed: Synthetic mood disorders page')).toBeVisible();
    expect(presses).toBe(2);
    expect(api.calls.filter(call => call.method === 'POST').map(call => call.body)).toEqual([
      { target: 'content', changes: { 't_mood.md': true }, reasons: {} },
    ]);
  });

  test('a failed preview needs a retry, the page opened in the learner site, and the separate-tab acknowledgement instead', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank(), { contentState: [{ slug: 'nope.md', title: 'Missing page', kind: 'page', site: 'ms3', status: 'pending', at: '', by: '' }] });
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
    // The Retry alone does not unlock the separate-tab acknowledgement: the page must actually
    // have been opened in the learner site first (the desktop's externalReviewOpenedKey rule).
    await page.getByRole('button', { name: 'Attest' }).click();
    const separate = sheet.getByLabel('I reviewed it in the learner site tab');
    await expect(separate).toBeDisabled();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await expect(sheet.getByRole('button', { name: 'Sign' })).toBeDisabled();
    // Eligibility holds the same line on its own: a tick forced past the disabled control still
    // does not count until Open in site has been used.
    await page.evaluate(() => { const box = document.getElementById('ack-separate'); box.disabled = false; box.click(); });
    await expect(separate).toBeChecked();
    await expect(sheet.getByRole('button', { name: 'Sign' })).toBeDisabled();
    await sheet.getByRole('button', { name: 'Close' }).click();
    const popup = page.context().waitForEvent('page');
    await page.getByRole('link', { name: 'Open in site' }).click();
    const learnerTab = await popup;
    expect(learnerTab.url()).toBe(`${MS3_URL}/?page=nope.md`);
    await learnerTab.close();
    await page.getByRole('button', { name: 'Attest' }).click();
    // Opening the page cleared the tick forced before it (the desktop's openFullPage): only a
    // tick made after the page was opened counts, so this one is a real tick.
    await expect(separate).toBeEnabled();
    await expect(separate).not.toBeChecked();
    await expect(sheet.getByRole('button', { name: 'Sign' })).toBeDisabled();
    await separate.check();
    await expect(sheet.getByRole('button', { name: 'Sign' })).toBeEnabled();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    await expect(page.getByText('Signed: Missing page')).toBeVisible();
    const posts = api.calls.filter(call => call.method === 'POST');
    expect(posts.map(call => call.body)).toEqual([{ target: 'content', changes: { 'nope.md': true }, reasons: {} }]);
  });

  test('a question shows its saved draft read-only and attests only after a retry, the unavailable-live acknowledgement, the saved-revision receipt and the three confirmations', async ({ page }) => {
    // Left out of the learner bank the stub serves (missingDeployedIds), so the shell reports
    // Not found — the same path the desktop suite exercises for undeployed drafts (qb_moo_906).
    const api = await installRepositoryApi(page, workflowBank(), { missingDeployedIds: ['qb_moo_901'] });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /qb_moo_901/ }).click();
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
    await expect(page.getByText('Signed: qb_moo_901')).toBeVisible();
    const post = api.calls.filter(call => call.method === 'POST').at(-1);
    expect(post.body.action).toBe('qbank.attest');
    expect(post.body.manifestRevision).toBe(MANIFEST_REVISION);
    expect(post.body.items).toHaveLength(1);
    expect(post.body.items[0].id).toBe('qb_moo_901');
    expect(post.body.items[0].reviewedRevision).toBe(post.body.items[0].revision);
    expect(post.body.items[0].acknowledgedWarnings).toEqual([]);
    expect(post.body.confirmations).toEqual({ clinical: true, evidence: true, originalityAndNoPhi: true });
  });

  test('a frame failure clears every tick, the saved-draft receipt included, as on the desktop; a Retry that reports Ready restores none', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());   // qb_moo_901 is in the served learner bank: Ready
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /qb_moo_901/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign qb_moo_901/ });
    const live = sheet.getByLabel('I reviewed the live question on this screen');
    const receipt = sheet.getByLabel(/I reviewed the saved draft, revision/);
    const clinical = sheet.getByLabel('Clinically accurate');
    await live.check();
    await receipt.check();
    await clinical.check();
    await sheet.getByRole('button', { name: 'Close' }).click();
    // A second load of the learner frame reads as a frame failure: a status change outside the
    // readiness message, which resets the acknowledgements exactly as the desktop's
    // recordPreviewFrameFailure → clearReviewAcknowledgements() does (receipt included).
    const learner = await (await page.locator('iframe#learner-frame').elementHandle()).contentFrame();
    await learner.waitForLoadState('load');
    await page.locator('iframe#learner-frame').evaluate(frame => { frame.src = frame.src; });
    await expect(page.getByRole('status')).toContainText('did not load');
    await page.getByRole('button', { name: 'Attest' }).click();
    await expect(sheet.getByLabel(/I reviewed the saved draft, revision/)).not.toBeChecked();
    await expect(clinical).not.toBeChecked();
    await sheet.getByRole('button', { name: 'Close' }).click();
    // Retry mounts a fresh frame whose shell reports Ready again: nothing comes back.
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    await expect(receipt).not.toBeChecked();
    await expect(live).not.toBeChecked();
    await expect(clinical).not.toBeChecked();
  });

  test('the saved-draft receipt survives the live question reporting Ready again after the key is re-entered; no other tick does', async ({ page }) => {
    // The one remaining path on which a readiness report finds a receipt to keep: a 401 on a
    // silent refresh, the key re-entered, the frame remounted, and its shell reporting Ready.
    await page.clock.install();
    await installRepositoryApi(page, workflowBank());   // qb_moo_901 is in the served learner bank: Ready
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /qb_moo_901/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign qb_moo_901/ });
    const live = sheet.getByLabel('I reviewed the live question on this screen');
    const receipt = sheet.getByLabel(/I reviewed the saved draft, revision/);
    const clinical = sheet.getByLabel('Clinically accurate');
    await live.check();
    await receipt.check();
    await clinical.check();
    await sheet.getByRole('button', { name: 'Close' }).click();
    let refused = false;
    await page.route('**/api/attest', async (route, request) => {
      if (!refused && request.method() === 'GET' && !new URL(request.url()).search) {
        refused = true;
        await fulfillJson(route, 401, { error: { code: 'unauthorized', message: 'Faculty key not accepted.' } });
        return;
      }
      await route.fallback();
    });
    await page.clock.fastForward(31_000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('alert')).toContainText('Key not accepted');
    await page.getByLabel('Faculty key').fill(FACULTY_KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'qb_moo_901' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    await expect(receipt).toBeChecked();
    await expect(live).not.toBeChecked();
    await expect(clinical).not.toBeChecked();
  });

  test('a readiness window that times out clears the ticks made before it', async ({ page }) => {
    // The 10 s timeout is a status change outside the readiness message: it resets like one. The
    // only ticks it can find were made on an earlier frame, so remount one after a 401.
    await page.clock.install();
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mood disorders page/ });
    const accuracy = sheet.getByLabel('Accurate and appropriate for a third-year student');
    const interactions = sheet.getByLabel('Links, media and interactions work');
    await accuracy.check();
    await interactions.check();
    await sheet.getByRole('button', { name: 'Close' }).click();
    let refused = false;
    await page.route('**/api/attest', async (route, request) => {
      if (!refused && request.method() === 'GET' && !new URL(request.url()).search) {
        refused = true;
        await fulfillJson(route, 401, { error: { code: 'unauthorized', message: 'Faculty key not accepted.' } });
        return;
      }
      await route.fallback();
    });
    await page.clock.fastForward(31_000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByRole('alert')).toContainText('Key not accepted');
    await page.route(`${MS3_URL}/**`, () => {});      // the remounted frame never answers
    await page.getByLabel('Faculty key').fill(FACULTY_KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic mood disorders page' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Loading the learner page');
    await page.clock.runFor(10_500);
    await expect(page.getByRole('status')).toContainText('did not load');
    await page.getByRole('button', { name: 'Attest' }).click();
    await expect(accuracy).not.toBeChecked();
    await expect(interactions).not.toBeChecked();
  });

  test('a question sign that completes after the reviewer went back to the queue leaves them there, with the receipt', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    let releaseWrite;
    const writeHeld = new Promise(resolve => { releaseWrite = resolve; });
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() === 'POST') await writeHeld;
      await route.fallback();
    });
    await unlockPhone(page);
    await page.getByRole('link', { name: /qb_moo_901/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign qb_moo_901/ });
    await sheet.getByLabel('I reviewed the live question on this screen').check();
    await sheet.getByLabel(/I reviewed the saved draft, revision/).check();
    await sheet.getByLabel('Clinically accurate').check();
    await sheet.getByLabel('Evidence and rationale hold').check();
    await sheet.getByLabel('Original wording, no patient information').check();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    await expect(sheet.getByRole('button', { name: 'Signing…' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Queue' }).click();
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    releaseWrite();
    await expect(page.getByText('Signed: qb_moo_901')).toBeVisible();
    // Still on the queue: not pulled into the next pending page, no key prompt.
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    await expect(page.locator('iframe#learner-frame')).toHaveCount(0);
    await expect(page.getByLabel('Faculty key')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /qb_moo_901/ })).toHaveCount(0);   // the queue reflects the sign
    expect(new URL(page.url()).searchParams.get('item')).toBeNull();
    const posts = api.calls.filter(call => call.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body.items.map(entry => entry.id)).toEqual(['qb_moo_901']);
  });

  test('a sign that completes after Lock leaves the key prompt exactly as typed', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    let releaseWrite;
    const writeHeld = new Promise(resolve => { releaseWrite = resolve; });
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() === 'POST') await writeHeld;
      await route.fallback();
    });
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mood disorders page/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    await expect(sheet.getByRole('button', { name: 'Signing…' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Lock the console' }).click();
    const key = page.getByLabel('Faculty key');
    await key.fill('half-typed');
    const written = page.waitForResponse(response => response.request().method() === 'POST');
    releaseWrite();
    await written;
    await page.evaluate(() => new Promise(resolve => { setTimeout(resolve, 100); }));   // let the page handle it
    await expect(key).toHaveValue('half-typed');
    await expect(key).toBeFocused();
    await key.fill(FACULTY_KEY);
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText('Signed: Synthetic mood disorders page')).toBeVisible();
  });

  test('a question with warnings shows them and offers no Attest on the phone', async ({ page }) => {
    // qb_moo_905 (WARNING_STEM) ends on a negative lead-in: a warning gate the phone cannot acknowledge.
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /qb_moo_905/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    const actions = page.getByRole('navigation', { name: 'Review actions' });
    const desktopOnly = actions.getByRole('button', { name: 'Attest on desktop' });
    await expect(desktopOnly).toBeDisabled();
    await expect(desktopOnly).toHaveAttribute('aria-disabled', 'true');
    await expect(desktopOnly).toHaveAttribute('title', 'This question has warnings; attest it on the desktop console.');
    await expect(actions.getByRole('button', { name: 'Attest', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Saved draft' }).click();
    const draft = page.getByRole('dialog', { name: 'Saved draft (not deployed)' });
    await expect(draft.getByRole('heading', { name: 'Warnings' })).toBeVisible();
    await expect(draft.getByRole('listitem').filter({ hasText: 'Review the negative wording in the final lead-in.' })).toBeVisible();
    await expect(draft.getByText('Attest this question on the desktop console, which records each acknowledgement.')).toBeVisible();
  });

  test('a deep link opens its item once unlocked and keeps ?item= in the address bar', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page, { path: '/m/?item=page:t_mood.md', heading: 'Synthetic mood disorders page' });
    await expect(page.getByRole('heading', { name: 'Needs review' })).toHaveCount(0);
    await expect(page.locator('iframe#learner-frame')).toHaveAttribute('src', /reviewKey=page%3At_mood\.md/);
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get('item')).toBe('page:t_mood.md');
  });

  test('a deep link to an item not in the queue opens the queue and says so', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page, { path: '/m/?item=page:nope.md' });
    await expect(page.getByRole('alert')).toHaveText('That item is not in the current queue.');
    await expect(page.locator('iframe#learner-frame')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Synthetic mood disorders page/ })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('item')).toBeNull();
  });

  test('a question conflict says the queue was out of date, refreshes it, and never re-sends the stale revision', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());   // qb_moo_901 is in the served learner bank: Ready
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    // Someone saved qb_moo_901 elsewhere: the write is refused, and the refresh brings the new revision.
    const changed = workflowBank();
    changed.items[0].difficulty = 2;
    let posts = 0;
    let refreshes = 0;
    let releaseRefresh;
    const refreshHeld = new Promise(resolve => { releaseRefresh = resolve; });
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() === 'POST') {
        posts += 1;
        await fulfillJson(route, 409, { error: { code: 'qbank.conflict', message: 'A selected question changed after you loaded it.' } });
        return;
      }
      if (posts && !new URL(request.url()).search) {
        await refreshHeld;   // held until the test has seen the in-flight state
        refreshes += 1;
        await fulfillJson(route, 200, buildGetPayload(changed));
        return;
      }
      await route.fallback();
    });
    await unlockPhone(page);
    await page.getByRole('link', { name: /qb_moo_901/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign qb_moo_901/ });
    await sheet.getByLabel('I reviewed the live question on this screen').check();
    const receipt = sheet.getByLabel(/I reviewed the saved draft, revision/);
    const staleLabel = await receipt.evaluate(input => input.closest('label').textContent);
    await receipt.check();
    await sheet.getByLabel('Clinically accurate').check();
    await sheet.getByLabel('Evidence and rationale hold').check();
    await sheet.getByLabel('Original wording, no patient information').check();
    const sign = sheet.getByRole('button', { name: 'Sign' });
    await sign.click();
    // While the refresh is in flight the old receipt still matches the loaded (stale) revision,
    // so only the refresh lock keeps Sign from re-sending it.
    await expect(sheet.getByRole('alert')).toHaveText('The queue was out of date; refreshing…');
    await expect(receipt).toBeChecked();
    await expect(sign).toBeDisabled();
    releaseRefresh();
    await expect(sheet.getByRole('alert')).toHaveText('The queue was out of date; refreshed.');
    expect(refreshes).toBe(1);
    await expect(page.getByText(/Pull to refresh/)).toHaveCount(0);
    // The refreshed question carries a new revision: the old receipt no longer matches it, so Sign
    // cannot re-send the revision the server just refused.
    await expect(receipt).not.toBeChecked();
    expect(await receipt.evaluate(input => input.closest('label').textContent)).not.toBe(staleLabel);
    await expect(sign).toBeDisabled();
    await sign.click({ timeout: 1_000 }).catch(() => {});
    expect(posts).toBe(1);
    // The lock is released with the refresh: acknowledging the NEW revision is enough to sign.
    await receipt.check();
    await expect(sign).toBeEnabled();
  });

  test('a write that changed nothing says it was already signed elsewhere and refreshes the queue', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    const signedElsewhere = initialContentState().map(item => (item.slug === 't_mood.md'
      ? { ...item, status: 'reviewed', at: '2026-09-26', by: SERVER_ATTESTER } : item));
    let posted = false;
    let refreshes = 0;
    await page.route('**/api/attest', async (route, request) => {
      if (request.method() === 'POST') {
        posted = true;
        await fulfillJson(route, 200, { ok: true, target: 'content', updated: 0, commit: null });
        return;
      }
      if (posted && !new URL(request.url()).search) {
        refreshes += 1;
        await fulfillJson(route, 200, buildGetPayload(workflowBank(), signedElsewhere));
        return;
      }
      await route.fallback();
    });
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Attest' }).click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mood disorders page/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    await sheet.getByRole('button', { name: 'Sign' }).click();
    // The item left the queue in the refresh: back on the queue, which says why.
    await expect(page.getByRole('heading', { name: 'Needs review' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveText('Already signed elsewhere; refreshed.');
    expect(refreshes).toBe(1);
    await expect(page.getByRole('link', { name: /Synthetic mood disorders page/ })).toHaveCount(0);
    await expect(page.getByText('This attestation was not saved.')).toHaveCount(0);
    await expect(page.getByText(/^Signed:/)).toHaveCount(0);
  });

  test('coming back to the page refreshes a queue older than the quiet period, and only then', async ({ page }) => {
    await page.clock.install();
    const api = await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    const search = page.getByLabel('Search the queue');
    await search.click();
    await search.pressSequentially('syn');
    const before = api.gets.length;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(300);
    expect(api.gets.length).toBe(before);             // fresh: nothing to do
    await page.clock.fastForward(31_000);            // past REFRESH_QUIET_MS since the last load
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => api.gets.length).toBe(before + 1);
    await expect(search).toBeFocused();              // a silent refresh, in place
    await expect(search).toHaveValue('syn');
  });

  test('offline disables Attest and Sign and says so; an unreachable server says so instead of a raw fetch error', async ({ page }) => {
    const api = await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await expect(page.getByRole('status')).toContainText('Ready', { timeout: 15_000 });
    const attest = page.getByRole('navigation', { name: 'Review actions' }).getByRole('button', { name: 'Attest' });
    await attest.click();
    const sheet = page.getByRole('dialog', { name: /Sign Synthetic mood disorders page/ });
    await sheet.getByLabel('I reviewed the complete item on this screen').check();
    await sheet.getByLabel('Accurate and appropriate for a third-year student').check();
    await sheet.getByLabel('Links, media and interactions work').check();
    const sign = sheet.getByRole('button', { name: 'Sign' });
    await expect(sign).toBeEnabled();
    await page.context().setOffline(true);
    await expect(sheet.getByRole('alert')).toHaveText('You are offline.');
    await expect(sign).toBeDisabled();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(attest).toBeDisabled();
    await page.context().setOffline(false);
    await expect(attest).toBeEnabled();
    // Online, but the connection itself fails: a plain sentence, not "TypeError: Failed to fetch".
    await page.route('**/api/attest', route => (route.request().method() === 'POST' ? route.abort('failed') : route.fallback()));
    await attest.click();
    await sign.click();
    await expect(sheet.getByRole('alert')).toHaveText('Could not reach the repository.');
    await expect(sign).toBeEnabled();
    expect(api.calls.filter(call => call.method === 'POST')).toHaveLength(0);
  });

  test('What changed recovers from a server error: Retry inside the sheet, and Close clears the error', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    let diffs = 0;
    await page.route('**/api/attest?view=diff&slug=t_mood.md', route => (++diffs < 3
      ? fulfillJson(route, 503, { error: { code: 'github_unavailable', message: 'upstream down' } })
      : fulfillJson(route, 200, { view: 'diff', slug: 't_mood.md', since: '2026-09-21', base: 'a'.repeat(40), head: 'b'.repeat(40), compareUrl: null, commit: null, files: [], record: [] })));
    await unlockPhone(page);
    await page.getByRole('link', { name: /Synthetic mood disorders page/ }).click();
    await page.getByRole('button', { name: 'What changed' }).click();
    const changed = page.getByRole('dialog', { name: 'What changed since you signed' });
    await expect(changed.getByRole('alert')).toHaveText('Could not reach the repository.');
    // Closing drops the error, so opening the sheet again asks the server again.
    await changed.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'What changed' }).click();
    await expect(changed.getByRole('alert')).toHaveText('Could not reach the repository.');
    expect(diffs).toBe(2);
    await changed.getByRole('button', { name: 'Retry' }).click();
    await expect(changed.getByText('Since you signed on 2026-09-21')).toBeVisible();
    await expect(changed.getByRole('alert')).toHaveCount(0);
    expect(diffs).toBe(3);
  });

  test('a long reopen reason (a URL) wraps inside its row: no sideways scroll at phone width', async ({ page }) => {
    const longUrl = `https://github.example/jmoss333/psychiatry-clerkship/pull/813/files#diff-${'0123456789abcdef'.repeat(6)}`;
    await installRepositoryApi(page, workflowBank(), { contentState: [
      { slug: 't_mood.md', title: 'Synthetic mood disorders page', kind: 'page', site: 'ms3', status: 'pending', at: '', by: '', reason: `Reopened: ${longUrl}` },
    ] });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, {
      view: 'changes', branch: 'main', generatedAt: '2026-09-26T00:00:00.000Z', drifted: 1, partial: false,
      groups: [{ id: 'pr:813', pr: 813, sha: 'a'.repeat(40), title: longUrl, date: '2026-09-25', url: 'https://github.example/pull/813', slugs: ['t_mood.md'] }],
      unexplained: [], unchecked: [], pages: {},
    }));
    await unlockPhone(page);
    await expect(page.getByText(`Reopened: ${longUrl}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: `#813 ${longUrl}` })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the desktop console offers the phone console on a narrow viewport', async ({ page }) => {
    await installRepositoryApi(page, workflowBank());
    await page.goto('/');
    const link = page.getByRole('link', { name: 'Use the phone console' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', './m/');
    const box = await link.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(12);
    // A Copy link / bookmarklet landing on a phone: the hand-off carries the item to /m/, encoded
    // as Copy link encodes it (buildDeepLink), and nothing else from the arriving query.
    await page.goto('/?item=page:t_mood.md');
    await expect(link).toHaveAttribute('href', './m/?item=page%3At_mood.md');
    await page.goto('/?item=page:t_mood.md&foo=bar');
    await expect(link).toHaveAttribute('href', './m/?item=page%3At_mood.md');
    expect(await link.getAttribute('href')).not.toContain('foo');
    await link.click();
    await expect(page).toHaveTitle('Faculty attestation — phone');
    expect(new URL(page.url()).searchParams.get('item')).toBe('page:t_mood.md');
  });
});

test('the phone console link is hidden on a desktop viewport', async ({ page }) => {
  await installRepositoryApi(page, workflowBank());
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Use the phone console' })).toBeHidden();
});

// ── "Not found" that is only "not published yet" (2026-09-28 Case of the Week) ────────────
// The learner shell reports not_found for nope.md (the local learner site has no such page).
// The release status says whether the site serves it and whether merged work is waiting;
// fetchedAt is the owner's 10:50 ET preview, so the next slot is 11:05 AM ET, in 15 min.
const MISSING_PAGE = [{ slug: 'nope.md', title: 'Missing page', kind: 'page', site: 'ms3', status: 'pending', at: '', by: '' }];

async function routeReleaseStatus(page, { servedMs3 }) {
  const hits = { count: 0 };
  await page.route('**/api/release-status', async route => {
    hits.count += 1;
    await fulfillJson(route, 200, {
      state: 'complete',
      fetchedAt: '2026-09-28T14:50:00.000Z',
      main: 'c'.repeat(40),
      release: 'b'.repeat(40),
      live: 'b'.repeat(40),
      liveBasis: 'published deploys',
      sites: {},
      sitesDisagree: false,
      releaseUnserved: false,
      mainChecks: { verdict: 'green', conclusions: {} },
      waiting: {
        status: 'waiting',
        complete: true,
        changes: [{ sha: 'c'.repeat(40), pr: 897, title: 'Case of the Week: mania', signoff: false, at: '2026-09-28T12:54:00Z' }],
      },
      signoffs: { items: [], unread: [], complete: true },
      served: { ms3: servedMs3, res: ['t_mood.md'] },
      train: {
        workflowUrl: 'https://github.com/jmoss333/psychiatry-clerkship/actions/workflows/production-release-train.yml',
        nextSlot: '2026-09-28T15:05:00.000Z',
        lastRun: null,
        failedRuns: [],
        week: null,
      },
      ledgerMode: false,
      gaps: [],
      headline: { tone: 'waiting', text: '1 merged change is not live for learners yet.' },
    });
  });
  return hits;
}

test.describe('not published yet instead of Not found', () => {
  test('the phone names the publish time for a merged page the site does not serve yet', async ({ page }) => {
    await installRepositoryApi(page, workflowBank(), { contentState: MISSING_PAGE });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    await routeReleaseStatus(page, { servedMs3: ['t_mood.md'] });
    await unlockPhone(page);
    await page.getByRole('link', { name: /Missing page/ }).click();
    const status = page.getByRole('status');
    await expect(status).toContainText('Not published yet', { timeout: 15_000 });
    await expect(status).toContainText('Merged, but not on the learner site yet. It goes live at the 11:05 AM ET publish (in 15 min); preview it after that.');
    // Information only: signing still takes the failed-preview path, unchanged.
    await page.getByRole('button', { name: 'Attest' }).click();
    await expect(page.getByRole('dialog', { name: /Sign Missing page/ })
      .getByText('The learner page did not report ready. Press Retry once')).toBeVisible();
  });

  test('the phone keeps Not found when the learner site does serve the page', async ({ page }) => {
    await installRepositoryApi(page, workflowBank(), { contentState: MISSING_PAGE });
    await page.route('**/api/attest?view=changes', route => fulfillJson(route, 200, { view: 'changes', groups: [], unexplained: [], unchecked: [], pages: {} }));
    const hits = await routeReleaseStatus(page, { servedMs3: ['nope.md', 't_mood.md'] });
    await unlockPhone(page);
    await page.getByRole('link', { name: /Missing page/ }).click();
    await expect(page.getByRole('status')).toContainText('Not found', { timeout: 15_000 });
    // The release status WAS asked (so this is not a pass over nothing) and still said served.
    await expect.poll(() => hits.count).toBe(1);
    await expect(page.getByRole('status')).toContainText('Not found on the learner site');
    await expect(page.getByRole('status')).not.toContainText('Not published yet');
  });

  test('the desktop names the publish time in the preview status', async ({ page }) => {
    await installRepositoryApi(page, workflowBank(), { contentState: MISSING_PAGE });
    await routeReleaseStatus(page, { servedMs3: ['t_mood.md'] });
    await unlock(page);
    await page.locator('#review-item-selector').selectOption('page:nope.md');
    await expect(page.locator('#preview-status-label')).toHaveText('Not published yet', { timeout: 15_000 });
    await expect(page.locator('#preview-status')).toContainText('It goes live at the 11:05 AM ET publish (in 15 min)');
  });
});

// All medication writes below terminate in a synthetic route fixture. Never use a
// faculty credential or let an approval request reach the deployed service.
test.describe('individual medication review', () => {
  async function medicationFixture(page, { stale = false, needsSync = false, hostile = false } = {}) {
    let snapshot = syntheticMedicationSnapshot(); snapshot.needsSync = needsSync;
    if (hostile) snapshot.registry.json.records[0].generic = '<img src=x onerror=alert(1)>';
    const posts = [];
    await page.route('**/api/attest**', async route => {
      if (route.request().method() !== 'POST') {
        await route.fulfill({ json: medicationView(snapshot, 'Synthetic Faculty') }); return;
      }
      const body = route.request().postDataJSON(); posts.push(body);
      if (stale) { await route.fulfill({ status: 409, json: { error: { message: 'The repository changed. Reload and review this medication again before approving.' } } }); return; }
      const next = prepareMedicationApproval(snapshot, body, 'Synthetic Faculty', '2026-01-02');
      snapshot = { ...snapshot, head: 'f'.repeat(40), registry: { ...snapshot.registry, json: next.registry } };
      await route.fulfill({ json: { ok: true, updated: 1, id: body.id, commit: `https://github.com/synthetic/repo/commit/${'f'.repeat(40)}` } });
    });
    await page.goto('/medications.html');
    await page.getByLabel('Faculty key', { exact: true }).fill('synthetic-key');
    await page.getByRole('button', { name: 'Open medication reviews' }).click();
    await expect(page.getByRole('combobox', { name: 'Medication', exact: true })).toBeVisible();
    return { posts, snapshot: () => snapshot };
  }
  async function confirmMedication(page) {
    for (const key of ['card', 'sources', 'retrieval']) await page.locator(`[data-confirm="${key}"]`).check();
  }
  for (const width of [1280, 390]) for (const theme of ['light', 'dark']) {
    test(`${width}px ${theme}: explicit review saves only the selected card and shows a receipt`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const fixture = await medicationFixture(page);
      await expect(page).toHaveTitle('Medication review — Faculty console');
      const approve = page.getByRole('button', { name: 'Approve this medication', exact: true });
      await expect(approve).toBeDisabled();
      await page.locator('[data-confirm="card"]').check(); await page.locator('[data-confirm="sources"]').check(); await expect(approve).toBeDisabled();
      await page.getByRole('combobox', { name: 'Medication', exact: true }).selectOption('synthetic-two');
      await expect(page.locator('[data-confirm="card"]')).not.toBeChecked();
      await expect(page.locator('#medication-heading')).toBeFocused();
      await page.getByText('Retrieval questions and reveal mappings', { exact: true }).click();
      await expect(page.getByText('mechanism.t1', { exact: true })).toBeVisible();
      await confirmMedication(page);
      await expect(approve).toBeEnabled();
      if (process.env.MEDICATION_QA_DIR) await page.screenshot({ path: `${process.env.MEDICATION_QA_DIR}/${width}-${theme}-before.png`, fullPage: true });
      await approve.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('link', { name: 'Open commit receipt for Synthetic medication two' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Saved status reloaded');
      await expect(approve).toBeDisabled();
      expect(fixture.posts).toHaveLength(1); expect(fixture.posts[0].id).toBe('synthetic-two');
      expect(fixture.snapshot().registry.json.records[0].facultyReview.status).toBe('pending');
      expect(fixture.snapshot().registry.json.records[1].facultyReview.reviewer).toBe('Synthetic Faculty');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      if (process.env.MEDICATION_QA_DIR) await page.screenshot({ path: `${process.env.MEDICATION_QA_DIR}/${width}-${theme}-saved.png`, fullPage: true });
    });
  }
  test('conflict requires reload and fresh confirmations; no success receipt is shown', async ({ page }) => {
    const fixture = await medicationFixture(page, { stale: true }); await confirmMedication(page);
    await page.getByRole('button', { name: 'Approve this medication' }).click();
    await expect(page.getByRole('status')).toContainText('repository changed');
    await expect(page.getByRole('link', { name: /Open commit receipt/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reload saved medications' }).click();
    await expect(page.locator('[data-confirm="card"]')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Approve this medication' })).toBeDisabled(); expect(fixture.posts).toHaveLength(1);
  });
  test('reload resets confirmations; locking removes the key and saved card', async ({ page }) => {
    const fixture = await medicationFixture(page); await confirmMedication(page); await page.reload();
    await expect(page.locator('[data-confirm="card"]')).not.toBeChecked();
    await page.getByRole('button', { name: 'Lock console' }).click(); await expect(page.getByLabel('Faculty key', { exact: true })).toBeVisible();
    await expect(page.locator('#medication-picker')).toHaveCount(0); expect(await page.evaluate(() => sessionStorage.getItem('fac_key'))).toBeNull(); expect(fixture.posts).toHaveLength(0);
  });
  test('a late unauthorized response cannot clear a newer unlocked session', async ({ page }) => {
    let oldRequest;
    await page.route('**/api/attest**', async route => {
      if (route.request().headers()['x-faculty-key'] === 'old-key') { oldRequest = route; return; }
      await route.fulfill({ json: medicationView(syntheticMedicationSnapshot(), 'Synthetic Faculty') });
    });
    await page.goto('/medications.html');
    await page.getByLabel('Faculty key', { exact: true }).fill('old-key');
    await page.getByRole('button', { name: 'Open medication reviews' }).click();
    await expect.poll(() => Boolean(oldRequest)).toBe(true);
    await page.getByRole('button', { name: 'Lock console' }).click();
    await page.getByLabel('Faculty key', { exact: true }).fill('new-key');
    await page.getByRole('button', { name: 'Open medication reviews' }).click();
    await expect(page.getByRole('combobox', { name: 'Medication', exact: true })).toBeVisible();
    const oldResponse = page.waitForResponse(response => response.status() === 401);
    await oldRequest.fulfill({ status: 401, json: { error: { message: 'Old key expired' } } });
    await oldResponse;
    await page.getByRole('button', { name: 'Reload saved medications' }).click();
    await expect(page.getByRole('combobox', { name: 'Medication', exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('fac_key'))).toBe('new-key');
  });
  test('stale branch prevents approval and saved strings render as text, not markup', async ({ page }) => {
    const fixture = await medicationFixture(page, { needsSync: true, hostile: true }); await confirmMedication(page);
    await expect(page.getByRole('alert')).toContainText('behind main');
    await expect(page.locator('#medication-heading')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(page.locator('img')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Approve this medication' })).toBeDisabled(); expect(fixture.posts).toHaveLength(0);
  });
});

test('evidence review shows source and distractor feedback, preserves rationale on stale response', async ({page}) => {
 const state={reportCommit:'r',decisionRevision:'d',failures:[{sourceId:'s2',reason:'Retrieval incomplete'}],packets:[{revision:'p',sourceId:'s',sourceName:'Synthetic source',sourceUrl:'https://example.org',status:'pending',observedAt:'2026-10-03',scanStatus:'complete',coverage:{scanned:1,active:1,fields:1},passages:[{old:'Old synthetic guidance.',new:'New synthetic guidance.'}],candidates:[{questionId:'q1',fieldPath:'/options/0/trap/note',quote:'Synthetic distractor explanation.',kind:'possible-contradiction',reason:'Verify context.',context:'Fictional teaching scenario.'}],readings:[],targets:[{itemKey:'question:q1',revision:'qrev',current:{stem:'Current child scenario',options:[{t:'Current option',trap:{note:'Current feedback'}}]}}]}]};
 await page.route('**/api/attest?view=evidence',route=>route.fulfill({status:route.request().method()==='POST'?409:200,contentType:'application/json',body:JSON.stringify(route.request().method()==='POST'?{error:{message:'Evidence changed. Reload before deciding.'}}:state)}));
 await page.goto('/evidence.html');
 await page.getByLabel('Faculty key').fill(FACULTY_KEY);
 await page.getByRole('button',{name:'Open evidence inbox'}).click();
 await expect(page.getByText('Possible contradiction',{exact:true})).toBeVisible();
 await expect(page.getByText('Current child scenario',{exact:true})).toBeVisible();
 await expect(page.getByText('Question changed since the scan',{exact:true})).toBeVisible();
 await expect(page.getByText('Synthetic distractor explanation.',{exact:true})).toBeVisible();
 await expect(page.getByText(/Retrieval incomplete/)).toBeVisible();
 await page.getByLabel('Rationale').fill('Keep this note while I reload.');
 await page.getByRole('button',{name:'Save disposition'}).click();
 await expect(page.getByRole('status')).toContainText('Evidence changed');
 await expect(page.getByLabel('Rationale')).toHaveValue('Keep this note while I reload.');
 await expect(page.getByRole('button',{name:'Attest all'})).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
