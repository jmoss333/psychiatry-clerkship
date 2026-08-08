import { test, expect } from '@playwright/test';

// Ward question capture: the affordance must be reachable on EVERY route at EVERY breakpoint.
// That is the whole reason there are two mount points — .mobile-chrome is display:none above
// 820px, aside#side goes off-canvas + inert below it, and .tl-dock/.tl-bar are torn down by
// __clearDock() on every show() and never remount on the special or tool branches. Those four
// route classes are exactly what T9 walks.
//
// No page.route in this file. The config sets serviceWorkers:'block' for every project except
// the dedicated `offline` one, but route interception is blind once a SW controls the page, so
// the two must never be combined here.

const ROUTES = [
  ['home (special branch)', '/?page=__home__'],
  ['markdown page', '/?page=t_mood.md'],
  ['tool route', '/?tool=review.html'],
  ['learning path', '/?page=__path__'],
];

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test.describe('capture affordance is route- and breakpoint-persistent', () => {
  for (const [label, url] of ROUTES) {
    test(`T9 mobile: capture button is usable on ${label}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(url);
      const btn = page.locator('#captureBtnMobile');
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      await btn.click();
      await expect(page.locator('.cap-sheet')).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      await page.locator('#capCancel').click();
      await expect(page.locator('.cap-sheet')).toHaveCount(0);
    });

    test(`T9 desktop: capture button is usable on ${label}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(url);
      // The mobile mount is inside a display:none ancestor at this width — that is by design.
      await expect(page.locator('#captureBtnMobile')).toBeHidden();
      const btn = page.locator('#captureBtnDesk');
      await expect(btn).toBeVisible();
      await btn.click();
      await expect(page.locator('.cap-sheet')).toBeVisible();
      await page.locator('#capCancel').click();
      await expect(page.locator('.cap-sheet')).toHaveCount(0);
    });
  }
});

test('the sheet traps focus and returns it to the invoker that opened it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?page=__home__');
  await page.locator('#captureBtnMobile').click();
  await expect(page.locator('#capText')).toBeFocused();
  // Escape closes and focus goes back to the recorded invoker, not to <body>.
  await page.keyboard.press('Escape');
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect(page.locator('#captureBtnMobile')).toBeFocused();
});

test('a saved question survives reload and reaches the home triage card', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?page=__home__');
  await page.locator('#captureBtnMobile').click();
  await page.locator('#capText').fill('why clozapine and not another antipsychotic');
  await page.locator('#capSave').click();
  // list inside the sheet updates without a reload
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  await page.locator('#capCancel').click();
  await page.reload();
  const card = page.locator('.hm-sec', { hasText: 'Questions from the unit' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('why clozapine and not another antipsychotic');
});

test('the interstitial holds a save that looks like it carries patient details', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?page=__home__');
  await page.locator('#captureBtnMobile').click();
  // capture-local ward-location rule: the shared PHI_PATTERNS deliberately do not carry it
  await page.locator('#capText').fill('the guy in room 302 keeps refusing meds why');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-phi')).toBeVisible();
  await expect(page.locator('.cap-list li')).toHaveCount(0);
  // Edit returns to the textarea without writing
  await page.locator('#capHoldEdit').click();
  await expect(page.locator('.cap-phi')).toHaveCount(0);
  await expect(page.locator('.cap-list li')).toHaveCount(0);
  // the override is explicit and only then does it write
  await page.locator('#capSave').click();
  await page.locator('#capHoldSave').click();
  await expect(page.locator('.cap-list li')).toHaveCount(1);
});

test('a legitimate clinical question full of numbers is not held', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?page=__home__');
  await page.locator('#captureBtnMobile').click();
  await page.locator('#capText').fill('why do we stop clozapine at QTc over 500');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-phi')).toHaveCount(0);
  await expect(page.locator('.cap-list li')).toHaveCount(1);
});

test('T12: a capture is never exported with the study data', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?page=__home__');
  await page.locator('#captureBtnDesk').click();
  await page.locator('#capText').fill('why clozapine here');
  await page.locator('#capSave').click();
  await page.locator('#capCancel').click();
  const payload = await page.evaluate(() => {
    let captured = null;
    const realBlob = window.Blob;
    // eslint-disable-next-line func-names
    window.Blob = function (parts, opts) { captured = String(parts[0]); return new realBlob(parts, opts); };
    const a = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {};
    window.exportStudy();
    window.HTMLAnchorElement.prototype.click = a;
    window.Blob = realBlob;
    return captured;
  });
  expect(payload).toContain('clerkship-study-v2');
  expect(payload).not.toContain('cw_capture_v1');
  expect(payload).not.toContain('why clozapine here');
});

// T10 guard: the mobile mount replaced an empty 44x44 spacer in .mobile-chrome's third grid
// column, so it must not introduce horizontal overflow at the narrowest supported width, and
// must not join .tl-bar (whose data-tool item counts are pinned in visual-regression.spec.js).
test('T10: the mobile mount adds no horizontal overflow and stays out of .tl-bar', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/?page=t_mood.md');
  await expect(page.locator('#captureBtnMobile')).toBeVisible();
  await expect(page.locator('.tl-bar #captureBtnMobile')).toHaveCount(0);
  await expect(page.locator('.tl-bar__item[data-tool]')).toHaveCount(3);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
