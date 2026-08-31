import { existsSync, readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  ROTATION_CURATOR_PATH,
  ROTATION_EDITION_AFFIRMATIONS,
  ROTATION_EDITION_AUTHORITY,
  ROTATION_EDITION_KEYS,
  ROTATION_EDITION_ORDER,
  buildRotationEditionProjection,
  decodeRotationEditionLink,
  installRotationEditionRoute,
  mutateRotationEditionLink,
  replaceRotationEditionCatalog,
  replaceRotationEditionRuntimeFault,
  resealRotationEditionProjection,
  rotationEditionAudience,
  rotationEditionCanonical,
  rotationEditionDigest,
  rotationEditionStorageKeys,
  seedRotationEditionLearner,
} from './rotation-edition-fixture.js';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const PILOT_PROTOCOL = new URL('../../docs/pilots/rotation-edition-v2-pilot-protocol.md', import.meta.url);
const TRACKED_CORE_KEYS = [
  'cw_frontdoor_v1', 'cw_rotation_start', 'cw_progress_v1', 'cw_plan_v1', 'cw_pretest_v1',
  'cw_qb_v1', 'cw_qbank_attest_v1', 'cw_rotation_local_progress_v1', 'rp_resident_state_v1',
  'cw_rotation_edition_v1', 'cw_curator_draft_v1',
  'cw_rotation_edition_ms3_v1', 'rp_rotation_edition_resident_v1',
  'cw_rotation_edition_ms3_v2', 'cw_rotation_local_progress_ms3_v2',
  'rp_rotation_edition_resident_v2', 'rp_rotation_local_progress_resident_v2',
];
const CURATOR_KEYS = ['cw_curator_draft_ms3_v2', 'rp_curator_draft_resident_v2'];
const FIXED_ERROR_TEXT = 'Rotation edition unavailable';
const ALTERED_DIGEST = `sha256-${'Z'.repeat(43)}`;

function stepButton(page, step) {
  const names = {
    1: /Step 1 Edition/,
    2: /Step 2 Curriculum/,
    3: /Step 3 Schedule/,
    4: /Step 4 Local details/,
    5: /Step 5 Preview and share/,
  };
  return page.getByRole('button', { name: names[step] });
}

async function selectSyntheticContext(page) {
  await page.locator('[data-curator-location]').selectOption(ROTATION_EDITION_KEYS.location);
  await page.locator('[data-curator-profile]').selectOption(ROTATION_EDITION_KEYS.curator);
  await page.locator('[data-curator-phrases]').selectOption(ROTATION_EDITION_KEYS.phrases);
  await page.locator('#curatorRotationStart').fill('2026-09-01');
  await page.locator('#curatorRotationEnd').fill('2026-10-12');
  await page.locator('#curatorEditionCheckedOn').fill('2026-08-19');
}

async function keyboardSelectValue(page, selector, value, { command = false } = {}) {
  let locator = page.locator(selector);
  const option = await locator.locator('option').evaluateAll((options, targetValue) => {
    const target = options.find(({ value: optionValue }) => optionValue === targetValue);
    if (!target) return null;
    const label = target.textContent.trim();
    const labels = options.map((row) => row.textContent.trim().toLocaleLowerCase());
    let length = 1;
    while (length < label.length && labels.filter((candidate) => (
      candidate.startsWith(label.slice(0, length).toLocaleLowerCase())
    )).length !== 1) length += 1;
    return { value: target.value, label, typeahead: label.slice(0, length) };
  }, value);
  expect(option, `select contains ${value}`).not.toBeNull();
  const oldNode = await locator.elementHandle();
  await locator.focus();
  await expect(locator).toBeFocused();
  await page.keyboard.type(option.typeahead);
  locator = page.locator(selector);
  if (command) {
    expect(await oldNode.evaluate((node) => node.isConnected)).toBe(false);
    await expect(locator).toHaveValue('');
  } else await expect(locator).toHaveValue(value);
}

async function keyboardSelectSyntheticContext(page) {
  await keyboardSelectValue(page, '[data-curator-location]', ROTATION_EDITION_KEYS.location);
  await keyboardSelectValue(page, '[data-curator-profile]', ROTATION_EDITION_KEYS.curator);
  await keyboardSelectValue(page, '[data-curator-phrases]', ROTATION_EDITION_KEYS.phrases);
}

async function expectFullPresetControls(page) {
  const exactValues = [
    ['#fd-curator-arrival [data-curator-field="checkInRoleKey"]', 'synthetic.choice.role-one@v1'],
    ['#fd-curator-arrival [data-curator-field="placeKey"]', 'synthetic.place.one@v1'],
    ['#fd-curator-arrival [data-curator-field="linkKey"]', 'synthetic.link.arrival@v1'],
    ['#fd-curator-arrival [data-curator-field="timingCode"]', 'by'],
    ['#fd-curator-arrival [data-curator-field="time"]', '07:45'],
    ['[data-curator-row-editor="accessItems"] [data-curator-update-field="itemKey"]', 'synthetic.choice.access-one@v1'],
    ['[data-curator-row-editor="accessItems"] [data-curator-update-field="dueKey"]', 'synthetic.choice.due-one@v1'],
    ['[data-curator-row-editor="accessItems"] [data-curator-update-field="linkKey"]', 'synthetic.link.access-one@v1'],
    ['[data-curator-row-editor="contacts"] [data-curator-update-field="roleKey"]', 'synthetic.choice.role-two@v1'],
    ['[data-curator-row-editor="contacts"] [data-curator-update-field="linkKey"]', 'synthetic.link.directory-one@v1'],
    ['[data-curator-row-editor="checklistItems"] [data-curator-update-field="itemKey"]', 'synthetic.choice.checklist-one@v1'],
    ['[data-curator-row-editor="checklistItems"] [data-curator-update-field="priority"]', 'recommended'],
    ['#fd-curator-schedule [data-curator-field="dayStart"]', '07:45'],
    ['#fd-curator-schedule [data-curator-field="dayEnd"]', '17:00'],
    ['#fd-curator-schedule [data-curator-field="endQualifierCode"]', 'about'],
    ['[data-curator-row-editor="schedule"] [data-curator-update-field="daySetKey"]', 'synthetic.choice.day-set-one@v1'],
    ['[data-curator-row-editor="schedule"] [data-curator-update-field="startTime"]', '08:30'],
    ['[data-curator-row-editor="schedule"] [data-curator-update-field="endTime"]', '09:00'],
    ['[data-curator-row-editor="schedule"] [data-curator-update-field="activityKey"]', 'synthetic.choice.activity-one@v1'],
    ['[data-curator-row-editor="schedule"] [data-curator-update-field="placeKey"]', 'synthetic.place.one@v1'],
    ['[data-curator-row-editor="schedule"] [data-curator-update-field="priority"]', 'required'],
    ['#fd-curator-rounds [data-curator-field="preparationKey"]', 'synthetic.choice.rounds-preparation@v1'],
    ['#fd-curator-rounds [data-curator-field="participationKey"]', 'synthetic.choice.rounds-participation@v1'],
    ['#fd-curator-rounds [data-curator-field="followUpKey"]', 'synthetic.choice.rounds-follow-up@v1'],
    ['#fd-curator-presentation [data-curator-field="formatKey"]', 'synthetic.choice.presentation-format@v1'],
    ['#fd-curator-presentation [data-curator-field="timingKey"]', 'synthetic.choice.presentation-timing@v1'],
    ['#fd-curator-documentation [data-curator-field="workflowKey"]', 'synthetic.choice.documentation-workflow@v1'],
    ['#fd-curator-documentation [data-curator-field="timingKey"]', 'synthetic.choice.documentation-timing@v1'],
    ['#fd-curator-documentation [data-curator-field="policyLinkKey"]', 'synthetic.link.documentation@v1'],
    ['#fd-curator-attendance [data-curator-field="absenceRoleKey"]', 'synthetic.choice.role-two@v1'],
    ['#fd-curator-attendance [data-curator-field="policyLinkKey"]', 'synthetic.link.attendance@v1'],
    ['#fd-curator-feedback [data-curator-field="cadenceKey"]', 'synthetic.choice.feedback-cadence@v1'],
    ['#fd-curator-feedback [data-curator-field="initiatorKey"]', 'synthetic.choice.feedback-initiator@v1'],
    ['#fd-curator-feedback [data-curator-field="settingKey"]', 'synthetic.choice.feedback-setting@v1'],
    ['[data-curator-row-editor="resources"] [data-curator-update-field="linkKey"]', 'synthetic.link.resource@v1'],
    ['[data-curator-row-editor="resources"] [data-curator-update-field="priority"]', 'recommended'],
    ['[data-curator-row-editor="resources"] [data-curator-update-field="week"]', '1'],
    ['[data-curator-row-editor="resources"] [data-curator-update-field="reasonKey"]', 'synthetic.choice.reason-one@v1'],
  ];
  for (const [selector, value] of exactValues) await expect(page.locator(selector)).toHaveValue(value);
  await expect(page.locator('#fd-curator-presentation [data-curator-field="elementKeys"]'))
    .toHaveValues(['synthetic.choice.presentation-element-one@v1']);
  await expect(page.locator('#fd-curator-attendance [data-curator-field="eventInstanceIds"]'))
    .toHaveValues(['local:schedule:1']);
  expect(await page.locator('[data-curator-row-editor]').evaluateAll((rows) => rows.map((row) => [
    row.getAttribute('data-curator-row-editor'), row.getAttribute('data-instance-id'),
  ]))).toEqual([
    ['accessItems', 'local:access:1'], ['contacts', 'local:contact:1'],
    ['checklistItems', 'local:checklist:1'], ['schedule', 'local:schedule:1'],
    ['resources', 'local:resource:1'],
  ]);
}

async function reduceToOneCanonicalPlacement(page) {
  await stepButton(page, 3).click();
  while (await page.locator('[data-curator-path-remove]').count() > 1) {
    const remove = page.locator('[data-curator-path-remove]').last();
    await expect(remove).toBeAttached();
    await remove.click();
  }
  await stepButton(page, 2).click();
  const reason = page.locator('[data-curator-path-reason]').first();
  await reason.selectOption(ROTATION_EDITION_KEYS.reason);
  await expect(page.locator('[data-curator-path-reason]').first()).toHaveValue(ROTATION_EDITION_KEYS.reason);
}

async function applyCompactLocalPlan(page) {
  await stepButton(page, 4).click();
  let arrival = page.locator('#fd-curator-arrival');
  await arrival.locator('[data-curator-field="checkInRoleKey"]').selectOption(ROTATION_EDITION_KEYS.role);
  await arrival.locator('[data-curator-field="placeKey"]').selectOption(ROTATION_EDITION_KEYS.place);
  await arrival.locator('[data-curator-field="linkKey"]').selectOption(ROTATION_EDITION_KEYS.arrivalLink);
  await arrival.locator('[data-curator-field="timingCode"]').selectOption('by');
  await arrival.locator('[data-curator-field="time"]').fill('07:45');
  await arrival.locator('[data-curator-local-action="arrival"]').click();
  arrival = page.locator('#fd-curator-arrival');
  await expect(arrival.locator('[data-curator-field="placeKey"]')).toHaveValue(ROTATION_EDITION_KEYS.place);

  let resources = page.locator('#fd-curator-resources');
  await resources.locator('[data-curator-field="linkKey"]').selectOption(ROTATION_EDITION_KEYS.resourceLink);
  await resources.locator('[data-curator-field="priority"]').selectOption('recommended');
  await resources.locator('[data-curator-field="week"]').fill('1');
  await resources.locator('[data-curator-field="reasonKey"]').selectOption(ROTATION_EDITION_KEYS.reason);
  await resources.locator('[data-curator-local-action="resource"]').click();
  resources = page.locator('#fd-curator-resources');
  await expect(resources.locator('[data-curator-row-editor="resources"]')).toHaveCount(1);
  await expect(resources).toContainText('Students will see');
}

async function applyFullLocalPlan(page) {
  await stepButton(page, 4).click();
  await page.locator('[data-curator-local-preset]').selectOption(ROTATION_EDITION_KEYS.fullPreset);
  for (const category of [
    'arrival', 'accessItems', 'contacts', 'checklistItems', 'schedule', 'rounds',
    'presentation', 'documentation', 'attendance', 'feedback', 'resources',
  ]) {
    const card = page.locator(`#fd-curator-${category}`);
    await expect(card).toContainText('Students will see');
    await expect(card).not.toContainText('Nothing from this category');
  }
  await expect(page.locator('[data-curator-row-editor="schedule"]')).toHaveCount(1);
  await expect(page.locator('[data-curator-row-editor="resources"]')).toHaveCount(1);
}

async function captureCuratorPathEvidence(page) {
  await stepButton(page, 3).click();
  return page.locator('.fd-curator-week').evaluateAll((weeks) => weeks.flatMap((weekNode) => {
    const week = Number(weekNode.querySelector(':scope > h3').textContent.replace('Week ', ''));
    return Array.from(weekNode.querySelectorAll(':scope > .fd-curator-schedule-row')).map((row, index) => ({
      instanceId: row.querySelector('[data-curator-path-move-order]').getAttribute('data-curator-path-move-order'),
      title: row.querySelector(':scope > span').textContent,
      week,
      order: index + 1,
    }));
  }));
}

async function captureBothPreviews(page) {
  await stepButton(page, 4).click();
  let review = page.getByRole('button', { name: 'Review desktop preview' });
  await review.focus();
  await review.press('Enter');
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toContainText('Reviewed');
  const desktop = page.locator('[data-curator-preview-layout="desktop"]');
  await expect(desktop).toBeFocused();
  const evidence = await desktop.evaluate((node) => ({
    contentDigest: node.getAttribute('data-curator-content-digest'),
    referenceSetDigest: node.getAttribute('data-curator-reference-digest'),
    fingerprint: node.getAttribute('data-curator-fingerprint'),
    coreRevision: node.getAttribute('data-curator-core-revision'),
    catalogRevision: node.getAttribute('data-curator-catalog-revision'),
    rendererRevision: node.getAttribute('data-curator-renderer-revision'),
    text: node.textContent,
    title: node.querySelector('h3')?.textContent || '',
    sections: Array.from(node.querySelectorAll('section')).map((section) => ({
      heading: section.querySelector('h4')?.textContent || '',
      rows: Array.from(section.querySelectorAll('p')).map((row) => row.textContent),
    })),
  }));

  review = page.getByRole('button', { name: 'Review 390 px mobile preview' });
  await review.focus();
  await review.press('Enter');
  await expect(page.locator('[data-curator-preview-status="mobile"]')).toContainText('Reviewed');
  const mobile = page.locator('[data-curator-preview-layout="mobile-390"]');
  await expect(mobile).toBeFocused();
  await expect(mobile).toHaveCSS('width', '390px');
  const mobileEvidence = await mobile.evaluate((node) => ({
    contentDigest: node.getAttribute('data-curator-content-digest'),
    referenceSetDigest: node.getAttribute('data-curator-reference-digest'),
    fingerprint: node.getAttribute('data-curator-fingerprint'),
    coreRevision: node.getAttribute('data-curator-core-revision'),
    catalogRevision: node.getAttribute('data-curator-catalog-revision'),
    rendererRevision: node.getAttribute('data-curator-renderer-revision'),
  }));
  expect(mobileEvidence).toEqual({
    contentDigest: evidence.contentDigest,
    referenceSetDigest: evidence.referenceSetDigest,
    fingerprint: evidence.fingerprint,
    coreRevision: evidence.coreRevision,
    catalogRevision: evidence.catalogRevision,
    rendererRevision: evidence.rendererRevision,
  });
  return evidence;
}

async function affirmAndGenerate(page) {
  await stepButton(page, 5).click();
  let panel = page.locator('[data-curator-step-panel="5"]');
  await expect(panel.locator('[data-curator-derived-affirmation="previewsReviewed"]')).toContainText('Reviewed');
  for (const name of ['publicSafe', 'officialLinks', 'forwardable']) {
    panel = page.locator('[data-curator-step-panel="5"]');
    const checkbox = panel.getByRole('checkbox', { name: ROTATION_EDITION_AFFIRMATIONS[name], exact: true });
    await checkbox.focus();
    await checkbox.press('Space');
    await expect(page.locator(`[data-curator-affirmation="${name}"]`)).toBeChecked();
  }
  const generate = page.locator('#curatorGenerate');
  await expect(generate).toBeEnabled();
  await generate.focus();
  await generate.press('Enter');
  panel = page.locator('[data-curator-step-panel="5"]');
  await expect(panel.locator('[data-curator-share-status]')).toContainText('Edition link generated');
  const link = await panel.locator('[data-curator-share-link]').getAttribute('href');
  const decoded = decodeRotationEditionLink(link);
  const qr = await page.evaluate((value) => fdCuratorQrSvg(value), link);
  const curatorCard = await panel.locator('[data-curator-edition-card]').evaluate((node) => ({
    title: node.querySelector('h3')?.textContent || '',
    facts: Object.fromEntries(Array.from(node.querySelectorAll(':scope > dl > div')).map((row) => [
      row.querySelector('dt')?.textContent || '', row.querySelector('dd')?.textContent || '',
    ])),
    provenance: Array.from(node.querySelectorAll('[data-curator-provenance-row]')).map((row) => ({
      kind: row.querySelector('[data-curator-provenance-kind]')?.textContent || '',
      label: row.querySelector('[data-curator-provenance-label]')?.textContent || '',
      verifiedOn: row.querySelector('[data-curator-provenance-verified-on]')?.textContent || '',
    })),
  }));
  const publicationFacts = await panel.evaluate((node) => ({
    changeSummary: node.querySelector('[data-curator-change-summary]')?.textContent || '',
    createdCore: node.querySelector('[data-curator-created-core-revision]')?.textContent || '',
    currentCore: node.querySelector('[data-curator-current-core-revision]')?.textContent || '',
    createdCatalog: node.querySelector('[data-curator-created-catalog-revision]')?.textContent || '',
    currentCatalog: node.querySelector('[data-curator-current-catalog-revision]')?.textContent || '',
    referenceDigest: node.querySelector('[data-curator-reference-digest]')?.textContent || '',
    rendererRevision: node.querySelector('[data-curator-renderer-revision]')?.textContent || '',
  }));
  return {
    link,
    ...decoded,
    fingerprint: await panel.locator('[data-curator-fingerprint]').textContent(),
    qr, curatorCard, publicationFacts,
  };
}

async function buildCuratorArtifact(page, mode = 'compact', routeOptions = {}) {
  const routeLedger = await installRotationEditionRoute(page, routeOptions);
  const response = await page.goto(ROTATION_CURATOR_PATH);
  await selectSyntheticContext(page);
  await reduceToOneCanonicalPlacement(page);
  if (mode === 'compact') await applyCompactLocalPlan(page);
  else await applyFullLocalPlan(page);
  const pathEvidence = await captureCuratorPathEvidence(page);
  const preview = await captureBothPreviews(page);
  const artifact = await affirmAndGenerate(page);
  return {
    ...artifact,
    preview,
    pathEvidence,
    routeLedger,
    projection: routeLedger.at(-1).projection,
    responseHeaders: await response.allHeaders(),
    responseStatus: response.status(),
    responseStatusText: response.statusText(),
  };
}

async function buildSecondCompactArtifact(page, projection) {
  await stepButton(page, 1).click();
  await page.locator('#curatorRotationEnd').fill('2026-10-13');
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toHaveCount(0);
  const pathEvidence = await captureCuratorPathEvidence(page);
  const preview = await captureBothPreviews(page);
  const artifact = await affirmAndGenerate(page);
  return { ...artifact, preview, pathEvidence, projection };
}

async function installStorageAndListenerProbe(page, audience = '', faultKind = '') {
  const keys = audience ? rotationEditionStorageKeys(audience) : { edition: '', local: '' };
  await page.addInitScript(({ editionKeys, requestedFault }) => {
    const originalSet = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    const originalRemove = Storage.prototype.removeItem;
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalOff = EventTarget.prototype.removeEventListener;
    const logKey = '__task8_storage_operations';
    let operations = [];
    try { operations = JSON.parse(originalGet.call(sessionStorage, logKey) || '[]'); } catch { operations = []; }
    const persistOperations = () => originalSet.call(sessionStorage, logKey, JSON.stringify(operations));
    const recordStorage = (row) => { operations.push(row); persistOperations(); };
    const startupListeners = [];
    const targetLabel = (target) => target === window ? 'window'
      : (target === document ? 'document' : (target instanceof Element && target.id === 'fdApp' ? 'fdApp' : ''));
    const startupType = (label, type) => (
      (label === 'window' && ['resize', 'keydown', 'popstate', 'message'].includes(type))
      || (label === 'document' && type === 'click')
      || (label === 'fdApp' && ['click', 'input'].includes(type))
    );
    Storage.prototype.setItem = function task8Set(key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage) recordStorage(['set', String(key), String(value)]);
      return result;
    };
    Storage.prototype.removeItem = function task8Remove(key) {
      const result = originalRemove.call(this, key);
      if (this === localStorage) recordStorage(['remove', String(key), null]);
      return result;
    };
    EventTarget.prototype.addEventListener = function task8Add(type, listener, options) {
      const label = targetLabel(this);
      if (!startupType(label, type)) return originalAdd.call(this, type, listener, options);
      const capture = options === true || Boolean(options && options.capture);
      const wrapped = function task8OwnedStartupListener(...args) { return listener.apply(this, args); };
      startupListeners.push({ target: this, label, type, listener, wrapped, capture, active: true });
      return originalAdd.call(this, type, wrapped, options);
    };
    EventTarget.prototype.removeEventListener = function task8Off(type, listener, options) {
      const capture = options === true || Boolean(options && options.capture);
      for (let index = startupListeners.length - 1; index >= 0; index -= 1) {
        const row = startupListeners[index];
        if (row.active && row.target === this && row.type === type
          && row.listener === listener && row.capture === capture) {
          row.active = false;
          return originalOff.call(this, type, row.wrapped, options);
        }
      }
      return originalOff.call(this, type, listener, options);
    };
    window.__task8StorageOperations = operations;
    window.__task8ResetStorageOperations = () => {
      operations.length = 0;
      persistOperations();
    };
    window.__task8OwnedStartupListeners = () => startupListeners
      .filter(({ active }) => active).map(({ label, type }) => `${label}:${type}`);
    const selectedFault = new URLSearchParams(location.search).get('task8-fault');
    if (!requestedFault || selectedFault !== requestedFault) return;
    if (requestedFault === 'quota' || requestedFault === 'storage-register-then-throw') {
      const probedSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function task8FallibleStorage(key, value) {
        if ([editionKeys.local, editionKeys.edition].includes(String(key))) {
          if (requestedFault === 'storage-register-then-throw') probedSet.call(this, key, value);
          if (requestedFault === 'quota') {
            throw new DOMException('private synthetic storage failure', 'QuotaExceededError');
          }
          throw new Error('private synthetic storage failure');
        }
        return probedSet.call(this, key, value);
      };
    }
    if (requestedFault === 'history') {
      const originalHistory = History.prototype.replaceState;
      History.prototype.replaceState = function task8HostileHistory(...args) {
        if (location.hash) throw new Error('private synthetic history failure');
        return originalHistory.apply(this, args);
      };
    }
    if (requestedFault === 'listener') {
      const probedAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function task8HostileListener(type, listener, options) {
        if (this instanceof Element && this.id === 'fdApp' && type === 'input') {
          probedAdd.call(this, type, listener, options);
          throw new Error('private synthetic listener failure');
        }
        return probedAdd.call(this, type, listener, options);
      };
    }
    if (requestedFault === 'dialog') {
      const originalShowModal = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function task8HostileDialog(...args) {
        throw new Error('private synthetic dialog failure');
      };
    }
  }, { editionKeys: keys, requestedFault: faultKind });
}

async function newLearnerPage(browser, baseURL, audience, routeOptions = {}, faultKind = '') {
  const context = await browser.newContext({ baseURL, viewport: DESKTOP });
  const page = await context.newPage();
  await installStorageAndListenerProbe(page, audience, faultKind);
  const runtimeFault = ['location', 'reload'].includes(faultKind) ? faultKind : '';
  const routeLedger = await installRotationEditionRoute(page, { ...routeOptions, runtimeFault });
  await seedRotationEditionLearner(page, audience);
  return { context, page, routeLedger };
}

async function storageSnapshot(page, audience) {
  const keys = rotationEditionStorageKeys(audience);
  return page.evaluate(({ edition, local, core }) => Object.fromEntries(
    [...new Set([...core, edition, local])].map((key) => [key, localStorage.getItem(key)]),
  ), { ...keys, core: TRACKED_CORE_KEYS });
}

async function renderedPublicSurface(page) {
  return page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script,style').forEach((node) => node.remove());
    const attributes = Array.from(clone.querySelectorAll('*')).flatMap((node) => (
      Array.from(node.attributes).map((attribute) => `${attribute.name}=${attribute.value}`)
    ));
    return `${clone.textContent}\n${attributes.join('\n')}`;
  });
}

async function seedRejectionSentinels(page) {
  await page.evaluate(() => {
    const manualItems = [{ id: 'manual:preserve', ref: 'clinical-reference.md', note: 'Preserve exact manual item.' }];
    const history = [{ at: '2026-08-19T12:00:00.000Z', action: 'saved', id: 'manual:preserve' }];
    const placement = {
      takenAt: '2026-08-19T12:00:00.000Z',
      answers: [{ id: 'synthetic-placement', cat: 'safety', correct: false }],
      byCat: { safety: { n: 1, correct: 0 } },
    };
    localStorage.setItem('cw_pretest_v1', JSON.stringify(placement));
    localStorage.setItem('cw_plan_v1', JSON.stringify({ manualItems, history }));
    const template = document.createElement('template');
    template.innerHTML = window.renderProgress();
    const plan = JSON.parse(localStorage.getItem('cw_plan_v1'));
    if (template.content.querySelector('#pgRoot h1')?.textContent !== 'Progress'
      || !template.content.querySelector('[data-pt="plan"]')
      || JSON.stringify(plan.manualItems) !== JSON.stringify(manualItems)
      || JSON.stringify(plan.history) !== JSON.stringify(history)) {
      throw new Error('public progress normalization failed');
    }
    localStorage.setItem('cw_qb_v1', '{"core":"question-bank"}');
    localStorage.setItem('cw_qbank_attest_v1', '{"core":"attestation"}');
    localStorage.setItem('cw_rotation_local_progress_v1', '{"v1":"local-progress"}');
    localStorage.setItem('cw_rotation_edition_v1', 'PRESERVE-ROTATION-EDITION-V1');
    localStorage.setItem('cw_curator_draft_v1', 'PRESERVE-CURATOR-DRAFT-V1');
    localStorage.setItem('rp_resident_state_v1', '{"resident":"state"}');
    localStorage.setItem('cw_rotation_edition_ms3_v1', 'PRESERVE-MS3-V1');
    localStorage.setItem('rp_rotation_edition_resident_v1', 'PRESERVE-RES-V1');
    window.__task8ResetStorageOperations();
  });
}

function encodedEnvelopeLink(origin, envelope) {
  const backup = rotationEditionCanonical(envelope);
  return `${origin}/#edition=${Buffer.from(backup, 'utf8').toString('base64url')}`;
}

function contrastRatio(foreground, background) {
  const channels = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
  const luminance = (value) => {
    const converted = channels(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * converted[0] + 0.7152 * converted[1] + 0.0722 * converted[2];
  };
  const left = luminance(foreground);
  const right = luminance(background);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

async function renderedContrast(page, selector) {
  const colors = await page.locator(selector).first().evaluate((node) => {
    let backgroundNode = node;
    let background = getComputedStyle(backgroundNode).backgroundColor;
    while (backgroundNode.parentElement && /rgba?\([^)]*,\s*0\s*\)$/.test(background)) {
      backgroundNode = backgroundNode.parentElement;
      background = getComputedStyle(backgroundNode).backgroundColor;
    }
    return { foreground: getComputedStyle(node).color, background };
  });
  return contrastRatio(colors.foreground, colors.background);
}

async function downloadText(page) {
  const event = page.waitForEvent('download');
  await page.locator('[data-curator-download]').click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function expectBuiltProductionLock(page, response, audience) {
  const rawHtml = await response.text();
  const catalog = replaceRotationEditionCatalog(rawHtml, {}).originalProjection;
  const records = await page.evaluate(() => ({
    html: document.documentElement.innerHTML,
    v2: [
      localStorage.getItem('cw_rotation_edition_ms3_v2'),
      localStorage.getItem('cw_rotation_local_progress_ms3_v2'),
      localStorage.getItem('rp_rotation_edition_resident_v2'),
      localStorage.getItem('rp_rotation_local_progress_resident_v2'),
    ],
  }));
  expect(catalog.audience).toBe(audience);
  expect(catalog).toMatchObject({
    audience,
    rotationEditionV2: 'disabled',
    selectionKeys: [],
    resolutionRecords: [],
    blockedKeys: [],
  });
  expect(records.v2).toEqual([null, null, null, null]);
  expect(rawHtml).not.toContain('synthetic.');
  expect(records.html).not.toContain('synthetic.');
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-edition-card,.fd-edition-local,.fd-edition-error')).toHaveCount(0);
}

async function assertArtifactReceipt(page, artifact, { qr }) {
  const panel = page.locator('[data-curator-step-panel="5"]');
  await expect(panel.locator('[data-curator-share-link]')).toHaveAttribute('href', artifact.link);
  await expect(panel.locator('[data-curator-fingerprint]')).toContainText(artifact.preview.fingerprint);
  await expect(panel.locator('[data-curator-created-core-revision]')).toHaveText(artifact.preview.coreRevision);
  await expect(panel.locator('[data-curator-current-core-revision]')).toHaveText(artifact.preview.coreRevision);
  await expect(panel.locator('[data-curator-created-catalog-revision]')).toHaveText(artifact.preview.catalogRevision);
  await expect(panel.locator('[data-curator-current-catalog-revision]')).toHaveText(artifact.preview.catalogRevision);
  await expect(panel.locator('[data-curator-reference-digest]')).toHaveText(artifact.preview.referenceSetDigest);
  await expect(panel.locator('[data-curator-renderer-revision]')).toHaveText(artifact.preview.rendererRevision);
  await expect(panel.locator('[data-curator-copy]')).toBeVisible();
  await page.context().grantPermissions(
    ['clipboard-read', 'clipboard-write'],
    { origin: new URL(artifact.link).origin },
  );
  await panel.locator('[data-curator-copy]').click();
  await expect(panel.locator('[data-curator-share-status]')).toHaveText('Edition link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(artifact.link);
  expect(await downloadText(page)).toBe(artifact.backupJson);
  if (qr) {
    expect(artifact.qr).toMatchObject({ ok: true, code: 'QR_READY' });
    await expect(panel.locator('[data-curator-qr] svg')).toBeVisible();
    await expect(panel.locator('[data-curator-qr] title')).toHaveText('Rotation edition link QR code');
    expect(await panel.locator('[data-curator-qr] rect').count()).toBeGreaterThan(20);
    const qrBinding = await page.evaluate((link) => {
      const expected = fdCuratorQrSvg(link);
      const template = document.createElement('template');
      template.innerHTML = expected.svg;
      const expectedNode = template.content.firstElementChild;
      const rendered = document.querySelector('[data-curator-qr] svg');
      const matrix = (node) => Array.from(node.querySelectorAll('g rect'))
        .map((rect) => ['x', 'y', 'width', 'height'].map((name) => rect.getAttribute(name)).join(':'));
      return {
        code: expected.code,
        expected: expectedNode.outerHTML,
        rendered: rendered.outerHTML,
        expectedMatrix: matrix(expectedNode),
        renderedMatrix: matrix(rendered),
      };
    }, artifact.link);
    expect(qrBinding.code).toBe('QR_READY');
    expect(qrBinding.rendered).toBe(qrBinding.expected);
    expect(qrBinding.renderedMatrix).toEqual(qrBinding.expectedMatrix);
  } else {
    expect(artifact.qr).toEqual({ ok: false, code: 'QR_TOO_LONG' });
    await expect(panel.locator('[data-curator-qr]')).toHaveCount(0);
  }
}

async function keyboardActivate(locator, key = 'Enter') {
  await locator.focus();
  await locator.press(key);
}

async function gotoFreshEditionDocument(page, link) {
  const target = new URL(link);
  expect(target.hash.startsWith('#edition=')).toBe(true);
  const interim = new URL('/404.html', target.origin);
  interim.searchParams.set('task8-fresh', String(Date.now()));
  await page.goto(interim.href);
  return page.goto(target.href);
}

async function setCanonicalLearnerWeek(page, week) {
  await keyboardActivate(page.locator('.fd-tab[data-fd-tab="path"]'));
  await keyboardActivate(page.locator(`.fd-timeline__row[data-fd-view-week="${week}"]`));
  const setWeek = page.locator(`[data-fd-setweek="${week}"]`);
  if (await setWeek.count()) await keyboardActivate(setWeek);
  await keyboardActivate(page.locator('.fd-tab[data-fd-tab="today"]'));
  await expect(page.locator('.fd-today__sub')).toContainText(`Week ${week}`);
}

async function exerciseLearnerSurfaces(page, artifact, audience) {
  const config = artifact.envelope.config;
  const weekMaximum = audience === 'ms3' ? 6 : 4;
  const expectedPathId = audience === 'ms3' ? 'ms3-six-week' : 'resident-four-week';
  const localWeeks = [];
  const collectLocalWeeks = (value) => {
    if (Array.isArray(value)) {
      for (const row of value) collectLocalWeeks(row);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, row] of Object.entries(value)) {
      if (key === 'week') localWeeks.push(row);
      else collectLocalWeeks(row);
    }
  };
  collectLocalWeeks(config.localPlan);
  expect(config.audience).toBe(audience);
  expect(config.pathId).toBe(expectedPathId);
  expect(config.pathItems.length).toBeGreaterThan(0);
  for (const week of config.pathItems.map((item) => item.week)) {
    expect(Number.isInteger(week)).toBe(true);
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(weekMaximum);
  }
  expect(localWeeks.length).toBeGreaterThan(0);
  for (const week of localWeeks) {
    expect(Number.isInteger(week)).toBe(true);
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(weekMaximum);
  }
  const activateTab = async (name) => {
    const control = page.locator(`.fd-tab[data-fd-tab="${name.toLowerCase()}"]`);
    await keyboardActivate(control);
    await expect(page.locator(`.fd-tab[data-fd-tab="${name.toLowerCase()}"]`))
      .toHaveAttribute('aria-current', 'page');
  };
  const placement = config.pathItems[0];
  const placementEvidence = artifact.pathEvidence.find((row) => row.instanceId === placement.instanceId);
  expect(placementEvidence).toMatchObject({ week: placement.week, order: placement.order });
  expect(placementEvidence.title.length).toBeGreaterThan(0);
  const expectedPriority = {
    required: 'Required by this local rotation',
    recommended: 'Recommended by this local rotation',
    optional: 'Optional for this local rotation',
  }[placement.priority];
  const reasonRecord = artifact.projection.resolutionRecords
    .find(({ key }) => key === placement.reasonKey);
  expect(reasonRecord?.fragment).toBeTruthy();
  const expectedReason = `Local rotation reason: ${reasonRecord.fragment}`;

  await activateTab('Path');
  await keyboardActivate(page.locator(`.fd-timeline__row[data-fd-view-week="${placement.week}"]`));
  const setPlacementWeek = page.locator(`[data-fd-setweek="${placement.week}"]`);
  if (await setPlacementWeek.count()) await keyboardActivate(setPlacementWeek);
  await activateTab('Today');
  await expect(page.locator('.fd-today')).toBeVisible();
  const savedViewWeek = await page.evaluate(() => (
    JSON.parse(localStorage.getItem('cw_frontdoor_v1')).viewWeek
  ));
  expect(savedViewWeek).toBe(placement.week);
  await expect(page.locator('.fd-today__sub')).toContainText(`Week ${placement.week}`);
  const todayRows = await page.locator('.fd-today .fd-list .fd-row').evaluateAll((rows) => rows.map((row) => ({
    ref: row.querySelector('[data-fd-open]')?.getAttribute('data-fd-open') || '',
    title: row.querySelector('.fd-row__title')?.textContent || '',
    authority: Array.from(row.querySelectorAll('.fd-row__edition > span')).map((node) => node.textContent),
  })));
  expect(todayRows[placement.order - 1]).toEqual({
    ref: placement.ref,
    title: placementEvidence.title,
    authority: [
      'Reviewed clerkship Library', expectedPriority,
      expectedReason,
    ],
  });
  expect(todayRows.map(({ ref }) => ref)).toEqual(
    config.pathItems.filter((item) => item.week === placement.week)
      .sort((left, right) => left.order - right.order).map((item) => item.ref),
  );

  await activateTab('Path');
  await expect(page.locator('.fd-path')).toBeVisible();
  await expect(page.locator('.fd-path__h1')).toHaveText(
    audience === 'ms3' ? 'Your 6-week path' : 'Your 4-week path',
  );
  await keyboardActivate(page.locator(`.fd-timeline__row[data-fd-view-week="${placement.week}"]`));
  const placementRow = page.locator(`.fd-detail [data-fd-open="${placement.ref}"]`);
  await expect(placementRow).toBeVisible();
  expect(await placementRow.locator('.fd-row__edition > span').allTextContents()).toEqual([
    'Reviewed clerkship Library', expectedPriority,
    expectedReason,
  ]);

  await activateTab('Library');
  await expect(page.locator('.fd-library')).toBeVisible();
  const libraryItems = await page.locator('.fd-library .fd-collink[data-fd-open]').evaluateAll((links) => (
    links.map((link) => ({
      ref: link.getAttribute('data-fd-open'),
      title: link.querySelector('.fd-collink__label')?.textContent || '',
    }))
  ));
  const pathRefs = artifact.envelope.config.pathItems.map((item) => item.ref);
  const library = {
    count: libraryItems.length,
    omitted: libraryItems.find((item) => item.ref.endsWith('.md') && !pathRefs.includes(item.ref)),
  };
  expect(library.omitted).toBeTruthy();
  await expect(page.locator('.fd-library__count')).toContainText(`${library.count} pages`);
  const omitted = page.locator(`.fd-collink[data-fd-open="${library.omitted.ref}"]`);
  await expect(omitted.locator('.fd-collink__label')).toHaveText(library.omitted.title);
  await keyboardActivate(omitted);
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe(library.omitted.ref);
  // The reader shell -- real <h1>, "Loading..." body -- is painted synchronously on activation, so
  // the route and the heading are both satisfied while content/<ref> is still in flight. When that
  // fetch lands it calls announceRoute(), which moves focus to #content; landing between
  // locator.focus() and locator.press()'s key dispatch, that steals the next Enter from the tab
  // button (it goes to <main>) and the tab silently never switches. Mount and the focus move are
  // one task, so once the placeholder is gone the focus move is guaranteed to be behind us.
  await expect(page.locator('.fd-reader .loading')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: library.omitted.title, exact: true }).first()).toBeVisible();

  await activateTab('Library');
  await expect(page.locator(`.fd-collink[data-fd-open="${library.omitted.ref}"]`)).toBeVisible();
  await activateTab('Today');
  await expect(page.locator('.fd-today')).toBeVisible();
}

async function expectLearnerEdition(page, artifact, audience, { full = false, surfaces = true } = {}) {
  const keys = rotationEditionStorageKeys(audience);
  await expect(page.locator('.fd-edition-error')).toHaveCount(0);
  const card = page.locator('.fd-edition-card');
  const local = page.locator('.fd-edition-local');
  await expect(card).toBeVisible();
  await expect(local).toBeVisible();
  expect(await page.locator('#governanceMount > div').evaluate((container) => (
    Array.from(container.children).map((child) => child.className)
  ))).toEqual(['fd-edition-card', 'fd-edition-local']);
  await expect(card).toBeFocused();
  await expect(card.getByRole('heading', { name: artifact.preview.title, exact: true })).toBeVisible();
  expect(artifact.curatorCard.title).toBe(artifact.preview.title);
  const facts = artifact.curatorCard.facts;
  const cardSnapshot = await card.evaluate((node) => ({
    directParagraphs: Array.from(node.querySelectorAll(':scope > section > p')).map((row) => row.textContent),
    headings: Array.from(node.querySelectorAll(':scope > section > h2, :scope > section > h3'))
      .map((row) => row.textContent),
    provenance: Array.from(node.querySelectorAll(':scope > section > ul > li')).map((row) => row.textContent),
  }));
  expect(cardSnapshot.headings).toEqual([
    artifact.preview.title,
    'Edition checked on — self-attested by the curator',
    'Catalog verification — repository-reviewed record dates',
  ]);
  expect(cardSnapshot.directParagraphs).toEqual([
    'Local rotation guidance',
    `${facts['Training location']} · Edition ${facts.Edition} · ${artifact.preview.fingerprint}`,
    `Curated by ${facts['Curator profile']}`,
    `${audience === 'ms3' ? 'MS3' : 'Resident'} · ${facts.Duration} · ${facts['Rotation dates']}`,
    facts['Checked on'].split(' · ')[0],
    `Created against core revision ${artifact.publicationFacts.createdCore}`,
    `Current core revision ${artifact.publicationFacts.currentCore}`,
    `Created against catalog revision ${artifact.publicationFacts.createdCatalog}`,
    `Current catalog revision ${artifact.publicationFacts.currentCatalog}`,
    artifact.publicationFacts.changeSummary,
    'Locally supplied edition summary; change lineage is not authenticated.',
    'Curator identity and institutional endorsement are not digitally verified by this link.',
    'Compare this fingerprint with the curator. Matching codes confirm the same edition content, not identity or institutional approval.',
    'Rotation edition ready.',
  ]);
  expect(cardSnapshot.provenance).toEqual(artifact.curatorCard.provenance.map(
    (row) => `${row.label} — ${row.verifiedOn}`,
  ));
  expect(artifact.publicationFacts.referenceDigest).toBe(artifact.preview.referenceSetDigest);
  expect(artifact.publicationFacts.rendererRevision).toBe(artifact.preview.rendererRevision);
  await expect(card.locator('[role="status"][aria-live="polite"]')).toHaveText('Rotation edition ready.');
  for (const label of ROTATION_EDITION_AUTHORITY) {
    await expect(page.locator('#fdApp')).toContainText(label);
  }
  const headings = await local.locator('.fd-edition-section > h2').allTextContents();
  expect(headings).toEqual(ROTATION_EDITION_ORDER);
  const learnerSections = await local.locator('.fd-edition-section').evaluateAll((sections) => sections.map(
    (section) => ({
      heading: section.querySelector(':scope > h2')?.textContent || '',
      rows: Array.from(section.querySelectorAll(':scope > .fd-edition-local__item')).map((item) => (
        Array.from(item.children).find((child) => (
          child.tagName === 'P' && !child.classList.contains('fd-edition-authority')
        ))?.textContent || ''
      )),
    }),
  ));
  expect(learnerSections).toEqual(artifact.preview.sections.map((section) => ({
    heading: section.heading,
    rows: section.rows.filter((value) => value !== 'None selected.'),
  })));
  await expect(local.getByText('example.invalid', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), keys.edition)).toBe(artifact.backupJson);
  expect(new URL(page.url()).hash).toBe('');
  if (surfaces) await exerciseLearnerSurfaces(page, artifact, audience);
  if (full) {
    const categories = [
      'arrival', 'accessItems', 'contacts', 'checklistItems', 'schedule', 'rounds',
      'presentation', 'documentation', 'attendance', 'feedback', 'resources',
    ];
    expect(Object.keys(artifact.envelope.config.localPlan).sort()).toEqual(categories.slice().sort());
    expect(learnerSections.map((section) => [section.heading, section.rows.length])).toEqual([
      ['First day at the location', 1], ['Before you arrive', 1], ['Who to contact', 1],
      ["Today's checklist", 3], ['Typical day', 2], ['Team workflow', 3],
      ['Attendance and feedback', 2], ['Official resources', 1],
    ]);
    const categorySlots = [
      ['arrival', 'First day at the location', 0],
      ['accessItems', 'Before you arrive', 0],
      ['contacts', 'Who to contact', 0],
      ['checklistItems', "Today's checklist", 2],
      ['rounds', 'Team workflow', 0],
      ['presentation', 'Team workflow', 1],
      ['documentation', 'Team workflow', 2],
      ['attendance', 'Attendance and feedback', 0],
      ['feedback', 'Attendance and feedback', 1],
      ['resources', 'Official resources', 0],
    ];
    for (const [category, heading, rowIndex] of categorySlots) {
      expect(artifact.envelope.config.localPlan).toHaveProperty(category);
      const section = learnerSections.find((candidate) => candidate.heading === heading);
      expect(section.rows[rowIndex]).toBe(
        artifact.preview.sections.find((candidate) => candidate.heading === heading).rows[rowIndex],
      );
    }
    expect(artifact.envelope.config.localPlan).toHaveProperty('schedule');
    expect(learnerSections.find((section) => section.heading === 'Typical day').rows).toEqual(
      artifact.preview.sections.find((section) => section.heading === 'Typical day').rows,
    );
    for (const heading of ROTATION_EDITION_ORDER) {
      const section = local.locator('.fd-edition-section', { has: page.getByRole('heading', { name: heading, exact: true }) });
      await expect(section.locator('.fd-edition-local__item')).not.toHaveCount(0);
    }
  }
  return { card, local, keys };
}

async function toggleLearnerLocalState(page, artifact, audience, kinds = ['resources']) {
  const local = page.locator('.fd-edition-local');
  const keys = rotationEditionStorageKeys(audience);
  await expect(local).toBeVisible();
  for (const kind of kinds) {
    const toggle = local.locator(`[data-fd-local-toggle="${kind}"]`).first();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveCSS('min-height', '44px');
    await toggle.focus();
    await toggle.press('Enter');
    await expect(local.locator(`[data-fd-local-toggle="${kind}"]`).first()).toHaveAttribute('aria-pressed', 'true');
  }
  const saved = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), keys.local));
  for (const kind of kinds) {
    expect(Object.keys(saved.byFingerprint[artifact.preview.fingerprint][kind])).toHaveLength(1);
  }
  return saved;
}

test('pilot protocol remains explicitly human-gated and complete', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'nav-ms3', 'one checked-in protocol is shared by both audiences');
  expect(existsSync(PILOT_PROTOCOL), 'the Task 8 pilot protocol must exist before GREEN').toBe(true);
  const protocol = readFileSync(PILOT_PROTOCOL, 'utf8');
  expect(protocol.split(/\r?\n/, 1)[0]).toBe('DRAFT — HUMAN REVIEW AND APPROVAL REQUIRED');
  const bullets = protocol.split(/\r?\n/).filter((line) => line.startsWith('- ')).map((line) => line.slice(2));
  for (const required of [
    'Confirm no v1 link was externally shared.',
    'Review every real catalog name, role, location, place, phrase, official URL/hostname, audience scope, and `verifiedOn`.',
    'Run both production-disabled and synthetic-enabled gates.',
    'Obtain faculty/institutional privacy and clinical review.',
    'Test synthetic details before any real proposal.',
    'Conduct sessions with two attendings from different training settings.',
    'Include at least one MS3 edition and one resident edition.',
    'Include four trainees total with both audiences represented.',
    'Test mobile first-day comprehension.',
    'Test the local/core distinction.',
    'Test fingerprint matching.',
    'Test long-link/QR behavior.',
    'Test corrupt-link recovery.',
    'Record findings without PHI.',
    'Stop release while any P0 or P1 pilot finding remains open.',
    'Require separate approval for real catalog content, gate enablement, merge, and deployment.',
  ]) expect(bullets).toContain(required);
  expect(protocol).not.toMatch(/(?:already|has been) approved/i);
  const affirmativeApprovalPatterns = [
    /\b(?:was|were|is|are|has been|have been|had been|already)\s+approved\b/i,
    /\bapproved\s+by\b/i,
    /\b(?:faculty|institution(?:al)?|clinical reviewer|privacy reviewer|human reviewer|attending)\b[^\n.;]{0,80}\bapproved\b/i,
    /\b(?:approval|sign[- ]?off)\b[^\n.;]{0,60}\b(?:obtained|received|granted|completed|complete|confirmed|given|secured)\b/i,
    /\b(?:obtained|received|granted|completed|confirmed|gave|secured)\b[^\n.;]{0,60}\b(?:approval|sign[- ]?off)\b/i,
  ];
  for (const pattern of affirmativeApprovalPatterns) expect(protocol).not.toMatch(pattern);
  const approvalLines = protocol.split(/\r?\n|[;,.]|\s+—\s+|\bbut\b|\bhowever\b/i)
    .filter((line) => /\bapprov(?:al|e|ed|ing)\b/i.test(line));
  const requirementOrDenial = /(?:\b(?:require(?:d|s|ment)?|must|need(?:ed|s)?|pending|awaiting|before|unless|until|without|not|never|no|cannot|can't|do not|may not)\b[^\n]{0,100}\bapprov(?:al|e|ed|ing)\b|\bapprov(?:al|e|ed|ing)\b[^\n]{0,100}\b(?:require(?:d|s|ment)?|must|need(?:ed|s)?|pending|awaiting|not|never|no)\b)/i;
  expect(
    approvalLines.filter((line) => !requirementOrDenial.test(line)),
    'the draft may require or deny approval but must never claim that a human approved it',
  ).toEqual([]);
});

test('route fulfillment replaces one exact assignment value and no surrounding byte', async () => {
  const projection = buildRotationEditionProjection('ms3', `sha256-${'A'.repeat(43)}`);
  const original = {
    schemaVersion: 1, audience: 'ms3', revision: `sha256-${'B'.repeat(43)}`,
    projectionDigest: `sha256-${'C'.repeat(43)}`, rotationEditionV2: 'disabled',
    selectionKeys: [], resolutionRecords: [], blockedKeys: [],
    parserProbe: { text: 'quoted "} brace, escaped slash \\ and nested { text' },
  };
  const prefix = '<!doctype html><script>var before={nested:{quote:"} still text"}};';
  const suffix = ';var after="escaped \\\" }";</script><main>unchanged</main>';
  const html = `${prefix}var FD_ROTATION_EDITION_CATALOG=${JSON.stringify(original)}${suffix}`;
  const replaced = replaceRotationEditionCatalog(html, projection);
  expect(replaced.prefix).toBe(`${prefix}var FD_ROTATION_EDITION_CATALOG=`);
  expect(replaced.suffix).toBe(suffix);
  expect(replaced.originalProjection).toEqual(original);
  expect(replaced.body.slice(0, replaced.prefix.length)).toBe(replaced.prefix);
  expect(replaced.body.slice(replaced.prefix.length + replaced.replacement.length)).toBe(replaced.suffix);
  expect(() => replaceRotationEditionCatalog(html.replace('FD_ROTATION_EDITION_CATALOG', 'NO_CATALOG'), projection))
    .toThrow('expected one catalog assignment, found 0');
  expect(() => replaceRotationEditionCatalog(`${html}${html}`, projection))
    .toThrow('expected one catalog assignment, found 2');
  expect(() => replaceRotationEditionCatalog(
    `${prefix}var FD_ROTATION_EDITION_CATALOG={"unterminated":{"text":"}"}`, projection,
  )).toThrow('catalog assignment object is unterminated');
  expect(() => replaceRotationEditionCatalog(
    `${prefix}var FD_ROTATION_EDITION_CATALOG=${JSON.stringify(original)}<main>missing semicolon</main>`, projection,
  )).toThrow('catalog assignment semicolon is missing');

  const locationTarget = 'fdEditionInputs=fdEditionRuntimeInputs(window,fdDocument,fdApp,fdEditionMount,fdCatalogSnapshot,FD_SITE_CONTEXT);';
  const reloadTarget = "fdEditionBootLocation,fdEditionInputs.hashCleared,fdRecoverCommittedEdition))throw new Error('edition mount');";
  const runtimeHtml = `<script>${locationTarget}${reloadTarget}</script>`;
  const locationFault = replaceRotationEditionRuntimeFault(runtimeHtml, 'location');
  expect(locationFault).toMatchObject({ fault: 'location', count: 1 });
  expect(locationFault.prefix + locationFault.suffix).toBe(runtimeHtml.replace(locationTarget, ''));
  expect(locationFault.body).toContain('__task8BoundaryFaultInvocations');
  expect(locationFault.body).toContain(reloadTarget);
  const reloadFault = replaceRotationEditionRuntimeFault(runtimeHtml, 'reload');
  expect(reloadFault).toMatchObject({ fault: 'reload', count: 1 });
  expect(reloadFault.prefix + reloadFault.suffix).toBe(runtimeHtml.replace(reloadTarget, ''));
  expect(reloadFault.body).toContain('__task8BoundaryFaultInvocations');
  expect(reloadFault.body).toContain(locationTarget);
  expect(() => replaceRotationEditionRuntimeFault(`${runtimeHtml}${locationTarget}`, 'location'))
    .toThrow('expected one location runtime fault target, found 2');
  expect(() => replaceRotationEditionRuntimeFault('<main>missing</main>', 'reload'))
    .toThrow('expected one reload runtime fault target, found 0');
  expect(() => replaceRotationEditionRuntimeFault(runtimeHtml, 'unknown'))
    .toThrow('unsupported runtime fault: unknown');
});

test('checked-in learner and curator builds stay empty, disabled, and synthetic-free', async ({ page }, testInfo) => {
  const audience = rotationEditionAudience(testInfo.project.name);
  await seedRotationEditionLearner(page, audience);
  const learnerResponse = await page.goto('/');
  await expectBuiltProductionLock(page, learnerResponse, audience);
  const curatorResponse = await page.goto(ROTATION_CURATOR_PATH);
  const curatorHtml = await curatorResponse.text();
  const production = {
    catalog: replaceRotationEditionCatalog(curatorHtml, {}).originalProjection,
    text: await page.locator('body').innerText(),
  };
  expect(production.catalog).toMatchObject({
    audience, rotationEditionV2: 'disabled', selectionKeys: [], resolutionRecords: [], blockedKeys: [],
  });
  expect(production.text).not.toContain('Synthetic');
  await expect(page.getByText(
    'Publication governance is disabled for this build; Generate remains unavailable.',
    { exact: true },
  )).toBeVisible();
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
});

test('compact curator artifact yields an exact QR handoff to a fresh learner', async ({ page, browser, baseURL }, testInfo) => {
  test.slow();
  const audience = rotationEditionAudience(testInfo.project.name);
  const artifact = await buildCuratorArtifact(page, 'compact');
  expect(artifact.link.length).toBeLessThanOrEqual(1800);
  expect(artifact.link.length).toBeGreaterThan(0);
  expect(artifact.url.origin).toBe(new URL(baseURL).origin);
  expect(artifact.url.pathname).toBe('/');
  expect(rotationEditionCanonical(artifact.envelope)).toBe(artifact.backupJson);
  expect(artifact.routeLedger).toHaveLength(1);
  expect(artifact.routeLedger[0].pathname).toBe(ROTATION_CURATOR_PATH);
  expect(artifact.routeLedger[0].original).toMatchObject({
    audience, rotationEditionV2: 'disabled', selectionKeys: [], resolutionRecords: [], blockedKeys: [],
  });
  expect(artifact.routeLedger[0].csp).toBe(artifact.responseHeaders['content-security-policy'] || '');
  expect(artifact.responseStatus).toBe(artifact.routeLedger[0].status);
  expect(artifact.responseStatusText).toBe(artifact.routeLedger[0].statusText);
  for (const [name, value] of Object.entries(artifact.routeLedger[0].headers)) {
    if (name !== 'content-length') expect(artifact.responseHeaders[name]).toBe(value);
  }
  if (artifact.responseHeaders['content-length']) {
    expect(Number(artifact.responseHeaders['content-length'])).toBe(artifact.routeLedger[0].replacementBytes);
  }
  await assertArtifactReceipt(page, artifact, { qr: true });

  const learner = await newLearnerPage(browser, baseURL, audience);
  try {
    await gotoFreshEditionDocument(learner.page, artifact.link);
    await expectLearnerEdition(learner.page, artifact, audience);
    await toggleLearnerLocalState(learner.page, artifact, audience);
    expect(learner.routeLedger.map((row) => row.pathname)).toEqual(['/']);
    expect(learner.routeLedger.every((row) => row.original.rotationEditionV2 === 'disabled')).toBe(true);
  } finally {
    await learner.context.close();
  }
});

test('full-group artifact remains a usable exact learner link when QR capacity is exceeded', async ({ page, browser, baseURL }, testInfo) => {
  test.slow();
  const audience = rotationEditionAudience(testInfo.project.name);
  const artifact = await buildCuratorArtifact(page, 'full');
  expect(artifact.link.length).toBeGreaterThanOrEqual(1801);
  expect(artifact.link.length).toBeLessThanOrEqual(16000);
  await assertArtifactReceipt(page, artifact, { qr: false });
  expect(rotationEditionCanonical(artifact.envelope)).toBe(artifact.backupJson);

  const learner = await newLearnerPage(browser, baseURL, audience);
  try {
    await gotoFreshEditionDocument(learner.page, artifact.link);
    await expectLearnerEdition(learner.page, artifact, audience, { full: true });
    await toggleLearnerLocalState(learner.page, artifact, audience, ['checklist', 'resources']);
    expect(learner.routeLedger.map((row) => row.pathname)).toEqual(['/']);
  } finally {
    await learner.context.close();
  }
});

test('switching to a second compact edition preserves core/manual history and scopes local state', async ({ page, browser, baseURL }, testInfo) => {
  test.slow();
  const audience = rotationEditionAudience(testInfo.project.name);
  const first = await buildCuratorArtifact(page, 'compact');
  const second = await buildSecondCompactArtifact(page, first.projection);
  expect(first.link.length).toBeLessThanOrEqual(1800);
  expect(second.link.length).toBeLessThanOrEqual(1800);
  expect(first.preview.fingerprint).not.toBe(second.preview.fingerprint);
  expect(first.envelope.config.editionNumber).toBe(1);
  expect(second.envelope.config.editionNumber).toBe(2);

  const learner = await newLearnerPage(browser, baseURL, audience);
  try {
    await gotoFreshEditionDocument(learner.page, first.link);
    await expectLearnerEdition(learner.page, first, audience);
    const priorLocal = await toggleLearnerLocalState(learner.page, first, audience);
    const sentinels = await learner.page.evaluate(() => {
      const manualItems = [{ id: 'manual:preserve', ref: 'clinical-reference.md', note: 'Preserve exact manual item.' }];
      const history = [{ at: '2026-08-19T12:00:00.000Z', action: 'saved', id: 'manual:preserve' }];
      const placement = JSON.stringify({
        takenAt: '2026-08-19T12:00:00.000Z',
        answers: [{ id: 'synthetic-placement', cat: 'safety', correct: false }],
        byCat: { safety: { n: 1, correct: 0 } },
      });
      localStorage.setItem('cw_pretest_v1', placement);
      localStorage.setItem('cw_plan_v1', JSON.stringify({ manualItems, history }));
      const template = document.createElement('template');
      template.innerHTML = window.renderProgress();
      const plan = JSON.parse(localStorage.getItem('cw_plan_v1'));
      if (template.content.querySelector('#pgRoot h1')?.textContent !== 'Progress'
        || !template.content.querySelector('[data-pt="plan"]')
        || JSON.stringify(plan.manualItems) !== JSON.stringify(manualItems)
        || JSON.stringify(plan.history) !== JSON.stringify(history)) {
        throw new Error('public progress normalization failed');
      }
      return {
        progress: '{"synthetic-core":{"done":true},"manual-history":{"done":true}}',
        plan: JSON.stringify(plan),
        placement,
        unrelated: 'PRESERVE-UNRELATED',
        protected: {
          cw_rotation_edition_v1: 'PRESERVE-ROTATION-EDITION-V1',
          cw_rotation_local_progress_v1: '{"v1":"local-progress"}',
          cw_curator_draft_v1: 'PRESERVE-CURATOR-DRAFT-V1',
          cw_qb_v1: '{"core":"question-bank"}',
          cw_qbank_attest_v1: '{"core":"attestation"}',
          rp_resident_state_v1: '{"resident":"state"}',
          cw_rotation_edition_ms3_v1: 'PRESERVE-MS3-V1',
          rp_rotation_edition_resident_v1: 'PRESERVE-RES-V1',
        },
      };
    });
    await learner.page.evaluate((values) => {
      localStorage.setItem('cw_progress_v1', values.progress);
      localStorage.setItem('cw_plan_v1', values.plan);
      localStorage.setItem('cw_pretest_v1', values.placement);
      localStorage.setItem('cw_unrelated_v1', values.unrelated);
      for (const [key, value] of Object.entries(values.protected)) localStorage.setItem(key, value);
    }, sentinels);
    const beforeProtected = await storageSnapshot(learner.page, audience);
    await learner.page.evaluate(() => { window.__task8ResetStorageOperations(); });

    await gotoFreshEditionDocument(learner.page, second.link);
    const dialog = learner.page.locator('dialog.fd-edition-switch');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep current edition' })).toBeFocused();
    await expect(dialog).toContainText(first.preview.fingerprint);
    await expect(dialog).toContainText(second.preview.fingerprint);
    const accept = dialog.getByRole('button', { name: 'Switch edition' });
    await accept.focus();
    await accept.press('Enter');
    const activeCard = learner.page.locator('.fd-edition-card');
    await expect(activeCard).toContainText(second.preview.fingerprint);
    await expect(activeCard).toBeFocused();
    await learner.page.evaluate(() => {
      const template = document.createElement('template');
      template.innerHTML = window.renderProgress();
      if (template.content.querySelector('#pgRoot h1')?.textContent !== 'Progress'
        || !template.content.querySelector('[data-pt="plan"]')) {
        throw new Error('public progress normalization failed after switch');
      }
    });
    const keys = rotationEditionStorageKeys(audience);
    const after = await learner.page.evaluate(({ keys }) => ({
      progress: localStorage.getItem('cw_progress_v1'),
      plan: localStorage.getItem('cw_plan_v1'),
      placement: localStorage.getItem('cw_pretest_v1'),
      unrelated: localStorage.getItem('cw_unrelated_v1'),
      edition: localStorage.getItem(keys.edition),
      local: JSON.parse(localStorage.getItem(keys.local)),
      operations: window.__task8StorageOperations,
    }), { keys });
    const afterProtected = await storageSnapshot(learner.page, audience);
    expect(after.progress).toBe(sentinels.progress);
    expect(after.placement).toBe(sentinels.placement);
    const stablePlan = (value) => {
      const plan = JSON.parse(value);
      delete plan.generatedAt;
      return plan;
    };
    const beforePlan = stablePlan(sentinels.plan);
    expect(beforePlan).toMatchObject({
      pathId: first.envelope.config.pathId,
      editionFingerprint: first.preview.fingerprint,
    });
    expect(stablePlan(after.plan)).toEqual({
      ...beforePlan,
      editionFingerprint: second.preview.fingerprint,
    });
    expect(after.unrelated).toBe(sentinels.unrelated);
    expect(after.edition).toBe(second.backupJson);
    expect(after.local.byFingerprint[first.preview.fingerprint]).toEqual(
      priorLocal.byFingerprint[first.preview.fingerprint],
    );
    expect(after.local.byFingerprint[second.preview.fingerprint]).toEqual({ checklist: {}, resources: {} });
    expect(after.operations.filter(([, key]) => [keys.edition, keys.local].includes(key)).map(([op, key]) => [op, key]))
      .toEqual([['set', keys.local], ['set', keys.edition]]);
    for (const [key, value] of Object.entries(beforeProtected)) {
      if (![keys.edition, keys.local, 'cw_plan_v1'].includes(key)) expect(afterProtected[key]).toBe(value);
    }
    await expectLearnerEdition(learner.page, second, audience);
    const afterSecondToggle = await toggleLearnerLocalState(learner.page, second, audience);
    expect(rotationEditionCanonical(afterSecondToggle.byFingerprint[first.preview.fingerprint])).toBe(
      rotationEditionCanonical(priorLocal.byFingerprint[first.preview.fingerprint]),
    );
    expect(Object.keys(afterSecondToggle.byFingerprint[second.preview.fingerprint].resources)).toHaveLength(1);
    expect(learner.routeLedger.map((row) => row.pathname)).toEqual(['/', '/', '/']);
  } finally {
    await learner.context.close();
  }
});

async function coreRenderSignature(page) {
  return page.evaluate(() => ({
    tabs: Array.from(document.querySelectorAll('.fd-tabs button')).map((node) => node.textContent.trim()),
    todayHeading: document.querySelector('.fd-today h1')?.textContent || '',
    todayRows: document.querySelectorAll('.fd-today .fd-row').length,
    appReady: !document.querySelector('#fdApp')?.hasAttribute('inert')
      && !document.querySelector('#fdApp')?.hasAttribute('aria-busy'),
    dom: (() => {
      const app = document.getElementById('fdApp').cloneNode(true);
      app.querySelector('#governanceMount')?.replaceChildren();
      app.querySelector('#routeStatus')?.replaceChildren();
      return app.outerHTML;
    })(),
  }));
}

function rejectedFragmentSecrets(link) {
  const marker = '#edition=';
  const hash = new URL(link).hash;
  if (!hash.startsWith(marker)) return [];
  const payload = hash.slice(marker.length);
  const secrets = [payload];
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    if (decoded) secrets.push(decoded);
  } catch { /* malformed fragments still retain the raw payload secret */ }
  return secrets;
}

async function assertRejectedLearnerCase(browser, baseURL, audience, options) {
  const learner = await newLearnerPage(
    browser, baseURL, audience, options.routeOptions || {}, options.faultKind || '',
  );
  const consoleMessages = [];
  const nativeDialogs = [];
  const pageErrors = [];
  learner.page.on('console', (message) => consoleMessages.push(message.text()));
  learner.page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  learner.page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await learner.page.goto('/');
    await expect(learner.page.locator('.fd-today')).toBeVisible();
    await seedRejectionSentinels(learner.page);
    if (options.setup) await options.setup(learner.page);
    const before = await storageSnapshot(learner.page, audience);
    const beforeCore = await coreRenderSignature(learner.page);
    const beforeListeners = await learner.page.evaluate(() => window.__task8OwnedStartupListeners());
    const beforeAlerts = await learner.page.locator('[role="alert"]').allTextContents();
    const consoleOffset = consoleMessages.length;
    await learner.page.evaluate(() => { window.__task8ResetStorageOperations(); });

    const rejectionResponse = await gotoFreshEditionDocument(learner.page, options.link);
    if (options.expectedFaultMarker) {
      await expect.poll(() => learner.page.evaluate((marker) => (
        (window.__task8BoundaryFaultInvocations || []).filter((value) => value === marker).length
      ), options.expectedFaultMarker)).toBe(1);
      expect(learner.routeLedger.every((row) => (
        row.runtimeFault === options.expectedFaultMarker && row.runtimeFaultCount === 1
      ))).toBe(true);
      const deliveredHeaders = await rejectionResponse.allHeaders();
      expect(Number(deliveredHeaders['content-length']))
        .toBe(learner.routeLedger.at(-1).replacementBytes);
    }
    await expect(learner.page.locator('.fd-today')).toBeVisible();
    const error = learner.page.locator('.fd-edition-error[role="alert"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText(FIXED_ERROR_TEXT);
    await expect(error).toContainText(options.code);
    await expect(learner.page.locator('.fd-edition-card,.fd-edition-local,dialog.fd-edition-switch')).toHaveCount(0);
    expect(await coreRenderSignature(learner.page)).toEqual(beforeCore);
    expect(await storageSnapshot(learner.page, audience)).toEqual(before);
    const v2Keys = [
      'cw_rotation_edition_ms3_v2', 'cw_rotation_local_progress_ms3_v2',
      'rp_rotation_edition_resident_v2', 'rp_rotation_local_progress_resident_v2',
    ];
    const writes = await learner.page.evaluate((keys) => window.__task8StorageOperations
      .filter(([, key]) => keys.includes(key)), v2Keys);
    if (options.allowRolledBackWrites) expect(writes.length).toBeGreaterThan(0);
    else expect(writes).toEqual([]);
    const expectedListeners = options.listenerMode === 'none' ? [] : beforeListeners;
    expect(await learner.page.evaluate(() => window.__task8OwnedStartupListeners())).toEqual(expectedListeners);
    if (options.listenerMode === 'none') {
      const beforeProbeEvents = {
        storage: await storageSnapshot(learner.page, audience),
        core: await coreRenderSignature(learner.page),
      };
      await learner.page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.dispatchEvent(new MessageEvent('message', { data: 'task8-probe' }));
        document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.getElementById('fdApp')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.getElementById('fdApp')?.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      expect(await storageSnapshot(learner.page, audience)).toEqual(beforeProbeEvents.storage);
      expect(await coreRenderSignature(learner.page)).toEqual(beforeProbeEvents.core);
      expect(await learner.page.evaluate(() => window.__task8OwnedStartupListeners())).toEqual([]);
    }
    const afterAlerts = await learner.page.locator('[role="alert"]').allTextContents();
    expect(afterAlerts.filter((text) => !text.includes(FIXED_ERROR_TEXT)))
      .toEqual(beforeAlerts.filter((text) => !text.includes(FIXED_ERROR_TEXT)));
    expect(afterAlerts.filter((text) => text.includes(FIXED_ERROR_TEXT))).toHaveLength(1);
    expect(afterAlerts.find((text) => text.includes(FIXED_ERROR_TEXT))).toContain(options.code);
    await expect(error).toHaveAttribute('tabindex', '-1');
    await expect(error).toBeFocused();
    const exposed = [
      await renderedPublicSurface(learner.page),
      ...consoleMessages.slice(consoleOffset), ...nativeDialogs, ...pageErrors,
    ].join('\n');
    const routedProjection = learner.routeLedger.at(-1)?.projection;
    const localValue = before[rotationEditionStorageKeys(audience).local];
    const secrets = [...new Set([
      ...(options.secrets || []),
      ...rejectedFragmentSecrets(options.link),
      localValue,
      routedProjection ? rotationEditionCanonical(routedProjection) : '',
      routedProjection?.projectionDigest || '',
    ].filter((value) => typeof value === 'string' && value.length > 0))];
    for (const secret of secrets) expect(exposed).not.toContain(secret);
    expect(nativeDialogs).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(learner.routeLedger.map((row) => row.pathname)).toEqual(['/', '/']);
    return { ledger: learner.routeLedger, before, writes };
  } finally {
    await learner.context.close();
  }
}

test('projection faults fail closed one at a time without writes, echo, or listener residue', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(240_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  const artifact = await buildCuratorArtifact(page, 'compact');
  const wrongAudience = audience === 'ms3' ? 'resident' : 'ms3';
  const cases = [
    {
      name: 'disabled gate', code: 'EDITION_DISABLED', routeOptions: { gate: 'disabled' },
    },
    {
      name: 'wrong projection audience', code: 'EDITION_CATALOG_UNAVAILABLE',
      routeOptions: { mutateProjection: (projection) => { projection.audience = wrongAudience; } },
    },
    {
      name: 'tampered projection digest', code: 'EDITION_CATALOG_UNAVAILABLE',
      secrets: [ALTERED_DIGEST],
      routeOptions: {
        resealProjection: false,
        mutateProjection: (projection) => { projection.projectionDigest = ALTERED_DIGEST; },
      },
    },
    {
      name: 'tampered record digest', code: 'EDITION_CATALOG_UNAVAILABLE',
      secrets: [ALTERED_DIGEST],
      routeOptions: {
        mutateProjection: (projection) => {
          projection.resolutionRecords[0].contentDigest = ALTERED_DIGEST;
        },
      },
    },
  ];
  for (const fault of cases) {
    await test.step(fault.name, async () => {
      const result = await assertRejectedLearnerCase(browser, baseURL, audience, {
        link: artifact.link, code: fault.code, secrets: fault.secrets, routeOptions: fault.routeOptions,
      });
      expect(result.ledger.every((row) => row.original.rotationEditionV2 === 'disabled')).toBe(true);
    });
  }
});

test('payload faults fail closed one at a time with canonical core and byte-identical storage', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(360_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  const artifact = await buildCuratorArtifact(page, 'compact');
  const digestFault = structuredClone(artifact.envelope);
  digestFault.digest = ALTERED_DIGEST;
  const v1 = {
    format: 'cw-rotation-edition', schemaVersion: 1,
    config: { privateLegacy: 'V1_PAYLOAD_SECRET' }, digest: `sha256-${'A'.repeat(43)}`,
  };
  const rawLegacySecret = 'RAW_LEGACY_PUBLIC_FIELD_SECRET';
  const oversizeSecret = 'OVERSIZE_URL_SECRET';
  const oversizedLocalFingerprint = `OVRSEED-${audience === 'ms3' ? 'MS3' : 'RES'}-S3CR3T`;
  const zeroCoreId = `core:${artifact.envelope.config.pathItems[0].ref}:0`;
  const cases = [
    {
      name: 'tampered edition digest', code: 'EDITION_INVALID',
      link: encodedEnvelopeLink(new URL(baseURL).origin, digestFault),
      secrets: [ALTERED_DIGEST],
    },
    {
      name: 'unknown reviewed key', code: 'EDITION_RESELECTION_REQUIRED',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.phraseSetKey = 'unknown.payload.key@v1';
      }), secrets: ['unknown.payload.key@v1'],
    },
    {
      name: 'wrong audience payload', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.audience = audience === 'ms3' ? 'resident' : 'ms3';
        envelope.config.pathId = audience === 'ms3' ? 'resident-four-week' : 'ms3-six-week';
      }), secrets: [],
    },
    {
      name: 'PHI-like path identifier', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.pathItems[0].instanceId = 'patient:synthetic-person-record';
      }), secrets: ['patient:synthetic-person-record'],
    },
    {
      name: 'core identifier/ref mismatch', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.pathItems[0].instanceId = 'core:synthetic-other-ref:7';
      }), secrets: ['core:synthetic-other-ref:7'],
    },
    {
      name: 'core zero identifier', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.pathItems[0].instanceId = zeroCoreId;
      }), secrets: [zeroCoreId],
    },
    {
      name: 'wrong local row category', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.resources[0].instanceId = 'local:contact:7';
      }), secrets: ['local:contact:7'],
    },
    {
      name: 'leading-zero resource identifier', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.resources[0].instanceId = 'local:resource:01';
      }), secrets: ['local:resource:01'],
    },
    {
      name: 'negative resource identifier', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.resources[0].instanceId = 'local:resource:-1';
      }), secrets: ['local:resource:-1'],
    },
    {
      name: 'text resource identifier', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.resources[0].instanceId = 'local:resource:text';
      }), secrets: ['local:resource:text'],
    },
    {
      name: 'generated identifier forged into public resource row', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.resources[0].instanceId = 'local:generated:arrival';
      }), secrets: ['local:generated:arrival'],
    },
    {
      name: 'generated access identifier forged into public resource row', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.resources[0].instanceId = 'local:generated:access:local:access:1';
      }), secrets: ['local:generated:access:local:access:1'],
    },
    {
      name: 'blocked key', code: 'EDITION_RESELECTION_REQUIRED',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.pathItems[0].reasonKey = ROTATION_EDITION_KEYS.blockedReason;
      }), secrets: [ROTATION_EDITION_KEYS.blockedReason],
    },
    {
      name: 'cross-location place', code: 'EDITION_RESELECTION_REQUIRED',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.arrival.placeKey = ROTATION_EDITION_KEYS.crossLocationPlace;
      }), secrets: [ROTATION_EDITION_KEYS.crossLocationPlace],
    },
    {
      name: 'cross-location link', code: 'EDITION_RESELECTION_REQUIRED',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.localPlan.arrival.linkKey = ROTATION_EDITION_KEYS.crossLocationLink;
      }), secrets: [ROTATION_EDITION_KEYS.crossLocationLink],
    },
    {
      name: 'raw legacy public field', code: 'EDITION_INVALID',
      link: mutateRotationEditionLink(artifact.link, (envelope) => {
        envelope.config.orientationDetails = rawLegacySecret;
      }), secrets: [rawLegacySecret],
    },
    {
      name: 'oversize URL', code: 'EDITION_INVALID',
      link: `${artifact.link}${oversizeSecret}${'A'.repeat(Math.max(1, 16001 - artifact.link.length))}`,
      secrets: [oversizeSecret],
    },
    {
      name: 'v1 payload', code: 'EDITION_PRERELEASE_UNSUPPORTED',
      link: encodedEnvelopeLink(new URL(baseURL).origin, v1), secrets: ['V1_PAYLOAD_SECRET'],
      listenerMode: 'none',
    },
    {
      name: 'oversize local document', code: 'EDITION_RUNTIME', link: artifact.link,
      setup: async (candidatePage) => {
        const key = rotationEditionStorageKeys(audience).local;
        await candidatePage.evaluate(({ storageKey, secretFingerprint }) => {
          const byFingerprint = { [secretFingerprint]: { checklist: {}, resources: {} } };
          for (let index = 0; index < 128; index += 1) {
            byFingerprint[`T${String(index).padStart(3, '0')}-MS3-ABCDEF`] = {
              checklist: {}, resources: {},
            };
          }
          localStorage.setItem(storageKey, JSON.stringify({ schemaVersion: 2, byFingerprint }));
          window.__task8ResetStorageOperations();
        }, { storageKey: key, secretFingerprint: oversizedLocalFingerprint });
      }, secrets: [oversizedLocalFingerprint],
    },
  ];
  for (const fault of cases) {
    await test.step(fault.name, async () => {
      expect(fault.name !== 'oversize URL' || fault.link.length > 16000).toBe(true);
      await assertRejectedLearnerCase(browser, baseURL, audience, fault);
    });
  }
});

async function importCuratorBackup(page, text, name = 'synthetic-rotation-edition.json') {
  await page.locator('[data-curator-import]').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8'),
  });
}

async function captureCuratorDraftSurface(page) {
  const steps = {};
  for (let step = 1; step <= 5; step += 1) {
    await keyboardActivate(stepButton(page, step));
    const panel = page.locator(`[data-curator-step-panel="${step}"]`);
    await expect(panel).toBeVisible();
    if (step === 5) await expect(page.locator('[data-curator-edition-card]')).toBeVisible();
    steps[step] = await panel.evaluate((node) => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll('[data-curator-import-status]').forEach((status) => { status.textContent = ''; });
      return {
        copy: clone.textContent.replace(/\s+/g, ' ').trim(),
        controls: Array.from(node.querySelectorAll('input,select')).map((control) => ({
          id: control.id || '',
          type: control.type || control.tagName.toLowerCase(),
          value: control.type === 'file' ? '' : control.value,
          checked: control.type === 'checkbox' ? control.checked : null,
          selected: control instanceof HTMLSelectElement
            ? Array.from(control.selectedOptions).map((option) => option.value) : [],
          instanceId: control.getAttribute('data-instance-id') || '',
          field: control.getAttribute('data-curator-field') || '',
        })),
        instances: Array.from(node.querySelectorAll('[data-instance-id]'))
          .map((row) => row.getAttribute('data-instance-id')),
      };
    });
  }
  return {
    steps,
    artifactHref: await page.locator('[data-curator-share-link]').count()
      ? await page.locator('[data-curator-share-link]').getAttribute('href') : null,
    receipts: await page.locator('[data-curator-receipt-status]').allTextContents(),
    affirmations: await page.locator('[data-curator-affirmation]').evaluateAll((nodes) => nodes.map((node) => ({
      name: node.getAttribute('data-curator-affirmation'), checked: node.checked,
    }))),
    editionCard: await page.locator('[data-curator-edition-card]').count()
      ? await page.locator('[data-curator-edition-card]').innerText() : null,
  };
}

test('builder rejects deprecated and oversize imports without echoing or partially applying them', async ({ page }, testInfo) => {
  test.slow();
  const audience = rotationEditionAudience(testInfo.project.name);
  await installStorageAndListenerProbe(page, audience);
  const artifact = await buildCuratorArtifact(page, 'compact');
  const deprecated = mutateRotationEditionLink(artifact.link, (envelope) => {
    envelope.config.pathItems[0].reasonKey = ROTATION_EDITION_KEYS.deprecatedReason;
  });
  const deprecatedBackup = decodeRotationEditionLink(deprecated).backupJson;
  const oversize = structuredClone(artifact.envelope);
  const seedPlacement = oversize.config.pathItems[0];
  const placementStem = seedPlacement.instanceId.replace(/:[1-9][0-9]*$/, '');
  oversize.config.pathItems = Array.from({ length: 96 }, (_, offset) => ({
    ...structuredClone(seedPlacement),
    instanceId: `${placementStem}:${offset + 1}`,
    week: 1,
    order: offset + 1,
  }));
  oversize.digest = rotationEditionDigest({
    format: oversize.format, schemaVersion: oversize.schemaVersion, config: oversize.config,
  });
  const oversizeBackup = rotationEditionCanonical(oversize);
  expect(Object.keys(oversize.config)).toEqual(Object.keys(artifact.envelope.config));
  expect(oversize.config).not.toHaveProperty('orientationDetails');
  expect(oversize.config.pathItems).toHaveLength(96);
  expect(oversize.config.pathItems.map((item) => item.order)).toEqual(
    Array.from({ length: 96 }, (_, index) => index + 1),
  );
  expect(Buffer.byteLength(rotationEditionCanonical(oversize.config), 'utf8')).toBeGreaterThan(12 * 1024);
  expect(Buffer.byteLength(oversizeBackup, 'utf8')).toBeLessThanOrEqual(64 * 1024);
  await keyboardActivate(stepButton(page, 1));
  await keyboardActivate(page.locator('[data-curator-save]'));
  await expect(page.locator('[data-curator-save-status]')).toHaveText('Saved on this device.');
  const draftKey = audience === 'resident' ? 'rp_curator_draft_resident_v2' : 'cw_curator_draft_ms3_v2';
  await keyboardActivate(stepButton(page, 5));
  const beforeSurface = await captureCuratorDraftSurface(page);
  const beforeStorage = await page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, localStorage.getItem(key)]),
  ), [...new Set([...CURATOR_KEYS, ...TRACKED_CORE_KEYS])]);
  expect(beforeStorage[draftKey]).not.toBeNull();
  const consoleMessages = [];
  const nativeDialogs = [];
  const pageErrors = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const fault of [
    {
      name: 'deprecated builder key', backup: deprecatedBackup,
      status: 'Backup uses catalog choices that must be reselected.',
      secrets: [ROTATION_EDITION_KEYS.deprecatedReason],
    },
    {
      name: 'oversize config', backup: oversizeBackup,
      status: 'Backup could not be validated for this audience.',
      secrets: [oversize.config.pathItems.at(-1).instanceId],
    },
  ]) {
    await test.step(fault.name, async () => {
      await keyboardActivate(stepButton(page, 1));
      await expect(page.locator('[data-curator-import]')).toBeVisible();
      const consoleOffset = consoleMessages.length;
      await page.evaluate(() => { window.__task8ResetStorageOperations(); });
      await importCuratorBackup(page, fault.backup, `${fault.name.replaceAll(' ', '-')}.json`);
      await expect(page.locator('[data-curator-import-status]')).toHaveText(fault.status);
      expect(await captureCuratorDraftSurface(page)).toEqual(beforeSurface);
      expect(await page.evaluate((keys) => Object.fromEntries(
        keys.map((key) => [key, localStorage.getItem(key)]),
      ), [...new Set([...CURATOR_KEYS, ...TRACKED_CORE_KEYS])])).toEqual(beforeStorage);
      expect(await page.evaluate(() => window.__task8StorageOperations)).toEqual([]);
      const exposed = [
        await renderedPublicSurface(page),
        ...consoleMessages.slice(consoleOffset), ...nativeDialogs, ...pageErrors,
      ].join('\n');
      expect(exposed).not.toContain(fault.backup);
      for (const secret of fault.secrets) expect(exposed).not.toContain(secret);
      expect(nativeDialogs).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
  expect(audience).toBe(artifact.envelope.config.audience);
});

test('a tampered saved preview reference receipt is discarded before publication', async ({ page }, testInfo) => {
  test.slow();
  const audience = rotationEditionAudience(testInfo.project.name);
  const consoleMessages = [];
  const nativeDialogs = [];
  const pageErrors = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installRotationEditionRoute(page);
  await page.goto(ROTATION_CURATOR_PATH);
  await selectSyntheticContext(page);
  await reduceToOneCanonicalPlacement(page);
  await applyCompactLocalPlan(page);
  await captureBothPreviews(page);
  await stepButton(page, 1).click();
  await page.locator('[data-curator-save]').click();
  await expect(page.locator('[data-curator-save-status]')).toHaveText('Saved on this device.');
  const curatorKey = audience === 'resident' ? 'rp_curator_draft_resident_v2' : 'cw_curator_draft_ms3_v2';
  const tampered = await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key));
    value.previewReceipts.desktop.referenceSetDigest = `sha256-${'Z'.repeat(43)}`;
    localStorage.setItem(key, JSON.stringify(value));
    return localStorage.getItem(key);
  }, curatorKey);
  expect(tampered).toContain(ALTERED_DIGEST);
  const channelOffsets = [consoleMessages.length, nativeDialogs.length, pageErrors.length];
  await page.reload();
  await stepButton(page, 5).click();
  await expect(page.locator('[data-curator-receipt-status="desktop"]')).toHaveText('Not reviewed');
  await expect(page.locator('[data-curator-receipt-status="mobile"]')).toHaveText('Reviewed');
  await expect(page.locator('[data-curator-derived-affirmation="previewsReviewed"]')).toContainText('Not reviewed');
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
  const exposed = [
    await renderedPublicSurface(page),
    ...consoleMessages.slice(channelOffsets[0]),
    ...nativeDialogs.slice(channelOffsets[1]),
    ...pageErrors.slice(channelOffsets[2]),
  ].join('\n');
  expect(exposed).not.toContain(ALTERED_DIGEST);
  expect(exposed).not.toContain(tampered);
  expect(nativeDialogs.slice(channelOffsets[1])).toEqual([]);
  expect(pageErrors.slice(channelOffsets[2])).toEqual([]);
});

test('stale preview and import completions cannot overwrite a newer curator edit', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  await installStorageAndListenerProbe(page, audience);
  const consoleMessages = [];
  const nativeDialogs = [];
  const pageErrors = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const artifact = await buildCuratorArtifact(page, 'compact');

  await page.goto(ROTATION_CURATOR_PATH);
  await selectSyntheticContext(page);
  await reduceToOneCanonicalPlacement(page);
  await applyCompactLocalPlan(page);
  await page.evaluate(() => {
    const original = SubtleCrypto.prototype.digest;
    let release;
    window.__task8DelayNextDigest = true;
    window.__task8ReleaseDigest = () => release?.();
    SubtleCrypto.prototype.digest = function task8DelayedDigest(...args) {
      if (!window.__task8DelayNextDigest) return original.apply(this, args);
      window.__task8DelayNextDigest = false;
      return new Promise((resolve, reject) => {
        const subtle = this;
        window.__task8DelayedDigestSettled = false;
        release = () => original.apply(subtle, args).then((value) => {
          window.__task8DelayedDigestSettled = true;
          resolve(value);
        }, reject);
      });
    };
  });
  const review = page.getByRole('button', { name: 'Review desktop preview' });
  await review.press('Enter');
  await stepButton(page, 1).click();
  await page.locator('#curatorRotationEnd').fill('2026-10-11');
  await page.locator('#curatorRotationEnd').press('Tab');
  await expect(page.locator('#curatorRotationEnd')).toHaveValue('2026-10-11');
  await stepButton(page, 4).click();
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toHaveText('Not reviewed');
  await expect(page.locator('[data-curator-preview-layout="desktop"]')).toHaveCount(0);
  const beforePreviewRelease = await captureCuratorDraftSurface(page);
  await page.evaluate(() => {
    window.__task8StalePreviewApplied = false;
    new MutationObserver(() => {
      const status = document.querySelector('[data-curator-preview-status="desktop"]');
      const receipt = document.querySelector('[data-curator-receipt-status="desktop"]');
      if (document.querySelector('[data-curator-preview-layout="desktop"]')
        || status?.textContent === 'Reviewed' || receipt?.textContent === 'Reviewed') {
        window.__task8StalePreviewApplied = true;
      }
    }).observe(document.getElementById('root'), { childList: true, subtree: true, characterData: true });
    window.__task8ReleaseDigest();
  });
  await expect.poll(() => page.evaluate(() => window.__task8DelayedDigestSettled)).toBe(true);
  expect(await page.evaluate(() => window.__task8StalePreviewApplied)).toBe(false);
  expect(await captureCuratorDraftSurface(page)).toEqual(beforePreviewRelease);
  await keyboardActivate(stepButton(page, 4));
  await expect(page.locator('[data-curator-preview-status="desktop"]')).toHaveText('Not reviewed');
  await expect(page.locator('[data-curator-preview-layout="desktop"]')).toHaveCount(0);

  await stepButton(page, 1).click();
  await selectSyntheticContext(page);
  await page.evaluate(() => {
    const original = Blob.prototype.text;
    let release;
    window.__task8ReleaseImport = () => release?.();
    Blob.prototype.text = function task8DelayedImport() {
      if (this instanceof File && this.name === 'stale-import.json') {
        return new Promise((resolve, reject) => {
          const blob = this;
          window.__task8DelayedImportSettled = false;
          release = () => original.call(blob).then((value) => {
            window.__task8DelayedImportSettled = true;
            resolve(value);
          }, reject);
        });
      }
      return original.call(this);
    };
  });
  const importConsoleOffset = consoleMessages.length;
  const importDialogOffset = nativeDialogs.length;
  const importErrorOffset = pageErrors.length;
  await page.evaluate(() => { window.__task8ResetStorageOperations(); });
  await importCuratorBackup(page, artifact.backupJson, 'stale-import.json');
  await page.locator('#curatorRotationEnd').fill('2026-10-10');
  await page.locator('#curatorRotationEnd').press('Tab');
  await expect(page.locator('#curatorRotationEnd')).toHaveValue('2026-10-10');
  const importStatusBeforeRelease = await page.locator('[data-curator-import-status]').textContent();
  const beforeRelease = await captureCuratorDraftSurface(page);
  const trackedKeys = [...new Set([...CURATOR_KEYS, ...TRACKED_CORE_KEYS])];
  const importStorageBeforeRelease = await page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, localStorage.getItem(key)]),
  ), trackedKeys);
  await page.evaluate(() => {
    window.__task8StaleImportApplied = false;
    new MutationObserver(() => {
      const status = document.querySelector('[data-curator-import-status]');
      if (status?.textContent === 'Validated v2 backup imported.'
        || document.getElementById('root')?.textContent.includes('October 12, 2026')) {
        window.__task8StaleImportApplied = true;
      }
    }).observe(document.getElementById('root'), { childList: true, subtree: true, characterData: true });
    window.__task8ReleaseImport();
  });
  await expect.poll(() => page.evaluate(() => window.__task8DelayedImportSettled)).toBe(true);
  expect(await page.evaluate(() => window.__task8StaleImportApplied)).toBe(false);
  expect(await captureCuratorDraftSurface(page)).toEqual(beforeRelease);
  await keyboardActivate(stepButton(page, 1));
  await expect(page.locator('#curatorRotationEnd')).toHaveValue('2026-10-10');
  await expect(page.locator('[data-curator-import-status]')).toHaveText(importStatusBeforeRelease);
  expect(await page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, localStorage.getItem(key)]),
  ), trackedKeys)).toEqual(importStorageBeforeRelease);
  expect(await page.evaluate(() => window.__task8StorageOperations)).toEqual([]);
  const importExposed = [
    await renderedPublicSurface(page),
    ...consoleMessages.slice(importConsoleOffset),
    ...nativeDialogs.slice(importDialogOffset),
    ...pageErrors.slice(importErrorOffset),
  ].join('\n');
  expect(importExposed).not.toContain(artifact.backupJson);
  expect(nativeDialogs.slice(importDialogOffset)).toEqual([]);
  expect(pageErrors.slice(importErrorOffset)).toEqual([]);
  expect(await renderedPublicSurface(page)).not.toContain(artifact.backupJson);
  expect(audience).toBe(artifact.envelope.config.audience);
});

test('quota, register-then-throw storage, listener, and history faults roll back to canonical core', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(300_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  const artifact = await buildCuratorArtifact(page, 'compact');
  for (const kind of ['quota', 'storage-register-then-throw', 'listener', 'history']) {
    await test.step(kind, async () => {
      const target = new URL(artifact.link);
      target.searchParams.set('task8-fault', kind);
      const result = await assertRejectedLearnerCase(browser, baseURL, audience, {
        link: target.href,
        code: 'EDITION_RUNTIME',
        faultKind: kind,
        listenerMode: 'none',
        allowRolledBackWrites: kind === 'storage-register-then-throw',
        secrets: ['private synthetic storage failure', 'private synthetic listener failure', 'private synthetic history failure'],
      });
      if (kind === 'storage-register-then-throw') {
        const keys = rotationEditionStorageKeys(audience);
        expect(result.writes.map(([operation, key]) => [operation, key])).toEqual([
          ['set', keys.local], ['remove', keys.local],
        ]);
      }
    });
  }
});

test('hostile dialog on a real switch preserves the active edition and leaves no startup listener', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  const first = await buildCuratorArtifact(page, 'compact');
  const second = await buildSecondCompactArtifact(page, first.projection);
  const learner = await newLearnerPage(browser, baseURL, audience, {}, 'dialog');
  const consoleMessages = [];
  const nativeDialogs = [];
  const pageErrors = [];
  learner.page.on('console', (message) => consoleMessages.push(message.text()));
  learner.page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  learner.page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await learner.page.goto('/');
    await expect(learner.page.locator('.fd-today')).toBeVisible();
    await setCanonicalLearnerWeek(learner.page, first.envelope.config.pathItems[0].week);
    const canonicalCore = await coreRenderSignature(learner.page);
    await gotoFreshEditionDocument(learner.page, first.link);
    await expectLearnerEdition(learner.page, first, audience);
    const before = await storageSnapshot(learner.page, audience);
    const activeCore = await coreRenderSignature(learner.page);
    const keys = rotationEditionStorageKeys(audience);
    expect(activeCore).not.toEqual(canonicalCore);
    expect(before[keys.edition]).toBe(first.backupJson);
    const channelOffsets = [consoleMessages.length, nativeDialogs.length, pageErrors.length];
    await learner.page.evaluate(() => { window.__task8ResetStorageOperations(); });
    const target = new URL(second.link);
    target.searchParams.set('task8-fault', 'dialog');
    await gotoFreshEditionDocument(learner.page, target.href);
    const error = learner.page.locator('.fd-edition-error[role="alert"]');
    await expect(error).toContainText('EDITION_RUNTIME');
    await expect(error).toHaveAttribute('tabindex', '-1');
    await expect(error).toBeFocused();
    await expect(learner.page.locator('dialog.fd-edition-switch,.fd-edition-card,.fd-edition-local')).toHaveCount(0);
    expect(await storageSnapshot(learner.page, audience)).toEqual(before);
    expect(await coreRenderSignature(learner.page)).toEqual(canonicalCore);
    expect(await learner.page.evaluate(() => window.__task8OwnedStartupListeners())).toEqual([]);
    expect(await learner.page.evaluate((v2Keys) => window.__task8StorageOperations.filter(
      ([, key]) => v2Keys.includes(key),
    ), Object.values(rotationEditionStorageKeys(audience)))).toEqual([]);
    await learner.page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.dispatchEvent(new MessageEvent('message', { data: 'task8-dialog-probe' }));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('fdApp')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('fdApp')?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    expect(await storageSnapshot(learner.page, audience)).toEqual(before);
    expect(await coreRenderSignature(learner.page)).toEqual(canonicalCore);
    expect(await learner.page.evaluate(() => window.__task8OwnedStartupListeners())).toEqual([]);
    const publicSurface = await renderedPublicSurface(learner.page);
    const exposed = [
      publicSurface,
      ...consoleMessages.slice(channelOffsets[0]),
      ...nativeDialogs.slice(channelOffsets[1]),
      ...pageErrors.slice(channelOffsets[2]),
    ].join('\n');
    expect(exposed).not.toContain('private synthetic dialog failure');
    expect(exposed).not.toContain(second.backupJson);
    expect(exposed).not.toContain(second.payload);
    expect(publicSurface).not.toContain(second.preview.fingerprint);
    expect(Object.values(before).join('\n')).not.toContain(second.preview.fingerprint);
    expect(nativeDialogs.slice(channelOffsets[1])).toEqual([]);
    expect(pageErrors.slice(channelOffsets[2])).toEqual([]);
    expect(learner.routeLedger.map((row) => row.pathname)).toEqual(['/', '/', '/']);
  } finally {
    await learner.context.close();
  }
});

test('real mounted runtime fails closed for hostile location and rolls back after hostile reload', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(300_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  const first = await buildCuratorArtifact(page, 'compact');
  const second = await buildSecondCompactArtifact(page, first.projection);
  const locationTarget = new URL(first.link);
  locationTarget.searchParams.set('task8-fault', 'location');
  await assertRejectedLearnerCase(browser, baseURL, audience, {
    link: locationTarget.href,
    code: 'EDITION_RUNTIME',
    faultKind: 'location',
    expectedFaultMarker: 'location',
    listenerMode: 'canonical',
    secrets: ['private synthetic location failure'],
  });

  const learner = await newLearnerPage(browser, baseURL, audience, {}, 'reload');
  const consoleMessages = [];
  const nativeDialogs = [];
  const pageErrors = [];
  learner.page.on('console', (message) => consoleMessages.push(message.text()));
  learner.page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
  learner.page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    await learner.page.goto('/');
    await expect(learner.page.locator('.fd-today')).toBeVisible();
    await setCanonicalLearnerWeek(learner.page, first.envelope.config.pathItems[0].week);
    const canonicalCore = await coreRenderSignature(learner.page);
    await gotoFreshEditionDocument(learner.page, first.link);
    await expectLearnerEdition(learner.page, first, audience);
    await toggleLearnerLocalState(learner.page, first, audience);
    await seedRejectionSentinels(learner.page);
    const before = await storageSnapshot(learner.page, audience);
    const activeCore = await coreRenderSignature(learner.page);
    const channelOffsets = [consoleMessages.length, nativeDialogs.length, pageErrors.length];
    const keys = rotationEditionStorageKeys(audience);
    expect(activeCore).not.toEqual(canonicalCore);
    expect(before[keys.edition]).toBe(first.backupJson);
    await learner.page.evaluate(() => { window.__task8ResetStorageOperations(); });
    const target = new URL(second.link);
    target.searchParams.set('task8-fault', 'reload');
    const reloadResponse = await gotoFreshEditionDocument(learner.page, target.href);
    await expect.poll(() => learner.page.evaluate(() => (
      (window.__task8BoundaryFaultInvocations || []).filter((value) => value === 'reload').length
    ))).toBe(0);
    const dialog = learner.page.locator('dialog.fd-edition-switch');
    await expect(dialog).toBeVisible();
    const switchListeners = await learner.page.evaluate(() => window.__task8OwnedStartupListeners());
    expect(switchListeners).toEqual([
      'fdApp:click', 'fdApp:input', 'window:keydown', 'window:popstate',
      'window:resize', 'document:click', 'fdApp:click', 'window:message',
    ]);
    await keyboardActivate(dialog.getByRole('button', { name: 'Switch edition' }));
    await expect.poll(() => learner.page.evaluate(() => (
      (window.__task8BoundaryFaultInvocations || []).filter((value) => value === 'reload').length
    ))).toBe(1);
    const deliveredHeaders = await reloadResponse.allHeaders();
    expect(Number(deliveredHeaders['content-length']))
      .toBe(learner.routeLedger.at(-1).replacementBytes);
    expect(learner.routeLedger.every((row) => row.runtimeFault === 'reload' && row.runtimeFaultCount === 1))
      .toBe(true);
    const error = learner.page.locator('.fd-edition-error[role="alert"]');
    await expect(error).toContainText('EDITION_RUNTIME');
    await expect(error).toHaveAttribute('tabindex', '-1');
    await expect(error).toBeFocused();
    await expect(learner.page.locator('.fd-edition-error[role="alert"]')).toHaveCount(1);
    await expect(learner.page.locator('dialog.fd-edition-switch,.fd-edition-card,.fd-edition-local')).toHaveCount(0);
    const after = await storageSnapshot(learner.page, audience);
    expect(after).toEqual(before);
    expect(await coreRenderSignature(learner.page)).toEqual(activeCore);
    expect(after[keys.local]).not.toContain(second.preview.fingerprint);
    const operations = await learner.page.evaluate((v2Keys) => window.__task8StorageOperations.filter(
      ([, key]) => v2Keys.includes(key),
    ), [keys.local, keys.edition]);
    expect(operations.map(([operation, key]) => [operation, key])).toEqual([
      ['set', keys.local], ['set', keys.edition], ['set', keys.edition], ['set', keys.local],
    ]);
    expect(JSON.parse(operations[0][2]).byFingerprint).toMatchObject({
      [first.preview.fingerprint]: JSON.parse(before[keys.local]).byFingerprint[first.preview.fingerprint],
      [second.preview.fingerprint]: { checklist: {}, resources: {} },
    });
    expect(operations[1][2]).toBe(second.backupJson);
    expect(operations[2][2]).toBe(first.backupJson);
    expect(operations[3][2]).toBe(before[keys.local]);
    expect(await learner.page.evaluate(() => window.__task8OwnedStartupListeners())).toEqual(switchListeners);
    await learner.page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      window.dispatchEvent(new MessageEvent('message', { data: 'task8-reload-probe' }));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('fdApp')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.getElementById('fdApp')?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    expect(await storageSnapshot(learner.page, audience)).toEqual(before);
    expect(await coreRenderSignature(learner.page)).toEqual(activeCore);
    expect(await learner.page.evaluate(() => window.__task8OwnedStartupListeners())).toEqual(switchListeners);
    const publicSurface = await renderedPublicSurface(learner.page);
    const exposed = [
      publicSurface,
      ...consoleMessages.slice(channelOffsets[0]),
      ...nativeDialogs.slice(channelOffsets[1]),
      ...pageErrors.slice(channelOffsets[2]),
    ].join('\n');
    expect(exposed).not.toContain('private synthetic location failure');
    expect(exposed).not.toContain('private synthetic reload failure');
    expect(exposed).not.toContain(second.backupJson);
    expect(exposed).not.toContain(second.payload);
    expect(publicSurface).not.toContain(second.preview.fingerprint);
    expect(Object.values(after).join('\n')).not.toContain(second.preview.fingerprint);
    expect(nativeDialogs.slice(channelOffsets[1])).toEqual([]);
    expect(pageErrors.slice(channelOffsets[2])).toEqual([]);
    expect(learner.routeLedger.map((row) => row.pathname)).toEqual(['/', '/', '/']);
  } finally {
    await learner.context.close();
  }
});

test('curator and learner meet the desktop/mobile, light/dark, keyboard accessibility matrix', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(420_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  const artifact = await buildCuratorArtifact(page, 'full');
  const corruptEnvelope = structuredClone(artifact.envelope);
  corruptEnvelope.digest = ALTERED_DIGEST;
  const corruptLink = encodedEnvelopeLink(new URL(baseURL).origin, corruptEnvelope);
  for (const [sizeName, viewport] of [['desktop', DESKTOP], ['phone-390', PHONE]]) {
    for (const colorScheme of ['light', 'dark']) {
      await test.step(`${sizeName} ${colorScheme} curator and learner`, async () => {
        const context = await browser.newContext({ baseURL, viewport, colorScheme });
        try {
          const curator = await context.newPage();
          await installRotationEditionRoute(curator);
          await curator.goto(ROTATION_CURATOR_PATH);
          expect(await curator.evaluate((theme) => matchMedia(`(prefers-color-scheme: ${theme})`).matches, colorScheme)).toBe(true);
          await keyboardSelectSyntheticContext(curator);
          let step = stepButton(curator, 2);
          await step.focus();
          await step.press('Enter');
          let repeat = curator.locator('[data-curator-path-repeat]').first();
          await expect(repeat).toBeAttached();
          const repeatRef = await repeat.getAttribute('data-curator-path-repeat');
          const beforeRepeatCount = await curator.locator('.fd-curator-placement').count();
          const repeatContext = await repeat.evaluate((node) => ({
            title: node.closest('article').querySelector('h3').textContent,
            existing: node.closest('article').querySelectorAll('.fd-curator-placement').length,
          }));
          const beforeRepeatLabel = await repeat.getAttribute('aria-label');
          expect(beforeRepeatLabel).toBe(
            `Repeat ${repeatContext.title}, occurrence ${repeatContext.existing + 1}, position 1 of 1 in Week 1`,
          );
          const oldRepeat = await repeat.elementHandle();
          await keyboardActivate(repeat);
          expect(await oldRepeat.evaluate((node) => node.isConnected)).toBe(false);
          expect(await curator.locator('.fd-curator-placement').count()).toBe(beforeRepeatCount + 1);
          repeat = curator.locator(`[data-curator-path-repeat="${repeatRef}"]`);
          await expect(repeat).toBeAttached();
          expect(await repeat.getAttribute('aria-label')).toBe(
            `Repeat ${repeatContext.title}, occurrence ${repeatContext.existing + 2}, position 1 of 1 in Week 1`,
          );
          step = stepButton(curator, 3);
          await keyboardActivate(step);
          const placementSemantics = await curator.locator('.fd-curator-week').evaluateAll((weeks) => {
            const occurrences = Object.create(null);
            return weeks.flatMap((weekNode) => {
              const week = Number(weekNode.querySelector(':scope > h3').textContent.replace('Week ', ''));
              const rows = Array.from(weekNode.querySelectorAll(':scope > .fd-curator-schedule-row'));
              return rows.map((row, index) => {
                const title = row.querySelector(':scope > span').textContent;
                occurrences[title] = (occurrences[title] || 0) + 1;
                const suffix = `${title}, occurrence ${occurrences[title]}, position ${index + 1} of ${rows.length} in Week ${week}`;
                return {
                  title,
                  occurrence: occurrences[title],
                  position: index + 1,
                  total: rows.length,
                  week,
                  actual: Array.from(row.querySelectorAll('[data-curator-path-move-order]'))
                    .map((node) => node.getAttribute('aria-label')),
                  expected: [`Move up ${suffix}`, `Move down ${suffix}`],
                };
              });
            });
          });
          expect(placementSemantics).toHaveLength(beforeRepeatCount + 1);
          for (const semantics of placementSemantics) {
            expect(semantics.actual).toEqual(semantics.expected);
            expect(semantics.position).toBeGreaterThanOrEqual(1);
            expect(semantics.position).toBeLessThanOrEqual(semantics.total);
            expect(semantics.week).toBeGreaterThanOrEqual(1);
            expect(semantics.week).toBeLessThanOrEqual(audience === 'ms3' ? 6 : 4);
          }
          expect(placementSemantics.filter(({ title }) => title === repeatContext.title)
            .map(({ occurrence }) => occurrence)).toEqual(
            Array.from({ length: repeatContext.existing + 1 }, (_, index) => index + 1),
          );

          step = stepButton(curator, 4);
          await step.focus();
          await step.press('Enter');
          await keyboardSelectValue(
            curator, '[data-curator-local-preset]', ROTATION_EDITION_KEYS.fullPreset,
            { command: true },
          );
          for (const [category, count] of Object.entries({
            schedule: 1, accessItems: 1, contacts: 1, checklistItems: 1, resources: 1,
          })) {
            await expect(curator.locator(`[data-curator-row-editor="${category}"]`)).toHaveCount(count);
          }
          await expectFullPresetControls(curator);
          await expect(curator.locator('[data-curator-step-panel="4"] textarea')).toHaveCount(0);
          await expect(curator.locator('[data-curator-step-panel="4"] input[type="text"]')).toHaveCount(0);
          await expect(curator.locator('[data-curator-step-panel="4"] input[type="url"]')).toHaveCount(0);
          await expect(curator.locator('[data-curator-step-panel="4"] option', { hasText: /^Other$/ })).toHaveCount(0);
          expect(await curator.locator('[data-curator-step-panel="4"] .fd-curator-local-card')
            .evaluateAll((cards) => cards.map((card) => card.id))).toEqual([
            'fd-curator-arrival', 'fd-curator-accessItems', 'fd-curator-contacts',
            'fd-curator-checklistItems', 'fd-curator-schedule', 'fd-curator-rounds',
            'fd-curator-presentation', 'fd-curator-documentation', 'fd-curator-attendance',
            'fd-curator-feedback', 'fd-curator-resources',
          ]);
          const localStatus = curator.locator('[data-curator-local-status]');
          await expect(localStatus).toHaveAttribute('role', 'status');
          await expect(localStatus).toHaveAttribute('aria-live', 'polite');
          let blockedRemoval = curator.locator('[data-curator-local-remove="schedule"]').first();
          await blockedRemoval.focus();
          await blockedRemoval.press('Enter');
          await expect(blockedRemoval).toBeAttached();
          await expect(curator.locator('[data-curator-local-status]')).toBeFocused();
          await expect(curator.locator('[data-curator-local-status]')).toContainText('used by attendance');
          for (const selector of [
            '.fd-curator-local-card h3', '.fd-curator-reviewed-only',
            '[data-curator-local-status]', '.fd-curator-local-card label',
          ]) expect(await renderedContrast(curator, selector)).toBeGreaterThanOrEqual(4.5);
          expect(await curator.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          await curator.close();

          const learner = await context.newPage();
          await installStorageAndListenerProbe(learner);
          await installRotationEditionRoute(learner);
          await seedRotationEditionLearner(learner, audience);
          await gotoFreshEditionDocument(learner, artifact.link);
          await expectLearnerEdition(learner, artifact, audience, { full: true });
          expect(await learner.evaluate((theme) => matchMedia(`(prefers-color-scheme: ${theme})`).matches, colorScheme)).toBe(true);
          await expect(learner.locator('.fd-edition-card [role="status"]')).toHaveAttribute('aria-live', 'polite');
          for (const kind of ['checklist', 'resources']) {
            let toggle = learner.locator(`[data-fd-local-toggle="${kind}"]`).first();
            await expect(toggle).toHaveCSS('min-height', '44px');
            const oldToggle = await toggle.elementHandle();
            await keyboardActivate(toggle, 'Space');
            expect(await oldToggle.evaluate((node) => node.isConnected)).toBe(true);
            toggle = learner.locator(`[data-fd-local-toggle="${kind}"]`).first();
            await expect(toggle).toHaveAttribute('aria-pressed', 'true');
            const currentToggle = await toggle.elementHandle();
            expect(await oldToggle.evaluate((node, current) => node === current, currentToggle)).toBe(true);
          }
          await expect(learner.locator('.fd-edition-resource').first()).toContainText('example.invalid');
          for (const selector of [
            '.fd-edition-authority', '.fd-edition-card h2',
            '.fd-edition-section h2', '.fd-edition-local__item > p:not(.fd-edition-authority)',
            '.fd-edition-resource',
          ]) expect(await renderedContrast(learner, selector)).toBeGreaterThanOrEqual(4.5);
          expect(await learner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

          if (sizeName === 'phone-390' && colorScheme === 'dark') {
            const editionKeys = rotationEditionStorageKeys(audience);
            await learner.evaluate((keys) => {
              localStorage.removeItem(keys.edition);
              localStorage.removeItem(keys.local);
            }, editionKeys);
            const corrupt = await context.newPage();
            const corruptRouteLedger = await installRotationEditionRoute(corrupt);
            await seedRotationEditionLearner(corrupt, audience);
            await gotoFreshEditionDocument(corrupt, corruptLink);
            expect(await corrupt.evaluate(() => ({
              dark: matchMedia('(prefers-color-scheme: dark)').matches,
              width: innerWidth,
              height: innerHeight,
            }))).toEqual({ dark: true, width: PHONE.width, height: PHONE.height });
            const error = corrupt.locator('.fd-edition-error[role="alert"]');
            await expect(error).toHaveCount(1);
            await expect(error.getByRole('heading', { name: FIXED_ERROR_TEXT, exact: true })).toBeVisible();
            await expect(error.locator('code')).toHaveText('EDITION_INVALID');
            await expect(error).toHaveAttribute('tabindex', '-1');
            await expect(error).toBeFocused();
            await expect(corrupt.locator('#routeStatus')).toHaveAttribute('aria-live', 'polite');
            await expect(corrupt.locator('.fd-today')).toBeVisible();
            await expect(corrupt.locator('.fd-edition-card,.fd-edition-local')).toHaveCount(0);
            expect(await corrupt.locator('#fdApp').evaluate((node) => ({
              inert: node.hasAttribute('inert'), busy: node.hasAttribute('aria-busy'),
            }))).toEqual({ inert: false, busy: false });
            for (const selector of ['.fd-edition-error h2', '.fd-edition-error p', '.fd-edition-error code']) {
              expect(await renderedContrast(corrupt, selector)).toBeGreaterThanOrEqual(4.5);
            }
            expect(await corrupt.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            expect(await renderedPublicSurface(corrupt)).not.toContain(ALTERED_DIGEST);
            expect(new URL(corrupt.url()).hash).toBe('');
            expect(corruptRouteLedger.map((row) => row.pathname)).toEqual(['/']);
            await corrupt.close();
          }
        } finally {
          await context.close();
        }
      });
    }
  }
});

function injectHostileCatalogLookalikes(projection) {
  const replacements = new Map([
    [ROTATION_EDITION_KEYS.curator, {
      displayName: 'Synthetic Counterfeit Core Authority',
    }],
    [ROTATION_EDITION_KEYS.reason, {
      label: 'Synthetic Counterfeit Local Authority',
      fragment: 'counterfeit local authority wording',
    }],
  ]);
  for (const record of projection.resolutionRecords) {
    const replacement = replacements.get(record.key);
    if (!replacement) continue;
    Object.assign(record, replacement);
    delete record.contentDigest;
    record.contentDigest = rotationEditionDigest(record);
  }
}

test('hostile catalog and config lookalikes cannot replace code-owned authority copy', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const audience = rotationEditionAudience(testInfo.project.name);
  const routeOptions = { mutateProjection: injectHostileCatalogLookalikes };
  const artifact = await buildCuratorArtifact(page, 'compact', routeOptions);
  const learner = await newLearnerPage(browser, baseURL, audience, routeOptions);
  const configLookalike = 'counterfeit-config-local-authority';
  const configLink = mutateRotationEditionLink(artifact.link, (envelope) => {
    envelope.config.localPlan.resources[0].instanceId = configLookalike;
  });
  try {
    await gotoFreshEditionDocument(learner.page, artifact.link);
    await expectLearnerEdition(learner.page, artifact, audience);
    await expect(learner.page.locator('.fd-edition-card')).toContainText('Synthetic Counterfeit Core Authority');
    await expect(learner.page.locator('#fdApp')).toContainText('counterfeit local authority wording');
    const authority = await learner.page.locator('.fd-edition-authority').allTextContents();
    for (const fixed of ROTATION_EDITION_AUTHORITY) {
      await expect(learner.page.locator('#fdApp')).toContainText(fixed);
    }
    expect(authority.join('\n')).not.toContain('Synthetic Counterfeit Core Authority');
    expect(authority.join('\n')).not.toContain('counterfeit local authority wording');
  } finally {
    await learner.context.close();
  }

  await assertRejectedLearnerCase(browser, baseURL, audience, {
    link: configLink, code: 'EDITION_INVALID', secrets: [configLookalike], routeOptions,
  });
});
