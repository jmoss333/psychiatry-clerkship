import { test, expect } from '@playwright/test';

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

  const heading = page.locator('#phase-heading');
  const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]');
  const start = page.getByRole('button', { name: 'Start 20-second response' });
  await tabUntilFocused(page, start);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);

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
  await observeAnnouncements(page);

  const choice = page.locator('[data-choice-id="b"]');
  await tabUntilFocused(page, choice);
  await page.keyboard.press('Enter');
  await expect(heading).toBeFocused();
  await expect(liveRegion).toHaveCount(1);
  await expect(page.locator('[data-selected-choice]')).toBeHidden();
  await expect(page.locator('[data-feedback]')).toHaveAttribute(
    'aria-describedby',
    await page.locator('[data-selected-choice]').getAttribute('id'),
  );
  const feedback = await page.evaluate(async () => {
    const data = await fetch('../communication_cases.json').then((response) => response.json());
    return data.cases.find((item) => item.id === 'guardedness_privacy_001').choices.find((item) => item.id === 'b').feedback;
  });
  const messages = await page.evaluate(() => window.__repAnnouncements || []);
  expect(messages.filter((message) => message === feedback)).toHaveLength(1);
  expect(messages).not.toContain('Best next line');
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

test('review status remains visible', async ({ page }) => {
  await page.route('**/communication_cases.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.cases[0].facultyReview = { status: 'reviewed', reviewer: 'Faculty reviewer', lastReviewed: '2026-08-01' };
    await route.fulfill({ response, json: data });
  });
  await openTool(page, '?case=suicide_direct_question_001');
  await expect(page.getByText('Reviewed', { exact: true })).toBeVisible();
  await openTool(page, '?case=guardedness_privacy_001');
  await expect(page.getByText('draft · faculty review needed', { exact: true })).toBeVisible();
});

test('storage contract preserves prior and unrelated data', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-01T12:00:00Z') });
  await openTool(page);
  await page.evaluate(() => {
    localStorage.setItem('cw_comm_v1', JSON.stringify({
      psychosis_validation_001: { choiceId: 'b', quality: 'best', at: '2026-07-31' },
    }));
    localStorage.setItem('cw_unrelated_test', JSON.stringify({ keep: true }));
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
  expect(dismissedMessage).toBe('Reset all What Do You Say Next practice history stored in this browser? This does not affect page progress, daily review, dashboard settings, or other tools.');

  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await observeAnnouncements(page);
  await page.locator('[data-desktop-navigator] [data-practice-details] summary').click();
  const resetDuringSpeaking = page.locator('[data-desktop-navigator] [data-reset-history]');
  await expect(resetDuringSpeaking).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await resetDuringSpeaking.click();
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#rep-status')).toHaveText('');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_unrelated_test'))).toBe(JSON.stringify({ keep: true }));
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
  await expect(navigator).toContainText('0 of 10 practiced');
  await expect(navigator.locator('[data-case-select]')).toHaveCount(10);
  await expect(navigator.locator('.case-status')).toHaveText(Array(10).fill('Not practiced'));
  await expect(navigator.locator('[data-case-select="guardedness_privacy_001"]')).toHaveAttribute('aria-current', 'true');

  await navigator.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(navigator.locator('[data-case-select]')).toHaveCount(3);
  await expect(navigator.locator('[data-case-select="family_meeting_opening_001"]')).toHaveAttribute('aria-current', 'true');
  await expectPhase(page, 'orient', 1);

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
  await page.locator('[data-desktop-navigator]').getByRole('button', { name: 'Psychosis', exact: true }).click();
  await expectPhase(page, 'orient', 1);
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
    const response = await route.fetch();
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
    const response = await route.fetch();
    const data = await response.json();
    data.cases = data.cases.filter((item) => item.id === 'psychosis_validation_001');
    await route.fulfill({ response, json: data });
  });
  await openTool(page);
  const navigator = page.locator('[data-desktop-navigator]');
  await page.getByRole('button', { name: 'Start 20-second response' }).click();
  await navigator.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(page.locator('[data-rep-panel]')).toHaveCount(0);
  await expect(page.locator('#rep-status')).toHaveText('');
  await page.clock.fastForward(30_000);
  await expect(page.locator('[data-rep-panel]')).toHaveCount(0);
  await expect(page.locator('#rep-status')).toHaveText('');
  await navigator.getByRole('button', { name: 'Show all cases' }).click();
  await expectPhase(page, 'orient', 1);
  await expect(page.locator('#phase-heading')).toBeFocused();
  expect(errors).toEqual([]);
});

test('reduced motion removes transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTool(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('[data-rep-panel]')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[data-rep-panel]')).toHaveCSS('transition-duration', '0s');
});
