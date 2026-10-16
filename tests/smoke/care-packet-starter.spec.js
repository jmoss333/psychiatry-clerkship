import { test, expect } from '@playwright/test';
import { careDirectoryFixture, pinCareDirectory } from './care-directory-fixture.js';
import { enableCarePacketHtml, printFeed, UNIT_PROFILE_FIXTURE, pinCareProfileAuthority } from './care-packet-fixture.js';
import { isResidentProject } from './audience.js';

// Fictional choices exercise the starter workflow, never define Sanford's real resource list.
const PROFILE = UNIT_PROFILE_FIXTURE.profile;
const STARTER = { profile: PROFILE.id, ids: ['r-0', 'r-1'] };
const PACKET = 'fd_care_packet_v1';
const PREFERENCE = 'cw_care_unit_profile_v1';
const button = page => page.locator('[data-fd-care-packet-starter]');
const tray = page => page.locator('[data-fd-care-packet-tray]');
const preview = page => page.locator('#fd-care-packet-preview');
const print = page => page.getByRole('button', { name: 'Print packet', exact: true });
const snapshot = page => page.evaluate(([key, pref]) => ({ packet: JSON.parse(sessionStorage.getItem(key) || 'null'), preference: localStorage.getItem(pref) }), [PACKET, PREFERENCE]);

async function prepare(page, info, { feed = printFeed(careDirectoryFixture(), { count: 3 }), saved = null, approval = 'approved' } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
  await page.addInitScript(({ role, saved, key }) => {
    localStorage.setItem('cw_rotation_start', '2026-10-12');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'care', viewWeek: 1 }));
    if (saved) sessionStorage.setItem(key, JSON.stringify(saved));
    window.__prints = 0;
    window.print = () => { window.__prints++; };
    window.__copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: text => { window.__copies.push(text); return Promise.resolve(); },
    } });
  }, { role: isResidentProject(info.project.name) ? 'pgy1' : 'student', saved, key: PACKET });
  const authority = await pinCareProfileAuthority(page, { profiles: [PROFILE], status: approval });
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    let html = enableCarePacketHtml(await response.text());
    expect(html.match(/var FD_CARE_PACKET_STARTER=/g), 'one starter configuration in the actual built shell').toHaveLength(1);
    html = html.replace(/var FD_CARE_PACKET_STARTER=[\s\S]*?;/, () => 'var FD_CARE_PACKET_STARTER=' + JSON.stringify(STARTER) + ';');
    const match = html.match(/var FD_CARE_INSERTS=(.*);\n/);
    expect(match, 'the actual built payload supplies the profile candidate').toBeTruthy();
    const payload = JSON.parse(match[1]);
    payload.unitProfiles = [PROFILE];
    await route.fulfill({ response, body: html.replace(match[0], () => 'var FD_CARE_INSERTS=' + JSON.stringify(payload) + ';\n') });
  });
  await pinCareDirectory(page, feed);
  await page.goto('/?tab=care');
  await expect(page.locator('[data-care-directory-notice]')).toContainText('Directory snapshot:');
  await expect(page.locator('[data-care-directory-results]')).toHaveAttribute('aria-busy', 'false');
  return { authority, feed };
}

test('Load Sanford starter selects its complete set and approved unit, opens preview without printing, and prints the edited packet', async ({ page }, info) => {
  const { authority, feed } = await prepare(page, info);
  await expect(button(page)).toHaveAccessibleName('Load Sanford starter');
  await expect(button(page)).toHaveAttribute('aria-describedby', 'fd-care-packet-starter-note');
  await button(page).click();
  await expect(preview(page)).toBeVisible();
  await expect(page.locator('#fd-care-packet-preview-title')).toBeFocused();
  await expect(page.locator('[data-fd-care-packet-profile-status]')).toContainText('Approval checked.');
  const loaded = await snapshot(page);
  expect(loaded.packet.ids).toEqual(STARTER.ids);
  expect(loaded.packet.unit).toEqual({ name: '', phone: '', profile: PROFILE.id });
  expect(loaded.preference).toBe(PROFILE.id);
  expect(authority.requests).toEqual([{ profileId: PROFILE.id, revision: PROFILE.revision }]);
  expect(await page.evaluate(() => window.__prints)).toBe(0);
  await expect(page.locator('#fdPacketPrint')).toHaveCount(0);
  for (const record of feed.records.slice(0, 2)) await expect(tray(page)).toContainText(record.name);

  await page.locator('[data-fd-care-packet-remove="r-1"]').click();
  await expect(print(page)).toBeEnabled();
  await print(page).click();
  await expect(page.locator('#fdPacketPrint')).toHaveCount(1);
  await expect(page.locator('#fdPacketPrint')).toContainText(feed.records[0].name);
  await expect(page.locator('#fdPacketPrint')).not.toContainText(feed.records[1].name);
  expect(await page.evaluate(() => window.__prints)).toBe(1);
  expect(authority.requests).toHaveLength(2);
});

test('loading the starter preserves compatible selections and page choices, and repeating it never duplicates listings', async ({ page }, info) => {
  const saved = { ids: ['r-0', 'r-2'], why: {}, inserts: { safety: true, week: false }, mode: 'final', unit: { name: '', phone: '', profile: PROFILE.id } };
  await prepare(page, info, { saved });
  await button(page).click();
  await expect(page.locator('[data-fd-care-packet-profile-status]')).toContainText('Approval checked.');
  const first = await snapshot(page);
  expect(first.packet.ids).toEqual(['r-0', 'r-2', 'r-1']);
  expect(first.packet.mode).toBe(saved.mode);
  expect(first.packet.inserts).toEqual(saved.inserts);
  await expect(page.getByRole('radio', { name: /Final copy/ })).toBeChecked();
  await expect(page.locator('[data-fd-care-packet-insert="safety"]')).toBeChecked();
  await expect(page.locator('[data-fd-care-packet-insert="week"]')).not.toBeChecked();
  await button(page).click();
  expect(await snapshot(page)).toEqual(first);
  await expect(tray(page).locator('[data-fd-care-packet-item]')).toHaveCount(3);
  expect(await page.evaluate(() => window.__prints)).toBe(0);
});

for (const failure of ['missing listing', 'incomplete directory']) {
  test(`${failure}: starter refusal is explained and no partial preset or profile preference is saved`, async ({ page }, info) => {
    const feed = printFeed(careDirectoryFixture(), { count: 3 });
    if (failure === 'missing listing') {
      feed.records = feed.records.filter(record => record.id !== 'r-1');
      feed.categories.find(category => category.id === 'aftercare').count = 2;
    } else {
      feed.categories.find(category => category.id === 'peer_support').available = false;
    }
    const { authority } = await prepare(page, info, { feed });
    await expect(button(page)).toBeDisabled();
    await expect(button(page)).toHaveAttribute('aria-describedby', 'fd-care-packet-starter-note');
    await expect(page.locator('[data-fd-care-packet-starter-note]')).toContainText(failure === 'missing listing' ? /missing|unavailable|not found|not in/i : /incomplete|unavailable|did not load/i);
    const before = await snapshot(page);
    await button(page).evaluate(element => { element.disabled = false; });
    await button(page).click();
    await expect(button(page)).toBeDisabled();
    expect(await snapshot(page)).toEqual(before);
    expect(authority.requests).toEqual([]);
    await expect(preview(page)).toBeHidden();
    await expect(page.locator('#fdPacketPrint')).toHaveCount(0);
    expect(await page.evaluate(() => window.__prints)).toBe(0);
  });
}

test('a starter never treats the remembered unit as approval: revoked authority blocks Print and Copy', async ({ page }, info) => {
  const { authority } = await prepare(page, info, { approval: 'revoked' });
  await button(page).click();
  await expect(preview(page)).toBeVisible();
  await expect(page.locator('#careDirectoryStatus')).toContainText('Unit approval could not be confirmed.');
  expect((await snapshot(page)).packet.ids).toEqual(STARTER.ids);
  expect(authority.requests).toEqual([{ profileId: PROFILE.id, revision: PROFILE.revision }]);
  await page.getByRole('radio', { name: /Final copy/ }).check();
  const copy = page.getByRole('button', { name: 'Copy as text', exact: true });
  await expect(print(page)).toBeDisabled();
  await expect(copy).toBeDisabled();
  await print(page).evaluate(element => { element.disabled = false; });
  await print(page).click();
  await expect.poll(() => authority.requests.length).toBe(2);
  await expect(print(page)).toBeDisabled();
  expect(await page.evaluate(() => window.__prints)).toBe(0);
  expect(await page.evaluate(() => window.__copies)).toEqual([]);
  await expect(page.locator('#fdPacketPrint, #fd-care-packet-copy-text')).toHaveCount(0);
});
