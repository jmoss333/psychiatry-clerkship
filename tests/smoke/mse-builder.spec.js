import { test, expect } from '@playwright/test';

const TOOL = '/tools/mse.html';

test('fictional comparison carries selected observations and uncertainty into rounds and back', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await page.goto(TOOL);
  await expect(page.getByRole('button', { name: 'What changed today?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'What changed today?', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One patient, two mornings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rehearse this update' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Include speech', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Include attention', exact: true }).check();
  await page.getByRole('link', { name: 'Rehearse this update' }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('3');
  const handoff = page.getByRole('region', { name: 'Your selected case details' });
  await expect(handoff).toContainText('Speech is slower');
  await expect(handoff).toContainText('Attention was not assessed');
  await expect(handoff.locator('li')).toHaveCount(2);
  await expect(handoff).toContainText('Fictional practice case');
  await page.getByRole('button', { name: 'Pause & leave' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Resume practice →' }).click();
  await expect(handoff.locator('li')).toHaveCount(2);
  await page.getByRole('link', { name: 'Edit selected details' }).click();
  await expect(page.getByRole('checkbox', { name: 'Include speech', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Include attention', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test('case handoff survives the learner shell and preserves selection when editing', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cw_rotation_start', new Date().toISOString().slice(0, 10));
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false }));
  });
  await page.goto('/?tool=mse.html');
  let tool = page.frameLocator('.toolframe');
  await tool.getByRole('checkbox', { name: 'Include mood', exact: true }).check();
  await tool.getByRole('link', { name: 'Rehearse this update' }).click();
  await expect(page).toHaveURL(/tool=oral.html/);
  tool = page.frameLocator('.toolframe');
  await expect(tool.getByRole('region', { name: 'Your selected case details' })).toContainText('less wound up');
  await page.reload();
  await expect(tool.getByRole('region', { name: 'Your selected case details' })).toContainText('less wound up');
  await tool.getByRole('link', { name: 'Edit selected details' }).click();
  await expect(page).toHaveURL(/tool=mse.html/);
  await expect(tool.getByRole('checkbox', { name: 'Include mood', exact: true })).toBeChecked();
});

test('recovery from a broken case link updates the outer shell route and survives reload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cw_rotation_start', new Date().toISOString().slice(0, 10));
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false }));
  });
  await page.goto('/?tool=oral.html&msecase=stale&msepicks=speech');
  await page.frameLocator('.toolframe').getByRole('link', { name: 'Open the MSE comparison' }).click();
  await expect(page).toHaveURL(/tool=mse.html/);
  await page.reload();
  await expect(page.frameLocator('.toolframe').getByRole('heading', { name: 'One patient, two mornings' })).toBeVisible();
});

test('case rehearsal separates prior timers, unrelated examples, and ordinary practice history', async ({ page }) => {
  await page.clock.install();
  await page.goto('/tools/oral.html');
  await page.getByRole('button', { name: 'Start 60-sec practice' }).click();
  await page.clock.fastForward(18_000);
  await page.getByRole('button', { name: 'Pause & leave' }).click();
  await page.goto('/tools/oral.html?format=rounds&view=guided&msecase=mse-change-v1&msepicks=speech');
  await expect(page.locator('[data-oral-clock]')).toHaveText('1:00');
  await expect(page.getByRole('button', { name: 'Show an example' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Summarize a collateral call/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start 60-sec practice' }).click();
  await page.clock.fastForward(60_000);
  await expect(page.locator('[data-oral-clock]')).toHaveText('0:00');
  expect(await page.evaluate(() => localStorage.getItem('cw_orals_v1'))).toBeNull();
  await page.getByRole('link', { name: 'Edit selected details' }).click();
  await page.getByRole('checkbox', { name: 'Include attention', exact: true }).check();
  await page.getByRole('link', { name: 'Rehearse this update' }).click();
  await expect(page.locator('[data-oral-clock]')).toHaveText('1:00');
  await page.getByRole('link', { name: 'Open other practice' }).click();
  await page.getByRole('button', { name: 'Resume practice →' }).click();
  await expect(page.locator('[data-oral-clock]')).toHaveText('0:42');
});

test('invalid case links never display supplied text or load a partial case', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('cw_oral_session_v1', JSON.stringify({v:1,format:'rounds',items:{rounds:{seconds:22}}})));
  await page.goto('/tools/oral.html?msecase=mse-change-v1&msepicks=speech,UNTRUSTED_DETAIL');
  await expect(page.getByRole('heading', { name: 'Case details unavailable' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your selected case details' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('UNTRUSTED_DETAIL');
  await expect(page.locator('[data-oral-timer]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('cw_oral_session_v1')).items.rounds.seconds)).toBe(22);
  await page.getByRole('link', { name: 'Open the MSE comparison' }).click();
  await expect(page.getByRole('checkbox', { name: 'Include speech', exact: true })).not.toBeChecked();
});

test('comparison supports phone keyboards, clearing selections, and blocked storage', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
  await page.goto(TOOL);
  const speech = page.getByRole('checkbox', { name: 'Include speech', exact: true });
  await speech.focus(); await page.keyboard.press('Space');
  await expect(speech).toBeChecked();
  await page.getByRole('button', { name: 'Clear selections' }).click();
  await expect(speech).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Rehearse this update' })).toBeDisabled();
  const size = await page.evaluate(() => ({ view: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(size.content).toBeLessThanOrEqual(size.view);
  await speech.check();
  await page.getByRole('link', { name: 'Rehearse this update' }).click();
  await expect(page.getByRole('region', { name: 'Your selected case details' })).toContainText('Speech is slower');
  await expect(page.getByText('Tab storage is unavailable.', { exact: false })).toBeVisible();
});

test('a missing case asset leaves existing MSE teaching and the builder accessible', async ({ page }) => {
  await page.route('**/mse-rounds-case.js', route => route.abort());
  await page.goto(TOOL);
  await expect(page.getByRole('heading', { name: 'Comparison unavailable' })).toBeVisible();
  await page.getByRole('button', { name: /2 · Build an MSE/ }).click();
  await expect(page.getByRole('heading', { name: 'Comparison unavailable' })).toBeHidden();
  await page.getByRole('checkbox', { name: 'no SI/HI', exact: true }).click();
  await expect(page.locator('.note')).toContainText('no SI/HI');
});

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function observeAnnouncements(page) {
  await page.evaluate(() => {
    const status = document.querySelector('#mse-selection-status');
    window.__mseAnnouncements = [];
    new MutationObserver(() => {
      const text = status.textContent.trim();
      if (text) window.__mseAnnouncements.push(text);
    }).observe(status, { childList: true, characterData: true, subtree: true });
  });
}

async function openBuilder(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(text) {
          window.__mseClipboard = text;
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(TOOL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /2 · Build an MSE/i }).click();
  await expect(page.getByRole('checkbox', { name: 'no SI/HI', exact: true })).toBeVisible();
}

test('new contradictory finding replaces the old one in state, draft, status, and clipboard', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openBuilder(page);
  const absent = page.getByRole('checkbox', { name: 'no SI/HI', exact: true });
  const active = page.getByRole('checkbox', { name: 'active SI', exact: true });
  const status = page.locator('#mse-selection-status[role="status"][aria-live="polite"]');
  await expect(status).toHaveCount(1);
  await observeAnnouncements(page);
  await absent.click();
  await active.click();

  await expect(absent).toHaveAttribute('aria-checked', 'false');
  await expect(active).toHaveAttribute('aria-checked', 'true');
  await expect(status).toHaveText('Active SI replaced no SI/HI because these findings conflict.');
  await expect.poll(() => page.evaluate(() => window.__mseAnnouncements || [])).toContain(
    'Active SI replaced no SI/HI because these findings conflict.',
  );
  await expect(page.locator('.note')).toContainText('Thought content — active SI.');
  await expect(page.locator('.note')).not.toContainText('no SI/HI');

  await page.getByRole('button', { name: 'Copy as prose' }).click();
  await expect.poll(() => page.evaluate(() => window.__mseClipboard || '')).toContain('active SI');
  expect(await page.evaluate(() => window.__mseClipboard)).not.toContain('no SI/HI');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(active).toHaveAttribute('aria-checked', 'false');
  await expect(status).toBeEmpty();
  expect(errors).toEqual([]);
});

test('keyboard replacement matches pointer behavior and report-versus-observation remains allowed', async ({ page }) => {
  const errors = collectRuntimeErrors(page);
  await openBuilder(page);
  const none = page.getByRole('checkbox', { name: 'no delusions', exact: true });
  const paranoid = page.getByRole('checkbox', { name: 'paranoid delusions', exact: true });
  await none.focus();
  await page.keyboard.press('Space');
  await paranoid.focus();
  await page.keyboard.press('Enter');
  await expect(none).toHaveAttribute('aria-checked', 'false');
  await expect(paranoid).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#mse-selection-status')).toHaveText(
    'Paranoid delusions replaced no delusions because these findings conflict.',
  );

  const denied = page.getByRole('checkbox', { name: 'denies hallucinations', exact: true });
  const observed = page.getByRole('checkbox', { name: 'responding to internal stimuli', exact: true });
  await denied.click();
  await observed.click();
  await expect(denied).toHaveAttribute('aria-checked', 'true');
  await expect(observed).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.note')).toContainText(
    'Perception — denies hallucinations and responding to internal stimuli.',
  );
  expect(errors).toEqual([]);
});
