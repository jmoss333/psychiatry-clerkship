import { test, expect } from '@playwright/test';

// Risk-aware review status against the final built Front Door. Route-level notices still use the
// full governance ledger; Library and Search use the compact build-projected triplet. Targets are
// selected only from the rendered Library intersection so the test never chooses an intentionally
// unplaced nav-only route and then mistakes that absence for a governance regression.

function flattenNav(nav) {
  const out = [];
  for (const section of nav) {
    for (const item of (section.items || [])) out.push(item);
  }
  return out;
}

async function loadNavItems(request, baseURL) {
  const res = await request.get(`${baseURL}/nav.json`);
  const nav = await res.json();
  return flattenNav(nav);
}

async function seedCompleteSetup(page) {
  await page.addInitScript(() => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'library', viewWeek: 1,
    }));
  });
}

async function loadPlacedNavItems(page, request, baseURL) {
  await seedCompleteSetup(page);
  await page.goto(`${baseURL}/?tab=library`, { waitUntil: 'domcontentloaded' });
  const placed = new Set(await page.locator('.fd-collink[data-fd-open]').evaluateAll(controls => (
    controls.map(control => control.getAttribute('data-fd-open'))
  )));
  return (await loadNavItems(request, baseURL)).filter(item => placed.has(item.f));
}

function findItem(items, predicate, description) {
  const item = items.find(predicate);
  if (!item) {
    throw new Error(
      `no nav item matches "${description}" — this site has no governance entry for that state`,
    );
  }
  return item;
}

test.describe('risk-aware review status (shared shell)', () => {
  test('pending high-risk Library item shows one alert and focuses it after a normal route change', async ({
    page, request, baseURL,
  }) => {
    const items = await loadPlacedNavItems(page, request, baseURL);
    const target = findItem(
      items,
      (it) => it.governance && it.governance.status === 'pending' && it.governance.riskLevel === 'high',
      'pending high-risk Library item',
    );
    const url = target.k === 'tool'
      ? `${baseURL}/?tool=${encodeURIComponent(target.f)}`
      : `${baseURL}/?page=${encodeURIComponent(target.f)}`;

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const alert = page.locator('.fd-article__body > .governance-notice.pending-high');
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText('Pending faculty review');
    await expect(alert).toBeFocused();
  });

  test('pending high-risk tool embedded in the shell shows exactly one visible alert', async ({
    page, request, baseURL,
  }) => {
    const items = await loadPlacedNavItems(page, request, baseURL);
    const target = findItem(
      items,
      (it) => it.k === 'tool' && it.governance && it.governance.status === 'pending' && it.governance.riskLevel === 'high',
      'pending high-risk tool',
    );

    await page.goto(`${baseURL}/?tool=${encodeURIComponent(target.f)}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.fd-article__body > .governance-notice.pending-high')).toBeVisible();
    const frame = page.frameLocator('.toolframe');
    await expect(frame.locator('.surface-governance-direct')).toBeHidden();
    await expect(page.locator('.governance-notice.pending-high:visible')).toHaveCount(1);

    const src = await page.locator('.toolframe').getAttribute('src');
    expect(src || '').toMatch(/[?&]governed=1(&|$)/);
  });

  test('the same tool visited directly (not embedded) shows its own internal alert', async ({
    page, request, baseURL,
  }) => {
    const items = await loadPlacedNavItems(page, request, baseURL);
    const target = findItem(
      items,
      (it) => it.k === 'tool' && it.governance && it.governance.status === 'pending' && it.governance.riskLevel === 'high',
      'pending high-risk tool',
    );

    await page.goto(`${baseURL}/tools/${target.f}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.surface-governance-pending-high')).toBeVisible();
    await expect(page.locator('.surface-governance-direct:visible')).toHaveCount(1);
  });

  test('pending moderate/low item shows a compact status, never an alert', async ({
    page, request, baseURL,
  }) => {
    const items = await loadPlacedNavItems(page, request, baseURL);
    const target = findItem(
      items,
      (it) => it.governance && it.governance.status === 'pending' && it.governance.riskLevel !== 'high',
      'pending moderate/low item',
    );
    const url = target.k === 'tool'
      ? `${baseURL}/?tool=${encodeURIComponent(target.f)}`
      : `${baseURL}/?page=${encodeURIComponent(target.f)}`;

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('.fd-article__body > .governance-notice.pending-compact')).toBeVisible();
    await expect(page.locator('.fd-article__body > .governance-notice.pending-high')).toHaveCount(0);
  });

  test('reviewed item shows a reviewer/date receipt', async ({ page, request, baseURL }) => {
    const items = await loadPlacedNavItems(page, request, baseURL);
    const target = findItem(
      items,
      (it) => it.k === 'md' && it.governance && it.governance.status === 'reviewed',
      'reviewed page',
    );

    await page.goto(`${baseURL}/?page=${encodeURIComponent(target.f)}`, { waitUntil: 'domcontentloaded' });

    const receipt = page.locator('.fd-article__body > .governance-notice.reviewed-receipt');
    await expect(receipt).toContainText(/Reviewed by .+ · \d{4}-\d{2}-\d{2}/);
  });

  test('an aborted governance.json request stays usable and never implies review', async ({
    page, request, baseURL,
  }) => {
    await seedCompleteSetup(page);
    const items = await loadNavItems(request, baseURL);
    const target = findItem(items, (it) => it.k === 'md', 'any page');

    await page.route('**/governance.json', (route) => route.abort());
    await page.goto(`${baseURL}/?page=${encodeURIComponent(target.f)}`, { waitUntil: 'domcontentloaded' });

    const notice = page.locator('.fd-article__body > .governance-notice.unavailable');
    await expect(notice).toHaveText('Review status unavailable—verify with faculty');
    await expect(page.locator('.governance-notice.reviewed-receipt')).toHaveCount(0);
    await expect(page.locator('#content h1')).toBeVisible();
  });

  test('pending nav and search rows expose accessible status text, not color alone', async ({
    page, request, baseURL,
  }) => {
    const items = await loadPlacedNavItems(page, request, baseURL);
    const target = findItem(
      items,
      (it) => it.governance && it.governance.status === 'pending',
      'any pending item',
    );
    const label = target.governance.riskLevel === 'high' ? 'Pending review · High risk' : 'Pending review';

    const libraryBadge = page.locator(
      `.fd-collink[data-fd-open="${target.f}"] .governance-badge`,
    );
    await expect(libraryBadge).toHaveText(label);
    await expect(libraryBadge).toHaveAttribute('aria-label', label);

    await page.locator('[data-fd-search]').click();
    await page.locator('.fd-searchpanel__input').fill(target.f);
    const exactResults = page.locator('.fd-result[data-fd-open]');
    await expect(exactResults).toHaveCount(1);
    await expect(exactResults).toHaveAttribute('data-fd-open', target.f);
    const resultBadge = page.locator(
      `.fd-result[data-fd-open="${target.f}"] .governance-badge`,
    );
    await expect(resultBadge).toHaveText(label);
    await expect(resultBadge).toHaveAttribute('aria-label', label);
  });
});
