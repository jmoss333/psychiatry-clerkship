import { test, expect } from '@playwright/test';
import { careDirectoryFixture, pinCareDirectory } from './care-directory-fixture.js';
import { enableCarePacketHtml, printFeed, UNIT_PROFILE_FIXTURE, pinCareProfileAuthority } from './care-packet-fixture.js';
import { isResidentProject } from './audience.js';

const PROFILE = UNIT_PROFILE_FIXTURE.profile;
const PREFERENCE = 'cw_care_unit_profile_v1';
const PACKET = 'fd_care_packet_v1';
const select = page => page.locator('[data-fd-care-packet-profile-select]');
const load = page => page.locator('[data-fd-care-packet-profile-load]');
const memory = page => page.locator('[data-fd-care-packet-profile-memory]');
const forget = page => page.locator('[data-fd-care-packet-profile-forget]');
const print = page => page.getByRole('button', { name: 'Print packet' });
const copy = page => page.getByRole('button', { name: 'Copy as text' });
const status = page => page.locator('[data-fd-care-packet-profile-status]');
const preference = page => page.evaluate(key => localStorage.getItem(key), PREFERENCE);
const packet = page => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), PACKET);

async function prepare(page, info, { profile = PROFILE, profiles = [profile], approval = 'approved' } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
  await page.addInitScript(role => {
    localStorage.setItem('cw_rotation_start', '2026-10-12');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'care', viewWeek: 1 }));
    window.__prints = 0;
    window.print = () => { window.__prints++; };
    window.__copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: text => { window.__copies.push(text); return Promise.resolve(); },
    } });
  }, isResidentProject(info.project.name) ? 'pgy1' : 'student');
  const authority = await pinCareProfileAuthority(page, { profiles, status: approval });
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    const html = enableCarePacketHtml(await response.text());
    const match = html.match(/var FD_CARE_INSERTS=(.*);\n/);
    expect(match, 'the real built shell carries the packet payload').toBeTruthy();
    const payload = JSON.parse(match[1]);
    payload.unitProfiles = profiles;
    await route.fulfill({ response, body: html.replace(match[0], () => 'var FD_CARE_INSERTS=' + JSON.stringify(payload) + ';\n') });
  });
  await pinCareDirectory(page, printFeed(careDirectoryFixture(), { count: 1 }));
  await page.goto('/?tab=care');
  return authority;
}

async function openPacket(page) {
  await page.getByLabel('Resource name or service').fill('southern maine');
  await page.locator('[data-fd-care-packet]').first().click();
  await page.locator('[data-fd-care-packet-preview-toggle]').click();
}

async function loadProfile(page) {
  await select(page).selectOption(PROFILE.id);
  await load(page).click();
  await expect(status(page)).toContainText('Approval checked.');
}

test('explicit Load remembers only the unit ID on this device; choosing a profile alone saves nothing', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  expect(await preference(page)).toBeNull();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await select(page).selectOption(PROFILE.id);
  expect(await preference(page)).toBeNull();
  await load(page).click();
  await expect(status(page)).toContainText('Approval checked.');
  expect(await preference(page)).toBe(PROFILE.id);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ ...before, [PREFERENCE]: PROFILE.id });
  await expect(memory(page)).toBeVisible();
  await expect(forget(page)).toHaveAccessibleName('Forget this unit');
  await expect(print(page)).toBeEnabled();
});

test('a new tab restores the remembered unit and checks approval before printing, without another Load click', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  await loadProfile(page);

  const next = await page.context().newPage();
  const authority = await prepare(next, info);
  await openPacket(next);
  await expect(status(next)).toContainText('Approval checked.');
  await expect(next.locator('#fd-care-packet-unit-name')).toHaveValue(PROFILE.unitName);
  await expect(next.locator('#fd-care-packet-unit-name')).not.toBeEditable();
  await expect(memory(next)).toBeVisible();
  expect((await packet(next)).unit.profile).toBe(PROFILE.id);
  expect(authority.requests).toEqual([{ profileId: PROFILE.id, revision: PROFILE.revision }]);
  await expect(print(next)).toBeEnabled();
  await print(next).click();
  await expect(next.locator('#fdPacketPrint')).toHaveCount(1);
  expect(await next.evaluate(() => window.__prints)).toBe(1);
  expect(authority.requests).toHaveLength(2);
  expect(authority.requests[1]).toEqual({ profileId: PROFILE.id, revision: PROFILE.revision });
});

test('remembered identity resolves to the newly shipped profile revision, never saved contact details or approval', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  await loadProfile(page);
  const updated = { ...PROFILE, label: 'Updated fixture unit (test only)', unitName: 'Fixture Unit 4 West',
    unitPhone: '(207) 555-0167', revision: 'd'.repeat(64) };
  const next = await page.context().newPage();
  const authority = await prepare(next, info, { profile: updated });
  await openPacket(next);
  await expect(status(next)).toContainText('Approval checked.');
  await expect(next.locator('#fd-care-packet-unit-name')).toHaveValue(updated.unitName);
  await expect(next.locator('#fd-care-packet-unit-phone')).toHaveValue(updated.unitPhone);
  expect(authority.requests).toEqual([{ profileId: updated.id, revision: updated.revision }]);
  expect(await preference(next)).toBe(PROFILE.id);
  await print(next).click();
  await expect(next.locator('#fdPacketPrint')).toContainText(updated.unitPhone);
  await expect(next.locator('#fdPacketPrint')).not.toContainText(PROFILE.unitPhone);
  expect(authority.requests.at(-1)).toEqual({ profileId: updated.id, revision: updated.revision });
});

test('Clear packet clears this packet and keeps the device preference for the next tab', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  await loadProfile(page);
  await page.locator('[data-fd-care-packet-tray]').getByRole('button', { name: 'Clear packet', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear packet', exact: true }).click();
  expect(await packet(page)).toBeNull();
  expect(await preference(page)).toBe(PROFILE.id);
  await openPacket(page);
  expect((await packet(page)).unit.profile).toBe('');
  await expect(page.locator('#fd-care-packet-unit-name')).toHaveValue('');
  await expect(print(page)).toBeDisabled();

  const next = await page.context().newPage();
  await prepare(next, info);
  await openPacket(next);
  await expect(status(next)).toContainText('Approval checked.');
  expect((await packet(next)).unit.profile).toBe(PROFILE.id);
  await expect(print(next)).toBeEnabled();
});

test('Forget this unit removes the device preference while preserving the approved unit in the current packet', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  await loadProfile(page);
  await forget(page).click();
  expect(await preference(page)).toBeNull();
  expect((await packet(page)).unit.profile).toBe(PROFILE.id);
  await expect(page.locator('#fd-care-packet-unit-name')).toHaveValue(PROFILE.unitName);
  await expect(print(page)).toBeEnabled();
  await expect(forget(page)).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === document.body), 'removing the forget control must not abandon keyboard focus').toBe(false);

  const next = await page.context().newPage();
  await prepare(next, info);
  await openPacket(next);
  expect((await packet(next)).unit.profile).toBe('');
  await expect(next.locator('#fd-care-packet-unit-name')).toHaveValue('');
  await expect(print(next)).toBeDisabled();
});

test('Use my own details removes the remembered unit and clears the current profile', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  await loadProfile(page);
  await page.locator('[data-fd-care-packet-profile-unlink]').click();
  expect(await preference(page)).toBeNull();
  expect((await packet(page)).unit.profile).toBe('');
  await expect(page.locator('#fd-care-packet-unit-name')).toHaveValue('');
  await expect(page.locator('#fd-care-packet-unit-name')).toBeEditable();
  await expect(page.locator('#fd-care-packet-unit-name')).toBeFocused();
  await expect(page.locator('#fd-care-packet-unit-phone')).toHaveValue('');
  await expect(print(page)).toBeDisabled();
  await expect(forget(page)).toBeHidden();

  const next = await page.context().newPage();
  await prepare(next, info);
  await openPacket(next);
  expect((await packet(next)).unit.profile).toBe('');
  await expect(print(next)).toBeDisabled();
});

test('an unavailable remembered unit can be forgotten without losing keyboard focus when no profiles are shipped', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  await loadProfile(page);
  const next = await page.context().newPage();
  const authority = await prepare(next, info, { profiles: [] });
  await openPacket(next);
  await expect(memory(next)).toContainText('unavailable');
  await expect(load(next)).toHaveCount(0);
  await expect(print(next)).toBeDisabled();
  expect(authority.requests).toEqual([]);
  await forget(next).click();
  expect(await preference(next)).toBeNull();
  await expect(forget(next)).toBeHidden();
  expect(await next.evaluate(() => document.activeElement === document.body), 'Forget must return focus to an available control').toBe(false);
  await expect(print(next)).toBeDisabled();
});

for (const verdict of ['missing', 'revoked']) {
  test(`${verdict} approval for a remembered unit keeps Print and Copy blocked, including forced controls`, async ({ page }, info) => {
    await prepare(page, info);
    await openPacket(page);
    await loadProfile(page);
    const next = await page.context().newPage();
    const authority = await prepare(next, info, { approval: verdict });
    await openPacket(next);
    await expect(next.locator('#careDirectoryStatus')).toContainText('Unit approval could not be confirmed.');
    await next.getByRole('radio', { name: /Final copy/ }).check();
    expect((await packet(next)).unit.profile).toBe(PROFILE.id);
    expect(authority.requests.length, 'restoring a device preference still consults authority').toBeGreaterThan(0);
    for (const button of [print(next), copy(next)]) {
      await expect(button).toBeDisabled();
      const previousChecks = authority.requests.length;
      await button.evaluate(el => { el.disabled = false; });
      await button.click();
      await expect.poll(() => authority.requests.length).toBeGreaterThan(previousChecks);
      await expect(button).toBeDisabled();
    }
    expect(await next.evaluate(() => window.__prints)).toBe(0);
    expect(await next.evaluate(() => window.__copies)).toEqual([]);
    await expect(next.locator('#fdPacketPrint, #fd-care-packet-copy-text')).toHaveCount(0);
  });
}

test('revocation after automatic restoration is checked again when Print is pressed', async ({ page }, info) => {
  await prepare(page, info);
  await openPacket(page);
  await loadProfile(page);
  const next = await page.context().newPage();
  const authority = await prepare(next, info);
  await openPacket(next);
  await expect(status(next)).toContainText('Approval checked.');
  await expect(print(next)).toBeEnabled();
  const previousChecks = authority.requests.length;
  authority.status = 'revoked';
  await print(next).click();
  await expect(next.locator('#careDirectoryStatus')).toContainText('Unit approval could not be confirmed.');
  expect(authority.requests.length).toBeGreaterThan(previousChecks);
  await expect(print(next)).toBeDisabled();
  expect(await next.evaluate(() => window.__prints)).toBe(0);
  await expect(next.locator('#fdPacketPrint')).toHaveCount(0);
});
