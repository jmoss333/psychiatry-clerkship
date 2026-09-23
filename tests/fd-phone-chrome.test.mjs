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
  assert.match(shell, /#fdCaptureMount\{position:fixed/);
});

test('every dock item has a 44px target and a readable label', () => {
  const item = rule(phone(), '.fd-dock__item');
  assert.match(item, /min-height:var\(--fd-target-touch\)/);
  assert.match(item, /min-width:var\(--fd-target-touch\)/);
  assert.match(item, /font-size:var\(--fd-font-/);
  assert.match(item, /height:60px/, 'long reader titles cannot outgrow the reserved dock clearance');
  assert.match(item, /overflow:hidden/);
  assert.match(item, /-webkit-line-clamp:3/, 'keep a visible action label within the bounded button');
  assert.match(rule(phone(), '.fd-dock__item--context[data-fd-dock-forward]'), /transform:translateY/,
    'only a real primary action is raised');
  assert.match(rule(phone(), '.fd-dock__item:disabled'), /opacity:/);
  assert.match(rule(phone(), '.fd-dock__item[aria-current="page"]'), /color:/);
});

test('reader Back and tool toolbar remain usable when their fixed action bar retires', () => {
  const block = phone();
  assert.match(rule(block, '.fd-reader>.fd-reader__back'), /display:/);
  assert.match(rule(block, '.fd-reader__toolbar'), /display:/);
  assert.doesNotMatch(block, /\.fd-reader>\.fd-reader__back\{display:none/);
  assert.match(rule(block, '.fd-shell:has(.fd-actionbar) .fd-header__bar'), /display:flex/);
  assert.match(rule(block, '.fd-shell:has(.fd-actionbar) .fd-brand'), /min-width:44px/);
});

test('the reader keeps its compact header, named home target, Search, and Safety', () => {
  const block = phone(), reader = '.fd-shell:has(.fd-actionbar)';
  for (const selector of ['.fd-weekpill', '.fd-settingsbtn']) {
    assert.match(rule(block, `${reader} ${selector}`), /display:none/);
  }
  const search = rule(block, `${reader} .fd-searchbtn`);
  assert.match(search, /flex:1/);
  assert.match(search, /width:auto/);
  for (const match of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.fd-(safetybtn|searchbtn)\b/.test(match[1])) {
      assert.doesNotMatch(match[2], /display:none|visibility:hidden/);
    }
  }
  const name = rule(block, `${reader} .fd-brand__name`);
  assert.doesNotMatch(name, /display:none/);
  assert.match(name, /position:absolute/);
  assert.match(name, /width:1px/);
  assert.match(rule(block, '.fd-header__bar'), /padding-bottom:\d+px/);
});

test('the phone article preserves its Compass width and compact top spacing', () => {
  const block = phone();
  assert.ok(Number(rule(block, '.fd-main').match(/padding-top:(\d+)px/)[1]) <= 12);
  const padding = rule(block, '.fd-article').match(/padding:var\(--fd-space-(\d+)\) var\(--fd-space-(\d+)\)/);
  assert.ok(padding);
  assert.ok(Number(padding[1]) <= 7);
  assert.equal(Number(padding[2]), 8, '20px article sides preserve the Compass width buckets');
});

test('the last phone focus target clears the dock and reduced motion stops its transition', () => {
  const block = phone();
  assert.match(rule(block, '.fd-main'), /padding-bottom:calc\([^}]*env\(safe-area-inset-bottom/);
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
