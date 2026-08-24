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
const fdShell = fs.readFileSync(
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'frontdoor', 'fd_shell.js'),
  'utf8',
);
const fdWire = fs.readFileSync(
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'frontdoor', 'fd_wire.js'),
  'utf8',
);
const fdSearch = fs.readFileSync(
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'frontdoor', 'fd_search.js'),
  'utf8',
);
const fdSheet = fs.readFileSync(
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'frontdoor', 'fd_sheet.js'),
  'utf8',
);
const frontdoorCss = fs.readFileSync(
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'frontdoor', 'frontdoor.css'),
  'utf8',
);
const shellCss = shell.slice(shell.indexOf('<style>'), shell.indexOf('</style>'));

function cssRuleHas(css, selector, declaration) {
  const flattened = css.replace(/@media[^{}]*\{/g, '');
  const rules = [...flattened.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return rules.some(([, selectorList, body]) => (
    selectorList.split(',').map(part => part.trim()).includes(selector)
    && body.split(';').map(part => part.trim()).includes(declaration)
  ));
}

test('one route live region stays mounted for every Front Door breakpoint', () => {
  assert.match(shell, /id="routeStatus"[^>]*aria-live="polite"/);
  assert.equal((shell.match(/id="routeStatus"/g) || []).length, 1);
  assert.doesNotMatch(shell, /#routeStatus\{display:none\}/);
});

test('route renders announce the page and move focus to #content', () => {
  assert.match(shell, /function announceRoute\(/);
  const calls = (shell.match(/announceRoute\(/g) || []).length;
  assert.ok(calls >= 3, `tab, Progress, and resource branches must announce (found ${calls})`);
  assert.match(shell, /contentEl\.focus\(\{preventScroll:true\}\)/);
});

test('Today, Path, and Library are navigation tabs with one current page', () => {
  assert.match(fdShell, /\{id:'today',label:'Today'\}/);
  assert.match(fdShell, /\{id:'path',label:'Path'\}/);
  assert.match(fdShell, /\{id:'library',label:'Library'\}/);
  assert.match(fdShell, /active\?' aria-current="page"'/);
  assert.doesNotMatch(fdShell, /id:'progress',label:'Progress'/);
});

// Review finding (WS4 batch 4): the desktop #routeStatus live region must stay hidden on
// mobile (so #mobileTitle isn't announced twice), but that override lived unpinned inside
// the shell's mobile media query. Extract the built shell's mobile block the same way the
// rest of this suite extracts markup/JS (indexOf-bounded slice on the shipped shell text,
// since spa_index.html is copied byte-for-byte into the build output) and assert the rule
// is present inside it, not just anywhere in the file.
test('the route live region remains visually hidden without leaving the accessibility tree', () => {
  assert.match(shell, /\.vh-live\{[^}]*clip-path:inset\(50%\)[^}]*\}/);
  assert.doesNotMatch(shell, /\.vh-live\{[^}]*display:none/);
});

test('the live controller restores only connected dialog invokers', () => {
  assert.doesNotMatch(shell, /function closeSheet\(/,
    'the retired tool sheet must not install a second focus manager');
  const start = fdWire.indexOf('function restoreInvoker(');
  const end = fdWire.indexOf('function previewActive(', start);
  assert.ok(start > -1 && end > start, 'controller restoreInvoker must exist');
  const body = fdWire.slice(start, end);
  assert.match(body, /el&&el\.isConnected!==false&&el\.focus/);
  assert.match(fdWire, /else if\(!afterOverlay&&beforeHadOverlay\) restoreInvoker\(\)/,
    'focus restoration occurs only on the final overlay close transition');
});

test('search and sheet are labelled modal dialogs', () => {
  assert.match(fdSearch, /class="fd-search" role="dialog" aria-modal="true" aria-label="Search"/);
  assert.match(fdSheet,
    /class="fd-sheet" role="dialog" aria-modal="true" aria-label="'\+fdEsc\(title\)\+'"/);
});

test('nested dialog keyboard order traps focus, closes search first, then restores once', () => {
  const dialogStart = fdWire.indexOf('function dialog()');
  const dialogEnd = fdWire.indexOf('function focusDialog()', dialogStart);
  const dialog = fdWire.slice(dialogStart, dialogEnd);
  assert.ok(dialog.indexOf('if(state.searchOpen)') < dialog.indexOf('if(state.sheet)'),
    'search is the topmost dialog when search and a sheet are both present');

  const keyStart = fdWire.indexOf('function keyHandler(');
  const keyEnd = fdWire.indexOf('function popstateHandler(', keyStart);
  const keyHandler = fdWire.slice(keyStart, keyEnd);
  assert.ok(keyHandler.indexOf('fdTrapFocus(event,d)') < keyHandler.indexOf("event.key==='Escape'"),
    'Tab is trapped in the active dialog before Escape handling runs');
  assert.match(fdWire, /else if\(!afterOverlay&&beforeHadOverlay\) restoreInvoker\(\)/,
    'the original invoker is restored only after the final nested overlay closes');
});

test('mobile primary and dialog controls have 44px minimum hit targets', () => {
  const start = frontdoorCss.indexOf('@media (max-width:999px)');
  const end = frontdoorCss.indexOf('/* ═══ Keyframes', start);
  assert.ok(start > -1 && end > start, 'the mobile Front Door block must exist');
  const mobile = frontdoorCss.slice(start, end);
  for (const selector of [
    '.fd-btn', '.fd-tab', '.fd-setup__back', '.fd-reader__back', '.fd-result',
    '.fd-searchpanel__esc', '.fd-sheet__back', '.fd-sheet__close',
    '.fd-nudge__go', '.fd-nudge__dismiss', '.fd-themebtn',
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(mobile, new RegExp(`${escaped}[^{}]*\\{[^}]*min-height:44px`),
      `${selector} needs a 44px mobile hit target`);
  }
  for (const selector of [
    '.fd-setup__back', '.fd-searchpanel__esc', '.fd-sheet__close',
    '.fd-nudge__dismiss', '.fd-themebtn',
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(mobile, new RegExp(`${escaped}[^{}]*\\{[^}]*min-width:44px`),
      `${selector} is icon-sized and needs a 44px mobile width`);
  }
});

function mobileFrontDoorCss() {
  const start = frontdoorCss.indexOf('@media (max-width:999px)');
  const end = frontdoorCss.indexOf('/* ═══ Keyframes', start);
  assert.ok(start > -1 && end > start, 'the mobile Front Door block must exist');
  return frontdoorCss.slice(start, end);
}

function mobileRuleHas(selector, declaration) {
  const rules = [...mobileFrontDoorCss().matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return rules.some(([, selectorList, body]) => (
    selectorList.split(',').map(part => part.trim()).includes(selector)
    && body.split(';').map(part => part.trim()).includes(declaration)
  ));
}

test('mobile collapsed search control has a 44px minimum width as well as height', () => {
  assert.equal(mobileRuleHas('.fd-searchbtn', 'min-width:44px'), true,
    'the exact collapsed search base selector needs a 44px mobile width');
});

test('mobile brand control has a 44px minimum touch height', () => {
  assert.equal(mobileRuleHas('.fd-brand', 'min-height:44px'), true,
    'the exact mobile brand selector needs a 44px minimum height');
});

test('mobile Reader back control has a 44px minimum width as well as height', () => {
  assert.equal(mobileRuleHas('.fd-actionbar .fd-btn--ghost', 'min-width:44px'), true,
    'the exact fixed Reader back base selector needs a 44px mobile width');
});

test('live Front Door Reader shares every existing wide-table mechanic', () => {
  const contracts = [
    ['.fd-article__body table', [
      'border-collapse:collapse', 'width:100%', 'margin:1em 0', 'font-size:.92rem',
    ]],
    ['.fd-article__body .table-scroll', ['position:relative', 'margin:1em 0']],
    ['.fd-article__body .table-scroll-viewport', [
      'overflow-x:auto', '-webkit-overflow-scrolling:touch', 'border:1px solid var(--border)',
      'border-radius:10px', 'background:var(--surface)',
    ]],
    ['.fd-article__body .table-scroll table', [
      'width:max-content', 'min-width:100%', 'margin:0',
    ]],
    ['.fd-article__body .table-scroll.is-scrollable .table-scroll-hint', ['display:block']],
    ['.fd-article__body .table-scroll.is-scrollable::after', [
      'content:""', 'position:absolute', 'right:1px', 'bottom:1px', 'width:28px',
      'height:calc(100% - 24px)', 'pointer-events:none',
      'background:linear-gradient(90deg,transparent,var(--surface))',
    ]],
    ['.fd-article__body .table-scroll th', ['min-width:9rem']],
    ['.fd-article__body .table-scroll td', ['min-width:9rem']],
    ['.fd-article__body .table-scroll th:first-child', ['min-width:7rem']],
    ['.fd-article__body .table-scroll td:first-child', ['min-width:7rem']],
    ['.fd-article__body th', [
      'border:1px solid var(--border)', 'padding:7px 10px', 'text-align:left',
      'vertical-align:top',
    ]],
    ['.fd-article__body td', [
      'border:1px solid var(--border)', 'padding:7px 10px', 'text-align:left',
      'vertical-align:top',
    ]],
    ['.fd-article__body th', ['background:var(--primary-light)']],
  ];
  for (const [selector, declarations] of contracts) {
    for (const declaration of declarations) {
      assert.equal(cssRuleHas(shellCss, selector, declaration), true,
        `${selector} must share ${declaration}`);
    }
  }
});

test('every .md-body .sec-* rule is also scoped to the Front Door reader body', () => {
  // fd_reader.js renders into .fd-article__body, never .md-body. A .sec-* rule scoped
  // only to .md-body is dead code on every Front Door page -- which silently disables
  // the collapse mechanism rather than merely restyling it.
  const secRules = shellCss
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('.md-body .sec-'));

  assert.ok(secRules.length >= 8, 'expected the collapsible-section rules to be present');

  for (const rule of secRules) {
    const selector = rule.slice(0, rule.indexOf('{'));
    assert.match(
      selector,
      /\.fd-article__body\s+\.sec-/,
      `collapsible rule is dead inside the Front Door reader: ${selector.trim()}`,
    );
  }
});
