// Phone chrome: the source-level half of the contract that the first phone screen belongs to
// the page, not the shell.
//
// Measured on 2026-09-16 on a 375×812 phone opening ?page=t_mood.md: header 154px, capture bar
// bottom 210px, article h1 top at 382px — nearly half the first screen was chrome. The 2026-08
// audit pinned the two-row header (brand name visible, search label >= 44px, five 44×44
// controls, no collisions) and this change keeps every one of those; what moves is the tab row,
// which docks to the bottom of the viewport as a tab bar and yields to the reader's fixed
// action bar, whose `‹` already does what the top-of-page back link did.
//
// These assertions read the stylesheet; tests/smoke/front-door.spec.js ("phone chrome …")
// measures the rendered result. Both exist because a CSS pin cannot see a rule that a later
// rule overrides, and a smoke test cannot run before the build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const css = read('frontdoor/frontdoor.css');
const shell = read('spa_index.html');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// The phone block is introduced by its own banner comment so it can be located by intent
// rather than by being the Nth (max-width:640px) query in the file.
function phoneBlock() {
  const at = css.indexOf('/* ═══ Phone chrome');
  assert.ok(at !== -1, 'frontdoor.css must carry a "Phone chrome" banner comment');
  const open = css.indexOf('@media (max-width:640px){', at);
  assert.ok(open !== -1, 'the phone chrome block is a (max-width:640px) query');
  // Walk to the matching close brace of the media block.
  let depth = 0;
  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return strip(css.slice(open, i + 1)); }
  }
  assert.fail('unterminated phone chrome block');
}

function rule(block, selector) {
  const i = block.indexOf(selector + '{');
  assert.ok(i !== -1, `phone chrome block must carry a rule for ${selector}`);
  return block.slice(i + selector.length + 1, block.indexOf('}', i));
}

test('the tab row docks to the bottom of a phone viewport', () => {
  const tabs = rule(phoneBlock(), '.fd-tabs');
  assert.match(tabs, /position:fixed/);
  assert.match(tabs, /bottom:0/);
  assert.match(tabs, /left:0/);
  assert.match(tabs, /right:0/);
  assert.match(tabs, /env\(safe-area-inset-bottom\)/, 'the bar clears the home indicator');
  assert.match(tabs, /background:var\(--fd-surface-warm\)/, 'opaque, like the action bar it mirrors');
  assert.match(tabs, /z-index:/);
});

test('the bottom tabs yield to a reader that carries the fixed action bar', () => {
  const block = phoneBlock();
  assert.match(rule(block, '.fd-shell:has(.fd-actionbar) .fd-tabs'), /display:none/,
    'two fixed bars cannot share the bottom edge');
});

test('the reader hides its top back link on a phone, because the action bar carries the same control', () => {
  const block = phoneBlock();
  assert.match(rule(block, '.fd-shell:has(.fd-actionbar) .fd-reader>.fd-reader__back'), /display:none/);
  assert.match(rule(block, '.fd-shell:has(.fd-actionbar) .fd-reader__toolbar'), /display:none/,
    'a tool reader keeps its back link in the toolbar; the toolbar goes with it');
  // Guarded on :has(.fd-actionbar), never on .fd-reader alone: the Progress page and the
  // not-found surface render a .fd-reader with NO action bar, and their top back link is the
  // only way back.
  assert.doesNotMatch(block, /(^|[^)])\s\.fd-reader>\.fd-reader__back\{/);
});

test('content clears the bottom bar and the reader gives its first screen to the page', () => {
  const block = phoneBlock();
  assert.match(rule(block, '.fd-main'), /padding-bottom:calc\([^)]*env\(safe-area-inset-bottom\)\)/);
  const article = rule(block, '.fd-article');
  const pad = article.match(/padding:(\d+)px (\d+)px/);
  assert.ok(pad, `article padding must be a two-value px shorthand on phones, got: ${article}`);
  assert.ok(Number(pad[1]) <= 18 && Number(pad[2]) <= 16, `article padding tightens on phones: ${pad[0]}`);
});

test('the header bar keeps its own bottom padding once the tabs leave the flow', () => {
  assert.match(rule(phoneBlock(), '.fd-header__bar'), /padding-bottom:\d+px/);
});

test('the capture launcher keeps its 44px target and loses only its top margin on a phone', () => {
  const m = shell.match(/@media\(max-width:640px\)\{#fdCaptureMount\{margin-top:(\d+)px\}\}/);
  assert.ok(m, 'spa_index.html must tighten #fdCaptureMount on phones');
  assert.ok(Number(m[1]) <= 8, `margin-top ${m[1]}px is not a tightening`);
  assert.doesNotMatch(shell, /#fdCaptureMount \.fd-capture-launch\{[^}]*min-height:(?:[0-3]\d|4[0-3])px/,
    'the launcher target must stay at least 44px');
});

test('the phone block is audience-neutral and token-based like the rest of the stylesheet', () => {
  const block = phoneBlock();
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex in the phone block');
  assert.doesNotMatch(block, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});

test('the nudge toast lifts clear of the bottom tab bar on a phone', () => {
  // .fd-nudge is bottom-anchored at 18px by default; at that offset it would sit on top of the
  // tab bar's own row of controls.
  const nudge = rule(phoneBlock(), '.fd-nudge');
  const m = nudge.match(/bottom:calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)/);
  assert.ok(m, `nudge must stay safe-area aware on phones, got: ${nudge}`);
  assert.ok(Number(m[1]) >= 60, `${m[1]}px does not clear a 44px-plus bar`);
});
