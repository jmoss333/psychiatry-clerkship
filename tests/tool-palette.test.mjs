// Red means safety in the tools (2026-10-03). Two copies of the tools' teal --primary family
// exist on purpose: clinical-warm.css (linked tools and the shell) and common.py's
// TOOL_PALETTE_STYLE (self-themed tools, which never link that stylesheet). These pins keep the
// two identical, keep red out of --primary, and leave --danger alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BUILD = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const warm = readFileSync(new URL('clinical-warm.css', BUILD), 'utf8');
const common = readFileSync(new URL('common.py', BUILD), 'utf8');

const KEYS = ['--primary', '--primary-dark', '--primary-d', '--primary-light', '--primary-l', '--primary-ink'];
const pick = (block) => Object.fromEntries(KEYS.map((k) => {
  const m = block.match(new RegExp(`${k}:([^;}]+)`));
  return [k, m && m[1].trim()];
}));

const toolsLight = warm.match(/Tools: red means safety[\s\S]*?\*\/\s*:root\{([^}]*)\}/);
const warmDark = warm.match(/\[data-theme="dark"\]\{(--bg:#1a1816;[^}]*)\}/);
const injected = common.match(/TOOL_PALETTE_STYLE = \(([\s\S]*?)\n\)/);
const injectedText = injected ? injected[1].replace(/'\s*'/g, '').replace(/^\s*'|'\s*$/g, '') : '';

test('the tools light override exists above the dark block and carries the whole --primary family', () => {
  assert.ok(toolsLight, 'clinical-warm.css carries the tools :root override');
  assert.ok(warm.indexOf('Tools: red means safety') < warm.indexOf('[data-theme="dark"]{--bg:#1a1816;'),
    'the light override must sit above the dark block: same specificity, source order decides');
  for (const [k, v] of Object.entries(pick(toolsLight[1]))) assert.ok(v, `${k} is set`);
});

test('the self-themed tool style is value-identical to clinical-warm.css, in both themes', () => {
  assert.ok(injected, 'common.py defines TOOL_PALETTE_STYLE');
  const light = injectedText.match(/:root\{([^}]*)\}/)[1];
  const dark = injectedText.match(/\[data-theme="dark"\]\{([^}]*)\}/)[1];
  assert.deepEqual(pick(light), pick(toolsLight[1]));
  assert.deepEqual(pick(dark), pick(warmDark[1]));
  assert.ok(injectedText.indexOf(':root{') < injectedText.indexOf('[data-theme="dark"]{'),
    ':root first, so the dark rule wins in dark mode');
});

test('--primary is no longer red-adjacent, and --danger is untouched', () => {
  const OLD_REDS = /#(bc573a|a84830|d4896e|dd9277|e6a98f)\b/i;
  for (const [k, v] of Object.entries(pick(toolsLight[1]))) assert.doesNotMatch(v, OLD_REDS, k);
  for (const [k, v] of Object.entries(pick(warmDark[1]))) assert.doesNotMatch(v, OLD_REDS, k);
  assert.match(warmDark[1], /--danger:#da7c6e/, 'safety red keeps its dark value');
});

// 2026-10-03: the crisis block's left rule is the safety red in every tool, in both themes. Three
// places carry it: clinical-warm.css (linked tools and the shell), crisis_block.py's literal
// fallback (tools that link no stylesheet), and TOOL_PALETTE_STYLE (The Interview Room declares
// --cw-accent itself, so only a later rule can reach it).
test('the crisis rule is the safety red everywhere it is defined', () => {
  const light = warm.match(/:root\{[^}]*?--cw-accent:(#[0-9a-f]{6})/i);
  const darkAccent = warm.match(/\[data-theme="dark"\]\{[^}]*?--cw-accent:(#[0-9a-f]{6})/i)
    || warm.match(/--cw-surface:#2b2620;[\s\S]*?--cw-accent:(#[0-9a-f]{6})/i);
  const danger = warm.match(/--fd-danger:(#[0-9a-f]{6})/i)[1];
  const darkDanger = [...warm.matchAll(/--fd-danger:(#[0-9a-f]{6})/gi)].map((m) => m[1]).pop();
  assert.equal(light[1].toLowerCase(), danger.toLowerCase(), 'light crisis rule = --fd-danger');
  assert.equal(darkAccent[1].toLowerCase(), darkDanger.toLowerCase(), 'dark crisis rule = dark --fd-danger');
  const crisis = readFileSync(new URL('crisis_block.py', BUILD), 'utf8');
  assert.match(crisis, new RegExp(`border-left:4px solid var\\(--cw-accent,${danger}\\)`, 'i'), 'no-stylesheet fallback');
  assert.match(injectedText, new RegExp(`:root\\{[^}]*--cw-accent:${danger}`, 'i'));
  assert.match(injectedText, new RegExp(`\\[data-theme="dark"\\]\\{[^}]*--cw-accent:${darkDanger}`, 'i'));
});
