// Prototype contract — every _prototypes/**/*.html, driven as a real page over file://.
//
// WHY THIS EXISTS. The node suite checks that a prototype's SOURCE says the right things; this
// checks that the PAGE does them. The distinction is not academic: the WP-06R-b safety-planning
// shell shipped with source-level guards that all passed while the page destroyed the learner's
// typed line the moment they clicked Reveal (Codex review, #533). Only driving it in a browser
// found that. Prototypes are exactly where this gap lives, because unlike the shipped tools they
// are not crawled by nav-crawl.spec.js — several are not served by either site at all.
//
// NETWORK IS BLOCKED, deliberately. A file in _prototypes/ is something a person double-clicks:
// on a ward machine, on a plane, from a USB stick. Blocking every non-file request makes that a
// tested property rather than an assumption, and — just as important — makes this suite
// deterministic. Without it a CDN-dependent prototype would pass on a networked CI runner and
// fail in a sandbox, which is the worst kind of test.
//
// SCOPE. Two layers:
//   1. INVARIANTS, applied to every prototype automatically, so a new prototype is covered the
//      day it lands without anyone remembering to add it here.
//   2. CONTRACTS, opt-in per file: the behavioural promises a page makes in its own copy,
//      driven for real. A promise printed on the page and not checked is just a comment.

import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROTO_DIR = path.join(REPO, '_prototypes');

/**
 * Prototypes that cannot render standalone because they pull a library from a CDN.
 *
 * This is a RECORDED list, not a skip list: each entry names the dependency and why the file is
 * still here. Entries are expected to leave by being fixed or deleted, never by being forgotten —
 * so the list is asserted to be exactly this, and a new CDN-dependent prototype fails until
 * someone makes that choice deliberately. (Same discipline as the recorded waivers in
 * instrument_rights.json: the exception is visible and argued, or it is not an exception.)
 *
 * All three are the pre-`rp-` generation of the agitation trainer, superseded by
 * rp-agitation.html — which is the one that actually ships (site_extras.py) and which renders
 * standalone with no external script at all.
 */
const NEEDS_NETWORK = new Map([
  ['agitation-trainer/_TEMPLATE.html', 'React from cdnjs; scaffold for the pre-rp- generation'],
  ['agitation-trainer/agitation-trainer.html', 'React from cdnjs; superseded by rp-agitation.html'],
  ['agitation-trainer/agitation-trainer.preview.html', 'React from cdnjs; superseded by rp-agitation.preview.html'],
]);

/** Storage discipline is repo-wide (CLAUDE.md): cw_* shared hub, rp_* resident. */
const NAMESPACED = /^(cw_|rp_)/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : (name.endsWith('.html') ? [p] : []);
  });
}

const PROTOTYPES = walk(PROTO_DIR)
  .map((abs) => path.relative(PROTO_DIR, abs).split(path.sep).join('/'))
  .sort();

const fileUrl = (rel) => `file://${path.join(PROTO_DIR, rel)}`;

/** Fail the page rather than let it silently reach the network. */
async function isolate(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  return errors;
}

test.describe('prototype inventory', () => {
  test('there are prototypes to check, and the network-dependent list is exactly the recorded one', () => {
    expect(PROTOTYPES.length).toBeGreaterThan(5);
    for (const rel of NEEDS_NETWORK.keys()) {
      expect(PROTOTYPES, `${rel} is recorded as network-dependent but no longer exists — `
        + 'remove it from NEEDS_NETWORK rather than leaving a stale exception').toContain(rel);
    }
  });
});

// ---------------------------------------------------------------- invariants (every prototype)

for (const rel of PROTOTYPES) {
  const recorded = NEEDS_NETWORK.get(rel);

  test(`${rel} · renders standalone`, async ({ page }) => {
    const errors = await isolate(page);
    await page.goto(fileUrl(rel), { waitUntil: 'load' });
    await page.waitForTimeout(300);

    if (recorded) {
      // The exception is asserted, not assumed: if this file starts rendering cleanly it has been
      // fixed, and the recorded entry is now a lie that would hide the next real regression.
      expect(errors.length,
        `${rel} is recorded in NEEDS_NETWORK (${recorded}) but now renders standalone — `
        + 'delete its entry').toBeGreaterThan(0);
      return;
    }

    expect(errors, `${rel} raised errors with the network blocked. A prototype is something a `
      + 'person double-clicks; if it needs a CDN, either inline the dependency or record it in '
      + 'NEEDS_NETWORK with a reason.').toEqual([]);

    // A shell that loaded its script but rendered nothing is the failure mode a page-error check
    // alone misses.
    const body = (await page.locator('body').innerText()).trim();
    expect(body.length, `${rel} rendered no visible text`).toBeGreaterThan(80);
    await expect(page.locator('body')).not.toHaveText(/^\s*(loading|error)\b/i);
  });

  if (recorded) continue;

  test(`${rel} · offers no export surface`, async ({ page }) => {
    // No prototype has ever shipped one, and for the safety-planning shell the spec names an
    // export button "the worst PHI surface the library could add". Holding the whole directory
    // to that line costs nothing while it is already true, and is what makes it stay true.
    await isolate(page);
    await page.goto(fileUrl(rel), { waitUntil: 'load' });
    expect(await page.locator('[download]').count(),
      `${rel} exposes a download control`).toBe(0);
    expect(await page.locator('a[href^="blob:"], a[href^="data:"]').count(),
      `${rel} exposes a generated-file link`).toBe(0);
  });

  test(`${rel} · writes only cw_*/rp_* storage`, async ({ page }) => {
    // TWO checks, because the runtime one alone passes vacuously and I caught it doing so:
    // planting a mis-namespaced STORE_KEY in the safety-planning shell did not fail this test,
    // because that page only writes storage after a [data-grade] button appears — which is
    // behind the Reveal click, past the generic click-through. Silence looked like success.
    //
    // (a) STATIC: every storage key literal in the source must be namespaced. Deterministic, and
    //     it catches the mis-named constant regardless of how deep the write is buried.
    const source = readFileSync(path.join(PROTO_DIR, rel), 'utf8');
    const literals = [...source.matchAll(/localStorage\s*\.\s*(?:get|set|remove)Item\s*\(\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1]);
    const constants = [...source.matchAll(/(?:STORE_KEY|STORAGE_KEY|KEY)\s*=\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1]);
    for (const key of [...literals, ...constants]) {
      expect(NAMESPACED.test(key),
        `${rel} declares storage key "${key}" outside the cw_*/rp_* namespace — the QA gate `
        + 'hard-fails this on any shipped page, and an id collision silently corrupts '
        + 'attestation and SRS state').toBe(true);
    }

    // (b) RUNTIME: whatever the page actually writes while being clicked must be namespaced too.
    //     Complements (a) — it catches a key built dynamically, which no source scan would see.
    await isolate(page);
    await page.goto(fileUrl(rel), { waitUntil: 'load' });
    const controls = page.locator('button:visible, [role="tab"]:visible');
    const n = Math.min(await controls.count(), 8);
    for (let i = 0; i < n; i++) {
      await controls.nth(i).click({ timeout: 2000 }).catch(() => {});
    }
    const keys = await page.evaluate(() => {
      try { return Object.keys(localStorage); } catch (_) { return []; }
    });
    expect(keys.filter((k) => !NAMESPACED.test(k)),
      `${rel} wrote un-namespaced storage key(s) at runtime`).toEqual([]);
  });
}

// ---------------------------------------------------------------- contracts (opt-in, per file)

test.describe('safety-planning-practice.preview.html · the promises it prints on itself', () => {
  const REL = 'safety-planning/safety-planning-practice.preview.html';
  const LINE = 'the day before it got bad, I stopped answering my sister';

  test.skip(!PROTOTYPES.includes(REL), 'shell not present — promoted or removed');

  test.beforeEach(async ({ page }) => {
    await isolate(page);
    await page.goto(fileUrl(REL), { waitUntil: 'load' });
  });

  // "Compare against yours" — the reveal is worthless if it takes the learner's line with it.
  // This is the defect Codex found and the reason this whole spec exists.
  test('the learner’s line survives the reveal, and the model appears beside it', async ({ page }) => {
    await page.fill('#say', LINE);
    await page.click('#revealbtn');
    await expect(page.locator('.model')).toBeVisible();
    await expect(page.locator('#say')).toHaveValue(LINE);
  });

  test('the line survives grading too — grading also re-renders the step', async ({ page }) => {
    await page.fill('#say', LINE);
    await page.click('#revealbtn');
    await page.click('[data-grade="good"]');
    await expect(page.locator('#say')).toHaveValue(LINE);
  });

  // "this box is cleared when you change step or case" — printed under the textarea.
  test('changing step or case clears the box, exactly as the page says', async ({ page }) => {
    await page.fill('#say', LINE);
    await page.locator('.stepbtn').nth(2).click();
    await expect(page.locator('#say')).toHaveValue('');

    await page.fill('#say', LINE);
    await page.locator('[data-case]').nth(1).click();
    await expect(page.locator('#say')).toHaveValue('');
  });

  // "Not saved, not sent, not recoverable." Storage may hold the self-rating and nothing else.
  test('nothing the learner types reaches storage', async ({ page }) => {
    await page.fill('#say', LINE);
    await page.click('#revealbtn');
    await page.click('[data-grade="hard"]');
    const dump = await page.evaluate(() => JSON.stringify(localStorage));
    expect(dump).not.toContain('sister');
    expect(dump).toContain('hard');            // the rating did persist — the test is not vacuous
  });

  // The instrument itself is never reproduced; the route to it is always present.
  test('it routes to the custodian and reproduces no form field label', async ({ page }) => {
    await expect(page.locator('a[href="https://suicidesafetyplan.com/"]').first()).toBeVisible();
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const label of ['internal coping strategies', 'making the environment safer',
      'people whom i can ask for help']) {
      expect(text, `form field label rendered: "${label}"`).not.toContain(label);
    }
  });

  // It must not read as publishable while its clinical strings are unsigned.
  test('it says on its face that it is unattested', async ({ page }) => {
    await expect(page.locator('.draft')).toContainText(/not attested|unattested/i);
  });
});
