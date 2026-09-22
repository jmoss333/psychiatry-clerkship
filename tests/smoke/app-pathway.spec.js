import { test, expect } from '@playwright/test';
import { isResidentProject } from './audience.js';

const PHONE = { width: 390, height: 844 };
const privateTerms = /appBridge|appReflection|\bpmhnp\b|\brevisit\b/i;

async function enterApp(page) {
  await page.goto('/');
  await page.locator('[data-fd-role="app"]').click();
  await expect(page.locator('.fd-app')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'On shift', exact: true })).toBeVisible();
}

test('APP entry is absent from MS3 and available only on the resident preview', async ({ page }, testInfo) => {
  await page.goto('/');
  const appChoice = page.locator('[data-fd-role="app"]');
  if (!isResidentProject(testInfo.project.name)) {
    await expect(appChoice).toHaveCount(0);
    await expect(page.locator('[data-fd-app-practice-open]')).toHaveCount(0);
    await expect(page.locator('.fd-app-practice')).toHaveCount(0);
    expect(await page.evaluate(() => Object.hasOwn(window.FD_CURRICULUM || {}, 'appPathway'))).toBe(false);
    return;
  }

  await expect(appChoice).toBeVisible();
  await appChoice.click();
  await expect(page.locator('.fd-app__bridge-choice')).toHaveCount(2);
  await expect(page.locator('.fd-app__resource')).toHaveCount(8);
  await expect(page.locator('[data-fd-app-shift]')).toHaveCount(3);
  await expect(page.locator('[data-fd-tab="today"]')).toHaveText('On shift');
  await expect(page.locator('[data-fd-tab="path"]')).toHaveCount(0);
});

test('APP change practice is keyboard-operable, non-evaluative, and private', async ({ page }, testInfo) => {
  test.skip(!isResidentProject(testInfo.project.name), 'APP practice is resident-build only');
  const writes = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.postData() || '');
  });
  await enterApp(page);

  const open = page.locator('[data-fd-app-practice-open="training-briefing"]');
  await open.focus();
  await page.keyboard.press('Enter');
  const practice = page.locator('.fd-app-practice');
  await expect(practice).toBeVisible();
  await expect(practice).not.toContainText('marked unconfirmed');

  await page.locator('[data-fd-app-practice-reveal]').focus();
  await page.keyboard.press('Enter');
  await expect(practice).toContainText('marked unconfirmed');
  const before = await page.locator('.fd-app-practice__before').boundingBox();
  const now = await page.locator('.fd-app-practice__now').boundingBox();
  expect(before && now && before.x + before.width <= now.x).toBe(true);

  for (const value of [
    'review-time:still-known', 'source-status:changed', 'verification-owner:clarify',
  ]) {
    await page.locator(`[data-fd-app-practice-classify="${value}"]`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`[data-fd-app-practice-classify="${value}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('[data-fd-app-practice-question="confirm-owner"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-fd-app-practice-question="confirm-owner"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(practice).toContainText('Who should confirm the source note?');
  await expect(practice).toContainText(
    'Private rehearsal. No score, no saved response, and nothing is sent.');
  await expect(practice).not.toContainText(/pass|fail|correct|competent|entrust/i);

  await page.setViewportSize(PHONE);
  expect(await practice.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const phoneBefore = await page.locator('.fd-app-practice__before').boundingBox();
  const phoneNow = await page.locator('.fd-app-practice__now').boundingBox();
  expect(phoneBefore && phoneNow && phoneBefore.y + phoneBefore.height <= phoneNow.y).toBe(true);
  await expect(page.locator('[data-fd-app-practice-classify]').first()).toHaveCSS('min-height', '44px');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.fd-app-practice__seam')).toHaveCSS('animation-name', 'none');

  const stored = await page.evaluate(() => localStorage.getItem('cw_frontdoor_v1') || '');
  expect(stored).not.toMatch(/training-briefing|review-time|source-status|verification-owner|still-known|changed|clarify|confirm-owner/);
  expect(writes.join('\n')).not.toMatch(/training-briefing|review-time|source-status|verification-owner|still-known|changed|clarify|confirm-owner/);
});

test('both bridges share three tasks while only the bridge persists', async ({ page }, testInfo) => {
  test.skip(!isResidentProject(testInfo.project.name), 'APP preview is intentionally resident-build only');
  const requests = [];
  page.on('request', request => requests.push(`${request.method()} ${request.url()} ${request.postData() || ''}`));
  await enterApp(page);

  await expect(page.getByRole('heading', { name: 'PA psychiatry bridge' })).toBeVisible();
  await expect(page.locator('.fd-app__resource')).toHaveCount(8);

  const pmhnp = page.locator('[data-fd-app-bridge="pmhnp"]');
  await pmhnp.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'PMHNP medical-systems bridge' })).toBeVisible();
  await expect(page.locator('.fd-app__resource')).toHaveCount(8);
  await expect(page.locator('[data-fd-app-shift]')).toHaveCount(3);

  await page.locator('[data-fd-app-shift="medication-follow-through"]').click();
  await expect(page.locator('.fd-app__task.is-active')).toContainText('Medication plan and follow-through');
  await page.locator('[data-fd-app-reflect="supervisor"]').click();
  await expect(page.locator('.fd-app__private-note[role="status"]')).toContainText('Nothing is sent or shared');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cw_frontdoor_v1') || '{}'));
  expect(stored.role).toBe('app');
  expect(stored.appBridge).toBe('pmhnp');
  expect(Object.hasOwn(stored, 'appActivity')).toBe(false);
  expect(Object.hasOwn(stored, 'appReflection')).toBe(false);

  await page.locator('[data-fd-app-reset]').click();
  await expect(page.locator('.fd-app__task.is-active')).toHaveCount(0);
  await expect(page.locator('.fd-app__private-note[role="status"]')).toHaveCount(0);
  expect(requests.join('\n')).not.toMatch(privateTerms);
});

test('canonical APP resource returns to On shift with governance intact', async ({ page }, testInfo) => {
  test.skip(!isResidentProject(testInfo.project.name), 'APP preview is intentionally resident-build only');
  await enterApp(page);

  await page.locator('[data-fd-app-start="pg_interview.md"]').first().click();
  await expect(page.locator('.fd-reader .fd-article__body')).toBeVisible();
  await expect(page.locator('.fd-src')).toHaveText('pg_interview.md');
  await expect(page.locator('.fd-reader__back')).toContainText('On shift');
  await expect(page.locator('.governance-notice')).toHaveCount(1);

  await page.locator('.fd-reader__back').click();
  await expect(page.locator('.fd-app')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'On shift', exact: true })).toBeVisible();
});

test('APP workspace stacks without horizontal overflow at phone width', async ({ page }, testInfo) => {
  test.skip(!isResidentProject(testInfo.project.name), 'APP preview is intentionally resident-build only');
  await page.setViewportSize(PHONE);
  await enterApp(page);

  await page.locator('[data-fd-app-bridge="pmhnp"]').click();
  await page.locator('[data-fd-app-shift="initial-evaluation"]').click();
  await page.locator('[data-fd-app-reflect="revisit"]').click();
  expect(await page.locator('.fd-app').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.locator('.fd-app__tasks')).toHaveCSS('grid-template-columns', /\d+px/);
  await expect(page.locator('.fd-app__reflection-choice').first()).toHaveCSS('min-height', '44px');
});
