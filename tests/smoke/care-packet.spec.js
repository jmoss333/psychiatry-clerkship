import { test, expect } from '@playwright/test';
import { careDirectoryFixture, pinCareDirectory } from './care-directory-fixture.js';
import { enableCarePacket, disableCarePacket, packetFeed, UNIT_PROFILE_FIXTURE } from './care-packet-fixture.js';
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
// The window's live beforeprint listeners (added minus removed) whose source is the packet's. The packet's own print hook is the
// only one that checks printFingerprint, so this counts it without reaching into the shell's closure.
const watchPrintListeners = page => page.addInitScript(() => {
  const live = new Set(), add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) { if (this === window && type === 'beforeprint' && fn) live.add(fn); return add.call(this, type, fn, opts); };
  EventTarget.prototype.removeEventListener = function (type, fn, opts) { if (this === window && type === 'beforeprint') live.delete(fn); return remove.call(this, type, fn, opts); };
  window.__packetPrintHooks = () => [...live].filter(fn => /printFingerprint/.test(String(fn))).length;
});
// The payload exactly as the build serves it, for numbers a test must not type.
async function servedPayload(page) {
  const html = await (await page.request.get('/')).text();
  const match = html.match(/var FD_CARE_INSERTS=(.*);\n/);
  expect(match, 'the served shell declares its payload on one line').toBeTruthy();
  return JSON.parse(match[1]);
}

// ---- AC0: an explicit flag-off fixture removes the packet, independent of the production default.
test('flag off: no packet controls, no tray, no preview or card button, no print hook, nothing staged by a print, and nothing in sessionStorage after a search', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await seed(page, info);
  await disableCarePacket(page);
  await watchPrintListeners(page);
  await pinCareDirectory(page, packetFeed(careDirectoryFixture()));
  await page.goto('/?tab=care');
  const panel = page.locator('[data-care-directory]');
  await panel.getByLabel('Resource name or service').fill('support');
  await expect(panel.locator('.fd-care-search__result')).toHaveCount(5);
  await expect(page.locator('[data-fd-care-packet],[data-fd-care-packet-page],[data-fd-care-packet-all],[data-fd-care-packet-tray],.fd-care-packet,.fd-care-search__pack,.fd-care-search__bulk,[data-fd-care-packet-preview],[data-fd-care-packet-card-print],[data-fd-care-packet-ineligible]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__packetPrintHooks()), 'no packet print hook is registered').toBe(0);
  expect(await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const staged = !!document.getElementById('fdPacketPrint') || !!document.getElementById('fdPacketPageRule') || document.body.classList.contains('fd-packet-printing');
    window.dispatchEvent(new Event('afterprint'));
    return staged;
  }), 'a print with the flag off stages nothing').toBe(false);
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
  test('"Add from all results" adds min(N-k, 12-current) across pages, reports the skipped count, and never duplicates', async ({ page }) => {
    const panel = await search(page);
    await addButtons(page).nth(0).click();
    await addButtons(page).nth(1).click();
    await expect(panel.getByRole('button', { name: /^Add from this page$/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /^Add from all results$/ })).toBeVisible();
    await panel.getByRole('button', { name: /^Add from all results/ }).click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('12');
    await expect(page.locator('#careDirectoryStatus')).toContainText('Added 10 listings.');
    await expect(page.locator('#careDirectoryStatus')).toContainText('11 were not added because the packet is full');
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
    await panel.getByRole('button', { name: /^Add from all results/ }).click();
    await expect(tray(page)).toContainText('full at 12');
    await expect(panel.getByRole('button', { name: /^Add from all results/ })).toBeDisabled();
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
    await expect(panel.getByRole('button', { name: /^Add from all results/ })).toBeEnabled();
  });

  // ---- AC4 (the review gate; what it does to the Print and Copy buttons is in care-packet-print.spec.js)
  test('the review confirmations are bound to the packet: disabled when empty, reset by adding or clearing, reset on leaving Care', async ({ page }) => {
    await search(page);
    const ready = tray(page).locator('[data-fd-care-packet-ready]');
    const gate = key => tray(page).locator('[data-fd-care-packet-gate="' + key + '"]');
    const tickAll = async () => { for (const key of GATES) await gate(key).check(); };
    await expect(ready).toHaveAttribute('data-fd-care-packet-ready', 'false');
    await expect(ready).toContainText('Add a listing');
    for (const key of GATES) await expect(gate(key)).toBeDisabled();
    await addButtons(page).first().click();
    await tray(page).getByRole('button', { name: /Preview and print/ }).click();
    await page.locator('[data-fd-care-packet-profile-select]').selectOption(UNIT_PROFILE_FIXTURE.profile.id);
    await page.locator('[data-fd-care-packet-profile-load]').click();
    await expect(page.locator('[data-fd-care-packet-profile-status]')).toHaveText(`Loaded: ${UNIT_PROFILE_FIXTURE.profile.label}. Approval checked. Expires on ${UNIT_PROFILE_FIXTURE.profile.expiresOn} (America/New_York).`);
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
    await page.getByRole('dialog').getByRole('button', {name:'Clear packet',exact:true}).click();
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
    await panel.getByRole('button', { name: /^Add from this page/ }).click();
    await tray(page).locator('[data-fd-care-packet-down]:not([disabled])').first().click();
    await tray(page).locator('[data-fd-care-packet-remove]').first().click();
    const during = await snapshot(page);
    expect(during.keys).toEqual([KEY]);
    expect(during.local).toEqual(before.local);
    expect(Object.keys(during.packet).sort()).toEqual(['ids', 'inserts', 'mode', 'unit', 'why']);
    await tray(page).getByRole('button', { name: 'Clear packet' }).click();
    await page.getByRole('dialog').getByRole('button', {name:'Clear packet',exact:true}).click();
    expect((await snapshot(page)).keys).toEqual([]);
    await page.waitForTimeout(400);
    expect(requests).toEqual([]);
  });

  // The positive control for the flag-off test's zero: the same probe sees the packet's print hook exactly while Care is mounted.
  test('the packet registers one print hook while Care is mounted and removes it on leaving Care', async ({ page }) => {
    await watchPrintListeners(page);
    await search(page);
    expect(await page.evaluate(() => window.__packetPrintHooks()), 'one hook on Care').toBe(1);
    await page.locator('[data-fd-tab="library"]:visible').click();
    await expect.poll(() => page.evaluate(() => window.__packetPrintHooks()), { message: 'none after leaving Care' }).toBe(0);
    await page.locator('[data-fd-tab="care"]:visible').click();
    await expect.poll(() => page.evaluate(() => window.__packetPrintHooks()), { message: 'one again on returning' }).toBe(1);
  });

  // ---- eligibility: the chooser offers only what can print, and says why in plain text where the button would be
  test('the chooser offers only listings that can print: a crisis service, a listing with no phone or website, and one whose phone or name carries a registered crisis number each say why, have no add button, and are left out of the Add counts', async ({ page }) => {
    const payload = await servedPayload(page);
    // Registered crisis numbers come from the served payload, never typed here.
    const ten = payload.crisisNumbers.find(n => /^\d{10}$/.test(n)), short = payload.crisisNumbers.find(n => /^\d{3}$/.test(n));
    expect(ten && short, 'the payload ships a ten-digit and a three-digit registered crisis number').toBeTruthy();
    const feed = packetFeed(careDirectoryFixture());
    const odd = [
      ['CRISIS_CATEGORY', 'Unlisted Crisis Service', r => ({ ...r, category: 'crisis' })],
      ['NO_CONTACT', 'Unlisted No Contact', r => ({ ...r, phone: '', contactHref: '', website: '' })],
      ['CRISIS_NUMBER', 'Unlisted Crisis Phone', r => ({ ...r, phone: `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`, contactHref: 'tel:' + ten })],
      ['CRISIS_NUMBER', `Unlisted ${short} Partners`, r => r],
    ];
    odd.forEach(([, name, change], i) => { feed.records[i] = { ...change(feed.records[i]), name }; });
    feed.categories = feed.categories.map(c => ({ ...c, count: feed.records.filter(r => r.category === c.id).length }));
    await pinCareDirectory(page, feed);
    const panel = await search(page, 'unlisted');
    await expect(panel.locator('.fd-care-search__result')).toHaveCount(odd.length);
    for (const [code, name] of odd) {
      const row = panel.locator('.fd-care-search__result').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await expect(row, name).toHaveCount(1);
      await expect(row.locator(`[data-fd-care-packet-ineligible="${code}"]`), `${name}: the reason, as plain text`).toHaveCount(1);
      await expect(row.locator(`[data-fd-care-packet-ineligible="${code}"]`)).toHaveText(new RegExp('^Can’t be added to the packet: '));
      expect(await row.locator('[data-fd-care-packet-ineligible]').evaluate(el => el.tagName + (el.tabIndex >= 0 ? ' focusable' : '')), `${name}: not a control`).toBe('P');
      await expect(row.locator('[data-fd-care-packet]'), `${name}: no add button`).toHaveCount(0);
    }
    await expect(panel.getByRole('button', { name: 'Add from this page', exact:true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Add from all results', exact:true })).toBeDisabled();
    await expect(panel.locator('[data-fd-care-packet-ineligible-count]')).toHaveText(`${odd.length} results can’t go in the packet and are not counted.`);
    // Every listing matches "support" (the shared description), so "Add from all results" counts the eligible ones only.
    await panel.getByLabel('Resource name or service').fill('support');
    const eligible = feed.records.length - odd.length;
    await expect(panel.locator('#fd-care-packet-all-capacity')).toHaveText(`12 of ${eligible} new matches will fit.`);
    await panel.getByRole('button', { name: /^Add from all results/ }).click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('12');
    await expect(page.locator('#careDirectoryStatus')).toContainText(`Added 12 listings. ${eligible - 12} were not added because the packet is full. ${odd.length} were not added because the listing does not meet the packet’s eligibility rules.`);
    await tray(page).getByText('See what wasn’t added',{exact:true}).click();
    for (const [, name] of odd) await expect(tray(page).locator('details')).toContainText(name);
    const packed = await trayNames(page);
    for (const [, name] of odd) expect(packed, `${name} never reaches the packet`).not.toContain(name);
    expect((await snapshot(page)).packet.ids.filter(id => ['p-0', 'p-1', 'p-2', 'p-3'].includes(id))).toEqual([]);
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
    await panel.getByRole('button', { name: /^Add from all results/ }).click();
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
    await page.getByRole('dialog').getByRole('button', {name:'Clear packet',exact:true}).click();
    await expect(page.getByLabel('Resource name or service')).toBeFocused();
  });

  test('the directory\'s own controls still work with the packet on, and "Add from this page" adds only the visible page', async ({ page }) => {
    const panel = await search(page);
    const count = panel.locator('#fd-care-directory-count');
    await panel.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(count).toHaveText('6–10 of 23 listings');
    await expect(count).toBeFocused();
    const visible = await panel.locator('.fd-care-search__result h4').allTextContents();
    expect(visible).toHaveLength(5);
    await panel.getByRole('button', { name: /^Add from this page$/ }).click();
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
      await panel.getByRole('button', { name: /^Add from this page/ }).click();
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

// Owner-approved G-B acceptance. The feature is enabled only in intercepted test HTML.
test.describe('G-B acceptance', () => {
  test.beforeEach(async ({ page }, info) => {
    await seed(page, info); await enableCarePacket(page);
    await pinCareDirectory(page, packetFeed(careDirectoryFixture()));
    await page.goto('/?tab=care');
    await page.getByLabel('Resource name or service').fill('support');
    await expect(addButtons(page).first()).toBeVisible();
  });
  test('Clear requires a counted confirmation; Keep, Escape and backdrop preserve the packet', async ({ page }) => {
    await addButtons(page).first().click(); await addButtons(page).nth(1).click();
    for (const key of GATES) await tray(page).locator('[data-fd-care-packet-gate="'+key+'"]').check();
    const saved = (await snapshot(page)).packet;
    const clear = tray(page).getByRole('button', {name:'Clear packet',exact:true});
    await clear.click(); const dialog=page.getByRole('dialog',{name:'Clear all 2 listings?'});
    await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button',{name:'Keep packet'})).toBeFocused();
    await dialog.getByRole('button',{name:'Keep packet'}).click();
    expect((await snapshot(page)).packet).toEqual(saved); await expect(clear).toBeFocused();
    for (const key of GATES) await expect(tray(page).locator('[data-fd-care-packet-gate="'+key+'"]')).toBeChecked();
    await clear.click(); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect((await snapshot(page)).packet).toEqual(saved);
    await clear.click(); await page.mouse.click(1,1); await expect(dialog).toHaveCount(0); expect((await snapshot(page)).packet).toEqual(saved);
    await clear.click(); await dialog.getByRole('button',{name:'Clear packet',exact:true}).click();
    await expect(page.getByLabel('Resource name or service')).toBeFocused(); expect((await snapshot(page)).packet).toBeNull();
    await expect(clear).toBeDisabled(); await page.reload(); expect((await snapshot(page)).packet).toBeNull();
  });
  test('bulk preview and omission details explain capacity without losing existing selections', async ({page})=>{
    await addButtons(page).first().click();
    await expect(page.locator('#fd-care-packet-all-capacity')).toHaveText('11 of 22 new matches will fit.');
    await page.getByRole('button',{name:'Add from all results',exact:true}).click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('12');
    await expect(tray(page)).toContainText('Added 11 listings. 1 was already in your packet. 11 were not added because the packet is full.');
    await tray(page).getByText('See what wasn’t added',{exact:true}).click();
    await expect(tray(page).locator('details li')).toHaveCount(11);
    await expect(tray(page).locator('details')).toContainText('packet is full');
    await expect(page.getByRole('button',{name:'Add from all results',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:/^Remove from packet:/}).first().click();
    await expect(page.getByRole('button',{name:'Add from all results',exact:true})).toBeEnabled();
  });
  for(const width of [390,320,1280]) test('phone walkthrough: adding and removing at '+width+'px',async({page},info)=>{
    await page.setViewportSize({width,height:844});
    const card=page.locator('.fd-care-search__result').first(); const button=card.locator('[data-fd-care-packet]');
    await button.scrollIntoViewIfNeeded(); await expect(button).toHaveText('Add to packet');
    await card.screenshot({path:info.outputPath('gb-add-before-'+width+'.png')});
    await button.click();await expect(button).toHaveText('Remove from packet');await expect(button).toBeFocused();
    await expect(card.getByText('In packet',{exact:true})).toBeVisible();await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('1');
    await card.screenshot({path:info.outputPath('gb-add-after-'+width+'.png')});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await button.click();await expect(button).toHaveText('Add to packet');await expect(button).toBeFocused();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('0');
    await button.click();await addButtons(page).nth(1).click();
    await tray(page).getByRole('button',{name:'Clear packet',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Clear all 2 listings?'});
    await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Keep packet'})).toBeFocused();
    await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Clear packet',exact:true})).toBeFocused();
    await page.keyboard.press('Tab');
    // Native dialogs may focus the dialog root on wrapping, but cannot reach the inert background.
    expect(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)||document.activeElement===document.body)).toBe(true);
    await page.screenshot({path:info.outputPath('gb-clear-dialog-'+width+'.png')});
    expect(await dialog.evaluate(d=>d.getBoundingClientRect().left>=0&&d.getBoundingClientRect().right<=innerWidth)).toBe(true);
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    await tray(page).screenshot({path:info.outputPath('gb-review-tray-'+width+'.png')});
  });
});
