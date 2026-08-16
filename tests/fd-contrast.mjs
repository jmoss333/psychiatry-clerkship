// Front-door palette contrast gate -- DERIVED FROM THE SHIPPED FILE, not from literals.
//
// Sibling of contrast-check.mjs and deliberately separate from it: that file locks the LIGHT
// SPA palette parsed out of spa_index.html, and its pairs are unrelated to these. Registering
// --fd-* pairs there would also have made it fail immediately, because the light front-door
// palette is transcribed verbatim from a normative design that does not itself clear AA
// everywhere (see LIGHT_DEBT below).
//
// Both palettes are parsed out of clinical-warm.css, so editing a token value here is what the
// test reads -- it cannot pass by asserting constants against constants.
//
// Two contracts:
//   1. DARK -- every painted pair must clear 4.5:1 (text) or 3:1 (non-text). This half of the
//      palette was authored here, so it is held to the standard with no exceptions.
//   2. LIGHT -- same thresholds, minus an explicit allowlist of the debt inherited from the
//      design prototype. A NEW light failure fails the run; the known ones are pinned by name
//      so they cannot quietly multiply.
//
// Run: node tests/fd-contrast.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.join(__dirname, '..', '13_Faculty_Resources/_automation/site_build/clinical-warm.css');
const css = readFileSync(CSS_PATH, 'utf8');

function rel(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) {
  const a = rel(fg), b = rel(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// Comments are stripped so the file header's prose cannot be mistaken for a selector.
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

function palette(selector) {
  const i = stripped.indexOf(selector);
  if (i === -1) throw new Error(`no ${selector} block in clinical-warm.css`);
  const body = stripped.slice(stripped.indexOf('{', i), stripped.indexOf('}', stripped.indexOf('{', i)));
  const out = {};
  for (const m of body.matchAll(/--(fd-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

const LIGHT = palette(':root');
const DARK = palette('[data-theme="dark"]');

// Every pair the prototype actually paints: [foreground, background, minimum].
// 4.5 = normal-size text (nothing in the design reaches WCAG "large": 18.66px bold / 24px).
// 3   = non-text contrast (borders that carry meaning, dots, the progress ring).
const SURFACES = ['fd-bg', 'fd-surface', 'fd-surface-warm', 'fd-selected', 'fd-chip', 'fd-callout'];
const PAIRS = [
  ...['fd-text', 'fd-text-mid', 'fd-text-dim'].flatMap((t) => SURFACES.map((b) => [t, b, 4.5])),
  ['fd-terracotta', 'fd-bg', 4.5], ['fd-terracotta', 'fd-surface', 4.5], ['fd-terracotta', 'fd-surface-warm', 4.5],
  ['fd-terracotta-dark', 'fd-selected', 4.5], ['fd-terracotta-dark', 'fd-surface', 4.5],
  ['fd-teal-deep', 'fd-surface', 4.5], ['fd-teal-deep', 'fd-surface-warm', 4.5],
  ['fd-teal-deep', 'fd-teal-wash', 4.5], ['fd-teal-deep', 'fd-bg', 4.5],
  ['fd-danger', 'fd-surface', 4.5], ['fd-danger', 'fd-danger-wash', 4.5], ['fd-danger', 'fd-surface-warm', 4.5],
  ['fd-olive', 'fd-surface', 4.5], ['fd-olive', 'fd-bg', 4.5], ['fd-olive', 'fd-surface-warm', 4.5],
  ['fd-olive-deep', 'fd-olive-wash', 4.5],
  ['fd-on-accent', 'fd-terracotta', 4.5], ['fd-on-accent', 'fd-terracotta-dark', 4.5],
  ['fd-on-accent', 'fd-danger', 4.5], ['fd-on-accent', 'fd-danger-dark', 4.5],
  ['fd-on-accent', 'fd-success', 4.5], ['fd-on-accent', 'fd-teal', 4.5],
  ['fd-teal', 'fd-surface', 3], ['fd-teal', 'fd-surface-warm', 3], ['fd-teal', 'fd-bg', 3],
  ['fd-teal', 'fd-teal-wash', 3], ['fd-teal', 'fd-ring-track', 3],
  ['fd-success', 'fd-surface', 3], ['fd-success', 'fd-bg', 3],
  ['fd-danger', 'fd-bg', 3], ['fd-terracotta', 'fd-selected', 3],
  ['fd-focus', 'fd-surface', 3], ['fd-focus', 'fd-bg', 3], ['fd-focus', 'fd-surface-warm', 3],
];

// Inherited from the design prototype, which is normative for visual values. Each entry is a
// deliberate acceptance, not an oversight -- changing any of them is a palette-owner decision.
// (--fd-line / --fd-line-strong are absent from PAIRS entirely: a 1px hairline cannot reach 3:1
// in either theme without ceasing to be a hairline, and :focus-visible carries a11y instead.)
const LIGHT_DEBT = new Set([
  'fd-text-dim on fd-bg', 'fd-text-dim on fd-surface', 'fd-text-dim on fd-surface-warm',
  'fd-text-dim on fd-selected', 'fd-text-dim on fd-chip', 'fd-text-dim on fd-callout',
  'fd-terracotta on fd-bg', 'fd-terracotta on fd-surface', 'fd-terracotta on fd-surface-warm',
  'fd-olive on fd-bg',
  'fd-on-accent on fd-terracotta',
]);

let failed = false;

function run(label, P, debt) {
  console.log(`\n--- ${label} (${Object.keys(P).length} tokens parsed from clinical-warm.css) ---`);
  let accepted = 0;
  const stillFailing = new Set();
  for (const [fg, bg, min] of PAIRS) {
    if (!P[fg]) { failed = true; console.error(`FAIL ${label}: --${fg} is not defined`); continue; }
    if (!P[bg]) { failed = true; console.error(`FAIL ${label}: --${bg} is not defined`); continue; }
    const r = ratio(P[fg], P[bg]);
    const key = `${fg} on ${bg}`;
    if (r >= min) continue;
    if (debt.has(key)) { accepted++; stillFailing.add(key); console.log(`debt ${key} = ${r.toFixed(2)} (min ${min}) -- inherited from the design`); continue; }
    failed = true;
    console.error(`FAIL ${label}: --${fg} (${P[fg]}) on --${bg} (${P[bg]}) = ${r.toFixed(2)} (min ${min})`);
  }
  // A pinned exception that starts passing means the palette improved -- say so, and require the
  // allowlist to be trimmed so it never drifts into covering a genuinely new regression.
  for (const key of debt) {
    if (!stillFailing.has(key)) {
      failed = true;
      console.error(`FAIL ${label}: "${key}" is listed as accepted debt but now PASSES -- remove it from LIGHT_DEBT`);
    }
  }
  console.log(`${label}: ${PAIRS.length - accepted} enforced pairs, ${accepted} accepted as inherited debt`);
}

run('LIGHT', LIGHT, LIGHT_DEBT);
run('DARK', DARK, new Set());

console.log(failed ? '\nfront-door contrast: FAILED' : '\nfront-door contrast: OK');
process.exit(failed ? 1 : 0);
