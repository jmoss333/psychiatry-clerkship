import { test, expect } from '@playwright/test';
import { audienceOf } from './audience.js';

// Independently chosen cues from the accounts and their attributed handoff sentences.
const evidence = {
  a: {
    patient: { quote: 'ride to school', fact: 'ride to school' },
    nurse: { quote: 'brought his tray back', fact: 'returned his tray' },
    sister: { quote: 'since we were teenagers', fact: 'since adolescence' },
  },
  b: {
    patient: { quote: 'two or three hours', fact: 'two to three hours' },
    nurse: { quote: 'writing down jobs', fact: 'writing down jobs' },
    sister: { quote: 'four mornings', fact: 'four mornings' },
  },
};
const orders = [
  ['patient', 'nurse', 'sister'], ['patient', 'sister', 'nurse'],
  ['nurse', 'patient', 'sister'], ['nurse', 'sister', 'patient'],
  ['sister', 'patient', 'nurse'], ['sister', 'nurse', 'patient'],
];
const conclusions = {
  facts: /time course open/i,
  pattern: /familiar brief reactions/i,
  change: /change in sleep and activity/i,
};

function supported(version, heard, choice) {
  if (choice === 'facts') return heard.size > 0;
  if (choice === 'pattern') return version === 'a' && heard.has('nurse') && heard.has('sister');
  return version === 'b' && heard.has('patient') && heard.has('sister');
}

async function expectTimeline(card, heard) {
  const rows = await card.locator('[data-row]').evaluateAll(nodes =>
    Object.fromEntries(nodes.map(row => [row.dataset.row, row.dataset.opened])));
  expect(rows).toEqual({
    patient: String(heard.has('patient')),
    nurse: String(heard.has('nurse')),
    sister: String(heard.has('sister')),
  });
  await expect(card.locator('[data-bf="progress"]')).toContainText(`${heard.size} of 3 heard`);
}

async function expectDecisionCleared(card) {
  await expect(card.locator('button[data-handoff][aria-pressed="true"]')).toHaveCount(0);
  await expect(card.locator('[data-bf="handoff-output"]')).toBeHidden();
  await expect(card.locator('[data-bf="feedback"]')).toHaveText('');
  await expect(card.locator('[data-bf="debrief"]')).toBeHidden();
}

async function expectFresh(card, version) {
  await expect(card.locator(`button[data-version="${version}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expectTimeline(card, new Set());
  await expect(card.locator('[data-bf="quote"]')).toBeHidden();
  await expect(card.locator('[data-bf="handoffs"]')).toBeHidden();
  await expectDecisionCleared(card);
}

async function expectAttributedFacts(output, version, heard) {
  const facts = await output.locator('[data-fact]').evaluateAll(nodes =>
    nodes.map(el => ({ source: el.dataset.fact, text: el.innerText.toLowerCase() })));
  expect(facts.map(fact => fact.source).sort()).toEqual([...heard].sort());
  for (const { source, text } of facts) expect(text).toContain(evidence[version][source].fact);

  // A leaked detail could sit outside the attributed spans or come from the other history.
  const fullText = (await output.innerText()).toLowerCase();
  for (const [history, accounts] of Object.entries(evidence)) {
    for (const [source, cues] of Object.entries(accounts)) {
      if (history === version && heard.has(source)) continue;
      for (const cue of Object.values(cues)) expect(fullText).not.toContain(cue);
    }
  }
}

async function checkChoice(card, version, heard, choice) {
  const button = card.locator(`button[data-handoff="${choice}"]`);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const output = card.locator('[data-bf="handoff-output"]');
  const feedback = card.locator('[data-bf="feedback"]');
  const debrief = card.locator('[data-bf="debrief"]');
  if (!supported(version, heard, choice)) {
    await expect(output).toBeHidden();
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText(/sister|nurse|patient|feeling tired/i);
    await expect(debrief).toBeHidden();
    return;
  }

  await expect(feedback).toBeHidden();
  await expect(output).toBeVisible();
  await expect(output).toContainText(conclusions[choice]);
  await expectAttributedFacts(output, version, heard);
  if (heard.size < 3) {
    await expect(debrief).toBeHidden();
    return;
  }
  const reasoning = debrief.getByText(version === 'a' ? /before yelling/i : /mood episode/i);
  await expect(debrief).toBeVisible();
  await expect(reasoning).toBeHidden();
  await debrief.locator('summary').press('Enter');
  await expect(reasoning).toBeVisible();
}

for (const version of ['a', 'b']) {
  test(`Before breakfast history ${version.toUpperCase()} grounds each handoff in the interviews heard`, async ({ page }, info) => {
    const other = version === 'a' ? 'b' : 'a';
    await page.setViewportSize({ width: version === 'a' ? 320 : 390, height: 844 });
    const response = await page.goto('/?page=t_impulse.md&guideSection=initial-workup');
    expect(response.ok()).toBe(true);
    const servedAudience = (await response.text()).match(/var FD_AUDIENCE="([^"]+)"/)?.[1];
    expect(servedAudience).toBe(audienceOf(info.project.name));
    const article = page.locator('.fd-reader .fd-article[data-ref="t_impulse.md"]');
    const section = article.locator('.fd-guide-section').filter({ has: page.locator('#guide-initial-workup') });
    const card = section.locator('#impulse-breakfast');
    await expect(section.locator('> .fd-guide-lead')).toContainText('Initial workup');
    await expect(card).toBeVisible();
    const selectVersion = key => card.locator(`button[data-version="${key}"]`).click();
    if (version === 'b') await selectVersion(version);

    for (const [index, order] of orders.entries()) {
      await test.step(order.join(' → '), async () => {
        if (index > 0) {
          await selectVersion(other);
          await expectFresh(card, other);
          await selectVersion(version);
        }
        await expectFresh(card, version);
        const heard = new Set();
        for (const source of order) {
          heard.add(source);
          const row = card.locator(`[data-row="${source}"]`);
          await row.locator(`button[data-source="${source}"]`).click();
          await expectTimeline(card, heard);
          await expectDecisionCleared(card);
          const quote = row.locator('[data-bf="quote"]');
          await expect(quote).toBeVisible();
          await expect(quote).toContainText(evidence[version][source].quote, { ignoreCase: true });
          await expect(card.locator('[data-bf="quote"]:visible')).toHaveCount(1);

          // Rotate the last decision so starting an interview and switching histories clear
          // both a previously successful handoff and a previously rejected one.
          const choices = Object.keys(conclusions);
          const shift = (index + heard.size) % choices.length;
          for (const choice of [...choices.slice(shift), ...choices.slice(0, shift)]) {
            await checkChoice(card, version, heard, choice);
          }
        }
      });
    }
  });
}
