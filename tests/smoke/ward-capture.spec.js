import { test, expect } from '@playwright/test';

// Ward question capture: one stable Front Door launcher must remain reachable on every learner
// surface and breakpoint. Today alone also owns the triage card; navigation may replace #content
// but must never replace the launcher mount.
//
// No page.route in this file. The config sets serviceWorkers:'block' for every project except
// the dedicated `offline` one, but route interception is blind once a SW controls the page, so
// the two must never be combined here.

const ROUTES = [
  ['Today tab', '/'],
  ['Path tab', '/?tab=path'],
  ['Library tab', '/?tab=library'],
  ['markdown Reader', '/?page=orientation.md'],
  ['tool Reader', '/?tool=question-bank-practice.html'],
  ['internal Progress', '/?page=__progress__'],
];

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const captureLauncher = (page) => page.locator('.fd-capture-launch--global[data-capture-open]');

async function seedCompleteSetup(page) {
  await page.addInitScript(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false,
    }));
  });
}

test.beforeEach(async ({ page }) => seedCompleteSetup(page));

test.describe('capture affordance is route- and breakpoint-persistent', () => {
  for (const [label, url] of ROUTES) {
    test(`T9 mobile: capture button is usable on ${label}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(url);
      const btn = captureLauncher(page);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveCount(1);
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
      const btn = captureLauncher(page);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveCount(1);
      await btn.click();
      await expect(page.locator('.cap-sheet')).toBeVisible();
      await page.locator('#capCancel').click();
      await expect(page.locator('.cap-sheet')).toHaveCount(0);
    });
  }
});

test('the sheet traps focus and returns it to the invoker that opened it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await expect(page.locator('#capText')).toBeFocused();
  // Escape closes and focus goes back to the recorded invoker, not to <body>.
  await page.keyboard.press('Escape');
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect(captureLauncher(page)).toBeFocused();
});

test('the capture sheet renders the exact no-PHI warning', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await expect(page.locator('.cap-warn')).toHaveText(
    'The question, not the patient. No names, initials, room or bed numbers, dates, or MRNs — write what you want to understand, not who you saw. Stays on this device.',
  );
});

test('a saved question survives reload and reaches the home triage card', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('why clozapine and not another antipsychotic');
  await page.locator('#capSave').click();
  // list inside the sheet updates without a reload
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  await page.locator('#capCancel').click();
  await page.reload();
  const card = page.locator('.fd-capture', { hasText: 'Questions from the unit' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('why clozapine and not another antipsychotic');
});

test('Today capture clears a prior Reader context without corrupting the learner bookmark', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?page=orientation.md');
  await expect(page.locator('.fd-article')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_last'))).toBe('orientation.md');

  await page.locator('[data-fd-home]').first().click();
  await expect(page.locator('.fd-today')).toBeVisible();
  // Use the pre-cutover-compatible hook here so the RED run reaches the stale-context bug;
  // the route matrix above independently requires the new stable launcher class.
  await page.locator('[data-capture-open]').first().click();
  await page.locator('#capText').fill('what should I review after rounds');
  await page.locator('#capSave').click();

  const saved = await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('cw_capture_v1')).items;
    return { ctx: items[items.length - 1].ctx, bookmark: localStorage.getItem('cw_last') };
  });
  expect(saved).toEqual({ ctx: null, bookmark: 'orientation.md' });
});

test('the interstitial holds a save that looks like it carries patient details', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
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
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('why do we stop clozapine at QTc over 500');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-phi')).toHaveCount(0);
  await expect(page.locator('.cap-list li')).toHaveCount(1);
});

test('T12: a capture is never exported with the study data', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await captureLauncher(page).click();
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

test('T10: the stable launcher adds no horizontal overflow and stays outside the Reader action bar', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/?page=t_mood.md');
  await expect(captureLauncher(page)).toBeVisible();
  await expect(page.locator('.fd-actionbar .fd-capture-launch--global')).toHaveCount(0);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});

test('the global launcher occupies its own layout row instead of covering learner content', async ({ page }) => {
  const cases = [
    { label: 'Today', url: '/', ready: '.fd-today' },
    { label: 'Reader', url: '/?page=t_mood.md', ready: '.fd-reader .fd-article__body' },
  ];
  for (const viewport of [NARROW, PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    for (const surface of cases) {
      await page.goto(surface.url);
      await expect(page.locator(surface.ready)).toBeVisible();
      await expect(captureLauncher(page)).toBeVisible();
      const geometry = await page.evaluate(() => {
        const mount = document.querySelector('#fdCaptureMount');
        const button = mount.querySelector('.fd-capture-launch--global');
        const content = document.querySelector('#content');
        const mountBox = mount.getBoundingClientRect();
        const buttonBox = button.getBoundingClientRect();
        const contentBox = content.getBoundingClientRect();
        const overlaps = buttonBox.left < contentBox.right && buttonBox.right > contentBox.left
          && buttonBox.top < contentBox.bottom && buttonBox.bottom > contentBox.top;
        return {
          position: getComputedStyle(mount).position,
          mountBottom: mountBox.bottom,
          buttonTop: buttonBox.top,
          buttonWidth: buttonBox.width,
          buttonHeight: buttonBox.height,
          contentTop: contentBox.top,
          overlaps,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(['static', 'relative'], `${viewport.width}px ${surface.label} mount position`)
        .toContain(geometry.position);
      expect(geometry.overlaps, `${viewport.width}px ${surface.label} content overlap`).toBe(false);
      expect(geometry.mountBottom, `${viewport.width}px ${surface.label} mount order`)
        .toBeLessThanOrEqual(geometry.contentTop + 0.5);
      expect(geometry.buttonTop).toBeGreaterThanOrEqual(0);
      expect(geometry.buttonWidth).toBeGreaterThanOrEqual(44);
      expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    }
  }
});

test('faculty exact-revision preview never exposes the learner capture launcher', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?page=orientation.md&reviewKey=page%3Aorientation.md&reviewToken=0123456789abcdef0123456789abcdef');
  await expect(captureLauncher(page)).toHaveCount(0);
});
