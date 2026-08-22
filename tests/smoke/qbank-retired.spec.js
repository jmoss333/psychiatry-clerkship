import { test, expect } from '@playwright/test';

// Policy (WP-37, PLAN_Taplinger_Feedback_and_Therapy_Library_2026-08-20.md §A2, decided by
// Dr. Moss): the practice bank serves FACULTY-ATTESTED items only by default; un-attested
// drafts are opt-in via the setup-screen toggle (persisted as cw_qb_drafts_v1) and stay
// clearly labelled when included. Retired items are withheld under every setting.
// This deliberately reverses the 2026-07-15 "serve drafts, marked" decision (see the node
// suite tests/qbank-draft-visibility.test.mjs for the history) — unlike a04a848's silent
// accidental gate, the exclusion is stated on the setup screen. These assert the shipped
// site end-to-end: pool math in both toggle states, persistence, and per-question labels.

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
    attested: items.filter((it) => !it.retired && it.status === 'attested'),
  };
}

async function shownCount(page) {
  await page.selectOption('#f-size', 'all');
  const countText = (await page.locator('#itemCount').textContent()) || '';
  return parseInt((countText.match(/\d+/) || ['0'])[0], 10);
}

test('the default pool is attested-only; drafts and retired are withheld and the exclusion is stated', async ({ page, baseURL }) => {
  const { items, served, retired, drafts, attested } = await bank(page, baseURL);
  // Guards: this test only proves something if the bank actually holds all three kinds.
  expect(retired.length).toBeGreaterThan(0);
  expect(drafts.length).toBeGreaterThan(0);
  expect(attested.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  const shown = await shownCount(page);
  expect(shown).toBe(attested.length);     // attested only
  expect(shown).not.toBe(served.length);   // drafts withheld
  expect(shown).not.toBe(items.length);    // retired withheld too

  // The exclusion is stated, with the count, and the opt-in is offered unchecked.
  const note = page.locator('.setup-draft-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Draft — not yet faculty-reviewed');
  await expect(note).toContainText(`${drafts.length} draft questions are not served by default`);
  await expect(page.locator('#draftToggle')).not.toBeChecked();
});

test('opting in widens the pool to drafts (labelled per question); the choice persists across reloads', async ({ page, baseURL }) => {
  const { served, drafts } = await bank(page, baseURL);
  expect(drafts.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#draftToggle');
  await page.check('#draftToggle');
  // The toggle re-renders the setup screen with the widened pool and the labelled-count copy.
  const note = page.locator('.setup-draft-note');
  await expect(note).toContainText(`${drafts.length} of these ${served.length} questions`);
  expect(await shownCount(page)).toBe(served.length);

  // Persisted: a fresh load keeps the opt-in.
  await page.reload();
  await page.waitForSelector('#draftToggle');
  await expect(page.locator('#draftToggle')).toBeChecked();
  expect(await shownCount(page)).toBe(served.length);

  // Every served draft is labelled on the question itself. Pick the category with the
  // most drafts and queue all of it, so encountering a draft is guaranteed rather than
  // luck-of-the-shuffle.
  const byCat = {};
  for (const it of served) {
    byCat[it.category] = byCat[it.category] || { total: 0, draft: 0 };
    byCat[it.category].total += 1;
    if (it.status !== 'attested') byCat[it.category].draft += 1;
  }
  const [category, stats] = Object.entries(byCat).sort((a, b) => b[1].draft - a[1].draft)[0];
  expect(stats.draft, 'need a category containing drafts').toBeGreaterThan(0);

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

  expect(sawDraft, 'expected labelled drafts in the opted-in pool').toBeGreaterThan(0);
  // Proves the label is item-specific rather than painted on every card.
  expect(sawAttested, 'expected some attested items to carry no label').toBeGreaterThan(0);
});

test('opting back out restores the attested-only default', async ({ page, baseURL }) => {
  const { drafts, attested } = await bank(page, baseURL);
  expect(drafts.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#draftToggle');
  await page.check('#draftToggle');
  await expect(page.locator('.setup-draft-note')).toContainText('carry this label');
  await page.uncheck('#draftToggle');
  await expect(page.locator('.setup-draft-note')).toContainText('not served by default');
  expect(await shownCount(page)).toBe(attested.length);

  await page.reload();
  await page.waitForSelector('#draftToggle');
  await expect(page.locator('#draftToggle')).not.toBeChecked();
  expect(await shownCount(page)).toBe(attested.length);
});
