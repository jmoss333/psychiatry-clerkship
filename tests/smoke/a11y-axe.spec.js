/**
 * Check — automated accessibility (axe-core) over a representative slice of BOTH learner sites.
 *
 * WHY THIS EXISTS
 * ---------------
 * The library had no permanent automated a11y check: contrast.spec.js measures rendered
 * contrast, aria-live.spec.js and tool-expand.spec.js pin specific behaviours, and the rest was a
 * one-off axe run (2026-10-07, on the "Beyond this page" media block) that found 0 violations in
 * the block and one page-wide moderate `heading-order` issue outside it. A one-off run protects
 * nothing next week. This is that run, kept.
 *
 * WHAT FAILS, WHAT IS REPORTED
 * ----------------------------
 *   serious / critical  -> FAIL. These are the WCAG A/AA failures a screen-reader or keyboard user
 *                          hits (no accessible name, broken ARIA, keyboard traps, contrast).
 *   moderate / minor    -> REPORTED, never failed: attached to the test as `axe-moderate.json`
 *                          and listed as a test annotation, so the HTML report shows them. A
 *                          best-practice rule (heading-order, region, landmark-*) failing a
 *                          build would get this spec switched off within a week.
 *
 * SCOPE AND COST
 * --------------
 * Five surfaces x two themes x two viewports = 20 runs per site, 40 in all, inside the existing
 * nav-ms3 / nav-res projects (no new CI step, no workflow digest change). Kept deliberately to
 * one representative per surface class rather than a crawl: Today (the landing page), the
 * Library, a reading page through the Reader, a tool page, and the Search dialog open. Measured
 * locally on 2026-10-07; see the PR for the timing. Do not widen it into a crawl — add a surface
 * only when it is a new CLASS of markup.
 *
 * Fixtures, not live state: nothing here asserts on governance (pending notices come and go as
 * faculty sign; CLAUDE.md "A test may not depend on live governance state").
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { retryTransient } from './net-resilience.js';
import { isResidentProject } from './audience.js';

const SURFACES = [
  { label: 'Today', path: '/?tab=today', ready: '.fd-today' },
  { label: 'Library', path: '/?tab=library', ready: '.fd-library' },
  { label: 'reading page (t_mood.md)', path: '/?page=t_mood.md', ready: '.fd-reader .fd-article__body' },
  // A clinical tool opened directly, the way a bookmark or a shared link opens it. Carries the
  // injected crisis block and the Clinical Warm palette; present on both sites.
  { label: 'tool page (MSE builder)', path: '/tools/mse.html', ready: 'body' },
  { label: 'Search open', path: '/?tab=today', ready: '.fd-today', open: 'search' },
];

const THEMES = ['light', 'dark'];
const VIEWPORTS = [
  { label: 'desktop', size: { width: 1280, height: 800 } },
  // 320 CSS px is the WCAG 1.4.10 reflow width.
  { label: '320px', size: { width: 320, height: 640 } },
];

const FAIL_IMPACTS = new Set(['serious', 'critical']);

async function openSearch(page) {
  const opener = page.locator('.fd-searchbtn[data-fd-search]:visible').first();
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
}

// The search panel and the Reader fade/slide in. axe measures colour as painted, so a run that
// lands mid-transition reports washed-out ink as a contrast failure (first run: #948f89 on
// #f5f4f2, 2.91:1, in BOTH themes -- the giveaway). Wait for every running animation and CSS
// transition to finish, then one frame, before measuring.
async function settle(page) {
  await page.waitForFunction(() => document.getAnimations()
    .every((a) => a.playState !== 'running' && a.playState !== 'pending'), null, { timeout: 10_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function summarise(violations) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    detail: v.nodes.slice(0, 5).map((n) => (n.any[0] || n.all[0] || n.none[0] || {}).message || ''),
  }));
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    for (const surface of SURFACES) {
      test(`axe — ${surface.label} · ${theme} · ${viewport.label}: no serious or critical violations`,
        async ({ page }, testInfo) => {
          await page.setViewportSize(viewport.size);
          // A returning learner (the front-door.spec.js seed): without a role the shell shows the
          // one-time "Who's this for?" picker in place of every surface below.
          const role = isResidentProject(testInfo.project.name) ? 'pgy1' : 'student';
          await page.addInitScript(({ value, who }) => {
            try {
              window.localStorage.setItem('cw_theme', value);
              window.localStorage.setItem('cw_rotation_start', '2026-08-17');
              window.localStorage.setItem('cw_frontdoor_v1',
                JSON.stringify({ role: who, tab: 'today', viewWeek: 1 }));
            } catch { /* private mode */ }
          }, { value: theme, who: role });

          await retryTransient(() => page.goto(surface.path, { waitUntil: 'load' }));
          await page.locator(`${surface.ready}:visible`).first()
            .waitFor({ state: 'visible', timeout: 20_000 });
          if (surface.open === 'search') await openSearch(page);
          await settle(page);

          const results = await new AxeBuilder({ page }).analyze();

          const failing = results.violations.filter((v) => FAIL_IMPACTS.has(v.impact));
          const reported = results.violations.filter((v) => !FAIL_IMPACTS.has(v.impact));

          if (reported.length) {
            await testInfo.attach('axe-moderate.json', {
              body: JSON.stringify(summarise(reported), null, 2),
              contentType: 'application/json',
            });
            for (const v of reported) {
              testInfo.annotations.push({
                type: `axe ${v.impact}`,
                description: `${v.id} (${v.nodes.length}) — ${v.help} — ${v.nodes[0]?.target.join(' ')}`,
              });
            }
          }
          // Guard against a vacuous pass: axe must actually have examined the page.
          expect(results.passes.length, `axe examined nothing on ${surface.path}`).toBeGreaterThan(10);

          expect(
            summarise(failing),
            `${failing.length} serious/critical axe violation(s) on ${surface.path} `
              + `(${theme}, ${viewport.label}):\n`
              + failing.map((v) => `  [${v.impact}] ${v.id}: ${v.help}\n`
                + v.nodes.slice(0, 5).map((n) => `      ${n.target.join(' ')}`).join('\n')).join('\n'),
          ).toEqual([]);
        });
    }
  }
}
