/**
 * Deterministic resident Front Door visual contract.
 *
 * Baselines are generated only by the repository's Ubuntu/Chromium workflow
 * ("Refresh visual baselines"). This file deliberately does not support local macOS
 * baseline generation.
 *
 * WHAT THIS FILE COVERS, AND WHY IT IS SHAPED THIS WAY
 *
 * Until 2026-09-04 the entire baseline set was four images covering two routes: the
 * Front Door root and `?page=t_mood.md`. That was discovered the hard way — PR #506
 * added a block to all six week pages, and the smoke job went GREEN, because no week
 * page had ever been baselined.
 *
 * The deeper problem was that `t_mood.md` is not a representative content page. It is
 * close to the least representative one available: measured against the built resident
 * site, it has ZERO `<h2>`s, no tables, no audio, no video, no iframe and no
 * disclosure element. In particular it carries a crisis block, and
 * spa_index.html's makeCollapsible() BAILS OUT on `.crisis-block-hook` — so the
 * page that stood in for 86 content pages was one where the collapse machinery is
 * switched off by design.
 *
 * Measured over the 86 built resident content pages:
 *   - 36 render through makeCollapsible() (>= 4 h2 and no crisis hook) — sections,
 *     chevrons, aria-expanded, and the Expand all / Collapse all toolbar. ZERO of
 *     those were baselined.
 *   - 23 carry a crisis block (the makeCollapsible bail-out path) — covered by t_mood.
 *   - 6 carry a build-injected <details> disclosure and an inline <audio>. ZERO
 *     were baselined.
 *
 * So the set below baselines one page per STRUCTURAL ARCHETYPE rather than one
 * arbitrary page. Each entry states the machinery it exists to protect, and its
 * settle() ASSERTS that machinery is actually present before the screenshot is
 * taken. That assertion is the load-bearing part: without it, machinery that
 * silently stopped running would simply be re-baselined as the new normal on the
 * next refresh, and the gate would quietly protect nothing.
 *
 * Known limitation, deliberately not changed here: playwright.config.js sets
 * `maxDiffPixelRatio: 0.20` for every snapshot in the repo. That is a loose gate,
 * and it is especially loose on a short page. Tightening it would re-open all four
 * pre-existing baselines, so it is its own reviewed decision.
 */

import { test, expect } from '@playwright/test';

const FROZEN_NOW = new Date('2026-08-17T12:00:00-04:00');
const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile', width: 390, height: 844 },
];

async function seedResident(page, tab = 'today') {
  await page.clock.setFixedTime(FROZEN_NOW);
  await page.addInitScript(({ initialTab }) => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'pgy1', tab: initialTab, viewWeek: 1,
    }));
    localStorage.setItem('cw_progress_v1', JSON.stringify({
      'orientation.md': { done: true, at: '2026-08-17' },
    }));
    localStorage.setItem('cw_theme', 'light');
  }, { initialTab: tab });
}

async function waitForStableFrontDoor(page, surface) {
  await expect(page.locator(surface)).toBeVisible();
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

async function waitForStableReader(page) {
  await waitForStableFrontDoor(page, '.fd-reader .fd-article__body');
  await expect(page.locator('.fd-reader .governance-notice.reviewed-receipt')).toBeVisible();
  await expect(page.locator('.fd-reader .governance-notice.unavailable')).toHaveCount(0);
}

/**
 * One representative page per structural archetype. `page` is a route, `settle`
 * proves the archetype's machinery ran. Adding a route here costs two images.
 */
const READER_ARCHETYPES = [
  {
    slug: 'sections',
    page: 'osce.md',
    title: 'collapsed sections + tables',
    // Chosen over evidence_inpatient.md (14 h2, 21 tables) which exercises the same
    // machinery at four times the byte size: a larger page means more unrelated
    // content churn re-opening this baseline for reasons that have nothing to do
    // with the collapse UI. osce.md is 9 h2 / 6 tables / ~10KB and carries no audio,
    // video or iframe, so it has no nondeterministic element to mask.
    async settle(page) {
      // The collapse pass must have actually run — sections plus its toolbar.
      await expect(page.locator('.fd-reader .sec-c').first()).toBeVisible();
      await expect(page.locator('.fd-reader .sec-toolbar')).toBeVisible();
      // Tables live inside collapsed section bodies, so they are present in the DOM
      // but not visible. Assert on count, never visibility. The screenshot captures
      // the COLLAPSED default, which is what a learner lands on; the last section is
      // force-opened by makeCollapsible and supplies the one expanded body.
      expect(await page.locator('.fd-reader table').count()).toBeGreaterThan(0);
    },
  },
  {
    slug: 'disclosure',
    page: 'week5.md',
    title: 'build-injected disclosure block + inline audio',
    // The archetype PR #506 introduced and nothing covered. Week pages have zero h2s,
    // so makeCollapsible never touches them and the <details> is the only disclosure
    // on the page — which is exactly why a regression here would be invisible.
    async settle(page) {
      const block = page.locator('.fd-reader details.pairing-block');
      await expect(block).toHaveCount(1);
      // Baseline the block OPEN. Closed, the screenshot proves only that a summary
      // line exists; open, it covers the rendered Read/Listen/Practice rows, which is
      // the part a build change could actually break.
      await block.evaluate((el) => { el.open = true; });
      await expect(block.locator('audio')).toHaveCount(1);
      expect(await block.locator('a[href^="?page="]').count()).toBeGreaterThan(0);
    },
  },
];

for (const viewport of VIEWPORTS) {
  test.describe(`resident Front Door visual @ ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('Today first viewport', async ({ page, baseURL }) => {
      await seedResident(page);
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
      await waitForStableFrontDoor(page, '.fd-today');
      await expect(page).toHaveScreenshot(`front-door-today-${viewport.label}.png`);
    });

    test('Reader first viewport', async ({ page, baseURL }) => {
      await seedResident(page, 'library');
      await page.goto(`${baseURL}/?page=t_mood.md`, { waitUntil: 'domcontentloaded' });
      await waitForStableReader(page);
      await expect(page).toHaveScreenshot(`front-door-reader-${viewport.label}.png`);
    });

    for (const archetype of READER_ARCHETYPES) {
      test(`Reader archetype — ${archetype.title}`, async ({ page, baseURL }) => {
        await seedResident(page, 'library');
        await page.goto(`${baseURL}/?page=${archetype.page}`, { waitUntil: 'domcontentloaded' });
        await waitForStableReader(page);
        await archetype.settle(page);
        await expect(page).toHaveScreenshot(`reader-${archetype.slug}-${viewport.label}.png`);
      });
    }
  });
}
