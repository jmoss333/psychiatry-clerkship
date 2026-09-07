/**
 * Check 1 — Nav crawl (the core gate).
 *
 * For EVERY item in nav.json:
 *   – HTTP GET the underlying file at /content/<f> (md) or /tools/<f> (tool)
 *   – Assert HTTP 200 and body ≥ MIN_BYTES (catches empty files and LFS stubs)
 *
 * For a representative sample of content pages:
 *   – Navigate via the SPA (?page=<f>) and assert #content renders real text
 *   – For topic pages with practice panels: click the panel, verify it opens
 *
 * Runs against both sites via playwright.config.js projects:
 *   nav-ms3 → localhost:4200   nav-res → localhost:4201
 *
 * HARD FAIL: any 404, empty body, or LFS pointer stub exits non-zero.
 */

import { test, expect } from '@playwright/test';
import { requestGetWithRetry } from './net-resilience.js';
import { isResidentProject } from './audience.js';
import { readFileSync } from 'node:fs';

// Case of the Week adds exactly one nav page per audience per registry week
// (cotw_registry.json is the single source the builds derive those pages from), so the
// exact-inventory pin derives its CotW share from the registry too. A weekly case PR now
// passes without touching this file, while any OTHER nav change still fails exactly.
// A registry read failure throws here and fails the suite loudly — never a silent pass.
const COTW_WEEKS = JSON.parse(readFileSync(
  new URL('../../08_Cases_and_Simulation/case-of-the-week/cotw_registry.json', import.meta.url),
  'utf8',
)).weeks.length;

const MIN_BYTES = 200;
// LFS pointer stubs begin with this ASCII header (~133 bytes total)
const LFS_HEADER = 'version https://git-lfs';

// Pages to load in the browser and verify the SPA renders real content
const RENDER_SAMPLE = [
  { f: 'welcome.md', k: 'md' },
  { f: 't_mood.md', k: 'md' },
  { f: 'suicide.md', k: 'md' },
  { f: 'mse.html', k: 'tool' },
  { f: 'decision-aids.html', k: 'tool' },
];

// Topic pages to also click the practice-panel accordion on
const PANEL_SAMPLE = ['t_mood.md', 'suicide.md', 't_psychosis.md'];

// ── helpers ──────────────────────────────────────────────────────────────────

async function loadNav(request, baseURL) {
  const resp = await requestGetWithRetry(request, new URL('/nav.json', baseURL).href);
  if (!resp.ok()) throw new Error(`GET nav.json → ${resp.status()}`);
  const sections = await resp.json();
  const items = [];
  for (const sec of sections) {
    for (const it of sec.items ?? []) items.push(it);
  }
  return items;
}

async function loadProjectedLibraryRefs(request, baseURL) {
  const resp = await requestGetWithRetry(request, new URL('/', baseURL).href);
  if (!resp.ok()) throw new Error(`GET index → ${resp.status()}`);
  const html = await resp.text();
  const prefix = 'var FD_CURRICULUM=';
  const suffix = ';\n  var FD_TOPIC_META=';
  const start = html.indexOf(prefix);
  const end = html.indexOf(suffix, start);
  if (start < 0 || end < 0) throw new Error('built Front Door curriculum payload is missing');
  const curriculum = JSON.parse(html.slice(start + prefix.length, end));
  return curriculum.libraryColumns.flatMap(column => column.refs).slice().sort();
}

async function waitForContent(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#content');
      if (!el) return false;
      if (el.querySelector('.skel')) return false;
      return true;
    },
    { timeout: 15_000 },
  ).catch(() => {});
}

// ── Test 1: HTTP layer ────────────────────────────────────────────────────────

test('nav items: exact inventory + HTTP 200 + non-empty content', async ({ request, baseURL }, testInfo) => {
  const items = await loadNav(request, baseURL);
  // Non-CotW baseline: 92 ms3 / 100 res (equal to the 2026-09-01 pins of 103/111 minus the
  // 11 registry weeks then shipping). +2 per audience within that baseline: WP-T3's
  // therapy_on_the_unit.md and therapy_reading_room.md.
  // res 100 → 101 on 2026-09-04: +rp-post-event-huddle.html (resident-only tool).
  expect(items).toHaveLength((isResidentProject(testInfo.project.name) ? 101 : 92) + COTW_WEEKS);
  expect(items.filter(item => item.f === 'rotation-curator.html').map(({
    t, f, k, hidden,
  }) => ({ t, f, k, hidden }))).toEqual([{
    t: 'Faculty: Curate a rotation edition', f: 'rotation-curator.html', k: 'tool', hidden: true,
  }]);
  const failures = [];
  const rows = [];

  for (const it of items) {
    const fileURL = it.k === 'tool'
      ? new URL(`/tools/${it.f}`, baseURL).href
      : new URL(`/content/${it.f}`, baseURL).href;

    const resp = await requestGetWithRetry(request, fileURL, { failOnStatusCode: false });
    const status = resp.status();
    const body = await resp.body();
    const isStub = body.toString('latin1', 0, 23).startsWith(LFS_HEADER);
    const hasContent = body.length >= MIN_BYTES && !isStub;
    const pass = status === 200 && hasContent;

    rows.push(
      `${pass ? '✓' : '✗'}  ${String(status).padEnd(4)} ${it.f.padEnd(46)} ` +
      `${hasContent ? 'content' : isStub ? 'LFS-STUB' : `EMPTY(${body.length}B)`}`,
    );
    if (!pass) {
      failures.push(
        `${it.f} (${it.t || it.f}) — HTTP ${status}, ` +
        `${body.length} bytes${isStub ? ', LFS pointer stub' : ''}`,
      );
    }
  }

  console.log(`\n── Nav crawl: ${baseURL}\n${'─'.repeat(72)}`);
  console.log(rows.join('\n'));
  console.log(
    `${'─'.repeat(72)}\n` +
    `${failures.length === 0
      ? `✓ All ${items.length} items passed`
      : `✗ ${failures.length} of ${items.length} failed`}\n`,
  );

  if (failures.length > 0) {
    throw new Error(
      `HARD FAIL — ${failures.length} nav item(s) returned 404 / empty / LFS-stub:\n` +
      failures.map(f => `  ✗ ${f}`).join('\n'),
    );
  }
});

// The HTTP crawl above intentionally remains broader than the Front Door Library: nav.json
// includes case-of-the-week and other routed surfaces that are not placed in Library columns.
// This separate rendered contract catches either kind of regression without conflating the
// audited 98/106 route inventory with the audited 81/90 Library projection.
test('Front Door Library exactly matches the projected placed refs', async ({ page, request, baseURL }, testInfo) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('.fd-role').first().click();
  await page.locator('[data-fd-week="0"]').click();

  await expect(page.locator('.fd-library')).toBeVisible();
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);

  const expected = await loadProjectedLibraryRefs(request, baseURL);
  const rendered = await page.locator('.fd-collink[data-fd-open]').evaluateAll(controls => (
    controls.map(control => control.getAttribute('data-fd-open')).sort()
  ));
  const expectedCount = isResidentProject(testInfo.project.name) ? 93 : 83;  // +2, WP-T3; res +1 rp-post-event-huddle.html (2026-09-04)

  expect(new Set(expected).size).toBe(expectedCount);
  expect(new Set(rendered).size).toBe(expectedCount);
  expect(rendered).toEqual(expected);
});

// ── Test 2: SPA render sample ─────────────────────────────────────────────────

test('SPA: sample pages render real content', async ({ page, request, baseURL }) => {
  const items = await loadNav(request, baseURL);
  const available = new Set(items.map(i => i.f));
  const failures = [];

  for (const it of RENDER_SAMPLE) {
    if (!available.has(it.f)) continue; // page not in this site's nav

    const param = it.k === 'tool' ? 'tool' : 'page';
    await page.goto(
      `${baseURL}/?${param}=${encodeURIComponent(it.f)}`,
      { waitUntil: 'domcontentloaded', timeout: 20_000 },
    );
    await waitForContent(page);

    const fallback = page.locator('.fd-fallback[role="alert"]');
    if (await fallback.isVisible().catch(() => false)) {
      const text = await fallback.innerText().catch(() => 'Front Door fallback');
      failures.push(`${it.f}: Front Door fallback rendered — "${text.trim().slice(0, 80)}"`);
      continue;
    }

    if (it.k === 'tool') {
      const iframe = page.locator('#content iframe.toolframe');
      const visible = await iframe.isVisible({ timeout: 8_000 }).catch(() => false);
      if (!visible) failures.push(`${it.f}: tool iframe not rendered in #content`);
      continue;
    }

    const isError = await page.locator('#content .error').isVisible().catch(() => false);
    const text = await page.locator('#content').innerText({ timeout: 8_000 }).catch(() => '');
    if (isError || text.trim().length < 80) {
      failures.push(
        `${it.f}: rendered empty or error — "${text.trim().slice(0, 80)}"`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `HARD FAIL — ${failures.length} page(s) did not render:\n` +
      failures.map(f => `  ✗ ${f}`).join('\n'),
    );
  }
});

// ── Test 3: Practice panel (two-tier detail view) ────────────────────────────

test('practice panel: two-tier detail opens', async ({ page, request, baseURL }) => {
  const items = await loadNav(request, baseURL);
  const available = new Set(items.map(i => i.f));
  const failures = [];
  let panelsTested = 0;

  for (const file of PANEL_SAMPLE) {
    if (!available.has(file)) continue;

    await page.goto(
      `${baseURL}/?page=${encodeURIComponent(file)}`,
      { waitUntil: 'domcontentloaded', timeout: 20_000 },
    );
    await waitForContent(page);
    // Wait for topic_meta to inject the practice-panel
    await page.waitForSelector('#content h1', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(600);

    const panel = page.locator('details.practice-panel').first();
    const exists = await panel.isVisible({ timeout: 4_000 }).catch(() => false);
    if (!exists) continue; // panel only exists when topic_meta has data — not required

    panelsTested++;

    // Click the summary to open the detail
    await panel.locator('summary.practice-summary').click();
    await page.waitForTimeout(300);

    const isOpen = await panel.evaluate(el => el.hasAttribute('open'));
    if (!isOpen) {
      failures.push(`${file}: practice panel did not open after clicking summary`);
      continue;
    }

    const bodyText = await panel.locator('.practice-body').innerText({ timeout: 5_000 }).catch(() => '');
    if (bodyText.trim().length < 10) {
      failures.push(`${file}: practice panel body is empty after opening`);
    }
  }

  if (panelsTested === 0) {
    console.log('  ℹ No practice panels found on sampled pages — topic_meta may not be populated yet');
  }

  if (failures.length > 0) {
    throw new Error(
      `HARD FAIL — practice panel two-tier view broken:\n` +
      failures.map(f => `  ✗ ${f}`).join('\n'),
    );
  }
});
