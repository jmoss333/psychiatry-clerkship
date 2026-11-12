import { test, expect } from '@playwright/test';
import { pinVisualGovernance } from './governance-fixture.js';

const CAPACITY = '?page=osce.md&station=capacity';
const FAMILY = '?page=osce.md&station=family-agenda';
const roles = [
  { label: 'Interviewer', cue: /Assess decision-making capacity for a specific refusal/i },
  { label: 'Patient', cue: /antibiotics are poison/i },
  { label: 'Observer', cue: /Decision-specific reasoning and delirium recognition/i },
];

test.beforeEach(async ({ page }) => {
  await pinVisualGovernance(page);
});

function stationLink(page, href) {
  return page.getByRole('link', { name: 'Run this station', exact: true })
    .and(page.locator(`a[href="${href}"]`));
}

async function openDebrief(page) {
  const prompt = page.getByText('What would you document in one sentence?', { exact: true }).filter({ visible: true });
  await expect(prompt).toHaveCount(0);
  await page.getByRole('button', { name: 'Open debrief', exact: true }).click();
  await expect(prompt).toHaveCount(1);
}

test('open the capacity station from the OSCE reader and share each role independently', async ({ page }) => {
  await page.goto('/?page=osce.md');
  await stationLink(page, CAPACITY).click();
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
    await openDebrief(page);
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
  await page.goto('/' + CAPACITY);
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
  await page.goto('/' + CAPACITY);
  await page.getByRole('button', { name: 'Copy patient link' }).click();
  const input = page.getByRole('textbox', { name: 'Copy role link' });
  await expect(input).toBeFocused();
  const target = new URL(await input.inputValue());
  expect(target.origin).toBe(new URL(page.url()).origin);
  expect(target.search).toBe('?page=osce.md&station=capacity&role=patient');
  await page.goto(target.href);
  await expect(page.getByText(/antibiotics are poison/i)).toBeVisible();
  await page.getByRole('link', { name: 'Full OSCE station set' }).click();
  await expect(stationLink(page, CAPACITY)).toBeVisible();
  expect(new URL(page.url()).searchParams.has('role')).toBe(false);
});

test('family-agenda roles share the intended briefing and reveal the debrief on demand', async ({ page }) => {
  await page.goto('/?page=osce.md');
  await stationLink(page, FAMILY).click();
  await expect(page).toHaveURL(url => url.search === FAMILY);

  const presenterTask = page.getByText(/Prepare a family meeting agenda for a synthetic patient nearing discharge/i);
  const cardCues = {
    presenter: [page.getByText('Close with a handoff.', { exact: true })],
    family: [
      page.getByRole('heading', { name: 'If you want a firm plan' }),
      page.getByRole('heading', { name: 'If you want to avoid another argument' }),
    ],
    observer: [page.getByText('Give one piece of feedback.', { exact: true })],
  };
  const caseBrief = page.getByText(/one parent wants strict control/i);
  const observerFocus = page.getByText(/Structure, boundaries, patient autonomy, family support/i);
  const behavior = page.getByText('Names one unresolved discharge barrier.', { exact: true }).filter({ visible: true });
  for (const [label, key] of [['Presenter', 'presenter'], ['Family member', 'family'], ['Observer', 'observer']]) {
    const roleLink = page.getByRole('link', { name: label, exact: true });
    const roleUrl = new URL(await roleLink.getAttribute('href'), page.url());
    expect(roleUrl.origin).toBe(new URL(page.url()).origin);
    expect(roleUrl.search).toBe(`${FAMILY}&role=${key}`);
    if (key === 'family') {
      await page.goto(roleUrl.href);
    } else {
      await roleLink.click();
    }
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(page.locator('.fd-article__head')).toContainText('OSCE practice');
    await expect(page.locator('.fd-article__meta')).toBeEmpty();
    await expect(caseBrief).toBeVisible();
    for (const [owner, cues] of Object.entries(cardCues)) {
      for (const cue of cues) {
        if (owner === key) await expect(cue).toBeVisible();
        else await expect(cue).toHaveCount(0);
      }
    }
    if (key === 'presenter') await expect(presenterTask).toBeVisible();
    else await expect(presenterTask).toBeHidden();
    if (key === 'observer') {
      await expect(observerFocus).toBeVisible();
      await expect(behavior).toHaveCount(1);
    } else {
      await expect(observerFocus).toBeHidden();
      await expect(behavior).toHaveCount(0);
    }
    await openDebrief(page);
    await page.getByRole('link', { name: 'Back to station', exact: true }).click();
    await expect(page).toHaveURL(url => url.search === FAMILY);
  }
});

test('a capacity-only role falls back to the family launcher and its single 15-minute timer', async ({ page }) => {
  await page.clock.install();
  await page.goto('/' + FAMILY + '&role=patient');
  await expect(page.getByRole('link', { name: 'Family member', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Oral summary/i })).toHaveCount(0);
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText('15:00');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.fastForward(900_000);
  await expect(timer).toHaveText('0:00');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(timer).toHaveText('15:00');
});
