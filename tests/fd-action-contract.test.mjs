import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const BUILD = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const frontdoor = new URL('frontdoor/', BUILD);
const wire = readFileSync(new URL('fd_wire.js', frontdoor), 'utf8');
const shell = readFileSync(new URL('spa_index.html', BUILD), 'utf8');
const common = readFileSync(new URL('common.py', BUILD), 'utf8');

// eslint-disable-next-line no-new-func
const make = new Function(`${wire}\nreturn {
  handled: FD_HANDLED_ATTRS,
  semantic: fdActionSemantic,
};`);
const F = make();
const NON_ACTION_ATTRS = new Set(['data-fd-fallback', 'data-fd-dock-source', 'data-fd-dock-label', 'data-fd-reading-resume', 'data-fd-reading-status']);
const AUX_ACTION_ATTRS = new Set(['data-fd-local-toggle']);

function emittedAttributes() {
  const found = new Set();
  for (const name of readdirSync(frontdoor)) {
    if (!/^fd_.*\.js$/.test(name) || name === 'fd_wire.js') continue;
    // Comments describe the same contract but are not emitted markup. Removing them keeps this
    // inventory mechanical while ensuring only attributes in renderer string literals count.
    const src = readFileSync(new URL(name, frontdoor), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of src.matchAll(/data-fd-[a-z-]+/g)) found.add(match[0]);
  }
  return [...found].filter((attr) => !NON_ACTION_ATTRS.has(attr)).sort();
}

test('every data-fd attribute emitted after Task 3 has one controller meaning', () => {
  const emitted = emittedAttributes();
  // This array is the EMITTED inventory -- what renderer string literals actually contain -- not
  // the controller registry. An attribute fd_wire.js handles but no renderer draws does not belong
  // here (data-fd-try-now is the standing precedent, pinned by the next test instead).
  // 'data-fd-theme' left this list when the header glyph became the settings gear and returned
  // with the settings panel's Appearance segmented control (fd_sheet.js's fdSettingsSeg), which is
  // now its only emitter.
  assert.deepEqual(emitted, [
    'data-fd-analytics', 'data-fd-app-bridge', 'data-fd-app-practice-classify',
    'data-fd-app-practice-close', 'data-fd-app-practice-open', 'data-fd-app-practice-question', 'data-fd-app-practice-reset',
    'data-fd-app-practice-reveal', 'data-fd-app-reflect', 'data-fd-app-reset',
    'data-fd-app-shift', 'data-fd-app-start', 'data-fd-back', 'data-fd-care-clear',
    'data-fd-care-intent', 'data-fd-change-week',
    'data-fd-clear-ask', 'data-fd-clear-cancel', 'data-fd-clear-confirm', 'data-fd-close-nudge',
    'data-fd-close-search', 'data-fd-close-sheet', 'data-fd-dock-forward', 'data-fd-exam-date', 'data-fd-expand-tool',
    'data-fd-home', 'data-fd-kit-section', 'data-fd-kit-tool', 'data-fd-library-view', 'data-fd-local-toggle', 'data-fd-open',
    'data-fd-progress', 'data-fd-reading-top', 'data-fd-role', 'data-fd-safety', 'data-fd-search', 'data-fd-settings',
    'data-fd-setweek', 'data-fd-step', 'data-fd-tab', 'data-fd-theme', 'data-fd-toggle',
    'data-fd-view-week', 'data-fd-week',
  ]);
  for (const attr of emitted) {
    if (AUX_ACTION_ATTRS.has(attr)) {
      assert.match(shell, /closest\('\[data-fd-local-toggle\]'\)/,
        `${attr} must be owned by the auxiliary click handler`);
      assert.match(shell, /fdEditionToggleLocalProgress\(/,
        `${attr} must call the edition-local progress toggle`);
      continue;
    }
    assert.ok(F.handled.includes(attr), `${attr} is emitted but unhandled`);
    assert.equal(typeof F.semantic(attr), 'string', `${attr} has no pinned semantic`);
    assert.notEqual(F.semantic(attr), '', `${attr} has an empty semantic`);
  }
  const controllerActions = emitted.filter((attr) => !AUX_ACTION_ATTRS.has(attr));
  assert.equal(new Set(controllerActions.map(F.semantic)).size, controllerActions.length,
    'two emitted attributes accidentally share an action meaning');
});

test('reading resume is metadata on a normal open, while Start at top is its own action', () => {
  assert.equal(F.semantic('data-fd-reading-resume'), null);
  assert.equal(F.handled.includes('data-fd-reading-resume'), false);
  assert.equal(F.semantic('data-fd-reading-top'), 'clear this reading place and focus the article heading');
});

test('the complete controller vocabulary includes planned Progress and Try-now actions', () => {
  for (const attr of ['data-fd-progress', 'data-fd-try-now']) {
    assert.ok(F.handled.includes(attr), `${attr} must be ready before the atomic shell swap`);
    assert.equal(typeof F.semantic(attr), 'string');
  }
});

test('Care navigator actions are distinct visit-only controller semantics', () => {
  assert.equal(F.semantic('data-fd-care-intent'), 'choose a transient Care navigator task');
  assert.equal(F.semantic('data-fd-care-clear'), 'clear the transient Care navigator task');
  assert.notEqual(F.semantic('data-fd-care-intent'), F.semantic('data-fd-care-clear'));
});

test('setup week and browse-only week preview are distinct semantics', () => {
  assert.equal(F.semantic('data-fd-week'), 'select setup week');
  assert.equal(F.semantic('data-fd-view-week'), 'preview path week');
  assert.notEqual(F.semantic('data-fd-week'), F.semantic('data-fd-view-week'));
});

test('fd_wire stays ES5, audience-neutral, and introduces no unnamespaced storage key', () => {
  assert.doesNotMatch(wire, /\b(?:const|let)\s|=>|`/);
  assert.doesNotMatch(wire, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
  const storageKeys = [...wire.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(['"]([^'"]+)/g)]
    .map((m) => m[1]);
  for (const key of storageKeys) assert.match(key, /^(?:cw_|rp_)/, key);
});

test('FD_WIRE is registered, injected last, and activated as the sole shell controller', () => {
  assert.equal(shell.split('/*__FD_WIRE__*/').length - 1, 1);
  assert.ok(shell.indexOf('/*__FD_WIRE__*/') > shell.indexOf('/*__FD_SHEET__*/'));
  assert.match(common, /"\/\*__FD_WIRE__\*\/"\s*:\s*"frontdoor\/fd_wire\.js"/);
  assert.doesNotMatch(shell, /fetch\('nav\.json'\)|<aside id="side">/);
  assert.equal((shell.match(/=fdWire\(/g) || []).length, 1);
  assert.match(shell, /renderTransient:fdRenderTransient/);
});

test('Library view has a distinct registered semantic', () => {
  assert.equal(F.semantic('data-fd-library-view'), 'choose Library view');
  assert.match(wire, /\[data-fd-library-view\]/);
});

test('APP actions are distinct, registered, and injected before the controller', () => {
  const actions = [
    'data-fd-app-bridge', 'data-fd-app-shift', 'data-fd-app-start',
    'data-fd-app-reflect', 'data-fd-app-reset',
  ];
  for (const attr of actions) {
    assert.ok(F.handled.includes(attr), `${attr} must be handled`);
    assert.equal(typeof F.semantic(attr), 'string', `${attr} needs a semantic`);
  }
  assert.equal(new Set(actions.map(F.semantic)).size, actions.length);
  assert.equal(shell.split('/*__FD_APP__*/').length - 1, 1);
  assert.ok(shell.indexOf('/*__FD_APP__*/') < shell.indexOf('/*__FD_WIRE__*/'));
  assert.match(common, /"\/\*__FD_APP__\*\/"\s*:\s*"frontdoor\/fd_app\.js"/);
});

test('APP practice engine is injected before APP and the controller', () => {
  const marker = '/*__FD_APP_PRACTICE__*/';
  assert.equal(shell.split(marker).length - 1, 1);
  assert.ok(shell.indexOf(marker) < shell.indexOf('/*__FD_APP__*/'));
  assert.ok(shell.indexOf(marker) < shell.indexOf('/*__FD_WIRE__*/'));
  assert.match(common, /"\/\*__FD_APP_PRACTICE__\*\/"\s*:\s*"frontdoor\/fd_app_practice\.js"/);
});

test('all six emitted APP practice actions have distinct controller meanings', () => {
  const practiceActions = [
    'data-fd-app-practice-open', 'data-fd-app-practice-reveal',
    'data-fd-app-practice-classify', 'data-fd-app-practice-question',
    'data-fd-app-practice-reset', 'data-fd-app-practice-close',
  ];
  for (const attr of practiceActions) {
    assert.ok(emittedAttributes().includes(attr), `${attr} must be emitted by the APP renderer`);
    assert.ok(F.handled.includes(attr), `${attr} must be handled`);
    assert.equal(typeof F.semantic(attr), 'string');
  }
  assert.equal(new Set(practiceActions.map(F.semantic)).size, practiceActions.length);
});
