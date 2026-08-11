import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('cw_dashboard_v1');
  });
});

async function gotoReady(page, baseURL) {
  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#nav .navitem', { timeout: 15_000 });
  await page.waitForTimeout(400);
  // The default route is Today, where the companion is deliberately suppressed (the unit
  // card header carries the same mode chips). Exercise the companion from a topic page —
  // first .md navitem works on both the MS3 and resident navs.
  await page.locator('#nav .navitem[data-f$=".md"]').first().click();
  await expect(page.locator('#modeCompanion .mc-toggle')).toBeVisible();
}

test('mode companion starts collapsed and expands/collapses on click', async ({ page, baseURL }) => {
  await gotoReady(page, baseURL);

  const toggle = page.locator('#modeCompanion .mc-toggle');
  const body = page.locator('#modeCompanion .mc-body');

  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle.locator('.mc-toggle-t')).toHaveText('Ward mode');
  await expect(body).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(body).toBeVisible();
  await expect(page.locator('#modeCompanion [data-mc-mode="ward"]')).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toBeHidden();
});

test('switching mode while expanded stays expanded and updates the toggle label', async ({ page, baseURL }) => {
  await gotoReady(page, baseURL);

  const toggle = page.locator('#modeCompanion .mc-toggle');
  await toggle.click();
  await expect(page.locator('#modeCompanion .mc-body')).toBeVisible();

  await page.locator('#modeCompanion [data-mc-mode="shelf"]').click();

  await expect(toggle.locator('.mc-toggle-t')).toHaveText('Shelf mode');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#modeCompanion .mc-body')).toBeVisible();
  await expect(page.locator('#modeCompanion [data-mc-mode="shelf"]')).toHaveClass(/on/);
});

test('a fresh reload always starts collapsed, even after a prior session expanded it', async ({ page, baseURL }) => {
  await gotoReady(page, baseURL);

  await page.locator('#modeCompanion .mc-toggle').click();
  await expect(page.locator('#modeCompanion .mc-body')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav .navitem', { timeout: 15_000 });
  await page.waitForTimeout(400);

  await expect(page.locator('#modeCompanion .mc-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#modeCompanion .mc-body')).toBeHidden();
});

test('the companion is suppressed on Today and returns on any other view', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/?page=__home__`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#nav .navitem', { timeout: 15_000 });
  await page.waitForTimeout(400);

  // Today carries the mode chips in the unit-card header — the sidebar companion would be
  // a duplicate control, so it must be hidden here...
  await expect(page.locator('#modeCompanion .mc-toggle')).toBeHidden();
  await expect(page.locator('#hmRoot [data-dash-mode="ward"]')).toBeVisible();

  // ...and visible again the moment the route leaves Today.
  await page.locator('#nav .navitem[data-f$=".md"]').first().click();
  await expect(page.locator('#modeCompanion .mc-toggle')).toBeVisible();
});
