import {endEncounter} from './sp-station-helpers.js';
import {test,expect} from '@playwright/test';

const URL_PATH='/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1';
const PARENT='p'.repeat(32),CHILD='c'.repeat(32),ALTERNATIVE='I usually stay in bed for a while.';

async function fixture(page,{setupFailure=false,audioFailure=false,holdChildAudio=false,finishFailure=false,deferRetry=false,deferOriginal=false,autoStart=true}={}){
  const requests=[];let setupAttempts=0;
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(url.pathname.endsWith('/sp-interview.recordings.js'))return route.fulfill({contentType:'application/javascript',body:`window.SPInterviewRecordings={loadLibrary:async()=>({entryCount:75,dispose(){},speak(args){let stopped=false;window.__retryTest.openings++;queueMicrotask(()=>{if(!stopped)args.onEnded();});return{stop(){stopped=true;}};}})};`});
    if(!url.pathname.startsWith('/api/dana/'))return route.continue();
    const body=request.postDataJSON();requests.push({path:url.pathname,method:request.method(),body});
    if(url.pathname.endsWith('/health'))return route.fulfill({json:{configured:true}});
    if(url.pathname==='/api/dana/session'){if(deferOriginal){requests.originalRoute=route;return;}return route.fulfill({json:{sessionId:PARENT}});}
    if(url.pathname.endsWith('/finish'))return route.fulfill(finishFailure?{status:502,json:{error:'Unavailable'}}:{json:{finished:true,retryTurnIds:requests.filter(r=>r.path==='/api/dana/turn'&&r.body.sessionId===PARENT).map(r=>r.body.turnId)}});
    if(url.pathname.endsWith('/retry')){
      if(deferRetry){requests.retryRoute=route;return;}
      setupAttempts++;if(setupFailure&&setupAttempts===1)return route.fulfill({status:502,json:{error:'Try setup again'}});
      return route.fulfill({json:{sessionId:CHILD,sourceTurnId:body.turnId}});
    }
    if(url.pathname==='/api/dana/turn')return route.fulfill({json:{turnId:body.turnId,reply:body.sessionId===CHILD?ALTERNATIVE:'Mornings have been difficult '+body.turnId+'.',audioUrl:'/api/dana/audio/'+(body.sessionId===CHILD?'child':'parent')+'-clip-'+body.turnId}});
    if(request.method()==='DELETE')return route.fulfill({json:{ok:true}});
    if(url.pathname.endsWith('/status'))return route.fulfill({json:{state:'complete',turnId:Number(url.pathname.split('/').at(-2).split('-').at(-1))}});
    if(url.pathname.startsWith('/api/dana/audio/'))return route.fulfill(audioFailure&&url.pathname.includes('child-')?{status:404}:{contentType:'audio/mpeg',body:Buffer.from([73,68,51])});
    return route.fulfill({status:404});
  });
  await page.addInitScript(({holdChild})=>{
    const state=window.__retryTest={inputs:[],players:[],openings:0};
    const timeout=window.setTimeout.bind(window);window.setTimeout=(callback,delay,...args)=>timeout(callback,delay===4500?25:delay===6000?40:delay,...args);
    class Recognition{
      constructor(){this.active=false;this.results=[];state.inputs.push(this);}
      start(){this.active=true;queueMicrotask(()=>this.onstart?.());}
      stop(){this.active=false;queueMicrotask(()=>this.onend?.());}abort(){this.stop();}
      emit(text){this.results.push(Object.assign([{transcript:text}],{isFinal:true}));this.onresult?.({resultIndex:this.results.length-1,results:this.results});this.onspeechend?.();}
    }
    class Audio{
      constructor(src){this.src=src;this.originalSrc=src;this.active=false;state.players.push(this);}
      incoming(){return this.loading||(this.loading=fetch(this.src).then(r=>{if(!r.ok)throw Error('Unavailable fixture audio');}));}
      load(){if(this.src)this.incoming().catch(()=>this.onerror?.());}
      play(){this.active=true;this.lateEnded=this.onended;return this.incoming().then(()=>{if(!(holdChild&&this.originalSrc.includes('child-')))queueMicrotask(()=>{if(this.active){this.active=false;this.onended?.();}});});}
      pause(){this.active=false;}removeAttribute(){this.src='';}
    }
    window.Audio=Audio;window.SpeechRecognition=window.webkitSpeechRecognition=Recognition;
    window.__retryTest.emit=text=>{const input=state.inputs.findLast(item=>item.active);if(!input)throw Error('No active microphone');input.emit(text);};
  },{holdChild:holdChildAudio});
  await page.goto(URL_PATH);await expect(page.locator('#conversation-start')).toBeEnabled();
  if(autoStart){await page.locator('#conversation-start').click();await expect(page.locator('#conversation-status')).toHaveText('Listening');}
  return requests;
}
async function originalTurn(page,text){await page.evaluate(value=>window.__retryTest.emit(value),text);await expect(page.locator('#conversation-log .msg.me').last()).toHaveText('You: '+text);await expect(page.locator('#conversation-status')).toHaveText('Listening');}
async function finish(page){await endEncounter(page);await expect(page.locator('#retry-start')).toBeEnabled();}

test('one spoken alternative preserves the original and supports Hold, Pause, Resume and Space',async({page})=>{
  const requests=await fixture(page);await originalTurn(page,'What have mornings been like?');await originalTurn(page,'What happens after you wake up?');
  const original=await page.locator('#conversation-log').innerHTML();await finish(page);
  expect(requests.filter(r=>r.method==='DELETE')).toEqual([]);
  await expect(page.locator('#speech-disclosure')).toContainText('30 minutes');
  await page.locator('#retry-moment').selectOption('1');await expect(page.locator('#retry-original-question')).toHaveText('You: What happens after you wake up?');
  await page.locator('#retry-start').click();await expect(page.locator('#retry-status')).toHaveText('Listening — your alternative');
  await expect(page.locator('#retry-moment')).toBeDisabled();await expect(page.locator('#dana-voice-preview')).toBeDisabled();
  await page.locator('#retry-pause').click();await expect(page.locator('#retry-status')).toContainText('paused');
  await page.locator('#retry-resume').click();await expect(page.locator('#retry-status')).toHaveText('Listening — your alternative');
  await page.locator('#retry-hold').check();await page.evaluate(()=>window.__retryTest.emit('Could you walk me through a typical morning?'));
  await page.waitForTimeout(100);expect(requests.filter(r=>r.path==='/api/dana/turn'&&r.body.sessionId===CHILD)).toHaveLength(0);
  await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');
  await expect(page.locator('#retry-status')).toHaveText('Alternative complete — microphone off');
  await expect(page.locator('#retry-alternative')).toContainText(ALTERNATIVE);
  await expect(page.getByLabel('What changed in your wording, and what did you notice?',{exact:true})).toBeFocused();
  expect(await page.locator('#conversation-log').innerHTML()).toBe(original);
  expect(requests.filter(r=>r.path==='/api/dana/session')).toHaveLength(1);
  expect(requests.find(r=>r.path.endsWith('/retry')).body).toEqual({turnId:2});
  expect(requests.filter(r=>r.path==='/api/dana/turn'&&r.body.sessionId===CHILD).map(r=>r.body)).toEqual([{sessionId:CHILD,turnId:1,text:'Could you walk me through a typical morning?',previousTurnId:null,previousPlayback:'interrupted',previousCompletedSegments:0}]);
  expect(await page.evaluate(()=>window.__retryTest.openings)).toBe(1);
  await page.evaluate(()=>{document.activeElement.blur();});await page.keyboard.press('Space');
  expect(requests.filter(r=>r.path==='/api/dana/turn'&&r.body.sessionId===CHILD)).toHaveLength(1);
  await page.locator('#conversation-clear').click();
  await expect.poll(()=>requests.some(r=>r.path==='/api/dana/session/'+PARENT&&r.method==='DELETE')).toBe(true);
  await expect(page.locator('#conversation-log')).toBeEmpty();
});

test('an alternative playback error announces its actual reply and never offers to resend it',async({page})=>{
  const requests=await fixture(page,{audioFailure:true});await originalTurn(page,'How are your mornings?');await finish(page);
  await page.locator('#retry-start').click();await expect(page.locator('#retry-status')).toContainText('Listening');
  await page.evaluate(()=>window.__retryTest.emit('What makes getting up difficult?'));
  await expect(page.locator('#retry-error')).toContainText('Dana’s alternative reply: '+ALTERNATIVE);
  await expect(page.locator('#retry-error')).toHaveAttribute('role','alert');
  await expect(page.locator('#retry-alternative')).toContainText(ALTERNATIVE);
  await expect(page.locator('#retry-resume')).toBeHidden();await expect(page.locator('#retry-reflection-text')).toBeFocused();
  await page.locator('#retry-stop').click();await expect(page.locator('#retry-status')).toContainText('complete');
  expect(requests.filter(r=>r.path==='/api/dana/turn'&&r.body.sessionId===CHILD)).toHaveLength(1);
});

test('retry setup can recover on the same locked moment without starting a second encounter',async({page})=>{
  const requests=await fixture(page,{setupFailure:true});await originalTurn(page,'How are you feeling?');await finish(page);
  await page.locator('#retry-start').click();await expect(page.locator('#retry-start')).toHaveText('Retry setting up this moment');
  await expect(page.locator('#retry-moment')).toBeDisabled();await page.locator('#retry-start').click();await expect(page.locator('#retry-status')).toContainText('Listening');
  expect(requests.filter(r=>r.path.endsWith('/retry')).map(r=>r.body)).toEqual([{turnId:1},{turnId:1}]);
  expect(requests.filter(r=>r.path==='/api/dana/session')).toHaveLength(1);
  await page.locator('#retry-stop').click();await expect(page.locator('#retry-status')).toContainText('complete');
});

test('Escape stops a one-turn alternative and pagehide deletes the retained original',async({page})=>{
  const requests=await fixture(page,{holdChildAudio:true});await originalTurn(page,'What is hardest lately?');await finish(page);
  await page.locator('#retry-start').click();await expect(page.locator('#retry-status')).toContainText('Listening');
  await page.evaluate(()=>window.__retryTest.emit('What is a typical day like?'));await expect(page.locator('#retry-status')).toHaveText('Dana is speaking');
  await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');await expect(page.locator('#retry-status')).toHaveText('Dana is speaking');
  await page.keyboard.press('Escape');await expect(page.locator('#retry-status')).toContainText('complete');
  await page.evaluate(()=>window.__retryTest.players.forEach(player=>player.lateEnded?.()));
  expect(await page.evaluate(()=>window.__retryTest.inputs.filter(input=>input.active).length)).toBe(0);
  expect(await page.evaluate(()=>window.__retryTest.players.filter(player=>player.active).length)).toBe(0);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await expect.poll(()=>requests.some(r=>r.method==='DELETE'&&r.path==='/api/dana/session/'+PARENT)).toBe(true);
  expect(requests.filter(r=>r.path==='/api/dana/turn'&&r.body.sessionId===CHILD)).toHaveLength(1);
});

test('Clear remains available when finishing the original encounter fails',async({page})=>{
  const requests=await fixture(page,{finishFailure:true});await originalTurn(page,'How are things?');await endEncounter(page);
  await expect(page.locator('#conversation-retry')).toContainText('alternative could not be prepared');
  await page.locator('#conversation-clear').click();await expect.poll(()=>requests.some(r=>r.method==='DELETE'&&r.path==='/api/dana/session/'+PARENT)).toBe(true);
});

async function visibility(page,hidden){await page.evaluate(value=>{Object.defineProperty(document,'hidden',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'));},hidden);}

for(const returnBeforeSetup of [false,true]){
  test(`hiding during retry setup requires visible Resume even if setup finishes ${returnBeforeSetup?'after returning':'while hidden'}`,async({page})=>{
    const requests=await fixture(page,{deferRetry:true});await originalTurn(page,'What has been hard lately?');await finish(page);
    const inputs=await page.evaluate(()=>window.__retryTest.inputs.length);
    await page.locator('#retry-start').click();await expect.poll(()=>!!requests.retryRoute).toBe(true);
    await visibility(page,true);if(returnBeforeSetup)await visibility(page,false);
    await requests.retryRoute.fulfill({json:{sessionId:CHILD,sourceTurnId:1}});
    await expect(page.locator('#retry-status')).toHaveText('Alternative ready — microphone off');
    expect(await page.evaluate(()=>window.__retryTest.inputs.length)).toBe(inputs);
    if(!returnBeforeSetup){await page.locator('#retry-resume').click();expect(await page.evaluate(()=>window.__retryTest.inputs.length)).toBe(inputs);await visibility(page,false);}
    await expect(page.locator('#retry-status')).toHaveText('Alternative ready — microphone off');
    await page.locator('#retry-resume').click();await expect(page.locator('#retry-status')).toHaveText('Listening — your alternative');
    expect(await page.evaluate(()=>window.__retryTest.inputs.length)).toBe(inputs+1);
  });
}

test('hiding during original session startup requires visible Resume before the opening or microphone starts',async({page})=>{
  const requests=await fixture(page,{deferOriginal:true,autoStart:false});
  await page.locator('#conversation-start').click();await expect.poll(()=>!!requests.originalRoute).toBe(true);
  await visibility(page,true);await requests.originalRoute.fulfill({json:{sessionId:PARENT}});
  await expect(page.locator('#conversation-status')).toHaveText('Conversation ready — microphone off');
  expect(await page.evaluate(()=>({inputs:window.__retryTest.inputs.length,openings:window.__retryTest.openings}))).toEqual({inputs:0,openings:0});
  await page.locator('#conversation-resume').click();expect(await page.evaluate(()=>window.__retryTest.openings)).toBe(0);
  await visibility(page,false);await expect(page.locator('#conversation-status')).toHaveText('Conversation ready — microphone off');
  await page.locator('#conversation-resume').click();await expect(page.locator('#conversation-status')).toHaveText('Listening');
  expect(await page.evaluate(()=>({inputs:window.__retryTest.inputs.length,openings:window.__retryTest.openings}))).toEqual({inputs:1,openings:1});
});
