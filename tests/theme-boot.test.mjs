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
