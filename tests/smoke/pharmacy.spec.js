import { test, expect } from '@playwright/test';

// The rendered pharmacy page never shows a drug whose faculty review is invalid.
// The build ships only valid reviews (build_pharmacy_public.py); these checks prove the page
// also refuses a feed that was tampered with after the build, and shows nothing rather than
// something unchecked.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem('cw_srs_v1'));
});

async function feed(request, baseURL) {
  const res = await request.get(`${baseURL}/pharmacy_public.json`);
  expect(res.ok()).toBe(true);
  return res.json();
}

test('lists exactly the reviewed drugs in the shipped feed, each with its review stamp', async ({ page, request, baseURL }) => {
  const data = await feed(request, baseURL);
  expect(data.agents.length).toBeGreaterThan(0);
  await page.goto(`${baseURL}/tools/pharmacy.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('button.drug')).toHaveCount(data.agents.length);
  const first = data.agents[0];
  await page.locator(`#drug-${first.id}`).click();
  await expect(page.locator('.stamp')).toHaveText(
    `Faculty-reviewed by ${first.review.reviewer} · ${first.review.lastReviewed}`);
  const raw = JSON.stringify(data);
  expect(raw).not.toMatch(/reviewedFieldsHash|retrievalHash|provenance/);
});

for (const [label, tamper] of [
  ['a drug with no faculty review', (d) => { const x = { ...d.agents[0], id: 'unreviewed', generic: 'Unreviewedine' }; delete x.review; d.agents.push(x); }],
  ['a card for a drug that is not shown', (d) => { d.cards.push({ ...d.cards[0], id: 'RX#ghost#boxed', drug: 'ghost' }); }],
]) {
  test(`a tampered feed with ${label} shows nothing at all`, async ({ page, request, baseURL }) => {
    const data = await feed(request, baseURL);
    tamper(data);
    await page.route('**/pharmacy_public.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }));
    await page.goto(`${baseURL}/tools/pharmacy.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#status')).toContainText('could not be loaded');
    await expect(page.locator('button.drug')).toHaveCount(0);
    await expect(page.getByText('Unreviewedine')).toHaveCount(0);
  });
}

test('quiz grades write RX# cards to the shared store, and nothing else', async ({ page, request, baseURL }) => {
  const data = await feed(request, baseURL);
  const drug = data.agents.find((a) => data.cards.some((c) => c.drug === a.id));
  await page.goto(`${baseURL}/tools/pharmacy.html#${drug.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Quiz me on / }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  const srs = await page.evaluate(() => JSON.parse(window.localStorage.getItem('cw_srs_v1') || '{}'));
  const ids = Object.keys(srs.cards || {});
  expect(ids).toHaveLength(1);
  expect(ids[0]).toMatch(new RegExp(`^RX#${drug.id}#`));
  expect(srs.cards[ids[0]].due).toBeGreaterThan(Date.now());
  expect((srs.stats || {}).totalReviews || 0).toBe(0);
});

// Re-rendering the depth/family controls must not discard an in-progress quiz or
// strand keyboard users on the document body.
test('depth and family toggles preserve the current revealed quiz card and focus', async ({ page, request, baseURL }) => {
  const data = await feed(request, baseURL);
  const drug = data.agents.find((a) => data.cards.filter((c) => c.drug === a.id).length > 1);
  await page.goto(`${baseURL}/tools/pharmacy.html#${drug.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Quiz me on / }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await page.getByRole('button', { name: 'Show answer' }).click();
  const quiz = await page.locator('#quiz').textContent();
  expect(quiz).toContain('Card 2 of');
  const saved = await page.evaluate(() => localStorage.getItem('cw_srs_v1'));
  for (const control of [page.getByRole('button', { name: /^Resident depth:/ }),
    page.getByRole('button', { name: 'How would you explain this to a family?' })]) {
    await control.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#quiz')).toHaveText(quiz);
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('cw_srs_v1'))).toBe(saved);
    await page.keyboard.press('Space');
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#quiz')).toHaveText(quiz);
  }
});

test('scenario and comparison controls retain keyboard focus through updates', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/tools/pharmacy.html`, { waitUntil: 'domcontentloaded' });
  const scenario = page.locator('#scenarios button').first();
  await scenario.focus();
  await page.keyboard.press('Enter');
  await expect(scenario).toBeFocused();
  await expect(scenario).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(scenario).toBeFocused();
  await expect(scenario).toHaveAttribute('aria-pressed', 'false');
  const choices = page.locator('.cmp__btn');
  for (let i = 0; i < 2; i++) {
    await choices.nth(i).focus();
    await page.keyboard.press('Enter');
    await expect(choices.nth(i)).toBeFocused();
  }
  const toggle = page.locator('#grid-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#gridname')).toBeFocused();
  // Updating an already open grid must not steal focus from the selection.
  await choices.nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(choices.nth(2)).toBeFocused();
  await expect(page.locator('#grid th[scope="col"]')).toHaveCount(3);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeFocused();
  await expect(page.locator('#gridname')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(choices.first()).toBeFocused();
  await expect(page.locator('#cmpbar')).toBeEmpty();
});
