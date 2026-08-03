import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = fs.readFileSync(
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'spa_index.html'),
  'utf8',
);

// Audit WS4 finding 6: the only route-change live region (#mobileTitle) sits inside
// .mobile-chrome, which is display:none on desktop — removed from the accessibility
// tree, so desktop screen-reader users get NO announcement and focus never moves.
test('a desktop route live region exists outside the mobile chrome', () => {
  assert.match(shell, /id="routeStatus"[^>]*aria-live="polite"/);
  assert.ok(
    shell.indexOf('id="routeStatus"') > shell.indexOf('id="mobileTitle"'),
    'routeStatus must sit outside .mobile-chrome (after #mobileTitle in the markup)',
  );
});

test('route renders announce the page and move focus to #content', () => {
  assert.match(shell, /function announceRoute\(/);
  const calls = (shell.match(/announceRoute\(/g) || []).length;
  assert.ok(calls >= 5, `special, tool, md, and path branches must all announce (found ${calls})`);
  assert.match(shell, /contentEl\.focus\(\{preventScroll:true\}\)/);
});

// Audit WS4 finding 8: the Path/Library segmented toggle is the last stateful shell
// control without ARIA state (mc-mode, wd-mode, markrev, themeBtn all carry aria-pressed).
test('Path/Library segmented toggle exposes aria-pressed state', () => {
  assert.match(shell, /<button id="mPath" aria-pressed="false">/);
  assert.match(shell, /<button id="mLib" aria-pressed="true">/);
  assert.match(shell, /mPath\.setAttribute\('aria-pressed','true'\)/);
  assert.match(shell, /mLib\.setAttribute\('aria-pressed','true'\)/);
});
