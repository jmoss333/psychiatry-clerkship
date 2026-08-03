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

// Review finding (WS4 batch 4): the desktop #routeStatus live region must stay hidden on
// mobile (so #mobileTitle isn't announced twice), but that override lived unpinned inside
// the shell's mobile media query. Extract the built shell's mobile block the same way the
// rest of this suite extracts markup/JS (indexOf-bounded slice on the shipped shell text,
// since spa_index.html is copied byte-for-byte into the build output) and assert the rule
// is present inside it, not just anywhere in the file.
test('the built shell mobile media query hides the desktop route live region', () => {
  const mobileBlockStart = shell.indexOf('.mobile-chrome{position:sticky');
  assert.ok(mobileBlockStart > -1, 'mobile chrome rule must exist to anchor the media query block');
  const mobileBlockEnd = shell.indexOf('Tool launcher badges', mobileBlockStart);
  assert.ok(mobileBlockEnd > mobileBlockStart, 'must find the end of the mobile @media block');
  const mobileBlock = shell.slice(mobileBlockStart, mobileBlockEnd);
  assert.match(mobileBlock, /#routeStatus\{display:none\}/);
});

// Review finding (WS4 batch 4, mobile sheet focus war): closeSheet() unconditionally focused
// sheetInvoker (the persistent "More" FAB) whenever it was still connected, even after a tool
// pick had already synchronously moved focus to #content via announceRoute(). Standard
// dialog-close pattern: only restore focus to the invoker if the dialog still owns focus.
// No DOM harness exists in this suite (no jsdom/vm — every other test here pins structure via
// string/regex extraction), so this pins the guard structurally rather than executing the DOM.
test('closeSheet only restores focus to the invoker when the sheet still owns focus', () => {
  const closeSheetStart = shell.indexOf('function closeSheet(');
  assert.ok(closeSheetStart > -1, 'closeSheet must exist');
  const closeSheetEnd = shell.indexOf('function clearBar(', closeSheetStart);
  assert.ok(closeSheetEnd > closeSheetStart, 'must find the end of closeSheet');
  const closeSheetBody = shell.slice(closeSheetStart, closeSheetEnd);
  assert.match(
    closeSheetBody,
    /sh\s*&&\s*sh\.contains\(document\.activeElement\)/,
    'must check whether the sheet element still contains the active element before restoring focus',
  );
  assert.doesNotMatch(
    closeSheetBody,
    /sheetInvoker&&sheetInvoker\.isConnected\)\{sheetInvoker\.setAttribute\('aria-expanded','false'\);sheetInvoker\.focus\(\);\}/,
    'must not unconditionally focus the invoker whenever it is connected',
  );
});
