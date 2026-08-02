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

test('local history reset requires confirmation and remains unavailable when empty', async ({ page }) => {
  await openTool(page);
  await expect(page.locator('[data-reset-history]')).toHaveCount(0);

  const stored = JSON.stringify({ guardedness_privacy_001: { choiceId: 'b', quality: 'best', at: '2026-08-01' } });
  await page.evaluate((value) => localStorage.setItem('cw_comm_v1', value), stored);
  await openTool(page);
  await expect(page.locator('[data-reset-history]')).toBeVisible();

  let dismissedMessage = '';
  page.once('dialog', async (dialog) => {
    dismissedMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.locator('[data-reset-history]').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBe(stored);
  expect(dismissedMessage).toBe('Reset all What Do You Say Next practice history stored in this browser? This does not affect page progress, daily review, dashboard settings, or other tools.');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-reset-history]').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_comm_v1'))).toBeNull();
  await expect(page.locator('[data-reset-history]')).toHaveCount(0);
});

test('safety boundary remains visible', async ({ page }) => {
  await openTool(page);
  await expect(page.getByText(SAFETY, { exact: true })).toBeVisible();
});
