import { test, expect } from '@playwright/test';

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const CAPTURE = '.fd-capture-launch--global[data-capture-open]';

async function seedCompleteSetup(page, extra = {}) {
  await page.addInitScript((seed) => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false, ...seed.frontdoor,
    }));
    for (const [key, value] of Object.entries(seed.storage || {})) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, extra);
}

test('completion updates desktop, mobile, and rail immediately without replacing the governed tool', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/?tool=question-bank-practice.html&case=completion');
  await expect(page.locator('.fd-article iframe')).toBeVisible();
  await page.evaluate(() => {
    window.__completionArticle = document.querySelector('.fd-article');
    window.__completionFrame = document.querySelector('.fd-article iframe');
  });

  const desktop = page.locator('.fd-article__actions [data-fd-toggle="question-bank-practice.html"]');
  const mobile = page.locator('.fd-actionbar [data-fd-toggle="question-bank-practice.html"]');
  await expect(desktop).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);

  await desktop.click();
  await expect(desktop).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);
  await expect(page.locator('.fd-railnav__label')).toContainText('1 of 9 done');
  await expect(page.locator('.fd-railnav__row[data-fd-open="question-bank-practice.html"] .fd-visually-hidden'))
    .toHaveText('Completed');
  expect(await page.evaluate(() => (
    document.querySelector('.fd-article') === window.__completionArticle
      && document.querySelector('.fd-article iframe') === window.__completionFrame
  ))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_progress_v1'))['question-bank-practice.html'].done))
    .toBe(true);

  await page.reload();
  await expect(page.locator('.fd-article iframe')).toBeVisible();
  await expect(desktop).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile).toHaveAttribute('aria-pressed', 'true');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);
  await page.evaluate(() => {
    window.__completionArticle = document.querySelector('.fd-article');
    window.__completionFrame = document.querySelector('.fd-article iframe');
  });

  await desktop.click();
  await expect(desktop).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile).toHaveAttribute('aria-pressed', 'false');
  await expect(mobile.locator(':scope > span')).toHaveCount(1);
  await expect(page.locator('.fd-railnav__label')).toContainText('0 of 9 done');
  await expect(page.locator('.fd-railnav__row[data-fd-open="question-bank-practice.html"] .fd-visually-hidden'))
    .toHaveCount(0);
  expect(await page.evaluate(() => (
    document.querySelector('.fd-article') === window.__completionArticle
      && document.querySelector('.fd-article iframe') === window.__completionFrame
  ))).toBe(true);
  expect(await page.evaluate(() => Object.hasOwn(
    JSON.parse(localStorage.getItem('cw_progress_v1')), 'question-bank-practice.html',
  ))).toBe(false);
});

test('legacy aliases canonicalize on load, delegated actions, messages, and history without fake resource IO', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  const aliasRequests = [];
  page.on('request', (request) => {
    if (/\/(?:content|tools)\/__(?:home|path|start)__/.test(request.url())) aliasRequests.push(request.url());
  });

  await page.goto('/?page=__home__&case=c1');
  await expect(page).toHaveURL(/\/\?case=c1$/);
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.goto('/?page=__path__&case=c1');
  await expect(page).toHaveURL(/\/\?tab=path&case=c1$/);
  await expect(page.locator('.fd-path')).toBeVisible();

  await page.goto('/?page=__start__&case=c1');
  await expect(page).toHaveURL(/\/\?page=__progress__&case=c1$/);
  await expect(page.locator('#pgRoot')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.evaluate(() => {
    const button = document.createElement('button');
    button.setAttribute('data-fd-open', '__home__');
    document.querySelector('#fdApp').appendChild(button);
    button.click();
  });
  await expect(page).toHaveURL(/\/\?case=c1$/);
  await expect(page.locator('.fd-today')).toBeVisible();

  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/?page=__path__&case=c1';
    link.textContent = 'legacy path';
    document.querySelector('#content').appendChild(link);
    link.click();
  });
  await expect(page).toHaveURL(/\/\?tab=path&case=c1$/);
  await expect(page.locator('.fd-path')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'openPage', f: '__start__' }, origin: location.origin,
    }));
  });
  await expect(page).toHaveURL(/\/\?page=__progress__&case=c1$/);
  await expect(page.locator('#pgRoot')).toBeVisible();
  expect(aliasRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.locator('[data-fd-home]').first().click();
  await expect(page.locator('.fd-today')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#pgRoot')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.fd-today')).toBeVisible();
  await page.reload();
  await expect(page.locator('.fd-today')).toBeVisible();
});

test('initial Home alias persists Today before an immediate canonical reload', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.evaluate(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'library', openId: 'orientation.md', fromTab: 'library',
      viewWeek: 1, autoAdvance: false,
    }));
    localStorage.setItem('cw_last', 'orientation.md');
  });

  await page.goto('/?page=__home__&case=alias-reload');
  await expect(page).toHaveURL(/\/\?case=alias-reload$/);
  await expect(page.locator('.fd-today')).toBeVisible();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')));
  expect.soft(persisted.tab).toBe('today');
  expect.soft(persisted.openId).toBeUndefined();

  await page.reload();
  await expect(page).toHaveURL(/\/\?case=alias-reload$/);
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-reader')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBe('orientation.md');
});

test('capture refreshes Today and search matches without replacing its live launcher', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');
  const launcher = page.locator(CAPTURE);
  await expect(launcher).toHaveCount(1);
  await page.evaluate((selector) => { window.__captureLauncher = document.querySelector(selector); }, CAPTURE);

  await launcher.click();
  await page.locator('#capText').fill('psychosis');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  await expect(page.locator('#capText')).toBeFocused();
  const triage = page.locator('.fd-capture', { hasText: 'Questions from the unit' });
  await expect(triage).toContainText('psychosis');
  await expect(triage.locator('[data-cap-open]')).toHaveAttribute('data-cap-ref', 't_psychosis.md');
  await expect(triage.locator('[data-cap-review]')).toHaveAttribute('data-cap-ref', 't_psychosis.md');
  expect(await page.evaluate((selector) => {
    const current = document.querySelector(selector);
    return current === window.__captureLauncher && current.isConnected;
  }, CAPTURE)).toBe(true);
  await expect(launcher).toHaveCount(1);

  await page.locator('#capCancel').click();
  expect(await page.evaluate(() => document.activeElement === window.__captureLauncher)).toBe(true);
  await page.evaluate(() => window.__captureLauncher.click());
  await page.locator('#capText').fill('orientation packet');
  await page.locator('#capSave').click();
  await expect(page.locator('#capText')).toBeFocused();
  await expect(triage).toContainText('orientation packet');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.activeElement === window.__captureLauncher)).toBe(true);

  await page.evaluate(() => window.__captureLauncher.click());
  await page.locator('.cap-list li', { hasText: 'psychosis' }).locator('[data-cap-del]').click();
  await expect(triage).not.toContainText('psychosis');
  await expect(triage).toContainText('orientation packet');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#capEraseAll').click();
  await expect(triage).toHaveCount(0);
  await expect(launcher).toHaveCount(1);
  expect(await page.evaluate((selector) => (
    document.querySelector(selector) === window.__captureLauncher
      && window.__captureLauncher.isConnected
  ), CAPTURE)).toBe(true);
  await page.locator('#capCancel').click();
  expect(await page.evaluate(() => document.activeElement === window.__captureLauncher)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('cw_capture_v1'))).toBeNull();
  expect(runtimeErrors).toEqual([]);
});

test('legacy Start keeps incomplete role/week setup canonical across reload and history', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?page=__start__&case=setup');
  await expect(page).toHaveURL(/\/\?case=setup$/);
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText("Who's this for?");
  expect(await page.evaluate(() => localStorage.getItem('cw_last'))).toBeNull();

  await page.locator('[data-fd-role]').first().click();
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText('Where in the rotation?');
  await page.reload();
  await expect(page).toHaveURL(/\/\?case=setup$/);
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText('Where in the rotation?');
  await page.goBack();
  await page.goForward();
  await expect(page.locator('.fd-setup .fd-h1')).toHaveText('Where in the rotation?');
  await expect(page.locator('.fd-reader')).toHaveCount(0);
});

test('fd-main and Reader rail styles survive Today, Reader, Progress, placement, and plan mutations', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page, {
    storage: { cw_plan_v1: { generatedAt: '2026-08-17T00:00:00Z', shelfDate: '', weeks: [] } },
  });
  await page.goto('/');
  const main = page.locator('main#content');
  await expect(main).toHaveClass(/\bfd-main\b/);
  expect(await main.evaluate((node) => getComputedStyle(node).paddingLeft)).toBe('20px');

  await page.goto('/?page=welcome.md');
  await expect(page.locator('.fd-article')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
  const rail = page.locator('.fd-railnav');
  await expect(rail).toBeVisible();
  expect(await rail.evaluate((node) => {
    const css = getComputedStyle(node);
    return {
      backgroundColor: css.backgroundColor,
      borderRightWidth: css.borderRightWidth,
      height: css.height,
      paddingLeft: css.paddingLeft,
      position: css.position,
    };
  })).toEqual({
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderRightWidth: '0px',
    height: expect.not.stringMatching(/^800px$/),
    paddingLeft: '0px',
    position: 'sticky',
  });

  await page.goto('/?page=__progress__');
  await expect(page.locator('#pgRoot')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
  await page.locator('[data-pt="plan"]').click();
  await expect(page.locator('#planRoot')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
  await page.locator('[data-pt="pretest"]').click();
  await expect(page.locator('#ptRoot')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
  await page.locator('[data-progress-action="progress"]').click();
  await page.locator('[data-pt="plan"]').click();
  await expect(page.locator('#planRoot')).toBeVisible();
  await expect(main).toHaveClass(/\bfd-main\b/);
});

test('theme, Week, and capture focus obey one ordinary modal lifecycle', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');

  const theme = page.locator('[data-fd-theme]');
  await theme.focus();
  await theme.click();
  await expect(page.locator('[data-fd-theme]')).toBeFocused();

  await page.locator('[data-fd-change-week]').click();
  await expect(page.locator('.fd-setup .fd-h1')).toBeFocused();
  await page.locator('[data-fd-week="1"]').click();
  await expect(page.locator('.fd-today')).toBeVisible();

  const capture = page.locator(CAPTURE);
  await capture.click();
  await expect(page.locator('.cap-sheet')).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await page.keyboard.press('Meta+k');
  await expect(page.locator('.fd-search')).toHaveCount(0);
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect(capture).toBeFocused();
});

test('capture alone owns Cmd/Ctrl-K and one Escape restores its connected invoker', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/');

  // The generic selector deliberately reaches the pre-fix Today launcher so this regression
  // exercises modal arbitration during RED; the route matrix separately pins the new stable one.
  const invoker = page.locator('[data-capture-open]').first();
  await invoker.click();
  await expect(page.locator('.cap-sheet')).toBeVisible();
  await page.locator('#capSave').focus();
  await page.locator('#capSave').evaluate((button) => button.dispatchEvent(new KeyboardEvent(
    'keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true },
  )));
  await expect.soft(page.locator('[role="dialog"]')).toHaveCount(1);
  await expect.soft(page.locator('.fd-search')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect(invoker).toBeFocused();
  await expect.soft(page.locator('.fd-search')).toHaveCount(0);
});

test('document title resets for tabs and updates for successful resources and internal views', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await seedCompleteSetup(page, {
    storage: { cw_plan_v1: { generatedAt: '2026-08-17T00:00:00Z', shelfDate: '', weeks: [] } },
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/^Today — /);
  await page.locator('[data-fd-tab="path"]').click();
  await expect(page).toHaveTitle(/^Path — /);
  await page.locator('[data-fd-tab="library"]').click();
  await expect(page).toHaveTitle(/^Library — /);
  await page.goto('/?page=welcome.md');
  await expect(page.locator('.fd-article')).toBeVisible();
  await expect(page).toHaveTitle(/^Welcome/);
  await page.goto('/?page=__progress__');
  await expect(page).toHaveTitle(/^Progress — /);
  await page.locator('[data-pt="plan"]').click();
  await expect(page).toHaveTitle(/^Your 6-week plan — /);
  await page.locator('[data-pt="pretest"]').click();
  await expect(page).toHaveTitle(/^2-minute placement — /);
  await page.locator('[data-progress-action="progress"]').click();
  await page.locator('[data-pt="plan"]').click();
  await expect(page).toHaveTitle(/^Your 6-week plan — /);
});
