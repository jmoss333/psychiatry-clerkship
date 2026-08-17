import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SHELL = '../13_Faculty_Resources/_automation/site_build/spa_index.html';
const src = readFileSync(new URL(SHELL, import.meta.url), 'utf8');

const ORDER = [
  '/*__PHASE_POLICY__*/', '/*__FD_STATE__*/', '/*__FD_DATA__*/', '/*__FD_TODAY__*/',
  '/*__FD_DUE__*/', '/*__FD_SHELL__*/', '/*__FD_PATH__*/', '/*__FD_LIBRARY__*/', '/*__FD_READER__*/',
  '/*__FD_SEARCH__*/', '/*__FD_SHEET__*/',
];

test('every front-door marker appears exactly once in the shell', () => {
  for (const marker of ORDER) {
    assert.equal(src.split(marker).length - 1, 1, `${marker} must appear exactly once`);
  }
});

test('front-door markers appear in dependency order', () => {
  let last = -1;
  for (const marker of ORDER) {
    const at = src.indexOf(marker);
    assert.ok(at > last, `${marker} must come after ${ORDER[ORDER.indexOf(marker) - 1] || 'the start'}`);
    last = at;
  }
});

test('the shell declares exactly one verified data needle for each payload global', () => {
  for (const name of ['FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY',
                      'FD_SITE_MANIFEST', 'FD_ROLES']) {
    assert.equal(src.split(`var ${name}=`).length - 1, 1,
      `exactly one var ${name}= declaration is required for verified replacement`);
  }
});
