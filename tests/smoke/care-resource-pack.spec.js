import { test, expect } from '@playwright/test';
import { isResidentProject } from './audience.js';

const FROZEN_NOW = new Date('2026-08-17T12:00:00-04:00');
const RESOURCE_BY_ID = {
  'resource-finder': {
    title: 'Find services and community supports',
    url: 'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html',
  },
  'meeting-calendar': {
    title: 'Find a recovery meeting',
    url: 'https://reconnect-tools.netlify.app/tools/recovery-meeting-calendar.html',
  },
  'education-library': {
    title: 'Patient and family education',
    url: 'https://mental-health-education-library.netlify.app/patient',
  },
  'podcast-navigator': {
    title: 'Find a podcast to share',
    url: 'https://reconnect-tools.netlify.app/tools/podcast-navigator.html',
  },
  'book-shelf': {
    title: 'Browse recommended books',
    url: 'https://reconnect-tools.netlify.app/tools/relational-bibliotherapy.html',
  },
};
const RESOURCE_IDS = Object.keys(RESOURCE_BY_ID);
const SELECTED_IDS = ['resource-finder', 'education-library', 'book-shelf'];
const runtimeErrors = new WeakMap();

async function seedCare(page, testInfo) {
  await page.clock.setFixedTime(FROZEN_NOW);
  await page.addInitScript(({ role }) => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role, tab: 'care', viewWeek: 1,
    }));
    window.__carePackPrintCalls = 0;
    window.print = function() { window.__carePackPrintCalls += 1; };
  }, { role: isResidentProject(testInfo.project.name) ? 'pgy1' : 'student' });
}

async function browserState(page) {
  return {
    url: page.url(),
    storage: await page.evaluate(() => ({
      local: Object.fromEntries(Object.keys(localStorage)
        .sort().map(key => [key, localStorage.getItem(key)])),
      session: Object.fromEntries(Object.keys(sessionStorage)
        .sort().map(key => [key, sessionStorage.getItem(key)])),
    })),
    cookies: await page.context().cookies(),
  };
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

test('builds a private three-resource handout with exact links, local QR codes, and governed crisis details', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedCare(page, testInfo);
  await page.goto('/?tab=care');

  const pack = page.locator('.fd-care-pack');
  const choices = pack.locator('[data-fd-care-pack]');
  const print = pack.locator('[data-fd-care-pack-print]');
  await expect(pack.getByRole('heading', { name: 'Build a resource handout' })).toBeVisible();
  await expect(choices).toHaveCount(5);
  await expect(pack.locator('#fd-care-pack-limit')).toHaveText('0 of 3 selected');
  await expect(print).toBeDisabled();
  await expect(pack.locator('input,textarea,[contenteditable]')).toHaveCount(0);

  const before = await browserState(page);
  for (const id of SELECTED_IDS) {
    await pack.locator(`[data-fd-care-pack="${id}"]`).click();
  }

  await expect(pack.locator('#fd-care-pack-limit')).toContainText('3 of 3 selected');
  for (const id of SELECTED_IDS) {
    await expect(pack.locator(`[data-fd-care-pack="${id}"]`)).toBeEnabled();
    await expect(pack.locator(`[data-fd-care-pack="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  for (const id of RESOURCE_IDS.filter(id => !SELECTED_IDS.includes(id))) {
    await expect(pack.locator(`[data-fd-care-pack="${id}"]`)).toBeDisabled();
  }

  const printedResources = pack.locator('.fd-care-pack__resource');
  await expect(printedResources).toHaveCount(3);
  expect(await printedResources.locator('a').evaluateAll(nodes => nodes.map(node => ({
    href: node.href,
    text: node.textContent.trim(),
  })))).toEqual(SELECTED_IDS.map(id => ({
    href: RESOURCE_BY_ID[id].url,
    text: RESOURCE_BY_ID[id].url,
  })));
  await expect(pack.locator('.fd-care-pack__qr svg')).toHaveCount(3);
  expect(await pack.locator('.fd-care-pack__qr svg').evaluateAll(nodes => (
    nodes.map(node => node.getAttribute('aria-label'))
  ))).toEqual(SELECTED_IDS.map(id => `QR code for ${RESOURCE_BY_ID[id].title}`));

  const crisis = await page.evaluate(() => {
    const source = document.getElementById('fdCrisisTemplate')
      .content.querySelector('.crisis-block');
    const rendered = document.querySelector('.fd-care-pack__crisis .crisis-block');
    return {
      source: source ? source.outerHTML : '',
      rendered: rendered ? rendered.outerHTML : '',
    };
  });
  expect(crisis.source).not.toBe('');
  expect(crisis.rendered).toBe(crisis.source);
  expect(await pack.locator('.fd-care-pack__crisis').getAttribute('open')).toBeNull();

  await expect(print).toBeEnabled();
  await print.click();
  expect(await page.evaluate(() => window.__carePackPrintCalls)).toBe(1);

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.fd-header')).toBeHidden();
  await expect(pack.locator('.fd-care-pack__picker')).toBeHidden();
  await expect(pack.locator('.fd-care-pack__sheet')).toBeVisible();
  await expect(pack.locator('.fd-care-pack__crisis .crisis-block')).toBeVisible();
  await expect(printedResources.locator('a')).toHaveCount(3);
  for (const link of await printedResources.locator('a').all()) await expect(link).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.fd-dock')).toBeHidden();
  await expect(pack.locator('.fd-care-pack__sheet')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1280, height: 900 });

  expect(await browserState(page)).toEqual(before);

  await pack.locator('[data-fd-care-pack-clear]').click();
  await expect(pack.locator('#fd-care-pack-limit')).toHaveText('0 of 3 selected');
  await expect(print).toBeDisabled();
  await expect(choices.first()).toBeFocused();

  await page.keyboard.press('Space');
  await expect(choices.first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.fd-tabs [data-fd-tab="library"]:visible').click();
  await page.locator('.fd-tabs [data-fd-tab="care"]:visible').click();
  await expect(pack.locator('#fd-care-pack-limit')).toHaveText('0 of 3 selected');

  await choices.first().click();
  await page.reload();
  await expect(pack.locator('#fd-care-pack-limit')).toHaveText('0 of 3 selected');

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(pack).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await pack.locator('.fd-care-pack__workbench').evaluate(el => (
    getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length
  ))).toBe(1);
  const firstChoice = await choices.first().boundingBox();
  expect(firstChoice).not.toBeNull();
  expect(firstChoice.height).toBeGreaterThanOrEqual(44);
  await expectHealthy(page);
});

test('fails closed when the governed crisis template is unavailable', async ({ page }, testInfo) => {
  await seedCare(page, testInfo);
  await page.route(url => url.pathname === '/' && url.search === '?tab=care', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const crisisTemplate = /<template id="fdCrisisTemplate">[\s\S]*?<\/template>/;
    expect(html).toMatch(crisisTemplate);
    await route.fulfill({
      response,
      body: html.replace(crisisTemplate, '<template id="fdCrisisTemplate"></template>'),
    });
  });
  await page.goto('/?tab=care');

  await page.locator('[data-fd-care-pack="resource-finder"]').click();
  await expect(page.locator('.fd-care-pack__crisis-failure')).toHaveText(
    'This handout is unavailable because its crisis-resource block did not load.');
  await expect(page.locator('[data-fd-care-pack-print]')).toBeDisabled();
  await expect(page.locator('.fd-care-pack__crisis .crisis-block')).toHaveCount(0);
  await expectHealthy(page);
});
