import { test, expect } from '@playwright/test';
import { isResidentProject } from './audience.js';
import { requestGetWithRetry, routeFetchWithRetry } from './net-resilience.js';
import { TODAY_TAB } from './landing.js';

const NOW = new Date('2026-08-17T12:00:00-04:00');
const READING = 't_mood.md';
const OTHER_READING = 'pg_interview.md';
const COMPLETED = 'doc_oral.md';
const savedPlace = updatedAt => ({ heading: 'fd-reading-fixture', offset: 85, updatedAt });

async function seed(page, info, { readingPlaces = {}, pins = [], completed = COMPLETED } = {}) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(({ role, readingPlaces, pins, completed }) => {
    if (window.top !== window || sessionStorage.getItem('__fd_continuity_seeded')) return;
    sessionStorage.setItem('__fd_continuity_seeded', '1');
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'library', viewWeek: 1, readingPlaces }));
    localStorage.setItem('cw_progress_v1', JSON.stringify({ [completed]: { done: true, at: '2026-08-16' } }));
    if (pins.length) localStorage.setItem('cw_tool_pins_v1', JSON.stringify(pins));
  }, { role: isResidentProject(info.project.name) ? 'pgy1' : 'student', readingPlaces, pins, completed });
}

async function savedState(page) {
  return page.evaluate(() => ({
    places: JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').readingPlaces || {},
    progress: localStorage.getItem('cw_progress_v1'),
    pins: localStorage.getItem('cw_tool_pins_v1'),
  }));
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

async function expectHealthy(page, errors) {
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
}

// Layout fixtures must not depend on changes in the live faculty review queue. This only
// controls the test response; no source content, attestation, or clinical behavior is changed.
async function serveReviewedLibrary(page) {
  await page.route('**/*', async route => {
    if (route.request().resourceType() !== 'document' || new URL(route.request().url()).pathname !== '/') return route.continue();
    const response = await routeFetchWithRetry(route), body = await response.text();
    const prefix = 'var FD_SITE_MANIFEST=', at = body.indexOf(prefix);
    expect(at, 'the served shell embeds the actual site manifest').toBeGreaterThan(-1);
    const start = at + prefix.length, end = body.indexOf(';\n', start);
    expect(end).toBeGreaterThan(start);
    const manifest = JSON.parse(body.slice(start, end));
    for (const list of [manifest.md || [], manifest.tools || []]) {
      for (const entry of list) if (entry[3]?.status === 'pending') entry[3] = { ...entry[3], status: 'reviewed' };
    }
    await route.fulfill({ response, body: body.slice(0, start) + JSON.stringify(manifest) + body.slice(end) });
  });
}

async function controlledReading(page) {
  const response = await requestGetWithRetry(page.request, '/governance.json');
  const ledger = await response.json();
  expect(ledger.items[READING], 'the real reading has a governance entry').toBeTruthy();
  ledger.items[READING] = { ...ledger.items[READING], status: 'reviewed', riskLevel: 'low' };
  await page.route('**/governance.json', route => route.fulfill({ json: ledger }));
  const filler = 'A short note about organizing study time. '.repeat(28);
  const markdown = '# Study notes\n\n' + [1, 2, 3].map(n =>
    `### Section ${n}\n\n${filler}\n\n${filler}\n`).join('\n');
  await page.route(`**/content/${READING}`, route => route.fulfill({ contentType: 'text/markdown', body: markdown }));
}

async function readingReady(page) {
  const article = page.locator('.fd-reader:visible .fd-article');
  await expect(article).toHaveAttribute('data-ref', READING);
  await expect(article.locator('.fd-article__body h3')).toHaveCount(3);
  await expect(page.locator('.fd-reader:visible [data-fd-reading-status]')).toHaveCount(1);
  await article.evaluate(async el => {
    await document.fonts.ready;
    const animations = [];
    for (let node = el; node; node = node.parentElement) animations.push(...node.getAnimations());
    await Promise.all(animations.filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => null)));
  });
  return article;
}

test('device pins survive reload, lead Today shortcuts, and clear without erasing reading or completion state', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, info, { readingPlaces: { [READING]: savedPlace(2) } });
  await page.goto('/?tab=today');
  await expect(page.locator('.fd-today')).toBeVisible();
  const safetyBefore = await page.locator('.fd-railkit [data-fd-safety]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fd-safety')));
  expect(safetyBefore.length).toBeGreaterThan(0);
  await expect(page.locator('.fd-quicktools--pills .fd-quicktool').first()).not.toHaveAttribute('data-fd-open', 'oral.html');
  await page.locator('[data-fd-tab="library"]:visible').click();
  await page.locator('[data-fd-library-task="rounds"]').click();
  const before = await savedState(page);
  await page.locator('.fd-kit__readings [data-fd-tool-pin="oral.html"]').click();
  await page.locator('[data-fd-library-task="interview"]').click();
  const pin = page.locator('.fd-kit__readings [data-fd-tool-pin="mse.html"]');
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  expect((await savedState(page)).pins).toBe('["oral.html","mse.html"]');

  await page.reload();
  const panel = page.locator('.fd-continuity');
  await expect(panel.locator('[data-fd-tool-pin="mse.html"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('[data-fd-tool-pin="oral.html"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator(TODAY_TAB).click();
  const quick = page.locator('.fd-quicktools--pills .fd-quicktool');
  await expect(quick.first()).toHaveAttribute('data-fd-open', 'oral.html');
  const refs = await quick.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fd-open')));
  expect(refs.length).toBeLessThanOrEqual(5);
  expect(new Set(refs).size).toBe(refs.length);
  expect(await page.locator('.fd-railkit [data-fd-safety]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fd-safety')))).toEqual(safetyBefore);
  expect(await page.locator('.fd-rail .fd-sectionhead').allTextContents()).toEqual(['Safety kit', 'Quick tools']);

  await page.locator('[data-fd-tab="library"]:visible').click();
  await page.locator('[data-fd-continuity-show]').click();
  await panel.locator('[data-fd-tool-pins-clear]').click();
  await expect(panel.locator('[data-fd-tool-pin]')).toHaveCount(0);
  await expect(panel.locator('.fd-continuity__notice')).toContainText(/cleared/i);
  await expect(page.locator('#fd-continuity-title')).toBeFocused();
  const after = await savedState(page);
  expect(after.pins).toBeNull();
  expect(after.places).toEqual(before.places);
  expect(after.progress).toBe(before.progress);
  await page.reload();
  await expect(panel.getByText('No tools pinned yet.', { exact: true })).toBeVisible();
  expect((await savedState(page)).pins).toBeNull();
  await expectHealthy(page, errors);
});

test('Library Continue restores a real saved heading; Remove and Clear saved places preserve pins and completion', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, info, { readingPlaces: { [OTHER_READING]: savedPlace(1), [COMPLETED]: savedPlace(3) }, pins: ['mse.html'] });
  await controlledReading(page);
  await page.goto(`/?page=${READING}`);
  const article = await readingReady(page), heading = article.locator('.fd-article__body h3').nth(1);
  const headingId = await heading.getAttribute('id');
  await heading.evaluate(el => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 85);
    window.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await savedState(page)).places[READING]?.heading).toBe(headingId);
  const before = await savedState(page);
  await page.goto('/?tab=library');
  const panel = page.locator('.fd-continuity');
  await page.locator('[data-fd-continuity-show]').click();
  const recent = panel.locator('[data-fd-reading-resume="1"]');
  await expect(recent).toHaveCount(2);
  await expect(recent.first()).toHaveAttribute('data-fd-open', READING);
  await expect(panel.locator(`[data-fd-reading-resume="1"][data-fd-open="${COMPLETED}"]`)).toHaveCount(0);
  await recent.first().click();
  await readingReady(page);
  await expect(page.locator(`#${headingId}`)).toBeFocused();
  const expectedOffset = before.places[READING].offset;
  await expect.poll(() => page.locator(`#${headingId}`).evaluate(el => -el.getBoundingClientRect().top)).toBeGreaterThan(expectedOffset - 12);
  await expect.poll(() => page.locator(`#${headingId}`).evaluate(el => -el.getBoundingClientRect().top)).toBeLessThan(expectedOffset + 12);

  await page.goto('/?tab=library');
  await page.locator('[data-fd-continuity-show]').click();
  await panel.locator(`[data-fd-reading-place-remove="${READING}"]`).click();
  await expect(panel.locator(`[data-fd-reading-resume="1"][data-fd-open="${READING}"]`)).toHaveCount(0);
  await expect(panel.locator('.fd-continuity__notice')).toContainText(/removed/i);
  await expect(page.locator('#fd-continuity-title')).toBeFocused();
  const removed = await savedState(page);
  expect(removed.places[READING]).toBeUndefined();
  expect(removed.places[OTHER_READING]).toEqual(before.places[OTHER_READING]);
  expect(removed.places[COMPLETED]).toEqual(before.places[COMPLETED]);
  expect(removed.progress).toBe(before.progress);
  expect(removed.pins).toBe(before.pins);
  await panel.locator('[data-fd-reading-places-clear]').click();
  await expect(recent).toHaveCount(0);
  await expect(panel.locator('.fd-continuity__notice')).toContainText(/cleared/i);
  await expect(page.locator('#fd-continuity-title')).toBeFocused();
  const cleared = await savedState(page);
  expect(cleared.places).toEqual({});
  expect(cleared.progress).toBe(before.progress);
  expect(cleared.pins).toBe(before.pins);
  await page.reload();
  await expect(panel.getByText('No unfinished reading places saved yet.', { exact: true })).toBeVisible();
  expect((await savedState(page)).places).toEqual({});
  await expectHealthy(page, errors);
});

test('the third visible unfinished reading can be removed when the newest saved reading is completed', async ({ page }, info) => {
  const errors = trackErrors(page);
  const oldest = 't_psychosis.md';
  await seed(page, info, { readingPlaces: {
    [COMPLETED]: savedPlace(4), [READING]: savedPlace(3), [OTHER_READING]: savedPlace(2), [oldest]: savedPlace(1),
  }, pins: ['mse.html'] });
  await page.goto('/?tab=library');
  await page.locator('[data-fd-continuity-show]').click();
  const panel = page.locator('.fd-continuity'), recent = panel.locator('[data-fd-reading-resume="1"]');
  await expect(recent).toHaveCount(3);
  expect(await recent.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fd-open')))).toEqual([READING, OTHER_READING, oldest]);
  const before = await savedState(page);
  await panel.locator(`[data-fd-reading-place-remove="${oldest}"]`).click();
  await expect(recent).toHaveCount(2);
  await expect(panel.locator('.fd-continuity__notice')).toContainText(/removed/i);
  await expect(page.locator('#fd-continuity-title')).toBeFocused();
  const after = await savedState(page);
  expect(after.places).toEqual({ [COMPLETED]: before.places[COMPLETED], [READING]: before.places[READING], [OTHER_READING]: before.places[OTHER_READING] });
  expect(after.progress).toBe(before.progress);
  expect(after.pins).toBe(before.pins);
  await expectHealthy(page, errors);
});

test('a real H2 guide saves a visible section and Library Continue restores it without overriding passage links', async ({ page }, info) => {
  const errors = trackErrors(page), ref = 'doc_oral.md';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, info, { completed: 't_psychosis.md' });
  // Only the governance response is controlled, as in the established guide-reader tests.
  // Markdown, headings, collapsible sections, and guide mounting come from the actual build.
  const response = await requestGetWithRetry(page.request, '/governance.json');
  const ledger = await response.json();
  expect(ledger.items[ref], 'the built guide has a governance entry').toBeTruthy();
  ledger.items[ref] = { ...ledger.items[ref], status: 'reviewed', riskLevel: 'low' };
  await page.route('**/governance.json', route => route.fulfill({ json: ledger }));
  await page.goto(`/?page=${ref}`);
  const guide = page.locator('.fd-reader--guide');
  await expect(guide).toBeVisible();
  await expect(guide.locator('[data-fd-reading-status]')).toHaveText('Reading place saved on this device only');
  const headings = guide.locator('.fd-article__body h2');
  expect(await headings.count()).toBeGreaterThanOrEqual(5);
  const heading = headings.nth(3), anchor = await heading.getAttribute('data-fd-reading-anchor');
  expect(anchor).toMatch(/^fd-reading-/);
  const headingId = await heading.getAttribute('id');
  expect(headingId).toMatch(/^guide-/);
  // Hidden nested headings have zero rectangles and must never beat a visible heading
  // when the reading-position tracker decides which section the learner reached.
  const collapsed = guide.locator('.sec-c').filter({ has: page.locator('h3, h4') }).first();
  await collapsed.locator('.sec-h button').click();
  await expect(collapsed.locator('.sec-h button')).toHaveAttribute('aria-expanded', 'false');
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await heading.evaluate(node => {
    window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY + 8);
    window.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await savedState(page)).places[ref]?.heading).toBe(anchor);
  const saved = (await savedState(page)).places[ref];
  await page.goto('/?tab=library');
  await page.locator('[data-fd-continuity-show]').click();
  const resume = page.locator(`.fd-continuity [data-fd-open="${ref}"][data-fd-reading-resume="1"]`);
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(guide).toBeVisible();
  const restored = guide.locator(`[data-fd-reading-anchor="${anchor}"]`);
  await expect(restored).toBeFocused();
  await expect(restored).toHaveAttribute('id', headingId);
  await expect.poll(() => restored.evaluate(node => -node.getBoundingClientRect().top)).toBeGreaterThan(saved.offset - 12);
  await expect.poll(() => restored.evaluate(node => -node.getBoundingClientRect().top)).toBeLessThan(saved.offset + 12);

  const firstId = await headings.first().getAttribute('id');
  expect(firstId).not.toBe(headingId);
  const firstLabel = (await guide.locator(`[data-guide-section="${firstId}"]`).textContent()).trim();
  const findQuery = await headings.first().evaluate(node =>
    node.closest('.sec-c,.fd-guide-section').querySelector('p').textContent.trim().split(/\s+/).slice(0, 8).join(' '));
  expect(findQuery.length).toBeGreaterThan(0);
  await page.goto(`/?page=${ref}&guideSection=${encodeURIComponent(firstId.slice('guide-'.length))}`);
  await expect(page.locator(`#${firstId}`)).toBeFocused();
  await expect(page.locator(`#${firstId}`)).toBeInViewport();
  await expect(page.locator('.fd-guide-arrival')).toContainText(`Opened at “${firstLabel}”.`);
  await expect(page.locator('[data-fd-reading-top]')).toBeHidden();
  // Establish a different saved position again, so Find must win a genuine conflict.
  await restored.evaluate(node => {
    window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY + 8);
    window.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(async () => (await savedState(page)).places[ref]?.heading).toBe(anchor);
  await page.goto(`/?page=${ref}&guideFind=${encodeURIComponent(findQuery)}`);
  await expect(page.getByLabel('Find in this guide', { exact: true })).toHaveValue(findQuery);
  await expect(page.locator('.fd-guide-match').first()).toBeInViewport();
  await expect(page.locator('[data-fd-reading-top]')).toBeHidden();
  await expectHealthy(page, errors);
});

for (const width of [320, 390]) {
  test(`device continuity at ${width}px keeps the first reading above the dock and has reachable keyboard controls`, async ({ page }, info) => {
    const errors = trackErrors(page);
    await page.setViewportSize({ width, height: 844 });
    await seed(page, info, { readingPlaces: { [READING]: savedPlace(1) }, pins: ['mse.html'] });
    await serveReviewedLibrary(page);
    await page.goto('/?tab=library');
    const first = page.locator('.fd-kit__reading').first();
    await expect(first).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const readingBox = await first.boundingBox(), dockBox = await page.locator('.fd-dock:visible').boundingBox();
    expect(readingBox.y + readingBox.height, 'the entire first reading remains above the dock').toBeLessThanOrEqual(dockBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    const jump = page.locator('[data-fd-continuity-show]');
    await jump.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#fd-continuity-title')).toBeFocused();
    await expect(page.locator('#fd-continuity-title')).toBeInViewport();
    const controls = page.locator('[data-fd-continuity-show], .fd-continuity button');
    for (const control of await controls.all()) {
      await control.focus();
      await expect(control).toBeFocused();
      const box = await control.boundingBox();
      expect(Math.round(box.height * 1000) / 1000).toBeGreaterThanOrEqual(44);
      expect(Math.round(box.width * 1000) / 1000).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expectHealthy(page, errors);
  });
}
