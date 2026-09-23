import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION = resolve(ROOT, '.devcontainer/receipt-status');
const { presentationFor } = require(resolve(EXTENSION, 'presentation.cjs'));
const verified = {
  state: 'verified',
  shortCommit: '1234567',
  reason: 'current-clean-pass',
  receipt: {
    completedAt: '2026-09-23T12:00:00Z',
    runtimes: { node: 'v22.20.0', python: 'Python 3.11.14', bash: 'GNU bash 5.2.37', playwright: '1.63.0' },
  },
};

test('status presentation maps verified, failed, and stale without ambiguous colors', () => {
  assert.deepEqual(presentationFor(verified), {
    text: '$(pass-filled) Dev Container 1234567',
    color: 'testing.iconPassed',
    tooltip: 'Dev Container verified for 1234567 at 2026-09-23T12:00:00Z. Runtimes: Node v22.20.0 · Python 3.11.14 · GNU bash 5.2.37 · Playwright 1.63.0. Click to verify again.',
  });
  const failed = presentationFor({ ...verified, state: 'failed', reason: 'full-gate' });
  assert.equal(failed.color, 'testing.iconFailed');
  assert.match(failed.tooltip, /full-gate.*2026-09-23T12:00:00Z/);
  assert.match(failed.tooltip, /Node v22.20.0 · Python 3.11.14 · GNU bash 5.2.37 · Playwright 1.63.0/);
  assert.equal(presentationFor({ state: 'failed', shortCommit: '1234567', reason: 'full-gate' }).color, 'testing.iconFailed');
  assert.equal(presentationFor({ state: 'stale', shortCommit: '89abcde', reason: 'commit-mismatch' }).color, 'disabledForeground');
});

test('unknown or malformed status is gray and never displays arbitrary fields', () => {
  for (const value of [
    undefined, null, [], {}, 'verified', { state: 'future' }, { state: 'verified' },
    { ...verified, receipt: { ...verified.receipt, runtimes: { node: 'v22.20.0' } } },
    { ...verified, receipt: { ...verified.receipt, runtimes: { ...verified.receipt.runtimes, node: 'v22.20.0\nPRIVATE OUTPUT' } } },
    { ...verified, state: ['verified'] },
    { ...verified, shortCommit: { toString: null } },
    { ...verified, state: 'failed', reason: 'full-gate', receipt: [] },
    { ...verified, state: 'failed', reason: 'full-gate', receipt: { completedAt: { toString: null } } },
    { ...verified, state: 'failed', reason: 'full-gate', receipt: { runtimes: [] } },
    { ...verified, state: 'failed', reason: 'full-gate', receipt: { runtimes: { node: { toString: null } } } },
  ]) {
    assert.equal(presentationFor(value).color, 'disabledForeground');
    assert.match(presentationFor(value).tooltip, /Verification status unavailable/);
  }
  const view = presentationFor({ ...verified, receipt: { ...verified.receipt, output: 'PRIVATE OUTPUT', token: 'PRIVATE TOKEN' } });
  assert.doesNotMatch(view.tooltip, /PRIVATE/);
  assert.doesNotMatch(presentationFor({ state: 'stale', shortCommit: '', reason: 'PRIVATE OUTPUT' }).tooltip, /PRIVATE/);
});

test('presentation rejects nonstring reasons before property lookup', () => {
  for (const reason of [{ toString: null }, ['commit-mismatch'], null, 42]) {
    const view = presentationFor({ state: 'stale', shortCommit: '1234567', reason });
    assert.equal(view.color, 'disabledForeground');
    assert.match(view.tooltip, /unavailable/i);
  }
});

test('local extension manifest activates only for this workspace and contributes one command', () => {
  const manifest = JSON.parse(readFileSync(resolve(EXTENSION, 'package.json'), 'utf8'));
  assert.deepEqual(manifest.activationEvents, ['workspaceContains:.devcontainer/devcontainer.json']);
  assert.equal(manifest.main, './extension.cjs');
  assert.deepEqual(manifest.contributes.commands, [{ command: 'clerkship.verifyDevContainer', title: 'Verify Dev Container' }]);
  assert.equal(manifest.devDependencies['@vscode/vsce'], '4.0.0');
});

// VS Code owns these external resources. Keep presentation and controller real;
// capture only their effects at the editor and child-process boundaries.
function editorFixture(t, execFile, options = {}) {
  const previous = process.env.CLERKSHIP_DEVCONTAINER;
  process.env.CLERKSHIP_DEVCONTAINER = options.container ?? '1';
  t.after(() => {
    if (previous === undefined) delete process.env.CLERKSHIP_DEVCONTAINER;
    else process.env.CLERKSHIP_DEVCONTAINER = previous;
  });
  t.mock.timers.enable({ apis: ['setInterval'] });
  const resources = [];
  const events = {};
  const commands = new Map();
  const executed = [];
  const disposable = () => {
    const value = { disposeCalls: 0, dispose() { this.disposeCalls++; } };
    resources.push(value);
    return value;
  };
  const event = (name) => (callback) => {
    events[name] = callback;
    return disposable();
  };
  const item = Object.assign(disposable(), { showCalls: 0, show() { this.showCalls++; } });
  let createdItems = 0;
  let watched;
  const vscode = {
    StatusBarAlignment: { Left: 1 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    window: {
      createStatusBarItem(alignment) { assert.equal(alignment, 1); createdItems++; return item; },
      onDidChangeWindowState: event('focus'),
    },
    workspace: {
      createFileSystemWatcher(pattern) {
        watched = pattern;
        return Object.assign(disposable(), { onDidCreate: event('create'), onDidChange: event('change'), onDidDelete: event('delete') });
      },
    },
    commands: {
      registerCommand(id, callback) { commands.set(id, callback); return disposable(); },
      executeCommand(...args) { executed.push(args); },
    },
  };
  const { createController } = require(resolve(EXTENSION, 'extension.cjs'));
  const controller = createController({ vscode, execFile, root: options.noRoot ? undefined : ROOT });
  if (controller) t.after(() => controller.dispose());
  return { controller, item, events, commands, executed, resources, get createdItems() { return createdItems; }, get watched() { return watched; } };
}

for (const [name, error, stdout] of [
  ['timeout', Object.assign(new Error('private timeout details'), { killed: true }), ''],
  ['nonzero exit', Object.assign(new Error('private stderr'), { code: 1 }), ''],
  ['invalid JSON', null, 'not-json'],
  ['unknown JSON state', null, '{"state":"future"}'],
  ['malformed JSON shape', null, '{"state":"verified"}'],
]) {
  test(`evaluator ${name} leaves a visible gray status and the manual task command`, (t) => {
    const f = editorFixture(t, (command, args, options, callback) => {
      assert.equal(command, 'node');
      assert.deepEqual(args, [resolve(ROOT, 'bin/devcontainer-receipt.mjs'), 'status', '--path', resolve(ROOT, 'output/devcontainer/verification-receipt.json'), '--root', ROOT]);
      assert.deepEqual(options, { timeout: 5000, maxBuffer: 65536 });
      callback(error, stdout);
    });
    assert.equal(f.item.showCalls, 1);
    assert.equal(f.item.color.id, 'disabledForeground');
    assert.match(f.item.text, /Dev Container/);
    assert.match(f.item.tooltip, /unavailable/i);
    assert.doesNotMatch(f.item.tooltip, /private|not-json|future/);
    assert.equal(f.item.command, 'clerkship.verifyDevContainer');
    f.commands.get('clerkship.verifyDevContainer')();
    assert.deepEqual(f.executed, [['workbench.action.tasks.runTask', 'Verify Dev Container']]);
  });
}

test('asynchronous malformed object reason leaves visible gray without throwing', async (t) => {
  let callback;
  const f = editorFixture(t, (_command, _args, _options, done) => { callback = done; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotThrow(() => callback(null, '{ "state":"stale", "shortCommit":"1234567", "reason": { "toString": null } }'));
  assert.equal(f.item.showCalls, 1);
  assert.equal(f.item.color.id, 'disabledForeground');
  assert.match(f.item.text, /Dev Container/);
  assert.match(f.item.tooltip, /unavailable/i);
});

test('asynchronous rendering exception falls back to gray without escaping the callback', async (t) => {
  let callback;
  const f = editorFixture(t, (_command, _args, _options, done) => { callback = done; });
  let tooltip = f.item.tooltip;
  Object.defineProperty(f.item, 'tooltip', {
    get() { return tooltip; },
    set(value) {
      if (value.includes('verified for')) throw new Error('editor rejected the presentation');
      tooltip = value;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.doesNotThrow(() => callback(null, JSON.stringify(verified)));
  assert.equal(f.item.showCalls, 1);
  assert.equal(f.item.color.id, 'disabledForeground');
  assert.match(f.item.text, /Dev Container/);
  assert.match(f.item.tooltip, /unavailable/i);
});

test('receipt events, focus and the 15-second timer reevaluate status and dispose cleanly', (t) => {
  let calls = 0;
  const f = editorFixture(t, (_command, _args, _options, callback) => {
    calls++;
    callback(null, JSON.stringify(calls === 1 ? verified : { state: 'stale', shortCommit: '1234567', reason: 'tracked-tree-changed' }));
  });
  assert.equal(f.item.color.id, 'testing.iconPassed');
  assert.equal(f.watched.base, ROOT);
  assert.equal(f.watched.pattern, 'output/devcontainer/verification-receipt.json');
  for (const name of ['create', 'change', 'delete']) f.events[name]();
  assert.equal(calls, 4);
  assert.equal(f.item.color.id, 'disabledForeground');
  f.events.focus({ focused: false });
  assert.equal(calls, 4);
  f.events.focus({ focused: true });
  assert.equal(calls, 5);
  t.mock.timers.tick(14999);
  assert.equal(calls, 5);
  t.mock.timers.tick(1);
  assert.equal(calls, 6);
  f.controller.dispose();
  t.mock.timers.tick(30000);
  f.events.change();
  assert.equal(calls, 6);
  assert.ok(f.resources.every((value) => value.disposeCalls === 1));
  assert.equal(f.item.showCalls, 1);
});

test('late evaluator responses cannot overwrite newer status or update a disposed item', (t) => {
  const callbacks = [];
  let killed = 0;
  const f = editorFixture(t, (_command, _args, _options, callback) => {
    callbacks.push(callback);
    return { kill() { killed++; } };
  });
  assert.equal(f.item.color.id, 'disabledForeground');
  f.events.change();
  callbacks[1](null, JSON.stringify({ state: 'stale', shortCommit: '1234567', reason: 'tracked-tree-changed' }));
  callbacks[0](null, JSON.stringify(verified));
  assert.equal(f.item.color.id, 'disabledForeground');
  f.events.change();
  f.controller.dispose();
  callbacks[2](null, JSON.stringify(verified));
  assert.equal(f.item.color.id, 'disabledForeground');
  assert.equal(killed, 2);
});

test('status item remains absent outside the Dev Container', (t) => {
  const outside = editorFixture(t, () => assert.fail('must not execute'), { container: '0' });
  assert.equal(outside.createdItems, 0);
});

test('status item remains absent without a workspace', (t) => {
  const noRoot = editorFixture(t, () => assert.fail('must not execute'), { noRoot: true });
  assert.equal(noRoot.createdItems, 0);
});
