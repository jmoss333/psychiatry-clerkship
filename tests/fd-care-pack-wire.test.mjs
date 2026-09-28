import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const phase = read('phase_policy.js');
const state = read('frontdoor/fd_state.js');
const data = read('frontdoor/fd_data.js');
const careNavigator = read('frontdoor/fd_care_navigator.js');
const carePack = read('frontdoor/fd_care_pack.js');
const today = read('frontdoor/fd_today.js');
const block = read('frontdoor/fd_block.js');
const reader = read('frontdoor/fd_reader.js');
const shell = read('frontdoor/fd_shell.js');
const practice = read('frontdoor/fd_app_practice.js');
const path = read('frontdoor/fd_path.js');
const wire = read('frontdoor/fd_wire.js');
const spa = read('spa_index.html');

function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    key: (i) => (i >= 0 && i < map.size ? [...map.keys()][i] : null),
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

// eslint-disable-next-line no-new-func
const make = (storage) => new Function('localStorage', `${phase}\n${state}\n${data}\n${careNavigator}\n${carePack}\n${today}\n${block}\n${reader}\n${shell}\n${practice}\n${path}\n${wire}\nreturn {
  dispatch: fdDispatch,
  resolve: fdResolveState,
  wire: fdWire,
};`)(storage);

const resources = ['one', 'two', 'three', 'four'].map((id) => ({
  id, title: `Resource ${id}`, description: `Description ${id}`,
  url: `https://example.test/${id}`,
}));
const INDEX = { byRef: {}, weeks: [{ n: 1, items: [] }], careResources: resources };
const baseState = { role: 'learner', screen: 'app', tab: 'care', week: 1 };

function actionTarget(attrs) {
  return {
    tagName: 'BUTTON', isContentEditable: false, isConnected: true,
    closest(selector) {
      return Object.keys(attrs).some((name) => selector.includes(`[${name}]`)) ? this : null;
    },
    hasAttribute(name) { return Object.hasOwn(attrs, name); },
    getAttribute(name) { return Object.hasOwn(attrs, name) ? attrs[name] : null; },
    focus() { this.focused = (this.focused || 0) + 1; },
  };
}

function harness(F, initial, options = {}) {
  const rootHandlers = {};
  const windowHandlers = {};
  const root = {
    addEventListener(type, fn) { rootHandlers[type] = fn; },
    removeEventListener() {},
    querySelector: options.querySelector || (() => null),
    matches: () => false,
  };
  const fakeWindow = {
    addEventListener(type, fn) { windowHandlers[type] = fn; },
    removeEventListener() {},
    location: options.location || { href: 'https://example.test/?tab=care', search: '?tab=care', pathname: '/' },
    history: options.history,
    print: options.print,
    navigator: options.navigator,
  };
  const controller = F.wire(root, initial, {
    window: fakeWindow,
    render: options.render || (() => {}),
    renderTransient: options.renderTransient,
    index: INDEX,
    synonyms: {},
    reportCareCopy: options.reportCareCopy,
    externalModalOpen: options.externalModalOpen,
  });
  controller.commitStartup();
  return { rootHandlers, windowHandlers, controller };
}

test('pack dispatch adds, removes, caps, clears, and prints only a valid selection', () => {
  const F = make(memStorage());
  assert.deepEqual(F.dispatch({ 'data-fd-care-pack': 'one' }, { index: INDEX }, {
    ...baseState, carePackIds: [],
  }), { patch: { carePackIds: ['one'] }, route: null, effect: null });
  assert.deepEqual(F.dispatch({ 'data-fd-care-pack': 'two' }, { index: INDEX }, {
    ...baseState, carePackIds: ['one', 'two'],
  }), { patch: { carePackIds: ['one'] }, route: null, effect: null });
  assert.deepEqual(F.dispatch({ 'data-fd-care-pack': 'four' }, { index: INDEX }, {
    ...baseState, carePackIds: ['one', 'two', 'three'],
  }), { patch: { carePackIds: ['one', 'two', 'three'] }, route: null, effect: null });
  assert.deepEqual(F.dispatch({ 'data-fd-care-pack-clear': '' }, { index: INDEX }, {
    ...baseState, carePackIds: ['one'],
  }), { patch: { carePackIds: [] }, route: null, effect: null });
  assert.deepEqual(F.dispatch({ 'data-fd-care-pack-print': '' }, { index: INDEX }, {
    ...baseState, carePackIds: ['one'],
  }), { patch: {}, route: null, effect: { type: 'print-care-pack' } });
  assert.deepEqual(F.dispatch({ 'data-fd-care-pack-print': '' }, { index: INDEX }, {
    ...baseState, carePackIds: [],
  }), { patch: {}, route: null, effect: null });
  assert.deepEqual(F.dispatch({ 'data-fd-care-pack-print': '' }, { index: INDEX }, {
    ...baseState, tab: 'library', carePackIds: ['one'],
  }), { patch: {}, route: null, effect: null });
});

test('share dispatch validates canonical resources and copies only exact curated links', () => {
  const F = make(memStorage());
  assert.deepEqual(F.dispatch({ 'data-fd-care-share': 'one' }, { index: INDEX }, baseState), {
    patch: { careShareId: 'one', searchOpen: false, sheet: null }, route: null, effect: null,
  });
  assert.deepEqual(F.dispatch({ 'data-fd-care-share': 'missing' }, { index: INDEX }, baseState), {
    patch: {}, route: null, effect: null,
  });
  assert.deepEqual(F.dispatch({ 'data-fd-care-copy': 'one' }, { index: INDEX }, baseState), {
    patch: {}, route: null, effect: {
      type: 'copy-care-links', text: 'https://example.test/one',
      status: 'share-one',
      success: 'Link copied.', failure: 'Copy failed. Select and copy the link shown.',
    },
  });
  assert.deepEqual(F.dispatch({ 'data-fd-care-copy-selected': '' }, { index: INDEX }, {
    ...baseState, carePackIds: ['three', 'one'],
  }), {
    patch: {}, route: null, effect: {
      type: 'copy-care-links',
      text: 'Resource one\nhttps://example.test/one\n\nResource three\nhttps://example.test/three',
      status: 'pack',
      success: 'Selected links copied.',
      failure: 'Copy failed. Select and copy the links in the handout.',
    },
  });
  assert.deepEqual(F.dispatch({ 'data-fd-care-copy-selected': '' }, { index: INDEX }, {
    ...baseState, carePackIds: [],
  }), { patch: {}, route: null, effect: null });
  assert.deepEqual(F.dispatch({ 'data-fd-care-share-close': '' }, { index: INDEX }, {
    ...baseState, careShareId: 'one',
  }), { patch: { careShareId: '' }, route: null, effect: null });
});

test('pack state is omitted from reload resolution and has no route or storage representation', () => {
  const storage = memStorage({
    cw_frontdoor_v1: JSON.stringify({ role: 'learner', tab: 'care', week: 1 }),
  });
  const F = make(storage);
  const resolved = F.resolve('https://example.test/?tab=care', {
    role: 'learner', tab: 'care', week: 1, carePackIds: ['one'],
  }, {});
  assert.equal(Object.hasOwn(resolved, 'carePackIds'), false);

  const before = storage.dump();
  const historyCalls = [];
  const selected = { focused: 0, focus() { this.focused += 1; } };
  const first = { focused: 0, focus() { this.focused += 1; } };
  const h = harness(F, { ...baseState, carePackIds: [] }, {
    querySelector: (selector) => {
      if (selector === '[data-fd-care-pack="one"]') return selected;
      if (selector === '[data-fd-care-pack]') return first;
      return null;
    },
    history: {
      replaceState: (...args) => historyCalls.push(['replace', ...args]),
      pushState: (...args) => historyCalls.push(['push', ...args]),
    },
  });
  const initialHistoryCount = historyCalls.length;
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-care-pack': 'one' }), preventDefault() {} });
  assert.deepEqual(h.controller.getState().carePackIds, ['one']);
  assert.deepEqual(storage.dump(), before);
  assert.equal(historyCalls.length, initialHistoryCount);
  assert.equal(selected.focused, 1);
  assert.doesNotMatch(storage.getItem('cw_frontdoor_v1') || '', /carePackIds|one/);

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-care-pack-clear': '' }), preventDefault() {},
  });
  assert.deepEqual(h.controller.getState().carePackIds, []);
  assert.equal(first.focused, 1);
});

test('explicit print calls the browser once and navigation/history discard the pack', () => {
  const storage = memStorage();
  const F = make(storage);
  let prints = 0;
  const h = harness(F, { ...baseState, carePackIds: ['one'] }, {
    print: () => { prints += 1; },
  });
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-care-pack-print': '' }), preventDefault() {},
  });
  assert.equal(prints, 1);

  h.rootHandlers.click({ target: actionTarget({ 'data-fd-tab': 'library' }), preventDefault() {} });
  assert.deepEqual(h.controller.getState().carePackIds, []);

  const history = harness(F, { ...baseState, carePackIds: ['one'] });
  history.windowHandlers.popstate({ state: { fd: true, state: { tab: 'care', openId: null } } });
  assert.deepEqual(history.controller.getState().carePackIds, []);
});

test('QR drawer and copy remain visit-only, restore focus, and report clipboard failure', async () => {
  const storage = memStorage();
  const F = make(storage);
  const drawerStatus = { isConnected: true, textContent: '' };
  const packStatus = { isConnected: true, textContent: '' };
  const drawer = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const opener = actionTarget({ 'data-fd-care-share': 'one' });
  const copy = actionTarget({ 'data-fd-care-copy': 'one' });
  const h = harness(F, { ...baseState, carePackIds: [], careShareId: '' }, {
    navigator: { clipboard: { writeText: () => Promise.reject(new Error('blocked')) } },
    querySelector: (selector) => {
      if (selector === '.fd-care-share[role="dialog"]') return drawer;
      if (selector === '[data-fd-care-share="one"]') return opener;
      if (selector === '[data-fd-care-copy="one"]') return copy;
      if (selector === '[data-fd-care-copy-status="share-one"]') return drawerStatus;
      if (selector === '[data-fd-care-copy-status="pack"]') return packStatus;
      return null;
    },
  });
  const before = storage.dump();
  h.rootHandlers.click({ target: opener, preventDefault() {} });
  assert.equal(h.controller.getState().careShareId, 'one');
  h.rootHandlers.click({ target: copy, preventDefault() {} });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(drawerStatus.textContent, 'Copy failed. Select and copy the link shown.');
  assert.equal(packStatus.textContent, '');
  assert.deepEqual(storage.dump(), before);
  h.windowHandlers.keydown({ key: 'Escape', target: copy, preventDefault() {} });
  assert.equal(h.controller.getState().careShareId, '');
  assert.equal(opener.focused > 0, true);
});

test('a clipboard result is ignored after its drawer closes', async () => {
  const F = make(memStorage());
  let settle;
  const drawerStatus = { isConnected: true, textContent: '' };
  const drawer = { querySelector: () => null, querySelectorAll: () => [] };
  const opener = actionTarget({ 'data-fd-care-share': 'one' });
  const copy = actionTarget({ 'data-fd-care-copy': 'one' });
  const h = harness(F, { ...baseState, carePackIds: [], careShareId: '' }, {
    navigator: { clipboard: { writeText: () => new Promise((resolve) => { settle = resolve; }) } },
    querySelector: (selector) => {
      if (selector === '.fd-care-share[role="dialog"]') return drawer;
      if (selector === '[data-fd-care-share="one"]') return opener;
      if (selector === '[data-fd-care-copy="one"]') return copy;
      if (selector === '[data-fd-care-copy-status="share-one"]') return drawerStatus;
      return null;
    },
  });
  h.rootHandlers.click({ target: opener, preventDefault() {} });
  h.rootHandlers.click({ target: copy, preventDefault() {} });
  h.windowHandlers.keydown({ key: 'Escape', target: copy, preventDefault() {} });
  settle();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(drawerStatus.textContent, '');
});

test('a handout clipboard result is ignored after leaving and returning to Care', async () => {
  const F = make(memStorage());
  let settle;
  const packStatus = { isConnected: true, textContent: '' };
  const searchDialog = { querySelector: () => null, querySelectorAll: () => [] };
  const copySelected = actionTarget({ 'data-fd-care-copy-selected': '' });
  const h = harness(F, { ...baseState, carePackIds: ['one'], careShareId: '' }, {
    navigator: { clipboard: { writeText: () => new Promise((resolve) => { settle = resolve; }) } },
    querySelector: (selector) => {
      if (selector === '[data-fd-care-copy-status="pack"]') return packStatus;
      if (selector === '.fd-search[role="dialog"]') return searchDialog;
      return null;
    },
  });
  h.rootHandlers.click({ target: copySelected, preventDefault() {} });
  h.controller.dispatch({ 'data-fd-search': '' });
  h.controller.dispatch({ close: true });
  assert.equal(h.controller.getState().searchOpen, false);
  settle();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(packStatus.textContent, '');
});

test('a handout clipboard result is ignored after Capture opens and closes', async () => {
  const F = make(memStorage());
  let settle;
  let captureOpen = false;
  const packStatus = { isConnected: true, textContent: '' };
  const copySelected = actionTarget({ 'data-fd-care-copy-selected': '' });
  const h = harness(F, { ...baseState, carePackIds: ['one'], careShareId: '' }, {
    navigator: { clipboard: { writeText: () => new Promise((resolve) => { settle = resolve; }) } },
    externalModalOpen: () => captureOpen,
    querySelector: (selector) => selector === '[data-fd-care-copy-status="pack"]' ? packStatus : null,
  });
  h.rootHandlers.click({ target: copySelected, preventDefault() {} });
  captureOpen = true;
  h.controller.externalModalOpened();
  captureOpen = false;
  settle();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(packStatus.textContent, '');
});

test('the shell passes transient pack state and the governed crisis template into Care', () => {
  assert.match(spa, /fdCare\(FD_INDEX,state\.careIntentId\|\|'',state\.carePackIds\|\|\[\],fdCrisisHtml\)/);
  assert.doesNotMatch(wire, /localStorage\.(?:getItem|setItem)\([^\n]*carePack/i);
  assert.match(spa, /fdCareShare\(FD_INDEX,state\.careShareId\|\|'',state\.carePackIds\|\|\[\]\)/);
  assert.doesNotMatch(wire, /localStorage\.(?:getItem|setItem)\([^\n]*careShare/i);
  assert.match(spa, /fdController&&fdController\.externalModalOpened/);
});
