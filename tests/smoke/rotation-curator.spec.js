import { test, expect } from '@playwright/test';

const TOOL = '/tools/rotation-curator.html';

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
      Storage.prototype[method] = function (...args) {
        signals.storageWrites.push({ method, args: args.map(String) });
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

test('built curator is audience-locked, hidden, inert, and non-persistent', async ({
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

  const runtime = await page.evaluate(() => ({
    audience: FD_AUDIENCE,
    pathId: FD_INDEX.path.id,
    weekCount: FD_INDEX.path.weekCount,
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
  expect(signals.storageReads).toEqual(['cw_theme']);
  expect(signals.storageReads).not.toContain('cw_curator_draft_v1');
  expect(signals.storageReads.filter(key => /curator|edition.*draft/i.test(key))).toEqual([]);
  expect(signals.storageWrites).toEqual([]);
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
  await expect(page.locator('input[type="file"], form, canvas, [data-qr]')).toHaveCount(0);
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
