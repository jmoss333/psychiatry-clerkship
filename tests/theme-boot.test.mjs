// The theme boot script is the one piece of theme logic that CANNOT import fdThemeMode: it runs
// in <head> before any frontdoor module is injected, because its whole job is painting the right
// attribute before first paint. The duplication is deliberate; this test is what keeps the copy
// honest by exercising it directly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const html = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');

const boot = html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.match(boot, /cw_theme/, 'the first inline script should still be the theme boot');

function run({ stored, prefersDark, storageThrows = false }) {
  let painted = null;
  const localStorage = { getItem: (k) => {
    if (storageThrows) throw new Error('site data blocked');
    return k === 'cw_theme' ? stored : null;
  } };
  const document = { documentElement: { setAttribute: (_, v) => { painted = v; } } };
  const window = { matchMedia: (q) => ({ matches: /dark/.test(q) && prefersDark }) };
  // eslint-disable-next-line no-new-func
  new Function('localStorage', 'document', 'window', boot)(localStorage, document, window);
  return painted;
}

test('unset follows the OS in both directions', () => {
  assert.equal(run({ stored: null, prefersDark: true }), 'dark');
  assert.equal(run({ stored: null, prefersDark: false }), 'light');
});

test('an explicit stored mode overrides the OS', () => {
  assert.equal(run({ stored: 'light', prefersDark: true }), 'light');
  assert.equal(run({ stored: 'dark', prefersDark: false }), 'dark');
});

test('stored system follows the OS', () => {
  assert.equal(run({ stored: 'system', prefersDark: true }), 'dark');
});

// A browser that throws on any localStorage access -- Chrome with site data blocked -- must still
// reach the media query. Resolving the OS inside the storage try meant it did not: the throw
// aborted the whole boot, nothing was painted, and clinical-warm.css scopes the dark palette to
// [data-theme="dark"], so the learner got a white page on a dark OS with no way to opt out.
test('blocked site data does not stop the OS being consulted', () => {
  assert.equal(run({ stored: null, prefersDark: true, storageThrows: true }), 'dark');
  assert.equal(run({ stored: null, prefersDark: false, storageThrows: true }), 'light');
});

test('a browser without matchMedia still paints something', () => {
  let painted = null;
  const localStorage = { getItem: () => null };
  const document = { documentElement: { setAttribute: (_, v) => { painted = v; } } };
  // eslint-disable-next-line no-new-func
  new Function('localStorage', 'document', 'window', boot)(localStorage, document, {});
  assert.equal(painted, 'light', 'no matchMedia must not throw or leave the page unpainted');
});

// ---------------------------------------------------------------------------------------------
// The live OS listener. 'system' resolves correctly at boot and at every explicit theme change,
// and then goes stale: without a `change` subscription "System" means "your OS as of page load",
// which since unset now means system is the default for every existing device.
//
// The subscription lives HERE, in the boot, and not in fd_wire.js, because the boot is the only
// theme code that exists on every themed page. The tool pages carry it and get no frontdoor
// modules at all, and the shell posts a resolved theme into a tool frame only on an explicit
// theme CHANGE -- never on an OS flip -- so a controller-side listener would leave every embedded
// tool showing the old palette for as long as the learner stayed in it. A second resolver beside
// the boot's is also the exact drift this branch already had to repair once (0ed0a4c).
//
// The four bootless pages (decision-aids, review, interview-circle, feedback) are deliberately
// NOT covered: they own their theme from <body> in their own component or DOM state, and a second
// owner repainting underneath them would desync that state from the attribute.

// A MediaQueryList that can be flipped, recording how the boot subscribed to it. `modern` and
// `legacy` select which subscribe API exists, because older Safari has only addListener.
function mediaQueryList(matches, { modern = true, legacy = true } = {}) {
  const listeners = [];
  const mql = { matches };
  if (modern) mql.addEventListener = (type, fn) => { if (type === 'change') listeners.push(fn); };
  if (legacy) mql.addListener = (fn) => { listeners.push(fn); };
  return {
    mql,
    listeners,
    flip(next) {
      mql.matches = next;
      for (const fn of listeners.slice()) fn({ matches: next });
    },
  };
}

function bootPage({ stored = null, prefersDark = false, modern = true, legacy = true,
  noMatchMedia = false } = {}) {
  let store = stored;
  const painted = [];
  const q = noMatchMedia ? null : mediaQueryList(prefersDark, { modern, legacy });
  const localStorage = { getItem: (k) => (k === 'cw_theme' ? store : null) };
  const document = {
    documentElement: { setAttribute: (k, v) => { if (k === 'data-theme') painted.push(v); } },
  };
  const window = noMatchMedia
    ? {}
    : { matchMedia: (query) => (/dark/.test(query) ? q.mql : { matches: false }) };
  // eslint-disable-next-line no-new-func
  new Function('localStorage', 'document', 'window', boot)(localStorage, document, window);
  return {
    painted,
    listeners: q ? q.listeners : [],
    flip: (next) => q.flip(next),
    // What the settings panel does when a learner picks a mode: fd_wire.js persists cw_theme
    // before it renders, so a later OS flip reads the NEW mode.
    choose: (mode) => { store = mode; },
    now: () => painted[painted.length - 1],
  };
}

test('an OS flip repaints, in both directions, while the mode is system', () => {
  for (const stored of [null, 'system']) {
    const page = bootPage({ stored, prefersDark: false });
    assert.equal(page.now(), 'light', `${stored} should start light on a light OS`);
    page.flip(true);
    assert.equal(page.now(), 'dark', `${stored} should follow the OS to dark`);
    page.flip(false);
    assert.equal(page.now(), 'light', `${stored} should follow the OS back to light`);
  }
});

test('an OS flip does not override an explicit mode', () => {
  for (const stored of ['light', 'dark']) {
    const page = bootPage({ stored, prefersDark: stored === 'light' });
    page.flip(true);
    page.flip(false);
    assert.deepEqual([...new Set(page.painted)], [stored],
      `${stored} was chosen explicitly and no OS flip may repaint away from it`);
  }
});

// The gate has to be read LIVE, not captured at boot. A learner opens the page on System, picks
// Light in the settings panel, and the OS flips an hour later: an implementation that captured
// the mode in a boot-time variable repaints dark over the Light they chose.
test('picking an explicit mode mid-session stops the page following the OS', () => {
  const page = bootPage({ stored: 'system', prefersDark: false });
  page.flip(true);
  assert.equal(page.now(), 'dark', 'still on system here');
  page.choose('light');
  page.flip(false);
  page.flip(true);
  assert.equal(page.now(), 'light', 'the mode was changed to light; the OS must stop mattering');
});

test('older Safari gets the addListener fallback', () => {
  const page = bootPage({ stored: 'system', prefersDark: false, modern: false });
  assert.equal(page.listeners.length, 1, 'addListener must be used when addEventListener is absent');
  page.flip(true);
  assert.equal(page.now(), 'dark');
});

test('a media query list with neither subscribe API still paints and does not throw', () => {
  const page = bootPage({ stored: null, prefersDark: true, modern: false, legacy: false });
  assert.deepEqual(page.painted, ['dark']);
  assert.equal(page.listeners.length, 0);
});

test('no matchMedia means nothing to subscribe to, and no throw', () => {
  const page = bootPage({ stored: null, noMatchMedia: true });
  assert.deepEqual(page.painted, ['light']);
  assert.equal(page.listeners.length, 0);
});
