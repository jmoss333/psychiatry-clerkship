import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestGetWithRetry, routeFetchWithRetry } from './net-resilience.js';
import { isResidentProject } from './audience.js';
import { essentialsResourceRefs, essentialsResources } from './essentials-inventory.js';

const FROZEN_NOW = new Date('2026-08-17T12:00:00-04:00');
const PHONE = { width: 390, height: 844 };
const DOCK_PHONE = { width: 375, height: 812 };
const FAILURE_COPY = 'This safety protocol is unavailable right now—do not rely on this page for clinical guidance; use the crisis resources below and contact your supervising clinician.';
const runtimeErrors = new WeakMap();
const READING_REF = 't_mood.md';
const READING_SUCCESS = 'Reading place saved on this device only';
const READING_FAILURE = 'Reading place could not be saved on this device';

// Three synthetic sections keep this an ordinary reading (the field-guide enhancer owns H2s).
// Long neutral paragraphs make the second and third anchors reachable at phone height.
// The page's governance is pinned too, not read from the live ledger. A high-risk page that is
// pending (or has drifted since its attestation) renders a pending-high notice whose deferred
// focus -- taken when the startup gate opens or governance.json settles -- scrolls the notice
// into view. That can land after the reading-place restore and reads as the learner scrolling
// to the top. t_mood.md drifted on 2026-09-24 (#763) and this suite went intermittently red for
// it: a test of the reading place, failing on the faculty's queue (CLAUDE.md: never depend on
// live governance state). Pinning it reviewed/low keeps these tests about the reading place.
async function controlledReading(page, ref = READING_REF) {
  await pinGovernance(page, ref, { status: 'reviewed', riskLevel: 'low' });
  const filler = 'A short note about organizing study time. '.repeat(28);
  const markdown = '# Study notes\n\n' + [1, 2, 3].map(n =>
    `### Section ${n}\n\n${filler}\n\n${filler}\n`).join('\n');
  await page.route(`**/content/${ref}`, route => route.fulfill({
    contentType: 'text/markdown', body: markdown,
  }));
}

async function readingReady(page, ref = READING_REF) {
  const reader = page.locator('.fd-reader:visible');
  await expect(reader.locator('.fd-src')).toHaveText(ref);
  await expect(reader.locator('.fd-article__body h3')).toHaveCount(3);
  await expect(reader.locator('[data-fd-reading-status]')).toHaveCount(1);
  await expect(reader).not.toHaveClass(/fd-reader--guide/);
  return reader;
}

async function readingPlaces(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').readingPlaces || {});
}

async function scrollReadingTo(page, index, offset = 85) {
  await page.locator('.fd-article__body h3').nth(index).evaluate((heading, delta) => {
    window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY + delta);
    window.dispatchEvent(new Event('scroll'));
  }, offset);
}

async function expectReadingAnchor(page, index, ref = READING_REF) {
  const id = await page.locator('.fd-article__body h3').nth(index).getAttribute('id');
  await expect.poll(async () => (await readingPlaces(page))[ref]?.heading).toBe(id);
  const expectedOffset = (await readingPlaces(page))[ref].offset;
  expect(expectedOffset).toBeGreaterThanOrEqual(79);
  expect(expectedOffset).toBeLessThanOrEqual(91);
  await expect.poll(() => page.locator(`#${id}`).evaluate(heading =>
    window.scrollY - (heading.getBoundingClientRect().top + window.scrollY))).toBeGreaterThan(expectedOffset - 12);
  await expect.poll(() => page.locator(`#${id}`).evaluate(heading =>
    window.scrollY - (heading.getBoundingClientRect().top + window.scrollY))).toBeLessThan(expectedOffset + 12);
}

test('reading place: reload and phone reflow restore the second heading; Start at top stays cleared', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await seedApp(page, testInfo);
  await controlledReading(page);
  await page.goto(`/?page=${READING_REF}`);
  const reader = await readingReady(page);
  await expect(reader.locator('[data-fd-reading-status]')).toHaveText(READING_SUCCESS);
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await scrollReadingTo(page, 1);
  await expect.poll(async () => (await readingPlaces(page))[READING_REF]?.heading).toBe(
    await reader.locator('.fd-article__body h3').nth(1).getAttribute('id'));
  const saved = (await readingPlaces(page))[READING_REF];
  expect(saved.offset).toBeGreaterThanOrEqual(79);
  expect(saved.offset).toBeLessThanOrEqual(91);
  await page.evaluate(() => sessionStorage.setItem('__fd_test_preserve_seed', '1'));
  await page.reload();
  await readingReady(page);
  await expectReadingAnchor(page, 1);
  await page.screenshot({ path: join(tmpdir(), `device-reading-place-${audience(testInfo).role}-desktop.png`) });
  await page.setViewportSize(PHONE);
  await expectReadingAnchor(page, 1);
  await page.reload();
  await readingReady(page);
  await expectReadingAnchor(page, 1);
  await page.screenshot({ path: join(tmpdir(), `device-reading-place-${audience(testInfo).role}-phone.png`) });
  await expect(reader.locator('[data-fd-reading-top]')).toBeVisible();
  await reader.locator('[data-fd-reading-top]').click();
  await expect.poll(async () => (await readingPlaces(page))[READING_REF]).toBeUndefined();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await page.reload();
  await readingReady(page);
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await readingReady(page);
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await scrollReadingTo(page, 2);
  await expect.poll(async () => (await readingPlaces(page))[READING_REF]?.heading).toBe(
    await reader.locator('.fd-article__body h3').nth(2).getAttribute('id'));
  await expectHealthy(page);
});

test('reading place: a removed heading opens at top and deletes only that reading', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await controlledReading(page);
  await page.goto(`/?page=${READING_REF}`);
  await readingReady(page);
  await page.locator('.fd-reader__back:visible').evaluate(button => button.click());
  await expect(page.locator('.fd-today')).toBeVisible();
  await page.evaluate(ref => {
    sessionStorage.setItem('__fd_test_preserve_seed', '1');
    const state = JSON.parse(localStorage.getItem('cw_frontdoor_v1'));
    state.readingPlaces = {
      [ref]: { heading: 'fd-reading-removed-heading', offset: 120, updatedAt: 100 },
      'other.md': { heading: 'fd-reading-other', offset: 42, updatedAt: 101 },
    };
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify(state));
  }, READING_REF);
  await page.goto(`/?page=${READING_REF}`);
  const reader = await readingReady(page);
  await expect.poll(async () => (await readingPlaces(page))[READING_REF]).toBeUndefined();
  expect((await readingPlaces(page))['other.md']).toEqual({ heading: 'fd-reading-other', offset: 42, updatedAt: 101 });
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(20);
  await expect(reader.locator('[data-fd-reading-top]')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await expectHealthy(page);
});

// "Before the debounce" is arranged inside ONE page task, not across Playwright round trips.
// The controller binds the page's own setTimeout when the reader mounts, so a page.clock
// installed afterwards does not hold its 150 ms debounce: it runs on real time. These tests
// used to install the clock and fast-forward it; on a loaded runner the real debounce fired
// between two round trips and the test either failed (the abandoned section was saved first,
// then the top anchor) or passed without reaching the path it names (resize found nothing
// pending to flush). The debounce logic itself is pinned with injected timers in
// tests/fd-wire.test.mjs; these pin the same behaviour in a real browser.
async function scrollThen(page, index, after) {
  await page.locator('.fd-article__body h3').nth(index).evaluate((heading, then) => {
    window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY + 85);
    window.dispatchEvent(new Event('scroll'));
    if (then === 'resize') window.dispatchEvent(new Event('resize'));
    if (then === 'top') { window.scrollTo(0, 0); window.dispatchEvent(new Event('scroll')); }
  }, after);
}

test('reading place: pending scroll survives resize before the debounce', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await seedApp(page, testInfo);
  await controlledReading(page);
  await page.goto(`/?page=${READING_REF}`);
  await readingReady(page);
  await scrollReadingTo(page, 1);
  await expectReadingAnchor(page, 1);
  // Section 3 is still pending when the resize lands, so only the resize's flush can save it:
  // were the flush lost, the reflow would restore the saved section 2 over it.
  await scrollThen(page, 2, 'resize');
  await page.setViewportSize(PHONE);
  await expectReadingAnchor(page, 2);
  await expectHealthy(page);
});

test('reading place: returning to the fresh position cancels an abandoned pending section', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await seedApp(page, testInfo);
  await controlledReading(page);
  await page.goto(`/?page=${READING_REF}`);
  const reader = await readingReady(page);
  await expect(reader.locator('[data-fd-reading-status]')).toHaveText(READING_SUCCESS);
  await scrollThen(page, 2, 'top');
  // Real time, well past the 150 ms debounce: a cancelled section must stay unsaved.
  await page.waitForTimeout(400);
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await page.setViewportSize(PHONE);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await scrollReadingTo(page, 1);
  await expectReadingAnchor(page, 1);
  await expectHealthy(page);
});

test('reading place: Today Continue focuses once; Library and Search restore scroll without focus theft', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo);
  const ref = isResidentProject(testInfo.project.name) ? 'pg_interview.md' : 'welcome.md';
  await pinGovernance(page, ref, { status: 'reviewed', riskLevel: 'low' });
  await page.goto('/?tab=today');
  const continueButton = page.locator(`[data-fd-reading-resume="1"][data-fd-open="${ref}"]:visible`).first();
  await expect(continueButton).toBeVisible();
  const searchTitle = (await continueButton.locator('.fd-continue__title,.fd-lastread__title').textContent())
    .replace(/^You were reading:\s*/, '').trim();
  await controlledReading(page, ref);
  await continueButton.click();
  await readingReady(page, ref);
  await scrollReadingTo(page, 1);
  await expect.poll(async () => (await readingPlaces(page))[ref]?.heading).toBe(
    await page.locator('.fd-article__body h3').nth(1).getAttribute('id'));
  const resumeId = (await readingPlaces(page))[ref].heading;
  await page.locator('.fd-reader__back:visible').evaluate(button => button.click());
  await expect(page.locator('.fd-today')).toBeVisible();
  await page.evaluate(id => {
    window.__readingFocusCalls = 0;
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function(...args) {
      if (this.id === id) window.__readingFocusCalls++;
      return focus.apply(this, args);
    };
  }, resumeId);
  await page.locator(`[data-fd-reading-resume="1"][data-fd-open="${ref}"]:visible`).first().click();
  await readingReady(page, ref);
  await expectReadingAnchor(page, 1, ref);
  await expect(page.locator('.fd-article__body h3').nth(1)).toBeFocused();
  expect(await page.evaluate(() => window.__readingFocusCalls)).toBe(1);
  await page.locator('.fd-reader__back:visible').evaluate(button => button.click());
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  await page.getByRole('dialog', { name: 'Search' }).getByRole('button', { name: 'Browse the Library' }).click();
  const full = page.locator('[data-fd-library-view="full"]:visible');
  if (await full.count()) await full.click();
  const libraryLink = page.locator(`[data-fd-open="${ref}"]:visible`).first();
  await expect(libraryLink).toBeVisible();
  await libraryLink.click();
  await readingReady(page, ref);
  await expectReadingAnchor(page, 1, ref);
  await expect(page.locator('.fd-reader:visible .fd-article__h1')).toBeFocused();
  expect(await page.evaluate(() => window.__readingFocusCalls)).toBe(1);
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await expect(dialog.getByRole('textbox', { name: 'Search resources' })).toBeFocused();
  await expect(page.locator('.fd-article__body h3').nth(1)).not.toBeFocused();
  await dialog.getByRole('textbox', { name: 'Search resources' }).fill(searchTitle);
  await dialog.locator(`[data-fd-open="${ref}"]:visible`).first().click();
  await readingReady(page, ref);
  await expectReadingAnchor(page, 1, ref);
  await expect(page.locator('.fd-reader:visible .fd-article__h1')).toBeFocused();
  expect(await page.evaluate(() => window.__readingFocusCalls)).toBe(1);
  await expectHealthy(page);
});

test('reading place: Back flushes pending scroll and failed device write shows failure copy', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await controlledReading(page);
  await page.goto(`/?page=${READING_REF}`);
  const reader = await readingReady(page);
  const thirdId = await reader.locator('.fd-article__body h3').nth(2).getAttribute('id');
  await scrollReadingTo(page, 2);
  await page.evaluate(() => document.querySelector('.fd-reader__back').click());
  await expect.poll(async () => (await readingPlaces(page))[READING_REF]?.heading).toBe(thirdId);
  await page.goto(`/?page=${READING_REF}`);
  await readingReady(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'cw_frontdoor_v1') throw new Error('simulated quota error');
      return original.call(this, key, value);
    };
  });
  await scrollReadingTo(page, 1);
  await expect(reader.locator('[data-fd-reading-status]')).toHaveText(READING_FAILURE);
  await expect(reader.locator('[data-fd-reading-status]')).not.toHaveText(READING_SUCCESS);
  await expectHealthy(page);
});

test('reading place: fresh storage failure is shown immediately without a bookmark', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await controlledReading(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'cw_frontdoor_v1') throw new Error('simulated quota error');
      return original.call(this, key, value);
    };
  });
  await page.goto(`/?page=${READING_REF}`);
  const reader = await readingReady(page);
  await expect(reader.locator('[data-fd-reading-status]')).toHaveText(READING_FAILURE);
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await expectHealthy(page);
});

test('reading place: Settings erase survives reload and pagehide', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await controlledReading(page);
  await page.goto(`/?page=${READING_REF}`);
  await readingReady(page);
  await scrollReadingTo(page, 1);
  await expect.poll(async () => Boolean((await readingPlaces(page))[READING_REF])).toBe(true);
  await page.evaluate(() => sessionStorage.setItem('__fd_test_preserve_seed', '1'));
  await page.locator('.fd-settingsbtn:visible').click();
  await page.locator('[data-fd-clear-ask]:visible').click();
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('[data-fd-clear-confirm]:visible').click(),
  ]);
  expect(await page.evaluate(() => localStorage.getItem('cw_frontdoor_v1'))).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate(() => localStorage.getItem('cw_frontdoor_v1'))).toBeNull();
  await expectHealthy(page);
});

test('reading place: guest, guide, tool, and faculty preview cannot claim a saved ordinary reading', async ({ page }, testInfo) => {
  await controlledReading(page);
  await page.goto(`/?page=${READING_REF}`);
  const guest = await readingReady(page);
  await expect(guest.locator('[data-fd-reading-status]')).toHaveText(READING_FAILURE);
  await scrollReadingTo(page, 1);
  expect((await readingPlaces(page))[READING_REF]).toBeUndefined();
  await page.evaluate(role => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'today', viewWeek: 1 }));
  }, audience(testInfo).role);
  await page.goto('/?page=orientation.md');
  await expect(page.locator('.fd-reader--guide')).toBeVisible();
  await expect(page.locator('[data-fd-reading-status]')).toHaveCount(0);
  await page.goto('/?tool=question-bank-practice.html');
  await expect(page.locator('.fd-reader--tool')).toBeVisible();
  await expect(page.locator('[data-fd-reading-status]')).toHaveCount(0);
  const beforePreview = await page.evaluate(() => localStorage.getItem('cw_frontdoor_v1'));
  await page.goto(`/?page=${READING_REF}&reviewKey=page:${READING_REF}&reviewToken=${'a'.repeat(32)}`);
  await expect(page.locator('#content h3')).toHaveCount(3);
  await expect(page.locator('[data-fd-reading-status]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cw_frontdoor_v1'))).toBe(beforePreview);
  await expectHealthy(page);
});

test('reading place: APP practice choices never enter the Front Door store', async ({ page }, testInfo) => {
  test.skip(!isResidentProject(testInfo.project.name), 'APP practice exists only on the resident build');
  await page.goto('/');
  await page.locator('[data-fd-role="app"]:visible').click();
  await expect(page.locator('.fd-app')).toBeVisible();
  await page.locator('[data-fd-app-practice-open="training-briefing"]:visible').click();
  await expect(page.locator('.fd-app-practice')).toBeVisible();
  await page.locator('[data-fd-app-practice-reveal]:visible').click();
  for (const choice of ['review-time:still-known', 'source-status:changed', 'verification-owner:clarify']) {
    await page.locator(`[data-fd-app-practice-classify="${choice}"]:visible`).click();
  }
  await page.locator('[data-fd-app-practice-question="confirm-owner"]:visible').click();
  const stored = await page.evaluate(() => localStorage.getItem('cw_frontdoor_v1') || '');
  expect(stored).not.toMatch(/training-briefing|source-status|changed|confirm-owner/);
  await expect(page.locator('[data-fd-reading-status]')).toHaveCount(0);
  await expectHealthy(page);
});

function audience(testInfo) {
  const resident = isResidentProject(testInfo.project.name);
  return {
    role: resident ? 'pgy1' : 'student',
    libraryCount: resident ? 93 : 83,  // +therapy_on_the_unit.md, +therapy_reading_room.md (WP-T3); res +rp-post-event-huddle.html (2026-09-04)
    residentRef: resident ? 'rp-agitation.html' : null,
    weekCount: resident ? 4 : 6,
    pathHeading: resident ? 'Your 4-week path' : 'Suggested learning plan',
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

async function pinGovernance(page, ref, status) {
  const response = await requestGetWithRetry(page.request, '/governance.json');
  const ledger = await response.json();
  if (!ledger.items[ref]) throw new Error(`Missing governance fixture row: ${ref}`);
  ledger.items[ref] = { ...ledger.items[ref], ...status };
  await page.route('**/governance.json', route => route.fulfill({ json: ledger }));
}

async function expectHealthy(page) {
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
  expect(runtimeErrors.get(page)).toEqual([]);
}

test('route: Today shows only the oldest unrouted question while View all opens the complete inbox', async ({ page }, testInfo) => {
  const capture = { v: 2, items: [
    { id: 'routed', text: 'Question already set for rounds?', at: 1, ctx: null, route: 'rounds', state: 'open' },
    { id: 'oldest', text: 'Oldest unrouted question?', at: 2, ctx: null, route: null, state: 'open' },
    { id: 'newer', text: 'Newer unrouted question?', at: 3, ctx: null, route: null, state: 'open' },
  ] };
  await seedApp(page, testInfo, { storage: { cw_capture_v1: capture } });
  await page.goto('/');
  const card = page.locator('.fd-capture:visible');
  await expect(card.locator('.fd-capture__question')).toHaveText('Oldest unrouted question?');
  await expect(card).not.toContainText('Question already set for rounds?');
  await expect(card.locator('.fd-capture__new')).toHaveText('View all 3');
  await card.locator('.fd-capture__new').click();
  await expect(page.locator('.cap-list li')).toHaveCount(3);
  await expect(page.locator('.cap-list')).toContainText('Question already set for rounds?');
  await expect(page.locator('.cap-list')).toContainText('Newer unrouted question?');
  await expect(page.locator('.cap-email-select:checked')).toHaveCount(0);
  await expectHealthy(page);
});

test('capture persistence failure keeps questions and reports the failed Delete, Erase all, and Done actions', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  await page.locator('.fd-capture-launch--global[data-capture-open]:visible').click();
  for (const question of ['First learning question?', 'Second learning question?']) {
    await page.locator('#capText').fill(question);
    await page.locator('#capSave').click();
  }
  await expect(page.locator('.cap-list li')).toHaveCount(2);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__captureOriginalSetItem = original;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'cw_capture_v1') throw new Error('Storage blocked');
      return original.call(this, key, value);
    };
  });
  const deleteButton = page.locator('[data-cap-del]').first();
  await deleteButton.click();
  await expect(page.locator('#capStatus')).toContainText('Could not delete');
  await expect(page.locator('.cap-list li')).toHaveCount(2);
  await page.evaluate(() => { Storage.prototype.setItem = window.__captureOriginalSetItem; });
  await page.evaluate(() => {
    window.confirm = () => true;
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key === 'cw_capture_v1') throw new Error('Storage blocked');
      return original.call(this, key);
    };
  });
  await page.locator('#capEraseAll').click();
  await expect(page.locator('#capStatus')).toContainText('Could not erase');
  await expect(page.locator('.cap-list li')).toHaveCount(2);
  await page.locator('[data-cap-del]').first().click();
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  const done = page.locator('#capHold [data-cap-drop]');
  await done.click();
  await expect(page.locator('#capStatus')).toContainText('Could not finish');
  await expect(done).toBeVisible();
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  await expectHealthy(page);
});

test('capture Schedule review and Done move focus to the stable editor after the saved card repaints', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  const launcher = page.locator('.fd-capture-launch--global[data-capture-open]:visible');
  await launcher.click();
  await page.locator('#capText').fill('How should I distinguish delirium from psychosis?');
  await page.locator('#capSave').click();
  await page.locator('#capHold [data-cap-review]').click();
  await expect(page.locator('#capText')).toBeFocused();
  await expect(page.locator('.cap-list__status')).toHaveText('Look up later');
  await page.locator('#capText').fill('Another learning question?');
  await page.locator('#capSave').click();
  await page.locator('#capHold [data-cap-drop]').click();
  await expect(page.locator('#capText')).toBeFocused();
  await page.locator('#capCancel').click();
  await expect(launcher).toBeFocused();
  await expectHealthy(page);
});

test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
});

// A missing dock, a second fixed phone bar, or a covered final reading row must fail here.
async function expectAdaptiveDock(page, expectedFirst, expectedSecond, expectedContext) {
  const dock = page.locator('.fd-dock:visible');
  await expect(dock).toHaveCount(1);
  await expect(dock).toHaveAttribute('aria-label', 'Learning actions');
  const items = dock.locator('button:visible');
  await expect(items).toHaveCount(4);
  const labels = (await items.allTextContents()).map(label => label.trim());
  expect(labels[0]).toBe(expectedFirst);
  expect(labels[1]).toBe(expectedSecond);
  if (expectedContext) {
    expect(labels[2]).toBe(expectedContext.label);
    await expect(items.nth(2)).toHaveAttribute('data-fd-dock-forward', expectedContext.sourceId);
  } else {
    expect(labels[2].length).toBeGreaterThan(0);
  }
  expect(labels.slice(3)).toEqual(['Capture']);
  // Browse is a native <details> disclosure, not a button: closed, its two menu actions render
  // but are not :visible, which is why it is absent from the `items` count above.
  await expect(dock.locator('details.fd-dock__browse:visible')).toHaveCount(1);
  await expect(dock.locator('details.fd-dock__browse summary')).toHaveText('Browse');
  const geometry = await page.evaluate(() => {
    const dock = document.querySelector('.fd-dock');
    const bar = dock.getBoundingClientRect();
    const fixedBottomNavs = [...document.querySelectorAll('nav')].filter(nav => {
      const box = nav.getBoundingClientRect();
      const style = getComputedStyle(nav);
      return style.position === 'fixed' && style.visibility !== 'hidden' &&
        style.display !== 'none' && box.width > 0 && box.height > 0 &&
        box.bottom >= innerHeight - 1;
    });
    return {
      count: fixedBottomNavs.length,
      position: getComputedStyle(dock).position,
      bottom: bar.bottom,
      targets: [...dock.querySelectorAll('button')].map(button => {
        const box = button.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height };
      }),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(geometry.count).toBe(1);
  expect(geometry.position).toBe('fixed');
  expect(geometry.bottom).toBeCloseTo(DOCK_PHONE.height, 0);
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  for (const target of geometry.targets) {
    expect(target.left).toBeGreaterThanOrEqual(0);
    expect(target.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('.fd-tabs:visible,.fd-actionbar:visible,#fdCaptureMount:visible')).toHaveCount(0);
  return dock;
}

async function expectDockDialogs(page, dock) {
  // The dock no longer has its own Search opener (2026-09-25 -- replaced by Browse); the
  // header's .fd-searchbtn is the one search entry point now, but the dialog/focus-trap
  // behavior it opens is unchanged, so it is still worth exercising from this phone-dock test.
  const search = page.locator('.fd-searchbtn[data-fd-search]:visible');
  await search.click();
  const searchDialog = page.getByRole('dialog', { name: 'Search' });
  await expect(searchDialog).toBeVisible();
  const searchInput = searchDialog.getByRole('textbox', { name: 'Search resources' });
  await expect(searchInput).toBeFocused();
  const lastSearchControl = searchDialog.locator('button:visible').last();
  await searchInput.press('Shift+Tab');
  await expect(lastSearchControl).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(searchInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(searchDialog).toHaveCount(0);
  await expect(search).toBeFocused();

  const capture = dock.locator('[data-capture-open]:visible');
  await capture.click();
  const captureDialog = page.locator('.cap-sheet[role="dialog"]');
  await expect(captureDialog).toBeVisible();
  const question = captureDialog.locator('#capText');
  await expect(question).toBeFocused();
  await question.press('Shift+Tab');
  await expect(captureDialog.locator('#capCancel')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(question).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(captureDialog).toHaveCount(0);
  await expect(capture).toBeFocused();
}

test('adaptive mobile dock: standard audience routes, dialogs, reader forwarding, and final-row clearance', async ({ page }, testInfo) => {
  await page.setViewportSize(DOCK_PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedApp(page, testInfo);
  await page.goto('/?tab=today');
  // The empty device stores leave the current week's next item as Today's primary.
  let dock = await expectAdaptiveDock(page, 'Today', 'Path', { label: 'Continue', sourceId: 'primary-week' });
  await dock.locator('[data-fd-tab="path"]:visible').click();
  await expect(page.locator('.fd-path')).toBeVisible();
  dock = await expectAdaptiveDock(page, 'Today', 'Path');
  await expectDockDialogs(page, dock);

  await page.goto('/?page=t_mood.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  dock = await expectAdaptiveDock(page, 'Today', 'Path');
  const source = page.locator('[data-fd-dock-source="primary-reader"]');
  const center = dock.locator('button').nth(2);
  await expect(center).toHaveAttribute('data-fd-dock-forward', 'primary-reader');
  await expect(center).toHaveText(await source.getAttribute('data-fd-dock-label'));
  const before = await source.getAttribute('aria-pressed');
  await center.click();
  await expect(page.locator('.fd-today')).toBeVisible();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_progress_v1') || '{}'));
  expect(progress['t_mood.md']?.done).toBe(before !== 'true');
  await expectAdaptiveDock(page, 'Today', 'Path');

  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  const searchDialog = page.getByRole('dialog', { name: 'Search' });
  const browse = searchDialog.getByRole('button', { name: 'Browse the Library' });
  await expect(browse).toBeVisible();
  await browse.click();
  await expect(page.locator('.fd-library')).toBeVisible();
  // The helper also includes tool tabs, which CSS places above the readings on phones. Check
  // the actual last reading rather than the last element in the shared inventory selector.
  const finalReading = page.locator('.fd-kit__reading[data-fd-open]').last();
  await expect(finalReading).toBeVisible();
  await finalReading.scrollIntoViewIfNeeded();
  await finalReading.focus();
  const clearance = await finalReading.evaluate(el => {
    const row = el.getBoundingClientRect();
    const dock = document.querySelector('.fd-dock').getBoundingClientRect();
    const x = row.left + Math.min(8, row.width / 2);
    const y = row.bottom - Math.min(8, row.height / 2);
    return { rowBottom: row.bottom, dockTop: dock.top, focusVisible: el.contains(document.elementFromPoint(x, y)) };
  });
  expect(clearance.rowBottom).toBeLessThanOrEqual(clearance.dockTop + 0.5);
  expect(clearance.focusVisible).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('adaptive-mobile-dock-standard.png') });
  await expectHealthy(page);
});

test('adaptive mobile dock: enhanced Orientation guide retains Capture and forwarded completion', async ({ page }, testInfo) => {
  await page.setViewportSize(DOCK_PHONE);
  await seedApp(page, testInfo, { state: { autoAdvance: false } });
  await page.goto('/?page=orientation.md');
  await expect(page.locator('.fd-reader--guide')).toBeVisible();
  const dock = await expectAdaptiveDock(page, 'Today', 'Path');
  await expect(dock.locator('[data-capture-open]')).toBeVisible();
  const complete = dock.getByRole('button', { name: 'Mark done', exact: true });
  await expect(complete).toBeVisible();
  await expect(complete).toHaveAttribute('data-fd-dock-forward', 'primary-reader');
  await expect(page.getByLabel('Find in this guide', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print guide', exact: true })).toBeVisible();
  await expect(page.locator('.fd-guide-practice[data-fd-open]')).toBeVisible();
  const contents = page.locator('.fd-guide-contents');
  await expect(contents.locator('summary')).toBeVisible();
  await contents.locator('summary').click();
  await expect(contents.getByRole('navigation', { name: 'On this page' })).toBeVisible();
  await complete.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cw_progress_v1') || '{}')['orientation.md']?.done)).toBe(true);
  await expectAdaptiveDock(page, 'Today', 'Path');
  await expectHealthy(page);
});

for (const mutation of ['save', 'delete']) {
  test(`adaptive mobile dock: Capture ${mutation} preserves expanded state and restores its exact invoker`, async ({ page }, testInfo) => {
    await page.setViewportSize(DOCK_PHONE);
    await seedApp(page, testInfo);
    await page.goto('/?tab=today');
    await expect(page.locator('.fd-today')).toBeVisible();
    const capture = page.locator('.fd-dock [data-capture-open]:visible');
    await capture.evaluate(el => { window.__dockCaptureInvoker = el; });
    await expect(capture).toHaveAttribute('aria-expanded', 'false');
    await capture.click();
    await expect(capture).toHaveAttribute('aria-expanded', 'true');
    const dialog = page.locator('.cap-sheet[role="dialog"]');
    const input = dialog.locator('#capText');
    await input.fill('How can I organize my learning questions?');
    await dialog.locator('#capSave').click();
    await expect(dialog.locator('.cap-list li')).toHaveCount(1);
    if (mutation === 'delete') {
      await dialog.getByRole('button', { name: 'Delete question: How can I organize my learning questions?', exact: true }).click();
      await expect(dialog.locator('.cap-list li')).toHaveCount(0);
    }
    await expect(input).toBeFocused();
    await expect(capture).toHaveAttribute('aria-expanded', 'true');
    expect(await capture.evaluate(el => el === window.__dockCaptureInvoker)).toBe(true);
    await expect(page.locator('.fd-dock:visible')).toHaveCount(1);
    await expect(capture).toHaveCount(1);
    // Mutation may change the last dialog control; the real first/last trap still applies.
    const last = dialog.locator('button:visible').last();
    await input.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(input).toBeFocused();
    if (mutation === 'save') await input.press('Escape');
    else await dialog.locator('#capCancel').click();
    await expect(dialog).toHaveCount(0);
    await expect(capture).toHaveAttribute('aria-expanded', 'false');
    await expect(capture).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === window.__dockCaptureInvoker)).toBe(true);
    await expectHealthy(page);
  });
}

// The dock no longer has its own Search opener (2026-09-25 -- replaced by Browse; the header's
// .fd-searchbtn[data-fd-search] is the one search entry point now), so the exact-invoker-survives
// -delayed-hydration coverage that used to live here no longer has a mechanism to test: Browse is
// a stateless native <details> disclosure with no text input to preserve, and the header search
// button's own hydration-focus-retention is already covered by frontdoor-runtime.spec.js's
// 'same-route data hydration preserves focused header and Today controls'.

test('adaptive mobile dock: resident APP invitation substitutes slots without changing saved identity', async ({ page }, testInfo) => {
  test.skip(!isResidentProject(testInfo.project.name), 'APP invitation exists only on the resident build');
  await page.setViewportSize(DOCK_PHONE);
  await seedApp(page, testInfo);
  await page.goto('/?tab=library');
  await expect(page.locator('.fd-library')).toBeVisible();
  // Settle the normal Library navigation write before comparing invitation-mode storage.
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  await page.getByRole('dialog', { name: 'Search' }).getByRole('button', { name: 'Browse the Library' }).click();
  await expect(page.locator('.fd-library')).toBeVisible();
  // Prevent the fixture's load-time seeding from masking an APP-mode storage write on reload.
  await page.evaluate(() => sessionStorage.setItem('__fd_test_preserve_seed', '1'));
  const storageSnapshot = () => page.evaluate(() => {
    const values = store => Object.fromEntries(Object.keys(store)
      .filter(key => key.startsWith('cw_') || key.startsWith('rp_'))
      .sort().map(key => [key, store.getItem(key)]));
    return { local: values(localStorage), session: values(sessionStorage) };
  });
  const beforeInvite = await storageSnapshot();
  await page.goto('/?audience=app&tab=today');
  await expect(page.locator('.fd-app')).toBeVisible();
  const dock = await expectAdaptiveDock(page, 'On shift', 'The Essentials');
  await dock.locator('[data-fd-tab="library"]:visible').first().click();
  await expect(page.locator('.fd-library')).toBeVisible();
  await expectAdaptiveDock(page, 'On shift', 'The Essentials');
  await expectDockDialogs(page, dock);
  expect(await storageSnapshot()).toEqual(beforeInvite);
  await page.screenshot({ path: testInfo.outputPath('adaptive-mobile-dock-app.png') });
  await page.goto('/?tab=library');
  await page.reload();
  await expect(page.locator('.fd-library')).toBeVisible();
  await expectAdaptiveDock(page, 'Today', 'Path');
  expect(await storageSnapshot()).toEqual(beforeInvite);
  expect(JSON.parse(beforeInvite.local.cw_frontdoor_v1).role).toBe('pgy1');
  await expectHealthy(page);
});

test('dock forwards a rendered resume anchor through its href once and a button once', async ({ page }) => {
  let resumeRequests = 0;
  await page.route('https://dock.test/**', async (route) => {
    if (route.request().url().includes('tool=question-bank-practice.html')) resumeRequests++;
    await route.fulfill({ contentType: 'text/html', body: '<main>Dock target</main>' });
  });
  await page.goto('https://dock.test/');
  const snippets = ['fd_data.js', 'fd_due.js', 'fd_wire.js'].map((name) =>
    readFileSync(new URL(`../../13_Faculty_Resources/_automation/site_build/frontdoor/${name}`, import.meta.url), 'utf8'));
  for (const content of snippets) await page.addScriptTag({ content });
  await page.evaluate(() => {
    document.body.innerHTML =
      fdResumeCard({ queueIds: ['a', 'b', 'c'], idx: 1 }, true) +
      '<button type="button" data-fd-dock-source="primary-week" data-fd-dock-label="Continue">Continue</button>';
    window.buttonClicks = 0;
    document.querySelector('[data-fd-dock-source="primary-week"]').addEventListener('click', () => window.buttonClicks++);
    document.querySelector('[data-fd-dock-source="primary-resume"]').addEventListener('click', () =>
      sessionStorage.setItem('resumeClicks', String(Number(sessionStorage.getItem('resumeClicks') || 0) + 1)));
    sessionStorage.removeItem('routeWrites');
    for (const name of ['pushState', 'replaceState']) {
      const original = history[name];
      history[name] = function (...args) {
        sessionStorage.setItem('routeWrites', String(Number(sessionStorage.getItem('routeWrites') || 0) + 1));
        return original.apply(this, args);
      };
    }
  });
  const anchor = page.locator('a[data-fd-dock-source="primary-resume"]');
  await expect(anchor).toHaveAttribute('href', '?tool=question-bank-practice.html&resume=1');
  expect(await page.evaluate(() => fdForwardDockAction(document, 'primary-week'))).toBe(true);
  expect(await page.evaluate(() => window.buttonClicks)).toBe(1);
  expect(page.url()).toBe('https://dock.test/');
  const destination = 'https://dock.test/?tool=question-bank-practice.html&resume=1';
  await Promise.all([
    page.waitForURL(destination, { timeout: 3_000 }),
    page.evaluate(() => fdForwardDockAction(document, 'primary-resume')),
  ]);
  expect(page.url()).toBe(destination);
  expect(resumeRequests).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('resumeClicks'))).toBe('1');
  expect(await page.evaluate(() => sessionStorage.getItem('routeWrites'))).toBeNull();
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
  await expect(page.locator('[data-fd-tab="today"]:visible')).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBe('2026-08-17');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(`[data-fd-role="${site.role}"]`).click();
  await page.locator('[data-fd-week="0"]').click();
  await expect(page.locator('.fd-library')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBeNull();
  await page.locator('[data-fd-library-view="full"]').click();

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
  await page.locator('[data-fd-tab="path"]:visible').click();
  await expect(page.getByRole('heading', { name: site.pathHeading })).toBeVisible();
  await expect(page.locator('.fd-timeline__row')).toHaveCount(site.weekCount);
  expect(await page.locator('.fd-path').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.content()).toContain(site.pathId);
  const retired = await requestGetWithRetry(page.request, '/tools/learning-path.html');
  expect(retired.status()).toBe(404);
  await expectHealthy(page);
});

test('Path route keeps selection, current week, keyboard focus, and mobile rail distinct', async ({ page }, testInfo) => {
  const site = audience(testInfo);
  await seedApp(page, testInfo);
  await page.goto('/');
  await page.locator('[data-fd-tab="path"]:visible').click();

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(site.weekCount);
  await expect(page.locator('.fd-pathroute__curve')).toBeVisible();
  await expect(page.locator('.fd-pathroute__connector')).toHaveCount(1);
  await expect(page.locator('[data-fd-view-week="1"]')).toHaveAttribute('aria-current', 'step');

  const week2 = page.locator('[data-fd-view-week="2"]');
  await week2.click();
  await expect(week2).toBeFocused();
  await expect(week2).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#fd-path-detail .fd-eyebrow')).toHaveText('Week 2');
  await expect(page.locator('[data-fd-view-week="1"]')).toHaveAttribute('aria-current', 'step');

  const beforeArrow = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('ArrowRight');
  const week3 = page.locator('[data-fd-view-week="3"]');
  await expect(week3).toBeFocused();
  await expect(week3).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeArrow);

  await page.keyboard.press('Home');
  await expect(page.locator('[data-fd-view-week="1"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator(`[data-fd-view-week="${site.weekCount}"]`)).toBeFocused();

  await page.setViewportSize(PHONE);
  await expect(page.locator('.fd-pathroute__curve')).toBeHidden();
  await expect(page.locator(`[data-fd-view-week="${site.weekCount}"] .fd-timeline__theme`)).toBeVisible();
  expect(await page.locator('.fd-path').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expectHealthy(page);
});

// The 390px check above passed on macOS both before and after the .fd-row__title fix, because
// macOS font metrics happened to land just under the floor a max-content-sized title imposed
// (339px on res / 324px on ms3, against 362px available). Ubuntu's wider defaults did not, so CI
// caught what the workstation could not. Asserting at 320px removes the luck: an untruncated
// title overflows there on every platform, so this fails without the fix rather than depending
// on which fonts the runner happens to have.
test('Path detail titles truncate rather than set a horizontal floor at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await seedApp(page, testInfo);
  await page.goto('/');
  await page.locator('[data-fd-change-week]').click();
  await page.locator('[data-fd-week="1"]').click();
  await page.locator('[data-fd-tab="path"]:visible').click();
  await expect(page.locator('.fd-path')).toBeVisible();

  expect(await page.locator('.fd-path').evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);

  // The row title must be the element that gives: it fills its column and clips, rather than
  // widening the pane. Without align-self:stretch its box equals its full text width, so
  // scrollWidth === clientWidth here and the overflow is pushed up to .fd-path instead.
  const title = await page.locator('.fd-row__title').first().evaluate((el) => ({
    clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
  }));
  expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
  await expectHealthy(page);
});

test('tab focus order is stable and Path preview does not change rotation until adoption', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');

  await page.locator('[data-fd-home]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.fd-searchbtn[data-fd-search]:visible')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-change-week]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.fd-safetybtn[data-fd-safety]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-settings]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-tab="today"]:visible')).toBeFocused();

  await page.locator('[data-fd-tab="path"]:visible').click();
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
  await page.locator('[data-fd-library-view="full"]').click();
  const refs = await page.locator('.fd-collink[data-fd-open]').evaluateAll(controls => (
    controls.map(control => control.getAttribute('data-fd-open'))
  ));
  const firstRef = refs.find(ref => ref.endsWith('.md'));
  expect(firstRef).toBeTruthy();
  await page.locator(`.fd-collink[data-fd-open="${firstRef}"]`).click();
  const nextRef = await page.locator('.fd-prevnext__btn.is-next').getAttribute('data-fd-open');
  expect(nextRef).toMatch(/\.md$/);
  await page.goto('/');
  await page.locator('[data-fd-library-view="full"]').click();
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

test('command-K and slash search restore focus on dismissal and open results directly', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  const opener = page.locator('.fd-searchbtn[data-fd-search]:visible');

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
  expect(firstRef).toBeTruthy();
  await input.press('Enter');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(page.locator('.fd-search')).toHaveCount(0);
  await expect(page.locator('.fd-sheet')).toHaveCount(0);
  await expect(page.locator('.fd-src')).toHaveText(firstRef);
  expect(new URL(page.url()).searchParams.get(firstRef.endsWith('.html') ? 'tool' : 'page')).toBe(firstRef);
  await expectHealthy(page);
});

test('learner-language search finds tasks, safety abbreviations and complete resource names', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  const input = page.getByRole('textbox', { name: 'Search resources', exact: true });
  for (const [query, ref] of [
    ['prepare for rounds', 'oral.html'], ['ask family for collateral', 'collateral_workflow.md'],
    ['practice a difficult conversation', 'communication-practice.html'],
    ['hearing voices', 't_psychosis.md'], ['PHQ9', 'screeners.html'], ['SI?', 'pg_suicide.md'],
  ]) {
    await input.fill(query);
    const refs = await page.locator('.fd-result').evaluateAll(rows => rows.map(row =>
      row.getAttribute('data-fd-open') || row.getAttribute('data-fd-safety')));
    expect(refs.slice(0, 3)).toContain(ref);
    expect(new Set(refs).size).toBe(refs.length);
  }
  await input.fill('BFCRS');
  await expect(page.getByRole('button', {
    name: /Bush-Francis Catatonia Scale \(BFCRS\) — Official Form & Training.*reference · not reproduced/,
  })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  const title = page.locator('.fd-result__title').first();
  await expect(title).toHaveCSS('white-space', 'normal');
  expect(await title.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await title.evaluate(el => el.clientWidth)).toBeGreaterThan(150);
  await input.fill('zzzzqqq');
  await expect(page.locator('.fd-searchpanel__body')).toHaveAttribute('aria-label', '0 results');
  await page.getByRole('button', {name:'Browse the Library', exact:true}).click();
  await expect(page.locator('.fd-library')).toBeVisible();
  await expect(page.locator('.fd-search')).toHaveCount(0);
  await expectHealthy(page);
});

test('Enter on a punctuated exact resource name opens that resource, not a spurious safety panel', async ({ page }, testInfo) => {
  const resident = isResidentProject(testInfo.project.name);
  const cases = [
    ['One Patient, Six Weeks', 'one-patient-six-weeks.html'],
    [`First-Episode Psychosis (Sep 7) — ${resident ? 'Resident' : 'MS3'}`, `cotw_20260907_fep_${resident ? 'res' : 'ms3'}.md`],
    ...(resident ? [['Post-Event Learning Huddle (2 min)', 'rp-post-event-huddle.html']] : []),
  ];
  await seedApp(page, testInfo);
  for (const [query, ref] of cases) {
    await page.goto('/');
    await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
    const input = page.getByRole('textbox', { name:'Search resources', exact:true });
    await input.fill(query);
    await expect(page.locator('.fd-result').first()).toHaveAttribute('data-fd-open', ref);
    await input.press('Enter');
    await expect(page.locator('.fd-search')).toHaveCount(0);
    await expect(page.locator('.fd-sheet')).toHaveCount(0);
    await expect(page.locator('.fd-src')).toHaveText(ref);
    expect(new URL(page.url()).searchParams.get(ref.endsWith('.html') ? 'tool' : 'page')).toBe(ref);
    await expectHealthy(page);
  }
});

test('dated title variants retain safety priority and open the first ordinary resource', async ({ page }, testInfo) => {
  const resident = isResidentProject(testInfo.project.name);
  const query = `Catatonia [Aug 31] — ${resident ? 'Resident' : 'MS3'}?`;
  const ref = `cotw_20260831_catatonia_${resident ? 'res' : 'ms3'}.md`;
  await seedApp(page, testInfo);
  await page.goto('/');
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  const input = page.getByRole('textbox', { name:'Search resources', exact:true });
  await input.fill(query);
  await expect(page.locator('.fd-result').first()).toHaveAttribute('data-fd-safety', 'exp_consult.md');
  await expect(page.locator('.fd-result[data-fd-open]').first()).toHaveAttribute('data-fd-open', ref);
  await input.press('Enter');
  await expect(page.locator('.fd-search')).toHaveCount(0);
  await expect(page.locator('.fd-sheet')).toBeVisible();
  await page.locator('.fd-sheet__close').click();
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  await input.fill(query);
  await page.locator('.fd-result[data-fd-open]').first().click();
  await expect(page.locator('.fd-src')).toHaveText(ref);
  expect(new URL(page.url()).searchParams.get('page')).toBe(ref);
  await expectHealthy(page);
});

test('Safety Kit, theme, and Progress remain usable and restore their invokers', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');

  const settings = page.locator('[data-fd-settings]');
  await settings.click();
  await page.locator('[data-fd-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('cw_theme'))).toBe('dark');
  await page.locator('.fd-sheet__close').click();
  await expect(settings).toBeFocused();

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

// Today's exam-date prompt (fd_today.js / fdExamDatePrompt). Without a stored date the taper in
// phase_policy.js never engages, and the only home for the date was the settings panel. The field
// is the panel's own type, so it must commit IN PLACE -- no render, no focus move -- and it must
// not become a second settings opener (the gear's focus return after a theme change depends on it).
test('Today asks once for the exam date on the exam path, stores it in place, and settings reads it back', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  const field = page.locator('#fdTodayExam');
  if (isResidentProject(testInfo.project.name)) {
    await expect(field).toHaveCount(0);
    await expect(page.locator('.fd-today__exam')).toHaveCount(0);
    await expectHealthy(page);
    return;
  }
  await expect(page.locator('label[for="fdTodayExam"]')).toHaveText('Exam date');
  await expect(page.locator('[data-fd-settings]')).toHaveCount(1);
  const typedInto = await field.elementHandle();
  await field.fill('2026-10-30');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_shelf_date'))).toBe('2026-10-30');
  expect(await typedInto.evaluate((el) => el.isConnected), 'the field was rebuilt under the learner').toBe(true);
  await expect(field).toHaveValue('2026-10-30');

  await page.locator('[data-fd-tab="library"]:visible').first().click();
  await page.locator('[data-fd-tab="today"]:visible').first().click();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-today__exam'), 'answered once, asked no more').toHaveCount(0);

  const settings = page.locator('[data-fd-settings]');
  await settings.click();
  await expect(page.locator('#fdSetExam')).toHaveValue('2026-10-30');
  await page.locator('.fd-sheet__close').click();
  await expect(settings).toBeFocused();
  await expectHealthy(page);
});

test('malformed built protocol fails closed with every canonical crisis resource', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.route(/\/\?(?:$|#)|\/$/, async route => {
    const response = await routeFetchWithRetry(route);
    const needle = [
      'var FD_CANONICAL_INDEX=fdBuildIndex(FD_CURRICULUM,FD_TOPIC_META,FD_TOOL_REGISTRY,FD_SITE_MANIFEST);',
      '  var FD_INDEX=FD_CANONICAL_INDEX;',
    ].join('\n');
    const original = await response.text();
    expect(original.split(needle)).toHaveLength(2);
    const body = original.replace(
      needle,
      `${needle}\n  FD_TOPIC_META[FD_INDEX.kit[0].item.ref].safetySteps=[];`,
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

test('Compass native Tab sequence keeps every link above the mobile dock', async ({ page }, testInfo) => {
  test.skip(audience(testInfo).role !== 'student', 'The Compass belongs to the student Welcome');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedApp(page, testInfo);
  await page.goto('/?page=welcome.md');
  // The safety link plus six week links (the optional orientation-video link was retired
  // with the video on 2026-09-25).
  const links = page.locator('[data-fd-compass-root] a');
  await expect(links).toHaveCount(7);
  await links.first().focus();
  // Let the browser scroll on native Tab. No scrollIntoView, click or focus on later links.
  for (let index = 0; index < 7; index += 1) {
    if (index) await page.keyboard.press('Tab');
    await expect(links.nth(index)).toBeFocused();
    const focus = await links.nth(index).evaluate(link => {
      const box = link.getBoundingClientRect();
      const dock = document.querySelector('.fd-dock').getBoundingClientRect();
      const corners = [[box.left + 2, box.top + 2], [box.right - 2, box.bottom - 2]];
      return {
        top: box.top, bottom: box.bottom, dockTop: dock.top, viewport: innerHeight,
        unobscured: corners.every(([x, y]) => link.contains(document.elementFromPoint(x, y))),
      };
    });
    expect(focus.top, `link ${index} top`).toBeGreaterThanOrEqual(0);
    expect(focus.bottom, `link ${index} bottom: ${JSON.stringify(focus)}`).toBeLessThanOrEqual(focus.dockTop);
    expect(focus.bottom).toBeLessThanOrEqual(focus.viewport);
    expect(focus.unobscured, `link ${index} hit testing`).toBe(true);
  }
});

for (const [number, title] of [
  [1, 'Foundations & the MSE'], [2, 'Mood, Psychosis & Pharm'],
  [3, 'Psychotherapy & Personality'], [4, 'Family Systems & EE'],
  [5, 'Acute & Emergency'], [6, 'Integration & Exam'],
]) {
  test(`Compass Week ${number} opens its titled reader without adopting another path`, async ({ page }, testInfo) => {
    test.skip(audience(testInfo).role !== 'student', 'The Compass belongs to the student Welcome');
    await seedApp(page, testInfo);
    await page.goto('/?page=welcome.md');
    const start = await page.evaluate(() => localStorage.getItem('cw_rotation_start'));
    await page.locator(`[data-fd-compass-link][href="?page=week${number}.md"]`).click();
    await expect(page.locator('.fd-article__h1')).toHaveText(`Week ${number} — ${title}`);
    await expect(page).toHaveURL(new RegExp(`page=week${number}\\.md`));
    expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBe(start);
    await expectHealthy(page);
  });
}

test('MS3 Welcome Compass region keeps its authored accessible name after reading-place install', async ({ page }, testInfo) => {
  test.skip(audience(testInfo).role !== 'student', 'The Compass belongs to the student Welcome');
  await seedApp(page, testInfo);
  await page.goto('/?page=welcome.md');
  const compass = page.locator('section[data-fd-compass]');
  await expect(compass).toBeVisible();
  await expect(compass).toHaveAttribute('aria-labelledby', 'fd-compass-title');
  await expect(compass.locator('h2#fd-compass-title')).toHaveText('Six-Week Compass');
  await expect(page.getByRole('region', { name: 'Six-Week Compass' })).toHaveCount(1);
  await expect(compass.locator('h2')).toHaveAttribute('data-fd-reading-anchor', /^fd-reading-six-week-compass--[0-9a-f]{16}$/);
  await expectHealthy(page);
});

test('Welcome preserves audience scope and gives the MS3 Compass responsive keyboard and touch behavior', async ({ page, browser }, testInfo) => {
  const site = audience(testInfo);
  await seedApp(page, testInfo);
  // This test exercises the pending-notice layout, not the live ledger. Keep that branch explicit
  // so a legitimate faculty attestation cannot turn a UI behavior test red.
  await pinGovernance(page, 'welcome.md', { status: 'pending', riskLevel: 'low' });
  await page.goto('/?page=welcome.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();

  const compassRoot = page.locator('[data-fd-compass-root]');
  if (site.role === 'pgy1') {
    await expect(compassRoot).toHaveCount(0);
    // Metadata and governance sit outside the Markdown body; inspect the complete reader.
    const reader = page.locator('.fd-reader');
    await expect(reader).not.toContainText(/Compass|Orientation Packet|captioned orientation overview/i);
    await expect(reader.locator('.fd-article__lead')).toContainText('four-week');
    await expect(reader.locator('.governance-notice.pending-compact')).toContainText('Pending faculty review');
    await expect(reader.locator('.governance-notice.reviewed-receipt')).toHaveCount(0);
    // The resident onboarding video was retired from the Welcome on 2026-09-25.
    await expect(reader.locator('video')).toHaveCount(0);
    await expectHealthy(page);
    return;
  }

  await expect(compassRoot).toHaveCount(1);
  expect(await compassRoot.evaluate(root => [...root.children].map(child => {
    if (child.hasAttribute('data-fd-compass-safety')) return 'safety';
    if (child.hasAttribute('data-fd-compass-scope')) return 'scope';
    if (child.hasAttribute('data-fd-compass')) return 'compass';
    if (child.hasAttribute('data-fd-compass-prompt')) return 'prompt';
    return 'unexpected';
  }))).toEqual(['safety', 'scope', 'compass', 'prompt']);

  const safetyCopy = 'If you are worried about immediate safety, tell the resident or attending now. Do not wait for rounds. Do not carry it alone.';
  const scopeCopy = 'This map supports orientation, supervised practice, and reflection. It is not a checklist, clinical protocol, or measure of readiness. Using or viewing this map does not establish competence, entrustment, or permission to act independently.';
  const promptCopy = 'Choose the week or task you are preparing to discuss with your supervising team.';
  await expect(compassRoot.locator('[role="note"]')).toHaveCount(1);
  await expect(compassRoot.locator('[data-fd-compass-safety] > p')).toHaveText(safetyCopy);
  await expect(compassRoot.locator('[data-fd-compass-safety] > a')).toHaveText('Open the Orientation Packet');
  await expect(compassRoot.locator('[data-fd-compass-scope]')).toHaveText(scopeCopy);
  await expect(compassRoot.locator('[data-fd-compass-prompt]')).toHaveText(promptCopy);
  // The optional orientation-video link was retired with the video on 2026-09-25.
  await expect(compassRoot.locator('video, [href*="orientation-video"]')).toHaveCount(0);
  await expect(compassRoot.locator('section[aria-labelledby="fd-compass-title"]')).toHaveCount(1);
  await expect(compassRoot.locator('ol')).toHaveCount(1);

  const expectedWeeks = [
    { n: '1', heading: 'Week 1 Foundations & the MSE', href: '?page=week1.md', label: 'Open Week 1' },
    { n: '2', heading: 'Week 2 Mood, Psychosis & Pharm', href: '?page=week2.md', label: 'Open Week 2' },
    { n: '3', heading: 'Week 3 Psychotherapy & Personality', href: '?page=week3.md', label: 'Open Week 3' },
    { n: '4', heading: 'Week 4 Family Systems & EE', href: '?page=week4.md', label: 'Open Week 4' },
    { n: '5', heading: 'Week 5 Acute & Emergency', href: '?page=week5.md', label: 'Open Week 5' },
    { n: '6', heading: 'Week 6 Integration & Exam', href: '?page=week6.md', label: 'Open Week 6' },
  ];
  const renderedWeeks = await compassRoot.locator('[data-fd-compass-weeks] > li').evaluateAll(rows => (
    rows.map(row => {
      const link = row.querySelector('[data-fd-compass-link]');
      return {
        n: row.getAttribute('data-fd-compass-week'),
        heading: row.querySelector('h3')?.textContent.replace(/\s+/g, ' ').trim(),
        href: link?.getAttribute('href'),
        label: link?.textContent.trim(),
      };
    })
  ));
  expect(renderedWeeks).toEqual(expectedWeeks);

  const pending = page.locator('.fd-article__body > .governance-notice.pending-compact[role="status"]');
  await expect(pending).toHaveCount(1);
  await expect(pending.locator('.governance-title')).toHaveText('Pending faculty review');
  await expect(page.locator('.fd-article__body > .governance-notice.reviewed-receipt')).toHaveCount(0);

  const weekLinks = compassRoot.locator('[data-fd-compass-link]');
  await weekLinks.first().focus();
  await expect(weekLinks.first()).toBeFocused();
  for (let index = 1; index < expectedWeeks.length; index += 1) {
    await page.keyboard.press('Tab');
    await expect(weekLinks.nth(index)).toBeFocused();
    await expect(weekLinks.nth(index)).toHaveAttribute('href', expectedWeeks[index].href);
  }

  const widthCases = [
    { viewport: 736, bucket: 'three', tracks: 3 },
    { viewport: 561, bucket: 'two', tracks: 2 },
    { viewport: 390, bucket: 'one', tracks: 1 },
    { viewport: 320, bucket: 'one', tracks: 1 },
  ];
  for (const widthCase of widthCases) {
    await page.setViewportSize({ width: widthCase.viewport, height: 844 });
    const geometry = await page.locator('.fd-compass').evaluate(component => {
      const rootPixels = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const width = component.getBoundingClientRect().width;
      const tracks = getComputedStyle(component.querySelector('.fd-compass__weeks'))
        .gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      return {
        width,
        rootPixels,
        tracks,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
        componentScrollWidth: component.scrollWidth,
        componentClientWidth: component.clientWidth,
      };
    });
    const minTwo = 22 * geometry.rootPixels;
    const minThree = 30 * geometry.rootPixels;
    if (widthCase.bucket === 'three') {
      expect(geometry.width, `${widthCase.viewport}px viewport measured Compass width`).toBeGreaterThanOrEqual(minThree);
    } else if (widthCase.bucket === 'two') {
      expect(geometry.width, `${widthCase.viewport}px viewport measured Compass width`).toBeGreaterThanOrEqual(minTwo);
      expect(geometry.width, `${widthCase.viewport}px viewport measured Compass width`).toBeLessThan(minThree);
    } else {
      expect(geometry.width, `${widthCase.viewport}px viewport measured Compass width`).toBeLessThan(minTwo);
    }
    expect(geometry.tracks, `${widthCase.viewport}px viewport measured ${geometry.width}px Compass`).toBe(widthCase.tracks);
    expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.documentClientWidth);
    expect(geometry.componentScrollWidth).toBeLessThanOrEqual(geometry.componentClientWidth);
  }

  await seedApp(page, testInfo, { storage: { cw_theme: 'dark' } });
  await page.goto('/?page=welcome.md');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkWeekOne = page.locator('[data-fd-compass-link]').first();
  await darkWeekOne.focus();
  const focusOutline = await darkWeekOne.evaluate(link => {
    const style = getComputedStyle(link);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(focusOutline.style).not.toBe('none');
  expect(focusOutline.width).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotion = await page.locator('.fd-compass').evaluate(component => {
    const cards = [...component.querySelectorAll('.fd-compass__weeks > li')];
    return [component, ...cards].map(element => {
      const style = getComputedStyle(element);
      return { animationName: style.animationName, transitionDuration: style.transitionDuration };
    });
  });
  for (const motion of reducedMotion) {
    expect(motion.animationName).toBe('none');
    expect(motion.transitionDuration).toBe('0s');
  }

  const touchContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    hasTouch: true,
  });
  try {
    const touchPage = await touchContext.newPage();
    await seedApp(touchPage, testInfo);
    await touchPage.goto('/?page=welcome.md');
    await expect(touchPage.locator('[data-fd-compass-root]')).toHaveCount(1);
    // This context does not emulate reduced motion, so the reader's fdPopIn entrance
    // (scale(.985) -> none) can still be running at first paint; measuring then read a
    // 44px target as 43.9998px under load. Touch size is a property of the settled layout.
    await touchPage.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
    const touchTargets = await touchPage.locator(
      '[data-fd-compass-safety] a, [data-fd-compass-link]',
    ).evaluateAll(links => links.map(link => {
      const box = link.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(touchTargets).toHaveLength(7);
    for (const box of touchTargets) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await touchContext.close();
  }
  await expectHealthy(page);
});

test('390x844 reduced-motion Reader keeps one fixed 44px dock during scroll without overflow', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedApp(page, testInfo, { state: { tab: 'library' } });
  await page.goto('/?page=t_mood.md');
  const bar = page.locator('.fd-dock:visible');
  await expect(bar).toHaveCount(1);
  await expect(page.locator('.fd-actionbar:visible,#fdCaptureMount:visible,.fd-tabs:visible')).toHaveCount(0);

  const before = await bar.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const after = await bar.boundingBox();
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.y + after.height).toBeCloseTo(PHONE.height, 0);

  const targets = await page.locator(
    '.fd-dock:visible button:visible, .fd-dock__browse summary:visible, '
      + '.fd-searchbtn:visible, .fd-safetybtn:visible, .fd-carebtn:visible',
  ).evaluateAll(controls => controls.map(control => {
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
  // Geometry is measured at scroll 0. A pending/HIGH page focuses its alert notice on open, and
  // on a phone a field guide's header and margin sit above that notice, so the focus scrolls the
  // page. That is governance behaviour, not header layout — pin the row rather than inherit the
  // live ledger (t_mood.md was pending/high when it became a bold-lead guide).
  await pinGovernance(page, 't_mood.md', { status: 'reviewed', riskLevel: 'low' });
  // A reader collapses its header to one row on a phone (frontdoor.css "Phone chrome",
  // 2026-09-18): the week pill, the settings gear and the tab row are one Back-tap away in the
  // action bar and leave the header; the brand name is clipped but stays the home button's
  // accessible name. Every control that remains keeps the 2026-08 audit's bar.
  const cases = [
    {
      url: '/', ready: '.fd-today', oneRow: false,
      selectors: ['.fd-brand', '.fd-searchbtn', '.fd-weekpill', '.fd-safetybtn', '.fd-carebtn', '.fd-settingsbtn'],
    },
    {
      url: '/?page=t_mood.md', ready: '.fd-reader .fd-article__body', oneRow: true,
      selectors: ['.fd-brand', '.fd-searchbtn', '.fd-safetybtn', '.fd-carebtn'],
    },
  ];

  for (const width of [320, 360, 390, 561, 600, 601, 640, 641]) {
    await page.setViewportSize({ width, height: 844 });
    for (const surface of cases) {
      await page.goto(surface.url);
      await expect(page.locator(surface.ready)).toBeVisible();
      const visibleSelectors = surface.selectors.filter(selector => (
        selector !== '.fd-carebtn' || width <= 640
      ));

      const geometry = await page.evaluate((selectors) => {
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
        const hidden = selector => !visible(document.querySelector(selector));
        return {
          controls,
          intersections,
          headerHeight: header.height,
          headerBottom: header.bottom,
          mainTop: main.top,
          brandNameWidth: brandName.width,
          brandAccessibleText: document.querySelector('.fd-brand').textContent.trim(),
          utilitiesHidden: hidden('.fd-weekpill') && hidden('.fd-settingsbtn') && hidden('.fd-tabs'),
          searchIconWidth: searchIcon.width,
          searchLabelWidth: searchLabel.width,
          shortcutDisplay: getComputedStyle(shortcut).display,
          viewportWidth: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        };
      }, visibleSelectors);

      expect(geometry.intersections, `${width}px ${surface.url} header collisions`).toEqual([]);
      for (const [selector, box] of Object.entries(geometry.controls)) {
        expect.soft(box.width, `${width}px ${surface.url} ${selector} width`).toBeGreaterThanOrEqual(44);
        expect.soft(box.height, `${width}px ${surface.url} ${selector} height`).toBeGreaterThanOrEqual(44);
        expect.soft(box.left, `${width}px ${surface.url} ${selector} left edge`).toBeGreaterThanOrEqual(0);
        expect.soft(box.right, `${width}px ${surface.url} ${selector} right edge`)
          .toBeLessThanOrEqual(geometry.viewportWidth);
      }
      if (surface.oneRow && width <= 640) {
        expect.soft(geometry.utilitiesHidden, `${width}px reader hides week, settings and tabs`).toBe(true);
        expect.soft(geometry.brandAccessibleText, `${width}px reader home tile keeps its name`).toMatch(/\S/);
        expect.soft(geometry.headerHeight, `${width}px reader header is one row`).toBeLessThanOrEqual(64);
      } else {
        expect.soft(geometry.brandNameWidth).toBeGreaterThan(0);
        expect.soft(geometry.utilitiesHidden, `${width}px ${surface.url} keeps its utilities`).toBe(false);
      }
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

test('phone header Care shortcut sits beside Safety and opens Patient care resources', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();

  const safety = page.locator('.fd-safetybtn');
  const care = page.locator('.fd-carebtn');
  const settings = page.locator('.fd-settingsbtn');
  await expect(care).toBeVisible();
  await expect(care).toHaveAccessibleName('Patient care resources');
  await expect(care).toHaveText('Care');
  await expect(care).not.toHaveAttribute('aria-current', 'page');
  const order = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    return {
      safety: box('.fd-safetybtn'),
      care: box('.fd-carebtn'),
      settings: box('.fd-settingsbtn'),
    };
  });
  expect(order.safety.right).toBeLessThanOrEqual(order.care.left + 0.5);
  expect(order.care.right).toBeLessThanOrEqual(order.settings.left + 0.5);

  await care.click();
  await expect(page).toHaveURL(/\?tab=care$/);
  await expect(page.locator('.fd-care-page')).toBeVisible();
  await expect(page.locator('.fd-carebtn')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.fd-carebtn')).toHaveClass(/is-active/);
  await expectHealthy(page);

  await page.setViewportSize({ width: 800, height: 844 });
  await expect(page.locator('.fd-carebtn')).toBeHidden();
  await expect(page.locator('.fd-tab--care')).toBeVisible();
});

test('wide interview table remains accessible and contained in the live Reader', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo, { state: { tab: 'library' } });
  await page.goto('/?page=pg_interview.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);

  /* pg_interview.md carries the build-injected crisis block (MS3V01-F005), and makeCollapsible()
     deliberately bails out on any page that does, so the crisis lines can never be left inside a
     display:none section body. This page therefore has NO .sec-c wrapper and no toggle to click,
     and asserting that is the point: it pins the crisis-block/no-collapse interaction, which
     until now lived only in a comment in spa_index.html. enhanceTables() runs independently of
     makeCollapsible(), so every accessibility property below still holds, and tableLabel() falls
     back from the missing .sec-h button to the nearest heading -- which is why the label is still
     'MSE Structure table'. The collapse toggle itself moved to the doc_oral.md test below rather
     than being dropped. */
  await expect(page.locator('.fd-article__body .crisis-block-hook')).toHaveCount(1);
  await expect(page.locator('.fd-article__body .sec-c')).toHaveCount(0);

  const viewport = page.locator('.fd-article__body .table-scroll-viewport').first();
  await expect(viewport).toBeVisible();
  await expect(viewport.locator('table')).toBeVisible();

  const shell = page.locator('.fd-article__body .table-scroll').filter({
    has: page.locator('.table-scroll-viewport'),
  }).first();
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

test('collapsible section toggle hides and restores a wide table', async ({ page }, testInfo) => {
  /* This is the coverage the pg_interview test above used to carry. It moved here when
     pg_interview.md gained a crisis block, which switches that page to never-collapsed by
     design. doc_oral.md has nine sections, no crisis block, and a scrollable rubric table, so
     the toggle behaviour keeps a home instead of quietly losing its only assertion. */
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo, { state: { tab: 'library' } });
  await page.goto('/?page=doc_oral.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(page.locator('.fd-article__body .crisis-block-hook')).toHaveCount(0);

  const tableSection = page.locator('.fd-article__body .sec-c').filter({
    has: page.locator('.table-scroll-viewport'),
  }).first();
  await expect(tableSection).toBeVisible();
  const tableHeader = tableSection.locator('.sec-h button');
  await expect(tableHeader).toHaveCount(1);
  const viewport = tableSection.locator('.table-scroll-viewport');
  await expect(tableSection).toHaveClass(/open/);
  await expect(viewport.locator('table')).toBeVisible();

  await tableHeader.click();
  await expect(tableSection).not.toHaveClass(/open/);
  await expect(viewport).toBeHidden();
  await expect(tableHeader).toHaveAttribute('aria-expanded', 'false');

  await tableHeader.click();
  await expect(tableSection).toHaveClass(/open/);
  await expect(tableHeader).toHaveAttribute('aria-expanded', 'true');
  await expect(viewport.locator('table')).toBeVisible();
  await expectHealthy(page);
});

// Clinical field guide: exercise the served teaching page, rather than a copied fixture. The
// source assertions below derive their inventory from the fetched Markdown so a missing section,
// reference, or table row cannot silently become the new expected count after a redesign.
const GUIDE_REF = 'therapy_on_the_unit.md';
const GUIDE_URL = `/?page=${GUIDE_REF}`;

/* This suite tests the GUIDE READER, not the ledger, so it pins its fixture page's governance
 * row instead of inheriting whatever the ledger says this week. Two reasons, both learned the
 * hard way when therapy_on_the_unit.md drifted to pending/high:
 *   1. a receipt assertion here is an ASSERTION failure, not snapshot drift, so no baseline
 *      refresh can clear it and every ordinary edit to this page would red CI until the owner
 *      re-attests (the deadlock D1 exists to prevent);
 *   2. a pending/HIGH page focuses its `role="alert"` notice on route change
 *      (focusPendingHighNotice in spa_index.html), which takes focus away from the arrival
 *      passage and the section heading that several tests below assert on.
 * The live rendering of a drifted page is covered where it belongs: governance-warnings.spec.js
 * picks its targets from the built governance.json, and the pending/high FOCUS priority has its
 * own test below that routes this same row the other way, to pending/high, on purpose. */
async function pinGuideGovernance(page, status) {
  await pinGovernance(page, GUIDE_REF, status);
}

async function openClinicalGuide(page, testInfo, query = '') {
  await seedApp(page, testInfo, { state: { tab: 'library' } });
  await pinGuideGovernance(page, {
    status: 'reviewed', riskLevel: 'low', reviewer: 'Joshua Moss, MD', reviewedAt: '2026-08-21',
  });
  await page.goto(`${GUIDE_URL}${query}`);
  await expect(page.locator('.fd-reader--guide .fd-article__body')).toBeVisible();
  // Mobile starts with a native contents disclosure; it remains available without preceding
  // every passage with the expanded navigation inventory.
  await expect(page.locator('nav[aria-label="On this page"]')).toHaveCount(1);
  // A governance notice of SOME kind rendered, and it is not the fetch-failure one. The KIND is
  // not asserted here -- see pinGuideGovernance above.
  await expect(page.locator('.fd-reader .governance-notice').first()).toBeVisible();
  await expect(page.locator('.fd-reader .governance-notice.unavailable')).toHaveCount(0);
}

async function guideSourceInventory(page) {
  const response = await requestGetWithRetry(page.request, `/content/${GUIDE_REF}`);
  expect(response.ok()).toBe(true);
  return page.evaluate(markdown => {
    const template = document.createElement('template');
    template.innerHTML = marked.parse(markdown);
    const root = template.content;
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const text = element => normalize(element.textContent);
    const crisis = root.querySelector('.crisis-block-hook')?.closest('blockquote');
    const heading = [...root.querySelectorAll('h2')].find(el => text(el) === 'References');
    let referenceList = heading && heading.nextElementSibling;
    while (referenceList && referenceList.tagName !== 'OL' && referenceList.tagName !== 'H2') {
      referenceList = referenceList.nextElementSibling;
    }
    return {
      headings: [...root.querySelectorAll('h2')].map(text),
      blocks: [...root.querySelectorAll('p, li')].map(text).filter(Boolean),
      headers: [...root.querySelectorAll('table th')].map(text),
      rows: [...root.querySelectorAll('table tbody tr')].map(row => (
        [...row.querySelectorAll('td')].map(text)
      )),
      references: referenceList?.tagName === 'OL' ? [...referenceList.children].map(text) : [],
      links: [...root.querySelectorAll('a[href]')].map(link => ({
        text: text(link), href: link.getAttribute('href'),
      })),
      crisis: [...(crisis?.querySelectorAll('li') || [])].map(text),
    };
  }, await response.text());
}

async function guideRenderedInventory(page) {
  return page.locator('.fd-article__body').evaluate(body => {
    const root = body.cloneNode(true);
    // Exclude enhancement-only controls and the alternative table view, never authored nodes.
    root.querySelectorAll('.sec-chev, .sec-toolbar, .pgfb, .fd-guide-table-controls, .fd-guide-table-rows, .table-scroll-hint')
      .forEach(el => el.remove());
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    const text = element => normalize(element.textContent);
    const crisis = root.querySelector('.crisis-block-hook')?.closest('blockquote');
    const heading = [...root.querySelectorAll('h2')].find(el => text(el) === 'References');
    let referenceList = heading?.closest('.sec-c')?.querySelector('.sec-b ol')
      || heading?.nextElementSibling;
    while (referenceList && referenceList.tagName !== 'OL' && referenceList.tagName !== 'H2') {
      referenceList = referenceList.nextElementSibling;
    }
    return {
      headings: [...root.querySelectorAll('h2')].map(text),
      blocks: [...root.querySelectorAll('p, li')].map(text).filter(Boolean),
      headers: [...root.querySelectorAll('table th')].map(text),
      rows: [...root.querySelectorAll('table tbody tr')].map(row => (
        [...row.querySelectorAll('td')].map(text)
      )),
      references: referenceList?.tagName === 'OL' ? [...referenceList.children].map(text) : [],
      links: [...root.querySelectorAll('a[href]')].map(link => ({
        text: text(link), href: link.getAttribute('href'),
      })),
      crisis: [...(crisis?.querySelectorAll('li') || [])].map(text),
    };
  });
}

test.describe('Clinical field guide', () => {
  test('resource aliases and dated titles arrive honestly when no passage matches', async ({ page }, testInfo) => {
    const resident = isResidentProject(testInfo.project.name);
    const cases = [
      ['ask family for collateral', 'collateral_workflow.md'],
      [`First-Episode Psychosis [Sep 7] — ${resident ? 'Resident' : 'MS3'}?`, `cotw_20260907_fep_${resident ? 'res' : 'ms3'}.md`],
    ];
    await seedApp(page, testInfo);
    for (const [query, ref] of cases) {
      await page.goto('/');
      await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
      await page.getByRole('textbox', { name: 'Search resources', exact: true }).fill(query);
      const result = page.locator(`.fd-result[data-fd-open="${ref}"]`);
      await expect(result).toHaveCount(1);
      await result.press('Enter');
      await expect(page.locator('.fd-reader--guide')).toBeVisible();
      await expect(page.locator('.fd-src')).toHaveText(ref);
      expect(new URL(page.url()).searchParams.get('guideFind')).toBe(query);
      await expect(page.locator('.fd-guide-arrival')).toContainText('No matching passage in this guide.');
      await expect(page.locator('.fd-guide-match')).toHaveCount(0);
      await expect(page.locator('.fd-article__h1')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'On this page', exact: true })).toBeVisible();
      await expectHealthy(page);
    }
  });

  test('global search hands a literal phrase to the guide and clears it for a practice tool', async ({ page }, testInfo) => {
    await seedApp(page, testInfo);
    await page.goto('/');
    await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
    await page.getByRole('textbox', { name: 'Search resources', exact: true }).fill('change talk');
    await page.locator('.fd-result[data-fd-open="motivational_interviewing.md"]').press('Enter');
    await expect(page.locator('.fd-reader--guide')).toBeVisible();
    const match = page.locator('.fd-guide-match');
    await expect(match).toHaveCount(1);
    await expect(match).toContainText(/change talk/i);
    await expect(match).toBeFocused();
    await expect(match).toBeInViewport();
    await page.locator('.fd-reader [data-fd-open="communication-practice.html"]').first().click();
    await expect(page.locator('.fd-article__body iframe')).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.has('guideFind')).toBe(false);
    expect(url.searchParams.has('guideSection')).toBe(false);
    await page.getByRole('button', { name: 'Return to guide', exact: true }).click();
    await expect(page.locator('.fd-src')).toHaveText('motivational_interviewing.md');
    await expect(page.getByLabel('Find in this guide', { exact: true })).toHaveValue('change talk');
    expect(new URL(page.url()).searchParams.get('guideFind')).toBe('change talk');
    await page.reload();
    await expect(page.getByLabel('Find in this guide', { exact: true })).toHaveValue('change talk');
    await expect(page.locator('.fd-guide-match')).toContainText(/change talk/i);
    await expectHealthy(page);
  });

  test('preserves the served teaching text, headings, table, references, links, and crisis context', async ({ page }, testInfo) => {
    await openClinicalGuide(page, testInfo);
    const source = await guideSourceInventory(page);
    const actual = await guideRenderedInventory(page);
    expect(source.headings.length).toBeGreaterThan(5);
    expect(source.rows.length).toBeGreaterThan(3);
    expect(source.references.length).toBeGreaterThan(15);
    expect(source.crisis.length).toBeGreaterThan(0);
    expect(actual.headings).toEqual(source.headings);
    expect(actual.headers).toEqual(source.headers);
    expect(actual.rows).toEqual(source.rows);
    expect(actual.references).toEqual(source.references);
    expect(actual.crisis).toEqual(source.crisis);
    for (const block of source.blocks) expect(actual.blocks).toContain(block);
    for (const link of source.links) expect(actual.links).toContainEqual(link);
    expect(await page.evaluate(() => {
      const title = document.querySelector('.fd-article__h1');
      const margin = document.querySelector('.fd-guide-margin');
      return Boolean(title.compareDocumentPosition(margin) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    await expect(page.locator('.fd-article__body .sec-c')).toHaveCount(0);
    await expect(page.locator('.fd-article__body blockquote').filter({ has: page.locator('.crisis-block-hook') })).toBeVisible();
    const navLinks = page.getByRole('navigation', { name: 'On this page', exact: true }).getByRole('link');
    await expect(navLinks).toHaveCount(source.headings.length);
    await expectHealthy(page);
  });

  test('arrives at a real passage from a query and finds another passage by keyboard', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openClinicalGuide(page, testInfo, '&guideFind=behavioral%20activation');
    const arrival = page.locator('.fd-guide-match').first();
    await expect(arrival).toBeVisible();
    await expect(arrival).toContainText(/behavioral[\s-]+activation/i);
    await expect(arrival).toBeInViewport();
    await expect(arrival).toBeFocused();
    const input = page.getByLabel('Find in this guide', { exact: true });
    await input.fill('Listening is not disclosing');
    await page.getByRole('button', { name: 'Find passages', exact: true }).click();
    const result = page.locator('.fd-guide-results').locator('a, button').first();
    await expect(result).toBeVisible();
    await result.focus();
    await result.press('Enter');
    const match = page.locator('.fd-guide-match').filter({ hasText: 'Listening is not disclosing' }).first();
    await expect(match).toBeVisible();
    await expect(match).toBeInViewport();
    expect(await page.evaluate(() => {
      const active = document.activeElement;
      return active.classList.contains('fd-guide-match')
        || active.matches('h2[id^="guide-"]')
        || Boolean(active.closest('.fd-guide-match'));
    })).toBe(true);
    expect(await page.locator('.fd-reader').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await expectHealthy(page);
  });

  test('a passage arrival keeps a pending high-risk review warning in focus', async ({ page }, testInfo) => {
    // Synthetic transport fixture only: the actual attestation ledger is never edited. It
    // exercises the focus priority even when every placed teaching page is currently reviewed.
    // The ledger is served immediately so the fixture itself adds no latency. The focus-take no
    // longer depends on that: since takePendingHighFocus() in spa_index.html, the warning is
    // focused whichever lands second — governance.json or the release of the startup gate's
    // `inert` (which silently refuses focus while it is closed). governance-warnings.spec.js
    // covers the gate-second order against the real ledger.
    const response = await requestGetWithRetry(page.request, '/governance.json');
    const ledger = await response.json();
    ledger.items[GUIDE_REF] = {
      ...ledger.items[GUIDE_REF], status: 'pending', riskLevel: 'high',
    };
    await page.route('**/governance.json', route => route.fulfill({ json: ledger }));
    await seedApp(page, testInfo, { state: { tab: 'library' } });
    await page.goto(`${GUIDE_URL}&guideFind=behavioral%20activation`);
    const warning = page.locator('.fd-article__body > .governance-notice.pending-high');
    await expect(page.locator('.fd-reader--guide')).toBeVisible();
    await expect(warning).toHaveCount(1);
    await expect(warning).toContainText('Pending faculty review');
    await expect(warning).toBeFocused();
    await expect(warning).toBeInViewport();
    await page.getByRole('button', { name: 'Go to matching passage', exact: true }).click();
    await expect(page.locator('.fd-guide-match').first()).toBeInViewport();
    await expect(warning).toHaveCount(1);
    await expectHealthy(page);
  });

  test('section navigation has a stable URL, visible focus, and reveals a collapsed section', async ({ page }, testInfo) => {
    await seedApp(page, testInfo, { state: { tab: 'library' } });
    await page.goto('/?page=doc_oral.md');
    const nav = page.getByRole('navigation', { name: 'On this page', exact: true });
    await expect(nav).toBeVisible();
    const section = page.locator('.fd-article__body .sec-c').filter({ has: page.locator('table') }).first();
    const heading = section.locator('h2').first();
    const id = await heading.getAttribute('id');
    expect(id).toMatch(/^guide-.+/);
    await section.locator('.sec-h button').click();
    await expect(section.locator('.sec-h button')).toHaveAttribute('aria-expanded', 'false');
    const link = nav.getByRole('link').filter({ hasText: (await heading.innerText()).replace(/^\s*▸\s*/, '') });
    await expect(link).toHaveCount(1);
    const href = await link.getAttribute('href');
    expect(new URL(href, page.url()).searchParams.get('page')).toBe('doc_oral.md');
    expect(new URL(href, page.url()).searchParams.get('guideSection')).toBe(id.slice('guide-'.length));
    await link.focus();
    // A scripted focus after the pointer-operated disclosure does not activate :focus-visible.
    // Exercise actual keyboard modality before checking the user's focus indicator.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(link).toBeFocused();
    expect(await link.evaluate(el => {
      const style = getComputedStyle(el);
      return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
        || style.boxShadow !== 'none';
    })).toBe(true);
    await link.press('Enter');
    await expect(section.locator('.sec-h button')).toHaveAttribute('aria-expanded', 'true');
    await expect(section.locator('table')).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    await expect(link).toHaveAttribute('aria-current', 'location');
    expect(new URL(page.url()).searchParams.get('guideSection')).toBe(id.slice('guide-'.length));
    const passageRoute = page.url();
    const tableViewport = section.locator('.table-scroll-viewport').first();
    await tableViewport.focus();
    await tableViewport.press('ArrowRight');
    expect(page.url()).toBe(passageRoute);
    await page.reload();
    await expect(page.locator(`#${id}`)).toBeInViewport();
    await expectHealthy(page);
  });

  for (const title of ['Assessment', 'Guide to assessment', 'Guide guide to assessment']) {
    test(`section bookmark survives practice, return, and reload: ${title}`, async ({ page }, testInfo) => {
      // Exercise headings absent from today's corpus without modifying clinical source files.
      // The route remains intercepted on reload, so the real reader regenerates the same ID.
      await page.route(`**/content/${GUIDE_REF}*`, async route => {
        const response = await routeFetchWithRetry(route);
        await route.fulfill({ response, body: `${await response.text()}\n\n## ${title}\n\nBookmark regression fixture.\n` });
      });
      await openClinicalGuide(page, testInfo);
      const link = page.getByRole('navigation', { name: 'On this page', exact: true })
        .getByRole('link', { name: title, exact: true });
      const id = await link.getAttribute('data-guide-section');
      expect(id).toBe(`guide-${title.toLowerCase().replaceAll(' ', '-')}`);
      await link.click();
      const section = new URL(page.url()).searchParams.get('guideSection');
      expect(section).toBe(id.slice('guide-'.length));
      await page.locator('.fd-reader [data-fd-open$=".html"]').first().click();
      await expect(page.locator('.fd-article__body iframe')).toBeVisible();
      expect(new URL(page.url()).searchParams.has('guideSection')).toBe(false);
      await page.getByRole('button', { name: 'Return to guide', exact: true }).click();
      await expect(page.locator('.fd-reader--guide')).toBeVisible();
      await expect.poll(() => new URL(page.url()).searchParams.get('guideSection')).toBe(section);
      await page.reload();
      await expect(page.locator('.fd-guide-arrival')).toContainText(`Opened at “${title}”.`);
      await expect(page.locator(`#${id}`)).toBeFocused();
      await expect(page.locator(`#${id}`)).toBeInViewport();
      await expectHealthy(page);
    });
  }

  // Next Ten #10: pages authored without H2s open each section with a bold lead. The guide
  // promotes those at render time. Pinned as a FLOOR plus the Safety-sheet kit targets, never an
  // exact page list — a list would turn every content edit into a build breaker.
  const LEAD_GUIDE_FLOOR = { ms3: 24, res: 27 };
  const KIT_LEAD_PAGES = ['delirium.md', 't_sud.md'];

  test('bold-lead pages gain section navigation; short week pages stay plain', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const site = isResidentProject(testInfo.project.name) ? 'res' : 'ms3';
    const nav = await (await requestGetWithRetry(page.request, '/nav.json')).json();
    const refs = [...new Set(nav.flatMap(section => (section.items || []).map(item => item.f)))]
      .filter(ref => /\.md$/.test(ref));
    // Candidates come from the served markdown, so the floor follows the corpus: no H2 line and at
    // least four paragraphs that open in bold. Whether each one qualifies is the reader's call.
    const candidates = [];
    for (const ref of refs) {
      const md = await (await requestGetWithRetry(page.request, `/content/${ref}`)).text();
      if (!/^##\s/m.test(md) && (md.match(/^\*\*[^*\n]{2,80}\*\*/gm) || []).length >= 4) candidates.push(ref);
    }
    for (const ref of KIT_LEAD_PAGES) expect(candidates, `${ref} is a kit target without H2s`).toContain(ref);
    await seedApp(page, testInfo, { state: { tab: 'library' } });
    const promoted = [];
    const plain = [];
    for (const ref of candidates) {
      await page.goto(`/?page=${ref}`);
      await expect(page.locator('.fd-reader:visible .fd-src')).toHaveText(ref);
      await expect(page.locator('.fd-reader:visible .fd-article__body')).toBeVisible();
      const links = page.locator('[data-guide-section]');
      if (await page.locator('.fd-reader--guide').count()) {
        const leads = await page.locator('.fd-guide-section > .fd-guide-lead').count();
        expect(leads, `${ref} is a guide because of its bold leads`).toBeGreaterThanOrEqual(4);
        await expect(links).toHaveCount(leads);
        await expect(page.locator('[data-fd-reading-status]'), `${ref} keeps its reading place`).toHaveCount(1);
        promoted.push(ref);
      } else {
        await expect(links).toHaveCount(0);
        plain.push(ref);
      }
    }
    for (const ref of KIT_LEAD_PAGES) expect(promoted, `${ref} lands kit links on a section`).toContain(ref);
    expect(promoted.length, `promoted: ${promoted.join(', ')}`).toBeGreaterThanOrEqual(LEAD_GUIDE_FLOOR[site]);
    // The rotation week pages carry many bold leads in a few hundred words: navigation would be
    // noise there, and the reader chrome around them must not count toward the word floor.
    const weeks = candidates.filter(ref => /^week\d\.md$/.test(ref));
    expect(weeks.length).toBeGreaterThan(0);
    for (const ref of weeks) expect(plain, `${ref} stays a plain reading`).toContain(ref);
    await expectHealthy(page);
  });

  test('a bold-lead guide keeps its reading place, and a passage link still decides arrival', async ({ page }, testInfo) => {
    const ref = KIT_LEAD_PAGES[0];
    await seedApp(page, testInfo, { state: { tab: 'library' } });
    await pinGovernance(page, ref, { status: 'reviewed', riskLevel: 'low' });
    await page.goto(`/?page=${ref}`);
    await expect(page.locator('.fd-reader--guide')).toBeVisible();
    await expect(page.locator('[data-fd-reading-status]')).toHaveText(READING_SUCCESS);
    const leads = page.locator('.fd-guide-section > .fd-guide-lead');
    expect(await leads.count()).toBeGreaterThanOrEqual(5);
    // The reading anchor is the bold label, not the paragraph, so a prose edit keeps a saved place.
    const label = leads.nth(2).locator('> strong:first-child');
    const anchor = await label.getAttribute('data-fd-reading-anchor');
    expect(anchor).toMatch(/^fd-reading-/);
    await label.evaluate(node => {
      window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY + 85);
      window.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async () => (await readingPlaces(page))[ref]?.heading).toBe(anchor);
    await page.evaluate(() => sessionStorage.setItem('__fd_test_preserve_seed', '1'));
    await page.reload();
    await expect(page.locator('.fd-reader--guide')).toBeVisible();
    await expect.poll(() => page.locator(`[data-fd-reading-anchor="${anchor}"]`).evaluate(node =>
      Math.abs(window.scrollY - (node.getBoundingClientRect().top + window.scrollY) - 85))).toBeLessThan(12);
    await expect(page.locator('[data-fd-reading-top]')).toBeVisible();

    // A passage link owns arrival: the saved place does not scroll over it or take its focus.
    const target = leads.last();
    const id = await target.getAttribute('id');
    expect(id).toMatch(/^guide-/);
    const heading = await page.getByRole('navigation', { name: 'On this page', exact: true })
      .locator(`[data-guide-section="${id}"]`).innerText();
    await page.goto(`/?page=${ref}&guideSection=${id.slice('guide-'.length)}`);
    await expect(page.locator('.fd-guide-arrival')).toContainText(`Opened at “${heading}”.`);
    await expect(page.locator(`#${id}`)).toBeFocused();
    await expect(page.locator(`#${id}`)).toBeInViewport();
    await expect(page.locator('[data-fd-reading-top]')).toBeHidden();
    await expectHealthy(page);
  });

  test('opens a real practice tool and restores guide focus and position through explicit return and browser Back', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openClinicalGuide(page, testInfo, '&guideFind=Listening%20is%20not%20disclosing');
    const launcher = page.locator('.fd-reader [data-fd-open$=".html"]').first();
    await expect(launcher).toBeVisible();
    const ref = await launcher.getAttribute('data-fd-open');
    expect(ref).toMatch(/\.html$/);
    await launcher.focus();
    const before = await page.evaluate(() => ({
      y: scrollY, progress: localStorage.getItem('cw_progress_v1'),
    }));
    await launcher.press('Enter');
    const frame = page.locator('.fd-article__body iframe');
    await expect(frame).toBeVisible();
    const src = new URL(await frame.getAttribute('src'), page.url());
    expect(src.pathname).toBe(`/tools/${ref}`);
    expect(src.searchParams.has('guideFind')).toBe(false);
    expect(src.searchParams.has('guideSection')).toBe(false);
    await expect(page.frameLocator('.fd-article__body iframe').locator('body')).not.toBeEmpty();
    await page.getByRole('button', { name: 'Return to guide', exact: true }).click();
    await expect(page.locator('.fd-reader--guide')).toBeVisible();
    const restored = page.locator(`.fd-reader [data-fd-open="${ref}"]`).first();
    await expect(restored).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before.y, -1);
    expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before.progress);
    await restored.press('Enter');
    await expect(page.locator('.fd-article__body iframe')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.fd-reader--guide')).toBeVisible();
    await expect(page.locator(`.fd-reader [data-fd-open="${ref}"]`).first()).toBeFocused();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before.y, -1);
    expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before.progress);
    await expectHealthy(page);
  });

  for (const theme of ['light', 'dark']) {
    test(`320px ${theme} table retains every source cell in comparison and row reading modes`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 844 });
      await seedApp(page, testInfo, { state: { tab: 'library' }, storage: { cw_theme: theme } });
      // Same reason openClinicalGuide pins it: this is a TABLE-geometry test at 320px, and a
      // pending/high alert above the table changes the layout it measures.
      await pinGuideGovernance(page, {
        status: 'reviewed', riskLevel: 'low', reviewer: 'Joshua Moss, MD', reviewedAt: '2026-08-21',
      });
      await page.goto(GUIDE_URL);
      await expect(page.locator('.fd-reader--guide')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const contents = page.locator('.fd-guide-contents');
      await contents.locator(':scope > summary').click();
      await expect(contents).toHaveJSProperty('open', true);
      await page.setViewportSize({ width: 320, height: 700 });
      await expect(contents).toHaveJSProperty('open', true);
      await contents.locator(':scope > summary').click();
      const source = await guideSourceInventory(page);
      const controls = page.locator('.fd-guide-table-controls').first();
      const compare = controls.getByRole('button', { name: 'Compare columns', exact: true });
      const byRow = controls.getByRole('button', { name: 'Read by row', exact: true });
      await compare.click();
      await expect(compare).toHaveAttribute('aria-pressed', 'true');
      await expect(byRow).toHaveAttribute('aria-pressed', 'false');
      const viewport = page.locator('.fd-article__body .table-scroll-viewport').first();
      await expect(viewport).toBeVisible();
      await expect(viewport).toHaveAttribute('role', 'region');
      await expect(viewport).toHaveAttribute('tabindex', '0');
      expect(await viewport.getAttribute('aria-label')).toBeTruthy();
      await viewport.focus();
      await expect(viewport).toBeFocused();
      const scrollable = await viewport.evaluate(el => ({ width: el.clientWidth, full: el.scrollWidth }));
      expect(scrollable.full).toBeGreaterThan(scrollable.width);
      const tableRoute = page.url();
      await viewport.press('ArrowRight');
      await expect.poll(() => viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      expect(page.url()).toBe(tableRoute);
      await byRow.click();
      await expect(byRow).toHaveAttribute('aria-pressed', 'true');
      await expect(compare).toHaveAttribute('aria-pressed', 'false');
      const rowView = page.locator('.fd-guide-table-rows').first();
      await expect(rowView).toBeVisible();
      await expect(viewport).toBeHidden();
      await expect(page.locator('.fd-article__body .table-scroll').first()).not.toHaveClass(/is-scrollable/);
      const cards = rowView.locator('dl');
      await expect(cards).toHaveCount(source.rows.length);
      for (let index = 0; index < source.rows.length; index += 1) {
        const content = (await cards.nth(index).textContent()).replace(/\s+/g, ' ').trim();
        for (const cell of source.rows[index]) expect(content).toContain(cell);
        for (const header of source.headers) expect(content).toContain(header);
      }
      const geometry = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        font: parseFloat(getComputedStyle(document.querySelector('.fd-article__body p')).fontSize),
      }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
      expect(geometry.font).toBeGreaterThanOrEqual(16);
      await compare.click();
      await expect(viewport).toBeVisible();
      await expect(rowView).toBeHidden();
      await expectHealthy(page);
    });
  }

  test('print reveals the complete guide and safety context while hiding interactive chrome', async ({ page }, testInfo) => {
    await page.setViewportSize(PHONE);
    await openClinicalGuide(page, testInfo);
    await page.locator('.fd-guide-contents > summary').click();
    await expect(page.getByRole('navigation', { name: 'On this page', exact: true })).toBeVisible();
    await page.locator('.fd-guide-table-controls').first().getByRole('button', { name: 'Read by row', exact: true }).click();
    const source = await guideSourceInventory(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: 'On this page', exact: true })).toBeHidden();
    await expect(page.getByLabel('Find in this guide', { exact: true })).toBeHidden();
    await expect(page.locator('.fd-actionbar')).toBeHidden();
    await expect(page.locator('#fdCaptureMount')).toBeHidden();
    await expect(page.locator('.fd-guide-table-controls')).toBeHidden();
    await expect(page.locator('.fd-guide-table-rows')).toBeHidden();
    await expect(page.locator('.fd-article__body .table-scroll-viewport')).toBeVisible();
    // Print must not hide the governance notice. Its KIND is not asserted: a drifted page
    // renders pending instead of a receipt, and that must not red the print contract.
    await expect(page.locator('.fd-reader .governance-notice').first()).toBeVisible();
    await expect(page.locator('.fd-reader .governance-notice.unavailable')).toHaveCount(0);
    await expect(page.locator('.fd-article__body blockquote').filter({ has: page.locator('.crisis-block-hook') })).toBeVisible();
    const printed = await page.locator('.fd-article__body').innerText();
    for (const heading of source.headings) expect(printed).toContain(heading);
    for (const reference of source.references) expect(printed.replace(/\s+/g, ' ')).toContain(reference);
    for (const row of source.rows) for (const cell of row) expect(printed.replace(/\s+/g, ' ')).toContain(cell);
    await page.emulateMedia({ media: 'screen' });
    await page.goto('/?page=doc_oral.md');
    const sections = page.locator('.fd-article__body .sec-c');
    await expect.poll(() => sections.count()).toBeGreaterThan(3);
    await page.locator('.sec-toolbar').getByRole('button', { name: 'Collapse all', exact: true }).click();
    await expect(sections.first().locator('.sec-b')).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    for (const body of await sections.locator('.sec-b').all()) await expect(body).toBeVisible();
    await expect(page.locator('.sec-toolbar')).toBeHidden();
    await expectHealthy(page);
  });
});

// ---- One Thing First (2026-09-16): exactly one primary action on Today ----------------------
//
// Seeds go through seedApp's `storage` so every store exists before the shell boots. Time is
// frozen at FROZEN_NOW: a block created an hour earlier is live (12 h TTL) and an SRS card due
// an hour earlier counts as due. Landmark-deck ids (`<deck>#<index>`, as review.html builds them)
// land in the daily bucket and are not TOPIC# cards, so srsDropPhantomTopics leaves them alone
// once topic_meta loads. Both audience projects run every
// test here with the same seed, which is A4 (same primary kind for the same seed) by construction.
const OTF_NOW = FROZEN_NOW.getTime();
const OTF_HOUR = 60 * 60 * 1000;
const OTF = {
  capsule: { v: 1, sessions: { qbank: { expiresAt: OTF_NOW + 24 * OTF_HOUR, queueIds: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], idx: 2 } } },
  block: { v: 1, minutes: 10, createdAt: OTF_NOW - OTF_HOUR, steps: [
    { kind: 'review', ref: 'review.html', title: '2 reviews that are due', min: 1, n: 2, done: true },
    { kind: 'qb', ref: 'question-bank-practice.html', title: '4 practice questions', min: 3, n: 4, cat: null },
  ] },
  srs: { v: 1, cards: {
    'AR-50#0': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: OTF_NOW - OTF_HOUR, last: OTF_NOW - 25 * OTF_HOUR },
    'AR-50#1': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: OTF_NOW - OTF_HOUR, last: OTF_NOW - 25 * OTF_HOUR },
  }, day: { lastDay: '', newToday: 0 }, stats: { streak: 0, lastStudy: '', totalReviews: 0, correct: 0, seen: 0 }, settings: { newPerDay: 12 } },
  capture: { v: 1, items: [{ id: 'otf-c1', text: 'Why hold the lithium tonight?', at: OTF_NOW - 10 * 60 * 1000, ctx: null, triaged: false }] },
};
const OTF_WHY = 'First things first: anything you left unfinished, then reviews due, then this week. The rest is just below.';
// The primary: a wrapped device-store row, or the lead card itself when nothing outranked it.
const OTF_PRIMARY = '.fd-primary, .fd-continue:not(.is-secondary), .fd-setupcta';
// Its control: the first focusable inside the wrapper, or the lead card (a button).
const OTF_PRIMARY_CONTROL = '.fd-primary button, .fd-primary a, .fd-continue:not(.is-secondary), .fd-setupcta';

async function otfExpectOnePrimary(page) {
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator(OTF_PRIMARY)).toHaveCount(1);
  await expect(page.locator('.fd-primary__why')).toHaveText(OTF_WHY);
  await expect(page.locator('h2.fd-also')).toHaveCount(1);
  await expect(page.locator('h2.fd-also')).toHaveText('Also today');
}

// D1: the first focusable inside the main column IS the primary's control.
async function otfExpectPrimaryIsFirstFocusable(page) {
  const firstIsPrimary = await page.evaluate((sel) => {
    const main = document.querySelector('.fd-today__main');
    const first = main.querySelector('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
    return first === main.querySelector(sel);
  }, OTF_PRIMARY_CONTROL);
  expect(firstIsPrimary).toBe(true);
}

// A6 + D2 + D3: clicking the primary writes nothing to cw_progress_v1; Enter routes the same way;
// after Back the focus is on the primary's control or Today's h1, never <body>.
async function otfExerciseVisitAndBack(page) {
  const before = await page.evaluate(() => localStorage.getItem('cw_progress_v1'));
  const control = page.locator(OTF_PRIMARY_CONTROL).first();
  await control.click();
  await expect(page).not.toHaveURL(/\/$/);
  const viaClick = new URL(page.url()).search;
  expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before);
  await page.goBack();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator(OTF_PRIMARY)).toHaveCount(1);
  const focused = await page.evaluate((sel) => {
    const el = document.activeElement;
    return {
      tag: el.tagName, id: el.id, className: String(el.className).slice(0, 60),
      isPrimary: el === document.querySelector(sel), isH1: el.matches('h1.fd-today__h1'),
      isMain: el.matches('main#content'),
    };
  }, OTF_PRIMARY_CONTROL);
  expect(focused.tag).not.toBe('BODY');
  // D3, measured here for the first time (handoff §9): on 2026-09-16, on both audiences, focus
  // after Back lands on <main id="content"> — the skip-link target the shell focuses on every
  // route announcement — not on the primary's control or the h1. That is a deliberate landmark
  // focus that predates this change, so it is accepted here and reported in the PR as a
  // finding for Josh to decide on; <body> stays forbidden.
  expect(focused.isPrimary || focused.isH1 || focused.isMain,
    `after Back, focus is on <${focused.tag.toLowerCase()} id="${focused.id}" class="${focused.className}"> — expected the primary control, the h1, or main#content`).toBe(true);
  await page.locator(OTF_PRIMARY_CONTROL).first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(viaClick.replace(/[.?+*()[\]]/g, '\\$&') + '$'));
  expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before);
  await page.goBack();
  await expect(page.locator('.fd-today')).toBeVisible();
}

test('One Thing First A1: everything pending — exactly one primary, and it is Resume', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_sess_v1: OTF.capsule, cw_block_v1: OTF.block, cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-resume.is-primary .fd-sectionhead')).toHaveText('Pick up where you left off');
  await expect(page.locator('.fd-primary .fd-resume__link')).toContainText('Resume question bank — 4 left');
  // A3 (presence + order): every demoted card is still there, below the heading, in the fixed order.
  const order = await page.evaluate(() => [...document.querySelector('.fd-today__main')
    .querySelectorAll('.fd-primary, .fd-also, .fd-block, .fd-due, .fd-resume, .fd-lastread, .fd-capture, .fd-continue, .fd-listhead')]
    .map(el => (el.matches('.fd-also') ? 'fd-also' : el.className.split(' ')[0])));
  expect(order).toEqual(['fd-primary', 'fd-resume', 'fd-also', 'fd-block', 'fd-due', 'fd-capture', 'fd-continue', 'fd-listhead']);
  await expect(page.locator('.fd-continue')).toHaveClass(/is-secondary/);
  await expect(page.locator('.fd-block.is-live .fd-block__kicker')).toHaveText('Your block · 1 of 2 done');
  await expect(page.locator('.fd-block.is-live [data-block-continue]')).toHaveClass(/fd-btn--accent/);
  await expect(page.locator('.fd-due:not(.is-primary)')).toHaveCount(1);
  await otfExpectPrimaryIsFirstFocusable(page);
  // A3 (behaviour): a demoted row still routes as before.
  await page.locator('.fd-due').click();
  await expect(page).toHaveURL(/tool=review\.html/);
  await page.goBack();
  await expect(page.locator('.fd-today')).toBeVisible();
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First screen overrides style the primary and demote Continue outside print', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo, { storage: { cw_sess_v1: OTF.capsule, cw_block_v1: OTF.block, cw_srs_v1: OTF.srs } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  const styles = await page.evaluate(() => {
    const primary = getComputedStyle(document.querySelector('.fd-primary .fd-resume__link'));
    const secondary = getComputedStyle(document.querySelector('.fd-continue.is-secondary'));
    return { primaryBorder: primary.borderTopWidth, secondaryBorder: secondary.borderTopWidth };
  });
  expect(styles).toEqual({ primaryBorder: '3px', secondaryBorder: '1px' });
  await expectHealthy(page);
});

test('One Thing First A2: remove the capsule and the live block wins', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_block_v1: OTF.block, cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-block.is-live .fd-block__kicker')).toHaveText('Your 10-minute block');
  await expect(page.locator('.fd-primary [data-block-continue]')).toHaveClass(/fd-btn--primary/);
  await expect(page.locator('.fd-resume')).toHaveCount(0);
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expect(page.locator('.fd-primary .fd-block.is-live')).toHaveCount(1);
  await expectHealthy(page);
});

test('One Thing First A2: remove the block and the dues win', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-due.is-primary .fd-due__kicker')).toHaveText('Clear what’s due');
  await expect(page.locator('.fd-primary .fd-due__label')).toHaveText('2 reviews due');
  await expect(page.locator('.fd-block:not(.is-live)')).toHaveCount(1, 'the planner face is demoted');
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First A2: clear the dues and Continue leads, with the rows below it', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary')).toHaveCount(0);
  await expect(page.locator('.fd-continue:not(.is-secondary)')).toHaveCount(1);
  const order = await page.evaluate(() => [...document.querySelectorAll('.fd-today__main > *')].slice(0, 6).map(el => el.className.split(' ')[0]));
  expect(order).toEqual(['fd-continue', 'fd-offline', 'fd-primary__why', 'fd-sectionhead', 'fd-block', 'fd-capture']);
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First A2: a completed week looks ahead and offers a fresh set', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: {} });
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  // Mark the week complete through the real toggles, not a seeded store: a tool's done state is
  // week-scoped (fd_state.js practiceWeeks), so a legacy {done:true} seed leaves every tool row
  // undone and the week never completes on an audience whose week 1 carries a tool.
  const total = await page.locator('.fd-list [data-fd-toggle]').count();
  expect(total).toBeGreaterThan(0);
  for (let i = 0; i < total; i += 1) {
    const undone = page.locator('.fd-list [data-fd-toggle][aria-pressed="false"]');
    if (await undone.count() === 0) break;
    await undone.first().click();
    await expect(page.locator('.fd-list [data-fd-toggle][aria-pressed="true"]')).toHaveCount(i + 1);
  }
  await expect(page.locator('.fd-list [data-fd-toggle][aria-pressed="false"]')).toHaveCount(0);
  // Marking a topic done seeds a review card that is due at once (seedSRS), so the moment the
  // week completes, reviews outrank the look-ahead card — the rule working as written. Pin that,
  // then clear the dues to isolate the "week complete, nothing else pending" state.
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-due.is-primary')).toHaveCount(1);
  await expect(page.locator('.fd-continue.is-secondary .fd-continue__kicker')).toHaveClass(/is-complete/);
  await page.evaluate(() => {
    sessionStorage.setItem('__fd_test_preserve_seed', '1');
    localStorage.removeItem('cw_srs_v1');
  });
  await page.reload();
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-continue:not(.is-secondary) .fd-continue__title')).toHaveText(/^Preview Week \d+ →$/);
  await expect(page.locator('.fd-freshset[data-fd-open="question-bank-practice.html"]')).toHaveCount(1);
  await otfExpectPrimaryIsFirstFocusable(page);
  const before = await page.evaluate(() => localStorage.getItem('cw_progress_v1'));
  await page.locator('.fd-freshset').click();
  await expect(page).toHaveURL(/tool=question-bank-practice\.html/);
  expect(await page.evaluate(() => localStorage.getItem('cw_progress_v1'))).toBe(before);
  await page.goBack();
  await expect(page.locator('.fd-continue:not(.is-secondary)')).toHaveCount(1);
  await expectHealthy(page);
});

test('One Thing First A2: no rotation week — the setup CTA leads', async ({ page }, testInfo) => {
  const role = audience(testInfo).role;
  await freezeTime(page);
  await page.addInitScript((browseRole) => {
    if (sessionStorage.getItem('__fd_test_preserve_seed') === '1') return;
    localStorage.removeItem('cw_rotation_start');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ screen: 'app', role: browseRole, tab: 'today', viewWeek: 1, browsing: true }));
  }, role);
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-setupcta')).toHaveCount(1);
  await expect(page.locator('.fd-primary, .fd-continue')).toHaveCount(0);
  await otfExpectPrimaryIsFirstFocusable(page);
  await expectHealthy(page);
});

test('One Thing First A2: cw_last names an undone week read that is not the Continue target — "You were reading" leads', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: {} });
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  const candidate = await page.evaluate(() => {
    const target = document.querySelector('.fd-continue[data-fd-open]')?.getAttribute('data-fd-open');
    const rows = [...document.querySelectorAll('.fd-list .fd-row')];
    for (const row of rows) {
      const ref = row.querySelector('.fd-row__open')?.getAttribute('data-fd-open');
      const chip = row.querySelector('.fd-chip')?.textContent;
      const done = row.querySelector('.fd-check')?.classList.contains('is-done');
      if (ref && ref !== target && chip === 'read' && !done) return ref;
    }
    return null;
  });
  test.skip(!candidate, 'this audience’s week 1 has only one undone read, so the row can never lead here');
  await page.evaluate((ref) => {
    sessionStorage.setItem('__fd_test_preserve_seed', '1');
    localStorage.setItem('cw_last', ref);
  }, candidate);
  await page.reload();
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-lastread.is-primary')).toHaveAttribute('data-fd-open', candidate);
  await expect(page.locator('.fd-primary .fd-lastread__kicker')).toHaveText('Pick up where you left off');
  await expect(page.locator('.fd-primary .fd-lastread__title')).toHaveText(/^You were reading: /);
  await expect(page.locator('.fd-continue')).toHaveClass(/is-secondary/);
  await otfExpectPrimaryIsFirstFocusable(page);
  await otfExerciseVisitAndBack(page);
  await expectHealthy(page);
});

test('One Thing First D2: the Today shortcuts are unchanged with a primary present', async ({ page }, testInfo) => {
  await seedApp(page, testInfo, { storage: { cw_srs_v1: OTF.srs } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await page.keyboard.press('2');
  await expect(page.locator('[data-fd-tab="path"]:visible')).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('1');
  await expect(page.locator('[data-fd-tab="today"]:visible')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(OTF_PRIMARY)).toHaveCount(1);
  await page.keyboard.press('/');
  await expect(page.locator('.fd-searchpanel__input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.fd-searchpanel__input')).toHaveCount(0);
  await expect(page.locator(OTF_PRIMARY)).toHaveCount(1);
  await expectHealthy(page);
});

test('One Thing First E: 390x844, reduced motion — the primary is above the fold, no overflow, 44px controls', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedApp(page, testInfo, { storage: { cw_sess_v1: OTF.capsule, cw_block_v1: OTF.block, cw_srs_v1: OTF.srs, cw_capture_v1: OTF.capture } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  const geometry = await page.evaluate((sel) => {
    const lead = document.querySelector(sel).getBoundingClientRect();
    const measure = (q) => [...document.querySelectorAll(q)].map(el => ({ q, h: Math.round(el.getBoundingClientRect().height), text: el.textContent.trim().slice(0, 30) }));
    return {
      bottom: lead.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      newControls: measure('.fd-primary button, .fd-primary a, .fd-due, .fd-resume__link, .fd-lastread, .fd-block button, .fd-freshset'),
      captureControls: measure('.fd-capture button'),
    };
  }, OTF_PRIMARY);
  expect(geometry.bottom).toBeLessThanOrEqual(844);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  for (const c of geometry.newControls) expect(c.h, `${c.q} "${c.text}"`).toBeGreaterThanOrEqual(44);
  // The capture triage predates this work. It is measured here for the first time; a miss is a
  // pre-existing finding to report in the PR, not something to fix in this change.
  for (const c of geometry.captureControls) expect.soft(c.h, `capture control "${c.text}" (pre-existing surface)`).toBeGreaterThanOrEqual(44);
  await expectHealthy(page);
});

// ---- One Thing First Phase 2: an interrupted block resumes as the block's own step -----------
//
// The block plan's question count depends on the week's first unread page, so these read `n`
// from the planner card rather than assuming it. Driving the question bank inside the reader's
// `.toolframe` mirrors aria-live.spec.js / qbank-retired.spec.js: confidence first, then an
// option, then the two-tier rationale when one is shown, then Next.
const otfFrame = (page) => page.frameLocator('.toolframe');

async function otfAnswerOne(page) {
  const frame = otfFrame(page);
  await frame.locator('.conf-btn').first().click();
  await frame.locator('#optsList .opt').first().click();
  const rationale = frame.locator('#tier2Opts .opt').first();
  if (await rationale.count()) await rationale.click();
  await frame.locator('#nextBtn').click();
}

async function otfStartBlockFromToday(page) {
  const planner = page.locator('.fd-block:not(.is-live)');
  await expect(planner).toBeVisible();
  const steps = await planner.locator('.fd-block__step .fd-block__title').allTextContents();
  const qb = steps.find((t) => /^\d+ practice question/.test(t));
  expect(qb, `plan has a question step: ${steps.join(' | ')}`).toBeTruthy();
  expect(steps[0], 'first step is a page so the receipt can count two steps').not.toMatch(/^\d+ (practice|review)/);
  const n = Number(qb.match(/^(\d+) practice/)[1]);
  await planner.locator('[data-block-start]').click();
  return { steps, n };
}

test('One Thing First B1–B3: an interrupted block question set resumes as the block\'s step and survives reload', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await seedApp(page, testInfo, { storage: {} });
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  const { n } = await otfStartBlockFromToday(page);
  // Step 1 is the week's first unread page. Its primary action leads with "Mark done ·".
  await expect(page).toHaveURL(/page=[^&]+&block=1/);
  const marker = page.locator('.fd-article__actions [data-fd-toggle]');
  await expect(marker).toContainText(new RegExp(`^Mark done · Continue to your ${n} questions →$`));
  // B3 (reader): a reload keeps the same primary action label.
  await page.evaluate(() => sessionStorage.setItem('__fd_test_preserve_seed', '1'));
  await page.reload();
  await expect(page.locator('.fd-article__actions [data-fd-toggle]')).toContainText(/^Mark done · /);
  await page.locator('.fd-article__actions [data-fd-toggle]').click();
  await expect(page).toHaveURL(new RegExp(`tool=question-bank-practice\\.html&block=1&n=${n}$`));
  await expect(otfFrame(page).locator('#progLabel')).toHaveText(`Question 1 of ${n}`);
  await otfAnswerOne(page);
  await otfAnswerOne(page);
  await expect(otfFrame(page).locator('#progLabel')).toHaveText(`Question 3 of ${n}`);
  // Interrupted: back to Today. A bare "/" would re-open the stored openId (the tool); the tab
  // parameter is what clears it in fdResolveState, which is also what the Today tab button sends.
  await page.goto('/?tab=today');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-primary .fd-resume.is-primary .fd-resume__block')).toHaveText('Block · 1 of 2 done');
  await expect(page.locator('.fd-primary .fd-resume__link')).toHaveAttribute('href', `?tool=question-bank-practice.html&resume=1&block=1&n=${n}`);
  await expect(page.locator('.fd-block.is-live [data-block-continue]')).toHaveText(`Resume: ${n - 2} of ${n} questions left →`);
  // B3 (Today): reload keeps the same primary.
  await page.reload();
  await expect(page.locator('.fd-primary .fd-resume__block')).toHaveText('Block · 1 of 2 done');
  // B2: resume continues the count, and finishing marks the block's question step.
  await page.locator('.fd-primary .fd-resume__link').click();
  await expect(page).toHaveURL(new RegExp(`resume=1&block=1&n=${n}`));
  await expect(otfFrame(page).locator('#progLabel')).toHaveText(`Question 3 of ${n}`);
  for (let i = 2; i < n; i += 1) await otfAnswerOne(page);
  await expect(otfFrame(page).locator('.cw-receipt__blockline')).toHaveText('Block complete · 2 of 2 done');
  expect(await page.evaluate(() => localStorage.getItem('cw_block_v1'))).toBeNull();
  await expectHealthy(page);
});

test('One Thing First B4: a block past its TTL is pruned; the planner returns and an orphaned capsule resumes as an ordinary set', async ({ page }, testInfo) => {
  const stale = Object.assign({}, OTF.block, { createdAt: OTF_NOW - 13 * OTF_HOUR });
  const blockCapsule = { v: 1, sessions: { qbank: Object.assign({}, OTF.capsule.sessions.qbank, { fromBlock: true, n: 6, cat: null }) } };
  await seedApp(page, testInfo, { storage: { cw_block_v1: stale, cw_sess_v1: blockCapsule } });
  await page.goto('/');
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-block:not(.is-live)')).toHaveCount(1);
  await expect(page.locator('.fd-block.is-live')).toHaveCount(0);
  await expect(page.locator('.fd-primary .fd-resume__link')).toHaveAttribute('href', '?tool=question-bank-practice.html&resume=1');
  await expect(page.locator('.fd-resume__block')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cw_block_v1'))).toBeNull();
  await expectHealthy(page);
});

// ---- One Thing First Phase 3 (F4): a guest deep link ------------------------------------------
//
// A fresh browser that follows a link to one page reads it without the wizard and is assigned no
// role (C1); a resource opened from the guest's Today pushes exactly one history entry and Back
// restores the same primary (C4); the next plain visit asks "Who's this for?" (C2); and the wizard
// from that state still lands on Today, not on the page read as a guest (C3).
test('One Thing First C1–C4: a guest reads one linked page, keeps no role, and meets the wizard on the next plain visit', async ({ page }, testInfo) => {
  const site = audience(testInfo);
  await freezeTime(page);
  // C1 — the guest read
  await page.goto('/?page=pg_suicide.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(page.getByRole('heading', { name: "Who's this for?" })).toHaveCount(0);
  await expect(page.locator('.fd-header')).not.toContainText(/undefined/);
  await page.locator('[data-fd-settings]').click();
  const chips = page.locator('.fd-choices__btn[data-fd-role]');
  await expect(chips.first()).toBeVisible();
  const pressed = await chips.evaluateAll((els) => els.map((el) => el.getAttribute('aria-pressed')));
  expect(pressed.length).toBeGreaterThan(0);
  expect(pressed.every((v) => v === 'false')).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.fd-sheet')).toHaveCount(0);
  await page.locator('.fd-reader__back').click();
  await otfExpectOnePrimary(page);
  await expect(page.locator('.fd-setupcta')).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}'));
  expect(Object.prototype.hasOwnProperty.call(stored, 'role')).toBe(false);
  // C4 — one history entry per navigation, same primary on Back
  const historyBefore = await page.evaluate(() => history.length);
  await page.locator('.fd-rail .fd-quicktool').first().click();
  await expect(page).toHaveURL(/tool=/);
  expect(await page.evaluate(() => history.length)).toBe(historyBefore + 1);
  await page.goBack();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-setupcta')).toHaveCount(1);
  expect(Object.prototype.hasOwnProperty.call(
    await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}')), 'role')).toBe(false);
  // C2 — the next plain visit asks
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Who's this for?" })).toBeVisible();
  // C3 — the wizard from that state lands on Today, not on the page read as a guest
  await page.locator(`[data-fd-role="${site.role}"]`).click();
  await expect(page.getByRole('heading', { name: 'Where in the rotation?' })).toBeVisible();
  await page.locator('[data-fd-week="1"]').click();
  await expect(page.locator('.fd-today')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('page')).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}').role)).toBe(site.role);
  await expectHealthy(page);
});

// #425 — a returning learner could not leave rotation mode: "Not on rotation — just browse" left
// cw_rotation_start stored, so the next render re-derived the week they had just left, and Back
// from Change week cleared the role while the rotation stayed behind.
test('a returning learner can leave rotation mode: browse clears the rotation, survives reload, and Back cancels safely', async ({ page }, testInfo) => {
  const site = audience(testInfo);
  await seedApp(page, testInfo);
  await page.goto('/');
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.locator('.fd-weekpill[data-fd-change-week]')).toContainText('Week 1');

  // Back from a returning learner's Change week is a cancel, not a reset.
  await page.locator('.fd-weekpill[data-fd-change-week]').click();
  await expect(page.getByRole('heading', { name: 'Where in the rotation?' })).toBeVisible();
  await page.locator('.fd-setup__back[data-fd-back]').click();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.getByRole('heading', { name: "Who's this for?" })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')).role)).toBe(site.role);
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBe('2026-08-17');

  // Now leave rotation mode.
  await page.locator('.fd-weekpill[data-fd-change-week]').click();
  await page.locator('[data-fd-week="0"]').click();
  await expect(page.locator('.fd-library')).toBeVisible();
  await expect(page.locator('.fd-weekpill[data-fd-change-week]')).toContainText('Set week');
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')).browsing)).toBe(true);

  // Reload keeps browse mode -- on Library, and after moving to Today.
  await page.evaluate(() => sessionStorage.setItem('__fd_test_preserve_seed', '1'));
  await page.reload();
  await expect(page.locator('.fd-library')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).toBeNull();
  await page.locator('[data-fd-tab="today"]:visible').click();
  await expect(page.locator('.fd-today')).toContainText('browsing — no week set');
  await page.reload();
  await expect(page.locator('.fd-today')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Where in the rotation?' })).toHaveCount(0);
  await expect(page.locator('.fd-today')).toContainText('browsing — no week set');

  // Choosing a week again leaves browse mode.
  await page.locator('.fd-weekpill[data-fd-change-week]').click();
  await page.locator('[data-fd-week="2"]').click();
  await expect(page.locator('.fd-weekpill[data-fd-change-week]')).toContainText('Week 2');
  expect(await page.evaluate(() => localStorage.getItem('cw_rotation_start'))).not.toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')).browsing)).toBe(false);
});

// #429 — "patient refuses medication" ranked Consult Questions, Delirium, Decisional Capacity; the
// tool that answers the question is now first, the consult sheet is still one row below it, and a
// crisis phrasing still routes to the suicide protocol ahead of everything.
test('a medication-refusal search ranks Decisional Capacity first without weakening crisis routing', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/');
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  const input = page.locator('.fd-searchpanel__input');
  await expect(input).toBeFocused();
  await input.fill('patient refuses medication');
  await expect(page.locator('.fd-result').first()).toHaveAttribute('data-fd-open', 'capacity.html');
  await expect(page.locator('.fd-result[data-fd-safety="exp_consult.md"]')).toHaveCount(1);
  await input.fill('she said she wants to die');
  await expect(page.locator('.fd-result').first()).toHaveAttribute('data-fd-safety', 'pg_suicide.md');
  await expectHealthy(page);
});

test('Patient care resources is a safe, responsive fourth destination and search Enter opens its fixed URL', async ({ page }, testInfo) => {
  const expectedUrls = [
    'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html',
    'https://reconnect-tools.netlify.app/tools/recovery-meeting-calendar.html',
    'https://mental-health-education-library.netlify.app/patient',
    'https://reconnect-tools.netlify.app/tools/podcast-navigator.html',
    'https://reconnect-tools.netlify.app/tools/relational-bibliotherapy.html',
  ];
  const navigatorCases = [
    ['services', 'resource-finder', ['meeting-calendar']],
    ['meetings', 'meeting-calendar', ['resource-finder']],
    ['explain', 'education-library', ['book-shelf', 'podcast-navigator']],
    ['listen', 'podcast-navigator', ['education-library', 'book-shelf']],
    ['books', 'book-shelf', ['education-library', 'podcast-navigator']],
    ['family-conversation', 'education-library', ['book-shelf', 'podcast-navigator']],
  ];
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedApp(page, testInfo);
  await page.goto('/?tab=care');

  const tabs = page.locator('.fd-tab');
  await expect(tabs).toHaveCount(5);
  expect(await tabs.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fd-tab'))))
    .toEqual(['today', 'path', 'library', 'everything', 'care']);
  const careTab = page.locator('.fd-tabs [data-fd-tab="care"]:visible');
  await expect(careTab).toHaveAttribute('aria-current', 'page');
  await expect(careTab).toHaveAccessibleName('Patient care resources');
  const libraryBox = await page.locator('.fd-tabs [data-fd-tab="library"]:visible').boundingBox();
  const careBox = await careTab.boundingBox();
  expect(careBox.x - (libraryBox.x + libraryBox.width)).toBeGreaterThan(80);

  const links = page.locator('.fd-carelink');
  await expect(links).toHaveCount(5);
  expect(await links.evaluateAll(nodes => nodes.map(node => ({
    href: node.href, target: node.target, rel: node.rel,
  })))).toEqual(expectedUrls.map(href => ({ href, target: '_blank', rel: 'noopener noreferrer' })));
  await expect(page.locator('[data-teaching-resource="family-therapy-companion"]')).toHaveCount(0);
  expect(await page.locator('.fd-care-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

  const fullListOrder = await links.evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-care-resource')));
  const fixedUrlById = Object.fromEntries(fullListOrder.map((id, index) => [id, expectedUrls[index]]));
  const canonicalTitleById = Object.fromEntries(await links.evaluateAll(nodes => nodes.map(node => [
    node.getAttribute('data-care-resource'),
    node.querySelector('.fd-carelink__title').textContent.trim(),
  ])));
  const choices = page.locator('[data-fd-care-intent]');
  await expect(choices).toHaveCount(6);
  const careStatus = page.locator('#careNavigatorStatus');
  await expect(careStatus).toHaveCount(1);
  await expect(careStatus).toHaveText('');
  expect(await page.evaluate(() => {
    const status = document.getElementById('careNavigatorStatus');
    window.__careStatusBeforeChoice = status;
    return !document.getElementById('content').contains(status);
  })).toBe(true);
  expect(await choices.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-fd-care-intent'))))
    .toEqual(navigatorCases.map(([id]) => id));
  expect(await choices.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed'))))
    .toEqual(navigatorCases.map(() => 'false'));
  await expect(page.locator('.fd-care-navigator__result')).toHaveCount(0);
  const originalUrl = page.url();
  const storageBefore = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
  }));
  const cookiesBefore = await page.context().cookies();

  for (const [intentId, primaryId, alternativeIds] of navigatorCases) {
    const choice = page.locator(`[data-fd-care-intent="${intentId}"]`);
    await choice.focus();
    await page.keyboard.press('Enter');
    await expect(choice).toBeFocused();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    expect(await choices.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed'))))
      .toEqual(navigatorCases.map(([id]) => id === intentId ? 'true' : 'false'));
    const selectedCheck = choice.locator('.fd-care-navigator__check');
    await expect(selectedCheck).toBeVisible();
    await expect(selectedCheck).toHaveText('✓');
    const checkPaint = await selectedCheck.evaluate(el => ({
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
    }));
    expect(checkPaint.color).not.toBe('rgba(0, 0, 0, 0)');
    expect(checkPaint.color).not.toBe(checkPaint.background);
    await expect(page.locator('.fd-care-navigator__result')).toBeVisible();
    const recommendations = page.locator('.fd-care-navigator__link');
    expect(await recommendations.evaluateAll(nodes => nodes.map(node => ({
      id: node.getAttribute('data-care-resource'), href: node.href,
      target: node.target, rel: node.rel,
    })))).toEqual([primaryId, ...alternativeIds].map(id => ({
      id, href: fixedUrlById[id], target: '_blank', rel: 'noopener noreferrer',
    })));
    expect(await recommendations.evaluateAll(nodes => nodes.map(node =>
      node.querySelector('.fd-care-navigator__link-title').textContent.trim())))
      .toEqual([primaryId, ...alternativeIds].map(id => canonicalTitleById[id]));
    await expect(recommendations.first()).toContainText('Best starting point');
    const selectedLabel = await choice.locator('span:last-child').textContent();
    await expect(careStatus)
      .toHaveText(`Selected ${selectedLabel}. Best starting point: ${canonicalTitleById[primaryId]}.`);
    expect(await page.evaluate(() => window.__careStatusBeforeChoice
      === document.getElementById('careNavigatorStatus'))).toBe(true);
    expect(await links.evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-care-resource')))).toEqual(fullListOrder);
  }

  const storageAfter = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])),
  }));
  expect(storageAfter).toEqual(storageBefore);
  expect(await page.context().cookies()).toEqual(cookiesBefore);
  expect(page.url()).toBe(originalUrl);

  await choices.first().focus();
  for (let index = 0; index < navigatorCases.length; index += 1) {
    await expect(choices.nth(index)).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('.fd-care-navigator__link').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.fd-care-navigator__alternatives .fd-care-navigator__link').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.fd-care-navigator__alternatives .fd-care-navigator__link').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-fd-care-clear]')).toBeFocused();

  await page.locator('[data-fd-care-intent="services"]').click();
  const externalNavigations = [];
  await page.context().route(expectedUrls[0], route => {
    expect(route.request().isNavigationRequest()).toBe(true);
    externalNavigations.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Resource Finder destination fixture</title>',
    });
  });
  const recommendationPopup = page.waitForEvent('popup');
  await page.locator('[data-care-recommendation="resource-finder"]').click();
  const recommendationPage = await recommendationPopup;
  await expect.poll(() => recommendationPage.url()).toBe(expectedUrls[0]);
  expect(externalNavigations).toEqual([expectedUrls[0]]);
  await recommendationPage.close();
  await expect(careTab).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.fd-reader,.fd-search')).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
  await page.locator('[data-fd-care-clear]').click();
  await expect(careStatus).toHaveText('');
  await expect(choices.first()).toBeFocused();
  await expect(page.locator('.fd-care-navigator__result')).toHaveCount(0);

  await page.keyboard.press('Space');
  await expect(choices.first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.fd-tabs [data-fd-tab="library"]:visible').click();
  await expect(careStatus).toHaveText('');
  await page.locator('.fd-tabs [data-fd-tab="care"]:visible').click();
  await expect(page.locator('.fd-care-navigator__result')).toHaveCount(0);
  await choices.first().click();
  await page.reload();
  await expect(page.locator('#careNavigatorStatus')).toHaveText('');
  await expect(page.locator('.fd-care-navigator__result')).toHaveCount(0);
  expect(await links.evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-care-resource')))).toEqual(fullListOrder);

  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  const input = page.locator('.fd-searchpanel__input');
  await input.fill('housing help');
  await expect(page.locator('.fd-result').first()).toHaveAttribute('data-care-resource', 'resource-finder');
  const popupPromise = page.waitForEvent('popup');
  await input.press('Enter');
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toBe(expectedUrls[0]);
  await popup.close();
  await input.press('Escape');
  await expect(page.locator('.fd-search')).toHaveCount(0);

  await page.setViewportSize(PHONE);
  await expect(careTab).toBeHidden();
  await expect(page.locator('.fd-dock:visible button')).toHaveCount(4);
  expect(await page.locator('.fd-tabs').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.locator('.fd-care-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

  await page.locator('.fd-dock:visible [data-fd-tab="library"]').click();
  const teaching = page.locator('[data-teaching-resource="family-therapy-companion"]');
  await expect(teaching).toHaveAccessibleName(/Family Therapy Seminar Companion.*opens in a new tab/);

  // Modify only this browser's served HTML, before its in-script index is built.
  // The Front Door script keeps FD_INDEX private, so page.evaluate cannot reach it.
  let careFixture = 'long-copy';
  await page.route(/\/(?:\?[^/]*)?$/, async route => {
    const response = await routeFetchWithRetry(route);
    const needle = '  var FD_INDEX=FD_CANONICAL_INDEX;';
    const original = await response.text();
    expect(original.split(needle)).toHaveLength(2);
    const mutation = careFixture === 'long-copy'
      ? '  var careServices=FD_INDEX.careNavigator.find(function(intent){return intent.id==="services";});\n'
        + '  careServices.label="W".repeat(64);careServices.explanation="W".repeat(160);'
      : '  FD_INDEX.careNavigator=[];';
    await route.fulfill({ response, body: original.replace(needle, `${needle}\n${mutation}`) });
  });
  await page.goto('/?tab=care');
  await choices.first().click();
  await page.setViewportSize({ width: 320, height: 844 });
  const firstChoice = await choices.nth(0).boundingBox();
  const secondChoice = await choices.nth(1).boundingBox();
  expect(firstChoice).not.toBeNull();
  expect(secondChoice).not.toBeNull();
  expect(Math.abs(secondChoice.x - firstChoice.x)).toBeLessThan(1);
  expect(secondChoice.y).toBeGreaterThan(firstChoice.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await choices.nth(2).click();
  const selectedControls = page.locator('.fd-care-navigator [data-fd-care-intent]:visible, '
    + '.fd-care-navigator__result .fd-care-navigator__link:visible, '
    + '.fd-care-navigator__result [data-fd-care-clear]:visible');
  await expect(selectedControls).toHaveCount(10);
  for (const control of await selectedControls.all()) {
    const box = await control.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await choices.first().click();

  await page.setViewportSize({ width: 640, height: 844 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });

  careFixture = 'no-navigator';
  await page.reload();
  await expect(page.locator('.fd-care-navigator')).toHaveCount(0);
  await expect(page.locator('#careNavigatorStatus')).toHaveText('');
  await expect(links).toHaveCount(5);
  expect(await links.evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-care-resource'), href: node.href,
  })))).toEqual(fullListOrder.map((id, index) => ({ id, href: expectedUrls[index] })));
  await expectHealthy(page);
});

test('Patient care resources stays reachable through an in-flow phone entry and the wide tab', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo);
  await page.goto('/?tab=today');
  const entry = page.locator('.fd-today .fd-care-entry[data-fd-tab="care"]');
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAccessibleName('Patient care resources');
  expect(await entry.evaluate(el => getComputedStyle(el).position)).not.toBe('fixed');
  // Today fades in (fdFadeUp: translateY 8px -> none, 0.24 s), and mid-fade the entry's box is
  // mapped through a fractional transform in float: seeked frame by frame, the 44 px target read
  // 44.00003 at 90 ms and CI measured 43.999969 on both attempts of one run (#788). Measure where
  // it settles, on the fade's own `finished` promises rather than a clock; an infinite animation
  // never settles, so it is not waited on.
  await entry.evaluate(el => Promise.all(el.closest('.fd-today').getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getComputedTiming().endTime !== Infinity)
    .map(animation => animation.finished)));
  expect((await entry.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.fd-dock:visible button')).toHaveCount(4);
  await entry.click();
  await expect(page.locator('.fd-care-page')).toBeVisible();
  await expect(page.locator('.fd-care-pack')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('tab')).toBe('care');

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?tab=today');
  await expect(page.locator('.fd-care-entry')).toBeHidden();
  await page.locator('.fd-tabs [data-fd-tab="care"]:visible').click();
  await expect(page.locator('.fd-care-page')).toBeVisible();
  await expectHealthy(page);
});

test('Care status clears on Home, browser history, and resource opening', async ({ page }, testInfo) => {
  await seedApp(page, testInfo);
  await page.goto('/?tab=care');
  const status = page.locator('#careNavigatorStatus');
  await expect(status).toHaveText('');

  await page.locator('[data-fd-care-intent="services"]').click();
  await expect(status).toHaveText(
    'Selected Find community services. Best starting point: Find services and community supports.');
  await page.locator('[data-fd-home]').click();
  await expect(status).toHaveText('');
  await page.locator('.fd-tabs [data-fd-tab="care"]:visible').click();
  await expect(status).toHaveText('');

  await page.locator('[data-fd-care-intent="meetings"]').click();
  await expect(status).toContainText('Selected ');
  await page.goBack();
  await expect(status).toHaveText('');
  await page.goForward();
  await expect(status).toHaveText('');

  await page.locator('[data-fd-care-intent="services"]').click();
  await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
  await page.locator('.fd-searchpanel__input').fill('patient refuses medication');
  const resource = page.locator('.fd-result[data-fd-open="capacity.html"]');
  await expect(resource).toBeVisible();
  await resource.click();
  await expect(page.locator('.fd-reader')).toBeVisible();
  await expect(status).toHaveText('');
  await expectHealthy(page);
});

// ---- Phone chrome (2026-09-16) --------------------------------------------------------------------
// The same dock owns the phone bottom edge on Today, Library, reader and Progress. The source
// tab row, global Capture launcher and reader action bar remain in the DOM but are not visible.
test('phone chrome: one dock stays at the bottom and the first screen belongs to the page', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await seedApp(page, testInfo);
  await page.goto('/?tab=today');
  await expect(page.locator('.fd-today')).toBeVisible();
  const dock = page.locator('.fd-dock:visible');
  await expect(dock).toHaveCount(1);
  const dockBox = await dock.boundingBox();
  expect(dockBox.y + dockBox.height).toBeCloseTo(PHONE.height, 0);
  const headerBox = await page.locator('.fd-header').boundingBox();
  expect(headerBox.height).toBeLessThanOrEqual(120);
  for (const item of await dock.locator('button').all()) {
    const box = await item.boundingBox();
    expect(box.height, 'dock item keeps its touch target').toBeGreaterThanOrEqual(44);
  }
  await page.goto('/?tab=library');
  await expect(page.locator('.fd-library')).toBeVisible();
  // A bottom bar must not cover the last Library row once the page is scrolled to its end.
  const lastRow = essentialsResources(page).last();
  await lastRow.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const rowBox = await lastRow.boundingBox();
  const barBox = await dock.boundingBox();
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(barBox.y + 0.5);

  await page.goto('/?page=t_mood.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(dock).toHaveCount(1);
  // The reader collapses its header to one row while keeping Back in the article.
  await expect(page.locator('.fd-tabs:visible,.fd-actionbar:visible,#fdCaptureMount:visible')).toHaveCount(0);
  await expect(page.locator('.fd-weekpill')).toBeHidden();
  await expect(page.locator('.fd-settingsbtn')).toBeHidden();
  await expect(page.locator('.fd-safetybtn')).toBeVisible();
  await expect(page.locator('.fd-searchbtn')).toBeVisible();
  await expect(page.locator('.fd-brand')).toHaveAccessibleName(/\S/);
  const readerHeader = await page.locator('.fd-header').boundingBox();
  expect(readerHeader.height, 'reader header is a single row').toBeLessThanOrEqual(64);
  await expect(page.locator('.fd-reader > .fd-reader__back')).toBeVisible();
  const h1 = await page.locator('.fd-article__h1').boundingBox();
  expect(h1.y, 'the topic title sits in the top quarter of a phone screen').toBeLessThanOrEqual(PHONE.height * 0.25);
  expect(await page.locator('details.practice-panel').evaluate(el => el.open)).toBe(true);
  // Progress retains its top Back link and the same dock.
  await page.goto('/?page=__progress__');
  await expect(page.locator('#pgRoot')).toBeVisible();
  await expect(page.locator('.fd-reader__back[data-fd-back]')).toBeVisible();
  await expect(dock).toHaveCount(1);
  await expectHealthy(page);
});

test('desktop chrome is untouched: tabs in the header, panel closed, top back link visible', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedApp(page, testInfo);
  await page.goto('/?page=t_mood.md');
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  const tabsBox = await page.locator('.fd-tabs').boundingBox();
  expect(tabsBox.y).toBeLessThan(120);
  await expect(page.locator('.fd-reader > .fd-reader__back')).toBeVisible();
  expect(await page.locator('details.practice-panel').evaluate(el => el.open)).toBe(false);
  await expect(page.locator('.fd-actionbar')).toBeHidden();
  await expectHealthy(page);
});

// #427 — opening a resource from deep in Library and returning lost the learner's place: the list
// came back at the top and focus went to the main region instead of the link they had chosen.
test('returning from a Library resource restores the list position and focuses the link that opened it', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await seedApp(page, testInfo);
  await page.goto('/?tab=library');
  await expect(page.locator('.fd-library')).toBeVisible();
  await page.locator('[data-fd-library-view="full"]').click();
  const link = page.locator('.fd-collink[data-fd-open$=".md"]').last();
  const ref = await link.getAttribute('data-fd-open');
  await link.scrollIntoViewIfNeeded();
  const origin = await page.evaluate(() => window.scrollY);
  expect(origin).toBeGreaterThan(200);

  // The reader paints a synchronous shell (real h1 + a loading line) and fills the body on fetch;
  // the fetch's own announceRoute() then focuses the main region, which would steal the restored
  // focus if Back ran mid-fetch. Wait for the body itself, not for a visible child: the resident
  // reader collapses section bodies, so the first list may legitimately be hidden.
  const loadedReader = async () => {
    await expect(page.locator('.fd-article')).toBeVisible();
    await expect(page.locator('.fd-article__body')).not.toContainText('Loading');
    await expect(page.locator('.fd-article__body :is(p, h2, h3, ul, ol, table)').first()).toBeAttached();
  };
  const backAtOrigin = async () => {
    await expect(page.locator('.fd-library')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-fd-open'))).toBe(ref);
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - origin)).toBeLessThan(48);
  };

  // In-app Back.
  await link.click();
  await loadedReader();
  await page.locator('.fd-reader__back[data-fd-back]').first().click();
  await backAtOrigin();

  // Keyboard only: Enter on the restored link reopens it; browser Back returns the same way.
  await page.keyboard.press('Enter');
  await loadedReader();
  await page.goBack();
  await backAtOrigin();
  await expectHealthy(page);
});

// Essentials Phase 2: exercise rendered controls against the actual audience payload.
test.describe('Essentials Phase 2', () => {
  const rows = page => page.locator('.fd-kit [data-fd-open], .fd-library:not(.fd-kit) .fd-collink[data-fd-open]');
  const full = page => page.locator('[data-fd-library-view="full"]');
  const kit = page => page.locator('[data-fd-library-view="essentials"]');
  const kitCount = info => audience(info).role === 'student' ? 30 : 35;
  const curriculum = JSON.parse(readFileSync(new URL('../../curriculum.json', import.meta.url), 'utf8'));
  const expectedKit = info => curriculum.essentials[audience(info).role === 'student' ? 'ms3' : 'resident'].flatMap(column => column.refs);
  async function readyReader(page, ref) {
    await expect(page.locator('.fd-src')).toHaveText(ref);
    if (ref.endsWith('.html')) {
      await expect(page.locator('.fd-article iframe')).toBeVisible();
      await expect.poll(async () => (await page.frameLocator('.fd-article iframe').locator('body').innerText()).trim().length).toBeGreaterThan(100);
    } else {
      await expect(page.locator('.fd-article__body')).not.toContainText('Loading');
      await expect(page.locator('.fd-article__body :is(p,h2,h3,ul,ol,table)').first()).toBeAttached();
    }
  }
  test('L1–L3: default kit, both view buttons, URL reload and browser history', async ({ page }, info) => {
    await seedApp(page, info);
    await page.goto('/?tab=library');
    await expect(page.locator('.fd-library__h1')).toHaveText('Core readings');
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
    expect(await essentialsResourceRefs(page)).toEqual([...expectedKit(info).filter(ref => !ref.endsWith('.html')), ...expectedKit(info).filter(ref => ref.endsWith('.html'))]);
    await full(page).click();
    await expect(rows(page)).toHaveCount(audience(info).libraryCount);
    await expect(page).toHaveURL(/tab=library&library=full/);
    await page.reload();
    await expect(rows(page)).toHaveCount(audience(info).libraryCount);
    await page.locator('.fd-collink[data-fd-open="t_dissociative.md"]').click();
    await readyReader(page, 't_dissociative.md');
    await page.reload();
    await readyReader(page, 't_dissociative.md');
    await page.locator('.fd-reader__back[data-fd-back]').first().click();
    await expect(rows(page)).toHaveCount(audience(info).libraryCount);
    await kit(page).click();
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
    await page.goBack();
    await expect(rows(page)).toHaveCount(audience(info).libraryCount);
    await page.goForward();
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
    await page.goto('/?library=full');
    await expect(rows(page)).toHaveCount(audience(info).libraryCount);
    await page.locator('[data-fd-tab="library"]:visible').click();
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
    expect(new URL(page.url()).searchParams.has('library')).toBe(false);
    await expectHealthy(page);
  });
  test('readings-first sections: keyboard disclosure, every filter, memory-only state and reentry reset', async ({ page }, info) => {
    await seedApp(page, info);
    await page.goto('/?tab=library');
    await page.locator('[data-fd-tab="library"]:visible').click();
    await expect(page.locator('[data-fd-tab="library"]:visible')).toHaveText('The Essentials');
    const student = audience(info).role === 'student';
    const rail = page.locator('.fd-kit__index');
    const sectionButtons = rail.locator('[data-fd-kit-section]');
    const groups = page.locator('.fd-kit__group');
    await expect(groups).toHaveCount(student ? 8 : 7);
    await expect(sectionButtons).toHaveCount(student ? 10 : 9);
    await expect(page.locator('.fd-kit__reading')).toHaveCount(student ? 23 : 26);
    const allRefs = await essentialsResourceRefs(page);
    expect([...allRefs].sort()).toEqual([...expectedKit(info)].sort());
    const storage = () => page.evaluate(() => ({local: {...localStorage}, session: {...sessionStorage}}));
    const before = await storage(); const url = page.url();
    const expected = await groups.evaluateAll(ns => ns.map(n => [...n.querySelectorAll('.fd-kit__reading, [data-fd-kit-tool]')].map(x => x.dataset.fdOpen || x.dataset.fdKitTool)));
    const values = await sectionButtons.evaluateAll(ns => ns.slice(1).map(n => n.dataset.fdKitSection).filter(value => value !== 'week'));
    const summary = groups.first().locator('summary');
    await summary.focus(); await summary.press('Enter');
    await expect(groups.first()).not.toHaveAttribute('open', '');
    await summary.press('Space'); await expect(groups.first()).toHaveAttribute('open', '');
    for (let i = 0; i < values.length; i++) {
      const button=rail.locator(`[data-fd-kit-section="${values[i]}"]`);
      await button.click();
      await expect(button).toBeFocused(); await expect(groups).toHaveCount(1);
      expect(await essentialsResourceRefs(page)).toEqual(expected[i]);
      expect(page.url()).toBe(url); expect(await storage()).toEqual(before);
    }
    await rail.locator('[data-fd-kit-section="all"]').click();
    await groups.first().locator('summary').click();
    await rail.locator(`[data-fd-kit-section="${values[0]}"]`).click(); await rail.locator('[data-fd-kit-section="all"]').click();
    await expect(page.locator('.fd-kit__group[open]')).toHaveCount(student ? 8 : 7);
    await rail.locator(`[data-fd-kit-section="${values[0]}"]`).click();
    await page.locator('.fd-kit__reading').first().click();
    await expect(page.locator('.fd-reader .loading')).toHaveCount(0);
    await page.locator('.fd-reader__back[data-fd-back]').first().click();
    await expect(rail.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
    await rail.locator('[data-fd-kit-section="tools"]').click(); await page.reload(); await expect(rail.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
    await rail.locator('[data-fd-kit-section="tools"]').click(); await page.locator('[data-fd-tab="today"]:visible').click();
    await page.locator('[data-fd-tab="library"]:visible').click(); await expect(rail.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
    // Pending-dot rendering is a build-time governance projection, covered deterministically by
    // fd-library.test.mjs and governance-warnings.spec.js. This interaction test must remain valid
    // when faculty legitimately reduce the live pending count to zero.
    await expectHealthy(page);
  });
  test('This week follows the actual rotation week, keeps reading order, and stays transient', async ({ page }, info) => {
    await page.setViewportSize(PHONE);
    await seedApp(page, info);
    const response = await page.goto('/?tab=path');
    const body = await response.text();
    const prefix = 'var FD_CURRICULUM=';
    const start = body.indexOf(prefix) + prefix.length;
    const end = body.indexOf(';\n  var FD_TOPIC_META=', start);
    expect(start).toBeGreaterThan(prefix.length);
    expect(end).toBeGreaterThan(start);
    const payload = JSON.parse(body.slice(start, end));
    const expectedWeek = n => {
      const assigned = new Set(payload.weeks.find(week => week.n === n).items.map(item => item.ref));
      return expectedKit(info).filter(ref => ref.endsWith('.md') && assigned.has(ref));
    };
    expect(expectedWeek(1).length).toBeGreaterThan(0);
    expect(expectedWeek(2).length).toBeGreaterThan(0);
    expect(expectedWeek(1)).not.toEqual(expectedWeek(2));
    await page.locator('[data-fd-view-week="2"]').click();
    await expect(page.locator('[data-fd-change-week]')).toContainText('Week 1');
    await page.locator('[data-fd-tab="library"]:visible').click();
    const rail = page.locator('.fd-kit__index');
    await expect(rail.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
    await expect(rail.locator('[data-fd-kit-section="week"] .fd-kit__index-count')).toHaveText(String(expectedWeek(1).length));
    const snapshot = () => page.evaluate(() => ({url: location.href, local: {...localStorage}, session: {...sessionStorage}}));
    const before = await snapshot();
    await rail.locator('[data-fd-kit-section="week"]').click();
    await expect(rail.locator('[data-fd-kit-section="week"]')).toBeFocused();
    expect(await rows(page).evaluateAll(nodes => nodes.map(node => node.dataset.fdOpen))).toEqual(expectedWeek(1));
    await expect(page.locator('.fd-kit__tools')).toHaveCount(0);
    expect(await snapshot()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width);
    await page.evaluate(() => {document.activeElement.blur(); window.scrollTo(0, 0);});
    await page.evaluate(() => document.fonts.ready);
    const path = info.outputPath(`essentials-this-week-${audience(info).role}.png`);
    await page.screenshot({path, animations:'disabled'});
    await info.attach('Essentials This week', {path, contentType:'image/png'});
    const ref = expectedWeek(1)[0];
    await page.locator(`.fd-kit__reading[data-fd-open="${ref}"]`).click();
    await readyReader(page, ref);
    await page.locator('[data-fd-back]:visible').first().click();
    await expect(rail.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
    await rail.locator('[data-fd-kit-section="week"]').click();
    await page.reload();
    await expect(rail.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('[data-fd-change-week]').click();
    await page.locator('[data-fd-week="2"]').click();
    await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
    await page.getByRole('dialog', { name: 'Search' }).getByRole('button', { name: 'Browse the Library' }).click();
    await rail.locator('[data-fd-kit-section="week"]').click();
    await expect(rail.locator('[data-fd-kit-section="week"] .fd-kit__index-count')).toHaveText(String(expectedWeek(2).length));
    expect(await rows(page).evaluateAll(nodes => nodes.map(node => node.dataset.fdOpen))).toEqual(expectedWeek(2));
    await full(page).click();
    await expect(rows(page)).toHaveCount(audience(info).libraryCount);
    await expectHealthy(page);
  });
  test('This week is absent in browse mode while all Essentials remain available', async ({ page }, info) => {
    await seedApp(page, info, {storage: {cw_rotation_start: ''}});
    await page.goto('/?tab=library');
    await expect(page.locator('[data-fd-change-week]')).toContainText('Set week');
    await expect(page.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('[data-fd-kit-section="week"]')).toHaveCount(0);
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
    await expectHealthy(page);
  });
  test('late Essentials section return resets All and keeps focus visible through Back and reload', async ({ page }, info) => {
    await page.setViewportSize(PHONE);
    await seedApp(page, info);
    await page.goto('/?tab=library');
    const rail=page.locator('.fd-kit__index');
    const lateSection=await rail.locator('[data-fd-kit-section]').evaluateAll(buttons =>
      buttons.map(button=>button.dataset.fdKitSection).filter(value=>value!=='all'&&value!=='week'&&value!=='tools').at(-1));
    const openLateReading=async()=>{
      await rail.locator(`[data-fd-kit-section="${lateSection}"]`).click();
      const opener=page.locator('.fd-kit__reading').first();
      const ref=await opener.getAttribute('data-fd-open');
      await opener.click();
      await readyReader(page,ref);
      return {opener:page.locator(`.fd-kit__reading[data-fd-open="${ref}"]`),ref};
    };
    const expectVisibleReturn=async opener=>{
      await expect(rail.locator('[data-fd-kit-section="all"]')).toHaveAttribute('aria-pressed','true');
      await expect(opener).toBeFocused();
      const geometry=await opener.evaluate(element=>{
        const box=element.getBoundingClientRect();
        let top=0,bottom=innerHeight;
        const header=document.querySelector('.fd-header');
        if(header&&header.getClientRects().length&&getComputedStyle(header).position==='sticky'){
          const rect=header.getBoundingClientRect();
          if(rect.top<=0&&rect.bottom>0) top=rect.bottom;
        }
        const tabs=document.querySelector('.fd-tabs');
        if(tabs&&tabs.getClientRects().length&&getComputedStyle(tabs).position==='fixed'){
          const rect=tabs.getBoundingClientRect();
          if(rect.bottom>=innerHeight-1) bottom=rect.top;
        }
        return {top:box.top,bottom:box.bottom,visibleTop:top,visibleBottom:bottom};
      });
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.visibleTop);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.visibleBottom);
    };

    let opened=await openLateReading();
    await page.locator('[data-fd-back]:visible').first().click();
    await expectVisibleReturn(opened.opener);

    opened=await openLateReading();
    await page.goBack();
    await expectVisibleReturn(opened.opener);

    opened=await openLateReading();
    await page.reload();
    await readyReader(page,opened.ref);
    await page.locator('[data-fd-back]:visible').first().click();
    await expectVisibleReturn(opened.opener);
    await expectHealthy(page);
  });
  test('tool preview cards update one shared pane without changing saved learner state', async ({ page }, info) => {
    await seedApp(page, info);
    await page.goto('/?tab=library');
    await page.locator('[data-fd-kit-section="tools"]').click();
    const tabs = page.locator('.fd-kit__tool-tabs [data-fd-kit-tool]');
    const panel = page.locator('.fd-kit__tool-preview[role="tabpanel"]');
    await expect(tabs).toHaveCount(audience(info).role === 'student' ? 7 : 9);
    await expect(panel).toHaveCount(1);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(panel.locator('h3')).toHaveText((await tabs.first().innerText()).trim());
    const before = await page.evaluate(() => ({url: location.href, local: {...localStorage}, session: {...sessionStorage}}));
    const ref = await tabs.nth(1).getAttribute('data-fd-kit-tool');
    const title = (await tabs.nth(1).innerText()).trim();
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(panel.locator('h3')).toHaveText(title);
    await expect(panel.locator('p')).not.toBeEmpty();
    await expect(panel.locator('[data-fd-open]')).toHaveAttribute('data-fd-open', ref);
    expect(await page.evaluate(() => ({url: location.href, local: {...localStorage}, session: {...sessionStorage}}))).toEqual(before);
    await panel.locator('[data-fd-open]').click();
    await readyReader(page, ref);
    await expectHealthy(page);
  });
  test('readings-first responsive targets and actual desktop and phone evidence', async ({ page }, info) => {
    await seedApp(page, info);
    for (const width of [390, 640, 641, 1280]) {
      await page.setViewportSize({width, height: 844}); await page.goto('/?tab=library');
      await expect(page.locator('.fd-kit__reading').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const tools = await page.locator('.fd-kit__tools').boundingBox();
      const readings = await page.locator('.fd-kit__readings').boundingBox();
      if (width <= 640) expect(tools.y + tools.height).toBeLessThanOrEqual(readings.y);
      if (width >= 1000) expect(tools.x).toBeGreaterThanOrEqual(readings.x + readings.width);
      for (const control of await page.locator('.fd-kit__reading, .fd-kit__tool-tab, .fd-kit__tool-preview [data-fd-open], .fd-kit__group > summary, [data-fd-kit-section]').all()) {
        await control.focus(); await expect(control).toBeFocused();
        const box = await control.boundingBox();
        // Chromium can report a CSS 44px target as 43.999984px after scrolling.
        expect(Math.round(box.height * 1000) / 1000).toBeGreaterThanOrEqual(44);
        expect(Math.round(box.width * 1000) / 1000).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      const toolTabs = page.locator('.fd-kit__tool-tabs [data-fd-kit-tool]');
      await toolTabs.first().focus();
      const stable = await page.evaluate(() => ({url: location.href, local: {...localStorage}, session: {...sessionStorage}}));
      for (let i = 1; i < await toolTabs.count(); i++) {
        await page.keyboard.press('ArrowRight'); await expect(toolTabs.nth(i)).toBeFocused();
        await expect(toolTabs.nth(i)).toHaveAttribute('aria-selected', 'true');
        const box = await toolTabs.nth(i).boundingBox();
        const strip = await page.locator('.fd-kit__tool-tabs').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(strip.x);
        expect(box.x + box.width).toBeLessThanOrEqual(strip.x + strip.width);
        expect(await page.evaluate(() => ({url: location.href, local: {...localStorage}, session: {...sessionStorage}}))).toEqual(stable);
      }
      if (width === 390 || width === 1280) {
        await page.evaluate(() => {document.activeElement.blur(); document.querySelector('.fd-kit__tool-tabs').scrollLeft = 0; window.scrollTo(0, 0);});
        await page.evaluate(() => document.fonts.ready);
        const path=info.outputPath(`essentials-${audience(info).role}-${width}.png`);
        await page.screenshot({path,animations:'disabled'});
        await info.attach(`essentials-${audience(info).role}-${width}`,{path,contentType:'image/png'});
      }
    }
  });
  test('L4: every resource omitted from kit remains readable through Full and Back', async ({ page }, info) => {
    // Exhaustive mounted navigation costs more than one ordinary smoke flow.
    test.setTimeout(240_000);
    await seedApp(page, info);
    await page.goto('/?tab=library');
    const selected = new Set(await essentialsResourceRefs(page));
    expect(selected.size).toBe(kitCount(info));
    await full(page).click();
    const all = await rows(page).evaluateAll(nodes => nodes.map(n => n.dataset.fdOpen));
    expect(all.length).toBe(audience(info).libraryCount);
    const omitted = all.filter(ref => !selected.has(ref));
    expect(omitted.length).toBe(audience(info).libraryCount - kitCount(info));
    for (const ref of omitted) {
      await page.locator(`.fd-collink[data-fd-open="${ref}"]`).click();
      await expect.poll(() => new URL(page.url()).searchParams.get(ref.endsWith('.html') ? 'tool' : 'page')).toBe(ref);
      await readyReader(page, ref);
      await page.goBack();
      await expect(rows(page)).toHaveCount(audience(info).libraryCount);
      await expect(page.locator(`.fd-collink[data-fd-open="${ref}"]`)).toBeFocused();
    }
  });
  test('L5: Dissociative search ranks first and Enter opens the omitted topic', async ({ page }, info) => {
    await seedApp(page, info);
    await page.goto('/?tab=library');
    await expect(page.locator('.fd-kit [data-fd-open="t_dissociative.md"]')).toHaveCount(0);
    await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
    const input = page.locator('.fd-searchpanel__input');
    await input.fill('Dissociative');
    await expect(page.locator('.fd-result').first()).toHaveAttribute('data-fd-open', 't_dissociative.md');
    await input.press('Enter');
    await readyReader(page, 't_dissociative.md');
    expect(new URL(page.url()).searchParams.get('page')).toBe('t_dissociative.md');
    await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
    await input.fill('she said she wants to die');
    await expect(page.locator('.fd-result').first()).toHaveAttribute('data-fd-safety', 'pg_suicide.md');
    await expectHealthy(page);
  });
  test('L6: view toggles add no storage keys or stored view, and tool openLibrary resets to kit', async ({ page }, info) => {
    await seedApp(page, info);
    await page.goto('/?tab=library');
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
    // Settle the existing persisted tab/openId fields before comparing view-only actions.
    await page.locator('[data-fd-tab="library"]:visible').click();
    const snapshot = () => page.evaluate(() => ({
      local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(),
      state: JSON.parse(localStorage.getItem('cw_frontdoor_v1')),
    }));
    const before = await snapshot();
    await full(page).click();
    await kit(page).click();
    expect(await snapshot()).toEqual(before);
    const payload = await (await page.request.get('/')).text();
    const keys = payload.match(/var FD_KEYS=(\[[^;]+\]);/);
    expect(keys).not.toBeNull();
    expect(keys[1]).not.toContain('libraryView');
    expect(keys[1]).not.toContain('kitSection');
    await full(page).click();
    await page.locator('.fd-collink[data-fd-open="mse.html"]').click();
    await readyReader(page, 'mse.html');
    const frame = await page.locator('.fd-article iframe').elementHandle();
    await (await frame.contentFrame()).evaluate(() => parent.postMessage({ type: 'openLibrary' }, location.origin));
    await expect(page.locator('.fd-library__h1')).toHaveText('Core readings');
    await expect(essentialsResources(page)).toHaveCount(kitCount(info));
  });
  test('A2: an entirely unresolved built kit falls back to the complete Library', async ({ page }, info) => {
    await seedApp(page, info);
    await page.route('**/*', async route => {
      if (route.request().resourceType() !== 'document' || new URL(route.request().url()).pathname !== '/') return route.continue();
      const response = await routeFetchWithRetry(route);
      const body = await response.text();
      const prefix = 'var FD_CURRICULUM=';
      const start = body.indexOf(prefix) + prefix.length;
      const end = body.indexOf(';\n  var FD_TOPIC_META=', start);
      expect(start).toBeGreaterThan(prefix.length);
      expect(end).toBeGreaterThan(start);
      const curriculum = JSON.parse(body.slice(start, end));
      expect(curriculum.essentials.length).toBeGreaterThan(0);
      curriculum.essentials.forEach(column => { column.refs = ['missing-phase2-ref.md']; });
      await route.fulfill({ response, body: body.slice(0, start) + JSON.stringify(curriculum) + body.slice(end) });
    });
    await page.goto('/?tab=library');
    await expect(page.locator('.fd-library__h1')).toHaveText('Everything, one screen');
    await expect(kit(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(audience(info).libraryCount);
    await expectHealthy(page);
  });
  test('T1: phone quick tools precede the primary action without overflow; wider layouts retain order', async ({ page }, info) => {
    await seedApp(page, info, { storage: { cw_srs_v1: OTF.srs } });
    for (const width of [390, 640, 641, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/?tab=today');
      const pills = page.locator('.fd-quicktools--pills');
      const pillRefs = await pills.locator('[data-fd-open]').evaluateAll(nodes => nodes.map(node => node.dataset.fdOpen));
      expect(pillRefs.length).toBeGreaterThan(0);
      expect(pillRefs).toEqual(await page.locator('.fd-rail .fd-quicktool').evaluateAll(nodes => nodes.map(node => node.dataset.fdOpen)));
      const primary = await page.locator('.fd-primary').boundingBox();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width === 1280) {
        await expect(pills).toBeHidden();
        await expect(page.locator('.fd-rail')).toBeVisible();
        const rail = await page.locator('.fd-rail').boundingBox();
        expect(rail.x).toBeGreaterThan(primary.x + primary.width);
      } else {
        await expect(pills).toBeVisible();
        const bounds = await pills.boundingBox();
        if (width <= 640) expect(bounds.y + bounds.height).toBeLessThanOrEqual(primary.y);
        else expect(bounds.y).toBeGreaterThan(primary.y + primary.height);
        const links = pills.locator('button');
        for (let i = 0; i < await links.count(); i++) {
          await links.nth(i).focus();
          await expect(links.nth(i)).toBeFocused();
          const box = await links.nth(i).boundingBox();
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(width <= 640
            ? (await page.locator('.fd-dock:visible').boundingBox()).y : 844);
        }
      }
    }
  });
  test('first-screen contact sheet: Today, The Essentials, Reader', async ({ page, context }, info) => {
    await page.setViewportSize(PHONE);
    await seedApp(page, info);
    const images = [];
    for (const [label, route, surface] of [
      ['Today', '/?tab=today', '.fd-today'], ['The Essentials', '/?tab=library', '.fd-library'],
      ['Reader', '/?page=t_mood.md', '.fd-article__body'],
    ]) {
      await page.goto(route);
      await expect(page.locator(surface)).toBeVisible();
      if (label === 'Reader') {
        await readyReader(page, 't_mood.md');
        await expect(page.locator('.fd-reader .governance-notice').first()).toBeVisible();
        await expect(page.locator('.fd-reader .governance-notice.unavailable')).toHaveCount(0);
      }
      await page.evaluate(() => document.fonts.ready);
      images.push({ label, data: (await page.screenshot({ animations: 'disabled' })).toString('base64') });
    }
    const scratch = await context.newPage();
    try {
      const data = await scratch.evaluate(async images => {
        const canvas = document.createElement('canvas');
        canvas.width = 1170; canvas.height = 880;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < images.length; i++) {
          const img = new Image(); img.src = 'data:image/png;base64,' + images[i].data;
          await img.decode(); ctx.drawImage(img, i * 390, 36, 390, 844);
          ctx.fillStyle = '#202020'; ctx.font = 'bold 18px sans-serif';
          ctx.fillText(images[i].label, i * 390 + 12, 25);
        }
        return canvas.toDataURL('image/png').split(',')[1];
      }, images);
      await info.attach(`essentials-${audience(info).role === 'student' ? 'ms3' : 'res'}-contact-sheet`, {
        body: Buffer.from(data, 'base64'), contentType: 'image/png',
      });
    } finally { await scratch.close(); }
  });
});
