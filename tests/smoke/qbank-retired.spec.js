import { test, expect } from '@playwright/test';
import { requestGetWithRetry } from './net-resilience.js';

// Policy (WP-37, PLAN_Taplinger_Feedback_and_Therapy_Library_2026-08-20.md §A2, decided by
// Dr. Moss): the practice bank serves FACULTY-ATTESTED items only by default; un-attested
// drafts are opt-in via the setup-screen toggle (persisted as cw_qb_drafts_v1) and stay
// clearly labelled when included. Retired items are withheld under every setting.
// This deliberately reverses the 2026-07-15 "serve drafts, marked" decision (see the node
// suite tests/qbank-draft-visibility.test.mjs for the history) — unlike a04a848's silent
// accidental gate, the exclusion is stated on the setup screen. These assert the shipped
// page end-to-end against a bank derived from the shipped one (see deriveTestBank): pool math
// in both toggle states, persistence, and per-question labels.

// Tests may not depend on live review state (the #729 rule). The shipped bank's make-up
// changes every time faculty attest: on 2026-09-29 the rolling sign-off PR #895 attested the
// last five live drafts, and the guards below ("the bank holds drafts") turned red for faculty
// doing their job, which blocked the sign-offs from reaching learners. So each test serves the
// page a bank DERIVED from the shipped one that is guaranteed to hold what these tests need:
// retired items, at least MIN_DRAFTS drafts, and a category that strictly leads on drafts while
// still holding attested items (the label test walks exactly that category). Every item stays a
// real shipped item (same schema, same render paths); only `status` or `retired` is flipped,
// deterministically, and only as far as the guarantee needs.
const MIN_DRAFTS = 3;
const KEEP_ATTESTED = 2;

function deriveTestBank(data) {
  const items = (data.items || data).map((it) => ({ ...it }));
  const live = () => items.filter((it) => !it.retired);
  const isDraft = (it) => !it.retired && it.status !== 'attested';
  const draftsIn = (category) => live().filter((it) => it.category === category && isDraft(it)).length;
  // Retired: keep the shipped ones; only if there are none, retire one attested item.
  if (!items.some((it) => it.retired)) {
    const victim = [...items].reverse().find((it) => it.status === 'attested');
    if (victim) victim.retired = true;
  }
  // The leading category: the one holding the most attested items (ties by name). It gets
  // MIN_DRAFTS drafts while keeping KEEP_ATTESTED attested, then leads strictly: any other
  // category with as many drafts has drafts turned back to attested until it has fewer.
  const attestedBy = {};
  for (const it of live()) if (it.status === 'attested') attestedBy[it.category] = (attestedBy[it.category] || 0) + 1;
  const ranked = Object.entries(attestedBy).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (!ranked.length || ranked[0][1] < MIN_DRAFTS + KEEP_ATTESTED) {
    throw new Error(`question bank too small for this test: no category holds ${MIN_DRAFTS + KEEP_ATTESTED} attested items`);
  }
  const lead = ranked[0][0];
  for (const it of live().filter((q) => q.category === lead && q.status === 'attested')) {
    if (draftsIn(lead) >= MIN_DRAFTS) break;
    it.status = 'draft';
  }
  for (const it of live()) {
    if (it.category !== lead && isDraft(it) && draftsIn(it.category) >= draftsIn(lead)) it.status = 'attested';
  }
  return Array.isArray(data) ? items : { ...data, items };
}

async function bank(page, baseURL) {
  const res = await requestGetWithRetry(page.request, `${baseURL}/question_bank.json`);
  expect(res.ok()).toBeTruthy();
  const data = deriveTestBank(await res.json());
  // The page reads ../question_bank.json; serve it the derived bank for this test, reloads
  // included (service workers are blocked in playwright.config, so the route always applies).
  await page.route('**/question_bank.json', (route) => route.fulfill({ json: data }));
  const items = data.items || data;
  return {
    items,
    served: items.filter((it) => !it.retired),
    retired: items.filter((it) => it.retired),
    drafts: items.filter((it) => !it.retired && it.status !== 'attested'),
    attested: items.filter((it) => !it.retired && it.status === 'attested'),
  };
}

async function shownCount(page) {
  await page.selectOption('#f-size', 'all');
  const countText = (await page.locator('#itemCount').textContent()) || '';
  return parseInt((countText.match(/\d+/) || ['0'])[0], 10);
}

test('the default pool is attested-only; drafts and retired are withheld and the exclusion is stated', async ({ page, baseURL }) => {
  const { items, served, retired, drafts, attested } = await bank(page, baseURL);
  // Guards: this test only proves something if the bank actually holds all three kinds.
  expect(retired.length).toBeGreaterThan(0);
  expect(drafts.length).toBeGreaterThan(0);
  expect(attested.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#f-size');
  const shown = await shownCount(page);
  expect(shown).toBe(attested.length);     // attested only
  expect(shown).not.toBe(served.length);   // drafts withheld
  expect(shown).not.toBe(items.length);    // retired withheld too

  // The exclusion is stated, with the count, and the opt-in is offered unchecked.
  const note = page.locator('.setup-draft-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Draft — not yet faculty-reviewed');
  await expect(note).toContainText(`${drafts.length} draft questions are not served by default`);
  await expect(page.locator('#draftToggle')).not.toBeChecked();
});

test('opting in widens the pool to drafts (labelled per question); the choice persists across reloads', async ({ page, baseURL }) => {
  const { served, drafts } = await bank(page, baseURL);
  expect(drafts.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#draftToggle');
  await page.check('#draftToggle');
  // The toggle re-renders the setup screen with the widened pool and the labelled-count copy.
  const note = page.locator('.setup-draft-note');
  await expect(note).toContainText(`${drafts.length} of these ${served.length} questions`);
  expect(await shownCount(page)).toBe(served.length);

  // Persisted: a fresh load keeps the opt-in.
  await page.reload();
  await page.waitForSelector('#draftToggle');
  await expect(page.locator('#draftToggle')).toBeChecked();
  expect(await shownCount(page)).toBe(served.length);

  // Every served draft is labelled on the question itself. Pick the category with the
  // most drafts and queue all of it, so encountering a draft is guaranteed rather than
  // luck-of-the-shuffle.
  const byCat = {};
  for (const it of served) {
    byCat[it.category] = byCat[it.category] || { total: 0, draft: 0 };
    byCat[it.category].total += 1;
    if (it.status !== 'attested') byCat[it.category].draft += 1;
  }
  const [category, stats] = Object.entries(byCat).sort((a, b) => b[1].draft - a[1].draft)[0];
  expect(stats.draft, 'need a category containing drafts').toBeGreaterThan(0);

  await page.selectOption('#f-cat', category);
  await page.selectOption('#f-size', 'all');
  await page.click('#startBtn');
  await page.waitForSelector('.qcard');

  let sawDraft = 0;
  let sawAttested = 0;
  let visited = 0;
  for (let i = 0; i < stats.total; i += 1) {
    visited += 1;
    const chips = await page.locator('.qcard .chip-draft').count();
    const notices = await page.locator('.qcard .draft-notice').count();
    // The two label surfaces must always agree — neither may appear alone.
    expect(chips).toBe(notices);
    if (chips > 0) {
      sawDraft += 1;
      const notice = page.locator('.qcard .draft-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('not yet faculty-reviewed');
      await expect(notice).toHaveAttribute('role', 'note');
    } else {
      sawAttested += 1;
    }
    // Answer (confidence is gated first), then advance.
    await page.locator('.qcard .conf-btn').first().click();
    await page.locator('#optsList .opt').first().click();
    // A two-tier item holds its feedback, and so Next, behind a rationale choice, as
    // front-door.spec.js's otfAnswerOne already handles. Without this the loop stopped at the
    // first two-tier card: it saw ONE question, so which assertion below failed depended on the
    // shuffle (3 of 8 runs red locally, 2026-09-26, after #830 rewrote cued items as two-tier).
    const rationale = page.locator('#tier2Opts .opt').first();
    if (await rationale.count()) await rationale.click();
    const next = page.locator('#nextBtn');
    await expect(next, 'feedback offers Next on every question').toBeVisible();
    await next.click();
    if (!(await page.locator('.qcard').count())) break;
    await page.waitForSelector('.qcard');
  }

  // The loop must have walked the whole category, or the two counts below describe a sample.
  expect(visited, 'every question in the category was visited').toBe(stats.total);
  expect(sawDraft + sawAttested).toBe(stats.total);
  expect(sawDraft, 'expected labelled drafts in the opted-in pool').toBeGreaterThan(0);
  // Proves the label is item-specific rather than painted on every card.
  expect(sawAttested, 'expected some attested items to carry no label').toBeGreaterThan(0);
});

test('opting back out restores the attested-only default', async ({ page, baseURL }) => {
  const { drafts, attested } = await bank(page, baseURL);
  expect(drafts.length).toBeGreaterThan(0);

  await page.goto('/tools/question-bank-practice.html');
  await page.waitForSelector('#draftToggle');
  await page.check('#draftToggle');
  await expect(page.locator('.setup-draft-note')).toContainText('carry this label');
  await page.uncheck('#draftToggle');
  await expect(page.locator('.setup-draft-note')).toContainText('not served by default');
  expect(await shownCount(page)).toBe(attested.length);

  await page.reload();
  await page.waitForSelector('#draftToggle');
  await expect(page.locator('#draftToggle')).not.toBeChecked();
  expect(await shownCount(page)).toBe(attested.length);
});
