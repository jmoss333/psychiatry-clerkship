import { test, expect } from '@playwright/test';

const FROZEN_NOW = new Date('2026-08-17T12:00:00-04:00');
const PHONE = { width: 390, height: 844 };
const FAILURE_COPY = 'This safety protocol is unavailable right now—do not rely on this page for clinical guidance; use the crisis resources below and contact your supervising clinician.';
const runtimeErrors = new WeakMap();

function audience(testInfo) {
  const resident = testInfo.project.name === 'nav-res';
  return {
    role: resident ? 'pgy1' : 'student',
    libraryCount: resident ? 90 : 81,
    residentRef: resident ? 'rp-agitation.html' : null,
    weekCount: resident ? 4 : 6,
    pathHeading: resident ? 'Your 4-week path' : 'Your 6-week path',
    pathId: resident ? 'resident-four-week' : 'ms3-six-week',
  };
}

async function freezeTime(page) {
  await page.clock.setFixedTime(FROZEN_NOW);
}

async function seedApp(page, testInfo, extra = {}) {
  const site = audience(testInfo);
  await freezeTime(page);
  await page.addInitScript(({ role, state, storage }) => {
    if (sessionStorage.getItem('__fd_test_preserve_seed') === '1') return;
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role, tab: 'today', viewWeek: 1, ...state,
    }));
    for (const [key, value] of Object.entries(storage)) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }, { role: site.role, state: extra.state || {}, storage: extra.storage || {} });
}

async function expectHealthy(page) {
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
  expect(runtimeErrors.get(page)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
});

test('first run reaches Today; browse mode exposes the exact audience Library', async ({ page }, testInfo) => {
  const site = audience(testInfo);
  await freezeTime(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: "Who's this for?" })).toBeVisible();
  await page.locator(`[data-fd-role="${site.role}"]`).click();
  await expect(page.getByRole('heading', { name: 'Where in the rotation?' })).toBeFocused();
  await expect(page.locator('.fd-weektile[data-fd-week]')).toHaveCount(site.weekCount);
  await page.locator('[data-fd-week="1"]').click();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('[data-fd-tab="today"]')).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBe('2026-08-17');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(`[data-fd-role="${site.role}"]`).click();
  await page.locator('[data-fd-week="0"]').click();
  await expect(page.locator('.fd-library')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBeNull();

  const refs = await page.locator('.fd-collink[data-fd-open]').evaluateAll(controls => (
    controls.map(control => control.getAttribute('data-fd-open'))
  ));
  expect(refs).toHaveLength(site.libraryCount);
  expect(new Set(refs).size).toBe(site.libraryCount);
  expect(refs.includes('rp-agitation.html')).toBe(Boolean(site.residentRef));
  await expectHealthy(page);
});

test('Path projects each audience duration without mobile overflow', async ({ page }, testInfo) => {
  const site = audience(testInfo);
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo);
  await page.goto('/');
  await page.locator('[data-fd-change-week]').click();
  const setupOverflow = await page.locator('.fd-setup').evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(setupOverflow).toBe(true);
  await page.locator('[data-fd-week="1"]').click();
  await page.locator('[data-fd-tab="path"]').click();
  await expect(page.getByRole('heading', { name: site.pathHeading })).toBeVisible();
  await expect(page.locator('.fd-timeline__row')).toHaveCount(site.weekCount);
  expect(await page.locator('.fd-path').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.content()).toContain(site.pathId);
  const retired = await page.request.get('/tools/learning-path.html');
  expect(retired.status()).toBe(404);
  await expectHealthy(page);
});

test('tab focus order is stable and Path preview does not change rotation until adoption', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');

  await page.locator('[data-fd-home]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-search]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-change-week]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.fd-safetybtn[data-fd-safety]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-theme]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-tab="today"]')).toBeFocused();

  await page.locator('[data-fd-tab="path"]').click();
  await expect(page.locator('.fd-path')).toBeVisible();
  await page.locator('[data-fd-view-week="3"]').click();
  await expect(page.locator('.fd-detail .fd-eyebrow')).toHaveText('Week 3');
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBe('2026-08-17');

  await page.locator('[data-fd-setweek="3"]').click();
  const stored = await page.evaluate(() => localStorage.getItem('cw_rotation_start'));
  expect(stored).toBe('2026-08-03');
  expect(await page.evaluate(value => new Date(`${value}T12:00:00`).getDay(), stored)).toBe(1);
  await expect(page.locator('[data-fd-change-week]')).toContainText('Week 3');
  await expectHealthy(page);
});

test('legacy completion objects survive Reader previous/next and browser history', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, {
    state: { tab: 'library' },
  });
  await page.goto('/');
  const refs = await page.locator('.fd-collink[data-fd-open]').evaluateAll(controls => (
    controls.map(control => control.getAttribute('data-fd-open'))
  ));
  const firstRef = refs.find(ref => ref.endsWith('.md'));
  expect(firstRef).toBeTruthy();
  await page.locator(`.fd-collink[data-fd-open="${firstRef}"]`).click();
  const nextRef = await page.locator('.fd-prevnext__btn.is-next').getAttribute('data-fd-open');
  expect(nextRef).toMatch(/\.md$/);
  await page.goto('/');
  const legacy = {
    [firstRef]: { done: true, at: '2026-08-10' },
    [nextRef]: { done: false, at: '2026-08-10' },
  };
  await page.evaluate(value => {
    localStorage.setItem('cw_progress_v1', JSON.stringify(value));
  }, legacy);
  await page.locator(`.fd-collink[data-fd-open="${firstRef}"]`).click();
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(page.locator('.fd-src')).toHaveText(firstRef);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_progress_v1')))).toEqual(legacy);

  const next = page.locator('.fd-prevnext__btn.is-next');
  await expect(next).toHaveAttribute('data-fd-open', nextRef);
  await next.click();
  await expect(page.locator('.fd-src')).toHaveText(nextRef);
  expect(new URL(page.url()).searchParams.get('page')).toBe(nextRef);

  const previous = page.locator('.fd-prevnext__btn').filter({
    has: page.locator('.fd-prevnext__label', { hasText: 'Prev' }),
  });
  await previous.click();
  await expect(page.locator('.fd-src')).toHaveText(firstRef);
  await page.goBack();
  await expect(page.locator('.fd-src')).toHaveText(nextRef);
  await page.goForward();
  await expect(page.locator('.fd-src')).toHaveText(firstRef);

  await page.goto(`/?page=${encodeURIComponent(nextRef)}`);
  await page.locator('.fd-article__actions [data-fd-toggle]').click();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_progress_v1')));
  expect(progress[firstRef]).toEqual({ done: true, at: '2026-08-10' });
  expect(progress[nextRef]).toEqual({ done: true, at: '2026-08-17' });
  await expectHealthy(page);
});

test('command-K and slash search open a preview sheet and restore focus', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  const opener = page.locator('[data-fd-search]');

  await opener.click();
  await expect(page.locator('.fd-searchpanel__input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();

  await page.keyboard.press('Meta+k');
  await expect(page.locator('.fd-searchpanel__input')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('[data-fd-home]').focus();
  await page.keyboard.press('/');
  const input = page.locator('.fd-searchpanel__input');
  await expect(input).toBeFocused();
  await input.fill('mood');
  await expect(page.locator('.fd-result')).not.toHaveCount(0);
  const firstRef = await page.locator('.fd-result').first().getAttribute('data-fd-open');
  await input.press('Enter');
  await expect(page.locator('.fd-sheet[role="dialog"]')).toBeVisible();
  await expect(page.locator('.fd-search')).toHaveCount(0);
  await expect(page.locator('.fd-sheet [data-fd-open]')).toHaveAttribute('data-fd-open', firstRef);
  await page.locator('.fd-sheet__close').click();
  await expect(page.locator('.fd-sheet')).toHaveCount(0);
  await expectHealthy(page);
});

test('Safety Kit, theme, and Progress remain usable and restore their invokers', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');

  await page.locator('[data-fd-theme]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('cw_theme'))).toBe('dark');

  const safety = page.locator('.fd-safetybtn[data-fd-safety]');
  await safety.click();
  await expect(page.locator('.fd-sheet[role="dialog"]')).toHaveAttribute('aria-label', 'Safety kit');
  await expect(page.locator('.fd-sheet__close')).toBeFocused();
  await page.locator('.fd-sheet__close').click();
  await expect(safety).toBeFocused();

  await page.locator('[data-fd-progress]').click();
  await expect(page).toHaveURL(/\?page=__progress__$/);
  await expect(page.locator('#pgRoot')).toBeVisible();
  await page.locator('.fd-reader__back[data-fd-back]').click();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expectHealthy(page);
});

test('malformed built protocol fails closed with every canonical crisis resource', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.route(/\/\?(?:$|#)|\/$/, async route => {
    const response = await route.fetch();
    const needle = 'var FD_INDEX=fdBuildIndex(FD_CURRICULUM,FD_TOPIC_META,FD_TOOL_REGISTRY,FD_SITE_MANIFEST);';
    const original = await response.text();
    expect(original.split(needle)).toHaveLength(2);
    const body = original.replace(
      needle,
      `${needle}FD_TOPIC_META[FD_INDEX.kit[0].item.ref].safetySteps=[];`,
    );
    await route.fulfill({ response, body });
  });
  await page.goto('/');
  const expectedResources = await page.locator('#fdCrisisTemplate').evaluate(template => (
    [...template.content.querySelectorAll('.crisis-block li')].map(item => item.textContent.trim())
  ));
  expect(expectedResources.length).toBeGreaterThan(0);

  await page.locator('.fd-safetybtn[data-fd-safety]').click();
  await page.locator('.fd-kitrow[data-fd-safety]').first().click();
  await expect(page.locator('.fd-sheet__failure[role="alert"]')).toHaveText(FAILURE_COPY);
  const renderedResources = await page.locator('.fd-sheet .crisis-block li').allTextContents();
  expect(renderedResources.map(text => text.trim())).toEqual(expectedResources);
  await expectHealthy(page);
});

test('390x844 reduced-motion Reader keeps fixed 44px actions during scroll without overflow', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedApp(page, testInfo, { state: { tab: 'library' } });
  await page.goto('/?page=t_mood.md');
  const bar = page.locator('.fd-actionbar');
  await expect(bar).toBeVisible();

  const before = await bar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const after = await bar.boundingBox();
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.y + after.height).toBeCloseTo(PHONE.height, 0);

  const targets = await page.locator(
    '.fd-actionbar .fd-btn, .fd-searchbtn, .fd-weekpill, .fd-safetybtn, .fd-themebtn',
  ).evaluateAll(controls => controls.filter(control => getComputedStyle(control).display !== 'none')
    .map(control => {
      const box = control.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
  expect(targets.length).toBeGreaterThan(0);
  for (const target of targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.locator('.fd-reader').evaluate(element => (
    getComputedStyle(element).animationName
  ))).toBe('none');
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await expectHealthy(page);
});

test('320-641px header controls remain distinct, readable, and fully tappable', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  const cases = [
    { url: '/', ready: '.fd-today' },
    { url: '/?page=t_mood.md', ready: '.fd-reader .fd-article__body' },
  ];

  for (const width of [320, 360, 390, 561, 600, 601, 640, 641]) {
    await page.setViewportSize({ width, height: 844 });
    for (const surface of cases) {
      await page.goto(surface.url);
      await expect(page.locator(surface.ready)).toBeVisible();

      const geometry = await page.evaluate(() => {
        const selectors = [
          '.fd-brand', '.fd-searchbtn', '.fd-weekpill', '.fd-safetybtn', '.fd-themebtn',
        ];
        const visible = element => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && box.width > 0 && box.height > 0;
        };
        const paintedRect = selector => {
          const root = document.querySelector(selector);
          const nodes = [root, ...root.querySelectorAll('*')].filter(visible);
          const boxes = nodes.map(node => node.getBoundingClientRect());
          return {
            left: Math.min(...boxes.map(box => box.left)),
            right: Math.max(...boxes.map(box => box.right)),
            top: Math.min(...boxes.map(box => box.top)),
            bottom: Math.max(...boxes.map(box => box.bottom)),
            width: root.getBoundingClientRect().width,
            height: root.getBoundingClientRect().height,
          };
        };
        const controls = Object.fromEntries(selectors.map(selector => [selector, paintedRect(selector)]));
        const intersections = [];
        for (let i = 0; i < selectors.length; i += 1) {
          for (let j = i + 1; j < selectors.length; j += 1) {
            const a = controls[selectors[i]];
            const b = controls[selectors[j]];
            if (a.left < b.right - 0.5 && a.right > b.left + 0.5
                && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) {
              intersections.push([selectors[i], selectors[j]]);
            }
          }
        }
        const header = document.querySelector('.fd-header').getBoundingClientRect();
        const main = document.querySelector('#content').getBoundingClientRect();
        const brandName = document.querySelector('.fd-brand__name').getBoundingClientRect();
        const searchIcon = document.querySelector('.fd-searchbtn svg').getBoundingClientRect();
        const searchLabel = document.querySelector('.fd-searchbtn__label').getBoundingClientRect();
        const shortcut = document.querySelector('.fd-kbd');
        return {
          controls,
          intersections,
          headerBottom: header.bottom,
          mainTop: main.top,
          brandNameWidth: brandName.width,
          searchIconWidth: searchIcon.width,
          searchLabelWidth: searchLabel.width,
          shortcutDisplay: getComputedStyle(shortcut).display,
          viewportWidth: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(geometry.intersections, `${width}px ${surface.url} header collisions`).toEqual([]);
      for (const [selector, box] of Object.entries(geometry.controls)) {
        expect.soft(box.width, `${width}px ${surface.url} ${selector} width`).toBeGreaterThanOrEqual(44);
        expect.soft(box.height, `${width}px ${surface.url} ${selector} height`).toBeGreaterThanOrEqual(44);
        expect.soft(box.left, `${width}px ${surface.url} ${selector} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(box.right, `${width}px ${surface.url} ${selector} right edge`)
          .toBeLessThanOrEqual(geometry.viewportWidth);
      }
      expect.soft(geometry.brandNameWidth).toBeGreaterThan(0);
      expect.soft(geometry.searchIconWidth).toBeGreaterThan(0);
      expect.soft(geometry.searchLabelWidth).toBeGreaterThanOrEqual(44);
      expect.soft(geometry.shortcutDisplay).toBe(width <= 640 ? 'none' : 'block');
      expect.soft(geometry.headerBottom).toBeLessThanOrEqual(geometry.mainTop + 0.5);
      expect.soft(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      await expectHealthy(page);
    }
  }

  const role = audience(testInfo).role;
  for (const width of [601, 641]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate((browseRole) => {
      sessionStorage.setItem('__fd_test_preserve_seed', '1');
      localStorage.removeItem('cw_rotation_start');
      localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
        screen: 'app', role: browseRole, tab: 'library', viewWeek: 1, browsing: true,
      }));
    }, role);
    await page.goto('/?tab=library');
    await expect(page.locator('.fd-library')).toBeVisible();
    await expect(page.locator('.fd-weekpill')).toContainText('Set week');
    const browseHeader = await page.evaluate(() => {
      const selectors = ['.fd-brand', '.fd-searchbtn', '.fd-header__actions'];
      const boxes = selectors.map(selector => document.querySelector(selector).getBoundingClientRect());
      return {
        collisions: boxes.some((a, index) => boxes.slice(index + 1).some(b => (
          a.left < b.right - 0.5 && a.right > b.left + 0.5
            && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
        ))),
        labelWidth: document.querySelector('.fd-searchbtn__label').getBoundingClientRect().width,
        shortcutDisplay: getComputedStyle(document.querySelector('.fd-kbd')).display,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    });
    expect.soft(browseHeader.collisions).toBe(false);
    expect.soft(browseHeader.labelWidth).toBeGreaterThanOrEqual(44);
    expect.soft(browseHeader.shortcutDisplay).toBe(width <= 640 ? 'none' : 'block');
    expect.soft(browseHeader.scrollWidth).toBeLessThanOrEqual(browseHeader.viewportWidth);
    await expectHealthy(page);
  }
});

test('wide interview table remains accessible and contained in the live Reader', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo, { state: { tab: 'library' } });
  await page.goto('/?page=pg_interview.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);

  const tableSection = page.locator('.fd-article__body .sec-c').filter({
    has: page.locator('.table-scroll-viewport'),
  }).first();
  await expect(tableSection).toBeVisible();
  const tableHeader = tableSection.locator('.sec-h button');
  await expect(tableHeader).toHaveCount(1);
  await tableHeader.click();
  await expect(tableSection).toHaveClass(/open/);

  const viewport = tableSection.locator('.table-scroll-viewport');
  const shell = tableSection.locator('.table-scroll');
  await expect(shell).toHaveClass(/is-scrollable/);
  await expect(viewport).toHaveAttribute('role', 'region');
  await expect(viewport).toHaveAttribute('tabindex', '0');
  await expect(viewport).toHaveAttribute('aria-label', 'MSE Structure table');
  await expect(viewport.locator('table')).toBeVisible();
  const scroll = await viewport.evaluate(element => {
    const before = element.scrollLeft;
    element.scrollLeft = Math.min(16, element.scrollWidth - element.clientWidth);
    return {
      before,
      after: element.scrollLeft,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowX: getComputedStyle(element).overflowX,
    };
  });
  expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);
  expect(scroll.overflowX).toMatch(/^(auto|scroll)$/);
  expect(scroll.after).toBeGreaterThan(scroll.before);
  await expect(shell.locator('.table-scroll-hint')).toBeVisible();

  const widths = await page.locator('#content').evaluate(element => ({
    content: element.clientWidth,
    document: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.document);
  expect(widths.scroll).toBeLessThanOrEqual(widths.document);
  await expectHealthy(page);
});
