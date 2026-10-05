// Library layout (one-thread redesign, Phase 2, 2026-10-04 -- spec section 2).
//
// Until Phase 2 the Everything view was a five-section multi-column flow (`columns:280px`) and
// Essentials a separate 3:1 readings/tool-rail grid. Both views now render through ONE shell:
// head, controls row (segmented control + filter), status line, then a body grid of
// section index | grouped rows | preview. This file pins the layout rules that make that grid
// behave at both breakpoints, because the renderer emits identical markup at every width and the
// stylesheet alone decides what a phone and a desktop show:
//   * below 1000px the body is one column, the index is a horizontally scrolling chip row, and
//     the preview pane and the per-row Preview controls are display:none (the preview is a
//     desktop Essentials affordance; a phone row opens the page directly);
//   * at 1000px and wider the body is `200px | minmax(0,1fr)`, or `200px | 1fr | 320px` when the
//     Essentials renderer sets .has-preview, which is also what reveals the pane and the controls;
//   * the "/" chip in the filter field is a keyboard affordance and shows only on desktop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const css = read('frontdoor/frontdoor.css');
const lib = read('frontdoor/fd_library.js');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const bare = strip(css);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rule = (selector, scope = bare) => {
  const m = scope.match(new RegExp('(?:^|[{}\\n])\\s*' + escape(selector) + '\\{([^}]*)\\}'));
  assert.ok(m, `${selector} must have a rule`);
  return m[1];
};
// The first `@media (<query>){...}` block whose body contains `needle`.
const mediaBlock = (query, needle) => {
  const re = new RegExp('@media \\(' + escape(query) + '\\)\\{((?:[^{}]|\\{[^{}]*\\})*)\\}', 'g');
  for (const m of bare.matchAll(re)) if (m[1].includes(needle)) return m[1];
  assert.fail(`no @media (${query}) block mentions ${needle}`);
};

test('the multi-column flow is gone: one body grid, one column below 1000px', () => {
  assert.doesNotMatch(bare, /\.fd-library__grid\{/, 'the five-column flow left with Phase 2');
  assert.doesNotMatch(bare, /(?:^|[{}\n])\s*\.fd-col\{/, 'and so did its .fd-col section wrapper');
  const body = rule('.fd-library__body');
  assert.match(body, /display:grid/);
  assert.match(body, /grid-template-columns:minmax\(0,1fr\)/, 'one column by default (phones)');
});

test('at 1000px the body is index | rows, and index | rows | 320px preview with .has-preview', () => {
  const desktop = mediaBlock('min-width:1000px', '.fd-library__body');
  assert.match(rule('.fd-library__body', desktop), /grid-template-columns:200px minmax\(0,1fr\)/);
  assert.match(rule('.fd-library__body.has-preview', desktop), /grid-template-columns:200px minmax\(0,1fr\) 320px/);
  assert.match(rule('.fd-library__body.has-preview .fd-kit__tool-preview', desktop), /display:block/);
  assert.match(rule('.fd-kit__tool-preview'), /display:none/, 'the pane is hidden until the desktop grid gives it a column');
});

test('the per-row Preview control exists only where the preview pane does', () => {
  assert.match(rule('.fd-kit__peek'), /display:none/);
  const desktop = mediaBlock('min-width:1000px', '.fd-kit__peek');
  assert.match(rule('.fd-library__body.has-preview .fd-kit__peek', desktop), /display:inline-flex/);
  assert.match(rule('.fd-library__body.has-preview .fd-kit__peek', desktop), /min-height:var\(--fd-target-touch\)/);
  // The renderer only emits the control for Essentials rows (the `preview` flag), never for
  // Everything rows, so a phone never carries hidden controls the view could not use anyway.
  assert.match(lib, /if\(c\.preview\)\{\s*out\+='<button type="button" class="fd-kit__peek"/);
});

test('the section index is a scrolling chip row on phones and a sidebar of rows on desktop', () => {
  const track = rule('.fd-kit__index-track');
  assert.match(track, /display:flex/); assert.match(track, /overflow-x:auto/);
  const chip = rule('.fd-kit__index-item');
  assert.match(chip, /min-height:var\(--fd-target-touch\)/, 'chips keep the 44px touch target');
  assert.match(chip, /border-radius:var\(--fd-radius-pill\)/);
  const desktop = mediaBlock('min-width:1000px', '.fd-kit__index-track');
  assert.match(rule('.fd-kit__index-track', desktop), /display:grid/);
  assert.match(rule('.fd-kit__index-item', desktop), /padding:calc\(var\(--fd-space-4\) \+ 1px\) var\(--fd-space-6\)/, '9×12 from the dimension tokens');
  assert.match(rule('.fd-kit__index-item.is-active', desktop), /background:var\(--fd-teal-wash\)/);
});

test('the "/" chip is desktop-only and the filter box is the 44px control', () => {
  assert.match(rule('.fd-library__filter-key'), /display:none/);
  const desktop = mediaBlock('min-width:1000px', '.fd-library__filter-key');
  assert.match(rule('.fd-library__filter-key', desktop), /display:inline-block/);
  const box = rule('.fd-library__filter');
  assert.match(box, /min-height:var\(--fd-target-touch\)/);
  assert.match(box, /flex:1 1 320px/);
  assert.match(lib, /<span class="fd-kbd fd-library__filter-key" aria-hidden="true">\/<\/span>/);
  assert.doesNotMatch(bare, /(?:^|[{}\n])\s*\.fd-kbd\{[^}]*display:none/, 'never the bare kbd chip (the header scopes its own .fd-searchbtn .fd-kbd rule)');
});

test('the Library has no entrance animation: the list repaints on every keystroke', () => {
  assert.match(rule('.fd-library'), /animation:none/);
});
