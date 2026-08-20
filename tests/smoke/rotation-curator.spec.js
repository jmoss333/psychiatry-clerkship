import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

const TOOL = '/tools/rotation-curator.html';
const TOKENS = {
  arrival: ['timing', 'time', 'place', 'role'],
  scheduleWindow: ['dayStart', 'dayEnd', 'endQualifier'],
  scheduleRangeWithPlace: ['daySet', 'startTime', 'endTime', 'activity', 'place', 'priority'],
  scheduleRangeWithoutPlace: ['daySet', 'startTime', 'endTime', 'activity', 'priority'],
  schedulePointWithPlace: ['daySet', 'startTime', 'activity', 'place', 'priority'],
  schedulePointWithoutPlace: ['daySet', 'startTime', 'activity', 'priority'],
  rounds: ['preparation', 'participation', 'followUp'],
  presentation: ['format', 'timing', 'elements'],
  documentation: ['workflow', 'timing'],
  attendance: ['events', 'absenceRole'],
  feedback: ['cadence', 'initiator', 'setting'],
  access: ['item', 'due'], contact: ['role'], checklist: ['item', 'priority'],
  resourceWithReason: ['title', 'priority', 'week', 'reason', 'hostname'],
  resourceWithoutReason: ['title', 'priority', 'week', 'hostname'],
  changeSummary: ['kinds', 'count'],
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256-${createHash('sha256').update(canonical(value)).digest('base64url')}`;
}

function projection(audience, revision) {
  const common = { audiences: [audience], verifiedOn: '2026-08-19' };
  const location = 'location.synthetic@v1';
  const records = [
    { key: 'choice.role@v1', kind: 'choice', choiceKind: 'role', label: 'Faculty role', fragment: 'the faculty role', ...common },
    { key: 'choice.reason@v1', kind: 'choice', choiceKind: 'reason', label: 'Reviewed reason', fragment: 'reviewed reason', locationKeys: [location], ...common },
    { key: location, kind: 'trainingLocation', displayName: 'Synthetic Teaching Unit', locationCode: 'SYN', locationTypeCode: 'inpatient', officialHostnames: ['example.invalid'], ...common },
    { key: 'curator.synthetic@v1', kind: 'curatorProfile', displayName: 'Synthetic Faculty', roleKey: 'choice.role@v1', locationKeys: [location], ...common },
    {
      key: 'phrases.synthetic@v1', kind: 'phraseSet', displayName: 'Synthetic reviewed wording',
      templates: Object.fromEntries(Object.entries(TOKENS).map(([name, tokens]) => [name, {
        text: tokens.map(token => `{${token}}`).join(' '), tokens,
      }])),
      locationKeys: [location], ...common,
    },
  ].map(record => ({ ...record, contentDigest: digest(record) }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const value = {
    schemaVersion: 1, audience, revision, projectionDigest: '', rotationEditionV2: 'enabled',
    selectionKeys: records.map(record => record.key), resolutionRecords: records, blockedKeys: [],
  };
  const bare = structuredClone(value); delete bare.projectionDigest; value.projectionDigest = digest(bare);
  return value;
}

async function useSyntheticCatalog(page) {
  await page.route(`**${TOOL}`, async route => {
    const response = await route.fetch();
    let html = await response.text();
    const audienceMatch = html.match(/var FD_AUDIENCE=("(?:[^"\\]|\\.)*");/);
    const catalogMatch = html.match(/var FD_ROTATION_EDITION_CATALOG=(\{.*?\});\s*\n/s);
    if (!audienceMatch || !catalogMatch) throw new Error('built curator bootstrap was not found');
    const audience = JSON.parse(audienceMatch[1]);
    const current = JSON.parse(catalogMatch[1]);
    html = html.replace(catalogMatch[0], `var FD_ROTATION_EDITION_CATALOG=${JSON.stringify(projection(audience, current.revision))};\n`);
    await route.fulfill({ response, body: html, headers: { ...response.headers(), 'content-type': 'text/html; charset=utf-8' } });
  });
}

async function observeStorage(page) {
  await page.addInitScript(() => {
    const reads = []; const writes = [];
    const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { reads.push(String(key)); return get.call(this, key); };
    Storage.prototype.setItem = function (key, value) { writes.push(String(key)); return set.call(this, key, value); };
    window.__curatorStorage = { reads, writes };
  });
}

async function selectReviewedContext(page) {
  await page.locator('[data-curator-location]').selectOption('location.synthetic@v1');
  await page.locator('[data-curator-profile]').selectOption('curator.synthetic@v1');
  await page.locator('[data-curator-phrases]').selectOption('phrases.synthetic@v1');
  await page.locator('#curatorRotationStart').fill('2026-09-01');
  await page.locator('#curatorRotationEnd').fill('2026-10-12');
  await page.locator('#curatorEditionCheckedOn').fill('2026-08-19');
}

test.beforeEach(async ({ page }) => {
  await useSyntheticCatalog(page);
  await observeStorage(page);
});

test('v2 synthetic catalog unlocks reviewed structured Steps 1 through 4', async ({ page }, testInfo) => {
  const audience = testInfo.project.name === 'nav-res' ? 'resident' : 'ms3';
  await page.goto(TOOL);

  await expect(page.getByRole('heading', { name: 'Faculty rotation edition builder' })).toBeVisible();
  await expect(page.locator('[data-curator-step-panel="1"]')).toBeVisible();
  await expect(page.locator('[data-curator-location]')).toContainText('Synthetic Teaching Unit');
  await expect(page.locator('[data-curator-profile]')).toHaveValue('');
  await selectReviewedContext(page);

  await page.getByRole('button', { name: /Step 2 Curriculum/ }).click();
  await expect(page.locator('[data-curator-step-panel="2"]')).toBeVisible();
  await expect(page.locator('[data-curator-path-repeat]').first()).toBeVisible();
  await expect(page.locator('[data-curator-path-reason]').first()).toContainText('Reviewed reason');
  await page.locator('[data-curator-path-repeat]').first().click();

  await page.getByRole('button', { name: /Step 3 Schedule/ }).click();
  await expect(page.locator('[data-curator-step-panel="3"]')).toBeVisible();
  await expect(page.locator('.fd-curator-week')).toHaveCount(audience === 'resident' ? 4 : 6);
  await expect(page.locator('[data-curator-path-move-order]').first()).toHaveAttribute('aria-label', /occurrence \d+, position \d+ of \d+ in Week \d+/);

  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await expect(page.locator('[data-curator-step-panel="4"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First-day essentials' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How this rotation works' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review desktop preview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review 390 px mobile preview' })).toBeVisible();
  await expect(page.locator('[data-curator-step-panel="4"] textarea')).toHaveCount(0);
  await expect(page.locator('[data-curator-step-panel="4"] input[type="url"]')).toHaveCount(0);
  await expect(page.locator('[data-curator-step-panel="4"] input[type="text"]')).toHaveCount(0);
  await expect(page.locator('[data-curator-step-panel="4"] option', { hasText: /^Other$/ })).toHaveCount(0);

  const storage = await page.evaluate(() => window.__curatorStorage);
  expect(storage.reads.some(key => /_curator_draft_(?:ms3|resident)_v2$/.test(key))).toBe(true);
  expect(storage.reads.some(key => /_v1$/.test(key))).toBe(false);
  expect(storage.writes).toEqual([]);
});

test('desktop and mobile review receipts are independent and expose exact digest context', async ({ page }) => {
  await page.goto(TOOL);
  await selectReviewedContext(page);
  const hostileSearch = 'SEARCH-ONLY-DO-NOT-PERSIST-OR-RENDER';
  await page.getByRole('button', { name: /Step 2 Curriculum/ }).click();
  await page.locator('[data-curator-search]').fill(hostileSearch);
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await page.getByRole('link', { name: /Where do I go\?/ }).click();
  await expect(page.locator('#fd-curator-arrival')).toBeFocused();
  await page.getByRole('button', { name: 'Review desktop preview' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await expect(page.locator('[data-curator-preview-status="mobile"]')).not.toContainText('Reviewed');
  await page.getByRole('button', { name: 'Review 390 px mobile preview' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-curator-preview-status="mobile"]')).toContainText('Reviewed');
  await expect(page.locator('[data-curator-review-evidence]')).toContainText(/sha256-/);
  await expect(page.locator('.fd-curator-preview--mobile')).toHaveCSS('width', '390px');
  await expect(page.locator('.fd-curator-preview--mobile h4')).toHaveText([
    'First day at the location', 'Before you arrive', 'Who to contact', "Today's checklist",
    'Typical day', 'Team workflow', 'Attendance and feedback', 'Official resources',
  ]);
  await expect(page.locator('[data-curator-review-evidence]')).not.toContainText(hostileSearch);
  await page.getByRole('button', { name: /Step 1 Edition/ }).click();
  await page.locator('[data-curator-save]').click();
  const saved = await page.evaluate(() => Object.entries(localStorage).find(([key]) => /_curator_draft_(?:ms3|resident)_v2$/.test(key))?.[1] || '');
  expect(saved).not.toContain(hostileSearch);
  await expect(page.locator('#curatorEditorMount')).not.toContainText(hostileSearch);
});

test('v1 backup salvage discards prose and writes nothing until an explicit v2 save', async ({ page }) => {
  await page.goto(TOOL);
  const legacy = await page.evaluate(async () => {
    const ref = FD_INDEX.weeks.find(week => week.items.length).items[0].ref;
    const config = {
      audience: FD_AUDIENCE, pathId: FD_INDEX.path.id, editionNumber: 7,
      createdAgainstCoreRevision: FD_CORE_REVISION,
      card: {
        title: 'DISCARDED TITLE', locationName: 'DISCARDED LOCATION', locationCode: 'OLD',
        curatorName: 'DISCARDED NAME', curatorRole: 'DISCARDED ROLE',
        rotationStart: '2027-01-04', rotationEnd: '2027-02-12', lastVerified: '2027-01-01',
      },
      pathItems: [{ instanceId: 'legacy:1', ref, week: 1, order: 1, priority: 'recommended', rationale: 'DISCARDED RATIONALE' }],
      localOrientation: {
        firstDayArrival: 'DISCARDED ARRIVAL', dailySchedule: '', roundsWorkflow: '',
        presentationExpectations: '', documentationExpectations: '', attendanceExpectations: '',
        feedbackProcess: '', accessPreparation: '', contacts: [], checklist: [], resources: [],
      },
      changeNote: 'DISCARDED CHANGE',
    };
    const preimage = { format: 'cw-rotation-edition', schemaVersion: 1, config };
    const bytes = new TextEncoder().encode(fdEditionCanonicalJson(preimage));
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    let binary = ''; for (const byte of hash) binary += String.fromCharCode(byte);
    const digest = `sha256-${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    return JSON.stringify({ ...preimage, digest });
  });

  await page.locator('[data-curator-import]').setInputFiles({
    name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(legacy),
  });
  await expect(page.locator('[data-curator-import-status]')).toContainText('Legacy backup safely salvaged');
  await expect(page.locator('#curatorRotationStart')).toHaveValue('2027-01-04');
  await expect(page.locator('#curatorEditionCheckedOn')).toHaveValue('');
  await expect(page.locator('#curatorEditorMount')).not.toContainText('DISCARDED');
  expect((await page.evaluate(() => window.__curatorStorage)).writes).toEqual([]);

  await page.locator('[data-curator-save]').click();
  const storage = await page.evaluate(() => window.__curatorStorage);
  expect(storage.writes).toHaveLength(1);
  expect(storage.writes[0]).toMatch(/_curator_draft_(?:ms3|resident)_v2$/);
});

test('oversize import fails before text is accepted and cannot alter the draft', async ({ page }) => {
  await page.goto(TOOL);
  await page.locator('#curatorRotationStart').fill('2027-01-04');
  await page.locator('[data-curator-import]').setInputFiles({
    name: 'oversize.json', mimeType: 'application/json', buffer: Buffer.alloc(65537, 32),
  });
  await expect(page.locator('[data-curator-import-status]')).toHaveText('Backup must be 64 KiB or smaller.');
  await expect(page.locator('#curatorRotationStart')).toHaveValue('2027-01-04');
  expect((await page.evaluate(() => window.__curatorStorage)).writes).toEqual([]);
});
