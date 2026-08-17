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
  fdOpenResource: fdOpenResource,
  fdReader: fdReader,
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

test('legacy special-route aliases resolve to canonical Front Door state without becoming resources', () => {
  const complete = {
    role: 'first-role', roles: [{ id: 'first-role' }], rotationStart: '2026-08-17',
    week: 1, tab: 'library', openId: 'old.md', fromTab: 'library',
  };

  const home = F.fdResolveState('/?page=__home__&case=c1', complete);
  assert.equal(home.screen, 'app');
  assert.equal(home.tab, 'today');
  assert.equal(home.openId, undefined);

  const path = F.fdResolveState('/?page=__path__&case=c1', complete);
  assert.equal(path.screen, 'app');
  assert.equal(path.tab, 'path');
  assert.equal(path.openId, undefined);

  const start = F.fdResolveState('/?page=__start__&case=c1', complete);
  assert.equal(start.screen, 'app');
  assert.equal(start.openId, '__progress__');
  assert.equal(start.fromTab, 'today');

  const roleSetup = F.fdResolveState('/?page=__start__&case=c1', {
    roles: [{ id: 'first-role' }],
  });
  assert.equal(roleSetup.screen, 'setup-role');
  assert.equal(roleSetup.openId, undefined);
  assert.equal(roleSetup.tab, 'today');

  const weekSetup = F.fdResolveState('/?page=__start__&case=c1', {
    role: 'first-role', roles: [{ id: 'first-role' }],
  });
  assert.equal(weekSetup.screen, 'setup-week');
  assert.equal(weekSetup.openId, undefined);
  assert.equal(weekSetup.tab, 'today');

  assert.equal(F.fdResolveState('/?page=__progress__&case=c1', complete).openId, '__progress__');
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
  assert.deepEqual(F.fdDispatch({ 'data-fd-change-week': '' }, {}, roleContext), {
    patch: { screen: 'setup-week', tab: 'today', openId: null, searchOpen: false, sheet: null },
    route: '/', history: 'replace', effect: null,
  });
  assert.equal(F.fdDispatch({ 'data-fd-progress': '' }, {}, roleContext).effect.type, 'open-progress');
  assert.deepEqual(F.fdDispatch({ 'data-fd-theme': '' }, { theme: 'dark' }, roleContext).effect,
    { type: 'set-theme', theme: 'light' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-step': '2' }, {}, { ...roleContext, stepsDone: { 2: true } }).patch,
    { stepsDone: { 2: false } });
  assert.equal(F.fdDispatch({ 'data-fd-try-now': 'scale.html' }, {}, roleContext).patch.sheet,
    'item:scale.html');
});

test('change-week uses a reader origin only while a reader is open', () => {
  const reader = F.fdDispatch({ 'data-fd-change-week': '' }, { search: '?case=c1' }, {
    ...roleContext, tab: 'library', fromTab: 'path', openId: 'pending.md',
  });
  assert.deepEqual(reader, {
    patch: {
      screen: 'setup-week', tab: 'path', openId: null, searchOpen: false, sheet: null,
    },
    route: '?tab=path&case=c1', history: 'replace', effect: null,
  });

  const tabOnly = F.fdDispatch({ 'data-fd-change-week': '' }, { search: '?case=c1' }, {
    ...roleContext, tab: 'library', fromTab: 'today', openId: null,
  });
  assert.deepEqual(tabOnly, {
    patch: {
      screen: 'setup-week', tab: 'library', openId: null, searchOpen: false, sheet: null,
    },
    route: '?tab=library&case=c1', history: 'replace', effect: null,
  });
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

test('fdWire registers and destroys one delegated click/input/keydown/popstate listener for the live shell', () => {
  const rootCalls = [];
  const windowCalls = [];
  const rootRemoves = [];
  const windowRemoves = [];
  const root = {
    addEventListener: (type, fn) => rootCalls.push([type, fn]),
    removeEventListener: (type, fn) => rootRemoves.push([type, fn]),
  };
  const fakeWindow = {
    addEventListener: (type, fn) => windowCalls.push([type, fn]),
    removeEventListener: (type, fn) => windowRemoves.push([type, fn]),
    location: { href: 'https://example.test/', search: '', pathname: '/' },
  };
  const controller = F.fdWire(root, { ...roleContext }, { window: fakeWindow, render: () => {} });
  assert.deepEqual(rootCalls.map(([type]) => type), ['click', 'input']);
  assert.deepEqual(windowCalls.map(([type]) => type), ['keydown', 'popstate']);
  controller.destroy();
  assert.deepEqual(rootRemoves, rootCalls);
  assert.deepEqual(windowRemoves, windowCalls);
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
    matches: options.matches || (() => false),
  };
  const fakeWindow = {
    addEventListener(type, fn) { windowHandlers[type] = fn; },
    removeEventListener() {},
    location: options.location || { href: 'https://example.test/', search: '', pathname: '/' },
    history: options.history,
  };
  const controller = options.F.fdWire(root, initial, {
    window: fakeWindow,
    render: options.render || (() => {}),
    renderTransient: options.renderTransient,
    searchResults: options.searchResults,
    openResource: options.openResource,
    route: options.route,
    document: options.document,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    index: options.index || { byRef: {}, weeks: [] },
    synonyms: {},
    resourceHost: options.resourceHost,
    openProgress: options.openProgress,
    facultyPreview: options.facultyPreview,
    facultyPreviewLock: options.facultyPreviewLock,
    externalModalOpen: options.externalModalOpen,
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

test('theme rerender moves focus to the corresponding live theme control', () => {
  let replacement = null;
  const invoker = actionTarget({ 'data-fd-theme': '' });
  const h = fakeHarness({ ...roleContext, screen: 'app' }, {
    F,
    querySelector: (selector) => selector === '[data-fd-theme]' ? replacement : null,
    renderTransient: (_next, detail) => {
      if (detail.effect?.type === 'set-theme') {
        invoker.isConnected = false;
        replacement = actionTarget({ 'data-fd-theme': '' });
      }
    },
    document: { documentElement: {
      getAttribute: () => 'light', setAttribute() {},
    } },
  });
  h.rootHandlers.click({ target: invoker, preventDefault() {} });
  assert.equal(replacement.focused, 1,
    'the header replacement, not the disconnected old button, receives focus');
});

test('the Week control focuses the newly rendered setup heading', () => {
  let heading = null;
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F,
    querySelector: (selector) => selector === '.fd-setup .fd-h1' ? heading : null,
    render: (next) => {
      if (next.screen === 'setup-week') {
        heading = { isConnected: true, focus() { this.focused = (this.focused || 0) + 1; } };
      }
    },
  });
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-change-week': '' }), preventDefault() {},
  });
  assert.equal(h.controller.getState().screen, 'setup-week');
  assert.equal(heading.focused, 1);
});

test('Command-K is ignored while the independent capture dialog is open', () => {
  let captureOpen = true;
  const h = fakeHarness({ ...roleContext, screen: 'app', searchOpen: false }, {
    F, externalModalOpen: () => captureOpen,
  });
  h.windowHandlers.keydown({
    key: 'k', metaKey: true,
    target: { tagName: 'BUTTON', isContentEditable: false }, preventDefault() {},
  });
  assert.equal(h.controller.getState().searchOpen, false,
    'a second modal must not open above capture');
  captureOpen = false;
  h.windowHandlers.keydown({
    key: 'k', ctrlKey: true,
    target: { tagName: 'BUTTON', isContentEditable: false }, preventDefault() {},
  });
  assert.equal(h.controller.getState().searchOpen, true,
    'the shortcut remains available as soon as capture closes');
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

test('live search keeps focus and caret across real input-node replacement for multiple characters', () => {
  let currentInput;
  function replacement(value) {
    return {
      tagName: 'INPUT', isContentEditable: false, value,
      selectionStart: value.length, selectionEnd: value.length, selectionDirection: 'none',
      matches: (selector) => selector === '.fd-searchpanel__input',
      focus() { this.focused = (this.focused || 0) + 1; },
      setSelectionRange(start, end, direction) {
        this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction;
      },
    };
  }
  currentInput = replacement('');
  const h = fakeHarness({ ...roleContext, searchOpen: true, query: '' }, {
    F,
    querySelector: (selector) => selector === '.fd-searchpanel__input' ? currentInput : null,
    render: (next) => { currentInput = replacement(next.query || ''); },
  });
  const first = currentInput;
  first.value = 'a'; first.selectionStart = 1; first.selectionEnd = 1;
  h.rootHandlers.input({ target: first });
  assert.notEqual(currentInput, first);
  assert.equal(currentInput.focused, 1);
  assert.deepEqual([currentInput.selectionStart, currentInput.selectionEnd], [1, 1]);

  const second = currentInput;
  second.value = 'ab'; second.selectionStart = 2; second.selectionEnd = 2;
  h.rootHandlers.input({ target: second });
  assert.notEqual(currentInput, second);
  assert.equal(currentInput.value, 'ab');
  assert.equal(currentInput.focused, 1);
  assert.deepEqual([currentInput.selectionStart, currentInput.selectionEnd], [2, 2]);
});

test('nested overlay replacement focuses each new dialog and restores the stable root opener', () => {
  let currentDialog = null;
  const focused = [];
  function dialogFor(identity) {
    const control = {
      tagName: identity === 'search' ? 'INPUT' : 'BUTTON',
      isContentEditable: false, isConnected: true,
      matches: (selector) => identity === 'search' && selector === '.fd-searchpanel__input',
      focus() { focused.push(identity); },
    };
    return {
      control,
      querySelector: (selector) => selector === '.fd-searchpanel__input' && identity === 'search'
        ? control : null,
      querySelectorAll: () => [control],
    };
  }
  function render(next) {
    if (currentDialog) currentDialog.control.isConnected = false;
    const identity = next.searchOpen ? 'search' : next.sheet ? `sheet:${next.sheet}` : null;
    currentDialog = identity ? dialogFor(identity) : null;
  }
  const opener = actionTarget({ 'data-fd-search': '' });
  const h = fakeHarness({ ...roleContext }, {
    F, render, querySelector: () => currentDialog,
    searchResults: () => [{ kind: 'item', item: { ref: 'preview.md' } }],
  });
  h.rootHandlers.click({ target: opener, preventDefault() {} });
  const replacedSearchInput = currentDialog.control;
  h.windowHandlers.keydown({ key: 'Enter', target: replacedSearchInput, preventDefault() {} });
  assert.deepEqual(focused, ['search', 'sheet:item:preview.md']);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  assert.equal(opener.focused, 1);

  focused.length = 0;
  const kitOpener = actionTarget({ 'data-fd-safety': '' });
  h.rootHandlers.click({ target: kitOpener, preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-safety': 'risk.md' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-safety': '' }), preventDefault() {} });
  assert.deepEqual(focused, ['sheet:kit', 'sheet:risk.md', 'sheet:kit']);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  assert.equal(kitOpener.focused, 1);

  const disconnectedOpener = actionTarget({ 'data-fd-search': '' });
  h.rootHandlers.click({ target: disconnectedOpener, preventDefault() {} });
  disconnectedOpener.isConnected = false;
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-search': '' }), preventDefault() {} });
  assert.equal(disconnectedOpener.focused, undefined, 'detached opener is skipped without throwing');
});

test('destination renders before resource and Progress effects mount into the fresh host', () => {
  const order = [];
  const requests = [];
  let host = { name: 'old', innerHTML: '' };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F,
    render: () => { order.push('render'); host = { name: 'fresh', innerHTML: '' }; },
    querySelector: (selector) => selector === '#content' ? host : null,
    openResource: (ref, opts) => {
      requests.push([ref, opts]);
      order.push(`resource:${ref}:${opts.host && opts.host.name}`);
      opts.host.innerHTML = '<iframe></iframe>';
    },
    openProgress: () => { order.push('progress'); },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'tool.html' }), preventDefault() {} });
  assert.deepEqual(order, ['render', 'resource:tool.html:fresh']);
  assert.equal(host.innerHTML, '<iframe></iframe>');
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'new.md' }), preventDefault() {} });
  assert.equal(requests[0][1].isCurrent(), false, 'new navigation invalidates the old resource');
  assert.equal(requests[1][1].isCurrent(), true);
  order.length = 0;
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-progress': '' }), preventDefault() {} });
  assert.deepEqual(order, ['render', 'progress']);
});

test('transient chrome and completion renders preserve one live resource node without reopening it', () => {
  const ls = memStorage();
  const LocalF = make(ls);
  const fullRenders = [];
  const transientRenders = [];
  const openCalls = [];
  let scheduled;
  let resourceNode = null;
  let articleNode = null;
  let host = { innerHTML: '', article: null };
  let searchInput = null;
  const completionChrome = {
    desktopDone: false, mobileDone: false, railCount: 0, completedSuffixHidden: true,
  };
  function updateSearch(next) {
    if (next.searchOpen) {
      searchInput = {
        tagName: 'INPUT', isContentEditable: false, value: next.query || '',
        selectionStart: (next.query || '').length, selectionEnd: (next.query || '').length,
        selectionDirection: 'none',
        matches: (selector) => selector === '.fd-searchpanel__input',
        focus() {}, setSelectionRange() {},
      };
    } else searchInput = null;
  }
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: null, done: {}, autoAdvance: false,
  }, {
    F: LocalF,
    index: { byRef: {}, weeks: [{ n: 2, items: [{ ref: 'live.html' }] }] },
    render(next) {
      fullRenders.push({ ...next });
      host = { innerHTML: '', article: null };
      resourceNode = null;
      articleNode = null;
      updateSearch(next);
    },
    renderTransient(next, detail) {
      transientRenders.push({ state: { ...next }, detail });
      if (detail.surfaces.completion) {
        const count = Object.keys(next.done || {}).length;
        completionChrome.desktopDone = next.done?.['live.html'] === true;
        completionChrome.mobileDone = next.done?.['live.html'] === true;
        completionChrome.railCount = count;
        completionChrome.completedSuffixHidden = count === 0;
      }
      updateSearch(next);
    },
    querySelector: (selector) => {
      if (selector === '#content') return host;
      if (selector === '.fd-searchpanel__input') return searchInput;
      return null;
    },
    openResource(ref, opts) {
      openCalls.push([ref, opts]);
      resourceNode = { kind: 'iframe', session: 'in-progress' };
      articleNode = { kind: 'article', iframe: resourceNode };
      opts.host.article = articleNode;
    },
    document: { documentElement: {
      getAttribute: () => 'light', setAttribute() {},
    } },
    setTimer: (fn, delay) => { scheduled = { fn, delay }; return 1; },
    clearTimer() {},
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'live.html' }), preventDefault() {} });
  const liveNode = resourceNode;
  const liveArticle = articleNode;
  const liveHost = host;
  assert.equal(openCalls.length, 1);

  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': '' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-search': '' }), preventDefault() {} });
  searchInput.value = 'ab'; searchInput.selectionStart = 2; searchInput.selectionEnd = 2;
  h.rootHandlers.input({ target: searchInput });
  h.windowHandlers.keydown({ key: 'Escape', target: searchInput, preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-safety': '' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-safety': 'risk.md' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  assert.equal(scheduled.delay, 8000);
  scheduled.fn();
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-toggle': 'live.html' }), preventDefault() {} });

  assert.equal(fullRenders.length, 1, 'only the initial resource navigation replaces the base');
  assert.equal(host, liveHost);
  assert.equal(resourceNode, liveNode);
  assert.equal(articleNode, liveArticle);
  assert.equal(host.article, liveArticle);
  assert.equal(host.article.iframe, liveNode);
  assert.equal(openCalls.length, 1, 'the iframe is never reloaded to preserve it');
  const theme = transientRenders.find(({ detail }) => detail.effect?.type === 'set-theme');
  assert.deepEqual(theme.detail.surfaces,
    { base: false, overlay: false, completion: false, chrome: true });
  assert.equal(theme.detail.preserveResource, true);
  assert.equal(theme.detail.effect.theme, 'dark',
    'transient renderer consumes the requested theme instead of rereading old document state');
  const search = transientRenders.find(({ detail }) => detail.effect?.type === 'search-input');
  assert.equal(search.detail.surfaces.overlay, true);
  assert.equal(search.detail.preserveResource, true);
  const sheet = transientRenders.find(({ detail }) => detail.effect?.type === 'open-sheet');
  assert.equal(sheet.detail.surfaces.overlay, true);
  assert.equal(sheet.detail.preserveResource, true);
  const nudge = transientRenders.find(({ detail }) => detail.effect?.type === 'nudge-timeout');
  const dismissed = transientRenders.find(({ detail }) => detail.effect?.type === 'nudge-dismiss');
  assert.equal(nudge.detail.surfaces.overlay, true);
  assert.equal(dismissed.detail.surfaces.overlay, true);
  assert.equal(dismissed.detail.preserveResource, true);
  const completion = transientRenders.find(({ detail }) => detail.effect?.type === 'toggle-progress');
  assert.equal(completion.state.done['live.html'], true);
  assert.equal(completion.detail.surfaces.completion, true);
  assert.equal(completion.detail.baseChanged, false);
  assert.equal(completion.detail.preserveResource, true);
  assert.deepEqual(completionChrome, {
    desktopDone: true, mobileDone: true, railCount: 1, completedSuffixHidden: false,
  });
});

test('the permitted faculty-preview theme transition preserves the exact governed resource node', () => {
  const ls = memStorage();
  const LocalF = make(ls);
  const liveNode = { kind: 'governed-preview-iframe', session: 'exact-revision' };
  const host = { resource: liveNode };
  let fullRenders = 0;
  let transientRenders = 0;
  let historyWrites = 0;
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: 'locked.html', fromTab: 'today',
  }, {
    F: LocalF, facultyPreview: true,
    render: () => { fullRenders += 1; host.resource = { replaced: true }; },
    renderTransient: () => { transientRenders += 1; },
    querySelector: (selector) => selector === '#content' ? host : null,
    document: { documentElement: {
      getAttribute: () => 'light', setAttribute() {},
    } },
    history: {
      replaceState() { historyWrites += 1; }, pushState() { historyWrites += 1; },
    },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': '' }), preventDefault() {} });
  assert.equal(fullRenders, 0);
  assert.equal(transientRenders, 1);
  assert.equal(host.resource, liveNode);
  assert.equal(ls.getItem('cw_theme'), 'dark');
  assert.equal(historyWrites, 0, 'faculty preview owns its exact route without controller history writes');
});

test('same-tab Path changes use an explicit base-without-resource transient detail contract', () => {
  const details = [];
  let fullRenders = 0;
  const location = {
    href: 'https://example.test/?tab=path&case=c1', pathname: '/', search: '?tab=path&case=c1',
  };
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'path', viewWeek: 2, openId: null,
  }, {
    F, location, render: () => { fullRenders += 1; },
    renderTransient: (_state, detail) => { details.push(detail); },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-view-week': '3' }), preventDefault() {} });
  h.controller.dispatch({ 'data-fd-setweek': '4' }, {
    nowMs: new Date(2026, 7, 12, 9, 0, 0).getTime(),
  });
  assert.equal(fullRenders, 0);
  assert.deepEqual(details.map((detail) => ({
    kind: detail.kind,
    changed: detail.changed,
    surfaces: detail.surfaces,
    preserveResource: detail.preserveResource,
  })), [
    {
      kind: 'transient', changed: ['viewWeek'],
      surfaces: { base: true, overlay: false, completion: false, chrome: false },
      preserveResource: false,
    },
    {
      kind: 'transient', changed: ['week', 'viewWeek'],
      surfaces: { base: true, overlay: false, completion: false, chrome: true },
      preserveResource: false,
    },
  ]);
});

test('Escape closes search even when its focused input owns typing-shortcut suppression', () => {
  const h = fakeHarness({ ...roleContext, screen: 'app', searchOpen: true, query: 'abc' }, { F });
  let prevented = 0;
  h.windowHandlers.keydown({
    key: 'Escape', target: { tagName: 'INPUT', isContentEditable: false },
    preventDefault() { prevented += 1; },
  });
  assert.equal(h.controller.getState().searchOpen, false);
  assert.equal(h.controller.getState().query, '');
  assert.equal(prevented, 1);
});

test('faculty preview rejects controller actions before state, render, route, resource, or storage changes', () => {
  const ls = memStorage();
  const LocalF = make(ls);
  const renders = [];
  const routes = [];
  const opened = [];
  let locks = 0;
  const initial = {
    ...roleContext, screen: 'app', tab: 'today', openId: 'locked.md', fromTab: 'today',
    searchOpen: false, sheet: null,
  };
  const h = fakeHarness(initial, {
    F: LocalF, render: (next) => renders.push({ ...next }), route: (route) => routes.push(route),
    openResource: (ref) => opened.push(ref), facultyPreview: true,
    facultyPreviewLock: () => { locks += 1; },
    index: { byRef: {}, weeks: [{ n: 2, items: [{ ref: 'locked.md' }, { ref: 'next.md' }] }] },
  });
  for (const attrs of [
    { 'data-fd-tab': 'path' }, { 'data-fd-open': 'other.md' }, { 'data-fd-search': '' },
    { 'data-fd-safety': '' }, { 'data-fd-home': '' },
  ]) {
    h.rootHandlers.click({ target: actionTarget(attrs), preventDefault() {} });
  }
  const keyTarget = { tagName: 'BUTTON', isContentEditable: false };
  for (const key of ['ArrowRight', '2', '/']) {
    h.windowHandlers.keydown({ key, target: keyTarget, preventDefault() {} });
  }
  assert.deepEqual(h.controller.getState(), initial);
  assert.deepEqual(renders, []);
  assert.deepEqual(routes, []);
  assert.deepEqual(opened, []);
  assert.deepEqual(ls.dump(), {});
  assert.equal(locks, 8);

  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': '' }), preventDefault() {} });
  assert.equal(ls.getItem('cw_theme'), 'dark', 'legacy preview still permits its theme toggle');
  assert.equal(locks, 8);
});

test('faculty preview popstate locks only after the pinned exact-revision route changes', () => {
  let locks = 0;
  const location = {
    href: 'https://example.test/?page=locked.md&reviewKey=page%3Alocked.md',
    pathname: '/', search: '?page=locked.md&reviewKey=page%3Alocked.md',
  };
  const h = fakeHarness({ ...roleContext, openId: 'locked.md' }, {
    F, location, facultyPreview: true, facultyPreviewLock: () => { locks += 1; },
  });
  h.windowHandlers.popstate({ state: null });
  assert.equal(locks, 0, 'same exact-revision route remains allowed');
  location.href = 'https://example.test/?page=other.md';
  location.search = '?page=other.md';
  h.windowHandlers.popstate({ state: null });
  assert.equal(locks, 1, 'leaving the exact revision invokes the legacy lock');
});

function memoryHistory(location) {
  const entries = [];
  let position = -1;
  let popstate;
  function applyUrl(route) {
    const next = new URL(route, location.href);
    location.href = next.href; location.pathname = next.pathname; location.search = next.search;
  }
  return {
    entries,
    history: {
      replaceState(state, _title, route) {
        applyUrl(route);
        if (position < 0) { entries.push({ state, route }); position = 0; }
        else entries[position] = { state, route };
      },
      pushState(state, _title, route) {
        applyUrl(route);
        entries.splice(position + 1);
        entries.push({ state, route }); position += 1;
      },
    },
    bind(fn) { popstate = fn; },
    go(delta) {
      position += delta;
      const entry = entries[position];
      applyUrl(entry.route);
      popstate({ state: entry.state });
    },
  };
}

test('initial legacy aliases replace only the route portion and never call the resource opener', () => {
  const cases = [
    ['__home__', '/?case=c1', 'today', null],
    ['__path__', '?tab=path&case=c1', 'path', null],
    ['__start__', '?page=__progress__&case=c1', 'today', '__progress__'],
  ];
  for (const [alias, expectedRoute, expectedTab, expectedOpen] of cases) {
    const location = {
      href: `https://example.test/?page=${alias}&case=c1`, pathname: '/',
      search: `?page=${alias}&case=c1`,
    };
    const memory = memoryHistory(location);
    const opened = [];
    const resolved = F.fdResolveState(location.href, {
      ...roleContext, roles: [{ id: 'first-role' }], rotationStart: '2026-08-17',
      screen: 'app', tab: 'library',
    });
    const h = fakeHarness(resolved, {
      F, location, history: memory.history,
      openResource: (ref) => { opened.push(ref); },
      openProgress: () => {},
    });
    memory.bind(h.windowHandlers.popstate);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.entries[0].route, expectedRoute);
    assert.equal(h.controller.getState().tab, expectedTab);
    assert.equal(h.controller.getState().openId ?? null, expectedOpen);
    assert.deepEqual(opened, [], `${alias} must never be fetched as content`);
  }
});

test('initial Home alias persists its normalized Today state before the canonical URL reloads', () => {
  const stored = {
    ...roleContext,
    roles: [{ id: 'first-role' }],
    rotationStart: '2026-08-17',
    screen: 'app',
    tab: 'library',
    openId: 'orientation.md',
    fromTab: 'library',
  };
  const ls = memStorage({
    cw_frontdoor_v1: JSON.stringify(stored),
    cw_last: 'orientation.md',
  });
  const LocalF = make(ls);
  const location = {
    href: 'https://example.test/?page=__home__&case=reload', pathname: '/',
    search: '?page=__home__&case=reload',
  };
  const memory = memoryHistory(location);
  const resolved = LocalF.fdResolveState(location.href, stored);

  fakeHarness(resolved, { F: LocalF, location, history: memory.history });

  assert.equal(location.search, '?case=reload');
  const persisted = JSON.parse(ls.dump().cw_frontdoor_v1);
  assert.equal(persisted.tab, 'today');
  assert.equal(persisted.openId, undefined);
  assert.equal(ls.dump().cw_last, 'orientation.md');
  const reloaded = LocalF.fdResolveState(location.href, persisted);
  assert.equal(reloaded.tab, 'today');
  assert.equal(reloaded.openId, undefined);
});

test('delegated and popstate aliases normalize with replace history and no invalid resource open', () => {
  const ls = memStorage({ cw_last: 'real-page.md' });
  const LocalF = make(ls);
  const location = {
    href: 'https://example.test/?page=real-page.md&case=c1', pathname: '/',
    search: '?page=real-page.md&case=c1',
  };
  const memory = memoryHistory(location);
  const opened = [];
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'library', openId: 'real-page.md', fromTab: 'library',
  }, {
    F: LocalF, location, history: memory.history,
    openResource: (ref) => { opened.push(ref); }, openProgress: () => {},
  });
  memory.bind(h.windowHandlers.popstate);

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-open': '__path__' }), preventDefault() {},
  });
  assert.equal(location.search, '?tab=path&case=c1');
  assert.equal(memory.entries.length, 1, 'legacy dispatch replaces rather than pushes');
  assert.equal(h.controller.getState().tab, 'path');
  assert.equal(h.controller.getState().openId, null);

  location.href = 'https://example.test/?page=__home__&case=c1';
  location.search = '?page=__home__&case=c1';
  h.windowHandlers.popstate({ state: { fd: true, state: {
    tab: 'library', openId: '__home__', fromTab: 'library',
  } } });
  assert.equal(location.search, '?case=c1');
  assert.equal(h.controller.getState().tab, 'today');
  assert.equal(h.controller.getState().openId, null);
  assert.deepEqual(opened, []);
  assert.equal(ls.getItem('cw_last'), 'real-page.md');
});

test('history snapshots restore Today/page/Today across Back and Forward without duplicate pushes', () => {
  const location = {
    href: 'https://example.test/?case=c1', pathname: '/', search: '?case=c1',
  };
  const memory = memoryHistory(location);
  const opened = [];
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: null, fromTab: 'today',
  }, {
    F, location, history: memory.history,
    openResource: (ref) => { opened.push(ref); return Promise.resolve(true); },
  });
  memory.bind(h.windowHandlers.popstate);
  assert.equal(memory.entries.length, 1, 'current entry receives replaceState on installation');
  assert.equal(memory.entries[0].state.fd, true);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'page.md' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-home': '' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-home': '' }), preventDefault() {} });
  assert.deepEqual(memory.entries.map((entry) => entry.route), [
    '/?case=c1', '?page=page.md&case=c1', '/?case=c1',
  ]);
  memory.go(-1);
  assert.equal(h.controller.getState().openId, 'page.md');
  memory.go(-1);
  assert.equal(h.controller.getState().openId, null, 'bare Today clears the stale resource');
  assert.equal(h.controller.getState().tab, 'today');
  memory.go(1);
  assert.equal(h.controller.getState().openId, 'page.md');
  memory.go(1);
  assert.equal(h.controller.getState().openId, null);
  assert.deepEqual(opened, ['page.md', 'page.md', 'page.md']);
});

test('history snapshots own only route-local state and Back keeps the newer canonical rotation', () => {
  const ls = memStorage();
  const LocalF = make(ls);
  const location = {
    href: 'https://example.test/?tab=path&case=c1', pathname: '/', search: '?tab=path&case=c1',
  };
  const memory = memoryHistory(location);
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'path', viewWeek: 2, openId: null,
    autoAdvance: false,
  }, { F: LocalF, location, history: memory.history });
  memory.bind(h.windowHandlers.popstate);
  assert.deepEqual(memory.entries[0].state.state,
    { tab: 'path', viewWeek: 2, openId: null });
  for (const forbidden of ['role', 'week', 'screen', 'autoAdvance']) {
    assert.equal(forbidden in memory.entries[0].state.state, false);
  }

  h.controller.dispatch({ 'data-fd-setweek': '4' }, {
    nowMs: new Date(2026, 7, 12, 9, 0, 0).getTime(),
  });
  assert.equal(memory.entries.length, 1, 'route-less viewWeek change replaces the current snapshot');
  assert.equal(memory.entries[0].state.state.viewWeek, 4);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'page.md' }), preventDefault() {} });
  memory.go(-1);
  const restored = h.controller.getState();
  assert.equal(restored.tab, 'path');
  assert.equal(restored.viewWeek, 4);
  assert.equal(restored.week, 4, 'canonical week is not rolled back by route history');
  assert.equal(restored.role, 'first-role');
  assert.equal(restored.screen, 'app');
  assert.equal(restored.autoAdvance, false);
  assert.equal(ls.getItem('cw_rotation_start'), '2026-07-20');
  assert.equal(location.search, '?tab=path&case=c1');
});

test('same-route Home replaces a bare restored-reader snapshot before later Back navigation', () => {
  const location = { href: 'https://example.test/', pathname: '/', search: '' };
  const memory = memoryHistory(location);
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: 'saved.md', fromTab: 'today',
  }, { F, location, history: memory.history });
  memory.bind(h.windowHandlers.popstate);
  assert.equal(memory.entries[0].state.state.openId, 'saved.md');
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-home': '' }), preventDefault() {} });
  assert.equal(memory.entries.length, 1);
  assert.equal(memory.entries[0].state.state.openId, null,
    'same bare URL now owns Today rather than the restored reader fallback');
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'other.md' }), preventDefault() {} });
  memory.go(-1);
  assert.equal(h.controller.getState().tab, 'today');
  assert.equal(h.controller.getState().openId, null);
});

test('an older sparse route snapshot cannot inherit newer viewWeek or fromTab values', () => {
  const location = { href: 'https://example.test/', pathname: '/', search: '' };
  const memory = memoryHistory(location);
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: null,
  }, { F, location, history: memory.history });
  memory.bind(h.windowHandlers.popstate);
  assert.deepEqual(memory.entries[0].state.state, { tab: 'today', openId: null });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-view-week': '4' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'page.md' }), preventDefault() {} });
  assert.equal(h.controller.getState().viewWeek, 4);
  assert.equal(h.controller.getState().fromTab, 'path');
  memory.go(-2);
  const restored = h.controller.getState();
  assert.equal(restored.tab, 'today');
  assert.equal(restored.openId, null);
  assert.equal('viewWeek' in restored, false);
  assert.equal('fromTab' in restored, false);
});

test('popstate accepts only route-local snapshot keys and preserves canonical controller state', () => {
  const location = {
    href: 'https://example.test/?page=history.md&case=c1', pathname: '/',
    search: '?page=history.md&case=c1',
  };
  const h = fakeHarness({
    ...roleContext, role: 'new-role', week: 4, viewWeek: 4, screen: 'app',
    tab: 'today', openId: null, autoAdvance: false, rotationStart: '2026-07-20',
  }, {
    F, location, openResource: () => Promise.resolve(true),
  });
  h.windowHandlers.popstate({ state: { fd: true, state: {
    tab: 'library', viewWeek: 3, openId: 'history.md', fromTab: 'path',
    role: 'old-role', week: 1, screen: 'setup-role', autoAdvance: true,
    rotationStart: '1999-01-01',
  } } });
  const restored = h.controller.getState();
  assert.deepEqual({
    tab: restored.tab, viewWeek: restored.viewWeek,
    openId: restored.openId, fromTab: restored.fromTab,
  }, { tab: 'library', viewWeek: 3, openId: 'history.md', fromTab: 'path' });
  assert.deepEqual({
    role: restored.role, week: restored.week, screen: restored.screen,
    autoAdvance: restored.autoAdvance, rotationStart: restored.rotationStart,
  }, {
    role: 'new-role', week: 4, screen: 'app', autoAdvance: false,
    rotationStart: '2026-07-20',
  });
});

test('change-week replaces a reader route with its originating tab and keeps Back/Forward reader-free', () => {
  const location = {
    href: 'https://example.test/?case=c1', pathname: '/', search: '?case=c1',
  };
  const memory = memoryHistory(location);
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'path', viewWeek: 2,
    openId: null, fromTab: 'path',
  }, {
    F, location, history: memory.history,
    openResource: () => Promise.resolve(true),
  });
  memory.bind(h.windowHandlers.popstate);
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-open': 'earlier.md' }), preventDefault() {},
  });
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-open': 'pending.md' }), preventDefault() {},
  });
  assert.equal(location.href, 'https://example.test/?page=pending.md&case=c1');
  assert.equal(memory.entries.length, 3);

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-change-week': '' }), preventDefault() {},
  });
  assert.equal(location.href, 'https://example.test/?tab=path&case=c1');
  assert.equal(memory.entries.length, 3, 'the current reader entry is replaced, not retained behind setup');
  assert.equal(h.controller.getState().screen, 'setup-week');
  assert.equal(h.controller.getState().openId, null);
  assert.equal(h.controller.getState().tab, 'path');

  memory.go(-1);
  assert.equal(h.controller.getState().screen, 'setup-week');
  assert.equal(h.controller.getState().openId, null);
  assert.equal(location.search, '?tab=path&case=c1',
    'an older reader entry is normalized before it can coexist with setup');
  memory.go(1);
  assert.equal(h.controller.getState().screen, 'setup-week');
  assert.equal(h.controller.getState().openId, null);
  assert.equal(location.search, '?tab=path&case=c1');

  const reloadRoute = F.fdResolveState(location.href, {
    ...roleContext, tab: 'path', viewWeek: 2,
  });
  assert.equal(reloadRoute.tab, 'path');
  assert.equal(reloadRoute.openId, undefined);
});

test('delayed markdown mounts completion chrome from live controller state without reopening', async () => {
  const host = { innerHTML: '' };
  const item = {
    ref: 'delayed.md', kind: 'read', title: 'Delayed', minutes: 4,
    summary: 'Wait for it.', points: [], attested: false, toolRef: null,
  };
  const index = {
    byRef: { 'delayed.md': item },
    weeks: [{ n: 2, items: [item] }],
  };
  let resolveMarkdown;
  let pending;
  let opens = 0;
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: null,
    fromTab: 'today', done: {}, autoAdvance: false,
  }, {
    F, index, querySelector: (selector) => selector === '#content' ? host : null,
    openResource(ref, opts) {
      opens += 1;
      pending = F.fdOpenResource(ref, {
        ...opts, index, state: opts.state, host,
        fetcher: () => Promise.resolve({
          ok: true,
          text: () => new Promise((resolve) => { resolveMarkdown = resolve; }),
        }),
        parseMarkdown: (markdown) => `<p>${markdown}</p>`,
        governanceNotice: () => '', renderReader: F.fdReader,
        facultyPreviewMatches: () => true,
      });
    },
  });
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-open': 'delayed.md' }), preventDefault() {},
  });
  await Promise.resolve();
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-toggle': 'delayed.md' }), preventDefault() {},
  });
  assert.equal(h.controller.getState().done['delayed.md'], true);
  assert.equal(opens, 1);
  resolveMarkdown('Body');
  assert.equal(await pending, true);
  assert.equal((host.innerHTML.match(/aria-pressed="true"/g) || []).length, 2,
    'desktop and mobile completion buttons render pressed');
  assert.equal((host.innerHTML.match(/aria-pressed="false"/g) || []).length, 0);
  assert.match(host.innerHTML, /Week 2 · 1 of 1 done/);
  assert.match(host.innerHTML, /fd-railnav__dot is-done/);
  assert.match(host.innerHTML, /fd-visually-hidden">Completed/);
  assert.equal(opens, 1, 'completion does not reload the resource');
});

test('destroy invalidates pending resource success and failure before either can reuse the host', async () => {
  const host = { innerHTML: '<p>reused host</p>' };
  let releaseSuccess;
  let releaseFailure;
  let currentness;
  let success;
  let failure;
  const index = {
    byRef: { 'pending.md': { ref: 'pending.md', kind: 'read', title: 'Pending' } }, weeks: [],
  };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F, index, querySelector: (selector) => selector === '#content' ? host : null,
    openResource(ref, opts) {
      currentness = opts.isCurrent;
      const common = {
        ...opts, index, state: h.controller.getState(), host,
        parseMarkdown: (text) => `<p>${text}</p>`, governanceNotice: () => '',
        renderReader: (_index, _state, body) => body, facultyPreviewMatches: () => true,
      };
      success = F.fdOpenResource(ref, {
        ...common,
        fetcher: () => new Promise((resolve) => { releaseSuccess = resolve; }),
      });
      failure = F.fdOpenResource(ref, {
        ...common,
        fetcher: () => new Promise((_resolve, reject) => { releaseFailure = reject; }),
      });
    },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'pending.md' }), preventDefault() {} });
  assert.equal(currentness(), true);
  h.controller.destroy();
  assert.equal(currentness(), false);
  releaseSuccess({ ok: true, text: async () => 'late success' });
  releaseFailure(new Error('late failure'));
  assert.deepEqual(await Promise.all([success, failure]), [false, false]);
  assert.equal(host.innerHTML, '<p>reused host</p>');
});

test('destroy cancels an already-scheduled nudge render even if its callback races cleanup', () => {
  let scheduled;
  let transientRenders = 0;
  let cleared = 0;
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: 'live.html', sheet: 'risk.md', done: {},
  }, {
    F, renderTransient: () => { transientRenders += 1; },
    setTimer: (fn) => { scheduled = fn; return 17; },
    clearTimer: (id) => { assert.equal(id, 17); cleared += 1; },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  assert.equal(h.controller.getState().nudge, 'risk.md');
  assert.equal(transientRenders, 1);
  h.controller.destroy();
  assert.equal(cleared, 1);
  scheduled();
  assert.equal(h.controller.getState().nudge, 'risk.md');
  assert.equal(transientRenders, 1, 'racing callback does not touch the retired controller DOM');
});

test('reopening the same resource invalidates the older same-ref request generation', () => {
  const requests = [];
  let host = { innerHTML: '' };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F,
    render: () => { host = { innerHTML: '' }; },
    querySelector: (selector) => selector === '#content' ? host : null,
    openResource: (ref, opts) => { requests.push([ref, opts]); },
  });
  const open = () => h.rootHandlers.click({
    target: actionTarget({ 'data-fd-open': 'same.md' }), preventDefault() {},
  });
  open();
  assert.equal(requests[0][1].isCurrent(), true);
  open();
  assert.equal(requests.length, 2);
  assert.equal(requests[0][1].isCurrent(), false);
  assert.equal(requests[1][1].isCurrent(), true);
});

test('change-week clears the base resource and invalidates its late markdown response', async () => {
  let oldHost = { innerHTML: '' };
  let currentHost = oldHost;
  let release;
  let rejectFailure;
  let pending;
  let pendingFailure;
  let currentness;
  const index = {
    byRef: { 'pending.md': { ref: 'pending.md', kind: 'read', title: 'Pending' } }, weeks: [],
  };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F, index,
    render: (next) => {
      currentHost = { innerHTML: next.screen === 'setup-week' ? '<p>setup surface</p>' : '' };
    },
    querySelector: (selector) => selector === '#content' ? currentHost : null,
    openResource(ref, opts) {
      oldHost = opts.host;
      currentness = opts.isCurrent;
      pending = F.fdOpenResource(ref, {
        ...opts, index, state: h.controller.getState(),
        fetcher: () => new Promise((resolve) => { release = resolve; }),
        parseMarkdown: (text) => `<p>${text}</p>`, governanceNotice: () => '',
        renderReader: (_index, _state, body) => body, facultyPreviewMatches: () => true,
      });
      pendingFailure = F.fdOpenResource(ref, {
        ...opts, index, state: h.controller.getState(),
        fetcher: () => new Promise((_resolve, reject) => { rejectFailure = reject; }),
        parseMarkdown: (text) => `<p>${text}</p>`, governanceNotice: () => '',
        renderReader: (_index, _state, body) => body, facultyPreviewMatches: () => true,
      });
    },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'pending.md' }), preventDefault() {} });
  assert.equal(currentness(), true);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-change-week': '' }), preventDefault() {} });
  assert.equal(h.controller.getState().screen, 'setup-week');
  assert.equal(h.controller.getState().openId, null);
  assert.equal(currentness(), false);
  release({ ok: true, text: async () => 'late old page' });
  rejectFailure(new Error('late old failure'));
  assert.equal(await pending, false);
  assert.equal(await pendingFailure, false);
  assert.equal(oldHost.innerHTML, '');
  assert.equal(currentHost.innerHTML, '<p>setup surface</p>');
});

test('popstate Progress uses the internal Progress path and never generic resource loading', () => {
  const opened = [];
  const progress = [];
  const location = {
    href: 'https://example.test/?page=__progress__', pathname: '/', search: '?page=__progress__',
  };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F, location, openResource: (ref) => opened.push(ref), openProgress: () => progress.push('open'),
  });
  h.windowHandlers.popstate({
    state: { fd: true, state: { tab: 'today', openId: '__progress__' } },
  });
  assert.deepEqual(progress, ['open']);
  assert.deepEqual(opened, []);
});
