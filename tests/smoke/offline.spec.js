/**
 * Check — Offline shell.
 *
 * Verifies the service worker registered by the SW_REGISTER snippet
 * (13_Faculty_Resources/_automation/site_build/sw_register.js, emitted per-site by
 * common.py emit_service_worker() as sw.js) actually delivers on the offline promise made
 * by the Start-page A2HS sentence: once the worker has installed and taken control, the
 * shell keeps working with the network cut.
 *
 * Runs against the MS3 site only (nav-ms3's baseURL, port 4200) via playwright.config.js's
 * `offline` project — the shell/SW code is identical across sites, so one site is sufficient
 * and keeps the check fast.
 *
 * HARD FAIL: SW never controls the page, the versioned precache never appears, or a
 * precached page/tool can't be reached with the browser context offline.
 */

import { test, expect } from '@playwright/test';

test('service worker installs, takes control, and serves the shell offline', async ({ page, context, baseURL }) => {
  // 1. First load: registerClerkshipSW() (sw_register.js) fires and registers /sw.js.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => navigator.serviceWorker.ready);

  // 2. Reload so the now-installed worker becomes the CONTROLLING worker for this page
  // (a page that merely registered the SW in its own load is not yet controlled by it —
  // controllerchange/clients only take effect from the next navigation).
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => navigator.serviceWorker.ready);

  const controller = await page.evaluate(() => !!navigator.serviceWorker.controller);
  expect(controller, 'navigator.serviceWorker.controller must be set after the post-registration reload').toBe(true);

  // 3. The versioned precache (cw-precache-<VERSION>, see sw_template.js) must exist and be
  // non-empty — this is the artifact that makes offline navigation possible at all.
  const precache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cacheKey = keys.find((k) => k.indexOf('cw-precache-') === 0);
    if (!cacheKey) return { cacheKey: null, count: 0 };
    const cache = await caches.open(cacheKey);
    const entries = await cache.keys();
    return { cacheKey, count: entries.length };
  });
  expect(precache.cacheKey, 'a cw-precache-<VERSION> cache must exist').not.toBeNull();
  expect(precache.count, 'the precache must contain entries').toBeGreaterThan(0);

  // 4. Cut the network at the browser-context level (real offline, not a route mock — this
  // is what a plane-mode / A2HS learner actually experiences) and confirm the shell still
  // serves a content page and a tool from cache.
  await context.setOffline(true);
  try {
    await page.goto(`${baseURL}/?page=t_mood.md`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#content');
        return !!el && !el.querySelector('.skel') && !el.querySelector('.error');
      },
      { timeout: 15_000 },
    );
    const contentText = await page.locator('#content').innerText();
    expect(contentText.trim().length, 'offline content page must render real text, not the error/skeleton state')
      .toBeGreaterThan(80);

    await page.goto(`${baseURL}/?tool=mse.html`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const iframe = page.locator('#content iframe.toolframe');
    await expect(iframe, 'offline tool route must render the tool iframe from cache').toBeVisible({ timeout: 10_000 });
  } finally {
    // Always restore network state — this context may be reused by later tests/projects.
    await context.setOffline(false);
  }
});
