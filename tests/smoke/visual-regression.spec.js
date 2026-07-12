/**
 * Check 3 — Visual regression.
 *
 * Screenshots the resident site at desktop (1280×800) and mobile (390×844):
 *   - the nav sidebar (key structural element, section headers, items)
 *   - a representative topic page's first viewport (#content area)
 *
 * Compares against committed baselines in tests/smoke/baseline/.
 * Uses Playwright's built-in toHaveScreenshot() which calls pixelmatch internally.
 * Threshold: 20 % (maxDiffPixelRatio in playwright.config.js) — loose enough
 * to survive macOS→Linux font-rendering differences while catching layout breaks.
 *
 * First run (no baseline): npm run update-baselines — creates baseline PNGs, then commit them.
 * Subsequent runs: normal test run compares; fail → actual/expected/diff uploaded as CI artifacts.
 *
 * The topic capture is intentionally viewport-bounded. Content pages are allowed to grow as
 * curriculum sections are added; a full-height screenshot would treat every legitimate content
 * addition as a layout regression. The sidebar remains a full structural screenshot.
 *
 * Runs only against the resident site (project: visual, baseURL = localhost:4201).
 */

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile',  width: 390,  height: 844 },
];

// Representative page that has rich content and is stable across builds
const TOPIC_PAGE = 't_mood.md';

async function waitForSpaReady(page) {
  await page.waitForFunction(
    () => {
      const content = document.querySelector('#content');
      const nav = document.querySelector('#nav');
      if (!nav || !content) return false;
      if (content.querySelector('.skel')) return false;
      return (content.innerText || '').trim().length > 50;
    },
    { timeout: 20_000 },
  );
  // Extra settle time for CSS transitions / font loading
  await page.waitForTimeout(600);
}

for (const vp of VIEWPORTS) {
  test.describe(`visual @ ${vp.label} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('resident sidebar', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForSelector('#nav .navitem', { timeout: 15_000 });
      await page.waitForTimeout(400);

      let sidebar;
      if (vp.width <= 820) {
        // On mobile the sidebar is in a slide-in drawer; open it first
        const btn = page.locator('#menuBtn');
        if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(350);
        }
        sidebar = page.locator('#side');
      } else {
        sidebar = page.locator('aside#side');
      }

      await expect(sidebar).toHaveScreenshot(`sidebar-${vp.label}.png`);
    });

    test('topic page first viewport', async ({ page, baseURL }) => {
      await page.goto(
        `${baseURL}/?page=${encodeURIComponent(TOPIC_PAGE)}`,
        { waitUntil: 'domcontentloaded', timeout: 20_000 },
      );
      await waitForSpaReady(page);

      const content = page.locator('#content');
      await content.evaluate((el, height) => {
        el.style.height = `${height}px`;
        el.style.minHeight = '0';
        el.style.overflow = 'hidden';
      }, vp.height);
      await expect(content).toHaveScreenshot(`topic-${vp.label}.png`);
    });
  });
}
