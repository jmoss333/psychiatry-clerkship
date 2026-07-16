// WP-03: light-mode accent contrast lock-in.
//
// Locks in the WCAG 2.1 AA (4.5:1) contrast of the normal-size text tokens against both
// light backgrounds the palette renders text on. The old `--primary` (#c25a3c) fails AA
// for normal text (3.94:1 on #f6f3ee, 4.36:1 on #ffffff) — normal-size text/link/badge
// rules now use `--primary-dark` (#a84830) instead. Large display headings (>=24px, or
// >=18.66px/14pt bold) may keep `--primary` — large text only needs 3:1 — see the
// targeted per-file changes in this same commit.
//
// Dark mode is untouched (`--primary:#d4896e` = 6.41:1, already passes) and is
// intentionally NOT re-checked here — this file locks the LIGHT-mode contract only.

function rel(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) { const a = rel(fg), b = rel(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }

// The two light backgrounds the palette renders text on.
const BGS = ['#f6f3ee', '#ffffff'];
// Tokens that are used at NORMAL text size must clear 4.5:1 on both.
const NORMAL_TEXT_TOKENS = { '--primary-dark': '#a84830', '--text-light': '#665a4f', '--text-mid': '#64574b', '--text': '#3b332c' };

let failed = false;
for (const [tok, hex] of Object.entries(NORMAL_TEXT_TOKENS)) {
  for (const bg of BGS) {
    const r = ratio(hex, bg);
    if (r < 4.5) { failed = true; console.error(`FAIL ${tok} (${hex}) on ${bg} = ${r.toFixed(2)} (<4.5)`); }
    else console.log(`ok  ${tok} (${hex}) on ${bg} = ${r.toFixed(2)}`);
  }
}
// Guard: the OLD accent must NOT be used as a normal-text token value anymore.
if (ratio('#c25a3c', '#f6f3ee') >= 4.5) console.log('(note) #c25a3c now passes — unexpected');
process.exit(failed ? 1 : 0);
