import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('cw_longitudinal_v1');
  });
});

test('checked item reveals one accessible model response without storing its text', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/tools/one-patient-six-weeks.html?week=1`, {
    waitUntil: 'domcontentloaded',
  });

  const checkbox = page.getByLabel(
    'I can state what changed, when it changed, and who noticed it.',
  );
  const example = page.locator('#example-week1-c0');

  await expect(checkbox).toBeVisible();
  await expect(example).toHaveCount(0);

  await checkbox.check();

  await expect(example).toBeVisible();
  await expect(example.getByText('One way to say it', { exact: true })).toBeVisible();
  await expect(example).toContainText('Jordan reports several nights of very little sleep');
  await expect(checkbox).toHaveAttribute('aria-describedby', 'example-week1-c0');

  const stored = await page.evaluate(() => window.localStorage.getItem('cw_longitudinal_v1'));
  expect(stored).not.toContain('Jordan reports several nights');
  expect(JSON.parse(stored)).toMatchObject({
    version: 1,
    completed: { week1: { checks: { c0: true } } },
  });

  await checkbox.uncheck();

  await expect(example).toHaveCount(0);
  await expect(checkbox).not.toHaveAttribute('aria-describedby', 'example-week1-c0');
});
