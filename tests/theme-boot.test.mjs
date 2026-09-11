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

function run({ stored, prefersDark }) {
  let painted = null;
  const localStorage = { getItem: (k) => (k === 'cw_theme' ? stored : null) };
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

test('a browser without matchMedia still paints something', () => {
  let painted = null;
  const localStorage = { getItem: () => null };
  const document = { documentElement: { setAttribute: (_, v) => { painted = v; } } };
  // eslint-disable-next-line no-new-func
  new Function('localStorage', 'document', 'window', boot)(localStorage, document, {});
  assert.equal(painted, 'light', 'no matchMedia must not throw or leave the page unpainted');
});
