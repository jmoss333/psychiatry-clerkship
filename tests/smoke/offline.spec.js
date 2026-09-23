/** Browser proof of the emitted worker and Shift-ready check on both built sites. */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const offlineModelSource = readFileSync(new URL(
  '../../13_Faculty_Resources/_automation/site_build/frontdoor/fd_offline.js', import.meta.url,
), 'utf8');

const entry = page => page.locator('[data-fd-offline-entry]');
const status = page => entry(page).locator('[data-fd-offline-label]');
const resident = info => info.project.name === 'offline-res';

// The oracle reads the two canonical data projections shipped in the built shell. It does not
// call fdOfflineUrls, inspect FD_INDEX, or derive expectations from a worker request/response.
async function canonicalOfflineInventory(page, route) {
  const response = await page.request.get('/');
  expect(response.ok()).toBe(true);
  const shell = await response.text();
  function data(name) {
    const marker = 'var ' + name + '=';
    const start = shell.indexOf(marker);
    expect(start, marker + ' must occur in the built shell').toBeGreaterThan(-1);
    const body = shell.slice(start + marker.length);
    const end = body.indexOf(';\n  var ');
    expect(end, name + ' must have a bounded JSON declaration').toBeGreaterThan(-1);
    return JSON.parse(body.slice(0, end));
  }
  const curriculum = data('FD_CURRICULUM');
  const manifest = data('FD_SITE_MANIFEST');
  const shipped = new Map([
    ...manifest.md.map(row => [row[1], 'read']),
    ...manifest.tools.map(row => [row[1], 'tool']),
  ]);
  const rights = new Set(curriculum.rightsReferences);
  const rawRefs = route.bridge
    ? [...curriculum.appPathway.bridges[route.bridge].refs,
      ...curriculum.appPathway.activities.flatMap(activity => activity.refs)]
    : (() => {
      const week = curriculum.weeks.find(item => item.n === route.week);
      expect(week, 'requested week exists in canonical curriculum').toBeTruthy();
      return [week.landingRef, ...week.items.map(item => item.ref)];
    })();
  const urls = new Set(['/', '/search-index.json']);
  for (const refOrItem of rawRefs) {
    const ref = typeof refOrItem === 'string' ? refOrItem : refOrItem?.ref;
    if (typeof ref !== 'string' || rights.has(ref)) continue;
    const kind = shipped.get(ref);
    if (kind === 'read' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(ref)) urls.add('/content/' + ref);
    if (kind === 'tool' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(ref)) urls.add('/tools/' + ref);
  }
  expect(urls.size, 'canonical route must have substantial offline content').toBeGreaterThan(3);
  return [...urls];
}

function expectExactInventory(requested, expected) {
  expect(requested, 'the active worker must receive current-route URLs').toBeTruthy();
  expect(new Set(requested).size).toBe(requested.length);
  expect([...requested].sort(), 'worker request must equal the independent built route inventory')
    .toEqual([...expected].sort());
}

function routeResources(expected) {
  const reading = expected.find(url => url.startsWith('/content/'));
  const tool = expected.find(url => url.startsWith('/tools/'));
  expect(reading, 'current route must contain a canonical reading').toBeTruthy();
  expect(tool, 'current route must contain a canonical tool').toBeTruthy();
  return { reading, tool };
}

async function returnToAppToday(page, bridge) {
  const back = page.locator('.fd-reader__back');
  if (await back.isVisible()) await back.click();
  await page.goto('/?audience=app', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.fd-app')).toBeVisible();
  if (bridge === 'pmhnp') await page.locator('[data-fd-app-bridge="pmhnp"]').click();
}

async function observeMessages(page, hold = false) {
  await page.addInitScript(shouldHold => {
    window.__offlineRequests = [];
    window.__offlineHeld = [];
    window.__offlineHold = shouldHold;
    localStorage.setItem('cw_capture_v1', 'PRIVATE_OFFLINE_CANARY');
    const original = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function (message, transfer) {
      if (message && message.type === 'CW_OFFLINE_VERIFY') {
        window.__offlineRequests.push(JSON.parse(JSON.stringify(message)));
        if (window.__offlineHold) {
          window.__offlineHeld.push({ worker: this, message, transfer });
          return;
        }
      }
      return original.call(this, message, transfer);
    };
    window.__offlineRelease = () => {
      window.__offlineHold = false;
      for (const held of window.__offlineHeld.splice(0)) {
        original.call(held.worker, held.message, held.transfer);
      }
    };
  }, hold);
}

async function install(page, info, url = '/') {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (url === '/') {
    const role = resident(info) ? 'pgy1' : 'student';
    const choice = page.locator('[data-fd-role="' + role + '"]:visible');
    if (await choice.count()) await choice.click();
    const week = page.locator('[data-fd-week="1"]:visible');
    if (await week.count()) await week.click();
  }
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
    message: 'built site must be controlled by its installed worker', timeout: 15_000,
  }).toBe(true);
  await expect(entry(page)).toBeVisible();
}

async function openReady(page, expected) {
  await entry(page).locator('[data-fd-offline-open]').click();
  await expect(entry(page).locator('[data-fd-offline-card]')).toBeVisible();
  await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
  const requested = await page.evaluate(() => window.__offlineRequests?.at(-1)?.urls);
  expectExactInventory(requested, expected);
  await expect(entry(page).locator('[data-fd-offline-card]'))
    .toContainText(requested.length + ' verified, 0 missing of ' + requested.length + ' eligible files.');
  return requested;
}

async function expectConnectionRequired(page) {
  await expect(entry(page).locator('[data-fd-offline-card]')).toContainText(
    'Connection required: audio and video, live services including the Interview Room, external links, and actual email sending.');
}

test('offline readiness: Checking cannot become Ready before the active worker responds', async ({ page }, info) => {
  await observeMessages(page, true);
  await install(page, info);
  await expect(status(page)).toHaveText('Checking');
  expect(await page.evaluate(() => window.__offlineHeld.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.__offlineRelease());
  await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
  await entry(page).locator('[data-fd-offline-open]').click();
  await expect(entry(page).locator('[data-fd-offline-card]')).toContainText('Checked just now');
});

test('offline readiness: empty week and APP routes cannot ask the worker or show Ready', async ({ page }, info) => {
  await install(page, info);
  const outcome = await page.evaluate(source => {
    // The learner shell keeps helpers in its private script scope. Exercise the same injected
    // production module in this browser without adding a test-only global to the shipped site.
    const model = new Function(source + '\nreturn {fdOfflineMonitor,fdOfflineStatus};')();
    const messages = [];
    const sw = { controller: { postMessage(value) { messages.push(value); } },
      addEventListener() {}, removeEventListener() {} };
    const idx = { weeks: [{ n: 1, items: [] }], byRef: {} };
    const monitor = model.fdOfflineMonitor({ serviceWorker: sw, MessageChannel });
    monitor.sync(idx, { screen: 'app', tab: 'today', week: 1 });
    const week = model.fdOfflineStatus(monitor.status()).kind;
    monitor.sync(idx, { screen: 'app', tab: 'today', appMode: true,
      appPathway: { bridges: { pa: { refs: [] } }, activities: [] } });
    const app = model.fdOfflineStatus(monitor.status()).kind;
    const shell = ['/', '/search-index.json'];
    const forged = model.fdOfflineStatus({ expected: shell,
      response: { version: 'v1', ready: true, present: shell, missing: [] } }).kind;
    monitor.destroy();
    return { week, app, forged, messages };
  }, offlineModelSource);
  expect(outcome).toEqual({ week: 'not-ready', app: 'not-ready', forged: 'not-ready', messages: [] });
});

test('offline readiness: controller activation preserves a live tool session', async ({ page, context }, info) => {
  await install(page, info);
  const toolPage = await context.newPage();
  await toolPage.goto('/?tool=mse.html', { waitUntil: 'domcontentloaded' });
  const frame = toolPage.locator('#content iframe.toolframe');
  await expect(frame).toBeVisible();
  await expect.poll(() => toolPage.evaluate(() => !!clerkshipSWRegistration())).toBe(true);
  await frame.evaluate(element => {
    window.__toolFrameForActivation = element;
    element.contentWindow.__toolSessionForActivation = 'alive';
  });
  const reload = toolPage.waitForEvent('load', { timeout: 700 }).then(() => true, () => false);
  await toolPage.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  expect(await reload, 'a controller change while a tool is active must not reload').toBe(false);
  expect(await toolPage.evaluate(() => ({
    sameFrame: window.__toolFrameForActivation === document.querySelector('#content iframe.toolframe'),
    session: window.__toolFrameForActivation.contentWindow.__toolSessionForActivation,
  }))).toEqual({ sameFrame: true, session: 'alive' });
  await expect(toolPage.locator('.sw-toast')).toHaveCount(0);
});

test('offline readiness: first uncontrolled visit does not claim the installed cache', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('[data-fd-role="' + (resident(info) ? 'pgy1' : 'student') + '"]:visible').click();
  await page.locator('[data-fd-week="1"]:visible').click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await expect(status(page)).toHaveText('Not ready');
  await entry(page).locator('[data-fd-offline-open]').click();
  await expect(entry(page).locator('[data-fd-offline-card]')).toContainText('not controlled');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
});

test('offline readiness: active worker verifies route and cached reading, tool, search and navigation survive offline', async ({ page, context, baseURL }, info) => {
  const outbound = [];
  page.on('request', request => {
    if (request.method() !== 'GET' || request.url().includes('/api/ev')) {
      outbound.push(request.url() + ' ' + (request.postData() || ''));
    }
  });
  await observeMessages(page);
  await install(page, info);
  const expected = await canonicalOfflineInventory(page, { week: 1 });
  const requested = await openReady(page, expected);
  expect(requested).toContain('/');
  expect(requested).toContain('/search-index.json');
  expect(requested.every(url => url === '/' || url === '/search-index.json'
    || /^\/(?:content|tools)\/[A-Za-z0-9._-]+$/.test(url))).toBe(true);
  const messages = await page.evaluate(() => window.__offlineRequests);
  expect(messages.every(message => Object.keys(message).sort().join(',') === 'type,urls')).toBe(true);
  expect(JSON.stringify(messages)).not.toContain('PRIVATE_OFFLINE_CANARY');
  expect(JSON.stringify(outbound)).not.toContain('PRIVATE_OFFLINE_CANARY');
  await expectConnectionRequired(page);

  const cacheState = await page.evaluate(async () => {
    const key = (await caches.keys()).find(value => value.startsWith('cw-precache-'));
    const cache = key && await caches.open(key);
    return { key, urls: cache ? (await cache.keys()).map(request => new URL(request.url).pathname) : [] };
  });
  expect(cacheState.key).toBeTruthy();
  expect(cacheState.urls.length).toBeGreaterThan(requested.length);
  expect(cacheState.urls.some(url => /\.(?:m4a|mp3|mp4|wav|vtt)$/i.test(url))).toBe(false);
  const { reading, tool } = routeResources(expected);
  expect(cacheState.urls).toContain(reading);
  expect(cacheState.urls).toContain(tool);

  await context.setOffline(true);
  try {
    await page.goto(baseURL + '/?page=' + encodeURIComponent(reading.split('/').at(-1)), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible({ timeout: 15_000 });
    expect((await page.locator('.fd-reader .fd-article__body').innerText()).trim().length).toBeGreaterThan(80);

    await page.goto(baseURL + '/?tool=' + encodeURIComponent(tool.split('/').at(-1)), { waitUntil: 'domcontentloaded' });
    const frame = page.locator('#content iframe.toolframe');
    await expect(frame).toBeVisible({ timeout: 15_000 });
    await expect(frame.contentFrame().locator('body')).not.toBeEmpty();

    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-fd-tab="today"]:visible').first().click();
    await expect(entry(page)).toBeVisible();
    await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
    await entry(page).locator('[data-fd-offline-open]').click();
    await expectConnectionRequired(page);
    await page.locator('[data-fd-search]:visible').first().click();
    await expect(page.locator('.fd-search')).toBeVisible();
    await page.locator('.fd-searchpanel__input:visible').fill('mood');
    await expect(page.locator('.fd-result').first()).toBeVisible();
    const mediaResult = await page.evaluate(async () => {
      const response = await fetch('/media/day-in-the-life.mp4', { headers: { Range: 'bytes=0-127' } }).catch(() => null);
      return response && response.status;
    });
    expect(mediaResult).toBeNull();
  } finally {
    await context.setOffline(false);
  }
});

test('offline readiness: deleting one exact requested cache file fails closed', async ({ page }, info) => {
  await observeMessages(page);
  await install(page, info);
  const expected = await canonicalOfflineInventory(page, { week: 1 });
  await openReady(page, expected);
  const { reading: missing } = routeResources(expected);
  const deleted = await page.evaluate(async url => {
    const key = (await caches.keys()).find(value => value.startsWith('cw-precache-'));
    return (await caches.open(key)).delete(url);
  }, missing);
  expect(deleted).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(status(page)).toHaveText('Not ready', { timeout: 10_000 });
  await entry(page).locator('[data-fd-offline-open]').click();
  await expect(entry(page).locator('[data-fd-offline-card]')).toContainText(missing);
  await expect(entry(page).locator('[data-fd-offline-card]')).toContainText('1 missing');
});

test('offline readiness: Refresh respects offline state, bounds a stalled update, then permits retry', async ({ page, context }, info) => {
  await observeMessages(page);
  await install(page, info);
  await openReady(page, await canonicalOfflineInventory(page, { week: 1 }));
  await page.evaluate(() => {
    window.__refreshCalls = 0;
    ServiceWorkerRegistration.prototype.update = function () {
      window.__refreshCalls += 1;
      return new Promise(() => {});
    };
  });
  const url = page.url();
  await context.setOffline(true);
  try {
    await entry(page).locator('[data-fd-offline-refresh]').click();
    await expect(entry(page).locator('[data-fd-offline-refresh-status]'))
      .toContainText('Refresh needs a connection; your verified copy remains available.');
    expect(await page.evaluate(() => window.__refreshCalls)).toBe(0);
  } finally {
    await context.setOffline(false);
  }
  await entry(page).locator('[data-fd-offline-refresh]').click();
  await expect(entry(page).locator('[data-fd-offline-refresh-status]'))
    .toContainText('Checking for a newer offline copy');
  await expect(entry(page).locator('[data-fd-offline-refresh-status]'))
    .toContainText('Update check timed out. Try again with a connection.', { timeout: 11_000 });
  expect(await page.evaluate(() => window.__refreshCalls)).toBe(1);
  await page.evaluate(() => {
    ServiceWorkerRegistration.prototype.update = function () {
      window.__refreshCalls += 1;
      return Promise.resolve();
    };
  });
  await entry(page).locator('[data-fd-offline-refresh]').click();
  await expect(entry(page).locator('[data-fd-offline-refresh-status]'))
    .toContainText('Update check complete', { timeout: 10_000 });
  expect(await page.evaluate(() => window.__refreshCalls)).toBe(2);
  expect(page.url()).toBe(url);
  await expect(status(page)).toHaveText('Ready');
});

test('offline readiness: unsupported and timed-out checks never retain stale Ready', async ({ page, context }, info) => {
  await observeMessages(page);
  await install(page, info);
  await openReady(page, await canonicalOfflineInventory(page, { week: 1 }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: null });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(status(page)).toHaveText('Not ready', { timeout: 10_000 });
  await entry(page).locator('[data-fd-offline-open]').click();
  await expect(entry(page).locator('[data-fd-offline-card]')).not.toContainText('Checked just now');

  // Browser-only fixture: a controller accepts the request but never replies.
  const timeoutPage = await context.newPage();
  await timeoutPage.addInitScript(() => {
    const silentController = { postMessage() {} };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true,
      value: { controller: silentController, addEventListener() {}, removeEventListener() {} } });
  });
  await timeoutPage.goto('/');
  await expect(status(timeoutPage)).toHaveText('Not ready', { timeout: 6_000 });
  await entry(timeoutPage).locator('[data-fd-offline-open]').click();
  await expect(entry(timeoutPage).locator('[data-fd-offline-card]')).toContainText('timed out');
});

test('offline readiness: waiting-worker callback updates the same Today mount while active tool survives', async ({ page, context }, info) => {
  await observeMessages(page);
  await install(page, info);
  await openReady(page, await canonicalOfflineInventory(page, { week: 1 }));
  const card = entry(page).locator('[data-fd-offline-card]');
  const toolPage = await context.newPage();
  await toolPage.goto('/?tool=mse.html', { waitUntil: 'domcontentloaded' });
  const frame = toolPage.locator('#content iframe.toolframe');
  await expect(frame).toBeVisible();
  await frame.evaluate(element => {
    window.__offlineToolFrame = element;
    window.__offlineToolVisit = 'still-loaded';
    element.contentWindow.__offlineToolSession = 'unchanged';
  });
  const before = await page.evaluate(() => {
    const mounted = document.querySelector('[data-fd-offline-entry]');
    window.__offlineBeforeUpdate = {
      entry: mounted,
      count: window.__offlineRequests.length,
      payload: JSON.stringify(window.__offlineRequests),
    };
    window.__todayVisit = 'still-mounted';
    return { connected: mounted.isConnected, count: window.__offlineRequests.length };
  });
  expect(before.connected).toBe(true);
  expect(before.count).toBeGreaterThan(0);
  const todayUrl = page.url();
  const toolUrl = toolPage.url();

  // Exercise the production registration's updatefound/statechange callback path.
  // A genuine second worker install cannot be deterministic against an immutable local build.
  const lifecycle = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const waiting = new EventTarget();
    waiting.state = 'installed';
    try {
      Object.defineProperty(registration, 'installing', { configurable: true, get: () => waiting });
      Object.defineProperty(registration, 'waiting', { configurable: true, get: () => waiting });
      registration.dispatchEvent(new Event('updatefound'));
      waiting.dispatchEvent(new Event('statechange'));
      return { simulated: true, waiting: !!registration.waiting };
    } catch (error) {
      return { simulated: false, error: String(error) };
    }
  });
  expect(lifecycle.simulated, lifecycle.error).toBe(true);
  expect(lifecycle.waiting).toBe(true);
  await expect(status(page)).toHaveText('Update available', { timeout: 10_000 });
  await expect(card).toContainText('The current copy is ready');
  expect(page.url()).toBe(todayUrl);
  expect(await page.evaluate(() => window.__todayVisit)).toBe('still-mounted');
  const after = await page.evaluate(() => ({
    sameEntry: window.__offlineBeforeUpdate.entry === document.querySelector('[data-fd-offline-entry]'),
    originalConnected: window.__offlineBeforeUpdate.entry.isConnected,
    requestCount: window.__offlineRequests.length,
    requestPayload: JSON.stringify(window.__offlineRequests),
    previousCount: window.__offlineBeforeUpdate.count,
    previousPayload: window.__offlineBeforeUpdate.payload,
  }));
  expect(after.sameEntry, 'waiting callback must preserve the exact mounted Shift-ready entry').toBe(true);
  expect(after.originalConnected).toBe(true);
  expect(after.requestCount, 'waiting callback must not start a second verification').toBe(after.previousCount);
  expect(after.requestPayload, 'waiting callback must not change the verification request').toBe(after.previousPayload);
  expect(toolPage.url()).toBe(toolUrl);
  expect(await toolPage.evaluate(() => ({
    sameFrame: window.__offlineToolFrame === document.querySelector('#content iframe.toolframe'),
    originalConnected: window.__offlineToolFrame.isConnected,
    visit: window.__offlineToolVisit,
    toolSession: window.__offlineToolFrame.contentWindow.__offlineToolSession,
  }))).toEqual({ sameFrame: true, originalConnected: true, visit: 'still-loaded', toolSession: 'unchanged' });
  await expect(frame).toBeVisible();
  await expect(toolPage.locator('.sw-toast')).toHaveCount(0);
});

test('offline readiness: fresh week and APP PA/PMHNP route inventories never persist an invitation', async ({ page }, info) => {
  await observeMessages(page);
  await install(page, info);
  const first = await openReady(page, await canonicalOfflineInventory(page, { week: 1 }));
  await entry(page).locator('[data-fd-offline-close]').click();
  await page.locator('[data-fd-change-week]').click();
  await page.locator('[data-fd-week="2"]:visible').click();
  await page.locator('[data-fd-tab="today"]:visible').first().click();
  await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
  const second = await page.evaluate(() => window.__offlineRequests?.at(-1)?.urls);
  expectExactInventory(second, await canonicalOfflineInventory(page, { week: 2 }));
  expect(second).not.toEqual(first);

  if (!resident(info)) {
    await page.goto('/?audience=app');
    await expect(page.locator('.fd-app')).toHaveCount(0);
    await expect(page.locator('[data-fd-role="app"]')).toHaveCount(0);
    return;
  }
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').role);
  await page.goto('/?audience=app');
  await expect(page.locator('.fd-app')).toBeVisible();
  await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
  const pa = await page.evaluate(() => window.__offlineRequests?.at(-1)?.urls);
  expectExactInventory(pa, await canonicalOfflineInventory(page, { bridge: 'pa' }));
  expect(pa).not.toEqual(second);
  await entry(page).locator('[data-fd-offline-open]').click();
  await expect(entry(page).locator('[data-fd-offline-card]')).toContainText('APP PA route');
  await expect(entry(page).locator('[data-fd-offline-card]'))
    .toContainText(pa.length + ' verified, 0 missing of ' + pa.length + ' eligible files.');
  await page.locator('[data-fd-app-bridge="pmhnp"]').click();
  await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
  const pmhnp = await page.evaluate(() => window.__offlineRequests?.at(-1)?.urls);
  expectExactInventory(pmhnp, await canonicalOfflineInventory(page, { bridge: 'pmhnp' }));
  expect(pmhnp).not.toEqual(pa);
  await expect(entry(page).locator('[data-fd-offline-card]')).toContainText('APP PMHNP route');
  await expect(entry(page).locator('[data-fd-offline-card]'))
    .toContainText(pmhnp.length + ' verified, 0 missing of ' + pmhnp.length + ' eligible files.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').role)).toBe(before);
  await page.goto('/');
  await expect(page.locator('.fd-app')).toHaveCount(0);
});

for (const bridge of ['pa', 'pmhnp']) {
  test('offline readiness: resident APP ' + bridge.toUpperCase() + ' route survives offline and an exact missing file fails closed', async ({ page, context, baseURL }, info) => {
    test.skip(!resident(info), 'The APP invitation exists only on the resident site.');
    await observeMessages(page);
    await install(page, info);
    const savedRole = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').role);
    const expected = await canonicalOfflineInventory(page, { bridge });
    const { reading, tool } = routeResources(expected);
    await page.goto('/?audience=app');
    if (bridge === 'pmhnp') await page.locator('[data-fd-app-bridge="pmhnp"]').click();
    await openReady(page, expected);
    await expectConnectionRequired(page);
    const cached = await page.evaluate(async () => {
      const key = (await caches.keys()).find(value => value.startsWith('cw-precache-'));
      return { key, paths: (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname) };
    });
    expect(cached.key).toBeTruthy();
    expect(cached.paths).toContain(reading);
    expect(cached.paths).toContain(tool);

    await context.setOffline(true);
    try {
      await page.goto(baseURL + '/?audience=app&page=' + encodeURIComponent(reading.split('/').at(-1)), { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible({ timeout: 15_000 });
      expect((await page.locator('.fd-reader .fd-article__body').innerText()).trim().length).toBeGreaterThan(80);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();

      await page.goto(baseURL + '/?audience=app&tool=' + encodeURIComponent(tool.split('/').at(-1)), { waitUntil: 'domcontentloaded' });
      const frame = page.locator('#content iframe.toolframe');
      await expect(frame).toBeVisible({ timeout: 15_000 });
      expect(new URL(await frame.getAttribute('src'), baseURL).pathname).toBe(tool);
      await expect(frame.contentFrame().locator('body')).not.toBeEmpty();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('#content iframe.toolframe')).toBeVisible();

      await returnToAppToday(page, bridge);
      await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
      await entry(page).locator('[data-fd-offline-open]').click();
      await expectConnectionRequired(page);
      await page.locator('[data-fd-search]:visible').first().click();
      await expect(page.locator('.fd-search')).toBeVisible();
      await page.locator('.fd-searchpanel__input:visible').fill('mood');
      await expect(page.locator('.fd-result').first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }

    await returnToAppToday(page, bridge);
    await expect(status(page)).toHaveText('Ready', { timeout: 10_000 });
    const removed = await page.evaluate(async url => {
      const key = (await caches.keys()).find(value => value.startsWith('cw-precache-'));
      return (await caches.open(key)).delete(url);
    }, reading);
    expect(removed).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (bridge === 'pmhnp') await page.locator('[data-fd-app-bridge="pmhnp"]').click();
    await expect(status(page)).toHaveText('Not ready', { timeout: 10_000 });
    await entry(page).locator('[data-fd-offline-open]').click();
    await expect(entry(page).locator('[data-fd-offline-card]')).toContainText(reading);
    await expect(entry(page).locator('[data-fd-offline-card]')).toContainText('1 missing');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').role)).toBe(savedRole);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(reopened.locator('.fd-app')).toHaveCount(0);
    expect(await reopened.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').role)).toBe(savedRole);
  });
}
