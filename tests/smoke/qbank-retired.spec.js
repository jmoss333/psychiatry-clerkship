import { test, expect } from '@playwright/test';

test('practice bank serves only attested, non-retired items', async ({ page, baseURL }) => {
  // Ground truth from the shipped data
  const res = await page.request.get(`${baseURL}/question_bank.json`);
  expect(res.ok()).toBeTruthy();
  const bank = await res.json();
  const items = bank.items || bank;
  const attested = items.filter((it) => !it.retired && it.status === 'attested');
  const retired = items.filter((it) => it.retired);
  const drafts = items.filter((it) => !it.retired && it.status !== 'attested');
  // Guards: this test only proves something if the bank has both retired items and drafts.
  expect(retired.length).toBeGreaterThan(0);
  expect(drafts.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  await page.selectOption('#f-size', 'all');
  await expect(page.locator('#itemCount')).toContainText('match');

  const countText = (await page.locator('#itemCount').textContent()) || '';
  const shown = parseInt((countText.match(/\d+/) || ['0'])[0], 10);
  expect(shown).toBe(attested.length);                    // count reflects the attested-only pool
  expect(shown).not.toBe(items.length);                   // proves retired were actually removed
  expect(shown).not.toBe(items.length - retired.length);  // proves drafts were removed too
});
