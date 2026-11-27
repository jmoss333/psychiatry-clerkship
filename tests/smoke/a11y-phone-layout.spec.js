/**
 * Check — phone layout at 375 CSS px on the page types a learner opens most on rounds.
 *
 * WHY THIS EXISTS
 * ---------------
 * a11y-axe.spec.js runs axe at 320 px, but axe does not measure layout: it cannot see a page that
 * scrolls sideways or a button too small for a thumb. A 2026-11-25 sweep of every shipped page and
 * tool on both sites at 375 px (iPhone width) found exactly one page that scrolled sideways (the withdrawal
 * card, 169 px wide of its frame) and shell controls from 19 to 38 px tall. This keeps the
 * fixed shell surfaces from regressing.
 *
 * WHAT FAILS, WHAT IS REPORTED
 * ----------------------------
 *   page wider than the viewport              -> FAIL (WCAG 1.4.10 Reflow)
 *   interactive target under 24 x 24 px       -> FAIL (WCAG 2.5.8 Target Size, AA), with the
 *                                                 standard's inline exception: a link or button
 *                                                 that sits in a line of running text
 *   interactive target under 44 x 44 px       -> REPORTED as annotations (WCAG 2.5.5 AAA; Apple
 *                                                 and Android guidance), never failed
 *
 * SCOPE: six surfaces per site, one per class of markup. Today and the Library (shell), a case
 * page through the Reader (practice panel, feedback button), the question bank, the family
 * meeting simulator, and the Interview Room's opening screen. Do not widen it into a crawl.
 * Fixtures, not live governance: nothing asserts on pending notices.
 */

import { test, expect } from '@playwright/test';
import { retryTransient } from './net-resilience.js';
import { isResidentProject } from './audience.js';

const SURFACES = [
  { label: 'Today', path: '/?tab=today', ready: '.fd-today' },
  { label: 'Library', path: '/?tab=library', ready: '.fd-library' },
  { label: 'case page (cases.md)', path: '/?page=cases.md', ready: '.fd-reader .fd-article__body' },
  { label: 'question bank', path: '/tools/question-bank-practice.html', ready: 'body' },
  { label: 'family meeting simulator', path: '/tools/family-meeting-sim.html', ready: 'body' },
  { label: 'Interview Room', path: '/tools/sp-interview.html', ready: 'body' },
];

const PHONE = { width: 375, height: 812 };

async function settle(page) {
  try {
    await page.waitForFunction(() => document.getAnimations()
      .every((a) => a.playState !== 'running' && a.playState !== 'pending'), null, { timeout: 5_000 });
  } catch { /* a looping animation: measure anyway */ }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Runs IN THE PAGE. */
function measure() {
  const vw = document.documentElement.clientWidth;
  const sig = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 2).join('.');
    if (cls) s += `.${cls}`;
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
    return text ? `${s} "${text.slice(0, 40)}"` : s;
  };
  const clipsX = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox !== 'visible') return true;
    }
    return false;
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  // A skip link is parked off-screen until it takes focus; it is measured when focused, not here.
  const offscreen = (r) => r.bottom < 0 || r.right < 0 || r.left > vw;

  const overflow = document.documentElement.scrollWidth - vw;
  const wide = [];
  if (overflow > 1) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && !clipsX(el)) wide.push(`${sig(el)} right=${Math.round(r.right)}`);
      if (wide.length >= 5) break;
    }
  }

  const under24 = [];
  const under44 = [];
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link]';
  for (const el of document.querySelectorAll(SEL)) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (offscreen(r)) continue;
    if (r.width >= 44 && r.height >= 44) continue;
    // WCAG 2.5.8 inline exception: a target inside a sentence is sized by the line it sits in.
    if (getComputedStyle(el).display === 'inline') {
      const p = el.parentElement;
      const own = (el.textContent || '').trim().length;
      if (p && (p.textContent || '').trim().length > own + 20) continue;
    }
    // A native checkbox or radio inside its label: the label is the target.
    if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) {
      const lr = el.closest('label').getBoundingClientRect();
      if (lr.height >= 24 && lr.width >= 24) continue;
    }
    const row = `${sig(el)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    if (r.width < 24 || r.height < 24) under24.push(row);
    else under44.push(row);
  }
  return { vw, overflow, wide, under24, under44 };
}

for (const surface of SURFACES) {
  test(`phone 375px — ${surface.label}: no sideways scroll, no target under 24px`, async ({ page }, testInfo) => {
    await page.setViewportSize(PHONE);
    const role = isResidentProject(testInfo.project.name) ? 'pgy1' : 'student';
    await page.addInitScript(({ who }) => {
      try {
        window.localStorage.setItem('cw_theme', 'light');
        window.localStorage.setItem('cw_rotation_start', '2026-08-17');
        window.localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role: who, tab: 'today', viewWeek: 1 }));
      } catch { /* private mode */ }
    }, { who: role });

    await retryTransient(() => page.goto(surface.path, { waitUntil: 'load' }));
    await page.locator(`${surface.ready}:visible`).first().waitFor({ state: 'visible', timeout: 20_000 });
    await settle(page);
    const m = await page.evaluate(measure);

    expect(m.vw, 'the viewport did not take the phone width').toBe(PHONE.width);
    for (const row of m.under44) testInfo.annotations.push({ type: 'target under 44px', description: row });

    expect(m.overflow, `${surface.path} scrolls sideways by ${m.overflow}px at 375px:\n  ${m.wide.join('\n  ')}`)
      .toBeLessThanOrEqual(1);
    expect(m.under24, `${surface.path}: interactive targets under 24x24 CSS px at 375px`).toEqual([]);
  });
}
