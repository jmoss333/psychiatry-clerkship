// The phone has one bottom-edge owner. These source contracts complement the measured
// browser checks in tests/smoke/front-door.spec.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const css = read('frontdoor/frontdoor.css');
const shell = read('spa_index.html');

function blockAt(source, marker) {
  const at = source.indexOf(marker);
  assert.ok(at !== -1, `${marker} must exist`);
  const open = source.indexOf('@media (max-width:640px){', at);
  assert.ok(open !== -1, 'phone chrome must use the existing 640px breakpoint');
  let depth = 0;
  for (let i = source.indexOf('{', open); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(open, i + 1); }
  }
  assert.fail('unterminated phone chrome block');
}

function rule(block, selector) {
  for (const m of block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].split(',').map((part) => part.trim()).includes(selector)) return m[2];
  }
  assert.fail(`missing CSS rule for ${selector}`);
}

const phone = () => blockAt(css, '/* ═══ Phone chrome');

test('one labelled five-slot dock owns the phone bottom edge', () => {
  assert.equal((shell.match(/id="fdDockMount"/g) || []).length, 1);
  assert.match(css, /\.fd-dock\{display:none\}/, 'the dock is absent from tablet and desktop layout');
  const dock = rule(phone(), '.fd-dock');
  assert.match(dock, /display:grid/);
  assert.match(dock, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(dock, /position:fixed/);
  assert.match(dock, /bottom:0/);
  assert.match(dock, /env\(safe-area-inset-bottom/);
  assert.match(dock, /z-index:/);
  assert.doesNotMatch(dock, /display:none/);
});

test('competing phone bars are hidden while tablet and desktop rules remain available', () => {
  for (const selector of ['.fd-tabs', '#fdCaptureMount', '.fd-actionbar', '.fd-actionbar__spacer']) {
    assert.match(rule(phone(), selector), /display:none/, `${selector} must not own the phone edge`);
  }
  assert.match(css, /\.fd-actionbar\{[^}]*position:fixed/);
  // 2026-10-04: the floating launcher is gone; the mount stays, empty and hidden while empty, and
  // nothing in the shell positions it over the page any more.
  assert.match(shell, /#fdCaptureMount:empty\{display:none\}/);
  assert.doesNotMatch(shell, /#fdCaptureMount\{position:fixed|fd-capture-launch--global/);
});

test('every dock item has a 44px target and a readable label, and no slot is a forwarded primary', () => {
  const block = phone(), item = rule(block, '.fd-dock__item');
  assert.match(item, /min-height:var\(--fd-target-touch\)/);
  assert.match(item, /min-width:var\(--fd-target-touch\)/);
  assert.match(item, /font-size:var\(--fd-font-/);
  assert.match(item, /height:52px/, 'fixed labels cannot outgrow the 66px dock');
  assert.match(item, /overflow:hidden/);
  assert.match(item, /-webkit-line-clamp:2/, 'keep a visible destination label within the bounded button');
  // 2026-10-04 (one-thread redesign): the dock's five slots are fixed destinations. No slot is
  // filled teal as "the primary", and no Browse disclosure floats a menu above the bar.
  assert.doesNotMatch(block, /fd-dock__item--context|data-fd-dock-forward|fd-dock__browse/);
  assert.match(rule(block, '.fd-dock__item:disabled'), /opacity:/);
  const current = rule(block, '.fd-dock__item[aria-current="page"]');
  assert.match(current, /color:var\(--fd-teal-deep\)/);
  assert.match(current, /background:var\(--fd-teal-wash\)/);
  assert.match(rule(block, '.fd-dock--four'), /repeat\(4,minmax\(0,1fr\)\)/, 'APP has no Path: four slots');
});

test('reader Back and tool toolbar remain usable when their fixed action bar retires', () => {
  const block = phone();
  assert.match(rule(block, '.fd-reader>.fd-reader__back'), /display:/);
  assert.match(rule(block, '.fd-reader__toolbar'), /display:/);
  assert.doesNotMatch(block, /\.fd-reader>\.fd-reader__back\{display:none/);
  // The one-row top bar is now the phone's header on EVERY route, not a reader-only exception.
  assert.doesNotMatch(block, /\.fd-shell:has\(\.fd-actionbar\)/);
  assert.match(rule(block, '.fd-brand'), /min-width:44px/);
});

test('the phone top bar is one row: named home target, Search, Safety, Settings; Ask lives in the dock', () => {
  const block = phone();
  assert.match(rule(block, '.fd-askbtn'), /display:none/, '"＋ Ask a question" yields to the dock\'s "＋ Ask"');
  const search = rule(block, '.fd-searchbtn');
  assert.match(search, /flex:1/);
  assert.match(search, /width:auto/);
  assert.match(search, /min-height:44px/);
  for (const match of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // The controls themselves, not their descendants (.fd-searchbtn .fd-kbd is hidden on purpose).
    if (match[1].split(',').some((part) => /^\.fd-(safetybtn|searchbtn|settingsbtn)$/.test(part.trim()))) {
      assert.doesNotMatch(match[2], /display:none|visibility:hidden/, match[1]);
    }
  }
  const name = rule(block, '.fd-brand__name');
  assert.doesNotMatch(name, /display:none/);
  assert.match(name, /position:absolute/);
  assert.match(name, /width:1px/);
  // The long search sentence is clipped the same way, never removed, so the name is unchanged.
  const long = rule(block, '.fd-searchbtn__long');
  assert.match(long, /position:absolute/);
  assert.match(long, /width:1px/);
  assert.match(rule(block, '.fd-searchbtn__short'), /display:inline/);
  assert.match(rule(block, '.fd-settingsbtn'), /width:44px/);
  assert.match(rule(block, '.fd-header__bar'), /padding:\d+px \d+px \d+px/);
  assert.doesNotMatch(block, /fd-weekpill\{|fd-carebtn/);
});

test('the phone article preserves its Compass width and the spec\'s 22px top spacing', () => {
  const block = phone();
  const main = rule(block, '.fd-main').match(/padding:(\d+)px (\d+)px /);
  assert.ok(main, 'the phone .fd-main padding is one shorthand');
  assert.equal(Number(main[1]), 22, 'one-thread page container: 22px top on a phone');
  assert.equal(Number(main[2]), 20, '20px sides (the Welcome Compass sizes its column buckets against the content width; 16 tipped its 561px bucket)');
  const padding = rule(block, '.fd-article').match(/padding:var\(--fd-space-(\d+)\) var\(--fd-space-(\d+)\)/);
  assert.ok(padding);
  assert.ok(Number(padding[1]) <= 7);
  assert.equal(Number(padding[2]), 8, '20px article sides preserve the Compass width buckets');
});

test('the last phone focus target clears the dock and reduced motion stops its transition', () => {
  const block = phone();
  assert.match(rule(block, '.fd-main'), /padding:[^;]*calc\([^}]*env\(safe-area-inset-bottom/);
  assert.match(rule(block, 'html'), /scroll-padding-bottom:calc\([^}]*env\(safe-area-inset-bottom/);
  assert.match(rule(block, '.fd-nudge'), /bottom:calc\([^}]*env\(safe-area-inset-bottom/);
  const reduced = css.slice(css.indexOf('/* ═══ Reduced motion'));
  assert.match(reduced, /\.fd-shell \*[^}]*transition:none !important/);
  assert.match(shell, /<div id="fdApp" class="fd-shell"[\s\S]*<div id="fdDockMount"><\/div>[\s\S]*<main id="content"/);
});

test('the phone block remains audience neutral and token based', () => {
  const block = phone();
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(block, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});
