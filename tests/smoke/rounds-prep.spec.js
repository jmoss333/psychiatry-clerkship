import { test, expect } from '@playwright/test';

const TOOL = '/tools/oral.html';
const STORE = 'cw_oral_session_v1';

test('short updates open directly and retain each format through guidance and interruption', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(TOOL);
  await expect(page.getByRole('heading', { name: 'Your 60-second update' })).toBeVisible();
  await page.getByRole('button', { name: 'Guided', exact: true }).click();
  await page.getByRole('button', { name: /Cue 3:/ }).click();
  await page.getByRole('button', { name: 'Show an example', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I practiced this cue' }).check();
  const example = await page.locator('#oral-example').innerText();
  await page.getByRole('button', { name: 'Quick cue', exact: true }).click();
  await page.getByRole('button', { name: 'Guided', exact: true }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('3');
  await expect(page.locator('#oral-example')).toHaveText(example, { useInnerText: true });
  await page.getByRole('button', { name: 'Pause & leave', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume practice →' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume practice →' }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('3');
  await expect(page.getByRole('checkbox', { name: 'I practiced this cue' })).toBeChecked();
  await expect(page.locator('#oral-example')).toHaveText(example, { useInnerText: true });
  await page.getByRole('button', { name: /Summarize a collateral call/ }).click();
  await expect(page.getByRole('heading', { name: 'Your 30-second summary' })).toBeVisible();
  await page.getByRole('button', { name: /Prepare a rounds update/ }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('3');
  expect(errors).toEqual([]);
});

test('timer pause, reload and completion retain one unrated practice record', async ({ page }) => {
  await page.clock.install();
  await page.goto(TOOL);
  await page.getByRole('button', { name: 'Start 60-sec practice' }).click();
  await page.clock.fastForward(31_000);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  await expect(page.locator('[data-oral-clock]')).toHaveText('0:29');
  await page.getByRole('button', { name: 'Pause & leave' }).click();
  await page.clock.fastForward(20_000);
  await page.reload();
  await page.getByRole('button', { name: 'Resume practice →' }).click();
  await expect(page.locator('[data-oral-clock]')).toHaveText('0:29');
  await page.getByRole('button', { name: 'Continue timer', exact: true }).click();
  await page.clock.fastForward(29_000);
  await expect(page.locator('[data-oral-clock]')).toHaveText('0:00');
  await expect(page.getByRole('button', { name: 'Practice again', exact: true })).toBeVisible();
  const reps = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_orals_v1')).reps);
  expect(reps).toHaveLength(1);
  expect(reps[0]).toMatchObject({ format: 'rounds', total: 60, rubric: null });
  const checkpoint = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), STORE);
  expect(checkpoint.items.rounds.done).toEqual([]);
});

test('direct format and view links work through the learner shell', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cw_rotation_start', new Date().toISOString().slice(0, 10));
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({ role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false }));
  });
  await page.goto('/?tool=oral.html&format=collateral&view=guided');
  const tool = page.frameLocator('.toolframe');
  await expect(tool.getByRole('heading', { name: 'Your 30-second summary' })).toBeVisible();
  await expect(tool.getByRole('button', { name: 'Guided', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await tool.getByRole('button', { name: /Prepare a rounds update/ }).click();
  await tool.getByRole('button', { name: 'Quick cue', exact: true }).click();
  await tool.getByRole('button', { name: 'Pause & leave' }).click();
  await page.reload();
  await expect(tool.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await tool.getByRole('button', { name: 'Resume practice →' }).click();
  await expect(tool.getByRole('heading', { name: 'Your 60-second update' })).toBeVisible();
  await expect(tool.getByRole('button', { name: 'Quick cue', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a short practice still offers the existing optional self-rating and retains it on resume', async ({ page }) => {
  await page.clock.install();
  await page.goto(TOOL);
  await page.getByRole('button', { name: 'Start 60-sec practice' }).click();
  await page.clock.fastForward(31_000);
  await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rate that rep' })).toBeVisible();
  await page.getByText('Lead with the one-liner.', { exact: true }).click();
  await page.getByRole('button', { name: 'Save rating', exact: true }).click();
  await page.getByRole('button', { name: 'Continue timer', exact: true }).click();
  await page.clock.fastForward(29_000);
  const reps = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_orals_v1')).reps);
  expect(reps).toHaveLength(1);
  expect(reps[0]).toMatchObject({ total: 60, rubric: { oneLiner: true, siHi: false } });
});

test('returning from the browser page cache restores a stopped and resumable timer', async ({ page }) => {
  await page.clock.install();
  await page.goto(TOOL);
  await page.getByRole('button', { name: 'Start 60-sec practice' }).click();
  await page.clock.fastForward(12_000);
  // Browser lifecycle events are dispatched because automation can disable the actual cache.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume practice →' }).click();
  await expect(page.locator('[data-oral-clock]')).toHaveText('0:48');
  await page.getByRole('button', { name: 'Continue timer', exact: true }).click();
  await page.clock.fastForward(5_000);
  await expect(page.locator('[data-oral-clock]')).toHaveText('0:43');
});

test('unavailable tab storage remains usable without claiming a reload checkpoint', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Unavailable', 'SecurityError'); } });
  });
  await page.goto(TOOL);
  await expect(page.getByText('Tab storage is unavailable.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Guided', exact: true }).click();
  await page.getByRole('button', { name: /Cue 4:/ }).click();
  await page.getByRole('button', { name: 'Pause & leave' }).click();
  await page.getByRole('button', { name: 'Resume practice →' }).click();
  await expect(page.locator('[aria-current="step"]')).toHaveText('4');
});

test('phone layout, keyboard controls and existing preparation resources remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(TOOL);
  const guided = page.getByRole('button', { name: 'Guided', exact: true });
  await guided.focus();
  await page.keyboard.press('Enter');
  await expect(guided).toBeFocused();
  await page.getByRole('button', { name: /Cue 5:/ }).click();
  await page.getByRole('button', { name: 'Show an example' }).click();
  const size = await page.evaluate(() => ({ view: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(size.content).toBeLessThanOrEqual(size.view);
  await page.getByRole('button', { name: 'See all five cues' }).click();
  await expect(page.getByRole('button', { name: 'Quick cue', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Gather', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Before rounds — have these ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Full presentation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One-liner', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Full practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
});
