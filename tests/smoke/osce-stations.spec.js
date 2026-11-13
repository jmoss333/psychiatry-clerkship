import { test, expect } from '@playwright/test';
import { pinVisualGovernance } from './governance-fixture.js';

const CAPACITY = '?page=osce.md&station=capacity';
const FAMILY = '?page=osce.md&station=family-agenda';
const ADMISSION = '?page=osce.md&station=admission-presentation';
const CIRCUIT = 'catatonia-withdrawal-circuit';
const CATATONIA_DEBRIEF = 'Repeat the first sentence.';
const WITHDRAWAL_DEBRIEF = 'Rehearse the call.';
const COLLATERAL_DEBRIEF = 'Give the handoff.';
const SHARED_DEBRIEF = 'What would you document in one sentence?';
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

async function openSharedDebriefOnly(page) {
  const prompt = page.getByText(SHARED_DEBRIEF, { exact: true }).filter({ visible: true });
  await expect(prompt).toHaveCount(0);
  await page.getByRole('button', { name: 'Open debrief', exact: true }).click();
  await expect(prompt).toHaveCount(1);
  await expect(page.getByText(CATATONIA_DEBRIEF, { exact: true })).toHaveCount(0);
  await expect(page.getByText(WITHDRAWAL_DEBRIEF, { exact: true })).toHaveCount(0);
  await expect(page.getByText(COLLATERAL_DEBRIEF, { exact: true })).toHaveCount(0);
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
    await openSharedDebriefOnly(page);
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
    await openSharedDebriefOnly(page);
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

test('admission presentation share links open the shared case and only the selected role instructions', async ({ page }) => {
  const participants = [
    { key: 'presenter', label: 'Presenter', cue: 'Open with the timeline.' },
    { key: 'resident', label: 'Supervising resident', cue: 'Ask what would change the plan.' },
    { key: 'observer', label: 'Observer', cue: 'Give feedback on one sentence.' },
  ];
  await page.goto('/?page=osce.md');
  await stationLink(page, ADMISSION).click();
  await expect(page).toHaveURL(url => url.search === ADMISSION);

  for (const participant of participants) {
    const link = page.getByRole('link', { name: participant.label, exact: true });
    const url = new URL(await link.getAttribute('href'), page.url());
    expect(url.origin).toBe(new URL(page.url()).origin);
    expect(url.search).toBe(`${ADMISSION}&role=${participant.key}`);
    await page.goto(url.href);
    await expect(page.getByRole('heading', { name: participant.label, exact: true })).toBeVisible();
    const caseBrief = page.getByText(/insomnia, paranoia, weight loss, and new stimulant use/i);
    await expect(caseBrief).toBeVisible();
    await expect(caseBrief).toContainText('a corticosteroid burst.');
    await expect(page.getByText(/twice stopped speaking when someone passed the door/i)).toBeVisible();
    await expect(page.getByText(/gives no direct assessment of suicidal thoughts/i)).toBeVisible();
    for (const { key, cue } of participants) {
      const instruction = page.getByText(cue, { exact: true });
      if (key === participant.key) await expect(instruction).toBeVisible();
      else await expect(instruction).toBeHidden();
    }
    await openSharedDebriefOnly(page);
    await page.getByRole('link', { name: 'Back to station', exact: true }).click();
    await expect(page).toHaveURL(url => url.search === ADMISSION);
  }
});

test('admission presentation runs six minutes of presentation followed by four minutes of questions', async ({ page }) => {
  await page.clock.install();
  await page.goto('/' + ADMISSION);
  const timer = page.getByRole('timer');
  await expect(page.getByRole('radio', { name: 'Presentation', exact: true })).toBeChecked();
  await expect(timer).toHaveText('6:00');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.fastForward(360_000);
  await expect(timer).toHaveText('0:00');
  await page.getByRole('radio', { name: 'Questions', exact: true }).check();
  await expect(timer).toHaveText('4:00');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.fastForward(240_000);
  await expect(timer).toHaveText('0:00');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(timer).toHaveText('4:00');
});

const touchStations = [
  {
    name: 'suicide risk with collateral hesitation',
    href: '?page=osce.md&station=suicide-risk-collateral',
    phases: [['Patient encounter', 12], ['Risk summary', 3], ['Feedback', 10]],
    debrief: [COLLATERAL_DEBRIEF, 'Check the sources.', 'Try the next sentence.'],
    verifyCrisisBlock: true,
    participants: [
      { key: 'interviewer', label: 'Interviewer', cue: 'Ask about safety today.' },
      { key: 'patient', label: 'Patient', cue: 'What you tell the student.', facts: [/I wrote a goodbye letter last night/i] },
      { key: 'sibling', label: 'Sibling', cue: 'What you heard on the phone.', facts: [/I didn't want to be alone tonight/i] },
    ],
  },
  {
    name: 'possible catatonia',
    href: '?page=osce.md&station=possible-catatonia',
    phases: [['Observation and interview', 10], ['Team presentation', 5]],
    debrief: [CATATONIA_DEBRIEF],
    participants: [
      { key: 'interviewer', label: 'Interviewer', cue: 'Start at the bedside.' },
      { key: 'patient', label: 'Patient', cue: 'How to play the pauses.' },
      { key: 'nurse', label: 'Nurse', cue: 'What you saw this shift.' },
    ],
  },
  {
    name: 'alcohol withdrawal',
    href: '?page=osce.md&station=alcohol-withdrawal',
    phases: [['Patient encounter', 10], ['Team presentation', 5]],
    debrief: [WITHDRAWAL_DEBRIEF],
    participants: [
      { key: 'interviewer', label: 'Interviewer', cue: 'Ask about a usual drinking day.' },
      { key: 'patient', label: 'Patient', cue: 'What happened years ago.', facts: [/yesterday morning/i, /my brother said I fell down and shook all over/i] },
      { key: 'nurse', label: 'Nurse', cue: 'Your bedside observations.', facts: [/pulse 112, blood pressure 154\/94/i] },
    ],
  },
];

async function expectCrisisBlock(page) {
  const block = page.locator('.fd-article__body blockquote:has(.crisis-block-hook)');
  await expect(block.getByRole('heading', { name: 'If someone is in crisis' })).toBeVisible();
  await expect(block.getByRole('listitem').first()).toBeVisible();
}

for (const station of touchStations) test.describe(station.name + ' on a touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('open the station, share role cards, and reveal the station and shared debriefs', async ({ page, context }) => {
    await page.goto('/?page=osce.md');
    await stationLink(page, station.href).tap();
    await expect(page).toHaveURL(url => url.search === station.href);
    if (station.verifyCrisisBlock) await expectCrisisBlock(page);
    for (const participant of station.participants) {
      const link = page.getByRole('link', { name: participant.label, exact: true });
      const url = new URL(await link.getAttribute('href'), page.url());
      expect(url.origin).toBe(new URL(page.url()).origin);
      expect(url.search).toBe(`${station.href}&role=${participant.key}`);

      const card = await context.newPage();
      await pinVisualGovernance(card);
      await card.goto(url.href);
      await expect(card.getByRole('heading', { name: participant.label, exact: true })).toBeVisible();
      if (station.verifyCrisisBlock) await expectCrisisBlock(card);
      for (const { key, cue, facts = [] } of station.participants) {
        const instruction = card.getByText(cue, { exact: true });
        if (key === participant.key) await expect(instruction).toBeVisible();
        else await expect(instruction).toBeHidden();
        for (const fact of facts) {
          const answers = card.getByText(fact).filter({ visible: true });
          if (key === participant.key) await expect(answers).not.toHaveCount(0);
          else await expect(answers).toHaveCount(0);
        }
      }
      const prompts = [...station.debrief, SHARED_DEBRIEF].map(text => card.getByText(text, { exact: true }));
      for (const prompt of prompts) await expect(prompt).toBeHidden();
      await card.getByRole('button', { name: 'Open debrief', exact: true }).tap();
      for (const prompt of prompts) await expect(prompt).toBeVisible();
      for (const other of touchStations.filter(item => item !== station)) {
        await expect(card.getByText(other.debrief[0], { exact: true })).toHaveCount(0);
      }
      await card.getByRole('link', { name: 'Back to station', exact: true }).tap();
      await expect(card).toHaveURL(current => current.search === station.href);
      await expect(card.getByRole('link', { name: participant.label, exact: true })).toBeVisible();
      await card.close();
    }
  });

  test('pause, resume, reset, and finish each timed phase', async ({ page }) => {
    await page.clock.install();
    await page.goto('/' + station.href);
    const timer = page.getByRole('timer');
    const [firstPhase, firstMinutes] = station.phases[0];
    await expect(page.getByRole('radio', { name: firstPhase, exact: true })).toBeChecked();
    await expect(timer).toHaveText(`${firstMinutes}:00`);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.clock.fastForward(10_000);
    await page.getByRole('button', { name: 'Pause', exact: true }).tap();
    await expect(timer).toHaveText(new RegExp('^' + (firstMinutes - 1) + ':\\d{2}$'));
    const paused = await timer.innerText();
    await page.clock.fastForward(60_000);
    await expect(timer).toHaveText(paused);
    await page.getByRole('button', { name: 'Resume', exact: true }).tap();
    await page.clock.fastForward(60_000);
    await expect(timer).toHaveText(new RegExp('^' + (firstMinutes - 2) + ':\\d{2}$'));
    await page.getByRole('button', { name: 'Reset', exact: true }).tap();
    await expect(timer).toHaveText(`${firstMinutes}:00`);
    for (const [phase, minutes] of station.phases) {
      await page.getByRole('radio', { name: phase, exact: true }).tap();
      await expect(timer).toHaveText(`${minutes}:00`);
      await page.getByRole('button', { name: 'Start', exact: true }).tap();
      await page.clock.fastForward(minutes * 60_000);
      await expect(timer).toHaveText('0:00');
      await expect(page.getByText(/Time is up/)).toBeVisible();
    }
    await page.getByRole('button', { name: 'Reset', exact: true }).tap();
    const [, lastMinutes] = station.phases.at(-1);
    await expect(timer).toHaveText(`${lastMinutes}:00`);
  });
});

test.describe('two-station circuit on a touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const cases = [
    touchStations.find(station => station.name === 'possible catatonia'),
    touchStations.find(station => station.name === 'alcohol withdrawal'),
  ];
  const seats = [
    { id: 'a', label: 'Learner A', rotation: ['interviewer', 'nurse'] },
    { id: 'b', label: 'Learner B', rotation: ['patient', 'interviewer'] },
    { id: 'c', label: 'Learner C', rotation: ['nurse', 'patient'] },
  ];

  function nextCase(page) {
    return page.getByRole('link', { name: 'Next case', exact: true })
      .or(page.getByRole('button', { name: 'Next case', exact: true }));
  }

  async function checkRole(card, seat, round) {
    const current = cases[round];
    for (const { key, label, cue } of current.participants) {
      const instruction = card.getByText(cue, { exact: true });
      if (key === seat.rotation[round]) {
        await expect(card.getByRole('heading', { name: label, level: 2, exact: true })).toBeVisible();
        await expect(instruction).toBeVisible();
      } else {
        await expect(instruction).toBeHidden();
      }
    }
  }

  test('share the three seats once and keep each seat as its role changes', async ({ page, context }) => {
    await page.goto('/?page=osce.md');
    await page.getByRole('link', { name: 'Run a circuit', exact: true }).tap();
    await expect(page).toHaveURL(url => url.search === '?page=osce.md&station=' + CIRCUIT);
    for (const seat of seats) {
      const link = page.getByRole('link', { name: seat.label, exact: true });
      const address = new URL(await link.getAttribute('href'), page.url());
      expect(address.origin).toBe(new URL(page.url()).origin);
      expect(address.searchParams.get('station')).toBe(CIRCUIT);
      expect(address.searchParams.get('role')).toBe(seat.id);
      const card = await context.newPage();
      await pinVisualGovernance(card);
      await card.goto(address.href);
      for (const [round, current] of cases.entries()) {
        if (round === 1) {
          await nextCase(card).tap();
          await expect(card).toHaveURL(url => url.searchParams.get('round') === '2' && url.searchParams.get('role') === seat.id);
        }
        await checkRole(card, seat, round);
        const prompt = card.getByText(current.debrief[0], { exact: true });
        await expect(prompt).toBeHidden();
        await card.getByRole('button', { name: 'Open debrief', exact: true }).tap();
        await expect(prompt).toBeVisible();
        await expect(card.getByText(cases[1 - round].debrief[0], { exact: true })).toBeHidden();
      }
      if (seat.id === 'a') {
        await card.reload();
        await checkRole(card, seat, 1);
        await card.goBack();
        await checkRole(card, seat, 0);
        await card.goForward();
        await checkRole(card, seat, 1);
      }
      await card.close();
    }
  });

  test('facilitator keeps the timer while sharing a QR code and reading the debrief', async ({ page }) => {
    await page.clock.install();
    await page.goto('/?page=osce.md&station=' + CIRCUIT);
    const timer = page.getByRole('timer');
    await expect(page.getByRole('radio', { name: 'Observation and interview', exact: true })).toBeChecked();
    await expect(timer).toHaveText('10:00');
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.clock.fastForward(65_000);
    await expect(timer).toHaveText(/^8:\d{2}$/);
    const showQr = page.getByRole('button', { name: 'Show QR for Learner A', exact: true });
    await showQr.tap();
    const qr = page.getByRole('img', { name: /Learner A/i });
    await expect(qr).toBeVisible();
    await page.getByRole('button', { name: /^Hide QR/i }).tap();
    await expect(qr).toBeHidden();
    await page.getByRole('button', { name: 'Open debrief', exact: true }).tap();
    const endOfDebrief = page.getByText(SHARED_DEBRIEF, { exact: true });
    await expect(endOfDebrief).toBeVisible();
    await endOfDebrief.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await expect(timer).toBeInViewport({ ratio: 1 });
    await page.clock.fastForward(60_000);
    await expect(timer).toHaveText(/^7:\d{2}$/);
    await page.getByRole('radio', { name: 'Team presentation', exact: true }).tap();
    await expect(timer).toHaveText('5:00');
    await nextCase(page).tap();
    await expect(page).toHaveURL(url => url.searchParams.get('round') === '2');
    await expect(page.getByRole('radio', { name: 'Patient encounter', exact: true })).toBeChecked();
    await expect(timer).toHaveText('10:00');
    await page.getByRole('radio', { name: 'Team presentation', exact: true }).tap();
    await expect(timer).toHaveText('5:00');
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.clock.fastForward(300_000);
    await expect(timer).toHaveText('0:00');
  });
});
