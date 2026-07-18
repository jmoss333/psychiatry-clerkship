import { test, expect } from '@playwright/test';

test('practice bank excludes retired items from the served pool', async ({ page, baseURL }) => {
  // Ground truth from the shipped data
  const res = await page.request.get(`${baseURL}/question_bank.json`);
  expect(res.ok()).toBeTruthy();
  const bank = await res.json();
  const items = bank.items || bank;
  const active = items.filter((it) => !it.retired);
  const retired = items.filter((it) => it.retired);
  // Guard: this test only proves something if the bank actually has retired items.
  expect(retired.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  await page.selectOption('#f-size', 'all');
  await expect(page.locator('#itemCount')).toContainText('match');

  const countText = (await page.locator('#itemCount').textContent()) || '';
  const shown = parseInt((countText.match(/\d+/) || ['0'])[0], 10);
  expect(shown).toBe(active.length);       // count reflects the retired-excluded pool
  expect(shown).not.toBe(items.length);    // proves retired were actually removed
});
