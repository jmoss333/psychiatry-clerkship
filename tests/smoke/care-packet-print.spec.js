// PR C of the Care aftercare packet in a real browser: the preview, the print lifecycle, layout on a Letter sheet, the
// review gate, copy, and the places the payload can fail. The pure rules are in tests/fd-care-packet-*.test.mjs; this file
// is for what only a layout engine, focus and a print pipeline can show.
//
// Honest limits, said once: Chromium only (every smoke project is Desktop Chrome), so Firefox, Safari and phone printing are
// unproven and are covered only by the human gate G-C. Page counts are RECORDED, never pinned, because they depend on the
// machine's fonts. No screenshot baseline exists here and none may be made before G-C (and then only on the Ubuntu runner).
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { careDirectoryFixture, pinCareDirectory } from './care-directory-fixture.js';
import { enableCarePacketHtml, printFeed } from './care-packet-fixture.js';
import { pdfPageCount } from './pdf-pages.js';
import { probeContrastWithin, probeBoundariesWithin } from './contrast-probe.js';
import { isResidentProject } from './audience.js';

// Titles and crisis numbers are read from the data the build ships, never typed here: a renamed page or a changed number must
// fail a test about the page, not pass because the test repeated the old value.
const REPO_ROOT = new URL('../../', import.meta.url);
const readJson = path => JSON.parse(fs.readFileSync(new URL(path, REPO_ROOT), 'utf8'));
const INSERTS = readJson('13_Faculty_Resources/_automation/site_build/data/care-inserts.v1.json');
const GOVERNED = readJson('crisis_resources.json');
const titleOf = id => INSERTS.inserts.find(insert => insert.id === id).title;
const contactOf = id => GOVERNED.resources.find(resource => resource.id === id).contact;
const KEY = 'fd_care_packet_v1';
const GATES = ['verification', 'region', 'identifiers', 'supervisor'];
const PAPER = { width: 816, height: 1056 }; // 8.5in x 11in at 96 dpi
const EDGE = 0.35 * 96; // nothing prints closer to a sheet's edge than this

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

// One route does both jobs the shell needs here: flip the packet's source flag (served HTML only, never source) and, for the
// fail-closed tests, rewrite the injected payload on its single line.
function rewritePayload(html, mutate) {
  const match = html.match(/var FD_CARE_INSERTS=(.*);\n/);
  expect(match, 'the served shell declares its payload on one line').toBeTruthy();
  const next = mutate(JSON.parse(match[1]));
  return html.replace(match[0], () => 'var FD_CARE_INSERTS=' + JSON.stringify(next) + ';\n');
}
async function routeShell(page, mutate) {
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    let html = enableCarePacketHtml(await response.text());
    if (mutate !== undefined) html = rewritePayload(html, mutate);
    await route.fulfill({ response, body: html });
  });
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

// Add every listing of the eight-listing feed, open the preview, choose the copy, fill the ward's details, then (last, because
// every one of those re-arms the confirmations) tick the four confirmations.
async function build(page, { mode = 'review', name = '4 East', phone = '(207) 555-0199', release = true, open = true } = {}) {
  await page.goto('/?tab=care');
  const panel = page.locator('[data-care-directory]');
  await panel.getByLabel('Resource name or service').fill('southern maine');
  await panel.getByRole('button', { name: /^Add all results \(8\)$/ }).click();
  if (open) await toggle(page).click();
  if (open && mode === 'final') await page.getByRole('radio', { name: /Final copy/ }).check();
  if (open && name) { await unitField(page, 'name').fill(name); await unitField(page, 'name').press('Tab'); }
  if (open && phone) { await unitField(page, 'phone').fill(phone); await unitField(page, 'phone').press('Tab'); }
  if (release) for (const g of GATES) await page.locator(`input[data-fd-care-packet-gate="${g}"]`).check();
  return panel;
}
async function stage(page) {
  await expect(printButton(page)).toBeEnabled();
  await printButton(page).click();
  await expect(host(page)).toHaveCount(1);
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

  // ---- layout and pagination, both copies ---------------------------------------------------------------------------------------
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
    await page.locator('[data-care-directory]').getByRole('button', { name: /^Add all results/ }).click();
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

  // ---- typing: the controls are patched, not replaced ---------------------------------------------------------------------------
  test('typing the ward\'s name keeps focus and the caret on every keystroke, saves on leaving the field, and writes nothing to the announcer', async ({ page }) => {
    await build(page, { release: false, name: '', phone: '' });
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
    await expect(page.locator('.fd-packet-sheet--screen .fd-packet-org').first(), 'the pages follow what is typed').toContainText('4 East');
    await expect(status(page)).toHaveText('');
    await page.keyboard.press('Tab');
    await expect(unitField(page, 'phone'), 'Tab moves on: a change event must not pull focus back to the field it fired from').toBeFocused();
    expect((await snapshot(page)).unit.name).toBe('4 East');
  });

  // ---- the review gate is re-armed by anything that adds content ----------------------------------------------------------------
  test('an edit after the confirmations clears them, disables Print and Copy with the reason beside them, and focus is never lost to the page', async ({ page }) => {
    await build(page, { mode: 'final' });
    await expect(printButton(page)).toBeEnabled();
    await expect(copyButton(page)).toBeEnabled();
    await expect(reason(page)).toContainText('Print and Copy are available.');
    await unitField(page, 'name').fill('4 West');
    await unitField(page, 'name').press('Tab');
    for (const g of GATES) await expect(page.locator(`input[data-fd-care-packet-gate="${g}"]`)).not.toBeChecked();
    await expect(printButton(page)).toBeDisabled();
    await expect(copyButton(page)).toBeDisabled();
    await expect(printButton(page)).toHaveAttribute('aria-describedby', 'fd-care-packet-reason');
    await expect(reason(page)).toContainText('Finish the four review confirmations');
    await expect(status(page)).toContainText('Review confirmations cleared');
    expect(await page.evaluate(() => document.activeElement === document.body), 'focus is somewhere real').toBe(false);
    // Switching a page ON adds content nobody reviewed; switching one OFF does not.
    for (const g of GATES) await page.locator(`input[data-fd-care-packet-gate="${g}"]`).check();
    await page.getByRole('checkbox', { name: titleOf('safety') }).check();
    await expect(printButton(page)).toBeDisabled();
    for (const g of GATES) await page.locator(`input[data-fd-care-packet-gate="${g}"]`).check();
    await page.getByRole('checkbox', { name: titleOf('safety') }).uncheck();
    await expect(printButton(page)).toBeEnabled();
  });

  test('unticking any single confirmation disables Print and Copy, and ticking it back enables them (AC4)', async ({ page }) => {
    await build(page, { mode: 'final' });
    for (const g of GATES) {
      await expect(printButton(page)).toBeEnabled();
      await gate(page, g).uncheck();
      await expect(printButton(page), `without "${g}"`).toBeDisabled();
      await expect(copyButton(page), `without "${g}"`).toBeDisabled();
      await expect(reason(page)).toContainText('Finish the four review confirmations');
      await gate(page, g).check();
    }
    await expect(printButton(page)).toBeEnabled();
  });

  test('Tab out of an edited unit phone onto Print leaves focus on a real element that says why Print went away, and says it aloud', async ({ page }) => {
    await build(page, { mode: 'final' });
    await unitField(page, 'phone').fill('(207) 555-0142');
    await page.keyboard.press('Tab');
    await expect(reason(page), 'the reason takes focus when the button under it is disabled').toBeFocused();
    await expect(printButton(page)).toBeDisabled();
    await expect(status(page)).toContainText('Unit phone saved. Review confirmations cleared. Finish the four review confirmations above.');
  });

  test('the one-sided hint follows the wallet-card page while the preview stays open', async ({ page }) => {
    await build(page, { mode: 'final' });
    const hint = page.locator('[data-fd-care-packet-hint]');
    await expect(hint).toContainText('one-sided');
    await page.getByRole('checkbox', { name: titleOf('card') }).uncheck();
    await expect(hint, 'the card is off, so the instruction goes').not.toContainText('one-sided');
    await expect(preview(page)).toBeVisible();
    await page.getByRole('checkbox', { name: titleOf('card') }).check();
    await expect(hint).toContainText('one-sided');
  });

  test('Ctrl+P while a ward field is still being typed prints only the notice', async ({ page }) => {
    await build(page, { mode: 'final' });
    await unitField(page, 'name').fill('Bed 4');
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'an uncommitted field: one sheet, the notice').toBe(1);
    await expect(host(page)).toHaveCount(0);
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

  test('a click on a tray control straight after typing in a unit field lands: the field\'s commit must not replace the tray under the pointer', async ({ page }) => {
    await build(page, { mode: 'final', release: false });
    await unitField(page, 'name').fill('4 West');
    await gate(page, 'verification').click();
    await expect(gate(page, 'verification'), 'the click was not lost to a repaint').toBeChecked();
    expect((await snapshot(page)).unit.name, 'and the typed value was committed first').toBe('4 West');
  });

  // ---- the staged print: one atomic set, removed together, never by a timer ----------------------------------------------------------
  test('Print stages one body-level container, a page rule, a title and a body marker, and afterprint removes all four and returns focus to Print', async ({ page }) => {
    await build(page, { mode: 'final' });
    const title = await page.title();
    await stage(page);
    expect(await prints(page), 'window.print was called once').toBe(1);
    const staged = await page.evaluate(() => ({
      parent: document.getElementById('fdPacketPrint').parentElement.tagName, marked: document.body.classList.contains('fd-packet-printing'),
      rule: document.getElementById('fdPacketPageRule') && document.getElementById('fdPacketPageRule').textContent, title: document.title,
      hiddenOnScreen: getComputedStyle(document.getElementById('fdPacketPrint')).display,
    }));
    expect(staged.parent).toBe('BODY');
    expect(staged.marked).toBe(true);
    expect(staged.rule.replace(/\s/g, '')).toBe('@page{size:Letter;margin:0}');
    expect(staged.title).toBe('Your aftercare resources');
    expect(staged.hiddenOnScreen, 'display:none on screen, so a leftover can never hide the app').toBe('none');
    await expect(page.locator('#content'), 'the app itself is still visible on screen').toBeVisible();
    // No timer removes it: a print engine that returns early (iOS Safari) still needs the container for its snapshot.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.waitForTimeout(500);
    await expect(host(page)).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(host(page)).toHaveCount(0);
    expect(await page.evaluate(() => ({ marked: document.body.classList.contains('fd-packet-printing'), rule: !!document.getElementById('fdPacketPageRule'), title: document.title })))
      .toEqual({ marked: false, rule: false, title });
    await expect(printButton(page)).toBeFocused();
  });

  const gate = (page, g) => page.locator(`input[data-fd-care-packet-gate="${g}"]`);
  const cleanOf = (page, why) => async () => {
    await expect(host(page), why).toHaveCount(0);
    expect(await page.evaluate(() => document.body.classList.contains('fd-packet-printing') || !!document.getElementById('fdPacketPageRule')), why).toBe(false);
  };

  test('a staged print is removed by anything that changes the packet, and by leaving Care (never left to go stale)', async ({ page }) => {
    await build(page, { mode: 'final' });
    await stage(page);
    await gate(page, 'region').uncheck();
    await cleanOf(page, 'unticking a confirmation')();
    await gate(page, 'region').check();
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
  test('Ctrl+P with the preview open prints the packet the preview shows once review is complete, and only a notice before then', async ({ page }) => {
    await build(page, { mode: 'final', release: false });
    const shown = await page.locator('.fd-packet-sheet--screen .fd-packet-page').count();
    expect(shown).toBeGreaterThanOrEqual(2);
    // page.pdf() raises beforeprint and afterprint around itself, exactly as a menu or keyboard print does.
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'review incomplete: one sheet, the notice').toBe(1);
    await expect(host(page), 'afterprint removed it').toHaveCount(0);
    for (const g of GATES) await gate(page, g).check();
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true })), 'review complete: the same sheets as the preview').toBe(shown);
    await toggle(page).click();
    await expect(preview(page)).toBeHidden();
    await page.pdf({ preferCSSPageSize: true });
    await expect(host(page), 'preview closed: nothing is staged, the ordinary page prints').toHaveCount(0);
    expect(await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeprint'));
      const staged = !!document.getElementById('fdPacketPrint');
      window.dispatchEvent(new Event('afterprint'));
      return staged;
    }), 'beforeprint with the preview closed stages nothing').toBe(false);
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

  test('the inline preview never prints, so Ctrl+P cannot print a packet that review has not released', async ({ page }) => {
    await build(page, { mode: 'final', release: false });
    await page.emulateMedia({ media: 'print' });
    // A child of a display:none parent keeps its own computed display, so ask whether anything is actually RENDERED.
    const shown = await page.evaluate(() => [...document.querySelectorAll('.fd-care-search__preview, .fd-care-search__preview *')].filter(el => el.getClientRects().length > 0).length);
    expect(shown, 'no node of the inline preview has a box in print').toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.fd-care-search__preview')).display)).toBe('none');
  });

  // ---- a forced-on button changes nothing ------------------------------------------------------------------------------------------
  test('Print and Copy refuse while the confirmations are stale, even if the disabled attribute is removed by hand', async ({ page }) => {
    await page.addInitScript(() => {
      window.__copies = 0;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => { window.__copies += 1; return Promise.resolve(); } } });
    });
    await build(page, { mode: 'final', release: false });
    await expect(printButton(page)).toBeDisabled();
    await printButton(page).evaluate(b => { b.disabled = false; });
    await copyButton(page).evaluate(b => { b.disabled = false; });
    await printButton(page).click();
    await copyButton(page).click();
    expect(await prints(page)).toBe(0);
    expect(await page.evaluate(() => window.__copies)).toBe(0);
    await expect(host(page)).toHaveCount(0);
    await expect(status(page)).toContainText('Finish the four review confirmations');
  });

  test('a second Print click while one is staged is ignored, and a print that throws leaves nothing behind', async ({ page }) => {
    await build(page, { mode: 'final' });
    await stage(page);
    await printButton(page).click();
    expect(await prints(page), 'the second click did not print again').toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.evaluate(() => { window.print = () => { throw new Error('no printer'); }; });
    await printButton(page).click();
    await cleanOf(page, 'a failed print')();
    await expect(page.locator('#content')).toBeVisible();
  });

  // ---- what blocks Print, and why it says so -----------------------------------------------------------------------------------------
  test('a Final copy needs the unit phone; a Review copy prints with a line to write on', async ({ page }) => {
    await build(page, { mode: 'final', phone: '' });
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toContainText('Enter the unit phone number');
    await page.getByRole('radio', { name: /Review copy/ }).check();
    await expect(printButton(page)).toBeEnabled();
    await stage(page);
    expect(await host(page).locator('.fd-packet-blank').count(), 'the welcome and the call-back page leave a line to write on').toBeGreaterThanOrEqual(2);
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

  test('a crisis line number inside a listing blocks printing and names the listing; removing it unblocks', async ({ page }) => {
    const feed = printFeed(careDirectoryFixture());
    feed.records[2].phone = '207-799-4160 | Crisis Line: 1-888-568-1112';
    await pinCareDirectory(page, feed);
    await build(page, { mode: 'final' });
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toContainText('Southern Maine Wellness Clinic');
    await expect(reason(page)).toContainText('crisis line number');
    await page.locator('[data-fd-care-packet-remove="r-2"]').click();
    await expect(printButton(page), 'removing adds nothing unreviewed, so the confirmations stand').toBeEnabled();
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
    for (const g of GATES) await gate(page, g).check();
    await expect(printButton(page)).toBeDisabled();
    await expect(reason(page)).toContainText('hidden while the directory is incomplete');
  });

  // ---- copy ------------------------------------------------------------------------------------------------------------------------------
  test('Copy as text reaches the clipboard in a Final copy, with the crisis lines first and no unit details, and says so only afterwards', async ({ page, baseURL }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL).origin });
    await build(page, { mode: 'final' });
    await copyButton(page).click();
    await expect(status(page)).toContainText('Copied.');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    // The governed numbers themselves, in the governed order, before the first listing.
    const first = text.indexOf('Harbor Counseling Center');
    expect(first).toBeGreaterThan(0);
    for (const id of INSERTS.crisis.map(line => line.ref)) {
      const at = text.indexOf(contactOf(id));
      expect(at, `${id} (${contactOf(id)}) is in the copied text`).toBeGreaterThanOrEqual(0);
      expect(at, `${id} comes before the first listing`).toBeLessThan(first);
    }
    expect(text, 'text that goes INTO the record does not say it is not part of it').not.toContain('Not a medical record');
    expect(text).not.toMatch(/4 East|555-0199|SENTINEL|2031-02-03|Verification due|\b\d+\s?mg\b/);
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

  // ---- announcements, tab order, and nothing leaves the page --------------------------------------------------------------------------
  test('readiness is announced when review completes with the preview open', async ({ page }) => {
    await build(page, { mode: 'final', release: false });
    for (const g of GATES) await gate(page, g).check();
    await expect(status(page)).toContainText('Review complete. Print and Copy are available.');
  });

  test('the Tab order runs search, results, tray, then the preview, and ends at Print', async ({ page }) => {
    await build(page, { mode: 'final' });
    await page.locator('#fd-care-directory-query').focus();
    const seen = [];
    for (let i = 0; i < 160 && !seen.includes('print'); i++) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => {
        const el = document.activeElement;
        if (el.id) return el.id;
        for (const a of ['print', 'preview-toggle', 'mode', 'insert', 'gate', 'remove', 'up']) if (el.hasAttribute('data-fd-care-packet-' + a)) return a === 'print' ? 'print' : 'data-fd-care-packet-' + a;
        return el.hasAttribute('data-fd-care-packet') ? 'add' : el.tagName.toLowerCase();
      }));
    }
    const at = k => seen.indexOf(k);
    const order = ['add', 'data-fd-care-packet-remove', 'data-fd-care-packet-gate', 'data-fd-care-packet-preview-toggle', 'data-fd-care-packet-mode', 'data-fd-care-packet-insert', 'fd-care-packet-unit-name', 'fd-care-packet-unit-phone', 'print'];
    for (const k of order) expect(at(k), `${k} is reachable by Tab`).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) expect(at(order[i]), `${order[i - 1]} comes before ${order[i]}`).toBeGreaterThan(at(order[i - 1]));
  });

  test('nothing leaves the page: no request but same-origin reads, no new storage, one session key', async ({ page }) => {
    const requests = [];
    page.on('request', r => requests.push({ method: r.method(), origin: new URL(r.url()).origin }));
    await page.goto('/?tab=care');
    const baseline = await page.evaluate(() => ({ ...localStorage }));
    const origin = new URL(page.url()).origin;
    await build(page, { mode: 'final' });
    await stage(page);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(requests.filter(r => r.method !== 'GET' && r.method !== 'HEAD'), 'no write ever leaves the browser').toEqual([]);
    expect(new Set(requests.map(r => r.origin)), 'and nothing goes anywhere else').toEqual(new Set([origin]));
    expect(await page.evaluate(() => ({ ...localStorage })), 'no durable storage').toEqual(baseline);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([KEY]);
    expect(Object.keys(await snapshot(page)).sort()).toEqual(['ids', 'inserts', 'mode', 'unit', 'why']);
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

  test('the wallet card is credit-card sized and carries every crisis line', async ({ page }) => {
    await build(page, { mode: 'final' });
    await stage(page);
    await page.setViewportSize(PAPER);
    await page.emulateMedia({ media: 'print' });
    const card = await page.evaluate(() => {
      const el = document.querySelector('#fdPacketPrint [data-fd-packet-card]'), r = el.getBoundingClientRect();
      const lines = [...el.querySelectorAll('[data-fd-packet-crisis]')].map(li => li.getAttribute('data-fd-packet-crisis'));
      // The card is a floor (min-height), so its own height reads 2.125in whenever its content fits. The content's height is what
      // shows how close it is: padding, border and every child, as laid out.
      const style = getComputedStyle(el);
      const content = [...el.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
        + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      return { w: r.width, h: r.height, content, lines, all: [...document.querySelectorAll('#fdPacketPrint [data-fd-packet-unit="crisis"] [data-fd-packet-crisis]')].map(li => li.getAttribute('data-fd-packet-crisis')) };
    });
    expect(card.w).toBeCloseTo(3.375 * 96, 0);
    expect(card.h, 'ID-1 is 2.125in tall: a card that grows no longer fits a wallet').toBeLessThanOrEqual(2.125 * 96 + 0.5);
    expect(card.content, 'and its content fits with room to spare, so a wider font on another machine cannot push it over (the Linux runner measured 1.2px over before)').toBeLessThanOrEqual(2.125 * 96 - 6);
    expect(card.lines, 'the card carries the same lines as the page-1 block').toEqual(card.all);
  });
});

// ---- the payload is the one thing the packet cannot do without ---------------------------------------------------------------------------
test.describe('fail closed: the packet refuses to print without its crisis lines', () => {
  test.beforeEach(async ({ page }, info) => {
    await seed(page, info);
    await stubPrint(page);
    await pinCareDirectory(page, printFeed(careDirectoryFixture()));
  });
  const cases = [
    ['no payload at all', () => null],
    ['a required contact deleted', p => { delete p.contacts[p.required[0]]; return p; }],
    ['a required contact blank', p => { p.contacts[p.required[1]].contact = ''; return p; }],
    ['a crisis token that names nothing', p => { p.inserts.find(i => i.id === 'warning').groups[3].bullets[0] = 'Call {{crisis:not_a_real_id}} now.'; return p; }],
  ];
  for (const [label, mutate] of cases) {
    test(`${label}: Print and Copy are off, the reason says so, and nothing is staged, printed or copied`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__copies = 0;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => { window.__copies += 1; return Promise.resolve(); } } });
      });
      await routeShell(page, mutate);
      await build(page, { mode: 'final' });
      await expect(printButton(page)).toBeDisabled();
      await expect(copyButton(page)).toBeDisabled();
      await expect(reason(page)).toContainText(/crisis/i);
      await expect(page.locator('.fd-care-packet-preview__fail')).toBeVisible();
      await expect(page.locator('.fd-packet-sheet--screen .fd-packet-page'), 'no pages at all: not a page without its crisis lines').toHaveCount(0);
      await printButton(page).evaluate(b => { b.disabled = false; });
      await copyButton(page).evaluate(b => { b.disabled = false; });
      await printButton(page).click();
      await copyButton(page).click();
      expect(await prints(page)).toBe(0);
      expect(await page.evaluate(() => window.__copies)).toBe(0);
      await expect(host(page)).toHaveCount(0);
      // The same failure when the browser itself prints: only the notice, never a page.
      expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(1);
    });
  }

  test('a standard page taller than a sheet is refused, not clipped (this is the detector for a data edit that outgrows a page)', async ({ page }) => {
    await routeShell(page, p => { p.inserts.find(i => i.id === 'callback').body = 'A long paragraph that keeps going. '.repeat(260); return p; });
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
  test('stages the container, the marker and the page rule for beforeprint, then removes all of it when printing ends', async ({ page }) => {
    await page.addInitScript(() => {
      window.__seen = [];
      window.addEventListener('beforeprint', () => {
        const rule = document.getElementById('fdPacketPageRule');
        window.__seen.push({ host: !!document.getElementById('fdPacketPrint'), marked: document.body.classList.contains('fd-packet-printing'),
          rule: rule ? rule.textContent.replace(/\s/g, '') : '', sheets: document.querySelectorAll('#fdPacketPrint .fd-packet-page').length });
      }, true);
    });
    await build(page, { mode: 'final' });
    await printButton(page).click();
    const seen = await page.evaluate(() => window.__seen);
    expect(seen.length, 'the browser raised beforeprint once').toBe(1);
    expect(seen[0].host && seen[0].marked, 'the container and the marker were there when the engine looked').toBe(true);
    expect(seen[0].rule).toBe('@page{size:Letter;margin:0}');
    expect(seen[0].sheets).toBeGreaterThanOrEqual(2);
    await expect(host(page), 'afterprint removed it').toHaveCount(0);
    expect(await page.evaluate(() => document.body.classList.contains('fd-packet-printing') || !!document.getElementById('fdPacketPageRule'))).toBe(false);
    await expect(printButton(page)).toBeFocused();
  });
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

    test('reflows without sideways scroll, every target is 44px, names and structure are right', async ({ page }) => {
      await build(page, { mode: 'final' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page scroll with the preview open').toBe(true);
      const small = await page.evaluate(() => [...document.querySelectorAll('#fd-care-packet-preview button, #fd-care-packet-preview input[type="text"], #fd-care-packet-preview input[type="tel"], #fd-care-packet-preview label.fd-care-packet__check, [data-fd-care-packet-preview-toggle]')]
        .filter(el => el.getBoundingClientRect().width > 0).map(el => ({ el: el.tagName + (el.id ? '#' + el.id : ''), h: el.getBoundingClientRect().height })).filter(x => x.h < 43.9));
      expect(small, 'targets under 44px').toEqual([]);
      await expect(page.getByRole('button', { name: 'Print packet' })).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Copy as text' })).toHaveCount(1);
      await expect(page.getByRole('radio'), 'the two copies').toHaveCount(2);
      await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
      await expect(page.getByLabel(/^Unit name/)).toHaveCount(1);
      await expect(page.getByLabel(/^Unit phone/)).toHaveCount(1);
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
        const parents = [...document.querySelectorAll('.fd-packet-sheet--screen .fd-packet-body, .fd-packet-sheet--screen .fd-packet-ins, .fd-packet-sheet--screen .fd-packet-crisis__box, [data-fd-care-packet-controls], .fd-care-packet-preview__unit, .fd-care-packet-preview__field, .fd-care-packet-preview__actions')];
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

    test('the Preview button and Print are never hidden under the fixed bottom bar when focused', async ({ page }) => {
      await build(page, { mode: 'final' });
      for (const target of [toggle(page), printButton(page)]) {
        await target.focus();
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
  const fs = await import('node:fs');
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
