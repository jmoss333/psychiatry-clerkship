import { test, expect } from '@playwright/test';

// Ward question capture: the phone dock and desktop global launcher give every learner route
// one visible way to open the same device-local dialog. Today also owns the triage card.
//
// No page.route in this file. The config sets serviceWorkers:'block' for every project except
// the dedicated `offline` one, but route interception is blind once a SW controls the page, so
// the two must never be combined here.

const ROUTES = [
  ['Today tab', '/'],
  ['Path tab', '/?tab=path'],
  ['Library tab', '/?tab=library'],
  ['markdown Reader', '/?page=t_mood.md'],
  ['enhanced Orientation guide', '/?page=orientation.md'],
  ['tool Reader', '/?tool=question-bank-practice.html'],
  ['internal Progress', '/?page=__progress__'],
];

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const captureLauncher = (page) => page.locator('.fd-dock [data-capture-open]:visible, .fd-capture-launch--global[data-capture-open]:visible');
const desktopLauncher = (page) => page.locator('.fd-capture-launch--global[data-capture-open]:visible');
const inbox = (page) => page.locator('.cap-sheet[role="dialog"]');
const email = (page) => page.locator('.cap-email-sheet[role="dialog"]');

async function savedItems(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cw_capture_v1') || '{"items":[]}').items);
}

async function saveQuestion(page, text) {
  await captureLauncher(page).click();
  await inbox(page).locator('#capText').fill(text);
  await inbox(page).locator('#capSave').click();
  await expect(inbox(page).locator('.cap-next')).toBeVisible();
}

async function openEmailForFirstQuestion(page) {
  await inbox(page).locator('[data-cap-email-id]').first().check();
  await inbox(page).locator('#capEmailSelect').click();
  await expect(email(page)).toBeVisible();
}

async function seedCompleteSetup(page) {
  await page.addInitScript(() => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('cw_rotation_start', start);
    localStorage.setItem('cw_frontdoor_v1', JSON.stringify({
      role: 'staff', tab: 'today', viewWeek: 1, autoAdvance: false,
    }));
  });
}

test.beforeEach(async ({ page }) => seedCompleteSetup(page));

test.describe('capture affordance is route- and breakpoint-persistent', () => {
  for (const [label, url] of ROUTES) {
    test(`T9 mobile: capture button is usable on ${label}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(url);
      const btn = captureLauncher(page);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveCount(1);
      await expect(page.locator('.fd-capture-launch--global:visible')).toHaveCount(0);
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      await btn.click();
      await expect(page.locator('.cap-sheet')).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      await page.locator('#capCancel').click();
      await expect(page.locator('.cap-sheet')).toHaveCount(0);
    });

    test(`T9 desktop: capture button is usable on ${label}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(url);
      const btn = desktopLauncher(page);
      await expect(btn).toBeVisible();
      await expect(btn).toHaveCount(1);
      await btn.click();
      await expect(page.locator('.cap-sheet')).toBeVisible();
      await page.locator('#capCancel').click();
      await expect(page.locator('.cap-sheet')).toHaveCount(0);
    });
  }
});

test('the sheet traps focus and returns it to the invoker that opened it', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await expect(page.locator('#capText')).toBeFocused();
  // Escape closes and focus goes back to the recorded invoker, not to <body>.
  await page.keyboard.press('Escape');
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect(captureLauncher(page)).toBeFocused();
});

test('the capture sheet renders the exact no-PHI warning', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await expect(page.locator('.cap-warn')).toHaveText(
    'The question, not the patient. No names, initials, room or bed numbers, dates, or MRNs — write what you want to understand, not who you saw. Stays on this device.',
  );
});

test('a saved question survives reload and reaches the home triage card', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('why clozapine and not another antipsychotic');
  await page.locator('#capSave').click();
  // list inside the sheet updates without a reload
  await expect(page.locator('.cap-list li')).toHaveCount(1);
  await page.locator('#capCancel').click();
  await page.reload();
  const card = page.locator('.fd-capture', { hasText: 'Questions from the unit' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('why clozapine and not another antipsychotic');
});

test('question starters seed the textarea without saving or replacing learner text', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  const starters = page.locator('[data-cap-starter]');
  await expect(starters).toHaveCount(4);
  await starters.nth(0).click();
  await expect(page.locator('#capText')).toHaveValue('Why would we ');
  await page.locator('#capText').fill('My own wording');
  await starters.nth(1).click();
  await expect(page.locator('#capText')).toHaveValue('My own wording');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_capture_v1'))).toBeNull();
});

test('route: saving persists the question before any optional route', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('How should I distinguish delirium from psychosis?');
  await page.locator('#capSave').click();
  const next = page.locator('.cap-next');
  await expect(next).toBeVisible();
  await expect(next).toContainText('Saved on this device');
  await expect(next.locator('[data-cap-open]')).toBeVisible();
  await expect(next.locator('[data-cap-review]')).toBeVisible();
  await expect(next.locator('[data-cap-route]')).toHaveCount(3);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_capture_v1')).items[0]);
  expect(stored).toMatchObject({ text: 'How should I distinguish delirium from psychosis?', route: null, state: 'open' });
  await page.locator('#capCancel').click();
  await page.reload();
  const card = page.locator('.fd-capture:visible');
  await expect(card.locator('.fd-capture__question')).toHaveText('How should I distinguish delirium from psychosis?');
  await card.locator('.fd-capture__new').click();
  const row = page.locator('.cap-list li[data-cap-route-state="unrouted"]');
  await expect(row.locator('.cap-list__text')).toHaveText('How should I distinguish delirium from psychosis?');
  await expect(row.locator('.cap-list__status')).toHaveText('Unrouted');
  await expect(row.locator('[data-cap-route][aria-pressed="true"]')).toHaveCount(0);
  expect((await savedItems(page))[0]).toMatchObject({ route: null, state: 'open' });
  await row.locator('[data-cap-route="rounds"]').click();
  expect((await savedItems(page))[0]).toMatchObject({ route: 'rounds', state: 'open' });
});

test('route: every retained row gives its choices that question as accessible context', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await saveQuestion(page, '<First learning question?>');
  await inbox(page).locator('#capText').fill('Second learning question?');
  await inbox(page).locator('#capSave').click();
  const rows = inbox(page).locator('.cap-list li');
  await expect(rows).toHaveCount(2);
  const questionIds = [];
  for (let index = 0; index < 2; index++) {
    const row = rows.nth(index);
    const questionId = await row.locator('.cap-list__text').getAttribute('id');
    expect(questionId).toMatch(/^cap-question-[A-Za-z0-9_-]+$/);
    questionIds.push(questionId);
    await expect(row.locator('.cap-route')).toHaveAttribute('aria-describedby', questionId);
    for (const button of await row.locator('[data-cap-route]').all())
      await expect(button).toHaveAttribute('aria-describedby', questionId);
  }
  expect(questionIds[0]).not.toBe(questionIds[1]);
  await expect(rows.first().locator('.cap-list__text')).toHaveText('<First learning question?>');
  await expect(page.locator('.cap-list img')).toHaveCount(0);
});

test('route: selecting an active destination clears it and restores the Today reminder after reload', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await saveQuestion(page, 'A question to take on rounds?');
  const rounds = inbox(page).locator('#capHold [data-cap-route="rounds"]');
  await rounds.click();
  await expect(rounds).toHaveAttribute('aria-pressed', 'true');
  await expect(inbox(page).locator('.cap-list__status')).toHaveText('Ask on rounds');
  expect((await savedItems(page))[0].route).toBe('rounds');
  await rounds.click();
  await expect(rounds).toHaveAttribute('aria-pressed', 'false');
  await expect(inbox(page).locator('.cap-list__status')).toHaveText('Unrouted');
  expect((await savedItems(page))[0].route).toBeNull();
  await inbox(page).locator('#capCancel').click();
  await expect(page.locator('.fd-capture:visible .fd-capture__question')).toHaveText('A question to take on rounds?');
  await page.reload();
  await expect(page.locator('.fd-capture:visible .fd-capture__question')).toHaveText('A question to take on rounds?');
  await captureLauncher(page).click();
  await expect(inbox(page).locator('.cap-list__status')).toHaveText('Unrouted');
  await expect(inbox(page).locator('.cap-list [data-cap-route][aria-pressed="true"]')).toHaveCount(0);
  expect((await savedItems(page))[0].route).toBeNull();
});

test('the dock Capture control remains in the viewport after a long reader scroll', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?page=t_mood.md');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(captureLauncher(page)).toBeVisible();
  const box = await captureLauncher(page).boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
});

for (const [route, label] of [['rounds', 'Ask on rounds'], ['supervision', 'Discuss in supervision'], ['later', 'Look up later']]) {
  test(`route: ${label} persists locally and leaves the retained question in View all`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await captureLauncher(page).click();
    await page.locator('#capText').fill('How should I distinguish delirium from psychosis?');
    await page.locator('#capSave').click();
    await page.locator('.cap-next').getByRole('button', { name: label, exact: true }).click();
    expect((await savedItems(page))[0].route).toBe(route);
    await expect(inbox(page).locator('.cap-list li')).toContainText([label]);
    await inbox(page).locator('#capCancel').click();
    await page.reload();
    expect((await savedItems(page))[0].route).toBe(route);
    await captureLauncher(page).click();
    await expect(inbox(page).locator('.cap-list li .cap-list__text')).toHaveText('How should I distinguish delirium from psychosis?');
    await expect(inbox(page).locator('.cap-list li .cap-list__status')).toHaveText(label);
  });
}

test('saved-question dialog opens its suggested page without losing the question', async ({ page }) => {
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('How should I distinguish delirium from psychosis?');
  await page.locator('#capSave').click();
  const open = page.locator('.cap-next [data-cap-open]');
  const ref = await open.getAttribute('data-cap-ref');
  await open.click();
  await expect(page.locator('.cap-sheet')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe(ref);
  await captureLauncher(page).click();
  await expect(page.locator('.cap-list')).toContainText('How should I distinguish delirium from psychosis?');
});

test('deleting a just-saved question clears its suggested actions', async ({ page }) => {
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('How should I distinguish delirium from psychosis?');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-next')).toBeVisible();
  await page.locator('[data-cap-del]').click();
  await expect(page.locator('.cap-next')).toHaveCount(0);
  await expect(page.locator('.cap-list li')).toHaveCount(0);
});

test('Today capture clears a prior Reader context without corrupting the learner bookmark', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?page=orientation.md');
  await expect(page.locator('.fd-article')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw_last'))).toBe('orientation.md');

  await page.locator('[data-fd-home]').first().click();
  await expect(page.locator('.fd-today')).toBeVisible();
  await captureLauncher(page).click();
  await page.locator('#capText').fill('what should I review after rounds');
  await page.locator('#capSave').click();

  const saved = await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('cw_capture_v1')).items;
    return { ctx: items[items.length - 1].ctx, bookmark: localStorage.getItem('cw_last') };
  });
  expect(saved).toEqual({ ctx: null, bookmark: 'orientation.md' });
});

test('the interstitial holds a save that looks like it carries patient details', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  // capture-local ward-location rule: the shared PHI_PATTERNS deliberately do not carry it
  await page.locator('#capText').fill('the guy in room 302 keeps refusing meds why');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-phi')).toBeVisible();
  await expect(page.locator('.cap-list li')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('cw_capture_v1'))).toBeNull();
  // Edit returns to the textarea without writing
  await page.locator('#capHoldEdit').click();
  await expect(page.locator('.cap-phi')).toHaveCount(0);
  await expect(page.locator('.cap-list li')).toHaveCount(0);
  // the override is explicit and only then does it write
  await page.locator('#capSave').click();
  await page.locator('#capHoldSave').click();
  await expect(page.locator('.cap-list li')).toHaveCount(1);
});

test('route: reload retains the oldest unrouted question on Today and View all retains every route', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.addInitScript(() => localStorage.setItem('cw_capture_v1', JSON.stringify({
    v: 2, items: [
      { id: 'old', text: 'Oldest open question?', at: 100, ctx: null, route: null, state: 'open' },
      { id: 'rounds', text: 'Already for rounds?', at: 200, ctx: null, route: 'rounds', state: 'open' },
      { id: 'new', text: 'Newer open question?', at: 300, ctx: null, route: null, state: 'open' },
    ],
  })));
  await page.goto('/');
  const card = page.locator('.fd-capture:visible');
  await expect(card.locator('.fd-capture__question')).toHaveText('Oldest open question?');
  await expect(card.locator('.fd-capture__new')).toHaveText('View all 3');
  await page.reload();
  await expect(card.locator('.fd-capture__question')).toHaveText('Oldest open question?');
  await card.locator('.fd-capture__new').click();
  await expect(inbox(page).locator('.cap-list li')).toHaveCount(3);
  await expect(inbox(page).locator('.cap-list')).toContainText('Already for rounds?');
  await expect(inbox(page).locator('.cap-list')).toContainText('Newer open question?');
  await expect(inbox(page).locator('.cap-email-select:checked')).toHaveCount(0);
});

test('email draft: locked domain, invalid recipient, and no-PHI affirmation gate', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await saveQuestion(page, 'What makes a teaching explanation clear?');
  await expect(inbox(page).locator('.cap-email-select:checked')).toHaveCount(0);
  await expect(inbox(page).locator('#capEmailSelect')).toBeDisabled();
  await openEmailForFirstQuestion(page);
  const dialog = email(page);
  const local = dialog.locator('#capEmailLocal');
  const open = dialog.locator('#capEmailOpenDraft');
  await expect(dialog.locator('#capEmailSuffix')).toHaveText('@mainehealth.org');
  await expect(local).toHaveAttribute('aria-describedby', /capEmailSuffix/);
  expect(await dialog.locator('#capEmailSuffix').evaluate(el => [el.tagName, el.isContentEditable])).toEqual(['SPAN', false]);
  await expect(open).toBeDisabled();
  for (const invalid of ['first@elsewhere.org', 'first,second', 'first;second', 'first name', 'first%0ABcc']) {
    await local.fill(invalid);
    await dialog.locator('#capEmailAffirm').check();
    await expect(local).toHaveAttribute('aria-invalid', 'true');
    await expect(open).toBeDisabled();
  }
  await local.fill('faculty.name');
  await expect(open).toBeEnabled();
  await dialog.locator('#capEmailAffirm').uncheck();
  await expect(open).toBeDisabled();
});

test('email draft: selected questions and canonical source alone enter one detached mailto click', async ({ page, baseURL }) => {
  await page.setViewportSize(PHONE);
  await page.addInitScript(() => {
    window.__mailClicks = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith('mailto:')) {
        window.__mailClicks.push({ href: this.href, connected: this.isConnected });
        return;
      }
      return click.call(this);
    };
  });
  await page.goto('/?page=t_mood.md');
  await expect(page.locator('.fd-article')).toBeVisible();
  await saveQuestion(page, 'What distinguishes a useful mood-history question?');
  await inbox(page).locator('.cap-next [data-cap-route="rounds"]').click();
  await inbox(page).locator('#capCancel').click();
  await page.goto('/');
  await saveQuestion(page, 'This question stays private in the inbox.');
  await inbox(page).locator('#capCancel').click();
  await saveQuestion(page, 'What should I discuss in supervision?');
  await inbox(page).locator('.cap-next [data-cap-route="supervision"]').click();
  const rows = inbox(page).locator('.cap-list li');
  await rows.filter({ hasText: 'mood-history' }).locator('.cap-email-select').check();
  await inbox(page).getByRole('checkbox', { name: 'Select question for email: What should I discuss in supervision?' }).check();
  const siteRequests = [];
  page.on('request', req => { if (req.url().startsWith(baseURL)) siteRequests.push(req.url()); });
  await inbox(page).locator('#capEmailSelect').click();
  const dialog = email(page);
  await expect(dialog.locator('#capEmailCount')).toHaveText('2 selected questions');
  await expect(dialog.locator('#capEmailDigest')).not.toContainText('stays private');
  await dialog.locator('#capEmailLocal').fill('faculty.name');
  await dialog.locator('#capEmailAffirm').check();
  await dialog.locator('#capEmailOpenDraft').click();
  const clicks = await page.evaluate(() => window.__mailClicks);
  expect(clicks).toHaveLength(1);
  expect(clicks[0].connected).toBe(false);
  const uri = new URL(clicks[0].href);
  expect(uri.protocol).toBe('mailto:');
  expect(decodeURIComponent(uri.pathname)).toBe('faculty.name@mainehealth.org');
  expect(uri.searchParams.get('subject')).toBe('Psychiatry learning questions (2)');
  const body = uri.searchParams.get('body');
  expect(body).toContain('Ask on rounds\n1. What distinguishes a useful mood-history question?');
  expect(body).toContain(`${baseURL}/?page=t_mood.md`);
  expect(body).toContain('Discuss in supervision\n1. What should I discuss in supervision?');
  expect(body).not.toContain('This question stays private');
  expect(body).not.toContain('faculty.name');
  expect(siteRequests).toEqual([]);
  await expect(dialog.locator('#capEmailCopy')).toBeVisible();
  await expect(dialog.locator('#capEmailStatus')).toContainText('may have opened');
  expect((await savedItems(page)).map(item => item.route)).toEqual(['rounds', null, 'supervision']);
});

test('email draft: clipboard rejection exposes complete selectable text and close forgets private form state', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
  });
  await page.goto('/');
  await saveQuestion(page, 'What should I ask during teaching time?');
  await openEmailForFirstQuestion(page);
  const dialog = email(page);
  await expect(dialog).toHaveCSS('position', 'fixed');
  expect(await dialog.evaluate(el => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(
    await page.locator('.cap-backdrop').evaluate(el => Number(getComputedStyle(el).zIndex)));
  await dialog.locator('#capEmailLocal').fill('faculty.name');
  await dialog.locator('#capEmailAffirm').check();
  await dialog.locator('#capEmailCopy').click();
  await expect(dialog.locator('#capEmailFallback')).toBeVisible();
  await expect(dialog.locator('#capEmailFallbackText')).toHaveValue(/What should I ask during teaching time\?/);
  await expect(dialog.locator('#capEmailFallbackText')).toHaveAttribute('readonly', '');
  await dialog.locator('#capEmailClose').click();
  await expect(email(page)).toHaveCount(0);
  await expect(inbox(page).locator('.cap-email-select').first()).toBeFocused();
  await expect(inbox(page).locator('.cap-email-select:checked')).toHaveCount(0);
  await inbox(page).locator('.cap-email-select').check();
  await inbox(page).locator('#capEmailSelect').click();
  await expect(email(page).locator('#capEmailLocal')).toHaveValue('');
  await expect(email(page).locator('#capEmailAffirm')).not.toBeChecked();
  await expect(email(page).locator('#capEmailOpenDraft')).toBeDisabled();
  await expect(email(page).locator('#capEmailFallback')).toBeHidden();
});

test('email draft: long digest is not truncated and never clicks a mailto anchor', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.addInitScript(() => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `long_${i}`, text: `Question ${i}: ${'learning point '.repeat(16)}`,
      at: i + 1, ctx: null, route: null, state: 'open',
    }));
    localStorage.setItem('cw_capture_v1', JSON.stringify({ v: 2, items }));
    window.__mailClicks = 0;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith('mailto:')) { window.__mailClicks++; return; }
      return click.call(this);
    };
  });
  await page.goto('/');
  await captureLauncher(page).click();
  for (const checkbox of await inbox(page).locator('.cap-email-select').all()) await checkbox.check();
  await inbox(page).locator('#capEmailSelect').click();
  await email(page).locator('#capEmailLocal').fill('faculty.name');
  await email(page).locator('#capEmailAffirm').check();
  await email(page).locator('#capEmailOpenDraft').click();
  await expect(email(page).locator('#capEmailStatus')).toContainText('too long');
  await expect(email(page).locator('#capEmailFallback')).toBeVisible();
  const text = await email(page).locator('#capEmailFallbackText').inputValue();
  expect(text).toContain('Question 0:');
  expect(text).toContain('Question 7:');
  expect(await page.evaluate(() => window.__mailClicks)).toBe(0);
});

test('email draft: malformed stored Unicode shows a complete copy path instead of an inert handoff', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize(PHONE);
  await page.addInitScript(() => localStorage.setItem('cw_capture_v1', JSON.stringify({ v: 2, items: [
    { id: 'surrogate', text: 'Question with \uD800 marker', at: 1, ctx: null, route: null, state: 'open' },
  ] })));
  await page.goto('/');
  await captureLauncher(page).click();
  await inbox(page).locator('[data-cap-email-id]').first().check();
  await inbox(page).locator('#capEmailSelect').click();
  expect(errors).toEqual([]);
  await expect(email(page)).toBeVisible();
  await email(page).locator('#capEmailLocal').fill('faculty.name');
  await email(page).locator('#capEmailAffirm').check();
  await email(page).locator('#capEmailOpenDraft').click();
  await expect(email(page).locator('#capEmailStatus')).toContainText(/could not prepare|cannot prepare|invalid text/i);
  await expect(email(page).locator('#capEmailFallback')).toBeVisible();
  await expect(email(page).locator('#capEmailFallbackText')).toHaveValue(/Question with/);
});

test('email draft: APP invitation preserves stored identity and practice state while Capture remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize(PHONE);
  await page.goto('/?audience=app');
  if (testInfo.project.name.endsWith('-ms3')) {
    await expect(page.locator('.fd-app')).toHaveCount(0);
    return;
  }
  await expect(page.locator('.fd-app')).toBeVisible();
  await captureLauncher(page).click();
  await inbox(page).locator('#capText').fill('What makes a good supervision question?');
  await inbox(page).locator('#capSave').click();
  await expect(inbox(page).locator('.cap-next')).toBeVisible();
  await inbox(page).locator('#capCancel').click();
  await expect(page.locator('.fd-capture__question')).toHaveText('What makes a good supervision question?');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1')));
  expect(state.role).toBe('staff');
  expect(state.appPractice).toBeUndefined();
  await page.goto('/');
  await expect(page.locator('.fd-app')).toHaveCount(0);
});

test('a legitimate clinical question full of numbers is not held', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('why do we stop clozapine at QTc over 500');
  await page.locator('#capSave').click();
  await expect(page.locator('.cap-phi')).toHaveCount(0);
  await expect(page.locator('.cap-list li')).toHaveCount(1);
});

test('T12: a capture is never exported with the study data', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await captureLauncher(page).click();
  await page.locator('#capText').fill('why clozapine here');
  await page.locator('#capSave').click();
  await page.locator('#capCancel').click();
  const payload = await page.evaluate(() => {
    let captured = null;
    const realBlob = window.Blob;
    // eslint-disable-next-line func-names
    window.Blob = function (parts, opts) { captured = String(parts[0]); return new realBlob(parts, opts); };
    const a = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {};
    window.exportStudy();
    window.HTMLAnchorElement.prototype.click = a;
    window.Blob = realBlob;
    return captured;
  });
  expect(payload).toContain('clerkship-study-v2');
  expect(payload).not.toContain('cw_capture_v1');
  expect(payload).not.toContain('why clozapine here');
});

test('T10: the phone dock adds no horizontal overflow and replaces the Reader action bar', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/?page=t_mood.md');
  await expect(captureLauncher(page)).toBeVisible();
  await expect(page.locator('.fd-actionbar:visible,#fdCaptureMount:visible')).toHaveCount(0);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});

test('the visible Capture launcher stays fixed, reachable, and inside the viewport', async ({ page }) => {
  const cases = [
    { label: 'Today', url: '/', ready: '.fd-today' },
    { label: 'Reader', url: '/?page=t_mood.md', ready: '.fd-reader .fd-article__body' },
  ];
  for (const viewport of [NARROW, PHONE, DESKTOP]) {
    await page.setViewportSize(viewport);
    for (const surface of cases) {
      await page.goto(surface.url);
      await expect(page.locator(surface.ready)).toBeVisible();
      await expect(captureLauncher(page)).toBeVisible();
      const geometry = await page.evaluate(() => {
        const mount = window.innerWidth <= 640
          ? document.querySelector('.fd-dock') : document.querySelector('#fdCaptureMount');
        const button = mount.querySelector('[data-capture-open]');
        const mountBox = mount.getBoundingClientRect();
        const buttonBox = button.getBoundingClientRect();
        return {
          position: getComputedStyle(mount).position,
          mountTop: mountBox.top,
          mountBottom: mountBox.bottom,
          buttonTop: buttonBox.top,
          buttonBottom: buttonBox.bottom,
          buttonWidth: buttonBox.width,
          buttonHeight: buttonBox.height,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          viewportHeight: window.innerHeight,
        };
      });
      expect(geometry.position, `${viewport.width}px ${surface.label} mount position`).toBe('fixed');
      expect(geometry.mountTop).toBeGreaterThanOrEqual(0);
      expect(geometry.mountBottom).toBeLessThanOrEqual(geometry.viewportHeight);
      expect(geometry.buttonTop).toBeGreaterThanOrEqual(0);
      expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.viewportHeight);
      expect(geometry.buttonWidth).toBeGreaterThanOrEqual(44);
      expect(geometry.buttonHeight).toBeGreaterThanOrEqual(44);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    }
  }
});

test('phone page endings scroll clear of the fixed dock', async ({ page }) => {
  for (const viewport of [NARROW, PHONE]) {
    await page.setViewportSize(viewport);
    for (const url of ['/', '/?tab=path', '/?tab=library']) {
      await page.goto(url);
      await expect(captureLauncher(page)).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const geometry = await page.evaluate(() => ({
        contentBottom: document.querySelector('#content > :last-child').getBoundingClientRect().bottom,
        launcherTop: document.querySelector('.fd-dock').getBoundingClientRect().top,
      }));
      expect(geometry.contentBottom, `${viewport.width}px ${url}: ${JSON.stringify(geometry)}`)
        .toBeLessThanOrEqual(geometry.launcherTop);
    }
  }
});

test('faculty exact-revision preview never exposes the learner capture launcher', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/?page=orientation.md&reviewKey=page%3Aorientation.md&reviewToken=0123456789abcdef0123456789abcdef');
  await expect(captureLauncher(page)).toHaveCount(0);
});
