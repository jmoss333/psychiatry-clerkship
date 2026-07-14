import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';


const ANCHOR_VECTORS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../anki/fixtures/anchor_vectors.json', import.meta.url)),
    'utf8',
  ),
);

const SOURCE_PAGE = 'exp_consult.md';
const SOURCE_ANCHOR = 'catatonia-do-not-miss-immobility-or-excitement';


async function expectAnchorVisible(page) {
  const target = page.locator(`#${SOURCE_ANCHOR}`);
  await expect(target).toHaveCount(1);
  const section = target.locator('xpath=ancestor::section[contains(@class,"sec-c")]');
  await expect(section).toHaveClass(/\bopen\b/);
  await expect(section.locator('.sec-h button')).toHaveAttribute('aria-expanded', 'true');
  await expect
    .poll(async () => target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight;
    }))
    .toBe(true);
}


test('SPA heading fragments match the shared Python golden vectors', async ({ page }) => {
  await page.goto(`/?page=${SOURCE_PAGE}#${SOURCE_ANCHOR}`);
  await page.waitForSelector('#content h1');

  const actual = await page.evaluate(
    (vectors) => vectors.map((vector) => window.__pclHeadingSlug(vector.heading)),
    ANCHOR_VECTORS,
  );

  expect(actual).toEqual(ANCHOR_VECTORS.map((vector) => vector.expected));
});


test('source fragment opens its collapsed section and survives back navigation', async ({ page }) => {
  await page.goto(`/?page=${SOURCE_PAGE}#${SOURCE_ANCHOR}`);
  await page.waitForSelector('#content h1');

  await expect(page).toHaveURL(new RegExp(
    `\\?page=${SOURCE_PAGE.replace('.', '\\.')}#${SOURCE_ANCHOR}$`,
  ));
  await expectAnchorVisible(page);

  await page.locator('.navitem[data-f="t_mood.md"]').evaluate((button) => button.click());
  await expect(page).toHaveURL(/\?page=t_mood\.md$/);
  await page.goBack();
  await page.waitForSelector(`#${SOURCE_ANCHOR}`);

  await expect(page).toHaveURL(new RegExp(`#${SOURCE_ANCHOR}$`));
  await expectAnchorVisible(page);
});
