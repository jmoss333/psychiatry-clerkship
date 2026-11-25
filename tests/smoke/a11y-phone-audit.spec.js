/**
 * EXPLORATORY (report-only) — full-library accessibility + phone-layout sweep at 375 px.
 *
 * One test per shipped page and tool on this project's site. Each prints one `A11Y_AUDIT {json}`
 * line: axe violations by rule and impact, horizontal overflow at 375 px, and interactive
 * targets under 44 x 44 CSS px. Never fails. Temporary: it exists to produce the findings list
 * for the accessibility pass and is replaced by the gating checks in the same PR.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { retryTransient } from './net-resilience.js';
import { isResidentProject } from './audience.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const shipped = JSON.parse(fs.readFileSync(
  path.join(here, '..', '..', '13_Faculty_Resources', '_automation', 'site_build', 'shipped_pages.json'), 'utf8'));

const SHELL = [
  { label: 'Today', path: '/?tab=today', ready: '.fd-today' },
  { label: 'Library', path: '/?tab=library', ready: '.fd-library' },
];

test.describe.configure({ mode: 'parallel' });

function surfacesFor(site) {
  const out = [...SHELL];
  for (const p of shipped.pages) {
    if (!p.sites.includes(site)) continue;
    if (p.kind === 'tool') out.push({ label: `tool ${p.slug}`, path: `/tools/${p.slug}`, ready: 'body' });
    else out.push({ label: `page ${p.slug}`, path: `/?page=${encodeURIComponent(p.slug)}`, ready: '.fd-reader .fd-article__body' });
  }
  return out;
}

// Both sites' lists are generated; each test skips itself on the other project.
const ALL = new Map();
for (const site of ['ms3', 'res']) for (const s of surfacesFor(site)) {
  const key = s.path;
  if (!ALL.has(key)) ALL.set(key, { ...s, sites: new Set() });
  ALL.get(key).sites.add(site);
}

async function settle(page) {
  try {
    await page.waitForFunction(() => document.getAnimations()
      .every((a) => a.playState !== 'running' && a.playState !== 'pending'), null, { timeout: 5_000 });
  } catch { /* infinite animation: measure anyway */ }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Runs in the page: overflow and small targets. */
function measure() {
  const vw = document.documentElement.clientWidth;
  const sig = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = [...el.classList].slice(0, 2).join('.');
    if (cls) s += `.${cls}`;
    return s;
  };
  const scrollsX = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
    }
    return false;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const overflow = document.documentElement.scrollWidth - vw;
  const wide = [];
  if (overflow > 1) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && !scrollsX(el)) {
        wide.push(`${sig(el)}:${Math.round(r.width)}w@${Math.round(r.left)}`);
        if (wide.length >= 6) break;
      }
    }
  }
  const small = {};
  let smallCount = 0;
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [tabindex]:not([tabindex="-1"])';
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) continue;
    // WCAG 2.5.8 inline exception: a link inside running text.
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
      const p = el.parentElement;
      if (p && (p.textContent || '').trim().length > (el.textContent || '').trim().length + 20) continue;
    }
    // Native checkbox/radio wrapped in a label: the label is the target.
    if ((el.type === 'checkbox' || el.type === 'radio') && el.closest('label')) {
      const lr = el.closest('label').getBoundingClientRect();
      if (lr.height >= 44 || lr.width >= 44) continue;
    }
    smallCount += 1;
    const k = `${sig(el)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    small[k] = (small[k] || 0) + 1;
  }
  const top = Object.entries(small).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { vw, overflow, wide, smallCount, small: top };
}

for (const surface of ALL.values()) {
  test(`audit ${surface.label}`, async ({ page }, testInfo) => {
    const site = isResidentProject(testInfo.project.name) ? 'res' : 'ms3';
    test.skip(!surface.sites.has(site), 'not on this site');
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 375, height: 812 });
    const role = site === 'res' ? 'pgy1' : 'student';
    await page.addInitScript(({ who }) => {
      try {
        window.localStorage.setItem('cw_theme', 'light');
        window.localStorage.setItem('cw_rotation_start', '2026-08-17');
        window.localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role: who, tab: 'today', viewWeek: 1 }));
      } catch { /* private mode */ }
    }, { who: role });
    const row = { site, surface: surface.label };
    try {
      await retryTransient(() => page.goto(surface.path, { waitUntil: 'load' }));
      await page.locator(`${surface.ready}:visible`).first().waitFor({ state: 'visible', timeout: 20_000 });
      await settle(page);
      Object.assign(row, await page.evaluate(measure));
      const axe = await new AxeBuilder({ page }).analyze();
      row.axe = axe.violations.map((v) => `${v.impact}:${v.id}:${v.nodes.length}:${v.nodes[0]?.target.join(' ').slice(0, 90)}`);
    } catch (e) {
      row.error = String(e && e.message).split('\n')[0].slice(0, 200);
    }
    console.log(`A11Y_AUDIT ${JSON.stringify(row)}`);
  });
}
