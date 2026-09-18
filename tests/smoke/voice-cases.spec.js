import {endEncounter} from './sp-station-helpers.js';
import {expect,test} from '@playwright/test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {createDanaAudioCatalog} from '../../_prototypes/sp-interview/dana-audio-catalog.mjs';

const pack=JSON.parse(fs.readFileSync(new URL('../../_prototypes/sp-interview/sp-interview.pack.json',import.meta.url),'utf8'));
const require=createRequire(import.meta.url),morganCase=require('../../_prototypes/sp-interview/sp-interview.local-cases.js').cases[0];
const CASES=[
  {id:'sp_mania_redirect_001',slug:'marcus',name:'Marcus',other:'Ray',reply:'I have a lot to explain, but yes, I can slow down for a second.'},
  {id:'sp_psychosis_paranoid_001',slug:'ray',name:'Ray',other:'Marcus',reply:'I am listening. I just need to know what happens with what I tell you.'},
  {id:'sp_alcohol_ambivalence_001',slug:'morgan',name:'Morgan',other:'Dana',reply:'Part of me likes how drinking shuts the workday off, and part of me is tired of losing my mornings.',draft:true},
];
const DANA={id:'sp_depression_gated_si_001',slug:'dana',name:'Dana',other:'Marcus',reply:'It helps to know why we are talking. I would like you to understand how difficult mornings have become.'};
const audio=Buffer.from([73,68,51,4,0,1,2,3]);
const hash=value=>createHash('sha256').update(value).digest('hex');
const spoken=value=>value.replace(/\*[^*]*\*/g,' ').replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
const SESSION='s'.repeat(32),CHILD='c'.repeat(32);

function openingManifest(caseDef){
  if(caseDef.id===DANA.id){const catalog=createDanaAudioCatalog(pack);return{schemaVersion:1,...catalog,packHash:hash(JSON.stringify(pack)),voice:'marin',model:'gpt-4o-mini-tts-2025-12-15',entries:catalog.entries.map(entry=>({...entry,audioSha256:hash(audio),bytes:audio.length,durationSeconds:3}))};}
  const sourceText=caseDef.persona.opening,id=hash(sourceText),spokenText=spoken(sourceText);
  const recordingPack=caseDef.id===morganCase.id?{...pack,cases:[...pack.cases,morganCase]}:pack;
  return {schemaVersion:1,caseId:caseDef.id,packVersion:recordingPack.version,packHash:hash(JSON.stringify(recordingPack)),voice:caseDef.id===morganCase.id?'marin':'cedar',model:'gpt-4o-mini-tts-2025-12-15',entries:[{id,sourceText,spokenText,spokenHash:hash(spokenText),file:id+'.mp3',sha256:id,audioSha256:hash(audio),bytes:audio.length,durationSeconds:3}]};
}

async function openCase(page,profile,{missingOpening=false,urlCase=profile.id}={}){
  const caseDef=profile.id===morganCase.id?morganCase:pack.cases.find(item=>item.id===profile.id),manifest=openingManifest(caseDef);
  const network={requests:[],external:[],openingPlays:0},libraryPath=profile.id===DANA.id?'/output/speech/dana-marin-v1/':`/output/speech/voice-cases-v1/${profile.slug}/`;
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!=='127.0.0.1'){network.external.push(url.href);return route.abort();}
    if(url.pathname===libraryPath+'manifest.json')return route.fulfill(missingOpening?{status:404}:{json:manifest});
    if(url.pathname.startsWith(libraryPath)&&url.pathname.endsWith('.mp3'))return route.fulfill({contentType:'audio/mpeg',body:audio});
    if(!url.pathname.startsWith('/api/dana/'))return route.continue();
    const body=request.postDataJSON();network.requests.push({path:url.pathname,method:request.method(),body});
    if(url.pathname==='/api/dana/health')return route.fulfill({json:{configured:true,cases:['sp_depression_gated_si_001',...CASES.map(item=>item.id)]}});
    if(url.pathname==='/api/dana/session'&&request.method()==='POST')return route.fulfill({json:{sessionId:SESSION,caseId:profile.id,opening:caseDef.persona.opening}});
    if(url.pathname==='/api/dana/turn')return route.fulfill({json:{turnId:body.turnId,caseId:profile.id,reply:profile.reply,audioUrl:'/api/dana/audio/'+profile.slug+'-reply-'+body.turnId}});
    if(url.pathname.endsWith('/finish'))return route.fulfill({json:{finished:true,retryTurnIds:[1]}});
    if(url.pathname.endsWith('/retry'))return route.fulfill({json:{sessionId:CHILD,sourceTurnId:body.turnId,caseId:profile.id}});
    if(url.pathname.endsWith('/status'))return route.fulfill({json:{state:'complete',turnId:1}});
    if(url.pathname.startsWith('/api/dana/audio/')&&request.method()==='GET')return route.fulfill({contentType:'audio/mpeg',body:audio});
    if(request.method()==='DELETE')return route.fulfill({json:{ok:true}});
    return route.fulfill({status:404,json:{error:'Unexpected fixture request'}});
  });
  await page.addInitScript(()=>{
    const state=window.__voiceCaseTest={recognizers:[],played:[]};
    const timer=window.setTimeout.bind(window);window.setTimeout=(callback,delay,...args)=>timer(callback,delay===4500?20:delay===6000?35:delay,...args);
    class Recognition{
      constructor(){this.active=false;this.results=[];state.recognizers.push(this);}
      start(){this.active=true;queueMicrotask(()=>this.onstart?.());}
      stop(){this.active=false;queueMicrotask(()=>this.onend?.());}
      abort(){this.stop();}
      emit(text){const result=Object.assign([{transcript:text}],{isFinal:true});this.results.push(result);this.onspeechstart?.();this.onresult?.({resultIndex:this.results.length-1,results:this.results});this.onspeechend?.();}
    }
    class Audio{
      constructor(src=''){this.src=src;this.originalSrc=src;}
      load(){}
      play(){state.played.push(this.originalSrc||this.src);queueMicrotask(()=>this.onended?.());return Promise.resolve();}
      pause(){}
      removeAttribute(){this.src='';}
    }
    window.Audio=Audio;window.SpeechRecognition=window.webkitSpeechRecognition=Recognition;
    window.SpeechSynthesisUtterance=undefined;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:undefined});
    state.emit=text=>state.recognizers.findLast(item=>item.active).emit(text);
  });
  await page.goto(`/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1&case=${encodeURIComponent(urlCase)}`);
  return {caseDef,network};
}

for(const profile of CASES)test(`${profile.name} stays case-bound through speech, repair, bookmark, retry, and Clear`,async({page})=>{
  const {caseDef,network}=await openCase(page,profile);
  await expect(page.locator('#conversation-case-select')).toHaveValue(profile.id);
  await expect(page.locator('#conversation-case-title')).toHaveText(caseDef.title);
  await expect(page.locator('#conversation-case-goal')).toHaveText(caseDef.learnerGoal);
  await expect(page.locator('#conversation-case-context')).toHaveText(caseDef.persona.presentingContext);
  await expect(page.locator('#conversation-case-practice')).not.toBeEmpty();
  if(profile.draft)await expect(page.locator('#conversation-case-review-status')).toContainText(/local draft|faculty review pending/i);
  await expect(page.getByRole('heading',{name:`Talk with ${profile.name}`})).toBeVisible();
  await expect(page.locator('#conversation-start')).toBeEnabled();
  await page.locator('#conversation-start').click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-case-select')).toBeDisabled();
  await page.evaluate(()=>window.__voiceCaseTest.emit('Can you tell me what brought you here?'));
  await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  const transcript=page.getByRole('log',{name:'Conversation transcript'});
  await expect(transcript).toContainText(profile.reply);await expect(transcript).not.toContainText(profile.other);
  await page.locator('#conversation-repair').click();await expect(page.locator('#conversation-repair-card')).toBeVisible();
  await expect(page.locator('#conversation-repair-heard')).toHaveText(profile.reply);
  await page.locator('#conversation-repair-continue').click();await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.locator('#conversation-bookmark').click();await endEncounter(page);
  await expect(page.locator('#conversation-bookmark-retry-1')).toBeEnabled();
  const original=await transcript.textContent();await page.locator('#conversation-bookmark-retry-1').click();
  await expect(page.locator('#retry-status')).toHaveText(/Listening — your alternative/);
  await expect(page.locator('#conversation-case-select')).toBeDisabled();
  expect(await transcript.textContent()).toBe(original);
  expect(network.requests.filter(item=>item.path==='/api/dana/session')).toEqual([{path:'/api/dana/session',method:'POST',body:{caseId:profile.id}}]);
  expect(network.requests.filter(item=>item.path.endsWith('/retry'))[0].body).toEqual({turnId:1});
  expect(network.requests.filter(item=>item.path==='/api/dana/turn').every(item=>item.body.sessionId===SESSION||item.body.sessionId===CHILD)).toBe(true);
  expect(network.external).toEqual([]);
  await page.locator('#retry-stop').click();await page.locator('#conversation-clear').click();
  await expect(page).toHaveURL(new RegExp(`case=${profile.id}`));
  await expect(page.locator('#conversation-case-select')).toHaveValue(profile.id);
  expect(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length}))).toEqual({local:0,session:0});
});

test('the chooser navigates before start and an invalid URL case never contacts the API',async({page})=>{
  const profile=CASES[0],{network}=await openCase(page,profile);
  await page.locator('#conversation-case-select').selectOption(CASES[1].id);
  await expect(page).toHaveURL(new RegExp(`case=${CASES[1].id}`));
  const apiBeforeInvalid=network.requests.length;
  await page.goto('/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1&case=not-a-reviewed-case');
  await expect(page.locator('#conversation-case-error')).toBeVisible();
  await expect(page.locator('#conversation-start')).toHaveCount(0);
  expect(network.requests).toHaveLength(apiBeforeInvalid);
});

test('a missing required opening recording denies Start without a device fallback or API session',async({page})=>{
  const profile=CASES[2],{network}=await openCase(page,profile,{missingOpening:true});
  await expect(page.locator('#dana-recordings-status')).toContainText(/opening recording.*not available/i);
  await expect(page.locator('#conversation-start')).toBeDisabled();
  await expect(page.locator('#dana-audio-source')).toHaveValue('live');
  await expect(page.locator('#dana-device-voices')).toBeHidden();
  expect(network.requests.filter(item=>item.path==='/api/dana/session')).toEqual([]);
});


for(const profile of [DANA,...CASES])test(`${profile.name} has a complete MD or DO station with chart, closure, exact reflection, and separate handoff`,async({page})=>{
  const {network}=await openCase(page,profile);
  const station=page.locator('#conversation-station');
  await expect(station.getByRole('heading',{name:'Before you enter',exact:true})).toBeVisible();
  await expect(station.locator('[data-station="door-note"]')).toContainText(profile.name);
  await expect(station).toContainText('MD or DO');
  const chart=station.locator('[data-station="chart"]');
  await chart.getByText('Request available chart information',{exact:true}).click();
  const card=chart.locator('.station-inset').first();
  await expect(card.locator('p').first()).toBeHidden();
  await card.getByRole('button').click();
  await expect(card.locator('p').first()).toBeVisible();
  await expect(card.getByRole('button')).toBeDisabled();
  expect(network.requests.filter(item=>item.path==='/api/dana/turn')).toHaveLength(0);
  await page.locator('#conversation-start').click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  const question='I am a medical student working with your team. What would you most want us to understand today?';
  await page.evaluate(text=>window.__voiceCaseTest.emit(text),question);
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');
  await expect(page.locator('#conversation-log')).toContainText(profile.reply);
  await page.locator('#conversation-end').click();
  const closure=page.getByRole('dialog',{name:'Close the visit with the patient'});
  await expect(closure).toBeVisible();
  expect(await page.evaluate(()=>window.__voiceCaseTest.recognizers.filter(item=>item.active).length)).toBe(0);
  await closure.getByRole('button',{name:'Finish visit and give handoff',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Present to your attending',exact:true})).toBeVisible();
  await expect(page.locator('[data-station="selected-quote"]')).toHaveText(question);
  await expect(page.locator('[data-station="completed-replies"]')).toContainText(profile.reply);
  const perspective=page.getByRole('button',{name:'Explore possible patient perspectives',exact:true});
  await expect(perspective).toBeDisabled();
  await page.getByLabel('What were you trying to convey, and how might it have landed?',{exact:true}).fill('I wanted to explain my role and leave room for the patient to set the agenda.');
  await perspective.click();
  await expect(page.locator('[data-station="perspectives"]')).toContainText(profile.name+'’s possible perspective');
  await expect(page.locator('[data-station="perspectives"]')).toContainText('Possible interpretations, not the patient’s proven thoughts.');
  const turnsBefore=network.requests.filter(item=>item.path==='/api/dana/turn').length,transcript=await page.locator('#conversation-log').textContent();
  await page.getByRole('button',{name:'Dictate presentation',exact:true}).click();
  const handoff='I met a patient whose priorities need to guide the interview. I would verify the missing history with my supervising team.';
  await page.evaluate(text=>window.__voiceCaseTest.emit(text),handoff);
  await expect(page.getByLabel('Your presentation to the attending',{exact:true})).toHaveValue(handoff);
  await page.getByRole('button',{name:'Stop dictation',exact:true}).click();
  expect(network.requests.filter(item=>item.path==='/api/dana/turn')).toHaveLength(turnsBefore);
  expect(await page.locator('#conversation-log').textContent()).toBe(transcript);
  expect(await page.evaluate(()=>window.__voiceCaseTest.recognizers.filter(item=>item.active).length)).toBe(0);
  expect(network.external).toEqual([]);
});
