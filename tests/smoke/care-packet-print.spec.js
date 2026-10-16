// PR C of the Care aftercare packet in a real browser: the preview, the print lifecycle, layout on a Letter sheet, the
// copy, independent unit approval, the wallet card (its own print), and the places the payload can fail. The pure rules
// are in tests/fd-care-packet-*.test.mjs; this file is for what only a layout engine, focus and a print pipeline can show.
//
// Honest limits, said once: Chromium only (every smoke project is Desktop Chrome), so Firefox, Safari and phone printing are
// unproven and are covered only by the human gate G-C. Page counts are RECORDED (with the browser, OS and fonts named),
// because they depend on the machine's fonts; the one count that is pinned is the owner's budget (the default pages with up
// to eight ordinary listings fit five sheets). No screenshot baseline exists here and none may be made before G-C (and then
// only on the Ubuntu runner).
import fs from 'node:fs';
import os from 'node:os';
import { test, expect } from '@playwright/test';
import { careDirectoryFixture, pinCareDirectory } from './care-directory-fixture.js';
import { enableCarePacketHtml, printFeed, PRINT_LISTINGS, UNIT_PROFILE_FIXTURE, pinCareProfileAuthority, PROFILE_AUTHORITY_URL } from './care-packet-fixture.js';
import { enablePatientSharingHtml } from './care-patient-sharing-fixture.js';
import { pdfPageCount } from './pdf-pages.js';
import { probeContrastWithin, probeBoundariesWithin } from './contrast-probe.js';
import { isResidentProject } from './audience.js';

// Titles, crisis names and numbers are read from the data the build ships, never typed here: a renamed page or a changed
// number must fail a test about the page, not pass because the test repeated the old value.
const REPO_ROOT = new URL('../../', import.meta.url);
const readJson = path => JSON.parse(fs.readFileSync(new URL(path, REPO_ROOT), 'utf8'));
const INSERTS = readJson('13_Faculty_Resources/_automation/site_build/data/care-inserts.v1.json');
const GOVERNED = readJson('crisis_resources.json');
// TEST ONLY: fictional candidate profiles. The separate authority fixture must approve an exact matching revision.
const FIXTURE = UNIT_PROFILE_FIXTURE;
const PROFILE = FIXTURE.profile, EXPIRED = FIXTURE.expired;
// An approved fixture candidate without a call-back program or program fields.
const NO_CALLBACK = { ...PROFILE, id: 'fixture-unit-no-callback', label: 'Fixture unit without call-back (test only)',
  callbackProgram: false, callbackTeam: '', callbackPhone: '', callbackHours: '', callbackFallback: '', revision: 'c'.repeat(64) };
const titleOf = id => INSERTS.inserts.find(insert => insert.id === id).title;
const governed = id => GOVERNED.resources.find(resource => resource.id === id);
const contactOf = id => governed(id).contact;
const nameOf = id => governed(id).name;
const defaultOn = id => { const insert = INSERTS.inserts.find(i => i.id === id); return insert.core === true || insert.defaultOn === true; };
// The blocker messages, copied from fd_care_packet_sheet.js (fdCarePacketUnconfirmedMessage and the CALLBACK_UNCONFIRMED
// blocker). A reworded message fails here and is re-read from the source, never guessed.
const MSG = {
  unconfirmed: 'Print and Copy need current owner approval of this exact unit profile. Load the profile to check its approval.',
  noProfiles: 'Print and Copy need an approved unit profile. None is set up yet; you can keep editing this draft.',
  lapsed: 'This unit profile has expired. Print and Copy need a new verification and owner approval.',
  callback: 'The follow-up page needs an approved program and a call arranged for this discharge, with a complete plan and agreed contact preferences. Confirm these or switch the page off.',
};
const KEY = 'fd_care_packet_v1';
const REMINDER = 'Check these resources with the patient before sharing. Do not enter patient-identifying information.';
const PAPER = { width: 816, height: 1056 }; // 8.5in x 11in at 96 dpi
const EDGE = 0.35 * 96; // nothing prints closer to a sheet's edge than this
const CARD = { width: 3.375 * 96, height: 2.125 * 96 }; // ID-1: 324 x 204 CSS px, border included

async function seed(page, info) {
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'));
  await page.addInitScript(role => {
    localStorage.setItem('cw_rotation_start', '2026-10-12');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'care', viewWeek: 1 }));
  }, isResidentProject(info.project.name) ? 'pgy1' : 'student');
}
// Counts calls instead of opening a dialog; real browsers fire beforeprint/afterprint around the real call, a stub does not.
const stubPrint = page => page.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints += 1; }; });
const prints = page => page.evaluate(() => window.__prints);
const afterprint = page => page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

// One route does every job the shell needs here: flip the packet's source flag (served HTML only, never source), offer the
// fixture unit profiles, optionally flip the older patient-sharing flag, and, for the
// fail-closed tests, rewrite the injected payload on its single line.
function rewritePayload(html, mutate) {
  const match = html.match(/var FD_CARE_INSERTS=(.*);\n/);
  expect(match, 'the served shell declares its payload on one line').toBeTruthy();
  const next = mutate(JSON.parse(match[1]));
  return html.replace(match[0], () => 'var FD_CARE_INSERTS=' + JSON.stringify(next) + ';\n');
}
async function routeShell(page, opts = {}) {
  const { mutate, profiles = [PROFILE, EXPIRED], sharing = false } = typeof opts === 'function' ? { mutate: opts } : opts;
  const authority = await pinCareProfileAuthority(page, { profiles });
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    let html = enableCarePacketHtml(await response.text());
    if (sharing) html = enablePatientSharingHtml(html);
    html = rewritePayload(html, p => {
      expect(Array.isArray(p.unitProfiles), 'the served payload has a unitProfiles list to fill').toBe(true);
      p.unitProfiles = profiles.map(profile => ({ ...profile }));
      return mutate ? mutate(p) : p;
    });
    await route.fulfill({ response, body: html });
  });
  return authority;
}
// The payload exactly as the build serves it (no flag flip, no fixture), for numbers a test must not type.
async function servedPayload(page) {
  const html = await (await page.request.get('/')).text();
  const match = html.match(/var FD_CARE_INSERTS=(.*);\n/);
  expect(match, 'the served shell declares its payload on one line').toBeTruthy();
  return JSON.parse(match[1]);
}

const preview = page => page.locator('#fd-care-packet-preview');
const toggle = page => page.locator('[data-fd-care-packet-preview-toggle]');
const unitField = (page, key) => page.locator('#fd-care-packet-unit-' + key);
const printButton = page => page.getByRole('button', { name: 'Print packet' });
const copyButton = page => page.getByRole('button', { name: 'Copy as text' });
const reason = page => page.locator('#fd-care-packet-reason');
const status = page => page.locator('#careDirectoryStatus');
const host = page => page.locator('#fdPacketPrint');
const snapshot = page => page.evaluate(k => JSON.parse(sessionStorage.getItem(k) || 'null'), KEY);
const insertBox = (page, id) => page.locator(`input[data-fd-care-packet-insert="${id}"]`);
const tray = page => page.locator('[data-fd-care-packet-tray]');
const cardButton = page => page.locator('[data-fd-care-packet-card-print]');
const profileSelect = page => page.locator('[data-fd-care-packet-profile-select]');
const loadButton = page => page.locator('[data-fd-care-packet-profile-load]');
const unlinkButton = page => page.locator('[data-fd-care-packet-profile-unlink]');
const profileStatus = page => page.locator('[data-fd-care-packet-profile-status]');
const readback = page => page.locator('[data-fd-care-packet-readback]');
const cleanOf = (page, why) => async () => {
  await expect(host(page), why).toHaveCount(0);
  expect(await page.evaluate(() => document.body.classList.contains('fd-packet-printing') || !!document.getElementById('fdPacketPageRule')), why).toBe(false);
};

// Choose a unit profile the way a trainee does: the native select, then the explicit Load button.
async function loadProfile(page, id) {
  await profileSelect(page).selectOption(id);
  await loadButton(page).click();
  await expect(unitField(page, 'name'), 'a loaded profile makes the unit fields read-only').not.toBeEditable();
  if (id === EXPIRED.id) await expect(status(page), 'Load completes the expired-profile check').toHaveText('Unit approval could not be confirmed. Print and Copy are unavailable; draft editing remains available.');
  else await expect(profileStatus(page), 'Load completes a live authority check').toHaveText(`Loaded: ${id === PROFILE.id ? PROFILE.label : NO_CALLBACK.label}. Approval checked. Expires on ${PROFILE.expiresOn} (America/New_York).`);
}
const callbackConfirm = (page, field) => page.locator(`[data-fd-care-packet-callback="${field}"]`);
async function confirmCallback(page) {
  for (const field of ['arranged', 'plan', 'preferences']) await callbackConfirm(page, field).check();
}
// Both output modes load a candidate and await independent approval. Tests of editing-only typed details pass profile:''.
// General print-review reminders are nonblocking; no confirmation helper is part of this path.
async function build(page, { mode = 'review', profile, name, phone, open = true, count = PRINT_LISTINGS.length, visit = true } = {}) {
  if (profile === undefined) profile = PROFILE.id;
  if (name === undefined) name = profile ? '' : '4 East';
  if (phone === undefined) phone = profile ? '' : '(207) 555-0199';
  if (visit) await page.goto('/?tab=care');
  const panel = page.locator('[data-care-directory]');
  await panel.getByLabel('Resource name or service').fill('southern maine');
  await expect(panel.locator('#fd-care-packet-all-capacity')).toHaveText(`${Math.min(count, 12)} of ${count} new matches will fit.`);
  await panel.getByRole('button', {name:'Add from all results',exact:true}).click();
  if (open) await toggle(page).click();
  if (open && mode === 'final') await page.getByRole('radio', { name: /Final copy/ }).check();
  if (open && profile) await loadProfile(page, profile);
  if (open && name) { await unitField(page, 'name').fill(name); await unitField(page, 'name').press('Tab'); }
  if (open && phone) { await unitField(page, 'phone').fill(phone); await unitField(page, 'phone').press('Tab'); }
  return panel;
}
async function stage(page) {
  await expect(printButton(page)).toBeEnabled();
  await printButton(page).click();
  await expect(host(page)).toHaveCount(1);
}
// What the print engine would see: a listener added AFTER the packet's own (so it runs second) records what is staged.
async function watchStaged(page) {
  await page.evaluate(() => {
    window.__staged = [];
    window.addEventListener('beforeprint', () => {
      const node = document.getElementById('fdPacketPrint');
      window.__staged.push(node ? { notice: !!node.querySelector('.fd-packet-notice'), pages: node.querySelectorAll('.fd-packet-page').length,
        card: node.querySelectorAll('.fd-packet-cardsheet').length } : null);
    });
  });
}
const staged = page => page.evaluate(() => window.__staged);
// The browser, the OS and which faces of the sheet's stacks are installed (a face is present when a canvas measures it
// differently from both generic fallbacks), so a recorded page count names the machine that produced it.
async function environment(page) {
  const fonts = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d'), probe = 'Harbor Counseling Center 207-555-0101 Wellness';
    const width = font => { ctx.font = font; return ctx.measureText(probe).width; };
    return ['Arial', 'Liberation Sans', 'Helvetica', 'Times New Roman', 'Liberation Serif']
      .filter(face => ['monospace', 'serif'].some(fallback => width(`16px '${face}', ${fallback}`) !== width(`16px ${fallback}`)));
  });
  return `Chromium ${page.context().browser().version()} on ${os.platform()} ${os.release()}; installed faces: ${fonts.join(', ') || 'none of the sheet stack'}`;
}

// Layout of a staged print, taken at paper width under print emulation: the only geometry that is the print engine's.
async function layout(page) {
  await page.setViewportSize(PAPER);
  await page.emulateMedia({ media: 'print' });
  return page.evaluate(() => {
    const out = { docWidth: document.documentElement.scrollWidth, pages: [] };
    for (const pg of document.querySelectorAll('#fdPacketPrint .fd-packet-page')) {
      const r = pg.getBoundingClientRect(), body = pg.querySelector('.fd-packet-body'), br = body.getBoundingClientRect();
      const foot = pg.querySelector('.fd-packet-foot').getBoundingClientRect(), band = pg.querySelector('.fd-packet-band');
      const kids = [...body.children], last = kids[kids.length - 1], lastBottom = last ? last.getBoundingClientRect().bottom : br.top;
      out.pages.push({
        label: pg.getAttribute('aria-label'), left: r.left, top: r.top, width: r.width, height: r.height,
        bodyScroll: body.scrollHeight, bodyClient: body.clientHeight, lastBottom, footTop: foot.top, footBottom: foot.bottom,
        bandTop: band.getBoundingClientRect().top, bandFilled: !band.classList.contains('is-empty'), units: kids.length,
        // A margin on a unit root is outside the box the measurer reads, so it would silently use up the slack.
        unitMargins: kids.filter(k => { const s = getComputedStyle(k); return parseFloat(s.marginTop) + parseFloat(s.marginBottom) > 0.5; }).length,
        // The band is ink (rules above and below), never a tint that vanishes on a monochrome printer or without background graphics.
        bandRule: parseFloat(getComputedStyle(band).borderTopWidth),
        // The tick-box column is reserved in Final too, so the two copies lay out alike.
        resIndent: (() => { const res = pg.querySelector('.fd-packet-res'); return res ? res.querySelector('.fd-packet-res__main').getBoundingClientRect().left - res.getBoundingClientRect().left : -1; })(),
        filled: (lastBottom - br.top) / br.height, used: lastBottom - br.top,
        // The first block the NEXT page starts with (a category label and its first listing, or a whole unit): what the packer
        // refused to put here. Heights are the real layout's.
        firstChain: (() => { let sum = 0; for (const k of kids) { sum += k.getBoundingClientRect().height; if (k.matches('[data-fd-packet-res]') || !k.matches('.fd-packet-sechead,.fd-packet-tipwrap,.fd-packet-cat')) break; } return sum; })(),
        // Rules must not touch: the gap between a page title and what follows it, and between the section rule and the next box.
        titleGap: (() => { const gaps = [...pg.querySelectorAll('.fd-packet-ins__title')].map(h => { const next = h.nextElementSibling; return next ? next.getBoundingClientRect().top - h.getBoundingClientRect().bottom : 99; }); return gaps.length ? Math.min(...gaps) : 99; })(),
        secGap: (() => { const gaps = [...pg.querySelectorAll('.fd-packet-sec')].map(h => { const unit = h.closest('.fd-packet-body > *'), next = unit && unit.nextElementSibling; if (!next) return 99; return (next.querySelector('.fd-packet-tip') || next).getBoundingClientRect().top - h.getBoundingClientRect().bottom; }); return gaps.length ? Math.min(...gaps) : 99; })(),
        listings: kids.filter(k => k.matches('[data-fd-packet-res]')).length, hasCrisis: !!pg.querySelector('[data-fd-packet-unit="crisis"]'),
        map: kids.map(k => (k.getAttribute('data-fd-packet-insert') || k.getAttribute('data-fd-packet-unit') || k.tagName.toLowerCase()) + ':' + Math.round(k.getBoundingClientRect().height)).join(' '),
        // The visually hidden text (table captions, "blank line to write in") is a 1px box whose text is wider than it by design.
        overflowX: [...pg.querySelectorAll('*')].filter(el => !el.closest('.fd-packet-vh') && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline').length,
      });
    }
    return out;
  });
}
function expectSound(m, mode) {
  expect(m.pages.length, 'at least a welcome page and a page of resources').toBeGreaterThanOrEqual(2);
  expect(m.docWidth, 'nothing is wider than a sheet').toBeLessThanOrEqual(PAPER.width);
  m.pages.forEach((p, i) => {
    const where = `${mode} ${p.label}`;
    expect(p.label, where).toBe(`Page ${i + 1} of ${m.pages.length}`);
    expect(Math.abs(p.width - PAPER.width), where + ' is exactly paper width').toBeLessThan(1);
    expect(p.left, where + ' starts at the left edge').toBeLessThan(1);
    // min-height:11in, never height: a page that grows is a page that overflowed (and would print as an extra, unnumbered sheet).
    expect(p.height, where + ' is no taller than a sheet').toBeLessThanOrEqual(PAPER.height + 1);
    expect(p.bodyScroll, where + ' clips nothing').toBeLessThanOrEqual(p.bodyClient + 1);
    expect(p.lastBottom, where + ': content ends above the footer').toBeLessThanOrEqual(p.footTop + 0.5);
    expect(p.footBottom, where + ': footer inside the sheet').toBeLessThanOrEqual(p.top + p.height + 0.5);
    expect(p.top + p.height - p.footBottom, where + ': footer clear of the unprintable edge').toBeGreaterThanOrEqual(EDGE - 0.5);
    expect(p.unitMargins, where + ': no unit root carries an outer margin').toBe(0);
    expect(p.titleGap, where + ': a page title does not sit on the text under it').toBeGreaterThanOrEqual(6);
    expect(p.secGap, where + ': the section rule does not touch the box under it').toBeGreaterThanOrEqual(6);
    expect(p.bandTop - p.top, where + ': band clear of the unprintable edge').toBeGreaterThanOrEqual(EDGE - 0.5);
    expect(p.bandFilled, where + ': band only in Review').toBe(mode === 'review');
    if (p.bandFilled) expect(p.bandRule, where + ': the band is ruled in ink, not tinted').toBeGreaterThanOrEqual(2);
    if (p.resIndent >= 0) expect(p.resIndent, where + ': the tick-box column is there in both copies').toBeGreaterThanOrEqual(20);
    expect(p.overflowX, where + ': no element is wider than its box').toBe(0);
  });
  expect(m.pages[0].hasCrisis, 'the crisis lines are on page 1').toBe(true);
  expect(m.pages.slice(1).some(p => p.hasCrisis), 'and only there').toBe(false);
}

test.describe('preview, print and copy', () => {
  let errors;
  test.beforeEach(async ({ page }, info) => {
    errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await seed(page, info);
    await stubPrint(page);
    await routeShell(page);
    await pinCareDirectory(page, printFeed(careDirectoryFixture()));
  });
  test.afterEach(() => { expect(errors, 'no uncaught page error').toEqual([]); });

  // ---- layout and pagination, both copies (a Final copy with the confirmed fixture profile loaded) ---------------------------------
  for (const mode of ['review', 'final']) {
    test(`${mode} copy: every sheet is exactly paper width, clips nothing, keeps the crisis lines on page 1, and the PDF has one page per sheet`, async ({ page }) => {
      await build(page, { mode });
      await stage(page);
      const m = await layout(page);
      expectSound(m, mode);
      test.info().annotations.push({ type: `${mode} pages`, description: `${m.pages.length}; fill ${m.pages.map(p => Math.round(p.filled * 100) + '%').join(' ')}` });
      console.log(`MEASURED ${mode}: ${m.pages.length} pages; fill ${m.pages.map(p => Math.round(p.filled * 100) + '%').join(' ')}\n` + m.pages.map((p, i) => `  p${i + 1} (cap ${Math.round(p.bodyClient)}): ${p.map}`).join('\n'));
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      expect(pdfPageCount(pdf), 'one PDF page per sheet: nothing spilled, no blank trailing sheet').toBe(m.pages.length);
    });
  }

  // ---- the disclosure ----------------------------------------------------------------------------------------------------------
  test('Preview and print is a disclosure: it names a region that always exists, opens in place, and Escape closes it and returns focus', async ({ page }) => {
    await page.goto('/?tab=care');
    await expect(toggle(page)).toHaveCount(0);
    await page.locator('[data-care-directory]').getByLabel('Resource name or service').fill('southern maine');
    await page.locator('[data-care-directory]').getByRole('button', { name: /^Add from all results/ }).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toHaveAttribute('aria-controls', 'fd-care-packet-preview');
    await expect(preview(page), 'the controlled region exists while collapsed, so aria-controls never dangles').toBeHidden();
    await expect(preview(page)).toHaveCount(1);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(preview(page)).toBeVisible();
    await expect(page.locator('[role="dialog"],[aria-modal="true"]'), 'a disclosure, never a modal').toHaveCount(0);
    await expect(status(page)).toContainText('Preview open.');
    await unitField(page, 'name').focus();
    await page.keyboard.press('Escape');
    await expect(preview(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(status(page)).toContainText('Preview closed.');
  });

  // ---- draft typing: the controls are patched, not replaced ---------------
  test('typing the ward\'s name keeps focus and the caret on every keystroke, saves on leaving the field, and writes nothing to the announcer', async ({ page }) => {
    await build(page, { profile: '', name: '', phone: '' });
    const name = unitField(page, 'name');
    await expect(status(page), 'opening is announced (after a short delay)').toContainText('Preview open.');
    await name.focus();
    await status(page).evaluate(el => { el.textContent = ''; });
    const word = '4 East';
    for (let i = 1; i <= word.length; i++) {
      await page.keyboard.type(word[i - 1]);
      const at = await page.evaluate(() => ({ id: document.activeElement.id, caret: document.activeElement.selectionStart, length: document.activeElement.value.length }));
      expect(at, `after ${i} character(s) the field is still active with the caret at the end`).toEqual({ id: 'fd-care-packet-unit-name', caret: i, length: i });
    }
    expect((await snapshot(page)).unit.name, 'nothing is saved while typing').toBe('');
    await expect(name, 'typing remains visible in the editor').toHaveValue('4 East');
    await expect(page.locator('.fd-packet-sheet--screen [data-fd-packet-draft]')).toHaveText('Draft for editing. Unit contact approval is required before this packet can be printed or copied.');
    await expect(page.locator('.fd-packet-sheet--screen .fd-packet-org'), 'unapproved unit details stay off the patient sheet').toHaveCount(0);
    await expect(status(page)).toHaveText('');
    await page.keyboard.press('Tab');
    await expect(unitField(page, 'phone'), 'Tab moves on: a change event must not pull focus back to the field it fired from').toBeFocused();
    expect((await snapshot(page)).unit.name).toBe('4 East');
  });

  test('an approved packet prints without general review checkboxes; Final Copy is available and Review Copy remains unavailable', async ({ page }) => {
    await build(page, { mode: 'final' });
    await expect(tray(page).getByText(REMINDER, { exact: true })).toBeVisible();
    await expect(page.locator('[data-fd-care-packet-gate]')).toHaveCount(0);
    await expect(printButton(page)).toBeEnabled();
    await expect(copyButton(page)).toBeEnabled();
    await expect(reason(page)).toContainText('Print and Copy are available.');
    await stage(page);
    expect(await prints(page)).toBe(1);
    await afterprint(page);
    await page.getByRole('radio', { name: /Review copy/ }).check();
    await expect(printButton(page)).toBeEnabled();
    await expect(copyButton(page)).toBeDisabled();
    await stage(page);
    expect(await prints(page)).toBe(2);
  });

  test('reloading an approved profile or changing a standard page preserves focus and needs no repeat review confirmations', async ({ page }) => {
    await build(page, { mode: 'final' });
    await loadButton(page).click();
    await expect(printButton(page)).toBeEnabled();
    await expect(copyButton(page)).toBeEnabled();
    await expect(printButton(page)).toHaveAttribute('aria-describedby', 'fd-care-packet-reason');
    await expect(loadButton(page), 'focus stays on the button that was pressed').toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body), 'focus is somewhere real').toBe(false);
    const safety = insertBox(page, 'safety');
    await safety.check();
    await expect(safety).toBeFocused();
    await expect(printButton(page)).toBeEnabled();
    await safety.uncheck();
    await expect(safety).toBeFocused();
    await expect(printButton(page)).toBeEnabled();
    await expect(copyButton(page)).toBeEnabled();
    await expect(page.locator('[data-fd-care-packet-gate]')).toHaveCount(0);
    await expect(status(page)).not.toContainText(/Review complete|Review confirmations cleared/);
  });

  test('a typed unit phone stays editable and is read back as an unapproved candidate; committing it cannot release Print or Copy', async ({ page }) => {
    await build(page, { profile: '' });
    await unitField(page, 'phone').fill('(207) 555-0177');
    await expect(unitField(page, 'phone')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(unitField(page, 'name'), 'committing must preserve backward keyboard navigation').toBeFocused();
    await expect(printButton(page)).toBeDisabled();
    await expect(copyButton(page)).toBeDisabled();
    await expect(reason(page)).toHaveText(MSG.unconfirmed);
    await expect(status(page)).toContainText('Unit phone saved. Candidate phone: (207) 555-0177. It cannot be printed or copied until approved.');
    await expect(readback(page)).toHaveText('Candidate phone: (207) 555-0177. It cannot be printed or copied until approved.');
  });

  // Replaces "the one-sided hint follows the wallet-card page": the card left the packet.
  test('the packet carries no wallet-card page, even with every page switched on, and its print hint says nothing about a card or one-sided printing', async ({ page }) => {
    await build(page, { mode: 'final' });
    const offered = await page.locator('[data-fd-care-packet-insert]').evaluateAll(boxes => boxes.map(b => b.getAttribute('data-fd-care-packet-insert')));
    expect(offered, 'the page switches are the standard pages and nothing else').toEqual(INSERTS.inserts.filter(i => !i.core).map(i => i.id));
    await expect(page.getByRole('checkbox', { name: INSERTS.card.title })).toHaveCount(0);
    for (const id of offered) await insertBox(page, id).check();
    await confirmCallback(page);
    await expect(page.locator('[data-fd-care-packet-hint]')).not.toHaveText(/wallet|card|one-sided|double-sided|duplex/i);
    await expect(page.locator('.fd-packet-sheet--screen [data-fd-packet-card], .fd-packet-sheet--screen .fd-packet-cardsheet')).toHaveCount(0);
    await stage(page);
    expect(await host(page).locator('[data-fd-packet-card], .fd-packet-cardsheet').count(), 'no card in the packet print').toBe(0);
    expect(await host(page).locator('.fd-packet-page').count()).toBeGreaterThanOrEqual(2);
    const text = await host(page).textContent();
    expect(text).not.toContain(INSERTS.card.body);
    expect(text).not.toContain(INSERTS.card.mineTitle);
  });

  test('Ctrl+P while a ward field is being typed or after saving draft details prints only the notice; loading approval and pressing Print releases the packet', async ({ page }) => {
    await build(page, { profile: '' });
    await watchStaged(page);
    await unitField(page, 'name').fill('Bed 4');
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'uncommitted typing: one notice sheet').toBe(1);
    expect((await staged(page))[0]).toEqual({ notice: true, pages: 0, card: 0 });
    await expect(host(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'saved draft: still only the notice').toBe(1);
    expect((await staged(page))[1]).toEqual({ notice: true, pages: 0, card: 0 });
    await loadProfile(page, PROFILE.id);
    const shown = await page.locator('.fd-packet-sheet--screen .fd-packet-page').count();
    await stage(page);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'the button grants one freshly checked print').toBe(shown);
    expect((await staged(page))[2]).toEqual({ notice: false, pages: shown, card: 0 });
  });

  test('the preview lists the web address behind each QR code outside the sheet, and the sheet itself prints only the domain', async ({ page }) => {
    await build(page, { mode: 'final' });
    const details = page.locator('.fd-care-packet-preview__addresses');
    await expect(details).toHaveCount(1);
    await details.locator('summary').click();
    await expect(details).toContainText('https://example.org/resources/1');
    expect(await page.locator('.fd-packet-sheet--screen').innerText()).not.toContain('/resources/1');
  });

  test('a directory copy more than a week old is flagged in the preview and nowhere on the paper', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
    await build(page, { mode: 'final' });
    await expect(page.locator('[data-fd-care-packet-stale]')).toContainText('39 days ago');
    await stage(page);
    expect(await host(page).innerText()).not.toMatch(/days ago/);
  });

  test('a layout the measurer cannot see (margins between units) is caught by the check after layout, and nothing prints', async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.fd-packet-body>*+*{margin-top:40px}';
        document.head.appendChild(style);
      });
    });
    await build(page, { mode: 'final' });
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toContainText('does not fit its sheet');
    await printButton(page).evaluate(b => { b.disabled = false; });
    await printButton(page).click();
    expect(await prints(page)).toBe(0);
    await expect(host(page)).toHaveCount(0);
  });

  // Typing remains available in an unapproved draft; it cannot authorize output.
  test('in a Review copy, clicking Preview and print after typing commits the field and closes the preview without losing the click', async ({ page }) => {
    await build(page, { profile: '' });
    await unitField(page, 'name').fill('4 West');
    await toggle(page).click();
    await expect(preview(page), 'the click was not lost to a repaint').toBeHidden();
    await expect(toggle(page)).toBeFocused();
    expect((await snapshot(page)).unit.name, 'the typed value was committed first').toBe('4 West');
  });

  // ---- the staged print: one atomic set, removed together, never by a timer ----------------------------------------------------------
  test('Print stages one body-level container, a page rule, a title and a body marker, and afterprint removes all four and returns focus to Print', async ({ page }) => {
    await build(page, { mode: 'final' });
    const title = await page.title();
    await stage(page);
    expect(await prints(page), 'window.print was called once').toBe(1);
    const stagedNow = await page.evaluate(() => ({
      parent: document.getElementById('fdPacketPrint').parentElement.tagName, marked: document.body.classList.contains('fd-packet-printing'),
      rule: document.getElementById('fdPacketPageRule') && document.getElementById('fdPacketPageRule').textContent, title: document.title,
      hiddenOnScreen: getComputedStyle(document.getElementById('fdPacketPrint')).display,
    }));
    expect(stagedNow.parent).toBe('BODY');
    expect(stagedNow.marked).toBe(true);
    expect(stagedNow.rule.replace(/\s/g, '')).toBe('@page{size:Letter;margin:0}');
    expect(stagedNow.title).toBe('Your aftercare resources');
    expect(stagedNow.hiddenOnScreen, 'display:none on screen, so a leftover can never hide the app').toBe('none');
    await expect(page.locator('#content'), 'the app itself is still visible on screen').toBeVisible();
    // No timer removes it: a print engine that returns early (iOS Safari) still needs the container for its snapshot.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.waitForTimeout(500);
    await expect(host(page)).toHaveCount(1);
    await afterprint(page);
    await expect(host(page)).toHaveCount(0);
    expect(await page.evaluate(() => ({ marked: document.body.classList.contains('fd-packet-printing'), rule: !!document.getElementById('fdPacketPageRule'), title: document.title })))
      .toEqual({ marked: false, rule: false, title });
    await expect(printButton(page)).toBeFocused();
  });

  test('a staged print is removed by anything that changes the packet, and by leaving Care (never left to go stale)', async ({ page }) => {
    await build(page, { mode: 'final' });
    await stage(page);
    await page.getByRole('checkbox', { name: titleOf('warning') }).uncheck();
    await cleanOf(page, 'switching a page off')();
    await stage(page);
    await page.getByRole('radio', { name: /Review copy/ }).check();
    await cleanOf(page, 'changing the copy')();
    await stage(page);
    await page.locator('[data-fd-care-packet-remove]').first().click();
    await cleanOf(page, 'removing a listing')();
    await stage(page);
    await page.locator('[data-fd-tab="library"]:visible').click();
    await cleanOf(page, 'leaving Care')();
  });

  // ---- Ctrl+P ----------------------------------------------------------------------------------------------------------------
  test('Ctrl+P with the preview open prints only the notice even when approved Print is available', async ({ page }) => {
    await build(page, { mode: 'final' });
    const shown = await page.locator('.fd-packet-sheet--screen .fd-packet-page').count();
    expect(shown).toBeGreaterThanOrEqual(2);
    // page.pdf() raises beforeprint and afterprint around itself, exactly as a menu or keyboard print does.
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'approved packet: native printing still has no one-shot output permission').toBe(1);
    await expect(host(page), 'afterprint removed it').toHaveCount(0);
    await expect(printButton(page)).toBeEnabled();
    await toggle(page).click();
    await expect(preview(page)).toBeHidden();
    await page.pdf({ preferCSSPageSize: true });
    await expect(host(page), 'preview closed: nothing is staged, the ordinary page prints').toHaveCount(0);
    expect(await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeprint'));
      const s = !!document.getElementById('fdPacketPrint');
      window.dispatchEvent(new Event('afterprint'));
      return s;
    }), 'beforeprint with the preview closed stages nothing').toBe(false);
  });

  // The older resource pack (patient sharing) has its own Print on the same Care page: its print must stay the ordinary page.
  test('the older pack\'s own Print never prints the packet: beforeprint with focus on that button, or anywhere outside the packet, stages nothing, while the same event with focus in the packet stages only its notice', async ({ page }) => {
    await routeShell(page, { sharing: true });
    await page.goto('/?tab=care');
    const pack = page.locator('.fd-care-pack');
    await pack.locator('[data-fd-care-pack]').first().click();
    const packPrint = pack.locator('[data-fd-care-pack-print]');
    await expect(packPrint, 'the older pack can print').toBeEnabled();
    await build(page, { mode: 'final', visit: false });
    await expect(preview(page)).toBeVisible();
    const beforeprint = () => page.evaluate(() => {
      window.dispatchEvent(new Event('beforeprint'));
      const node = document.getElementById('fdPacketPrint');
      const out = node ? { pages: node.querySelectorAll('.fd-packet-page').length, notice: !!node.querySelector('.fd-packet-notice') } : null;
      window.dispatchEvent(new Event('afterprint'));
      return out;
    });
    await packPrint.focus();
    expect(await beforeprint(), 'focus on the older pack\'s Print: nothing is staged, the ordinary page prints').toBeNull();
    await page.locator('#fd-care-directory-query').focus();
    expect(await beforeprint(), 'focus in the search box, outside the packet: nothing is staged').toBeNull();
    const shown = await page.locator('.fd-packet-sheet--screen .fd-packet-page').count();
    await printButton(page).focus();
    expect(await beforeprint(), 'focus in the packet preview: no one-shot Print permission').toEqual({ pages: 0, notice: true });
    await toggle(page).focus();
    expect(await beforeprint(), 'focus in the packet tray is in the packet too').toEqual({ pages: 0, notice: true });
    await expect(host(page)).toHaveCount(0);
    // And the older pack's own button still prints through its own path, staging nothing of the packet.
    await packPrint.click();
    expect(await prints(page), 'the older pack called window.print').toBe(1);
    await expect(host(page)).toHaveCount(0);
  });

  test('a sheet that is handed too much grows rather than clips, so an overflow is an extra sheet in the PDF and never lost text', async ({ page }) => {
    await build(page, { mode: 'final' });
    await stage(page);
    await page.setViewportSize(PAPER);
    await page.emulateMedia({ media: 'print' });
    const before = await page.locator('#fdPacketPrint .fd-packet-page').count();
    const grown = await page.evaluate(() => {
      const body = document.querySelector('#fdPacketPrint .fd-packet-page .fd-packet-body');
      const filler = document.createElement('div');
      filler.style.height = '1500px';
      body.appendChild(filler);
      return { height: body.closest('.fd-packet-page').getBoundingClientRect().height, scroll: body.scrollHeight, client: body.clientHeight };
    });
    expect(grown.height, 'the page grew past a sheet').toBeGreaterThan(PAPER.height + 1000);
    expect(grown.scroll, 'and nothing on it is clipped').toBeLessThanOrEqual(grown.client + 1);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'the extra height becomes extra sheets, which a parity check sees').toBeGreaterThan(before);
  });

  test('the inline preview never prints, so Ctrl+P cannot bypass the packet Print action', async ({ page }) => {
    await build(page, { mode: 'final' });
    await page.emulateMedia({ media: 'print' });
    // A child of a display:none parent keeps its own computed display, so ask whether anything is actually RENDERED.
    const shown = await page.evaluate(() => [...document.querySelectorAll('.fd-care-search__preview, .fd-care-search__preview *')].filter(el => el.getClientRects().length > 0).length);
    expect(shown, 'no node of the inline preview has a box in print').toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.fd-care-search__preview')).display)).toBe('none');
  });

  test('a second Print click while one is staged is ignored, and a print that throws leaves nothing behind', async ({ page }) => {
    await build(page, { mode: 'final' });
    await stage(page);
    await printButton(page).click();
    expect(await prints(page), 'the second click did not print again').toBe(1);
    await afterprint(page);
    await page.evaluate(() => { window.print = () => { throw new Error('no printer'); }; });
    await printButton(page).click();
    await cleanOf(page, 'a failed print')();
    await expect(page.locator('#content')).toBeVisible();
  });

  // ---- what blocks Print, and why it says so -----------------------------------------------------------------------------------------
  test('both copies keep unapproved typed details as an editable draft and refuse patient printing with or without a phone', async ({ page }) => {
    await build(page, { mode: 'final', profile: '', name: '4 East', phone: '' });
    for (const mode of ['final', 'review']) {
      await page.getByRole('radio', { name: mode === 'final' ? /Final copy/ : /Review copy/ }).check();
      for (const phone of ['', '(207) 555-0199']) {
        await unitField(page, 'phone').fill(phone);
        await unitField(page, 'phone').press('Tab');
        await expect(printButton(page)).toBeDisabled();
        await expect(copyButton(page)).toBeDisabled();
        await expect(reason(page)).toHaveText(MSG.unconfirmed);
        await expect(unitField(page, 'phone')).toBeEditable();
        await expect(unitField(page, 'phone')).toHaveValue(phone);
        await expect(preview(page)).toBeVisible();
        await expect(host(page)).toHaveCount(0);
      }
    }
    expect(await prints(page)).toBe(0);
  });

  test('a dose or a verification note in a listing\'s description is left off the paper, and the preview says what was left off', async ({ page }) => {
    const feed = printFeed(careDirectoryFixture());
    feed.records[0].description = 'Walk in daily. Take 10 mg at night.';
    feed.records[1].area = 'Southern Maine (verify availability)'; // still matches the search the helper types
    await pinCareDirectory(page, feed);
    await build(page, { mode: 'final' });
    await expect(page.locator('.fd-care-packet-preview__withheld')).toContainText('the description of “Harbor Counseling Center”');
    await expect(page.locator('.fd-care-packet-preview__withheld')).toContainText('the area of “Casco Bay Outpatient Care”');
    await stage(page);
    const text = await host(page).innerText();
    expect(text).not.toMatch(/10 mg|verify|verification/i);
    expect(text, 'the listing itself still prints').toContain('Harbor Counseling Center');
  });

  // Rewritten: the chooser no longer offers a listing with a crisis number (see care-packet.spec.js), so this is a SAVED listing
  // whose feed entry gained one. The number comes from the served payload's crisisNumbers, never typed here.
  test('a saved listing that now lists a crisis number blocks printing, names the listing, and removing it unblocks', async ({ page }) => {
    const payload = await servedPayload(page);
    const ten = payload.crisisNumbers.find(n => /^\d{10}$/.test(n));
    expect(ten, 'the payload ships a ten-digit registered crisis number').toBeTruthy();
    const feed = printFeed(careDirectoryFixture());
    feed.records[2].phone = `${feed.records[2].phone} | Crisis Line: ${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
    await pinCareDirectory(page, feed);
    await page.addInitScript(([k, ids, profile]) => {
      if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, JSON.stringify({ ids, why: {}, inserts: {}, mode: 'final', unit: { name: '', phone: '', profile } }));
    }, [KEY, feed.records.map(r => r.id), PROFILE.id]);
    await page.goto('/?tab=care');
    await expect(tray(page).locator('[data-fd-care-packet-item="r-2"] [data-fd-care-packet-ineligible="CRISIS_NUMBER"]'), 'the tray names the problem on the listing').toHaveCount(1);
    await toggle(page).click();
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page), 'the listing-specific correction is shown').toContainText('Southern Maine Wellness Clinic');
    await expect(reason(page)).toContainText('crisis line number');
    await loadProfile(page, PROFILE.id);
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toContainText('Southern Maine Wellness Clinic');
    await page.locator('[data-fd-care-packet-remove="r-2"]').click();
    await expect(printButton(page), 'the corrected packet can print without repeat confirmations').toBeEnabled();
  });

  test('a directory that failed to load part of itself blocks printing instead of printing fewer listings', async ({ page }) => {
    const feed = printFeed(careDirectoryFixture());
    feed.categories.find(c => c.id === 'peer_support').available = false;
    await pinCareDirectory(page, feed);
    await page.addInitScript(k => {
      if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, JSON.stringify({ ids: ['r-0', 'r-3'], why: {}, inserts: {}, mode: 'review', unit: { name: '', phone: '' } }));
    }, KEY);
    await page.goto('/?tab=care');
    await toggle(page).click();
    await loadProfile(page, PROFILE.id);
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toContainText('hidden while the directory is incomplete');
  });

  // ---- the unit: a confirmed profile, or typed details that are never confirmed ------------------------------------------------------
  test('typed unit details cannot authorize Print or Copy, even when a disabled control is forced on', async ({ page }) => {
    await page.addInitScript(() => {
      window.__copies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.__copies.push(text); return Promise.resolve(); } } });
    });
    await build(page, { mode: 'final', profile: '', name: '4 East', phone: '(207) 555-0199' });
    await expect(reason(page), 'independent unit approval still blocks output').toHaveText(MSG.unconfirmed);
    await expect(readback(page)).toHaveText('Candidate phone: (207) 555-0199. It cannot be printed or copied until approved.');
    await expect(profileStatus(page)).toHaveText('Using the details you typed. They are not a confirmed profile.');
    await expect(page.locator('[data-fd-care-packet-modenote]')).toHaveText('Both copies need current owner approval of the unit profile before Print or Copy. Draft editing remains available.');
    for (const button of [printButton(page), copyButton(page)]) {
      await expect(button).toBeDisabled();
      await button.evaluate(b => { b.disabled = false; });
      await button.click();
      await expect(button).toBeDisabled();
    }
    expect(await prints(page)).toBe(0);
    expect(await page.evaluate(() => window.__copies)).toEqual([]);
    await expect(host(page)).toHaveCount(0);
    await expect(page.locator('#fd-care-packet-copy-text')).toHaveCount(0);
    await watchStaged(page);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'native print gets the notice').toBe(1);
    expect((await staged(page))[0]).toEqual({ notice: true, pages: 0, card: 0 });
  });

  test('with an explicitly empty unit-profile payload, the preview says none is set up and both copies refuse output', async ({ page }) => {
    await routeShell(page, { profiles: [] });
    await build(page, { mode: 'final', profile: '', name: '', phone: '' });
    await expect(page.locator('[data-fd-care-packet-profile-none]')).toBeVisible();
    await expect(profileSelect(page)).toHaveCount(0);
    await expect(loadButton(page)).toHaveCount(0);
    await expect(unlinkButton(page)).toBeHidden();
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toHaveText(MSG.noProfiles);
    await page.getByRole('radio', { name: /Review copy/ }).check();
    await expect(printButton(page), 'the same approval policy applies to Review').toBeDisabled();
    await expect(copyButton(page)).toBeDisabled();
    await expect(reason(page)).toHaveText(MSG.noProfiles);
  });

  test('the confirmed fixture profile prints a Final copy under its approved org; its lapsed twin is refused with the lapse reason, and loading the current one again restores Print', async ({ page }) => {
    await build(page, { mode: 'final' });
    await expect(readback(page)).toHaveText(`Approved unit contact: ${PROFILE.unitPhone}.`);
    await stage(page);
    expect(await prints(page)).toBe(1);
    expect(await host(page).locator('.fd-packet-org').first().textContent(), 'the org prints only from a profile with approved branding').toBe(`${PROFILE.org} · ${PROFILE.unitName}`);
    expect(await host(page).textContent()).toContain(PROFILE.unitPhone);
    await afterprint(page);
    await loadProfile(page, EXPIRED.id);
    await expect(profileStatus(page)).toHaveText(`This profile expired on ${EXPIRED.expiresOn} (America/New_York). A new verification and owner approval are required.`);
    await expect(readback(page)).toHaveText(`Candidate phone: ${EXPIRED.unitPhone}. It cannot be printed or copied until approved.`);
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page), 'the expiry reason is shown').toHaveText(MSG.lapsed);
    await printButton(page).evaluate(b => { b.disabled = false; });
    await printButton(page).click();
    expect(await prints(page), 'a lapsed confirmation never reaches the printer').toBe(1);
    await expect(host(page)).toHaveCount(0);
    await loadProfile(page, PROFILE.id);
    await expect(printButton(page)).toBeEnabled();
  });

  test('the call-back page needs an approved program and all discharge confirmations: typing and a profile without a program cannot authorize it', async ({ page }) => {
    await routeShell(page, { profiles: [PROFILE, NO_CALLBACK] });
    await build(page, { mode: 'final', profile: '', name: '4 East', phone: '(207) 555-0199' });
    await insertBox(page, 'callback').check();
    await expect(reason(page), 'an unconfirmed unit is named first').toHaveText(MSG.unconfirmed);
    await loadProfile(page, NO_CALLBACK.id);
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toHaveText(MSG.callback);
    await expect(copyButton(page), 'Copy follows the same packet approval gate').toBeDisabled();
    await insertBox(page, 'callback').uncheck();
    await expect(printButton(page), 'switching the page off is the other way out').toBeEnabled();
    await insertBox(page, 'callback').check();
    await loadProfile(page, PROFILE.id);
    await expect(reason(page), 'program approval alone cannot promise a call for this discharge').toHaveText(MSG.callback);
    await confirmCallback(page);
    await stage(page);
    expect(await host(page).locator('[data-fd-packet-insert="callback"]').count(), 'the call-back page is in the print').toBeGreaterThan(0);
  });

  test('the unit profile is a native select loaded only by its button: choosing does nothing, Load makes the fields read-only (dashed) with a status and read-back, and "Use my own details instead" empties them and moves focus to the name field', async ({ page }) => {
    await build(page, { profile: '', name: '4 West', phone: '(207) 555-0177' });
    await expect(page.getByLabel('Unit profile', { exact: true })).toHaveCount(1);
    expect(await profileSelect(page).evaluate(el => el.tagName)).toBe('SELECT');
    expect(await profileSelect(page).locator('option').allTextContents()).toEqual(['Choose a profile…', PROFILE.label, EXPIRED.label]);
    await expect(unlinkButton(page), 'nothing to unlink before a profile is loaded').toBeHidden();
    await profileSelect(page).selectOption(PROFILE.id);
    await page.waitForTimeout(400);
    expect((await snapshot(page)).unit, 'choosing in the select loads nothing').toEqual({ name: '4 West', phone: '(207) 555-0177', profile: '' });
    await expect(unitField(page, 'name')).toBeEditable();
    await expect(unitField(page, 'name')).toHaveValue('4 West');
    await expect(profileStatus(page)).toHaveText('Using the details you typed. They are not a confirmed profile.');
    await loadButton(page).click();
    for (const key of ['name', 'phone']) {
      await expect(unitField(page, key)).not.toBeEditable();
      expect(await unitField(page, key).evaluate(el => getComputedStyle(el).borderTopStyle), `${key}: a read-only field is drawn dashed`).toBe('dashed');
    }
    await expect(unitField(page, 'name')).toHaveValue(PROFILE.unitName);
    await expect(unitField(page, 'phone')).toHaveValue(PROFILE.unitPhone);
    await expect(profileStatus(page)).toHaveText(`Loaded: ${PROFILE.label}. Approval checked. Expires on ${PROFILE.expiresOn} (America/New_York).`);
    await expect(readback(page)).toHaveText(`Approved unit contact: ${PROFILE.unitPhone}.`);
    await expect(status(page)).toContainText(`Loaded unit profile ${PROFILE.label}.`);
    await expect(loadButton(page), 'focus stays on Load').toBeFocused();
    expect((await snapshot(page)).unit, 'the typed details are dropped: the profile is the only source').toEqual({ name: '', phone: '', profile: PROFILE.id });
    await expect(page.locator('.fd-packet-sheet--screen .fd-packet-org').first()).toHaveText(`${PROFILE.org} · ${PROFILE.unitName}`);
    await expect(unlinkButton(page)).toBeVisible();
    for (const target of [profileSelect(page), loadButton(page), unlinkButton(page), cardButton(page)]) {
      const box = await target.boundingBox();
      expect(box.height, await target.evaluate(n => n.outerHTML.slice(0, 80))).toBeGreaterThanOrEqual(44);
    }
    await unlinkButton(page).click();
    await expect(unitField(page, 'name'), 'focus goes to the name field').toBeFocused();
    for (const key of ['name', 'phone']) {
      await expect(unitField(page, key)).toBeEditable();
      await expect(unitField(page, key), 'typed details start empty: nothing confirmed is carried over, and the old typing is gone').toHaveValue('');
    }
    await expect(unlinkButton(page)).toBeHidden();
    await expect(profileStatus(page)).toHaveText('');
    expect((await snapshot(page)).unit).toEqual({ name: '', phone: '', profile: '' });
    await expect(status(page)).toContainText('Unit profile removed. Type your own unit details.');
  });

  test('Clear packet is offered with no listings whenever a unit profile, typed unit details, a Final copy or a page switch is saved, and it clears that', async ({ page }) => {
    await page.goto('/?tab=care');
    await expect(tray(page).getByRole('button', { name: 'Clear packet' }), 'nothing saved, nothing to clear').toBeDisabled();
    const cases = [
      ['a loaded unit profile', { unit: { name: '', phone: '', profile: PROFILE.id } }, 'Packet cleared: unit details removed.'],
      ['a typed unit name', { unit: { name: '4 East', phone: '', profile: '' } }, 'Packet cleared: unit details removed.'],
      ['a Final copy', { mode: 'final' }, 'Packet cleared: copy and page choices removed.'],
      ['a page switch', { inserts: { safety: true } }, 'Packet cleared: copy and page choices removed.'],
    ];
    for (const [what, saved, said] of cases) {
      await page.evaluate(([k, s]) => sessionStorage.setItem(k, JSON.stringify({ ids: [], why: {}, inserts: {}, mode: 'review', unit: { name: '', phone: '', profile: '' }, ...s })), [KEY, saved]);
      await page.reload();
      await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('0');
      const clear = tray(page).getByRole('button', { name: 'Clear packet' });
      await expect(clear, `${what}: Clear is offered`).toBeVisible();
      await clear.click();
      await page.getByRole('dialog').getByRole('button',{name:'Clear packet',exact:true}).click();
      expect(await snapshot(page), `${what}: nothing is left`).toBeNull();
      await expect(clear).toBeDisabled();
      await expect(page.getByLabel('Resource name or service'), 'focus returns to search').toBeFocused();
      await expect(status(page)).toContainText(said);
    }
  });

  test('Clear packet with listings, a loaded profile, a Final copy and custom page choices clears all of it, and the profile comes back only when it is chosen and loaded again', async ({ page }) => {
    await build(page, { mode: 'final' });
    await insertBox(page, 'safety').check();
    await tray(page).getByRole('button', { name: 'Clear packet' }).click();
    await page.getByRole('dialog').getByRole('button', {name:'Clear packet',exact:true}).click();
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('0');
    await expect(preview(page)).toBeHidden();
    expect(await snapshot(page)).toBeNull();
    await expect(status(page)).toContainText(`Packet cleared: ${PRINT_LISTINGS.length} listings, unit details, copy and page choices removed.`);
    const panel = page.locator('[data-care-directory]');
    await panel.getByRole('button', { name: /^Add from all results$/ }).click();
    await toggle(page).click();
    await expect(page.getByRole('radio', { name: /Review copy/ })).toBeChecked();
    await expect(insertBox(page, 'safety'), 'page switches are back to their defaults').not.toBeChecked();
    await expect(profileSelect(page)).toHaveValue('');
    for (const key of ['name', 'phone']) { await expect(unitField(page, key)).toBeEditable(); await expect(unitField(page, key)).toHaveValue(''); }
    await expect(profileStatus(page)).toHaveText('');
    await expect(unlinkButton(page)).toBeHidden();
    await loadProfile(page, PROFILE.id);
    await expect(profileStatus(page)).toHaveText(`Loaded: ${PROFILE.label}. Approval checked. Expires on ${PROFILE.expiresOn} (America/New_York).`);
  });

  for (const withdrawn of ['revoked', 'suspended']) {
    for (const [mode, action] of [['review', 'Print'], ['final', 'Print'], ['final', 'Copy']]) {
      test(`${withdrawn} after Load: the next ${mode} ${action} checks authority again and creates no patient output`, async ({ page }) => {
        const authority = await routeShell(page);
        await page.addInitScript(() => {
          window.__copies = [];
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.__copies.push(text); return Promise.resolve(); } } });
        });
        await build(page, { mode });
        const loadedChecks = authority.requests.length;
        expect(loadedChecks, 'loading the candidate consulted its independent authority').toBeGreaterThan(0);
        await expect(printButton(page)).toBeEnabled();
        if (mode === 'final') await expect(copyButton(page)).toBeEnabled();
        else await expect(copyButton(page)).toBeDisabled();
        authority.status = withdrawn;
        await (action === 'Print' ? printButton(page) : copyButton(page)).click();
        await expect(status(page)).toHaveText('Unit approval could not be confirmed. Print and Copy are unavailable; draft editing remains available.');
        expect(authority.requests.length, 'output cannot reuse the approval checked at Load').toBeGreaterThan(loadedChecks);
        expect(authority.requests.at(-1)).toEqual({ profileId: PROFILE.id, revision: PROFILE.revision });
        await expect(printButton(page)).toBeDisabled();
        await expect(copyButton(page)).toBeDisabled();
        await expect(profileStatus(page)).toHaveText(`Loaded: ${PROFILE.label}. Approval has not been confirmed. Expires on ${PROFILE.expiresOn} (America/New_York).`);
        expect(await prints(page)).toBe(0);
        expect(await page.evaluate(() => window.__copies)).toEqual([]);
        await expect(host(page)).toHaveCount(0);
        await expect(page.locator('#fd-care-packet-copy-text')).toHaveCount(0);
        await expect(preview(page), 'withdrawal leaves the editable draft available').toBeVisible();
      });
    }
  }

  test('callback confirmations exist only with that page, stay out of storage, and reset with the packet or a reload', async ({ page }) => {
    await build(page, { mode: 'final' });
    const panel = page.locator('[data-fd-care-packet-callback-panel]');
    await expect(panel).toBeHidden();
    await insertBox(page, 'callback').check();
    await expect(panel).toBeVisible();
    await expect(panel.locator('input')).toHaveCount(3);
    await expect(panel.locator('input:not([type="checkbox"]), textarea, select')).toHaveCount(0);
    await expect(callbackConfirm(page, 'arranged')).toHaveAccessibleName('Staff have arranged this call for this discharge with the named team.');
    await expect(callbackConfirm(page, 'plan')).toHaveAccessibleName('The agreed call window and deadline are recorded in the After Visit Summary or will be written on this page before handoff; the return number, hours and fallback have been confirmed.');
    await expect(callbackConfirm(page, 'preferences')).toHaveAccessibleName('The patient’s contact details and message preferences were agreed in the clinical workflow.');
    for (const missing of ['arranged', 'plan', 'preferences']) {
      await confirmCallback(page);
      await callbackConfirm(page, missing).uncheck();
      await expect(printButton(page), `without ${missing}`).toBeDisabled();
      await expect(copyButton(page), `without ${missing}`).toBeDisabled();
      await expect(reason(page)).toHaveText(MSG.callback);
    }
    await confirmCallback(page);
    await expect(printButton(page)).toBeEnabled();
    expect(Object.keys(await snapshot(page)).sort()).toEqual(['ids', 'inserts', 'mode', 'unit', 'why']);
    await insertBox(page, 'safety').check();
    for (const field of ['arranged', 'plan', 'preferences']) await expect(callbackConfirm(page, field)).not.toBeChecked();
    await confirmCallback(page);
    await page.reload();
    await toggle(page).click();
    for (const field of ['arranged', 'plan', 'preferences']) await expect(callbackConfirm(page, field)).not.toBeChecked();
    await expect(printButton(page)).toBeDisabled();
    await insertBox(page, 'callback').uncheck();
    await expect(panel).toBeHidden();
  });

  // ---- copy ------------------------------------------------------------------------------------------------------------------------------
  test('Copy as text reaches the clipboard in a Final copy, with the crisis lines (official names) first and no unit details, and says so only afterwards', async ({ page, baseURL }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL).origin });
    await build(page, { mode: 'final' });
    await copyButton(page).click();
    await expect(status(page)).toContainText('Copied.');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    // The governed names and numbers themselves, in the governed order, before the first listing.
    const first = text.indexOf('Harbor Counseling Center');
    expect(first).toBeGreaterThan(0);
    let previous = -1;
    for (const id of INSERTS.crisis.map(line => line.ref)) {
      const at = text.indexOf(`${nameOf(id)}: ${contactOf(id)}`);
      expect(at, `${id} (${nameOf(id)}: ${contactOf(id)}) is in the copied text`).toBeGreaterThanOrEqual(0);
      expect(at, `${id} comes before the first listing`).toBeLessThan(first);
      expect(at, `${id} keeps the governed order`).toBeGreaterThan(previous);
      previous = at;
    }
    expect(text, 'text that goes INTO the record does not say it is not part of it').not.toContain('Not a medical record');
    for (const unit of [PROFILE.unitName, PROFILE.org, PROFILE.unitPhone, '555-0142']) expect(text, 'no unit details').not.toContain(unit);
    expect(text).not.toMatch(/SENTINEL|2031-02-03|Verification due|\b\d+\s?mg\b/);
    expect(text).not.toMatch(/&amp;|&#39;|&lt;/);
    await page.getByRole('radio', { name: /Review copy/ }).check();
    await expect(copyButton(page), 'a Review draft never goes into the record').toBeDisabled();
    await expect(reason(page)).toContainText('Switch to the Final copy');
  });

  test('when the clipboard refuses, nothing says Copied and the text is shown to copy by hand', async ({ page }) => {
    await build(page, { mode: 'final' });
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
    await copyButton(page).click();
    await expect(status(page)).toContainText('Copy is unavailable here');
    await expect(page.locator('#fd-care-packet-copy-text')).toBeVisible();
    await expect(page.locator('#fd-care-packet-copy-text')).toHaveValue(/If things feel unsafe/);
    await expect(status(page)).not.toContainText('Copied.');
  });

  test('a packet edit while clipboard writing is pending suppresses stale fallback text and leaves the revised packet ready', async ({ page }) => {
    await page.addInitScript(() => {
      window.__copyAttempts = 0;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => {
        window.__copyAttempts++;
        return new Promise((resolve, reject) => { window.__rejectCopy = reject; });
      } } });
    });
    await build(page, { mode: 'final' });
    await copyButton(page).click();
    await expect.poll(() => page.evaluate(() => window.__copyAttempts)).toBe(1);
    await insertBox(page, 'warning').uncheck();
    await page.evaluate(async () => {
      window.__rejectCopy(new Error('clipboard permission denied'));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await expect(page.locator('#fd-care-packet-copy-text')).toHaveCount(0);
    await expect(status(page)).not.toContainText(/Copied\.|The text is shown below/);
    await expect(printButton(page)).toBeEnabled();
    await expect(copyButton(page)).toBeEnabled();
    await stage(page);
    await expect(host(page).locator('[data-fd-packet-insert="warning"]')).toHaveCount(0);
  });

  test('approval withdrawn while clipboard writing is pending prevents a delayed rejection from exposing manual-copy text', async ({ page }) => {
    const authority = await routeShell(page);
    await page.addInitScript(() => {
      window.__copyAttempts = 0;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => {
        window.__copyAttempts++;
        return new Promise((resolve, reject) => { window.__rejectCopy = reject; });
      } } });
    });
    await build(page, { mode: 'final' });
    await copyButton(page).click();
    await expect.poll(() => page.evaluate(() => window.__copyAttempts)).toBe(1);
    const copyChecks = authority.requests.length;
    await expect(status(page)).not.toContainText('Copied.');
    await expect(page.locator('#fd-care-packet-copy-text')).toHaveCount(0);
    authority.status = 'revoked';
    await page.evaluate(() => window.__rejectCopy(new Error('clipboard permission denied')));
    await expect(status(page)).toHaveText('Unit approval could not be confirmed. Print and Copy are unavailable; draft editing remains available.');
    expect(authority.requests.length, 'a clipboard failure cannot reuse the initial Copy receipt').toBeGreaterThan(copyChecks);
    expect(authority.requests.at(-1)).toEqual({ profileId: PROFILE.id, revision: PROFILE.revision });
    await expect(page.locator('#fd-care-packet-copy-text')).toHaveCount(0);
    await expect(host(page)).toHaveCount(0);
    await expect(copyButton(page)).toBeDisabled();
    await expect(printButton(page)).toBeDisabled();
    expect(await page.evaluate(() => window.__copyAttempts)).toBe(1);
  });

  // ---- announcements, tab order, and nothing leaves the page --------------------------------------------------------------------------
  test('loading an approved profile announces the actual approval without claiming that the clinician reviewed the packet', async ({ page }) => {
    await build(page, { mode: 'final' });
    await expect(status(page)).toContainText(`Loaded unit profile ${PROFILE.label}.`);
    await expect(reason(page)).toContainText('Print and Copy are available.');
    await expect(status(page)).not.toContainText('Review complete');
  });

  // WCAG 2.2 AA 2.5.8 (target size, minimum): a control smaller than 24 x 24 CSS px must have 24px of clear space around it. The
  // label row is 44px, but axe (4.13) measures the INPUT, and found the packet's 22.4px checkboxes next to the shell's fixed tab bar
  // at one scroll position. A 24px box passes whatever is nearby. Fails if the checkbox/radio size drops below 24px again.
  for (const width of [1280, 320]) {
    test(`every checkbox and radio in the tray and the preview is at least 24 x 24 CSS px (WCAG 2.5.8), at ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 800 });
      await build(page, { mode: 'final' });
      await insertBox(page, 'callback').check();
      const small = await page.evaluate(() => [...document.querySelectorAll('[data-fd-care-packet-tray] input[type="checkbox"], #fd-care-packet-preview input[type="checkbox"], #fd-care-packet-preview input[type="radio"]')]
        .map(el => ({ what: el.getAttribute('data-fd-care-packet-insert') || el.getAttribute('data-fd-care-packet-callback') || el.getAttribute('data-fd-care-packet-mode'), box: el.getBoundingClientRect() }))
        .filter(item => item.box.width < 24 || item.box.height < 24).map(item => item.what + ' ' + item.box.width + 'x' + item.box.height));
      expect(small, `every box is at least 24px at ${width}px wide`).toEqual([]);
    });
  }

  test('the Tab order runs search, results, tray (its card button included), then the preview with the profile controls, and ends at Print', async ({ page }) => {
    await build(page, { mode: 'final' });
    await page.locator('#fd-care-directory-query').focus();
    const seen = [];
    for (let i = 0; i < 160 && !seen.includes('print'); i++) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => {
        const el = document.activeElement;
        if (el.id) return el.id;
        for (const a of ['print', 'preview-toggle', 'card-print', 'mode', 'insert', 'profile-load', 'profile-unlink', 'remove', 'up']) if (el.hasAttribute('data-fd-care-packet-' + a)) return a === 'print' ? 'print' : 'data-fd-care-packet-' + a;
        return el.hasAttribute('data-fd-care-packet') ? 'add' : el.tagName.toLowerCase();
      }));
    }
    const at = k => seen.indexOf(k);
    // The card control precedes "Preview and print", which directly precedes the preview it opens.
    const order = ['add', 'data-fd-care-packet-remove', 'data-fd-care-packet-card-print', 'data-fd-care-packet-preview-toggle',
      'data-fd-care-packet-mode', 'data-fd-care-packet-insert', 'fd-care-packet-profile', 'data-fd-care-packet-profile-load', 'data-fd-care-packet-profile-unlink',
      'fd-care-packet-unit-name', 'fd-care-packet-unit-phone', 'print'];
    for (const k of order) expect(at(k), `${k} is reachable by Tab`).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) expect(at(order[i]), `${order[i - 1]} comes before ${order[i]}`).toBeGreaterThan(at(order[i - 1]));
  });

  test('only the exact profile identity leaves the page for approval: no write request, no new storage, one session key', async ({ page }) => {
    const requests = [];
    page.on('request', r => requests.push({ method: r.method(), url: r.url(), origin: new URL(r.url()).origin }));
    await page.goto('/?tab=care');
    const baseline = await page.evaluate(() => ({ ...localStorage }));
    const origin = new URL(page.url()).origin;
    await build(page, { mode: 'final' });
    await stage(page);
    await afterprint(page);
    expect(requests.filter(r => r.method !== 'GET' && r.method !== 'HEAD'), 'no write ever leaves the browser').toEqual([]);
    expect(new Set(requests.map(r => r.origin)), 'only the independent approval service is contacted').toEqual(new Set([origin, new URL(PROFILE_AUTHORITY_URL).origin]));
    const approval = requests.filter(r => r.origin !== origin);
    expect(approval.length, 'Load and Print each check approval').toBeGreaterThanOrEqual(2);
    for (const request of approval) expect([...new URL(request.url).searchParams]).toEqual([['profileId', PROFILE.id], ['revision', PROFILE.revision]]);
    expect(await page.evaluate(() => ({ ...localStorage })), 'no durable storage').toEqual(baseline);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([KEY]);
    const saved = await snapshot(page);
    expect(Object.keys(saved).sort()).toEqual(['ids', 'inserts', 'mode', 'unit', 'why']);
    expect(saved.unit, 'the session holds the profile id, never the unit\'s details').toEqual({ name: '', phone: '', profile: PROFILE.id });
  });

  // ---- the layout under pressure ---------------------------------------------------------------------------------------------------
  test('long names, long descriptions, long unbroken addresses and a long phone neither overflow a sheet nor split the PDF', async ({ page }) => {
    await pinCareDirectory(page, printFeed(careDirectoryFixture(), { hostile: true }));
    await build(page, { mode: 'final' });
    await stage(page);
    const m = await layout(page);
    expectSound(m, 'final');
    expect(await host(page).locator('svg').count(), 'an address that long would give a code too dense to scan, so it gets none').toBe(0);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(m.pages.length);
  });

  test('with realistic descriptions the packer fills each listings sheet until the next block would not fit (its measured numbers agree with the real layout)', async ({ page }) => {
    await pinCareDirectory(page, printFeed(careDirectoryFixture(), { long: true }));
    await build(page, { mode: 'final' });
    await stage(page);
    const m = await layout(page);
    expectSound(m, 'final');
    const listed = m.pages.map((p, i) => ({ ...p, i })).filter(p => p.listings > 0);
    expect(listed.length, 'the fixture spreads listings over two sheets or more, else there is nothing to compare').toBeGreaterThanOrEqual(2);
    for (let n = 0; n + 1 < listed.length; n++) {
      const here = listed[n], next = m.pages[here.i + 1];
      if (!next || next.listings === 0) continue;
      // Greedy packing with the real numbers: room was left here only because the first block of the next sheet is taller.
      expect(here.bodyClient - 24 - here.used, `${here.label}: room left over is less than the next block (${Math.round(next.firstChain)}px)`).toBeLessThan(next.firstChain + 1);
    }
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(m.pages.length);
  });

  test('every QR code prints at least 0.9in square, so an older phone can scan it from paper', async ({ page }) => {
    await build(page, { mode: 'final' });
    await stage(page);
    await page.setViewportSize(PAPER);
    await page.emulateMedia({ media: 'print' });
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#fdPacketPrint .fd-packet-qr')].map(q => {
      const box = q.getBoundingClientRect(), svg = q.querySelector('svg').getBoundingClientRect();
      return [box.width, box.height, svg.width, svg.height];
    }));
    expect(sizes.length, 'one code per listing that has an https address').toBe(8);
    for (const size of sizes) for (const edge of size) expect(edge).toBeGreaterThanOrEqual(0.9 * 96 - 0.5);
  });

  test('page 1 prints each crisis line under its official governed name and number (crisis_resources.json), never a short label', async ({ page }) => {
    await build(page);
    await stage(page);
    const lines = await host(page).locator('[data-fd-packet-unit="crisis"] li[data-fd-packet-crisis]').evaluateAll(lis => lis.map(li => ({
      ref: li.getAttribute('data-fd-packet-crisis'), num: li.querySelector('.fd-packet-crisis__num').textContent, name: li.querySelector('.fd-packet-crisis__label').textContent })));
    expect(lines).toEqual(INSERTS.crisis.map(line => ({ ref: line.ref, num: contactOf(line.ref), name: nameOf(line.ref) })));
    expect(INSERTS.crisis.filter(line => 'label' in line), 'the insert data carries no label that could print instead').toEqual([]);
    expect(await host(page).locator('.fd-packet-page').first().locator('[data-fd-packet-unit="crisis"]').count(), 'on page 1').toBe(1);
  });

  // Recorded 2026-10-12 on macOS, Chromium, Arial: a listing description is 14px (--fd-font-md) and the welcome text 15px
  // (--fd-font-base). A packer that shrank type to fit (smaller tokens, zoom, a transform) would show here first, under the
  // most pressure a packet can carry: twelve long listings and every page on.
  test('text is not shrunk to fit: with twelve long listings and every page on, descriptions stay 14px, the welcome 15px, every crisis line at least 12px, and no sheet is zoomed or scaled', async ({ page }) => {
    await pinCareDirectory(page, printFeed(careDirectoryFixture(), { long: true, count: 12 }));
    await build(page, { mode: 'final', count: 12 });
    for (const insert of INSERTS.inserts) if (!insert.core) await insertBox(page, insert.id).check();
    await confirmCallback(page);
    await stage(page);
    await page.setViewportSize(PAPER);
    await page.emulateMedia({ media: 'print' });
    const sizes = await page.evaluate(() => {
      const px = selector => [...document.querySelectorAll('#fdPacketPrint ' + selector)].map(el => parseFloat(getComputedStyle(el).fontSize));
      const texty = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      return {
        desc: px('.fd-packet-res__d'), intro: px('.fd-packet-intro p'),
        crisis: [...document.querySelectorAll('#fdPacketPrint [data-fd-packet-unit="crisis"] li *')].filter(texty).map(el => parseFloat(getComputedStyle(el).fontSize)),
        scaled: [...document.querySelectorAll('#fdPacketPrint, #fdPacketPrint .fd-packet-page, #fdPacketPrint .fd-packet-body')]
          .map(el => getComputedStyle(el)).filter(s => (s.zoom !== '1' && s.zoom !== 'normal') || s.transform !== 'none').length,
        pages: document.querySelectorAll('#fdPacketPrint .fd-packet-page').length,
      };
    });
    console.log(`FONT SIZES (12 long listings, every page): description ${[...new Set(sizes.desc)].join('/')}px, welcome ${[...new Set(sizes.intro)].join('/')}px, crisis ${Math.min(...sizes.crisis)}-${Math.max(...sizes.crisis)}px, ${sizes.pages} sheets`);
    expect(sizes.desc.length, 'every listing has its description').toBe(12);
    expect(Math.min(...sizes.desc), 'listing descriptions are not shrunk below 14px').toBeGreaterThanOrEqual(14);
    expect(sizes.intro.length).toBeGreaterThan(0);
    expect(Math.min(...sizes.intro), 'the welcome is not shrunk below 15px').toBeGreaterThanOrEqual(15);
    expect(sizes.crisis.length).toBeGreaterThan(0);
    expect(Math.min(...sizes.crisis), 'no crisis-line text below 12px').toBeGreaterThanOrEqual(12);
    expect(sizes.scaled, 'no zoom or transform scales a sheet down').toBe(0);
  });

  // ---- the wallet card: its own print, never part of the packet -----------------------------------------------------------------
  // Replaces "the wallet card is credit-card sized and carries every crisis line" (the card was a page of the packet then).
  test('the wallet card is its own print: from an empty packet its tray button needs no listing or confirmation, stages one card page and no packet page, and afterprint removes it and returns focus to the button', async ({ page }) => {
    await page.goto('/?tab=care');
    await expect(tray(page).locator('.fd-care-packet__count')).toHaveText('0');
    await expect(cardButton(page)).toBeEnabled();
    await expect(cardButton(page)).toHaveAccessibleName('Print wallet card');
    await expect(page.locator('[data-fd-care-packet-card-note]')).toContainText('It is not part of the packet.');
    const title = await page.title();
    await cardButton(page).click();
    expect(await prints(page), 'window.print was called once').toBe(1);
    await expect(host(page)).toHaveCount(1);
    expect(await host(page).locator('.fd-packet-page').count(), 'one page').toBe(1);
    expect(await host(page).locator('.fd-packet-page.fd-packet-cardsheet').count()).toBe(1);
    expect(await host(page).locator('.fd-packet-page:not(.fd-packet-cardsheet), [data-fd-packet-unit], .fd-packet-band, .fd-packet-foot, [data-fd-packet-res]').count(), 'no packet page or packet part').toBe(0);
    expect(await page.evaluate(() => ({ title: document.title, marked: document.body.classList.contains('fd-packet-printing'), rule: (document.getElementById('fdPacketPageRule') || { textContent: '' }).textContent.replace(/\s/g, '') })))
      .toEqual({ title: INSERTS.card.title, marked: true, rule: '@page{size:Letter;margin:0}' });
    await afterprint(page);
    await cleanOf(page, 'afterprint')();
    await expect(cardButton(page), 'focus returns to the card button').toBeFocused();
    expect(await page.title()).toBe(title);
  });

  test('the wallet card is two ID-1 panels on one Letter page: each 3.375in wide and at least 2.125in tall, every crisis entry two unwrapped lines, 8px of headroom, every required name and number in the crisis panel, nothing wider than its box, one PDF page', async ({ page }) => {
    const payload = await servedPayload(page);
    await page.goto('/?tab=care');
    await cardButton(page).click();
    await page.setViewportSize(PAPER);
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(() => {
      // Line boxes of an element's text, from the text's own rects (getClientRects on a block box is always one rect).
      const lines = el => { const range = document.createRange(); range.selectNodeContents(el); return new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size; };
      const sheet = document.querySelector('#fdPacketPrint .fd-packet-cardsheet');
      const panels = [...sheet.querySelectorAll('[data-fd-packet-card]')].map(p => {
        const r = p.getBoundingClientRect(), s = getComputedStyle(p);
        const content = [...p.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
          + parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
        return { kind: p.getAttribute('data-fd-packet-card'), w: r.width, h: r.height, content, border: s.borderTopStyle };
      });
      const crisis = sheet.querySelector('[data-fd-packet-card="crisis"]');
      const entries = [...crisis.querySelectorAll('li[data-fd-packet-crisis]')].map(li => {
        const num = li.querySelector('.fd-packet-crisis__num'), name = li.querySelector('.fd-packet-crisis__label');
        const lh = el => parseFloat(getComputedStyle(el).lineHeight);
        return { ref: li.getAttribute('data-fd-packet-crisis'), num: num.textContent, name: name.textContent, numLines: lines(num), nameLines: lines(name),
          height: li.getBoundingClientRect().height, twoLines: lh(num) + lh(name), sizes: [num, name].map(el => parseFloat(getComputedStyle(el).fontSize)) };
      });
      const r = sheet.getBoundingClientRect();
      return {
        panels, entries, crisisText: crisis.textContent, allText: sheet.textContent,
        overflowX: [...sheet.querySelectorAll('*')].filter(el => !el.closest('.fd-packet-vh') && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline').length,
        docWidth: document.documentElement.scrollWidth, sheet: { w: r.width, h: r.height },
      };
    });
    expect(m.panels.map(p => p.kind)).toEqual(['crisis', 'mine']);
    for (const p of m.panels) {
      expect(Math.abs(p.w - CARD.width), `${p.kind} panel is 3.375in wide (${p.w}px)`).toBeLessThanOrEqual(1);
      expect(p.h, `${p.kind} panel is at least 2.125in tall`).toBeGreaterThanOrEqual(CARD.height);
      expect(p.h, `${p.kind} panel has not grown past ID-1, so it still fits a wallet`).toBeLessThanOrEqual(CARD.height + 0.5);
      expect(p.border, `${p.kind} panel is inside its own dashed cut line`).toBe('dashed');
    }
    const crisisPanel = m.panels.find(p => p.kind === 'crisis');
    expect(CARD.height - crisisPanel.content, `crisis panel headroom (content ${crisisPanel.content.toFixed(1)}px of ${CARD.height}): a wider face on another machine must not push it over`).toBeGreaterThanOrEqual(8);
    expect(m.entries.map(e => e.ref), 'the card carries every governed line, in order').toEqual(INSERTS.crisis.map(line => line.ref));
    for (const e of m.entries) {
      expect([e.num, e.name], `${e.ref}: number over the official name`).toEqual([contactOf(e.ref), nameOf(e.ref)]);
      expect([e.numLines, e.nameLines], `${e.ref}: the number and the name are one line each (no wrap)`).toEqual([1, 1]);
      expect(e.height, `${e.ref}: the entry is exactly two lines tall`).toBeLessThanOrEqual(e.twoLines + 0.5);
      expect(Math.min(...e.sizes), `${e.ref}: crisis text is at least 12px`).toBeGreaterThanOrEqual(12);
    }
    expect(payload.required.length).toBeGreaterThan(0);
    for (const id of payload.required) {
      expect(m.crisisText, `required ${id}: its official name is in the crisis panel`).toContain(nameOf(id));
      expect(m.crisisText, `required ${id}: its number is in the crisis panel`).toContain(contactOf(id));
    }
    expect(m.overflowX, 'no element on the card page is wider than its box').toBe(0);
    expect(m.docWidth, 'nothing is wider than a sheet').toBeLessThanOrEqual(PAPER.width);
    expect(Math.abs(m.sheet.w - PAPER.width), 'the card page is a Letter sheet wide').toBeLessThan(1);
    expect(m.sheet.h, 'and no taller than one').toBeLessThanOrEqual(PAPER.height + 1);
    expect(m.allText).toContain(INSERTS.card.mineTitle);
    for (const row of INSERTS.card.rows) expect(m.allText).toContain(row);
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'the card prints on one page').toBe(1);
    await cleanOf(page, 'the print command ended')();
    await expect(cardButton(page)).toBeFocused();
  });

  test('the wallet card names no unit: with typed ward details, and again with a confirmed profile loaded, nothing of the unit reaches the card', async ({ page }) => {
    await build(page, { profile: '' });
    for (const round of ['typed', 'profile']) {
      if (round === 'profile') await loadProfile(page, PROFILE.id);
      await cardButton(page).click();
      await expect(host(page).locator('.fd-packet-cardsheet')).toHaveCount(1);
      const text = await host(page).textContent();
      for (const unit of round === 'typed' ? ['4 East', '555-0199'] : [PROFILE.unitName, PROFILE.org, PROFILE.unitPhone, '555-0142']) expect(text, `${round}: "${unit}"`).not.toContain(unit);
      await afterprint(page);
      await cleanOf(page, `${round}: afterprint`)();
      await expect(cardButton(page)).toBeFocused();
    }
    expect(await prints(page)).toBe(2);
    await expect(preview(page), 'printing the card leaves the packet preview as it was').toBeVisible();
  });
});

// ---- the payload is the one thing the packet cannot do without ---------------------------------------------------------------------------
test.describe('fail closed: the packet refuses to print without its crisis lines', () => {
  test.beforeEach(async ({ page }, info) => {
    await seed(page, info);
    await stubPrint(page);
    await pinCareDirectory(page, printFeed(careDirectoryFixture()));
  });
  // Rewritten to start from a SAVED Final packet: with an unusable payload the chooser offers nothing to add (which these tests
  // also check), so a packet can only exist from before the payload broke.
  const savedPacket = page => page.addInitScript(([k, ids, profile]) => {
    if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, JSON.stringify({ ids, why: {}, inserts: {}, mode: 'final', unit: { name: '', phone: '', profile } }));
  }, [KEY, PRINT_LISTINGS.map((_, i) => 'r-' + i), PROFILE.id]);
  const cases = [
    ['no payload at all', () => null, true],
    ['a required contact deleted', p => { delete p.contacts[p.required[0]]; return p; }, true],
    ['a required contact blank', p => { p.contacts[p.required[1]].contact = ''; return p; }, true],
    ['a crisis token that names nothing', p => { p.inserts.find(i => i.id === 'warning').groups[3].bullets[0] = 'Call {{crisis:not_a_real_id}} now.'; return p; }, false],
  ];
  for (const [label, mutate, down] of cases) {
    test(`${label}: Print and Copy are off, the reason says so, and nothing is staged, printed or copied${down ? '; the chooser offers nothing and says why once, and the wallet card refuses too' : ''}`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__copies = 0;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => { window.__copies += 1; return Promise.resolve(); } } });
      });
      await routeShell(page, mutate);
      await savedPacket(page);
      await page.goto('/?tab=care');
      const panel = page.locator('[data-care-directory]');
      await panel.getByLabel('Resource name or service').fill('southern maine');
      await expect(panel.locator('.fd-care-search__result').first()).toBeVisible();
      if (down) {
        await expect(page.locator('[data-care-directory-results] [data-fd-care-packet-ineligible]'), 'one note for the whole chooser, no reason per row').toHaveCount(1);
        await expect(page.locator('[data-care-directory-results] [data-fd-care-packet-ineligible="PAYLOAD"]')).toHaveCount(1);
        await expect(panel.locator('[data-fd-care-packet], [data-fd-care-packet-page], [data-fd-care-packet-all]'), 'nothing is offered').toHaveCount(0);
        await expect(tray(page).locator('[data-fd-care-packet-ineligible="PAYLOAD"]'), 'the tray says it too').toHaveCount(1);
        await expect(cardButton(page), 'the card needs the crisis lines as much as the packet does').toBeDisabled();
        await expect(page.locator('[data-fd-care-packet-card-note]')).toContainText('crisis lines did not load');
      } else {
        await expect(panel.getByRole('button', { name: /^Add from all results/ }), 'a usable payload still offers listings').toHaveCount(1);
        await expect(cardButton(page), 'the card carries no standard page, so a broken page does not stop it').toBeEnabled();
      }
      await toggle(page).click();
      await expect(printButton(page)).toBeDisabled();
      await expect(copyButton(page)).toBeDisabled();
      await expect(reason(page)).toContainText(/crisis/i);
      await expect(page.locator('.fd-care-packet-preview__fail')).toBeVisible();
      await expect(page.locator('.fd-packet-sheet--screen .fd-packet-page'), 'no pages at all: not a page without its crisis lines').toHaveCount(0);
      for (const button of [printButton(page), copyButton(page)]) {
        await button.evaluate(b => { b.disabled = false; });
        await button.click();
        if (!down) await expect(button, 'the completed authority check repaints the refusal').toBeDisabled();
        await expect(status(page)).toContainText(/crisis/i);
      }
      expect(await prints(page)).toBe(0);
      expect(await page.evaluate(() => window.__copies)).toBe(0);
      await expect(host(page)).toHaveCount(0);
      // The same failure when the browser itself prints from inside the packet: only the notice, never a page.
      await watchStaged(page);
      expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(1);
      expect((await staged(page))[0]).toEqual({ notice: true, pages: 0, card: 0 });
    });
  }

  // The data edit now lands on a page that is ON by default ("Warning signs"), because the call-back page is off by default.
  test('a standard page taller than a sheet is refused, not clipped (this is the detector for a data edit that outgrows a page)', async ({ page }) => {
    expect(defaultOn('warning'), 'the page edited here is in a fresh packet').toBe(true);
    await routeShell(page, p => { p.inserts.find(i => i.id === 'warning').body = 'A long paragraph that keeps going. '.repeat(260); return p; });
    await build(page, { mode: 'final' });
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toContainText('too long for one page');
    await printButton(page).evaluate(b => { b.disabled = false; });
    await printButton(page).click();
    expect(await prints(page)).toBe(0);
    await expect(host(page)).toHaveCount(0);
  });
});

// ---- the real print pipeline, with nothing stubbed ---------------------------------------------------------------------------------------
test.describe('a real window.print()', () => {
  test.beforeEach(async ({ page }, info) => {
    await seed(page, info);
    await routeShell(page);
    await pinCareDirectory(page, printFeed(careDirectoryFixture()));
  });
  const watchBeforeprint = page => page.addInitScript(() => {
    window.__seen = [];
    window.addEventListener('beforeprint', () => {
      const rule = document.getElementById('fdPacketPageRule');
      window.__seen.push({ host: !!document.getElementById('fdPacketPrint'), marked: document.body.classList.contains('fd-packet-printing'),
        rule: rule ? rule.textContent.replace(/\s/g, '') : '', sheets: document.querySelectorAll('#fdPacketPrint .fd-packet-page').length,
        cards: document.querySelectorAll('#fdPacketPrint .fd-packet-cardsheet').length });
    }, true);
  });
  test('stages the container, the marker and the page rule for beforeprint, then removes all of it when printing ends', async ({ page }) => {
    await watchBeforeprint(page);
    await build(page, { mode: 'final' });
    await printButton(page).click();
    await expect.poll(() => page.evaluate(() => window.__seen.length)).toBe(1);
    const seen = await page.evaluate(() => window.__seen);
    expect(seen.length, 'the browser raised beforeprint once').toBe(1);
    expect(seen[0].host && seen[0].marked, 'the container and the marker were there when the engine looked').toBe(true);
    expect(seen[0].rule).toBe('@page{size:Letter;margin:0}');
    expect(seen[0].sheets).toBeGreaterThanOrEqual(2);
    expect(seen[0].cards, 'no card in the packet').toBe(0);
    await expect(host(page), 'afterprint removed it').toHaveCount(0);
    expect(await page.evaluate(() => document.body.classList.contains('fd-packet-printing') || !!document.getElementById('fdPacketPageRule'))).toBe(false);
    await expect(printButton(page)).toBeFocused();
  });
  test('the wallet card button stages exactly the one card page for beforeprint, then removes it and returns focus to the card button', async ({ page }) => {
    await watchBeforeprint(page);
    await page.goto('/?tab=care');
    await cardButton(page).click();
    await expect.poll(() => page.evaluate(() => window.__seen.length)).toBe(1);
    const seen = await page.evaluate(() => window.__seen);
    expect(seen).toEqual([{ host: true, marked: true, rule: '@page{size:Letter;margin:0}', sheets: 1, cards: 1 }]);
    await expect(host(page), 'afterprint removed it').toHaveCount(0);
    await expect(cardButton(page)).toBeFocused();
  });
});

// ---- recorded page counts, and the one budget that is pinned ------------------------------------------------------------------------------
// The owner's report: 4, 8 and 12 listings, short and long descriptions, both copies, with the first-week page on or off and
// "Making home safer" on or off. Every count is RECORDED (annotation and a console line naming the browser, OS and installed
// faces). Only the owner's budget is pinned: the default pages with eight or fewer ordinary (short) listings fit five sheets in
// both copies (measured 2026-10-12 on macOS Chromium with Arial: 5 and 5 at eight listings, 5 and 4 at four).
test.describe('recorded page counts', () => {
  test.beforeEach(async ({ page }, info) => {
    await seed(page, info);
    await stubPrint(page);
    await routeShell(page);
  });
  for (const count of [4, 8, 12]) {
    for (const long of [false, true]) {
      const kind = long ? 'long' : 'short';
      test(`${count} ${kind} listings: both copies x first-week page x Making home safer, each PDF one page per sheet${!long && count <= 8 ? '; the default pages fit five sheets' : ''}`, async ({ page }) => {
        test.setTimeout(240_000);
        await pinCareDirectory(page, printFeed(careDirectoryFixture(), { long, count }));
        await build(page, { mode: 'final', count });
        const env = await environment(page);
        const rows = [];
        for (const mode of ['review', 'final']) {
          await page.getByRole('radio', { name: mode === 'final' ? /Final copy/ : /Review copy/ }).check();
          for (const week of [true, false]) {
            for (const safety of [false, true]) {
              for (const [id, on] of [['week', week], ['safety', safety]]) { if (on) await insertBox(page, id).check(); else await insertBox(page, id).uncheck(); }
              await stage(page);
              const sheets = await host(page).locator('.fd-packet-page').count();
              const pages = pdfPageCount(await page.pdf({ preferCSSPageSize: true }));
              expect(pages, `${mode} week:${week} safety:${safety}: one PDF page per sheet`).toBe(sheets);
              await expect(host(page), 'the print command ended').toHaveCount(0);
              rows.push({ mode, week, safety, pages, owner: week === defaultOn('week') && safety === defaultOn('safety') });
            }
          }
        }
        const line = rows.map(r => `${r.mode} week:${r.week ? 'on' : 'off'} safety:${r.safety ? 'on' : 'off'}=${r.pages}${r.owner ? ' (default)' : ''}`).join(', ');
        test.info().annotations.push({ type: `page counts, ${count} ${kind} listings`, description: `${line} [${env}]` });
        console.log(`PAGE COUNTS ${count} ${kind} listings [${env}]: ${line}`);
        if (!long && count <= 8) {
          for (const mode of ['review', 'final']) {
            const row = rows.find(r => r.mode === mode && r.owner);
            expect(row.pages, `the owner's budget: the default pages with ${count} ordinary listings fit five sheets (${mode} copy)`).toBeLessThanOrEqual(5);
          }
        }
      });
    }
  }
});

// ---- accessibility, as deterministic checks (axe-core is proposed in draft #1008; these do not depend on it) ---------------------------------
for (const [width, scheme] of [[1280, 'light'], [390, 'dark'], [320, 'light']]) {
  test.describe(`preview at ${width}px, ${scheme}`, () => {
    test.beforeEach(async ({ page }, info) => {
      await seed(page, info);
      await page.addInitScript(s => { try { localStorage.setItem('cw_theme', s); } catch { /* private mode */ } }, scheme);
      await stubPrint(page);
      await routeShell(page);
      await pinCareDirectory(page, printFeed(careDirectoryFixture()));
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('reflows without sideways scroll, every target (the profile select, its buttons and the card button included) is 44px, names and structure are right', async ({ page }) => {
      await build(page, { mode: 'final' });
      // A page with a table, so the phone layout of a table is checked (no table page is on by default).
      await page.getByRole('checkbox', { name: titleOf('national') }).check();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll with the preview open').toBe(true);
      const small = await page.evaluate(() => [...document.querySelectorAll('#fd-care-packet-preview button, #fd-care-packet-preview select, #fd-care-packet-preview input[type="text"], #fd-care-packet-preview input[type="tel"], #fd-care-packet-preview label.fd-care-packet__check, [data-fd-care-packet-preview-toggle], [data-fd-care-packet-card-print]')]
        .filter(el => el.getBoundingClientRect().width > 0).map(el => ({ el: el.tagName + (el.id ? '#' + el.id : ''), h: el.getBoundingClientRect().height })).filter(x => x.h < 43.9));
      expect(small, 'targets under 44px').toEqual([]);
      await expect(page.getByRole('button', { name: 'Print packet' })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Copy as text' })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Print wallet card' })).toHaveCount(1);
      await expect(page.getByRole('radio'), 'the two copies').toHaveCount(2);
      await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
      await expect(page.getByLabel(/^Unit name/)).toHaveCount(1);
      await expect(page.getByLabel(/^Unit phone/)).toHaveCount(1);
      await expect(page.getByLabel('Unit profile', { exact: true })).toHaveCount(1);
      const pages = await page.locator('.fd-packet-sheet--screen article.fd-packet-page').count();
      expect(pages).toBeGreaterThanOrEqual(2);
      for (let n = 1; n <= pages; n++) await expect(page.locator(`.fd-packet-sheet--screen article[aria-label="Page ${n} of ${pages}"]`)).toHaveCount(1);
      const structure = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = ids.filter((id, i) => ids.indexOf(id) !== i);
        const levels = [...document.querySelectorAll('#fd-care-packet-preview .fd-packet-sheet h1, #fd-care-packet-preview .fd-packet-sheet h2, #fd-care-packet-preview .fd-packet-sheet h3, #fd-care-packet-preview .fd-packet-sheet h4, #fd-care-packet-preview .fd-packet-sheet h5, #fd-care-packet-preview .fd-packet-sheet h6')].map(h => Number(h.tagName[1]));
        return { dup, h1: document.querySelectorAll('main h1, #content h1').length, minSheetLevel: Math.min(...levels), levels: levels.length,
          aria: document.querySelector('[data-fd-care-packet-preview-toggle]').getAttribute('aria-controls'), controlled: !!document.getElementById('fd-care-packet-preview'),
          dialog: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length };
      });
      const edges = await page.evaluate(() => {
        // Every QR code lies inside its page's content box, and (on a phone) no table cell is squeezed to a few characters.
        const outside = [...document.querySelectorAll('.fd-packet-sheet--screen .fd-packet-qr')].filter(qr => {
          const pg = qr.closest('.fd-packet-page'), r = pg.getBoundingClientRect(), s = getComputedStyle(pg);
          return qr.getBoundingClientRect().right > r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth) + 0.5;
        }).length;
        const cells = [...document.querySelectorAll('.fd-packet-sheet--screen .fd-packet-table td')].map(td => td.getBoundingClientRect().width);
        return { qrs: document.querySelectorAll('.fd-packet-sheet--screen .fd-packet-qr').length, outside, cells: cells.length, narrowest: Math.min(...cells) };
      });
      expect(edges.qrs, 'the Final copy shows a code for each listing').toBe(8);
      expect(edges.outside, 'a QR code sticks out of its page (the Final copy hides the tick box, which must not move the columns)').toBe(0);
      expect(edges.cells).toBeGreaterThan(5);
      if (width <= 640) expect(edges.narrowest, 'on a phone a table row stacks instead of squeezing its text columns').toBeGreaterThanOrEqual(120);
      const boundaries = await page.evaluate(probeBoundariesWithin, '#fd-care-packet-preview');
      expect(boundaries.examined, 'the probe looked at the ward\'s fields').toBeGreaterThanOrEqual(2);
      expect(boundaries.findings, 'a text field\'s boundary below 3:1 against its fill or its ground').toEqual([]);
      expect(structure.dup, 'no duplicate ids with the preview open').toEqual([]);
      expect(structure.h1, 'the sheet adds no second h1 to the page').toBe(1);
      expect(structure.minSheetLevel, 'sheet headings start below the preview\'s own h3').toBeGreaterThanOrEqual(4);
      expect(structure.levels).toBeGreaterThan(10);
      expect(structure.controlled).toBe(true);
      expect(structure.dialog).toBe(0);
    });

    test('text has AA contrast inside the preview, the sheet keeps its borders in forced colours, and WCAG text spacing causes no overlap', async ({ page }) => {
      await build(page, { mode: 'final' });
      const probe = await page.evaluate(probeContrastWithin, '#fd-care-packet-preview');
      expect(probe.examined, 'the probe really looked at the preview').toBeGreaterThan(60);
      expect(probe.findings, 'text below AA').toEqual([]);
      await page.emulateMedia({ forcedColors: 'active', colorScheme: scheme });
      // Forced colours changes colours, not widths: what can break is a border that goes transparent or a rule that was only ever
      // a colour. The crisis box must still be drawn by an opaque border, and the empty Final band must stay empty.
      const forced = await page.evaluate(() => {
        const crisis = getComputedStyle(document.querySelector('.fd-packet-sheet--screen .fd-packet-crisis__box'));
        const band = document.querySelector('.fd-packet-sheet--screen .fd-packet-band');
        return { style: crisis.borderTopStyle, width: parseFloat(crisis.borderTopWidth), transparent: /rgba\(.*,\s*0\)|transparent/.test(crisis.borderTopColor),
          bandEmpty: band.classList.contains('is-empty'), bandRule: parseFloat(getComputedStyle(band).borderTopWidth) };
      });
      expect(forced.style, 'the crisis box is still drawn by its border').not.toBe('none');
      expect(forced.width).toBeGreaterThanOrEqual(2);
      expect(forced.transparent, 'and the colour is not transparent').toBe(false);
      expect(forced.bandEmpty && forced.bandRule, 'the empty Final band draws no rule even when colours are forced').toBe(0);
      await page.emulateMedia({ forcedColors: 'none', colorScheme: scheme });
      await page.addStyleTag({ content: '.fd-packet-sheet *,#fd-care-packet-preview *{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important} .fd-packet-sheet p,#fd-care-packet-preview p{margin-bottom:2em !important}' });
      // WCAG 1.4.12: with the spacing increased, no sibling may run over the one before it (units on a sheet, the preview's controls).
      const overlaps = await page.evaluate(() => {
        const found = [];
        const parents = [...document.querySelectorAll('.fd-packet-sheet--screen .fd-packet-body, .fd-packet-sheet--screen .fd-packet-ins, .fd-packet-sheet--screen .fd-packet-crisis__box, [data-fd-care-packet-controls], .fd-care-packet-preview__unit, .fd-care-packet-preview__field, .fd-care-packet-preview__actions, .fd-care-packet-preview__profile, .fd-care-packet-preview__profilerow')];
        for (const parent of parents) {
          const kids = [...parent.children].filter(k => k.getClientRects().length > 0 && !k.closest('.fd-packet-vh') && getComputedStyle(k).position !== 'absolute');
          for (let i = 1; i < kids.length; i++) {
            const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
            if (b.top < a.bottom - 1 && b.left < a.right - 1 && b.right > a.left + 1) found.push((parent.className || parent.tagName) + ' > ' + (kids[i].className || kids[i].tagName));
          }
        }
        return { found, parents: parents.length };
      });
      expect(overlaps.parents, 'the check really looked at containers').toBeGreaterThan(10);
      expect(overlaps.found, 'siblings run over each other when text spacing is increased').toEqual([]);
    });

    test('the Preview button, the card button, the profile controls and Print are never hidden under the fixed bottom bar when focused', async ({ page }) => {
      await build(page, { mode: 'final' });
      for (const target of [toggle(page), cardButton(page), profileSelect(page), loadButton(page), unlinkButton(page), printButton(page)]) {
        await target.focus();
        await expect(target).toBeFocused();
        const hidden = await page.evaluate(() => {
          const a = document.activeElement.getBoundingClientRect(), d = document.querySelector('.fd-dock');
          if (!d || getComputedStyle(d).display === 'none') return false;
          const r = d.getBoundingClientRect();
          return a.bottom > r.top + 1 && a.top < r.bottom;
        });
        expect(hidden).toBe(false);
      }
    });
  });
}

test('pdfPageCount counts what Chromium wrote: one, three and twelve pages (the tree nests every eight, so twelve is the case that matters)', async ({ page }) => {
  for (const pages of [1, 3, 12]) {
    await page.setContent('<!doctype html><title>t</title>' + Array.from({ length: pages }, (_, i) => `<div style="break-after:page">Sheet ${i + 1}</div>`).join(''));
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), `${pages} sheets`).toBe(pages);
  }
  expect(() => pdfPageCount(Buffer.from('not a pdf'))).toThrow(/not a PDF/);
});

test('no screenshot baseline exists for the packet, and none may be made before the human gate (and then only on the Ubuntu runner)', async () => {
  const here = new URL('.', import.meta.url);
  const spec = fs.readFileSync(new URL('care-packet-print.spec.js', here), 'utf8');
  // The needles are assembled so this very test does not trip itself.
  expect(spec.includes('toHave' + 'Screenshot') || spec.includes('toMatch' + 'Snapshot')).toBe(false);
  const found = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'test-results') continue;
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(path);
      else if (/care-packet/.test(entry.name) && /\.(png|jpe?g)$/i.test(entry.name)) found.push(entry.name);
    }
  })(here);
  expect(found, 'screenshot baselines for the packet').toEqual([]);
});
