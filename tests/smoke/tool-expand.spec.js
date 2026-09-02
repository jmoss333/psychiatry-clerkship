import { test, expect } from '@playwright/test';
import { requestGetWithRetry } from './net-resilience.js';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const TOGGLE = '[data-fd-expand-tool]';

async function seedCompleteSetup(page, frontdoor = {}) {
  await page.addInitScript((saved) => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    if (!localStorage.getItem('cw_frontdoor_v1')) {
      localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
        role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false, ...saved,
      }));
    }
  }, frontdoor);
}

async function toolGeometry(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#content');
    const article = document.querySelector('.fd-article');
    const frame = document.querySelector('.fd-article iframe');
    const rect = (node) => node?.getBoundingClientRect();
    return {
      main: rect(main), article: rect(article), frame: rect(frame),
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
}

test('every published tool route gets the shared control, including unindexed html routes', async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  const navResponse = await requestGetWithRetry(request, '/nav.json');
  expect(navResponse.ok()).toBe(true);
  const nav = await navResponse.json();
  const tools = [...new Set(nav.flatMap(section => section.items || [])
    .filter(item => item.k === 'tool').map(item => item.f))];
  expect(tools.length).toBeGreaterThan(20);

  await page.route('**/tools/*.html*', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><label>Probe <input id="probe"></label></body></html>',
  }));
  for (const ref of tools) {
    await page.goto(`/?tool=${encodeURIComponent(ref)}&expand-inventory=1`);
    await expect(page.locator('.fd-article iframe')).toHaveCount(1);
    await expect(page.locator(TOGGLE), ref).toHaveCount(1);
    await expect(page.locator(TOGGLE), ref).toBeVisible();
    await expect(page.locator(TOGGLE), ref).toHaveAttribute('aria-pressed', 'false');
  }

  await page.unroute('**/tools/*.html*');
  await page.goto('/?page=welcome.md&expand-inventory=1');
  await expect(page.locator('.fd-article__h1')).toBeVisible();
  await expect(page.locator(TOGGLE)).toHaveCount(0);
});

test('desktop toggle expands the same live iframe and remembers the preference across tools', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await seedCompleteSetup(page);
  await page.goto('/?tool=withdrawal.html&expand-live=1');
  const frame = page.locator('.fd-article iframe');
  const toggle = page.locator(TOGGLE);
  await expect(frame).toBeVisible();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.frameLocator('.toolframe').locator('select').first()).toBeVisible();

  const chosenValue = await page.evaluate(() => {
    const iframe = document.querySelector('.toolframe');
    const select = iframe.contentDocument.querySelector('select');
    const option = select.options[Math.min(2, select.options.length - 1)];
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    window.__expandFrame = iframe;
    window.__expandWindow = iframe.contentWindow;
    window.__expandButton = document.querySelector('[data-fd-expand-tool]');
    return select.value;
  });
  const before = await toolGeometry(page);
  const urlBefore = page.url();

  await toggle.focus();
  await toggle.click();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#content')).toHaveClass(/is-tool-expanded/);
  await expect(page.locator('.fd-reader--tool')).toHaveClass(/is-tool-expanded/);
  const after = await toolGeometry(page);
  expect(after.frame.width).toBeGreaterThan(before.frame.width + 250);
  expect(after.frame.width).toBeGreaterThan(after.viewport * 0.75);
  expect(after.documentWidth).toBeLessThanOrEqual(after.viewport);
  expect(page.url()).toBe(urlBefore);
  expect(await page.evaluate((value) => {
    const iframe = document.querySelector('.toolframe');
    return iframe === window.__expandFrame
      && iframe.contentWindow === window.__expandWindow
      && document.querySelector('[data-fd-expand-tool]') === window.__expandButton
      && iframe.contentDocument.querySelector('select').value === value;
  }, chosenValue)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')).toolExpanded))
    .toBe(true);

  await page.reload();
  await expect(frame).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#content')).toHaveClass(/is-tool-expanded/);
  await page.goto('/?tool=mse.html&expand-live=next');
  await expect(frame).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const wide = await toolGeometry(page);

  await page.evaluate(() => {
    window.__expandFrame = document.querySelector('.toolframe');
    window.__expandWindow = window.__expandFrame.contentWindow;
  });
  await toggle.focus();
  await toggle.click();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const focused = await toolGeometry(page);
  expect(focused.frame.width).toBeLessThan(wide.frame.width - 250);
  expect(await page.evaluate(() => (
    document.querySelector('.toolframe') === window.__expandFrame
      && document.querySelector('.toolframe').contentWindow === window.__expandWindow
  ))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')).toolExpanded))
    .toBe(false);
});

test('saved expansion is desktop-only and never widens reading pages', async ({ page }) => {
  await seedCompleteSetup(page, { toolExpanded: true });
  await page.setViewportSize({ width: 999, height: 844 });
  await page.goto('/?tool=withdrawal.html&expand-responsive=1');
  await expect(page.locator('.fd-article iframe')).toBeVisible();
  await expect(page.locator(TOGGLE)).toBeHidden();
  await expect(page.locator('.fd-actionbar')).toBeVisible();
  let geometry = await toolGeometry(page);
  expect(geometry.article.x).toBeGreaterThanOrEqual(0);
  expect(geometry.article.x + geometry.article.width).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);

  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(page.locator(TOGGLE)).toBeVisible();
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize(PHONE);
  await expect(page.locator(TOGGLE)).toBeHidden();
  geometry = await toolGeometry(page);
  expect(geometry.article.x).toBeGreaterThanOrEqual(0);
  expect(geometry.article.x + geometry.article.width).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);

  await page.setViewportSize(DESKTOP);
  await page.goto('/?page=welcome.md&expand-responsive=read');
  await expect(page.locator('.fd-article__h1')).toBeVisible();
  await expect(page.locator(TOGGLE)).toHaveCount(0);
  await expect(page.locator('#content')).not.toHaveClass(/is-tool-expanded/);
  const readWidth = await page.locator('.fd-article').evaluate(node => node.getBoundingClientRect().width);
  expect(readWidth).toBeLessThanOrEqual(762);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')).toolExpanded))
    .toBe(true);
});
