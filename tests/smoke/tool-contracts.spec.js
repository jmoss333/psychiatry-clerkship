// Shipped-tool contracts — the promises a tool prints on itself, driven against the real build.
//
// Companion to prototypes.spec.js (#541), which covers _prototypes/ over file://. This covers the
// tools that actually ship, where the promises carry clinical weight rather than housekeeping
// weight. Same premise, learned the same way: the WP-06R-b shell passed every source-level guard
// while the page was broken in a browser. A disclaimer nobody drives is copy, not a contract.
//
// Runs under nav-ms3 and nav-res, so every contract is checked on BOTH audiences without the
// spec knowing which one it is on. It deliberately adds no CI step: CI's "Check 1" already runs
// --project=nav-ms3 --project=nav-res, and canary-scope.test.mjs states outright that a feature
// PR may add a spec to nav-* without the production canary noticing.
//
// SOURCE LISTS ARE READ FROM THEIR PRODUCERS, never restated here — the ADR-002 lesson. A copy of
// _CRISIS_REQUIRED_TOOLS in this file would drift the moment a surface is added, and drift in
// THIS list means a safety surface silently stops being checked.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

/** The crisis surfaces, parsed from build_deploy.py — the file that enforces them at build time. */
function crisisRequiredTools() {
  const src = read('13_Faculty_Resources/_automation/site_build/build_deploy.py');
  const block = src.match(/_CRISIS_REQUIRED_TOOLS\s*=\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error('could not find _CRISIS_REQUIRED_TOOLS in build_deploy.py');
  const tools = [...block[1].matchAll(/"([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
  // A parse that quietly returned [] would make every assertion below vacuous — the exact shape
  // of "silence looks like success". Fail loudly instead.
  if (tools.length < 5) throw new Error(`parsed only ${tools.length} crisis tools — parser broke`);
  return tools;
}

const CRISIS_TOOLS = crisisRequiredTools();
const CRISIS = JSON.parse(read('crisis_resources.json'));
const RIGHTS = JSON.parse(read('instrument_rights.json'));

// Routes whose anchor is not on screen at load, with the reason. withdrawal.html opens on the
// COWS scorer on purpose — landing a learner who tapped a scorer on a "not reproduced here"
// notice is the failure the retired-instrument presentation work exists to prevent — so the
// CIWA-Ar route sits one click away on its own tab. Asserting "visible on load" would fail a
// deliberate design; asserting it after the documented click is the real promise.
const REVEAL = {
  'withdrawal.html:ciwa-ar': async (page) => {
    await page.getByRole('button', { name: /CIWA-Ar/i }).click();
  },
};

// ------------------------------------------------------------ crisis contacts, script-independent

test.describe('crisis contacts reach the learner even if the app never runs', () => {
  // The single most load-bearing promise in the library. cssrs.html says it in a source comment —
  // "crisis contacts must render even without any app script" — and the block is build-injected
  // static HTML precisely so that a broken bundle, a CDN failure or a hostile network cannot take
  // the numbers down with it. Nothing tested that. This does, with JavaScript fully disabled.
  for (const tool of CRISIS_TOOLS) {
    test(`${tool} renders the crisis block with JavaScript disabled`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
      try {
        const page = await ctx.newPage();
        const res = await page.goto(`/tools/${tool}`, { waitUntil: 'domcontentloaded' });
        expect(res?.status(), `${tool} did not serve`).toBeLessThan(400);
        await expect(page.locator('#crisis-block-heading'),
          `${tool} is in _CRISIS_REQUIRED_TOOLS but its block did not render without scripts`)
          .toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  }

  // EVERY surface, not a sample. The first draft of this checked only CRISIS_TOOLS[0] and would
  // have passed a number hand-edited on any of the other six — caught here only because the
  // planted defect happened to land on a different page than the one being read. A per-page test
  // also names the offending surface in its own failure rather than burying it in a loop.
  for (const tool of CRISIS_TOOLS) {
    test(`${tool} · every crisis contact matches crisis_resources.json verbatim`, async ({ browser, baseURL }) => {
      // crisis_resources.json is the only place these may be edited (CLAUDE.md), and the numbers
      // are independently re-verified against the issuing organisation. A hand-typed correction
      // on a page — the exact thing the rule forbids — would drift silently from the verified
      // record; upstreamDiscrepancies in that file already records one such divergence caught
      // upstream ("Text HELLO" vs the verified "Text HOME"), which is what drift looks like.
      const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
      try {
        const page = await ctx.newPage();
        await page.goto(`/tools/${tool}`, { waitUntil: 'domcontentloaded' });
        const text = await page.locator('body').innerText();
        expect(CRISIS.resources.length).toBeGreaterThan(3);
        for (const r of CRISIS.resources) {
          expect(text, `${tool}: crisis resource "${r.id}" lost its name`).toContain(r.name);
          expect(text, `${tool}: crisis resource "${r.id}" contact drifted from the verified `
            + `value "${r.contact}" — fix crisis_resources.json, never the page`).toContain(r.contact);
        }
      } finally {
        await ctx.close();
      }
    });
  }
});

// ------------------------------------------------------------------- "no PHI is stored"

test('screeners.html stores nothing when used — its own no-PHI promise', async ({ page }) => {
  // The page tells the learner "No PHI is stored". It scores PHQ-9 and GAD-7 entirely in memory,
  // and item 9 of the PHQ-9 is a suicide item — so what this page does NOT retain matters.
  await page.goto('/tools/screeners.html', { waitUntil: 'load' });
  const before = await page.evaluate(() => Object.keys(localStorage));

  const controls = page.locator('button:visible, select:visible, input[type=radio]:visible');
  const n = Math.min(await controls.count(), 12);
  expect(n, 'expected interactive controls on the screener — did the page render?').toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await controls.nth(i).click({ timeout: 2000 }).catch(() => {});

  const after = await page.evaluate(() => Object.keys(localStorage));
  const added = after.filter((k) => !before.includes(k));
  expect(added, 'screeners.html persisted state while promising it stores nothing').toEqual([]);
  const dump = await page.evaluate(() => JSON.stringify(localStorage));
  expect(dump).not.toMatch(/phq|gad|score|item9/i);
});

// --------------------------------------------------- instrument routes, as a learner meets them

test.describe('a withdrawn instrument still hands the learner its official form', () => {
  // INV-IR2 is enforced at build time by instrument-rights-gate.mjs — but that gate can only see
  // that the URL STRING is somewhere in the file. Two of these pages build their anchors in
  // React, so the string can be present while the learner gets nothing clickable: the gate would
  // stay green and the route would be dead. That gap is exactly what a browser closes.
  const routed = RIGHTS.instruments.flatMap((entry) => {
    const url = entry.officialSource?.formUrl;
    return url ? (entry.pages ?? []).map((pin) => ({ id: entry.id, file: pin.file, url })) : [];
  });

  test('the registry still records routes to check', () => {
    expect(routed.length, 'no recorded routes resolved to a page — the registry shape changed')
      .toBeGreaterThan(3);
  });

  for (const { id, file, url } of routed) {
    test(`${file} · ${id} · the recorded route is a link the learner can follow`, async ({ page }) => {
      await page.goto(`/tools/${file}`, { waitUntil: 'load' });
      const reveal = REVEAL[`${file}:${id}`];
      if (reveal) await reveal(page);
      const link = page.locator(`a[href="${url}"]`);
      await expect(link.first(),
        `${file} does not present ${url} as a visible anchor. The build gate only checks the `
        + 'URL is in the file; a route the learner cannot click is still a dead end.')
        .toBeVisible();
      expect((await link.first().innerText()).trim().length,
        'the route link has no visible label').toBeGreaterThan(3);
    });
  }
});
