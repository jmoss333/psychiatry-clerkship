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


test('rendered headings honor fenced code and indented ATX Markdown', async ({ page }) => {
  await page.route('**/content/exp_consult.md', async (route) => {
    await route.fulfill({
      contentType: 'text/markdown',
      body: `# Synthetic Source

\`\`\`markdown
## Fenced Heading
\`\`\`

   ## Indented [Safety planning][ref]

Visible section.

[ref]: https://example.test
`,
    });
  });

  await page.goto('/?page=exp_consult.md#indented-safety-planning');
  await page.waitForSelector('#content h1');

  await expect(page.locator('#indented-safety-planning')).toHaveCount(1);
  await expect(page.locator('#fenced-heading')).toHaveCount(0);
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


test('delayed metadata rerenders preserve fragment, history, collapse, and viewport', async ({ page }) => {
  let releaseReviewed;
  let releaseTopicMeta;
  await page.route('**/reviewed.json', async (route) => {
    await new Promise((resolve) => { releaseReviewed = resolve; });
    await route.continue();
  });
  await page.route('**/topic_meta.json', async (route) => {
    await new Promise((resolve) => { releaseTopicMeta = resolve; });
    await route.continue();
  });

  await page.goto(`/?page=${SOURCE_PAGE}#${SOURCE_ANCHOR}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector(`#${SOURCE_ANCHOR}`);
  await expect.poll(() => Boolean(releaseReviewed && releaseTopicMeta)).toBe(true);
  const historyLength = await page.evaluate(() => history.length);
  await expectAnchorVisible(page);

  releaseReviewed();
  releaseTopicMeta();
  await page.waitForSelector('.reviewed.page-review-footer');
  await page.waitForSelector('.topic-tpl');

  await expect(page).toHaveURL(new RegExp(`#${SOURCE_ANCHOR}$`));
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expectAnchorVisible(page);
});
