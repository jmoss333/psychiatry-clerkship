// Theme is two values, not one: the MODE a learner picks (system/light/dark, in cw_theme) and the
// ATTRIBUTE the page paints (light/dark). Everything that crosses a frame boundary can only carry
// the attribute, so the direction of a theme message decides whether it may be persisted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';

// A learner who picks System and opens a tool must still be on System afterwards. The shell can
// only ever push a RESOLVED value into an iframe, so any child that persists what it is pushed
// converts 'system' into a pinned mode — silently, with no user gesture anywhere in the chain.
test('a tool page paints a pushed theme without persisting it', () => {
  const tool = readFileSync(new URL(`${BUILD}/question-bank-practice.html`, import.meta.url), 'utf8');
  const handler = tool.slice(tool.indexOf("'theme'") - 400, tool.indexOf("'theme'") + 400);
  assert.match(handler, /setAttribute\(\s*['"]data-theme['"]/, 'it must still paint');
  assert.doesNotMatch(handler, /setItem\(\s*['"]cw_theme['"]/, 'and must not persist what it was pushed');
});

// The other half of the same asymmetry, executed rather than grepped: the shell resolves the mode
// ONCE and paints and posts the same resolved attribute. If 'system' ever escaped this block it
// would reach both a stylesheet that has no rule for it and a tool that rejects it outright.
const shell = readFileSync(new URL(`${BUILD}/spa_index.html`, import.meta.url), 'utf8');
const themeBlock = shell.match(/ {4}if\(d\.effect&&d\.effect\.mode\)\{[\s\S]*?\n {4}\}/)[0];
const fdThemeAttr = new Function('mode', 'prefersDark', // eslint-disable-line no-new-func
  readFileSync(new URL(`${BUILD}/frontdoor/fd_shell.js`, import.meta.url), 'utf8')
    .match(/function fdThemeAttr\(mode, prefersDark\)\{[\s\S]*?\n\}/)[0]
  + '\nreturn fdThemeAttr(mode,prefersDark);');

function pushTheme(mode, prefersDark) {
  let painted = null;
  const posted = [];
  const d = { effect: { type: 'set-theme', mode } };
  const document = { documentElement: { setAttribute: (_n, v) => { painted = v; } } };
  const window = { matchMedia: (q) => ({ matches: /dark/.test(q) && prefersDark }) };
  const contentEl = {
    querySelector: () => ({ contentWindow: { postMessage: (msg) => posted.push(msg) } }),
  };
  // eslint-disable-next-line no-new-func
  new Function('d', 'document', 'window', 'contentEl', 'fdThemeAttr', themeBlock)(
    d, document, window, contentEl, fdThemeAttr);
  return { painted, posted };
}

test('the shell resolves a mode before it paints or pushes it', () => {
  assert.deepEqual(pushTheme('system', true),
    { painted: 'dark', posted: [{ type: 'theme', mode: 'dark' }] });
  assert.deepEqual(pushTheme('system', false),
    { painted: 'light', posted: [{ type: 'theme', mode: 'light' }] });
  assert.deepEqual(pushTheme('light', true),
    { painted: 'light', posted: [{ type: 'theme', mode: 'light' }] },
    'an explicit mode ignores the OS in both the paint and the message');
});

// ---------------------------------------------------------------------------------------------
// The settings panel is a pure renderer like every other fd_sheet surface: state in, string out.
// Tested directly rather than through the DOM, following tests/fd-sheet.test.mjs. fd_shell.js is
// in the harness because fdSettingsSeg normalises through its fdThemeMode.
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');

// eslint-disable-next-line no-new-func
const makeSettings = new Function(`
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_shell.js')}
  ${read('frontdoor/fd_sheet.js')}
  return {
    fdSheetSettingsBody: fdSheetSettingsBody, fdSheet: fdSheet, fdThemeMode: fdThemeMode,
  };
`);
const S = makeSettings();

const base = { themeMode: 'system' };
const withState = (over) => Object.assign({}, base, over);

test('appearance offers all three modes and marks the active one', () => {
  const h = S.fdSheetSettingsBody(withState({ themeMode: 'dark' }));
  for (const m of ['system', 'light', 'dark']) {
    assert.match(h, new RegExp(`data-fd-theme="${m}"`), `${m} must be offered`);
  }
  assert.match(h, /data-fd-theme="dark"[^>]*aria-pressed="true"/);
  assert.match(h, /data-fd-theme="light"[^>]*aria-pressed="false"/);
});

test('system is the active mode when nothing was ever chosen', () => {
  const h = S.fdSheetSettingsBody(withState({ themeMode: undefined }));
  assert.match(h, /data-fd-theme="system"[^>]*aria-pressed="true"/);
});

test('the sheet renders settings as a dialog with a close control', () => {
  const h = S.fdSheet({}, {}, withState({ sheet: 'settings' }));
  assert.match(h, /role="dialog"/);
  assert.match(h, /aria-modal="true"/);
  assert.match(h, /data-fd-close-sheet/, 'reuses the shared sheet close, not a bespoke one');
  // The branch must render the PANEL, not just claim the title. An empty body would satisfy
  // every assertion above, and the index passed here holds no protocol for 'settings' -- so the
  // old fall-through would have returned '' and this is what tells the two apart.
  assert.match(h, /aria-label="Settings"/, 'the dialog names itself Settings');
  assert.match(h, /class="fd-seg"[^>]*role="group"/, 'and carries the appearance control');
});

// The wiring that puts a real mode on state, executed rather than grepped. The panel reads
// st.themeMode and nothing else sets it -- currentTheme() in fd_wire.js feeds dispatch, not render
// state. Drop this assignment or point it at another key and every learner's panel marks System
// active, because fdThemeMode maps an absent value to 'system'. Nothing else in the tree notices.
test('fdLiveState resolves the stored key into the mode the panel renders', () => {
  const start = shell.indexOf('function fdLiveState(state)');
  const end = shell.indexOf('function fdCaptureRows()', start);
  assert.ok(start > -1 && end > start, 'the live-state boundary must stay extractable');
  const liveState = shell.slice(start, end);
  const assignment = (liveState.match(/^\s*out\.themeMode=.*$/m) || [])[0];
  assert.ok(assignment, 'fdLiveState must put a theme mode on the state the renderer sees');

  // eslint-disable-next-line no-new-func
  const resolve = new Function('LS', 'fdThemeMode',
    `var out={};${assignment}\nreturn out.themeMode;`);
  const keysRead = [];
  const stored = (value) => (key) => { keysRead.push(key); return value; };

  assert.equal(resolve(stored('dark'), S.fdThemeMode), 'dark');
  assert.deepEqual(keysRead, ['cw_theme'], 'the mode comes from cw_theme and from nothing else');
  assert.equal(resolve(stored('nonsense'), S.fdThemeMode), 'system',
    'a junk stored value normalises here rather than reaching the renderer raw');

  assert.match(S.fdSheetSettingsBody({ themeMode: resolve(stored('dark'), S.fdThemeMode) }),
    /data-fd-theme="dark"[^>]*aria-pressed="true"/,
    'a stored dark mode must reach the panel as the active choice');
});

// role="radio" is a PROMISE of a keyboard contract: roving tabindex so the group is one tab stop,
// arrow keys moving the selection, Home/End. None of that is implemented here, and implementing it
// would mean reaching into fdKeyAction -- the shared keyboard map -- for a three-item control. A
// role that lies is worse than no role: a screen-reader user hears "radio button, 1 of 3", presses
// the arrow key the role just told them to press, and nothing happens. Three ordinary toggle
// buttons keep only the promise they can keep. Reinstating the radio pattern is correct ONLY
// alongside the keyboard code, so this stays red until both land together.
test('the appearance control claims no keyboard contract it does not implement', () => {
  const h = S.fdSheetSettingsBody(withState({ themeMode: 'dark' }));
  assert.doesNotMatch(h, /role="radio(?:group)?"/,
    'a radio role requires roving tabindex, arrow-key selection and Home/End');
  assert.doesNotMatch(h, /aria-checked/,
    'aria-checked belongs to radio and checkbox, never to a plain button');
  assert.match(h, /class="fd-seg"[^>]*role="group"/, 'the segments are a labelled group');
});

// .is-active is what the CSS fills; aria-pressed is what a screen reader announces. Different
// audiences read the two, so an edit that moves one and not the other shows a different segment as
// chosen to sighted and non-sighted learners, with nothing to notice it.
test('the styled segment and the announced segment are the same one', () => {
  for (const mode of ['system', 'light', 'dark']) {
    const buttons = S.fdSheetSettingsBody(withState({ themeMode: mode }))
      .match(/<button[^>]*data-fd-theme="[^"]*"[^>]*>/g) || [];
    assert.equal(buttons.length, 3, `${mode}: all three segments must render`);
    const styled = buttons.filter((b) => /class="[^"]*\bis-active\b/.test(b));
    const announced = buttons.filter((b) => /aria-pressed="true"/.test(b));
    assert.equal(styled.length, 1, `${mode}: exactly one segment is filled`);
    assert.equal(announced.length, 1, `${mode}: exactly one segment is announced pressed`);
    assert.equal(styled[0], announced[0], `${mode}: and it must be the same segment`);
    assert.match(styled[0], new RegExp(`data-fd-theme="${mode}"`),
      `${mode}: the chosen mode is the one marked`);
  }
});

// ---------------------------------------------------------------------------------------------
// Everything above is renderer-level -- state in, string out -- and renderer-level tests cannot
// see an ORDERING defect. One lived here: fd_wire.js's apply() ran the render BEFORE
// fdApplyEffect persisted cw_theme, so the panel was rebuilt from stale storage. Clicking "Dark"
// with the panel open painted the page dark, re-rendered the panel with the PREVIOUS segment
// still filled and aria-pressed="true", and then focused the Dark button -- announcing "Dark,
// button, not pressed" while a different segment claimed to be pressed. fdSettingsSeg is the only
// emitter of data-fd-theme, so the panel is open by definition whenever this fires.
//
// Nothing else in this file could have caught it: the source-executing test injects its own LS,
// and fd-sheet.test.mjs's boundary stubs LS(){return '';}. This one drives the real apply()
// through a render callback shaped like the shell's -- read cw_theme AT RENDER TIME, normalise,
// render -- which is exactly what fdLiveState does.
const WIRE_MODULES = [
  'phase_policy.js', 'frontdoor/fd_state.js', 'frontdoor/fd_data.js', 'frontdoor/fd_today.js',
  'frontdoor/fd_block.js', 'frontdoor/fd_reader.js', 'frontdoor/fd_shell.js',
  'frontdoor/fd_sheet.js', 'frontdoor/fd_wire.js',
];
// eslint-disable-next-line no-new-func
const makeWire = new Function('localStorage', `${WIRE_MODULES.map(read).join('\n')}
  return { fdWire: fdWire, fdSheetSettingsBody: fdSheetSettingsBody, fdThemeMode: fdThemeMode };
`);

function themeClickHarness(seed) {
  const map = new Map(Object.entries(seed));
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  const W = makeWire(storage);
  const panels = [];
  // The shell's render path in miniature. fdLiveState is what production runs here, and its one
  // load-bearing property for this defect is that the mode is re-read from storage at render time.
  const renderPanel = () => panels.push(W.fdSheetSettingsBody({
    themeMode: W.fdThemeMode(storage.getItem('cw_theme')),
  }));
  const handlers = {};
  const root = {
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
    querySelector: () => null,
    matches: () => false,
  };
  const initial = { role: 'first-role', week: 1, screen: 'app', sheet: 'settings' };
  const controller = W.fdWire(root, initial, {
    window: {
      addEventListener() {}, removeEventListener() {},
      location: { href: 'https://example.test/', search: '', pathname: '/' },
    },
    render: renderPanel,
    renderTransient: renderPanel,
    index: { byRef: {}, weeks: [{ n: 1, items: [] }] },
    synonyms: {},
    document: { documentElement: { getAttribute: () => 'light', setAttribute() {} } },
  });
  controller.commitStartup();
  return {
    panels,
    storage,
    click(mode) {
      const target = {
        tagName: 'BUTTON', isContentEditable: false, isConnected: true,
        // Matched loosely on purpose. tests/fd-wire.test.mjs:547 pins the delegated selector
        // string exactly, and that is the right place for it -- a second verbatim copy here would
        // be one more thing to keep in sync for a test that is about ORDERING, not delegation.
        closest: (selector) => (selector.indexOf('[data-fd-theme]') > -1 ? target : null),
        hasAttribute: (n) => n === 'data-fd-theme',
        getAttribute: (n) => (n === 'data-fd-theme' ? mode : null),
        focus() {},
      };
      handlers.click({ target, preventDefault() {} });
    },
  };
}

test('a theme click re-renders the panel with the mode just clicked, not the previous one', () => {
  const h = themeClickHarness({ cw_theme: 'light' });
  const before = h.panels.length;
  h.click('dark');
  assert.ok(h.panels.length > before, 'the click must re-render the open panel');

  const painted = h.panels[h.panels.length - 1];
  assert.match(painted, /data-fd-theme="dark"[^>]*aria-pressed="true"/,
    'the segment the learner just clicked must be the one marked pressed');
  assert.doesNotMatch(painted, /data-fd-theme="light"[^>]*aria-pressed="true"/,
    'the previous mode must not still claim to be pressed');
  // class precedes data-fd-theme in the emitted markup, so this reads left to right the other way.
  assert.match(painted, /class="[^"]*\bis-active\b[^"]*"[^>]*data-fd-theme="dark"/,
    'and it must be the filled one too');
  assert.equal(h.storage.getItem('cw_theme'), 'dark',
    'the chosen mode is persisted, not merely painted');
});
