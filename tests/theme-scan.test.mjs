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

/*
 * A transition is invisible to a forced reflow. scan() flips data-theme and reads computed style
 * in the same task, so a `transition` on colour is read at t=0, which is the OLD theme's value.
 * decision-aids.html had `body{transition:background .2s,color .2s}` and measured 55 dark-AA and
 * 20 frozen where the settled page had 34 and 6: chips kept light-theme ink on a surface that had
 * already turned dark, and legend text was scored against a body ground that was still cream.
 *
 * The fake below models only that part of a browser. An element whose `transition` covers a
 * property keeps showing the value it had until time passes, and time never passes during a
 * synchronous scan. A universal `transition:none!important` rule in <head> cancels that, which is
 * what it does in a real browser. The fake models the stylesheet's EFFECT, not how scan()
 * installs it: an id, a class, or an element in a different place would pass as long as the
 * rule is in force during the reads.
 */
const THEMES = {
  // [light, dark]. Values in the shape of decision-aids.html's palette.
  bodyBg: ['rgb(251, 248, 243)', 'rgb(28, 26, 23)'],
  bodyInk: ['rgb(59, 51, 44)', 'rgb(233, 228, 220)'],
  chipBg: ['rgb(239, 230, 218)', 'rgb(42, 38, 34)'],
  legendInk: ['rgb(107, 98, 89)', 'rgb(184, 176, 166)'],
};
const CLEAR = 'rgba(0, 0, 0, 0)';

function fakePage({ throwOnDarkRead = false } = {}) {
  const head = { children: [] };
  head.appendChild = (n) => { head.children.push(n); n.parentNode = head; return n; };
  head.removeChild = (n) => {
    head.children = head.children.filter((c) => c !== n); n.parentNode = null; return n;
  };
  const html = { tagName: 'HTML', dataset: {}, parentElement: null, className: '', id: '' };
  const theme = () => (html.dataset.theme === 'dark' ? 1 : 0);
  // A universal rule that disables transitions with !important, anywhere in <head>.
  const transitionsOff = () => head.children.some((n) => n.tagName === 'STYLE' &&
    /(^|[\s,}])\*[^{]*\{[^}]*transition\s*:\s*none\s*!important/.test(n.textContent || ''));
  Object.defineProperty(html, 'offsetHeight', { get: () => 800 });

  const el = (tagName, className, parent, rules, text) => ({
    tagName, className, id: '', parentElement: parent, rules, shown: {},
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    closest: () => null,
    getBoundingClientRect: () => ({ width: 120, height: 20 }),
  });
  // body transitions both colour properties; its children have no transition of their own.
  const body = el('BODY', '', html, {
    transition: ['background-color', 'color'],
    'background-color': () => THEMES.bodyBg[theme()], color: () => THEMES.bodyInk[theme()],
  });
  // Own surface that flips at once, ink INHERITED from the transitioning body.
  const chip = el('SPAN', 'chip', body, { 'background-color': () => THEMES.chipBg[theme()] }, 'Mild');
  // Own ink that flips at once, over a ground that is the transitioning body.
  const legend = el('SPAN', 'legend', body, { color: () => THEMES.legendInk[theme()] }, 'Legend');

  function value(node, prop) {
    if (node === html) return prop === 'background-color' ? THEMES.bodyBg[theme()] : THEMES.bodyInk[theme()];
    const own = node.rules[prop];
    const target = own ? own() : (prop === 'color' ? value(node.parentElement, 'color') : CLEAR);
    const moving = (node.rules.transition || []).includes(prop) && !transitionsOff();
    if (moving && prop in node.shown && node.shown[prop] !== target) return node.shown[prop];
    node.shown[prop] = target;
    return target;
  }
  const win = {
    getComputedStyle(node) {
      if (throwOnDarkRead && theme() === 1) throw new Error('simulated failure mid-scan');
      const props = {};
      for (const p of ['color', 'background-color']) props[p] = value(node, p);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        props[`border-${side}-color`] = props.color;
        props[`border-${side}-width`] = '0px';
      }
      props['outline-color'] = props.color;
      props['outline-width'] = '0px';
      return {
        display: 'inline', visibility: 'visible', opacity: '1', fontSize: '15px', fontWeight: '400',
        outlineStyle: 'none', color: props.color, backgroundColor: props['background-color'],
        getPropertyValue: (p) => props[p] || '',
      };
    },
  };
  const doc = {
    documentElement: html, head,
    querySelectorAll: (sel) => (sel === 'body *' ? [chip, legend] : []),
    getElementById: (id) => head.children.find((n) => n.id === id) || null,
    createElement: (tag) => ({ tagName: String(tag).toUpperCase(), id: '', textContent: '', parentNode: null }),
  };
  // The page has been open a while in light: everything has painted its light value.
  for (const n of [body, chip, legend]) { value(n, 'color'); value(n, 'background-color'); }
  return { doc, win, html, head };
}

test('the fake reproduces the blind spot: without the freeze, a transition reads stale', () => {
  // Proves the fake can say "stale" at all, so the next test passing is not a fake that never
  // transitions. This drives the model directly, not scan().
  const { doc, win, html } = fakePage();
  html.dataset.theme = 'dark';
  const [chip] = doc.querySelectorAll('body *');
  assert.equal(win.getComputedStyle(chip).color, THEMES.bodyInk[0], 'inherited ink should lag');
  assert.equal(win.getComputedStyle(chip).backgroundColor, THEMES.chipBg[1], 'own surface flips');
});

test('scan reads a transitioned colour at its settled value, not at t=0', () => {
  const { doc, win } = fakePage();
  const r = scan.install(doc, win).measure();
  assert.equal(r.scanned, 2);
  // Settled dark: chip ink #e9e4dc on #2a2622, legend #b8b0a6 on #1c1a17. Both pass AA.
  // At t=0: chip ink #3b332c on #2a2622 (1.23:1) and legend #b8b0a6 on cream (2.1:1).
  assert.deepEqual({ ...r.lowDark }, {}, 'a transition-stale value was scored as dark contrast');
  assert.deepEqual({ ...r.lowLight }, {});
  // Every painted colour here moves between the themes. At t=0 the chip's inherited ink reads
  // the same in both, so it would be reported as frozen.
  assert.deepEqual({ ...r.frozen }, {}, 'a transition-stale value was reported as frozen');
});

test('scan leaves no trace: theme restored and the freeze stylesheet removed', () => {
  const { doc, win, html, head } = fakePage();
  html.dataset.theme = 'dark';
  scan.install(doc, win).scan();
  assert.equal(html.dataset.theme, 'dark');
  assert.equal(head.children.length, 0, 'scan left a stylesheet in <head>');

  const unset = fakePage();
  scan.install(unset.doc, unset.win).scan();
  assert.equal('theme' in unset.html.dataset, false, 'a page with no data-theme must get none');
  assert.equal(unset.head.children.length, 0);
});

test('scan restores the page even when a read throws mid-scan', () => {
  const { doc, win, html, head } = fakePage({ throwOnDarkRead: true });
  html.dataset.theme = 'light';
  assert.throws(() => scan.install(doc, win).scan(), /simulated failure mid-scan/);
  assert.equal(html.dataset.theme, 'light', 'the page was left in the scan\'s dark flip');
  assert.equal(head.children.length, 0, 'a throw left transitions disabled on the page');
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
