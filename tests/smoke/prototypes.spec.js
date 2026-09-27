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

test.describe('catatonia observation · fictional, non-scoring preview', () => {
  const REL = 'catatonia-observation/catatonia-observation.preview.html';

  test.beforeEach(async ({ page }) => {
    await isolate(page);
    await page.goto(fileUrl(REL), { waitUntil: 'load' });
  });

  test('the visual scene has a readable, user-controlled text equivalent', async ({ page }) => {
    await expect(page.locator('.badge')).toContainText('Unattested');
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '0');
    await expect(page.locator('#caption')).toContainText('We do not know');

    await page.getByRole('button', { name: /02 Greeting/ }).click();
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '1');
    await expect(page.locator('#caption')).toContainText('The clinician says');
    await expect(page.getByRole('button', { name: /02 Greeting/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '0');
    await page.getByRole('button', { name: 'Play scene' }).click();
    await expect(page.getByRole('button', { name: 'Pause scene' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause scene' }).click();
    await expect(page.getByRole('button', { name: 'Play scene' })).toBeVisible();
  });

  test('four scenes have distinct text narration and four inspectable moments', async ({ page }) => {
    const scenes = [
      { id: 'greeting', title: 'A brief greeting' },
      { id: 'across-time', title: 'Across time' },
      { id: 'more-than-speech', title: 'More than speech' },
      { id: 'two-witnesses', title: 'Two witnesses' },
    ];
    await expect(page.locator('[data-scene-select]')).toHaveCount(scenes.length);

    const imageDescriptions = [];
    for (const { id, title } of scenes) {
      const selector = page.locator(`[data-scene-select="${id}"]`);
      await selector.click();
      await expect(page.locator('#sceneTitle')).toHaveText(title);
      await expect(selector).toBeFocused();
      await expect(page.locator('#sceneStatus')).toHaveText(`${title} selected.`);
      await expect(selector).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-scene-select][aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('#scene')).toHaveAttribute('data-scene', id);
      await expect(page.locator('#scene')).toHaveAttribute('data-frame', '0');
      const description = await page.locator('#scene').getAttribute('aria-label');
      expect(description?.length, `${id} needs a text equivalent for its illustration`).toBeGreaterThan(30);
      imageDescriptions.push(description);

      const moments = page.locator('[data-step]');
      await expect(moments).toHaveCount(4);
      const captions = [await page.locator('#caption').innerText()];
      for (let moment = 1; moment < 4; moment += 1) {
        await moments.nth(moment).click();
        await expect(page.locator('#scene')).toHaveAttribute('data-frame', String(moment));
        await expect(moments.nth(moment)).toHaveAttribute('aria-pressed', 'true');
        captions.push(await page.locator('#caption').innerText());
      }
      expect(new Set(captions).size, `${id} needs a distinct narration for each moment`).toBe(4);
    }
    expect(new Set(imageDescriptions).size).toBe(scenes.length);
  });

  test('each added scene separates evidence from assumptions', async ({ page }) => {
    const cases = [
      { id: 'across-time', evidence: ['seen', 'unknown'],
        observation: /later check-in.*reaches toward a cup/i,
        overclaim: /did not move at any point between check-ins/i },
      { id: 'more-than-speech', evidence: ['seen', 'stated', 'unknown'],
        observation: /points toward the cup/i,
        overclaim: /understood every word/i },
      { id: 'two-witnesses', evidence: ['seen', 'reported', 'unknown'],
        observation: /nurse reports seeing.*walk to the doorway earlier/i,
        overclaim: /clinician personally witnessed the earlier walk/i },
    ];
    for (const { id, evidence, observation, overclaim } of cases) {
      await page.locator(`[data-scene-select="${id}"]`).click();
      const kinds = await page.locator('.choice input').evaluateAll((inputs) =>
        inputs.map((input) => input.getAttribute('data-kind')));
      for (const kind of evidence) expect(kinds, `${id} needs a ${kind} choice`).toContain(kind);
      await expect(page.getByLabel(observation)).toBeVisible();
      await expect(page.getByLabel(overclaim)).toBeVisible();
      await page.locator('.choice input[data-kind="unknown"]').first().check();
      await page.getByRole('button', { name: 'Check my description' }).click();
      await expect(page.locator('#feedbackTitle')).toHaveText('Look again at what is known');
      await expect(page.locator('#feedbackTitle')).toBeFocused();
      await expect(page.locator('#feedback')).toContainText('Unknown');
      await expect(page.locator('#feedback')).toContainText(/neither establish nor rule out catatonia/i);
      await page.getByRole('button', { name: 'Clear choices' }).click();
      const supported = page.locator('.choice input:not([data-kind="unknown"])');
      for (const input of await supported.all()) await input.check();
      await page.getByRole('button', { name: 'Check my description' }).click();
      await expect(page.locator('#feedbackTitle')).toHaveText('A grounded description');
    }
  });

  test('switching scenes cancels playback and clears prior answers', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-27T12:00:00Z') });
    await page.getByLabel('The scripted scene states that no spoken reply occurs during the short pause after the greeting.').check();
    await page.getByRole('button', { name: 'Check my description' }).click();
    await expect(page.locator('#feedback')).toBeVisible();
    await page.getByRole('button', { name: 'Play scene' }).click();
    await expect(page.getByRole('button', { name: 'Pause scene' })).toBeVisible();

    await page.locator('[data-scene-select="two-witnesses"]').click();
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '0');
    await expect(page.getByRole('button', { name: 'Play scene' })).toBeVisible();
    await expect(page.locator('.choice input:checked')).toHaveCount(0);
    await expect(page.locator('#feedback')).toBeHidden();
    await page.clock.fastForward(5_000);
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '0');
  });

  test('playback allows time to read each caption before advancing', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-27T12:00:00Z') });
    await page.getByRole('button', { name: 'Play scene' }).click();
    await page.clock.fastForward(8_999);
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '0');
    await page.clock.fastForward(3_001);
    await expect(page.locator('#scene')).not.toHaveAttribute('data-frame', '0');
  });

  test('feedback pairs every original choice with its selection state', async ({ page }) => {
    const statements = await page.locator('.choice span').allTextContents();
    await page.locator('.choice input').nth(0).check();
    await page.locator('.choice input').nth(3).check();
    await page.getByRole('button', { name: 'Check my description' }).click();

    const rows = page.locator('#feedbackList li');
    await expect(rows).toHaveCount(statements.length);
    for (let index = 0; index < statements.length; index += 1) {
      await expect(rows.nth(index)).toContainText(statements[index]);
      await expect(rows.nth(index)).toContainText(index === 0 || index === 3 ? 'Selected' : 'Not selected');
    }
  });

  test('Start over truthfully rewinds the scene without starting playback', async ({ page }) => {
    await page.getByRole('button', { name: /03 Pause/ }).click();
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '2');
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.locator('#scene')).toHaveAttribute('data-frame', '0');
    await expect(page.getByRole('button', { name: 'Play scene' })).toBeVisible();
  });

  test('keyboard selection announces the scene while keeping the selector reachable', async ({ page }) => {
    const selector = page.locator('[data-scene-select="more-than-speech"]');
    await selector.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#sceneTitle')).toHaveText('More than speech');
    await expect(selector).toBeFocused();
    await expect(page.locator('#sceneStatus')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#sceneStatus')).toHaveText('More than speech selected.');
    await expect(page.locator('#caption')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#scene')).toHaveAttribute('role', 'img');
  });

  test('all scene controls remain usable on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const id of ['greeting', 'across-time', 'more-than-speech', 'two-witnesses']) {
      const selector = page.locator(`[data-scene-select="${id}"]`);
      await expect(selector).toBeVisible();
      await selector.click();
      await expect(page.locator('#scene')).toHaveAttribute('data-scene', id);
    }
    await page.locator('[data-step="3"]').click();
    const illustration = await page.locator('#scene').boundingBox();
    for (const label of ['Nurse report', 'Bedside now', 'I saw them walk']) {
      const bounds = await page.locator('[data-art="two-witnesses"] text').filter({ hasText: label }).boundingBox();
      expect(bounds.x, `${label} must not be cropped on mobile`).toBeGreaterThanOrEqual(illustration.x);
      expect(bounds.x + bounds.width, `${label} must not be cropped on mobile`).toBeLessThanOrEqual(illustration.x + illustration.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test('the exercise separates visible facts from unsupported conclusions without scoring', async ({ page }) => {
    await page.getByLabel('The scripted scene states that no spoken reply occurs during the short pause after the greeting.').check();
    await page.getByLabel('The person remains seated during the greeting and pause.').check();
    await page.getByLabel('The person’s gaze appears directed downward in this illustration.').check();
    await page.getByRole('button', { name: 'Check my description' }).click();
    await expect(page.locator('#feedbackTitle')).toHaveText('A grounded description');
    await expect(page.locator('#feedbackTitle')).toBeFocused();
    await expect(page.locator('#feedback')).toContainText('A brief schematic scene cannot establish a diagnosis.');

    await page.getByRole('button', { name: 'Clear choices' }).click();
    await expect(page.locator('#feedback')).toBeHidden();
    await page.getByLabel('This scene confirms catatonia.').check();
    await page.getByRole('button', { name: 'Check my description' }).click();
    await expect(page.locator('#feedbackTitle')).toHaveText('Look again at what is known');
    await expect(page.locator('#feedbackTitle')).toBeFocused();
    await expect(page.locator('#feedback')).toContainText('neither establish nor rule out catatonia');
    await expect(page.locator('input[type="number"], [data-score]')).toHaveCount(0);
  });

  test('the preview links outward to URMC and has no export or storage behavior', async ({ page }) => {
    await expect(page.getByRole('link', { name: /URMC training videos/ })).toHaveAttribute('href',
      'https://www.urmc.rochester.edu/psychiatry/divisions/collaborative-care-and-wellness/bush-francis-catatonia-rating-scale');
    await expect(page.getByRole('link', { name: /URMC calculator/ })).toHaveAttribute('href',
      'https://www.urmc.rochester.edu/psychiatry/divisions/collaborative-care-and-wellness/bush-francis-catatonia-rating-scale/calculator');
    await expect(page.locator('[download], input[type="text"], textarea')).toHaveCount(0);
    await expect(page.getByText('No responses are saved or sent.')).toBeVisible();
  });
});
