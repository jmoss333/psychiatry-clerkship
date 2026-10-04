import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pinVisualGovernance } from './governance-fixture.js';

const REF='prepare-for-tomorrow.html';
const TASKS={interview:'Interview a new patient',rounds:'Present on rounds',note:'Write a progress note'};
const READING={interview:{5:'Frame the conversation',15:'Use the coverage map'},rounds:{5:'Daily rounds structure',15:'Show your reasoning and uncertainty'},note:{5:'Record what changed',15:'Use the whole note structure'}};
const guide=page=>page.frameLocator('iframe.toolframe');
const resident=info=>info.project.name==='nav-res';

async function seed(page,stores={}) {
  await page.addInitScript(saved=>{
    if(sessionStorage.getItem('__pft_seed'))return;
    const now=new Date();now.setHours(12,0,0,0);now.setDate(now.getDate()-((now.getDay()+6)%7));
    localStorage.setItem('cw_rotation_start',`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
    localStorage.setItem('cw_frontdoor_v1',JSON.stringify({role:'staff',tab:'today',viewWeek:1,autoAdvance:false}));
    for(const [key,value] of Object.entries(saved))localStorage.setItem(key,JSON.stringify(value));
    sessionStorage.setItem('__pft_seed','1');
  },stores);
}
async function reviewed(page){
  // Pin the shell's actual runtime channels. tool-governance.json is a build-time envelope.
  await pinVisualGovernance(page);
}
async function choose(page,task,minutes,keyboard=false){
  const g=guide(page),method=keyboard?'press':'click';
  for(const name of [TASKS[task],`About ${minutes} minutes`,'Start preparation']){
    const button=g.getByRole('button',{name,exact:true});
    if(method==='press')await button.press('Enter');else await button.click();
  }
  await expect(g.getByRole('heading',{name:READING[task][minutes],exact:true})).toBeVisible();
  await expect(g.locator('#pft-heading')).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`prepareTask=${task}`));
  await expect(page).toHaveURL(new RegExp(`prepareMinutes=${minutes}`));
}
async function noOverflow(page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  expect(await guide(page).locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
}

for(const size of [{width:390,height:844},{width:1280,height:800}]){
  for(const task of Object.keys(TASKS))for(const minutes of [5,15]){
    test(`${size.width}px ${task}/${minutes}: read, privately rehearse, compare, card and finish`,async({page},info)=>{
      test.skip(resident(info),'MS3-only journeys; resident absence has its own contract.');
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.setViewportSize(size);await seed(page);await reviewed(page);
      await page.goto(`/?tool=${REF}`);
      const g=guide(page);
      await expect(g.getByRole('heading',{name:'Prepare for tomorrow',exact:true})).toBeVisible();
      await g.getByRole('button',{name:'Start preparation',exact:true}).click();
      await expect(g.getByRole('alert')).toHaveText('Choose a task and time to begin.');
      await choose(page,task,minutes);
      await noOverflow(page);
      await g.getByRole('button',{name:'Continue to rehearsal',exact:true}).click();
      await expect(g.getByRole('heading',{name:'Rehearse privately',exact:true})).toBeFocused();
      await expect(g.locator('[data-example]')).not.toHaveAttribute('open','');
      await expect(g.locator('input,textarea,[contenteditable="true"]')).toHaveCount(0);
      await g.getByText('Compare an example',{exact:true}).click();
      await expect(g.locator('[data-example]')).toHaveAttribute('open','');
      await expect(g.locator('[data-example]')).toContainText('it is not a grade');
      await g.getByRole('button',{name:'See tomorrow card',exact:true}).click();
      await expect(g.getByRole('heading',{name:'Your tomorrow card',exact:true})).toBeFocused();
      for(const label of ['Try','Notice','Ask your supervisor'])await expect(g.locator('.tomorrow')).toContainText(label);
      await noOverflow(page);
      if(size.width===390&&task==='note'&&minutes===15)await page.screenshot({path:info.outputPath('pft-phone-card.png'),fullPage:true});
      await page.emulateMedia({media:'print'});
      await expect(g.locator('.tomorrow')).toBeVisible();
      await expect(g.getByRole('button',{name:'Finish preparation',exact:true})).toBeHidden();
      await page.emulateMedia({media:'screen'});
      await g.getByRole('button',{name:'Finish preparation',exact:true}).click();
      await expect(g.getByRole('heading',{name:'Preparation finished',exact:true})).toBeFocused();
      await expect(g.locator('#pft-app')).toContainText('not a competence assessment');
      await g.getByRole('button',{name:'Choose another task or time',exact:true}).click();
      await expect(g.getByRole('heading',{name:'What will you be doing tomorrow?',exact:true})).toBeFocused();
      await expect(g.locator('[aria-pressed="true"]')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}

test('one Today invitation and one selected Essentials launch, plus full catalog',async({page},info)=>{
  test.skip(resident(info),'Resident absence is verified separately.');
  await seed(page);await reviewed(page);await page.goto('/?tab=today');
  await expect(page.locator('.fd-prepare')).toHaveCount(1);
  await expect(page.locator('.fd-prepare [data-fd-open]')).toHaveCount(1);
  await page.locator('.fd-prepare [data-fd-open]').click();
  await expect(guide(page).locator('#page-title')).toHaveText('Prepare for tomorrow');
  await page.goBack();
  await page.goto('/?tab=library');
  await page.locator('[data-fd-kit-section="tools"]').click();
  await page.locator(`[data-fd-kit-tool="${REF}"]`).click();
  await expect(page.locator('#fd-kit-tool-preview [data-fd-open]')).toHaveCount(1);
  await page.locator('#fd-kit-tool-preview [data-fd-open]').click();
  await expect(guide(page).locator('#page-title')).toHaveText('Prepare for tomorrow');
  await page.goBack();
  await page.locator('[data-fd-library-view="full"]').click();
  await expect(page.locator(`.fd-library [data-fd-open="${REF}"]`)).toHaveCount(1);
});

test('keyboard activation, heading focus, native disclosure and chooser reset',async({page},info)=>{
  test.skip(resident(info),'MS3-only interaction.');
  await seed(page);await reviewed(page);await page.goto(`/?tool=${REF}`);
  await choose(page,'interview',5,true);
  const g=guide(page);
  await g.getByRole('button',{name:'Continue to rehearsal',exact:true}).press('Enter');
  await g.locator('summary').press('Space');
  await expect(g.locator('details')).toHaveAttribute('open','');
  await g.locator('summary').press('Space');
  await expect(g.locator('details')).not.toHaveAttribute('open','');
  expect(await g.locator('summary').evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
  await g.getByRole('button',{name:'Choose another task or time',exact:true}).press('Enter');
  await expect(g.locator('#pft-heading')).toBeFocused();
  await expect(g.locator('[aria-pressed="true"]')).toHaveCount(0);
});

const stores=now=>({
  cw_block_v1:{v:1,minutes:10,createdAt:now-60000,steps:[{kind:'review',ref:'review.html',title:'2 reviews',min:1,n:2,done:true},{kind:'qb',ref:'question-bank-practice.html',title:'4 practice questions',min:3,n:4,cat:null}]},
  cw_sess_v1:{v:1,sessions:{qbank:{at:now-60000,expiresAt:now+86400000,queueIds:['q1','q2','q3','q4'],idx:1,responses:[{id:'q1',correct:true,confidence:'likely'}],fromBlock:true,n:4,cat:null}}},
  cw_progress_v1:{},cw_capture_v1:{v:1,items:[]},
});
const preserved=page=>page.evaluate(()=>Object.fromEntries(['cw_block_v1','cw_sess_v1','cw_progress_v1','cw_capture_v1'].map(key=>[key,localStorage.getItem(key)])));

test('optional reading, Back and reload keep selection and unfinished study work',async({page},info)=>{
  test.skip(resident(info),'MS3-only guide.');
  const now=Date.now();await page.clock.setFixedTime(new Date(now));await seed(page,stores(now));await reviewed(page);
  await page.goto('/?tab=today');
  await expect(page.locator('.fd-block.is-live')).toBeVisible();
  const before=await preserved(page);
  await page.locator('.fd-prepare [data-fd-open]').click();
  await choose(page,'note',15);
  await guide(page).getByRole('button',{name:'Continue to rehearsal',exact:true}).click();
  await guide(page).locator('summary').click();
  await guide(page).locator('[data-resource="doc_oral.md"]').click();
  await expect(page).toHaveURL(/page=doc_oral.md/);
  expect(new URL(page.url()).searchParams.has('prepareTask')).toBe(false);
  expect(new URL(page.url()).searchParams.has('block')).toBe(false);
  await page.goBack();
  await expect(guide(page).getByRole('button',{name:TASKS.note,exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(guide(page).getByRole('button',{name:'About 15 minutes',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();
  await expect(guide(page).getByRole('button',{name:TASKS.note,exact:true})).toHaveAttribute('aria-pressed','true');
  await guide(page).getByRole('button',{name:'Start preparation',exact:true}).click();
  await guide(page).getByRole('button',{name:'Continue to rehearsal',exact:true}).click();
  await expect(guide(page).locator('details')).not.toHaveAttribute('open','');
  await guide(page).getByRole('button',{name:'See tomorrow card',exact:true}).click();
  await guide(page).getByRole('button',{name:'Finish preparation',exact:true}).click();
  expect(await preserved(page)).toEqual(before);
});

test('actual outer selection handler rejects untrusted messages without remount or writes',async({page},info)=>{
  test.skip(resident(info),'MS3-only bridge.');
  await seed(page,stores(Date.now()));await reviewed(page);await page.goto(`/?tool=${REF}`);
  await expect(guide(page).locator('#page-title')).toBeVisible();
  const result=await page.evaluate(()=>{
    const frame=document.querySelector('iframe.toolframe'),snapshot=history.state,url=location.href;
    const saved=JSON.stringify({...localStorage});
    const valid={type:'prepare-selection',task:'note',minutes:15};
    for(const [data,origin,source] of [[valid,'https://example.invalid',frame.contentWindow],[valid,location.origin,window],[{...valid,answer:'fixture'},location.origin,frame.contentWindow],[{...valid,minutes:'15'},location.origin,frame.contentWindow],[{...valid,task:'other'},location.origin,frame.contentWindow],[{type:'prepare-selection',task:'note'},location.origin,frame.contentWindow]])window.dispatchEvent(new MessageEvent('message',{data,origin,source}));
    return {sameFrame:document.querySelector('iframe.toolframe')===frame,sameSnapshot:history.state===snapshot,sameUrl:location.href===url,sameStorage:JSON.stringify({...localStorage})===saved};
  });
  expect(result).toEqual({sameFrame:true,sameSnapshot:true,sameUrl:true,sameStorage:true});
});

test('pending and unavailable review status stay honest; missing reading preserves return',async({page},info)=>{
  test.skip(resident(info),'MS3-only guide.');
  await seed(page);
  const response=await page.request.get('/governance.json'),ledger=await response.json();
  ledger.items[REF]={...ledger.items[REF],status:'pending',reason:'Controlled pending teaching fixture.',riskKind:'clinical',riskLevel:'moderate'};
  await page.route('**/governance.json',route=>route.fulfill({json:ledger}));
  await page.goto(`/?tool=${REF}`);
  await expect(page.locator('.governance-notice.pending-compact[role="status"]')).toContainText('Pending faculty review');
  await expect(guide(page).locator('.boundary')).toContainText('Pending faculty review');
  await choose(page,'note',5);
  await page.route('**/content/doc_oral.md*',route=>route.fulfill({status:404,body:'Not found'}));
  await guide(page).locator('[data-resource="doc_oral.md"]').click();
  await expect(page.getByRole('heading',{name:'Page unavailable',exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('This resource could not load.');
  await page.goBack();
  await expect(guide(page).getByRole('button',{name:'About 5 minutes',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.unroute('**/governance.json');await page.route('**/governance.json',route=>route.abort());
  await page.reload();
  await expect(page.locator('.governance-notice.unavailable')).toHaveText('Review status unavailable—verify with faculty');
  await expect(guide(page).locator('#page-title')).toBeVisible();
  await expect(page.locator('.governance-notice.reviewed-receipt')).toHaveCount(0);
});

test('resident Today, both Library views and artifacts exclude the MS3 preparation guide',async({page,request},info)=>{
  test.skip(!resident(info),'Resident audience contract.');
  await seed(page);await reviewed(page);await page.goto('/?tab=today');
  await expect(page.locator('.fd-today')).toBeVisible();await expect(page.locator('.fd-prepare')).toHaveCount(0);
  await page.goto('/?tab=library');await expect(page.locator('.fd-library')).toBeVisible();
  await expect(page.locator(`[data-fd-kit-tool="${REF}"]`)).toHaveCount(0);
  await page.locator('[data-fd-library-view="full"]').click();
  await expect(page.locator(`[data-fd-open="${REF}"]`)).toHaveCount(0);
  const response=await request.get('/tools/'+REF);expect(response.status()).toBe(404);
  await page.goto(`/?tool=${REF}`);
  await expect(page.locator('.fd-reader--notfound')).toBeVisible();await expect(page.locator('iframe.toolframe')).toHaveCount(0);
});

for(const theme of ['light','dark'])test(`${theme} theme and print keep the tomorrow card readable`,async({page},info)=>{
  test.skip(resident(info),'MS3-only presentation.');
  await seed(page);await reviewed(page);
  await page.addInitScript(value=>localStorage.setItem('cw_theme',value),theme);
  await page.goto(`/?tool=${REF}&prepareTask=note&prepareMinutes=15`);
  const g=guide(page);
  await expect(g.locator('html')).toHaveAttribute('data-theme',theme);
  await g.getByRole('button',{name:'Start preparation',exact:true}).click();
  await g.getByRole('button',{name:'Continue to rehearsal',exact:true}).click();
  await g.getByRole('button',{name:'See tomorrow card',exact:true}).click();
  const contrast=()=>g.locator('.tomorrow').evaluate(el=>{
    const style=getComputedStyle(el);
    const luminance=css=>{
      const values=css.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
      return .2126*values[0]+.7152*values[1]+.0722*values[2];
    };
    const a=luminance(style.color),b=luminance(style.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  expect(await contrast()).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({media:'print'});
  expect(await g.locator('.tomorrow').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await contrast()).toBeGreaterThanOrEqual(4.5);
});

for(const sourcePreview of [false,true])test(`${sourcePreview?'repository source':'published'} standalone navigation opens resources and returns to Today`,async({page},info)=>{
  test.skip(resident(info),'MS3-only standalone navigation.');
  const sourcePath='/14_Tracks/MS3/Student_Ready_Pack/09_prepare_for_tomorrow/prepare-for-tomorrow.html';
  const homePath=sourcePreview?'/_build/ms3/':'/';
  if(sourcePreview){
    const html=readFileSync(new URL('../..'+sourcePath,import.meta.url),'utf8');
    await page.route('**'+sourcePath,route=>route.fulfill({contentType:'text/html',body:html}));
    await page.context().route('**/_build/ms3/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Local MS3 build</h1>'}));
  }else{await seed(page);}
  await page.goto(sourcePreview?sourcePath:'/tools/'+REF);
  const instructions=page.getByText('Source preview: resource buttons open the local MS3 build in a new tab.',{exact:false});
  if(sourcePreview)await expect(instructions).toBeVisible();else await expect(instructions).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Return to Today',exact:true})).toHaveAttribute('href',homePath+'?tab=today');
  await page.getByRole('button',{name:TASKS.interview,exact:true}).click();
  await page.getByRole('button',{name:'About 5 minutes',exact:true}).click();
  await page.getByRole('button',{name:'Start preparation',exact:true}).click();
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Open Interview & MSE guide',exact:true}).click();
  const popup=await popupPromise;
  await expect(popup).toHaveURL(url=>url.pathname===homePath&&url.searchParams.get('page')==='pg_interview.md');
  if(sourcePreview)await expect(popup.getByRole('heading',{name:'Local MS3 build',exact:true})).toBeVisible();
  else await expect(popup.locator('.fd-reader')).toBeVisible();
  await popup.close();
  await page.getByRole('link',{name:'Return to Today',exact:true}).click();
  await expect(page).toHaveURL(url=>url.pathname===homePath&&url.searchParams.get('tab')==='today');
  if(!sourcePreview)await expect(page.locator('.fd-today')).toBeVisible();
});
