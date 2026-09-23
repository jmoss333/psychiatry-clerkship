import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const phase = read('phase_policy.js');
const state = read('frontdoor/fd_state.js');
const readingPlace = read('frontdoor/fd_reading_place.js');
const data = read('frontdoor/fd_data.js');
const careNavigator = read('frontdoor/fd_care_navigator.js');
const today = read('frontdoor/fd_today.js');
const block = read('frontdoor/fd_block.js');
const reader = read('frontdoor/fd_reader.js');
const shell = read('frontdoor/fd_shell.js');
const practice = read('frontdoor/fd_app_practice.js');
const path = read('frontdoor/fd_path.js');
const wire = read('frontdoor/fd_wire.js');
const offline = read('frontdoor/fd_offline.js');
const spa = read('spa_index.html');
const CUR = JSON.parse(readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8'));

// eslint-disable-next-line no-new-func
const make = new Function('localStorage', `${phase}\n${state}\n${readingPlace}\n${data}\n${careNavigator}\n${today}\n${block}\n${reader}\n${shell}\n${practice}\n${path}\n${wire}\nreturn {
  fdResolveState: fdResolveState,
  fdDispatch: fdDispatch,
  fdIsTypingTarget: fdIsTypingTarget,
  fdTrapFocus: fdTrapFocus,
  fdOpenResource: fdOpenResource,
  fdReader: fdReader,
  fdWire: fdWire,
  fdInstallReadingPlace: fdInstallReadingPlace,
  fdReadingFocusAllowed: fdReadingFocusAllowed,
  fdDockSource: typeof fdDockSource === 'function' ? fdDockSource : null,
  fdForwardDockAction: typeof fdForwardDockAction === 'function' ? fdForwardDockAction : null,
  fdThemeMode: fdThemeMode,
  fdClearDeviceData: fdClearDeviceData,
};`);

// length/key(i) are part of the real Storage interface and are what any sweep over the store has
// to walk. A fake without them makes a sweep silently a no-op -- it finds nothing, throws nothing,
// and reports success -- so leaving them out would have let the erase pass its own effect test.
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

const F = make(memStorage());
// eslint-disable-next-line no-new-func
const Offline = new Function(`${offline}\nreturn { fdOfflineMonitor };`)();

test('live route transitions invalidate a pending offline check before the old reply arrives', async () => {
  const posts = [];
  const channels = [];
  const timers = new Map();
  let timerId = 0;
  function MessageChannel() {
    this.port1 = { onmessage: null, close() {} };
    this.port2 = { close() {} };
    channels.push(this);
  }
  const worker = { postMessage(value) { posts.push(value); } };
  const serviceWorker = { controller: worker, addEventListener() {}, removeEventListener() {} };
  const idx = {
    weeks: [{ n: 2, items: [{ ref: 'two.md' }] }, { n: 3, items: [{ ref: 'three.md' }] }],
    byRef: { 'two.md': { ref: 'two.md', kind: 'read' },
      'three.md': { ref: 'three.md', kind: 'read' } },
  };
  const monitor = Offline.fdOfflineMonitor({ serviceWorker, MessageChannel,
    setTimer(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimer(id) { timers.delete(id); } });
  const sync = (state) => monitor.sync(idx, { ...state, appMode: false });
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F, index: idx, render: sync, renderTransient: sync,
  });
  sync(h.controller.getState());
  const oldReply = channels[0].port1.onmessage;
  h.controller.dispatch({ 'data-fd-setweek': '3' });
  assert.deepEqual(posts[0].urls, ['/', '/search-index.json', '/content/two.md']);
  assert.deepEqual(posts[1].urls, ['/', '/search-index.json', '/content/three.md']);
  oldReply({ data: { version: 'old', ready: true, present: posts[0].urls, missing: [] } });
  assert.equal(monitor.status().checking, true);
  channels[1].port1.onmessage({ data: { version: 'new', ready: true,
    present: posts[1].urls, missing: [] } });
  await Promise.resolve();
  assert.equal(monitor.status().response.version, 'new');
  h.controller.dispatch({ 'data-fd-tab': 'library' });
  assert.equal(monitor.status(), null);
  monitor.destroy();
  h.controller.destroy();
});

test('dock forwards once to the current connected source and rejects a stale id', () => {
  let clicks = 0;
  const source = { isConnected: true, click() { clicks++; },
    getAttribute(name) { return name === 'data-fd-dock-label' ? 'Continue' : 'primary-week'; } };
  const root = { querySelector() { return source; }, querySelectorAll() { return [source]; } };
  assert.deepEqual(F.fdDockSource(root), { id: 'primary-week', label: 'Continue' });
  assert.equal(F.fdForwardDockAction(root, 'primary-week'), true);
  assert.equal(clicks, 1);
  assert.equal(F.fdForwardDockAction(root, 'stale-id'), false);
  assert.equal(clicks, 1);
  source.isConnected = false;
  assert.equal(F.fdDockSource(root), null);
  assert.equal(F.fdForwardDockAction(root, 'primary-week'), false);
  assert.equal(clicks, 1);
});

test('dock click forwards to the source; a removed source browses Library', () => {
  let clicks = 0;
  const source = actionTarget({ 'data-fd-dock-source': 'primary-week', 'data-fd-dock-label': 'Continue' },
    { click() { clicks++; } });
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F, querySelectorAll: () => [source],
  });
  const dock = actionTarget({ 'data-fd-dock-forward': 'primary-week' });
  h.rootHandlers.click({ target: dock, preventDefault() {} });
  assert.equal(clicks, 1);
  assert.equal(h.controller.getState().tab, 'today');
  source.isConnected = false;
  h.rootHandlers.click({ target: dock, preventDefault() {} });
  assert.equal(clicks, 1);
  assert.equal(h.controller.getState().tab, 'library');
});
const FOUR_INDEX = { weeks: [1, 2, 3, 4].map((n) => ({ n, items: [] })) };
const CARE_INDEX = {
  byRef: {}, weeks: FOUR_INDEX.weeks,
  careResources: [
    { id: 'resource-finder', title: 'Find services', description: 'Find support',
      url: 'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html' },
    { id: 'meeting-calendar', title: 'Find meetings', description: 'Find recovery meetings',
      url: 'https://reconnect-tools.netlify.app/tools/recovery-meeting-calendar.html' },
  ],
  careNavigator: [
    { id: 'services', label: 'Find community services', explanation: 'Start with services.',
      primaryResourceId: 'resource-finder', alternativeResourceIds: ['meeting-calendar'] },
  ],
};
const roleContext = {
  roles: [{ id: 'first-role' }, { id: 'second-role' }],
  role: 'first-role',
  week: 2,
};

test('care intent selection and clear are route-free visit-only patches', () => {
  assert.deepEqual(F.fdDispatch({ 'data-fd-care-intent': 'services' },
    { index: CARE_INDEX }, { ...roleContext, tab: 'care' }), {
    patch: { careIntentId: 'services' }, route: null, effect: null,
  });
  assert.deepEqual(F.fdDispatch({ 'data-fd-care-intent': 'missing' },
    { index: CARE_INDEX }, { ...roleContext, tab: 'care' }), {
    patch: { careIntentId: '' }, route: null, effect: null,
  });
  assert.deepEqual(F.fdDispatch({ 'data-fd-care-clear': '' },
    { index: CARE_INDEX }, { ...roleContext, tab: 'care', careIntentId: 'services' }), {
    patch: { careIntentId: '' }, route: null, effect: null,
  });
});

test('dispatch rejects non-string Care selections instead of coercing them', () => {
  for (const value of [['services'], { toString: () => 'services' }]) {
    assert.deepEqual(F.fdDispatch({ 'data-fd-care-intent': value },
      { index: CARE_INDEX }, { ...roleContext, tab: 'care' }), {
      patch: { careIntentId: '' }, route: null, effect: null,
    });
  }
});

test('leaving Care clears a transient intent while Care-to-Care does not invent one', () => {
  const away = F.fdDispatch({ 'data-fd-tab': 'library' }, { search: '?tab=care' },
    { ...roleContext, tab: 'care', careIntentId: 'services' });
  assert.equal(away.patch.careIntentId, '');
  const enter = F.fdDispatch({ 'data-fd-tab': 'care' }, { search: '?tab=library' },
    { ...roleContext, tab: 'library' });
  assert.equal(Object.hasOwn(enter.patch, 'careIntentId'), false);
});

test('guide context never leaks into another resource or a practice iframe', () => {
  const context = { search: '?page=source.md&guideFind=private+query&guideSection=one&case=c1' };
  const out = F.fdDispatch({ 'data-fd-open': 'practice.html' }, context, roleContext);
  const params = new URLSearchParams(out.route);
  assert.equal(params.has('guideFind'), false);
  assert.equal(params.has('guideSection'), false);
  assert.equal(params.get('case'), 'c1');
});

test('opening a reading from search carries a bounded passage query only to that reading', () => {
  const out = F.fdDispatch({ 'data-fd-open': 'therapy.md' }, {},
    { ...roleContext, searchOpen: true, query: 'behavioral activation' });
  assert.equal(new URLSearchParams(out.route).get('guideFind'), 'behavioral activation');
  const tool = F.fdDispatch({ 'data-fd-open': 'practice.html' }, {},
    { ...roleContext, searchOpen: true, query: 'behavioral activation' });
  assert.equal(new URLSearchParams(tool.route).has('guideFind'), false);
  const long = F.fdDispatch({ 'data-fd-open': 'therapy.md' }, {},
    { ...roleContext, searchOpen: true, query: 'x'.repeat(300) });
  assert.equal(new URLSearchParams(long.route).get('guideFind').length, 160);
});

test('URL page/tool/tab values beat persisted Front Door state', () => {
  const stored = {
    role: 'first-role', tab: 'library', openId: 'old.md', fromTab: 'today', week: 2,
    toolExpanded: true,
  };
  assert.deepEqual(F.fdResolveState('/?page=new.md', stored), {
    role: 'first-role', tab: 'library', openId: 'new.md', fromTab: 'library',
    week: 2, viewWeek: 2, autoAdvance: true, toolExpanded: true, screen: 'app', libraryView: 'essentials', kitSection: 'all',
  });
  assert.equal(F.fdResolveState('/?tool=drill.html&case=a', stored).openId, 'drill.html');
  const tab = F.fdResolveState('/?tab=path', stored);
  assert.equal(tab.tab, 'path');
  assert.equal(tab.openId, undefined, 'a routed tab must not resume a stale stored reader');
  assert.equal(F.fdResolveState('/', { ...stored, toolExpanded: 'true' }).toolExpanded, false,
    'only the literal persisted boolean enables the wide layout');
  assert.equal(F.fdResolveState('/', { ...stored, toolExpanded: false }).toolExpanded, false);
});

test('the resident APP invitation is transient and leaves the stored identity intact', () => {
  const invited = F.fdResolveState('/?audience=app', {
    role: 'first-role', tab: 'path', week: 2, appBridge: 'pmhnp',
  }, { allowAppInvite: true });
  assert.equal(invited.role, 'first-role');
  assert.equal(invited.appInvite, true);
  assert.equal(invited.screen, 'app');
  assert.equal(invited.tab, 'today');
  assert.equal(invited.appBridge, 'pmhnp');

  const firstVisit = F.fdResolveState('/?audience=app', {}, { allowAppInvite: true });
  assert.equal(firstVisit.role, undefined);
  assert.equal(firstVisit.appInvite, true);
  assert.equal(firstVisit.screen, 'app');
});

test('APP invitation is opt-in, exact, and cannot expose the APP route on another audience build', () => {
  for (const url of [
    '/?audience=app', '/?audience=APP', '/?audience=app&audience=app', '/?audience=resident',
  ]) {
    const options = url === '/?audience=app' ? {} : { allowAppInvite: true };
    const resolved = F.fdResolveState(url, {}, options);
    assert.equal(resolved.appInvite, undefined, url);
    assert.equal(resolved.screen, 'setup-role', url);
  }
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
    viewWeek: 4, week: 2, autoAdvance: true, screen: 'app', libraryView: 'essentials', kitSection: 'all',
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
  const weekContext = { nowMs, index: FOUR_INDEX };
  assert.deepEqual(F.fdDispatch({ 'data-fd-view-week': '4' }, weekContext, roleContext), {
    patch: { tab: 'path', viewWeek: 4, openId: null },
    route: '?tab=path',
    effect: null,
  });
  for (const attr of ['data-fd-week', 'data-fd-setweek']) {
    const out = F.fdDispatch({ [attr]: '4' }, weekContext, roleContext);
    assert.equal(out.patch.week, 4);
    assert.equal(out.patch.viewWeek, 4);
    assert.deepEqual(out.effect, { type: 'set-rotation', start: '2026-07-20' });
  }
  const browse = F.fdDispatch({ 'data-fd-week': '0' }, weekContext, roleContext);
  assert.deepEqual(browse.effect, { type: 'browse-without-rotation' });
  assert.equal(browse.patch.tab, 'library');
  assert.equal(browse.patch.week, null);
  assert.equal(browse.patch.viewWeek, 1);
  for (const attr of ['data-fd-week', 'data-fd-view-week', 'data-fd-setweek']) {
    assert.deepEqual(F.fdDispatch({ [attr]: '5' }, weekContext, roleContext),
      { patch: {}, route: null, effect: null });
  }
});

test('role, tab, back, home, search, change-week, progress, theme, tool layout, and step are pinned', () => {
  // The screen is named rather than left undefined: advancing to week setup is the WIZARD's
  // behaviour, and state -- not context -- is where fdDispatch reads it from.
  assert.deepEqual(F.fdDispatch({ 'data-fd-role': 'second-role' }, {},
    { ...roleContext, screen: 'setup-role' }).patch,
  { role: 'second-role', screen: 'setup-week' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-tab': 'library' }, {}, roleContext).patch,
    { tab: 'library', openId: null, searchOpen: false, careIntentId: '', carePackIds: [],
      libraryView: 'essentials', kitSection: 'all' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-tab': 'care' }, {}, roleContext), {
    patch: { tab: 'care', openId: null, searchOpen: false },
    route: '?tab=care', effect: null,
  });
  assert.equal(F.fdDispatch({ 'data-fd-back': '' }, {}, { ...roleContext, openId: 'x.md', fromTab: 'path' }).route,
    '?tab=path');
  assert.equal(F.fdDispatch({ 'data-fd-home': '' }, {}, roleContext).route, '/');
  assert.deepEqual(F.fdDispatch({ 'data-fd-search': '' }, {}, roleContext).patch, { searchOpen: true });
  assert.deepEqual(F.fdDispatch({ 'data-fd-change-week': '' }, {}, roleContext), {
    patch: { screen: 'setup-week', tab: 'today', openId: null, searchOpen: false, sheet: null, setupFrom: 'app' },
    route: '/', history: 'replace', effect: null,
  });
  assert.equal(F.fdDispatch({ 'data-fd-progress': '' }, {}, roleContext).effect.type, 'open-progress');
  assert.deepEqual(
    F.fdDispatch({ 'data-fd-theme': 'light' }, { theme: 'dark' }, roleContext).effect,
    { type: 'set-theme', mode: 'light' },
    'the payload is the mode chosen, not a flip of the mode already in force');
  assert.deepEqual(F.fdDispatch({ 'data-fd-expand-tool': '' }, {}, {
    ...roleContext, openId: 'practice.html', toolExpanded: false,
  }), {
    patch: { toolExpanded: true }, route: null,
    effect: { type: 'toggle-tool-layout' },
  });
  assert.deepEqual(F.fdDispatch({ 'data-fd-expand-tool': '' }, {}, {
    ...roleContext, openId: 'reading.md', toolExpanded: false,
  }), { patch: {}, route: null, effect: null },
  'a synthetic action cannot widen an ordinary reading');
  assert.deepEqual(F.fdDispatch({ 'data-fd-step': '2' }, {}, { ...roleContext, stepsDone: { 2: true } }).patch,
    { stepsDone: { 2: false } });
  assert.equal(F.fdDispatch({ 'data-fd-try-now': 'scale.html' }, {}, roleContext).patch.sheet,
    'item:scale.html');
});

test('the patient-care destination survives direct links and reader return context', () => {
  const direct = F.fdResolveState('/?tab=care', { role: 'first-role' });
  assert.equal(direct.screen, 'app');
  assert.equal(direct.tab, 'care');
  const opened = F.fdDispatch({ 'data-fd-open': 'a.md' }, { search: '?tab=care' }, direct);
  assert.equal(opened.patch.fromTab, 'care');
  assert.equal(new URLSearchParams(opened.route).get('tab'), 'care');
  assert.equal(F.fdReader({ weeks: [] }, { ref: 'a.md', fromTab: 'care' }, '<p>x</p>').includes('Patient care resources'), true);
});

test('choosing APP enters the On shift workspace without asking for a rotation week', () => {
  assert.deepEqual(F.fdDispatch({ 'data-fd-role': 'app' }, { search: '' }, {
    ...roleContext, role: null, screen: 'setup-role', week: undefined,
  }), {
    patch: {
      role: 'app', screen: 'app', tab: 'today', week: null, browsing: true,
      openId: null, searchOpen: false,
    },
    route: '/',
    effect: { type: 'browse-without-rotation' },
  });
});

test('a stored APP never re-enters the rotation wizard or restores the Path tab', () => {
  assert.deepEqual(F.fdResolveState('/?tab=path', {
    role: 'app', tab: 'path', browsing: true, viewWeek: 3,
  }), {
    role: 'app', tab: 'today', libraryView: 'essentials', kitSection: 'all',
    viewWeek: 3, autoAdvance: true, browsing: true, screen: 'app',
  });
});

test('APP bridge persists while work-task and private reflection choices remain controller-only', () => {
  assert.deepEqual(F.fdResolveState('/', {
    role: 'app', browsing: true, appBridge: 'pmhnp', appActivity: 'initial-evaluation',
    appReflection: 'supervisor',
  }).appBridge, 'pmhnp');
  assert.deepEqual(F.fdDispatch({ 'data-fd-app-bridge': 'pmhnp' }, { search: '' }, {
    role: 'app', appBridge: 'pa', appActivity: 'initial-evaluation', appReflection: 'revisit',
    appPractice: { pack: { id: 'training-briefing' } },
  }), {
    patch: { appBridge: 'pmhnp', appActivity: null, appReflection: null, appPractice: null },
    route: null, effect: null,
  });
  assert.deepEqual(F.fdDispatch({ 'data-fd-app-shift': 'collateral-transition' }, {}, {
    role: 'app', appActivity: null,
  }).patch, { appActivity: 'collateral-transition', appReflection: null });
  assert.deepEqual(F.fdDispatch({ 'data-fd-app-reflect': 'supervisor' }, {}, {
    role: 'app', appReflection: null,
  }).patch, { appReflection: 'supervisor' });
  assert.deepEqual(F.fdDispatch({ 'data-fd-app-reset': '' }, {}, {
    role: 'app', appActivity: 'collateral-transition', appReflection: 'supervisor',
    appPractice: { pack: { id: 'training-briefing' } },
  }).patch, { appActivity: null, appReflection: null, appPractice: null });
});

test('APP practice actions advance only transient immutable state', () => {
  const packs = CUR.appPathway.practicePacks;
  const opened = F.fdDispatch(
    { 'data-fd-app-practice-open': 'training-briefing' },
    { appPracticePacks: packs }, { role: 'app' });
  assert.equal(opened.patch.appPractice.pack.id, 'training-briefing');
  assert.equal(opened.patch.appPractice.revealed, false);

  let session = F.fdDispatch({ 'data-fd-app-practice-reveal': '' }, {},
    { role: 'app', appPractice: opened.patch.appPractice }).patch.appPractice;
  for (const value of [
    'review-time:still-known', 'source-status:changed', 'verification-owner:clarify',
  ]) {
    session = F.fdDispatch({ 'data-fd-app-practice-classify': value }, {},
      { role: 'app', appPractice: session }).patch.appPractice;
  }
  session = F.fdDispatch({ 'data-fd-app-practice-question': 'confirm-owner' }, {},
    { role: 'app', appPractice: session }).patch.appPractice;
  assert.equal(session.questionId, 'confirm-owner');
  assert.equal(F.fdDispatch({ 'data-fd-app-practice-reset': '' }, {},
    { role: 'app', appPractice: session }).patch.appPractice.revealed, false);
  assert.deepEqual(F.fdDispatch({ 'data-fd-app-practice-close': '' }, {},
    { role: 'app', appPractice: session }).patch, { appPractice: null });
});

test('APP practice repaint moves or restores focus within the keyboard sequence', () => {
  const pack = CUR.appPathway.practicePacks[0];
  const openSelector = `[data-fd-app-practice-open="${pack.id}"]`;
  let controls = new Map();
  let focused = null;
  function add(attrs) {
    const node = actionTarget(attrs, { focus() { focused = this; } });
    for (const [name, value] of Object.entries(attrs)) {
      controls.set(`[${name}="${value}"]`, node);
      if (!controls.has(`[${name}]`)) controls.set(`[${name}]`, node);
    }
    return node;
  }
  function repaint(state) {
    controls = new Map();
    add({ 'data-fd-app-practice-open': pack.id });
    if (!state.appPractice) return;
    add({ 'data-fd-app-practice-close': '' });
    if (!state.appPractice.revealed) {
      add({ 'data-fd-app-practice-reveal': '' });
      return;
    }
    for (const statement of pack.statements) {
      for (const category of ['still-known', 'changed', 'clarify']) {
        add({ 'data-fd-app-practice-classify': `${statement.id}:${category}` });
      }
    }
    add({ 'data-fd-app-practice-reset': '' });
    if (Object.keys(state.appPractice.classifications).length === pack.statements.length) {
      for (const question of pack.supervisorQuestions) {
        add({ 'data-fd-app-practice-question': question.id });
      }
    }
  }
  repaint({});
  const h = fakeHarness({ role: 'app', screen: 'app', tab: 'today' }, {
    F, appPracticePacks: CUR.appPathway.practicePacks,
    querySelector: (selector) => controls.get(selector) || null,
    renderTransient: (state) => repaint(state),
  });
  function activate(selector, expectedFocus) {
    const target = controls.get(selector);
    assert.ok(target, `missing ${selector}`);
    focused = target;
    h.rootHandlers.click({ target, preventDefault() {} });
    assert.equal(focused, controls.get(expectedFocus), `focus after ${selector}`);
  }
  activate(openSelector, '[data-fd-app-practice-reveal]');
  activate('[data-fd-app-practice-reveal]', '[data-fd-app-practice-classify]');
  for (const value of [
    'review-time:still-known', 'source-status:changed', 'verification-owner:clarify',
  ]) {
    const selector = `[data-fd-app-practice-classify="${value}"]`;
    activate(selector, selector);
  }
  activate('[data-fd-app-practice-question="confirm-owner"]',
    '[data-fd-app-practice-question="confirm-owner"]');
  activate('[data-fd-app-practice-reset]', '[data-fd-app-practice-reveal]');
  activate('[data-fd-app-practice-close]', openSelector);
});

test('APP resource starts reuse the canonical reader route and preserve On shift as origin', () => {
  const result = F.fdDispatch({ 'data-fd-app-start': 'pg_interview.md' }, { search: '' }, {
    role: 'app', tab: 'today', appBridge: 'pa',
  });
  assert.deepEqual(result, {
    patch: { openId: 'pg_interview.md', fromTab: 'today', searchOpen: false, sheet: null },
    route: '?page=pg_interview.md', effect: { type: 'open-resource', ref: 'pg_interview.md' },
  });
});

test('change-week uses a reader origin only while a reader is open', () => {
  const reader = F.fdDispatch({ 'data-fd-change-week': '' }, { search: '?case=c1' }, {
    ...roleContext, tab: 'library', fromTab: 'path', openId: 'pending.md',
  });
  assert.deepEqual(reader, {
    patch: {
      screen: 'setup-week', tab: 'path', openId: null, searchOpen: false, sheet: null, setupFrom: 'app',
    },
    route: '?tab=path&case=c1', history: 'replace', effect: null,
  });

  const tabOnly = F.fdDispatch({ 'data-fd-change-week': '' }, { search: '?case=c1' }, {
    ...roleContext, tab: 'library', fromTab: 'today', openId: null,
  });
  assert.deepEqual(tabOnly, {
    patch: {
      screen: 'setup-week', tab: 'library', openId: null, searchOpen: false, sheet: null, setupFrom: 'app',
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
  // settingsConfirmClear rides along on every sheet close, not only the settings one: the flag
  // has a single reset point rather than a branch that has to recognise which sheet it is
  // closing, and a protocol close disarming an erase nobody armed costs nothing.
  assert.deepEqual(unread.patch, {
    sheet: null, sheetFrom: null, stepsDone: {}, nudge: 'risk.md', settingsConfirmClear: false,
  });
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

const PAGE_QUESTION_BLOCK = { minutes: 5, steps: [
  { kind: 'page', ref: 'a.md', title: 'Welcome', min: 3 },
  { kind: 'qb', ref: 'question-bank-practice.html', n: 2, min: 2, title: '2 practice questions', cat: 'mood' },
] };

test('completing a block reading opens its bounded questions instead of the next weekly reading', () => {
  const next = F.fdDispatch({ 'data-fd-toggle': 'a.md' }, {
    weekItems: [{ ref: 'a.md' }, { ref: 'b.md' }], nowMs: 1,
    search: '?page=a.md&block=1', block: PAGE_QUESTION_BLOCK,
  }, { ...roleContext, openId: 'a.md', done: {}, fromTab: 'today', autoAdvance: false });
  assert.equal(next.patch.openId, 'question-bank-practice.html');
  assert.equal(next.route, '?tool=question-bank-practice.html&block=1&n=2&cat=mood');
  assert.equal(next.effect.openRef, 'question-bank-practice.html');
  assert.equal(next.effect.done, true);
  assert.equal(next.patch.done['a.md'], true);
});

test('reopening a completed block page continues without undoing the reading', () => {
  const next = F.fdDispatch({ 'data-fd-toggle': 'a.md' }, {
    search: '?page=a.md&block=1', block: PAGE_QUESTION_BLOCK,
    progressRaw: { 'a.md': { done: true, at: '2026-09-04' } }, nowMs: 1,
  }, { ...roleContext, openId: 'a.md', done: { 'a.md': true }, fromTab: 'today' });
  assert.equal(next.patch.openId, 'question-bank-practice.html');
  assert.equal(next.patch.done['a.md'], true);
  assert.equal(next.effect.done, true);
});

test('the last block page records completion and returns to Today with block parameters cleared', () => {
  const next = F.fdDispatch({ 'data-fd-toggle': 'a.md' }, {
    block: { minutes: 5, steps: [PAGE_QUESTION_BLOCK.steps[0]] },
    search: '?page=a.md&block=1&case=keep', nowMs: 1,
    weekItems: [{ ref: 'a.md' }, { ref: 'b.md' }],
  }, { ...roleContext, openId: 'a.md', done: {}, fromTab: 'library' });
  assert.equal(next.patch.openId, null);
  assert.equal(next.patch.tab, 'today');
  assert.equal(next.route, '/?case=keep');
  assert.equal(next.patch.done['a.md'], true);
});

test('leaving a block clears only its parameters for Back, tabs, search results, and resources', () => {
  const search = '?page=a.md&block=1&n=2&limit=3&cat=mood&case=keep&scenario=s2';
  const initial = { ...roleContext, tab: 'today', fromTab: 'today', openId: 'a.md', done: {} };
  for (const attrs of [
    { 'data-fd-back': '' }, { 'data-fd-home': '' }, { 'data-fd-tab': 'library' },
    { 'data-fd-open': 'question-bank-practice.html' },
    { 'data-fd-open': 'a.md' },
  ]) {
    const out = F.fdDispatch(attrs, { search }, initial);
    const params = new URLSearchParams(out.route.replace(/^\//, ''));
    for (const key of ['block', 'n', 'limit', 'cat']) assert.equal(params.has(key), false, key);
    assert.equal(params.get('case'), 'keep');
    assert.equal(params.get('scenario'), 's2');
  }
  const back = F.fdDispatch({ 'data-fd-back': '' }, { search }, initial);
  const normal = F.fdDispatch({ 'data-fd-open': 'question-bank-practice.html' }, {
    search: back.route.replace(/^\//, ''),
  }, { ...initial, ...back.patch });
  assert.equal(new URLSearchParams(normal.route).has('block'), false,
    'ordinary practice opened after Back must not enroll in the saved block');
});

test('explicit block Start and Continue retain the planned route while ordinary category links retain theirs', () => {
  for (const [ref, search] of [
    ['a.md', '?page=a.md&block=1'],
    ['question-bank-practice.html', '?tool=question-bank-practice.html&block=1&n=2&cat=mood'],
    ['review.html', '?tool=review.html&block=1&limit=3'],
  ]) {
    const out = F.fdDispatch({ 'data-fd-open': ref }, { search, blockNavigation: true }, roleContext);
    assert.equal(out.route, search);
  }
  const ordinary = F.fdDispatch({ 'data-fd-open': 'question-bank-practice.html' }, {
    search: '?cat=mood&n=4',
  }, roleContext);
  assert.equal(ordinary.route, '?tool=question-bank-practice.html&cat=mood&n=4');
});

test('an unrelated reader and a sheet toggle do not enter the saved block', () => {
  for (const inSheet of [false, true]) {
    const ref = inSheet ? 'a.md' : 'b.md';
    const next = F.fdDispatch({ 'data-fd-toggle': ref }, {
      block: PAGE_QUESTION_BLOCK, inSheet,
      weekItems: [{ ref: 'a.md' }, { ref: 'b.md' }, { ref: 'c.md' }], nowMs: 1,
    }, { ...roleContext, openId: ref, done: {}, fromTab: 'today', autoAdvance: false });
    assert.equal(next.route, null);
    assert.equal(next.patch.openId, undefined);
  }
});

test('practice toggles write only the active or viewed week and preserve other week records', () => {
  const ref = 'question-bank-practice.html';
  const index = { byRef: {}, weeks: [1, 2, 3].map((n) => ({ n, items: [{ ref, kind: 'tool' }] })) };
  const raw = { [ref]: { done: true, at: '2026-09-01', practiceWeeks: { 1: { done: true, at: '2026-09-01' } } } };
  const scenarios = [
    { week: 2, tab: 'today', expected: 2 },
    { week: 2, tab: 'path', viewWeek: 3, expected: 3 },
    { week: 2, tab: 'library', openId: ref, fromTab: 'path', viewWeek: 3, expected: 3 },
  ];
  for (const scenario of scenarios) {
    const next = F.fdDispatch({ 'data-fd-toggle': ref }, { index, progressRaw: raw, nowMs: 1 }, {
      ...roleContext, ...scenario, done: { [ref]: true }, autoAdvance: false,
    });
    assert.equal(next.effect.done, true, 'a completion in Week 1 must not be toggled off in another week');
    assert.equal(next.effect.raw[ref].practiceWeeks[scenario.expected].done, true);
    assert.deepEqual(next.effect.raw[ref].practiceWeeks[1], raw[ref].practiceWeeks[1]);
    assert.equal(next.patch.progressRaw, next.effect.raw);
    assert.equal(next.patch.done[ref], true);
  }
});

test('completion renders observe the new canonical progress before displaying the next surface', () => {
  for (const wasDone of [false, true]) {
    const initialRaw = wasDone ? { 'a.md': { done: true, at: '2026-09-04' } } : {};
    const storage = memStorage({ cw_progress_v1: JSON.stringify(initialRaw) });
    const LocalF = make(storage);
    let renders = 0;
    const observe = () => {
      renders += 1;
      const raw = JSON.parse(storage.dump().cw_progress_v1);
      assert.equal(raw['a.md']?.done === true, !wasDone,
        'live rendering reads canonical storage for receipt updates and must see this toggle too');
    };
    const h = fakeHarness({
      ...roleContext, tab: 'today', openId: 'a.md', fromTab: 'today',
      done: wasDone ? { 'a.md': true } : {}, autoAdvance: !wasDone,
    }, {
      F: LocalF,
      index: { byRef: {}, weeks: [{ n: 2, items: [{ ref: 'a.md' }, { ref: 'b.md' }] }] },
      render: observe, renderTransient: observe,
      openResource: () => Promise.resolve(true),
    });
    h.rootHandlers.click({ target: actionTarget({ 'data-fd-toggle': 'a.md' }), preventDefault() {} });
    assert.equal(renders, 1);
  }
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

test('fdWire registers and destroys delegated root and window listeners for the live shell', () => {
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
  assert.equal(controller.ok, true);
  // 'change' is the settings panel's date field -- the one control not on the delegated click
  // path. Registered through listen() like the rest, so destroy() takes it down too.
  assert.deepEqual(rootCalls.map(([type]) => type), ['click', 'input', 'change', 'focusin', 'keydown']);
  assert.deepEqual(windowCalls.map(([type]) => type), ['keydown', 'popstate']);
  controller.destroy();
  assert.deepEqual(rootRemoves, rootCalls.slice().reverse());
  assert.deepEqual(windowRemoves, windowCalls.slice().reverse());
});

test('fdWire reports a partial root registration failure and removes the listener already installed', () => {
  const calls = [];
  const removes = [];
  const active = new Map();
  const root = {
    addEventListener(type, fn) {
      calls.push([type, fn]);
      active.set(type, fn);
      if (calls.length === 2) throw new Error('private root registration failure');
    },
    removeEventListener(type, fn) {
      removes.push([type, fn]);
      if (active.get(type) === fn) active.delete(type);
    },
  };
  const fakeWindow = {
    addEventListener() { throw new Error('window must not be reached'); },
    removeEventListener() {},
    location: { href: 'https://example.test/', search: '', pathname: '/' },
  };
  let controller;
  assert.doesNotThrow(() => {
    controller = F.fdWire(root, { ...roleContext }, { window: fakeWindow, render: () => {} });
  });
  assert.equal(controller.ok, false);
  assert.deepEqual(calls.map(([type]) => type), ['click', 'input']);
  assert.deepEqual(removes, calls.slice().reverse());
  assert.deepEqual([...active.keys()], [], 'a register-then-throw handler must not remain live');
  assert.doesNotThrow(() => controller.destroy());
  assert.deepEqual(removes, calls.slice().reverse(), 'destroy remains idempotent after automatic cleanup');
});

test('fdWire reports a partial window registration failure and unwinds every installed listener', () => {
  const rootCalls = [];
  const rootRemoves = [];
  const windowCalls = [];
  const windowRemoves = [];
  const activeRoot = new Map();
  const activeWindow = new Map();
  const root = {
    addEventListener(type, fn) { rootCalls.push([type, fn]); activeRoot.set(type, fn); },
    removeEventListener(type, fn) {
      rootRemoves.push([type, fn]);
      if (activeRoot.get(type) === fn) activeRoot.delete(type);
    },
  };
  const fakeWindow = {
    addEventListener(type, fn) {
      windowCalls.push([type, fn]);
      activeWindow.set(type, fn);
      if (type === 'popstate') throw new Error('private window registration failure');
    },
    removeEventListener(type, fn) {
      windowRemoves.push([type, fn]);
      if (activeWindow.get(type) === fn) activeWindow.delete(type);
    },
    location: { href: 'https://example.test/', search: '', pathname: '/' },
  };
  let controller;
  assert.doesNotThrow(() => {
    controller = F.fdWire(root, { ...roleContext }, { window: fakeWindow, render: () => {} });
  });
  assert.equal(controller.ok, false);
  assert.deepEqual(rootRemoves, rootCalls.slice().reverse());
  assert.deepEqual(windowRemoves, windowCalls.slice().reverse());
  assert.deepEqual([...activeRoot.keys()], []);
  assert.deepEqual([...activeWindow.keys()], [], 'a register-then-throw window handler must not remain live');
  assert.doesNotThrow(() => controller.destroy());
});

function actionTarget(attrs, extra = {}) {
  return {
    tagName: 'BUTTON', isContentEditable: false, isConnected: true,
    closest(selector) {
      if(selector==='[data-fd-kit-tool]'&&Object.hasOwn(attrs,'data-fd-kit-tool')) return this;
      return Object.keys(attrs).some((name) => selector.includes(`[${name}]`)) ? this : null;
    },
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
    ...(options.querySelectorAll ? { querySelectorAll: options.querySelectorAll } : {}),
    matches: options.matches || (() => false),
  };
  const fakeWindow = options.window || {
    addEventListener(type, fn) { windowHandlers[type] = fn; },
    removeEventListener() {},
    location: options.location || { href: 'https://example.test/', search: '', pathname: '/' },
    history: options.history,
    matchMedia: options.matchMedia,
    innerHeight: options.innerHeight,
    get scrollY() { return typeof options.scrollY === 'function' ? options.scrollY() : options.scrollY; },
    scrollTo: options.scrollTo,
  };
  const controller = options.F.fdWire(root, initial, {
    window: fakeWindow,
    render: options.render || (() => {}),
    renderTransient: options.renderTransient,
    searchResults: options.searchResults,
    openResource: options.openResource,
    readingPlaceSession: options.readingPlaceSession,
    disposeReadingPlace: options.disposeReadingPlace,
    route: options.route,
    document: options.document,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
    index: options.index || { byRef: {}, weeks: FOUR_INDEX.weeks },
    synonyms: {},
    resourceHost: options.resourceHost,
    openProgress: options.openProgress,
    facultyPreview: options.facultyPreview,
    facultyPreviewLock: options.facultyPreviewLock,
    externalModalOpen: options.externalModalOpen,
    appPracticePacks: options.appPracticePacks,
    releaseStartupGate: options.releaseStartupGate,
    loadBlock: options.loadBlock,
  });
  if (options.commitStartup !== false) controller.commitStartup();
  return { root, rootHandlers, fakeWindow, windowHandlers, controller };
}

test('care selection rerenders, stays out of storage and history, and restores focus', () => {
  const storage = memStorage({ cw_frontdoor_v1: JSON.stringify({ role: 'first-role', tab: 'care' }) });
  const LocalF = make(storage);
  const renders = [];
  const historyCalls = [];
  const selected = { focused: 0, focus() { this.focused += 1; } };
  const first = { focused: 0, focus() { this.focused += 1; } };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'care' }, {
    F: LocalF,
    index: CARE_INDEX,
    render: (...args) => renders.push(args),
    querySelector: (selector) => {
      if (selector === '[data-fd-care-intent="services"]') return selected;
      if (selector === '[data-fd-care-intent]') return first;
      return null;
    },
    history: {
      replaceState: (...args) => historyCalls.push(['replace', ...args]),
      pushState: (...args) => historyCalls.push(['push', ...args]),
    },
  });
  const initialHistoryCount = historyCalls.length;
  const beforeStorage = storage.dump();

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-care-intent': 'services' }), preventDefault() {},
  });
  assert.equal(h.controller.getState().careIntentId, 'services');
  assert.equal(renders.length, 1);
  assert.deepEqual(storage.dump(), beforeStorage);
  assert.equal(historyCalls.length, initialHistoryCount);
  assert.equal(selected.focused, 1);

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-care-clear': '' }), preventDefault() {},
  });
  assert.equal(h.controller.getState().careIntentId, '');
  assert.equal(first.focused, 1);
});

test('Home discards the visit-only Care intent', () => {
  const home = fakeHarness({ ...roleContext, screen: 'app', tab: 'care',
    careIntentId: 'services' }, { F, index: CARE_INDEX });
  home.rootHandlers.click({ target: actionTarget({ 'data-fd-home': '' }), preventDefault() {} });
  assert.equal(home.controller.getState().tab, 'today');
  assert.equal(home.controller.getState().careIntentId, '');
});

test('browser history discards the visit-only Care intent even when returning to Care', () => {
  const location = { href: 'https://example.test/?tab=care', pathname: '/', search: '?tab=care' };
  const history = fakeHarness({ ...roleContext, screen: 'app', tab: 'care',
    careIntentId: 'services' }, { F, index: CARE_INDEX, location });
  history.windowHandlers.popstate({ state: { fd: true, state: { tab: 'care', openId: null } } });
  assert.equal(history.controller.getState().tab, 'care');
  assert.equal(history.controller.getState().careIntentId, '',
    'history cannot revive a selection it does not own');
});

test('Path arrow navigation activates the projected adjacent week and prevents page scrolling', () => {
  let clicked = 0;
  let prevented = 0;
  const next = { click() { clicked += 1; } };
  const current = actionTarget({ 'data-fd-view-week': '2' });
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'path', viewWeek: 2 }, {
    F,
    index: FOUR_INDEX,
    querySelector: (selector) => selector.includes('data-fd-view-week="3"') ? next : null,
  });
  h.rootHandlers.keydown({
    key: 'ArrowRight', target: current, preventDefault() { prevented += 1; },
  });
  assert.equal(clicked, 1);
  assert.equal(prevented, 1);
  h.rootHandlers.keydown({
    key: 'Enter', target: current, preventDefault() { prevented += 1; },
  });
  assert.equal(clicked, 1, 'ordinary button activation remains native');
  assert.equal(prevented, 1);
});

test('pre-commit handlers prevent click, input, keyboard, and popstate without changing ownership', () => {
  const storage = memStorage();
  const LocalF = make(storage);
  const routes = [];
  const renders = [];
  const releases = [];
  const historyCalls = [];
  const initial = {
    ...roleContext, screen: 'app', tab: 'today', openId: 'orientation.md',
    fromTab: 'today', searchOpen: true, query: '', done: {},
  };
  const h = fakeHarness(initial, {
    F: LocalF,
    commitStartup: false,
    route: (route) => routes.push(route),
    render: (...args) => renders.push(args),
    renderTransient: (...args) => renders.push(args),
    releaseStartupGate: () => { releases.push('released'); return true; },
    history: {
      state: null,
      replaceState: (...args) => historyCalls.push(['replace', ...args]),
      pushState: (...args) => historyCalls.push(['push', ...args]),
    },
  });
  const beforeState = h.controller.getState();
  const beforeStorage = storage.dump();
  let prevented = 0;
  const preventDefault = () => { prevented += 1; };
  const input = {
    tagName: 'INPUT', isContentEditable: false, value: 'hostile precommit query',
    matches: (selector) => selector === '.fd-searchpanel__input',
  };

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-tab': 'path' }), preventDefault,
  });
  h.rootHandlers.input({ target: input, preventDefault });
  h.windowHandlers.keydown({ key: 'Escape', target: input, preventDefault });
  h.windowHandlers.popstate({
    state: { fd: true, state: { tab: 'path', openId: null } }, preventDefault,
  });

  assert.deepEqual(h.controller.getState(), beforeState);
  assert.deepEqual(storage.dump(), beforeStorage);
  assert.deepEqual(routes, []);
  assert.deepEqual(renders, []);
  assert.deepEqual(historyCalls, []);
  assert.equal(prevented, 4);
  assert.equal(h.controller.startupCommitted(), false);

  assert.equal(h.controller.commitStartup(), true);
  assert.equal(h.controller.startupCommitted(), true);
  assert.deepEqual(releases, ['released']);
  assert.equal(historyCalls.length, 1, 'history commits once before the learner gate releases');

  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-tab': 'path' }), preventDefault() {},
  });
  assert.equal(h.controller.getState().tab, 'path', 'the same handler activates after commit');
});

test('a failed native startup-gate release leaves every controller handler pre-commit', () => {
  const storage = memStorage();
  const LocalF = make(storage);
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F: LocalF,
    commitStartup: false,
    releaseStartupGate: () => false,
    history: { state: null, replaceState() {}, pushState() {} },
  });
  let prevented = 0;

  assert.equal(h.controller.commitStartup(), false);
  assert.equal(h.controller.startupCommitted(), false);
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-tab': 'path' }),
    preventDefault() { prevented += 1; },
  });
  assert.equal(prevented, 1);
  assert.equal(h.controller.getState().tab, 'today');
  assert.deepEqual(storage.dump(), {});
});

test('delegated tool expansion persists as a layout-only transient without routing or reopening', () => {
  const storage = memStorage();
  const LocalF = make(storage);
  const fullRenders = [];
  const transientRenders = [];
  const historyCalls = [];
  const opened = [];
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', openId: 'practice.html',
    fromTab: 'today', toolExpanded: false,
  }, {
    F: LocalF,
    render: (...args) => fullRenders.push(args),
    renderTransient: (...args) => transientRenders.push(args),
    openResource: (...args) => opened.push(args),
    index: { byRef: { 'practice.html': { ref: 'practice.html', kind: 'tool' } }, weeks: [] },
    history: {
      replaceState: (...args) => historyCalls.push(['replace', ...args]),
      pushState: (...args) => historyCalls.push(['push', ...args]),
    },
  });
  const initialHistoryCalls = historyCalls.length;
  const button = actionTarget({ 'data-fd-expand-tool': '' });

  h.rootHandlers.click({ target: button, preventDefault() {} });
  assert.equal(h.controller.getState().toolExpanded, true);
  assert.equal(JSON.parse(storage.dump().cw_frontdoor_v1).toolExpanded, true);
  assert.equal(fullRenders.length, 0, 'layout preference must not rebuild the Reader');
  assert.equal(opened.length, 0, 'layout preference must not reopen the live iframe');
  assert.equal(historyCalls.length, initialHistoryCalls, 'layout preference is not a route');
  assert.equal(transientRenders.length, 1);
  assert.equal(transientRenders[0][1].preserveResource, true);
  assert.equal(transientRenders[0][1].surfaces.layout, true);
  assert.deepEqual(transientRenders[0][1].changed, ['toolExpanded']);

  h.rootHandlers.click({ target: button, preventDefault() {} });
  assert.equal(h.controller.getState().toolExpanded, false);
  assert.equal(JSON.parse(storage.dump().cw_frontdoor_v1).toolExpanded, false);
  assert.equal(fullRenders.length, 0);
  assert.equal(opened.length, 0);
  assert.equal(historyCalls.length, initialHistoryCalls);
  assert.equal(transientRenders.length, 2);
});

test('live search input rerenders and Enter opens the first ordinary result directly', () => {
  const renders = [];
  const h = fakeHarness({ ...roleContext, searchOpen: true, query: '' }, {
    F,
    openResource: () => Promise.resolve(true),
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
  assert.equal(h.controller.getState().openId, 'sleep.md');
  assert.equal(h.controller.getState().sheet, null);
  assert.equal(h.controller.getState().searchOpen, false);
  assert.equal(prevented, 1);
  assert.ok(renders.length >= 2);
});

test('Enter activates the exact first external care result without routing or forwarding the query', () => {
  let clicked = 0;
  let selected = '';
  let prevented = 0;
  const routes = [];
  const careLink = { click() { clicked += 1; } };
  const h = fakeHarness({ ...roleContext, searchOpen: true, query: 'housing help' }, {
    F,
    route: (value) => routes.push(value),
    querySelector: (selector) => {
      selected = selector;
      return selector === '.fd-result.is-care[data-care-resource="resource-finder"]' ? careLink : null;
    },
    searchResults: () => [{
      kind: 'care',
      item: {
        id: 'resource-finder',
        url: 'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html',
      },
    }],
  });
  const input = {
    tagName: 'INPUT', isContentEditable: false, value: 'housing help',
    matches: (selector) => selector === '.fd-searchpanel__input',
  };

  h.windowHandlers.keydown({
    key: 'Enter', target: input, preventDefault() { prevented += 1; },
  });

  assert.equal(selected, '.fd-result.is-care[data-care-resource="resource-finder"]');
  assert.equal(clicked, 1);
  assert.equal(prevented, 1);
  assert.deepEqual(routes, []);
  assert.equal(h.controller.getState().query, 'housing help');
  assert.equal(h.controller.getState().openId, undefined);
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

test('runtime theme selection writes cw_theme and updates data-theme without reload', () => {
  const ls = memStorage();
  const LocalF = make(ls);
  let dataTheme = 'dark';
  const doc = { documentElement: {
    getAttribute: () => dataTheme,
    setAttribute: (_name, value) => { dataTheme = value; },
  } };
  const h = fakeHarness({ ...roleContext }, { F: LocalF, document: doc });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': 'light' }), preventDefault() {} });
  assert.equal(dataTheme, 'light');
  assert.equal(ls.dump().cw_theme, 'light');
});

// The storage/paint split is the whole point of the three-value action: 'system' is what gets
// persisted, and only the attribute is resolved against the OS. Driving matchMedia in both
// directions is what stops 'system' -> 'light' passing for a hard-coded default.
test('system persists as system and paints whatever the OS currently reports', () => {
  function pick(prefersDark) {
    const ls = memStorage();
    const LocalF = make(ls);
    let dataTheme = 'light';
    const h = fakeHarness({ ...roleContext }, {
      F: LocalF,
      matchMedia: (q) => ({ matches: /dark/.test(q) && prefersDark }),
      document: { documentElement: {
        getAttribute: () => dataTheme,
        setAttribute: (_name, value) => { dataTheme = value; },
      } },
    });
    h.rootHandlers.click({
      target: actionTarget({ 'data-fd-theme': 'system' }), preventDefault() {},
    });
    return { dataTheme, stored: ls.dump().cw_theme };
  }
  assert.deepEqual(pick(true), { dataTheme: 'dark', stored: 'system' });
  assert.deepEqual(pick(false), { dataTheme: 'light', stored: 'system' });
});

// Relocated into the open panel, which is where a theme control has actually lived since the
// header glyph became the settings gear: fdSettingsSeg is its only emitter. The contract under
// test is unchanged -- the REBUILT control takes focus and the disconnected one does not -- but it
// is now asked of the surface that ships, and reached through the same generic path as every other
// control in the panel rather than through a theme-shaped branch of its own.
test('theme rerender focuses the live replacement, not the disconnected old button', () => {
  let replacement = null;
  const invoker = actionTarget({ 'data-fd-theme': '' });
  const panel = { querySelector: (selector) => (selector === '[data-fd-theme=""]' ? replacement : null) };
  const h = fakeHarness({ ...roleContext, screen: 'app', sheet: 'settings' }, {
    F,
    querySelector: (selector) => (selector === '.fd-sheet[role="dialog"]' ? panel : null),
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
    'the rebuilt control, not the disconnected old button, receives focus');
  assert.equal(invoker.focused, undefined, 'and the destroyed element is never focused');
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

test('a refreshed block page loads its saved steps and writes reading progress before opening questions', () => {
  const storage = memStorage();
  const LocalF = make(storage);
  const opened = [];
  const routes = [];
  let loads = 0;
  const h = fakeHarness({
    ...roleContext, tab: 'today', openId: 'a.md', fromTab: 'today', done: {}, autoAdvance: true,
  }, {
    F: LocalF,
    index: { byRef: {}, weeks: [{ n: 2, items: [{ ref: 'a.md' }, { ref: 'b.md' }] }] },
    location: { href: 'https://example.test/?page=a.md&block=1', search: '?page=a.md&block=1', pathname: '/' },
    loadBlock: () => { loads += 1; return PAGE_QUESTION_BLOCK; },
    route: (route) => routes.push(route),
    openResource: (ref) => {
      assert.equal(JSON.parse(storage.dump().cw_progress_v1)['a.md'].done, true);
      opened.push(ref);
      return Promise.resolve(true);
    },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-toggle': 'a.md' }), preventDefault() {} });
  assert.equal(loads, 1);
  assert.deepEqual(opened, ['question-bank-practice.html']);
  assert.deepEqual(routes, ['?tool=question-bank-practice.html&block=1&n=2&cat=mood']);
});

test('unflagged routes and expired blocks keep ordinary reader behavior', () => {
  for (const search of ['?page=a.md', '?page=a.md&block=1']) {
    const LocalF = make(memStorage());
    let loads = 0;
    const h = fakeHarness({
      ...roleContext, tab: 'today', openId: 'a.md', fromTab: 'today', done: {}, autoAdvance: true,
    }, {
      F: LocalF,
      index: { byRef: {}, weeks: [{ n: 2, items: [{ ref: 'a.md' }, { ref: 'b.md' }] }] },
      location: { href: 'https://example.test/' + search, search, pathname: '/' },
      loadBlock: () => { loads += 1; return null; },
      openResource: () => Promise.resolve(true),
    });
    h.rootHandlers.click({ target: actionTarget({ 'data-fd-toggle': 'a.md' }), preventDefault() {} });
    assert.equal(loads, search.includes('block=1') ? 1 : 0);
    assert.equal(h.controller.getState().openId, 'b.md');
  }
});

test('reader arrow navigation follows the viewed Path week', () => {
  const h = fakeHarness({
    ...roleContext, week: 1, viewWeek: 2, tab: 'path', fromTab: 'path', openId: 'd.md',
  }, {
    F: make(memStorage()),
    index: { byRef: {}, weeks: [
      { n: 1, items: [{ ref: 'a.md' }, { ref: 'b.md' }] },
      { n: 2, items: [{ ref: 'd.md' }, { ref: 'e.md' }] },
    ] },
    openResource: () => Promise.resolve(true),
  });
  h.windowHandlers.keydown({ key: 'ArrowRight', target: { tagName: 'BUTTON' }, preventDefault() {} });
  assert.equal(h.controller.getState().openId, 'e.md');
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
  h.rootHandlers.click({ target: actionTarget({
    'data-fd-open': 'preview.md', 'data-fd-sheet': '',
  }), preventDefault() {} });
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

test('runtime nested sheet then search unwinds one layer per Escape and restores once', () => {
  let currentDialog = null;
  const focusOrder = [];
  function dialogFor(identity) {
    const control = {
      tagName: identity === 'search' ? 'INPUT' : 'BUTTON',
      isContentEditable: false,
      isConnected: true,
      getAttribute() { return null; },
      focus() { focusOrder.push(identity); },
    };
    return {
      identity,
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

  const originalInvoker = actionTarget({ 'data-fd-safety': '' });
  const h = fakeHarness({ ...roleContext }, {
    F,
    render,
    querySelector: () => currentDialog,
  });
  h.rootHandlers.click({ target: originalInvoker, preventDefault() {} });
  assert.equal(h.controller.getState().sheet, 'kit');
  assert.deepEqual(focusOrder, ['sheet:kit']);

  const sheetControl = currentDialog.control;
  h.windowHandlers.keydown({
    key: 'k', metaKey: true, target: sheetControl, preventDefault() {},
  });
  assert.equal(h.controller.getState().sheet, 'kit', 'opening search preserves the underlying sheet');
  assert.equal(h.controller.getState().searchOpen, true);
  assert.deepEqual(focusOrder, ['sheet:kit', 'search']);

  const searchControl = currentDialog.control;
  h.windowHandlers.keydown({ key: 'Escape', target: searchControl, preventDefault() {} });
  assert.equal(h.controller.getState().searchOpen, false);
  assert.equal(h.controller.getState().sheet, 'kit', 'first Escape closes only search');
  assert.equal(currentDialog.identity, 'sheet:kit');
  assert.deepEqual(focusOrder, ['sheet:kit', 'search', 'sheet:kit'],
    'the still-open sheet receives focus after search closes');
  assert.equal(originalInvoker.focused, undefined,
    'the original invoker is not restored while a nested dialog remains');

  h.windowHandlers.keydown({
    key: 'Escape', target: currentDialog.control, preventDefault() {},
  });
  assert.equal(h.controller.getState().sheet, null);
  assert.equal(currentDialog, null);
  assert.equal(originalInvoker.focused, 1,
    'the original invoker is restored exactly once after the final dialog closes');
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

  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': 'dark' }), preventDefault() {} });
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
    { base: false, overlay: false, completion: false, chrome: true, layout: false });
  assert.equal(theme.detail.preserveResource, true);
  assert.equal(theme.detail.effect.mode, 'dark',
    'transient renderer consumes the requested mode instead of rereading old document state');
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
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': 'dark' }), preventDefault() {} });
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
      surfaces: { base: true, overlay: false, completion: false, chrome: false, layout: false },
      preserveResource: false,
    },
    {
      kind: 'transient', changed: ['week', 'viewWeek'],
      surfaces: { base: true, overlay: false, completion: false, chrome: true, layout: false },
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

  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': 'dark' }), preventDefault() {} });
  assert.equal(ls.getItem('cw_theme'), 'dark', 'legacy preview still permits its theme selection');
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
      commitStartup: false,
    });
    assert.equal(h.controller.commitStartup(), true);
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

  const h = fakeHarness(resolved, {
    F: LocalF, location, history: memory.history, commitStartup: false,
  });
  assert.equal(h.controller.commitStartup(), true);

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

// The gear's whole job is to put the sheet into a state some later renderer draws, so the state
// value is the contract -- not the markup that will eventually read it.
test('the gear opens settings as a sheet and closes any open search first', () => {
  const r = F.fdDispatch({ 'data-fd-settings': '' }, { }, { searchOpen: true, query: 'lithium' });
  assert.equal(r.patch.sheet, 'settings');
  assert.equal(r.patch.searchOpen, false, 'two stacked overlays would fight over the focus trap');
  assert.equal(r.route, null, 'settings is not a route');
  assert.equal(r.effect, null);
  assert.ok(!('sheetFrom' in r.patch), 'settings has no back-to-kit path to record');
});

// Settings has exactly ONE close route -- the shared data-fd-close-sheet that fdSheetHead's close
// button and the backdrop already emit -- plus the Escape unwind, which reaches the same place. A
// second bespoke close attribute would duplicate a path that already works, so there isn't one.
//
// Both routes run fdCloseSheet, which reads any sheet value that is not 'kit' and not an 'item:'
// as a protocol REF and raises the unread-protocol nudge for it. 'settings' is neither, so before
// fdProtocolRef learned about it every ordinary close queued a nudge for a page that does not
// exist and armed its 8s timer -- invisible only because the index has no such ref to render.
test('settings closes by the shared sheet close and by Escape, raising no protocol nudge', () => {
  for (const attrs of [{ 'data-fd-close-sheet': '' }, { close: true }]) {
    const via = JSON.stringify(attrs);
    const r = F.fdDispatch(attrs, { }, { sheet: 'settings', done: {} });
    assert.equal(r.patch.sheet, null, `${via} must close the panel`);
    assert.equal(r.patch.nudge, null, `${via}: settings is not an unread protocol page`);
    assert.equal(r.effect, null, `${via} must not arm the nudge timer`);
  }
});

test('the theme action carries the mode it selects', () => {
  const r = F.fdDispatch({ 'data-fd-theme': 'dark' }, { }, { theme: 'light' });
  assert.deepEqual(r.effect, { type: 'set-theme', mode: 'dark' });
  assert.deepEqual(r.patch, {}, 'theme is storage, not state');
  assert.equal(r.route, null, 'a theme change must not push history');
});

test('an unrecognised theme value falls back to system rather than painting garbage', () => {
  const r = F.fdDispatch({ 'data-fd-theme': 'banana' }, { }, { theme: 'light' });
  assert.deepEqual(r.effect, { type: 'set-theme', mode: 'system' });
});

test('selecting the already-active mode is still a valid no-op action', () => {
  const r = F.fdDispatch({ 'data-fd-theme': 'light' }, { }, { theme: 'light' });
  assert.deepEqual(r.effect, { type: 'set-theme', mode: 'light' });
});

// Trap A. currentTheme() feeds the dispatch context, which is what a settings panel reads to mark
// the active choice. Since the theme boot split mode from attribute, documentElement holds only
// the RESOLVED value -- so a learner on system would see light or dark marked active and system
// never highlighted. Run the real function body against both sources at once: a storage saying
// 'system' and a document painted 'dark'. The pre-split body returns 'dark' here.
const currentThemeSrc = wire.match(/ {2}function currentTheme\(\)\{[\s\S]*?\n {2}\}/)[0];
function runCurrentTheme(stored, painted) {
  const localStorage = {
    getItem: (k) => {
      if (stored instanceof Error) throw stored;
      return k === 'cw_theme' ? stored : null;
    },
  };
  const doc = { documentElement: { getAttribute: () => painted } };
  // eslint-disable-next-line no-new-func
  return new Function('localStorage', 'doc', 'fdThemeMode',
    `${currentThemeSrc}\nreturn currentTheme();`)(localStorage, doc, F.fdThemeMode);
}

test('currentTheme reports the stored mode, not the attribute the page happens to paint', () => {
  assert.equal(runCurrentTheme('system', 'dark'), 'system',
    'system resolving to dark must still read as system');
  assert.equal(runCurrentTheme('dark', 'dark'), 'dark');
  assert.equal(runCurrentTheme('light', 'dark'), 'light',
    'the stored mode wins over a stale painted attribute');
  assert.equal(runCurrentTheme(null, 'dark'), 'system', 'nothing stored means follow the OS');
  assert.equal(runCurrentTheme('banana', 'dark'), 'system');
});

test('currentTheme answers system when storage is blocked rather than throwing', () => {
  assert.equal(runCurrentTheme(new Error('blocked'), 'dark'), 'system');
});

// Trap B. With one toggle, querySelector('[data-fd-theme]') WAS the control. With a three-button
// group the first match is always System, so every selection silently moved focus off the button
// the learner just pressed.
test('theme focus lands on the chosen mode, not the first control in the group', () => {
  const group = {
    system: actionTarget({ 'data-fd-theme': 'system' }),
    light: actionTarget({ 'data-fd-theme': 'light' }),
    dark: actionTarget({ 'data-fd-theme': 'dark' }),
  };
  const asked = [];
  const panel = {
    querySelector: (selector) => {
      asked.push(selector);
      const exact = selector.match(/^\[data-fd-theme="(\w+)"\]$/);
      return exact ? (group[exact[1]] || null) : null;
    },
  };
  const h = fakeHarness({ ...roleContext, screen: 'app', sheet: 'settings' }, {
    F,
    querySelector: (selector) => (selector === '.fd-sheet[role="dialog"]' ? panel : null),
    renderTransient: () => {},
    document: { documentElement: { getAttribute: () => 'light', setAttribute() {} } },
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': 'dark' }), preventDefault() {} });
  assert.equal(group.dark.focused, 1, 'the button the learner chose keeps focus');
  assert.equal(group.system.focused, undefined, 'System must not steal focus from Dark');
  assert.ok(asked.includes('[data-fd-theme="dark"]'), 'the chosen mode is asked for by value');
});

// data-fd-role has two emitters now: the wizard's step-1 rows and the settings panel's You chips.
// Unforked, the panel's chip patched screen:'setup-week' and threw a learner who was adjusting a
// setting into the middle of the first-run wizard -- losing the panel, and asking again for a week
// they had already chosen. The wizard is the only caller that should advance, and it is the only
// one whose state says setup-role.
test('picking a role in the wizard advances; picking one in settings does not', () => {
  const wizard = F.fdDispatch({ 'data-fd-role': 'subi' }, {}, { screen: 'setup-role' });
  assert.equal(wizard.patch.screen, 'setup-week');

  const panel = F.fdDispatch({ 'data-fd-role': 'subi' }, {}, { screen: 'app', sheet: 'settings' });
  assert.equal(panel.patch.role, 'subi');
  assert.equal(panel.patch.screen, undefined, 'changing a setting must not reopen the wizard');
  assert.equal(panel.patch.sheet, undefined,
    'and the panel stays open, because the chip it just filled is the only feedback there is');
});

// The Pacing section's date field, decided in the pure layer so the shape that reaches storage is
// testable without a DOM. Two properties, both load-bearing:
//   - the patch stays EMPTY. The stored key is the one home and fdLiveState re-reads it for every
//     render; a mirrored copy on controller state would be a second home that only looks free.
//   - only an ISO calendar date or '' survives. phase_policy.js is the single sanctioned
//     local-midnight parse site and it reads this key; anything else there makes the date NaN,
//     which switches pacing off silently rather than failing where someone would see it.
test('the exam date reaches storage only as an ISO calendar date or an empty string', () => {
  const set = F.fdDispatch({ 'data-fd-exam-date': '2026-10-30' }, {}, { sheet: 'settings' });
  assert.deepEqual(set.effect, { type: 'set-exam-date', date: '2026-10-30' });
  assert.deepEqual(set.patch, {}, 'the stored key is the one home; state must not mirror it');
  assert.equal(set.route, null, 'setting a date is not navigation');

  for (const junk of ['banana', '2026-10-30T00:00:00', '10/30/2026', '2026-13-99x', '']) {
    assert.deepEqual(F.fdDispatch({ 'data-fd-exam-date': junk }, {}, {}).effect,
      { type: 'set-exam-date', date: '' }, `"${junk}" must clear rather than reach the parser`);
  }
});

// ── The settings panel's focus guarantee ──────────────────────────────────────────────────────
// Every control in this panel re-renders the panel it lives in, and fdRenderOverlays replaces the
// overlay mount's innerHTML on every render -- so the element the learner just activated is gone
// before focus could return to it. Three focus paths existed and none covered that: focusDialog
// wants the overlay IDENTITY to change, restoreInvoker wants it CLOSED, focusPostTransition wanted
// a set-theme effect or a setup- screen. Focus fell to <body>, where fdTrapFocus declines, so the
// next Tab walked out of an aria-modal dialog and behind its own backdrop. And because the panel
// ships no toast by decision, a control's aria-pressed is the entire feedback it gives: a
// screen-reader user heard nothing at all about their own click.
//
// The guarantee is generic, and this is where it is pinned: an activation inside an open panel
// leaves focus on the EQUIVALENT control in the rebuilt DOM -- same action attribute, same value.
// Tasks 7-8 add two erase buttons and an analytics toggle to this same panel. Each inherits this
// without a fourth focus branch -- though neither ended up as a row here; see the two paragraphs
// at the bottom of this comment for why the erase pair cannot be one, and the third for the
// toggle, which could be and is pinned better elsewhere.
//
// Task 6's date field is the one deliberate EXCEPTION, and it is absent rather than forgotten.
// Every row here is a control that re-renders the panel it lives in, which is the premise the
// harness asserts and the reason the guarantee is needed at all. The date field renders nothing:
// fdRenderOverlays would destroy the <input> the learner is typing in, and a rebuilt native date
// input has a fresh segment cursor, so editing a set date to November by typing "1" then "1"
// yields January twice. With no rebuild there is no destroyed element and no equivalent to
// restore focus to -- pulling focus back into a field still in use would be worse than the bug
// this branch exists to fix. Adding it here would pin a click path it does not have (it is
// committed on a change event and is absent from FD_ACTION_SELECTOR), which would pass while
// testing nothing. Its real contract -- persists, does not render, does not move focus, and is
// inert on click -- is pinned in tests/fd-settings.test.mjs.
//
// Task 7's erase pair is the SECOND deliberate absence, and for the opposite reason to the date
// field: it renders, but it does not survive its own render. Arming replaces the single "clear"
// button with a cancel/confirm pair, so there IS no equivalent control to restore focus to -- the
// premise this harness asserts is false for it. Adding a row here would not test that; the
// harness rebuilds every listed control on every render regardless of state, so the fake would
// supply an equivalent the real renderer never emits and the row would pass under both the
// correct implementation and a broken one. Its real contract -- focus never leaves the open
// dialog, by the fallback rather than by the equivalent -- is pinned in tests/fd-settings.test.mjs
// against a panel built from the REAL renderer output, where "there was no equivalent" is a fact
// about the markup.
//
// Task 8's usage toggle is the THIRD absence, and the only one that is a judgment rather than a
// constraint. It is a pair of segments with fixed values (fdSettingsUsage), precisely so that it
// DOES survive its own render -- so a row here would pass honestly. It is pinned in
// tests/fd-settings.test.mjs instead, against the real renderer and the real emitter, because
// that harness can also tell that both segments were actually emitted; this one would supply them
// whatever the renderer did. A row here would be a weaker copy of an assertion that already runs.
const PANEL_CONTROLS = [
  ['data-fd-role', 'staff'],
  ['data-fd-theme', 'dark'],
];

// The panel is really destroyed and rebuilt here, because that is the whole mechanism: every
// render mints NEW control objects, so focusing the element that was clicked is observably
// different from focusing its equivalent. A harness whose focus() is a stub nobody asserts on
// cannot tell those two apart, which is exactly how this gap stayed invisible.
function panelFocusHarness(initial) {
  let generation = 0;
  let controls = [];
  const focused = [];
  const rebuild = () => {
    generation += 1;
    const gen = generation;
    controls = PANEL_CONTROLS.map(([name, value]) => ({
      name,
      value,
      generation: gen,
      hasAttribute: (n) => n === name,
      getAttribute: (n) => (n === name ? value : null),
      focus() { focused.push(this); },
    }));
  };
  rebuild();
  const panel = {
    querySelector(selector) {
      const m = selector.match(/^\[([a-z-]+)="(.*)"\]$/);
      if (!m) return null;
      return controls.find((c) => c.name === m[1] && c.value === m[2]) || null;
    },
  };
  const h = fakeHarness(initial, {
    F,
    querySelector: (selector) => (selector === '.fd-sheet[role="dialog"]' ? panel : null),
    render: rebuild,
    renderTransient: rebuild,
    document: { documentElement: { getAttribute: () => 'light', setAttribute() {} } },
  });
  return { h, focused, generation: () => generation };
}

test('activating any settings-panel control leaves focus on its rebuilt equivalent', () => {
  for (const [attr, value] of PANEL_CONTROLS) {
    const { h, focused, generation } = panelFocusHarness({
      ...roleContext, screen: 'app', sheet: 'settings',
    });
    const before = generation();
    const invoker = actionTarget({ [attr]: value });
    h.rootHandlers.click({ target: invoker, preventDefault() {} });

    assert.ok(generation() > before, `${attr}: the click must re-render the panel`);
    assert.equal(focused.length, 1, `${attr}: exactly one control takes focus`);
    const landed = focused[0];
    assert.equal(landed.generation, generation(),
      `${attr}: focus must land in the REBUILT panel, not on the element that was destroyed`);
    assert.equal(landed.getAttribute(attr), value,
      `${attr}: and on the control the learner actually activated`);
    assert.equal(invoker.focused, undefined,
      `${attr}: the destroyed element must never be the thing focused`);
    assert.equal(h.controller.getState().sheet, 'settings',
      `${attr}: the panel the focus belongs to must still be open`);
  }
});

// The other half of the same branch: it must not fire where another path already owns focus.
// Closing the panel is restoreInvoker's job -- it returns focus to the gear that opened it -- and
// a refocus racing that would strand focus inside a dialog that is no longer rendered.
test('closing the panel still restores the invoker rather than refocusing inside it', () => {
  const { h, focused } = panelFocusHarness({ ...roleContext, screen: 'app' });
  const gear = actionTarget({ 'data-fd-settings': '' });
  h.rootHandlers.click({ target: gear, preventDefault() {} });
  assert.equal(h.controller.getState().sheet, 'settings', 'the gear opens the panel');

  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  assert.equal(h.controller.getState().sheet, null, 'and the close control closes it');
  assert.equal(gear.focused, 1, 'focus returns to the control that opened the panel');
  assert.equal(focused.length, 0, 'no panel control is focused once the panel is gone');
});

// ...and the gear is the one invoker in this panel that its OWN controls can destroy. The header
// is chrome, a theme change marks chrome dirty (transitionDetail), and fdRenderTransient reassigns
// fdChromeMount.innerHTML -- so by the time the learner closes the panel, the element pushed onto
// the invoker stack is detached and `isConnected===false` skips it. Focus then falls to <body>,
// where fdTrapFocus bails and the next Tab restarts at the top of the document: the exact defect
// refocusInvoker exists to prevent, one layer out.
//
// Measured, not reasoned: driving the built MS3 site, opening the panel and closing it leaves
// focus on the gear, while opening it, choosing Dark and closing it leaves document.activeElement
// as BODY with the original gear reporting isConnected===false. tests/smoke/front-door.spec.js:251
// and frontdoor-runtime.spec.js:2508 are the two specs that catch it.
//
// The fix is the rule refocusInvoker already uses -- the live control carrying the same action
// attribute AND the same value is the equivalent of the one that is gone -- applied to the root
// rather than to the dialog, because the control being replaced here lives outside the overlay.
test('closing the panel returns focus to the gear even after a render replaced it', () => {
  const openingGear = actionTarget({ 'data-fd-settings': '' });
  let liveGear = openingGear;
  let segment = null;
  const panel = {
    querySelector: (selector) => (selector === '[data-fd-theme="dark"]' ? segment : null),
  };
  const h = fakeHarness({ ...roleContext, screen: 'app' }, {
    F,
    querySelector: (selector) => {
      if (selector === '.fd-sheet[role="dialog"]') return panel;
      if (selector === '[data-fd-settings=""]') return liveGear;
      return null;
    },
    renderTransient: (_next, detail) => {
      if (detail.effect?.type === 'set-theme') {
        // What fdRenderTransient does for real: surfaces.chrome is true, so the header -- gear
        // included -- is rebuilt from scratch and the old element is detached.
        openingGear.isConnected = false;
        liveGear = actionTarget({ 'data-fd-settings': '' });
        segment = actionTarget({ 'data-fd-theme': 'dark' });
      }
    },
    document: { documentElement: { getAttribute: () => 'light', setAttribute() {} } },
  });

  h.rootHandlers.click({ target: openingGear, preventDefault() {} });
  assert.equal(h.controller.getState().sheet, 'settings', 'the gear opens the panel');
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-theme': 'dark' }), preventDefault() {} });
  assert.equal(openingGear.isConnected, false, 'the header render must have destroyed the gear');

  h.rootHandlers.click({ target: actionTarget({ 'data-fd-close-sheet': '' }), preventDefault() {} });
  assert.equal(h.controller.getState().sheet, null, 'the close control closes the panel');
  assert.equal(openingGear.focused, undefined, 'the destroyed element is never focused');
  assert.equal(liveGear.focused, 1,
    'focus lands on the live gear, not on <body> where the next Tab restarts the document');
});

// ── Your data: the export route and the two-tap erase ─────────────────────────────────────────
// The panel's one destructive control. Every assertion below is about a guard.

test('the erase arms, disarms, and fires as three distinct actions', () => {
  const armed = F.fdDispatch({ 'data-fd-clear-ask': '' }, {}, { sheet: 'settings' });
  assert.equal(armed.patch.settingsConfirmClear, true);
  assert.equal(armed.effect, null, 'the first tap must destroy nothing');
  assert.equal(armed.route, null);
  assert.equal(armed.patch.sheet, undefined, 'and must leave the panel open');

  const kept = F.fdDispatch({ 'data-fd-clear-cancel': '' }, {},
    { sheet: 'settings', settingsConfirmClear: true });
  assert.equal(kept.patch.settingsConfirmClear, false);
  assert.equal(kept.effect, null, 'cancelling must destroy nothing');

  const fired = F.fdDispatch({ 'data-fd-clear-confirm': '' }, {},
    { sheet: 'settings', settingsConfirmClear: true });
  assert.deepEqual(fired.effect, { type: 'clear-device-data' });
  assert.equal(fired.patch.settingsConfirmClear, false,
    'and the confirm disarms itself, so a re-render cannot leave it primed');
});

// A destructive confirm must never survive a close and reopen -- one stray tap from a wipe the
// learner never re-authorised. Settings has exactly one close ROUTE (the shared
// data-fd-close-sheet the ✕ and the backdrop emit) plus Escape, and both run fdCloseSheet.
test('closing the panel disarms the erase confirm, by either close path', () => {
  for (const attrs of [{ 'data-fd-close-sheet': '' }, { close: true }]) {
    const r = F.fdDispatch(attrs, { }, { sheet: 'settings', settingsConfirmClear: true });
    assert.equal(r.patch.settingsConfirmClear, false,
      `${JSON.stringify(attrs)}: a destructive confirm must never survive a close and reopen`);
  }
});

// The close paths are not the only way out of the panel, which is why the guarantee cannot be a
// list of them. data-fd-progress -- the Your-data section's OWN export link, sitting directly
// above the armed confirm -- patches sheet:null without going through fdCloseSheet, and so do
// data-fd-home and data-fd-change-week. Arming the erase and then tapping the export next to it
// is an ordinary thing to do, and it left the confirm primed for the next visit.
//
// So the one guarantee that covers every exit, including a reload, is asserted at the OPENING:
// the panel is disarmed whenever it opens, however it was last left. data-fd-settings is the only
// producer of sheet:'settings' (fdResolveState cannot restore it -- FD_KEYS does not persist
// `sheet`), so this is exhaustive rather than enumerated.
test('the panel opens disarmed however it was last left', () => {
  const reopened = F.fdDispatch({ 'data-fd-settings': '' }, {}, { settingsConfirmClear: true });
  assert.equal(reopened.patch.settingsConfirmClear, false,
    'opening settings must never present an armed erase');

  // Patches are applied the way apply() applies them rather than asserted on directly, so this
  // stays true of the END state. Pinning "the exit leaves the flag set" instead would freeze
  // today's gap as a contract and redden if some exit later learned to clear it too.
  for (const exit of ['data-fd-progress', 'data-fd-home', 'data-fd-change-week']) {
    const armedPanel = { sheet: 'settings', settingsConfirmClear: true, tab: 'today' };
    const left = F.fdDispatch({ [exit]: '' }, {}, armedPanel);
    assert.equal(left.patch.sheet, null, `${exit} closes the panel without fdCloseSheet`);
    const away = { ...armedPanel, ...left.patch };
    const back = F.fdDispatch({ 'data-fd-settings': '' }, {}, away);
    assert.equal({ ...away, ...back.patch }.settingsConfirmClear, false,
      `${exit} then reopening must not present an armed erase`);
  }
});

// Arming the erase changes the PANEL and nothing underneath it. transitionDetail's overlayKeys
// decides that, and a key missing from it is classed as a base change -- which rebuilds
// contentEl.innerHTML under an open panel on every arm and cancel. The same misclassification is
// what made the exam-date commit owe a base render; this key genuinely owes nothing.
test('arming the erase is an overlay change, not a base one', () => {
  const details = [];
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today', sheet: 'settings' }, {
    F, renderTransient: (_s, d) => details.push(d), render: (_s, d) => details.push(d),
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-clear-ask': '' }), preventDefault() {} });
  const d = details[details.length - 1];
  assert.equal(h.controller.getState().settingsConfirmClear, true, 'the click must arm');
  assert.equal(d.surfaces.overlay, true, 'the panel is what changed');
  assert.equal(d.surfaces.base, false, 'nothing under the panel did');
});

// This is the test that makes "cleared" true rather than asserted. It seeds a cw_* key that
// appears in NO source file: an implementation that enumerates known literals would pass every
// other assertion here and still leave this one behind, which is the silent-shrink class in
// docs/SILENT_SHRINK_CHECKLIST.md -- a check reporting success over a smaller set than it claims.
test('clearing removes every namespaced key, including one no source file mentions', () => {
  const store = {
    cw_progress_v1: '{}', cw_srs_v1: '{}', rp_flags: '[]',
    cw_a_key_invented_by_a_future_feature_v9: '1',
    'unrelated-third-party': 'keep me',
  };
  const fake = {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i],
    getItem: (k) => (k in store ? store[k] : null),
    removeItem: (k) => { delete store[k]; },
  };
  F.fdClearDeviceData(fake);
  assert.deepEqual(Object.keys(store), ['unrelated-third-party'],
    'every cw_*/rp_* key must go, and nothing else may');
});

// The fake above is a REAL store in the one way that matters here: removeItem reindexes it, so
// key(i) after a delete returns what key(i+1) would have. Deleting inside a forward walk
// therefore skips every other match -- and with an even number of doomed keys it skips them in a
// pattern that still LOOKS like it worked on a three-key fixture. Collect first, delete second.
test('a store that reindexes on delete still loses every namespaced key', () => {
  const store = {};
  for (let i = 0; i < 12; i += 1) store[`cw_k${i}`] = String(i);
  const fake = {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i],
    getItem: (k) => (k in store ? store[k] : null),
    removeItem: (k) => { delete store[k]; },
  };
  F.fdClearDeviceData(fake);
  assert.deepEqual(Object.keys(store), [], 'a delete-as-you-walk loop leaves half of these');
});

test('clearing survives a browser that throws on storage access', () => {
  const hostile = { get length() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => F.fdClearDeviceData(hostile));
});

// A store that throws PART WAY through -- Safari private mode raises on the write, not the read.
// The keys collected before the throw are still gone; what must not happen is an exception
// escaping into apply(), which would skip the reload and leave the panel over a half-erased
// device claiming nothing happened.
test('clearing survives a store that throws on the removal itself', () => {
  let removed = 0;
  const hostile = {
    length: 2,
    key: (i) => ['cw_a', 'cw_b'][i],
    getItem: () => '1',
    removeItem() { removed += 1; throw new Error('quota'); },
  };
  assert.doesNotThrow(() => F.fdClearDeviceData(hostile));
  assert.equal(removed, 1, 'it must have genuinely tried');
});

// The effect half: the erase runs against the real store and then RELOADS. Without the reload the
// controller keeps its in-memory state and fdSave writes it back on the learner's next tap --
// resurrecting the role, week and route the erase just removed, with no second confirmation.
test('the erase effect empties the real store and reloads the page', () => {
  const storage = memStorage({
    cw_frontdoor_v1: '{"role":"first-role"}', cw_progress_v1: '{}', rp_x: '1', keep_me: 'yes',
  });
  const LocalF = make(storage);
  let reloads = 0;
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today', sheet: 'settings' }, {
    F: LocalF,
    location: { href: 'https://example.test/', search: '', pathname: '/', reload() { reloads += 1; } },
  });
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-clear-confirm': '' }), preventDefault() {},
  });
  assert.deepEqual(Object.keys(storage.dump()), ['keep_me'],
    'the namespaced keys are gone and the unrelated one is not');
  assert.equal(reloads, 1, 'and the page reloads, or the next tap re-saves what was erased');
});

// fdSave(state) runs BEFORE fdApplyEffect in apply(), so the controller writes its own state key
// on the way past and the erase has to happen after it. Reverse the two and the panel reports a
// successful wipe over a store that still holds the learner's role and route.
test('the controller state written on the way past is erased too, not after', () => {
  const storage = memStorage({ cw_progress_v1: '{}' });
  const LocalF = make(storage);
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F: LocalF,
    location: { href: 'https://example.test/', search: '', pathname: '/', reload() {} },
  });
  // Opening the panel is an ordinary apply(), so fdSave has genuinely written the controller's own
  // key by the time the erase runs -- which is the situation this test is about. Asserting it
  // before any apply() would only pin the fixture.
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-settings': '' }), preventDefault() {} });
  assert.ok('cw_frontdoor_v1' in storage.dump(),
    'the fixture must actually reach a state where fdSave has written');
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-clear-confirm': '' }), preventDefault() {},
  });
  assert.deepEqual(storage.dump(), {}, 'nothing survives, including what apply() just wrote');
});

// meaningfulResult() is what previewActive() consults, and it exempts exactly one effect type.
// It is closure-private inside fdWire, so the guard is pinned at the source: a broadened
// condition would silently let a reviewer's click erase the device they are reviewing on.
// Asserting meaningfulResult(result) === true from outside would prove nothing -- the confirm's
// patch is non-empty, so it returns true on the patch loop before ever reading the effect.
test('erasing device data stays "meaningful", so faculty preview locks it', () => {
  const guard = wire.match(/function meaningfulResult\(result\)\{[\s\S]*?\n {2}\}/);
  assert.ok(guard, 'meaningfulResult must remain extractable');
  const exemptions = [...guard[0].matchAll(/type!=='([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(exemptions, ['set-theme'],
    'only painting a theme may bypass the faculty-preview lock');

  let locked = 0;
  const h = fakeHarness({ ...roleContext, screen: 'app', sheet: 'settings' }, {
    F,
    facultyPreview: true,
    facultyPreviewLock: () => { locked += 1; },
    location: { href: 'https://example.test/', search: '', pathname: '/', reload() { throw new Error('reloaded under preview'); } },
  });
  h.rootHandlers.click({
    target: actionTarget({ 'data-fd-clear-confirm': '' }), preventDefault() {},
  });
  assert.equal(locked, 1, 'the lock notice is what a reviewer gets');
  assert.equal(h.controller.getState().settingsConfirmClear, undefined,
    'and no state change reaches the reviewed page');
});

// fdClearDeviceData is the only removal path, and it must stay computed and prefix-scoped.
// A literal key added to it would evade the very property the completeness test buys: the
// fixture cannot contain a key nobody has written yet.
test('the erase names no key of its own and reaches past no namespace', () => {
  const body = wire.match(/function fdClearDeviceData\(store\)\{[\s\S]*?\n\}/);
  assert.ok(body, 'fdClearDeviceData must remain extractable');
  assert.doesNotMatch(body[0], /removeItem\(\s*['"]/,
    'a literal removeItem here is a key the completeness test can never catch');
  // Comments are stripped: the rationale for rejecting clear() names it, and a rule that its own
  // documentation trips would be deleted rather than kept.
  assert.doesNotMatch(wire.replace(/\/\*[\s\S]*?\*\//g, ''), /\.clear\(\s*\)/,
    'clear() reaches past the namespace the storage-namespaces decision governs');
  assert.equal((body[0].match(/indexOf\('(?:cw|rp)_'\)===0/g) || []).length, 2,
    'both sanctioned prefixes, and only those');
});

// ---- Phase 3 (F4): a guest deep link renders the resource and assigns no role ----------------

test('a routed page or tool with no stored role renders as a guest: app screen, guest flag, no role', () => {
  const guest = F.fdResolveState('/?page=pg_suicide.md', {});
  assert.equal(guest.screen, 'app');
  assert.equal(guest.guest, true);
  assert.equal(guest.openId, 'pg_suicide.md');
  assert.equal(guest.fromTab, 'today');
  assert.equal(guest.role, undefined, 'a guest is never assigned a role');
  const tool = F.fdResolveState('/?tool=mse.html', { tab: 'library' });
  assert.equal(tool.screen, 'app');
  assert.equal(tool.guest, true);
  assert.equal(tool.openId, 'mse.html');
  assert.equal(tool.fromTab, 'library');
  assert.equal(tool.role, undefined);
});

test('the guest flag never appears once a role exists, and aliases keep the setup gate', () => {
  const known = F.fdResolveState('/?page=pg_suicide.md', {
    role: 'first-role', roles: [{ id: 'first-role' }], rotationStart: '2026-08-17', week: 1,
  });
  assert.equal(known.screen, 'app');
  assert.equal(known.guest, undefined);
  assert.equal(known.role, 'first-role');
  // A role without a week still meets the week step on a deep link — unchanged by this phase.
  const roleNoWeek = F.fdResolveState('/?page=pg_suicide.md', { role: 'first-role', roles: [{ id: 'first-role' }] });
  assert.equal(roleNoWeek.screen, 'setup-week');
  assert.equal(roleNoWeek.guest, undefined);
  for (const alias of ['__home__', '__path__', '__start__', '__progress__']) {
    const out = F.fdResolveState(`/?page=${alias}`, {});
    assert.equal(out.screen, 'setup-role', alias);
    assert.equal(out.guest, undefined, alias);
    assert.equal(out.role, undefined, alias);
  }
});

test('the next plain visit after a guest read asks who this is for, from step 1', () => {
  // What a guest visit leaves behind: the shell persists FD_KEYS (openId, tab, ...) but never a
  // role, and `browsing` is not persisted at all. With no routed ref, the role gate runs first.
  const next = F.fdResolveState('/', { openId: 'pg_suicide.md', tab: 'today', fromTab: 'today', browsing: true });
  assert.equal(next.screen, 'setup-role');
  assert.equal(next.role, undefined);
  assert.equal(next.guest, undefined);
  assert.equal(F.fdResolveState('/', {}).screen, 'setup-role');
});

// ---- #425: leaving rotation mode is a choice that sticks --------------------------------------

test('browse mode clears the rotation start, is persisted, and survives a reload on any tab (#425)', () => {
  const nowMs = new Date(2026, 7, 12, 9, 0, 0).getTime();
  const ls = memStorage({ cw_rotation_start: '2026-07-20' });
  const LocalF = make(ls);
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', viewWeek: 2, openId: null,
  }, { F: LocalF });
  h.controller.dispatch({ 'data-fd-change-week': '' });
  assert.equal(h.controller.getState().screen, 'setup-week');
  h.controller.dispatch({ 'data-fd-week': '0' }, { nowMs });
  const st = h.controller.getState();
  assert.equal(st.screen, 'app');
  assert.equal(st.tab, 'library');
  assert.equal(st.week, null);
  assert.equal(st.browsing, true);
  assert.equal(ls.getItem('cw_rotation_start'), null,
    'the rotation start is removed, not merely ignored -- fdLiveState re-derives the week from it');
  const stored = JSON.parse(ls.getItem('cw_frontdoor_v1'));
  assert.equal(stored.browsing, true, 'the choice is persisted with the route state');

  // A reload resolves straight to the app on ANY tab, not back to week setup.
  for (const tab of ['today', 'path', 'library']) {
    const resolved = LocalF.fdResolveState('https://example.test/', {
      ...stored, tab, roles: roleContext.roles, rotationStart: '',
    });
    assert.equal(resolved.screen, 'app', `${tab}: browse mode survives a reload`);
    assert.equal(resolved.browsing, true);
    assert.equal('week' in resolved, false);
  }
  // Without the persisted flag the same store would have asked for a week again.
  const legacy = LocalF.fdResolveState('https://example.test/', {
    ...stored, browsing: undefined, tab: 'today', roles: roleContext.roles, rotationStart: '',
  });
  assert.equal(legacy.screen, 'setup-week');

  // Choosing a week again leaves browse mode and restores a rotation start.
  h.controller.dispatch({ 'data-fd-setweek': '3' }, { nowMs });
  assert.equal(h.controller.getState().browsing, false);
  assert.equal(ls.getItem('cw_rotation_start'), '2026-07-27');
  assert.equal(JSON.parse(ls.getItem('cw_frontdoor_v1')).browsing, false);
});

test('Back from Change week cancels to the app for a returning learner; first-run Back still un-chooses the role (#425)', () => {
  const back = F.fdDispatch({ 'data-fd-back': '' }, {},
    { ...roleContext, screen: 'setup-week', setupFrom: 'app' });
  assert.deepEqual(back, { patch: { screen: 'app', setupFrom: null }, route: null, effect: null });
  const firstRun = F.fdDispatch({ 'data-fd-back': '' }, {}, { ...roleContext, screen: 'setup-week' });
  assert.deepEqual(firstRun, { patch: { role: null, screen: 'setup-role' }, route: null, effect: null });

  // End to end through the controller: role and rotation are intact after the cancel.
  const ls = memStorage({ cw_rotation_start: '2026-07-20' });
  const LocalF = make(ls);
  const h = fakeHarness({
    ...roleContext, screen: 'app', tab: 'today', viewWeek: 2, openId: null,
  }, { F: LocalF });
  h.controller.dispatch({ 'data-fd-change-week': '' });
  h.controller.dispatch({ 'data-fd-back': '' });
  const st = h.controller.getState();
  assert.equal(st.screen, 'app');
  assert.equal(st.role, 'first-role');
  assert.equal(st.week, 2);
  assert.equal(ls.getItem('cw_rotation_start'), '2026-07-20');
  assert.equal(JSON.parse(ls.getItem('cw_frontdoor_v1')).role, 'first-role');
  // Picking a week from the same screen also clears the origin marker, so a later first-run
  // Back (after a device erase) cannot inherit it.
  h.controller.dispatch({ 'data-fd-change-week': '' });
  h.controller.dispatch({ 'data-fd-week': '1' }, { nowMs: new Date(2026, 7, 12, 9, 0, 0).getTime() });
  assert.equal(h.controller.getState().setupFrom, null);
});

test('the rotation key is already gone when the render that paints the header runs (#425)', () => {
  // fdLiveState re-derives the week from cw_rotation_start on every render. Removing the key
  // AFTER the render painted "Week 1" once more for a learner who had just chosen browse.
  const ls = memStorage({ cw_rotation_start: '2026-07-20' });
  const LocalF = make(ls);
  const seenAtRender = [];
  const h = fakeHarness({
    ...roleContext, screen: 'setup-week', tab: 'today', viewWeek: 2, openId: null, setupFrom: 'app',
  }, { F: LocalF, render: () => seenAtRender.push(ls.getItem('cw_rotation_start')) });
  h.controller.dispatch({ 'data-fd-week': '0' }, { nowMs: new Date(2026, 7, 12, 9, 0, 0).getTime() });
  assert.deepEqual(seenAtRender, [null], 'the browse render must not be able to see the old start');
  seenAtRender.length = 0;
  h.controller.dispatch({ 'data-fd-setweek': '2' }, { nowMs: new Date(2026, 7, 12, 9, 0, 0).getTime() });
  assert.deepEqual(seenAtRender, ['2026-08-03'], 'a chosen week is stored before its render, too');
});

// ---- #427: returning from a resource lands where the learner left the originating tab -------

function originHarness(initial, extra = {}) {
  const ls = memStorage();
  const LocalF = make(ls);
  let scrollY = extra.scrollY ?? 0;
  const scrolls = [];
  const openers = extra.openers || {};
  const h = fakeHarness(initial, {
    F: LocalF,
    openResource: () => {},
    scrollY: () => scrollY,
    scrollTo: (x, y) => scrolls.push([x, y]),
    innerHeight: extra.innerHeight,
    querySelector: (sel) => openers[sel] || null,
    ...(extra.querySelectorAll ? { querySelectorAll: extra.querySelectorAll } : {}),
  });
  return { h, ls, scrolls, setScrollY: (y) => { scrollY = y; } };
}

function opener() { return { focused: 0, focus() { this.focused += 1; } }; }

test('in-app Back restores the originating tab offset and focuses the link that opened the resource (#427)', () => {
  const link = opener();
  const { h, ls, scrolls, setScrollY } = originHarness(
    { ...roleContext, screen: 'app', tab: 'library', openId: null },
    { scrollY: 640, openers: { '[data-fd-open="deep.md"]': link } },
  );
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'deep.md' }), preventDefault() {} });
  assert.equal(h.controller.getState().scrollPos, 640, 'the offset is recorded when the resource opens');
  assert.equal(JSON.parse(ls.getItem('cw_frontdoor_v1')).scrollPos, 640, 'and persisted with the route');
  setScrollY(0);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-back': '' }), preventDefault() {} });
  assert.deepEqual(scrolls, [[0, 640]]);
  assert.equal(link.focused, 1);
  assert.equal(h.controller.getState().tab, 'library');
});

test('a reader opened from another reader keeps the original origin; a different tab restores nothing (#427)', () => {
  const link = opener();
  const { h, scrolls, setScrollY } = originHarness(
    { ...roleContext, screen: 'app', tab: 'path', openId: null },
    { scrollY: 900, openers: { '[data-fd-open="first.md"]': link } },
  );
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'first.md' }), preventDefault() {} });
  setScrollY(120);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'second.md' }), preventDefault() {} });
  assert.equal(h.controller.getState().scrollPos, 900, 'reader -> reader does not move the origin');
  // Leaving through a different tab: nothing on Today opened the resource, so no restore.
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-tab': 'today' }), preventDefault() {} });
  assert.deepEqual(scrolls, []);
  assert.equal(link.focused, 0);
  assert.equal(h.controller.getState().openId, null);
});

test('a retired or missing opener falls back to the render focus without throwing (#427)', () => {
  const { h, scrolls } = originHarness(
    { ...roleContext, screen: 'app', tab: 'library', openId: null },
    { scrollY: 300, openers: {} },
  );
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'gone.md' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-back': '' }), preventDefault() {} });
  assert.deepEqual(scrolls, [[0, 300]], 'the list offset is still the learner\'s');
});

test('fdResolveState carries a persisted scroll offset through startup, and drops a bad one (#427)', () => {
  const F = make(memStorage());
  assert.equal(F.fdResolveState('https://example.test/?page=deep.md', { role: 'ms3', tab: 'library', scrollPos: 640 }).scrollPos, 640,
    'a reload while reading keeps the offset the open recorded');
  assert.equal(F.fdResolveState('https://example.test/', { role: 'ms3', tab: 'library', scrollPos: -1 }).scrollPos, undefined);
  assert.equal(F.fdResolveState('https://example.test/', { role: 'ms3', tab: 'library', scrollPos: '640' }).scrollPos, undefined);
});

test('a reloaded reading place survives an ordinary navigation save', () => {
  const store = memStorage({ cw_frontdoor_v1: JSON.stringify({ role: 'first-role', tab: 'today', browsing: true,
    readingPlaces: { 'a.md': { heading: 'heading-1', offset: 28, updatedAt: 8 } } }) });
  const LocalF = make(store);
  const restored = LocalF.fdResolveState('https://example.test/?page=a.md', JSON.parse(store.getItem('cw_frontdoor_v1')));
  const h = fakeHarness(restored, { F: LocalF });
  h.controller.dispatch({ 'data-fd-tab': 'library' });
  assert.deepEqual(JSON.parse(store.getItem('cw_frontdoor_v1')).readingPlaces,
    { 'a.md': { heading: 'heading-1', offset: 28, updatedAt: 8 } });
});

function readingPlaceHarness(saved = {}, options = {}) {
  let y = 0;
  const listeners = new Map();
  const pending = new Map();
  let nextTimer = 1;
  const win = {
    get scrollY() { return y; },
    scrollTo(_x, next) { y = next; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    requestAnimationFrame(fn) { pending.set(`frame-${nextTimer++}`, fn); },
  };
  const heights = options.heights || [100, 450, 900, 1400];
  const labels = options.labels || ['A reading', 'Thought process', 'Thought process', '...'];
  const headings = labels.map((textContent, i) => ({
    id: (options.authoredIds || [])[i] || '', textContent, tagName: i ? 'H2' : 'H1',
    getBoundingClientRect() { return { top: heights[i] - y }; },
    focus(opts) { this.focused = opts; },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return name === 'id' ? this.id : this[name] || null; },
  }));
  const status = { textContent: '' };
  const top = { hidden: true };
  const reader = {
    querySelectorAll(selector) {
      assert.equal(selector, '.fd-article > .fd-article__h1,.fd-article__body h2,.fd-article__body h3,.fd-article__body h4');
      return headings;
    },
    querySelector(selector) {
      if (selector === '[data-fd-reading-status]') return status;
      if (selector === '[data-fd-reading-top]') return top;
      return null;
    },
  };
  const state = { role: 'first-role', screen: 'app', readingPlaces: saved };
  const writes = [];
  const save = options.save || ((value) => { writes.push(JSON.parse(JSON.stringify(value.readingPlaces))); return true; });
  const install = (focusOnRestore = false, liveState = state) => F.fdInstallReadingPlace(reader, 'a.md', liveState, {
    window: win, allowStorage: options.allowStorage !== false, focusOnRestore,
    canFocusOnRestore: options.canFocusOnRestore,
    save, now: () => 1000 + writes.length,
    setTimer(fn, delay) { assert.equal(delay, 150); const id = nextTimer++; pending.set(id, fn); return id; },
    clearTimer(id) { pending.delete(id); },
    requestAnimationFrame(fn) { pending.set(`frame-${nextTimer++}`, fn); },
  });
  const flush = () => { const jobs = [...pending.values()]; pending.clear(); jobs.forEach((fn) => fn()); };
  return { install, flush, listeners, headings, status, top, state, writes, win,
    setScroll(next) { y = next; }, setHeadingTop(index, next) { heights[index] = next; },
    get scrollY() { return y; },
  };
}

test('reading place assigns deterministic heading ids, saves the latest debounced heading, and flushes pagehide', () => {
  const h = readingPlaceHarness();
  const session = h.install();
  h.flush();
  assert.equal(new Set(h.headings.map((node) => node.id)).size, 4);
  assert.match(h.headings[3].id, /^fd-reading-section--[0-9a-f]{16}$/);
  assert.equal(h.status.textContent, 'Reading place saved on this device only', 'fresh storage is verified without inventing a place');
  assert.equal(h.state.readingPlaces['a.md'], undefined);
  h.setScroll(500); h.listeners.get('scroll')();
  h.setScroll(960); h.listeners.get('scroll')();
  h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[2].id);
  assert.equal(h.state.readingPlaces['a.md'].offset, 60);
  assert.equal(h.status.textContent, 'Reading place saved on this device only');
  h.setScroll(1000); h.listeners.get('pagehide')();
  assert.equal(h.state.readingPlaces['a.md'].offset, 100);
  session.destroy();
  assert.equal(h.listeners.size, 0);
});

test('Compass labelled section keeps its authored H2 id while private anchors drive save and restore', () => {
  // Welcome renders <section aria-labelledby="fd-compass-title"> with this authored H2;
  // the browser test checks the real component, while this drives the installer directly.
  const options = {
    labels: ['Welcome', 'Six-Week Compass', 'Week 1 Foundations & the MSE',
      'Week 1 Foundations & the MSE', '!!!'],
    authoredIds: ['', 'fd-compass-title', '', '', ''],
    heights: [100, 450, 900, 1400, 1800],
  };
  const h = readingPlaceHarness({}, options);
  h.install(); h.flush();
  const section = { labelledBy: 'fd-compass-title' };
  assert.equal(h.headings[1].id, 'fd-compass-title');
  assert.equal(h.headings.find(node => node.id === section.labelledBy)?.textContent, 'Six-Week Compass');
  const anchors = h.headings.map(node => node.getAttribute('data-fd-reading-anchor'));
  assert.match(anchors[1], /^fd-reading-six-week-compass--[0-9a-f]{16}$/);
  assert.notEqual(anchors[1], h.headings[1].id);
  assert.equal(new Set(anchors).size, anchors.length, 'duplicate headings retain distinct bookmark identities');
  assert.equal(h.headings[2].id, anchors[2], 'a heading without an authored id remains linkable');
  h.setScroll(500); h.listeners.get('scroll')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, anchors[1], 'the authored H2 saves its private identity');
  const compassRestored = readingPlaceHarness(h.state.readingPlaces, options);
  compassRestored.install(); compassRestored.flush();
  assert.equal(compassRestored.scrollY, 500);
  assert.equal(compassRestored.headings[1].id, 'fd-compass-title');
  h.setScroll(960); h.listeners.get('scroll')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, anchors[2]);
  h.setScroll(1460); h.listeners.get('scroll')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, anchors[3]);

  const restored = readingPlaceHarness(h.state.readingPlaces, options);
  restored.install(); restored.flush();
  assert.equal(restored.scrollY, 1460, 'duplicate bookmark restores relative to its own heading');
  assert.equal(restored.headings[1].id, 'fd-compass-title');
  assert.equal(restored.headings[3].getAttribute('data-fd-reading-anchor'), anchors[3]);

  const stale = readingPlaceHarness({ 'a.md': { heading: 'fd-compass-title', offset: 10, updatedAt: 1 } }, options);
  stale.install(); stale.flush();
  assert.equal(stale.state.readingPlaces['a.md'], undefined, 'an authored DOM id is not a bookmark identity');
  assert.equal(stale.headings[1].id, 'fd-compass-title');

  const collision = readingPlaceHarness({}, { ...options, authoredIds: ['', anchors[2], '', '', ''] });
  collision.install(); collision.flush();
  assert.equal(collision.headings[1].id, anchors[2], 'an authored id is never displaced by a generated one');
  assert.equal(collision.headings[2].id, '', 'a colliding generated DOM id is omitted');
  assert.equal(collision.headings[2].getAttribute('data-fd-reading-anchor'), anchors[2]);

  const guest = readingPlaceHarness({}, { ...options, allowStorage: false });
  guest.install(); guest.flush();
  assert.equal(guest.headings[1].id, 'fd-compass-title', 'guest install also preserves the label target');
  assert.equal(guest.headings[1].getAttribute('data-fd-reading-anchor'), anchors[1]);
  assert.equal(guest.writes.length, 0);
});

test('reading place keeps its heading through responsive reflow without treating resize as learner scroll', () => {
  const h = readingPlaceHarness();
  h.install(); h.flush();
  h.setScroll(500); h.listeners.get('scroll')(); h.flush();
  const heading = h.state.readingPlaces['a.md'].heading;
  h.setHeadingTop(1, 600);
  h.listeners.get('resize')(); h.flush();
  assert.equal(h.scrollY, 650);
  assert.equal(h.state.readingPlaces['a.md'].heading, heading);
});

test('reading place flushes a pending learner scroll before responsive reflow', () => {
  const h = readingPlaceHarness();
  h.install(); h.flush();
  h.setScroll(500); h.listeners.get('scroll')(); h.flush();
  const oldHeading = h.state.readingPlaces['a.md'].heading;
  h.setScroll(960); h.listeners.get('scroll')(); // 150 ms has not elapsed
  h.setHeadingTop(2, 1100);
  h.listeners.get('resize')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[2].id);
  assert.notEqual(h.state.readingPlaces['a.md'].heading, oldHeading);
  assert.equal(h.state.readingPlaces['a.md'].offset, 60);
  assert.equal(h.scrollY, 1160, 'new relative position follows the reflowed heading');
  const writes = h.writes.length;
  h.listeners.get('scroll')(); h.flush();
  assert.equal(h.writes.length, writes, 'programmatic reflow makes no write loop');
  assert.equal(h.headings[2].focused, undefined, 'resize does not take focus');
});

test('returning to the fresh baseline cancels the pending debounce without blocking a later move', () => {
  const h = readingPlaceHarness();
  h.install(); h.flush();
  const writes = h.writes.length;
  h.setScroll(960); h.listeners.get('scroll')();
  h.setScroll(0); h.listeners.get('scroll')();
  h.flush();
  assert.equal(h.state.readingPlaces['a.md'], undefined, 'abandoned section is not saved');
  assert.equal(h.writes.length, writes, 'debounce does not write after the reversal');
  h.setScroll(500); h.listeners.get('scroll')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[1].id,
    'a later meaningful scroll still saves normally');
});

test('returning to the fresh baseline cannot be flushed by resize or pagehide', () => {
  for (const exit of ['resize', 'pagehide']) {
    const h = readingPlaceHarness();
    h.install(); h.flush();
    const writes = h.writes.length;
    h.setScroll(960); h.listeners.get('scroll')();
    h.setScroll(0); h.listeners.get('scroll')();
    h.listeners.get(exit)(); h.flush();
    assert.equal(h.state.readingPlaces['a.md'], undefined, `${exit} cannot persist the abandoned section`);
    assert.equal(h.writes.length, writes, `${exit} makes no stale write`);
    assert.equal(h.scrollY, 0, `${exit} cannot restore the abandoned section`);
  }
});

test('pagehide drops a pending position when the return scroll event has not fired yet', () => {
  const h = readingPlaceHarness();
  h.install(); h.flush();
  const writes = h.writes.length;
  h.setScroll(960); h.listeners.get('scroll')();
  h.setScroll(0); // the browser may coalesce this scroll event with pagehide
  h.listeners.get('pagehide')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'], undefined);
  assert.equal(h.writes.length, writes);
});

test('returning to an earlier position after a settled save is still meaningful movement', () => {
  const h = readingPlaceHarness();
  h.install(); h.flush();
  h.setScroll(960); h.listeners.get('scroll')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[2].id);
  h.setScroll(0); h.listeners.get('scroll')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[0].id);
  assert.equal(h.state.readingPlaces['a.md'].offset, 0);
});

test('Start at top stays clear through two untouched exits, then learner movement saves again', () => {
  const seed = readingPlaceHarness(); seed.install(); seed.flush();
  const restored = readingPlaceHarness({ 'a.md': { heading: seed.headings[1].id, offset: 40, updatedAt: 8 } });
  const first = restored.install(); restored.flush();
  first.startAtTop(); restored.listeners.get('pagehide')(); first.destroy();
  let saved = restored.state.readingPlaces;
  assert.equal(saved['a.md'], undefined);
  for (let cycle = 0; cycle < 2; cycle++) {
    const h = readingPlaceHarness(saved);
    const session = h.install(); h.flush();
    assert.equal(h.status.textContent, 'Reading place saved on this device only');
    assert.deepEqual(h.writes.at(-1), saved, 'verification writes the unchanged map');
    assert.equal(h.state.readingPlaces['a.md'], undefined);
    h.listeners.get('pagehide')(); session.destroy();
    assert.equal(h.state.readingPlaces['a.md'], undefined);
    saved = h.state.readingPlaces;
  }
  const h = readingPlaceHarness(saved);
  h.install(); h.flush();
  h.setScroll(500); h.listeners.get('scroll')(); h.flush();
  assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[1].id);
});

test('reading place restores relative to the heading and focuses the section only for Continue', () => {
  const seed = readingPlaceHarness(); seed.install(); seed.flush();
  const id = seed.headings[1].id;
  const h = readingPlaceHarness({ 'a.md': { heading: id, offset: 75, updatedAt: 9 } });
  h.install(true);
  assert.equal(h.scrollY, 0, 'restore waits for a layout frame');
  assert.equal(h.status.textContent, '', 'no success claim before the verified write');
  h.setHeadingTop(1, 600);
  h.flush();
  assert.equal(h.scrollY, 675, 'the stored offset follows the heading after reflow');
  assert.deepEqual(h.headings[1].focused, { preventScroll: true });
  assert.equal(h.top.hidden, false);
  const ordinary = readingPlaceHarness({ 'a.md': { heading: id, offset: 75, updatedAt: 9 } });
  ordinary.install(false); ordinary.flush();
  assert.equal(ordinary.headings[1].focused, undefined);
  assert.deepEqual(ordinary.headings[0].focused, { preventScroll: true }, 'ordinary open retains document-heading focus');
  const owned = readingPlaceHarness({ 'a.md': { heading: id, offset: 75, updatedAt: 9 } },
    { canFocusOnRestore: () => false });
  owned.install(false); owned.flush();
  assert.equal(owned.headings[0].focused, undefined, 'a foreground focus owner is not stolen');
});

test('stale heading clears only its page and Start at top clears a restored place', () => {
  const other = { heading: 'other', offset: 4, updatedAt: 3 };
  const stale = readingPlaceHarness({ 'a.md': { heading: 'missing', offset: 80, updatedAt: 8 }, 'b.md': other });
  stale.install(); stale.flush();
  assert.equal(stale.scrollY, 0);
  assert.deepEqual(stale.state.readingPlaces, { 'b.md': other });
  assert.deepEqual(stale.writes.at(-1), { 'b.md': other }, 'stale cleanup reaches the device store');
  assert.equal(stale.top.hidden, true);
  const seed = readingPlaceHarness(); seed.install(); seed.flush();
  const restored = readingPlaceHarness({ 'a.md': { heading: seed.headings[1].id, offset: 40, updatedAt: 8 }, 'b.md': other });
  const session = restored.install(); restored.flush();
  session.startAtTop();
  assert.equal(restored.scrollY, 100);
  assert.deepEqual(restored.state.readingPlaces, { 'b.md': other });
  assert.equal(restored.top.hidden, true);
  assert.deepEqual(restored.headings[0].focused, { preventScroll: true });
});

test('dropped reading places stay dropped through queued scroll and pagehide, then a real move saves again', () => {
  const seed = readingPlaceHarness(); seed.install(); seed.flush();
  for (const stale of [false, true]) {
    const h = readingPlaceHarness({ 'a.md': { heading: stale ? 'missing' : seed.headings[1].id, offset: 40, updatedAt: 8 } });
    const session = h.install(); h.flush();
    if (!stale) session.startAtTop();
    h.listeners.get('scroll')(); // scrollTo's queued programmatic scroll event
    h.listeners.get('pagehide')();
    assert.equal(h.state.readingPlaces['a.md'], undefined, 'page exit must not recreate the dropped place');
    h.setScroll(500); h.listeners.get('scroll')(); h.flush();
    assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[1].id,
      'a later learner movement resumes normal capture');
    session.destroy();
  }
});

test('restore focus checks the live owner at the frame, not only the Continue click', () => {
  const seed = readingPlaceHarness(); seed.install(); seed.flush();
  const place = { 'a.md': { heading: seed.headings[1].id, offset: 40, updatedAt: 8 } };
  const base = { ref: 'a.md', currentRef: 'a.md', readerConnected: true };
  const owners = [
    ['pending-high', {}, { pendingHigh: true }],
    ['search', { searchOpen: true }, {}],
    ['settings', { sheet: 'settings' }, {}],
    ['capture', {}, { externalModal: true }],
  ];
  for (const [owner, statePatch, contextPatch] of owners) {
    let state = { screen: 'app' }, context = base;
    const h = readingPlaceHarness(place, { canFocusOnRestore: () => F.fdReadingFocusAllowed(state, context) });
    h.install(true);
    state = { ...state, ...statePatch };
    context = { ...context, ...contextPatch }; // owner takes focus during fetch or before layout
    h.flush();
    assert.equal(h.scrollY, 490, `${owner} still gets reading-place scroll restore`);
    assert.equal(h.headings[1].focused, undefined, `${owner} retains focus`);
  }
  const clear = readingPlaceHarness(place, { canFocusOnRestore: () => F.fdReadingFocusAllowed({ screen: 'app' }, base) });
  clear.install(true); clear.flush();
  assert.deepEqual(clear.headings[1].focused, { preventScroll: true });
  assert.equal(F.fdReadingFocusAllowed({ screen: 'app' }, { ...base, readerConnected: false }), false);
  assert.equal(F.fdReadingFocusAllowed({ screen: 'app' }, { ...base, currentRef: 'else.md' }), false);
});

test('the live reader install supplies current overlays and governance to the focus guard', () => {
  assert.match(spa, /canFocusOnRestore:function\(\)\{\s*return fdReadingFocusAllowed\(readState\(\),\{/);
  assert.match(spa, /externalModal:!!capSheet/);
  assert.match(spa, /pendingHigh:!!contentEl\.querySelector\('\.governance-notice\.pending-high'\)/);
  assert.match(spa, /readerConnected:document\.documentElement\.contains\(mountedReader\)/);
});

test('erase dispatch disposes the live reader before pagehide can resurrect its storage', () => {
  const store = memStorage();
  const LocalF = make(store);
  const reading = readingPlaceHarness({}, { save(value) {
    store.setItem('cw_frontdoor_v1', JSON.stringify(value)); return true;
  } });
  let live;
  let reloaded = 0;
  reading.win.location = { href: 'https://example.test/?page=a.md', search: '?page=a.md', pathname: '/', reload() { reloaded++; } };
  reading.win.history = { replaceState() {}, pushState() {} };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today', openId: 'a.md' }, {
    F: LocalF, window: reading.win, renderTransient() {},
    disposeReadingPlace() { if (live) { live.destroy(); live = null; } },
  });
  assert.equal(h.controller.startupCommitted(), true, 'integrated erase harness must finish startup');
  assert.equal(h.fakeWindow, reading.win);
  live = reading.install(false, h.controller.getState()); reading.flush();
  reading.setScroll(520); reading.listeners.get('scroll')();
  assert.deepEqual(LocalF.fdDispatch({ 'data-fd-clear-confirm': '' }, {}, h.controller.getState()).effect,
    { type: 'clear-device-data' });
  h.controller.dispatch({ 'data-fd-clear-confirm': '' });
  assert.equal(h.controller.getState().settingsConfirmClear, false);
  const pagehide = reading.listeners.get('pagehide');
  if (pagehide) pagehide();
  assert.equal(reloaded, 1);
  assert.deepEqual(store.dump(), {}, 'erase must survive the browser pagehide fired by reload');
});

test('Back flushes pending reading scroll before cloning and saving the next state', () => {
  const store = memStorage();
  const LocalF = make(store);
  const reading = readingPlaceHarness({}, { save(value) {
    store.setItem('cw_frontdoor_v1', JSON.stringify(value)); return true;
  } });
  let live;
  reading.win.location = { href: 'https://example.test/', search: '', pathname: '/' };
  reading.win.history = { replaceState() {}, pushState() {} };
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today', openId: 'a.md' }, {
    F: LocalF, window: reading.win,
    render() { if (live) { live.destroy(); live = null; } },
    disposeReadingPlace() { if (live) { live.destroy(); live = null; } },
  });
  assert.equal(h.controller.startupCommitted(), true, 'integrated Back harness must finish startup');
  live = reading.install(false, h.controller.getState()); reading.flush();
  reading.setScroll(960); reading.listeners.get('scroll')(); // do not run the 150 ms timer
  reading.listeners.get('popstate')({ state: { fd: true, state: { tab: 'today', openId: null } } });
  assert.equal(h.controller.getState().readingPlaces['a.md'].heading, reading.headings[2].id);
  assert.equal(h.controller.getState().readingPlaces['a.md'].offset, 60);
  assert.deepEqual(JSON.parse(store.getItem('cw_frontdoor_v1')).readingPlaces,
    h.controller.getState().readingPlaces);
});

test('disallowed and throwing storage show failure and install no false success', () => {
  const guest = readingPlaceHarness({}, { allowStorage: false });
  guest.install(); guest.flush();
  assert.equal(guest.status.textContent, 'Reading place could not be saved on this device');
  assert.equal(guest.listeners.size, 0);
  assert.equal(guest.writes.length, 0);
  const failure = readingPlaceHarness({}, { save: () => false });
  failure.install(); failure.flush();
  assert.equal(failure.status.textContent, 'Reading place could not be saved on this device');
  failure.setScroll(480); failure.listeners.get('scroll')(); failure.flush();
  assert.equal(failure.status.textContent, 'Reading place could not be saved on this device');
  const throwing = readingPlaceHarness({}, { save: () => { throw new Error('quota'); } });
  throwing.install(); throwing.flush();
  assert.equal(throwing.status.textContent, 'Reading place could not be saved on this device');
  throwing.setScroll(480); throwing.listeners.get('scroll')(); throwing.flush();
  assert.equal(throwing.status.textContent, 'Reading place could not be saved on this device');
  const changing = readingPlaceHarness({}, { save: (() => { let n = 0; return () => ++n === 1; })() });
  changing.install(); changing.flush();
  assert.equal(changing.status.textContent, 'Reading place saved on this device only');
  changing.setScroll(480); changing.listeners.get('scroll')(); changing.flush();
  assert.equal(changing.status.textContent, 'Reading place could not be saved on this device');
});

test('destroy flushes the last scroll once and removes listeners before replacing the reader', () => {
  const h = readingPlaceHarness();
  const session = h.install(); h.flush();
  const writesBefore = h.writes.length;
  h.setScroll(800); h.listeners.get('scroll')();
  session.destroy(); h.flush();
  assert.equal(h.writes.length, writesBefore + 1);
  assert.equal(h.state.readingPlaces['a.md'].heading, h.headings[1].id);
  assert.equal(h.listeners.size, 0);
});

test('Continue focus metadata applies to one resource open and does not leak into ordinary opens', () => {
  const opens = [];
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today' }, {
    F, openResource: (_ref, opts) => opens.push(opts),
  });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'a.md', 'data-fd-reading-resume': '1' }), preventDefault() {} });
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'b.md' }), preventDefault() {} });
  assert.deepEqual(opens.map((opts) => opts.focusOnRestore), [true, false]);
});

test('Start at top acts on the live reading session without changing the route', () => {
  let starts = 0;
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'today', openId: 'a.md' }, {
    F, readingPlaceSession: () => ({ startAtTop() { starts++; } }),
  });
  let prevented = 0;
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-reading-top': '' }), preventDefault() { prevented++; } });
  assert.equal(starts, 1);
  assert.equal(prevented, 1);
  assert.equal(h.controller.getState().openId, 'a.md');
});

test('a hidden duplicate of the opener is skipped in favour of one that is shown (#427)', () => {
  // Today's Quick Tools pill row precedes the desktop rail in the DOM and is display:none there.
  const hidden = { ...opener(), getClientRects: () => [] };
  const shown = { ...opener(), getClientRects: () => [{}] };
  const { h, setScrollY } = originHarness(
    { ...roleContext, screen: 'app', tab: 'today', openId: null },
    { scrollY: 200, querySelectorAll: () => [hidden, shown] },
  );
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'tool.html' }), preventDefault() {} });
  setScrollY(0);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-back': '' }), preventDefault() {} });
  assert.equal(hidden.focused, 0, 'focusing a display:none element moves nothing, so it is never chosen');
  assert.equal(shown.focused, 1);
});

test('among shown duplicates, the control the learner activated is the one that gets focus back (#427)', () => {
  const rail = { ...opener(), getClientRects: () => [{}] };
  const week = { ...opener(), getClientRects: () => [{}] };
  const target = actionTarget({ 'data-fd-open': 'tool.html' });
  Object.assign(week, target); // the click target IS the second duplicate
  const { h, setScrollY } = originHarness(
    { ...roleContext, screen: 'app', tab: 'today', openId: null },
    { scrollY: 200, querySelectorAll: () => [rail, week] },
  );
  h.rootHandlers.click({ target: week, preventDefault() {} });
  setScrollY(0);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-back': '' }), preventDefault() {} });
  assert.equal(rail.focused, 0);
  assert.equal(week.focused, 1, 'the second duplicate was the invoker, so it is the one restored');
});

test('with no remembered invoker and several shown duplicates, the render focus stands unless one is the primary (#427)', () => {
  // A resource opened by a plain link (the Resume card is an <a href>) never passes through
  // apply(), so on Back nothing says which of the week row and the rail copy the learner used.
  const row = { ...opener(), getClientRects: () => [{}], closest: () => null };
  const rail = { ...opener(), getClientRects: () => [{}], closest: () => null };
  const { h, scrolls, setScrollY } = originHarness(
    { ...roleContext, screen: 'app', tab: 'today', openId: null },
    { scrollY: 150, querySelectorAll: () => [row, rail] },
  );
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'tool.html' }), preventDefault() {} });
  setScrollY(0);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-back': '' }), preventDefault() {} });
  assert.deepEqual(scrolls, [[0, 150]], 'the offset is still restored');
  assert.equal(row.focused + rail.focused, 0, 'no guess: the landmark focus from the render stands');

  // ...but a shown duplicate inside Today's primary IS the one thing the learner was pointed at.
  const primary = { ...opener(), getClientRects: () => [{}], closest: (sel) => (sel === '.fd-primary' ? {} : null) };
  const h2 = originHarness(
    { ...roleContext, screen: 'app', tab: 'today', openId: null },
    { scrollY: 0, querySelectorAll: () => [row, primary] },
  ).h;
  h2.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'tool.html' }), preventDefault() {} });
  h2.rootHandlers.click({ target: actionTarget({ 'data-fd-back': '' }), preventDefault() {} });
  assert.equal(primary.focused, 1);
  assert.equal(row.focused, 0);
});

test('browser Back out of a resource is the same return (#427)', () => {
  const link = opener();
  const location = { href: 'https://example.test/?tab=library', pathname: '/', search: '?tab=library' };
  const memory = memoryHistory(location);
  const ls = memStorage();
  const LocalF = make(ls);
  let scrollY = 480;
  const scrolls = [];
  const h = fakeHarness({ ...roleContext, screen: 'app', tab: 'library', openId: null }, {
    F: LocalF, location, history: memory.history, openResource: () => {},
    scrollY: () => scrollY, scrollTo: (x, y) => scrolls.push([x, y]),
    querySelector: (sel) => (sel === '[data-fd-open="deep.md"]' ? link : null),
  });
  memory.bind(h.windowHandlers.popstate);
  h.rootHandlers.click({ target: actionTarget({ 'data-fd-open': 'deep.md' }), preventDefault() {} });
  scrollY = 0;
  memory.go(-1);
  assert.equal(h.controller.getState().openId, null);
  assert.deepEqual(scrolls, [[0, 480]]);
  assert.equal(link.focused, 1);
});

test('browser Back rechecks a relocated Essentials opener after native history scroll restoration', () => {
  const location={href:'https://example.test/?tab=library',pathname:'/',search:'?tab=library'};
  const memory=memoryHistory(location), timers=[];
  let scrollY=0;
  const link={
    ...opener(),
    getBoundingClientRect:()=>({top:5000-scrollY,bottom:5060-scrollY}),
    scrollIntoView(){ scrollY=4700; },
  };
  const h=fakeHarness({...roleContext,screen:'app',tab:'library',libraryView:'essentials',kitSection:'late'}, {
    F:make(memStorage()),location,history:memory.history,openResource:()=>{},innerHeight:600,
    scrollY:()=>scrollY,scrollTo:(_x,y)=>{scrollY=y;},
    setTimer:fn=>{timers.push(fn);},
    querySelector:sel=>sel==='[data-fd-open="late.md"]'?link:null,
  });
  memory.bind(h.windowHandlers.popstate);
  h.controller.dispatch({'data-fd-open':'late.md'});
  memory.go(-1);
  scrollY=0; // Chromium restores persisted scroll after the popstate listeners finish.
  while(timers.length) timers.shift()();
  const box=link.getBoundingClientRect();
  assert.ok(box.top>=0&&box.bottom<=600,'the post-history focus remains visible');
});

test('deferred browser Back visibility recheck is inert after navigation or controller destruction', () => {
  for(const invalidate of ['navigate','destroy']){
    const location={href:'https://example.test/?tab=library',pathname:'/',search:'?tab=library'};
    const memory=memoryHistory(location), timers=[];
    let scrollY=0, visibilityCorrections=0;
    const link={
      ...opener(),
      getBoundingClientRect:()=>({top:5000-scrollY,bottom:5060-scrollY}),
      scrollIntoView(){ visibilityCorrections++; scrollY=4700; },
    };
    const h=fakeHarness({...roleContext,screen:'app',tab:'library',libraryView:'essentials',kitSection:'late'}, {
      F:make(memStorage()),location,history:memory.history,openResource:()=>{},innerHeight:600,
      scrollY:()=>scrollY,scrollTo:(_x,y)=>{scrollY=y;},
      setTimer:fn=>{timers.push(fn);},
      querySelector:sel=>sel==='[data-fd-open="late.md"]'?link:null,
    });
    memory.bind(h.windowHandlers.popstate);
    h.controller.dispatch({'data-fd-open':'late.md'});
    memory.go(-1);
    assert.equal(visibilityCorrections,1,'the synchronous return correction still runs');
    if(invalidate==='navigate') h.controller.dispatch({'data-fd-tab':'today'});
    else h.controller.destroy();
    scrollY=0;
    while(timers.length) timers.shift()();
    assert.equal(visibilityCorrections,1,`the deferred correction is cancelled after ${invalidate}`);
  }
});

test('Library view defaults to kit and URL full shorthand preserves setup and route precedence', () => {
  assert.equal(F.fdResolveState('/', {...roleContext, libraryView:'full'}).libraryView, 'essentials');
  const full = F.fdResolveState('/?library=full', roleContext);
  assert.equal(full.tab, 'library'); assert.equal(full.libraryView, 'full');
  assert.equal(F.fdResolveState('/?library=full', {}).screen, 'setup-role');
  for (const tab of ['today', 'path']) {
    const chosen = F.fdResolveState('/?tab='+tab+'&library=full', roleContext);
    assert.equal(chosen.tab, tab); assert.equal(chosen.libraryView, 'essentials');
  }
  const read = F.fdResolveState('/?library=full&page=extra.md', roleContext);
  assert.equal(read.openId, 'extra.md'); assert.equal(read.fromTab, 'library');
});

test('Library view actions close overlays, reject invalid values, and explicit Library resets kit', () => {
  const initial = {...roleContext, tab:'library', libraryView:'essentials', openId:'a.md', sheet:'kit', searchOpen:true};
  const full = F.fdDispatch({'data-fd-library-view':'full'}, {}, initial);
  assert.equal(full.patch.libraryView, 'full'); assert.equal(full.patch.tab, 'library');
  assert.equal(full.patch.openId, null); assert.equal(full.patch.sheet, null);
  assert.equal(full.patch.searchOpen, false); assert.equal(full.route, '?tab=library&library=full');
  assert.deepEqual(F.fdDispatch({'data-fd-library-view':'invalid'}, {}, initial), {patch:{},route:null,effect:null});
  const kit = F.fdDispatch({'data-fd-tab':'library'}, {search:'?tab=library&library=full'}, {...initial,libraryView:'full'});
  assert.equal(kit.patch.libraryView, 'essentials'); assert.equal(kit.route, '?tab=library');
  const browse = F.fdDispatch({'data-fd-week':'0'}, {index:FOUR_INDEX,search:'?library=full'}, initial);
  assert.equal(browse.patch.libraryView, 'essentials'); assert.equal(browse.route, '?tab=library');
});

test('full Library resource route survives reload and Back while tool frame strips shell context', () => {
  const initial = {...roleContext,tab:'library',libraryView:'full'};
  const opened = F.fdDispatch({'data-fd-open':'extra.html'}, {search:'?tab=library&library=full&case=c1'}, initial);
  const reloaded = F.fdResolveState(opened.route, {...roleContext,tab:'today'});
  assert.equal(reloaded.fromTab, 'library'); assert.equal(reloaded.libraryView,'full');
  const back = F.fdDispatch({'data-fd-back':''}, {search:opened.route}, reloaded);
  assert.equal(back.route, '?tab=library&case=c1&library=full');
  const request = new Function(`${wire}; return fdResourceRequest('extra.html', ${JSON.stringify(opened.route)});`)();
  assert.equal(new URLSearchParams(request.frameSuffix).has('library'),false);
  assert.equal(new URLSearchParams(request.frameSuffix).has('tab'),false);
  assert.equal(new URLSearchParams(request.frameSuffix).get('case'),'c1');
  const today = F.fdDispatch({'data-fd-tab':'today'}, {search:opened.route}, reloaded);
  assert.equal(new URLSearchParams(today.route.replace(/^\//,'')).has('library'),false);
});

test('Library view is route-local history, redraws the base, and defaults old snapshots to kit', () => {
  const location = {href:'https://example.test/?tab=library',pathname:'/',search:'?tab=library'};
  const memory = memoryHistory(location); const renders = [];
  const h = fakeHarness({...roleContext,screen:'app',tab:'library',libraryView:'essentials'}, {
    F, location, history:memory.history, render:()=>renders.push('base'),
    renderTransient:()=>renders.push('transient'), openResource:()=>{},
  });
  memory.bind(h.windowHandlers.popstate);
  h.controller.dispatch({'data-fd-library-view':'full'});
  assert.equal(renders.at(-1),'base');
  assert.equal(memory.entries.at(-1).state.state.libraryView,'full');
  h.controller.dispatch({'data-fd-open':'extra.md'});
  memory.go(-1); assert.equal(h.controller.getState().libraryView,'full');
  assert.equal(h.controller.getState().openId,null);
  memory.go(-1); assert.equal(h.controller.getState().libraryView,'essentials');
  memory.go(1); assert.equal(h.controller.getState().libraryView,'full');
  h.windowHandlers.popstate({state:{fd:true,state:{tab:'library'}}});
  assert.equal(h.controller.getState().libraryView,'essentials');
  location.href='https://example.test/?library=full'; location.search='?library=full';
  h.windowHandlers.popstate({});
  assert.equal(h.controller.getState().tab,'library');
  assert.equal(h.controller.getState().libraryView,'full');
});

test('full Library retains resource return scroll and focus including reload', () => {
  const link = opener();
  const initial = {...roleContext,screen:'app',tab:'library',libraryView:'full',openId:null};
  const {h,ls,scrolls} = originHarness(initial, {scrollY:640,openers:{'[data-fd-open="extra.md"]':link}});
  h.controller.dispatch({'data-fd-open':'extra.md'});
  const persisted = JSON.parse(ls.getItem('cw_frontdoor_v1'));
  const reload = F.fdResolveState('/?page=extra.md&tab=library&library=full', persisted);
  assert.equal(reload.scrollPos,640); assert.equal(reload.libraryView,'full');
  h.controller.dispatch({'data-fd-back':''});
  assert.equal(h.controller.getState().libraryView,'full');
  assert.deepEqual(scrolls,[[0,640]]); assert.equal(link.focused,1);
  const reloadLink = opener();
  const restored = originHarness(reload,{openers:{'[data-fd-open="extra.md"]':reloadLink}});
  restored.h.controller.dispatch({'data-fd-back':''});
  assert.deepEqual(restored.scrolls,[[0,640]]); assert.equal(reloadLink.focused,1);
});

test('Today, Path, and full Library preserve exact return offset without recentering an off-screen opener', () => {
  for(const context of [
    {tab:'today',libraryView:'essentials'},
    {tab:'path',libraryView:'essentials'},
    {tab:'library',libraryView:'full'},
  ]){
    let visibilityCorrections=0;
    const link={
      ...opener(),getBoundingClientRect:()=>({top:900,bottom:960}),
      scrollIntoView(){visibilityCorrections++;},
    };
    const {h,scrolls,setScrollY}=originHarness(
      {...roleContext,screen:'app',...context,openId:null},
      {scrollY:640,innerHeight:600,openers:{'[data-fd-open="deep.md"]':link}},
    );
    h.controller.dispatch({'data-fd-open':'deep.md'});
    setScrollY(0);
    h.controller.dispatch({'data-fd-back':''});
    assert.deepEqual(scrolls,[[0,640]],`${context.tab}/${context.libraryView} keeps the saved offset`);
    assert.equal(link.focused,1);
    assert.equal(visibilityCorrections,0,`${context.tab}/${context.libraryView} does not recenter`);
  }
});

test('Essentials return keeps a relocated late-section opener inside the viewport after reset to All', () => {
  let box={top:900,bottom:960};
  const link={
    ...opener(),
    getBoundingClientRect:()=>box,
    scrollIntoView(){ box={top:200,bottom:260}; },
  };
  const initial={...roleContext,screen:'app',tab:'library',libraryView:'essentials',kitSection:'late',openId:null};
  const {h,scrolls,setScrollY}=originHarness(initial,{
    scrollY:40,innerHeight:600,openers:{'[data-fd-open="late.md"]':link},
  });
  h.controller.dispatch({'data-fd-open':'late.md'});
  setScrollY(0);
  h.controller.dispatch({'data-fd-back':''});
  assert.equal(h.controller.getState().kitSection,'all');
  assert.equal(link.focused,1);
  assert.deepEqual(scrolls,[[0,40]],'the saved offset is restored before visibility correction');
  assert.ok(box.top>=0&&box.bottom<=600,'the refocused opener is visible after its section moves');
});

test('full Library returns after autoAdvance and Change week while Today and Path own search returns', () => {
  const full = {...roleContext,screen:'app',tab:'library',libraryView:'full',openId:'extra.md',fromTab:'library'};
  const c = {search:'?page=extra.md&tab=library&library=full',weekItems:[{ref:'extra.md'}]};
  assert.equal(F.fdDispatch({'data-fd-toggle':'extra.md'},c,full).route,'?tab=library&library=full');
  assert.equal(F.fdDispatch({'data-fd-change-week':''},c,full).route,'?tab=library&library=full');
  for (const tab of ['today','path']) {
    const opened = F.fdDispatch({'data-fd-open':'extra.md'}, {search:'?library=full'},
      {...roleContext,tab,libraryView:'essentials',searchOpen:true});
    const reload = F.fdResolveState(opened.route,{...roleContext,tab:'library'});
    assert.equal(reload.fromTab,tab); assert.equal(reload.libraryView,'essentials');
    assert.equal(new URLSearchParams(opened.route).has('library'),false);
  }
});

test('legacy start Progress canonicalization reloads and returns to Today despite old Library or Path context', () => {
  for (const search of ['?page=__start__&tab=library&library=full','?page=__start__&tab=path','?page=__start__&library=full']) {
    const initial = F.fdResolveState(search,{...roleContext,screen:'app'});
    const opened = F.fdDispatch({'data-fd-open':'__start__'},{search},initial);
    const reload = F.fdResolveState(opened.route,{...roleContext,tab:'library'});
    assert.equal(reload.openId,'__progress__');
    assert.equal(reload.fromTab,'today');
    assert.equal(reload.libraryView,'essentials');
    assert.equal(new URLSearchParams(opened.route).has('library'),false);
    assert.equal(F.fdDispatch({'data-fd-back':''},{search:opened.route},reload).route,'/');
  }
});

test('Progress from the full Library shorthand preserves full context through reload and return', () => {
  const search = '?library=full';
  const initial = F.fdResolveState(search,roleContext);
  const opened = F.fdDispatch({'data-fd-progress':''},{search},initial);
  const reload = F.fdResolveState(opened.route,{...roleContext,tab:'today'});
  assert.equal(reload.openId,'__progress__');
  assert.equal(reload.fromTab,'library');
  assert.equal(reload.libraryView,'full');
  assert.equal(F.fdDispatch({'data-fd-back':''},{search:opened.route},reload).route,'?tab=library&library=full');
});

test('plain Today Progress keeps its existing route while Path keeps its return origin', () => {
  const initial = {...roleContext, screen:'app', tab:'today', libraryView:'essentials'};
  assert.equal(F.fdDispatch({'data-fd-progress':''},{search:''},initial).route,'?page=__progress__');
  const path = F.fdDispatch({'data-fd-progress':''},{search:''},{...initial,tab:'path'});
  assert.equal(path.route,'?page=__progress__&tab=path');
});


test('Essentials section button rerenders and focuses its rebuilt rail control without writing storage or history', () => {
  const storage=memStorage(), local=make(storage), routes=[], renders=[], focused=[];
  const fresh={focus(){focused.push(true);}};
  const h=fakeHarness({...roleContext,screen:'app',tab:'library',libraryView:'essentials'}, {
    F:local,route:(...a)=>routes.push(a),render:(...a)=>renders.push(a),
    querySelector:sel=>sel==='[data-fd-kit-section="tools"]'?fresh:null
  });
  let writes=0; storage.setItem=()=>{writes++;}; storage.removeItem=()=>{writes++;};
  const before=storage.dump(); routes.length=0; renders.length=0;
  h.rootHandlers.click({target:actionTarget({'data-fd-kit-section':'tools'}),preventDefault(){}});
  assert.equal(h.controller.getState().kitSection,'tools');
  assert.equal(renders.length,1); assert.equal(renders[0][1].surfaces.base,true);
  assert.equal(focused.length,1); assert.equal(writes,0);
  assert.deepEqual(storage.dump(),before); assert.deepEqual(routes,[]);
  const filtered={...h.controller.getState(),kitSection:'tools'};
  for(const action of [{'data-fd-tab':'library'},{'data-fd-library-view':'full'},{'data-fd-library-view':'essentials'},{'data-fd-back':''}]){
    assert.equal(local.fdDispatch(action,{},filtered).patch.kitSection,'all');
  }
  assert.equal(local.fdResolveState('/?tab=library&kitSection=tools',filtered).kitSection,'all');
});

test('Essentials section rail respects startup and faculty preview guards', () => {
  for(const options of [{commitStartup:false},{facultyPreview:()=>true}]){
    const storage=memStorage(), renders=[];
    const h=fakeHarness({...roleContext,screen:'app',tab:'library',kitSection:'all'}, {
      F:make(storage),render:(...a)=>renders.push(a),...options
    });
    const before=storage.dump(); renders.length=0;
    h.rootHandlers.click({target:actionTarget({'data-fd-kit-section':'tools'}),preventDefault(){}});
    assert.equal(h.controller.getState().kitSection,'all'); assert.equal(renders.length,0);
    assert.deepEqual(storage.dump(),before);
  }
});

test('Essentials tool preview selection rerenders and focuses its rebuilt card without persistence or routing', () => {
  const storage=memStorage(), local=make(storage), routes=[], renders=[], focused=[];
  const fresh={focus(){focused.push(true);}};
  const h=fakeHarness({...roleContext,screen:'app',tab:'library',libraryView:'essentials'}, {
    F:local,route:(...args)=>routes.push(args),render:(...args)=>renders.push(args),
    querySelector:selector=>selector==='[data-fd-kit-tool="second.html"]'?fresh:null
  });
  let writes=0; storage.setItem=()=>{writes++;}; storage.removeItem=()=>{writes++;};
  const before=storage.dump(); routes.length=0; renders.length=0;
  h.rootHandlers.click({target:actionTarget({'data-fd-kit-tool':'second.html'}),preventDefault(){}});
  assert.equal(h.controller.getState().kitToolPreview,'second.html');
  assert.equal(renders.length,1); assert.equal(renders[0][1].surfaces.base,true);
  assert.equal(focused.length,1); assert.equal(writes,0);
  assert.deepEqual(storage.dump(),before); assert.deepEqual(routes,[]);
});

test('Essentials tool preview tabs move with arrow, Home, and End keys', () => {
  const local=make(memStorage()), renders=[], focused=[];
  const refs=['first.html','second.html','third.html'];
  const makeTab=ref=>actionTarget({'data-fd-kit-tool':ref},{focus(){focused.push(ref);}});
  let liveTabs=refs.map(makeTab);
  const h=fakeHarness({...roleContext,screen:'app',tab:'library',libraryView:'essentials'}, {
    F:local,render:(...args)=>{renders.push(args);liveTabs=refs.map(makeTab);},
    querySelector:selector=>liveTabs.find(tab=>selector===`[data-fd-kit-tool="${tab.getAttribute('data-fd-kit-tool')}"]`)||null,
    querySelectorAll:selector=>selector==='[data-fd-kit-tool]'?liveTabs:[]
  });
  const press=(key,index)=>h.windowHandlers.keydown({key,target:liveTabs[index],preventDefault(){}});
  press('ArrowRight',0); assert.equal(h.controller.getState().kitToolPreview,'second.html');
  press('ArrowLeft',1); assert.equal(h.controller.getState().kitToolPreview,'first.html');
  press('End',0); assert.equal(h.controller.getState().kitToolPreview,'third.html');
  press('Home',2); assert.equal(h.controller.getState().kitToolPreview,'first.html');
  assert.deepEqual(focused,['second.html','first.html','third.html','first.html']);
  assert.equal(renders.length,4);
});


test('explicit Essentials revisit rerenders even when All was already selected', () => {
  const renders=[];
  const h=fakeHarness({...roleContext,screen:'app',tab:'library',libraryView:'essentials',kitSection:'all'}, {
    F:make(memStorage()),render:(...args)=>renders.push(args)
  });
  renders.length=0;
  h.controller.dispatch({'data-fd-library-view':'essentials'});
  assert.equal(renders.length,1);
  h.controller.dispatch({'data-fd-tab':'library'});
  assert.equal(renders.length,2);
});

test('Essentials horizontal controls reveal both clipped edges without route, state, storage, or page scrolling', () => {
  const storage=memStorage(), routes=[], scrolls=[];
  const h=fakeHarness({...roleContext,screen:'app',tab:'library'}, {
    F:make(storage),route:(...args)=>routes.push(args),scrollTo:(...args)=>scrolls.push(args)
  });
  h.fakeWindow.getComputedStyle=node=>node===strip ? {paddingLeft:'6px',paddingRight:'6px'} : {outlineWidth:'2px',outlineOffset:'2px'};
  const strip={scrollLeft:0,clientLeft:0,clientWidth:362,getBoundingClientRect:()=>({left:14,right:376})};
  let bounds={left:308,right:588};
  const target={closest:selector=>selector==='.fd-kit__tool-tabs [data-fd-kit-tool],.fd-kit__index-track [data-fd-kit-section]'?target:strip,getBoundingClientRect:()=>bounds};
  const state=JSON.stringify(h.controller.getState()), saved=storage.dump(); routes.length=0;
  assert.equal(typeof h.rootHandlers.focusin,'function');
  h.rootHandlers.focusin({target}); assert.equal(strip.scrollLeft,218);
  bounds={left:10,right:290}; h.rootHandlers.focusin({target}); assert.equal(strip.scrollLeft,208);
  bounds={left:20,right:300}; h.rootHandlers.focusin({target}); assert.equal(strip.scrollLeft,208);
  h.rootHandlers.focusin({target:{closest:()=>null}}); assert.equal(strip.scrollLeft,208);
  assert.equal(JSON.stringify(h.controller.getState()),state); assert.deepEqual(storage.dump(),saved);
  assert.deepEqual(routes,[]); assert.deepEqual(scrolls,[]);
  h.controller.destroy(); bounds={left:400,right:680}; h.rootHandlers.focusin({target});
  assert.equal(strip.scrollLeft,208);
});

test('Essentials tool focus is inert before startup and during faculty preview', () => {
  for(const options of [{commitStartup:false},{facultyPreview:()=>true}]) {
    const h=fakeHarness({...roleContext,screen:'app',tab:'library'}, {F:make(memStorage()),...options});
    let inspected=0;
    h.rootHandlers.focusin({target:{closest(){inspected++;return null;}}});
    assert.equal(inspected,0);
  }
});
