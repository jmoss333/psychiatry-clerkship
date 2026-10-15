import {test,expect} from '@playwright/test';
import {careDirectoryFixture,pinCareDirectory} from './care-directory-fixture.js';
import {isResidentProject} from './audience.js';

async function seed(page,info){
  await page.clock.setFixedTime(new Date('2026-10-12T12:00:00Z'));
  await page.addInitScript(role=>{
    localStorage.setItem('cw_rotation_start','2026-10-12');
    localStorage.setItem('cw_frontdoor_v1',JSON.stringify({role,tab:'care',viewWeek:1}));
  },isResidentProject(info.project.name)?'pgy1':'student');
}
test.beforeEach(async({page},info)=>{await seed(page,info);await pinCareDirectory(page);});

for(const width of [1280,390,320])test(`local Care search, paging and native filters at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const requests=[];page.on('request',r=>requests.push({url:r.url(),body:r.postData()||''}));
  await page.goto('/?tab=care');
  const panel=page.locator('[data-care-directory]'),query=panel.getByLabel('Resource name or service');
  await expect(panel.locator('#fd-care-directory-count')).toContainText('Search by');
  const before=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},url:location.href,history:JSON.stringify(history.state)}));
  await query.fill('support counseling');
  await expect(panel.locator('.fd-care-search__result')).toHaveCount(5);
  await expect(query).toBeFocused();
  await expect(panel.getByRole('link',{name:'Call Example Support 01'})).toHaveAttribute('href','tel:2077000123');
  const blocked=panel.locator('.fd-care-search__result').filter({has:page.getByRole('heading',{name:'Example Support 02',exact:true})});
  await expect(blocked.getByRole('link')).toHaveCount(0);
  await expect(blocked).toContainText('No usable contact link');
  await expect(panel.getByText('Verification due.',{exact:true}).first()).toBeVisible();
  await panel.getByRole('button',{name:'Next',exact:true}).click();
  await expect(panel.locator('#fd-care-directory-count')).toHaveText('6–10 of 12 listings');
  await expect(panel.locator('#fd-care-directory-count')).toBeFocused();
  await panel.getByRole('button',{name:'Next',exact:true}).click();
  await expect(panel.locator('.fd-care-search__result')).toHaveCount(2);
  await expect(panel.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await panel.getByLabel('Region',{exact:true}).selectOption('NH');
  await expect(panel.locator('#fd-care-directory-count')).toContainText('No matching listings');
  await panel.getByRole('button',{name:'Clear',exact:true}).click();
  await expect(query).toHaveValue('');await expect(query).toBeFocused();
  await panel.getByLabel('Category',{exact:true}).selectOption('aftercare');
  await expect(panel.locator('.fd-care-search__result')).toHaveCount(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(const element of await panel.locator('input,select,button:not(:disabled),a').all()){
    if(await element.isVisible()){
      const height=await element.evaluate(node=>{
        // A wrapping label is the clickable target for the packet's native controls.
        const target=node.matches('input[type="checkbox"],input[type="radio"]')
          ? node.closest('label')||node : node;
        return target.getBoundingClientRect().height;
      });
      expect(height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},url:location.href,history:JSON.stringify(history.state)}))).toEqual(before);
  expect(requests.some(r=>(r.url+r.body).includes('support%20counseling')||(r.url+r.body).includes('support counseling'))).toBe(false);
  expect(requests.filter(r=>r.url.includes('care-directory.v1.json'))).toHaveLength(1);
  await expect(panel.getByRole('link',{name:/Open full Finder/})).toHaveAttribute('href','https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html');
  // Existing Care interaction re-renders the base; search remains visit-only.
  await query.fill('support');
  await page.locator('[data-fd-care-intent="services"]').click();
  await expect(query).toHaveValue('support');
  await expect(page.locator('[data-fd-care-intent="services"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-fd-tab="library"]:visible').click();
  await page.locator('[data-fd-tab="care"]:visible').click();
  await expect(query).toHaveValue('');
  await expect(page.locator('[data-fd-care-intent="services"]')).toHaveAttribute('aria-pressed','false');
  expect(errors).toEqual([]);
  await panel.screenshot({path:info.outputPath(`care-directory-${width}.png`)});
});

test('partial and empty data remain distinct from a failed request',async({page})=>{
  const partial=careDirectoryFixture();partial.categories[2].available=false;
  await pinCareDirectory(page,partial);await page.goto('/?tab=care');
  const panel=page.locator('[data-care-directory]');
  await expect(panel.locator('[data-care-directory-notice]')).toContainText('incomplete');
  await expect(page.locator('#careDirectoryStatus')).toContainText('incomplete');
  await panel.getByLabel('Category',{exact:true}).selectOption('aftercare');
  await expect(panel.locator('.fd-care-search__result')).toHaveCount(5);
  const empty=careDirectoryFixture();empty.records=[];empty.categories.forEach(c=>c.count=0);
  await pinCareDirectory(page,empty);await page.reload();
  await panel.getByLabel('Resource name or service').fill('support');
  await expect(panel.locator('#fd-care-directory-count')).toContainText('No matching listings');
  await expect(panel.getByRole('button',{name:'Try again'})).toHaveCount(0);
});

test('network failure and malformed data offer recovery without losing Care or Safety',async({page})=>{
  await page.route('**/care-directory.v1.json',r=>r.fulfill({status:503,body:'unavailable'}));
  await page.goto('/?tab=care');
  const panel=page.locator('[data-care-directory]');
  await expect(panel).toContainText('Directory search is unavailable');
  await expect(page.locator('.fd-care-navigator')).toBeVisible();
  await expect(page.locator('.fd-care-pack')).toHaveCount(0);
  await expect(panel.getByRole('link',{name:/Open full Finder/})).toBeVisible();
  await page.route('**/care-directory.v1.json',r=>r.fulfill({contentType:'application/json',body:'{"schemaVersion":999}'}));
  await panel.getByRole('button',{name:'Try again'}).click();
  await expect(panel).toContainText('Directory search is unavailable');
  await expect(panel.getByLabel('Resource name or service')).toBeFocused();
  await pinCareDirectory(page);
  await panel.getByRole('button',{name:'Try again'}).click();
  await expect(panel.locator('#fd-care-directory-count')).toContainText('Search by');
  expect(await page.locator('#fdCrisisTemplate').evaluate(t=>t.content.querySelector('.crisis-block')!==null)).toBe(true);
});

test('late responses cannot repaint another tab or persist the query',async({page})=>{
  let release;
  const held=new Promise(resolve=>{release=resolve;});
  await page.route('**/care-directory.v1.json',async r=>{await held;await r.fulfill({contentType:'application/json',body:JSON.stringify(careDirectoryFixture())}).catch(()=>{});});
  await page.goto('/?tab=care');
  await expect(page.locator('[data-care-directory-results]')).toContainText('Loading');
  await page.locator('#fd-care-directory-query').fill('temporary-query');
  await page.locator('[data-fd-tab="library"]:visible').click();release();
  await expect(page.locator('[data-care-directory]')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('temporary-query');
  await pinCareDirectory(page);await page.locator('[data-fd-tab="care"]:visible').click();
  await expect(page.locator('#fd-care-directory-query')).toHaveValue('');
});

for (const width of [320,390]) test(`patient sharing is absent while directory contacts remain at ${width}px`, async ({page},info) => {
  await page.setViewportSize({width,height:900});
  await page.goto('/?tab=care');
  const panel=page.locator('[data-care-directory]');
  await expect(panel.locator('#fd-care-directory-count')).toContainText('Search by');
  const sharing=page.locator('.fd-care-pack,.fd-care-share,.fd-care-builder,'+
    '[data-fd-care-share],[data-fd-care-pack],[data-fd-care-copy],'+
    '[data-fd-care-copy-selected],[data-fd-care-pack-print]');
  await expect(sharing).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Share resource websites',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Show QR|Print handout|Copy selected links|Add .*handout/})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Build a specific resource handout',exact:true})).toHaveCount(0);
  // Tab moves directly between the retained resource links, skipping no hidden controls.
  await page.locator('.fd-care-navigator__choice').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-care-resource]').nth(0)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('[data-care-resource]').nth(1)).toBeFocused();
  await panel.getByLabel('Resource name or service').fill('support counseling');
  await expect(panel.locator('.fd-care-search__result')).toHaveCount(5);
  await expect(panel.locator('a[href^="tel:"]').first()).toBeVisible();
  await expect(panel.getByRole('link',{name:/Website for/}).first()).toBeVisible();
  await expect(sharing).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.fd-safetybtn[data-fd-safety]').click();
  await expect(page.locator('.fd-kitrow[data-fd-safety]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel.getByLabel('Resource name or service')).toHaveValue('support counseling');
  await page.screenshot({path:info.outputPath(`care-sharing-off-${width}.png`),fullPage:true});
});
