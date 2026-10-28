import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { isResidentProject } from './audience.js';
import { careDirectoryFixture } from './care-directory-fixture.js';
import { enablePatientSharing } from './care-patient-sharing-fixture.js';
import { enableCarePacket } from './care-packet-fixture.js';

// Controlled responses exercise the real shell: no focus method is stubbed and no action
// after release may refocus its target before the keyboard assertion. The production gates
// for optional Care features remain unchanged; their existing test fixtures opt in explicitly.
const READING = 't_mood.md';
const KIT = JSON.parse(readFileSync(new URL('../../curriculum.json', import.meta.url))).safetyKit;
const CAPTURE = '.cap-sheet[role="dialog"]';
const QUESTION = 'What should I ask during teaching time?';
const cases = [
  { id: 'search', selector: '.fd-search' },
  { id: 'settings', selector: '.fd-sheet' },
  { id: 'safety kit', selector: '.fd-sheet' },
  ...KIT.map(entry => ({ id: `protocol ${entry.ref}`, ref: entry.ref, selector: '.fd-sheet' })),
  { id: 'capture', selector: CAPTURE },
  { id: 'email review', selector: '.cap-email-sheet' },
  { id: 'patient-details warning', selector: '.cap-phi' },
  { id: 'retained item preview', selector: '.fd-sheet' },
];

async function holdResponse(page, pattern, response) {
  let release, requested = false;
  const held = new Promise(resolve => { release = resolve; });
  await page.route(pattern, async route => {
    requested = true;
    await held;
    await route.fulfill(response);
  });
  return { release, requested: () => requested };
}

async function seed(page, info) {
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(({ role, question }) => {
    localStorage.setItem('cw_rotation_start', '2026-10-12');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'today', viewWeek: 1 }));
    localStorage.setItem('cw_capture_v1', JSON.stringify({ v: 1, items: [
      { id: 'dialog-focus-question', text: question, state: 'open', at: '2026-10-12T12:00:00Z' },
    ] }));
  }, { role: isResidentProject(info.project.name) ? 'pgy1' : 'student', question: QUESTION });
}

async function ledger(page, ref, pending) {
  const response = await page.request.get('/governance.json');
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.items[ref], 'fixture row must exist').toBeTruthy();
  data.items[ref] = { ...data.items[ref], status: pending ? 'pending' : 'reviewed', riskLevel: pending ? 'high' : 'low' };
  return data;
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function openReading(page) {
  await page.goto('/?tab=today', { waitUntil: 'domcontentloaded' });
  await page.locator('.fd-searchbtn:visible').click();
  await page.getByRole('textbox', { name: 'Search resources', exact: true }).fill('mood');
  await page.locator(`.fd-search [data-fd-open="${READING}"]`).click();
}

async function openDialog(page, scenario) {
  if (scenario.id === 'search') {
    await page.locator('.fd-searchbtn:visible').click();
    await page.getByRole('textbox', { name: 'Search resources', exact: true }).fill('Ativan alcohol-withdrawal');
  } else if (scenario.id === 'settings') {
    await page.locator('[data-fd-settings]:visible').click();
  } else if (scenario.id === 'safety kit' || scenario.ref) {
    await page.locator('.fd-safetybtn:visible').click();
    if (scenario.ref) await page.locator(`.fd-sheet [data-fd-safety="${scenario.ref}"]`).click();
  } else if (scenario.id === 'retained item preview') {
    // No current authored surface emits the retained preview modifier. Add it to a real
    // search result to cover the renderer without claiming a production entry point.
    await page.locator('.fd-searchbtn:visible').click();
    await page.getByRole('textbox', { name: 'Search resources', exact: true }).fill('med_monitoring.md');
    const preview = page.locator('.fd-search [data-fd-open="med_monitoring.md"]');
    await preview.evaluate(button => button.setAttribute('data-fd-sheet', ''));
    await preview.click();
  } else {
    await page.locator('.fd-dock [data-capture-open]:visible, .fd-askbtn:visible').click();
    if (scenario.id === 'email review') {
      await page.locator(`${CAPTURE} [data-cap-email-id]`).first().check();
      await page.locator('#capEmailSelect').click();
    } else if (scenario.id === 'patient-details warning') {
      await page.locator('#capText').fill('Synthetic fixture MRN 1234567');
      await page.locator('#capSave').click();
      // The nested alert is an in-dialog interstitial, not a second modal focus trap.
      await page.locator('#capHoldEdit').focus();
    }
  }
  const dialog = page.locator(scenario.selector);
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  return dialog;
}

async function assertKeyboard(page, dialog, scenario, focused) {
  expect(await focused.evaluate(el => el === document.activeElement && el.isConnected), 'late completion preserves the exact active control').toBe(true);
  if (scenario.id === 'patient-details warning') {
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#capText')).toBeFocused();
    await expect(page.locator('#capText')).toHaveValue('Synthetic fixture MRN 1234567');
  } else if (scenario.id === 'search') {
    await expect(dialog.locator('.fd-result').first()).toHaveAttribute('data-fd-safety', 't_sud.md');
    // C2: the first Enter shows the list (focus on the top row); the second opens it.
    await page.keyboard.press('Enter');
    await expect(dialog.locator('.fd-result').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Substance Use', exact: true })).toBeVisible();
  } else {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement)), 'Tab remains inside the dialog').toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await focused.evaluate(el => el === document.activeElement)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== document.getElementById('content')), 'dismissal restores a control rather than replaying deferred page focus').toBe(true);
    if (scenario.id === 'email review') await expect(page.locator(CAPTURE).locator('.cap-email-select').first()).toBeFocused();
  }
}

test.beforeEach(async ({ page }, info) => {
  await seed(page, info);
  await page.route('**/.netlify/scripts/cdp', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
});

for (const width of [320, 1280]) {
  for (const source of ['reading and guide arrival', 'high-risk ledger arrival']) {
    for (const scenario of cases) {
      test(`delayed dialog focus: ${scenario.id} / ${source} / ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const governance = await ledger(page, READING, source === 'high-risk ledger arrival');
        const markdown = '# Study notes\n\n## Mood\n\nA synthetic mood passage for testing navigation.\n\n## Next section\n\nMore study notes.';
        const held = source === 'high-risk ledger arrival'
          ? await holdResponse(page, '**/governance.json', { json: governance })
          : await holdResponse(page, `**/content/${READING}`, { contentType: 'text/markdown', body: markdown });
        if (source === 'high-risk ledger arrival') {
          await page.route(`**/content/${READING}`, route => route.fulfill({ contentType: 'text/markdown', body: markdown }));
        } else await page.route('**/governance.json', route => route.fulfill({ json: governance }));
        try {
          await openReading(page);
          await expect.poll(held.requested).toBe(true);
          if (source === 'high-risk ledger arrival') await expect(page.locator('#routeStatus')).toHaveText('Mood loaded');
          const dialog = await openDialog(page, scenario);
          const focused = await page.evaluateHandle(() => document.activeElement);
          held.release();
          await expect(page.locator('#routeStatus')).toHaveText('Mood loaded');
          if (source === 'high-risk ledger arrival') await expect(page.locator('.governance-notice.pending-high')).toBeVisible();
          else await expect(page.locator('.fd-guide-arrival')).toContainText('1 matching passage');
          await settle(page);
          await assertKeyboard(page, dialog, scenario, focused);
          expect(errors).toEqual([]);
        } finally { held.release(); }
      });
    }
  }

  test(`delayed dialog focus: optional Care Quick Share / directory arrival / ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enablePatientSharing(page);
    const held = await holdResponse(page, '**/care-directory.v1.json', { json: careDirectoryFixture() });
    try {
      await page.goto('/?tab=care', { waitUntil: 'domcontentloaded' });
      await expect.poll(held.requested).toBe(true);
      const opener = page.locator('.fd-careitem [data-fd-care-share="resource-finder"]');
      await opener.click();
      const dialog = page.locator('.fd-care-share');
      const focused = await page.evaluateHandle(() => document.activeElement);
      held.release();
      await expect(page.locator('[data-care-directory]')).not.toContainText('Loading directory');
      await expect.poll(() => page.locator('[data-care-directory] option').count()).toBeGreaterThan(3);
      await settle(page);
      await assertKeyboard(page, dialog, { id: 'Care Quick Share' }, focused);
      await expect(opener).toBeFocused();
    } finally { held.release(); }
  });

  test(`delayed dialog focus: optional clear-packet confirmation / directory arrival / ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enableCarePacket(page);
    await page.addInitScript(() => sessionStorage.setItem('fd_care_packet_v1', JSON.stringify({
      ids: [], why: {}, inserts: {}, mode: 'review', unit: { name: 'Synthetic teaching unit', phone: '', profile: '' },
    })));
    const held = await holdResponse(page, '**/care-directory.v1.json', { json: careDirectoryFixture() });
    try {
      await page.goto('/?tab=care', { waitUntil: 'domcontentloaded' });
      await expect.poll(held.requested).toBe(true);
      const opener = page.locator('[data-fd-care-packet-clear]');
      await opener.click();
      const dialog = page.locator('dialog.fd-care-packet__confirm');
      const keep = dialog.getByRole('button', { name: 'Keep packet', exact: true });
      await expect(keep).toBeFocused();
      held.release();
      await expect.poll(() => page.locator('[data-care-directory] option').count()).toBeGreaterThan(3);
      await settle(page);
      await expect(keep).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Clear packet', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(keep).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('fd_care_packet_v1')).unit.name)).toBe('Synthetic teaching unit');
    } finally { held.release(); }
  });
}

for (const open of [true, false]) {
test(`delayed dialog focus: embedded Communication Practice case browser ${open ? 'open' : 'closed'} / high-risk ledger arrival`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const held = await holdResponse(page, '**/governance.json', { json: await ledger(page, 'communication-practice.html', true) });
  try {
    await page.goto('/?tool=communication-practice.html', { waitUntil: 'domcontentloaded' });
    const frame = page.frameLocator('iframe.toolframe');
    const browse = frame.getByRole('button', { name: 'Browse cases', exact: true });
    await expect(browse).toBeVisible();
    if (open) await browse.click();
    const dialog = frame.getByRole('dialog', { name: 'Browse communication cases' });
    const filter = dialog.getByRole('button', { name: 'All', exact: true });
    if (open) await expect(filter).toBeFocused();
    else await expect(dialog).toBeHidden();
    held.release();
    await expect(page.locator('.governance-notice.pending-high')).toBeVisible();
    await settle(page);
    if (!open) {
      await expect(page.locator('.governance-notice.pending-high'), 'a closed tool dialog must not suppress the normal warning').toBeFocused();
      return;
    }
    expect(await page.evaluate(() => ({ tag: document.activeElement.tagName, className: document.activeElement.className })), 'parent focus remains in the tool frame').toMatchObject({ tag: 'IFRAME' });
    await expect(filter).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(frame.getByRole('button', { name: 'Browse cases', exact: true })).toBeFocused();
  } finally { held.release(); }
});
}
