// Theme is two values, not one: the MODE a learner picks (system/light/dark, in cw_theme) and the
// ATTRIBUTE the page paints (light/dark). Everything that crosses a frame boundary can only carry
// the attribute, so the direction of a theme message decides whether it may be persisted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
