/**
 * Deterministic resident Front Door visual contract.
 *
 * The four semantic baselines are generated only by the repository's Ubuntu/Chromium
 * workflow. This file deliberately does not support local macOS baseline generation.
 */

import { test, expect } from '@playwright/test';

const FROZEN_NOW = new Date('2026-08-17T12:00:00-04:00');
const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile', width: 390, height: 844 },
];

async function seedResident(page, tab = 'today') {
  await page.clock.setFixedTime(FROZEN_NOW);
  await page.addInitScript(({ initialTab }) => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'pgy1', tab: initialTab, viewWeek: 1,
    }));
    localStorage.setItem('cw_progress_v1', JSON.stringify({
      'orientation.md': { done: true, at: '2026-08-17' },
    }));
    localStorage.setItem('cw_theme', 'light');
  }, { initialTab: tab });
}

async function waitForStableFrontDoor(page, surface) {
  await expect(page.locator(surface)).toBeVisible();
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

for (const viewport of VIEWPORTS) {
  test.describe(`resident Front Door visual @ ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Today first viewport', async ({ page, baseURL }) => {
      await seedResident(page);
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
      await waitForStableFrontDoor(page, '.fd-today');
      await expect(page).toHaveScreenshot(`front-door-today-${viewport.label}.png`);
    });

    test('Reader first viewport', async ({ page, baseURL }) => {
      await seedResident(page, 'library');
      await page.goto(`${baseURL}/?page=t_mood.md`, { waitUntil: 'domcontentloaded' });
      await waitForStableFrontDoor(page, '.fd-reader .fd-article__body');
      await expect(page).toHaveScreenshot(`front-door-reader-${viewport.label}.png`);
    });
  });
}
