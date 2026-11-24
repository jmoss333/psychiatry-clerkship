import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { audienceOf } from './audience.js';

const { resources } = JSON.parse(readFileSync(new URL('../../crisis_resources.json', import.meta.url), 'utf8'));
const lifeline = resources.find(resource => resource.id === 'lifeline_988').contact.match(/\d+/)[0];
const emergency = resources.find(resource => resource.id === 'emergency_911').contact;

async function checkArtwork(activity) {
  const art = activity.locator('img:visible');
  await expect(art).toHaveCount(1);
  await expect(art).toHaveAttribute('alt', /\S+/);
  await art.scrollIntoViewIfNeeded();
  return art.evaluate(async image => {
    await image.decode();
    return image.currentSrc;
  });
}

async function checkRevisedLine(line, chosen) {
  if (chosen === 'roommate') {
    await expect(line).toContainText(/knock on my roommate.s door/i);
    await expect(line).toContainText(`text ${lifeline} right away`);
  } else {
    await expect(line).toContainText(`text ${lifeline} myself`);
    await expect(line).not.toContainText(/roommate/i);
  }
}

for (const [chosen, other, width] of [['roommate', 'text', 390], ['text', 'roommate', 320]]) {
  test(`Lucía rehearses the ${chosen} route from a fresh Safety Planning reader at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const response = await page.goto('/?page=suicide.md');
    expect(response.ok()).toBe(true);
    const servedAudience = (await response.text()).match(/var FD_AUDIENCE="([^"]+)"/)?.[1];
    expect(servedAudience).toBe(audienceOf(testInfo.project.name));
    const article = page.locator('.fd-reader .fd-article[data-ref="suicide.md"] .fd-article__body');
    const activity = article.locator('#lucia-rehearsal');
    const byId = id => activity.locator('#lucia-' + id);
    const ask = key => byId('ask-' + key);
    const pick = key => byId('pick-' + key);
    const result = byId('result');
    const apply = byId('apply');
    const feedback = byId('feedback');

    await expect(activity).toBeVisible();
    await expect(activity).toContainText('you and Lucía rehearse');
    await expect(activity).not.toContainText(/\bLuz\b/);
    const management = article.getByText(/^Management\.?$/);
    const student = article.getByText(/^What the student does\.?$/);
    await expect(management).toBeVisible();
    await expect(student).toBeVisible();
    const labels = await management.or(activity).or(student).evaluateAll(nodes =>
      nodes.map(node => node.id === 'lucia-rehearsal' ? node.id : node.textContent.trim().replace(/\.$/, '')));
    expect(labels).toEqual(['Management', 'lucia-rehearsal', 'What the student does']);

    const contacts = article.locator('blockquote:has(.crisis-block-hook)');
    await expect(contacts).toBeVisible();
    for (const { name, contact } of resources) {
      await expect(contacts).toContainText(name);
      await expect(contacts).toContainText(contact);
    }
    await expect(byId('day')).toBeVisible();
    await expect(byId('night')).toBeHidden();
    await expect(ask(chosen)).toBeHidden();
    await expect(result).toBeHidden();
    const dayArt = await checkArtwork(activity);

    await byId('try-night').press('Enter');
    await expect(byId('night')).toBeVisible();
    await expect(byId('barrier')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(ask('roommate')).toBeFocused();
    await expect(activity.getByText(/my sister keeps her phone on silent/i)).toBeVisible();
    expect(await checkArtwork(activity)).not.toBe(dayArt);
    await expect(apply).toBeDisabled();
    await expect(pick(chosen)).toBeDisabled();
    await expect(pick(other)).toBeDisabled();

    await pick('sister').press('Space');
    await apply.press('Enter');
    await expect(feedback).toBeVisible();
    await expect(feedback).toBeFocused();
    await expect(feedback).toContainText(/silent phone/);
    await expect(result).toBeHidden();

    await ask(chosen).press('Enter');
    const reply = byId('reply-' + chosen);
    await expect(reply).toBeVisible();
    await expect(reply).toContainText(lifeline);
    await expect(pick(chosen)).toBeEnabled();
    await expect(pick(other)).toBeDisabled();
    await pick(chosen).press('Space');
    await expect(pick(chosen)).toBeChecked();
    await expect(result).toBeHidden();
    await apply.press('Enter');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/sister during the day/);
    await expect(result).toContainText(`call ${emergency} for emergency help right away`);
    const line = byId('new-line');
    await checkRevisedLine(line, chosen);
    await expect(byId('result-title')).toBeFocused();
    expect(await activity.evaluate(root =>
      root.getBoundingClientRect().left >= 0 && root.getBoundingClientRect().right <= innerWidth &&
      root.scrollWidth <= root.clientWidth + 1
    )).toBe(true);

    await byId('edit').press('Enter');
    await expect(result).toBeHidden();
    await expect(apply).toBeDisabled();
    await ask(other).press('Enter');
    await expect(pick(chosen)).toBeEnabled();
    await expect(pick(other)).toBeEnabled();
    await pick(other).press('Space');
    await expect(result).toBeHidden();
    await apply.press('Enter');
    await expect(result).toBeVisible();
    await checkRevisedLine(line, other);

    await byId('reset').press('Enter');
    await expect(byId('day')).toBeVisible();
    await expect(byId('night')).toBeHidden();
    await expect(result).toBeHidden();
    expect(await checkArtwork(activity)).toBe(dayArt);
    await byId('try-night').press('Enter');
    for (const key of [chosen, other]) {
      await expect(ask(key)).toHaveAttribute('aria-expanded', 'false');
      await expect(byId('reply-' + key)).toBeHidden();
      await expect(pick(key)).toBeDisabled();
    }
    await expect(activity.locator('input:checked')).toHaveCount(0);
    await expect(feedback).toBeHidden();
    await expect(apply).toBeDisabled();
  });
}
