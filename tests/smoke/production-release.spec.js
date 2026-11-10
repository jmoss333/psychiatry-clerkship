import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { isResidentProject } from './audience.js';

const RELEASE_SHA = process.env.RELEASE_SHA;

test('production release journey binds the Path and Care interactions to the served revision', async ({ page }, testInfo) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  const resident = isResidentProject(testInfo.project.name);
  const role = resident ? 'pgy1' : 'student';
  const weekCount = resident ? 4 : 6;
  const destinationWeek = resident ? 4 : 2;
  const key = resident ? 'End' : 'ArrowRight';
  const intent = resident ? 'family-conversation' : 'services';
  const announcement = resident
    ? 'Selected Prepare for a family conversation. Best starting point: Patient and family education.'
    : 'Selected Find community services. Best starting point: Find services and community supports.';

  await page.addInitScript(({ seededRole }) => {
    localStorage.setItem('cw_rotation_start', '2026-08-17');
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: seededRole,
      tab: 'today',
      week: 1,
      viewWeek: 1,
    }));
  }, { seededRole: role });

  await page.goto('/?tab=path', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
  await expect(page.locator('[data-fd-view-week]')).toHaveCount(weekCount);
  const firstWeek = page.locator('[data-fd-view-week="1"]');
  await firstWeek.click();
  await expect(firstWeek).toBeFocused();
  await page.keyboard.press(key);
  const destination = page.locator(`[data-fd-view-week="${destinationWeek}"]`);
  await expect(destination).toBeFocused();
  await expect(destination).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#fd-path-detail .fd-eyebrow')).toHaveText(`Week ${destinationWeek}`);

  await page.locator('[data-fd-tab="care"]:visible').click();
  await expect(page.locator('.fd-care-page')).toBeVisible();
  await page.locator(`[data-fd-care-intent="${intent}"]`).click();
  await expect(page.locator('#careNavigatorStatus')).toHaveText(announcement);
  await expect(page.locator('.fd-care-navigator__result')).toBeVisible();

  await expectReleaseRevision(page);
  expect(runtimeErrors).toEqual([]);
});

// A missing SHA must not turn a release check into an unbound generic smoke test.
async function expectReleaseRevision(page) {
  expect(RELEASE_SHA, 'exact release SHA is required').toMatch(/^[0-9a-f]{40}$/);
  const response = await page.request.get('/tool-governance.json', {
    headers: { 'Cache-Control': 'no-cache' },
  });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect([...new Set(manifest.items.map(item => item.source.revision))]).toEqual([RELEASE_SHA]);
}

// The same 126 cases that were checked manually after #1045: expectations are
// curated destinations, not values calculated by the production search engine.
const medicationAudit = JSON.parse(readFileSync(new URL('../fixtures/medication-search-audit.json', import.meta.url), 'utf8'));
// Most names belong in the primer; these queries have a more specific authored
// destination. Every positive audit case must reach its reading in the top three.
const auditDestinations = {
  carbamazepine: 'med_monitoring.md', Tegretol: 'med_monitoring.md',
  esketamine: 'ect_neuromodulation.md', Spravato: 'ect_neuromodulation.md',
  ECT: 'ect_neuromodulation.md', TMS: 'ect_neuromodulation.md',
  'lithium monitoring': 'med_monitoring.md', 'clozapine constipation': 'med_monitoring.md',
};
const medicationCases = medicationAudit.queries.map(query => ({
  category: 'name audit', query,
  ...(medicationAudit.deliberateMisspellings.includes(query)
    ? { empty: true }
    : { topThree: auditDestinations[query] || 'psychopharm_primer.md' }),
}));
for (const query of ['Wellbutrin XL', 'LAMICTAL?', 'Suboxone', 'Ativan', 'lurasidone', 'Latuda', 'naltrexone']) {
  medicationCases.push({ category: 'medication destination', query, topThree: 'psychopharm_primer.md' });
}
for (const query of ['ECT', 'TMS', 'Spravato']) {
  medicationCases.push({ category: 'treatment destination', query, topThree: 'ect_neuromodulation.md' });
}
for (const [medication, context, ref] of [
  ['Ativan', 'catatonia', 'catatonia.md'], ['lorazepam', 'catatonia', 'catatonia.md'],
  ['lithium', 'monitoring', 'med_monitoring.md'], ['lithium', 'level', 'med_monitoring.md'],
]) {
  for (const query of [
    `${medication} ${context}?`, `${medication} ${context}!`, `${medication}: ${context}.`,
    `(${medication}) [${context}]`, `${medication} "${context}"`, `“${medication} ${context}”`,
    `${medication}/${context}`, `${medication}-${context}`, `${medication}—${context}`, `${medication}, ${context};`,
  ]) medicationCases.push({ category: 'punctuated context', query, topThree: ref, before: 'psychopharm_primer.md' });
}
for (const [query, ref] of [
  ['patient-suicidal', 'pg_suicide.md'], ['lithium suicide-risk', 'pg_suicide.md'],
  ['Ativan alcohol-withdrawal', 't_sud.md'], ['Ativan withdrawing from alcohol?', 't_sud.md'],
  ['Ativan pulled-out-iv', 'agitation.md'], ['patient-si', 'pg_suicide.md'],
  ['patient-hi', 'pg_suicide.md'], ['CIWA-Ar', 't_sud.md'],
  ['i-want-to-kill-myself', 'pg_suicide.md'], ['altered-mental-status', 'delirium.md'],
  ['patient-ams', 'delirium.md'], ['against-medical-advice', 'exp_consult.md'],
]) medicationCases.push({ category: 'safety priority', query, first: { ref, kind: 'protocol' } });
medicationCases.push({
  category: 'specific tool priority', query: 'patient-refuses-medication',
  first: { ref: 'capacity.html', kind: 'item' }, second: { ref: 'exp_consult.md', kind: 'protocol' },
});
for (const ref of ['psychopharm_primer.md', 'med_monitoring.md', 'mse.html']) {
  medicationCases.push({ category: 'literal filename', query: ref, exact: ref });
}
for (const query of ['unknown_reading.md', 'unknown-tool.html']) {
  medicationCases.push({ category: 'unknown filename', query, empty: true });
}

for (const [device, viewport] of [
  ['desktop', { width: 1280, height: 900 }], ['phone', { width: 320, height: 844 }],
]) {
  test(`production medication search verifies names, punctuation and safety priority on ${device}`, async ({ page }, testInfo) => {
    const runtimeErrors = [];
    const observations = [];
    page.on('pageerror', error => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
    });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(role => {
      localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role, tab: 'library', week: 2, viewWeek: 2 }));
    }, isResidentProject(testInfo.project.name) ? 'pgy1' : 'student');
    const dialog = page.getByRole('dialog', { name: 'Search', exact: true });
    const input = dialog.getByRole('textbox', { name: 'Search resources', exact: true });
    async function openSearch() {
      await page.locator('.fd-searchbtn[data-fd-search]:visible').click();
      await expect(input).toBeVisible();
    }
    async function checkQuery(expected, phase = 'matrix') {
      await test.step(`${phase} / ${expected.category}: ${expected.query}`, async () => {
        await input.fill(expected.query);
        // The input event synchronously renders these rows. Read the displayed
        // results, not fdSearchResults or an unprojected source catalogue.
        const rows = await dialog.locator('.fd-result').evaluateAll(elements => elements.map(el => ({
          ref: el.getAttribute('data-fd-safety') || el.getAttribute('data-fd-open'),
          kind: el.hasAttribute('data-fd-safety') ? 'protocol' : 'item',
        })));
        const refs = rows.map(row => row.ref);
        const rank = refs.indexOf(expected.topThree);
        const before = refs.indexOf(expected.before);
        const matches = (actual, wanted) => !wanted || (actual?.ref === wanted.ref && actual?.kind === wanted.kind);
        const passed = rows.length <= 8 && new Set(refs).size === rows.length
          && rows.every(row => Boolean(row.ref))
          && (expected.empty ? rows.length === 0 : rows.length > 0)
          && (!expected.topThree || (rank >= 0 && rank < 3))
          && (!expected.before || before < 0 || rank < before)
          && matches(rows[0], expected.first) && matches(rows[1], expected.second)
          && (!expected.exact || (rows.length === 1 && refs[0] === expected.exact));
        observations.push({ phase, expected, rows, passed });
        expect.soft(passed, JSON.stringify({ expected, observed: rows })).toBe(true);
      });
    }
    try {
      expect(medicationCases).toHaveLength(126);
      await page.goto('/?tab=library', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.fd-fallback[role="alert"]')).toHaveCount(0);
      await expectReleaseRevision(page);
      await openSearch();
      for (const query of medicationCases) await checkQuery(query);

      await test.step('search results open the reading and the safety protocol', async () => {
        await input.fill('lithium/monitoring');
        await dialog.locator('[data-fd-open="med_monitoring.md"]').click();
        await expect(page.locator('.fd-article')).toHaveAttribute('data-ref', 'med_monitoring.md');
        await expect(page.getByRole('heading', { name: 'Medication Monitoring & Labs', exact: true })).toBeVisible();
        await openSearch();
        await input.fill('Ativan alcohol-withdrawal');
        await expect(dialog.locator('.fd-result').first()).toHaveAttribute('data-fd-safety', 't_sud.md');
        await expect(input).toBeFocused();
        // Since C2 (#1091): the first Enter keeps the results on screen and moves focus to the
        // first row (the Substance Use protocol); nothing opens yet. The second Enter opens it.
        await page.keyboard.press('Enter');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.fd-result').first()).toBeFocused();
        await page.keyboard.press('Enter');
        const safety = page.getByRole('dialog', { name: 'Substance Use', exact: true });
        await expect(safety).toBeVisible();
        await expect(dialog).toHaveCount(0);
        await safety.getByRole('button', { name: 'Close side sheet', exact: true }).click();
      });

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectReleaseRevision(page);
      await openSearch();
      for (const query of ['lithium/monitoring', 'Ativan alcohol-withdrawal']) {
        await checkQuery(medicationCases.find(item => item.query === query), 'after reload');
      }
      expect(observations.filter(row => row.phase === 'matrix')).toHaveLength(126);
      expect(observations.filter(row => row.phase === 'after reload')).toHaveLength(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      expect(runtimeErrors).toEqual([]);
    } finally {
      await testInfo.attach('medication-search-results', {
        body: Buffer.from(JSON.stringify({
          project: testInfo.project.name, device, viewport, url: page.url(), releaseSha: RELEASE_SHA,
          expectedQueries: 128, completedQueries: observations.length, runtimeErrors, observations,
        }, null, 2)),
        contentType: 'application/json',
      });
    }
  });
}
