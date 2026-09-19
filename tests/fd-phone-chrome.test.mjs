// Phone chrome: the source-level half of the contract that the first phone screen belongs to
// the page, not the shell.
//
// Measured on 2026-09-16 on a 375×812 phone opening ?page=t_mood.md: header 154px, capture bar
// bottom 210px, article h1 top at 382px — nearly half the first screen was chrome. The 2026-08
// audit pinned the two-row header (brand name visible, search label >= 44px, five 44×44
// controls, no collisions) on the TOP-LEVEL screens, and this block keeps every one of those
// there; what moves is the tab row, which docks to the bottom of the viewport as a tab bar.
//
// A READER is different (2026-09-18). It carries the fixed action bar, whose `‹` returns to the
// tab it was opened from, so the tab row, the week pill and the settings gear are all one tap
// away and the header collapses to ONE row: the ψ home tile, the search field grown to fill, and
// ✚ Safety. Measured before the change on a 375×812 phone opening ?page=suicide.md: header
// 154px (three rows), article h1 at 258px — 32% of the screen before the title. The first cut
// of the 2026-09-16 change hid the tabs on readers too and rotation-edition-v2.spec.js's
// keyboard matrix caught it, because that matrix switched tabs from an open reader at 390px;
// the matrix now presses the action bar's Back first when the tab row is hidden, which is the
// route a learner has.
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

// Finds the rule whose selector LIST contains `selector` as one member (comma-split, trimmed).
// `rule()` above matches a single selector at a rule start; a shared `a,b,c{display:none}` rule
// is invisible to it, and the reader's hidden trio is written as one rule on purpose.
function ruleIncluding(block, selector) {
  for (const m of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').map((part) => part.trim()).includes(selector)) return m[2];
  }
  assert.fail(`phone chrome block must carry a rule whose selector list includes ${selector}`);
}

test('every tab rule in the phone block is scoped to one side of the action bar, never bare', () => {
  const block = phoneBlock();
  // A bare `.fd-tabs{` would dock the tabs under a reader's action bar or hide them on Today.
  const tabRules = block.match(/[^{}]*\.fd-tabs?\b[^{}]*\{/g) || [];
  assert.ok(tabRules.length >= 3, `expected tab rules in the phone block, found ${tabRules.length}`);
  for (const sel of tabRules) {
    const parts = sel.split(',').map((part) => part.trim()).filter((part) => /\.fd-tabs?\b/.test(part));
    for (const part of parts) {
      assert.ok(part.includes(TOP_LEVEL) || part.includes(READER),
        `tab rule must be scoped to the top-level screens or to a reader: ${part}`);
    }
  }
});

test('a reader collapses its header to one row on a phone: tabs, week pill and settings leave', () => {
  const block = phoneBlock();
  for (const sel of ['.fd-tabs', '.fd-weekpill', '.fd-settingsbtn']) {
    assert.match(ruleIncluding(block, `${READER} ${sel}`), /display:none/,
      `${sel} is one Back-tap away on a reader and leaves the header`);
  }
  assert.match(ruleIncluding(block, `${READER} .fd-header__bar`), /display:flex/,
    'the two-row grid returns to a single flex row');
  assert.match(ruleIncluding(block, `${READER} .fd-header__bar`), /padding-bottom:\d+px/,
    'the bar keeps its own bottom padding once the tab row is gone');
  const search = ruleIncluding(block, `${READER} .fd-searchbtn`);
  assert.match(search, /flex:1/, 'the search field grows into the room the utilities left');
  assert.match(search, /width:auto/, 'the 96px phone width is released');
});

test('a reader keeps safety and search in the header, and the home tile keeps its name and its target', () => {
  const block = phoneBlock();
  // Nothing in the block may hide the crisis affordance or the search field, on either side.
  for (const m of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.fd-(safetybtn|searchbtn)\b/.test(m[1])) {
      assert.doesNotMatch(m[2], /display:none|visibility:hidden/, `never hidden: ${m[1].trim()}`);
    }
  }
  const name = ruleIncluding(block, `${READER} .fd-brand__name`);
  assert.doesNotMatch(name, /display:none/, 'the brand name is the home button\'s accessible name');
  assert.match(name, /position:absolute/);
  assert.match(name, /width:1px/, 'visually hidden, not removed');
  assert.match(ruleIncluding(block, `${READER} .fd-brand`), /min-width:44px/,
    'a bare 30px tile is not a touch target');
});

test('the reader hides its top back link on a phone, because the action bar carries the same control', () => {
  const block = phoneBlock();
  assert.match(rule(block, `${READER} .fd-reader>.fd-reader__back`), /display:none/);
  assert.match(rule(block, `${READER} .fd-reader__toolbar`), /display:none/,
    'a tool reader keeps its back link in the toolbar; the toolbar goes with it');
  assert.match(rule(block, `${READER} .fd-reader__toolbar:has(.fd-guide-return)`), /display:flex/,
    'the toolbar comes back when it carries the Return to guide control -- the action bar cannot restore a guide bookmark');
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
  // Dimension tokens, not px: bin/check_design_drift.py ratchets raw padding/margin/gap
  // declarations in this stylesheet (it caught the first cut at 196 -> 199). The scale is
  // --fd-space-1..10 = 2,4,6,8,10,12,16,20,24,28px, so vertical <= space-7 (16px) and the sides
  // exactly space-8 (20px): 16px sides pushed the Welcome Compass from two tracks to three at a
  // 561px viewport (front-door.spec.js's width buckets) — a real layout change, not a pin.
  const pad = article.match(/padding:var\(--fd-space-(\d+)\) var\(--fd-space-(\d+)\)/);
  assert.ok(pad, `article padding must be a two-token shorthand on phones, got: ${article}`);
  assert.ok(Number(pad[1]) <= 7, `article vertical padding tightens on phones: ${pad[0]}`);
  assert.equal(Number(pad[2]), 8, `article side padding is a Compass width contract: ${pad[0]}`);
});

test('the header bar keeps its own bottom padding once the tabs leave the flow', () => {
  assert.match(rule(phoneBlock(), `${TOP_LEVEL} .fd-header__bar`), /padding-bottom:\d+px/);
});

test('the capture launcher keeps its 44px target and loses only its top margin on a phone', () => {
  const m = shell.match(/@media\(max-width:640px\)\{#fdCaptureMount\{margin-top:(\d+)(?:px)?\}\}/);
  assert.ok(m, 'spa_index.html must tighten #fdCaptureMount on phones');
  assert.ok(Number(m[1]) <= 8, `margin-top ${m[1]} is not a tightening`);
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
