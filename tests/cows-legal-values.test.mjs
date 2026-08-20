// WP-02 regression guard — COWS is a SPARSE instrument and must never offer a dense range.
//
// The defect: items carried `max:N` and the renderer looped `for(s=0; s<=i.max; s++)`, so every
// integer up to the maximum was offered. Gooseflesh, whose only legal scores are 0, 3 and 5,
// offered 0,1,2,3,4,5. A learner could record a 4 that does not exist on the instrument, and it
// counted toward a total then read against published bands.
//
// This file is the point of WP-02. The array is generated from SPEC §2.2 by
// 13_Faculty_Resources/_automation/gen_cows_from_spec.py, so nothing here can drift silently —
// but a future edit could reintroduce the dense loop or hand-edit an item back to `max:N`, and
// these assertions are what stop that.
//
// The legal-value sets below are transcribed from the WP-02 acceptance criteria, which are
// independent of the generator. If the generator and the spec ever disagree with this file, that
// disagreement is the finding — do not "fix" it by editing this list to match the tool.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', '03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html');
const html = readFileSync(FILE, 'utf8');

// Execute the generated array rather than regex-scraping it, so the assertions describe the data
// the tool actually renders from. Same trust model as tests/capacity-verdict.test.mjs: the only
// input is a git-tracked file in this repo.
function cowsItems() {
  const m = html.match(/var COWS=\[[\s\S]*?\n\];/);
  assert.ok(m, 'COWS array not found — locate it by string, not by line (handoff amendment A1)');
  const derive = 'COWS.forEach(function(i){ i.max=i.vals[i.vals.length-1].v; });';
  // eslint-disable-next-line no-new-func
  return new Function(`${m[0]}\n${derive}\nreturn COWS;`)();
}

const EXPECTED = {
  pulse: [0, 1, 2, 4],
  sweat: [0, 1, 2, 3, 4],
  rest: [0, 1, 3, 5],
  pupil: [0, 1, 2, 5],
  aches: [0, 1, 2, 4],
  nose: [0, 1, 2, 4],
  gi: [0, 1, 2, 3, 5],
  tremor: [0, 1, 2, 4],
  yawn: [0, 1, 2, 4],
  anx: [0, 1, 2, 4],
  goose: [0, 3, 5],
};

test('every COWS item offers exactly its published legal values', () => {
  const items = cowsItems();
  assert.equal(items.length, 11, 'COWS has eleven items');
  for (const item of items) {
    const expected = EXPECTED[item.k];
    assert.ok(expected, `unexpected COWS item key: ${item.k}`);
    assert.deepEqual(item.vals.map((o) => o.v), expected,
      `${item.k} (${item.b}) must offer exactly ${expected.join(',')}`);
  }
  assert.deepEqual(Object.keys(EXPECTED).sort(), items.map((i) => i.k).sort(), 'no item added or dropped');
});

test('gooseflesh — the item the dense range most obviously broke', () => {
  const goose = cowsItems().find((i) => i.k === 'goose');
  assert.deepEqual(goose.vals.map((o) => o.v), [0, 3, 5]);
  for (const illegal of [1, 2, 4]) {
    assert.ok(!goose.vals.some((o) => o.v === illegal),
      `${illegal} is not a legal gooseflesh score and must not be offerable`);
  }
});

test('every option carries its published anchor text', () => {
  for (const item of cowsItems()) {
    for (const o of item.vals) {
      assert.equal(typeof o.a, 'string');
      assert.match(o.a, /\S/, `${item.k}=${o.v} needs anchor text, not a bare integer`);
    }
  }
});

test('maximum achievable total is 48', () => {
  const total = cowsItems().reduce((sum, i) => sum + Math.max(...i.vals.map((o) => o.v)), 0);
  assert.equal(total, 48, 'the published COWS maximum');
});

test('max is derived from vals, never hand-maintained', () => {
  // A hand-written `max` that disagrees with vals is how the original defect was expressible.
  for (const item of cowsItems()) {
    assert.equal(item.max, Math.max(...item.vals.map((o) => o.v)), `${item.k}.max must equal its top rung`);
  }
  assert.match(html, /COWS\.forEach\(function\(i\)\{ i\.max=i\.vals\[i\.vals\.length-1\]\.v; \}\);/,
    'the derivation must stay in the file');
});

test('the dense render loop cannot be applied to a COWS item', () => {
  // The renderer branches on vals[]; CIWA still legitimately uses the dense path, so the loop
  // itself may exist — what must hold is that vals[] takes precedence when present.
  assert.match(html, /var opts = i\.vals/,
    'the option renderer must prefer vals[] when an item declares it');
  assert.match(html, /i\.vals\.map\(function\(o\)\{ return e\('option'/,
    'legal values must be rendered from vals[], one option per published rung');
});

test('every item declares an OBSERVED / ASKED tag', () => {
  for (const item of cowsItems()) {
    assert.match(item.tag, /^(OBSERVED|ASKED|ASKED\/OBSERVED)$/,
      `${item.k} must say whether it is observed or asked — it changes how the score is obtained`);
  }
});

test('the meter bands match info() and no longer collapse the published four', () => {
  assert.match(html, /5–12 mild/);
  assert.match(html, /13–24 mod/);
  assert.match(html, /25–36 mod-sev/);
  assert.match(html, /37–48 severe/);
  assert.doesNotMatch(html, /≥25 severe/, 'the collapsed three-band label must not return');
  assert.doesNotMatch(html, /≤12 mild/, 'the label contradicting info()’s ≤4 tier must not return');
});
