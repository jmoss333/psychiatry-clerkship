/**
 * Falsification for the frozen-colour ratchet (tests/smoke/frozen-colour.spec.js).
 *
 * The spec itself needs Playwright and a built site; this does not. Everything here is the part
 * that DECIDES — the WCAG bar, the contrast maths, and the ratchet comparison — proved in
 * milliseconds on every push, so the gate cannot go quietly vacuous between canary runs.
 *
 * The house rule (bin/check_vacuity.py) is that a guard ships with something that can fail it.
 * For a gate whose measurement only a browser can produce, that means separating the measurement
 * from the verdict and falsifying the verdict here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { compare, totals, worst, METRICS } from './smoke/frozen-ratchet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCAN_SRC = path.join(
  HERE, '..', '13_Faculty_Resources', '_automation', 'site_build', 'theme_scan.js'
);
const BASELINE = path.join(HERE, 'smoke', 'frozen_baseline.json');

/** theme_scan.js is a browser file; its pure half needs no DOM, so run it and take the exports. */
const sandbox = { globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SCAN_SRC, 'utf8'), sandbox);
const scan = sandbox.cwThemeScan;

test('theme_scan.js installs its pure half without a DOM', () => {
  assert.ok(scan, 'theme_scan.js did not define cwThemeScan');
  for (const fn of ['parse', 'luminance', 'ratio', 'barFor', 'install']) {
    assert.equal(typeof scan[fn], 'function', `cwThemeScan.${fn} is missing`);
  }
});

test('parse reads rgb() and rgba(), and reports alpha', () => {
  // Compared field-by-field, not with deepEqual: these objects are built inside the vm context,
  // so they carry that context's Object.prototype and deepStrictEqual rejects them on identity.
  const white = scan.parse('rgb(255, 255, 255)');
  assert.deepEqual([...white.c], [255, 255, 255]);
  assert.equal(white.a, 1);
  const half = scan.parse('rgba(0, 0, 0, 0.5)');
  assert.deepEqual([...half.c], [0, 0, 0]);
  assert.equal(half.a, 0.5);
  assert.equal(scan.parse('transparent'), null, 'a keyword with no numbers is not a colour here');
});

test('ratio matches the WCAG reference values', () => {
  // Black on white is the definitional 21:1; the rest are the pairs this repo actually argued over.
  assert.equal(scan.ratio([0, 0, 0], [255, 255, 255]).toFixed(2), '21.00');
  assert.equal(scan.ratio([255, 255, 255], [255, 255, 255]).toFixed(2), '1.00');
  // --primary before #617 (#c25a3c) and after (#bc573a), white ink on the fill.
  assert.equal(scan.ratio([255, 255, 255], [194, 90, 60]).toFixed(2), '4.36');
  assert.equal(scan.ratio([255, 255, 255], [188, 87, 58]).toFixed(2), '4.60');
});

test('barFor implements the large-text exception, not a blanket 4.5', () => {
  assert.equal(scan.barFor(15, 400), 4.5, 'body text');
  assert.equal(scan.barFor(24, 400), 3, '24px is large text');
  assert.equal(scan.barFor(18.66, 700), 3, '18.66px bold is large text');
  assert.equal(scan.barFor(18.66, 400), 4.5, 'the same size unbolded is not');
  assert.equal(scan.barFor(23.9, 400), 4.5, 'just under the bar is still normal text');
  // The three bare color:var(--primary) uses left in the SPA shell are 30px h1s, and this is the
  // rule that makes them legal at 4.16:1. If it ever silently became 4.5, they would fail.
  assert.equal(scan.barFor(30, 400), 3);
});

test('totals sums a raw scan into the three pinned numbers', () => {
  const raw = { frozen: { a: 2, b: 1 }, lowLight: {}, lowDark: { c: 5 } };
  assert.deepEqual(totals(raw), { frozen: 3, lowLight: 0, lowDark: 5 });
});

test('the ratchet is silent when nothing got worse', () => {
  const base = { 'index.html': { frozen: 12, lowLight: 0, lowDark: 0 } };
  const now = { 'index.html': { frozen: 12, lowLight: 0, lowDark: 0 } };
  assert.deepEqual(compare(base, now).violations, []);
});

test('the ratchet FAILS when a count rises', () => {
  const base = { 'tools/mse.html': { frozen: 0, lowLight: 0, lowDark: 0 } };
  const now = { 'tools/mse.html': { frozen: 1, lowLight: 0, lowDark: 0 } };
  const { violations } = compare(base, now);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /tools\/mse\.html: 1 .*baseline allows 0/);
});

test('the ratchet lets counts fall, and says so', () => {
  const base = { 'tools/withdrawal.html': { frozen: 11, lowLight: 11, lowDark: 0 } };
  const now = { 'tools/withdrawal.html': { frozen: 0, lowLight: 0, lowDark: 0 } };
  const { violations, improvements } = compare(base, now);
  assert.deepEqual(violations, []);
  assert.equal(improvements.length, 2);
});

test('a page absent from the baseline must be clean', () => {
  const { violations } = compare({}, { 'tools/brand-new.html': { frozen: 1, lowLight: 0, lowDark: 0 } });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /not in frozen_baseline\.json/);
  assert.deepEqual(compare({}, { 'tools/brand-new.html': { frozen: 0, lowLight: 0, lowDark: 0 } }).violations, []);
});

test('a pinned page the run never measured is a finding, not a pass', () => {
  const base = { 'tools/gone.html': { frozen: 4, lowLight: 0, lowDark: 0 } };
  assert.deepEqual(compare(base, {}).unmeasured, ['tools/gone.html']);
});

test('worst() names the biggest offenders so a failure says where to look', () => {
  const raw = { frozen: { 'a — x': 1, 'b — y': 9, 'c — z': 4 } };
  assert.deepEqual(worst(raw, 'frozen', 2), ['9x b — y', '4x c — z']);
});

test('the shipped baseline is well formed and covers both sites', () => {
  const doc = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  assert.deepEqual(Object.keys(doc.sites).sort(), ['ms3', 'res']);
  for (const [site, pages] of Object.entries(doc.sites)) {
    assert.ok(Object.keys(pages).length > 5, `${site} pins suspiciously few pages`);
    for (const [slug, counts] of Object.entries(pages)) {
      assert.deepEqual(Object.keys(counts).sort(), [...METRICS].sort(), `${site}/${slug} shape`);
      for (const m of METRICS) {
        assert.ok(Number.isInteger(counts[m]) && counts[m] >= 0, `${site}/${slug}.${m}`);
      }
    }
  }
});

test('the baseline pins index.html on both sites — the page every learner lands on', () => {
  const doc = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  for (const site of ['ms3', 'res']) {
    assert.ok(doc.sites[site]['index.html'], `${site} does not pin index.html`);
  }
});
