import { test, expect } from '@playwright/test';

const TOOL = '/tools/rotation-curator.html';
const DRAFT_KEY = 'cw_curator_draft_v1';

function expectedSite(projectName) {
  return projectName === 'nav-res'
    ? { audience: 'resident', label: 'Resident', pathId: 'resident-four-week', weeks: 4 }
    : { audience: 'ms3', label: 'MS3', pathId: 'ms3-six-week', weeks: 6 };
}

async function instrumentBoundaries(page) {
  await page.addInitScript(() => {
    const signals = window.__curatorSignals = {
      storageReads: [], storageWrites: [], fetch: [], xhr: [], beacon: [],
      websocket: [], clipboard: [], share: [], windowOpen: [], objectUrl: [],
      urlConstruct: [], filePicker: [], indexedDb: [], caches: [],
      formSubmit: [], anchorClick: [], history: [],
    };

    const storageGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      signals.storageReads.push(String(key));
      return storageGet.call(this, key);
    };
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const native = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        signals.storageWrites.push({ method, args: args.map(String) });
        return native.apply(this, args);
      };
    }

    const nativeFetch = window.fetch;
    window.fetch = function (...args) {
      signals.fetch.push(String(args[0]));
      return nativeFetch.apply(this, args);
    };
    const xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      signals.xhr.push({ method: String(method), url: String(url) });
      return xhrOpen.call(this, method, url, ...rest);
    };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        signals.websocket.push(args.map(String));
        return Reflect.construct(target, args);
      },
    });
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value(url) { signals.beacon.push(String(url)); return true; },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(text) { signals.clipboard.push(String(text)); return Promise.resolve(); },
        write(items) { signals.clipboard.push(String(items)); return Promise.resolve(); },
      },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value(data) { signals.share.push(data); return Promise.resolve(); },
    });
    window.open = function (...args) { signals.windowOpen.push(args.map(String)); return null; };
    const NativeURL = window.URL;
    window.URL = new Proxy(NativeURL, {
      construct(target, args) {
        signals.urlConstruct.push(args.map(String));
        return Reflect.construct(target, args);
      },
    });
    if (URL.createObjectURL) {
      URL.createObjectURL = function (value) {
        signals.objectUrl.push(String(value));
        return 'blob:curator-test-blocked';
      };
    }
    for (const method of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) {
      if (window[method]) {
        window[method] = function () {
          signals.filePicker.push(method);
          return Promise.reject(new Error('blocked by curator boundary test'));
        };
      }
    }
    if (window.indexedDB) {
      for (const method of ['open', 'deleteDatabase']) {
        const native = indexedDB[method].bind(indexedDB);
        indexedDB[method] = function (...args) {
          signals.indexedDb.push({ method, args: args.map(String) });
          return native(...args);
        };
      }
    }
    if (window.caches) {
      for (const method of ['open', 'delete']) {
        const native = caches[method].bind(caches);
        caches[method] = function (...args) {
          signals.caches.push({ method, args: args.map(String) });
          return native(...args);
        };
      }
    }
    HTMLFormElement.prototype.submit = function () {
      signals.formSubmit.push('submit');
      return undefined;
    };
    const requestSubmit = HTMLFormElement.prototype.requestSubmit;
    if (requestSubmit) {
      HTMLFormElement.prototype.requestSubmit = function () {
        signals.formSubmit.push('requestSubmit');
        return undefined;
      };
    }
    const anchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      signals.anchorClick.push(this.href);
      return anchorClick.call(this);
    };
    for (const method of ['pushState', 'replaceState']) {
      const native = history[method];
      history[method] = function (...args) {
        signals.history.push({ method, url: args[2] == null ? '' : String(args[2]) });
        return native.apply(this, args);
      };
    }
  });
}

async function backupText(page, title, editionNumber = 7, audienceOverride = null) {
  return page.evaluate(async ({ title, editionNumber, audienceOverride }) => {
    const audience = audienceOverride || FD_AUDIENCE;
    const pathId = audience === 'resident' ? 'resident-four-week' : 'ms3-six-week';
    const config = {
      audience, pathId, editionNumber,
      createdAgainstCoreRevision: FD_CORE_REVISION,
      card: {
        title, locationName: 'Example Unit', locationCode: 'EX1',
        curatorName: 'Example Curator', curatorRole: 'Attending psychiatrist',
        rotationStart: '2026-08-24', rotationEnd: '2026-09-18',
        lastVerified: '2026-08-19',
      },
      pathItems: [],
      localOrientation: {
        firstDayArrival: '', dailySchedule: '', roundsWorkflow: '',
        presentationExpectations: '', documentationExpectations: '',
        attendanceExpectations: '', feedbackProcess: '', accessPreparation: '',
        contacts: [], checklist: [], resources: [],
      },
      changeNote: '',
    };
    if (!audienceOverride) {
      const result = await fdEditionCreateEnvelope(
        config, FD_INDEX, FD_CURATOR_CONTEXT, crypto.subtle,
      );
      if (!result.ok) throw new Error(`backup creation failed: ${result.errors[0]?.code}`);
      return JSON.stringify(result.envelope);
    }
    const pre = { format: FD_EDITION_RULES.format, schemaVersion: 1, config };
    const digest = await fdEditionDigest(pre, crypto.subtle);
    return JSON.stringify({ ...pre, digest });
  }, { title, editionNumber, audienceOverride });
}

test('built curator is audience-locked, hidden, draft-aware, and network-inert', async ({
  page, request, baseURL,
}, testInfo) => {
  const expected = expectedSite(testInfo.project.name);
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('request', req => requests.push({ url: req.url(), method: req.method() }));
  await instrumentBoundaries(page);

  await page.goto(TOOL, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Faculty rotation edition builder' })).toBeVisible();
  await expect(page.locator('#curatorAudienceLock')).toHaveText(`${expected.label} audience locked`);
  await expect(page.locator('#curatorPathLock')).toHaveText(
    `${expected.pathId} · ${expected.weeks} weeks locked`,
  );
  await expect(page.getByText('Account-free and not access-controlled', { exact: true })).toBeVisible();
  await expect(page.getByText(/Pending faculty and privacy review/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Published');

  const runtime = await page.evaluate(() => ({
    audience: FD_AUDIENCE,
    pathId: FD_INDEX.path.id,
    weekCount: FD_INDEX.path.weekCount,
    context: FD_CURATOR_CONTEXT,
    projectedPayload: JSON.stringify({
      curriculum: FD_CURRICULUM,
      topicMeta: FD_TOPIC_META,
      toolRegistry: FD_TOOL_REGISTRY,
      manifest: FD_SITE_MANIFEST,
      roles: FD_ROLES,
      index: FD_INDEX,
      context: FD_CURATOR_CONTEXT,
    }),
  }));
  expect(runtime.audience).toBe(expected.audience);
  expect(runtime.pathId).toBe(expected.pathId);
  expect(runtime.weekCount).toBe(expected.weeks);
  expect(runtime.context).toEqual({
    audience: expected.audience,
    pathId: expected.pathId,
    coreRevision: expect.stringMatching(/^[0-9a-f]{40}$/),
  });
  if (expected.audience === 'resident') {
    expect(runtime.projectedPayload).not.toContain('ms3-six-week');
  }

  const generate = page.locator('#curatorGenerate');
  await expect(generate).toBeDisabled();
  await expect(generate).toHaveAttribute('aria-disabled', 'true');
  await generate.evaluate(button => {
    window.__curatorGenerateActivations = 0;
    button.addEventListener('click', () => { window.__curatorGenerateActivations += 1; });
  });
  await generate.click({ force: true });
  await generate.evaluate(button => button.focus());
  await expect(generate).not.toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__curatorGenerateActivations)).toBe(0);

  const signals = await page.evaluate(() => window.__curatorSignals);
  expect(signals.storageReads).toEqual(['cw_theme', DRAFT_KEY]);
  expect(signals.storageWrites).toEqual([]);
  expect(signals.storageWrites.every(entry => entry.args[0] === DRAFT_KEY)).toBe(true);
  expect(signals.fetch).toEqual([]);
  expect(signals.xhr).toEqual([]);
  expect(signals.beacon).toEqual([]);
  expect(signals.websocket).toEqual([]);
  expect(signals.clipboard).toEqual([]);
  expect(signals.share).toEqual([]);
  expect(signals.windowOpen).toEqual([]);
  expect(signals.objectUrl).toEqual([]);
  expect(signals.urlConstruct).toEqual([]);
  expect(signals.filePicker).toEqual([]);
  expect(signals.indexedDb).toEqual([]);
  expect(signals.caches).toEqual([]);
  expect(signals.formSubmit).toEqual([]);
  expect(signals.anchorClick).toEqual([]);
  expect(signals.history).toEqual([]);
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await expect(page.locator('form, canvas, [data-qr]')).toHaveCount(0);
  await expect(page.locator('a[href*="edition="], a[download], a[href^="blob:"], a[href^="data:"]')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');

  const nonStaticRequests = requests.filter(entry => {
    const url = new URL(entry.url);
    return ![TOOL, '/favicon.svg', '/clinical-warm.css'].includes(url.pathname);
  });
  expect(nonStaticRequests).toEqual([]);
  expect(requests.every(entry => entry.method === 'GET')).toBe(true);

  const navResponse = await request.get(`${baseURL}/nav.json`);
  expect(navResponse.ok()).toBe(true);
  const nav = await navResponse.json();
  const navMatches = nav.flatMap(section => section.items || [])
    .filter(item => item.f === 'rotation-curator.html');
  expect(navMatches).toHaveLength(1);
  expect(navMatches[0].hidden).toBe(true);

  const searchResponse = await request.get(`${baseURL}/search-index.json`);
  expect(searchResponse.ok()).toBe(true);
  const search = await searchResponse.json();
  const searchDocs = Array.isArray(search) ? search : (search.docs || []);
  expect(searchDocs.some(doc => (doc.f || doc.file || doc.path) === 'rotation-curator.html')).toBe(false);
  expect(errors).toEqual([]);
});

test('real page saves, restores, and imports only a validated audience-correct draft', async ({ page }, testInfo) => {
  const expected = expectedSite(testInfo.project.name);
  await page.goto(TOOL);
  await page.evaluate(key => localStorage.removeItem(key), DRAFT_KEY);
  await page.reload();

  await page.locator('#curatorTitle').fill('Device draft');
  await page.locator('#curatorLocationName').fill('Example Unit');
  await page.locator('#curatorLocationCode').fill('EX1');
  await page.locator('#curatorName').fill('Example Curator');
  await page.locator('#curatorRole').fill('Attending psychiatrist');
  await page.locator('#curatorRotationStart').fill('2026-08-24');
  await page.locator('#curatorRotationEnd').fill('2026-09-18');
  await page.locator('#curatorLastVerified').fill('2026-08-19');
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBeNull();

  await page.locator('#curatorSaveDraft').click();
  await expect(page.locator('#curatorSaveStatus')).toHaveText('Saved on this device');
  const savedRaw = await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY);
  expect(JSON.parse(savedRaw).config.card.title).toBe('Device draft');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /curator|edition.*draft/i.test(key))))
    .toEqual([DRAFT_KEY]);

  await page.reload();
  await expect(page.locator('#curatorTitle')).toHaveValue('Device draft');
  await expect(page.locator('#curatorSaveStatus')).toHaveText('Saved on this device');
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBe(savedRaw);

  const valid = await backupText(page, 'Imported current audience', 7);
  await page.locator('#curatorImportFile').setInputFiles({
    name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(valid),
  });
  await expect(page.locator('#curatorTitle')).toHaveValue('Imported current audience');
  await expect(page.locator('#curatorEditionNumber')).toHaveText('Edition 7');
  await expect(page.locator('#curatorSaveStatus')).toHaveText(
    'Backup imported. Save the draft to keep it on this device.',
  );
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBe(savedRaw);

  const wrongAudience = expected.audience === 'ms3' ? 'resident' : 'ms3';
  const wrong = await backupText(page, 'Wrong audience', 4, wrongAudience);
  await page.locator('#curatorImportFile').setInputFiles({
    name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from(wrong),
  });
  await expect(page.locator('#curatorSaveStatus')).toHaveText(
    'Backup could not be validated for this audience.',
  );
  await expect(page.locator('#curatorTitle')).toHaveValue('Imported current audience');
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBe(savedRaw);

  await page.locator('#curatorImportFile').setInputFiles({
    name: 'oversized.json', mimeType: 'application/json', buffer: Buffer.alloc(65537, 32),
  });
  await expect(page.locator('#curatorSaveStatus')).toHaveText('Backup must be 64 KiB or smaller.');
  await expect(page.locator('#curatorTitle')).toHaveValue('Imported current audience');
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBe(savedRaw);
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
});

test('slower imports cannot overwrite a newer import or an intervening edit', async ({ page }) => {
  await page.goto(TOOL);
  const first = await backupText(page, 'First slow import', 3);
  const second = await backupText(page, 'Second fast import', 4);
  const third = await backupText(page, 'Third slow import', 5);

  const outcome = await page.evaluate(async ({ first, second, third }) => {
    const input = document.querySelector('#curatorImportFile');
    const title = document.querySelector('#curatorTitle');
    let resolveFirst;
    let resolveThird;
    const choose = file => {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const waitForTitle = async expected => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (title.value === expected) return;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error(`Timed out waiting for ${expected}; saw ${title.value}`);
    };

    choose({ size: new TextEncoder().encode(first).length, text: () => new Promise(resolve => { resolveFirst = resolve; }) });
    choose({ size: new TextEncoder().encode(second).length, text: () => Promise.resolve(second) });
    await waitForTitle('Second fast import');
    resolveFirst(first);
    await new Promise(resolve => setTimeout(resolve, 30));
    const afterRace = title.value;

    choose({ size: new TextEncoder().encode(third).length, text: () => new Promise(resolve => { resolveThird = resolve; }) });
    title.value = 'Intervening local edit';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    resolveThird(third);
    await new Promise(resolve => setTimeout(resolve, 30));
    return { afterRace, afterEdit: title.value };
  }, { first, second, third });

  expect(outcome).toEqual({
    afterRace: 'Second fast import',
    afterEdit: 'Intervening local edit',
  });
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
});
