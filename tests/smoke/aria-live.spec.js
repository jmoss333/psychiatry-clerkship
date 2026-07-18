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

// WP-05 (WCAG 2.1 AA 2.4.1 Bypass Blocks): every built tool page ships a skip-to-content
// link injected by build_deploy.py's polish pass — it must be the first focusable element.
test('tool page exposes a skip link as first focusable', async ({ page }) => {
  await page.goto('/tools/question-bank-practice.html');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement && document.activeElement.className);
  expect(focused).toContain('skip-link');
});
