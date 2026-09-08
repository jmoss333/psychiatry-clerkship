import {endEncounter} from './sp-station-helpers.js';
import {test,expect} from '@playwright/test';

const SESSION='repair-session-1234567890',FIRST='Mornings have been difficult.',TAIL=' I have another thought that you have not heard.';
async function fixture(page,{segmented=false,holdReplies=false,live=true,headphones=false}={}){
  const requests=[];
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname.endsWith('/sp-interview.recordings.js'))return route.fulfill({contentType:'application/javascript',body:`window.SPInterviewRecordings={loadLibrary:async()=>({entryCount:75,dispose(){},speak(args){let stopped=false;queueMicrotask(()=>{if(!stopped)args.onEnded();});return{stop(){stopped=true;}};}})};`});
    if(!url.pathname.startsWith('/api/dana/'))return route.continue();
    const body=request.postDataJSON();requests.push({path:url.pathname,method:request.method(),body});
    if(url.pathname.endsWith('/health'))return route.fulfill({json:{configured:true}});
    if(url.pathname==='/api/dana/session')return route.fulfill({json:{sessionId:SESSION}});
    if(url.pathname.endsWith('/finish'))return route.fulfill({json:{finished:true,retryTurnIds:[1]}});
    if(url.pathname==='/api/dana/turn'){
      if(segmented&&body.turnId===1)return route.fulfill({json:{turnId:1,reply:FIRST+TAIL,audioSegments:[{text:FIRST,audioUrl:'/api/dana/audio/repair-part-1-1'},{text:TAIL,audioUrl:'/api/dana/audio/repair-part-2-1'}]}});
      return route.fulfill({json:{turnId:body.turnId,reply:body.turnId===1?FIRST:'That is closer to what I meant.',audioUrl:'/api/dana/audio/repair-whole-'+body.turnId}});
    }
    if(request.method()==='DELETE')return route.fulfill({json:{ok:true}});
    if(url.pathname.endsWith('/status'))return route.fulfill({json:{state:'complete',turnId:Number(url.pathname.split('/').at(-2).split('-').at(-1))}});
    if(url.pathname.startsWith('/api/dana/audio/'))return route.fulfill({contentType:'audio/mpeg',body:Buffer.from([73,68,51])});
    return route.fulfill({status:404});
  });
  await page.addInitScript(({hold})=>{
    const state=window.__repairTest={inputs:[],players:[]};
    const timeout=window.setTimeout.bind(window);window.setTimeout=(callback,delay,...args)=>timeout(callback,delay===4500?25:delay===6000?40:delay,...args);
    class Recognition{
      constructor(){this.active=false;this.results=[];state.inputs.push(this);}
      start(){this.active=true;queueMicrotask(()=>this.onstart?.());}
      stop(){this.active=false;queueMicrotask(()=>this.onend?.());}abort(){this.stop();}
      emit(text,final=true){this.onspeechstart?.();const result=Object.assign([{transcript:text}],{isFinal:final});if(final)this.results.push(result);this.onresult?.({resultIndex:final?this.results.length-1:this.results.length,results:final?this.results:this.results.concat([result])});if(final)this.onspeechend?.();}
    }
    class Audio{
      constructor(src){this.src=src;this.originalSrc=src;this.active=false;state.players.push(this);}
      incoming(){return this.loading||(this.loading=fetch(this.src).then(r=>{if(!r.ok)throw Error('Fixture unavailable');}));}
      load(){if(this.src)this.incoming().catch(()=>this.onerror?.());}
      play(){this.active=true;this.lateEnded=this.onended;return this.incoming().then(()=>{if(!hold&&!this.originalSrc.includes('-part-'))queueMicrotask(()=>{if(this.active){this.active=false;this.onended?.();}});});}
      pause(){this.active=false;}removeAttribute(){this.src='';}
    }
    window.Audio=Audio;window.SpeechRecognition=window.webkitSpeechRecognition=Recognition;
    state.current=()=>state.inputs.findLast(input=>input.active);
    state.emit=(text,final=true)=>state.current().emit(text,final);
    state.finish=index=>{const player=state.players[index];player.active=false;player.onended?.();};
  },{hold:holdReplies});
  await page.goto('/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1'+(live?'&danaLive=1':''));
  await expect(page.locator('#conversation-start')).toBeEnabled();if(headphones)await page.locator('#dana-spoken-interruptions').check();await page.locator('#conversation-start').click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  return requests;
}
async function question(page,text='What have mornings been like?'){await page.evaluate(value=>window.__repairTest.emit(value),text);}
async function readyRepair(page){await question(page);await expect(page.locator('#conversation-repair')).toBeVisible();}
async function micCount(page){return page.evaluate(()=>window.__repairTest.inputs.filter(input=>input.active).length);}

test('repair pauses without a request or inserted words, then continues with the next normal spoken turn',async({page})=>{
  const requests=await fixture(page);await expect(page.locator('#conversation-repair')).toBeHidden();await readyRepair(page);
  await page.locator('#conversation-hold').check();await page.locator('#thinking-time').check();
  const original=await page.locator('#conversation-log').innerHTML(),before=requests.length;
  await page.locator('#conversation-repair').click();await expect(page.locator('#conversation-status')).toHaveText('Paused — microphone off');
  await expect(page.locator('#conversation-repair-title')).toBeFocused();await expect(page.locator('#conversation-repair-heard')).toHaveText(FIRST);
  await expect(page.locator('#conversation-repair-card')).toContainText('I think I misunderstood. Let me check…');
  await expect(page.locator('#conversation-repair-card')).toContainText('Use your own words');
  expect(await micCount(page)).toBe(0);expect(requests.length).toBe(before);expect(await page.locator('#conversation-log').innerHTML()).toBe(original);
  await page.locator('#conversation-repair-continue').click();await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-hold')).toBeChecked();await expect(page.locator('#thinking-time')).toBeChecked();
  await expect(page.locator('#conversation-draft')).toBeEmpty();expect(requests.length).toBe(before);
  const correction='I may have misunderstood. Is getting out of bed the hardest part?';await question(page,correction);
  await page.waitForTimeout(100);expect(requests.filter(r=>r.path==='/api/dana/turn')).toHaveLength(1);
  await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');
  await expect(page.locator('#conversation-count')).toHaveText('2 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');
  expect(requests.filter(r=>r.path==='/api/dana/turn').map(r=>r.body.text)).toEqual(['What have mornings been like?',correction]);
  expect((await page.locator('#conversation-log').innerHTML()).startsWith(original)).toBe(true);
});

test('repair remains unavailable during speech, interim words, final drafts, and Dana playback',async({page})=>{
  await fixture(page,{holdReplies:true});await question(page);await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await expect(page.locator('#conversation-repair')).toBeHidden();await page.evaluate(()=>window.__repairTest.finish(0));await expect(page.locator('#conversation-repair')).toBeVisible();
  await page.evaluate(()=>window.__repairTest.current().onspeechstart());await expect(page.locator('#conversation-repair')).toBeHidden();
  await page.evaluate(()=>window.__repairTest.emit('I was wondering',false));await expect(page.locator('#conversation-draft')).toHaveText('I was wondering');await expect(page.locator('#conversation-repair')).toBeHidden();
  await page.locator('#conversation-hold').check();await question(page,'I was wondering about your sleep.');
  await page.locator('#conversation-repair').evaluate(button=>button.click());
  await expect(page.locator('#conversation-status')).toHaveText('Listening');await expect(page.locator('#conversation-draft')).toHaveText('I was wondering about your sleep.');expect(await micCount(page)).toBe(1);
});

for(const speechEnded of [false,true])test('headphone recognizer adoption protects '+(speechEnded?'speechstart then speechend with a delayed first result':'speechstart before any recognized words')+' from repair clicks',async({page})=>{
  const requests=await fixture(page,{headphones:true});await readyRepair(page);await page.locator('#conversation-hold').check();
  const inputs=await page.evaluate(()=>window.__repairTest.inputs.length);
  await page.evaluate(ended=>{window.__repairTest.adopted=window.__repairTest.current();window.__repairTest.adopted.onspeechstart();if(ended)window.__repairTest.adopted.onspeechend();},speechEnded);
  await expect(page.locator('#conversation-draft')).toBeEmpty();await expect(page.locator('#conversation-repair')).toBeHidden();
  await page.locator('#conversation-repair').evaluate(button=>button.click());
  await expect(page.locator('#conversation-status')).toHaveText('Listening');await expect(page.locator('#conversation-repair-card')).toBeHidden();
  expect(await page.evaluate(()=>window.__repairTest.current()===window.__repairTest.adopted)).toBe(true);
  expect(await page.evaluate(()=>window.__repairTest.inputs.length)).toBe(inputs);expect(await micCount(page)).toBe(1);
  const words='I did not mean that. Could you clarify what you meant?';await question(page,words);
  await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');await expect(page.locator('#conversation-count')).toHaveText('2 of 10 turns');
  expect(requests.filter(r=>r.path==='/api/dana/turn').map(r=>r.body.text)).toEqual(['What have mornings been like?',words]);
});

test('repair shows only the verified completed prefix after an interrupted split reply',async({page})=>{
  const requests=await fixture(page,{segmented:true});await question(page);await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await page.evaluate(()=>{window.__repairTest.oldRow=document.querySelector('#conversation-log .msg.pt:last-child');window.__repairTest.finish(0);});
  await page.waitForFunction(()=>window.__repairTest.oldRow!==document.querySelector('#conversation-log .msg.pt:last-child'));
  await page.locator('#conversation-interrupt').click();await expect(page.locator('#conversation-repair')).toBeVisible();
  await page.locator('#conversation-repair').click();await expect(page.locator('#conversation-repair-heard')).toHaveText(FIRST);
  await expect(page.locator('#conversation-repair-card')).not.toContainText(TAIL.trim());
  await expect(page.locator('#conversation-repair-source')).toContainText('Only the verified completed portion');
  expect(requests.filter(r=>r.path==='/api/dana/turn')).toHaveLength(1);
});

test('an unheard latest reply does not offer an older reply as the repair target',async({page})=>{
  await fixture(page,{holdReplies:true});await question(page);await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await page.evaluate(()=>window.__repairTest.finish(0));await expect(page.locator('#conversation-repair')).toBeVisible();
  await question(page,'What happens next?');await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await page.locator('#conversation-interrupt').click();await expect(page.locator('#conversation-status')).toHaveText('Listening');await expect(page.locator('#conversation-repair')).toBeHidden();
});

test('dismissal and hiding close repair without restarting capture, and End clears the card',async({page})=>{
  const requests=await fixture(page);await readyRepair(page);await page.locator('#conversation-repair').click();
  await page.locator('#conversation-repair-dismiss').click();await expect(page.locator('#conversation-repair-card')).toBeHidden();await expect(page.locator('#conversation-status')).toHaveText('Paused — microphone off');expect(await micCount(page)).toBe(0);
  await page.locator('#conversation-resume').click();await page.locator('#conversation-repair').click();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#conversation-repair-card')).toBeHidden();await page.locator('#conversation-repair-continue').evaluate(button=>button.click());expect(await micCount(page)).toBe(0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await micCount(page)).toBe(0);await page.locator('#conversation-resume').click();await page.locator('#conversation-repair').click();await endEncounter(page);
  await expect(page.locator('#conversation-repair-card')).toBeHidden();await expect(page.locator('#conversation-repair-heard')).toBeEmpty();await expect(page.locator('#conversation-repair')).toBeHidden();expect(await micCount(page)).toBe(0);
  expect(requests.filter(r=>r.path==='/api/dana/turn')).toHaveLength(1);
});

test('repair is absent from prerecorded practice and makes no live requests',async({page})=>{
  const requests=await fixture(page,{live:false});await question(page,'How have you been sleeping?');
  await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-repair')).toBeHidden();await expect(page.locator('#conversation-repair-card')).toBeHidden();expect(requests).toEqual([]);
});
