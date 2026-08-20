import { test, expect } from '@playwright/test';

const TOOL = '/tools/rotation-curator.html';
const DRAFT_KEY = 'cw_curator_draft_v1';

function contrastRatio(foreground, background) {
  const parse = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
  const luminance = value => parse(value).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(foreground); const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

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

async function completeCard(page) {
  await page.locator('#curatorTitle').fill('Safe local orientation');
  await page.locator('#curatorLocationName').fill('Example Unit');
  await page.locator('#curatorLocationCode').fill('EX1');
  await page.locator('#curatorName').fill('Example Curator');
  await page.locator('#curatorRole').fill('Attending psychiatrist');
  await page.locator('#curatorRotationStart').fill('2026-08-24');
  await page.locator('#curatorRotationEnd').fill('2026-09-18');
  await page.locator('#curatorLastVerified').fill('2026-08-19');
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

test('built primary and selected mobile controls retain readable computed contrast', async ({ page }) => {
  await page.goto(TOOL);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => localStorage.setItem('cw_theme', value), theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const primary = await page.locator('#curatorContinue').evaluate(node => {
      const style = getComputedStyle(node);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(contrastRatio(primary.color, primary.background), `${theme} primary`).toBeGreaterThanOrEqual(4.5);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-curator-step="4"]').click();
    await page.locator('[data-curator-local-view="preview"]').click();
    const selected = await page.locator('[data-curator-local-view="preview"]').evaluate(node => {
      const style = getComputedStyle(node);
      return { color: style.color, background: style.backgroundColor };
    });
    expect(contrastRatio(selected.color, selected.background), `${theme} selected toggle`).toBeGreaterThanOrEqual(4.5);
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

test('Step 4 is discoverable and touch-safe in the first 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(TOOL);
  await completeCard(page);
  await page.locator('[data-curator-step="4"]').click();
  const geometry = await page.evaluate(() => {
    const toggle = document.querySelector('#curatorLocalViewToggle');
    const controls = [...document.querySelectorAll(
      '.step-rail button, #curatorLocalViewToggle button, #curatorStepFour button',
    )].filter(node => getComputedStyle(node).display !== 'none');
    return {
      toggleTop: toggle.getBoundingClientRect().top,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      shortestControl: Math.min(...controls.map(node => node.getBoundingClientRect().height)),
    };
  });
  expect(geometry.toggleTop).toBeGreaterThanOrEqual(0);
  expect(geometry.toggleTop).toBeLessThan(844);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.shortestControl).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#curatorStepFour')).toBeVisible();
  await expect(page.locator('#curatorErrorSummary')).not.toBeFocused();
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed',
  );
  await page.evaluate(() => {
    window.__curatorReviewAnnouncements = 0;
    new MutationObserver(records => { window.__curatorReviewAnnouncements += records.length; })
      .observe(document.querySelector('#curatorPreviewReviewStatus'), { childList: true, characterData: true, subtree: true });
  });
  await page.locator('[data-curator-local-view="preview"]').click();
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed',
  );
  await page.locator('[data-curator-local-view="edit"]').click();
  await page.locator('#curatorFirstDayArrival').fill('Meet in the public education office.');
  expect(await page.evaluate(() => window.__curatorReviewAnnouncements)).toBe(0);
  await page.locator('#curatorReviewMobile').click();
  await expect(page.locator('#root')).toHaveAttribute('data-local-view', 'preview');
  await expect(page.locator('#root')).toHaveAttribute('data-review-viewport', 'mobile');
  await expect(page.locator('#curatorEditorMount')).toBeHidden();
  await expect(page.locator('#curatorPreviewMount')).toBeVisible();
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview reviewed',
  );
  expect(await page.evaluate(() => window.__curatorReviewAnnouncements)).toBe(1);
  await page.locator('[data-curator-local-view="edit"]').click();
  await page.locator('#curatorDailySchedule').fill('A later visible edit.');
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed',
  );
  expect(await page.evaluate(() => window.__curatorReviewAnnouncements)).toBe(2);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('Step 4 blocks unsafe pending content and binds each desktop review to its presentation', async ({ page }) => {
  await page.goto(TOOL);
  await page.evaluate(key => localStorage.removeItem(key), DRAFT_KEY);
  await completeCard(page);
  await page.locator('[data-curator-step="4"]').click();
  await expect(page.getByText('Public-link privacy boundary', { exact: true })).toBeVisible();
  await expect(page.getByText(/official HTTPS institutional link instead of copying/)).toBeVisible();

  for (const blocked of [
    'Synthetic learner Alpha evaluation is unsatisfactory.',
    'Synthetic patient Alpha has record 12345.',
    'Student Alpha received an unsatisfactory evaluation.',
    'MRN 12345 belongs to synthetic patient Alpha.',
    'Perform intervention X after supervision.',
    'Synthetic learner Alpha evaluati\u03bfn is unsatisfactory.',
    'According to the local protocol, perform intervention X.',
  ]) {
    await page.locator('#curatorFirstDayArrival').fill(blocked);
    await expect(page.locator('#curatorErrorSummary')).toBeVisible();
    await expect(page.locator('#curatorErrorSummary a')).toHaveAttribute('href', '#curatorFirstDayArrival');
    await expect(page.locator('#curatorErrorSummary')).not.toContainText(blocked);
    await expect(page.locator('#curatorErrorSummary')).not.toBeFocused();
    await page.locator('#curatorSaveDraft').evaluate(node => node.click());
    await expect(page.locator('#curatorSaveStatus')).toHaveText('Draft could not be saved on this device.');
    expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
    await expect(page.locator('#curatorFirstDayArrival')).toHaveValue(blocked);
  }
  await page.locator('#curatorFirstDayArrival').fill('Meet in the public education office.');
  await expect(page.locator('#curatorErrorSummary')).toBeHidden();

  const unsafeRole = 'Synthetic patient Alpha has record 12345.';
  await page.locator('#curatorNewContactRole').fill(unsafeRole);
  await page.locator('#curatorNewContactDirectoryUrl').fill('https://example.edu/directory');
  await page.locator('#curatorAddContact').click();
  await expect(page.locator('#curatorErrorSummary a')).toHaveAttribute('href', '#curatorNewContactRole');
  await expect(page.locator('#curatorErrorSummary')).not.toContainText(unsafeRole);
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
  await page.locator('#curatorNewContactRole').fill('');
  await page.locator('#curatorNewContactDirectoryUrl').fill('');

  const unsafeTitle = 'Synthetic learner Alpha evaluation is unsatisfactory.';
  await page.locator('#curatorNewResourceTitle').fill(unsafeTitle);
  await page.locator('#curatorNewResourceUrl').fill('https://example.edu/resource');
  await page.locator('#curatorAddResource').click();
  await expect(page.locator('#curatorErrorSummary a')).toHaveAttribute('href', '#curatorNewResourceTitle');
  await expect(page.locator('#curatorErrorSummary')).not.toContainText(unsafeTitle);
  await expect(page.locator('#curatorResourcesCap')).toHaveText('0 of 12 items');
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
  await page.locator('#curatorNewResourceTitle').fill('');
  await page.locator('#curatorNewResourceUrl').fill('');

  const unsafe = 'Synthetic patient Alpha has record 12345.';
  await page.locator('#curatorNewChecklistLabel').fill(unsafe);
  await page.locator('#curatorAddChecklist').click();
  await expect(page.locator('#curatorErrorSummary')).toBeVisible();
  await expect(page.locator('#curatorErrorSummary a')).toHaveAttribute('href', '#curatorNewChecklistLabel');
  await expect(page.locator('#curatorErrorSummary')).not.toContainText(unsafe);
  await expect(page.locator('#curatorErrorSummary')).not.toBeFocused();
  await expect(page.locator('#curatorNewChecklistLabel')).toHaveValue(unsafe);
  await expect(page.locator('#curatorChecklistCap')).toHaveText('0 of 24 items');
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBeNull();
  await page.locator('#curatorNewChecklistLabel').fill('');

  await page.locator('#curatorNewResourceTitle').fill('Official orientation protocol');
  await page.locator('#curatorNewResourceUrl').fill('http://example.edu/private?token=secret');
  await page.locator('#curatorAddResource').click();
  await expect(page.locator('#curatorErrorSummary a')).toHaveAttribute('href', '#curatorNewResourceUrl');
  await expect(page.locator('#curatorErrorSummary')).not.toBeFocused();
  await expect(page.locator('#curatorNewResourceTitle')).toHaveValue('Official orientation protocol');
  await expect(page.locator('#curatorNewResourceUrl')).toHaveValue('http://example.edu/private?token=secret');
  await expect(page.locator('#curatorResourcesCap')).toHaveText('0 of 12 items');

  await page.locator('#curatorNewResourceUrl').fill('https://example.edu/orientation?section=overview#start');
  await page.locator('#curatorAddResource').click();
  await expect(page.locator('#curatorResourcesCap')).toHaveText('1 of 12 items');
  await expect(page.locator('#curatorNewResourceTitle')).toHaveValue('');
  await expect(page.locator('#curatorNewResourceUrl')).toHaveValue('');
  await expect(page.locator('#curatorNewResourceTitleCount')).toHaveText('0 of 100 characters');
  await expect(page.locator('#curatorResourcesList')).toContainText('Visible domain: example.edu');

  await page.locator('#curatorNewChecklistLabel').fill('Confirm public meeting location');
  await page.locator('#curatorReviewDesktop').click();
  await expect(page.locator('#curatorErrorSummary')).toBeFocused();
  await expect(page.locator('#curatorErrorSummary a')).toHaveAttribute('href', '#curatorNewChecklistLabel');
  await expect(page.locator('#curatorNewChecklistLabel')).toHaveValue('Confirm public meeting location');
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed',
  );
  await page.locator('#curatorAddChecklist').click();
  await page.locator('#curatorReviewDesktop').click();
  await expect(page.locator('#root')).toHaveAttribute('data-local-view', 'preview');
  await expect(page.locator('#root')).toHaveAttribute('data-review-viewport', 'desktop');
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview reviewed · Mobile preview not yet reviewed',
  );
  await expect(page.locator('#curatorPreviewBody')).toContainText('example.edu');
  await expect(page.locator('#curatorPreviewBody')).not.toContainText('/orientation');
  await expect(page.locator('#curatorPreviewBody')).not.toContainText('section=overview');

  await page.locator('#curatorReviewMobile').click();
  await expect(page.locator('#root')).toHaveAttribute('data-review-viewport', 'mobile');
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview reviewed · Mobile preview reviewed',
  );
  expect(await page.locator('#curatorPreviewMount').evaluate(node =>
    node.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  await page.locator('#curatorFirstDayArrival').evaluate((node) => {
    node.value = '😀'.repeat(601);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#curatorFirstDayArrival')).toHaveValue('😀'.repeat(600));
  await expect(page.locator('#curatorFirstDayArrivalCount')).toHaveText('600 of 600 characters');
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed',
  );
});

test('delayed deliberate reviews cannot survive desktop/mobile layout changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(TOOL);
  await completeCard(page);
  await page.locator('[data-curator-step="4"]').click();
  await page.evaluate(() => {
    const projector = fdCuratorProjectDraft;
    window.__curatorReviewReleases = [];
    fdCuratorProjectDraft = (...args) => new Promise(resolve => {
      window.__curatorReviewReleases.push(() => projector(...args).then(resolve));
    });
  });

  await page.locator('#curatorReviewDesktop').click();
  await expect(page.locator('#curatorPreviewBody')).toContainText('Validating the desktop student preview');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#curatorPreviewBody')).not.toContainText('Validating');
  await page.evaluate(() => window.__curatorReviewReleases.shift()());
  await page.waitForTimeout(30);
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed',
  );

  await page.locator('[data-curator-local-view="edit"]').click();
  await page.locator('#curatorReviewMobile').click();
  await expect(page.locator('#root')).toHaveAttribute('data-local-view', 'preview');
  await expect(page.locator('#curatorPreviewMount')).toBeVisible();
  await expect(page.locator('#curatorPreviewBody')).toContainText('Validating the mobile student preview');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setViewportSize({ width: 1270, height: 880 });
  await expect(page.locator('#curatorPreviewBody')).not.toContainText('Validating');
  await page.evaluate(() => window.__curatorReviewReleases.shift()());
  await page.waitForTimeout(30);
  await expect(page.locator('#curatorPreviewReviewStatus')).toHaveText(
    'Desktop preview not yet reviewed · Mobile preview not yet reviewed',
  );
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
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
  await page.locator('[data-curator-step="4"]').click();
  await page.locator('#curatorNewContactRole').fill('Legacy coordinator');
  await page.locator('#curatorNewContactDirectoryUrl').fill('https://example.edu/legacy');
  await page.locator('#curatorNewChecklistLabel').fill('Legacy checklist');
  await page.locator('#curatorNewChecklistPriority').selectOption('required');
  await page.locator('#curatorNewResourceTitle').fill('Legacy resource');
  await page.locator('#curatorNewResourceUrl').fill('http://example.edu/private');
  await page.locator('#curatorNewResourcePriority').selectOption('optional');
  await page.locator('#curatorNewResourceWeek').selectOption('2');
  await page.locator('#curatorNewResourceRationale').fill('Legacy rationale');
  await page.locator('#curatorAddResource').click();
  await expect(page.locator('#curatorErrorSummary')).toBeVisible();
  await page.locator('#curatorImportFile').setInputFiles({
    name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(valid),
  });
  await expect(page.locator('#curatorTitle')).toHaveValue('Imported current audience');
  await expect(page.locator('#curatorEditionNumber')).toHaveText('Edition 7');
  await expect(page.locator('#curatorSaveStatus')).toHaveText(
    'Backup imported. Save the draft to keep it on this device.',
  );
  await page.locator('[data-curator-step="4"]').click();
  for (const id of [
    '#curatorNewContactRole', '#curatorNewContactDirectoryUrl', '#curatorNewChecklistLabel',
    '#curatorNewResourceTitle', '#curatorNewResourceUrl', '#curatorNewResourceRationale',
  ]) await expect(page.locator(id)).toHaveValue('');
  await expect(page.locator('#curatorNewChecklistPriority')).toHaveValue('recommended');
  await expect(page.locator('#curatorNewResourcePriority')).toHaveValue('recommended');
  await expect(page.locator('#curatorNewResourceWeek')).toHaveValue('1');
  await expect(page.locator('#curatorErrorSummary')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBe(savedRaw);

  const wrongAudience = expected.audience === 'ms3' ? 'resident' : 'ms3';
  const wrong = await backupText(page, 'Wrong audience', 4, wrongAudience);
  await page.locator('#curatorNewChecklistLabel').fill('Correction survives failed import');
  await page.locator('#curatorImportFile').setInputFiles({
    name: 'wrong.json', mimeType: 'application/json', buffer: Buffer.from(wrong),
  });
  await expect(page.locator('#curatorSaveStatus')).toHaveText(
    'Backup could not be validated for this audience.',
  );
  await expect(page.locator('#curatorTitle')).toHaveValue('Imported current audience');
  await expect(page.locator('#curatorNewChecklistLabel')).toHaveValue('Correction survives failed import');
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

test('navigation and schedule no-ops preserve a pending valid import', async ({ page }) => {
  await page.goto(TOOL);
  const pending = await backupText(page, 'No-op import wins', 8);

  const outcome = await page.evaluate(async pendingText => {
    const input = document.querySelector('#curatorImportFile');
    const observed = [];
    const root = document.querySelector('#root');
    for (const type of ['change', 'click', 'input']) {
      root.addEventListener(type, event => {
        if (event.target.matches('[data-curator-path-week], [data-curator-path-up], [data-curator-path-priority], [data-curator-path-rationale]')) {
          observed.push(type);
        }
      }, true);
    }
    let resolveImport;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{
        size: new TextEncoder().encode(pendingText).length,
        text: () => new Promise(resolve => { resolveImport = resolve; }),
      }],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    document.querySelector('[data-curator-step="3"]').click();
    let first = document.querySelector('[data-curator-week] [data-curator-instance]');
    const firstId = first.getAttribute('data-curator-instance');
    let week = first.querySelector('[data-curator-path-week]');
    const currentWeek = week.value;
    week.dispatchEvent(new Event('change', { bubbles: true }));
    const weekWasReplaced = !week.isConnected;
    first = document.querySelector(`[data-curator-instance="${firstId}"]`);
    week = first.querySelector('[data-curator-path-week]');
    const currentWeekPreserved = first.isConnected && week.value === currentWeek;
    let up = document.querySelector(
      `[data-curator-week="${currentWeek}"] [data-curator-instance]:first-child [data-curator-path-up]`,
    );
    const boundaryId = up.getAttribute('data-curator-path-up');
    up.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    const upWasReplaced = !up.isConnected;
    up = document.querySelector(`[data-curator-path-up="${boundaryId}"]`);
    const boundaryPreserved = up.isConnected && up.disabled;

    document.querySelector('[data-curator-step="2"]').click();
    let priority = document.querySelector('[data-curator-path-priority]');
    const placementId = priority.getAttribute('data-curator-path-priority');
    const currentPriority = priority.value;
    priority.dispatchEvent(new Event('change', { bubbles: true }));
    const priorityWasReplaced = !priority.isConnected;
    priority = document.querySelector(`[data-curator-path-priority="${placementId}"]`);
    const priorityPreserved = priority.isConnected && priority.value === currentPriority;
    const rationale = document.querySelector(`[data-curator-path-rationale="${placementId}"]`);
    const currentRationale = rationale.value;
    rationale.dispatchEvent(new Event('input', { bubbles: true }));
    const rationaleObserved = rationale.isConnected && rationale.value === currentRationale;
    const bogus = document.createElement('button');
    bogus.setAttribute('data-curator-path-remove', 'core:missing.md:1');
    document.querySelector('#root').appendChild(bogus);
    bogus.click();
    bogus.remove();

    resolveImport(pendingText);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (document.querySelector('#curatorTitle').value === 'No-op import wins') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    return {
      title: document.querySelector('#curatorTitle').value,
      weekWasReplaced, currentWeekPreserved, upWasReplaced, boundaryPreserved,
      priorityWasReplaced, priorityPreserved, rationaleObserved, observed,
    };
  }, pending);

  expect(outcome).toEqual({
    title: 'No-op import wins',
    weekWasReplaced: true,
    currentWeekPreserved: true,
    upWasReplaced: true,
    boundaryPreserved: true,
    priorityWasReplaced: true,
    priorityPreserved: true,
    rationaleObserved: true,
    observed: ['change', 'click', 'change', 'input'],
  });
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
});

test('an imported Step 1 draft cancels an older delayed preview', async ({ page }) => {
  await page.goto(TOOL);
  const imported = await backupText(page, 'Imported while preview waited', 10);
  await page.evaluate(() => {
    window.__releaseStalePreview = null;
    fdCuratorProjectDraft = () => new Promise(resolve => {
      window.__releaseStalePreview = () => resolve({
        ok: true,
        index: {
          weeks: [{
            n: 1,
            items: [{ title: 'STALE PRE-IMPORT CONTENT', editionPriority: 'required' }],
          }],
          columns: [],
        },
      });
    });
  });
  await page.locator('[data-curator-step="2"]').click();
  await expect(page.locator('#curatorPreviewBody')).toContainText('Updating the validated student preview');
  await page.locator('#curatorImportFile').setInputFiles({
    name: 'imported.json', mimeType: 'application/json', buffer: Buffer.from(imported),
  });
  await expect(page.locator('#curatorTitle')).toHaveValue('Imported while preview waited');
  await expect(page.locator('#curatorPreviewBody')).toHaveText(
    'Preview is read-only and updates from the validated curriculum and schedule.',
  );
  await page.evaluate(() => window.__releaseStalePreview());
  await page.waitForTimeout(30);
  await expect(page.locator('#curatorTitle')).toHaveValue('Imported while preview waited');
  await expect(page.locator('#curatorPreviewBody')).toHaveText(
    'Preview is read-only and updates from the validated curriculum and schedule.',
  );
  await expect(page.locator('#curatorPreviewBody')).not.toContainText('STALE PRE-IMPORT CONTENT');
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
});

test('hostile stored schedules fail clean and repeated keyboard controls target one placement', async ({ page }, testInfo) => {
  const expected = expectedSite(testInfo.project.name);
  await page.goto(TOOL);
  await page.locator('#curatorSaveDraft').click();
  const hostileRaw = await page.evaluate(key => {
    const draft = JSON.parse(localStorage.getItem(key));
    draft.config.pathItems[0].ref = 'hostile-not-in-library.md';
    draft.config.pathItems[0].instanceId = 'core:hostile-not-in-library.md:1';
    const raw = JSON.stringify(draft);
    localStorage.setItem(key, raw);
    return raw;
  }, DRAFT_KEY);
  await page.reload();

  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_KEY)).toBe(hostileRaw);
  await expect(page.locator('[data-curator-ref="hostile-not-in-library.md"]')).toHaveCount(0);
  await expect(page.locator('#curatorTitle')).toHaveValue('');
  await page.locator('[data-curator-step="3"]').click();
  await expect(page.locator('[data-curator-instance="core:hostile-not-in-library.md:1"]')).toHaveCount(0);

  await page.locator('[data-curator-step="2"]').click();
  const repeat = page.locator('[data-curator-path-add]').first();
  const ref = await repeat.getAttribute('data-curator-path-add');
  await repeat.click();

  const priorityControls = page.locator(`[data-curator-path-priority^="core:${ref}:"]`);
  const rationaleControls = page.locator(`[data-curator-path-rationale^="core:${ref}:"]`);
  await expect(priorityControls).toHaveCount(2);
  await expect(rationaleControls).toHaveCount(2);
  for (const controls of [priorityControls, rationaleControls]) {
    const names = await controls.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    expect(new Set(names).size).toBe(2);
    expect(names.every(name => /placement \d+, position \d+ of \d+ in Week \d+/.test(name))).toBe(true);
  }

  const editRaceBackup = await backupText(page, 'Edit race must lose', 9);
  await page.evaluate(pendingText => {
    const input = document.querySelector('#curatorImportFile');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{
        size: new TextEncoder().encode(pendingText).length,
        text: () => new Promise(resolve => { window.__resolveEditRace = resolve; }),
      }],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, editRaceBackup);
  const beforePriorities = await priorityControls.evaluateAll(nodes => nodes.map(node => node.value));
  await priorityControls.nth(1).focus();
  await page.keyboard.press('o');
  await rationaleControls.nth(1).focus();
  await page.keyboard.type('Only this placement rationale');
  await page.evaluate(text => window.__resolveEditRace(text), editRaceBackup);
  await page.waitForTimeout(30);
  const afterPriorities = await priorityControls.evaluateAll(nodes => nodes.map(node => node.value));
  expect(afterPriorities[0]).toBe(beforePriorities[0]);
  expect(afterPriorities[1]).toBe('optional');
  await expect(rationaleControls.nth(0)).toHaveValue('');
  await expect(rationaleControls.nth(1)).toHaveValue('Only this placement rationale');
  await expect(page.locator('#curatorTitle')).not.toHaveValue('Edit race must lose');

  await page.locator('[data-curator-step="3"]').click();

  const repeated = page.locator('[data-curator-instance]').filter({
    has: page.locator(`[data-curator-path-remove^="core:${ref}:"]`),
  });
  await expect(repeated).toHaveCount(2);
  const ids = await repeated.evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-curator-instance')));

  for (const attribute of [
    'data-curator-path-up', 'data-curator-path-down',
    'data-curator-path-week', 'data-curator-path-remove',
  ]) {
    const names = await page.locator(`[${attribute}^="core:${ref}:"]`).evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('aria-label')));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.every(name => /placement \d+/.test(name))).toBe(true);
    expect(names.every(name => /position \d+ of \d+/.test(name))).toBe(true);
  }

  const removeTarget = page.locator(`[data-curator-path-remove="${ids[1]}"]`);
  const moveTarget = page.locator(`[data-curator-path-up="${ids[1]}"]`);
  const beforeMoveName = await moveTarget.getAttribute('aria-label');
  await moveTarget.focus();
  await expect(moveTarget).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-curator-instance="${ids[1]}"]`)).toHaveCount(1);
  expect(await page.locator(`[data-curator-path-up="${ids[1]}"]`).getAttribute('aria-label'))
    .not.toBe(beforeMoveName);
  await removeTarget.focus();
  await expect(removeTarget).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator(`[data-curator-instance="${ids[1]}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-curator-instance="${ids[0]}"]`)).toHaveCount(1);
  await expect(page.locator('[data-curator-week]')).toHaveCount(expected.weeks);
  await expect(page.locator('#curatorGenerate')).toBeDisabled();
});
