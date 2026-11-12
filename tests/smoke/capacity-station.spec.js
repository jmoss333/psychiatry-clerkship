import { test, expect } from '@playwright/test';
import { pinVisualGovernance } from './governance-fixture.js';

const STATION = '/?page=osce.md&station=capacity';
const roles = [
  { label: 'Interviewer', cue: /Assess decision-making capacity for a specific refusal/i },
  { label: 'Patient', cue: /antibiotics are poison/i },
  { label: 'Observer', cue: /Decision-specific reasoning and delirium recognition/i },
];

test.beforeEach(async ({ page }) => {
  await pinVisualGovernance(page);
});

test('open the capacity station from the OSCE reader and share each role independently', async ({ page }) => {
  await page.goto('/?page=osce.md');
  await page.getByRole('link', { name: 'Run this station', exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get('station') === 'capacity');

  for (const role of roles) {
    const link = page.getByRole('link', { name: role.label, exact: true });
    const rolePath = new URL(await link.getAttribute('href'), page.url());
    expect(rolePath.origin).toBe(new URL(page.url()).origin);
    expect(rolePath.searchParams.get('page')).toBe('osce.md');
    expect(rolePath.searchParams.get('station')).toBe('capacity');
    expect(rolePath.searchParams.get('role')).toBe(role.label.toLowerCase());

    if (role.label === 'Patient') {
      await link.click();
      await expect(page).toHaveURL(rolePath.href);
      await page.reload();
    } else {
      // A recipient can open the URL without first visiting the station launcher.
      await page.goto(rolePath.href);
    }
    await expect(page.getByText(role.cue).filter({ visible: true })).toHaveCount(1);
    if (role.label === 'Interviewer') {
      await expect(page.locator('.fd-reader')).not.toContainText(/capacity with delirium recognition|medical mimic/i);
      await expect(page.locator('.governance-notice')).toBeVisible();
      for (const privateCue of roles.slice(1)) {
        await expect(page.getByText(privateCue.cue).filter({ visible: true })).toHaveCount(0);
      }
    }
    const debriefPrompt = page.getByText('What would you document in one sentence?', { exact: true }).filter({ visible: true });
    await expect(debriefPrompt).toHaveCount(0);
    await page.getByRole('button', { name: 'Open debrief', exact: true }).click();
    await expect(debriefPrompt).toHaveCount(1);
    await page.getByRole('link', { name: 'Back to station', exact: true }).click();
    await expect(page.getByRole('link', { name: role.label, exact: true })).toBeVisible();
    if (role.label === 'Patient') {
      await page.goBack();
      await expect(page.getByText(role.cue).filter({ visible: true })).toHaveCount(1);
      await page.goForward();
      await expect(page.getByRole('link', { name: role.label, exact: true })).toBeVisible();
    }
  }
});

test('facilitator can pause, resume, reset, and switch to the oral summary', async ({ page }) => {
  await page.clock.install();
  await page.goto(STATION);
  const display = page.getByText(/^\d{1,2}:\d{2}$/).filter({ visible: true });
  await expect(display).toHaveText('12:00');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const [patientView] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: 'Patient', exact: true }).click({ modifiers: ['ControlOrMeta'] }),
  ]);
  await expect(patientView.getByRole('heading', { name: 'Patient', exact: true })).toBeVisible();
  await patientView.close();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(display).toHaveText(/^11:\d{2}$/);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = await display.innerText();
  await page.clock.fastForward(60_000);
  await expect(display).toHaveText(paused);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.clock.fastForward(60_000);
  await expect(display).toHaveText(/^10:\d{2}$/);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(display).toHaveText('12:00');
  await page.getByRole('radio', { name: /Oral summary/i }).check();
  await expect(display).toHaveText(/^0?5:00$/);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.fastForward(300_000);
  await expect(display).toHaveText('0:00');
  await expect(page.getByText(/Time is up/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(display).toHaveText('5:00');
});

test('share a role link on a narrow phone when clipboard access is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await page.goto(STATION);
  await page.getByRole('button', { name: 'Copy patient link' }).click();
  const input = page.getByRole('textbox', { name: 'Copy role link' });
  await expect(input).toBeFocused();
  const target = new URL(await input.inputValue());
  expect(target.origin).toBe(new URL(page.url()).origin);
  expect(target.search).toBe('?page=osce.md&station=capacity&role=patient');
  await page.goto(target.href);
  await expect(page.getByText(/antibiotics are poison/i)).toBeVisible();
  await page.getByRole('link', { name: 'Full OSCE station set' }).click();
  await expect(page.getByRole('link', { name: 'Run this station' })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('role')).toBe(false);
});
