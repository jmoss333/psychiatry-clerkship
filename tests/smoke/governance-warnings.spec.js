import { test, expect } from '@playwright/test';


test('pending high-risk page shows and focuses one prominent warning', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/?page=cotw_index.md`, {
    waitUntil: 'domcontentloaded',
  });

  const alert = page.locator('#content > .governance-notice.pending-high');
  await expect(alert).toHaveCount(1);
  await expect(alert).toContainText('Pending faculty review');
  await expect(alert).toContainText('Verify decisions with your supervising clinician');
  await expect(alert).toBeFocused();
});

test('embedded and direct pending tools each show exactly one visible warning', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/?tool=one-patient-six-weeks.html`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.locator('#content > .governance-notice.pending-high')).toBeVisible();
  const frame = page.frameLocator('.toolframe');
  await expect(frame.locator('.surface-governance-direct')).toBeHidden();
  await expect(page.locator('.governance-notice.pending-high:visible')).toHaveCount(1);

  await page.goto(`${baseURL}/tools/one-patient-six-weeks.html`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('.surface-governance-pending-high')).toBeVisible();
  await expect(page.locator('.surface-governance-direct:visible')).toHaveCount(1);
});

test('moderate pending, reviewed, navigation, and search states stay distinct', async ({
  page,
  baseURL,
}) => {
  await page.goto(`${baseURL}/?page=anki.md`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.locator('#content > .governance-notice.pending-compact')).toBeVisible();
  await expect(page.locator('#content > .governance-notice.pending-high')).toHaveCount(0);
  const navBadge = page.locator('.navitem[data-f="anki.md"] .governance-badge');
  await expect(navBadge).toHaveText('Pending review');
  await expect(navBadge).toHaveAttribute('aria-label', 'Pending review');

  const search = page.locator('#search');
  await search.fill('Anki');
  await expect(page.locator('.result .governance-badge').first()).toHaveText(
    'Pending review',
  );

  await page.goto(`${baseURL}/?page=welcome.md`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('#content > .governance-notice.reviewed-receipt')).toContainText(
    /Reviewed by .+ · \d{4}-\d{2}-\d{2}/,
  );
});

test('governance fetch failure stays usable and never implies review', async ({
  page,
  baseURL,
}) => {
  await page.route('**/governance.json', route => route.abort());
  await page.goto(`${baseURL}/?page=welcome.md`, {
    waitUntil: 'domcontentloaded',
  });

  const notice = page.locator('#content > .governance-notice.unavailable');
  await expect(notice).toHaveText(
    'Review status unavailable—verify with faculty',
  );
  await expect(page.locator('.reviewed-receipt')).toHaveCount(0);
  await expect(page.locator('#content h1')).toBeVisible();
});
