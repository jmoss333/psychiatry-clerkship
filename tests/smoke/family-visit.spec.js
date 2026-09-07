import {expect,test} from '@playwright/test';

const SESSION='family-original-1234567890',CHILD='family-alternative-123456';
const CASE_ID='family_morgan_maya_001',CASE_HASH='a'.repeat(64);
const RESPONSES={morgan:'I want my choices to stay mine, even while we talk about preventing another fall.',maya:'I care about Morgan, and I cannot be responsible for checking every night.'};

function room(sessionId=SESSION,{channel='public',status='active',turnCount=0,targetRoleId='both',events=[],sourceTurnId}={}){
  return {sessionId,caseId:CASE_ID,caseHash:CASE_HASH,channel,status,turnCount,maxTurns:sourceTurnId?1:10,targetRoleId,events,retryEligibleTurnIds:turnCount?[1]:[],...(sourceTurnId?{sourceTurnId}:{})};
}
function ndjson(values){return values.map(value=>JSON.stringify(value)).join('\n')+'\n';}

async function openFamily(page,{holdAudio=false,failFirstTurn=false,failCancel=false,delayCancel=false,delayChannel=false,splitAudio=false}={}){
  const network={requests:[],turnAttempts:0,cancelled:0,deleted:0};
  let releaseCancel,releaseChannel;const cancelGate=delayCancel?new Promise(resolve=>{releaseCancel=resolve;}):null,channelGate=delayChannel?new Promise(resolve=>{releaseChannel=resolve;}):null;
  network.releaseCancel=()=>releaseCancel?.();network.releaseChannel=()=>releaseChannel?.();
  let current=room(),group=0,lastTarget='both',failed=false,issued=new Map(),receiptCounts=new Map();
  network.room=()=>structuredClone(current);
  const event=(kind,props={})=>({id:'e'+(current.events.length+1),kind,channel:current.channel,audience:current.channel==='public'?['learner','morgan','maya']:['learner',current.channel.replace('-private','')],status:'completed',...props});
  const stream=(roleId,turnId,groupId)=>{
    const text=RESPONSES[roleId],parts=splitAudio&&roleId==='morgan'?[text.split(', even while')[0]+'.','Even while we talk about preventing another fall.']:[text];
    const segments=parts.map((part,index)=>({id:`${groupId}-${roleId}-${index+1}`,roleId,name:roleId==='morgan'?'Morgan':'Maya',text:part,audioUrl:`/api/family/audio/${groupId}-${roleId}-audio-${index+1}`}));issued.set(groupId,segments);
    return ndjson([...segments.map(segment=>({type:'segment',groupId,turnId,segment})),{type:'complete',groupId,turnId,roleId,remainingRoles:lastTarget==='both'&&roleId==='morgan'?['maya']:[],room:current}]);
  };
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1')return route.abort();
    if(!url.pathname.startsWith('/api/family/'))return route.continue();
    const body=request.postDataJSON();network.requests.push({path:url.pathname,method:request.method(),body});
    if(url.pathname==='/api/family/health')return route.fulfill({json:{configured:true,caseId:CASE_ID,caseHash:CASE_HASH,title:'Morgan & Maya — What happens after discharge?',participants:[{id:'morgan',name:'Morgan',pronouns:'they/them',voice:'marin',description:'Patient'},{id:'maya',name:'Maya',pronouns:'she/her',voice:'cedar',description:'Adult daughter'}],limits:{turns:10},localOnly:true}});
    if(url.pathname==='/api/family/session'&&request.method()==='POST'){current=room();return route.fulfill({json:current});}
    if(url.pathname==='/api/family/turn'){
      network.turnAttempts++;if(failFirstTurn&&!failed){failed=true;return route.fulfill({status:502,json:{error:'The room could not respond.'}});}
      group++;lastTarget=body.targetRoleId;const groupId='group-'+group,first=lastTarget==='maya'?'maya':'morgan';
      current={...current,turnCount:body.turnId,targetRoleId:lastTarget,events:[...current.events,event('learner',{text:body.text,turnId:body.turnId,targetRoleId:lastTarget,groupId})]};
      return route.fulfill({contentType:'application/x-ndjson',body:stream(first,body.turnId,groupId)});
    }
    if(url.pathname==='/api/family/continue')return route.fulfill({contentType:'application/x-ndjson',body:stream('maya',current.turnCount,body.groupId)});
    if(url.pathname==='/api/family/receipt'){
      const settled=receiptCounts.get(body.groupId)||0;receiptCounts.set(body.groupId,settled+1);const roleId=lastTarget==='both'&&settled>0?'maya':lastTarget==='maya'?'maya':'morgan',segmentId=`${body.groupId}-${roleId}-1`;
      const text=RESPONSES[roleId];current={...current,events:[...current.events,event('segment',{roleId,text,turnId:current.turnCount,groupId:body.groupId,segmentId,status:body.status==='played'?'completed':'interrupted'})],...(current.sourceTurnId?{status:'finished'}:{})};
      return route.fulfill({json:{room:current,canContinue:body.status==='played'&&lastTarget==='both'&&roleId==='morgan'}});
    }
    if(url.pathname==='/api/family/cancel'){
      network.cancelled++;if(failCancel)return route.fulfill({status:503,json:{error:'Cancellation could not be confirmed.'}});
      if(cancelGate)await cancelGate;
      const completed=new Set(body.completedSegmentIds||[]),segments=issued.get(body.groupId)||[];
      current={...current,events:[...current.events,...segments.map(segment=>event('segment',{roleId:segment.roleId,text:segment.text,turnId:current.turnCount,groupId:body.groupId,segmentId:segment.id,status:completed.has(segment.id)?'completed':'interrupted'}))]};
      return route.fulfill({json:current});
    }
    if(url.pathname==='/api/family/channel'){
      if(channelGate)await channelGate;
      const channel=body.channel,audience=channel==='public'?['learner','morgan','maya']:['learner',channel.replace('-private','')];
      current={...current,channel,targetRoleId:channel==='public'?'morgan':channel.replace('-private',''),events:[...current.events,{id:'e'+(current.events.length+1),kind:'transition',text:'Channel changed to '+channel+'.',channel,audience,status:'completed'}]};return route.fulfill({json:current});
    }
    if(url.pathname==='/api/family/finish'){current={...current,status:'finished',retryEligibleTurnIds:[1]};return route.fulfill({json:current});}
    if(url.pathname==='/api/family/retry'){
      const selected=current.events.find(item=>item.kind==='learner'&&item.turnId===body.turnId),channel=selected?.channel||current.channel;
      const child=room(CHILD,{channel,targetRoleId:channel==='public'?'morgan':channel.replace('-private',''),events:[],sourceTurnId:body.turnId});current=child;return route.fulfill({json:child});
    }
    if(url.pathname.startsWith('/api/family/audio/'))return route.fulfill({contentType:'audio/mpeg',body:Buffer.from([73,68,51,4])});
    if(url.pathname.startsWith('/api/family/session/')&&request.method()==='DELETE'){network.deleted++;return route.fulfill({json:{ok:true}});}
    return route.fulfill({status:404,json:{error:'Unexpected family fixture request'}});
  });
  await page.addInitScript(({hold})=>{
    const state=window.__familyTest={recognizers:[],players:[],plays:[]};
    const native=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>native(fn,delay===4500?25:delay===6000?40:delay===8000?80:delay,...args);
    class Recognition{
      constructor(){this.active=false;this.results=[];state.recognizers.push(this);}
      start(){this.active=true;queueMicrotask(()=>this.onstart?.());}
      stop(){this.active=false;queueMicrotask(()=>this.onend?.());}
      abort(){this.stop();}
      emit(text,final=true){const result=Object.assign([{transcript:text}],{isFinal:final});if(final)this.results.push(result);this.onspeechstart?.();this.onresult?.({resultIndex:final?this.results.length-1:this.results.length,results:final?this.results:this.results.concat([result])});if(final)this.onspeechend?.();}
    }
    class Audio{
      constructor(src=''){this.src=src;this.originalSrc=src;this.active=false;state.players.push(this);}
      load(){}
      play(){this.active=true;state.plays.push(this.originalSrc);if(!hold)queueMicrotask(()=>{if(this.active){this.active=false;this.onended?.();}});return Promise.resolve();}
      pause(){this.active=false;}removeAttribute(){this.src='';}
    }
    window.Audio=Audio;window.SpeechRecognition=window.webkitSpeechRecognition=Recognition;
    state.emit=(text,final=true)=>state.recognizers.findLast(item=>item.active).emit(text,final);
    state.finish=()=>{const player=state.players.find(item=>item.active);if(!player)throw Error('No active family audio');player.active=false;player.onended?.();};
    state.activeMics=()=>state.recognizers.filter(item=>item.active).length;
  },{hold:holdAudio});
  await page.goto('/_prototypes/sp-interview/family-visit.html');
  await expect(page.locator('#family-start')).toBeEnabled();
  return network;
}

async function start(page){await page.locator('#family-start').click();await expect(page.locator('#family-status')).toContainText(/listening/i);}
async function speak(page,text,{space=false}={}){await page.evaluate(value=>window.__familyTest.emit(value),text);if(space){await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Space');}}
async function endVisit(page){
  await page.locator('#family-end').click();
  const dialog=page.getByRole('dialog',{name:'Close the visit with the patient'});await expect(dialog).toBeVisible();
  expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);
  await dialog.getByRole('button',{name:'Finish visit and give handoff'}).click();
  await expect(page.locator('#family-reflection')).toBeVisible();
}

test('desktop and mobile identify both people and route explicit targets in order',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',problem=>errors.push(problem.message));
  const network=await openFamily(page);await expect(page.getByRole('heading',{name:/one room/i})).toBeVisible();
  await expect(page.locator('#family-person-morgan')).toContainText(/Morgan.*they\/them.*Marin/s);await expect(page.locator('#family-person-maya')).toContainText(/Maya.*she\/her.*Cedar/s);
  const morgan=await page.locator('#family-person-morgan').boundingBox(),maya=await page.locator('#family-person-maya').boundingBox();
  if(testInfo.project.name==='mobile')expect(maya.y).toBeGreaterThan(morgan.y+morgan.height-2);else expect(Math.abs(maya.y-morgan.y)).toBeLessThan(3);
  await expect(page.locator('#family-error')).toBeHidden();
  await start(page);await page.locator('#family-target-morgan').click();await speak(page,'Morgan, what would feel useful today?',{space:true});await expect(page.locator('#family-count')).toHaveText('1 of 10 turns');await expect(page.locator('#family-log')).toContainText(RESPONSES.morgan);await expect(page.locator('#family-log')).not.toContainText(RESPONSES.maya);
  await page.locator('#family-target-maya').click();await speak(page,'Maya, what would feel useful today?',{space:true});
  await expect(page.locator('#family-log')).toContainText(RESPONSES.maya);
  await page.locator('#family-target-both').click();await speak(page,'I would like to hear from both of you.');
  await expect(page.locator('#family-count')).toHaveText('3 of 10 turns');await expect(page.locator('#family-status')).toContainText(/listening/i);
  await expect(page.locator('#family-log')).toContainText(RESPONSES.morgan);await expect(page.locator('#family-log')).toContainText(RESPONSES.maya);
  expect(network.requests.filter(item=>item.path==='/api/family/turn').map(item=>item.body.targetRoleId)).toEqual(['morgan','maya','both']);
  expect(network.requests.filter(item=>item.path==='/api/family/continue')).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('station door note, requested chart facts, observable cue, and paused timer support preparation',async({page})=>{
  await openFamily(page);
  const station=page.locator('#family-station');await expect(station.getByRole('heading',{name:'Before you enter'})).toBeVisible();
  await expect(station.locator('[data-station="door-note"]')).toContainText(/Morgan.*Maya.*family meeting/is);
  await expect(station.locator('[data-station="cue"]')).toContainText(/Morgan looks toward Maya/i);
  await station.getByText('Request available chart information').click();
  const chartButton=station.getByRole('button',{name:'Meeting context'});await chartButton.click();await expect(chartButton).toHaveText(/Reviewed: Meeting context/);
  await expect(station).toContainText(/voluntarily accepted this meeting/i);
  await station.getByText('Optional practice timer and accommodations').click();await station.getByLabel('Practice length').selectOption('8');await expect(station.locator('[data-station="timer"]')).toHaveText('8:00 remaining');
  await start(page);await expect(station.locator('[data-station="timer"]')).not.toHaveText('8:00 remaining');await page.locator('#family-pause').click();
  await station.getByRole('button',{name:'Pause timer'}).click();await expect(station.getByRole('button',{name:'Resume timer'})).toBeVisible();
});

test('headphone acknowledgment preserves playback while a real question interrupts it',async({page})=>{
  const network=await openFamily(page,{holdAudio:true});await page.locator('#family-headphones').check();await start(page);await page.locator('#family-target-morgan').click();
  await speak(page,'What feels most important to you?',{space:true});await expect(page.locator('#family-interrupt')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__familyTest.players.filter(item=>item.active).length)).toBe(1);
  await page.evaluate(()=>window.__familyTest.emit('mm-hmm'));await expect(page.locator('#family-live')).toContainText(/Acknowledgment heard/i);
  expect(await page.evaluate(()=>window.__familyTest.players.filter(item=>item.active).length)).toBe(1);
  await page.waitForTimeout(120);expect(await page.evaluate(()=>window.__familyTest.players.filter(item=>item.active).length)).toBe(1);
  await page.evaluate(()=>window.__familyTest.emit('Can you say more about that?'));
  await expect.poll(()=>network.cancelled).toBe(1);await expect(page.locator('#family-draft')).toContainText(/Can you say more/i);
});

test('headphone listener transfers into the next learner turn after normal playback',async({page})=>{
  const network=await openFamily(page,{holdAudio:true});await page.locator('#family-headphones').check();await start(page);await page.locator('#family-target-morgan').click();
  await speak(page,'What feels most important today?',{space:true});await expect.poll(()=>page.evaluate(()=>window.__familyTest.players.filter(item=>item.active).length)).toBe(1);
  await page.evaluate(()=>window.__familyTest.finish());await expect(page.locator('#family-status')).toContainText(/listening/i);await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);
  expect(await page.evaluate(()=>window.__familyTest.recognizers.length)).toBe(2);
  await speak(page,'What would a useful next step look like?',{space:true});await expect.poll(()=>network.turnAttempts).toBe(2);
});

test('default captions do not duplicate spoken text and silence never submits an empty turn',async({page})=>{
  const network=await openFamily(page);await start(page);await page.waitForTimeout(80);expect(network.turnAttempts).toBe(0);
  await speak(page,'Morgan, what feels most important?',{space:true});await expect(page.locator('#family-status')).toContainText(/listening/i);
  await expect(page.locator('#family-live')).not.toContainText(RESPONSES.morgan);expect(network.turnAttempts).toBe(1);
});

test('reading the transcript in ordinary mode preserves a partial draft and restores the learner Hold setting',async({page})=>{
  const network=await openFamily(page);await start(page);
  await page.evaluate(()=>{window.__familyTest.emit('I need a moment to finish this thought.');document.querySelector('#family-log').focus();});
  await expect(page.locator('#family-log')).toBeFocused();await page.waitForTimeout(80);
  expect(network.turnAttempts).toBe(0);await expect(page.locator('#family-draft')).toContainText('I need a moment to finish this thought.');
  await page.locator('#family-pause').focus();
  await expect.poll(()=>network.turnAttempts).toBe(1);
  expect(network.requests.find(item=>item.path==='/api/family/turn').body.text).toBe('I need a moment to finish this thought.');
});

test('caption-reading announces completed words once and waits for explicit Resume without losing a held draft',async({page})=>{
  const network=await openFamily(page);await page.locator('#family-caption-reading').check();await start(page);await page.locator('#family-target-morgan').click();
  await speak(page,'Morgan, what feels most important?',{space:true});await expect(page.locator('#family-status')).toContainText(/Paused.*microphone off/i);
  await expect(page.locator('#family-live')).toContainText('Morgan: '+RESPONSES.morgan);await expect(page.locator('#family-live')).toContainText(/Choose Resume/);
  expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);await expect(page.locator('#family-log')).toBeFocused();
  await page.keyboard.press('Space');expect(network.turnAttempts).toBe(1);
  await page.locator('#family-resume').click();await page.locator('#family-hold').check();await page.evaluate(()=>{window.__familyTest.emit('I want to preserve these words.',true);document.querySelector('#family-log').focus();});
  await page.waitForTimeout(80);expect(network.turnAttempts).toBe(1);await expect(page.locator('#family-draft')).toContainText('I want to preserve these words.');
  await page.keyboard.press('Space');expect(network.turnAttempts).toBe(1);await page.locator('#family-clear').click();await expect(page.locator('#family-start')).toBeEnabled();
  expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);await expect(page.locator('#family-live')).toHaveText('Visit cleared.');expect(network.deleted).toBeGreaterThan(0);
});

test('repeated public focus offers the other person the floor while private turns do not',async({page})=>{
  await openFamily(page);await start(page);await page.locator('#family-target-morgan').click();
  await speak(page,'Morgan, what matters most?',{space:true});await expect(page.locator('#family-status')).toContainText(/listening/i);await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);
  await speak(page,'Morgan, what would help next?',{space:true});await expect(page.locator('#family-floor')).toBeVisible();await expect(page.locator('#family-floor-copy')).toContainText(/Maya/i);
  await page.locator('#family-floor-invite').click();await expect(page.locator('#family-target-maya')).toHaveAttribute('aria-pressed','true');
  await page.locator('#family-pause').click();await page.locator('#family-private-morgan').click();await expect(page.locator('#family-status')).toContainText(/listening/i);await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);await speak(page,'What would you keep private?',{space:true});
  await expect(page.locator('#family-floor')).toBeHidden();
});

test('interrupting the first response to both cancels the queued second voice',async({page})=>{
  const network=await openFamily(page,{holdAudio:true});await start(page);await page.locator('#family-target-both').click();await speak(page,'What does each of you want us to understand?',{space:true});
  await expect(page.locator('#family-interrupt')).toBeVisible();await page.locator('#family-interrupt').click();
  await expect.poll(()=>network.cancelled).toBe(1);expect(network.requests.filter(item=>item.path==='/api/family/continue')).toHaveLength(0);
  await expect(page.locator('#family-status')).toContainText(/listening/i);
  expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);
});

test('a failed cancellation blocks the microphone and offers a safe Clear reset',async({page})=>{
  const network=await openFamily(page,{holdAudio:true,failCancel:true});await start(page);await page.locator('#family-target-both').click();
  await speak(page,'What does each of you want us to understand?',{space:true});await expect(page.locator('#family-interrupt')).toBeVisible();
  await page.locator('#family-interrupt').click();await expect.poll(()=>network.cancelled).toBe(1);
  await expect(page.locator('#family-error')).toBeVisible();await expect(page.locator('#family-repair-resume')).toBeDisabled();
  await expect(page.locator('#family-clear')).toBeVisible();await expect(page.locator('#family-clear')).toBeEnabled();
  expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);
  expect(network.requests.filter(item=>item.path==='/api/family/continue')).toHaveLength(0);
  await page.locator('#family-clear').click();await expect(page.locator('#family-start')).toBeEnabled();
  expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);expect(network.deleted).toBeGreaterThan(0);
});

test('pagehide during delayed cancellation cannot restart the microphone',async({page})=>{
  const network=await openFamily(page,{holdAudio:true,delayCancel:true});await start(page);await speak(page,'What does each of you want us to understand?',{space:true});
  await expect(page.locator('#family-interrupt')).toBeVisible();await page.locator('#family-interrupt').click();await expect.poll(()=>network.cancelled).toBe(1);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));network.releaseCancel();
  await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);await page.waitForTimeout(100);expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);
});

test('pagehide during a delayed private-channel switch cannot resume capture',async({page})=>{
  const network=await openFamily(page,{delayChannel:true});await start(page);await page.locator('#family-pause').click();
  await page.locator('#family-private-morgan').click({noWaitAfter:true});await expect.poll(()=>network.requests.filter(item=>item.path==='/api/family/channel').length).toBe(1);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));network.releaseChannel();
  await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);await page.waitForTimeout(100);expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);
});

test('Repair stays disabled while recognized words remain unfinished',async({page})=>{
  await openFamily(page);await start(page);await page.evaluate(()=>window.__familyTest.emit('I want to check whether',false));
  await expect(page.locator('#family-draft')).toContainText('I want to check whether');await expect(page.locator('#family-repair')).toBeDisabled();
  await page.locator('#family-hold').check();await page.evaluate(()=>window.__familyTest.emit('I want to check whether I understood.',true));
  await expect(page.locator('#family-repair')).toBeDisabled();await expect(page.locator('#family-draft')).toContainText(/understood/);
});

test('returning from closing waits for an in-flight cancellation before resuming',async({page})=>{
  const network=await openFamily(page,{holdAudio:true,delayCancel:true});await start(page);await speak(page,'Let me summarize what I have heard.',{space:true});
  await expect(page.locator('#family-interrupt')).toBeVisible();await page.evaluate(()=>document.querySelector('#family-end').click());
  const dialog=page.getByRole('dialog',{name:'Close the visit with the patient'});await expect(dialog).toBeVisible();await expect.poll(()=>network.cancelled).toBe(1);
  const back=dialog.getByRole('button',{name:'Return to patient and summarize'});await back.click({noWaitAfter:true});expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);
  network.releaseCancel();await expect(dialog).toBeHidden();await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);
});

test('an interrupted multi-segment exchange keeps only the completed prefix as heard',async({page})=>{
  await openFamily(page,{holdAudio:true,splitAudio:true});await start(page);await page.locator('#family-target-morgan').click();await speak(page,'What feels important as you consider what happens next?',{space:true});
  await expect(page.locator('#family-interrupt')).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.__familyTest.players.filter(item=>item.active).length)).toBe(1);await page.evaluate(()=>window.__familyTest.finish());
  await expect.poll(()=>page.evaluate(()=>window.__familyTest.players.filter(item=>item.active).length)).toBe(1);
  await page.locator('#family-interrupt').click();await expect(page.locator('#family-status')).toContainText(/listening/i);
  const log=page.locator('#family-log');await expect(log).toContainText('I want my choices to stay mine.');
  await expect(log.getByText('Even while we talk about preventing another fall.')).toContainText(/Even while/);
  await expect(log.getByText('Even while we talk about preventing another fall.').locator('..')).toContainText(/interrupted|not confirmed heard/i);
  await page.locator('#family-bookmark').click();await endVisit(page);await expect(page.locator('#family-retry-1')).toBeEnabled();
});

test('private check-ins keep captions separate and hiding leaves the microphone off',async({page})=>{
  await openFamily(page);await start(page);await page.locator('#family-pause').click();
  await page.locator('#family-private-morgan').click();await expect(page.locator('#family-channel-label')).toContainText(/private.*Morgan/i);
  await expect(page.locator('[data-station="cue"]')).toHaveText('Morgan looks toward you and waits.');
  await expect(page.locator('#family-status')).toContainText(/listening/i);await speak(page,'Morgan, what would you rather keep between us?',{space:true});
  await expect(page.locator('#family-log')).toContainText(RESPONSES.morgan);await page.locator('#family-pause').click();await page.locator('#family-rejoin').click();
  await expect(page.locator('#family-channel-label')).toContainText(/Together/i);await expect(page.locator('#family-log')).not.toContainText(RESPONSES.morgan);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  expect(await page.evaluate(()=>window.__familyTest.activeMics())).toBe(0);
});

test('bookmark retry preserves the original and local note, then Clear deletes memory',async({page})=>{
  const network=await openFamily(page);await start(page);await page.locator('#family-target-morgan').click();await speak(page,'What matters most as you think about next steps?',{space:true});
  await expect(page.locator('#family-bookmark')).toBeEnabled();await page.locator('#family-bookmark').click();await endVisit(page);
  await expect(page.locator('#family-reflection')).toBeVisible();await page.locator('#family-note-1').fill('Keep Morgan’s autonomy visible.');
  const original=await page.locator('#family-log').textContent();await page.locator('#family-retry-1').click();
  await expect(page.locator('#family-alternative')).toBeVisible();await expect(page.locator('#family-resume')).toBeVisible();expect(await page.locator('#family-log').textContent()).toBe(original);await expect(page.locator('#family-note-1')).toHaveValue('Keep Morgan’s autonomy visible.');
  await page.locator('#family-resume').click();await expect(page.locator('#family-status')).toContainText(/listening/i);await expect(page.locator('#family-target-morgan')).toBeDisabled();
  await speak(page,'Let me try reflecting the choice you want to keep.',{space:true});await expect(page.locator('#family-alternative-log')).toContainText(RESPONSES.morgan);
  expect(network.requests.filter(item=>item.path==='/api/family/retry')).toHaveLength(1);expect(network.requests.filter(item=>item.path==='/api/family/turn').at(-1).body).toMatchObject({sessionId:CHILD,turnId:1,targetRoleId:'morgan'});expect(await page.locator('#family-log').textContent()).toBe(original);
  await page.locator('#family-clear').click();await expect(page.locator('#family-start')).toBeEnabled();
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});expect(network.deleted).toBeGreaterThan(0);
});

test('information replay is finished-only, uses an exact temporal and channel boundary, and makes no requests',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',problem=>errors.push(problem.message));const network=await openFamily(page);await start(page);
  await expect(page.locator('button[id^="family-information-"]:not(#family-information-close)')).toHaveCount(0);
  await page.locator('#family-pause').click();await page.locator('#family-private-morgan').click();await expect(page.locator('#family-status')).toContainText(/listening/i);await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);
  await speak(page,'Morgan, what should stay private in this check-in?',{space:true});await page.locator('#family-bookmark').click();
  await page.locator('#family-pause').click();await page.locator('#family-rejoin').click();await expect(page.locator('#family-status')).toContainText(/listening/i);await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);await page.locator('#family-target-maya').click();
  await speak(page,'Maya, what support could you realistically offer?',{space:true});await page.locator('#family-bookmark').click();
  await endVisit(page);await page.locator('#family-note-1').fill('Private autonomy question.');await page.locator('#family-note-2').fill('Public support question.');
  const before=await page.evaluate(()=>({plays:window.__familyTest.plays.length,mics:window.__familyTest.activeMics()})),requestCount=network.requests.length;

  await page.locator('#family-information-1').click();await expect(page.locator('#family-information-replay')).toBeVisible();await expect(page.locator('#family-information-title')).toBeFocused();
  await expect(page.locator('#family-information-question')).toHaveText('Morgan, what should stay private in this check-in?');
  await expect(page.locator('#family-information-replay')).toContainText(/private check-in with Morgan/i);
  await expect(page.locator('#family-information-replay')).not.toContainText('Maya, what support could you realistically offer?');
  await page.getByRole('tab',{name:'Maya'}).click();await expect(page.getByRole('tabpanel')).not.toContainText(RESPONSES.morgan);
  await page.locator('#family-information-close').click();await expect(page.locator('#family-information-1')).toBeFocused();

  await page.locator('#family-information-2').click();await expect(page.locator('#family-information-question')).toHaveText('Maya, what support could you realistically offer?');
  await expect(page.locator('#family-information-replay')).toContainText(/public|together/i);const visibleRecord=page.locator('#family-information-replay [role="tabpanel"]:visible');
  await expect(page.getByRole('tab',{name:'Maya'})).toHaveAttribute('aria-selected','true');await expect(visibleRecord).not.toContainText('Morgan, what should stay private');await expect(visibleRecord).not.toContainText(RESPONSES.morgan);await expect(visibleRecord).not.toContainText(RESPONSES.maya);
  await page.getByRole('tab',{name:'Morgan'}).click();await expect(visibleRecord).toContainText('Morgan, what should stay private');await expect(visibleRecord).toContainText(RESPONSES.morgan);await expect(visibleRecord).not.toContainText(RESPONSES.maya);
  await page.getByRole('tab',{name:'You, the student'}).click();await expect(visibleRecord).toContainText('Morgan, what should stay private');await expect(visibleRecord).toContainText(RESPONSES.morgan);await expect(visibleRecord).not.toContainText(RESPONSES.maya);
  await expect(page.locator('#family-note-1')).toHaveValue('Private autonomy question.');await expect(page.locator('#family-note-2')).toHaveValue('Public support question.');
  expect(network.requests).toHaveLength(requestCount);expect(await page.evaluate(()=>({plays:window.__familyTest.plays.length,mics:window.__familyTest.activeMics()}))).toEqual(before);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);expect(errors).toEqual([]);
  await page.locator('#family-information-replay').screenshot({path:`/tmp/sp-information-replay-qa/${testInfo.project.name}-temporal-channel.png`});
});

test('information replay tabs support keyboard review and Escape returns focus without changing the visit',async({page})=>{
  const network=await openFamily(page);await start(page);await page.locator('#family-target-both').click();
  await speak(page,'What would each of you want the other to understand?',{space:true});await expect(page.locator('#family-log')).toContainText(RESPONSES.maya);await expect(page.locator('#family-status')).toContainText(/listening/i);await page.locator('#family-bookmark').click();await endVisit(page);
  const original=await page.locator('#family-log').textContent(),requestCount=network.requests.length;
  expect(await page.evaluate(room=>window.FamilyInformationReplay.buildReplay(room,1),network.room())).not.toBeNull();
  await page.locator('#family-information-1').click();const tabs=page.getByRole('tablist',{name:'Whose conversation record?'});const student=tabs.getByRole('tab',{name:'You, the student'}),morgan=tabs.getByRole('tab',{name:'Morgan'}),maya=tabs.getByRole('tab',{name:'Maya'});
  await expect(student).toHaveAttribute('aria-selected','true');await student.focus();await page.keyboard.press('ArrowRight');await expect(morgan).toBeFocused();await expect(morgan).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('End');await expect(maya).toBeFocused();await expect(maya).toHaveAttribute('aria-selected','true');await page.keyboard.press('Home');await expect(student).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#family-information-replay')).toBeHidden();await expect(page.locator('#family-information-1')).toBeFocused();
  expect(await page.locator('#family-log').textContent()).toBe(original);await expect(page.locator('#family-target-both')).toHaveAttribute('aria-pressed','true');expect(network.requests).toHaveLength(requestCount);
});

test('information replay closes for retry, returns with the original, and Clear removes it',async({page})=>{
  const network=await openFamily(page);await start(page);await page.locator('#family-target-morgan').click();await speak(page,'What choice matters most to you?',{space:true});await page.locator('#family-bookmark').click();await endVisit(page);
  await page.locator('#family-information-1').click();await expect(page.locator('#family-information-replay')).toBeVisible();await page.locator('#family-information-close').click();
  await page.locator('#family-retry-1').click();await expect(page.locator('#family-information-replay')).toBeHidden();await expect(page.locator('#family-information-1')).toBeHidden();
  await page.locator('#family-resume').click();await speak(page,'Let me ask that in another way.',{space:true});await expect(page.locator('#family-alternative-log')).toContainText(RESPONSES.morgan);await expect(page.locator('#family-back-original')).toBeVisible();await page.locator('#family-back-original').click();
  await expect(page.locator('#family-information-1')).toBeVisible();await page.locator('#family-information-1').click();await expect(page.locator('#family-information-replay')).toBeVisible();
  const requestCount=network.requests.length;await page.locator('#family-clear').click();await expect(page.locator('#family-information-replay')).toBeHidden();await expect(page.locator('button[id^="family-information-"]:not(#family-information-close)')).toHaveCount(0);await expect(page.locator('#family-start')).toBeEnabled();expect(network.requests.length).toBeGreaterThan(requestCount);
});

test('closure unlocks isolated attending dictation and evidence-bounded perspectives',async({page})=>{
  const network=await openFamily(page);await start(page);await page.locator('#family-target-both').click();await speak(page,'What would each of you want reflected in a next step?',{space:true});
  await endVisit(page);const requestCount=network.requests.length;
  const handoff=page.getByLabel('Your presentation to the attending');await handoff.fill('Morgan and Maya described different priorities.');
  await page.getByRole('button',{name:'Dictate presentation'}).click();await expect(page.getByText(/Listening to your attending presentation/)).toBeVisible();
  await page.evaluate(()=>window.__familyTest.emit('I would clarify what support is sustainable.'));
  await expect(handoff).toHaveValue(/Morgan and Maya.*clarify what support is sustainable/s);await page.getByRole('button',{name:'Stop dictation'}).click();
  expect(network.requests).toHaveLength(requestCount);
  const reflection=page.getByLabel('What were you trying to convey, and how might it have landed?');await reflection.fill('I wanted both people to define a workable next step.');
  await page.getByRole('button',{name:'Explore possible patient perspectives'}).click();
  const perspectives=page.locator('[data-station="perspectives"]');await expect(perspectives).toContainText(/Morgan’s possible perspective/);await expect(perspectives).toContainText(/Maya’s agreement.*cannot establish Morgan’s agreement/i);
  await expect(page.locator('[data-station="completed-replies"]')).toContainText(RESPONSES.morgan);
  expect(network.requests).toHaveLength(requestCount);
});

test('debrief context selector keeps public and private words separate without an API request',async({page})=>{
  const network=await openFamily(page);await start(page);await page.locator('#family-target-morgan').click();await speak(page,'What would you want Maya to understand?',{space:true});
  await page.locator('#family-pause').click();await page.locator('#family-private-morgan').click();await expect(page.locator('#family-status')).toContainText(/listening/i);await expect.poll(()=>page.evaluate(()=>window.__familyTest.activeMics())).toBe(1);await speak(page,'What should stay only in this check-in?',{space:true});
  await page.locator('#family-pause').click();await page.locator('#family-rejoin').click();await endVisit(page);
  await expect(page.locator('[data-station="reflection-channel"]')).toContainText(/Public conversation.*other channels are not shown/i);
  const exchange=page.getByLabel('Exchange to reflect on'),context=page.getByLabel('Review conversation context');
  let options=await exchange.locator('option').allTextContents();expect(options).toHaveLength(1);expect(options[0]).toContain('What would you want Maya to understand?');expect(options.join(' ')).not.toContain('What should stay only');
  const requestCount=network.requests.length;await context.selectOption('morgan-private');await expect(page.locator('[data-station="reflection-channel"]')).toContainText(/Private check-in with Morgan/);
  options=await exchange.locator('option').allTextContents();expect(options).toHaveLength(1);expect(options[0]).toContain('What should stay only');expect(options.join(' ')).not.toContain('What would you want Maya');expect(network.requests).toHaveLength(requestCount);
  await context.selectOption('public');await expect(page.locator('[data-station="selected-quote"]')).not.toContainText('What should stay only');expect(network.requests).toHaveLength(requestCount);
});

for(const direction of [{bookmark:'morgan-private',finish:'public',label:'private bookmark after a public finish'},{bookmark:'public',finish:'morgan-private',label:'public bookmark after a private finish'}])test(`retry uses the ${direction.label}`,async({page})=>{
  const network=await openFamily(page);await start(page);
  if(direction.bookmark==='morgan-private'){await page.locator('#family-pause').click();await page.locator('#family-private-morgan').click();}
  await expect(page.locator('#family-status')).toContainText(/listening/i);await speak(page,'What matters most about the plan?',{space:true});await page.locator('#family-bookmark').click();await page.locator('#family-pause').click();
  if(direction.finish==='public')await page.locator('#family-rejoin').click();else await page.locator('#family-private-morgan').click();
  await endVisit(page);await page.locator('#family-retry-1').click();
  const retry=network.requests.find(item=>item.path==='/api/family/retry');expect(retry.body.turnId).toBe(1);
  await expect(page.locator('#family-alternative')).toBeVisible();await expect(page.locator('#family-channel-label')).toContainText(direction.bookmark==='public'?/Together/i:/private.*Morgan/i);
  await page.locator('#family-resume').click();await speak(page,'Let me try that moment again.',{space:true});
  expect(network.requests.filter(item=>item.path==='/api/family/turn').at(-1).body).toMatchObject({sessionId:CHILD,targetRoleId:'morgan'});
});

test('a server turn error recovers visibly without silently resending',async({page})=>{
  const network=await openFamily(page,{failFirstTurn:true});await start(page);await speak(page,'What would each of you like to discuss?',{space:true});
  await expect(page.locator('#family-error')).toBeVisible();await expect(page.locator('#family-resume')).toBeVisible();expect(network.turnAttempts).toBe(1);
  await page.locator('#family-resume').click();await expect(page.locator('#family-status')).toContainText(/listening/i);expect(network.turnAttempts).toBe(1);
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
});
