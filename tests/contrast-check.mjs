// WP-03: light-mode accent contrast lock-in -- DERIVED FROM SHIPPED FILES.
//
// This test used to hardcode token hex values as literals (e.g. '--primary-dark':
// '#a84830') and compare them against hardcoded backgrounds. That meant it could
// never fail from a real regression -- if someone reverted a rule back to
// var(--primary), or edited a :root token value in the shipped CSS, the test
// still passed. It was asserting constants, not the codebase.
//
// This version parses the actual light-mode `:root{...}` token block out of the
// shipped spa_index.html and computes WCAG 2.1 AA (4.5:1) contrast from THOSE
// values, then separately guards the specific selectors WP-03 repointed so a
// revert of any one of them is caught by name. Two checks:
//
//   1. AA contract: --primary-dark / --text / --text-mid (the tokens used for
//      normal-size text) must clear 4.5:1 against both parsed backgrounds
//      (--bg and --surface -- literal fallbacks only apply if a token is
//      entirely absent from the file).
//   2. Regression guard: the 6 normal-size rules WP-03 repointed to
//      var(--primary-dark) must still resolve to var(--primary-dark) in the
//      shipped CSS text, not var(--primary) or anything else.
//
// Dark mode is untouched (`--primary:#d4896e` etc. already pass 4.5:1) and is
// intentionally NOT checked here -- this file locks the LIGHT-mode contract only.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SPA_PATH = path.join(REPO_ROOT, '13_Faculty_Resources/_automation/site_build/spa_index.html');
const SP_PATH = path.join(REPO_ROOT, '_prototypes/sp-interview/sp-interview.html');

function rel(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) { const a = rel(fg), b = rel(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }

// --- 1. Parse the real light-mode :root token block out of spa_index.html ---
// (the FIRST `:root{...}` block in the file -- dark-mode overrides live under a
// `[data-theme="dark"]{...}` selector, never `:root`, so this never picks them up)

function extractLightRootBlock(cssText, sourceLabel) {
  const m = cssText.match(/:root\s*\{([\s\S]*?)\}/);
  if (!m) throw new Error(`could not find a :root{...} block in ${sourceLabel}`);
  return m[1];
}

function parseToken(rootBlock, name, fallback, sourceLabel) {
  const m = rootBlock.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (m) return m[1];
  if (fallback) return fallback;
  throw new Error(`token --${name} not found in ${sourceLabel}'s :root block (no fallback defined for this token)`);
}

const spaText = readFileSync(SPA_PATH, 'utf8');
const rootBlock = extractLightRootBlock(spaText, 'spa_index.html');

const TOKENS = {
  '--primary': parseToken(rootBlock, 'primary', null, 'spa_index.html'),
  '--primary-dark': parseToken(rootBlock, 'primary-dark', null, 'spa_index.html'),
  '--text': parseToken(rootBlock, 'text', null, 'spa_index.html'),
  '--text-mid': parseToken(rootBlock, 'text-mid', null, 'spa_index.html'),
  '--bg': parseToken(rootBlock, 'bg', '#f6f3ee', 'spa_index.html'),
  '--surface': parseToken(rootBlock, 'surface', '#ffffff', 'spa_index.html'),
};

console.log('Parsed light-mode tokens from spa_index.html:');
for (const [tok, hex] of Object.entries(TOKENS)) console.log(`  ${tok}: ${hex}`);

let failed = false;

// --- 2. AA contract on parsed values (not literals) ---

const BGS = [TOKENS['--bg'], TOKENS['--surface']];
const NORMAL_TEXT_TOKENS = ['--primary-dark', '--text', '--text-mid'];

for (const tok of NORMAL_TEXT_TOKENS) {
  const hex = TOKENS[tok];
  for (const bg of BGS) {
    const r = ratio(hex, bg);
    if (r < 4.5) { failed = true; console.error(`FAIL ${tok} (${hex}) on ${bg} = ${r.toFixed(2)} (<4.5)`); }
    else console.log(`ok  ${tok} (${hex}) on ${bg} = ${r.toFixed(2)}`);
  }
}

// --- 3. Regression guard: the 6 rules WP-03 repointed must still use --primary-dark ---

function getSelectorColor(cssText, selector) {
  const start = cssText.indexOf(selector + '{');
  if (start === -1) return null;
  const braceStart = start + selector.length;
  const end = cssText.indexOf('}', braceStart);
  if (end === -1) return null;
  const body = cssText.slice(braceStart + 1, end);
  const m = body.match(/(?:^|;)color:([^;]+)/);
  return m ? m[1].trim() : null;
}

const REGRESSION_GUARD = [
  { file: SPA_PATH, label: 'spa_index.html', text: spaText,
    selectors: ['aside h1', '.practice-title', '.practice-action.is-case', '.tl-chip.is-safety:hover'] },
  { file: SP_PATH, label: 'sp-interview.html', text: readFileSync(SP_PATH, 'utf8'),
    selectors: ['.sa label .num', '.teach p .pin'] },
];

for (const { label, text, selectors } of REGRESSION_GUARD) {
  for (const selector of selectors) {
    const color = getSelectorColor(text, selector);
    if (color === null) {
      failed = true;
      console.error(`FAIL ${label} ${selector} -- selector not found (rule renamed or removed?)`);
    } else if (color !== 'var(--primary-dark)') {
      failed = true;
      console.error(`FAIL ${label} ${selector} -- color:${color} (expected color:var(--primary-dark))`);
    } else {
      console.log(`ok  ${label} ${selector} -- color:${color}`);
    }
  }
}

process.exit(failed ? 1 : 0);
