import { test, expect } from '@playwright/test';

test('question bank announces the verdict in an aria-live region', async ({ page }) => {
  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  // start a session
  await page.getByRole('button', { name: /start practice/i }).click();
  // choose a confidence, then any answer option (A–E buttons)
  await page.getByRole('button', { name: /Likely/i }).click();
  const opt = page.locator('.qcard button').filter({ hasText: /^[A-E]\./ }).first();
  await opt.click();
  // a persistent live region should now carry a verdict
  const live = page.locator('[aria-live]');
  await expect(live).toHaveCount(1);
  await expect(live).toContainText(/correct|incorrect|reasoning/i);
});
