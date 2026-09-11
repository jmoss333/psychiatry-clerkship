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
  assert.match(h, /data-fd-theme="dark"[^>]*aria-checked="true"/);
  assert.match(h, /data-fd-theme="light"[^>]*aria-checked="false"/);
});

test('system is the active mode when nothing was ever chosen', () => {
  const h = S.fdSheetSettingsBody(withState({ themeMode: undefined }));
  assert.match(h, /data-fd-theme="system"[^>]*aria-checked="true"/);
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
  assert.match(h, /class="fd-seg"[^>]*role="radiogroup"/, 'and carries the appearance control');
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
    /data-fd-theme="dark"[^>]*aria-checked="true"/,
    'a stored dark mode must reach the panel as the active choice');
});
