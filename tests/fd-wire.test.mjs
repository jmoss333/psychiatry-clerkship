import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const phase = read('phase_policy.js');
const state = read('frontdoor/fd_state.js');
const data = read('frontdoor/fd_data.js');
const today = read('frontdoor/fd_today.js');
const reader = read('frontdoor/fd_reader.js');
const shell = read('frontdoor/fd_shell.js');
const wire = read('frontdoor/fd_wire.js');

// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `${phase}\n${state}\n${data}\n${today}\n${reader}\n${shell}\n${wire}\nreturn {
  fdResolveState: fdResolveState,
  fdDispatch: fdDispatch,
  fdIsTypingTarget: fdIsTypingTarget,
  fdTrapFocus: fdTrapFocus,
  fdWire: fdWire,
};`);

function memStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

const F = make(memStorage());
const roleContext = {
  roles: [{ id: 'first-role' }, { id: 'second-role' }],
  role: 'first-role',
  week: 2,
};

test('URL page/tool/tab values beat persisted Front Door state', () => {
  const stored = { role: 'first-role', tab: 'library', openId: 'old.md', fromTab: 'today', week: 2 };
  assert.deepEqual(F.fdResolveState('/?page=new.md', stored), {
    role: 'first-role', tab: 'library', openId: 'new.md', fromTab: 'library',
    week: 2, viewWeek: 2, autoAdvance: true, screen: 'app',
  });
  assert.equal(F.fdResolveState('/?tool=drill.html&case=a', stored).openId, 'drill.html');
  const tab = F.fdResolveState('/?tab=path', stored);
  assert.equal(tab.tab, 'path');
  assert.equal(tab.openId, undefined, 'a routed tab must not resume a stale stored reader');
});

test('a bare URL restores stored state and defaults to Today with autoAdvance true', () => {
  assert.deepEqual(F.fdResolveState('/', {
    role: 'first-role', tab: 'path', openId: 'saved.md', fromTab: 'library',
    viewWeek: 4, week: 2,
  }), {
    role: 'first-role', tab: 'path', openId: 'saved.md', fromTab: 'library',
    viewWeek: 4, week: 2, autoAdvance: true, screen: 'app',
  });
  const empty = F.fdResolveState('/', {});
  assert.equal(empty.tab, 'today');
  assert.equal(empty.autoAdvance, true);
  assert.equal(empty.screen, 'setup-role');
});

test('legacy rotation state skips setup and defaults to the first injected role', () => {
  const out = F.fdResolveState('/', {
    rotationStart: '2026-08-10', week: 2,
    roles: [{ id: 'site-first' }, { id: 'site-second' }],
  });
  assert.equal(out.role, 'site-first');
  assert.equal(out.screen, 'app');
  assert.equal(out.tab, 'today');
});

test('navigate, preview sheet, and protocol dispatch remain three separate paths', () => {
  const nav = F.fdDispatch({ 'data-fd-open': 'page.md' }, {}, roleContext);
  assert.deepEqual(nav, {
    patch: { openId: 'page.md', fromTab: 'today', searchOpen: false, sheet: null },
    route: '?page=page.md',
    effect: { type: 'open-resource', ref: 'page.md' },
  });
  const preview = F.fdDispatch({ 'data-fd-open': 'scale.html', 'data-fd-sheet': '' }, {}, roleContext);
  assert.deepEqual(preview, {
    patch: { sheet: 'item:scale.html', sheetFrom: null, stepsDone: {}, searchOpen: false },
    route: null,
    effect: { type: 'open-sheet', ref: 'scale.html' },
  });
  const protocol = F.fdDispatch({ 'data-fd-safety': 'risk.md' }, { inSheet: true }, roleContext);
  assert.deepEqual(protocol, {
    patch: { sheet: 'risk.md', sheetFrom: 'kit', stepsDone: {}, searchOpen: false },
    route: null,
    effect: { type: 'open-protocol', ref: 'risk.md' },
  });
});

test('routed tool actions preserve case, scenario, resume, and faculty-preview parameters', () => {
  const search = '?page=source.md&case=c1&scenario=s2&resume=1' +
    '&reviewKey=tool%3Apractice.html&reviewToken=0123456789abcdef0123456789abcdef';
  const out = F.fdDispatch({ 'data-fd-open': 'practice.html' }, { search }, roleContext);
  const params = new URLSearchParams(out.route);
  assert.equal(params.get('tool'), 'practice.html');
  assert.equal(params.get('case'), 'c1');
  assert.equal(params.get('scenario'), 's2');
  assert.equal(params.get('resume'), '1');
  assert.equal(params.get('reviewKey'), 'tool:practice.html');
  assert.equal(params.get('reviewToken'), '0123456789abcdef0123456789abcdef');
  assert.equal(params.has('page'), false);
});

test('view-week previews only; setup-week and set-week return Monday-aligned writes', () => {
  const nowMs = new Date(2026, 7, 12, 9, 0, 0).getTime();
  assert.deepEqual(F.fdDispatch({ 'data-fd-view-week': '5' }, { nowMs }, roleContext), {
    patch: { tab: 'path', viewWeek: 5, openId: null },
    route: '?tab=path',
    effect: null,
  });
  for (const attr of ['data-fd-week', 'data-fd-setweek']) {
    const out = F.fdDispatch({ [attr]: '4' }, { nowMs }, roleContext);
    assert.equal(out.patch.week, 4);
    assert.equal(out.patch.viewWeek, 4);
    assert.deepEqual(out.effect, { type: 'set-rotation', start: '2026-07-20' });
  }
  const browse = F.fdDispatch({ 'data-fd-week': '0' }, { nowMs }, roleContext);
  assert.deepEqual(browse.effect, { type: 'browse-without-rotation' });
  assert.equal(browse.patch.tab, 'library');
  assert.equal(browse.patch.week, null);
});

test('role, tab, back, home, search, change-week, progress, theme, and step are pinned', () => {
  assert.deepEqual(F.fdDispatch({ 'data-fd-role': 'second-role' }, {}, roleContext).patch,
    { role: 'second-role', screen: 'setup-week' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-tab': 'library' }, {}, roleContext).patch,
    { tab: 'library', openId: null, searchOpen: false });
  assert.equal(F.fdDispatch({ 'data-fd-back': '' }, {}, { ...roleContext, openId: 'x.md', fromTab: 'path' }).route,
    '?tab=path');
  assert.equal(F.fdDispatch({ 'data-fd-home': '' }, {}, roleContext).route, '/');
  assert.deepEqual(F.fdDispatch({ 'data-fd-search': '' }, {}, roleContext).patch, { searchOpen: true });
  assert.deepEqual(F.fdDispatch({ 'data-fd-change-week': '' }, {}, roleContext).patch,
    { screen: 'setup-week', searchOpen: false, sheet: null });
  assert.equal(F.fdDispatch({ 'data-fd-progress': '' }, {}, roleContext).effect.type, 'open-progress');
  assert.deepEqual(F.fdDispatch({ 'data-fd-theme': '' }, { theme: 'dark' }, roleContext).effect,
    { type: 'set-theme', theme: 'light' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-step': '2' }, {}, { ...roleContext, stepsDone: { 2: true } }).patch,
    { stepsDone: { 2: false } });
  assert.equal(F.fdDispatch({ 'data-fd-try-now': 'scale.html' }, {}, roleContext).patch.sheet,
    'item:scale.html');
});

test('Escape close order and explicit close actions are deterministic', () => {
  const both = { ...roleContext, searchOpen: true, sheet: 'kit', query: 'abc' };
  assert.deepEqual(F.fdDispatch({ close: true }, {}, both).patch,
    { searchOpen: false, query: '' });
  const sheetOnly = F.fdDispatch({ close: true }, {}, { ...both, searchOpen: false });
  assert.equal(sheetOnly.patch.sheet, null);
  assert.deepEqual(F.fdDispatch({ 'data-fd-close-search': '' }, {}, both).patch,
    { searchOpen: false, query: '' });
  assert.equal(F.fdDispatch({ 'data-fd-close-sheet': '' }, {}, both).patch.sheet, null);
  assert.deepEqual(F.fdDispatch({ 'data-fd-close-nudge': '' }, {}, roleContext).patch,
    { nudge: null });
});

test('closing an unread protocol raises an 8-second nudge, but a read one does not', () => {
  const unread = F.fdDispatch({ 'data-fd-close-sheet': '' }, {}, {
    ...roleContext, sheet: 'risk.md', done: {},
  });
  assert.deepEqual(unread.patch, { sheet: null, sheetFrom: null, stepsDone: {}, nudge: 'risk.md' });
  assert.deepEqual(unread.effect, { type: 'nudge-timeout', delay: 8000 });
  const read = F.fdDispatch({ 'data-fd-close-sheet': '' }, {}, {
    ...roleContext, sheet: 'risk.md', done: { 'risk.md': true },
  });
  assert.equal(read.patch.nudge, null);
});

test('autoAdvance defaults true, advances to next unread, and returns to fromTab at week end', () => {
  const weekItems = [{ ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' }];
  const next = F.fdDispatch({ 'data-fd-toggle': 'a.md' }, { weekItems, nowMs: 1 }, {
    ...roleContext, openId: 'a.md', done: { 'c.md': true }, fromTab: 'library',
  });
  assert.equal(next.patch.openId, 'b.md');
  assert.equal(next.route, '?page=b.md');
  assert.equal(next.effect.type, 'toggle-progress');
  assert.equal(next.effect.done, true);

  const end = F.fdDispatch({ 'data-fd-toggle': 'b.md' }, { weekItems, nowMs: 1 }, {
    ...roleContext, openId: 'b.md', done: { 'a.md': true, 'c.md': true }, fromTab: 'library',
  });
  assert.equal(end.patch.openId, null);
  assert.equal(end.patch.tab, 'library');
  assert.equal(end.route, '?tab=library');

  const disabled = F.fdDispatch({ 'data-fd-toggle': 'a.md' }, { weekItems }, {
    ...roleContext, openId: 'a.md', done: {}, autoAdvance: false,
  });
  assert.equal(disabled.patch.openId, undefined);
});

test('global shortcuts are suppressed for input, textarea, select, and contenteditable targets', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    assert.equal(F.fdIsTypingTarget({ tagName, isContentEditable: false }), true, tagName);
  }
  assert.equal(F.fdIsTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(F.fdIsTypingTarget({ tagName: 'BUTTON', isContentEditable: false }), false);
});

test('Tab trapping wraps at both ends of a dialog', () => {
  let prevented = 0;
  let firstFocused = 0;
  let lastFocused = 0;
  const first = { focus: () => { firstFocused += 1; } };
  const last = { focus: () => { lastFocused += 1; } };
  const dialog = { querySelectorAll: () => [first, last] };
  assert.equal(F.fdTrapFocus({
    key: 'Tab', shiftKey: false, target: last, preventDefault: () => { prevented += 1; },
  }, dialog), true);
  assert.equal(firstFocused, 1);
  assert.equal(F.fdTrapFocus({
    key: 'Tab', shiftKey: true, target: first, preventDefault: () => { prevented += 1; },
  }, dialog), true);
  assert.equal(lastFocused, 1);
  assert.equal(prevented, 2);
});

test('fdWire registers one delegated click/input/keydown/popstate listener and remains opt-in', () => {
  const rootCalls = [];
  const windowCalls = [];
  const root = { addEventListener: (type, fn) => rootCalls.push([type, fn]) };
  const fakeWindow = { addEventListener: (type, fn) => windowCalls.push([type, fn]) };
  const controller = F.fdWire(root, { ...roleContext }, { window: fakeWindow, render: () => {} });
  assert.deepEqual(rootCalls.map(([type]) => type), ['click', 'input']);
  assert.deepEqual(windowCalls.map(([type]) => type), ['keydown', 'popstate']);
  assert.equal(typeof controller.destroy, 'function');
});

function actionTarget(attrs, extra = {}) {
  return {
    tagName: 'BUTTON', isContentEditable: false, isConnected: true,
    closest(selector) { return selector === '[data-fd-open],[data-fd-safety],[data-fd-toggle],[data-fd-tab],[data-fd-week],[data-fd-view-week],[data-fd-setweek],[data-fd-role],[data-fd-step],[data-fd-back],[data-fd-home],[data-fd-search],[data-fd-change-week],[data-fd-progress],[data-fd-theme],[data-fd-close-search],[data-fd-close-sheet],[data-fd-close-nudge],[data-fd-try-now]' ? this : null; },
    hasAttribute(name) { return Object.hasOwn(attrs, name); },
    getAttribute(name) { return Object.hasOwn(attrs, name) ? attrs[name] : null; },
    focus() { this.focused = (this.focused || 0) + 1; },
    ...extra,
  };
}

function fakeHarness(initial, options = {}) {
  const rootHandlers = {};
  const windowHandlers = {};
  const root = {
    addEventListener(type, fn) { rootHandlers[type] = fn; },
    removeEventListener() {},
    querySelector: options.querySelector || (() => null),
  };
  const fakeWindow = {
    addEventListener(type, fn) { windowHandlers[type] = fn; },
    removeEventListener() {},
    location: options.location || { href: 'https://example.test/', search: '', pathname: '/' },
  };
  const controller = options.F.fdWire(root, initial, {
    window: fakeWindow,
    render: options.render || (() => {}),
    searchResults: options.searchResults,
    openResource: options.openResource,
    route: options.route,
    document: options.document,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    index: options.index || { byRef: {}, weeks: [] },
    synonyms: {},
  });
  return { root, rootHandlers, fakeWindow, windowHandlers, controller };
}

test('live search input rerenders and Enter previews the first result as a sheet', () => {
  const renders = [];
  const h = fakeHarness({ ...roleContext, searchOpen: true, query: '' }, {
    F,
    render: (state) => renders.push({ ...state }),
    searchResults: (_index, query) => query === 'sleep'
      ? [{ kind: 'item', item: { ref: 'sleep.md' } }]
      : [],
  });
  const input = {
    tagName: 'INPUT', isContentEditable: false, value: 'sleep',
    matches: (selector) => selector === '.fd-searchpanel__input',
  };
  h.rootHandlers.input({ target: input });
  assert.equal(h.controller.getState().query, 'sleep');
  let prevented = 0;
  h.windowHandlers.keydown({ key: 'Enter', target: input, preventDefault: () => { prevented += 1; } });
  assert.equal(h.controller.getState().sheet, 'item:sleep.md');
  assert.equal(h.controller.getState().searchOpen, false);
  assert.equal(prevented, 1);
  assert.ok(renders.length >= 2);
});

test('opening and closing a dialog captures, focuses, and restores the connected invoker', () => {
  let current = { ...roleContext };
  const searchInput = { focusCount: 0, focus() { this.focusCount += 1; } };
  const dialog = {
    querySelector: () => searchInput,
    querySelectorAll: () => [searchInput],
  };
  const invoker = actionTarget({ 'data-fd-search': '' });
  const h = fakeHarness(current, {
    F,
    render: (state) => { current = state; },
    querySelector: () => current.searchOpen ? dialog : null,
  });
  h.rootHandlers.click({ target: invoker, preventDefault() {} });
  assert.equal(searchInput.focusCount, 1);
  const close = actionTarget({ 'data-fd-close-search': '' });
  h.rootHandlers.click({ target: close, preventDefault() {} });
  assert.equal(invoker.focused, 1);
});

test('runtime theme toggling writes cw_theme and updates data-theme without reload', () => {
  const ls = memStorage();
  const LocalF = make(ls);
  let dataTheme = 'dark';
  const doc = { documentElement: {
    getAttribute: () => dataTheme,
    setAttribute: (_name, value) => { dataTheme = value; },
  } };
  const h = fakeHarness({ ...roleContext }, { F: LocalF, document: doc });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': '' }), preventDefault() {} });
  assert.equal(dataTheme, 'light');
  assert.equal(ls.dump().cw_theme, 'light');
});

test('runtime autoAdvance opens the next unread resource after recording progress', () => {
  const opened = [];
  const index = {
    byRef: {},
    weeks: [{ n: 2, items: [{ ref: 'a.md' }, { ref: 'b.md' }] }],
  };
  const h = fakeHarness({
    ...roleContext, tab: 'today', openId: 'a.md', fromTab: 'today', done: {}, autoAdvance: true,
  }, {
    F,
    index,
    openResource: (ref) => { opened.push(ref); return Promise.resolve(true); },
  });
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-toggle': 'a.md' }),
    preventDefault() {},
  });
  assert.equal(h.controller.getState().openId, 'b.md');
  assert.deepEqual(opened, ['b.md']);
});

test('runtime keyboard wiring covers arrows, digits, slash, command-K, and Escape', () => {
  const opened = [];
  const routes = [];
  const index = {
    byRef: {},
    weeks: [{ n: 2, items: [{ ref: 'a.md' }, { ref: 'b.md' }] }],
  };
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: 'a.md', fromTab: 'today',
  }, {
    F, index, route: (route) => routes.push(route),
    openResource: (ref) => { opened.push(ref); return Promise.resolve(true); },
  });
  const target = { tagName: 'BUTTON', isContentEditable: false };
  h.windowHandlers.keydown({ key: 'ArrowRight', target, preventDefault() {} });
  assert.deepEqual(opened, ['b.md']);
  h.windowHandlers.keydown({ key: '2', target, preventDefault() {} });
  assert.equal(h.controller.getState().tab, 'path');
  assert.equal(h.controller.getState().openId, null);
  h.windowHandlers.keydown({ key: '/', target, preventDefault() {} });
  assert.equal(h.controller.getState().searchOpen, true);
  h.windowHandlers.keydown({ key: 'Escape', target, preventDefault() {} });
  assert.equal(h.controller.getState().searchOpen, false);
  h.windowHandlers.keydown({ key: 'k', metaKey: true, target, preventDefault() {} });
  assert.equal(h.controller.getState().searchOpen, true);
  assert.deepEqual(routes, ['?page=b.md', '?tab=path']);
});

test('popstate resolves the URL-named resource and reopens it with history context', () => {
  const opened = [];
  const location = {
    href: 'https://example.test/?page=history.md', search: '?page=history.md', pathname: '/',
  };
  const h = fakeHarness({ ...roleContext, tab: 'library', openId: 'old.md' }, {
    F, location,
    openResource: (ref, opts) => { opened.push([ref, opts.fromHistory, opts.search]); return Promise.resolve(true); },
  });
  h.windowHandlers.popstate({});
  assert.equal(h.controller.getState().openId, 'history.md');
  assert.deepEqual(opened, [['history.md', true, '?page=history.md']]);
});

test('nudge timers auto-dismiss after exactly 8 seconds', () => {
  let scheduled;
  const h = fakeHarness({ ...roleContext, sheet: 'risk.md', done: {} }, {
    F,
    setTimer: (fn, delay) => { scheduled = { fn, delay }; return 7; },
    clearTimer: () => {},
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  assert.equal(scheduled.delay, 8000);
  assert.equal(h.controller.getState().nudge, 'risk.md');
  scheduled.fn();
  assert.equal(h.controller.getState().nudge, null);
});
