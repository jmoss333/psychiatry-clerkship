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

  // Reference mode still renders the original checklist
  await page.getByRole('button', { name: 'Reference mode' }).click();
  await expect(page.getByText(/before you call it done/i)).toBeVisible();
});
