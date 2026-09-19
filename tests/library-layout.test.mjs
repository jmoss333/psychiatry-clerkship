// Library layout: sections flow into balanced columns, and the keyboard hint is keyboard-only.
//
// Measured 2026-09-18 on the desktop Library at 1024px: five sections in a 3-track CSS grid put
// "Interactive tools" (18 rows, each with a one-line hint since #686) in row one beside two
// 12–17-row sections; the row is as tall as its tallest cell, so below the first screen two
// thirds of the width was empty until the second row began ~1100px down. A multi-column flow
// balances by height instead: sections stay whole (break-inside:avoid) and fill columns top to
// bottom, so the tall section takes one column and the four shorter ones share the rest. Reading
// and Tab order are unchanged — DOM order, down each column.
//
// The head's "press / to filter" is a keyboard affordance (fd_shell.js maps `/` to the search
// overlay). A phone has no slash key and the header's search field is one tap up, so the
// fragment hides at ≤640px — as a wrapped span, because hiding .fd-kbd alone once printed
// "81 pages · press to filter" (see the note in frontdoor.css's phone header block).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const css = read('frontdoor/frontdoor.css');
const lib = read('frontdoor/fd_library.js');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

const rule = (selector) => {
  const m = strip(css).match(new RegExp('(?:^|[{}\\n])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  assert.ok(m, `${selector} must have a rule`);
  return m[1];
};

test('the Library grid is a multi-column flow, so sections balance by height instead of by row', () => {
  const grid = rule('.fd-library__grid');
  assert.match(grid, /columns:280px/, 'the same 280px measure the grid used, so column count is unchanged');
  assert.doesNotMatch(grid, /display:grid|grid-template-columns/, 'no grid rows — a row is as tall as its tallest cell');
  const col = rule('.fd-col');
  assert.match(col, /break-inside:avoid/, 'a section never splits across columns');
});

test('the slash-to-filter hint is wrapped, and hidden on phones as a whole fragment', () => {
  assert.match(lib, /<span class="fd-library__shortcut"> · press <span class="fd-kbd">\/<\/span> to filter<\/span>/);
  const m = strip(css).match(/@media \(max-width:640px\)\{[^@]*?\.fd-library__shortcut\{display:none\}/);
  assert.ok(m, '.fd-library__shortcut hides inside a (max-width:640px) block');
  assert.doesNotMatch(strip(css), /(?:^|[{}\n])\s*\.fd-kbd\{[^}]*display:none/, 'never the bare kbd chip (the header scopes its own .fd-searchbtn .fd-kbd rule)');
});
