/**
 * Check — RENDERED contrast, in both themes, on the site this project targets.
 *
 * WHY THIS IS A CANARY SPEC AND NOT A BUILD-TIME ONE
 * --------------------------------------------------
 * Everything else that guards colour in this repo reads a FILE:
 *   tests/fd-contrast.test.mjs   parses clinical-warm.css and checks token pairs
 *   tests/contrast-check.mjs     parses the light SPA palette out of spa_index.html
 *   bin/check_design_drift.py    walks declared-and-used custom properties
 *
 * Twice on 2026-09-10, a defect shipped to learners that all three were structurally unable to
 * see, because the wrong colour only exists once a browser has resolved the cascade:
 *
 *   1. Five tool pages declared a PRIVATE light palette (--ink, --muted, --line) that the
 *      injected dark stylesheet never overrode. Their ground flipped to dark; their ink did not.
 *      family-systems.html measured 1.06:1 across 56 text elements — the whole nav column.
 *   2. The injected crisis block styled itself through a --cw-* namespace that was defined
 *      NOWHERE, so its light fallbacks won in both themes. Its own <h2> then took its colour
 *      from the HOST page's h2 rule, which does flip: "If someone is in crisis" at 2.59:1.
 *
 * Both were found by hand, in a browser, against production. This spec is that probe, kept.
 *
 * COST. Four routes x two themes = 8 navigations and 8 in-page evaluations, ~16 real round
 * trips against Netlify's edge — inside the 30 the canary budgets (tests/canary-scope.test.mjs),
 * and stated here plainly because that budget counts CALL SITES in the source, which a loop
 * under-reports. Keep this list at four. The routes are one representative per defect class,
 * not a crawl: bin/check_design_drift.py C4/C6 already cover every page statically on every
 * push, and what only a browser can answer is whether the cascade resolves legibly.
 */

import { test, expect } from '@playwright/test';
import { retryTransient } from './net-resilience.js';

/** One representative per surface class, present on BOTH sites. */
// `ready` gates only where the surface paints asynchronously. The static tool pages are ready at
// load, and waiting on a shell-internal class there would make this spec red for a refactor
// rather than for a contrast regression — the failure mode a canary can least afford.
const ROUTES = [
  { label: 'front door shell', path: '/' },
  // The private-palette class. Rotation Curator and One Patient, Six Weeks are the same class
  // and are covered statically by C4; this is the one that measured 1.06:1.
  { label: 'family systems (private palette)', path: '/tools/family-systems.html' },
  // Carries the inline-styled <section class="crisis-block"> — the --cw-* class.
  { label: 'MSE builder (inline crisis block)', path: '/tools/mse.html' },
  // The SPA reader plus the crisis block's markdown BLOCKQUOTE variant, a different render path.
  { label: 'suicide.md via the reader', path: '/?page=suicide.md', ready: '.crisis-block-hook' },
];

const THEMES = ['light', 'dark'];

/**
 * Runs IN THE PAGE. Returns every element whose own text fails WCAG AA against the nearest
 * opaque background behind it.
 *
 * Deliberately conservative — a monitor that cries wolf is a monitor nobody reads:
 *  - only DIRECT text nodes count, so a container is not blamed for its child's colour;
 *  - hidden, zero-size, near-transparent and transparent-ink elements are skipped (the design
 *    uses colour:transparent for glyph placeholders inside sized circles);
 *  - the background walk stops at the first ancestor with alpha > 0.5, matching what an eye
 *    actually sees through a stack of translucent layers;
 *  - large text uses the 3:1 bar (>=24px, or >=18.66px at weight >=700).
 *
 * It also returns the body's own luminance, which is how the test confirms the theme actually
 * applied. Asserting on the data-theme STAMP instead would couple this spec to a boot-script
 * convention; the ground is the thing that has to be right for any of the ratios to mean
 * anything, so measure that.
 */
function probeContrast() {
  const rgb = (value) => {
    const parts = String(value).match(/[\d.]+/g);
    return parts ? { c: parts.slice(0, 3).map(Number), a: parts.length > 3 ? Number(parts[3]) : 1 } : null;
  };
  const luminance = ([r, g, b]) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const groundOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = rgb(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5) return bg.c;
      node = node.parentElement;
    }
    const root = rgb(getComputedStyle(document.documentElement).backgroundColor);
    return root && root.a > 0.5 ? root.c : [255, 255, 255];
  };
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const findings = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (Number(style.opacity) < 0.1) continue;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
      .map((n) => n.textContent.trim()).join(' ');
    if (!own) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const ink = rgb(style.color);
    if (!ink || ink.a < 0.1) continue;
    const ground = groundOf(el);
    const size = parseFloat(style.fontSize);
    const bar = (size >= 24 || (size >= 18.66 && parseInt(style.fontWeight, 10) >= 700)) ? 3 : 4.5;
    const measured = ratio(ink.c, ground);
    if (measured < bar) {
      findings.push({
        ratio: Number(measured.toFixed(2)),
        bar,
        size,
        ink: style.color,
        ground: `rgb(${ground.join(',')})`,
        where: describe(el),
        text: own.slice(0, 60),
      });
    }
  }
  const body = rgb(getComputedStyle(document.body).backgroundColor);
  const ground = body && body.a > 0.5 ? body.c : groundOf(document.body);
  return {
    bodyLuminance: Number(luminance(ground).toFixed(4)),
    bodyGround: `rgb(${ground.join(',')})`,
    findings: findings.sort((a, b) => a.ratio - b.ratio),
  };
}

for (const theme of THEMES) {
  for (const route of ROUTES) {
    test(`${theme} — ${route.label} has no text below WCAG AA`, async ({ page }) => {
      // The shell reads cw_theme on boot and stamps data-theme on <html>. Seed it before any
      // script runs so the FIRST paint is the theme under test — toggling after load would
      // measure a transitional state.
      await page.addInitScript((value) => {
        try { window.localStorage.setItem('cw_theme', value); } catch { /* private mode */ }
      }, theme);

      await retryTransient(() => page.goto(route.path, { waitUntil: 'load' }));
      if (route.ready) await page.waitForSelector(route.ready, { state: 'attached' });

      // The probe function is handed to page.evaluate directly rather than stringified into a
      // new Function: Playwright evaluates it through CDP, which is not subject to the page's
      // Content-Security-Policy. A `new Function` build would work locally and fail on the
      // deployed sites the moment a script-src without 'unsafe-eval' lands in _headers.
      const { bodyLuminance, bodyGround, findings } = await page.evaluate(probeContrast);

      // Did the theme actually take? A dark ground is what makes every ratio below meaningful.
      if (theme === 'dark') {
        expect(bodyLuminance, `${route.path} still has a light ground (${bodyGround}) in dark mode`)
          .toBeLessThan(0.2);
      } else {
        expect(bodyLuminance, `${route.path} has a dark ground (${bodyGround}) in light mode`)
          .toBeGreaterThan(0.5);
      }
      expect(
        findings,
        `${findings.length} element(s) below AA on ${route.path} in ${theme} mode `
          + `(ground ${bodyGround}):\n`
          + findings.slice(0, 12).map(
            (f) => `  ${f.ratio}:1 (needs ${f.bar}) ${f.size}px  ${f.where}  ${f.ink} on ${f.ground}\n`
              + `      "${f.text}"`,
          ).join('\n'),
      ).toEqual([]);
    });
  }
}
