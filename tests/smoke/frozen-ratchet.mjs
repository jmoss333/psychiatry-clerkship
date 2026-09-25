/* The ratchet rule for frozen colours and rendered AA failures.
 *
 * Pure on purpose. The measurement needs a browser; the DECISION does not, so it lives here where
 * tests/theme-scan.test.mjs can falsify it in milliseconds without Playwright. Every other gate in
 * this repo that pins a number (design_drift_baseline.json, canary-scope, LIGHT_DEBT) has the same
 * shape, and the same reason: a gate whose verdict can only be produced by the slow path is a gate
 * nobody can prove is working.
 *
 * THE RULE. Counts may fall freely and may never rise. A page absent from the baseline must be
 * clean — that is what stops a new page from arriving pre-broken, which is exactly how the five
 * private-palette tools got in. A page in the baseline at 0 is pinned at 0.
 *
 * WHY NOT "ZERO EVERYWHERE". Because 228 dark-mode failures and 80 frozen colours are real, on
 * pages this work has not reached yet. A gate that fails today teaches everyone to bypass it. A
 * ratchet fails only on the commit that makes things worse, which is the commit that can fix it.
 */

/** @typedef {{frozen:number, lowLight:number, lowDark:number}} Counts */

export const METRICS = /** @type {const} */ (['frozen', 'lowLight', 'lowDark']);

export const LABEL = {
  frozen: 'colours that do not change when the theme flips',
  lowLight: 'text below WCAG AA in light mode',
  lowDark: 'text below WCAG AA in dark mode',
};

/**
 * @param {Record<string, Counts>} baseline  pinned counts, by page slug
 * @param {Record<string, Counts>} measured  counts from this run, by page slug
 * @returns {{violations: string[], improvements: string[], unmeasured: string[]}}
 */
export function compare(baseline, measured) {
  const violations = [];
  const improvements = [];

  for (const page of Object.keys(measured).sort()) {
    const now = measured[page];
    const was = baseline[page];
    for (const metric of METRICS) {
      const allowed = was ? (was[metric] ?? 0) : 0;
      const found = now[metric] ?? 0;
      if (found > allowed) {
        violations.push(
          `${page}: ${found} ${LABEL[metric]} (baseline allows ${allowed})` +
          (was ? '' : ' — this page is not in frozen_baseline.json, so it must be clean')
        );
      } else if (found < allowed) {
        improvements.push(`${page}: ${metric} ${allowed} -> ${found}`);
      }
    }
  }

  // A page in the baseline that this run never measured is not a pass. It usually means the page
  // stopped shipping (fine, re-pin) or the walk silently skipped it (not fine) — and a ratchet
  // that quietly ignores a missing subject is how a gate goes vacuous without anyone noticing.
  const unmeasured = Object.keys(baseline).filter((p) => !(p in measured)).sort();

  return { violations, improvements, unmeasured };
}

/** Counts for a page, from one raw scan result. Keys are dropped; only totals are pinned. */
export function totals(scan) {
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  return { frozen: sum(scan.frozen), lowLight: sum(scan.lowLight), lowDark: sum(scan.lowDark) };
}

/** The few worst offenders, for a failure message that says what to go and look at. */
export function worst(scan, metric, n = 5) {
  const bucket = scan[metric] || {};
  return Object.entries(bucket)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${v}x ${k}`);
}
