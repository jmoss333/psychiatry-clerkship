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
