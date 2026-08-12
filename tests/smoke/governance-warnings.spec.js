import { test, expect } from '@playwright/test';

// Risk-aware review status (task-4-brief.md, Step 7). Every scenario discovers its target
// slug from the site's own nav.json rather than hardcoding a filename: Task 6's real ledger
// migration (still pending — see the plan's CRITICAL production-state facts) has not decided
// which real slugs end up pending/reviewed/high/moderate, so a hardcoded slug would be
// meaningless against a real build and would silently rot against a fixture. This also means
// the spec runs unmodified against either kind of site, once Task 7 wires it into
// playwright.config.js's nav-ms3/nav-res projects (NOT done by this task, per the brief).
//
// Local verification today (no committed fixture — see task-4-report.md "How the Playwright
// spec was driven" for the exact recipe): a synthetic ms3-shaped site built with the REAL
// surface_governance.py functions (Task 1/3), served with `python3 -m http.server`, driven via
// a throwaway --config pointed at that baseURL. This file is otherwise unchanged by that setup.

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
  test('pending high-risk page shows one alert and focuses it after a normal route change', async ({
    page, request, baseURL,
  }) => {
    const items = await loadNavItems(request, baseURL);
    const target = findItem(
      items,
      (it) => it.k === 'md' && it.governance && it.governance.status === 'pending' && it.governance.riskLevel === 'high',
      'pending high-risk page',
    );

    await page.goto(`${baseURL}/?page=${encodeURIComponent(target.f)}`, { waitUntil: 'domcontentloaded' });

    const alert = page.locator('#content > .governance-notice.pending-high');
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText('Pending faculty review');
    await expect(alert).toBeFocused();
  });

  test('pending high-risk tool embedded in the shell shows exactly one visible alert', async ({
    page, request, baseURL,
  }) => {
    const items = await loadNavItems(request, baseURL);
    const target = findItem(
      items,
      (it) => it.k === 'tool' && it.governance && it.governance.status === 'pending' && it.governance.riskLevel === 'high',
      'pending high-risk tool',
    );

    await page.goto(`${baseURL}/?tool=${encodeURIComponent(target.f)}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#content > .governance-notice.pending-high')).toBeVisible();
    const frame = page.frameLocator('.toolframe');
    await expect(frame.locator('.surface-governance-direct')).toBeHidden();
    await expect(page.locator('.governance-notice.pending-high:visible')).toHaveCount(1);

    const src = await page.locator('.toolframe').getAttribute('src');
    expect(src || '').toMatch(/[?&]governed=1(&|$)/);
  });

  test('the same tool visited directly (not embedded) shows its own internal alert', async ({
    page, request, baseURL,
  }) => {
    const items = await loadNavItems(request, baseURL);
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
    const items = await loadNavItems(request, baseURL);
    const target = findItem(
      items,
      (it) => it.governance && it.governance.status === 'pending' && it.governance.riskLevel !== 'high',
      'pending moderate/low item',
    );
    const url = target.k === 'tool'
      ? `${baseURL}/?tool=${encodeURIComponent(target.f)}`
      : `${baseURL}/?page=${encodeURIComponent(target.f)}`;

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#content > .governance-notice.pending-compact')).toBeVisible();
    await expect(page.locator('#content > .governance-notice.pending-high')).toHaveCount(0);
  });

  test('reviewed item shows a reviewer/date receipt', async ({ page, request, baseURL }) => {
    const items = await loadNavItems(request, baseURL);
    const target = findItem(
      items,
      (it) => it.k === 'md' && it.governance && it.governance.status === 'reviewed',
      'reviewed page',
    );

    await page.goto(`${baseURL}/?page=${encodeURIComponent(target.f)}`, { waitUntil: 'domcontentloaded' });

    const receipt = page.locator('#content > .governance-notice.reviewed-receipt');
    await expect(receipt).toContainText(/Reviewed by .+ · \d{4}-\d{2}-\d{2}/);
  });

  test('an aborted governance.json request stays usable and never implies review', async ({
    page, request, baseURL,
  }) => {
    const items = await loadNavItems(request, baseURL);
    const target = findItem(items, (it) => it.k === 'md', 'any page');

    await page.route('**/governance.json', (route) => route.abort());
    await page.goto(`${baseURL}/?page=${encodeURIComponent(target.f)}`, { waitUntil: 'domcontentloaded' });

    const notice = page.locator('#content > .governance-notice.unavailable');
    await expect(notice).toHaveText('Review status unavailable—verify with faculty');
    await expect(page.locator('.governance-notice.reviewed-receipt')).toHaveCount(0);
    await expect(page.locator('#content h1')).toBeVisible();
  });

  test('pending nav and search rows expose accessible status text, not color alone', async ({
    page, request, baseURL,
  }) => {
    const items = await loadNavItems(request, baseURL);
    const target = findItem(
      items,
      (it) => it.governance && it.governance.status === 'pending',
      'any pending item',
    );
    const label = target.governance.riskLevel === 'high' ? 'Pending review · High risk' : 'Pending review';

    await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });

    const navBadge = page.locator(`.navitem[data-f="${target.f}"] .governance-badge`);
    await expect(navBadge).toHaveText(label);
    await expect(navBadge).toHaveAttribute('aria-label', label);

    const search = page.locator('#search');
    await search.fill(target.t);
    const resultBadge = page.locator('.result .governance-badge').first();
    await expect(resultBadge).toHaveText(label);
    await expect(resultBadge).toHaveAttribute('aria-label', label);
  });
});
