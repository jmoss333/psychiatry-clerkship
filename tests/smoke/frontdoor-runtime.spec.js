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
const EDITION_PROJECT_SOURCE = readFileSync(new URL(
  '../../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js',
  import.meta.url,
), 'utf8');
const EDITION_STUDENT_SOURCE = readFileSync(new URL(
  '../../13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js',
  import.meta.url,
), 'utf8');
// The browser cases generate envelopes with the shipped contract. They never manufacture or
// brand a validation result; the learner runtime independently validates every serialized link.
// eslint-disable-next-line no-new-func
const EDITION_CONTRACT = new Function(`${EDITION_CONTRACT_SOURCE}\nreturn {
  fdEditionCreateEnvelope,fdEditionCanonicalJson,fdEditionValidateEnvelope
};`)();
// The switch failure cases run the shipped learner transaction against fallible boundary
// adapters. Only the browser APIs are doubled; validation, commit, rollback, and recovery
// decisions are the production implementation.
// eslint-disable-next-line no-new-func
const EDITION_RUNTIME = new Function(`${EDITION_CONTRACT_SOURCE}\n${EDITION_PROJECT_SOURCE}\n${EDITION_STUDENT_SOURCE}\nreturn {
  fdEditionValidateEnvelope,fdEditionRuntimeInputs,fdEditionRuntimeMountSwitch,
  fdEditionRuntimeRecover:typeof fdEditionRuntimeRecover==='function'?fdEditionRuntimeRecover:null,
  fdEditionActiveIdentity:typeof fdEditionActiveIdentity==='function'?fdEditionActiveIdentity:null,
  fdEditionLocalToggleAllowed,fdEditionToggleLocalProgress,fdEditionReadLocalProgress
};`)();
const VALID_PLACEMENT = {
  takenAt: '2026-08-17T00:00:00.000Z',
  answers: [{ id: 'synthetic-placement', cat: 'safety', correct: false }],
  byCat: { safety: { n: 1, correct: 0 } },
};

async function installEditionRuntimeProbe(page, options = {}) {
  await page.addInitScript(({ editionKey, localKey, logKey, throwHistory, listenerFault, startupFault }) => {
    const originalSetItem = Storage.prototype.setItem;
    const originalGetItem = Storage.prototype.getItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalReplaceState = History.prototype.replaceState;
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    const originalQuerySelector = Element.prototype.querySelector;
    const originalFetch = window.fetch.bind(window);
    const originalSetTimeout = window.setTimeout.bind(window);
    const innerHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const eventKey = `${logKey}_events`;
    const planStorageKey = `${logKey}_plan-storage`;
    const readLog = () => {
      try { return JSON.parse(sessionStorage.getItem(logKey) || '[]'); } catch { return []; }
    };
    const readEvents = () => {
      try { return JSON.parse(sessionStorage.getItem(eventKey) || '[]'); } catch { return []; }
    };
    const readPlanStorage = () => {
      try { return JSON.parse(sessionStorage.getItem(planStorageKey) || '[]'); } catch { return []; }
    };
    const recordPlanStorage = (operation, key) => {
      if (key !== 'cw_plan_v1' && key !== 'cw_pretest_v1' && key !== 'cw_shelf_date') return;
      const operations = readPlanStorage();
      operations.push([operation, key]);
      originalSetItem.call(window.sessionStorage, planStorageKey, JSON.stringify(operations));
      window.__fdPlanStorageOps = operations;
    };
    const record = (event) => {
      const events = readEvents();
      events.push(event);
      originalSetItem.call(window.sessionStorage, eventKey, JSON.stringify(events));
      window.__fdEditionEvents = events;
    };
    window.__fdMeaningfulRenders = [];
    window.__fdEditionWrites = readLog();
    window.__fdEditionEvents = readEvents();
    window.__fdPlanStorageOps = readPlanStorage();
    window.__fdStartupListenerFires = [];
    window.__fdUnhandledRejections = [];
    window.__fdResourceAbortCount = 0;
    window.addEventListener('unhandledrejection', (event) => {
      window.__fdUnhandledRejections.push(String(event.reason?.message || event.reason || 'unknown'));
    });
    window.fetch = function startupResourceFetch(input, init) {
      const url = String(input?.url || input || '');
      if (!url.includes('content/orientation.md') || !location.search.includes('startup-async')) {
        return originalFetch(input, init);
      }
      if (startupFault === 'markdown-hang') {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            window.__fdResourceAbortCount += 1;
            reject(new DOMException('private startup abort', 'AbortError'));
          }, { once: true });
        });
      }
      if (startupFault === 'markdown-reject' || startupFault === 'markdown-delayed-reject') {
        return new Promise((_resolve, reject) => originalSetTimeout(
          () => reject(new Error('private delayed markdown rejection')),
          startupFault === 'markdown-delayed-reject' ? 300 : 40,
        ));
      }
      if (['markdown-mount', 'markdown-success', 'markdown-slow-interaction'].includes(startupFault)) {
        return Promise.resolve({
          ok: true,
          text: () => new Promise((resolve) => originalSetTimeout(() => {
            record(['resource-text', startupFault]);
            resolve('# Orientation\n\nDelayed startup markdown.');
          }, startupFault === 'markdown-slow-interaction' ? 300 : 40)),
        });
      }
      return originalFetch(input, init);
    };
    window.setTimeout = function startupResourceTimeout(handler, delay, ...args) {
      const actual = startupFault === 'markdown-hang' && delay === 8000 ? 30 : delay;
      return originalSetTimeout(handler, actual, ...args);
    };
    const startupListeners = [];
    const targetLabel = (target) => target === window ? 'window'
      : (target === document ? 'document' : (target instanceof Element && target.id === 'fdApp' ? 'fdApp' : ''));
    const startupType = (label, type) => (
      (label === 'window' && ['resize', 'keydown', 'popstate', 'message'].includes(type))
      || (label === 'document' && type === 'click')
      || (label === 'fdApp' && ['click', 'input'].includes(type))
    );
    let rootListenerCalls = 0;
    EventTarget.prototype.addEventListener = function addEventListener(type, handler, options) {
      const label = targetLabel(this);
      if (label === 'fdApp') {
        rootListenerCalls += 1;
        if (listenerFault === 'root-always'
          || (listenerFault === 'root-third' && rootListenerCalls === 3)) {
          throw new Error('private root listener failure');
        }
      }
      if (this === window && listenerFault === 'window-message' && type === 'message') {
        throw new Error('private window listener failure');
      }
      if (this === document && listenerFault === 'document-click' && type === 'click') {
        throw new Error('private document listener failure');
      }
      if (startupType(label, type)) {
        const capture = options === true || Boolean(options && options.capture);
        const wrapped = function startupListenerProbe(...args) {
          window.__fdStartupListenerFires.push(`${label}:${type}`);
          return handler.apply(this, args);
        };
        const record = { target: this, label, type, handler, wrapped, capture, active: true };
        startupListeners.push(record);
        originalAddEventListener.call(this, type, wrapped, options);
        if ((listenerFault === 'root-register-then-throw' && label === 'fdApp' && type === 'input')
          || (listenerFault === 'window-register-then-throw' && label === 'window' && type === 'popstate')
          || (listenerFault === 'document-register-then-throw' && label === 'document' && type === 'click')) {
          throw new Error('private post-registration listener failure');
        }
        return;
      }
      return originalAddEventListener.call(this, type, handler, options);
    };
    EventTarget.prototype.removeEventListener = function removeEventListener(type, handler, options) {
      const capture = options === true || Boolean(options && options.capture);
      for (let index = startupListeners.length - 1; index >= 0; index -= 1) {
        const record = startupListeners[index];
        if (record.active && record.target === this && record.type === type
          && record.handler === handler && record.capture === capture) {
          record.active = false;
          return originalRemoveEventListener.call(this, type, record.wrapped, options);
        }
      }
      return originalRemoveEventListener.call(this, type, handler, options);
    };
    window.__fdActiveStartupListeners = () => startupListeners
      .filter(({ active }) => active).map(({ label, type }) => `${label}:${type}`);
    Element.prototype.querySelector = function querySelector(selector) {
      if (this.id === 'fdApp' && listenerFault === 'root-query') {
        throw new Error('private root query failure');
      }
      if (this.id === 'content' && selector === '.fd-article__body'
        && location.search.includes('startup-async')) {
        record(['resource-hydrate', location.search.includes('tool') ? 'tool' : 'markdown']);
      }
      return originalQuerySelector.call(this, selector);
    };
    History.prototype.replaceState = function replaceState(state, title, url) {
      record(['history', String(url)]);
      if (throwHistory && location.hash) throw new Error('private history failure');
      if (startupFault === 'commit-history' && location.search.includes('startup-fault')
        && !location.hash && state?.fd === true) {
        throw new Error('private final startup commit failure');
      }
      return originalReplaceState.call(this, state, title, url);
    };
    let progressMounts = 0;
    let resourceMountFaults = 0;
    let delayedMarkdownMountFaults = 0;
    Object.defineProperty(Element.prototype, 'innerHTML', {
      configurable: innerHtml.configurable,
      enumerable: innerHtml.enumerable,
      get: innerHtml.get,
      set(value) {
        if (this.id === 'content' && typeof value === 'string'
          && location.search.includes('startup-fault') && value.includes('id="pgRoot"')) {
          progressMounts += 1;
          if ((startupFault === 'progress-first' && progressMounts === 1)
            || (startupFault === 'progress-second' && progressMounts === 2)) {
            throw new Error('private initial progress mount failure');
          }
        }
        if (this.id === 'content' && location.search.includes('startup-fault-resource')
          && startupFault === 'resource-open' && typeof value === 'string'
          && (value.includes('<iframe class="toolframe"')
            || (resourceMountFaults === 1 && value.includes('Page unavailable')))) {
          resourceMountFaults += 1;
          throw new Error('private initial resource opening failure');
        }
        if (this.id === 'content' && startupFault === 'markdown-mount'
          && location.search.includes('startup-async-markdown-mount')
          && typeof value === 'string' && value.includes('Delayed startup markdown.')
          && delayedMarkdownMountFaults === 0) {
          delayedMarkdownMountFaults += 1;
          throw new Error('private delayed markdown mount failure');
        }
        if (this.id === 'governanceMount' && location.search.includes('startup-fault-edition-dialog')
          && startupFault === 'edition-dialog' && typeof value === 'string'
          && value.includes('<dialog class="fd-edition-switch"')) {
          throw new Error('private edition dialog insertion failure');
        }
        if (this.id === 'content' && typeof value === 'string'
          && /fd-(?:today|path|library|reader|setup)/.test(value) && !value.includes('skel')) {
          record(['render-sync', value.includes('fd-today') ? 'today' : 'other']);
        }
        return innerHtml.set.call(this, value);
      },
    });
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === window.localStorage) recordPlanStorage('set', key);
      if (this === window.localStorage && (key === editionKey || key === localKey)) {
        const writes = readLog();
        writes.push([key, String(value)]);
        originalSetItem.call(window.sessionStorage, logKey, JSON.stringify(writes));
        window.__fdEditionWrites = writes;
        record(['write', key]);
      }
      return originalSetItem.call(this, key, value);
    };
    Storage.prototype.getItem = function getItem(key) {
      if (this === window.localStorage) recordPlanStorage('get', key);
      return originalGetItem.call(this, key);
    };
    Storage.prototype.removeItem = function removeItem(key) {
      if (this === window.localStorage) recordPlanStorage('remove', key);
      return originalRemoveItem.call(this, key);
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
      record(['render', content.querySelector('.fd-today .fd-list .fd-row__title')?.textContent || '']);
    }).observe(document, { childList: true, subtree: true });
  }, {
    editionKey: EDITION_KEY,
    localKey: LOCAL_EDITION_KEY,
    logKey: EDITION_WRITE_LOG,
    throwHistory: options.throwHistory === true,
    listenerFault: options.listenerFault || '',
    startupFault: options.startupFault || '',
  });
}

test('slow edition resource startup rejects every pre-commit learner interaction without losing ownership', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page, { startupFault: 'markdown-slow-interaction' });
  const incoming = await createSyntheticEdition(testInfo, 2);
  await page.goto('/');
  await seedEditionLearner(page);
  await resetEditionWriteLog(page);

  const expectedSearch = '?page=orientation.md&case=startup-async-gate';
  await page.goto(`${expectedSearch}#edition=${incoming.payload}`);
  await expect(page.locator('#fdApp')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#fdApp')).toHaveAttribute('inert', '');
  const beforeStorage = await localStorageSnapshot(page);
  const beforeUrl = page.url();
  const beforeHistory = await page.evaluate(() => history.state);

  const attempts = await page.evaluate(() => {
    const app = document.querySelector('#fdApp');
    const click = document.createElement('button');
    click.setAttribute('data-fd-tab', 'path');
    app.appendChild(click);
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    click.dispatchEvent(clickEvent);

    const input = document.createElement('input');
    input.className = 'fd-searchpanel__input';
    input.value = 'precommit mutation attempt';
    app.appendChild(input);
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    input.dispatchEvent(inputEvent);

    const keyEvent = new KeyboardEvent('keydown', {
      key: '/', bubbles: true, cancelable: true,
    });
    window.dispatchEvent(keyEvent);

    const popEvent = new Event('popstate', { cancelable: true });
    Object.defineProperty(popEvent, 'state', {
      value: { fd: true, state: { tab: 'path', openId: null } },
    });
    window.dispatchEvent(popEvent);
    return {
      prevented: [clickEvent, inputEvent, keyEvent, popEvent].map((event) => event.defaultPrevented),
      listenerCount: window.__fdActiveStartupListeners().length,
      route: location.pathname + location.search,
      historyState: history.state,
      hasSearch: Boolean(document.querySelector('.fd-search')),
      hasPath: Boolean(document.querySelector('.fd-path')),
    };
  });

  expect(attempts.prevented).toEqual([true, true, true, true]);
  expect(attempts.listenerCount).toBe(8);
  expect(attempts.route).toBe(`/${expectedSearch}`);
  expect(attempts.historyState).toEqual(beforeHistory);
  expect(attempts.hasSearch).toBe(false);
  expect(attempts.hasPath).toBe(false);
  expect(page.url()).toBe(beforeUrl);
  expect(await localStorageSnapshot(page)).toEqual(beforeStorage);
  await expect(page.locator('#fdApp')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#fdApp')).toHaveAttribute('inert', '');

  await expect(page.locator('.fd-article__body')).toContainText('Delayed startup markdown.');
  await expect(page.locator('#fdApp')).not.toHaveAttribute('aria-busy');
  await expect(page.locator('#fdApp')).not.toHaveAttribute('inert');
  await expect(page).toHaveURL(new RegExp(`${expectedSearch.replace(/[.?]/g, '\\$&')}$`));
  expect(await page.evaluate(() => history.state)).toMatchObject({
    fd: true, state: { openId: 'orientation.md', tab: 'today' },
  });
  expect((await editionEvents(page)).filter(([kind]) => kind === 'resource-hydrate')).toHaveLength(1);
  expect((await editionWrites(page)).map(([key]) => key)).toEqual([LOCAL_EDITION_KEY, EDITION_KEY]);
  expect(await page.evaluate(() => window.__fdUnhandledRejections)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('the attending handoff stays secondary, readable, and locally scoped at 390px', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  const coreBefore = await page.evaluate(() => localStorage.getItem('cw_progress_v1'));

  await page.goto(`/?case=edition-phone#edition=${incoming.payload}`);
  const continueCard = page.locator('.fd-continue');
  const editionCard = page.locator('.fd-edition-card');
  const orientation = page.locator('[data-edition-orientation]');
  await expect(continueCard).toBeVisible();
  await expect(editionCard).toBeVisible();
  await expect(orientation).toBeVisible();
  expect(await page.evaluate(() => {
    const setup = document.querySelector('.fd-continue,.fd-setupcta');
    const edition = document.querySelector('.fd-edition-card');
    const local = document.querySelector('[data-edition-orientation]');
    return Boolean(setup && edition && local
      && (setup.compareDocumentPosition(edition) & Node.DOCUMENT_POSITION_FOLLOWING)
      && (edition.compareDocumentPosition(local) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);

  await expect(editionCard).not.toHaveAttribute('open');
  await expect(editionCard.locator('summary')).toContainText('Locally curated');
  await expect(editionCard.locator('.fd-edition-card__fingerprint')).toHaveText(incoming.fingerprint);
  await editionCard.locator('summary').click();
  await expect(editionCard).toHaveAttribute('open', '');
  await expect(editionCard).toContainText('Identity not digitally verified.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const toggle = orientation.locator('[data-fd-local-toggle="checklist"]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveCSS('min-height', '44px');
  await toggle.evaluate((node) => { node.dataset.runtimeIdentity = 'stable'; });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('data-runtime-identity', 'stable');
  expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(coreBefore);
  expect(await page.evaluate(({ key, fingerprint, id }) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved.byFingerprint[fingerprint].checklist[id];
  }, { key: LOCAL_EDITION_KEY, fingerprint: incoming.fingerprint, id: 'local:check:1' })).toBe(true);
});

test('delayed startup fallback preserves concurrent core and unrelated storage', async ({ page, context }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page, { startupFault: 'markdown-delayed-reject' });
  const incoming = await createSyntheticEdition(testInfo, 2);
  await page.goto('/');
  await seedEditionLearner(page);
  await page.evaluate(({ placement }) => {
    localStorage.setItem('cw_last', 'welcome.md');
    localStorage.setItem('cw_plan_v1', '{broken-plan-byte-sequence');
    localStorage.setItem('cw_pretest_v1', JSON.stringify(placement));
    localStorage.setItem('cw_qb_v1', '{"before":true}');
  }, { placement: VALID_PLACEMENT });

  const startup = page.goto(`/?page=orientation.md&case=startup-async-concurrent-fallback#edition=${incoming.payload}`);
  await expect(page.locator('#fdApp')).toHaveAttribute('inert', '');
  await expect(page.locator('.fd-article__body')).toContainText('Loading');
  const other = await context.newPage();
  await other.goto('/nav.json');
  const concurrent = {
    progress: '{"synthetic-core":{"done":true},"other-tab":{"done":true}}',
    questions: '{"before":true,"other-tab":{"correct":true}}',
  };
  await other.evaluate((values) => {
    localStorage.setItem('cw_progress_v1', values.progress);
    localStorage.setItem('cw_qb_v1', values.questions);
    localStorage.setItem('cw_concurrent_v1', 'new-cw-value');
    localStorage.setItem('rp_concurrent_v1', 'new-rp-value');
  }, concurrent);
  await startup;

  await expect(page.locator('.fd-edition-error[role="alert"]')).toContainText('EDITION_RUNTIME');
  await expect(page.locator('#fdApp')).not.toHaveAttribute('inert');
  expect(await page.evaluate(({ editionKey, localKey }) => ({
    progress: localStorage.getItem('cw_progress_v1'),
    questions: localStorage.getItem('cw_qb_v1'),
    cw: localStorage.getItem('cw_concurrent_v1'),
    rp: localStorage.getItem('rp_concurrent_v1'),
    edition: localStorage.getItem(editionKey),
    local: localStorage.getItem(localKey),
    last: localStorage.getItem('cw_last'),
    plan: localStorage.getItem('cw_plan_v1'),
  }), { editionKey: EDITION_KEY, localKey: LOCAL_EDITION_KEY })).toEqual({
    progress: concurrent.progress,
    questions: concurrent.questions,
    cw: 'new-cw-value',
    rp: 'new-rp-value',
    edition: null,
    local: null,
    last: 'welcome.md',
    plan: '{broken-plan-byte-sequence',
  });
  expect(pageErrors).toEqual([]);
  await other.close();
});

test('browser startup journal preserves an intermediate concurrent plan value per key', async ({ page, context }) => {
  await page.goto('/');
  await page.addScriptTag({ content: EDITION_STUDENT_SOURCE });
  await page.evaluate(() => {
    localStorage.setItem('cw_plan_v1', 'plan-A');
    localStorage.setItem('cw_frontdoor_v1', 'frontdoor-A');
    window.__fdRoundTwoJournal = fdEditionStartupJournal(
      localStorage, ['cw_plan_v1', 'cw_frontdoor_v1'],
    );
    fdEditionStartupJournalRun(window.__fdRoundTwoJournal, ['cw_plan_v1'], () => {
      localStorage.setItem('cw_plan_v1', 'plan-B');
    });
    fdEditionStartupJournalRun(window.__fdRoundTwoJournal, ['cw_frontdoor_v1'], () => {
      localStorage.setItem('cw_frontdoor_v1', 'frontdoor-B');
    });
    fdEditionStartupJournalRun(window.__fdRoundTwoJournal, ['cw_plan_v1'], () => {
      localStorage.setItem('cw_plan_v1', 'plan-C');
    });
  });

  const other = await context.newPage();
  await other.goto('/nav.json');
  await other.evaluate(() => localStorage.setItem('cw_plan_v1', 'plan-B'));
  expect(await page.evaluate(() => fdEditionStartupJournalRollback(window.__fdRoundTwoJournal))).toBe(true);
  expect(await page.evaluate(() => ({
    plan: localStorage.getItem('cw_plan_v1'),
    frontdoor: localStorage.getItem('cw_frontdoor_v1'),
  }))).toEqual({ plan: 'plan-B', frontdoor: 'frontdoor-A' });
  await other.close();
});

test('browser startup preflight prevents a conflicted multi-key phase from writing', async ({ page, context }) => {
  await page.goto('/');
  await page.addScriptTag({ content: EDITION_STUDENT_SOURCE });
  await page.evaluate(() => {
    localStorage.setItem('cw_plan_v1', 'plan-A');
    localStorage.setItem('cw_frontdoor_v1', 'frontdoor-A');
    window.__fdRoundThreeJournal = fdEditionStartupJournal(
      localStorage, ['cw_plan_v1', 'cw_frontdoor_v1'],
    );
    fdEditionStartupJournalRun(
      window.__fdRoundThreeJournal, ['cw_plan_v1', 'cw_frontdoor_v1'], () => {
        localStorage.setItem('cw_plan_v1', 'plan-B');
        localStorage.setItem('cw_frontdoor_v1', 'frontdoor-B');
      },
    );
    window.__fdRoundThreeCalls = 0;
  });

  const other = await context.newPage();
  await other.goto('/nav.json');
  await other.evaluate(() => localStorage.setItem('cw_plan_v1', 'plan-D'));
  expect(await page.evaluate(() => fdEditionStartupJournalRun(
    window.__fdRoundThreeJournal, ['cw_plan_v1', 'cw_frontdoor_v1'], () => {
      window.__fdRoundThreeCalls += 1;
      localStorage.setItem('cw_plan_v1', 'plan-C');
      localStorage.setItem('cw_frontdoor_v1', 'frontdoor-C');
    },
  ).ok)).toBe(false);
  expect(await page.evaluate(() => ({
    calls: window.__fdRoundThreeCalls,
    plan: localStorage.getItem('cw_plan_v1'),
    frontdoor: localStorage.getItem('cw_frontdoor_v1'),
  }))).toEqual({ calls: 0, plan: 'plan-D', frontdoor: 'frontdoor-B' });

  expect(await page.evaluate(() => fdEditionStartupJournalRollback(window.__fdRoundThreeJournal))).toBe(false);
  expect(await page.evaluate(() => ({
    plan: localStorage.getItem('cw_plan_v1'),
    frontdoor: localStorage.getItem('cw_frontdoor_v1'),
  }))).toEqual({ plan: 'plan-D', frontdoor: 'frontdoor-A' });
  await other.close();
});

async function resetEditionWriteLog(page) {
  await page.evaluate((logKey) => {
    sessionStorage.setItem(logKey, '[]');
    sessionStorage.setItem(`${logKey}_events`, '[]');
    window.__fdEditionWrites = [];
    window.__fdEditionEvents = [];
  }, EDITION_WRITE_LOG);
}

async function resetPlanStorageLog(page) {
  await page.evaluate((logKey) => {
    sessionStorage.setItem(`${logKey}_plan-storage`, '[]');
    window.__fdPlanStorageOps = [];
  }, EDITION_WRITE_LOG);
}

async function planStorageOps(page) {
  return page.evaluate((logKey) => {
    try { return JSON.parse(sessionStorage.getItem(`${logKey}_plan-storage`) || '[]'); } catch { return []; }
  }, EDITION_WRITE_LOG);
}

async function editionWrites(page) {
  return page.evaluate((logKey) => {
    try { return JSON.parse(sessionStorage.getItem(logKey) || '[]'); } catch { return []; }
  }, EDITION_WRITE_LOG);
}

async function editionEvents(page) {
  return page.evaluate((logKey) => {
    try { return JSON.parse(sessionStorage.getItem(`${logKey}_events`) || '[]'); } catch { return []; }
  }, EDITION_WRITE_LOG);
}

async function localStorageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .sort().map((key) => [key, localStorage.getItem(key)]),
  ));
}

async function expectAtomicStartupFailure(page, {
  before, expectedSearch, selectedTitle, pageErrors,
}) {
  await expect(page.locator('.fd-edition-error[role="alert"]')).toContainText('EDITION_RUNTIME');
  await expect(page.locator('#fdApp')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#fdApp')).not.toHaveAttribute('inert');
  expect(await localStorageSnapshot(page)).toEqual(before);
  expect(new URL(page.url()).search).toBe(expectedSearch);
  expect(await page.evaluate(() => history.state)).toBeNull();
  expect(await page.evaluate(() => window.__fdActiveStartupListeners())).toEqual([]);
  expect(await page.evaluate((title) => window.__fdMeaningfulRenders.every(
    ({ rows, firstTitle }) => rows !== 1 || firstTitle !== title,
  ), selectedTitle)).toBe(true);
  expect(await page.evaluate(() => {
    window.__fdStartupListenerFires = [];
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('#fdApp')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return window.__fdStartupListenerFires;
  })).toEqual([]);
  await expect(page.locator('#content .fd-today .fd-row').first()).toBeVisible();
  expect(await page.evaluate(() => window.__fdUnhandledRejections)).toEqual([]);
  expect(pageErrors).toEqual([]);
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

async function createSyntheticEdition(testInfo, editionNumber, audienceOverride = '', localIds = null) {
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
      checklist: (localIds || [`local:check:${editionNumber}`]).map((id) => ({
        id, label: `Review ${id}`, priority: 'required',
      })),
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
  const validated = await EDITION_RUNTIME.fdEditionValidateEnvelope(
    made.envelope,
    canonical,
    { audience, pathId, coreRevision: EDITION_REVISION },
    webcrypto.subtle,
  );
  expect(validated.ok).toBe(true);
  return {
    payload: made.payload,
    fingerprint: made.fingerprint,
    envelope: made.envelope,
    canonicalEnvelope: EDITION_CONTRACT.fdEditionCanonicalJson(made.envelope),
    audience,
    selectedTitle: selected.title,
    validated,
    canonical,
    siteContext: { audience, pathId, coreRevision: EDITION_REVISION },
  };
}

function savedPlanFor(index, fingerprint) {
  return {
    pathId: index.path.id,
    editionFingerprint: fingerprint,
    weekCount: index.weeks.length,
    generatedAt: '2026-08-19T00:00:00.000Z',
    shelfDate: '',
    weeks: index.weeks.map((week) => ({
      week: week.n,
      title: `Week ${week.n} — ${week.title}`,
      allCats: [...(week.focusCategories || [])],
      focus: [],
    })),
  };
}

function withoutEditionStores(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).filter(
    ([key]) => key !== EDITION_KEY && key !== LOCAL_EDITION_KEY,
  ));
}

function runtimeDomHarness() {
  const makeNode = (tag) => ({
    tagName: tag.toUpperCase(),
    innerHTML: '',
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    showModal() {},
    close() {},
    focus() {},
  });
  const mount = makeNode('div');
  const app = makeNode('div');
  const content = makeNode('main');
  app.querySelector = (selector) => selector === '#content' ? content : null;
  app.removeAttribute = () => {};
  return {
    app,
    mount,
    document: {
      createElement(tag) { return makeNode(tag); },
      getElementById(id) { return id === 'fdApp' ? app : (id === 'governanceMount' ? mount : null); },
      querySelector() { return null; },
    },
  };
}

function runtimeWindowHarness({ hash = '#edition=synthetic', historyMode = 'ok' } = {}) {
  const events = [];
  const values = new Map();
  const location = {
    href: `https://example.edu/?case=harness${hash}`,
    hash,
    pathname: '/',
    search: '?case=harness',
    reload() { events.push('reload'); },
  };
  const history = historyMode === 'missing' ? null : {
    replaceState(_state, _title, url) {
      events.push('clear');
      if (historyMode === 'throw') throw new Error('private history failure');
      location.href = `https://example.edu${url}`;
      location.hash = '';
    },
  };
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { events.push(`write:${key}`); values.set(key, String(value)); },
  };
  return { window: { location, history, localStorage: storage, crypto: webcrypto }, location, history, storage, values, events };
}

function switchDialogHarness(active, candidate, options = {}) {
  const events = [];
  const values = new Map([
    [EDITION_KEY, active.canonicalEnvelope],
    [LOCAL_EDITION_KEY, JSON.stringify({
      schemaVersion: 1,
      byFingerprint: { [active.fingerprint]: { checklist: { 'local:check:1': true }, resources: {} } },
    })],
    ['cw_progress_v1', '{"core":{"done":true}}'],
  ]);
  const listeners = (node) => {
    const byType = new Map();
    node.addEventListener = (type, handler) => {
      const handlers = byType.get(type) || [];
      handlers.push(handler);
      byType.set(type, handlers);
    };
    node.dispatch = (type, extra = {}) => {
      const event = {
        preventDefault() { events.push(`prevent:${type}`); },
        ...extra,
      };
      for (const handler of byType.get(type) || []) handler(event);
    };
    return node;
  };
  const decline = listeners({ value: 'decline', disabled: false, focus() { events.push('focus:decline'); } });
  const accept = listeners({ value: 'accept', disabled: false, focus() { events.push('focus:accept'); } });
  const dialog = listeners({
    querySelector(selector) {
      if (selector === 'button[value="decline"]') return decline;
      if (selector === 'button[value="accept"]') return accept;
      return null;
    },
    showModal() { events.push('show'); },
    close() { events.push('close'); },
  });
  const mount = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(value) {
      this._html = value;
      events.push(value.includes('fd-edition-error') ? 'alert' : (value ? 'markup' : 'clear-mount'));
    },
    querySelector(selector) { return selector === 'dialog.fd-edition-switch' ? dialog : null; },
  };
  let editionWrites = 0;
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      events.push(`write:${key}:${value === active.canonicalEnvelope ? 'active' : 'candidate'}`);
      if (key === EDITION_KEY) {
        editionWrites += 1;
        if (options.rollbackFails && editionWrites > 1) throw new Error('private rollback failure');
      }
      values.set(key, String(value));
    },
  };
  const location = {
    pathname: '/', search: '?case=switch', hash: '',
    reload() {
      events.push('reload');
      if (options.reloadThrows) throw new Error('private reload failure');
    },
  };
  const recovered = [];
  const recover = (validated) => {
    events.push('recover');
    recovered.push(validated.fingerprint);
    return true;
  };
  return { events, values, mount, dialog, accept, decline, storage, location, recover, recovered };
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

test('runtime capability gate clears incoming hashes and rejects missing, throwing, or mountless boundaries without writes', async ({}, testInfo) => {
  const audience = testInfo.project.name === 'nav-res' ? 'resident' : 'ms3';
  const pathId = audience === 'resident' ? 'resident-four-week' : 'ms3-six-week';
  const siteContext = { audience, pathId, coreRevision: EDITION_REVISION };

  const healthyDom = runtimeDomHarness();
  const healthy = runtimeWindowHarness();
  const accepted = EDITION_RUNTIME.fdEditionRuntimeInputs(
    healthy.window, healthyDom.document, healthyDom.app, healthyDom.mount, siteContext,
  );
  expect(accepted.ok).toBe(true);
  expect(accepted.hash).toBe('#edition=synthetic');
  expect(accepted.hashCleared).toBe(true);
  expect(healthy.location.hash).toBe('');
  expect(healthy.events).toEqual(['clear']);

  for (const historyMode of ['missing', 'throw']) {
    const dom = runtimeDomHarness();
    const runtime = runtimeWindowHarness({ historyMode });
    const before = Object.fromEntries(runtime.values);
    let result;
    expect(() => {
      result = EDITION_RUNTIME.fdEditionRuntimeInputs(
        runtime.window, dom.document, dom.app, dom.mount, siteContext,
      );
    }).not.toThrow();
    expect(result.ok).toBe(false);
    expect(result.receipt.code).toBe('EDITION_RUNTIME');
    expect(Object.fromEntries(runtime.values)).toEqual(before);
    expect(runtime.events.filter((event) => event.startsWith('write:'))).toEqual([]);
  }

  const noMount = runtimeWindowHarness();
  const noMountDom = runtimeDomHarness();
  const noMountResult = EDITION_RUNTIME.fdEditionRuntimeInputs(
    noMount.window, noMountDom.document, noMountDom.app, null, siteContext,
  );
  expect(noMountResult.ok).toBe(false);
  expect(noMountResult.receipt.code).toBe('EDITION_RUNTIME');
  expect(noMount.events).toEqual([]);
});

test('reload failure restores the trusted active marker after candidate commit and keeps progress buckets', async ({}, testInfo) => {
  const active = await createSyntheticEdition(testInfo, 1);
  const candidate = await createSyntheticEdition(testInfo, 2);
  const harness = switchDialogHarness(active, candidate, { reloadThrows: true });
  expect(EDITION_RUNTIME.fdEditionRuntimeMountSwitch(
    harness.mount,
    { active: active.validated, candidate: candidate.validated },
    harness.storage,
    harness.location,
    true,
    harness.recover,
  )).toBe(true);

  harness.accept.dispatch('click');
  expect(harness.values.get(EDITION_KEY)).toBe(active.canonicalEnvelope);
  expect(JSON.parse(harness.values.get(LOCAL_EDITION_KEY)).byFingerprint).toEqual({
    [active.fingerprint]: { checklist: { 'local:check:1': true }, resources: {} },
    [candidate.fingerprint]: { checklist: {}, resources: {} },
  });
  expect(harness.recovered).toEqual([]);
  expect(harness.events).toEqual([
    'markup', 'show', 'focus:decline', 'prevent:click',
    `write:${LOCAL_EDITION_KEY}:candidate`, `write:${EDITION_KEY}:candidate`,
    'reload', `write:${EDITION_KEY}:active`, 'alert',
  ]);
  expect(harness.mount.innerHTML).toContain('EDITION_RUNTIME');
  expect(harness.mount.innerHTML).not.toContain('private reload failure');
});

test('rollback failure directly renders the committed candidate after the write and does not retry', async ({}, testInfo) => {
  const active = await createSyntheticEdition(
    testInfo, 1, '', ['local:check:shared', 'local:check:old-only'],
  );
  const candidate = await createSyntheticEdition(
    testInfo, 2, '', ['local:check:shared', 'local:check:new-only'],
  );
  const harness = switchDialogHarness(active, candidate, { reloadThrows: true, rollbackFails: true });
  let displayedFingerprint = active.fingerprint;
  let displayedIndex = active.validated.index;
  let trustedSnapshot = active.validated;
  const coreBefore = harness.values.get('cw_progress_v1');
  const directRecover = (validated) => (
    typeof EDITION_RUNTIME.fdEditionRuntimeRecover === 'function'
    && EDITION_RUNTIME.fdEditionRuntimeRecover(
      candidate.canonical,
      validated,
      candidate.siteContext,
      {},
      (index, _state, recoveredSnapshot) => {
        harness.events.push('recover');
        displayedFingerprint = index.edition.fingerprint;
        displayedIndex = index;
        trustedSnapshot = recoveredSnapshot;
        return true;
      },
    )
  );
  expect(EDITION_RUNTIME.fdEditionRuntimeMountSwitch(
    harness.mount,
    { active: active.validated, candidate: candidate.validated },
    harness.storage,
    harness.location,
    true,
    directRecover,
  )).toBe(true);

  harness.accept.dispatch('click');
  harness.accept.dispatch('click');
  harness.decline.dispatch('click');
  expect(harness.values.get(EDITION_KEY)).toBe(candidate.canonicalEnvelope);
  expect(displayedFingerprint).toBe(candidate.fingerprint);
  expect(trustedSnapshot?.fingerprint).toBe(candidate.fingerprint);
  expect(typeof EDITION_RUNTIME.fdEditionActiveIdentity).toBe('function');
  const identity = EDITION_RUNTIME.fdEditionActiveIdentity(trustedSnapshot, displayedIndex);
  expect(identity?.fingerprint).toBe(displayedFingerprint);
  expect(EDITION_RUNTIME.fdEditionLocalToggleAllowed(
    identity.snapshot, 'checklist', 'local:check:shared',
  )).toBe(true);
  expect(EDITION_RUNTIME.fdEditionLocalToggleAllowed(
    identity.snapshot, 'checklist', 'local:check:old-only',
  )).toBe(false);
  expect(EDITION_RUNTIME.fdEditionLocalToggleAllowed(
    identity.snapshot, 'checklist', 'local:check:new-only',
  )).toBe(true);
  expect(EDITION_RUNTIME.fdEditionToggleLocalProgress(
    harness.storage, identity.fingerprint, 'checklist', 'local:check:new-only',
  )).toBe(true);
  expect(EDITION_RUNTIME.fdEditionReadLocalProgress(
    harness.storage, identity.fingerprint,
  ).checklist['local:check:new-only']).toBe(true);
  expect(harness.values.get('cw_progress_v1')).toBe(coreBefore);
  const candidateCommit = harness.events.indexOf(`write:${EDITION_KEY}:candidate`);
  const recovery = harness.events.indexOf('recover');
  expect(candidateCommit).toBeGreaterThan(-1);
  expect(recovery).toBeGreaterThan(candidateCommit);
  expect(harness.events.filter((event) => event === 'reload')).toHaveLength(1);
  expect(harness.events.filter((event) => event === 'recover')).toHaveLength(1);
  expect(harness.events.filter((event) => event === 'alert')).toHaveLength(1);
});

test('decline is one-shot and closes only after a previously cleared incoming hash', async ({}, testInfo) => {
  const active = await createSyntheticEdition(testInfo, 1);
  const candidate = await createSyntheticEdition(testInfo, 2);
  const harness = switchDialogHarness(active, candidate);
  const before = Object.fromEntries(harness.values);
  expect(EDITION_RUNTIME.fdEditionRuntimeMountSwitch(
    harness.mount,
    { active: active.validated, candidate: candidate.validated },
    harness.storage,
    harness.location,
    true,
    harness.recover,
  )).toBe(true);

  harness.decline.dispatch('click');
  harness.decline.dispatch('click');
  harness.dialog.dispatch('cancel');
  expect(Object.fromEntries(harness.values)).toEqual(before);
  expect(harness.events.filter((event) => event === 'close')).toHaveLength(1);
  expect(harness.events.filter((event) => event === 'clear-mount')).toHaveLength(1);
  expect(harness.events.filter((event) => event.startsWith('write:'))).toEqual([]);
});

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
  const orderedEvents = await editionEvents(page);
  const clearIndex = orderedEvents.findIndex(([kind]) => kind === 'history');
  const localWriteIndex = orderedEvents.findIndex(([kind, value]) => kind === 'write' && value === LOCAL_EDITION_KEY);
  const editionWriteIndex = orderedEvents.findIndex(([kind, value]) => kind === 'write' && value === EDITION_KEY);
  const renderIndex = orderedEvents.findIndex(([kind]) => kind === 'render-sync');
  expect(clearIndex).toBeGreaterThanOrEqual(0);
  expect(clearIndex).toBeLessThan(localWriteIndex);
  expect(localWriteIndex).toBeLessThan(editionWriteIndex);
  expect(editionWriteIndex).toBeLessThan(renderIndex);
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
  await page.getByRole('button', { name: 'Switch edition' }).focus();
  await page.getByRole('button', { name: 'Switch edition' }).press('Enter');
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(candidate.selectedTitle);
  expect((await editionWrites(page)).map(([key]) => key)).toEqual([LOCAL_EDITION_KEY, EDITION_KEY]);
  const switchEvents = await editionEvents(page);
  const switchClear = switchEvents.findIndex(([kind]) => kind === 'history');
  const switchRender = switchEvents.findIndex(([kind]) => kind === 'render-sync');
  const switchLocal = switchEvents.findIndex(([kind, value]) => kind === 'write' && value === LOCAL_EDITION_KEY);
  const switchEdition = switchEvents.findIndex(([kind, value]) => kind === 'write' && value === EDITION_KEY);
  expect(switchClear).toBeGreaterThanOrEqual(0);
  expect(switchClear).toBeLessThan(switchRender);
  expect(switchClear).toBeLessThan(switchLocal);
  expect(switchLocal).toBeLessThan(switchEdition);
  const after = await localStorageSnapshot(page);
  expect(withoutEditionStores(after)).toEqual(withoutEditionStores(before));
  expect(after[EDITION_KEY]).toBe(candidate.canonicalEnvelope);
  expect(JSON.parse(after[LOCAL_EDITION_KEY]).byFingerprint[active.fingerprint].checklist)
    .toEqual({ 'local:check:1': true });
  expect(JSON.parse(after[LOCAL_EDITION_KEY]).byFingerprint[candidate.fingerprint])
    .toEqual({ checklist: {}, resources: {} });
});

for (const [label, usablePlacement, expectedPlanMutations] of [
  ['usable placement', true, [['set', 'cw_plan_v1']]],
  ['no usable placement', false, Array.from({ length: 4 }, () => ['remove', 'cw_plan_v1'])],
]) {
  test(`accepting an edition with ${label} changes only its derived plan after reload`, async ({ page }, testInfo) => {
    await installEditionRuntimeProbe(page);
    const active = await createSyntheticEdition(testInfo, 1);
    const candidate = await createSyntheticEdition(testInfo, 2);
    const activePlan = savedPlanFor(active.canonical, active.fingerprint);
    await page.goto('/');
    await seedEditionLearner(page);
    await page.evaluate(({ plan, placement }) => {
      localStorage.setItem('cw_plan_v1', JSON.stringify(plan));
      if (placement) localStorage.setItem('cw_pretest_v1', JSON.stringify(placement));
      else localStorage.setItem('cw_pretest_v1', '{unusable-placement');
      localStorage.setItem('cw_qb_v1', '{"core":"question-bank"}');
      localStorage.setItem('cw_unrelated_v1', 'preserve unrelated cw bytes');
      localStorage.setItem('rp_resident_state_v1', 'preserve resident bytes');
    }, {
      plan: activePlan,
      placement: usablePlacement ? VALID_PLACEMENT : null,
    });
    await page.goto(`/?case=edition-plan-active#edition=${active.payload}`);
    await expect(page.locator('.fd-today')).toBeVisible();

    await page.goto(`/?page=__progress__&case=edition-plan-switch#edition=${candidate.payload}`);
    await expect(page.locator('dialog.fd-edition-switch')).toBeVisible();
    const before = await localStorageSnapshot(page);
    await resetPlanStorageLog(page);
    await page.getByRole('button', { name: 'Switch edition' }).click();
    await expect(page.locator('#pgRoot')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    const operations = await planStorageOps(page);
    expect(operations.some(([operation, key]) => operation === 'get' && key === 'cw_plan_v1')).toBe(true);
    expect(operations.filter(([operation]) => operation !== 'get')).toEqual(expectedPlanMutations);
    expect(operations.every(([, key]) => ['cw_plan_v1', 'cw_pretest_v1', 'cw_shelf_date'].includes(key))).toBe(true);

    const after = await localStorageSnapshot(page);
    for (const key of [
      'cw_progress_v1', 'cw_pretest_v1', 'cw_qb_v1', 'cw_unrelated_v1', 'rp_resident_state_v1',
    ]) expect(after[key]).toBe(before[key]);
    const localBefore = JSON.parse(before[LOCAL_EDITION_KEY]);
    const localAfter = JSON.parse(after[LOCAL_EDITION_KEY]);
    expect(localAfter.byFingerprint[active.fingerprint])
      .toEqual(localBefore.byFingerprint[active.fingerprint]);
    expect(localAfter.byFingerprint[candidate.fingerprint]).toEqual({ checklist: {}, resources: {} });
    if (usablePlacement) {
      expect(JSON.parse(after.cw_plan_v1)).toMatchObject({
        pathId: candidate.canonical.path.id,
        editionFingerprint: candidate.fingerprint,
        weekCount: candidate.canonical.weeks.length,
      });
    } else expect(after.cw_plan_v1).toBeUndefined();
  });
}

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

test('a throwing hash-history boundary falls back to core before any edition commit or render', async ({ page }, testInfo) => {
  await installEditionRuntimeProbe(page, { throwHistory: true });
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  await page.goto(`/?case=edition-history-throw#edition=${incoming.payload}`);
  await expect(page.locator('.fd-edition-error[role="alert"]')).toContainText('EDITION_RUNTIME');
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(await page.locator('.fd-today .fd-list .fd-row').count()).toBeGreaterThan(1);
  await expect(page.locator('#fdApp')).not.toHaveAttribute('aria-busy', 'true');
  expect(await editionWrites(page)).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(before);
  expect((await editionEvents(page)).filter(([kind]) => kind === 'render')).not.toHaveLength(0);
});

test('a missing governance mount falls back to core without committing or attempting an unsafe alert', async ({ page }, testInfo) => {
  await installEditionRuntimeProbe(page);
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  await page.route(/\/\?case=edition-missing-mount$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<div id="governanceMount"></div>', '');
    await route.fulfill({ response, body });
  });

  await page.goto(`/?case=edition-missing-mount#edition=${incoming.payload}`);
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(await page.locator('.fd-today .fd-list .fd-row').count()).toBeGreaterThan(1);
  await expect(page.locator('#fdApp')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.fd-edition-error')).toHaveCount(0);
  expect(await editionWrites(page)).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(before);
});

for (const fault of [
  ['an always-throwing fdApp listener', 'root-always'],
  ['a call-count-throwing fdApp listener', 'root-third'],
  ['a register-then-throw fdApp listener', 'root-register-then-throw'],
  ['a register-then-throw window listener', 'window-register-then-throw'],
  ['a register-then-throw document listener', 'document-register-then-throw'],
  ['a throwing window listener', 'window-message'],
  ['a throwing document listener', 'document-click'],
  ['a throwing shell query API', 'root-query'],
]) {
  test(`${fault[0]} prevents first acceptance, rendering, and uncaught startup errors`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await installEditionRuntimeProbe(page, { listenerFault: fault[1] });
    const incoming = await createSyntheticEdition(testInfo, 1);
    await page.goto('/');
    await seedEditionLearner(page);
    const before = await localStorageSnapshot(page);
    await resetEditionWriteLog(page);

    await page.goto(`/?case=edition-wiring-${fault[1]}#edition=${incoming.payload}`);
    await expect(page.locator('.fd-edition-error[role="alert"]')).toContainText('EDITION_RUNTIME');
    await expect(page.locator('#fdApp')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.fd-today')).toBeVisible();
    expect(await page.locator('.fd-today .fd-list .fd-row').count()).toBeGreaterThan(1);
    expect(await editionWrites(page)).toEqual([]);
    expect(await localStorageSnapshot(page)).toEqual(before);
    expect(await page.evaluate((selectedTitle) => window.__fdMeaningfulRenders.every(
      ({ rows, firstTitle }) => rows !== 1 || firstTitle !== selectedTitle,
    ), incoming.selectedTitle)).toBe(true);
    expect(await page.evaluate(() => window.__fdActiveStartupListeners())).toEqual([]);
    expect(await page.evaluate(() => {
      window.__fdStartupListenerFires = [];
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new PopStateEvent('popstate'));
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.querySelector('#fdApp')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return window.__fdStartupListenerFires;
    })).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test('a missing fdApp returns quietly with no writes, edition render, or uncaught startup error', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page);
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  await page.route(/\/\?case=edition-missing-root$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '<div id="fdApp" class="fd-shell" aria-busy="true" inert>',
      '<div class="fd-shell" aria-busy="true" inert>',
    );
    await route.fulfill({ response, body });
  });

  await page.goto(`/?case=edition-missing-root#edition=${incoming.payload}`);
  await expect(page.locator('#fdApp')).toHaveCount(0);
  await expect(page.locator('.fd-edition-error[role="alert"]')).toContainText('EDITION_RUNTIME');
  expect(await editionWrites(page)).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(before);
  expect(await page.evaluate((selectedTitle) => window.__fdMeaningfulRenders.every(
    ({ rows, firstTitle }) => rows !== 1 || firstTitle !== selectedTitle,
  ), incoming.selectedTitle)).toBe(true);
  expect(await page.evaluate(() => window.__fdActiveStartupListeners())).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('a legacy route followed by auxiliary failure leaves storage and history at the post-clear snapshot', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page, { listenerFault: 'root-third' });
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);

  await page.goto(`/?page=__home__&case=edition-legacy-aux#edition=${incoming.payload}`);
  await expect(page.locator('.fd-edition-error[role="alert"]')).toContainText('EDITION_RUNTIME');
  expect(await localStorageSnapshot(page)).toEqual(before);
  expect(await editionWrites(page)).toEqual([]);
  expect(new URL(page.url()).search).toBe('?page=__home__&case=edition-legacy-aux');
  expect(await page.evaluate(() => history.state)).toBeNull();
  expect((await editionEvents(page)).filter(([kind]) => kind === 'history')).toHaveLength(1);
  expect(await page.evaluate(() => window.__fdActiveStartupListeners())).toEqual([]);
  expect(await page.evaluate((selectedTitle) => window.__fdMeaningfulRenders.every(
    ({ rows, firstTitle }) => rows !== 1 || firstTitle !== selectedTitle,
  ), incoming.selectedTitle)).toBe(true);
  expect(pageErrors).toEqual([]);
});

for (const [label, startupFault] of [
  ['first', 'progress-first'],
  ['second', 'progress-second'],
]) {
  test(`a ${label} initial Progress mount failure rolls back first acceptance and legacy startup`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await installEditionRuntimeProbe(page, { startupFault });
    const incoming = await createSyntheticEdition(testInfo, 1);
    await page.goto('/');
    await seedEditionLearner(page);
    const before = await localStorageSnapshot(page);
    await resetEditionWriteLog(page);
    const expectedSearch = `?page=__start__&case=startup-fault-${startupFault}`;

    await page.goto(`${expectedSearch}#edition=${incoming.payload}`);
    await expectAtomicStartupFailure(page, {
      before, expectedSearch, selectedTitle: incoming.selectedTitle, pageErrors,
    });
    expect((await editionEvents(page)).filter(([kind]) => kind === 'history')).toHaveLength(1);
  });
}

test('a synchronous initial resource-opening failure unwinds without bookmark or edition residue', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page, { startupFault: 'resource-open' });
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  await page.evaluate(() => localStorage.setItem('cw_last', 'orientation.md'));
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  const expectedSearch = '?tool=question-bank-practice.html&case=startup-fault-resource';

  await page.goto(`${expectedSearch}#edition=${incoming.payload}`);
  await expectAtomicStartupFailure(page, {
    before, expectedSearch, selectedTitle: incoming.selectedTitle, pageErrors,
  });
  await expect(page.locator('.fd-article iframe')).toHaveCount(0);
  expect((await editionEvents(page)).filter(([kind]) => kind === 'history')).toHaveLength(1);
});

test('a switch-dialog insertion failure preserves the stored edition and uncommitted legacy route', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page, { startupFault: 'edition-dialog' });
  const active = await createSyntheticEdition(testInfo, 1);
  const candidate = await createSyntheticEdition(testInfo, 2);
  await page.goto('/');
  await seedEditionLearner(page);
  await page.goto(`/?case=edition-active-before-mount-fault#edition=${active.payload}`);
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(active.selectedTitle);
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  const expectedSearch = '?page=__start__&case=startup-fault-edition-dialog';

  await page.goto(`${expectedSearch}#edition=${candidate.payload}`);
  await expectAtomicStartupFailure(page, {
    before, expectedSearch, selectedTitle: active.selectedTitle, pageErrors,
  });
  await expect(page.locator('dialog.fd-edition-switch')).toHaveCount(0);
  expect(await editionWrites(page)).toEqual([]);
  expect((await editionEvents(page)).filter(([kind]) => kind === 'history')).toHaveLength(1);
});

test('a final startup history failure rolls back first acceptance after every earlier phase succeeds', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page, { startupFault: 'commit-history' });
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  const expectedSearch = '?case=startup-fault-final-commit';

  await page.goto(`${expectedSearch}#edition=${incoming.payload}`);
  await expectAtomicStartupFailure(page, {
    before, expectedSearch, selectedTitle: incoming.selectedTitle, pageErrors,
  });
  expect((await editionEvents(page)).filter(([kind]) => kind === 'history')).toHaveLength(3);
});

test('first acceptance through legacy Start commits once after both Progress mounts', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page);
  const incoming = await createSyntheticEdition(testInfo, 1);
  await page.goto('/');
  await seedEditionLearner(page);
  await resetEditionWriteLog(page);

  await page.goto(`/?page=__start__&case=edition-start-control#edition=${incoming.payload}`);
  await expect(page).toHaveURL(/\/\?page=__progress__&case=edition-start-control$/);
  await expect(page.locator('#pgRoot')).toBeVisible();
  expect((await editionWrites(page)).map(([key]) => key)).toEqual([LOCAL_EDITION_KEY, EDITION_KEY]);
  expect(await page.evaluate(() => window.__fdActiveStartupListeners().length)).toBe(8);
  expect(pageErrors).toEqual([]);
});

for (const [label, startupFault] of [
  ['rejected fetch', 'markdown-reject'],
  ['throwing mount', 'markdown-mount'],
  ['aborted hang', 'markdown-hang'],
]) {
  test(`a delayed initial Markdown ${label} rolls back before commit and cannot mutate later`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await installEditionRuntimeProbe(page, { startupFault });
    const incoming = await createSyntheticEdition(testInfo, 2);
    await page.goto('/');
    await seedEditionLearner(page);
    await page.evaluate(() => localStorage.setItem('cw_last', 'welcome.md'));
    const before = await localStorageSnapshot(page);
    await resetEditionWriteLog(page);
    const expectedSearch = `?page=orientation.md&case=startup-async-${startupFault}`;

    await page.goto(`${expectedSearch}#edition=${incoming.payload}`);
    await expectAtomicStartupFailure(page, {
      before, expectedSearch, selectedTitle: incoming.selectedTitle, pageErrors,
    });
    const settledHtml = await page.locator('#content').innerHTML();
    await page.waitForTimeout(100);
    expect(await page.locator('#content').innerHTML()).toBe(settledHtml);
    if (startupFault === 'markdown-hang') {
      expect(await page.evaluate(() => window.__fdResourceAbortCount)).toBe(1);
    }
  });
}

test('a delayed initial tool hydration cannot touch a nulled controller after teardown', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page, { startupFault: 'edition-dialog' });
  const active = await createSyntheticEdition(testInfo, 1);
  const candidate = await createSyntheticEdition(testInfo, 2);
  await page.goto('/');
  await seedEditionLearner(page);
  await page.goto(`/?case=edition-active-before-async-tool#edition=${active.payload}`);
  await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(active.selectedTitle);
  const before = await localStorageSnapshot(page);
  await resetEditionWriteLog(page);
  const expectedSearch = '?tool=question-bank-practice.html&case=startup-fault-edition-dialog-async-tool';

  await page.goto(`${expectedSearch}#edition=${candidate.payload}`);
  await expectAtomicStartupFailure(page, {
    before, expectedSearch, selectedTitle: active.selectedTitle, pageErrors,
  });
  const settledHtml = await page.locator('#content').innerHTML();
  const settledHydrations = (await editionEvents(page)).filter(([kind]) => kind === 'resource-hydrate').length;
  await page.waitForTimeout(100);
  expect(await page.locator('#content').innerHTML()).toBe(settledHtml);
  expect((await editionEvents(page)).filter(([kind]) => kind === 'resource-hydrate')).toHaveLength(settledHydrations);
  expect(await page.evaluate(() => window.__fdUnhandledRejections)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

for (const mode of ['core', 'stored-edition']) {
  test(`${mode} startup restores a plan-store mutation when the later mount fails`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await installEditionRuntimeProbe(page, { startupFault: 'progress-second' });
    const active = await createSyntheticEdition(testInfo, 1);
    await page.goto('/');
    await seedEditionLearner(page);
    if (mode === 'stored-edition') {
      await page.goto(`/?case=edition-active-before-plan-fault#edition=${active.payload}`);
      await expect(page.locator('.fd-today .fd-list .fd-row__title')).toHaveText(active.selectedTitle);
    }
    await page.evaluate(() => localStorage.setItem('cw_plan_v1', '{broken-plan-byte-sequence'));
    const before = await localStorageSnapshot(page);
    await resetEditionWriteLog(page);
    const expectedSearch = `?page=__start__&case=startup-fault-plan-${mode}`;

    await page.goto(expectedSearch);
    await expectAtomicStartupFailure(page, {
      before, expectedSearch, selectedTitle: active.selectedTitle, pageErrors,
    });
    expect(await page.evaluate(() => localStorage.getItem('cw_plan_v1'))).toBe('{broken-plan-byte-sequence');
  });
}

for (const [kind, startupFault, route] of [
  ['Markdown', 'markdown-success', 'page=orientation.md'],
  ['tool', '', 'tool=question-bank-practice.html'],
]) {
  test(`successful async ${kind} startup hydrates before the history commit`, async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await installEditionRuntimeProbe(page, { startupFault });
    const incoming = await createSyntheticEdition(testInfo, 2);
    await page.goto('/');
    await seedEditionLearner(page);
    await resetEditionWriteLog(page);

    await page.goto(`/?${route}&case=startup-async-${kind.toLowerCase()}#edition=${incoming.payload}`);
    if (kind === 'Markdown') {
      await expect(page.locator('.fd-article__body')).toContainText('Delayed startup markdown.');
    } else {
      await expect(page.locator('.fd-article iframe')).toBeVisible();
    }
    const events = await editionEvents(page);
    const hydration = events.findIndex(([event]) => event === 'resource-hydrate');
    const commit = events.map(([event]) => event).lastIndexOf('history');
    expect(hydration).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(hydration);
    expect(await page.evaluate(() => history.state?.fd === true)).toBe(true);
    expect(await page.evaluate(() => window.__fdActiveStartupListeners().length)).toBe(8);
    expect(await page.evaluate(() => window.__fdUnhandledRejections)).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}

test('ordinary later Markdown and tool opens retain their existing navigation behavior', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installEditionRuntimeProbe(page);
  await page.goto('/');
  await seedEditionLearner(page);
  await page.reload();

  await page.evaluate(() => {
    const control = document.createElement('button');
    control.setAttribute('data-fd-open', 'orientation.md');
    document.querySelector('#fdApp').appendChild(control);
    control.click();
  });
  await expect(page.locator('.fd-article__body')).toContainText(/Orientation/i);
  await page.evaluate(() => {
    const control = document.createElement('button');
    control.setAttribute('data-fd-open', 'question-bank-practice.html');
    document.querySelector('#fdApp').appendChild(control);
    control.click();
  });
  await expect(page.locator('.fd-article iframe')).toBeVisible();
  expect(pageErrors).toEqual([]);
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
