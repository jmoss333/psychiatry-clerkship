import { test, expect } from '@playwright/test';
import { isResidentProject } from './audience.js';

const RELEASE_SHA = process.env.RELEASE_SHA;

test('production release journey binds the Path and Care interactions to the served revision', async ({ page }, testInfo) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  const resident = isResidentProject(testInfo.project.name);
  const role = resident ? 'pgy1' : 'student';
  const weekCount = resident ? 4 : 6;
  const destinationWeek = resident ? 4 : 2;
  const key = resident ? 'End' : 'ArrowRight';
  const intent = resident ? 'family-conversation' : 'services';
  const announcement = resident
    ? 'Selected Prepare for a family conversation. Best starting point: Patient and family education.'
    : 'Selected Find community services. Best starting point: Find services and community supports.';

  await page.addInitScript(({ seededRole }) => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: seededRole,
      tab: 'today',
      week: 1,
      viewWeek: 1,
    }));
  }, { seededRole: role });

  await page.goto('/?tab=path', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
  await expect(page.locator('[data-fd-view-week]')).toHaveCount(weekCount);
  const firstWeek = page.locator('[data-fd-view-week="1"]');
  await firstWeek.click();
  await expect(firstWeek).toBeFocused();
  await page.keyboard.press(key);
  const destination = page.locator(`[data-fd-view-week="${destinationWeek}"]`);
  await expect(destination).toBeFocused();
  await expect(destination).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#fd-path-detail .fd-eyebrow')).toHaveText(`Week ${destinationWeek}`);

  await page.locator('[data-fd-tab="care"]:visible').click();
  await expect(page.locator('.fd-care-page')).toBeVisible();
  await page.locator(`[data-fd-care-intent="${intent}"]`).click();
  await expect(page.locator('#careNavigatorStatus')).toHaveText(announcement);
  await expect(page.locator('.fd-care-navigator__result')).toBeVisible();

  if (RELEASE_SHA) {
    const response = await page.request.get('/tool-governance.json', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    const revisions = new Set(manifest.items.map(item => item.source.revision));
    expect([...revisions]).toEqual([RELEASE_SHA]);
  }
  expect(runtimeErrors).toEqual([]);
});
