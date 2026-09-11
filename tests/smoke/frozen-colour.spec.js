/**
 * Gate — every painted colour on every shipped page, in both themes, as a ratchet.
 *
 * WHY THIS EXISTS
 * ---------------
 * Over three consecutive PRs (#613, #616, #617) the defect that mattered was found by a person
 * running a probe in a browser, never by a gate:
 *
 *   #616  --on-brand had no LIGHT half, so the build's own color:#fff -> var(--on-brand)
 *         rewrite resolved to nothing and filled buttons fell back to body ink.  2.56:1, light.
 *   #616  five practice-family hairlines stayed at their light values in dark mode.  No ratio
 *         to fail: a 1px border has no contrast rule a text probe can apply.
 *   #617  white on the brand fill was 4.36:1 on 21 shipped sources.
 *
 * Every file-reading gate was green for all three, and could not have been otherwise: the wrong
 * colour only exists once a browser has resolved the cascade. bin/check_design_drift.py reads
 * declared-and-used tokens; these were an undeclared token, a raw literal, and a token whose
 * value was simply wrong. tests/smoke/contrast.spec.js gets closer — it measures rendered text —
 * but it walks four routes and scores only text, so borders and every unvisited page are outside
 * it by construction.
 *
 * This walks EVERY built page on BOTH sites, flips the theme in memory, and counts what did not
 * move plus what fails WCAG AA in either theme. It is the ?theme-audit lamp, run over everything,
 * every push, against a pinned baseline.
 *
 * WHY A RATCHET AND NOT ZERO
 * --------------------------
 * The honest starting position is 183 frozen colours and 381 AA failures across the two sites,
 * concentrated in pages this work has not reached (decision-aids, orientation-video, sp-interview,
 * rp-canon-quiz, withdrawal). A gate that fails on day one teaches everyone to bypass it. This
 * fails only on the commit that makes a page worse — which is the commit that can still fix it
 * cheaply — and every reduction re-pins lower and can never be given back. Same shape as
 * design_drift_baseline.json, and the same reason.
 *
 * A page NOT in the baseline must measure clean. That is deliberate: arriving pre-broken is
 * exactly how the five private-palette tools got in.
 *
 * COST. One navigation per page, both themes read from that single load, all on localhost. This
 * is a nav-* spec only and is deliberately NOT in CANARY_SHARED_SPECS: ~51 navigations against
 * Netlify's edge would blow the canary's 30-round-trip budget many times over, and nothing here
 * needs production to be true — it is a property of the build.
 *
 * REGENERATE after a reviewed reduction:
 *   UPDATE_FROZEN_BASELINE=1 npx playwright test --config tests/smoke/playwright.config.js \
 *     --project nav-ms3 --project nav-res frozen-colour.spec.js
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, totals, worst, METRICS, LABEL } from './frozen-ratchet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(HERE, 'frozen_baseline.json');
const SCAN_SRC = path.join(
  HERE, '..', '..', '13_Faculty_Resources', '_automation', 'site_build', 'theme_scan.js'
);
const UPDATING = process.env.UPDATE_FROZEN_BASELINE === '1';

/** Which site this project is pointed at, from the project name the config already sets. */
function siteOf(projectName) {
  if (projectName.endsWith('-ms3')) return 'ms3';
  if (projectName.endsWith('-res')) return 'res';
  throw new Error(`frozen-colour.spec.js: cannot tell the site from project "${projectName}"`);
}

/**
 * The page universe comes from the BUILD, not from a list in this file. A hand-kept list is how a
 * new page arrives ungated; _build/<site> is the same source shipped_pages.json derives from, and
 * a page that stops shipping drops out here on the same commit.
 */
function builtPages(site) {
  const root = path.join(HERE, '..', '..', '_build', site);
  const out = [];
  if (fs.existsSync(path.join(root, 'index.html'))) out.push('index.html');
  const tools = path.join(root, 'tools');
  if (fs.existsSync(tools)) {
    for (const name of fs.readdirSync(tools).sort()) {
      if (name.endsWith('.html')) out.push(`tools/${name}`);
    }
  }
  return out;
}

test.describe('frozen colours and rendered AA, every built page, both themes', () => {
  // One test per site rather than per page: the ratchet's verdict is a whole-site comparison
  // (a page missing from the run is a finding), and 51 separate tests would report 51 times.
  test('no page carries more frozen colour or AA debt than the baseline pins', async ({ page }, testInfo) => {
    const site = siteOf(testInfo.project.name);
    const pages = builtPages(site);
    expect(pages.length, `no built pages found for ${site} — did build_and_check run?`).toBeGreaterThan(5);

    const scanSource = fs.readFileSync(SCAN_SRC, 'utf8');
    const measured = {};
    const detail = {};

    for (const rel of pages) {
      await page.goto(`/${rel}`, { waitUntil: 'load' });
      // The SPA reader and several tools paint asynchronously; a scan on load reads an empty shell.
      await page.waitForTimeout(400);
      // Injected rather than fetched: the gate must measure the same code the lamp ships, and
      // rotation-curator.html is in NO_NETWORK_PAGES, so it never serves the loader at all.
      await page.addScriptTag({ content: scanSource });
      const raw = await page.evaluate(() => window.cwThemeScan.install(document, window).measure());
      measured[rel] = totals(raw);
      detail[rel] = raw;
    }

    if (UPDATING) {
      const doc = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
      doc.sites[site] = Object.fromEntries(Object.keys(measured).sort().map((k) => [k, measured[k]]));
      fs.writeFileSync(BASELINE, `${JSON.stringify(doc, null, 2)}\n`);
      test.info().annotations.push({ type: 'baseline', description: `rewrote ${site} from this run` });
      return;
    }

    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).sites[site] || {};
    const { violations, improvements, unmeasured } = compare(baseline, measured);

    // Say what got better even on a pass. A ratchet nobody sees moving is a ratchet nobody re-pins,
    // and an un-re-pinned gain is a gain the next regression is allowed to spend.
    if (improvements.length) {
      console.log(
        `\n[frozen-colour] ${site}: ${improvements.length} count(s) improved — re-pin with ` +
        `UPDATE_FROZEN_BASELINE=1 to lock them in:\n  ${improvements.join('\n  ')}\n`
      );
    }

    const report = violations.map((v) => {
      const slug = v.split(':')[0];
      const lines = METRICS
        .filter((m) => (measured[slug]?.[m] ?? 0) > (baseline[slug]?.[m] ?? 0))
        .flatMap((m) => worst(detail[slug], m).map((w) => `      ${m}: ${w}`));
      return [`  - ${v}`, ...lines].join('\n');
    });

    expect(
      unmeasured,
      `${site}: pinned in frozen_baseline.json but never measured by this run — the page stopped ` +
      'shipping (re-pin), or the walk skipped it (a ratchet that ignores a missing subject is vacuous)'
    ).toEqual([]);

    expect(
      violations,
      `\n${site}: ${violations.length} page/metric pair(s) got worse.\n` +
      `${Object.entries(LABEL).map(([k, v]) => `  ${k} = ${v}`).join('\n')}\n\n` +
      `${report.join('\n')}\n\n` +
      'Fix the colour, or — if the increase is correct and reviewed — re-pin with ' +
      'UPDATE_FROZEN_BASELINE=1 and say why in the commit.\n'
    ).toEqual([]);
  });
});
