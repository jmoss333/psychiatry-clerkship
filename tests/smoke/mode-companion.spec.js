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
