import { test, expect } from '@playwright/test';

// Policy (2026-07-15 decision log, confirmed by Dr. Moss): un-attested drafts ARE served,
// clearly marked; only retired items are withheld. a04a848 briefly gated the pool to
// attested-only (192 -> 143) — these assert the restored behaviour against the shipped site.

async function bank(page, baseURL) {
  const res = await page.request.get(`${baseURL}/question_bank.json`);
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const items = data.items || data;
  return {
    items,
    served: items.filter((it) => !it.retired),
    retired: items.filter((it) => it.retired),
    drafts: items.filter((it) => !it.retired && it.status !== 'attested'),
  };
}

test('practice bank serves drafts and never serves retired items', async ({ page, baseURL }) => {
  const { items, served, retired, drafts } = await bank(page, baseURL);
  // Guards: this test only proves something if the bank actually holds both kinds.
  expect(retired.length).toBeGreaterThan(0);
  expect(drafts.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  await page.selectOption('#f-size', 'all');
  await expect(page.locator('#itemCount')).toContainText('match');

  const countText = (await page.locator('#itemCount').textContent()) || '';
  const shown = parseInt((countText.match(/\d+/) || ['0'])[0], 10);
  expect(shown).toBe(served.length);       // drafts are back in the pool
  expect(shown).not.toBe(items.length);    // ...and retired were still withheld
  // Explicitly rules out a regression to the attested-only pool.
  expect(shown).not.toBe(served.length - drafts.length);

  // The preview states how many are unreviewed before the learner starts.
  const note = page.locator('.setup-draft-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Draft — not yet faculty-reviewed');
  await expect(note).toContainText(`${drafts.length} of these ${served.length} questions`);
});

// Separate test so a failure points at labelling rather than at pool composition.
test('every served draft is labelled on the question itself', async ({ page, baseURL }) => {
  const { served, drafts } = await bank(page, baseURL);

  // Pick the category with the most drafts and queue all of it, so encountering a draft
  // is guaranteed rather than luck-of-the-shuffle.
  const byCat = {};
  for (const it of served) {
    byCat[it.category] = byCat[it.category] || { total: 0, draft: 0 };
    byCat[it.category].total += 1;
    if (it.status !== 'attested') byCat[it.category].draft += 1;
  }
  const [category, stats] = Object.entries(byCat).sort((a, b) => b[1].draft - a[1].draft)[0];
  expect(stats.draft, 'need a category containing drafts').toBeGreaterThan(0);
  expect(drafts.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  await page.selectOption('#f-cat', category);
  await page.selectOption('#f-size', 'all');
  await page.click('#startBtn');
  await page.waitForSelector('.qcard');

  let sawDraft = 0;
  let sawAttested = 0;
  for (let i = 0; i < stats.total; i += 1) {
    const chips = await page.locator('.qcard .chip-draft').count();
    const notices = await page.locator('.qcard .draft-notice').count();
    // The two label surfaces must always agree — neither may appear alone.
    expect(chips).toBe(notices);
    if (chips > 0) {
      sawDraft += 1;
      const notice = page.locator('.qcard .draft-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('not yet faculty-reviewed');
      await expect(notice).toHaveAttribute('role', 'note');
    } else {
      sawAttested += 1;
    }
    // Answer (confidence is gated first), then advance.
    await page.locator('.qcard .conf-btn').first().click();
    await page.locator('.qcard .opt').first().click();
    const next = page.locator('#nextBtn');
    if (!(await next.count())) break;
    await next.click();
    if (!(await page.locator('.qcard').count())) break;
    await page.waitForSelector('.qcard');
  }

  expect(sawDraft, 'expected labelled drafts in the served pool').toBeGreaterThan(0);
  // Proves the label is item-specific rather than painted on every card.
  expect(sawAttested, 'expected some attested items to carry no label').toBeGreaterThan(0);
});
