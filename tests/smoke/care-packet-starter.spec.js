import { test, expect } from '@playwright/test';
import { careDirectoryFixture, pinCareDirectory } from './care-directory-fixture.js';
import { enableCarePacketHtml, printFeed, UNIT_PROFILE_FIXTURE, pinCareProfileAuthority } from './care-packet-fixture.js';
import { isResidentProject } from './audience.js';

// Fictional choices exercise the starter workflow, never define Sanford's real resource list.
const PROFILE = UNIT_PROFILE_FIXTURE.profile;
const STARTER = { profile: PROFILE.id, ids: ['r-0', 'r-1'] };
const ADDONS = { transport: { ids: ['r-2', 'r-3'] }, housing: { ids: ['r-4', 'r-5'] } };
const PACKET = 'fd_care_packet_v1';
const PREFERENCE = 'cw_care_unit_profile_v1';
const button = page => page.locator('[data-fd-care-packet-starter]');
const addon = (page, kind) => page.locator(`[data-fd-care-packet-addon="${kind}"]`);
const tray = page => page.locator('[data-fd-care-packet-tray]');
const preview = page => page.locator('#fd-care-packet-preview');
const print = page => page.getByRole('button', { name: 'Print packet', exact: true });
const snapshot = page => page.evaluate(([key, pref]) => ({ packet: JSON.parse(sessionStorage.getItem(key) || 'null'), preference: localStorage.getItem(pref) }), [PACKET, PREFERENCE]);

function addonFeed(count = 6) {
  const feed = printFeed(careDirectoryFixture(), { count });
  for (const record of feed.records) {
    record.verifiedDate = '2026-10-16';
    record.reviewAfter = '2027-04-14';
  }
  return feed;
}

async function prepare(page, info, { feed = printFeed(careDirectoryFixture(), { count: 3 }), saved = null, approval = 'approved', addons = null, remembered = null } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-16T12:00:00Z'));
  await page.addInitScript(({ role, saved, key, remembered, preferenceKey }) => {
    localStorage.setItem('cw_rotation_start', '2026-10-12');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'care', viewWeek: 1 }));
    if (saved) sessionStorage.setItem(key, JSON.stringify(saved));
    if (remembered !== null) localStorage.setItem(preferenceKey, remembered);
    window.__prints = 0;
    window.print = () => { window.__prints++; };
    window.__copies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: text => { window.__copies.push(text); return Promise.resolve(); },
    } });
  }, { role: isResidentProject(info.project.name) ? 'pgy1' : 'student', saved, key: PACKET, remembered, preferenceKey: PREFERENCE });
  const authority = await pinCareProfileAuthority(page, { profiles: [PROFILE], status: approval });
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    let html = enableCarePacketHtml(await response.text());
    expect(html.match(/var FD_CARE_PACKET_STARTER=/g), 'one starter configuration in the actual built shell').toHaveLength(1);
    html = html.replace(/var FD_CARE_PACKET_STARTER=[\s\S]*?;/, () => 'var FD_CARE_PACKET_STARTER=' + JSON.stringify(STARTER) + ';');
    if (addons) {
      const declaration = 'var FD_CARE_PACKET_ADDONS=' + JSON.stringify(addons) + ';';
      // Supplying only configuration also lets the red test reach the actual missing controls
      // before the implementation exists; no rendering or click behavior is mocked.
      if (/var FD_CARE_PACKET_ADDONS=/.test(html)) html = html.replace(/var FD_CARE_PACKET_ADDONS=[\s\S]*?;/, () => declaration);
      else html = html.replace(/var FD_CARE_PACKET_STARTER=[\s\S]*?;/, match => match + declaration);
    }
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

test('optional add-ons stay out of the starter until explicitly added, deduplicate, and fit a 320px screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await prepare(page, info, { feed: addonFeed(), addons: ADDONS });
  await expect(addon(page, 'transport')).toHaveAccessibleName('Add transport');
  await expect(addon(page, 'housing')).toHaveAccessibleName('Add housing help');
  for (const kind of ['transport', 'housing']) {
    await expect(addon(page, kind)).toHaveAttribute('aria-describedby', `fd-care-packet-addon-${kind}-note`);
    await expect(addon(page, kind)).toBeEnabled();
  }
  await button(page).click();
  await expect(page.locator('[data-fd-care-packet-profile-status]')).toContainText('Approval checked.');
  const base = await snapshot(page);
  expect(base.packet.ids).toEqual(['r-0', 'r-1']);

  await addon(page, 'transport').click();
  await expect(preview(page)).toBeVisible();
  await expect(page.locator('#fd-care-packet-preview-title')).toBeFocused();
  const transport = await snapshot(page);
  expect(transport.packet.ids).toEqual(['r-0', 'r-1', 'r-2', 'r-3']);
  expect(transport.packet.unit).toEqual(base.packet.unit);
  expect(transport.preference).toBe(PROFILE.id);
  await addon(page, 'transport').click();
  expect(await snapshot(page)).toEqual(transport);

  await addon(page, 'housing').click();
  expect((await snapshot(page)).packet.ids).toEqual(['r-0', 'r-1', 'r-2', 'r-3', 'r-4', 'r-5']);
  await expect(tray(page).locator('[data-fd-care-packet-item]')).toHaveCount(6);
  await expect(page.locator('#fd-care-packet-preview-title')).toBeFocused();
  expect(await page.evaluate(() => window.__prints)).toBe(0);
  await expect(page.locator('#fdPacketPrint')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'add-on controls must not widen the phone page').toBe(true);
});

test('an add-on can start an empty packet without selecting or remembering a unit', async ({ page }, info) => {
  const { authority } = await prepare(page, info, { feed: addonFeed(), addons: ADDONS });
  await addon(page, 'housing').click();
  await expect(page.locator('#fd-care-packet-preview-title')).toBeFocused();
  const added = await snapshot(page);
  expect(added.packet.ids).toEqual(['r-4', 'r-5']);
  expect(added.packet.unit).toEqual({ name: '', phone: '', profile: '' });
  expect(added.preference).toBeNull();
  expect(authority.requests).toEqual([]);
  await expect(print(page)).toBeDisabled();
  expect(await page.evaluate(() => window.__prints)).toBe(0);
});

test('add-ons preserve packet order, typed unit drafts, page choices, mode, and remembered identity', async ({ page }, info) => {
  const saved = { ids: ['r-1', 'r-2'], why: {}, inserts: { safety: true, week: false }, mode: 'final',
    unit: { name: 'Fictional ward', phone: '(207) 555-0194', profile: '' } };
  await prepare(page, info, { feed: addonFeed(), addons: ADDONS, saved, remembered: PROFILE.id });
  await page.locator('[data-fd-care-packet-preview-toggle]').click();
  const name = page.locator('#fd-care-packet-unit-name');
  await name.fill('Fictional ward draft');
  expect((await snapshot(page)).packet.unit.name, 'input has not yet committed the typed draft').toBe('Fictional ward');
  // A DOM click does not blur the input first: the add-on repaint must preserve its live draft.
  await addon(page, 'transport').evaluate(element => element.click());
  await expect(name).toHaveValue('Fictional ward draft');
  await expect(page.locator('#fd-care-packet-unit-phone')).toHaveValue('(207) 555-0194');
  await expect(name).toBeEditable();
  await expect(page.locator('#fd-care-packet-preview-title')).toBeFocused();
  const added = await snapshot(page);
  expect(added.packet.ids).toEqual(['r-1', 'r-2', 'r-3']);
  expect(added.packet.unit.profile).toBe('');
  expect(added.packet.mode).toBe('final');
  expect(added.packet.inserts).toEqual({ safety: true, week: false });
  expect(added.preference).toBe(PROFILE.id);
  await expect(page.getByRole('radio', { name: /Final copy/ })).toBeChecked();
  await expect(page.locator('[data-fd-care-packet-insert="safety"]')).toBeChecked();
  await expect(page.locator('[data-fd-care-packet-insert="week"]')).not.toBeChecked();
  await expect(print(page)).toBeDisabled();
  expect(await page.evaluate(() => window.__prints)).toBe(0);
});

for (const failure of ['missing', 'ineligible', 'overdue', 'future date', 'invalid date', 'verification required', 'capacity']) {
  test(`add-on ${failure}: explains refusal and never adds a partial bundle, even through a forced control`, async ({ page }, info) => {
    const feed = addonFeed(failure === 'capacity' ? 12 : 6);
    const addons = structuredClone(ADDONS);
    const saved = { ids: ['r-0'], why: {}, inserts: { week: false }, mode: 'final',
      unit: { name: 'Fictional ward', phone: '(207) 555-0194', profile: '' } };
    const blocked = feed.records.find(record => record.id === 'r-3');
    if (failure === 'missing') feed.records = feed.records.filter(record => record !== blocked);
    if (failure === 'ineligible') { blocked.phone = ''; blocked.contactHref = ''; blocked.website = ''; }
    if (failure === 'overdue') blocked.reviewAfter = '2026-10-15';
    if (failure === 'future date') blocked.verifiedDate = '2026-10-17';
    if (failure === 'invalid date') blocked.verifiedDate = '2026-02-30';
    if (failure === 'verification required') {
      blocked.verificationRequired = true;
      saved.ids.push('r-3'); // Even a listing already in the packet must be checked again.
    }
    if (failure === 'capacity') {
      feed.records.push({ ...feed.records[0], id: 'r-12', name: 'Fictional additional service' });
      saved.ids = Array.from({ length: 11 }, (_, index) => 'r-' + index);
      addons.transport.ids = ['r-11', 'r-12'];
    }
    for (const category of feed.categories) category.count = feed.records.filter(record => record.category === category.id).length;
    const { authority } = await prepare(page, info, { feed, addons, saved, remembered: PROFILE.id });
    const control = addon(page, 'transport');
    await expect(control).toBeDisabled();
    await expect(control).toHaveAttribute('aria-describedby', 'fd-care-packet-addon-transport-note');
    await expect(page.locator('#fd-care-packet-addon-transport-note')).toContainText(
      failure === 'capacity' ? /fit|full|remove|capacity/i : /unavailable|missing|cannot|verify|verified|review|date|contact|expired|eligible|checked/i);
    const before = await snapshot(page);
    await control.evaluate(element => { element.disabled = false; });
    await control.click();
    await expect(control).toBeDisabled();
    expect(await page.evaluate(() => document.activeElement !== document.body), 'refusing an add-on must not abandon keyboard focus').toBe(true);
    expect(await snapshot(page)).toEqual(before);
    expect(authority.requests).toEqual([]);
    await expect(preview(page)).toBeHidden();
    await expect(page.locator('#fdPacketPrint')).toHaveCount(0);
    expect(await page.evaluate(() => window.__prints)).toBe(0);
  });
}

test('adding optional resources preserves fresh approval checks for Print and Copy', async ({ page }, info) => {
  const { authority } = await prepare(page, info, { feed: addonFeed(), addons: ADDONS });
  await button(page).click();
  await expect(page.locator('[data-fd-care-packet-profile-status]')).toContainText('Approval checked.');
  await addon(page, 'housing').click();
  await page.getByRole('radio', { name: /Final copy/ }).check();
  await expect(print(page)).toBeEnabled();
  authority.status = 'revoked';
  const beforePrint = authority.requests.length;
  await print(page).click();
  await expect.poll(() => authority.requests.length).toBeGreaterThan(beforePrint);
  await expect(page.locator('[data-fd-care-packet-profile-status]')).toContainText('Approval has not been confirmed.');
  await expect(page.locator('#careDirectoryStatus')).toContainText('Unit approval could not be confirmed.');
  await expect(print(page)).toBeDisabled();
  const copy = page.getByRole('button', { name: 'Copy as text', exact: true });
  await expect(copy).toBeDisabled();
  const beforeCopy = authority.requests.length;
  await copy.evaluate(element => { element.disabled = false; });
  await copy.click();
  await expect.poll(() => authority.requests.length).toBeGreaterThan(beforeCopy);
  await expect(copy).toBeDisabled();
  expect((await snapshot(page)).packet.ids).toEqual(['r-0', 'r-1', 'r-4', 'r-5']);
  expect(await page.evaluate(() => window.__prints)).toBe(0);
  expect(await page.evaluate(() => window.__copies)).toEqual([]);
  await expect(page.locator('#fdPacketPrint, #fd-care-packet-copy-text')).toHaveCount(0);
});
