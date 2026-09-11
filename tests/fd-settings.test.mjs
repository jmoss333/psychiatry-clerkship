// Theme is two values, not one: the MODE a learner picks (system/light/dark, in cw_theme) and the
// ATTRIBUTE the page paints (light/dark). Everything that crosses a frame boundary can only carry
// the attribute, so the direction of a theme message decides whether it may be persisted.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

// ---------------------------------------------------------------------------------------------
// The You section. Role was the one choice the first-run wizard made a one-way door: fdResolveState
// returns to screen:'setup-role' only when the stored role is EMPTY, so a learner who tapped the
// wrong chip on day one was stuck with it short of clearing site data.
const ROLES = [
  { id: 'student', name: 'Core rotation', desc: 'The six-week inpatient rotation', hint: 'most common' },
  { id: 'staff', name: 'Nursing · SW · family', desc: 'Unit staff and families', hint: '' },
];

test('role chips render from the supplied list and mark the stored id', () => {
  const h = S.fdSheetSettingsBody(withState({ roles: ROLES, roleId: 'staff' }));
  assert.match(h, /data-fd-role="student"/);
  assert.match(h, /data-fd-role="staff"[^>]*aria-pressed="true"/);
  assert.match(h, /data-fd-role="student"[^>]*aria-pressed="false"/,
    'the stored id is marked, not simply the first chip');
});

test('the role section is absent when the caller supplied no list', () => {
  const h = S.fdSheetSettingsBody(withState({}));
  assert.doesNotMatch(h, /data-fd-role=/);
  assert.doesNotMatch(h, /<h3[^>]*>You</, 'and it takes its heading with it');
});

// Author decision, 2026-09-10: role ships with no explanation -- no sublabel describing what it
// affects, and therefore no save confirmation either. A "Saved" against a change the learner
// cannot find anywhere promises more than happened; the chip's own selected state is the feedback.
test('role offers no explanation and no save confirmation', () => {
  const h = S.fdSheetSettingsBody(withState({ roles: ROLES, roleId: 'staff' }));
  assert.doesNotMatch(h, /greeting/i);
  assert.doesNotMatch(h, /\bSaved\b/);
});

// The same ruling 60b246b applied to the segments, applied to the section shipping beside them.
// Nothing about the role chips implements roving tabindex, arrow-key selection or Home/End either,
// and a panel that announced "radio button, 1 of 3" in one section and "button, pressed" in the
// next would teach a screen-reader user two contradictory interaction models inside one dialog.
test('the role chips claim no keyboard contract they do not implement', () => {
  const h = S.fdSheetSettingsBody(withState({ roles: ROLES, roleId: 'staff' }));
  assert.doesNotMatch(h, /role="radio(?:group)?"/,
    'a radio role requires roving tabindex, arrow-key selection and Home/End');
  assert.doesNotMatch(h, /aria-checked/,
    'aria-checked belongs to radio and checkbox, never to a plain button');
  assert.match(h, /class="fd-choices"[^>]*role="group"/, 'the chips are a labelled group');
});

// The .is-active / aria-pressed agreement, for the control whose selected state is its ONLY
// feedback. Desync these and the learner sees one role filled while a screen reader announces a
// different one as chosen, with nothing anywhere to notice.
test('the styled chip and the announced chip are the same one', () => {
  for (const id of ['student', 'staff']) {
    const chips = S.fdSheetSettingsBody(withState({ roles: ROLES, roleId: id }))
      .match(/<button[^>]*data-fd-role="[^"]*"[^>]*>/g) || [];
    assert.equal(chips.length, ROLES.length, `${id}: every supplied role must render a chip`);
    const styled = chips.filter((b) => /class="[^"]*\bis-active\b/.test(b));
    const announced = chips.filter((b) => /aria-pressed="true"/.test(b));
    assert.equal(styled.length, 1, `${id}: exactly one chip is filled`);
    assert.equal(announced.length, 1, `${id}: exactly one chip is announced pressed`);
    assert.equal(styled[0], announced[0], `${id}: and it must be the same chip`);
    assert.match(styled[0], new RegExp(`data-fd-role="${id}"`), `${id}: the stored role is the one marked`);
  }
});

// Renderer-level tests structurally cannot see this one. fdLiveState resolves out.role to the
// DISPLAY NAME before any renderer runs, so the panel is handed the raw id under a second key.
// Capture it AFTER that overwrite and out.roleId holds "Core rotation" where every chip's
// data-fd-role holds "student": each comparison is false, no chip is marked, and a section whose
// only feedback IS the mark shows none -- silently, in both the paint and the announcement. The
// three assignments are executed here in their real source order rather than grepped, because the
// order is the thing under test.
test('fdLiveState captures the raw role id before it resolves the display name', () => {
  const start = shell.indexOf('function fdLiveState(state)');
  const end = shell.indexOf('function fdCaptureRows()', start);
  assert.ok(start > -1 && end > start, 'the live-state boundary must stay extractable');
  const lines = shell.slice(start, end).match(/^\s*out\.(?:roleId|roles|role)=.*$/gm) || [];
  assert.equal(lines.length, 3, 'fdLiveState must set exactly roleId, roles and role');

  // eslint-disable-next-line no-new-func
  const live = new Function('FD_ROLES', 'fdRoleName', 'stored',
    `var out={role:stored};\n${lines.join('\n')}\nreturn out;`)(
    ROLES, (id) => (ROLES.filter((r) => r.id === id)[0] || {}).name, 'staff');

  assert.equal(live.roleId, 'staff', 'the panel needs the id the chips carry');
  assert.equal(live.role, 'Nursing · SW · family', 'and the rest of the shell still needs the name');
  assert.deepEqual(live.roles, ROLES, 'the chips are drawn from the injected per-site list');
  assert.match(S.fdSheetSettingsBody(live), /data-fd-role="staff"[^>]*aria-pressed="true"/,
    'and the state that actually reaches the renderer marks the chip the learner chose');
});

// The click path, end to end, because the section's whole premise is that the chip's own filled
// state is the only feedback a role change produces. Renderer tests prove the chip CAN be marked;
// this one proves the click actually reaches it -- and, in the same run, that the fork in
// fd_wire.js holds, since an unforked dispatch patches screen:'setup-week' and a learner adjusting
// a setting is thrown into the first-run wizard with the panel gone. The render callback mirrors
// fdLiveState's one load-bearing property here, that roleId is the state's RAW role; the source
// order that guarantees it is pinned by the test above.
function roleClickHarness() {
  const W = makeWire({ getItem: () => null, setItem() {}, removeItem() {} });
  const panels = [];
  const states = [];
  const renderPanel = (next) => {
    states.push(next || {});
    panels.push(W.fdSheetSettingsBody({ roles: ROLES, roleId: (next || {}).role }));
  };
  const handlers = {};
  const root = {
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
    querySelector: () => null,
    matches: () => false,
  };
  const controller = W.fdWire(root, { role: 'student', week: 1, screen: 'app', sheet: 'settings' }, {
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
    states,
    controller,
    click(id) {
      const target = {
        tagName: 'BUTTON', isContentEditable: false, isConnected: true,
        closest: (selector) => (selector.indexOf('[data-fd-role]') > -1 ? target : null),
        hasAttribute: (n) => n === 'data-fd-role',
        getAttribute: (n) => (n === 'data-fd-role' ? id : null),
        focus() {},
      };
      handlers.click({ target, preventDefault() {} });
    },
  };
}

test('clicking a role chip marks that chip and leaves the learner in the panel', () => {
  const h = roleClickHarness();
  const before = h.panels.length;
  h.click('staff');
  assert.ok(h.panels.length > before, 'the click must re-render the open panel');

  const painted = h.panels[h.panels.length - 1];
  assert.match(painted, /data-fd-role="staff"[^>]*aria-pressed="true"/,
    'the chip the learner just clicked must be the one marked');
  assert.doesNotMatch(painted, /data-fd-role="student"[^>]*aria-pressed="true"/,
    'and the role they just left must not still claim to be chosen');

  const state = h.controller.getState();
  assert.equal(state.role, 'staff', 'the choice is on state, not merely painted');
  assert.equal(state.screen, 'app', 'a setting change must not reopen the first-run wizard');
  assert.equal(state.sheet, 'settings', 'and the panel showing the feedback must stay open');
});

// ---------------------------------------------------------------------------------------------
// The Pacing section. The exam date used to live in Progress behind its own Save button; this is
// a MOVE, not a copy -- fd_state.js:17 records the rule (two writable homes for one key silently
// desync), and the "exactly one home" test below is what keeps it one.

test('the exam date renders as a date input carrying the stored value', () => {
  const h = S.fdSheetSettingsBody(withState({ examDate: '2026-10-30' }));
  assert.match(h, /type="date"/);
  assert.match(h, /data-fd-exam-date[^>]*value="2026-10-30"/,
    'anchored to the date input: an unanchored value= would pass on any attribute in the panel');
});

test('an unset exam date renders an empty input, not a guess', () => {
  assert.match(S.fdSheetSettingsBody(withState({})), /data-fd-exam-date[^>]*value=""/);
});

// Copy rule: these strings ship to both sites. "Exam", never "Shelf".
test('pacing copy stays audience-neutral', () => {
  const h = S.fdSheetSettingsBody(withState({ examDate: '' }));
  assert.doesNotMatch(h, /shelf|clerkship|resident|student/i);
});

// The input's accessible name comes from a real <label for>, not from placeholder text or an
// aria-label that a later copy edit can leave pointing at nothing.
test('the date input is named by a label bound to its own id', () => {
  const h = S.fdSheetSettingsBody(withState({ examDate: '' }));
  const id = (h.match(/<input[^>]*data-fd-exam-date[^>]*>/) || [''])[0].match(/id="([^"]+)"/);
  assert.ok(id, 'the date input needs an id for a label to bind to');
  assert.match(h, new RegExp(`<label[^>]*for="${id[1]}"[^>]*>[^<]+</label>`),
    'and a label carrying visible text must point at exactly that id');
});

// Section order is a contract, not an accident: You -> Pacing -> Appearance. Asserted on the
// rendered string because that is the only place the order exists -- fdSheetSettingsBody
// concatenates, so a section appended in the wrong place is invisible to every other assertion.
test('Pacing sits between You and Appearance', () => {
  const h = S.fdSheetSettingsBody(withState({ roles: ROLES, roleId: 'staff', examDate: '' }));
  const at = (title) => h.indexOf(`class="fd-set__h">${title}<`);
  assert.ok(at('You') > -1 && at('Pacing') > -1 && at('Appearance') > -1, 'all three must render');
  assert.ok(at('You') < at('Pacing'), 'Pacing follows You');
  assert.ok(at('Pacing') < at('Appearance'), 'and precedes Appearance');
});

// Two homes for one key silently desync -- fd_state.js:17 records the same rule for progress.
// This is the assertion that keeps the move a move rather than a copy. The getElementById needle
// is here because the Progress input had a SECOND reader: the plan's "set an exam date" shortcut
// focused it by id, which survives deleting the markup and then silently focuses nothing.
test('the exam date has exactly one home', () => {
  assert.doesNotMatch(shell, /id="fdExamDate"/, 'the Progress input must be gone, not hidden');
  assert.doesNotMatch(shell, /save-exam/, 'and its handler with it');
  assert.doesNotMatch(shell, /fdExamDate/, 'and every reference that outlived it');
  assert.equal(shell.split("localStorage.setItem('cw_shelf_date'").length - 1, 0,
    'the shell must no longer WRITE the key; it reads it for the panel and nothing more');
});

// The render half, executed rather than grepped, exactly as the theme mode is above. The panel
// renders st.examDate and nothing else sets it: drop this assignment and every learner's Pacing
// section shows an empty field over a date they already stored, then overwrites it on the next
// change. Nothing else in the tree notices.
test('fdLiveState resolves the stored key into the date the panel renders', () => {
  const start = shell.indexOf('function fdLiveState(state)');
  const end = shell.indexOf('function fdCaptureRows()', start);
  assert.ok(start > -1 && end > start, 'the live-state boundary must stay extractable');
  const assignment = (shell.slice(start, end).match(/^\s*out\.examDate=.*$/m) || [])[0];
  assert.ok(assignment, 'fdLiveState must put the exam date on the state the renderer sees');

  // eslint-disable-next-line no-new-func
  const resolve = new Function('LS', `var out={};${assignment}\nreturn out.examDate;`);
  const keysRead = [];
  const stored = (value) => (key) => { keysRead.push(key); return value; };

  assert.equal(resolve(stored('2026-10-30')), '2026-10-30');
  assert.deepEqual(keysRead, ['cw_shelf_date'], 'the date comes from that key and from no other');
  assert.equal(resolve(stored(null)), '', 'an absent key renders an empty field, not "null"');
  assert.match(S.fdSheetSettingsBody({ examDate: resolve(stored('2026-10-30')) }),
    /data-fd-exam-date[^>]*value="2026-10-30"/,
    'and the state that actually reaches the renderer carries the stored date');
});

// ---------------------------------------------------------------------------------------------
// The Pacing section's control is the only one in this panel that is NOT a button, and it is
// wired differently on purpose. Everything below is about that difference; renderer-level tests
// structurally cannot see any of it.
//
// fdRenderOverlays replaces the whole overlay mount on every render, so a render here would
// destroy the very <input> the learner is typing in. A rebuilt native date input loses its
// segment cursor: editing a set date to November by typing "1" then "1" yields January twice,
// because the second keystroke starts a fresh month entry in a brand-new element. So this
// control persists and renders NOTHING -- the input's own DOM already shows what was typed, and
// no other surface in the panel derives from the value.
function examChangeHarness(seed) {
  const map = new Map(Object.entries(seed));
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  const W = makeWire(storage);
  const panels = [];
  const focused = [];
  const renderPanel = () => panels.push(W.fdSheetSettingsBody({
    examDate: storage.getItem('cw_shelf_date') || '',
  }));
  // A REAL equivalent control in a REAL dialog, so "focus did not move" is a fact about the code
  // rather than about a stub: if refocusInvoker ran, this is the element it would land on.
  const rebuilt = { focus() { focused.push('rebuilt'); } };
  const panel = {
    querySelector: (selector) => (selector === '[data-fd-exam-date=""]' ? rebuilt : null),
  };
  const input = {
    tagName: 'INPUT',
    isContentEditable: false,
    isConnected: true,
    value: '',
    // Mirrors the real DOM: the control carries the attribute but FD_ACTION_SELECTOR does not
    // list it, so closest() on the delegated selector finds nothing. Flip that and this fixture
    // starts matching, which is exactly the click-erases-the-date defect it exists to catch.
    closest: (selector) => (selector.indexOf('[data-fd-exam-date]') > -1 ? input : null),
    hasAttribute: (n) => n === 'data-fd-exam-date',
    getAttribute: (n) => (n === 'data-fd-exam-date' ? '' : null),
    focus() { focused.push('invoker'); },
  };
  const handlers = {};
  const root = {
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
    querySelector: (selector) => (selector === '.fd-sheet[role="dialog"]' ? panel : null),
    matches: () => false,
  };
  const controller = W.fdWire(root, { role: 'first-role', week: 1, screen: 'app', sheet: 'settings' }, {
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
    focused,
    input,
    controller,
    change(value) {
      input.value = value;
      handlers.change({ target: input });
    },
    click() {
      handlers.click({ target: input, preventDefault() {} });
    },
  };
}

test('committing a date persists it without re-rendering the panel or moving focus', () => {
  const h = examChangeHarness({});
  const before = h.panels.length;
  h.change('2026-10-30');
  assert.equal(h.storage.getItem('cw_shelf_date'), '2026-10-30', 'the date reaches its one home');
  assert.equal(h.panels.length, before,
    'no render: rebuilding the overlay would destroy the input mid-entry');
  assert.deepEqual(h.focused, [],
    'and nothing steals focus back into a control the learner is still using');
});

test('clearing the field removes the key rather than storing an empty string', () => {
  const h = examChangeHarness({ cw_shelf_date: '2026-10-30' });
  h.change('');
  assert.equal(h.storage.getItem('cw_shelf_date'), null);
});

// phase_policy.js is the repo's single sanctioned local-midnight parse site and it is the thing
// that reads this key. A value it cannot parse does not fail visibly -- it makes the date NaN and
// silently switches pacing off -- so nothing but an ISO calendar date or the empty string is
// allowed to reach storage in the first place.
test('a value that is not an ISO calendar date clears the key instead of storing junk', () => {
  const h = examChangeHarness({ cw_shelf_date: '2026-10-30' });
  h.change('banana');
  assert.equal(h.storage.getItem('cw_shelf_date'), null);
});

// The other half of "wired differently on purpose": the delegated click path must not own this
// control. It would preventDefault() the gesture that opens the native picker, and because the
// attribute is valueless in the markup it would dispatch an empty value -- so a learner clicking
// their own date input to change it would erase the date they had.
test('clicking the date input is not a controller action', () => {
  const h = examChangeHarness({ cw_shelf_date: '2026-10-30' });
  const before = h.panels.length;
  h.click();
  assert.equal(h.storage.getItem('cw_shelf_date'), '2026-10-30',
    'a click must never write; only a committed change does');
  assert.equal(h.panels.length, before, 'and it must not re-render the panel either');
});

// ---------------------------------------------------------------------------------------------
// "Renders nothing" was reasoned about the PANEL and is false of the app. Three surfaces outside
// the panel derive from this key, and every one of them went stale, because closing the sheet
// patches only overlay keys (fdCloseSheet: sheet/sheetFrom/stepsDone/nudge) -- transitionDetail
// classes all four as overlay, so surfaces.base stays false and fdRenderTransient never reassigns
// contentEl. Commit-without-render plus close-without-base-render = a learner sets 2026-10-30,
// closes the panel, and Progress still says "Not set". The retired control did not have this:
// pa==='save-exam' called fdOpenProgress() right after writing.
//
// The fix is debt, not a render: the commit marks the BASE surface stale and the next render of
// any kind absorbs it. That keeps the panel untouched, so the segment-cursor reasoning above
// still holds -- what changes is only what the next render covers.
function staleBaseHarness(seed, initial, options = {}) {
  const map = new Map(Object.entries(seed));
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  const W = makeWire(storage);
  const details = [];
  const timers = [];
  const record = (_next, detail) => details.push(detail);
  const input = {
    tagName: 'INPUT', isContentEditable: false, isConnected: true, value: '',
    closest: (selector) => (selector.indexOf('[data-fd-exam-date]') > -1 ? input : null),
    hasAttribute: (n) => n === 'data-fd-exam-date',
    getAttribute: (n) => (n === 'data-fd-exam-date' ? '' : null),
    focus() {},
  };
  const handlers = {};
  const windowHandlers = {};
  // #pgRoot is what the Progress PAGE mounts. The plan and placement sub-views mount #planRoot
  // and #ptRoot under the same openId, so this flag is the difference between "Progress is on
  // screen" and "something else the controller never heard about is".
  const root = {
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
    querySelector: (selector) => (
      selector === '#pgRoot' && options.progressPageMounted ? { id: 'pgRoot' } : null),
    matches: () => false,
  };
  const controller = W.fdWire(root, initial, {
    window: {
      addEventListener(type, fn) { windowHandlers[type] = fn; },
      removeEventListener() {},
      location: { href: 'https://example.test/', search: '', pathname: '/' },
    },
    render: record,
    renderTransient: record,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
    index: { byRef: {}, weeks: [{ n: 1, items: [] }] },
    synonyms: {},
    document: { documentElement: { getAttribute: () => 'light', setAttribute() {} } },
  });
  controller.commitStartup();
  const clickAttr = (name) => {
    const target = {
      tagName: 'BUTTON', isContentEditable: false, isConnected: true,
      closest: (s) => (s.indexOf(`[${name}]`) > -1 ? target : null),
      hasAttribute: (n) => n === name,
      getAttribute: (n) => (n === name ? '' : null),
      focus() {},
    };
    handlers.click({ target, preventDefault() {} });
  };
  return {
    details,
    storage,
    controller,
    change(value) { input.value = value; handlers.change({ target: input }); },
    closeSheet() { clickAttr('data-fd-close-sheet'); },
    fireTimers() { while (timers.length) timers.shift()(); },
    popstate() { windowHandlers.popstate({ state: null }); },
  };
}

// Surface 3: Today's subtitle. fdExamCountdown reads the key live, so the countdown is correct the
// moment the base surface is rebuilt -- and wrong until then. openId is absent here, which is the
// plain case: the close must simply cover the base.
test('closing the panel after a commit rebuilds the base surface Today is drawn on', () => {
  const h = staleBaseHarness({}, { role: 'r', week: 1, screen: 'app', sheet: 'settings' });
  h.change('2026-10-30');
  const before = h.details.length;
  h.closeSheet();
  const detail = h.details[h.details.length - 1];
  assert.ok(h.details.length > before, 'closing the sheet renders');
  assert.equal(detail.surfaces.base, true,
    'a commit that rendered nothing must leave the base surface owed a render');
  assert.equal(detail.preserveResource, false);
});

// Surfaces 1 and 2: Progress and the plan view, both mounted under openId '__progress__'.
// preserveResource exists to stop a transient render replacing a LOADED reader with
// fdBaseMarkup's "Loading…" shell -- but fdBaseMarkup renders Progress in FULL
// (fdProgressMarkup -> window.renderProgress), and fdRenderTransient's preserve branch is a pure
// no-op there, since fdPatchCompletion returns early on __progress__. Leave preserve true and the
// signpost that reads "Not set — add it in Settings" keeps saying so over a date the learner has
// just set, with the panel gone.
test('the Progress surface is rebuilt too, not preserved stale', () => {
  const h = staleBaseHarness({},
    { role: 'r', week: 1, screen: 'app', sheet: 'settings', openId: '__progress__', fromTab: 'today' },
    { progressPageMounted: true });
  h.change('2026-10-30');
  h.closeSheet();
  const detail = h.details[h.details.length - 1];
  assert.equal(detail.surfaces.base, true);
  assert.equal(detail.preserveResource, false,
    'Progress renders in full from fdBaseMarkup, so preserving it only preserves the stale copy');
});

// A reader page is the case preserveResource is FOR, and it derives nothing from this key. The
// debt must not turn a settings change into "your open page was replaced by a Loading… shell".
test('an open reader page is still preserved when the base debt is settled', () => {
  const h = staleBaseHarness({},
    { role: 'r', week: 1, screen: 'app', sheet: 'settings', openId: 'delirium.md', fromTab: 'today' });
  h.change('2026-10-30');
  h.closeSheet();
  const detail = h.details[h.details.length - 1];
  assert.equal(detail.preserveResource, true,
    'a loaded reader must never be swapped for fdBaseMarkup’s loading shell');

  // And the debt must SURVIVE that render, because it paid none of it: a preserved render never
  // reassigns contentEl, so retiring it there would be a check reporting success over a smaller
  // set than it claims. Observed through a LATER overlay-only render, which marks the base only
  // while the debt is still owed -- asserting it on the trip home proves nothing, because going
  // home patches tab and openId and so sets surfaces.base by itself either way.
  h.controller.dispatch({ 'data-fd-settings': '' });
  assert.equal(h.details[h.details.length - 1].surfaces.base, true,
    'still owed: the preserved render never touched contentEl');

  h.controller.dispatch({ 'data-fd-home': '' });
  assert.equal(h.details[h.details.length - 1].baseChanged, true,
    'leaving the reader is a base change, and that render is what finally pays the debt');

  h.controller.dispatch({ 'data-fd-settings': '' });
  assert.equal(h.details[h.details.length - 1].surfaces.base, false,
    'and once paid it is gone: an overlay-only render is overlay-only again');
});

// The debt is settled ONCE. A flag that never clears makes every later transient render rebuild
// the base for no reason -- and, worse, reads as "this always happened" to the next reader.
test('the base debt is paid once and does not persist into later renders', () => {
  const h = staleBaseHarness({}, { role: 'r', week: 1, screen: 'app', sheet: 'settings' });
  h.change('2026-10-30');
  h.closeSheet();
  h.controller.dispatch({ 'data-fd-settings': '' });
  const detail = h.details[h.details.length - 1];
  assert.equal(detail.surfaces.base, false,
    'reopening the panel touches the overlay only, as it did before the debt existed');
});

// ---------------------------------------------------------------------------------------------
// Surface 1, executed rather than asserted about: the Progress signpost's own expression, run
// with an injected LS so "stale" and "fresh" are the same code path with different storage.
test('the Progress signpost text is derived from the key at render time', () => {
  const start = shell.indexOf('window.renderProgress=function()');
  const end = shell.indexOf('function masteryByBlueprint', start);
  const lines = shell.slice(start, end > start ? end : start + 6000);
  const decl = (lines.match(/^\s*var examSet=.*$/m) || [])[0];
  const emit = (lines.match(/^\s*h\+='<div class="hm-sec"><h2>Exam date<\/h2>.*$/m) || [])[0];
  assert.ok(decl && emit, 'the signpost must stay extractable as a declaration plus an emission');

  // eslint-disable-next-line no-new-func
  const render = new Function('LS', 'esc', `var h='';${decl}\n${emit}\nreturn h;`);
  const esc = (s) => String(s);
  assert.match(render(() => '', esc), /Not set/, 'no stored date reads as unset');
  assert.doesNotMatch(render(() => '2026-10-30', esc), /Not set/,
    'a stored date must not still read as unset -- this is the sentence that lied');
  assert.match(render(() => '2026-10-30', esc), /2026-10-30/, 'it shows the date it found');
});

// Surface 2, same treatment. shelfIntensityHtml is self-contained, so its two branches can be run
// directly: the empty branch is the copy that pointed a learner at Settings, and it must stop
// claiming no date is set once one is.
test('the plan intensity copy is derived from the key, not from the plan snapshot', () => {
  // Both helpers are single-line in the shell, so they are matched line-wise. A [\s\S]*? body
  // match runs past the closing brace to the next two-space '}' and swallows half the file.
  const src = (shell.match(/^ {2}function shelfIntensityHtml\(shelf\)\{.*$/m) || [])[0];
  assert.ok(src, 'shelfIntensityHtml must stay extractable');
  // eslint-disable-next-line no-new-func
  const intensity = new Function('shelfDaysUntil', `${src}\nreturn shelfIntensityHtml;`)(
    () => 9);
  assert.match(intensity(''), /Set an exam date in/, 'the unset branch points at the setting');
  assert.match(intensity('2026-10-30'), /Exam in 9 days/, 'a set date produces pacing advice');

  // And the caller must hand it the LIVE key. cw_plan_v1.shelfDate is a snapshot taken when the
  // plan was generated; fdLoadPlan returns a matching plan verbatim, so reading the snapshot means
  // the copy never changes when the learner changes the date -- not on close, not on reopen.
  const cards = (shell.match(/^ {2}function renderPlanCards\(plan\)\{.*$/m) || [])[0];
  assert.ok(cards, 'renderPlanCards must stay extractable');
  assert.match(cards, /shelfIntensityHtml\(LS\('cw_shelf_date'\)\|\|''\)/,
    'the intensity line must read the one home, not plan.shelfDate');
});

// The one-home invariant, extended past the shell. Every earlier assertion of it looks only at
// spa_index.html, so a second writer added to any frontdoor module would pass all of them -- and
// a frontdoor module is exactly where the next task works.
test('the frontdoor modules hold exactly one writer of the exam-date key', () => {
  const dir = new URL(`${BUILD}/frontdoor/`, import.meta.url);
  const writes = [];
  for (const name of readdirSync(dir)) {
    if (!/^fd_.*\.js$/.test(name)) continue;
    const src = readFileSync(new URL(name, dir), 'utf8');
    for (const m of src.matchAll(/localStorage\.(setItem|removeItem)\('cw_shelf_date'/g)) {
      writes.push(`${name}:${m[1]}`);
    }
  }
  assert.deepEqual(writes.sort(), ['fd_state.js:removeItem', 'fd_state.js:setItem'],
    'the only writer is fdStoreExamDate; a second one is the desync this task exists to prevent');
});

// ---------------------------------------------------------------------------------------------
// Forcing preserveResource=false on openId '__progress__' discards whatever is ACTUALLY mounted
// there, and the controller does not know what that is. renderStoredPlan, startPretest,
// renderPretestForm and renderPretestResults all write contentEl.innerHTML directly from the
// shell's own delegated listener while state.openId stays '__progress__'. So: a learner opens the
// 2-minute placement from Progress, answers 7 of 10, sets an exam date in the panel, closes it --
// and the base render replaces the half-finished form with the Progress page. The only route back
// is data-pt="pretest" -> startPretest(), which resets ptAnswers={}. Seven answers gone.
//
// The predicate has to be narrower than the openId: pay the debt IN PLACE when the Progress page
// itself is mounted, and leave a directly-mounted sub-view alone. Safe because renderPlanCards now
// reads the live key, so a sub-view re-derives correctly on next entry instead of carrying the
// snapshot that made this task necessary.
test('a sub-view mounted under the Progress openId is never discarded to pay the debt', () => {
  const h = staleBaseHarness({},
    { role: 'r', week: 1, screen: 'app', sheet: 'settings', openId: '__progress__', fromTab: 'today' },
    { progressPageMounted: false });
  h.change('2026-10-30');
  h.closeSheet();
  const detail = h.details[h.details.length - 1];
  assert.equal(detail.preserveResource, true,
    'the plan and placement views are mounted here without the controller knowing; '
    + 'replacing contentEl destroys in-progress work with no way back');

  // And because that render paid nothing, the debt is still owed rather than silently retired.
  h.controller.dispatch({ 'data-fd-settings': '' });
  assert.equal(h.details[h.details.length - 1].surfaces.base, true, 'still owed');
});

// Back/Forward renders the base directly with a literal detail object, so it settles the debt in
// fact while leaving the flag claiming it is still owed. Not stale content -- a lying flag, which
// costs one redundant base rebuild on the next render and misleads the next reader.
test('a history navigation settles the base debt rather than leaving the flag lying', () => {
  const h = staleBaseHarness({}, { role: 'r', week: 1, screen: 'app', sheet: 'settings' });
  h.change('2026-10-30');
  h.popstate();
  assert.equal(h.details[h.details.length - 1].baseChanged, true, 'popstate renders the base');

  h.controller.dispatch({ 'data-fd-settings': '' });
  assert.equal(h.details[h.details.length - 1].surfaces.base, false,
    'the debt was paid by that render, so the next overlay-only render is overlay-only');
});

// The nudge timer is the one settlement site besides apply() and history that a learner can
// actually reach with a debt outstanding: closing an unread protocol schedules it for 8s
// (fdCloseSheet), which is long enough to open the gear and set a date before it fires.
test('the nudge timeout settles the base debt when it fires over an open panel', () => {
  const h = staleBaseHarness({},
    { role: 'r', week: 1, screen: 'app', sheet: 'delirium.md', done: {} });
  h.closeSheet();                       // unread protocol -> schedules the nudge timeout
  h.controller.dispatch({ 'data-fd-settings': '' });
  h.change('2026-10-30');
  const before = h.details.length;
  h.fireTimers();
  assert.ok(h.details.length > before, 'the timeout renders');
  assert.equal(h.details[h.details.length - 1].surfaces.base, true,
    'and that render is owed the base, because the commit before it rendered nothing');
});

// ---------------------------------------------------------------------------------------------
// The Your data section: a link to the export Progress already offers, and a clear that takes two
// taps. This is the one control in the panel that destroys something, so every assertion below is
// about a guard rather than about an appearance.

test('clearing is two-tap: the confirm replaces the button rather than sitting beside it', () => {
  const calm = S.fdSheetSettingsBody(withState({}));
  assert.match(calm, /data-fd-clear-ask/);
  assert.doesNotMatch(calm, /data-fd-clear-confirm/, 'no armed control before the first tap');

  const armed = S.fdSheetSettingsBody(withState({ settingsConfirmClear: true }));
  assert.match(armed, /data-fd-clear-confirm/);
  assert.doesNotMatch(armed, /data-fd-clear-ask/, 'the first button must be replaced, not kept');
  assert.match(armed, /data-fd-clear-cancel/);
});

test('the confirm names what will be destroyed', () => {
  const armed = S.fdSheetSettingsBody(withState({ settingsConfirmClear: true }));
  for (const word of ['progress', 'cards', 'answers']) {
    assert.match(armed, new RegExp(word, 'i'), `the confirm must name ${word}`);
  }
  assert.match(armed, /cannot be undone/i, 'and must say the erase is irreversible');
  // The sweep is every cw_*/rp_* key in localStorage, and the Interview Room keeps its endpoint
  // and its voice consent there. Erasing them un-configures the room: the next visit finds no
  // endpoint and opens its settings instead of a conversation. "preferences" does not predict a
  // tool the learner has to set up again, and the room ships on both sites.
  //
  // MEASURED, not assumed (2026-09-11): the passcode is NOT in this sweep and must not be named
  // here. The shipped page reads and writes it through sessionStorage and only ever REMOVES a
  // legacy localStorage copy, while fdClearDeviceData is handed localStorage -- so a confirm
  // promising the passcode goes would be describing something that does not happen.
  assert.match(armed, /Interview Room/,
    'the confirm must name the Interview Room setup this also destroys');
});

// Copy rule, for the one sentence in this panel a learner reads under pressure: it ships to both
// sites, so it may not name either audience.
test('the erase confirm stays audience-neutral', () => {
  const armed = S.fdSheetSettingsBody(withState({ settingsConfirmClear: true }));
  const warning = (armed.match(/<p class="fd-set__note fd-set__note--warn"[\s\S]*?<\/p>/) || [''])[0];
  assert.ok(warning, 'the armed warning must render for this to be checking anything');
  assert.doesNotMatch(warning, /shelf|clerkship|resident|student|MS3|UNE|MMC|Sanford/i);
});

// The calm state must not carry the warning copy. Rendering both and hiding one with CSS would
// pass every assertion above while reading the irreversible-erase sentence to a screen-reader
// user who has tapped nothing -- and would leave `data-fd-clear-confirm` one stylesheet edit from
// being live in a panel nobody armed.
test('the warning exists only in the armed state', () => {
  const calm = S.fdSheetSettingsBody(withState({}));
  assert.doesNotMatch(calm, /cannot be undone/i);
  assert.doesNotMatch(calm, /data-fd-clear-cancel/);
});

// A learner who arms the erase gets no focus move they can rely on -- the button they pressed no
// longer exists, so the panel's generic focus restore has nothing to return to. The warning is
// therefore announced by its role, not by focus landing on it.
test('the armed warning announces itself', () => {
  const armed = S.fdSheetSettingsBody(withState({ settingsConfirmClear: true }));
  assert.match(armed, /role="alert"/, 'arming a destructive control must be audible');
});

// The ORDER of the armed state is a safety property, and until now only a comment held it. The
// rationale is written down twice -- frontdoor.css's "Your data" block and fdSettingsData's own
// header -- but rationale is not a check, and either ordering could be reversed by a copy edit
// with every other assertion in this file still green.
//
// (1) The warning renders BEFORE the row. Arming REPLACES the button the learner just pressed, so
//     whatever comes first in the section lands nearest where their finger already is. What they
//     must meet there is the sentence saying this cannot be undone, not a control that does it.
// (2) "Keep my data" precedes "Erase everything" inside the row. .fd-set__row is a flex row with
//     no reordering, so source order is visual order: the reversible option is the one under the
//     fingertip, and the reflex second tap the two-tap pattern exists to prevent costs nothing.
//
// Each needle is proved present first. indexOf returns -1 for a needle that is gone, and -1 is
// less than everything, so an ordering assertion over a vanished control passes while checking
// nothing -- docs/SILENT_SHRINK_CHECKLIST.md.
test('the armed erase puts the warning first and the safe option nearest the finger', () => {
  const armed = S.fdSheetSettingsBody(withState({ settingsConfirmClear: true }));
  const at = {
    warning: armed.indexOf('fd-set__note--warn'),
    row: armed.indexOf('class="fd-set__row"'),
    keep: armed.indexOf('data-fd-clear-cancel'),
    erase: armed.indexOf('data-fd-clear-confirm'),
  };
  for (const [what, i] of Object.entries(at)) {
    assert.ok(i > -1, `the armed state must still render the ${what}; without it the ordering `
      + 'assertions below compare against -1 and pass over nothing');
  }
  assert.ok(at.warning < at.row,
    'the warning must precede the buttons: arming replaces the control the learner just pressed, '
    + 'so the first thing rendered is the thing nearest their finger');
  assert.ok(at.keep < at.erase,
    '"Keep my data" must precede "Erase everything" in the flex row, so the option under the '
    + 'fingertip that armed the confirm is the one that destroys nothing');
});

// The export control NAVIGATES to the export the Progress page already ships (data-act=
// "studyexport"); it does not export anything itself. A button labelled "Export my anonymous
// progress" with no navigation cue promises a download and delivers a page change -- the same
// over-claim the attested pill rules in fd_sheet.js exist to prevent.
test('the export control is a link to the export, not an export', () => {
  const h = S.fdSheetSettingsBody(withState({}));
  const button = (h.match(/<button[^>]*data-fd-progress[^>]*>[^<]*<\/button>/) || [''])[0];
  assert.ok(button, 'Your data must offer a route to the export');
  assert.match(button, /Export my anonymous progress/,
    'and must use the destination page’s own words for it');
  assert.match(button, /→/, 'an arrow marks it as navigation, not as the export itself');
  assert.match(shell, /data-act="studyexport"/,
    'the destination it points at must still exist on the Progress page');
});

// Section order is a contract: You -> Pacing -> Appearance -> Your data. Destructive controls sit
// last so a learner scrolling the panel meets every reversible setting before the one that is not.
test('Your data sits last, after Appearance', () => {
  const h = S.fdSheetSettingsBody(withState({ roles: ROLES, roleId: 'staff', examDate: '' }));
  const at = (title) => h.indexOf(`class="fd-set__h">${title}<`);
  for (const title of ['You', 'Pacing', 'Appearance', 'Your data']) {
    assert.ok(at(title) > -1, `${title} must render`);
  }
  assert.ok(at('Appearance') < at('Your data'), 'Your data follows Appearance');
});

// tests/fd-sheet.test.mjs runs this check over the kit, protocol and item-preview variants and
// cannot reach the settings one: its harness has no fd_shell.js, so fdSettingsSeg's fdThemeMode
// is undefined there. It lives here instead, where the harness already loads it. Both erase
// states are collected -- the armed erase is a whole subtree the calm panel never emits, so a
// calm-only sweep would report success over the smaller set.
test('only classes that exist in frontdoor.css are emitted by the settings panel', () => {
  const css = read('frontdoor/frontdoor.css');
  const seen = new Set();
  const swept = [];
  // Both erase states AND all three usage postures. Each is a subtree the others never emit, so a
  // sweep over one state reports success over a set smaller than the one it claims to check.
  for (const settingsConfirmClear of [false, true]) {
    for (const analytics of [null, { optedIn: true, privacySignal: false },
      { optedIn: false, privacySignal: true }]) {
      const html = S.fdSheet({}, {}, withState({
        sheet: 'settings', roles: ROLES, roleId: 'staff', examDate: '2026-10-30',
        settingsConfirmClear, analytics,
      }));
      swept.push(html);
      for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => seen.add(c));
    }
  }
  assert.ok(seen.has('fd-set__danger') && seen.has('fd-set__row'),
    'both erase states must have been rendered, or this sweep proves nothing');
  assert.ok(swept.some((h) => /data-fd-analytics/.test(h)),
    'and the usage control must have been rendered, or it proves nothing about that section');
  // Word-boundary match, not a substring one: ".fd-set__ro" must not pass on ".fd-set__row".
  for (const c of seen) {
    const re = new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`);
    assert.match(css, re, `class "${c}" has no rule in frontdoor.css -- an invented class gets no styling`);
  }
});

// ---------------------------------------------------------------------------------------------
// The two-tap erase and the panel's focus guarantee.
//
// fd_wire.js's refocusInvoker keeps focus on the control the learner activated by re-querying the
// REBUILT panel for the same action attribute and value. Every other control in this panel
// satisfies that premise -- a role chip, a theme segment, they all still exist after the render
// they caused. The erase pair does not: arming REPLACES "Clear everything on this device" with
// "Keep my data" / "Erase everything", so the invoker's own attribute matches nothing in the new
// DOM, refocusInvoker declines, and focus falls to <body> -- where fdTrapFocus bails and the next
// Tab walks straight out of an aria-modal dialog, behind its own backdrop. That is precisely the
// defect refocusInvoker was added to fix, reappearing on the one control in the panel that can
// destroy something.
//
// The panel here is built from the REAL renderer output rather than from a hand-kept list of
// controls, because a fake that mints the same controls whatever the state cannot tell "focus
// landed on the equivalent" apart from "there was no equivalent and the fake supplied one anyway".
// tests/fd-wire.test.mjs's PANEL_CONTROLS harness is the hand-kept one, and it is why these two
// controls are deliberately absent from that list.
function panelControls(html, generation) {
  return [...html.matchAll(/<button[^>]*>/g)].map((m) => {
    const attrs = {};
    for (const a of m[0].matchAll(/(data-fd-[a-z-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
    return {
      attrs,
      generation,
      tagName: 'BUTTON',
      disabled: false,
      hasAttribute: (n) => Object.hasOwn(attrs, n),
      getAttribute: (n) => (Object.hasOwn(attrs, n) ? attrs[n] : null),
      focus() { this.focused = true; },
    };
  });
}

function erasePanelHarness(seed = {}) {
  const map = new Map(Object.entries(seed));
  const storage = {
    get length() { return map.size; },
    key: (i) => (i >= 0 && i < map.size ? [...map.keys()][i] : null),
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
  const W = makeWire(storage);
  let generation = 0;
  let controls = [];
  const markup = [];
  const focused = [];
  // The ✕ in fdSheetHead is the first focusable of a real settings sheet, so the dialog stub
  // carries one: focusDialog's fallback lands on whatever fdFocusable returns first, and a stub
  // without it would make "focus stayed in the dialog" unfalsifiable.
  const close = {
    tagName: 'BUTTON', disabled: false, name: 'close',
    hasAttribute: () => false, getAttribute: () => null,
    focus() { focused.push('close'); },
  };
  const rebuild = (state) => {
    generation += 1;
    const html = W.fdSheetSettingsBody(state);
    markup.push(html);
    controls = panelControls(html, generation);
    for (const c of controls) c.focus = function focusControl() { focused.push(this); };
  };
  const panel = {
    querySelector(selector) {
      const m = selector.match(/^\[([a-z-]+)="(.*)"\]$/);
      if (!m) return null;
      return controls.find((c) => c.getAttribute(m[1]) === m[2]) || null;
    },
    querySelectorAll: () => [close, ...controls],
  };
  const handlers = {};
  const root = {
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
    querySelector: (s) => (s === '.fd-sheet[role="dialog"]' ? panel : null),
    matches: () => false,
  };
  const controller = W.fdWire(root, { role: 'r', week: 1, screen: 'app', sheet: 'settings' }, {
    window: {
      addEventListener() {}, removeEventListener() {},
      location: {
        href: 'https://example.test/', search: '', pathname: '/', reload() { focused.push('reload'); },
      },
    },
    render: (s) => rebuild(s),
    renderTransient: (s) => rebuild(s),
    index: { byRef: {}, weeks: [{ n: 1, items: [] }] },
    synonyms: {},
    document: { documentElement: { getAttribute: () => 'light', setAttribute() {} } },
  });
  controller.commitStartup();
  rebuild(controller.getState());
  return {
    controller, focused, markup, storage,
    click(attr) {
      const target = controls.find((c) => c.hasAttribute(attr));
      assert.ok(target, `no control carrying ${attr} is on screen`);
      target.closest = (selector) => (selector.indexOf(`[${attr}]`) > -1 ? target : null);
      handlers.click({ target, preventDefault() {} });
      return target;
    },
  };
}

test('arming and cancelling the erase never drop focus out of the open panel', () => {
  const h = erasePanelHarness();
  const ask = h.click('data-fd-clear-ask');
  assert.match(h.markup[h.markup.length - 1], /data-fd-clear-confirm/,
    'the panel must have been rebuilt into its armed state');
  assert.equal(ask.focused, undefined, 'the destroyed control must never be the thing focused');
  assert.equal(h.focused.length, 1,
    'focus must land somewhere inside the panel, not on <body> where the focus trap bails');

  const cancel = h.click('data-fd-clear-cancel');
  assert.match(h.markup[h.markup.length - 1], /data-fd-clear-ask/, 'cancelling returns the panel');
  assert.equal(cancel.focused, undefined);
  assert.equal(h.focused.length, 2, 'and the same on the way back');
});

// And the fallback is gated on there being an invoker at all. controller.dispatch() passes null,
// and the shell dispatches that way from a tool frame's postMessage -- 'openLibrary' patches no
// sheet key, so the overlay identity is unchanged and this branch is reached over a panel the
// learner never touched. Ungated, an embedded tool could yank focus into a dialog by posting a
// message.
test('a programmatic dispatch over an open panel moves no focus', () => {
  const h = erasePanelHarness();
  h.controller.dispatch({ 'data-fd-tab': 'library' });
  assert.equal(h.controller.getState().sheet, 'settings', 'the panel is still open');
  assert.deepEqual(h.focused, [], 'nothing in the panel may take focus from a postMessage');
});

// The other half: a control whose equivalent DOES survive still gets it, rather than being
// swallowed by the fallback. Theme is the standing case, and this harness renders the real panel,
// so "the equivalent exists" is a fact about the markup rather than about the fake.
test('a control that survives its own render still keeps focus, not the fallback', () => {
  const h = erasePanelHarness({ cw_theme: 'light' });
  h.click('data-fd-theme');
  assert.equal(h.focused.length, 1);
  const landed = h.focused[0];
  assert.equal(typeof landed, 'object', 'the fallback must not have fired');
  assert.equal(landed.getAttribute('data-fd-theme'), 'system',
    'the segment the learner activated is the one refocused');
});

// ---------------------------------------------------------------------------------------------
// The Usage section, and the thing that makes it unlike every other section in this panel: it is
// usually ABSENT. analytics.js ships only when CLERKSHIP_ANALYTICS named the site at build time
// and that flag defaults to off, so on every build shipped today window.cwAnalytics is undefined
// and this section renders nothing at all. A notice about collection that is not happening is
// worse than silence.
//
// When it does ship, enabled() is false for TWO different reasons -- the learner opted out, or the
// browser sent DNT/GPC -- and the panel must not conflate them. A learner excluded by a signal
// this panel did not set and cannot clear gets an explanation, never a control it cannot honour.
const COUNTED = { optedIn: true, privacySignal: false };
const NOT_COUNTED = { optedIn: false, privacySignal: false };
const SIGNALLED = { optedIn: false, privacySignal: true };

// Usage renders last, so it is the tail of the panel. Sliced from the last <section rather than
// from the heading, and then CHECKED, so a reordering fails loudly here instead of silently
// handing every assertion below some other section's copy.
function usageSection(analytics) {
  const html = S.fdSheetSettingsBody(withState({ analytics }));
  const section = html.slice(html.lastIndexOf('<section'));
  assert.match(section, /class="fd-set__h">Usage</, 'Usage must be the last section in the panel');
  return section;
}

test('no usage section when the emitter did not ship', () => {
  assert.doesNotMatch(S.fdSheetSettingsBody(withState({ analytics: null })), /data-fd-analytics/);
  const absent = S.fdSheetSettingsBody(withState({}));
  assert.doesNotMatch(absent, /data-fd-analytics/);
  assert.doesNotMatch(absent, /usage/i,
    'not even a heading: a panel that mentions collection which is not happening is worse than '
    + 'one that says nothing');
});

test('a counted device says so, and offers the way out', () => {
  const usage = usageSection(COUNTED);
  assert.match(usage, /data-fd-analytics="on"[^>]*aria-pressed="true"/);
  assert.match(usage, /data-fd-analytics="off"[^>]*aria-pressed="false"/);
});

test('an excluded device says so, and offers the way back', () => {
  const usage = usageSection(NOT_COUNTED);
  assert.match(usage, /data-fd-analytics="off"[^>]*aria-pressed="true"/);
  assert.match(usage, /data-fd-analytics="on"[^>]*aria-pressed="false"/);
});

// The same .is-active / aria-pressed agreement the other two single-choice controls in this panel
// are held to: desync them and a sighted learner sees one state filled while a screen reader
// announces the other, with nothing anywhere to notice.
test('the styled usage segment and the announced usage segment are the same one', () => {
  for (const [analytics, chosen] of [[COUNTED, 'on'], [NOT_COUNTED, 'off']]) {
    const buttons = usageSection(analytics)
      .match(/<button[^>]*data-fd-analytics="[^"]*"[^>]*>/g) || [];
    assert.equal(buttons.length, 2, `${chosen}: both segments must render`);
    const styled = buttons.filter((b) => /class="[^"]*\bis-active\b/.test(b));
    const announced = buttons.filter((b) => /aria-pressed="true"/.test(b));
    assert.equal(styled.length, 1, `${chosen}: exactly one segment is filled`);
    assert.equal(announced.length, 1, `${chosen}: exactly one segment is announced pressed`);
    assert.equal(styled[0], announced[0], `${chosen}: and it must be the same segment`);
    assert.match(styled[0], new RegExp(`data-fd-analytics="${chosen}"`),
      `${chosen}: the posture the device is actually in is the one marked`);
  }
});

// The panel's settled a11y ruling, applied to the section that ships beside the other two: three
// groups of aria-pressed buttons, never role="radio", whose roving tabindex and arrow-key
// contract nothing here implements.
test('the usage segments claim no keyboard contract they do not implement', () => {
  const usage = usageSection(COUNTED);
  assert.doesNotMatch(usage, /role="radio(?:group)?"/);
  assert.doesNotMatch(usage, /aria-checked/);
  assert.match(usage, /class="fd-seg"[^>]*role="group"/, 'the segments are a labelled group');
});

test('a browser privacy signal is explained, not rendered as a control', () => {
  const usage = usageSection(SIGNALLED);
  assert.match(usage, /browser/i, 'must say the browser is the one deciding');
  assert.doesNotMatch(usage, /data-fd-analytics=/, 'and must offer no control it cannot honour');
});

// st.analytics.optedIn is UNKNOWABLE while a signal is set: enabled() is false for both reasons
// and the emitter exposes no way to ask which. So the render must not depend on it -- identical
// output whichever value arrives, rather than a sentence about a choice the panel cannot read.
test('under a privacy signal the panel cannot leak a claim it has no way to read', () => {
  assert.equal(
    S.fdSheetSettingsBody(withState({ analytics: { optedIn: false, privacySignal: true } })),
    S.fdSheetSettingsBody(withState({ analytics: { optedIn: true, privacySignal: true } })),
  );
});

// The copy is about THIS DEVICE in every state. A single sentence describing what the counter
// collects, rendered unchanged over a device that is excluded from it, is the same defect as
// rendering the section at all on a build that ships no emitter: a true statement about the
// system, false about the reader.
test('the note states what is true of this device, in every state', () => {
  const note = (analytics) => (usageSection(analytics)
    .match(/<p class="fd-set__note">([\s\S]*?)<\/p>/) || [])[1];
  const counted = note(COUNTED);
  const excluded = note(NOT_COUNTED);
  const signalled = note(SIGNALLED);
  assert.ok(counted && excluded && signalled, 'every state carries a note');
  assert.notEqual(counted, excluded,
    'an excluded device must not read the same sentence as a counted one');
  assert.match(excluded, /not counted/i, 'an excluded device is told it is not counted');
  assert.match(signalled, /nothing is counted/i);
  for (const copy of [counted, excluded, signalled]) {
    assert.doesNotMatch(copy, /shelf|clerkship|resident|student|MS3|UNE|MMC|Sanford/i,
      'this copy ships to both sites unrebranded');
  }
});

test('Usage sits last, after Your data', () => {
  const h = S.fdSheetSettingsBody(withState({
    roles: ROLES, roleId: 'staff', examDate: '', analytics: COUNTED,
  }));
  const at = (title) => h.indexOf(`class="fd-set__h">${title}<`);
  for (const title of ['You', 'Pacing', 'Appearance', 'Your data', 'Usage']) {
    assert.ok(at(title) > -1, `${title} must render`);
  }
  assert.ok(at('Your data') < at('Usage'), 'Usage follows Your data');
});

// ---------------------------------------------------------------------------------------------
// The state half. The emitter is executed rather than faked: analytics.js owns the opt-out key's
// shape, and a fake that no-ops optOut() would let every assertion below pass over an
// implementation that stores nothing.
// eslint-disable-next-line no-new-func
const makeEmitter = new Function('window', `${read('analytics.js')}\nreturn window.cwAnalytics;`);

function mapStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() { return map.size; },
    key: (i) => (i >= 0 && i < map.size ? [...map.keys()][i] : null),
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const emitterOn = (storage, navigator) => makeEmitter({ localStorage: storage, navigator });

// fdLiveState's own assignment, extracted and run -- the same treatment the theme mode and the
// exam date get above. The renderer reads st.analytics and nothing else sets it: point this at
// the wrong global and every learner's panel loses the section, silently, on the one build where
// it was supposed to appear.
// Built lazily: extracted at module scope, a missing assignment throws while the module is still
// evaluating and takes every test below it with it -- which reports the whole section as absent
// rather than naming the one thing that is.
let resolveAnalyticsFn = null;
function resolveAnalytics(win, nav) {
  if (!resolveAnalyticsFn) {
    const start = shell.indexOf('function fdLiveState(state)');
    const end = shell.indexOf('function fdCaptureRows()', start);
    assert.ok(start > -1 && end > start, 'the live-state boundary must stay extractable');
    const line = (shell.slice(start, end).match(/^[ \t]*out\.analytics=[^;]*;$/m) || [])[0];
    assert.ok(line, 'fdLiveState must put the analytics posture on the state the renderer sees');
    // eslint-disable-next-line no-new-func
    resolveAnalyticsFn = new Function('window', 'navigator',
      `var out={};${line}\nreturn out.analytics;`);
  }
  return resolveAnalyticsFn(win, nav);
}

test('fdLiveState reports no posture at all when the emitter did not ship', () => {
  assert.equal(resolveAnalytics({}, {}), null);
  assert.doesNotMatch(S.fdSheetSettingsBody({ analytics: resolveAnalytics({}, {}) }),
    /data-fd-analytics/, 'and the state that reaches the renderer renders no section');
});

test('fdLiveState reads the posture back through the emitter that owns the key', () => {
  const storage = mapStorage();
  const emitter = emitterOn(storage, {});
  const win = { cwAnalytics: emitter };
  assert.deepEqual(resolveAnalytics(win, {}), COUNTED,
    'a device that never opted out is counted');
  emitter.optOut();
  assert.deepEqual(resolveAnalytics(win, {}), NOT_COUNTED);
  assert.equal(storage.getItem('cw_analytics_optout_v1'), '1',
    'and the emitter is what wrote the key');
  emitter.optIn();
  assert.deepEqual(resolveAnalytics(win, {}), COUNTED, 'opting back in is readable too');
});

test('fdLiveState reports a browser privacy signal from either of the signals that carry it', () => {
  for (const nav of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) {
    const win = { cwAnalytics: emitterOn(mapStorage(), nav) };
    assert.deepEqual(resolveAnalytics(win, nav), { optedIn: false, privacySignal: true },
      `${JSON.stringify(nav)} must reach the panel as a signal, not as a choice`);
    assert.match(usageSection(resolveAnalytics(win, nav)), /browser/i);
  }
  const answeredNo = { doNotTrack: '0' };
  const win = { cwAnalytics: emitterOn(mapStorage(), answeredNo) };
  assert.deepEqual(resolveAnalytics(win, answeredNo), COUNTED,
    'doNotTrack="0" is a device that answered no, not one that signalled');
});

// The key's one owner. analytics.js defines what '1' means and what absence means; a second
// writer anywhere in the front door is how the two drift, and the panel would then report a
// posture the emitter does not act on.
test('no front-door module names the opt-out key; the emitter owns its shape', () => {
  const dir = new URL(`${BUILD}/frontdoor/`, import.meta.url);
  for (const name of readdirSync(dir)) {
    if (!/^fd_.*\.js$/.test(name)) continue;
    assert.doesNotMatch(readFileSync(new URL(name, dir), 'utf8'), /cw_analytics_optout/,
      `${name} must delegate to cwAnalytics, not write the key itself`);
  }
  assert.doesNotMatch(shell, /cw_analytics_optout/,
    'the shell reads the posture through enabled(), never through the key');
  assert.match(read('analytics.js'), /cw_analytics_optout_v1/, 'the emitter is where it lives');
});

// ---------------------------------------------------------------------------------------------
// Everything above is renderer-level or state-level, and neither can see the ORDERING defect this
// section is exposed to. fd_wire.js's apply() renders BEFORE fdApplyEffect runs, and the panel is
// rebuilt from what the emitter reports at render time -- so an opt-out written in fdApplyEffect
// would paint the posture the learner just left. This is the same defect 8d585fc fixed for
// cw_theme, on the one other control in this panel whose render reads live storage.
//
// The harness runs the REAL emitter, the REAL shell expression and the REAL renderer, so "the
// panel shows what was stored" is a fact about the shipped code rather than about a fake.
function usagePanelHarness(seed = {}, nav = {}) {
  const storage = mapStorage(seed);
  const win = {
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://example.test/', search: '', pathname: '/' },
    cwAnalytics: emitterOn(storage, nav),
  };
  const W = makeWire(storage);
  let generation = 0;
  let controls = [];
  const markup = [];
  const focused = [];
  const close = {
    tagName: 'BUTTON', disabled: false, name: 'close',
    hasAttribute: () => false, getAttribute: () => null,
    focus() { focused.push('close'); },
  };
  const rebuild = (state) => {
    generation += 1;
    const html = W.fdSheetSettingsBody(Object.assign({}, state, {
      analytics: resolveAnalytics(win, nav),
    }));
    markup.push(html);
    controls = panelControls(html, generation);
    for (const c of controls) c.focus = function focusControl() { focused.push(this); };
  };
  const panel = {
    querySelector(selector) {
      const m = selector.match(/^\[([a-z-]+)="(.*)"\]$/);
      if (!m) return null;
      return controls.find((c) => c.getAttribute(m[1]) === m[2]) || null;
    },
    querySelectorAll: () => [close, ...controls],
  };
  const handlers = {};
  const root = {
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener() {},
    querySelector: (s) => (s === '.fd-sheet[role="dialog"]' ? panel : null),
    matches: () => false,
  };
  const controller = W.fdWire(root, { role: 'r', week: 1, screen: 'app', sheet: 'settings' }, {
    window: win,
    render: (s) => rebuild(s),
    renderTransient: (s) => rebuild(s),
    index: { byRef: {}, weeks: [{ n: 1, items: [] }] },
    synonyms: {},
    document: { documentElement: { getAttribute: () => 'light', setAttribute() {} } },
  });
  controller.commitStartup();
  rebuild(controller.getState());
  return {
    controller,
    storage,
    markup,
    focused,
    last: () => markup[markup.length - 1],
    click(attr, value) {
      const target = controls.find((c) => c.getAttribute(attr) === value);
      assert.ok(target, `no control carrying ${attr}="${value}" is on screen`);
      target.closest = (selector) => (selector.indexOf(`[${attr}]`) > -1 ? target : null);
      handlers.click({ target, preventDefault() {} });
      return target;
    },
  };
}

test('toggling usage rebuilds the panel from the posture just stored, not the one it replaced', () => {
  const h = usagePanelHarness();
  assert.match(h.last(), /data-fd-analytics="on"[^>]*aria-pressed="true"/,
    'a device that never opted out starts counted');

  h.click('data-fd-analytics', 'off');
  assert.equal(h.storage.getItem('cw_analytics_optout_v1'), '1',
    'the click reaches the emitter, which writes its own key');
  assert.match(h.last(), /data-fd-analytics="off"[^>]*aria-pressed="true"/,
    'the write must precede the render, exactly as the theme segment does');
  assert.doesNotMatch(h.last(), /data-fd-analytics="on"[^>]*aria-pressed="true"/,
    'the posture the learner just left must not still claim to be the current one');

  h.click('data-fd-analytics', 'on');
  assert.equal(h.storage.getItem('cw_analytics_optout_v1'), null,
    'opting back in removes the key rather than storing a second value for "no"');
  assert.match(h.last(), /data-fd-analytics="on"[^>]*aria-pressed="true"/);
});

// The panel's focus guarantee, on the control that would otherwise have lost it. A single button
// whose data value flips on→off has no equivalent in the rebuilt DOM, so refocusInvoker declines
// and focus falls back to the dialog's ✕ -- where a screen-reader user hears nothing about the
// change they just made. Two segments with stable values survive their own render, which is the
// reason this section is a pair rather than one button.
test('the usage segment the learner pressed keeps focus through its own render', () => {
  const h = usagePanelHarness();
  const pressed = h.click('data-fd-analytics', 'off');
  assert.equal(h.focused.length, 1, 'focus must land somewhere inside the panel');
  const landed = h.focused[0];
  assert.notEqual(landed, pressed, 'the destroyed element must never be the thing focused');
  assert.equal(typeof landed, 'object', 'the dialog fallback must not have fired');
  assert.equal(landed.getAttribute('data-fd-analytics'), 'off',
    'focus lands on the rebuilt equivalent of the segment activated');
  assert.equal(h.controller.getState().sheet, 'settings', 'and the panel stays open');
});

// A device the browser already excluded renders no segment at all, so there is nothing to click
// and nothing that could write the key. Pinned end to end because the renderer half alone would
// pass over a controller that honoured a dispatched attribute the panel never emits.
test('a signalled device offers nothing the click path could act on', () => {
  const h = usagePanelHarness({}, { doNotTrack: '1' });
  assert.doesNotMatch(h.last(), /data-fd-analytics=/);
  assert.match(h.last(), /browser/i);
  assert.equal(h.storage.getItem('cw_analytics_optout_v1'), null,
    'and nothing has been written on this device’s behalf');
});
