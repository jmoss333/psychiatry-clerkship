import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('cw_srs_v1');
    window.localStorage.removeItem('cw_family_v1');
  });
});

test('practice mode reveal + self-rate writes one FAM# card and stores no free text', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/tools/family-systems.html`, { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Practice mode' }).click();

  const reveal = page.getByRole('button', { name: /reveal one way/i }).first();
  await expect(reveal).toBeVisible();
  await reveal.click();

  await page.getByRole('button', { name: 'Good' }).first().click();

  const srs = await page.evaluate(() => JSON.parse(window.localStorage.getItem('cw_srs_v1') || '{}'));
  const famIds = Object.keys(srs.cards || {}).filter((k) => k.startsWith('FAM#'));
  expect(famIds).toHaveLength(1);
  expect(srs.cards[famIds[0]].ivl).toBe(1);            // Good on first encounter → interval 1 day
  expect(srs.cards[famIds[0]].due).toBeGreaterThan(Date.now());
  expect(Object.keys(srs.cards).every((k) => k.startsWith('FAM#'))).toBe(true); // no QB#/TOPIC# fabricated

  const raw = await page.evaluate(() => window.localStorage.getItem('cw_srs_v1'));
  expect(raw).not.toMatch(/opening line|collateral question|trap/i); // scheduling metadata only

  // Regression: switching scenarios via a filter must not leak graded state.
  // revealed/graded are keyed by shared prompt id, so a filter-driven auto-switch
  // (ensureCurrentVisible) must reset them or the new scenario falsely reads "already reviewed".
  // NOTE: depends on JSON scenario order — the default (index-0) scenario is non-Meeting, so the
  // Meeting filter excludes it and forces an ensureCurrentVisible() auto-switch. If ordering changes,
  // pick a filter that excludes whatever scenario loads first.
  await page.getByRole('button', { name: /^Meeting/ }).click();
  await expect(page.locator('.pcard .pdone')).toHaveCount(0); // newly-shown scenario is not falsely graded
  await expect(page.getByRole('button', { name: /reveal one way/i }).first()).toBeVisible();

  // Reference mode renders the original checklist AND the reference sections, not the practice UI
  await page.getByRole('button', { name: 'Reference mode' }).click();
  await expect(page.getByText(/before you call it done/i)).toBeVisible();
  await expect(page.locator('.practice')).toHaveCount(0);
  await expect(page.locator('.section').first()).toBeVisible();
});
