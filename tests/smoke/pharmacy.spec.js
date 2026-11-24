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

test('reading medication buttons preserve prose and skip protected content', async ({ page }) => {
  const frontdoor = new URL('../../13_Faculty_Resources/_automation/site_build/frontdoor/', import.meta.url);
  await page.setContent(`<div class="fd-article__body">
    <h2>Alpha heading</h2>
    <p id="first">Try <em>ALPHA</em> and <b>Beta</b> XR. Repeat Alpha and B.</p>
    <section class="fd-guide-section"><p class="fd-guide-lead"><strong>Alpha</strong> — Beta.</p></section>
    <p id="bounds">pre<strong>Alpha</strong> and <em>Beta</em>-like. <a href="#alpha">Alpha</a>
      <button>Beta</button> <cite>Alpha</cite> <code>Beta</code> <sup>Alpha</sup></p>
    <ul><li><strong>Alpha</strong><ul><li>Beta XR</li></ul></li></ul>
    <section class="sec-c"><h2 class="sec-h"><button>▸ References</button></h2>
      <div class="sec-b"><ol><li>Alpha, Beta. Journal.</li></ol></div></section>
    <section class="fd-guide-section"><h2>Teaching</h2><p>Alpha.</p>
      <h3>Selected citations</h3><p>Beta XR et al.</p><h4>Trials</h4><ul><li>Alpha.</li></ul>
      <h3>Return to teaching</h3><p>Beta XR.</p></section>
    <div class="table-scroll"><div class="fd-guide-table-controls"><button>Alpha</button></div>
      <div class="table-scroll-viewport" role="region" tabindex="0"><table><thead><tr><th>Alpha</th></tr></thead>
        <tbody><tr><td>Beta XR</td></tr></tbody></table></div>
      <div class="fd-guide-table-rows" hidden><dl><dt>Alpha</dt><dd>Beta XR</dd></dl></div></div>
    <p class="footnote">Alpha.</p><section class="bedside-case"><p>Alpha.</p><button>Beta</button></section>
    <details><summary>Alpha</summary><p>Beta</p></details><div contenteditable><p>Alpha</p></div>
  </div>`);
  for (const name of ['fd_search.js', 'fd_guide.js']) {
    await page.addScriptTag({ path: new URL(name, frontdoor).pathname });
  }
  const body = page.locator('.fd-article__body');
  const original = await body.textContent();
  const apply = () => body.evaluate(el => fdLinkReadingMedications(el, fdSearchPharmacyNames([
    { id: 'alpha', generic: 'Alpha' }, { id: 'beta', generic: 'Beta XR', brands: ['B', 'Beta'] },
  ])));
  await apply();
  const buttons = body.locator('[data-fd-reading-pharmacy]');
  expect(await buttons.allTextContents()).toEqual([
    'ALPHA', 'Beta XR', 'Beta', 'Alpha', 'Beta XR', 'Alpha', 'Beta XR', 'Beta XR', 'Beta XR',
  ]);
  await expect(buttons.first()).toHaveAccessibleName('ALPHA — open Pharmacy card');
  await expect(buttons.first()).toHaveAttribute('type', 'button');
  await expect(buttons.first()).toHaveAttribute('data-fd-reading-pharmacy', 'alpha');
  await expect(body.locator('#first em')).toHaveText('ALPHA');
  await expect(body.locator('#first button b')).toHaveText('Beta');
  expect(await body.textContent()).toBe(original);
  const rendered = await body.innerHTML();
  await apply();
  expect(await body.innerHTML()).toBe(rendered);
});
