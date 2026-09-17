// Phone chrome: the source-level half of the contract that the first phone screen belongs to
// the page, not the shell.
//
// Measured on 2026-09-16 on a 375×812 phone opening ?page=t_mood.md: header 154px, capture bar
// bottom 210px, article h1 top at 382px — nearly half the first screen was chrome. The 2026-08
// audit pinned the two-row header (brand name visible, search label >= 44px, five 44×44
// controls, no collisions) and this change keeps every one of those; what moves is the tab row,
// which docks to the bottom of the viewport as a tab bar on the top-level screens.
//
// A reader carries the fixed action bar instead, so there the tabs KEEP their header row: two
// fixed bars cannot share the bottom edge, and the tabs must stay reachable while reading — the
// keyboard matrix in rotation-edition-v2.spec.js switches tabs from an open reader at 390px, and
// a first version that hid them there was exactly what that run caught. The reader gives up its
// top-of-page back link and the tool toolbar instead, because the action bar's `‹` is the same
// control.
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
const TOP_LEVEL = '.fd-shell:not(:has(.fd-actionbar))';
const READER = '.fd-shell:has(.fd-actionbar)';

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

// Matches the selector only at a rule START (after `{` or `}`), never as the tail of a longer
// selector: a bare `.fd-main` lookup must not resolve to `.fd-shell:not(...) .fd-main{` just
// because that rule happens to come first — the first-textual-match trap fd-tokens.test.mjs's
// helper is known for.
function rule(block, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = block.match(new RegExp('(?:^|[{}])\\s*' + escaped + '\\{([^}]*)\\}'));
  assert.ok(m, `phone chrome block must carry a rule for ${selector}`);
  return m[1];
}

test('the tab row docks to the bottom of a phone viewport on the top-level screens', () => {
  const tabs = rule(phoneBlock(), `${TOP_LEVEL} .fd-tabs`);
  assert.match(tabs, /position:fixed/);
  assert.match(tabs, /bottom:0/);
  assert.match(tabs, /left:0/);
  assert.match(tabs, /right:0/);
  assert.match(tabs, /env\(safe-area-inset-bottom\)/, 'the bar clears the home indicator');
  assert.match(tabs, /background:var\(--fd-surface-warm\)/, 'opaque, like the action bar it mirrors');
  assert.match(tabs, /z-index:/);
});

test('a reader keeps its tab row in the header — the tabs are never hidden or docked there', () => {
  const block = phoneBlock();
  // Every .fd-tabs / .fd-tab rule in the block is scoped to the no-action-bar state. A bare
  // `.fd-tabs{` or a `:has(.fd-actionbar) .fd-tabs{` rule would either dock the tabs under the
  // action bar or remove them from a reader, and the keyboard matrix needs them reachable there.
  const tabRules = block.match(/[^{}]*\.fd-tabs?\b[^{}]*\{/g) || [];
  assert.ok(tabRules.length >= 2, `expected tab rules in the phone block, found ${tabRules.length}`);
  for (const sel of tabRules) {
    assert.ok(sel.includes(TOP_LEVEL), `tab rule must be scoped to the top-level screens: ${sel.trim()}`);
    assert.doesNotMatch(sel, /:has\(\.fd-actionbar\)\s/, `no reader-scoped tab rule: ${sel.trim()}`);
  }
  assert.doesNotMatch(block, /\.fd-tabs?\b[^{}]*\{[^}]*display:none/, 'tabs are never display:none');
});

test('the reader hides its top back link on a phone, because the action bar carries the same control', () => {
  const block = phoneBlock();
  assert.match(rule(block, `${READER} .fd-reader>.fd-reader__back`), /display:none/);
  assert.match(rule(block, `${READER} .fd-reader__toolbar`), /display:none/,
    'a tool reader keeps its back link in the toolbar; the toolbar goes with it');
  // Guarded on :has(.fd-actionbar), never on .fd-reader alone: the Progress page and the
  // not-found surface render a .fd-reader with NO action bar, and their top back link is the
  // only way back.
  assert.doesNotMatch(block, /(^|[^)])\s\.fd-reader>\.fd-reader__back\{/);
});

test('content clears the bottom bar and the reader gives its first screen to the page', () => {
  const block = phoneBlock();
  assert.match(rule(block, `${TOP_LEVEL} .fd-main`), /padding-bottom:calc\([^)]*env\(safe-area-inset-bottom\)\)/);
  assert.match(rule(block, '.fd-main'), /padding-top:(\d+)px/);
  assert.ok(Number(rule(block, '.fd-main').match(/padding-top:(\d+)px/)[1]) <= 12);
  const article = rule(block, '.fd-article');
  const pad = article.match(/padding:(\d+)px (\d+)px/);
  assert.ok(pad, `article padding must be a two-value px shorthand on phones, got: ${article}`);
  assert.ok(Number(pad[1]) <= 18, `article vertical padding tightens on phones: ${pad[0]}`);
  // The sides stay at 20px: 16px pushed the Welcome Compass from two tracks to three at a
  // 561px viewport (front-door.spec.js's width buckets) — a real layout change, not a pin.
  assert.equal(Number(pad[2]), 20, `article side padding is a Compass width contract: ${pad[0]}`);
});

test('the header bar keeps its own bottom padding once the tabs leave the flow', () => {
  assert.match(rule(phoneBlock(), `${TOP_LEVEL} .fd-header__bar`), /padding-bottom:\d+px/);
});

test('the capture launcher keeps its 44px target and loses only its top margin on a phone', () => {
  const m = shell.match(/@media\(max-width:640px\)\{#fdCaptureMount\{margin-top:(\d+)px\}\}/);
  assert.ok(m, 'spa_index.html must tighten #fdCaptureMount on phones');
  assert.ok(Number(m[1]) <= 8, `margin-top ${m[1]}px is not a tightening`);
  assert.doesNotMatch(shell, /#fdCaptureMount \.fd-capture-launch\{[^}]*min-height:(?:[0-3]\d|4[0-3])px/,
    'the launcher target must stay at least 44px');
});

test('the nudge toast lifts clear of the bottom tab bar on the top-level screens', () => {
  // .fd-nudge is bottom-anchored at 18px by default; at that offset it would sit on top of the
  // tab bar's own row of controls. The mount sits inside .fd-shell, so the scope resolves.
  assert.match(shell, /<div id="fdApp" class="fd-shell"[\s\S]*<div id="fdNudgeMount"><\/div>\s*<\/div>/,
    'the nudge mount must be a descendant of .fd-shell for the scoped rule to apply');
  const nudge = rule(phoneBlock(), `${TOP_LEVEL} .fd-nudge`);
  const m = nudge.match(/bottom:calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)/);
  assert.ok(m, `nudge must stay safe-area aware on phones, got: ${nudge}`);
  assert.ok(Number(m[1]) >= 60, `${m[1]}px does not clear a 44px-plus bar`);
});

test('the phone block is audience-neutral and token-based like the rest of the stylesheet', () => {
  const block = phoneBlock();
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex in the phone block');
  assert.doesNotMatch(block, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});
