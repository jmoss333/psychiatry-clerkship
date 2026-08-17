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

test.describe('mobile shell ergonomics', () => {
  test.use({ viewport: { width: 320, height: 844 } });

  test('keeps navigation, contextual tools, and the current page usable', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?page=t_mood.md`, { waitUntil: 'domcontentloaded' });
    await waitForSpaReady(page);

    await expect(page.locator('#mobileTitle')).toContainText('Mood Disorders');
    await expect(page.locator('.tl-bar')).toBeVisible();
    await expect(page.locator('.tl-bar__item[data-tool]')).toHaveCount(3);

    await page.locator('#menuBtn').click();
    const drawerPadding = await page.locator('#side').evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).paddingBottom),
    );
    expect(drawerPadding).toBeGreaterThanOrEqual(90);
    // #drawerBackdrop spans the full viewport (inset:0), so a default center-click
    // lands on the drawer itself at narrow widths (aside is min(84vw, 300px), which
    // exceeds half of any phone-sized viewport). Click a measured point just right of
    // the drawer's actual edge, near the top, clear of the bottom-anchored tool bar.
    // Wait for the .2s slide-in transition to settle before measuring its geometry
    // (same wait used for the drawer screenshot above).
    await page.waitForTimeout(350);
    const asideBox = await page.locator('#side').boundingBox();
    await page.locator('#drawerBackdrop').click({
      position: { x: (asideBox?.x ?? 0) + (asideBox?.width ?? 0) + 10, y: 10 },
    });

    const more = page.locator('.tl-bar__more');
    await more.click();
    await expect(page.locator('.tl-sheet')).toBeVisible();
    const close = page.locator('.tl-sheet__close');
    await expect(close).toBeFocused();

    const sheetItems = page.locator('.tl-sheet__item');
    const sheetItemCount = await sheetItems.count();
    expect(sheetItemCount).toBeGreaterThan(0);
    const lastSheetItem = sheetItems.nth(sheetItemCount - 1);

    await close.press('Shift+Tab');
    await expect(lastSheetItem).toBeFocused();
    await lastSheetItem.press('Tab');
    await expect(close).toBeFocused();

    await close.click();
    await expect(page.locator('.tl-sheet')).toHaveCount(0);
    await expect(more).toBeFocused();

    await page.locator('[data-fd-tab="path"]').click();
    await expect(page.locator('.fd-path')).toBeVisible();
    await expect(page.locator('[data-fd-tab="path"]')).toHaveAttribute('aria-current', 'page');
  });

  test('reflows contextual tools when a phone becomes narrower', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}/?page=t_mood.md`, { waitUntil: 'domcontentloaded' });
    await waitForSpaReady(page);
    await expect(page.locator('.tl-bar__item[data-tool]')).toHaveCount(4);

    await page.setViewportSize({ width: 320, height: 844 });
    await expect(page.locator('.tl-bar__item[data-tool]')).toHaveCount(3);
  });

  test('marks a wide Markdown table as an accessible scroll region', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?page=pg_interview.md`, { waitUntil: 'domcontentloaded' });
    await waitForSpaReady(page);

    const tableSections = page.locator('.sec-c').filter({
      has: page.locator('.table-scroll-viewport'),
    });
    const tableSectionCount = await tableSections.count();
    expect(tableSectionCount).toBeGreaterThan(0);

    const tableSection = tableSections.nth(0);
    const tableHeader = tableSection.locator('.sec-h button');
    await expect(tableHeader).toHaveCount(1);
    await tableHeader.click();
    await expect(tableSection).toHaveClass(/open/);

    const viewport = tableSection.locator('.table-scroll-viewport');
    const tableShell = tableSection.locator('.table-scroll');
    await expect(tableShell).toHaveClass(/is-scrollable/);
    await expect(viewport).toHaveAttribute('role', 'region');
    await expect(viewport).toHaveAttribute('tabindex', '0');
    await expect(viewport).toHaveAttribute('aria-label', 'MSE Structure table');
    await expect(viewport.locator('table')).toBeVisible();
    expect(await viewport.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(tableShell.locator('.table-scroll-hint')).toBeVisible();

    const pageWidths = await page.locator('#content').evaluate((el) => ({
      content: el.clientWidth,
      document: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(pageWidths.content).toBeLessThanOrEqual(pageWidths.document);
    expect(pageWidths.scroll).toBeLessThanOrEqual(pageWidths.document);
  });
});
