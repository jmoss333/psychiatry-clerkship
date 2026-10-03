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


test('Eli pilot: visible task/discussion, optional model and safe resource return preserve the chapter', async ({page, context}, testInfo) => {
  const data = JSON.parse(fs.readFileSync(new URL(files[1], import.meta.url), 'utf8'));
  const requests = [];
  page.on('request', request => requests.push({method:request.method(), url:request.url()}));
  await page.addInitScript(() => localStorage.setItem('cw_longitudinal_v1', 'existing-learner-value'));
  await page.goto('/tools/one-patient-six-weeks.html?case=eli&chapter=4');
  await expect(page.getByRole('tab').nth(3)).toHaveAttribute('aria-selected', 'true');
  for (const width of [1280,320,390]) {
    await page.setViewportSize({width,height:900});
    for (let i=0; i<4; i++) {
      await page.getByRole('tab').nth(i).click();
      const chapter = data.weeks[i];
      await expect(page.getByText(chapter.patientState,{exact:true})).toBeVisible();
      await expect(page.getByText(chapter.learnerTask,{exact:true})).toBeVisible();
      await expect(page.getByText(chapter.reflectionPrompt,{exact:true})).toBeVisible();
      await expect(page.locator('.opf-source-boundary')).toContainText(data.disclaimer);
      const model = page.locator('.opf-model');
      await expect(model).not.toHaveAttribute('open','');
      const summary = model.locator('summary');
      await page.keyboard.press('Tab');
      await summary.focus();
      await expect(summary).toBeFocused();
      expect(await summary.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
      expect((await summary.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await summary.press('Enter');
      await expect(model.locator('blockquote')).toHaveText(chapter.checklist[0].example);
      await summary.press('Enter');
      await expect(model.locator('blockquote')).not.toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  }
  await page.screenshot({path:testInfo.outputPath('eli-pilot-mobile.png'),fullPage:true});
  await page.getByRole('tab').nth(1).click();
  const link = page.locator('.opf-chapter-resources a').first();
  await expect(link).toHaveAttribute('target','_blank');
  await expect(link).toHaveAttribute('rel','noopener noreferrer');
  expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const popupPromise = context.waitForEvent('page');
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/\/\?page=collateral_workflow\.md$/);
  expect(await popup.evaluate(()=>window.opener)).toBeNull();
  expect(await popup.evaluate(()=>document.referrer)).toBe('');
  await popup.close();
  await page.bringToFront();
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.opf-model')).not.toHaveAttribute('open','');
  await page.getByRole('tab').nth(4).click();
  await expect(page.getByText('Reflect and explore',{exact:true})).toBeVisible();
  await expect(page.locator('.opf-model')).toHaveCount(0);
  await page.goto('/tools/one-patient-six-weeks.html?case=leah&chapter=3');
  await page.goBack();
  await expect(page.getByRole('tab').nth(3)).toHaveAttribute('aria-selected','true');
  await page.goForward();
  await expect(page.locator('.opf-case-card[aria-current="page"]')).toContainText('Leah');
  expect(await page.evaluate(()=>localStorage.getItem('cw_longitudinal_v1'))).toBe('existing-learner-value');
  expect(requests.filter(r=>r.method!=='GET')).toEqual([]);
  await expect(page.locator('input,textarea,[contenteditable="true"]')).toHaveCount(0);
});

test('Eli pilot remains on the same chapter when launched inside the learner shell', async ({page, context}, testInfo) => {
  await page.addInitScript(role => {
    const now = new Date();
    now.setDate(now.getDate()-((now.getDay()+6)%7));
    localStorage.setItem('cw_rotation_start',`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
    localStorage.setItem('cw_frontdoor_v1',JSON.stringify({role,tab:'today',viewWeek:1,autoAdvance:false}));
  }, testInfo.project.name==='nav-res'?'pgy1':'student');
  await page.goto('/index.html?tool=one-patient-six-weeks.html');
  const frame = page.frameLocator('.fd-article iframe');
  await frame.locator('.opf-case-card[href="?case=eli"]').click();
  await frame.getByRole('tab').nth(2).click();
  await expect(frame.getByText('Discuss · carry it to rounds',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('eli-pilot-desktop.png'),fullPage:true});
  const popupPromise=context.waitForEvent('page');
  await frame.locator('.opf-chapter-resources a').first().click();
  const popup=await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/\/\?page=med_monitoring\.md$/);
  await expect(popup.locator('.fd-article__h1')).toBeVisible();
  await expect(popup.locator('.fd-article__h1')).toHaveText(/monitor/i);
  expect(await popup.evaluate(()=>window.opener)).toBeNull();
  expect(await popup.evaluate(()=>document.referrer)).toBe('');
  await popup.close();
  await page.bringToFront();
  await expect(frame.getByRole('tab').nth(2)).toHaveAttribute('aria-selected','true');
  await expect(frame.locator('.opf-model')).not.toHaveAttribute('open','');
  await page.setViewportSize({width:640,height:900});
  await frame.locator('html').evaluate(el=>el.style.fontSize='200%');
  expect(await frame.locator('html').evaluate(el=>el.scrollWidth<=el.ownerDocument.defaultView.innerWidth)).toBe(true);
  await expect(frame.getByText('Discuss · carry it to rounds',{exact:true})).toBeVisible();
});

for(const [index,slug] of names.entries())test(`${slug}: interview, rounds and note practice share the selected chapter without saved responses`,async({page},info)=>{
 const data=JSON.parse(fs.readFileSync(new URL(files[index],import.meta.url),'utf8'));
 const tasks={interview:'Interview this patient',rounds:'Present on rounds',note:'Write a progress note'};
 const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.method()));
 await page.addInitScript(()=>localStorage.setItem('cw_longitudinal_v1','preserved-case-progress'));
 await page.goto(`/tools/one-patient-six-weeks.html?case=${slug}&chapter=2`);
 const practice=page.locator('#case-practice');
 await expect(practice.getByRole('heading',{name:'Practice with '+data.patient.displayName,exact:true})).toBeVisible();
 await expect(practice.getByRole('button',{pressed:true})).toHaveCount(0);
 const saved=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
 await practice.getByRole('button',{name:'Start practice',exact:true}).click();
 await expect(practice.getByRole('alert')).toHaveText('Choose a task and time to begin.');
 for(const task of Object.keys(tasks))for(const minutes of [5,15]){
  await practice.getByRole('button',{name:tasks[task],exact:true}).click();
  await practice.getByRole('button',{name:'About '+minutes+' minutes',exact:true}).click();
  await practice.getByRole('button',{name:'Start practice',exact:true}).click();
  await expect(practice.locator('#practice-heading')).toBeFocused();
  await expect(practice.locator('.opf-practice__context')).toHaveText(data.patient.displayName+' · '+data.weeks[1].label);
  await expect(page.getByRole('tabpanel').getByText(data.weeks[1].patientState,{exact:true})).toHaveCount(1);
  await expect(practice.getByRole('link')).toHaveAttribute('href','#case-panel-title');
  await practice.getByRole('button',{name:'Continue to rehearsal',exact:true}).click();
  await expect(practice.locator('#practice-heading')).toBeFocused();
  await expect(practice.locator('details')).not.toHaveAttribute('open','');
  await practice.getByText('Compare an outline',{exact:true}).press('Enter');
  await expect(practice.locator('details')).toHaveAttribute('open','');
  await practice.getByRole('button',{name:'See tomorrow card',exact:true}).click();
  await expect(practice.locator('.opf-practice__card')).toContainText('Ask your supervisor');
  await practice.getByRole('button',{name:'Finish practice',exact:true}).click();
  await expect(practice.getByRole('heading',{name:'Practice finished',exact:true})).toBeFocused();
  await practice.getByRole('button',{name:'Choose another task or time',exact:true}).click();
  await expect(practice.getByRole('button',{pressed:true})).toHaveCount(0);
 }
 await practice.getByRole('button',{name:tasks.interview,exact:true}).click();
 await practice.getByRole('button',{name:'About 15 minutes',exact:true}).click();
 await practice.getByRole('button',{name:'Start practice',exact:true}).click();
 for(const name of ['rounds','the note']){
  await practice.getByRole('button',{name:'Continue to rehearsal',exact:true}).click();
  await expect(practice.locator('details')).not.toHaveAttribute('open','');
  await practice.getByRole('button',{name:'See tomorrow card',exact:true}).click();
  await practice.getByRole('button',{name:'Continue to '+name+' with '+data.patient.displayName,exact:true}).click();
  await expect(practice.getByRole('heading',{name:'Read this chapter',exact:true})).toBeFocused();
  await expect(practice.locator('.opf-practice__context')).toHaveText(data.patient.displayName+' · '+data.weeks[1].label);
  await expect(practice).toContainText('About 15 minutes');
 }
 await page.getByRole('button',{name:'Next chapter',exact:true}).click();
 await expect(practice.getByRole('button',{pressed:true})).toHaveCount(0);
 await expect(practice.locator('.opf-practice__context')).toHaveText(data.patient.displayName+' · '+data.weeks[2].label);
 await page.reload();await expect(practice.getByRole('button',{pressed:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).toBe(saved);
 expect(await page.evaluate(()=>localStorage.getItem('cw_longitudinal_v1'))).toBe('preserved-case-progress');
 await expect(page.locator('input,textarea,[contenteditable="true"]')).toHaveCount(0);
 expect(requests.every(method=>method==='GET')).toBe(true);expect(errors).toEqual([]);
 if(slug==='leah')await practice.screenshot({path:info.outputPath('connected-practice-desktop.png')});
});

test('connected practice works in the shell and reflows on a phone in both themes',async({page},info)=>{
 await page.addInitScript(role=>localStorage.setItem('cw_frontdoor_v1',JSON.stringify({role,tab:'today',viewWeek:1,autoAdvance:false})),info.project.name==='nav-res'?'pgy1':'student');
 await page.goto('/?tool=one-patient-six-weeks.html&case=leah&chapter=3');
 const frame=page.frameLocator('iframe.toolframe'),practice=frame.locator('#case-practice');
 await expect(practice).toContainText('Leah · After medical stabilization · day 4');
 for(const theme of ['light','dark'])for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  await frame.locator('html').evaluate((el,value)=>el.setAttribute('data-theme',value),theme);
  expect(await frame.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await practice.getByRole('button',{name:'Write a progress note',exact:true}).press('Enter');
 await practice.getByRole('button',{name:'About 15 minutes',exact:true}).press('Enter');
 await practice.getByRole('button',{name:'Start practice',exact:true}).press('Enter');
 await practice.getByRole('button',{name:'Continue to rehearsal',exact:true}).press('Enter');
 await practice.getByRole('button',{name:'See tomorrow card',exact:true}).press('Enter');
 await expect(practice.getByRole('heading',{name:'Your tomorrow card',exact:true})).toBeFocused();
 await frame.locator('html').evaluate(el=>el.style.fontSize='200%');
 expect(await frame.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await frame.locator('html').evaluate(el=>el.style.fontSize='');
 await page.emulateMedia({media:'print'});
 expect(await practice.locator('.opf-practice__card').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
 await page.emulateMedia({media:'screen'});
 await frame.locator('html').evaluate(el=>el.setAttribute('data-theme','light'));
 await practice.screenshot({path:info.outputPath('connected-practice-mobile.png')});
});

test('missing new practice pack keeps existing Case Journeys readable',async({page})=>{
 await page.route('**/tools/one-patient-six-weeks.html*',async route=>{
  const response=await route.fetch();const body=(await response.text()).replace('id="case-practice-data"','id="missing-practice-data"');await route.fulfill({response,body});
 });
 await page.goto('/tools/one-patient-six-weeks.html?case=eli');
 await expect(page.getByRole('heading',{name:'Practice is unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('tab')).toHaveCount(6);await page.getByRole('tab').nth(2).click();
 await expect(page.getByRole('tabpanel')).toContainText('When apparent agitation may be an adverse effect');
});
