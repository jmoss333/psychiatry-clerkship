import {endEncounter} from './sp-station-helpers.js';
import {expect, test} from '@playwright/test';

const SESSION='p'.repeat(32);
const CHILD='c'.repeat(32);
const FIRST='Mornings have been difficult.';
const SECOND='I mostly stay in bed and avoid everyone.';
const TAIL=' I have another thought that you have not heard.';

async function fixture(page,{live=true,holdReply=false,segmented=false,holdAudio=false,retryEligible=[1,2],deferFinish=false,retrySetupFailure=false}={}){
  const requests=[];let retryAttempts=0;
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname.endsWith('/sp-interview.recordings.js'))return route.fulfill({contentType:'application/javascript',body:`window.SPInterviewRecordings={loadLibrary:async()=>({entryCount:75,dispose(){},speak(args){queueMicrotask(args.onEnded);return{stop(){}};}})};`});
    if(!url.pathname.startsWith('/api/dana/'))return route.continue();
    const body=request.postDataJSON();requests.push({path:url.pathname,method:request.method(),body});
    if(url.pathname.endsWith('/health'))return route.fulfill({json:{configured:true}});
    if(url.pathname==='/api/dana/session')return route.fulfill({json:{sessionId:SESSION}});
    if(url.pathname.endsWith('/finish')){
      if(deferFinish){requests.finishRoute=route;return;}
      return route.fulfill({json:{finished:true,retryTurnIds:retryEligible}});
    }
    if(url.pathname.endsWith('/retry')){
      retryAttempts++;
      if(retrySetupFailure&&retryAttempts===1)return route.fulfill({status:502,json:{error:'Try setup again'}});
      return route.fulfill({json:{sessionId:CHILD,sourceTurnId:body.turnId}});
    }
    if(url.pathname==='/api/dana/turn'){
      if(holdReply)await new Promise(resolve=>setTimeout(resolve,180));
      const reply=body.sessionId===CHILD?'That wording helped me say a little more.':body.turnId===1?FIRST:SECOND;
      if(segmented&&body.turnId===1)return route.fulfill({json:{turnId:1,reply:FIRST+TAIL,audioSegments:[{text:FIRST,audioUrl:'/api/dana/audio/bookmark-part-1-1'},{text:TAIL,audioUrl:'/api/dana/audio/bookmark-part-2-1'}]}});
      return route.fulfill({json:{turnId:body.turnId,reply,audioUrl:'/api/dana/audio/bookmark-'+body.turnId}});
    }
    if(request.method()==='DELETE')return route.fulfill({json:{ok:true}});
    if(url.pathname.endsWith('/status'))return route.fulfill({json:{state:'complete',turnId:Number(url.pathname.split('/').at(-2).split('-').at(-1))}});
    if(url.pathname.startsWith('/api/dana/audio/'))return route.fulfill({contentType:'audio/mpeg',body:Buffer.from([73,68,51])});
    return route.fulfill({status:404});
  });
  await page.addInitScript(({hold})=>{
    const state=window.__bookmarkTest={inputs:[],players:[]};
    const timeout=window.setTimeout.bind(window);window.setTimeout=(callback,delay,...args)=>timeout(callback,delay===4500?25:delay===6000?40:delay,...args);
    class Recognition{
      constructor(){this.active=false;this.results=[];state.inputs.push(this);}
      start(){this.active=true;queueMicrotask(()=>this.onstart?.());}
      stop(){this.active=false;queueMicrotask(()=>this.onend?.());}
      abort(){this.stop();}
      emit(text,final=true){
        this.onspeechstart?.();const result=Object.assign([{transcript:text}],{isFinal:final});
        if(final)this.results.push(result);
        this.onresult?.({resultIndex:final?this.results.length-1:this.results.length,results:final?this.results:this.results.concat([result])});
        if(final)this.onspeechend?.();
      }
    }
    class Audio{
      constructor(src){this.src=src;this.originalSrc=src;this.active=false;state.players.push(this);}
      incoming(){return this.loading||(this.loading=fetch(this.src).then(response=>{if(!response.ok)throw Error('Fixture unavailable');}));}
      load(){if(this.src)this.incoming().catch(()=>this.onerror?.());}
      play(){this.active=true;return this.incoming().then(()=>{if(!hold&&!this.originalSrc.includes('-part-'))queueMicrotask(()=>{if(this.active){this.active=false;this.onended?.();}});});}
      pause(){this.active=false;}
      removeAttribute(){this.src='';}
    }
    window.Audio=Audio;window.SpeechRecognition=window.webkitSpeechRecognition=Recognition;
    state.current=()=>state.inputs.findLast(input=>input.active);
    state.emit=(text,final=true)=>state.current().emit(text,final);
    state.finish=index=>{const player=state.players[index];player.active=false;player.onended?.();};
    state.micCount=()=>state.inputs.filter(input=>input.active).length;
  },{hold:holdAudio});
  await page.goto('/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1'+(live?'&danaLive=1':''));
  await expect(page.locator('#conversation-start')).toBeEnabled();
  await page.locator('#conversation-start').click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  return requests;
}

async function question(page,text){await page.evaluate(value=>window.__bookmarkTest.emit(value),text);}
async function requestCount(requests){return requests.filter(request=>request.path.startsWith('/api/dana/')).length;}
async function micCount(page){return page.evaluate(()=>window.__bookmarkTest.micCount());}
async function completedTurn(page,text){await question(page,text);await expect(page.locator('#conversation-status')).toHaveText('Listening');}
async function endAndWaitForRetry(page){await endEncounter(page);await expect(page.locator('#retry-start')).toBeVisible();}

test('bookmark stays unavailable before a submitted exchange, then deduplicates the latest exchange without disturbing capture',async({page})=>{
  const requests=await fixture(page);
  const bookmark=page.locator('#conversation-bookmark');
  await expect(bookmark).toBeDisabled();await expect(bookmark).toHaveText('Bookmark an exchange');
  await question(page,'What have mornings been like?');await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(bookmark).toBeEnabled();await expect(bookmark).toHaveText('Bookmark exchange 1');
  const turnsBefore=requests.filter(request=>request.path==='/api/dana/turn').length,micBefore=await micCount(page);
  await bookmark.click();
  await expect(bookmark).toBeDisabled();await expect(bookmark).toHaveText('Exchange 1 bookmarked');
  await expect(page.locator('#conversation-bookmark-count')).toHaveText('1 bookmarked');
  expect(requests.filter(request=>request.path==='/api/dana/turn')).toHaveLength(turnsBefore);expect(await micCount(page)).toBe(micBefore);
});

test('bookmarking while the next question is drafted preserves the draft and marks the latest submitted exchange',async({page})=>{
  const requests=await fixture(page);await question(page,'What have mornings been like?');
  await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.locator('#conversation-hold').check();
  await question(page,'I am still forming my next question.');
  await expect(page.locator('#conversation-draft')).toHaveText('I am still forming my next question.');
  const before=await requestCount(requests);await page.locator('#conversation-bookmark').click();
  await expect(page.locator('#conversation-bookmark-status')).toContainText(/exchange 1/i);
  await expect(page.locator('#conversation-draft')).toHaveText('I am still forming my next question.');
  await expect(page.locator('#conversation-status')).toHaveText('Listening');expect(await micCount(page)).toBe(1);
  expect(await requestCount(requests)).toBe(before);
});

test('a bookmark made while Dana is responding resolves when the same reply completes',async({page})=>{
  const requests=await fixture(page,{holdReply:true});
  await question(page,'What have mornings been like?');
  await expect(page.locator('#conversation-status')).toHaveText('Dana is responding');
  await expect(page.locator('#conversation-bookmark')).toHaveText('Bookmark exchange 1');
  const before=await requestCount(requests);await page.locator('#conversation-bookmark').click();
  expect(await requestCount(requests)).toBe(before);
  await expect(page.locator('#conversation-bookmark-status')).toContainText(/exchange 1/i);
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-bookmark')).toHaveText('Exchange 1 bookmarked');
  expect(requests.filter(request=>request.path==='/api/dana/turn')).toHaveLength(1);
});

test('an interrupted bookmark contains only the verified heard prefix',async({page})=>{
  await fixture(page,{segmented:true,holdAudio:true});await question(page,'What have mornings been like?');
  await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await page.locator('#conversation-bookmark').click();
  await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await page.evaluate(()=>window.__bookmarkTest.finish(0));
  await expect.poll(()=>page.evaluate(()=>window.__bookmarkTest.players.length)).toBeGreaterThan(1);
  await page.locator('#conversation-interrupt').click();await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-bookmark')).toHaveText('Exchange 1 bookmarked');await endEncounter(page);
  const entry=page.locator('#conversation-bookmark-list article[data-bookmark-id="1"]');
  await expect(entry.locator('.bookmark-dana')).toHaveText(FIRST);
  await expect(entry.locator('.bookmark-playback-note')).toContainText(/verified completed words.*rest did not finish playing/i);
  await expect(entry).not.toContainText(TAIL.trim());
});

test('Alt+Shift+B bookmarks without focus or encounter side effects and ignores guarded key events',async({page})=>{
  const requests=await fixture(page);await question(page,'What have mornings been like?');
  await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');
  const hold=page.locator('#conversation-hold');await hold.focus();const before=await requestCount(requests);
  await page.keyboard.press('Alt+Shift+B');
  await expect(page.locator('#conversation-bookmark-count')).toHaveText('0 bookmarked');await expect(hold).toBeFocused();
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press('Control+Alt+Shift+KeyB');
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',key:'b',altKey:true,shiftKey:true,repeat:true,bubbles:true})));
  await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',key:'b',altKey:true,shiftKey:true,isComposing:true,bubbles:true})));
  await expect(page.locator('#conversation-bookmark-count')).toHaveText('0 bookmarked');
  await page.evaluate(()=>{window.__bookmarkFocus=document.activeElement;});
  await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB',key:'B',altKey:true,shiftKey:true,bubbles:true})));
  await expect(page.locator('#conversation-bookmark-count')).toHaveText('1 bookmarked');
  expect(await page.evaluate(()=>document.activeElement===window.__bookmarkFocus)).toBe(true);
  await expect(page.locator('#conversation-status')).toHaveText('Listening');expect(await micCount(page)).toBe(1);expect(await requestCount(requests)).toBe(before);
});

test('ended bookmarks are chronological, optional notes and removal stay local, and self-assessment remains separate',async({page},testInfo)=>{
  const requests=await fixture(page);const storageBefore=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
  await question(page,'What have mornings been like?');await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');await page.locator('#conversation-bookmark').click();
  await question(page,'What do your days look like?');await expect(page.locator('#conversation-count')).toHaveText('2 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');await page.locator('#conversation-bookmark').click();
  await endEncounter(page);await expect(page.locator('#conversation-status')).toContainText('complete');
  await expect.poll(()=>requestCount(requests)).toBeGreaterThanOrEqual(5);
  const before=await requestCount(requests);
  const entries=page.locator('#conversation-bookmark-list article');await expect(entries).toHaveCount(2);
  await expect(entries.nth(0).getByRole('heading')).toHaveText('Exchange 1');await expect(entries.nth(1).getByRole('heading')).toHaveText('Exchange 2');
  await page.locator('#conversation-bookmark-reflection-1').fill('Ask a more open follow-up.');
  await expect(page.locator('#conversation-bookmark-reflection-2')).toHaveValue('');
  await expect(page.locator('#conversation-self-assessment textarea')).toHaveCount(3);
  await page.locator('#conversation-bookmarks').screenshot({path:testInfo.outputPath('dana-bookmark-debrief-focused.png')});
  await page.getByRole('button',{name:'Remove bookmark for exchange 1'}).click();await expect(entries).toHaveCount(1);
  expect(await requestCount(requests)).toBe(before);
  expect(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).toEqual(storageBefore);
  await page.screenshot({path:testInfo.outputPath('dana-bookmark-debrief.png'),fullPage:true});
});

test('bookmark memory clears on reload',async({page})=>{
  await fixture(page);await question(page,'What have mornings been like?');await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');await page.locator('#conversation-bookmark').click();
  await expect(page.locator('#conversation-bookmark-count')).toHaveText('1 bookmarked');await page.reload();
  await expect(page.locator('#conversation-start')).toBeEnabled();await page.locator('#conversation-start').click();
  await expect(page.locator('#conversation-bookmark-count')).toHaveText('0 bookmarked');
});

test('hiding preserves bookmarks for Resume, while Clear empties bookmarks and notes',async({page})=>{
  const requests=await fixture(page);await question(page,'What have mornings been like?');
  await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.locator('#conversation-bookmark').click();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('#conversation-status')).toHaveText('Paused — microphone off');
  await expect(page.locator('#conversation-bookmark-count')).toHaveText('1 bookmarked');expect(await micCount(page)).toBe(0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.locator('#conversation-resume').click();await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await endEncounter(page);await page.locator('#conversation-bookmark-reflection-1').fill('A thought that will be cleared.');
  await page.locator('#conversation-clear').click();await expect(page.locator('#conversation-start')).toBeEnabled();
  await expect(page.locator('#conversation-bookmark-list')).toBeEmpty();await expect(page.locator('#conversation-bookmark-count')).toHaveText('0 bookmarked');
  await expect(page.locator('#conversation-bookmarks')).toBeHidden();
  expect(requests.some(request=>request.method==='DELETE')).toBe(true);
  expect(requests.filter(request=>request.path==='/api/dana/turn')).toHaveLength(1);
});

test('a bookmarked direct retry selects the exact eligible exchange and preserves the original work',async({page})=>{
  const requests=await fixture(page,{retryEligible:[2]});
  await completedTurn(page,'What have mornings been like?');await page.locator('#conversation-bookmark').click();
  await completedTurn(page,'What do your days look like?');await page.locator('#conversation-bookmark').click();
  const original=await page.locator('#conversation-log').innerHTML();await endAndWaitForRetry(page);
  await page.locator('#conversation-bookmark-reflection-1').fill('Keep the first question open.');
  await expect(page.locator('#conversation-bookmark-retry-1')).toBeDisabled();
  const second=page.locator('#conversation-bookmark-retry-2');await expect(second).toBeEnabled();
  await expect(second).toHaveAttribute('aria-label','Try this moment again — exchange 2');await second.click();
  await expect(page.locator('#retry-status')).toHaveText('Listening — your alternative');
  expect(requests.filter(request=>request.path.endsWith('/retry')).map(request=>request.body)).toEqual([{turnId:2}]);
  expect(requests.filter(request=>request.path==='/api/dana/session')).toHaveLength(1);
  expect(await page.locator('#conversation-log').innerHTML()).toBe(original);
  await expect(page.locator('#conversation-bookmark-reflection-1')).toHaveValue('Keep the first question open.');
  await page.evaluate(()=>window.__bookmarkTest.emit('Could you walk me through one of those days?'));
  await expect(page.locator('#retry-status')).toContainText('complete');
  expect(requests.filter(request=>request.path==='/api/dana/turn'&&request.body.sessionId===CHILD)).toHaveLength(1);
});

test('finish-pending bookmark retry stays disabled, then enables without replacing notes or focus',async({page})=>{
  const requests=await fixture(page,{deferFinish:true});await completedTurn(page,'What have mornings been like?');await page.locator('#conversation-bookmark').click();
  await endEncounter(page);await expect.poll(()=>!!requests.finishRoute).toBe(true);
  const field=page.locator('#conversation-bookmark-reflection-1');await field.fill('Notice the timing.');await field.focus();
  const direct=page.locator('#conversation-bookmark-retry-1');await expect(direct).toBeDisabled();
  expect(requests.filter(request=>request.path.endsWith('/retry'))).toHaveLength(0);
  await requests.finishRoute.fulfill({json:{finished:true,retryTurnIds:[1]}});
  await expect(direct).toBeEnabled();await expect(field).toHaveValue('Notice the timing.');await expect(field).toBeFocused();
});

test('unsupported or cancelled bookmarked moments never fall back to another retry target',async({page})=>{
  const requests=await fixture(page,{holdReply:true,retryEligible:[1]});
  await question(page,'What have mornings been like?');await expect(page.locator('#conversation-status')).toHaveText('Dana is responding');
  await page.locator('#conversation-bookmark').click();await endEncounter(page);
  const direct=page.locator('#conversation-bookmark-retry-1');await expect(direct).toBeDisabled();
  await expect(page.locator('#conversation-bookmark-retry-status-1')).toContainText(/no eligible question-and-reply moment|cancelled|not available|did not finish/i);
  await direct.evaluate(button=>button.click());expect(requests.filter(request=>request.path.endsWith('/retry'))).toHaveLength(0);
});

test('starting one bookmarked retry locks every route to the single alternative',async({page})=>{
  const requests=await fixture(page,{retryEligible:[1,2]});
  await completedTurn(page,'What have mornings been like?');await page.locator('#conversation-bookmark').click();
  await completedTurn(page,'What do your days look like?');await page.locator('#conversation-bookmark').click();await endAndWaitForRetry(page);
  const first=page.locator('#conversation-bookmark-retry-1'),second=page.locator('#conversation-bookmark-retry-2');
  await second.dblclick();await first.evaluate(button=>button.click());
  await expect(page.locator('#retry-status')).toContainText('Listening');await expect(first).toBeDisabled();await expect(second).toBeDisabled();await expect(page.locator('#retry-moment')).toBeDisabled();
  expect(requests.filter(request=>request.path.endsWith('/retry')).map(request=>request.body)).toEqual([{turnId:2}]);
});

test('setup failure can retry only the same bookmarked moment, and hidden or disposed clicks cannot start',async({page})=>{
  const requests=await fixture(page,{retryEligible:[1,2],retrySetupFailure:true});
  await completedTurn(page,'What have mornings been like?');await page.locator('#conversation-bookmark').click();
  await completedTurn(page,'What do your days look like?');await page.locator('#conversation-bookmark').click();await endAndWaitForRetry(page);
  const first=page.locator('#conversation-bookmark-retry-1'),second=page.locator('#conversation-bookmark-retry-2');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await second.evaluate(button=>button.click());expect(requests.filter(request=>request.path.endsWith('/retry'))).toHaveLength(0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await second.click();await expect(page.locator('#retry-start')).toHaveText('Retry setting up this moment');
  await expect(first).toBeDisabled();await expect(second).toBeEnabled();await first.evaluate(button=>button.click());
  expect(requests.filter(request=>request.path.endsWith('/retry')).map(request=>request.body)).toEqual([{turnId:2}]);
  await second.click();await expect(page.locator('#retry-status')).toContainText('Listening');
  expect(requests.filter(request=>request.path.endsWith('/retry')).map(request=>request.body)).toEqual([{turnId:2},{turnId:2}]);
  await page.evaluate(()=>{window.__savedBookmarkRetry=document.querySelector('#conversation-bookmark-retry-2');window.dispatchEvent(new Event('pagehide'));window.__savedBookmarkRetry.click();});
  expect(requests.filter(request=>request.path.endsWith('/retry'))).toHaveLength(2);
});

test('post-child setup failure retries the same bookmark with the existing child',async({page})=>{
  const requests=await fixture(page,{retryEligible:[1,2]});
  await completedTurn(page,'What have mornings been like?');await page.locator('#conversation-bookmark').click();
  await completedTurn(page,'What do your days look like?');await page.locator('#conversation-bookmark').click();await endAndWaitForRetry(page);
  const original=await page.locator('#conversation-log').innerHTML();
  const note=page.locator('#conversation-bookmark-reflection-2');await note.fill('Stay curious about the daily routine.');
  await page.evaluate(()=>{
    const originalCreate=window.SPInterviewTurns.createController;let failOnce=true;
    window.SPInterviewTurns.createController=function(){
      if(failOnce){failOnce=false;throw new Error('Fixture failed after the retry child was created.');}
      return originalCreate.apply(this,arguments);
    };
  });
  const first=page.locator('#conversation-bookmark-retry-1'),second=page.locator('#conversation-bookmark-retry-2');
  await second.click();await expect(page.locator('#retry-status')).toHaveText('This alternative could not start');
  await expect(page.locator('#retry-error')).toContainText('Fixture failed after the retry child was created.');
  await expect(first).toBeDisabled();await expect(second).toBeEnabled();
  expect(requests.filter(request=>request.path.endsWith('/retry')).map(request=>request.body)).toEqual([{turnId:2}]);
  expect(requests.filter(request=>request.method==='DELETE'&&request.path==='/api/dana/session/'+CHILD)).toHaveLength(0);
  expect(await page.locator('#conversation-log').innerHTML()).toBe(original);await expect(note).toHaveValue('Stay curious about the daily routine.');
  await second.click();await expect(page.locator('#retry-status')).toHaveText('Listening — your alternative');
  expect(requests.filter(request=>request.path.endsWith('/retry')).map(request=>request.body)).toEqual([{turnId:2}]);
  await expect(first).toBeDisabled();await expect(second).toBeDisabled();await expect(page.locator('#retry-moment')).toBeDisabled();
});

test('prerecorded practice does not expose bookmark controls or make live requests',async({page})=>{
  const requests=await fixture(page,{live:false});
  await expect(page.locator('#conversation-bookmark')).toBeHidden();await expect(page.locator('#conversation-bookmark-count')).toBeHidden();
  await question(page,'How have you been sleeping?');await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');
  expect(requests).toEqual([]);
});
