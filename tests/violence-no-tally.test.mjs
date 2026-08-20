// WP-07 regression guard — the violence one-pager must not behave like a scored instrument.
//
// The page declares itself "Not a scored instrument — a teaching prompt" and then, before this
// fix, counted the checked boxes and issued a directive off the tally: zero checked returned
// "No imminent signs checked — continue routine observation and reassess." An affirmative safety
// statement derived from an empty list, on a violence-risk surface.
//
// These assertions are deliberately about ABSENCE. A future edit that reintroduces a tally will
// almost certainly reintroduce it the same way (reduce over SIGNS, then branch on the number),
// so that shape is what is pinned.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', '04_Acute_and_Safety/Violence_Risk/violence-risk-one-pager.html');
const html = readFileSync(FILE, 'utf8');

test('no affirmative safety statement can be produced by an unchecked list', () => {
  assert.doesNotMatch(html, /continue routine observation/i,
    'an unchecked list must never return a reassuring observation instruction');
  assert.doesNotMatch(html, /sign\(s\) present/i,
    'the count-derived directive must not return');
});

test('the checkbox list is not summed', () => {
  // The exact shape the defect took: a reduce over SIGNS producing a number.
  assert.doesNotMatch(html, /SIGNS\.reduce\s*\(/,
    'SIGNS must not be reduced to a tally — a count implies a threshold this list does not have');
  assert.doesNotMatch(html, /\bvar\s+count\s*=/,
    'no count variable — see the comment in App()');
});

test('the standing instruction is present and unconditional', () => {
  assert.match(html, /This list is not summed and there is no threshold/,
    'the replacement text must state plainly that there is no threshold');
  assert.match(html, /an unchecked list is not a negative result/,
    'the page must say what an empty list does NOT mean');
  // Unconditional: the box takes a fixed class, not a ternary on any state.
  assert.match(html, /className:'alertbox note'/,
    'the alert box must carry a fixed neutral class, not a state-derived one');
});

test('the state-coded alertbox variants are gone, not merely unused', () => {
  // .calm was the green "no signs checked" treatment. A ready-made success style left behind in
  // a violence-risk tool is how the removed directive gets wired back up.
  assert.doesNotMatch(html, /\.alertbox\.calm/,
    '.alertbox.calm must be deleted — it was the affirmative-safety treatment');
  assert.doesNotMatch(html, /\.alertbox\.act/,
    '.alertbox.act must be deleted with its partner; re-add deliberately if a real state needs it');
});

test('the page still declares that it is not a scored instrument', () => {
  assert.match(html, /Not a scored instrument/,
    'the disclaimer is the premise the rest of this test file enforces');
});
