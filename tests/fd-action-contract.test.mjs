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

function emittedAttributes() {
  const found = new Set();
  for (const name of readdirSync(frontdoor)) {
    if (!/^fd_.*\.js$/.test(name) || name === 'fd_wire.js') continue;
    // Comments describe the same contract but are not emitted markup. Removing them keeps this
    // inventory mechanical while ensuring only attributes in renderer string literals count.
    const src = readFileSync(new URL(name, frontdoor), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of src.matchAll(/data-fd-[a-z-]+/g)) found.add(match[0]);
  }
  return [...found].sort();
}

test('every data-fd attribute emitted after Task 3 has one controller meaning', () => {
  const emitted = emittedAttributes();
  assert.deepEqual(emitted, [
    'data-fd-back', 'data-fd-change-week', 'data-fd-close-nudge',
    'data-fd-close-search', 'data-fd-close-sheet', 'data-fd-expand-tool', 'data-fd-home', 'data-fd-open',
    'data-fd-progress', 'data-fd-role', 'data-fd-safety', 'data-fd-search', 'data-fd-setweek',
    'data-fd-sheet', 'data-fd-step', 'data-fd-tab', 'data-fd-theme', 'data-fd-toggle',
    'data-fd-view-week', 'data-fd-week',
  ]);
  for (const attr of emitted) {
    assert.ok(F.handled.includes(attr), `${attr} is emitted but unhandled`);
    assert.equal(typeof F.semantic(attr), 'string', `${attr} has no pinned semantic`);
    assert.notEqual(F.semantic(attr), '', `${attr} has an empty semantic`);
  }
  assert.equal(new Set(emitted.map(F.semantic)).size, emitted.length,
    'two emitted attributes accidentally share an action meaning');
});

test('the complete controller vocabulary includes planned Progress and Try-now actions', () => {
  for (const attr of ['data-fd-progress', 'data-fd-try-now']) {
    assert.ok(F.handled.includes(attr), `${attr} must be ready before the atomic shell swap`);
    assert.equal(typeof F.semantic(attr), 'string');
  }
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
