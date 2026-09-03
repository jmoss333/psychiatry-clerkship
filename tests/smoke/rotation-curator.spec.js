import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { requestGetWithRetry, routeFetchWithRetry } from './net-resilience.js';
import { audienceOf } from './audience.js';
import { replaceRotationEditionCatalog } from './rotation-edition-fixture.js';

const TOOL = '/tools/rotation-curator.html';
const AFFIRMATIONS = {
  publicSafe: 'I confirm this edition contains no PHI, learner data, evaluations, credentials, private contact details, or access codes.',
  officialLinks: 'I confirm every linked local clinical protocol is an official HTTPS institutional source.',
  previewsReviewed: 'I reviewed both the desktop and 390 px mobile student previews.',
  forwardable: 'I understand anyone may forward this account-free link and I cannot revoke this edition from the link.',
};
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

function projection(audience, revision, gate = 'enabled') {
  const common = { audiences: [audience], verifiedOn: '2026-08-19' };
  const location = 'location.synthetic@v1';
  const records = [
    { key: 'choice.role@v1', kind: 'choice', choiceKind: 'role', label: 'Faculty role', fragment: 'the faculty role', ...common },
    { key: 'choice.role-two@v1', kind: 'choice', choiceKind: 'role', label: 'Second public role', fragment: 'the second public role', locationKeys: [location], ...common },
    { key: 'choice.reason@v1', kind: 'choice', choiceKind: 'reason', label: 'Reviewed reason', fragment: 'reviewed reason', locationKeys: [location], ...common },
    { key: 'choice.reason-two@v1', kind: 'choice', choiceKind: 'reason', label: 'Second reviewed reason', fragment: 'second reviewed reason', locationKeys: [location], ...common },
    { key: 'choice.day-set-one@v1', kind: 'choice', choiceKind: 'daySet', label: 'Weekdays', fragment: 'weekdays', locationKeys: [location], ...common },
    { key: 'choice.day-set-two@v1', kind: 'choice', choiceKind: 'daySet', label: 'Teaching days', fragment: 'teaching days', locationKeys: [location], ...common },
    { key: 'choice.activity-one@v1', kind: 'choice', choiceKind: 'activity', label: 'Rounds', fragment: 'rounds', locationKeys: [location], ...common },
    { key: 'choice.activity-two@v1', kind: 'choice', choiceKind: 'activity', label: 'Teaching', fragment: 'teaching', locationKeys: [location], ...common },
    { key: 'choice.access-one@v1', kind: 'choice', choiceKind: 'accessItem', label: 'Badge setup', fragment: 'complete badge setup', locationKeys: [location], ...common },
    { key: 'choice.access-two@v1', kind: 'choice', choiceKind: 'accessItem', label: 'Email setup', fragment: 'complete email setup', locationKeys: [location], ...common },
    { key: 'choice.due-one@v1', kind: 'choice', choiceKind: 'duePoint', label: 'Before arrival', fragment: 'before arrival', locationKeys: [location], ...common },
    { key: 'choice.due-two@v1', kind: 'choice', choiceKind: 'duePoint', label: 'Before day two', fragment: 'before day two', locationKeys: [location], ...common },
    { key: 'choice.checklist-one@v1', kind: 'choice', choiceKind: 'checklist', label: 'Bring badge', fragment: 'bring your badge', locationKeys: [location], ...common },
    { key: 'choice.checklist-two@v1', kind: 'choice', choiceKind: 'checklist', label: 'Review schedule', fragment: 'review the schedule', locationKeys: [location], ...common },
    { key: 'choice.presentation-format@v1', kind: 'choice', choiceKind: 'presentationFormat', label: 'Problem representation', fragment: 'a problem representation', locationKeys: [location], ...common },
    { key: 'choice.presentation-timing@v1', kind: 'choice', choiceKind: 'presentationTiming', label: 'During rounds', fragment: 'during rounds', locationKeys: [location], ...common },
    { key: 'choice.presentation-element-one@v1', kind: 'choice', choiceKind: 'presentationElement', label: 'Assessment', fragment: 'assessment', locationKeys: [location], ...common },
    { key: 'choice.presentation-element-two@v1', kind: 'choice', choiceKind: 'presentationElement', label: 'Plan', fragment: 'plan', locationKeys: [location], ...common },
    { key: 'place.one@v1', kind: 'place', displayName: 'the first workroom', locationKeys: [location], ...common },
    { key: 'place.two@v1', kind: 'place', displayName: 'the second workroom', locationKeys: [location], ...common },
    { key: 'link.access-one@v1', kind: 'officialLink', title: 'First access page', url: 'https://example.invalid/access-one', visibleHostname: 'example.invalid', purposeCode: 'access-training', locationKeys: [location], ...common },
    { key: 'link.access-two@v1', kind: 'officialLink', title: 'Second access page', url: 'https://example.invalid/access-two', visibleHostname: 'example.invalid', purposeCode: 'reviewed-operational', locationKeys: [location], ...common },
    { key: 'link.directory-one@v1', kind: 'officialLink', title: 'First directory', url: 'https://example.invalid/directory-one', visibleHostname: 'example.invalid', purposeCode: 'directory', locationKeys: [location], ...common },
    { key: 'link.directory-two@v1', kind: 'officialLink', title: 'Second directory', url: 'https://example.invalid/directory-two', visibleHostname: 'example.invalid', purposeCode: 'directory', locationKeys: [location], ...common },
    { key: 'link.resource-one@v1', kind: 'officialLink', title: 'First resource', url: 'https://example.invalid/resource-one', visibleHostname: 'example.invalid', purposeCode: 'orientation', locationKeys: [location], ...common },
    { key: 'link.resource-two@v1', kind: 'officialLink', title: 'Second resource', url: 'https://example.invalid/resource-two', visibleHostname: 'example.invalid', purposeCode: 'official-clinical-policy', locationKeys: [location], ...common },
    { key: location, kind: 'trainingLocation', displayName: 'Synthetic Teaching Unit', locationCode: 'SYN', locationTypeCode: 'inpatient', officialHostnames: ['example.invalid'], ...common },
    { key: 'curator.synthetic@v1', kind: 'curatorProfile', displayName: 'Synthetic Faculty', roleKey: 'choice.role@v1', locationKeys: [location], ...common },
    {
      key: 'phrases.synthetic@v1', kind: 'phraseSet', displayName: 'Synthetic reviewed wording',
      templates: Object.fromEntries(Object.entries(TOKENS).map(([name, tokens]) => [name, {
        text: tokens.map(token => `{${token}}`).join(' '), tokens,
      }])),
      locationKeys: [location], ...common,
    },
    {
      key: 'preset.synthetic@v1', kind: 'localPreset', displayName: 'Synthetic repeatable rows', phraseSetKey: 'phrases.synthetic@v1',
      localPlan: {
        schedule: { dayStart: '07:45', dayEnd: '17:00', endQualifierCode: 'about', events: [
          { instanceId: 'local:schedule:1', daySetKey: 'choice.day-set-one@v1', startTime: '08:30', endTime: '09:30', activityKey: 'choice.activity-one@v1', placeKey: 'place.one@v1', priority: 'required' },
        ] },
        accessItems: [{ instanceId: 'local:access:1', itemKey: 'choice.access-one@v1', dueKey: 'choice.due-one@v1', linkKey: 'link.access-one@v1' }],
        contacts: [{ instanceId: 'local:contact:1', roleKey: 'choice.role@v1', linkKey: 'link.directory-one@v1' }],
        checklistItems: [{ instanceId: 'local:checklist:1', itemKey: 'choice.checklist-one@v1', priority: 'recommended' }],
        resources: [{ instanceId: 'local:resource:1', linkKey: 'link.resource-one@v1', priority: 'recommended', week: 1, reasonKey: 'choice.reason@v1' }],
      },
      locationKeys: [location], ...common,
    },
  ].map(record => ({ ...record, contentDigest: digest(record) }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const value = {
    schemaVersion: 1, audience, revision, projectionDigest: '', rotationEditionV2: gate,
    selectionKeys: records.map(record => record.key), resolutionRecords: records, blockedKeys: [],
  };
  const bare = structuredClone(value); delete bare.projectionDigest; value.projectionDigest = digest(bare);
  return value;
}

async function useSyntheticCatalog(page, gate = 'enabled') {
  await page.route(`**${TOOL}`, async route => {
    const response = await routeFetchWithRetry(route);
    let html = await response.text();
    const audienceMatch = html.match(/var FD_AUDIENCE=("(?:[^"\\]|\\.)*");/);
    if (!audienceMatch) throw new Error('built curator bootstrap was not found');
    const audience = JSON.parse(audienceMatch[1]);
    const parsed = replaceRotationEditionCatalog(html, projection(audience, `sha256-${'A'.repeat(43)}`, gate));
    const current = parsed.originalProjection;
    html = replaceRotationEditionCatalog(html, projection(audience, current.revision, gate)).body;
    await route.fulfill({ response, body: html });
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

test('checked-in default-off Step 5 renders governed disclosures and cannot create any artifact', async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
  await useSyntheticCatalog(page, 'disabled');
  await page.goto(TOOL); await selectReviewedContext(page);
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await page.getByRole('button', { name: 'Review desktop preview' }).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await page.getByRole('button', { name: 'Review 390 px mobile preview' }).click();
  await expect(page.locator('[data-curator-preview-status="mobile"]')).toContainText('Reviewed');
  await page.getByRole('button', { name: /Step 5 Preview and share/ }).click();
  const panel = page.locator('[data-curator-step-panel="5"]');
  await expect(panel).toBeVisible(); await expect(panel.getByRole('heading', { name: 'Review and share' })).toBeVisible();
  await expect(panel.locator('[data-curator-governance-status]')).toContainText(/Publication governance.*disabled/i);
  for (const statement of Object.values(AFFIRMATIONS)) await expect(panel).toContainText(statement);
  const explicit = panel.locator('input[data-curator-affirmation]');
  await expect(explicit).toHaveCount(3);
  for (const name of ['publicSafe', 'officialLinks', 'forwardable']) {
    const checkbox = panel.getByRole('checkbox', { name: AFFIRMATIONS[name], exact: true });
    await expect(checkbox).toBeEnabled(); await checkbox.check(); await expect(checkbox).toBeChecked();
  }
  await expect(panel.locator('input[data-curator-affirmation="previewsReviewed"]')).toHaveCount(0);
  await expect(panel.locator('[data-curator-derived-affirmation="previewsReviewed"]')).toContainText('Reviewed');
  await expect(page.locator('#curatorGenerate')).toBeDisabled(); await expect(page.locator('#curatorGenerate')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-curator-share-link]')).toHaveCount(0); await expect(page.locator('[data-curator-qr]')).toHaveCount(0); await expect(page.locator('[data-curator-download]')).toHaveCount(0);
  await expect(page.locator('#curatorGenerate')).toBeDisabled(); await expect(page.locator('[data-curator-share-link]')).toHaveCount(0);
  expect(await page.evaluate(() => typeof qrcode)).toBe('function');
});

test('enabled synthetic Step 5 requires real receipts and affirmations, then creates one exact local share', async ({ page }, testInfo) => {
  const audience = audienceOf(testInfo.project.name);
  await page.goto(TOOL); await selectReviewedContext(page);
  await page.getByRole('button', { name: /Step 3 Schedule/ }).click();
  const placedItems = page.locator('[data-curator-path-remove]');
  while (await placedItems.count() > 1) await placedItems.last().click();
  await page.getByRole('button', { name: /Step 5 Preview and share/ }).click();
  let panel = page.locator('[data-curator-step-panel="5"]'); await expect(panel).toBeVisible();
  await expect(panel.locator('[data-curator-derived-affirmation="previewsReviewed"]')).toContainText('Not reviewed');
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await page.getByRole('button', { name: 'Review desktop preview' }).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await page.getByRole('button', { name: /Step 5 Preview and share/ }).click();
  panel = page.locator('[data-curator-step-panel="5"]');
  await expect(panel.locator('[data-curator-receipt-status="desktop"]')).toContainText('Reviewed');
  await expect(panel.locator('[data-curator-receipt-status="mobile"]')).toContainText('Not reviewed');
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await page.getByRole('button', { name: 'Review 390 px mobile preview' }).click();
  await expect(page.locator('[data-curator-preview-status="mobile"]')).toContainText('Reviewed');
  const evidence = await page.locator('[data-curator-preview-layout="desktop"]').evaluate((node) => ({
    contentDigest: node.getAttribute('data-curator-content-digest'), referenceDigest: node.getAttribute('data-curator-reference-digest'),
    fingerprint: node.getAttribute('data-curator-fingerprint'), coreRevision: node.getAttribute('data-curator-core-revision'),
    catalogRevision: node.getAttribute('data-curator-catalog-revision'), rendererRevision: node.getAttribute('data-curator-renderer-revision'),
  }));
  await page.getByRole('button', { name: /Step 5 Preview and share/ }).click();
  panel = page.locator('[data-curator-step-panel="5"]'); await expect(panel).toBeVisible();
  await expect(panel.locator('[data-curator-governance-status]')).toContainText(/Publication governance.*enabled/i);
  for (const label of ['Destination site', 'Audience', 'Fingerprint', 'Core revision', 'Catalog revision', 'Reference set digest', 'Renderer revision', 'Desktop preview', '390 px mobile preview']) await expect(panel).toContainText(label);
  const origin = new URL(page.url()).origin;
  await expect(panel.locator('[data-curator-destination]')).toHaveText(`${origin}/`);
  await expect(panel.locator('[data-curator-audience]')).toHaveText(audience === 'ms3' ? 'MS3' : 'Resident');
  await expect(panel.locator('[data-curator-fingerprint]')).toHaveText(evidence.fingerprint);
  await expect(panel.locator('[data-curator-content-digest]')).toHaveText(evidence.contentDigest);
  await expect(panel.locator('[data-curator-core-revision]')).toHaveText(evidence.coreRevision);
  await expect(panel.locator('[data-curator-catalog-revision]')).toHaveText(evidence.catalogRevision);
  await expect(panel.getByRole('heading', { name: 'Revision comparison' })).toBeVisible();
  await expect(panel.locator('[data-curator-created-core-revision]')).toHaveText(evidence.coreRevision);
  await expect(panel.locator('[data-curator-current-core-revision]')).toHaveText(evidence.coreRevision);
  await expect(panel.locator('[data-curator-core-revision-status]')).toHaveText('Matches current');
  await expect(panel.locator('[data-curator-created-catalog-revision]')).toHaveText(evidence.catalogRevision);
  await expect(panel.locator('[data-curator-current-catalog-revision]')).toHaveText(evidence.catalogRevision);
  await expect(panel.locator('[data-curator-catalog-revision-status]')).toHaveText('Matches current');
  await expect(panel.locator('[data-curator-reference-digest]')).toHaveText(evidence.referenceDigest);
  await expect(panel.locator('[data-curator-renderer-revision]')).toHaveText(evidence.rendererRevision);
  await expect(panel.locator('[data-curator-change-summary]')).toHaveText('Initial edition 0');
  await expect(panel.locator('[data-curator-edition-checked-on]')).toContainText('Self-attested');
  await expect(panel.getByRole('heading', { name: 'Catalog verification provenance' })).toBeVisible();
  const provenanceRows = panel.locator('[data-curator-provenance-row]'); await expect(provenanceRows).toHaveCount(3);
  for (const [offset, kind, label] of [
    [0, 'trainingLocation', 'Synthetic Teaching Unit'], [1, 'curatorProfile', 'Synthetic Faculty'], [2, 'phraseSet', 'Synthetic reviewed wording'],
  ]) {
    await expect(provenanceRows.nth(offset).locator('[data-curator-provenance-kind]')).toHaveText(kind);
    await expect(provenanceRows.nth(offset).locator('[data-curator-provenance-label]')).toHaveText(label);
    await expect(provenanceRows.nth(offset).locator('[data-curator-provenance-verified-on]')).toHaveText('2026-08-19');
  }
  await expect(panel).toContainText(/operator identity is not digitally verified/i); await expect(panel).toContainText(/Unauthenticated change lineage/i);
  await expect(panel.locator('[data-curator-derived-affirmation="previewsReviewed"]')).toContainText('Reviewed');
  const explicit = panel.locator('input[data-curator-affirmation]'); await expect(explicit).toHaveCount(3);
  for (const name of ['publicSafe', 'officialLinks', 'forwardable']) await expect(panel.getByRole('checkbox', { name: AFFIRMATIONS[name], exact: true })).not.toBeChecked();
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
  for (const name of ['publicSafe', 'officialLinks', 'forwardable']) await panel.getByRole('checkbox', { name: AFFIRMATIONS[name], exact: true }).check();
  await expect(page.locator('#curatorGenerate')).toBeEnabled(); await expect(page.locator('#curatorGenerate')).toHaveAttribute('aria-disabled', 'false');

  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await page.locator('#curatorGenerate').click();
  await expect(panel.locator('[data-curator-share-status]')).toContainText('Edition link generated');
  expect(requests).toEqual([]);
  const link = await panel.locator('[data-curator-share-link]').getAttribute('href');
  expect(link).toMatch(new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/#edition=[A-Za-z0-9_-]+$`));
  expect((link.match(/#/g) || []).length).toBe(1); expect(link).not.toContain('?'); expect(link).not.toContain('%');
  const backup = Buffer.from(link.split('#edition=')[1], 'base64url').toString('utf8'); const envelope = JSON.parse(backup);
  expect(canonical(envelope)).toBe(backup); expect(envelope.config.audience).toBe(audience);
  expect(Object.keys(envelope).sort()).toEqual(['config', 'digest', 'format', 'schemaVersion']);
  await expect(panel.locator('[data-curator-qr] svg')).toBeVisible(); await expect(panel.locator('[data-curator-qr] title')).toHaveText('Rotation edition link QR code');
  await expect(panel).toContainText('public operational guidance only'); await expect(panel).toContainText('fragment is not intentionally sent to the host');
  for (const risk of ['browser history', 'clipboard tools', 'extensions', 'screenshots', 'recipients', 'forwarded messages']) await expect(panel).toContainText(risk);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await panel.locator('[data-curator-copy]').click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  const downloadEvent = page.waitForEvent('download'); await panel.locator('[data-curator-download]').click(); const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`SYN-${audience}-rotation-edition-1.json`); expect(readFileSync(await download.path(), 'utf8')).toBe(backup);
  const shell = await requestGetWithRetry(page.request, '/'); expect(await shell.text()).not.toContain('QR Code Generator for JavaScript');
});

test('Step 5 real imported edition reports exact core and catalog drift', async ({ page }) => {
  await page.goto(TOOL);
  const expected = await page.evaluate(async () => {
    const prepared = await fdEditionCatalogSnapshot(
      FD_ROTATION_EDITION_CATALOG, FD_CURATOR_CONTEXT.audience, crypto.subtle,
    );
    if (!prepared || prepared.ok !== true) throw new Error('synthetic catalog snapshot unavailable');
    const snapshot = prepared.snapshot;
    const validation = { mode: 'builder', generationDate: fdGenerationDate };
    const transactions = fdCuratorImportTransactions();
    let draft = fdCuratorNewDraft(FD_INDEX, FD_CURATOR_CONTEXT);
    const reduce = (action) => {
      draft = fdCuratorReduce(
        draft, action, FD_INDEX, FD_CURATOR_CONTEXT, snapshot, fdGenerationDate, transactions,
      );
    };
    reduce({ type: 'SET_TRAINING_LOCATION', trainingLocationKey: 'location.synthetic@v1' });
    reduce({ type: 'SET_CURATOR_PROFILE', curatorProfileKey: 'curator.synthetic@v1' });
    reduce({ type: 'SET_PHRASE_SET', phraseSetKey: 'phrases.synthetic@v1' });
    reduce({ type: 'SET_ROTATION_START', value: '2026-09-01' });
    reduce({ type: 'SET_ROTATION_END', value: '2026-10-12' });
    reduce({ type: 'SET_EDITION_CHECKED_ON', value: '2026-08-19' });

    const candidate = await fdCuratorCandidateConfig(
      draft, FD_INDEX, snapshot, FD_CURATOR_CONTEXT, validation, crypto.subtle,
    );
    if (!candidate || candidate.ok !== true) throw new Error('current candidate unavailable');
    const oldCore = '4'.repeat(40);
    const oldCatalog = `sha256-${'E'.repeat(43)}`;
    const oldConfig = structuredClone(candidate.config);
    oldConfig.createdAgainstCoreRevision = oldCore;
    oldConfig.createdAgainstLocalCatalogRevision = oldCatalog;
    const made = await fdEditionCreateEnvelope(
      oldConfig, FD_INDEX, snapshot, fdCuratorContractSiteContext(FD_CURATOR_CONTEXT), validation, crypto.subtle,
    );
    if (!made || made.ok !== true) throw new Error('drift envelope unavailable');
    const sequence = transactions.begin();
    const imported = await fdCuratorImportBackup(
      fdEditionCanonicalJson(made.envelope), FD_INDEX, FD_CURATOR_CONTEXT, snapshot, validation, crypto.subtle, sequence,
    );
    if (!imported || imported.ok !== true) throw new Error('drift import unavailable');
    reduce({ type: 'IMPORT_SUCCEEDED', result: imported, sequence });
    const drift = await fdCuratorCandidateConfig(
      draft, FD_INDEX, snapshot, FD_CURATOR_CONTEXT, validation, crypto.subtle,
    );
    if (!drift || drift.ok !== true) throw new Error('drift candidate unavailable');
    const markup = fdCuratorStepFiveMarkup(draft, drift.displayModel, {
      contentDigest: drift.contentDigest,
      referenceSetDigest: drift.referenceSetDigest,
      fingerprint: drift.fingerprint,
      currentCoreRevision: FD_CURATOR_CONTEXT.coreRevision,
      currentCatalogRevision: FD_CURATOR_CONTEXT.localCatalogRevision,
      rendererRevision: 'rotation-edition-v2-r1',
    }, null, {
      protocol: location.protocol, host: location.host, origin: location.origin,
      pathname: location.pathname, search: '', hash: '',
    }, '');
    const fixture = document.createElement('div');
    fixture.dataset.curatorDriftFixture = '';
    fixture.innerHTML = markup;
    document.body.append(fixture);
    return {
      oldCore, oldCatalog,
      currentCore: FD_CURATOR_CONTEXT.coreRevision,
      currentCatalog: FD_CURATOR_CONTEXT.localCatalogRevision,
    };
  });

  const panel = page.locator('[data-curator-drift-fixture]');
  await expect(panel.getByRole('heading', { name: 'Revision comparison' })).toBeVisible();
  await expect(panel.locator('[data-curator-created-core-revision]')).toHaveText(expected.oldCore);
  await expect(panel.locator('[data-curator-current-core-revision]')).toHaveText(expected.currentCore);
  await expect(panel.locator('[data-curator-core-revision-status]')).toHaveText('Drift detected');
  await expect(panel.locator('[data-curator-created-catalog-revision]')).toHaveText(expected.oldCatalog);
  await expect(panel.locator('[data-curator-current-catalog-revision]')).toHaveText(expected.currentCatalog);
  await expect(panel.locator('[data-curator-catalog-revision-status]')).toHaveText('Drift detected');
});

test('v2 synthetic catalog unlocks reviewed structured Steps 1 through 4', async ({ page }, testInfo) => {
  const audience = audienceOf(testInfo.project.name);
  await page.goto(TOOL);

  await expect(page.getByRole('heading', { name: 'Faculty rotation edition builder' })).toBeVisible();
  await expect(page.locator('[data-curator-step-panel="1"]')).toBeVisible();
  await expect(page.locator('[data-curator-location]')).toContainText('Synthetic Teaching Unit');
  await expect(page.locator('[data-curator-profile]')).toHaveValue('');
  await selectReviewedContext(page);

  await page.getByRole('button', { name: /Step 2 Curriculum/ }).click();
  await expect(page.locator('[data-curator-step-panel="2"]')).toBeVisible();
  await expect(page.locator('[data-curator-path-repeat]').first()).toBeVisible();
  const pathPriority = page.locator('[data-curator-path-priority]').first();
  const pathReason = page.locator('[data-curator-path-reason]').first();
  await expect(pathReason).toContainText('Reviewed reason');
  await expect(pathPriority.locator('option')).toHaveText(['required', 'recommended', 'optional']);
  expect(await pathPriority.locator('option').evaluateAll((options) => options.map((option) => option.value))).toEqual(['required', 'recommended', 'optional']);
  await expect(pathPriority).toHaveValue('recommended');
  await expect(pathReason.locator('option')).toHaveText(['No reviewed reason', 'Reviewed reason', 'Second reviewed reason']);
  expect(await pathReason.locator('option').evaluateAll((options) => options.map((option) => option.value))).toEqual(['', 'choice.reason@v1', 'choice.reason-two@v1']);
  await expect(pathReason).toHaveValue('');
  await pathPriority.evaluate((select) => {
    const forged = document.createElement('option'); forged.value = ''; forged.textContent = 'forged blank'; select.append(forged);
    select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('[data-curator-path-priority]').first()).toHaveValue('recommended');
  expect(await page.locator('[data-curator-path-priority]').first().locator('option').evaluateAll((options) => options.map((option) => option.value))).toEqual(['required', 'recommended', 'optional']);
  await expect(page.locator('[data-curator-path-reason]').first()).toHaveValue('');
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
  await expect(page.locator('.fd-curator-preview--desktop')).toHaveAttribute('data-curator-render-status', 'complete');
  await expect(page.locator('.fd-curator-preview--desktop h4')).toHaveText([
    'First day at the location', 'Before you arrive', 'Who to contact', "Today's checklist",
    'Typical day', 'Team workflow', 'Attendance and feedback', 'Official resources',
  ]);
  expect(await page.locator('.fd-curator-preview--desktop').evaluate(node => node.isConnected)).toBe(true);
  const desktopEvidence = await page.locator('.fd-curator-preview--desktop').evaluate(node => Object.fromEntries([
    'content-digest', 'reference-digest', 'fingerprint', 'core-revision', 'catalog-revision', 'renderer-revision',
  ].map(name => [name, node.getAttribute(`data-curator-${name}`)])));
  expect(desktopEvidence['content-digest']).toMatch(/^sha256-[A-Za-z0-9_-]{43}$/);
  expect(desktopEvidence['reference-digest']).toMatch(/^sha256-[A-Za-z0-9_-]{43}$/);
  expect(desktopEvidence.fingerprint).toMatch(/^[A-Z0-9]+-(?:MS3|RES)-[A-Z0-9]{6}$/);
  expect(desktopEvidence['core-revision']).toHaveLength(40);
  expect(desktopEvidence['catalog-revision']).toMatch(/^sha256-/);
  expect(desktopEvidence['renderer-revision']).toBe('rotation-edition-v2-r1');
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await expect(page.locator('[data-curator-preview-status="mobile"]')).not.toContainText('Reviewed');

  await page.evaluate(() => {
    const editor = document.querySelector('#curatorEditorMount');
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    let fail = true;
    Object.defineProperty(editor, 'innerHTML', {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) { if (fail) { fail = false; throw new Error('private preview render failure'); } return descriptor.set.call(this, value); },
    });
  });
  await page.getByRole('button', { name: 'Review desktop preview' }).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Preview could not be validated');
  await page.evaluate(() => { delete document.querySelector('#curatorEditorMount').innerHTML; });
  await page.getByRole('button', { name: /Step 1 Edition/ }).click();
  await page.locator('[data-curator-save]').click();
  const preserved = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => /_curator_draft_(?:ms3|resident)_v2$/.test(key))[1]));
  expect(preserved.previewReceipts.desktop).toEqual({
    contentDigest: desktopEvidence['content-digest'], referenceSetDigest: desktopEvidence['reference-digest'],
    currentCoreRevision: desktopEvidence['core-revision'], currentCatalogRevision: desktopEvidence['catalog-revision'],
    rendererRevision: desktopEvidence['renderer-revision'], previewPreset: 'desktop',
  });
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await page.getByRole('button', { name: 'Review 390 px mobile preview' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.fd-curator-preview--mobile')).toHaveCSS('width', '390px');
  await expect(page.locator('.fd-curator-preview--mobile')).toHaveAttribute('data-curator-render-status', 'complete');
  await expect(page.locator('.fd-curator-preview--mobile h4')).toHaveText([
    'First day at the location', 'Before you arrive', 'Who to contact', "Today's checklist",
    'Typical day', 'Team workflow', 'Attendance and feedback', 'Official resources',
  ]);
  expect(await page.locator('.fd-curator-preview--mobile').evaluate(node => node.isConnected)).toBe(true);
  const mobileEvidence = await page.locator('.fd-curator-preview--mobile').evaluate(node => Object.fromEntries([
    'content-digest', 'reference-digest', 'fingerprint', 'core-revision', 'catalog-revision', 'renderer-revision',
  ].map(name => [name, node.getAttribute(`data-curator-${name}`)])));
  expect(mobileEvidence).toEqual(desktopEvidence);
  await expect(page.locator('[data-curator-preview-status="mobile"]')).toContainText('Reviewed');
  await expect(page.locator('[data-curator-review-evidence]')).toContainText(/sha256-/);
  await expect(page.locator('[data-curator-review-evidence]')).not.toContainText(hostileSearch);
  await page.getByRole('button', { name: /Step 1 Edition/ }).click();
  await page.locator('[data-curator-save]').click();
  const saved = await page.evaluate(() => Object.entries(localStorage).find(([key]) => /_curator_draft_(?:ms3|resident)_v2$/.test(key))?.[1] || '');
  expect(saved).not.toContain(hostileSearch);
  await expect(page.locator('#curatorEditorMount')).not.toContainText(hostileSearch);
});

test('structured multi-select and qualifier survive every rerender, navigation, save, reload, and edit', async ({ page }) => {
  await page.goto(TOOL);
  await selectReviewedContext(page);
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();

  await page.locator('#fd-curator-presentation [data-curator-field="formatKey"]').selectOption('choice.presentation-format@v1');
  await page.locator('#fd-curator-presentation [data-curator-field="timingKey"]').selectOption('choice.presentation-timing@v1');
  await page.locator('#fd-curator-presentation [data-curator-field="elementKeys"]').selectOption([
    'choice.presentation-element-one@v1', 'choice.presentation-element-two@v1',
  ]);
  await page.locator('#fd-curator-presentation [data-curator-local-action="presentation"]').click();
  await expect(page.locator('#fd-curator-presentation [data-curator-field="elementKeys"]')).toHaveValues([
    'choice.presentation-element-one@v1', 'choice.presentation-element-two@v1',
  ]);

  await page.locator('#fd-curator-schedule [data-curator-field="dayStart"]').fill('07:45');
  await page.locator('#fd-curator-schedule [data-curator-field="dayEnd"]').fill('17:00');
  await page.locator('#fd-curator-schedule [data-curator-field="endQualifierCode"]').selectOption('no-later-than');
  await page.locator('#fd-curator-schedule [data-curator-local-action="schedule-bounds"]').click();
  await expect(page.locator('#fd-curator-schedule [data-curator-field="endQualifierCode"]')).toHaveValue('no-later-than');
  await expect(page.locator('#fd-curator-presentation [data-curator-field="elementKeys"]')).toHaveValues([
    'choice.presentation-element-one@v1', 'choice.presentation-element-two@v1',
  ]);

  await page.getByRole('button', { name: /Step 3 Schedule/ }).click();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await expect(page.locator('#fd-curator-schedule [data-curator-field="endQualifierCode"]')).toHaveValue('no-later-than');
  await expect(page.locator('#fd-curator-presentation [data-curator-field="elementKeys"]')).toHaveValues([
    'choice.presentation-element-one@v1', 'choice.presentation-element-two@v1',
  ]);

  await page.getByRole('button', { name: /Step 1 Edition/ }).click();
  await page.locator('[data-curator-save]').click();
  await page.reload();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await expect(page.locator('#fd-curator-schedule [data-curator-field="endQualifierCode"]')).toHaveValue('no-later-than');
  await expect(page.locator('#fd-curator-presentation [data-curator-field="elementKeys"]')).toHaveValues([
    'choice.presentation-element-one@v1', 'choice.presentation-element-two@v1',
  ]);
  await page.locator('#fd-curator-schedule [data-curator-field="endQualifierCode"]').selectOption('about');
  await page.locator('#fd-curator-schedule [data-curator-local-action="schedule-bounds"]').click();
  await expect(page.locator('#fd-curator-schedule [data-curator-field="endQualifierCode"]')).toHaveValue('about');
});

test('every repeatable row field edits accessibly through rerender, navigation, save-load, preview, and a second edit', async ({ page }) => {
  test.slow();
  await page.goto(TOOL);
  await selectReviewedContext(page);
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await page.locator('[data-curator-local-preset]').selectOption('preset.synthetic@v1');
  await expect(page.getByLabel(/Schedule event row 1.*start time/i)).toHaveValue('08:30');

  const schedule = page.locator('#fd-curator-schedule');
  await schedule.locator('[data-curator-field="daySetKey"]').selectOption('choice.day-set-two@v1');
  await schedule.locator('[data-curator-field="startTime"]').fill('13:00');
  await schedule.locator('[data-curator-field="activityKey"]').selectOption('choice.activity-two@v1');
  await schedule.locator('[data-curator-field="priority"]').selectOption('optional');
  await schedule.locator('[data-curator-local-action="schedule-event"]').click();

  const access = page.locator('#fd-curator-accessItems');
  await access.locator('[data-curator-field="itemKey"]').selectOption('choice.access-two@v1');
  await access.locator('[data-curator-field="dueKey"]').selectOption('choice.due-two@v1');
  await access.locator('[data-curator-local-action="access"]').click();
  const contacts = page.locator('#fd-curator-contacts');
  await contacts.locator('[data-curator-field="roleKey"]').selectOption('choice.role-two@v1');
  await contacts.locator('[data-curator-local-action="contact"]').click();
  const checklist = page.locator('#fd-curator-checklistItems');
  await checklist.locator('[data-curator-field="itemKey"]').selectOption('choice.checklist-two@v1');
  await checklist.locator('[data-curator-field="priority"]').selectOption('optional');
  await checklist.locator('[data-curator-local-action="checklist"]').click();
  const resources = page.locator('#fd-curator-resources');
  await resources.locator('[data-curator-field="linkKey"]').selectOption('link.resource-two@v1');
  await resources.locator('[data-curator-field="priority"]').selectOption('optional');
  await resources.locator('[data-curator-field="week"]').fill('2');
  await resources.locator('[data-curator-local-action="resource"]').click();

  for (const [action, count] of Object.entries({ SCHEDULE_EVENT_UPDATE: 12, ACCESS_UPDATE: 6, CONTACT_UPDATE: 4, CHECKLIST_UPDATE: 4, RESOURCE_UPDATE: 8 })) {
    const names = await page.locator(`[data-curator-row-update="${action}"]`).evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    expect(names).toHaveLength(count); expect(new Set(names).size).toBe(count); expect(names.some(name => /row 2, local:/.test(name))).toBe(true);
  }
  async function optionValues(name) { return page.getByLabel(name).locator('option').evaluateAll(options => options.map(option => option.value)); }
  expect(await optionValues(/Schedule event row 1.*day set/i)).toEqual(['choice.day-set-two@v1', 'choice.day-set-one@v1']);
  expect(await optionValues(/Schedule event row 1.*activity/i)).toEqual(['choice.activity-one@v1', 'choice.activity-two@v1']);
  expect(await optionValues(/Schedule event row 1.*priority/i)).toEqual(['required', 'recommended', 'optional']);
  expect(await optionValues(/Schedule event row 1.*place/i)).toEqual(['', 'place.one@v1', 'place.two@v1']);
  expect(await optionValues(/Access item row 1.*access item/i)).toEqual(['choice.access-one@v1', 'choice.access-two@v1']);
  expect(await optionValues(/Access item row 1.*due point/i)).toEqual(['choice.due-one@v1', 'choice.due-two@v1']);
  expect(await optionValues(/Access item row 1.*official link/i)).toEqual(['', 'link.access-one@v1', 'link.access-two@v1']);
  expect(await optionValues(/Contact row 1.*public role/i)).toEqual(['choice.role@v1', 'choice.role-two@v1']);
  expect(await optionValues(/Contact row 1.*directory/i)).toEqual(['', 'link.directory-one@v1', 'link.directory-two@v1']);
  expect(await optionValues(/Checklist action row 1.*action/i)).toEqual(['choice.checklist-one@v1', 'choice.checklist-two@v1']);
  expect(await optionValues(/Checklist action row 1.*priority/i)).toEqual(['required', 'recommended', 'optional']);
  expect(await optionValues(/Resource row 1.*official resource/i)).toEqual(['link.access-one@v1', 'link.directory-one@v1', 'link.resource-one@v1', 'link.access-two@v1', 'link.directory-two@v1', 'link.resource-two@v1']);
  expect(await optionValues(/Resource row 1.*priority/i)).toEqual(['required', 'recommended', 'optional']);
  expect(await optionValues(/Resource row 1.*reason/i)).toEqual(['', 'choice.reason@v1', 'choice.reason-two@v1']);
  for (const name of [
    /Schedule event row [12].*day set/i, /Schedule event row [12].*activity/i, /Schedule event row [12].*priority/i,
    /Access item row [12].*access item/i, /Access item row [12].*due point/i,
    /Contact row [12].*public role/i,
    /Checklist action row [12].*action/i, /Checklist action row [12].*priority/i,
    /Resource row [12].*official resource/i, /Resource row [12].*priority/i,
  ]) expect((await optionValues(name)).includes('')).toBe(false);
  for (const [name, emptyLabel] of [
    [/Schedule event row [12].*place/i, 'No place'], [/Access item row [12].*official link/i, 'No link'],
    [/Contact row [12].*directory/i, 'No directory'], [/Resource row [12].*reason/i, 'No reason'],
  ]) {
    const blankOptions = await page.getByLabel(name).locator('option[value=""]').allTextContents();
    expect(blankOptions).toEqual([emptyLabel, emptyLabel]);
  }

  await page.getByLabel(/Schedule event row 1.*priority/i).evaluate((select) => {
    const forged = document.createElement('option'); forged.value = ''; forged.textContent = 'forged blank'; select.append(forged);
    select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByLabel(/Schedule event row 1.*priority/i)).toHaveValue('required');
  expect(await optionValues(/Schedule event row 1.*priority/i)).toEqual(['required', 'recommended', 'optional']);
  await page.getByRole('button', { name: /Step 1 Edition/ }).click();
  await page.locator('[data-curator-save]').click();
  await page.reload();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await expect(page.getByLabel(/Schedule event row 1.*priority/i)).toHaveValue('required');
  expect(await optionValues(/Schedule event row 1.*priority/i)).toEqual(['required', 'recommended', 'optional']);
  const forgedBlankSaved = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => /_curator_draft_(?:ms3|resident)_v2$/.test(key))[1]));
  expect(forgedBlankSaved.config.localPlan.schedule.events[0].priority).toBe('required');
  await page.getByRole('button', { name: 'Review desktop preview' }).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await expect(page.locator('.fd-curator-preview--desktop')).toContainText('Required');

  const edits = [
    [/Schedule event row 1.*day set/i, 'choice.day-set-two@v1'],
    [/Schedule event row 1.*activity/i, 'choice.activity-two@v1'],
    [/Schedule event row 1.*place/i, 'place.two@v1'],
    [/Schedule event row 1.*priority/i, 'optional'],
    [/Access item row 1.*access item/i, 'choice.access-two@v1'],
    [/Access item row 1.*due point/i, 'choice.due-two@v1'],
    [/Access item row 1.*official link/i, 'link.access-two@v1'],
    [/Contact row 1.*public role/i, 'choice.role-two@v1'],
    [/Contact row 1.*directory/i, 'link.directory-two@v1'],
    [/Checklist action row 1.*action/i, 'choice.checklist-two@v1'],
    [/Checklist action row 1.*priority/i, 'required'],
    [/Resource row 1.*official resource/i, 'link.resource-two@v1'],
    [/Resource row 1.*priority/i, 'optional'],
    [/Resource row 1.*reason/i, 'choice.reason-two@v1'],
  ];
  for (const [name, value] of edits) { await page.getByLabel(name).selectOption(value); await expect(page.getByLabel(name)).toHaveValue(value); }
  for (const [name, value] of [[/Schedule event row 1.*start time/i, '09:00'], [/Schedule event row 1.*end time/i, '10:00']]) {
    await page.getByLabel(name).fill(value); await page.getByLabel(name).press('Tab'); await expect(page.getByLabel(name)).toHaveValue(value);
  }
  await page.getByLabel(/Resource row 1.*week/i).fill('2'); await page.getByLabel(/Resource row 1.*week/i).press('Tab'); await expect(page.getByLabel(/Resource row 1.*week/i)).toHaveValue('2');

  await expect(page.getByLabel(/Schedule event row 1.*day set/i)).toHaveValue('choice.day-set-two@v1');
  await expect(page.getByLabel(/Schedule event row 1.*end time/i)).toHaveValue('10:00');
  await expect(page.getByLabel(/Access item row 1.*official link/i)).toHaveValue('link.access-two@v1');
  await expect(page.getByLabel(/Resource row 1.*week/i)).toHaveValue('2');
  await page.getByRole('button', { name: /Step 3 Schedule/ }).click();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  for (const [name, value] of edits) await expect(page.getByLabel(name)).toHaveValue(value);
  await expect(page.getByLabel(/Schedule event row 1.*start time/i)).toHaveValue('09:00');
  await expect(page.getByLabel(/Schedule event row 1.*end time/i)).toHaveValue('10:00');
  await expect(page.getByLabel(/Resource row 1.*week/i)).toHaveValue('2');

  await page.getByRole('button', { name: 'Review desktop preview' }).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await expect(page.locator('.fd-curator-preview--desktop')).toContainText('teaching days');
  await expect(page.locator('.fd-curator-preview--desktop')).toContainText('Second resource');
  await expect(page.locator('.fd-curator-preview--desktop')).toContainText('the second workroom');
  await expect(page.locator('.fd-curator-preview--desktop')).toContainText('second reviewed reason');
  await page.getByRole('button', { name: /Step 1 Edition/ }).click();
  await page.locator('[data-curator-save]').click();
  await page.reload();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  for (const [name, value] of edits) await expect(page.getByLabel(name)).toHaveValue(value);
  await expect(page.getByLabel(/Schedule event row 1.*start time/i)).toHaveValue('09:00');
  await expect(page.getByLabel(/Schedule event row 1.*end time/i)).toHaveValue('10:00');
  await expect(page.getByLabel(/Resource row 1.*week/i)).toHaveValue('2');
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  const firstSaved = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => /_curator_draft_(?:ms3|resident)_v2$/.test(key))[1]));
  expect(typeof firstSaved.config.localPlan.resources[0].week).toBe('number'); expect(firstSaved.config.localPlan.resources[0].week).toBe(2);

  for (const name of [/Schedule event row 1.*end time/i, /Schedule event row 1.*place/i]) {
    const control = page.getByLabel(name); if (await control.getAttribute('type') === 'time') await control.fill(''); else await control.selectOption(''); await control.press('Tab');
  }
  for (const name of [/Access item row 1.*official link/i, /Contact row 1.*directory/i, /Resource row 1.*reason/i]) await page.getByLabel(name).selectOption('');
  await page.getByLabel(/Resource row 1.*week/i).fill('3'); await page.getByLabel(/Resource row 1.*week/i).press('Tab');
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Not reviewed');
  await page.getByRole('button', { name: 'Review desktop preview' }).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await expect(page.locator('.fd-curator-preview--desktop')).toContainText('Second resource');
  await expect(page.locator('.fd-curator-preview--desktop')).not.toContainText('the second workroom');
  await expect(page.locator('.fd-curator-preview--desktop')).not.toContainText('second reviewed reason');
  await page.getByRole('button', { name: /Step 1 Edition/ }).click();
  await page.locator('[data-curator-save]').click();
  await page.reload();
  await page.getByRole('button', { name: /Step 4 Local details/ }).click();
  await expect(page.getByLabel(/Schedule event row 1.*end time/i)).toHaveValue('');
  await expect(page.getByLabel(/Schedule event row 1.*place/i)).toHaveValue('');
  await expect(page.getByLabel(/Access item row 1.*official link/i)).toHaveValue('');
  await expect(page.getByLabel(/Contact row 1.*directory/i)).toHaveValue('');
  await expect(page.getByLabel(/Resource row 1.*reason/i)).toHaveValue('');
  await expect(page.getByLabel(/Resource row 1.*week/i)).toHaveValue('3');
  await page.getByRole('button', { name: 'Review desktop preview' }).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  await expect(page.locator('.fd-curator-preview--desktop')).toContainText('Second resource');
  await expect(page.locator('.fd-curator-preview--desktop')).not.toContainText('the second workroom');
  await expect(page.locator('.fd-curator-preview--desktop')).not.toContainText('second reviewed reason');
  const secondSaved = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => /_curator_draft_(?:ms3|resident)_v2$/.test(key))[1]));
  expect(typeof secondSaved.config.localPlan.resources[0].week).toBe('number'); expect(secondSaved.config.localPlan.resources[0].week).toBe(3);
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
