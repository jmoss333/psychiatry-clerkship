import { test, expect } from '@playwright/test';
import { routeFetchWithRetry } from './net-resilience.js';

const TOOL = '/tools/communication-practice.html';
const SAFETY = 'Safety boundary: fictional practice only. Do not enter patient information. There are no free-text patient fields; this tool stores only anonymous practice choices in this browser. It is not clinical advice, legal advice, or a substitute for supervision, local policy, or validated instruments.';

async function openTool(page, query = '') {
  await page.goto(`${TOOL}${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rep-panel]')).toBeVisible();
}

async function visibleWordCount(locator) {
  return locator.evaluate((element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.sr-only, [hidden], [aria-hidden="true"]').forEach((node) => node.remove());
    clone.querySelectorAll('details:not([open]) > :not(summary)').forEach((node) => node.remove());
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;';
    host.append(clone);
    document.body.append(host);
    const text = clone.innerText.replace(/\s+/g, ' ').trim();
    host.remove();
    return text ? text.split(' ').length : 0;
  });
}

async function expectPhase(page, phase, standaloneActions) {
  const panel = page.locator(`[data-rep-panel][data-phase="${phase}"]`);
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-primary-task]')).toHaveCount(1);
  await expect(panel.locator('[data-primary-action]')).toHaveCount(standaloneActions);
  await expect(page.locator('#rep-status[aria-live="polite"][aria-atomic="true"]')).toHaveCount(1);
  return panel;
}

async function observeAnnouncements(page) {
  await page.evaluate(() => {
    const status = document.querySelector('#rep-status');
    window.__repAnnouncements = [];
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') {
          const text = record.target.data.trim();
          if (text) window.__repAnnouncements.push(text);
        }
        for (const node of record.addedNodes) {
          const text = node.textContent?.trim();
          if (text) window.__repAnnouncements.push(text);
        }
      }
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
}

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function startAndFinish(page) {
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await page.getByRole('button', { name: 'Finish now' }).click();
}

async function tabUntilFocused(page, locator, { reverse = false, limit = 45 } = {}) {
  for (let step = 0; step < limit; step += 1) {
    if (await locator.evaluate((element) => document.activeElement === element)) return;
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
  }
  await expect(locator).toBeFocused();
}

test('one rep reveals choices only after speaking and feedback only after comparison', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openTool(page, '?case=guardedness_privacy_001');
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('[data-choice-id]')).toHaveCount(0);
  await expect(page.locator('[data-deeper-coaching]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await expectPhase(page, 'speaking', 1);
  await expect(page.getByText('Give one first sentence aloud', { exact: true })).toBeVisible();
  await expect(page.locator('[data-choice-id]')).toHaveCount(0);

  const nudge = page.locator('[data-starter-cue]');
  await nudge.getByText('Need one starter cue?', { exact: true }).click();
  await expect(nudge).toContainText('Use one sentence to give the patient more control before asking for more information.');
  await expect(page.locator('[data-choice-id]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Finish now' }).click();
  await expectPhase(page, 'compare', 0);
  await expect(page.getByRole('group', { name: 'Which line is closest to your response?' })).toBeVisible();

  await page.locator('[data-choice-id="b"]').click();
  const feedback = await expectPhase(page, 'feedback', 1);
  await expect(feedback).toContainText('Best next line');
  await expect(feedback).toContainText('Say it again');
  await expect(page.locator('[data-deeper-coaching]')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Try the next related case' })).toBeVisible();

  const caseData = await page.evaluate(async () => {
    const data = await fetch('../communication_cases.json').then((response) => response.json());
    return data.cases.find((item) => item.id === 'guardedness_privacy_001');
  });
  await page.locator('[data-deeper-coaching]').evaluate((details) => { details.open = true; });
  await expect(page.locator('[data-deeper-coaching]')).toContainText('Practice goal');
  await expect(page.locator('[data-deeper-coaching]')).toContainText('Stance');
  await expect(page.locator('[data-deeper-coaching]')).toContainText('Include');
  await expect(page.locator('[data-deeper-coaching]')).toContainText('Avoid');
  await expect(page.locator('[data-deeper-coaching]')).toContainText('Supervisor huddle');
  await expect(page.locator('[data-deeper-coaching]')).toContainText('Try this today');
  await expect(page.locator('[data-deeper-coaching]')).toContainText(caseData.linkedPages[0].replace(/\.md$/, ''));
  await expect(page.locator('[data-deeper-coaching]')).toContainText(caseData.evidenceIds[0]);
  await expect(page.locator('[data-deeper-coaching]')).toContainText('Stored: case id, choice id, quality, and date.');
  const storedBefore = await page.evaluate(() => localStorage.getItem('cw_comm_v1'));
  await page.getByRole('button', { name: 'Name choice' }).click();
  await expect(page.getByText('Target for this session:', { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(storedBefore);
  expect(errors).toEqual([]);
});

test('the absolute deadline advances to compare after a throttled interval', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  await openTool(page, '?case=bpd_rupture_repair_001');
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await expect(page.locator('[data-countdown]')).toHaveText('20 seconds');
  await page.clock.fastForward(20_001);
  await expectPhase(page, 'compare', 0);
});

test('all authored cases fit the orient and feedback word budgets', async ({ page }) => {
  await openTool(page);
  const cases = await page.evaluate(async () => {
    const data = await fetch('../communication_cases.json').then((response) => response.json());
    return data.cases.map((item) => ({ id: item.id, choiceIds: item.choices.map((choice) => choice.id) }));
  });

  for (const caseData of cases) {
    await openTool(page, `?case=${caseData.id}`);
    expect(await visibleWordCount(page.locator('[data-rep-panel]')), `Orient word budget for ${caseData.id}`).toBeLessThan(60);
    for (const choiceId of caseData.choiceIds) {
      await openTool(page, `?case=${caseData.id}`);
      await startAndFinish(page);
      await page.locator(`[data-choice-id="${choiceId}"]`).click();
      expect(await visibleWordCount(page.locator('[data-rep-panel]')), `Feedback word budget for ${caseData.id}/${choiceId}`).toBeLessThan(55);
    }
  }
});

test('phase focus and announcements follow one completed rep', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await openTool(page, '?case=guardedness_privacy_001');
  const caseData = await page.evaluate(async () => {
    const data = await fetch('../communication_cases.json').then((response) => response.json());
    return data.cases.find((item) => item.id === 'guardedness_privacy_001');
  });
  await observeAnnouncements(page);
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await expect(page.locator('#phase-heading')).toBeFocused();
  const cue = page.getByText('Need one starter cue?', { exact: true });
  await cue.focus();
  await page.clock.fastForward(1_000);
  await expect(cue).toBeFocused();
  await page.getByRole('button', { name: 'Finish now' }).click();
  await expect(page.locator('#phase-heading')).toBeFocused();
  const choice = page.locator('[data-choice-id="b"]');
  await choice.click();
  await expect(page.locator('#phase-heading')).toBeFocused();
  await expect(page.locator('[data-selected-choice]')).toBeHidden();
  const selectedId = await page.locator('[data-selected-choice]').getAttribute('id');
  await expect(page.locator('[data-feedback]')).toHaveAttribute('aria-describedby', selectedId);
  const messages = await page.evaluate(() => window.__repAnnouncements || []);
  const authoredFeedback = caseData.choices.find((choiceData) => choiceData.id === 'b').feedback;
  expect(messages).toContain('Spoken response started. 20 seconds.');
  expect(messages.filter((text) => text === authoredFeedback)).toHaveLength(1);
  expect(messages.filter((text) => text.includes('Best next line')).length).toBe(0);
  expect(errors).toEqual([]);
});

test('keyboard-only flow preserves focus and sparse announcements', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTool(page, '?case=guardedness_privacy_001');
  const cases = await page.evaluate(async () => {
    const data = await fetch('../communication_cases.json').then((response) => response.json());
    return data.cases.map(({ id, title, skillTags, linkedPages, choices }) => ({
      id,
      title,
      skillTags,
      linkedPages,
      choices: choices.map(({ id: choiceId, feedback }) => ({ id: choiceId, feedback })),
    }));
  });
  const initialCase = cases.find((item) => item.id === 'guardedness_privacy_001');
  const familyCase = cases.find((item) => item.id === 'family_meeting_opening_001');
  const collateralCase = cases.find((item) => item.id === 'collateral_questions_001');
  expect(initialCase).toBeTruthy();
  expect(familyCase).toBeTruthy();
  expect(collateralCase).toBeTruthy();
  const feedback = initialCase.choices.find((item) => item.id === 'b').feedback;

  const heading = page.locator('#phase-heading');
  const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]');
  const start = page.getByRole('button', { name: 'Start 20-second response' });
  await observeAnnouncements(page);
  await tabUntilFocused(page, start);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  await expect(liveRegion).toHaveText('Spoken response started. 20 seconds.');

  const starterCue = page.locator('[data-starter-cue] summary');
  await tabUntilFocused(page, starterCue);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-starter-cue]')).toHaveAttribute('open', '');
  await page.clock.fastForward(1_000);
  await expect(starterCue).toBeFocused();
  await expect(liveRegion).toHaveCount(1);

  const finish = page.getByRole('button', { name: 'Finish now' });
  await tabUntilFocused(page, finish, { reverse: true });
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  await expect(liveRegion).toHaveText('Compare your sentence with the choices.');

  const choice = page.locator('[data-choice-id="b"]');
  await tabUntilFocused(page, choice);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  await expect(liveRegion).toHaveText(feedback);
  await expect(page.locator('[data-selected-choice]')).toBeHidden();
  await expect(page.locator('[data-feedback]')).toHaveAttribute(
    'aria-describedby',
    await page.locator('[data-selected-choice]').getAttribute('id'),
  );
  const messages = await page.evaluate(() => window.__repAnnouncements || []);
  expect(messages).toContain('Spoken response started. 20 seconds.');
  expect(messages.filter((message) => message === feedback)).toHaveLength(1);
  expect(messages.some((message) => message.includes('Best next line'))).toBe(false);
  expect(messages.filter((message) => /^\d+ seconds? remaining\.$/.test(message))).toEqual([]);

  const deeperCoaching = page.locator('[data-deeper-coaching] summary');
  await tabUntilFocused(page, deeperCoaching);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-deeper-coaching]')).toHaveAttribute('open', '');
  const tryToday = page.getByRole('button', { name: 'Name choice' });
  await tabUntilFocused(page, tryToday);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-deeper-coaching]')).toHaveAttribute('open', '');

  const related = page.getByRole('button', { name: 'Try the next related case' });
  await tabUntilFocused(page, related);
  await page.keyboard.press('Enter');
  const relatedId = await page.locator('[data-desktop-navigator] [aria-current="true"]').getAttribute('data-case-select');
  const relatedCase = cases.find((item) => item.id === relatedId);
  expect(relatedId).not.toBe(initialCase.id);
  expect(relatedCase).toBeTruthy();
  expect(
    relatedCase.skillTags.some((tag) => initialCase.skillTags.includes(tag)) ||
    relatedCase.linkedPages.some((pageName) => initialCase.linkedPages.includes(pageName)),
  ).toBe(true);
  await expect(page.locator('[data-rep-panel]')).toHaveAttribute('data-phase', 'orient');
  await expect(heading).toHaveText(relatedCase.title);
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);

  await tabUntilFocused(page, start);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  await expect(page.locator('[data-starter-cue]')).not.toHaveAttribute('open', '');
  await tabUntilFocused(page, finish);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  await tabUntilFocused(page, choice);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  await expect(page.locator('[data-deeper-coaching]')).not.toHaveAttribute('open', '');
  await tabUntilFocused(page, deeperCoaching);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-deeper-coaching]')).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-deeper-coaching]')).not.toHaveAttribute('open', '');

  const desktopCase = page.locator('[data-desktop-navigator] [data-case-select="family_meeting_opening_001"]');
  await tabUntilFocused(page, desktopCase);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-rep-panel]')).toHaveAttribute('data-phase', 'orient');
  await expect(desktopCase).toHaveAttribute('aria-current', 'true');
  await expect(heading).toHaveText(familyCase.title);
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const browse = page.getByRole('button', { name: 'Browse cases' });
  await tabUntilFocused(page, browse);
  await page.keyboard.press('Enter');
  const picker = page.getByRole('dialog', { name: 'Browse communication cases' });
  await expect(picker).toBeVisible();
  await expect(liveRegion).toHaveCount(1);
  await expect(picker.getByRole('button', { name: 'All', exact: true })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(browse).toBeFocused();
  await expect(liveRegion).toHaveCount(1);

  await page.keyboard.press('Enter');
  await expect(picker).toBeVisible();
  const closePicker = picker.getByRole('button', { name: 'Close case browser' });
  await tabUntilFocused(page, closePicker, { reverse: true });
  await page.keyboard.press('Enter');
  await expect(picker).toBeHidden();
  await expect(browse).toBeFocused();
  await expect(liveRegion).toHaveCount(1);

  await page.keyboard.press('Enter');
  await expect(picker).toBeVisible();
  const mobileCase = picker.locator('[data-case-select="collateral_questions_001"]');
  await tabUntilFocused(page, mobileCase);
  await page.keyboard.press('Enter');
  await expect(picker).toBeHidden();
  await expect(page.locator('[data-rep-panel]')).toHaveAttribute('data-phase', 'orient');
  await expect(page.locator('[data-desktop-navigator] [data-case-select="collateral_questions_001"]')).toHaveAttribute('aria-current', 'true');
  await expect(heading).toHaveText(collateralCase.title);
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('timer announces only start five seconds and completion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  await openTool(page, '?case=guardedness_privacy_001');
  await observeAnnouncements(page);
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await expect(page.locator('[data-countdown][role="timer"][aria-live="off"]')).toHaveText('20 seconds');
  await page.clock.fastForward(15_001);
  await page.clock.fastForward(5_001);
  await expectPhase(page, 'compare', 0);
  await expect.poll(() => page.evaluate(() => window.__repAnnouncements || [])).toEqual([
    'Spoken response started. 20 seconds.',
    '5 seconds remaining.',
    'Time is up. Compare your sentence with the choices.',
  ]);
});

test('pagehide interrupts the rep without stale activity', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await openTool(page, '?case=guardedness_privacy_001');
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const snapshot = await page.evaluate(() => ({
    phase: document.querySelector('[data-rep-panel]')?.getAttribute('data-phase'),
    countdown: document.querySelector('[data-countdown]')?.textContent,
    status: document.querySelector('#rep-status')?.textContent,
  }));
  await page.clock.fastForward(30_000);
  await expect.poll(() => page.evaluate(() => ({
    phase: document.querySelector('[data-rep-panel]')?.getAttribute('data-phase'),
    countdown: document.querySelector('[data-countdown]')?.textContent,
    status: document.querySelector('#rep-status')?.textContent,
  }))).toEqual(snapshot);
  expect(snapshot.status).not.toContain('Time is up');
  expect(errors).toEqual([]);
});

test('spoken reps request no media and accept no text', async ({ page }) => {
  await page.addInitScript(() => {
    window.__mediaCounts = { getUserMedia: 0, MediaRecorder: 0, SpeechRecognition: 0, webkitSpeechRecognition: 0 };
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = () => { window.__mediaCounts.getUserMedia += 1; return Promise.reject(new Error('not allowed')); };
    window.MediaRecorder = function () { window.__mediaCounts.MediaRecorder += 1; };
    window.SpeechRecognition = function () { window.__mediaCounts.SpeechRecognition += 1; };
    window.webkitSpeechRecognition = function () { window.__mediaCounts.webkitSpeechRecognition += 1; };
  });
  await openTool(page, '?case=guardedness_privacy_001');
  await startAndFinish(page);
  await page.locator('[data-choice-id="b"]').click();
  await expect(page.locator('textarea, input:not([type="hidden"]), [contenteditable="true"], audio, video')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__mediaCounts)).toEqual({ getUserMedia: 0, MediaRecorder: 0, SpeechRecognition: 0, webkitSpeechRecognition: 0 });
});

test('all faculty review statuses are labeled truthfully within the orient budget', async ({ page }) => {
  const reviewer = 'Faculty <Review> & Longitudinal Quality Council';
  await page.route('**/communication_cases.json', async (route) => {
    const response = await routeFetchWithRetry(route);
    const data = await response.json();
    data.cases[0].facultyReview = { status: 'reviewed', reviewer, lastReviewed: '2026-08-01' };
    data.cases[1].facultyReview = { status: 'pending', reviewer: '', lastReviewed: '' };
    data.cases[2].facultyReview = { status: 'retired', reviewer: '', lastReviewed: '' };
    data.cases[3].facultyReview = { status: 'draft', reviewer: '', lastReviewed: '' };
    await route.fulfill({ response, json: data });
  });
  for (const [caseId, label] of [
    ['suicide_direct_question_001', 'Reviewed'],
    ['psychosis_validation_001', 'Pending faculty review'],
    ['guardedness_privacy_001', 'Retired'],
    ['rupture_limit_setting_001', 'Draft · faculty review needed'],
  ]) {
    await openTool(page, `?case=${caseId}`);
    const panel = page.locator('[data-rep-panel][data-phase="orient"]');
    await expect(panel.getByText(label, { exact: true })).toBeVisible();
    await expect(panel).not.toContainText(reviewer);
    await expect(panel).not.toContainText('2026-08-01');
    expect(await visibleWordCount(panel), `Orient word budget for ${caseId}`).toBeLessThan(60);
  }
});

test('reviewer attribution remains escaped inside deeper coaching', async ({ page }) => {
  const reviewer = 'Faculty <Review> & Longitudinal Quality Council';
  await page.route('**/communication_cases.json', async (route) => {
    const response = await routeFetchWithRetry(route);
    const data = await response.json();
    data.cases[0].facultyReview = { status: 'reviewed', reviewer, lastReviewed: '2026-08-01' };
    await route.fulfill({ response, json: data });
  });
  await openTool(page, '?case=suicide_direct_question_001');
  await expect(page.locator('[data-rep-panel]')).not.toContainText(reviewer);
  await startAndFinish(page);
  await page.locator('[data-choice-id="b"]').click();
  const attribution = page.getByText(`Reviewed by ${reviewer} on 2026-08-01.`, { exact: true });
  await expect(attribution).toBeHidden();
  await page.locator('[data-deeper-coaching] summary').click();
  await expect(attribution).toBeVisible();
});

test('storage contract preserves prior and unrelated data', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  await openTool(page);
  await page.evaluate(() => {
    localStorage.setItem('cw_comm_v1', JSON.stringify({
      psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-07-31' },
    }));
    localStorage.setItem('cw_unrelated_test', JSON.stringify({ keep: true }));
    // A card another tool scheduled into the SHARED review store. This tool writes COMM#
    // cards there now, so the contract that matters is no longer "creates no cw_ key" but
    // "adds its own card and leaves every other tool's alone".
    localStorage.setItem('cw_srs_v1', JSON.stringify({
      v: 1,
      cards: { 'FAM#collateral_baseline_safety_001#opening': { ease: 2.5, ivl: 4, reps: 3, lapses: 0, due: 1, last: 0 } },
      day: { lastDay: '', newToday: 0 },
      stats: { streak: 2, lastStudy: '2026-07-31', totalReviews: 9, correct: 7, seen: 9 },
      settings: { newPerDay: 12 },
    }));
  });
  const cwKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cw_')).sort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rep-panel]')).toBeVisible();
  await expect(page.locator('[data-desktop-navigator] [data-case-select="psychosis_validation_001"] .case-status')).toHaveText('Practiced well');

  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await page.getByRole('button', { name: 'Finish now' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(JSON.stringify({
    psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-07-31' },
  }));

  await page.locator('[data-desktop-navigator] [data-case-select="suicide_direct_question_001"]').click();
  await startAndFinish(page);
  await page.locator('[data-choice-id="b"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cw_comm_v1')))).toEqual({
    psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-07-31' },
    suicide_direct_question_001: { choiceId: 'b', quality: 'best', at: '2026-08-01' },
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_unrelated_test'))).toBe(JSON.stringify({ keep: true }));
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cw_')).sort())).toEqual(cwKeysBefore);

  // The rep scheduled its own card for daily review, under the id review.html builds.
  await expect.poll(() => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('cw_srs_v1'));
    return Object.keys(s.cards).sort();
  })).toEqual(['COMM#suicide_direct_question_001', 'FAM#collateral_baseline_safety_001#opening']);
  // ...without disturbing the other tool's card, or the retention stats, which count only
  // what Daily Review itself served.
  await expect.poll(() => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('cw_srs_v1'));
    return { fam: s.cards['FAM#collateral_baseline_safety_001#opening'], stats: s.stats };
  })).toEqual({
    fam: { ease: 2.5, ivl: 4, reps: 3, lapses: 0, due: 1, last: 0 },
    stats: { streak: 2, lastStudy: '2026-07-31', totalReviews: 9, correct: 7, seen: 9 },
  });
});

for (const [name, raw] of [
  ['malformed JSON', '{bad json'],
  ['null', 'null'],
  ['array', '[]'],
  ['primitive', '"not an attempt map"'],
  ['malformed records', JSON.stringify({
    psychosis_validation_001: { choiceId: 'b', quality: 'constructor', at: '2026-07-31' },
    suicide_direct_question_001: { choiceId: '', quality: 'best', at: '2026-07-31' },
  })],
]) {
  test(`corrupt history: ${name}`, async ({ page }) => {
    const errors = collectRuntimeErrors(page);
    await openTool(page);
    await page.evaluate((value) => {
      localStorage.setItem('cw_comm_v1', value);
      localStorage.setItem('cw_unrelated_test', JSON.stringify({ keep: true }));
    }, raw);
    const seeded = await page.evaluate(() => localStorage.getItem('cw_comm_v1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectPhase(page, 'orient', 1);
    await expect(page.locator('[data-desktop-navigator] [data-case-select="psychosis_validation_001"] .case-status')).toHaveText('Not practiced');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(seeded);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_unrelated_test'))).toBe(JSON.stringify({ keep: true }));
    expect(errors).toEqual([]);
  });
}

test('history reset removes only communication attempts', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await openTool(page);
  await expect(page.locator('[data-reset-history]')).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem('cw_comm_v1', JSON.stringify({
      guardedness_privacy_001: { choiceId: 'b', quality: 'best', at: '2026-08-01' },
    }));
    localStorage.setItem('cw_unrelated_test', JSON.stringify({ keep: true }));
    // Reset now reaches into the SHARED review store to drop this tool's own cards. The
    // card below belongs to another tool and must survive; the COMM# one must not.
    localStorage.setItem('cw_srs_v1', JSON.stringify({
      v: 1,
      cards: {
        'COMM#guardedness_privacy_001': { ease: 2.5, ivl: 1, reps: 1, lapses: 0, due: 1, last: 0 },
        'TOPIC#t_mood.md': { ease: 2.5, ivl: 6, reps: 4, lapses: 0, due: 2, last: 0 },
      },
      day: { lastDay: '', newToday: 0 },
      stats: { streak: 2, lastStudy: '2026-08-01', totalReviews: 9, correct: 7, seen: 9 },
      settings: { newPerDay: 12 },
    }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const details = page.locator('[data-desktop-navigator] [data-practice-details]');
  await details.getByText('Practice details', { exact: true }).click();
  const reset = page.locator('[data-desktop-navigator] [data-reset-history]');
  await expect(reset).toBeVisible();

  let dismissedMessage = '';
  page.once('dialog', async (dialog) => {
    dismissedMessage = dialog.message();
    await dialog.dismiss();
  });
  await reset.click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).not.toBeNull();
  expect(dismissedMessage).toBe('Reset all What Do You Say Next practice history stored in this browser? This also removes these cases from daily review. It does not affect page progress, dashboard settings, or other tools.');
  // Dismissing the dialog must leave the shared store untouched too, not just cw_comm_v1.
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cw_srs_v1')).cards).sort()))
    .toEqual(['COMM#guardedness_privacy_001', 'TOPIC#t_mood.md']);

  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await observeAnnouncements(page);
  await page.locator('[data-desktop-navigator] [data-practice-details] summary').click();
  const resetDuringSpeaking = page.locator('[data-desktop-navigator] [data-reset-history]');
  await expect(resetDuringSpeaking).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await tabUntilFocused(page, resetDuringSpeaking);
  await page.keyboard.press('Enter');
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#phase-heading')).toBeFocused();
  await expect(page.locator('#rep-status')).toHaveText('');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_unrelated_test'))).toBe(JSON.stringify({ keep: true }));
  // Confirming drops this tool's scheduled cards and nothing else in the shared store.
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cw_srs_v1')).cards).sort()))
    .toEqual(['TOPIC#t_mood.md']);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cw_srs_v1')).stats))
    .toEqual({ streak: 2, lastStudy: '2026-08-01', totalReviews: 9, correct: 7, seen: 9 });
  const snapshot = await page.evaluate(() => ({
    phase: document.querySelector('[data-rep-panel]')?.getAttribute('data-phase'),
    countdown: document.querySelector('[data-countdown]')?.textContent || null,
    status: document.querySelector('#rep-status')?.textContent,
    announcements: (window.__repAnnouncements || []).slice(),
  }));
  await page.clock.fastForward(30_000);
  await expect.poll(() => page.evaluate(() => ({
    phase: document.querySelector('[data-rep-panel]')?.getAttribute('data-phase'),
    countdown: document.querySelector('[data-countdown]')?.textContent || null,
    status: document.querySelector('#rep-status')?.textContent,
    announcements: (window.__repAnnouncements || []).slice(),
  }))).toEqual(snapshot);
  await expect(page.locator('[data-reset-history]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('valid deep links select their requested case', async ({ page }) => {
  await openTool(page, '?case=family_meeting_opening_001&filter=family');
  const navigator = page.locator('[data-desktop-navigator]');
  await expect(navigator.locator('[data-case-select="family_meeting_opening_001"]')).toHaveAttribute('aria-current', 'true');
  await expect(navigator.locator('[data-filter="family"]')).toHaveAttribute('aria-pressed', 'true');

  await openTool(page, '?filter=family');
  await expect(navigator.locator('[data-case-select="family_meeting_opening_001"]')).toHaveAttribute('aria-current', 'true');
  await expectPhase(page, 'orient', 1);

  await openTool(page, '?case=family_meeting_opening_001&filter=safety');
  await expect(navigator.locator('[data-case-select="family_meeting_opening_001"]')).toHaveAttribute('aria-current', 'true');
  await expect(navigator.locator('[data-filter="family"]')).toHaveAttribute('aria-pressed', 'true');
});

test('invalid routes recover honestly', async ({ page }) => {
  await openTool(page, '?filter=not-a-filter');
  await expect(page.locator('[data-desktop-navigator] [data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');

  await openTool(page, '?case=removed_case&filter=family');
  const navigator = page.locator('[data-desktop-navigator]');
  await expect(navigator.locator('[data-case-select="family_meeting_opening_001"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-route-notice]')).toHaveText('That practice case is no longer available.');
  await navigator.locator('[data-case-select="collateral_questions_001"]').click();
  await expect(page.locator('[data-route-notice]')).toHaveCount(0);

  await openTool(page, '?case=removed_case&filter=family');
  await expect(page.locator('[data-route-notice]')).toHaveText('That practice case is no longer available.');
  await navigator.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.locator('[data-route-notice]')).toHaveCount(0);
});

test('load failure offers a working retry', async ({ page }) => {
  let requestCount = 0;
  await page.route('**/communication_cases.json', async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } else {
      await route.continue();
    }
  });

  await page.goto(TOOL, { waitUntil: 'domcontentloaded' });
  const error = page.locator('[data-load-error]');
  await expect(error).toContainText('Could not load communication cases.');
  await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(error.getByRole('link', { name: 'Return to the library' })).toHaveAttribute('href', '../index.html');
  await error.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('[data-rep-panel][data-phase="orient"]')).toBeVisible();
});

for (const [name, body] of [
  ['missing cases', '{}'],
  ['empty cases', JSON.stringify({ cases: [] })],
  ['non-array cases', JSON.stringify({ cases: {} })],
]) {
  test(`invalid case bank: ${name} offers retry`, async ({ page }) => {
    let requestCount = 0;
    await page.route('**/communication_cases.json', async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await route.fulfill({ status: 200, contentType: 'application/json', body });
      } else {
        await route.continue();
      }
    });
    await page.goto(TOOL, { waitUntil: 'domcontentloaded' });
    const error = page.locator('[data-load-error]');
    await expect(error).toContainText('Could not load communication cases.');
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('[data-rep-panel][data-phase="orient"]')).toBeVisible();
  });
}

test('safety boundary remains visible', async ({ page }) => {
  await openTool(page);
  await expect(page.getByText(SAFETY, { exact: true })).toBeVisible();
});

test('desktop navigator keeps browsing useful but secondary', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTool(page, '?case=guardedness_privacy_001');

  const navigator = page.locator('[data-desktop-navigator]');
  await expect(navigator).toBeVisible();
  await expect(page.locator('[data-mobile-summary]')).toBeHidden();
  await expect(navigator).toContainText('0 of 12 practiced');
  await expect(navigator.locator('[data-case-select]')).toHaveCount(12);
  await expect(navigator.locator('.case-status')).toHaveText(Array(12).fill('Not practiced'));
  await expect(navigator.locator('[data-case-select="guardedness_privacy_001"]')).toHaveAttribute('aria-current', 'true');

  const familyFilter = navigator.getByRole('button', { name: 'Family', exact: true });
  await tabUntilFocused(page, familyFilter);
  await page.keyboard.press('Enter');
  await expect(navigator.locator('[data-case-select]')).toHaveCount(3);
  await expect(navigator.locator('[data-case-select="family_meeting_opening_001"]')).toHaveAttribute('aria-current', 'true');
  await expectPhase(page, 'orient', 1);
  await expect(navigator.getByRole('button', { name: 'Family', exact: true })).toBeFocused();

  const beforeSurprise = await navigator.locator('[aria-current="true"]').getAttribute('data-case-select');
  const storedBefore = await page.evaluate(() => localStorage.getItem('cw_comm_v1'));
  await navigator.getByRole('button', { name: 'Surprise me' }).click();
  await expectPhase(page, 'orient', 1);
  await expect(navigator.locator('[aria-current="true"]')).not.toHaveAttribute('data-case-select', beforeSurprise);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(storedBefore);

  const details = navigator.locator('[data-practice-details]');
  await expect(details).not.toHaveAttribute('open', '');
  await details.getByText('Practice details', { exact: true }).click();
  await expect(details).toContainText('Family');
  await expect(details).toContainText('Local practice history');
  await expect(details.getByRole('button', { name: 'Reset local history' })).toHaveCount(0);

  const strip = navigator.locator('[data-filter-strip]');
  await expect(strip).toHaveCSS('flex-wrap', 'nowrap');
  await expect(strip).toHaveCSS('overflow-x', /auto|scroll/);
  expect(await strip.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('overall filter and domain progress stay truthful in both navigators', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cw_comm_v1', JSON.stringify({
      suicide_direct_question_001: { choiceId: 'b', quality: 'best', at: '2026-08-02' },
      psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-08-02' },
      family_meeting_opening_001: { choiceId: 'b', quality: 'best', at: '2026-08-02' },
      medication_ambivalence_001: { choiceId: 'b', quality: 'best', at: '2026-08-02' },
    }));
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTool(page);

  const desktop = page.locator('[data-desktop-navigator]');
  await expect(desktop.locator('.sidehead')).toHaveText('4 of 12 practiced');
  await desktop.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(desktop.locator('.sidehead')).toHaveText('4 of 12 practiced');
  let desktopDetails = desktop.locator('[data-practice-details]');
  await desktopDetails.getByText('Practice details', { exact: true }).click();
  await expect(desktopDetails).toContainText('Local practice history: 1 of 3 visible cases practiced.');

  const expectedDomains = [
    ['Safety', '1/4'],
    ['Psychosis', '1/3'],
    ['Family', '1/3'],
    ['Medication', '1/2'],
    ['Rupture', '0/3'],
    ['Guarded', '0/2'],
    ['Rounds', '0/1'],
  ];
  const desktopDomains = desktopDetails.getByRole('group', { name: 'Communication skill domain progress' });
  for (const [label, count] of expectedDomains) {
    await expect(desktopDomains.getByRole('group', { name: `${label}: ${count.replace('/', ' of ')} practiced` })).toBeVisible();
  }

  await desktop.getByRole('button', { name: 'Medication', exact: true }).click();
  await expect(desktop.locator('.sidehead')).toHaveText('4 of 12 practiced');
  desktopDetails = desktop.locator('[data-practice-details]');
  await desktopDetails.getByText('Practice details', { exact: true }).click();
  await expect(desktopDetails).toContainText('Local practice history: 1 of 2 visible cases practiced.');

  const mobileDetails = page.locator('#case-picker [data-practice-details]');
  expect((await mobileDetails.textContent()).replace(/\s+/g, ' ').trim()).toBe(
    (await desktopDetails.textContent()).replace(/\s+/g, ' ').trim(),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-mobile-summary]')).toContainText('4 of 12 practiced');
  await page.getByRole('button', { name: 'Browse cases' }).click();
  await mobileDetails.getByText('Practice details', { exact: true }).click();
  await expect(mobileDetails).toBeVisible();
  await expect(mobileDetails).toContainText('Local practice history: 1 of 2 visible cases practiced.');
  const mobileDomains = mobileDetails.getByRole('group', { name: 'Communication skill domain progress' });
  for (const [label, count] of expectedDomains) {
    await expect(mobileDomains.getByRole('group', { name: `${label}: ${count.replace('/', ' of ')} practiced` })).toBeVisible();
  }
});

test('desktop navigator maps stored practice quality to one status per case', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cw_comm_v1', JSON.stringify({
      suicide_direct_question_001: { choiceId: 'a', quality: 'best', at: '2026-08-02' },
      psychosis_validation_001: { choiceId: 'a', quality: 'partial', at: '2026-08-02' },
      guardedness_privacy_001: { choiceId: 'a', quality: 'missed', at: '2026-08-02' },
      rupture_limit_setting_001: { choiceId: 'a', quality: 'harmful', at: '2026-08-02' },
    }));
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTool(page);
  const navigator = page.locator('[data-desktop-navigator]');
  for (const [id, status] of [
    ['suicide_direct_question_001', 'Practiced well'],
    ['psychosis_validation_001', 'Practiced'],
    ['guardedness_privacy_001', 'Review'],
    ['rupture_limit_setting_001', 'Retry'],
    ['bpd_rupture_repair_001', 'Not practiced'],
  ]) {
    await expect(navigator.locator(`[data-case-select="${id}"] .case-status`)).toHaveText(status);
  }
  await expect(navigator.locator('[data-practice-details] summary')).toHaveText('Practice details');
  await navigator.locator('[data-practice-details] summary').click();
  await expect(navigator.getByRole('button', { name: 'Reset local history' })).toBeVisible();
});

test('related case progression returns to orient', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openTool(page, '?case=guardedness_privacy_001');
  const originalId = await page.locator('[data-desktop-navigator] [aria-current="true"]').getAttribute('data-case-select');
  await startAndFinish(page);
  await page.locator('[data-choice-id="b"]').click();
  await page.getByRole('button', { name: 'Try the next related case' }).click();
  await expectPhase(page, 'orient', 1);
  const selectedId = await page.locator('[data-desktop-navigator] [aria-current="true"]').getAttribute('data-case-select');
  expect(selectedId).not.toBe(originalId);
  expect(await page.evaluate(async ({ originalId: from, selectedId: to }) => {
    const data = await fetch('../communication_cases.json').then((response) => response.json());
    const original = data.cases.find((item) => item.id === from);
    const selected = data.cases.find((item) => item.id === to);
    return selected.skillTags.some((tag) => original.skillTags.includes(tag)) ||
      selected.linkedPages.some((linkedPage) => original.linkedPages.includes(linkedPage));
  }, { originalId, selectedId })).toBe(true);
  await expect(page.locator('[data-desktop-navigator] [data-case-select="guardedness_privacy_001"] .case-status')).toHaveText('Practiced well');
  expect(errors).toEqual([]);
});

test('related progression keeps the destination visible in the active navigator', async ({ page }) => {
  await openTool(page, '?case=family_meeting_opening_001&filter=family');
  await startAndFinish(page);
  await page.locator('[data-choice-id="b"]').click();
  await page.getByRole('button', { name: 'Try the next related case' }).click();

  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#phase-heading')).toBeFocused();
  await expect(page.locator('[data-desktop-navigator] [data-filter="family"]')).toHaveAttribute('aria-pressed', 'true');
  const desktopCurrent = page.locator('[data-desktop-navigator] [data-case-select][aria-current="true"]');
  const mobileCurrent = page.locator('#case-picker [data-case-select][aria-current="true"]');
  await expect(desktopCurrent).toHaveCount(1);
  await expect(mobileCurrent).toHaveCount(1);
  const destination = await desktopCurrent.getAttribute('data-case-select');
  expect(destination).not.toBe('family_meeting_opening_001');
  await expect(mobileCurrent).toHaveAttribute('data-case-select', destination);
  await expect(page.locator('#phase-heading')).toHaveText(await desktopCurrent.locator('.case-title').innerText());
});

test('deeper coaching preserves tailored supervisor huddles', async ({ page }) => {
  for (const [caseId, prompt] of [
    ['medication_ambivalence_001', 'After this line lands, what would tell me I am exploring ambivalence instead of persuading?'],
    ['guardedness_privacy_001', 'After this line lands, how can I lower pressure while still explaining safety limits clearly?'],
    ['collateral_questions_001', 'After this line lands, what family system detail or collateral question would most change the plan?'],
  ]) {
    await openTool(page, `?case=${caseId}`);
    await startAndFinish(page);
    await page.locator('[data-choice-id="b"]').click();
    const coaching = page.locator('[data-deeper-coaching]');
    await coaching.getByText('Deeper coaching', { exact: true }).click();
    await expect(coaching.getByText(prompt, { exact: true })).toBeVisible();
  }
});

test('case and filter changes interrupt speaking', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await openTool(page, '?case=guardedness_privacy_001');
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await page.locator('[data-desktop-navigator] [data-case-select="psychosis_validation_001"]').click();
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#rep-status')).toHaveText('');
  await page.clock.fastForward(30_000);
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#rep-status')).toHaveText('');

  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await page.locator('[data-desktop-navigator]').getByRole('button', { name: 'Family', exact: true }).click();
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#rep-status')).toHaveText('');
  await page.clock.fastForward(30_000);
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#rep-status')).toHaveText('');
  expect(errors).toEqual([]);
});

test('matching filters interrupt speaking without stale activity', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await openTool(page, '?case=guardedness_privacy_001');
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  const psychosisFilter = page.locator('[data-desktop-navigator]').getByRole('button', { name: 'Psychosis', exact: true });
  await tabUntilFocused(page, psychosisFilter);
  await page.keyboard.press('Enter');
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#phase-heading')).toBeFocused();
  await expect(page.locator('#rep-status')).toHaveText('');
  await page.clock.fastForward(30_000);
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#rep-status')).toHaveText('');
  expect(errors).toEqual([]);
});

test('surprise interrupts speaking without writing progress', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await openTool(page, '?case=guardedness_privacy_001');
  const storedBefore = await page.evaluate(() => localStorage.getItem('cw_comm_v1'));
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await page.locator('[data-desktop-navigator]').getByRole('button', { name: 'Surprise me' }).click();
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#phase-heading')).not.toHaveText('Patient says they do not want to answer questions');
  await expect(page.locator('#rep-status')).toHaveText('');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(storedBefore);
  await page.clock.fastForward(30_000);
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#rep-status')).toHaveText('');
  expect(errors).toEqual([]);
});

test('mobile case browser is modal and returns focus', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTool(page);
  await expect(page.locator('[data-desktop-navigator]')).toBeHidden();
  await expect(page.locator('[data-mobile-summary]')).toBeVisible();

  const browse = page.getByRole('button', { name: 'Browse cases' });
  await browse.click();
  const picker = page.getByRole('dialog', { name: 'Browse communication cases' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button', { name: /All/ })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(browse).toBeFocused();

  await browse.click();
  await picker.locator('[data-case-select="family_meeting_opening_001"]').click();
  await expect(picker).toBeHidden();
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#phase-heading')).toBeFocused();

  await browse.click();
  await picker.getByRole('button', { name: 'Close case browser' }).click();
  await expect(picker).toBeHidden();
  await expect(browse).toBeFocused();

  await browse.click();
  await picker.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(picker.locator('[data-case-select]')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('no cases recovery never leaves a stale rep', async ({ page }) => {
  await page.route('**/communication_cases.json', async (route) => {
    const response = await routeFetchWithRetry(route);
    const data = await response.json();
    data.cases = data.cases.filter((item) => item.id === 'psychosis_validation_001');
    await route.fulfill({ response, json: data });
  });
  await openTool(page);
  const navigator = page.locator('[data-desktop-navigator]');
  await navigator.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(navigator.getByText('No cases match this filter', { exact: true })).toBeVisible();
  await expect(navigator.getByRole('button', { name: 'Show all cases' })).toBeVisible();
  await expect(page.locator('[data-rep-panel]')).toHaveCount(0);
  await navigator.getByRole('button', { name: 'Show all cases' }).click();
  await expectPhase(page, 'orient', 1);
});

test('no-match filters interrupt speaking and recover at orient', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  const errors = collectRuntimeErrors(page);
  await page.route('**/communication_cases.json', async (route) => {
    const response = await routeFetchWithRetry(route);
    const data = await response.json();
    data.cases = data.cases.filter((item) => item.id === 'psychosis_validation_001');
    await route.fulfill({ response, json: data });
  });
  await openTool(page);
  const navigator = page.locator('[data-desktop-navigator]');
  const storedBefore = await page.evaluate(() => localStorage.getItem('cw_comm_v1'));
  const start = page.getByRole('button', { name: 'Start 20-second response' });
  await tabUntilFocused(page, start);
  await page.keyboard.press('Enter');
  const familyFilter = navigator.getByRole('button', { name: 'Family', exact: true });
  await tabUntilFocused(page, familyFilter);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-rep-panel]')).toHaveCount(0);
  await expect(page.locator('#rep-status')).toHaveText('');
  const showAll = navigator.getByRole('button', { name: 'Show all cases' });
  await expect(showAll).toBeFocused();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(storedBefore);
  await page.clock.fastForward(30_000);
  await expect(page.locator('[data-rep-panel]')).toHaveCount(0);
  await expect(page.locator('#rep-status')).toHaveText('');
  await expect(showAll).toBeFocused();
  await page.keyboard.press('Enter');
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#phase-heading')).toBeFocused();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(storedBefore);
  expect(errors).toEqual([]);
});

test('reduced motion removes transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTool(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('[data-rep-panel]')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[data-rep-panel]')).toHaveCSS('transition-duration', '0s');
});
