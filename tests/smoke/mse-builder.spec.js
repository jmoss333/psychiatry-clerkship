import { test, expect } from '@playwright/test';

const TOOL = '/tools/mse.html';

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
