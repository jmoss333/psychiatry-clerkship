import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const names = ['jordan','eli','leah','marisol'];
const files = ['../../longitudinal_case.json', '../../08_Cases_and_Simulation/case-journeys/eli-psychosis.json', '../../08_Cases_and_Simulation/case-journeys/leah-depression-trauma.json', '../../08_Cases_and_Simulation/case-journeys/marisol-delirium-capacity.json'];

for (const [index, slug] of names.entries()) {
  test(`${slug}: all six chapters render reviewed text, with keyboard navigation and no saved progress`, async ({page}) => {
    const data = JSON.parse(fs.readFileSync(new URL(files[index],import.meta.url),'utf8'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('cw_longitudinal_v1', 'existing-learner-value'));
    await page.goto(`/tools/one-patient-six-weeks.html?case=${slug}`);
    await expect(page.getByRole('heading',{name:'Case Journey Library',exact:true})).toBeVisible();
    await expect(page.locator('.opf-case-card[aria-current="page"]')).toContainText(data.patient.displayName);
    await expect(page.locator('html')).toHaveAttribute('data-case-accent', index === 0 ? 'clay' : data.suggestedAccent);
    await expect(page.locator('.opf-folio')).toBeVisible();
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(6);
    for (const [i, chapter] of data.weeks.entries()) {
      await tabs.nth(i).click();
      const panel = page.getByRole('tabpanel');
      for (const text of [chapter.patientState,chapter.learnerTask,chapter.handoff,chapter.reflectionPrompt,
        ...chapter.checklist.flatMap(item=>[item.prompt,item.example]),...chapter.links.map(link=>link.label)]) {
        await expect(panel.getByText(text,{exact:true})).toHaveCount(1);
      }
      await expect(page.getByRole('tab',{selected:true})).toHaveCount(1);
      await expect(tabs.nth(i)).toBeFocused();
    }
    await tabs.nth(5).press('Home');
    await expect(tabs.nth(0)).toBeFocused();
    await tabs.nth(0).press('ArrowLeft');
    await expect(tabs.nth(5)).toBeFocused();
    await tabs.nth(5).press('ArrowRight');
    await expect(tabs.nth(0)).toBeFocused();
    await tabs.nth(0).press('End');
    await expect(tabs.nth(5)).toBeFocused();
    expect(await page.evaluate(()=>localStorage.getItem('cw_longitudinal_v1'))).toBe('existing-learner-value');
    await expect(page.locator('input,textarea,[contenteditable="true"]')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.addScriptTag({content:fs.readFileSync(new URL('../../13_Faculty_Resources/_automation/site_build/theme_scan.js',import.meta.url),'utf8')});
    const scan = await page.evaluate(()=>window.cwThemeScan.install(document,window).measure());
    expect(scan.frozen).toEqual({});
    expect(scan.lowLight).toEqual({});
    expect(scan.lowDark).toEqual({});
  });
}

test('old Jordan week links, unknown cases, mobile reflow, and resource navigation',async ({page},testInfo)=>{
  await page.goto('/tools/one-patient-six-weeks.html?week=4');
  await expect(page.getByRole('tab').nth(3)).toHaveAttribute('aria-selected','true');
  await page.goto('/tools/one-patient-six-weeks.html?case=unknown&chapter=99');
  await expect(page.locator('.opf-case-card[aria-current="page"]')).toContainText('Jordan');
  await expect(page.getByRole('status').filter({hasText:'Jordan is shown'})).toBeVisible();
  await page.goto('/tools/one-patient-six-weeks.html?case=eli');
  await expect(page.getByRole('tab')).toHaveCount(6);
  for (const width of [320,390]) {
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('tab').nth(5).click();
    await expect(page.getByRole('tab').nth(5)).toBeInViewport();
  }
  await page.screenshot({path:testInfo.outputPath('eli-mobile.png'),fullPage:true});
  await page.getByText('Reflect and explore',{exact:true}).click();
  await page.locator('.opf-reflection a').first().click();
  await expect(page).toHaveURL(/index\.html\?(page|tool)=/);
});

test('an unavailable case asset produces a useful error instead of partial teaching content',async ({page})=>{
  await page.route('**/leah-depression-trauma.json',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.goto('/tools/one-patient-six-weeks.html');
  await expect(page.getByRole('alert').filter({hasText:'case journeys could not load'})).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
});
