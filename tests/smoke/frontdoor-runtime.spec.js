import { test, expect } from '@playwright/test';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const CAPTURE = '.fd-capture-launch--global[data-capture-open]';
const EDITION_KEY = 'cw_rotation_edition_v1';
const LOCAL_EDITION_KEY = 'cw_rotation_local_progress_v1';
const EDITION_WRITE_LOG = '__fd_edition_write_log';
const EDITION_REVISION = '1234567890abcdef1234567890abcdef12345678';
const EDITION_CONTRACT_SOURCE = readFileSync(new URL(
  '../../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js',
  import.meta.url,
), 'utf8');
// The browser cases generate envelopes with the shipped contract. They never manufacture or
// brand a validation result; the learner runtime independently validates every serialized link.
// eslint-disable-next-line no-new-func
const EDITION_CONTRACT = new Function(`${EDITION_CONTRACT_SOURCE}\nreturn {
  fdEditionCreateEnvelope,fdEditionCanonicalJson
};`)();
const VALID_PLACEMENT = {
  takenAt: '2026-08-17T00:00:00.000Z',
  answers: [{ id: 'synthetic-placement', cat: 'safety', correct: false }],
  byCat: { safety: { n: 1, correct: 0 } },
};

async function installEditionRuntimeProbe(page) {
  await page.addInitScript(({ editionKey, localKey, logKey }) => {
    const originalSetItem = Storage.prototype.setItem;
    const readLog = () => {
      try { return JSON.parse(sessionStorage.getItem(logKey) || '[]'); } catch { return []; }
    };
    window.__fdMeaningfulRenders = [];
    window.__fdEditionWrites = readLog();
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === window.localStorage && (key === editionKey || key === localKey)) {
        const writes = readLog();
        writes.push([key, String(value)]);
        originalSetItem.call(window.sessionStorage, logKey, JSON.stringify(writes));
        window.__fdEditionWrites = writes;
      }
      return originalSetItem.call(this, key, value);
    };
    new MutationObserver(() => {
      const content = document.querySelector('#content');
      const meaningful = content && content.querySelector(
        '.fd-today,.fd-path,.fd-library,.fd-reader,.fd-setup',
      );
      if (!meaningful || content.querySelector('.skel')) return;
      window.__fdMeaningfulRenders.push({
        rows: content.querySelectorAll('.fd-today .fd-list .fd-row').length,
        firstTitle: content.querySelector('.fd-today .fd-list .fd-row__title')?.textContent || '',
      });
    }).observe(document, { childList: true, subtree: true });
  }, { editionKey: EDITION_KEY, localKey: LOCAL_EDITION_KEY, logKey: EDITION_WRITE_LOG });
}

async function resetEditionWriteLog(page) {
  await page.evaluate((logKey) => {
    sessionStorage.setItem(logKey, '[]');
    window.__fdEditionWrites = [];
  }, EDITION_WRITE_LOG);
}

async function editionWrites(page) {
  return page.evaluate((logKey) => {
    try { return JSON.parse(sessionStorage.getItem(logKey) || '[]'); } catch { return []; }
  }, EDITION_WRITE_LOG);
}

async function localStorageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .sort().map((key) => [key, localStorage.getItem(key)]),
  ));
}

async function seedEditionLearner(page) {
  await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false,
    }));
    localStorage.setItem('cw_progress_v1', '{"synthetic-core":{"done":true}}');
    localStorage.setItem('cw_unrelated_v1', 'preserve byte-for-byte');
  });
}

async function createSyntheticEdition(testInfo, editionNumber, audienceOverride = '') {
  const audience = audienceOverride || (testInfo.project.name === 'nav-res' ? 'resident' : 'ms3');
  const pathId = audience === 'resident' ? 'resident-four-week' : 'ms3-six-week';
  const weekCount = audience === 'resident' ? 4 : 6;
  const selected = editionNumber === 1
    ? { ref: 'welcome.md', title: audience === 'resident'
      ? 'Welcome — Resident Rotation' : 'Welcome to the Rotation' }
    : { ref: 'orientation.md', title: 'Orientation Packet' };
  const byRef = {
    'welcome.md': { ref: 'welcome.md', kind: 'read', title: 'Welcome to the Rotation', minutes: 5 },
    'orientation.md': { ref: 'orientation.md', kind: 'read', title: 'Orientation Packet', minutes: 5 },
  };
  const canonical = {
    byRef,
    path: { id: pathId, weekCount },
    weeks: Array.from({ length: weekCount }, (_, index) => ({
      n: index + 1, title: `Week ${index + 1}`, theme: 'Synthetic', focusCategories: [], items: [],
    })),
    columns: [],
    kit: [],
  };
  const config = {
    audience,
    pathId,
    editionNumber,
    createdAgainstCoreRevision: EDITION_REVISION,
    card: {
      title: `Synthetic runtime edition ${editionNumber}`,
      locationName: 'Example Teaching Unit',
      locationCode: audience === 'ms3' ? 'TMS3' : 'TRES',
      curatorName: 'Example Faculty',
      curatorRole: 'Faculty educator',
      rotationStart: '2026-09-01',
      rotationEnd: '2026-10-12',
      lastVerified: '2026-08-19',
    },
    pathItems: [{
      instanceId: `core:runtime:${editionNumber}`,
      ref: selected.ref,
      week: 1,
      order: 1,
      priority: 'required',
      rationale: `Synthetic runtime priority ${editionNumber}.`,
    }],
    localOrientation: {
      firstDayArrival: '', dailySchedule: '', roundsWorkflow: '',
      presentationExpectations: '', documentationExpectations: '',
      attendanceExpectations: '', feedbackProcess: '', accessPreparation: '',
      contacts: [],
      checklist: [{ id: `local:check:${editionNumber}`, label: 'Review local orientation', priority: 'required' }],
      resources: [],
    },
    changeNote: `Synthetic runtime change ${editionNumber}.`,
  };
  const made = await EDITION_CONTRACT.fdEditionCreateEnvelope(
    config,
    canonical,
    { audience, pathId, coreRevision: EDITION_REVISION },
    webcrypto.subtle,
  );
  expect(made.ok).toBe(true);
  return {
    payload: made.payload,
    fingerprint: made.fingerprint,
    envelope: made.envelope,
    canonicalEnvelope: EDITION_CONTRACT.fdEditionCanonicalJson(made.envelope),
    audience,
    selectedTitle: selected.title,
  };
}

function withoutEditionStores(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(
    ([key]) => key !== EDITION_KEY && key !== LOCAL_EDITION_KEY,
  ));
}

function expectedPlan(testInfo) {
  const resident = testInfo.project.name === 'nav-res';
  return {
    id: resident ? 'resident-four-week' : 'ms3-six-week',
    count: resident ? 4 : 6,
    title: resident ? 'Your 4-week plan' : 'Your 6-week plan',
  };
}

async function seedCompleteSetup(page, extra = {}) {
  await page.addInitScript((seed) => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false, ...seed.frontdoor,
    }));
    for (const [key, value] of Object.entries(seed.storage || {})) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, extra);
}

test('a first valid edition is the first meaningful render, then reload and same-link startup do not churn storage', async ({ page }, testInfo) => {
  await installEditionRuntimeProbe(page);
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  await resetEditionWriteLog(page);

  await page.goto(`/?case=edition-first#edition=${incoming.payload}`);
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-today .fd-list .fd-row')).toHaveCount(1);
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(incoming.selectedTitle);
  const firstRenders = await page.evaluate(() => window.__fdMeaningfulRenders);
  expect(firstRenders.length).toBeGreaterThan(0);
  expect(firstRenders.every(({ rows, firstTitle }) => (
    rows === 1 && firstTitle === incoming.selectedTitle
  ))).toBe(true);
  expect((await editionWrites(page)).map(([key]) => key)).toEqual([LOCAL_EDITION_KEY, EDITION_KEY]);
  expect(await page.evaluate((key) => localStorage.getItem(key), EDITION_KEY)).toBe(incoming.canonicalEnvelope);
  expect(await page.evaluate(({ key, fingerprint }) => (
    JSON.parse(localStorage.getItem(key)).byFingerprint[fingerprint]
  ), { key: LOCAL_EDITION_KEY, fingerprint: incoming.fingerprint })).toEqual({ checklist: {}, resources: {} });

  await page.evaluate(() => history.replaceState(null, '', `${location.pathname}${location.search}`));
  await resetEditionWriteLog(page);
  await page.reload();
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.fd-today .fd-list .fd-row')).toHaveCount(1);
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(incoming.selectedTitle);
  expect(await editionWrites(page)).toEqual([]);

  const beforeSameLink = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  await page.goto(`/?case=edition-same#edition=${incoming.payload}`);
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-today .fd-list .fd-row')).toHaveCount(1);
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(incoming.selectedTitle);
  expect(await editionWrites(page)).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(beforeSameLink);
});

test('a different valid edition prompts accessibly and decline clears only the incoming hash', async ({ page }, testInfo) => {
  await installEditionRuntimeProbe(page);
  const active = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  await page.goto(`/?case=edition-active-decline#edition=${active.payload}`);
  await expect(page.locator('.fd-today')).toBeVisible();
  const candidate = await createSyntheticEdition(testInfo, 2);
  await page.evaluate(({ key, fingerprint }) => {
    const local = JSON.parse(localStorage.getItem(key));
    local.byFingerprint[fingerprint].checklist['local:check:1'] = true;
    localStorage.setItem(key, JSON.stringify(local));
  }, { key: LOCAL_EDITION_KEY, fingerprint: active.fingerprint });
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);

  await page.goto(`/?case=edition-decline#edition=${candidate.payload}`);
  const dialog = page.locator('dialog.fd-edition-switch');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(active.fingerprint);
  await expect(dialog).toContainText(candidate.fingerprint);
  await expect(page.getByRole('button', { name: 'Keep current edition' })).toBeFocused();
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(active.selectedTitle);
  expect(await editionWrites(page)).toEqual([]);

  await page.getByRole('button', { name: 'Keep current edition' }).click();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).hash).toBe('');
  expect(await editionWrites(page)).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(before);
});

test('accepting a different valid edition commits in order, clears the hash, and reloads the selected path', async ({ page }, testInfo) => {
  await installEditionRuntimeProbe(page);
  const active = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  await page.goto(`/?case=edition-active-accept#edition=${active.payload}`);
  await expect(page.locator('.fd-today')).toBeVisible();
  const candidate = await createSyntheticEdition(testInfo, 2);
  await page.evaluate(({ key, fingerprint }) => {
    const local = JSON.parse(localStorage.getItem(key));
    local.byFingerprint[fingerprint].checklist['local:check:1'] = true;
    localStorage.setItem(key, JSON.stringify(local));
  }, { key: LOCAL_EDITION_KEY, fingerprint: active.fingerprint });
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);

  await page.goto(`/?case=edition-accept#edition=${candidate.payload}`);
  await expect(page.locator('dialog.fd-edition-switch')).toBeVisible();
  await page.getByRole('button', { name: 'Switch edition' }).click();
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(candidate.selectedTitle);
  expect((await editionWrites(page)).map(([key]) => key)).toEqual([LOCAL_EDITION_KEY, EDITION_KEY]);
  const after = await localStorageSnapshot(page);
  expect(withoutEditionStores(after)).toEqual(withoutEditionStores(before));
  expect(after[EDITION_KEY]).toBe(candidate.canonicalEnvelope);
  expect(JSON.parse(after[LOCAL_EDITION_KEY]).byFingerprint[active.fingerprint].checklist)
    .toEqual({ 'local:check:1': true });
  expect(JSON.parse(after[LOCAL_EDITION_KEY]).byFingerprint[candidate.fingerprint])
    .toEqual({ checklist: {}, resources: {} });
});

test('malformed and wrong-audience links show a non-modal alert without changing any stored byte', async ({ page }, testInfo) => {
  await installEditionRuntimeProbe(page);
  const otherAudience = testInfo.project.name === 'nav-res' ? 'ms3' : 'resident';
  const wrongAudience = await createSyntheticEdition(testInfo, 1, otherAudience);
  await page.goto('/');
  await seedEditionLearner(page);
  const before = await localStorageSnapshot(page);

  for (const [index, fragment] of ['#edition=%%%%', `#edition=${wrongAudience.payload}`].entries()) {
    await resetEditionWriteLog(page);
    await page.goto(`/?case=edition-rejected-${index}${fragment}`);
    await expect(page.locator('.fd-edition-error[role="alert"]')).toBeVisible();
    await expect(page.locator('dialog.fd-edition-switch')).toHaveCount(0);
    expect(await page.locator('.fd-today .fd-list .fd-row').count()).toBeGreaterThan(1);
    expect(await page.evaluate(() => document.activeElement?.closest('.fd-edition-error'))).toBeNull();
    expect(await editionWrites(page)).toEqual([]);
    expect(await localStorageSnapshot(page)).toEqual(before);
  }
});

test('missing Web Crypto rejects stored edition data to the core without writes or projection', async ({ page }, testInfo) => {
  await installEditionRuntimeProbe(page);
  const stored = await createSyntheticEdition(testInfo, 1);
  await page.goto('/?case=edition-crypto');
  await seedEditionLearner(page);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: EDITION_KEY, value: stored.canonicalEnvelope,
  });
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'crypto', { configurable: true, value: {} });
  });

  await page.goto('/');
  await expect(page.locator('.fd-edition-error[role="alert"]')).toContainText('EDITION_CRYPTO');
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(await page.locator('.fd-today .fd-list .fd-row').count()).toBeGreaterThan(1);
  expect(await editionWrites(page)).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(before);
});

test('completion updates desktop, mobile, and the audience-correct rail immediately without replacing the governed tool', async ({ page }, testInfo) => {
  const resident = testInfo.project.name === 'nav-res';
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/?tool=question-bank-practice.html&case=completion');
  await expect(page.locator('.fd-article iframe')).toBeVisible();
  await page.evaluate(() => {
    window.__completionArticle = document.querySelector('.fd-article');
    window.__completionFrame = document.querySelector('.fd-article iframe');
  });

  const desktop = page.locator('.fd-article__actions [data-fd-toggle="question-bank-practice.html"]');
  const mobile = page.locator('.fd-actionbar [data-fd-toggle="question-bank-practice.html"]');
  await expect(desktop).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);

  await desktop.click();
  await expect(desktop).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);
  const railLabel = page.locator('.fd-railnav__label');
  if (resident) {
    await expect(railLabel).toHaveCount(0);
  } else {
    await expect(railLabel).toContainText('1 of 9 done');
    await expect(page.locator('.fd-railnav__row[data-fd-open="question-bank-practice.html"] .fd-visually-hidden'))
      .toHaveText('Completed');
  }
  expect(await page.evaluate(() => (
    document.querySelector('.fd-article') === window.__completionArticle
      && document.querySelector('.fd-article iframe') === window.__completionFrame
  ))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_progress_v1'))['question-bank-practice.html'].done))
    .toBe(true);

  await page.reload();
  await expect(page.locator('.fd-article iframe')).toBeVisible();
  await expect(desktop).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);
  await page.evaluate(() => {
    window.__completionArticle = document.querySelector('.fd-article');
    window.__completionFrame = document.querySelector('.fd-article iframe');
  });

  await desktop.click();
  await expect(desktop).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);
  if (resident) {
    await expect(railLabel).toHaveCount(0);
  } else {
    await expect(railLabel).toContainText('0 of 9 done');
    await expect(page.locator('.fd-railnav__row[data-fd-open="question-bank-practice.html"] .fd-visually-hidden'))
      .toHaveCount(0);
  }
  expect(await page.evaluate(() => (
    document.querySelector('.fd-article') === window.__completionArticle
      && document.querySelector('.fd-article iframe') === window.__completionFrame
  ))).toBe(true);
  expect(await page.evaluate(() => Object.hasOwn(
    JSON.parse(localStorage.getItem('cw_progress_v1')), 'question-bank-practice.html',
  ))).toBe(false);
});

test('legacy aliases canonicalize on load, delegated actions, messages, and history without fake resource IO', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  const aliasRequests = [];
  page.on('request', (request) => {
    if (/\/(?:content|tools)\/__(?:home|path|start)__/.test(request.url())) aliasRequests.push(request.url());
  });

  await page.goto('/?page=__home__&case=c1');
  await expect(page).toHaveURL(/\/\?case=c1$/);
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.goto('/?page=__path__&case=c1');
  await expect(page).toHaveURL(/\/\?tab=path&case=c1$/);
  await expect(page.locator('.fd-path')).toBeVisible();

  await page.goto('/?page=__start__&case=c1');
  await expect(page).toHaveURL(/\/\?page=__progress__&case=c1$/);
  await expect(page.locator('#pgRoot')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.setAttribute('data-fd-open', '__home__');
    document.querySelector('#fdApp').appendChild(button);
    button.click();
  });
  await expect(page).toHaveURL(/\/\?case=c1$/);
  await expect(page.locator('.fd-today')).toBeVisible();

  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/?page=__path__&case=c1';
    link.textContent = 'legacy path';
    document.querySelector('#content').appendChild(link);
    link.click();
  });
  await expect(page).toHaveURL(/\/\?tab=path&case=c1$/);
  await expect(page.locator('.fd-path')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'openPage', f: '__start__' }, origin: location.origin,
    }));
  });
  await expect(page).toHaveURL(/\/\?page=__progress__&case=c1$/);
  await expect(page.locator('#pgRoot')).toBeVisible();
  expect(aliasRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.locator('[data-fd-home]').first().click();
  await expect(page.locator('.fd-today')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#pgRoot')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.fd-today')).toBeVisible();
  await page.reload();
  await expect(page.locator('.fd-today')).toBeVisible();
});

test('initial Home alias persists Today before an immediate canonical reload', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'library', openId: 'orientation.md', fromTab: 'library',
      viewWeek: 1, autoAdvance: false,
    }));
    localStorage.setItem('cw_last', 'orientation.md');
  });

  await page.goto('/?page=__home__&case=alias-reload');
  await expect(page).toHaveURL(/\/\?case=alias-reload$/);
  await expect(page.locator('.fd-today')).toBeVisible();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')));
  expect.soft(persisted.tab).toBe('today');
  expect.soft(persisted.openId).toBeUndefined();

  await page.reload();
  await expect(page).toHaveURL(/\/\?case=alias-reload$/);
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-reader')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBe('orientation.md');
});

test('capture refreshes Today and search matches without replacing its live launcher', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');
  const launcher = page.locator(CAPTURE);
  await expect(launcher).toHaveCount(1);
  await page.evaluate((selector) => { window.__captureLauncher = document.querySelector(selector); }, CAPTURE);

  await launcher.click();
  await page.locator('#capText').fill('psychosis');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  await expect(page.locator('#capText')).toBeFocused();
  const triage = page.locator('.fd-capture', { hasText: 'Questions from the unit' });
  await expect(triage).toContainText('psychosis');
  await expect(triage.locator('[data-cap-open]')).toHaveAttribute('data-cap-ref', 't_psychosis.md');
  await expect(triage.locator('[data-cap-review]')).toHaveAttribute('data-cap-ref', 't_psychosis.md');
  expect(await page.evaluate((selector) => {
    const current = document.querySelector(selector);
    return current === window.__captureLauncher && current.isConnected;
  }, CAPTURE)).toBe(true);
  await expect(launcher).toHaveCount(1);

  await page.locator('#capCancel').click();
  expect(await page.evaluate(() => document.activeElement === window.__captureLauncher)).toBe(true);
  await page.evaluate(() => window.__captureLauncher.click());
  await page.locator('#capText').fill('orientation packet');
  await page.locator('#capSave').click();
  await expect(page.locator('#capText')).toBeFocused();
  await expect(triage).toContainText('orientation packet');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.activeElement === window.__captureLauncher)).toBe(true);

  await page.evaluate(() => window.__captureLauncher.click());
  await page.locator('.cap-list li', { hasText: 'psychosis' }).locator('[data-cap-del]').click();
  await expect(triage).not.toContainText('psychosis');
  await expect(triage).toContainText('orientation packet');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#capEraseAll').click();
  await expect(triage).toHaveCount(0);
  await expect(launcher).toHaveCount(1);
  expect(await page.evaluate((selector) => (
    document.querySelector(selector) === window.__captureLauncher
      && window.__captureLauncher.isConnected
  ), CAPTURE)).toBe(true);
  await page.locator('#capCancel').click();
  expect(await page.evaluate(() => document.activeElement === window.__captureLauncher)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('cw_capture_v1'))).toBeNull();
  expect(runtimeErrors).toEqual([]);
});

test('slow search hydration preserves capture focus while revealing same-session matches', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  let releaseIndex;
  let indexWasRequested = false;
  const indexRelease = new Promise((resolve) => { releaseIndex = resolve; });
  await page.route('**/search-index.json', async (route) => {
    indexWasRequested = true;
    await indexRelease;
    await route.continue();
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');
  await expect.poll(() => indexWasRequested).toBe(true);

  const launcher = page.locator(CAPTURE);
  await launcher.click();
  await page.locator('#capText').fill('psychosis');
  await page.locator('#capSave').click();
  await expect(page.locator('#capText')).toBeFocused();
  const triage = page.locator('.fd-capture', { hasText: 'Questions from the unit' });
  await expect(triage).toContainText('psychosis');
  await expect(triage.locator('[data-cap-open]')).toHaveCount(0);
  await page.evaluate((selector) => {
    window.__hydrationFocus = document.activeElement;
    window.__hydrationLauncher = document.querySelector(selector);
  }, CAPTURE);

  const indexResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith('/search-index.json') && response.ok()
  ));
  releaseIndex();
  await indexResponse;
  await expect(triage.locator('[data-cap-open]')).toHaveAttribute('data-cap-ref', 't_psychosis.md');
  expect.soft(await page.evaluate(() => {
    const active = document.activeElement;
    return active === window.__hydrationFocus
      && active.isConnected
      && Boolean(active.closest('.cap-sheet'));
  })).toBe(true);

  await page.keyboard.press('Tab');
  expect.soft(await page.evaluate(() => Boolean(document.activeElement?.closest('.cap-sheet')))).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (
    document.activeElement === window.__hydrationLauncher && window.__hydrationLauncher.isConnected
  ))).toBe(true);
  await expect(launcher).toHaveCount(1);
  expect(runtimeErrors).toEqual([]);
});

test('same-route data hydration preserves focused header and Today controls', async ({ page }) => {
  let releaseIndex, releaseMeta;
  let indexWasRequested = false, metaWasRequested = false;
  const indexRelease = new Promise((resolve) => { releaseIndex = resolve; });
  const metaRelease = new Promise((resolve) => { releaseMeta = resolve; });
  await page.route('**/topic_meta.json', async (route) => {
    metaWasRequested = true;
    await metaRelease;
    await route.continue();
  });
  await page.route('**/search-index.json', async (route) => {
    indexWasRequested = true;
    await indexRelease;
    await route.continue();
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page, {
    storage: {
      cw_capture_v1: {
        v: 1,
        items: [{ id: 'c_hydration', text: 'psychosis', at: 1, ctx: null, triaged: false }],
      },
    },
  });
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect.poll(() => indexWasRequested).toBe(true);
  await expect.poll(() => metaWasRequested).toBe(true);
  expect(await page.evaluate(() => (
    document.activeElement !== document.querySelector('#content')
      && !document.querySelector('#content').matches(':focus-visible')
  ))).toBe(true);

  const search = page.locator('[data-fd-search]');
  await search.focus();
  await page.evaluate(() => { window.__hydrationSearch = document.activeElement; });

  const indexResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname.endsWith('/search-index.json') && response.ok()
  ));
  releaseIndex();
  await indexResponse;
  await expect.poll(() => page.evaluate(() => Boolean(
    window.SI && window.SI.postings && Object.keys(window.SI.postings).length,
  ))).toBe(true);
  expect(await page.evaluate(() => (
    window.__hydrationSearch.isConnected
      && document.activeElement === window.__hydrationSearch
  ))).toBe(true);

  const capture = page.locator('.fd-capture__new[data-capture-open]');
  await capture.focus();
  const metaResponse = page.waitForResponse(response => (
    new URL(response.url()).pathname.endsWith('/topic_meta.json') && response.ok()
  ));
  releaseMeta();
  await metaResponse;
  await expect.poll(() => page.evaluate(() => Boolean(
    window.TOPIC_META && Object.keys(window.TOPIC_META).length,
  ))).toBe(true);
  await expect(page.locator('.fd-capture__new[data-capture-open]')).toBeFocused();
});

test('Back from an interrupted resource load still focuses the restored route', async ({ page }) => {
  let releaseResource;
  let resourceWasRequested = false;
  const resourceRelease = new Promise((resolve) => { releaseResource = resolve; });
  await page.route('**/content/*.md', async (route) => {
    resourceWasRequested = true;
    await resourceRelease;
    await route.continue();
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  const ref = await page.locator('.fd-today [data-fd-open]').first().getAttribute('data-fd-open');
  expect(ref).toBeTruthy();

  await page.locator(`.fd-today [data-fd-open="${ref}"]`).first().click();
  await expect.poll(() => resourceWasRequested).toBe(true);
  await expect(page).toHaveURL(new RegExp(`\\?page=${ref}`));
  await expect(page.locator('.fd-reader')).toBeVisible();

  await page.evaluate(() => history.back());
  await expect(page).not.toHaveURL(new RegExp(`\\?page=${ref}`));
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('#content')).toBeFocused();

  const staleResponseFinished = page.waitForResponse((response) => (
    new URL(response.url()).pathname.endsWith(`/content/${ref}`)
  ));
  releaseResource();
  const staleResponse = await staleResponseFinished;
  await staleResponse.finished();
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await expect(page).not.toHaveURL(new RegExp(`\\?page=${ref}`));
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-reader')).toHaveCount(0);
  await expect(page.locator('#content')).toBeFocused();
});

test('Today card capture restores focus to its recreated launcher after save', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page, {
    storage: {
      cw_capture_v1: {
        v: 1,
        items: [{
          id: 'c_existing', text: 'psychosis', at: 1, ctx: null, triaged: false,
        }],
      },
    },
  });
  await page.goto('/');

  const cardLauncher = page.locator('.fd-capture__new[data-capture-open]');
  await expect(cardLauncher).toHaveCount(1);
  await page.evaluate(() => {
    window.__captureCardLauncher = document.querySelector('.fd-capture__new[data-capture-open]');
  });
  await cardLauncher.click();
  await page.locator('#capText').fill('orientation packet');
  await page.locator('#capSave').click();

  await expect(page.locator('#capText')).toBeFocused();
  await expect(page.locator('.fd-capture')).toContainText('orientation packet');
  expect(await page.evaluate(() => {
    const current = document.querySelector('.fd-capture__new[data-capture-open]');
    return !window.__captureCardLauncher.isConnected && current !== window.__captureCardLauncher;
  })).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('.fd-capture__new[data-capture-open]')).toBeFocused();
  await expect(page.locator(CAPTURE)).toHaveCount(1);
  expect(runtimeErrors).toEqual([]);
});

test('capture delete keeps focus and the next Tab inside the dialog after refresh', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page, {
    storage: {
      cw_capture_v1: {
        v: 1,
        items: [
          { id: 'c_delete', text: 'psychosis', at: 1, ctx: null, triaged: false },
          { id: 'c_keep', text: 'orientation packet', at: 2, ctx: null, triaged: false },
        ],
      },
    },
  });
  await page.goto('/');

  const launcher = page.locator(CAPTURE);
  await launcher.click();
  const deleteButton = page.locator('.cap-list li', { hasText: 'psychosis' }).locator('[data-cap-del]');
  await deleteButton.focus();
  await expect(deleteButton).toBeFocused();
  await deleteButton.click();

  await expect.soft(page.locator('#capText')).toBeFocused();
  await page.keyboard.press('Tab');
  expect.soft(await page.evaluate(() => Boolean(document.activeElement?.closest('.cap-sheet')))).toBe(true);
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();
  await expect(page.locator(CAPTURE)).toHaveCount(1);
  expect(runtimeErrors).toEqual([]);
});

test('capture erase-all keeps focus and the next Tab inside the dialog after refresh', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page, {
    storage: {
      cw_capture_v1: {
        v: 1,
        items: [{ id: 'c_erase', text: 'psychosis', at: 1, ctx: null, triaged: false }],
      },
    },
  });
  await page.goto('/');

  const launcher = page.locator(CAPTURE);
  await launcher.click();
  const eraseButton = page.locator('#capEraseAll');
  await eraseButton.focus();
  await expect(eraseButton).toBeFocused();
  page.once('dialog', (dialog) => dialog.accept());
  await eraseButton.click();

  await expect.soft(page.locator('#capText')).toBeFocused();
  await page.keyboard.press('Tab');
  expect.soft(await page.evaluate(() => Boolean(document.activeElement?.closest('.cap-sheet')))).toBe(true);
  await expect(page.locator('.fd-capture')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();
  await expect(page.locator(CAPTURE)).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('cw_capture_v1'))).toBeNull();
  expect(runtimeErrors).toEqual([]);
});

test('legacy Start keeps incomplete role/week setup canonical across reload and history', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?page=__start__&case=setup');
  await expect(page).toHaveURL(/\/\?case=setup$/);
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText("Who's this for?");
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.locator('[data-fd-role]').first().click();
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText('Where in the rotation?');
  await page.reload();
  await expect(page).toHaveURL(/\/\?case=setup$/);
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText('Where in the rotation?');
  await page.goBack();
  await page.goForward();
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText('Where in the rotation?');
  await expect(page.locator('.fd-reader')).toHaveCount(0);
});

test('fd-main and Reader rail styles survive Today, Reader, Progress, placement, and plan mutations', async ({ page }, testInfo) => {
  const planInfo = expectedPlan(testInfo);
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page, {
    storage: {
      cw_plan_v1: { generatedAt: '2026-08-17T00:00:00Z', shelfDate: '', weeks: [] },
      cw_pretest_v1: VALID_PLACEMENT,
    },
  });
  await page.goto('/');
  const main = page.locator('main#content');
  await expect(main).toHaveClass(/\bfd-main\b/);
  expect(await main.evaluate((node) => getComputedStyle(node).paddingLeft)).toBe('20px');

  await page.goto('/?page=welcome.md');
  await expect(page.locator('.fd-article')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
  const rail = page.locator('.fd-railnav');
  if (testInfo.project.name === 'nav-res') {
    await expect(rail).toHaveCount(0);
  } else {
    await expect(rail).toBeVisible();
    expect(await rail.evaluate((node) => {
      const css = getComputedStyle(node);
      return {
        backgroundColor: css.backgroundColor,
        borderRightWidth: css.borderRightWidth,
        height: css.height,
        paddingLeft: css.paddingLeft,
        position: css.position,
      };
    })).toEqual({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderRightWidth: '0px',
      height: expect.not.stringMatching(/^800px$/),
      paddingLeft: '0px',
      position: 'sticky',
    });
  }

  await page.goto('/?page=__progress__');
  await expect(page.locator('#pgRoot')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
  await page.locator('[data-pt="plan"]').click();
  await expect(page.locator('#planRoot')).toBeVisible();
  await expect(page.locator('#planRoot h1')).toHaveText(planInfo.title);
  await expect(page.locator('.wd-card')).toHaveCount(planInfo.count);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_plan_v1')))).toMatchObject({
    pathId: planInfo.id, weekCount: planInfo.count,
  });
  await expect(main).toHaveClass(/\bfd-main\b/);
  await page.locator('[data-pt="pretest"]').click();
  await expect(page.locator('#ptRoot')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
  await page.locator('[data-progress-action="progress"]').click();
  await page.locator('[data-pt="plan"]').click();
  await expect(page.locator('#planRoot')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
});

test('theme, Week, and capture focus obey one ordinary modal lifecycle', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');

  const theme = page.locator('[data-fd-theme]');
  await theme.focus();
  await theme.click();
  await expect(page.locator('[data-fd-theme]')).toBeFocused();

  await page.locator('[data-fd-change-week]').click();
  await expect(page.locator('.fd-setup .fd-h1')).toBeFocused();
  await page.locator('[data-fd-week="1"]').click();
  await expect(page.locator('.fd-today')).toBeVisible();

  const capture = page.locator(CAPTURE);
  await capture.click();
  await expect(page.locator('.cap-sheet')).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await page.keyboard.press('Meta+k');
  await expect(page.locator('.fd-search')).toHaveCount(0);
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect(capture).toBeFocused();
});

test('capture alone owns Cmd/Ctrl-K and one Escape restores its connected invoker', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');

  // The generic selector deliberately reaches the pre-fix Today launcher so this regression
  // exercises modal arbitration during RED; the route matrix separately pins the new stable one.
  const invoker = page.locator('[data-capture-open]').first();
  await invoker.click();
  await expect(page.locator('.cap-sheet')).toBeVisible();
  await page.locator('#capSave').focus();
  await page.locator('#capSave').evaluate((button) => button.dispatchEvent(new KeyboardEvent(
    'keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true },
  )));
  await expect.soft(page.locator('[role="dialog"]')).toHaveCount(1);
  await expect.soft(page.locator('.fd-search')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect(invoker).toBeFocused();
  await expect.soft(page.locator('.fd-search')).toHaveCount(0);
});

test('document title resets for tabs and updates for successful resources and internal views', async ({ page }, testInfo) => {
  const planInfo = expectedPlan(testInfo);
  await page.setViewportSize(PHONE);
  await seedCompleteSetup(page, {
    storage: {
      cw_plan_v1: { generatedAt: '2026-08-17T00:00:00Z', shelfDate: '', weeks: [] },
      cw_pretest_v1: VALID_PLACEMENT,
    },
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/^Today — /);
  await page.locator('[data-fd-tab="path"]').click();
  await expect(page).toHaveTitle(/^Path — /);
  await page.locator('[data-fd-tab="library"]').click();
  await expect(page).toHaveTitle(/^Library — /);
  await page.goto('/?page=welcome.md');
  await expect(page.locator('.fd-article')).toBeVisible();
  await expect(page).toHaveTitle(/^Welcome/);
  await page.goto('/?page=__progress__');
  await expect(page).toHaveTitle(/^Progress — /);
  await page.locator('[data-pt="plan"]').click();
  await expect(page).toHaveTitle(new RegExp(`^${planInfo.title} — `));
  await expect(page.locator('#planRoot h1')).toHaveText(planInfo.title);
  await expect(page.locator('.wd-card')).toHaveCount(planInfo.count);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_plan_v1')))).toMatchObject({
    pathId: planInfo.id, weekCount: planInfo.count,
  });
  await page.locator('[data-fd-view-week="1"]', { hasText: 'Open Week 1' }).click();
  await expect(page).toHaveURL(/\?tab=path/);
  await expect(page.locator('.fd-timeline__row.is-sel')).toHaveAttribute('data-fd-view-week', '1');
  await page.goto('/?page=__progress__');
  await page.locator('[data-pt="plan"]').click();
  await page.locator('[data-pt="pretest"]').click();
  await expect(page).toHaveTitle(/^2-minute placement — /);
  await page.locator('[data-progress-action="progress"]').click();
  await page.locator('[data-pt="plan"]').click();
  await expect(page).toHaveTitle(new RegExp(`^${planInfo.title} — `));
});

test('corrupt saved plan without placement opens placement and preserves progress', async ({ page }) => {
  const progress = { 'pg_interview.md': { done: true, at: '2026-08-17' } };
  await page.setViewportSize(PHONE);
  await seedCompleteSetup(page, {
    storage: { cw_plan_v1: '{broken', cw_progress_v1: progress },
  });
  await page.goto('/');
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.setAttribute('data-pt', 'plan');
    button.textContent = 'Plan';
    document.querySelector('#fdApp').appendChild(button);
    button.click();
  });
  await expect(page.locator('#ptRoot h1')).toHaveText('2-minute placement');
  expect(await page.evaluate(() => localStorage.getItem('cw_plan_v1'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_progress_v1')))).toEqual(progress);
});
