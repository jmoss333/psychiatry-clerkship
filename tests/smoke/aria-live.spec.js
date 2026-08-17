import { test, expect } from '@playwright/test';

test('question bank announces the verdict in an aria-live region', async ({ page }) => {
  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  // start a session
  await page.getByRole('button', { name: /start practice/i }).click();
  // choose a confidence, then any answer option (A–E buttons)
  await page.locator('.conf-btn[data-conf="likely"]').click();
  await page.locator('#optsList .opt').first().click();
  // Two-tier items do not emit a verdict until the rationale is answered.
  const rationale = page.locator('#tier2Opts .opt').first();
  if (await rationale.count()) await rationale.click();
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

test('Front Door route changes announce the loaded resource through #routeStatus', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'library', viewWeek: 1,
    }));
  });
  await page.goto('/?tab=library');
  const target = page.locator('.fd-collink[data-fd-open]').first();
  const title = (await target.locator('.fd-collink__label').innerText()).trim();
  await target.click();

  await expect(page.locator('#routeStatus[aria-live="polite"]')).toHaveText(`${title} loaded`);
  await expect(page.locator('.fd-reader')).toBeVisible();
});
