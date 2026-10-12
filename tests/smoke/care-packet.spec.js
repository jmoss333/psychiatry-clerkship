import { test, expect } from '@playwright/test';
import { careDirectoryFixture, pinCareDirectory } from './care-directory-fixture.js';
import { enableCarePacket, packetFeed } from './care-packet-fixture.js';
import { isResidentProject } from './audience.js';

const KEY = 'fd_care_packet_v1';
const GATES = ['verification', 'region', 'identifiers', 'supervisor'];
async function seed(page, info) {
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'));
  await page.addInitScript(role => {
    localStorage.setItem('cw_rotation_start', '2026-10-12');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'care', viewWeek: 1 }));
  }, isResidentProject(info.project.name) ? 'pgy1' : 'student');
}
const snapshot = page => page.evaluate(k => ({ local: { ...localStorage }, keys: Object.keys(sessionStorage),
  packet: JSON.parse(sessionStorage.getItem(k) || 'null') }), KEY);
const tray = page => page.locator('[data-fd-care-packet-tray]');
const addButtons = page => page.locator('[data-fd-care-packet]');
const trayNames = page => tray(page).locator('[data-fd-care-packet-item] .fd-care-packet__name').allTextContents();

// ---- AC0: with the flag off (the production default) the packet does not exist at all
test('flag off: no packet controls, no tray, and nothing in sessionStorage after a search', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await seed(page, info);
  await pinCareDirectory(page, packetFeed(careDirectoryFixture()));
  await page.goto('/?tab=care');
  const panel = page.locator('[data-care-directory]');
  await panel.getByLabel('Resource name or service').fill('support');
  await expect(panel.locator('.fd-care-search__result')).toHaveCount(5);
  await expect(page.locator('[data-fd-care-packet],[data-fd-care-packet-page],[data-fd-care-packet-all],[data-fd-care-packet-tray],.fd-care-packet,.fd-care-search__pack,.fd-care-search__bulk')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('flag on', () => {
  let errors;
  test.beforeEach(async ({ page }, info) => {
    errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await seed(page, info);
    await enableCarePacket(page);
    await pinCareDirectory(page, packetFeed(careDirectoryFixture()));
  });
  test.afterEach(() => { expect(errors, 'no uncaught page error in any flag-on test').toEqual([]); });

  async function search(page, text = 'support') {
    await page.goto('/?tab=care');
    const panel = page.locator('[data-care-directory]');
    await panel.getByLabel('Resource name or service').fill(text);
    await expect(panel.locator('.fd-care-search__result').first()).toBeVisible();
    return panel;
  }

  // ---- AC1
  test('add toggles exactly that listing; aria-pressed, is-packed and the tray count agree after every click', async ({ page }) => {
    const panel = await search(page);
    const first = addButtons(page).first();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await expect(tray(page)).toContainText('No listings yet');
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(first).toBeFocused();
    await expect(panel.locator('article.is-packed')).toHaveCount(1);
    await expect(panel.locator('article.is-packed .fd-care-search__packed')).toHaveText('In packet');
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('1');
    await expect(page.locator('#careDirectoryStatus')).toContainText('1 listing in packet');
    expect((await snapshot(page)).packet.ids).toHaveLength(1);
    await expect(addButtons(page).nth(1)).toHaveAttribute('aria-pressed', 'false');
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await expect(panel.locator('article.is-packed')).toHaveCount(0);
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('0');
    expect((await snapshot(page)).keys).toEqual([]);
  });

  // ---- AC2
  test('"Add all results" adds min(N-k, 12-current) across pages, reports the skipped count, and never duplicates', async ({ page }) => {
    const panel = await search(page);
    await addButtons(page).nth(0).click();
    await addButtons(page).nth(1).click();
    await expect(panel.getByRole('button', { name: /^Add this page \(3\)$/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Add all results \(21\)$/ })).toBeVisible();
    await panel.getByRole('button', { name: /^Add all results/ }).click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('12');
    await expect(page.locator('#careDirectoryStatus')).toContainText('Added 10 listings.');
    await expect(page.locator('#careDirectoryStatus')).toContainText('11 not added because the packet is full at 12');
    await expect(page.locator('#careDirectoryStatus')).toContainText('12 listings in packet');
    // Both bulk buttons are now disabled, so focus lands on the tray heading, whose name carries the count.
    await expect(tray(page).locator('#fd-care-packet-title')).toBeFocused();
    const { packet } = await snapshot(page);
    expect(packet.ids).toHaveLength(12);
    expect(new Set(packet.ids).size).toBe(12);
  });

  // ---- AC3
  test('at 12 every remaining add button is disabled and says why; removing one re-enables them', async ({ page }) => {
    const panel = await search(page);
    await panel.getByRole('button', { name: /^Add all results/ }).click();
    await expect(tray(page)).toContainText('full at 12');
    await expect(panel.getByRole('button', { name: /^Add all results/ })).toBeDisabled();
    // Page 3 is where the three unpacked listings are, so the assertion below inspects real disabled buttons.
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(panel.locator('#fd-care-directory-count')).toHaveText('11–15 of 23 listings');
    const unpacked = panel.locator('[data-fd-care-packet][aria-pressed="false"]');
    const packed = panel.locator('[data-fd-care-packet][aria-pressed="true"]');
    await expect(unpacked).toHaveCount(3);
    await expect(packed).toHaveCount(2);
    for (const button of await unpacked.all()) await expect(button).toBeDisabled();
    for (const button of await packed.all()) await expect(button).toBeEnabled();
    await tray(page).locator('[data-fd-care-packet-remove]').first().click();
    await expect(tray(page)).not.toContainText('full at 12');
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('11');
    for (const button of await unpacked.all()) await expect(button).toBeEnabled();
    await expect(panel.getByRole('button', { name: /^Add all results/ })).toBeEnabled();
  });

  // ---- AC4 (the review gate; the Print and Copy buttons themselves arrive in the next PR)
  test('the review confirmations are bound to the packet: disabled when empty, reset by adding or clearing, reset on leaving Care', async ({ page }) => {
    await search(page);
    const ready = tray(page).locator('[data-fd-care-packet-ready]');
    const gate = key => tray(page).locator('[data-fd-care-packet-gate="' + key + '"]');
    const tickAll = async () => { for (const key of GATES) await gate(key).check(); };
    await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'false');
    await expect(ready).toContainText('Add a listing');
    for (const key of GATES) await expect(gate(key)).toBeDisabled();
    await addButtons(page).first().click();
    for (const key of GATES) await expect(gate(key)).toBeEnabled();
    await gate('verification').check();
    await expect(gate('verification')).toBeFocused();
    await tickAll();
    await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'true');
    await expect(page.locator('#careDirectoryStatus')).toContainText('Review complete.');
    for (const key of GATES) {
      await gate(key).uncheck();
      await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'false');
      await gate(key).check();
      await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'true');
    }
    // A listing added after the review was never confirmed, so the confirmations start over.
    await addButtons(page).nth(1).click();
    await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'false');
    for (const key of GATES) await expect(gate(key)).not.toBeChecked();
    await expect(page.locator('#careDirectoryStatus')).toContainText('Review confirmations cleared.');
    await tickAll();
    await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'true');
    await tray(page).getByRole('button', { name: 'Clear packet' }).click();
    await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'false');
    for (const key of GATES) { await expect(gate(key)).not.toBeChecked(); await expect(gate(key)).toBeDisabled(); }
    await addButtons(page).first().click();
    await tickAll();
    await page.locator('[data-fd-tab="library"]:visible').click();
    await page.locator('[data-fd-tab="care"]:visible').click();
    for (const key of GATES) await expect(gate(key)).not.toBeChecked();
    // Only the confirmations reset. The packet itself is tab-scoped and survives leaving Care.
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('1');
    await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'false');
  });

  // ---- AC6
  test('one session key, no change to localStorage, and no network request on add, remove, reorder or clear', async ({ page }) => {
    const panel = await search(page);
    const before = await snapshot(page);
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    await addButtons(page).nth(0).click();
    await addButtons(page).nth(1).click();
    await panel.getByRole('button', { name: /^Add this page/ }).click();
    await tray(page).locator('[data-fd-care-packet-down]:not([disabled])').first().click();
    await tray(page).locator('[data-fd-care-packet-remove]').first().click();
    const during = await snapshot(page);
    expect(during.keys).toEqual([KEY]);
    expect(during.local).toEqual(before.local);
    expect(Object.keys(during.packet).sort()).toEqual(['ids', 'inserts', 'mode', 'why']);
    await tray(page).getByRole('button', { name: 'Clear packet' }).click();
    expect((await snapshot(page)).keys).toEqual([]);
    await page.waitForTimeout(400);
    expect(requests).toEqual([]);
  });

  test('the packet survives a reload and leaving Care, and a stale id never renders', async ({ page }) => {
    await search(page);
    await addButtons(page).nth(2).click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('1');
    await page.reload();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('1');
    await page.evaluate(k => sessionStorage.setItem(k, JSON.stringify({ ids: ['p-3', 'gone-from-feed'], why: {}, inserts: {}, mode: 'review' })), KEY);
    await page.reload();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('1');
    expect(await trayNames(page)).toEqual(['Example Support 04']);
    await expect(tray(page)).not.toContainText('gone-from-feed');
    await page.locator('[data-fd-tab="library"]:visible').click();
    await page.locator('[data-fd-tab="care"]:visible').click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('1');
    expect(await trayNames(page)).toEqual(['Example Support 04']);
  });

  test('reorder swaps the right neighbour within a category and keeps focus; Remove focuses the next row ON SCREEN', async ({ page }) => {
    const panel = await search(page, 'example');
    await panel.getByLabel('Category', { exact: true }).selectOption('peer_support');
    await panel.getByRole('button', { name: /^Add all results/ }).click();
    await panel.getByLabel('Category', { exact: true }).selectOption('aftercare');
    await addButtons(page).first().click();
    expect(await tray(page).locator('.fd-care-packet__group h4').allTextContents()).toEqual(['Aftercare', 'Peer support']);
    expect(await trayNames(page)).toEqual(['Example Support 01', 'Example Peer Group 1', 'Example Peer Group 2', 'Example Peer Group 3']);
    const item = id => tray(page).locator('[data-fd-care-packet-item="' + id + '"]');
    await item('peer-2').locator('[data-fd-care-packet-up]').click();
    expect(await trayNames(page)).toEqual(['Example Support 01', 'Example Peer Group 1', 'Example Peer Group 3', 'Example Peer Group 2']);
    await expect(item('peer-2').locator('[data-fd-care-packet-up]')).toBeFocused();
    await item('peer-2').locator('[data-fd-care-packet-down]').click();
    expect(await trayNames(page)).toEqual(['Example Support 01', 'Example Peer Group 1', 'Example Peer Group 2', 'Example Peer Group 3']);
    // Moving it to the end of the group disables "down", so focus falls back to its other arrow.
    await expect(item('peer-2').locator('[data-fd-care-packet-down]')).toBeDisabled();
    await expect(item('peer-2').locator('[data-fd-care-packet-up]')).toBeFocused();
    // The aftercare listing was added LAST (storage order) but is FIRST on screen: Remove must follow the screen.
    await item('p-0').locator('[data-fd-care-packet-remove]').click();
    await expect(item('peer-0').locator('[data-fd-care-packet-remove]')).toBeFocused();
    await tray(page).getByRole('button', { name: 'Clear packet' }).click();
    await expect(tray(page).locator('#fd-care-packet-title')).toBeFocused();
  });

  test('the directory\'s own controls still work with the packet on, and "Add this page" adds only the visible page', async ({ page }) => {
    const panel = await search(page);
    const count = panel.locator('#fd-care-directory-count');
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(count).toHaveText('6–10 of 23 listings');
    await expect(count).toBeFocused();
    const visible = await panel.locator('.fd-care-search__result h4').allTextContents();
    expect(visible).toHaveLength(5);
    await panel.getByRole('button', { name: /^Add this page \(5\)$/ }).click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('5');
    expect((await trayNames(page)).sort()).toEqual([...visible].sort());
    await panel.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(count).toHaveText('1–5 of 23 listings');
    await panel.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(count).toContainText('Search by');
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('5');
  });

  test('typing in the search never repaints the tray or touches the packet', async ({ page }) => {
    const panel = await search(page);
    await addButtons(page).first().click();
    await tray(page).evaluate(node => { node.__kept = true; node.firstElementChild.__kept = true; });
    const stored = (await snapshot(page)).packet;
    await panel.getByLabel('Resource name or service').fill('peer group');
    await expect(panel.locator('.fd-care-search__result')).toHaveCount(3);
    expect(await tray(page).evaluate(node => !!node.__kept && !!node.firstElementChild.__kept)).toBe(true);
    expect((await snapshot(page)).packet).toEqual(stored);
  });

  test('a hostile listing name cannot inject markup into the results or the tray', async ({ page }) => {
    const feed = packetFeed(careDirectoryFixture());
    feed.records[0].name = 'Example <img src=x onerror="window.__pwned=1"> Support';
    await pinCareDirectory(page, feed);
    const panel = await search(page);
    await addButtons(page).first().click();
    await expect(tray(page).locator('img')).toHaveCount(0);
    await expect(panel.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  for (const width of [390, 320]) {
    test(`targets are 44px, nothing overflows, focus is never hidden, and the tray is reachable by keyboard at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const panel = await search(page);
      await panel.getByRole('button', { name: /^Add this page/ }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const element of await panel.locator('[data-fd-care-packet], .fd-care-search__bulk button, .fd-care-packet button, .fd-care-packet__check').all()) {
        if (!(await element.isVisible())) continue;
        const box = await element.boundingBox();
        expect(box.height, await element.evaluate(n => n.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44);
      }
      // A control restored after a repaint must not end up under the fixed bottom tab bar.
      await tray(page).locator('[data-fd-care-packet-down]:not([disabled])').first().click();
      const hidden = await page.evaluate(() => {
        const active = document.activeElement, dock = document.querySelector('.fd-dock');
        if (!active || !dock) return 'no focus or dock';
        const a = active.getBoundingClientRect(), d = dock.getBoundingClientRect();
        return a.bottom > d.top + 1 && a.top < d.bottom ? 'focused control is under the dock' : '';
      });
      expect(hidden).toBe('');
      // Keyboard: from the last add button focus moves on every Tab and reaches the tray right after the pager.
      await addButtons(page).last().focus();
      let inTray = false;
      for (let i = 0; i < 4 && !inTray; i++) {
        await page.evaluate(() => { window.__prevFocus = document.activeElement; });
        await page.keyboard.press('Tab');
        const step = await page.evaluate(() => ({
          moved: document.activeElement !== window.__prevFocus && document.activeElement !== document.body,
          inTray: !!document.activeElement.closest('[data-fd-care-packet-tray]') }));
        expect(step.moved).toBe(true);
        inTray = step.inTray;
      }
      expect(inTray, 'the tray is reachable within four Tab presses of the last result').toBe(true);
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('[data-care-directory-results]'))).toBe(true);
      await panel.screenshot({ path: info.outputPath(`care-packet-${width}.png`) });
    });
  }
});
