import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createFamilyServer} from '../family-live-server.mjs';
import {speechProfile} from '../conversation-speech-profiles.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const audio=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(120)]);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function until(check){for(let n=0;n<80&&!check();n++)await pause(2);assert.ok(check(),'expected asynchronous work');}
function provider(overrides={}){
  const calls={reply:[],speech:[]};
  return{configured:true,calls,async reply(args){calls.reply.push(args);return 'I would like us to understand each other.';},async speak(args){calls.speech.push(args);return audio;},...overrides};
}
async function fixture(t,options={}){
  const fake=options.provider||provider(),server=createFamilyServer({...options,provider:fake});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));});
  const request=(route,body,extra={})=>fetch(base+route,{method:'POST',...extra,headers:{Origin:base,'Content-Type':'application/json',...extra.headers},body:JSON.stringify(body)});
  const session=async()=>{const res=await request('/api/family/session',{});assert.equal(res.status,201);return res.json();};
  return{base,server,provider:fake,request,session};
}
async function events(response){assert.equal(response.status,200);return(await response.text()).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));}
function input(room,extra={}){return{sessionId:room.sessionId,turnId:room.turnCount+1,text:'What would you most like us to understand?',targetRoleId:room.channel==='public'?'morgan':room.channel.split('-')[0],channel:room.channel,...extra};}
function segments(stream){return stream.filter(event=>event.type==='segment').map(event=>event.segment);}
function complete(stream){return stream.find(event=>event.type==='complete');}

for(const quotes of [['“','”'],['"','"']])for(const position of ['lead','tail'])test('quoted sentence '+position+' uses complete-reply validation '+quotes.join(''),async t=>{
  const quotation=quotes[0]+'I care about you, but I cannot be your monitor.'+quotes[1];
  const plain='I want to find a way to support Morgan.';
  const lead=position==='lead'?quotation:plain,full=position==='lead'?quotation+' '+plain:plain+' '+quotation;
  const final=deferred();let seen=false;
  const fake=provider({replyStream(args){this.calls.reply.push(args);seen=true;args.onLead(lead);return final.promise;}});
  const f=await fixture(t,{provider:fake}),room=await f.session();
  const pending=f.request('/api/family/turn',input(room,{targetRoleId:'maya'}));await until(()=>seen);
  if(position==='lead')assert.equal(fake.calls.speech.length,0,'a quoted opening waits for full validation');
  final.resolve(full);const stream=await events(await pending);
  assert.ok(complete(stream),'the valid complete reply must not fail at a sentence boundary');
  assert.equal(segments(stream).map(p=>p.text).join(''),full);
  await hear(f,room,stream);assert.equal(fake.calls.reply.length,1);
  assert.equal(fake.calls.speech.length,position==='lead'?1:2,'no duplicate request to repair a fragment');
});

for(const finalMode of ['whole-quote','wrong-prefix','duplicate-prefix'])test('held quoted lead keeps rejection boundary: '+finalMode,async t=>{
  const quoted='“I care about you, but I cannot be your monitor.”';
  const fake=provider({async replyStream(args){args.onLead(quoted);if(finalMode==='duplicate-prefix')args.onLead(quoted);return finalMode==='wrong-prefix'?'This reply does not match the prepared opening.':quoted;}});
  const f=await fixture(t,{provider:fake}),room=await f.session();
  const stream=await events(await f.request('/api/family/turn',input(room,{targetRoleId:'maya'})));
  assert.equal(complete(stream),undefined);assert.equal(segments(stream).length,0);assert.equal(fake.calls.speech.length,0);
});

for(const streaming of [true,false])for(const opening of ['That makes sense to me.','Yes, I agree.'])test('public audience metadata is removed once after complete validation, stream='+streaming+' '+opening,async t=>{
  const lead='[Shared conversation] '+opening,full=lead+' I want us to be clear about what stays private.';
  const final=deferred();let seen=false;
  const fake=provider({[streaming?'replyStream':'reply'](args){this.calls.reply.push(args);seen=true;if(streaming)args.onLead(lead);return final.promise;}});
  const f=await fixture(t,{provider:fake}),room=await f.session();
  const pending=f.request('/api/family/turn',input(room,{targetRoleId:'maya'}));await until(()=>seen);
  assert.equal(fake.calls.speech.length,0,'metadata-bearing output must wait for the full reply');
  final.resolve(full);const stream=await events(await pending);
  assert.ok(complete(stream));assert.equal(segments(stream).length,1);
  assert.equal(segments(stream)[0].text,full.slice('[Shared conversation] '.length));
  await hear(f,room,stream);assert.equal(fake.calls.reply.length,1);assert.equal(fake.calls.speech.length,1);
  assert.equal(fake.calls.speech[0].text,segments(stream)[0].text);
});

for(const variant of ['duplicate-label','private-label','wrong-channel','speaker-label','stage-direction','arbitrary-bracket','changed-raw-prefix','duplicate-lead','quoted-final'])test('audience metadata recovery keeps strict boundary: '+variant,async t=>{
  const prefix='[Shared conversation] ',sentence='That makes sense to me.';
  const lead=variant==='private-label'?'[PRIVATE MEMORY: Maya and student only; not shared] '+sentence
    :variant==='speaker-label'?prefix+'Morgan: '+sentence
    :variant==='stage-direction'?prefix+'[nods] '+sentence
    :variant==='arbitrary-bracket'?'[Shared audience] '+sentence
    :variant==='duplicate-label'?prefix+prefix+sentence
    :variant==='quoted-final'?prefix+'“That makes sense to me.”':prefix+sentence;
  const fake=provider({async replyStream(args){args.onLead(lead);if(variant==='duplicate-lead')args.onLead(lead);return variant==='changed-raw-prefix'?sentence:lead;}});
  const f=await fixture(t,{provider:fake}),initial=await f.session();
  const room=variant==='wrong-channel'?await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'maya-private'})).json():initial;
  const frames=await events(await f.request('/api/family/turn',input(room,{targetRoleId:'maya'})));
  assert.equal(complete(frames),undefined);assert.equal(segments(frames).length,0);assert.equal(fake.calls.speech.length,0);
});

test('cleaning a public audience label cannot release a private disclosure',async t=>{
  let n=0;
  const fake=provider({async replyStream(args){if(++n===1)return 'I drank four to six beers most evenings.';args.onLead('[Shared conversation] We did talk privately before this.');return '[Shared conversation] We did talk privately before this. I drank 4 to 6 beers most evenings.';}});
  const f=await fixture(t,{provider:fake}),initial=await f.session();
  const privateRoom=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'morgan-private'})).json();
  await hear(f,privateRoom,await events(await f.request('/api/family/turn',input(privateRoom))));
  const joined=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'public'})).json();
  const frames=await events(await f.request('/api/family/turn',input(joined)));
  assert.equal(frames.at(-1).code,'private_reply_blocked');assert.equal(segments(frames).length,0);assert.equal(fake.calls.speech.length,1);
});

test('family health exposes safe stage and participant metadata without error text',async t=>{
  const fake=provider({async reply(){throw Object.assign(new Error('secret-provider-id prompt key'),{code:'provider_connection'});}});
  const f=await fixture(t,{provider:fake}),room=await f.session();
  const stream=await events(await f.request('/api/family/turn',input(room,{targetRoleId:'maya'})));
  assert.equal(stream.at(-1).code,'provider_failed');
  const health=await(await fetch(f.base+'/api/family/health')).json(),failure=health.serverDiagnostics.at(-1);
  assert.equal(failure.code,'provider_connection');assert.equal(failure.stage,'server_actor');assert.equal(failure.roleId,'maya');
  assert.equal(health.providerDiagnostics,null);assert.doesNotMatch(JSON.stringify(health),/secret-provider-id|prompt key|sessionId|stack/);
});
async function hear(f,room,stream,status='played'){
  const parts=segments(stream);for(const part of parts){const a=await fetch(f.base+part.audioUrl);assert.equal(a.status,200);await a.arrayBuffer();}
  const result=await f.request('/api/family/receipt',{sessionId:room.sessionId,groupId:complete(stream).groupId,completedSegmentIds:parts.map(part=>part.id),status});
  assert.equal(result.status,200);return result.json();
}

test('family health is public metadata and starting has no paid opening',async t=>{
  const f=await fixture(t),health=await(await fetch(f.base+'/api/family/health')).json(),room=await f.session();
  assert.equal(health.localOnly,true);assert.deepEqual(health.participants.map(p=>p.id),['morgan','maya']);
  assert.deepEqual(health.participants.map(p=>p.voice),['marin','coral']);
  assert.ok(health.caseId&&health.caseHash);assert.equal(health.limits.turns,10);
  assert.doesNotMatch(JSON.stringify(health),/privateFacts|privateConcerns|ordinaryFacts/);
  assert.match(room.sessionId,/^[A-Za-z0-9_-]{32}$/);assert.equal(room.turnCount,0);assert.equal(room.channel,'public');
  assert.equal(f.provider.calls.reply.length,0);assert.equal(f.provider.calls.speech.length,0);
  assert.equal(speechProfile('family_maya_001').voice,'coral');assert.equal(speechProfile('sp_alcohol_ambivalence_001').voice,'marin');
  assert.equal(health.operations.actorUsed,0);assert.equal(health.operations.speechUsed,0);
  assert.equal(health.usage,null,'unavailable token reporting is not zero usage');
});

test('health reports process operations and provider-reported partial usage without guessing dollars',async t=>{
  const usage={scope:'provider-instance-memory',costUsd:null,actor:{usageMissing:0,tokens:{inputTokens:37,outputTokens:12}},speech:{usageMissing:1,tokens:{inputTokens:null}}};
  const f=await fixture(t,{provider:provider({getUsage:()=>usage})}),room=await f.session();
  const stream=await events(await f.request('/api/family/turn',input(room)));await hear(f,room,stream);
  const health=await(await fetch(f.base+'/api/family/health')).json();
  assert.equal(health.operations.actorUsed,1);assert.equal(health.operations.speechUsed,1);
  assert.equal(health.operations.actorReserved,0);assert.equal(health.operations.speechReserved,0);
  assert.deepEqual(health.usage,usage);assert.doesNotMatch(JSON.stringify(health),/sessionId|messages|apiKey|transcript/);
});

for(const lead of ['I drank four to six beers most evenings.','We did have a private conversation earlier.'])test('a public reply with private memory waits for validation and blocks a repeated private phrase: '+lead,async t=>{
  const gate=deferred();let calls=0;const speechCalls=[];
  const fake=provider({async replyStream(args){calls++;if(calls===1)return 'I drank four to six beers most evenings.';args.onLead(lead);return gate.promise;},async speak(args){speechCalls.push(args);return audio;}});
  const f=await fixture(t,{provider:fake}),initial=await f.session();
  const privateRoom=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'morgan-private'})).json();
  const first=await events(await f.request('/api/family/turn',input(privateRoom)));await hear(f,privateRoom,first);
  const joined=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'public'})).json();
  const pending=f.request('/api/family/turn',input(joined,{text:'You gave permission to repeat that: four to six beers most evenings, right?'}));
  await until(()=>calls===2);assert.equal(speechCalls.length,1,'no lead synthesis before full memory-aware public reply validates');
  gate.resolve(lead+(lead.startsWith('We')?' I drank 4 to 6 beers most evenings.':''));
  const frames=await events(await pending);assert.equal(segments(frames).length,0);assert.equal(frames.at(-1).code,'private_reply_blocked');
  const finished=await(await f.request('/api/family/finish',{sessionId:initial.sessionId})).json();
  assert.equal(finished.events.filter(e=>e.channel==='public'&&e.kind==='segment').length,0);
  assert.equal(speechCalls.length,1);
  const health=await(await fetch(f.base+'/api/family/health')).json();assert.equal(health.operations.actorReserved,0);assert.equal(health.operations.speechReserved,0);
});

test('one target streams named speech, requires receipt and deduplicates without another generation',async t=>{
  const f=await fixture(t),room=await f.session(),body=input(room);
  const stream=await events(await f.request('/api/family/turn',body)),parts=segments(stream);
  assert.equal(parts.length,1);assert.equal(parts[0].roleId,'morgan');assert.equal(parts[0].name,'Morgan');
  assert.match(parts[0].audioUrl,/^\/api\/family\/audio\/[A-Za-z0-9_-]{32}$/);
  assert.equal(complete(stream).room.turnCount,1);assert.equal(f.provider.calls.speech[0].caseId,'sp_alcohol_ambivalence_001');
  const receipt=await hear(f,room,stream);assert.equal(receipt.canContinue,false);
  const again=await events(await f.request('/api/family/turn',body));assert.deepEqual(segments(again),parts);
  assert.equal(f.provider.calls.reply.length,1);assert.equal(f.provider.calls.speech.length,1);
  assert.equal((await f.request('/api/family/turn',{...body,targetRoleId:'maya'})).status,409);
});

test('both keeps Maya queued until Morgan is heard, then includes only completed public speech',async t=>{
  const f=await fixture(t),room=await f.session(),stream=await events(await f.request('/api/family/turn',input(room,{targetRoleId:'both'})));
  const groupId=complete(stream).groupId,first=segments(stream);
  assert.equal(f.provider.calls.reply.length,1);assert.deepEqual(complete(stream).remainingRoles,['maya']);
  assert.equal((await f.request('/api/family/continue',{sessionId:room.sessionId,groupId})).status,409);
  assert.equal((await f.request('/api/family/channel',{sessionId:room.sessionId,channel:'maya-private'})).status,409);
  assert.equal((await hear(f,room,stream)).canContinue,true);
  const second=await events(await f.request('/api/family/continue',{sessionId:room.sessionId,groupId}));
  assert.equal(segments(second)[0].roleId,'maya');assert.equal(f.provider.calls.speech[1].caseId,'family_maya_001');
  assert.ok(JSON.stringify(f.provider.calls.reply[1].messages).includes(first[0].text));
  for(const part of segments(second))await(await fetch(f.base+part.audioUrl)).arrayBuffer();
  const receipt=await f.request('/api/family/receipt',{sessionId:room.sessionId,groupId,completedSegmentIds:[...first,...segments(second)].map(part=>part.id),status:'played'});
  assert.equal(receipt.status,200);assert.equal((await receipt.json()).canContinue,false);
  assert.equal((await f.request('/api/family/continue',{sessionId:room.sessionId,groupId})).status,409);
  assert.equal(f.provider.calls.reply.length,2);
});

test('a both turn reserves all operations before invoking either participant',async t=>{
  for(const limits of [{maxProviderTurns:1},{maxSpeechOperations:3}]){
    const f=await fixture(t,limits),room=await f.session();
    const res=await f.request('/api/family/turn',input(room,{targetRoleId:'both'}));assert.equal(res.status,429);
    assert.equal(f.provider.calls.reply.length,0);assert.equal(f.provider.calls.speech.length,0);
    const single=await events(await f.request('/api/family/turn',input(room)));assert.equal(complete(single).turnId,1);
  }
});

test('cancellation removes the second speaker and keeps only verified completed prefix',async t=>{
  const f=await fixture(t),room=await f.session(),stream=await events(await f.request('/api/family/turn',input(room,{targetRoleId:'both'})));
  const groupId=complete(stream).groupId,part=segments(stream)[0];await(await fetch(f.base+part.audioUrl)).arrayBuffer();
  const cancellation={sessionId:room.sessionId,groupId,completedSegmentIds:[part.id]};
  assert.equal((await f.request('/api/family/cancel',cancellation)).status,200);
  assert.equal((await f.request('/api/family/cancel',cancellation)).status,200);
  assert.equal((await f.request('/api/family/continue',{sessionId:room.sessionId,groupId})).status,409);
  const next=await events(await f.request('/api/family/turn',input(room,{turnId:2,targetRoleId:'maya',text:'What did you understand from that?'})));
  assert.ok(complete(next));assert.equal(f.provider.calls.reply.length,2);
  assert.ok(JSON.stringify(f.provider.calls.reply[1].messages).includes(part.text));
});

test('substantive lead is issued and audio streams before final text, but premature receipts cannot establish history',async t=>{
  const final=deferred(),audioEnd=deferred();
  const lead='I want the choice to stay with me.',tail=' I can still hear what you are worried about.';
  const fake=provider({async replyStream(args){this.calls.reply.push(args);args.onLead(lead);return final.promise;},async speakStream(args){this.calls.speech.push(args);args.onChunk(audio);if(args.text===lead)await audioEnd.promise;}});
  const f=await fixture(t,{provider:fake}),room=await f.session();
  const response=await f.request('/api/family/turn',input(room)),reader=response.body.getReader();
  const first=JSON.parse(new TextDecoder().decode((await reader.read()).value).trim());assert.equal(first.type,'segment');assert.equal(first.segment.text,lead);
  const audioResponse=await fetch(f.base+first.segment.audioUrl),audioReader=audioResponse.body.getReader();
  assert.ok((await audioReader.read()).value.length,'audio bytes are available before final actor text');
  const receipt={sessionId:room.sessionId,groupId:first.groupId,completedSegmentIds:[first.segment.id],status:'played'};
  assert.equal((await f.request('/api/family/receipt',receipt)).status,409);
  final.resolve(lead+tail);let remaining='';for(;;){const chunk=await reader.read();if(chunk.done)break;remaining+=new TextDecoder().decode(chunk.value);}
  const later=remaining.trim().split('\n').map(line=>JSON.parse(line));assert.equal(later[0].segment.text,tail);assert.ok(later.some(e=>e.type==='complete'));
  assert.equal((await f.request('/api/family/receipt',{...receipt,completedSegmentIds:[first.segment.id,later[0].segment.id]})).status,409,'audio must also finish');
  audioEnd.resolve();for(;;){if((await audioReader.read()).done)break;}
  await(await fetch(f.base+later[0].segment.audioUrl)).arrayBuffer();
  assert.equal((await f.request('/api/family/receipt',{...receipt,completedSegmentIds:[first.segment.id,later[0].segment.id]})).status,200);
});

test('final actor mismatch invalidates an issued lead and cannot be acknowledged or continued',async t=>{
  const final=deferred(),fake=provider({async replyStream(args){this.calls.reply.push(args);args.onLead('I want the choice to stay with me.');return final.promise;}});
  const f=await fixture(t,{provider:fake}),room=await f.session(),response=await f.request('/api/family/turn',input(room,{targetRoleId:'both'}));
  const reader=response.body.getReader(),first=JSON.parse(new TextDecoder().decode((await reader.read()).value).trim());
  await(await fetch(f.base+first.segment.audioUrl)).arrayBuffer();final.resolve('This completely changes the previous sentence.');
  let text='';for(;;){const chunk=await reader.read();if(chunk.done)break;text+=new TextDecoder().decode(chunk.value);}
  assert.match(text,/"type":"error"/);assert.doesNotMatch(text,/"type":"complete"/);
  assert.equal((await f.request('/api/family/receipt',{sessionId:room.sessionId,groupId:first.groupId,completedSegmentIds:[first.segment.id],status:'played'})).status,409);
  assert.equal((await f.request('/api/family/continue',{sessionId:room.sessionId,groupId:first.groupId})).status,409);
  const finished=await(await f.request('/api/family/finish',{sessionId:room.sessionId})).json();assert.deepEqual(finished.retryEligibleTurnIds,[]);
  assert.equal(finished.events.find(e=>e.kind==='segment').status,'interrupted');assert.equal(fake.calls.reply.length,1);
});

test('receipt rejects skips, duplicates, unknown IDs and incomplete claimed playback without losing queue order',async t=>{
  const lead='I want the choice to stay with me.',fake=provider({async replyStream(args){args.onLead(lead);return lead+' I would like to discuss the options.';}});
  const f=await fixture(t,{provider:fake}),room=await f.session(),stream=await events(await f.request('/api/family/turn',input(room)));
  const parts=segments(stream),groupId=complete(stream).groupId;assert.equal(parts.length,2);
  for(const part of parts)await(await fetch(f.base+part.audioUrl)).arrayBuffer();
  for(const ids of [[parts[1].id],[parts[0].id,parts[0].id],['not-real'],[parts[0].id,parts[1].id,'extra']])assert.equal((await f.request('/api/family/receipt',{sessionId:room.sessionId,groupId,completedSegmentIds:ids,status:'played'})).status,400);
  assert.equal((await f.request('/api/family/receipt',{sessionId:room.sessionId,groupId,completedSegmentIds:[parts[0].id],status:'played'})).status,409);
  const interrupted=await f.request('/api/family/receipt',{sessionId:room.sessionId,groupId,completedSegmentIds:[parts[0].id],status:'interrupted'});assert.equal(interrupted.status,200);
  const result=await interrupted.json();assert.deepEqual(result.room.events.filter(e=>e.kind==='segment').map(e=>e.status),['completed','interrupted']);
});

test('private channels never enter the other role context and retry restores original target and channel only',async t=>{
  const f=await fixture(t),initial=await f.session();
  const room=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'morgan-private'})).json();
  assert.equal(room.channel,'morgan-private');
  assert.equal((await f.request('/api/family/turn',input(room,{targetRoleId:'maya'}))).status,400);
  const privateText='I want to ask about something only in this private check-in.';
  const privateStream=await events(await f.request('/api/family/turn',input(room,{text:privateText})));await hear(f,room,privateStream);
  const joined=await(await f.request('/api/family/channel',{sessionId:room.sessionId,channel:'public'})).json();
  const publicStream=await events(await f.request('/api/family/turn',input(joined,{targetRoleId:'maya',text:'What is important to you?'})));await hear(f,joined,publicStream);
  assert.ok(!JSON.stringify(f.provider.calls.reply[1]).includes(privateText));
  assert.ok(!JSON.stringify(f.provider.calls.reply[1]).includes('four to six beers'));
  const finished=await(await f.request('/api/family/finish',{sessionId:room.sessionId})).json(),original=JSON.stringify(finished);
  const retryResponse=await f.request('/api/family/retry',{sessionId:room.sessionId,turnId:1});assert.equal(retryResponse.status,201);const child=await retryResponse.json();
  assert.equal(child.channel,'morgan-private');assert.equal(child.targetRoleId,'morgan');assert.equal(child.maxTurns,1);assert.equal(child.turnCount,0);
  assert.ok(!JSON.stringify(child.events).includes(privateText));assert.ok(!JSON.stringify(child.events).includes('What is important to you?'));
  assert.equal((await f.request('/api/family/channel',{sessionId:child.sessionId,channel:'public'})).status,409);
  assert.equal((await f.request('/api/family/turn',input(child,{targetRoleId:'maya'}))).status,400);
  const same=await(await f.request('/api/family/retry',{sessionId:room.sessionId,turnId:1})).json();assert.equal(same.sessionId,child.sessionId);
  assert.equal((await f.request('/api/family/retry',{sessionId:room.sessionId,turnId:2})).status,409);
  const alternative=await events(await f.request('/api/family/turn',input(child,{text:'One different private question.'})));await hear(f,child,alternative);
  assert.equal((await f.request('/api/family/turn',input(child,{turnId:2}))).status,429);
  await f.request('/api/family/finish',{sessionId:child.sessionId});
  assert.equal((await f.request('/api/family/retry',{sessionId:child.sessionId,turnId:1})).status,409);
  assert.equal(JSON.stringify(await(await f.request('/api/family/finish',{sessionId:room.sessionId})).json()),original);
  assert.equal((await fetch(f.base+'/api/family/session/'+room.sessionId,{method:'DELETE',headers:{Origin:f.base}})).status,200);
  assert.equal((await f.request('/api/family/finish',{sessionId:child.sessionId})).status,404);
});

test('cancelling while generation is pending stops provider signals and prevents late speech or a queued role',async t=>{
  const final=deferred(),fake=provider({reply(args){this.calls.reply.push(args);return final.promise;}});
  const f=await fixture(t,{provider:fake}),room=await f.session(),pending=f.request('/api/family/turn',input(room,{targetRoleId:'both'}));
  await until(()=>fake.calls.reply.length===1);
  const stopped=await f.request('/api/family/cancel',{sessionId:room.sessionId});assert.equal(stopped.status,200);assert.equal(fake.calls.reply[0].signal.aborted,true);
  const stream=await events(await pending);assert.equal(stream.at(-1).type,'error');final.resolve('This late response must not be spoken.');await pause(5);
  assert.equal(fake.calls.speech.length,0);assert.equal(fake.calls.reply.length,1);
});

test('used and uncertain actor work remains spent but unused group reservations are released on cancellation',async t=>{
  const first=deferred(),fake=provider({reply(args){this.calls.reply.push(args);return this.calls.reply.length===1?first.promise:Promise.resolve('I still want the choice to be mine.');}});
  const f=await fixture(t,{provider:fake,maxProviderTurns:2,maxSpeechOperations:4}),room=await f.session();
  const pending=f.request('/api/family/turn',input(room,{targetRoleId:'both'}));await until(()=>fake.calls.reply.length===1);
  await f.request('/api/family/cancel',{sessionId:room.sessionId});await events(await pending);
  const next=await events(await f.request('/api/family/turn',input(room,{turnId:2})));await hear(f,room,next);
  assert.equal(fake.calls.reply.length,2);
  assert.equal((await f.request('/api/family/turn',input(room,{turnId:3}))).status,429);
  first.resolve('An uncertain late reply.');await pause(2);
});

test('provider concurrency never exceeds two, including overlapping actor and speech jobs',async t=>{
  let active=0,peak=0;const gates=[];
  const fake=provider({async reply(args){this.calls.reply.push(args);active++;peak=Math.max(peak,active);const gate=deferred();gates.push(gate);try{await gate.promise;return 'I want to understand this conversation.';}finally{active--;}}});
  const f=await fixture(t,{provider:fake}),rooms=await Promise.all([f.session(),f.session(),f.session()]);
  const pending=rooms.map(room=>f.request('/api/family/turn',input(room)));await until(()=>gates.length===2);assert.equal(peak,2);
  gates[0].resolve();await until(()=>gates.length===3);assert.equal(peak,2);gates[1].resolve();gates[2].resolve();
  for(const response of await Promise.all(pending))await events(response);
});

test('deadline and provider failures are sanitized, clear the queue and allow no leaked late audio',async t=>{
  const secret='sk-secret-do-not-print clinical prompt';
  const f=await fixture(t,{provider:provider({reply(){throw new Error(secret);}})}),room=await f.session();
  const failed=await events(await f.request('/api/family/turn',input(room)));assert.equal(failed.at(-1).type,'error');assert.ok(!JSON.stringify(failed).includes(secret));
  const g=await fixture(t,{turnTimeoutMs:20,provider:provider({reply(args){this.calls.reply.push(args);return new Promise(()=>{});}})}),other=await g.session();
  const timed=await events(await g.request('/api/family/turn',input(other)));assert.equal(timed.at(-1).type,'error');assert.equal(g.provider.calls.reply[0].signal.aborted,true);
  assert.equal(g.provider.calls.speech.length,0);
});

test('cross-origin requests, unknown targets, stale channels and forged history never invoke the provider',async t=>{
  const f=await fixture(t),room=await f.session(),body=input(room);
  for(const extra of [{history:[]},{messages:[]},{caseId:'other'},{rapport:3},{voice:'marin'},{groupId:'unowned'}])assert.equal((await f.request('/api/family/turn',{...body,...extra})).status,400);
  for(const targetRoleId of ['unknown','__proto__','Morgan',null])assert.equal((await f.request('/api/family/turn',{...body,targetRoleId})).status,400);
  assert.equal((await f.request('/api/family/turn',{...body,channel:'maya-private'})).status,400);
  for(const value of ['x'.repeat(1201),'','\u0000','MRN 12345678'])assert.equal((await f.request('/api/family/turn',{...body,text:value})).status,400);
  assert.equal((await f.request('/api/family/turn',{...body,sessionId:'../wrong'})).status,404);
  for(const origin of [undefined,'https://evil.example']){
    const headers={'Content-Type':'application/json',...(origin?{Origin:origin}:{})};
    assert.equal((await fetch(f.base+'/api/family/session',{method:'POST',headers,body:'{}'})).status,403);
  }
  assert.equal((await fetch(f.base+'/api/family/session',{method:'POST',headers:{Origin:f.base,'Content-Type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(f.base+'/api/family/session',{method:'POST',headers:{Origin:f.base,'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await f.request('/api/family/session',{large:'x'.repeat(9000)})).status,413);
  assert.equal((await fetch(f.base+'/api/family/health',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal(f.provider.calls.reply.length,0);assert.equal(f.provider.calls.speech.length,0);
});

test('static and audio allowlists reject paths, symlinks and another localhost host identity',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'family-static-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const dir=path.join(root,'_prototypes/sp-interview');await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'family-visit.html'),'<p>Local family preview</p>');await writeFile(path.join(root,'secret.txt'),'private');
  await writeFile(path.join(dir,'family-information-replay.js'),'window.FamilyInformationReplay = {};');
  await symlink(path.join(root,'secret.txt'),path.join(dir,'family-visit.js'));
  const f=await fixture(t,{rootDir:root});
  const preview=await fetch(f.base+'/_prototypes/sp-interview/family-visit.html');assert.equal(preview.status,200);assert.match(await preview.text(),/Local family preview/);
  const replay=await fetch(f.base+'/_prototypes/sp-interview/family-information-replay.js');assert.equal(replay.status,200);assert.match(replay.headers.get('content-type'),/javascript/);
  for(const route of ['/secret.txt','/.env','/_prototypes/sp-interview/family-visit.js','/_prototypes/sp-interview/dana-live-server.mjs','/_prototypes/sp-interview/%2e%2e/secret.txt','/api/dana/health','/api/family/audio/invalid'])assert.equal((await fetch(f.base+route)).status,404,route);
  const hostStatus=await new Promise((resolve,reject)=>{const req=http.request(f.base+'/api/family/health',{headers:{Host:'evil.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});assert.equal(hostStatus,403);
});

test('session and lifetime limits prevent stale access and remove audio and retry children',async t=>{
  let now=0;const f=await fixture(t,{now:()=>now}),room=await f.session();
  const stream=await events(await f.request('/api/family/turn',input(room)));await hear(f,room,stream);
  await f.request('/api/family/finish',{sessionId:room.sessionId});
  const child=await(await f.request('/api/family/retry',{sessionId:room.sessionId,turnId:1})).json();
  for(let n=0;n<6;n++)await f.session();
  assert.equal((await f.request('/api/family/session',{})).status,429);
  now=30*60*1000;
  assert.equal((await f.request('/api/family/finish',{sessionId:room.sessionId})).status,404);
  assert.equal((await f.request('/api/family/finish',{sessionId:child.sessionId})).status,404);
  assert.equal((await fetch(f.base+segments(stream)[0].audioUrl)).status,404);
  assert.equal((await f.request('/api/family/session',{})).status,201);
});

test('an original visit cannot submit an eleventh learner turn',async t=>{
  const f=await fixture(t);let room=await f.session();
  for(let turn=1;turn<=10;turn++){
    const stream=await events(await f.request('/api/family/turn',input(room)));room=(await hear(f,room,stream)).room;
    assert.equal(room.turnCount,turn);
  }
  assert.ok((await f.request('/api/family/turn',input(room))).status>=400);assert.equal(f.provider.calls.reply.length,10);
});

test('concurrent duplicate requests cannot create extra actors or a second response queue',async t=>{
  const ready=deferred(),fake=provider({reply(args){this.calls.reply.push(args);return ready.promise;}}),f=await fixture(t,{provider:fake}),room=await f.session(),body=input(room,{targetRoleId:'both'});
  const first=f.request('/api/family/turn',body);await until(()=>fake.calls.reply.length===1);
  assert.equal((await f.request('/api/family/turn',body)).status,409);
  assert.equal((await f.request('/api/family/turn',{...body,text:'Changed question.'})).status,409);
  assert.equal((await f.request('/api/family/turn',{...body,turnId:2})).status,409);
  ready.resolve('I would like a say in this conversation.');await events(await first);assert.equal(fake.calls.reply.length,1);
});

test('an HTTP disconnect aborts pending provider work and cannot be replayed into a new call',async t=>{
  const fake=provider({reply(args){this.calls.reply.push(args);return new Promise(()=>{});}}),f=await fixture(t,{provider:fake}),room=await f.session(),body=input(room);
  const abort=new AbortController(),pending=f.request('/api/family/turn',body,{signal:abort.signal}).catch(()=>null);
  await until(()=>fake.calls.reply.length===1);abort.abort();await pending;await until(()=>fake.calls.reply[0].signal.aborted);
  assert.equal((await f.request('/api/family/turn',body)).status,409);assert.equal(fake.calls.speech.length,0);
});

test('failure of second speech segment cancels every unfinished segment and never starts queued Maya',async t=>{
  const lead='I would like us to understand each other.',second=deferred();
  const fake=provider({async replyStream(args){this.calls.reply.push(args);args.onLead(lead);return lead+' I do not know what to choose yet.';},async speakStream(args){this.calls.speech.push(args);args.onChunk(audio);if(args.text!==lead)await second.promise;}});
  const f=await fixture(t,{provider:fake}),room=await f.session(),stream=await events(await f.request('/api/family/turn',input(room,{targetRoleId:'both'}))),parts=segments(stream),groupId=complete(stream).groupId;
  await(await fetch(f.base+parts[0].audioUrl)).arrayBuffer();second.reject(new Error('private provider diagnostic'));await until(()=>fake.calls.speech[1].signal.aborted);
  assert.equal((await f.request('/api/family/receipt',{sessionId:room.sessionId,groupId,completedSegmentIds:parts.map(p=>p.id),status:'played'})).status,409);
  assert.equal((await f.request('/api/family/continue',{sessionId:room.sessionId,groupId})).status,409);
  assert.equal(fake.calls.reply.length,1);assert.equal((await fetch(f.base+parts[1].audioUrl)).status,409);
  const cancelled=await f.request('/api/family/cancel',{sessionId:room.sessionId,groupId,completedSegmentIds:[parts[0].id]});
  assert.equal(cancelled.status,200,'a failure must allow the native player to report its already completed first segment');
  assert.deepEqual((await cancelled.json()).events.filter(e=>e.kind==='segment').map(e=>e.status),['completed','interrupted']);
});

test('ending a room during generation clears all queued work even if the provider ignores abort',async t=>{
  const late=deferred(),fake=provider({reply(args){this.calls.reply.push(args);return late.promise;}}),f=await fixture(t,{provider:fake}),room=await f.session();
  const pending=f.request('/api/family/turn',input(room,{targetRoleId:'both'}));await until(()=>fake.calls.reply.length===1);
  const ended=await f.request('/api/family/finish',{sessionId:room.sessionId});assert.equal(ended.status,200);assert.equal((await ended.json()).status,'finished');
  await events(await pending);assert.equal(fake.calls.reply[0].signal.aborted,true);
  late.resolve('This late speech cannot become a reply.');await pause(2);assert.equal(fake.calls.speech.length,0);
  assert.equal((await f.request('/api/family/turn',input(room,{turnId:2}))).status,409);
});

test('cancellation during request-body upload prevents the older turn from starting afterward',async t=>{
  const f=await fixture(t),room=await f.session(),payload=JSON.stringify(input(room)),arrived=deferred();
  f.server.once('request',req=>{if(req.url==='/api/family/turn')arrived.resolve();});
  let request;const result=new Promise((resolve,reject)=>{
    request=http.request(f.base+'/api/family/turn',{method:'POST',headers:{Origin:f.base,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});request.on('error',reject);
    request.write(payload.slice(0,10));
  });
  await arrived.promise;assert.equal((await f.request('/api/family/cancel',{sessionId:room.sessionId})).status,200);
  request.end(payload.slice(10));assert.equal(await result,409);assert.equal(f.provider.calls.reply.length,0);
});

test('interrupting before final actor validation stops successfully while omitting a native-ended but unvalidated lead',async t=>{
  const final=deferred(),fake=provider({replyStream(args){this.calls.reply.push(args);args.onLead('I would like the choice to stay mine.');return final.promise;}});
  const f=await fixture(t,{provider:fake}),room=await f.session(),response=await f.request('/api/family/turn',input(room,{targetRoleId:'both'})),reader=response.body.getReader();
  const first=JSON.parse(new TextDecoder().decode((await reader.read()).value).trim());await(await fetch(f.base+first.segment.audioUrl)).arrayBuffer();
  const body={sessionId:room.sessionId,groupId:first.groupId,completedSegmentIds:[first.segment.id]};
  const stopped=await f.request('/api/family/cancel',body);assert.equal(stopped.status,200);
  const view=await stopped.json();assert.equal(view.events.find(e=>e.kind==='segment').status,'interrupted');assert.deepEqual(view.retryEligibleTurnIds,[]);
  assert.equal((await f.request('/api/family/cancel',body)).status,200,'the same confirmed stop remains idempotent');
  assert.equal((await f.request('/api/family/cancel',{...body,completedSegmentIds:[first.segment.id,first.segment.id]})).status,400);
  final.resolve('I would like the choice to stay mine.');await pause(2);assert.equal(fake.calls.reply.length,1);assert.equal(fake.calls.speech.length,1);
  await reader.cancel();
});

test('an unconfigured server reports unavailable and cannot start a visit',async t=>{
  const f=await fixture(t,{provider:provider({configured:false})});assert.equal((await(await fetch(f.base+'/api/family/health')).json()).configured,false);
  assert.equal((await f.request('/api/family/session',{})).status,503);assert.equal(f.provider.calls.reply.length,0);
});

test('deleting an alternative leaves an explicit closed selection, never a second child or a dangling session error',async t=>{
  const f=await fixture(t),room=await f.session();
  const first=await events(await f.request('/api/family/turn',input(room)));let current=(await hear(f,room,first)).room;
  const second=await events(await f.request('/api/family/turn',input(current)));await hear(f,room,second);
  const finished=await(await f.request('/api/family/finish',{sessionId:room.sessionId})).json();
  const child=await(await f.request('/api/family/retry',{sessionId:room.sessionId,turnId:1})).json();
  const deleted=await fetch(f.base+'/api/family/session/'+child.sessionId,{method:'DELETE',headers:{Origin:f.base}});assert.equal(deleted.status,200);
  const same=await f.request('/api/family/retry',{sessionId:room.sessionId,turnId:1});assert.equal(same.status,409);assert.equal((await same.json()).error.code,'retry_unavailable');
  const other=await f.request('/api/family/retry',{sessionId:room.sessionId,turnId:2});assert.equal(other.status,409);assert.equal((await other.json()).error.code,'retry_already_selected');
  assert.deepEqual(await(await f.request('/api/family/finish',{sessionId:room.sessionId})).json(),finished);
  assert.equal(f.provider.calls.reply.length,2,'child deletion cannot trigger another actor or recreate an opening');
  const parentDeleted=await fetch(f.base+'/api/family/session/'+room.sessionId,{method:'DELETE',headers:{Origin:f.base}});assert.equal(parentDeleted.status,200);
  assert.equal((await f.request('/api/family/finish',{sessionId:room.sessionId})).status,404);
  assert.equal((await f.request('/api/family/finish',{sessionId:child.sessionId})).status,404);
});

for(const outcome of ['cancellation','timeout','actor failure'])test(`a held public reply with private memory emits nothing on ${outcome} and releases unused reservations`,async t=>{
  const final=deferred(),lead='We did have a private conversation earlier.';
  const fake=provider({replyStream(args){
    this.calls.reply.push(args);
    if(this.calls.reply.length===1)return Promise.resolve('I drank four to six beers most evenings.');
    if(this.calls.reply.length===2){args.onLead(lead);return final.promise;}
    return Promise.resolve('I can talk about our shared next steps.');
  }});
  const f=await fixture(t,{provider:fake,maxProviderTurns:3,maxSpeechOperations:5,turnTimeoutMs:outcome==='timeout'?100:65000});
  const initial=await f.session();
  const privateRoom=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'morgan-private'})).json();
  const privateStream=await events(await f.request('/api/family/turn',input(privateRoom)));await hear(f,privateRoom,privateStream);
  const joined=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'public'})).json();
  const pending=f.request('/api/family/turn',input(joined,{targetRoleId:'both'}));
  await until(()=>fake.calls.reply.length===2);
  assert.equal(fake.calls.speech.length,1,'the private-memory lead must not start public speech');
  if(outcome==='cancellation')assert.equal((await f.request('/api/family/cancel',{sessionId:initial.sessionId})).status,200);
  if(outcome==='actor failure')final.reject(new Error('private actor diagnostic must not escape'));
  const frames=await events(await pending);
  assert.equal(segments(frames).length,0);assert.equal(complete(frames),undefined);assert.equal(frames.at(-1).type,'error');
  assert.doesNotMatch(JSON.stringify(frames),/private actor diagnostic|We did have|audioUrl/);
  assert.equal(fake.calls.reply[1].signal.aborted,true);assert.equal(fake.calls.speech.length,1);
  const stopped=await(await f.request('/api/family/cancel',{sessionId:initial.sessionId})).json();
  assert.equal(stopped.events.filter(event=>event.channel==='public'&&event.kind==='segment').length,0);
  assert.deepEqual(stopped.retryEligibleTurnIds,[1]);
  const groupId=stopped.events.find(event=>event.kind==='learner'&&event.turnId===2).groupId;
  assert.equal((await f.request('/api/family/continue',{sessionId:initial.sessionId,groupId})).status,409);
  assert.equal(fake.calls.reply.length,2,'Maya cannot start from the cancelled or failed public group');
  let health=await(await fetch(f.base+'/api/family/health')).json();
  assert.equal(health.operations.actorUsed,2);assert.equal(health.operations.speechUsed,1);
  assert.equal(health.operations.actorReserved,0);assert.equal(health.operations.speechReserved,0);
  if(outcome!=='actor failure'){
    assert.equal(health.operations.activeCalls,1,'an abort-ignoring actor still occupies its provider slot');
    final.resolve(lead+' I drank four to six beers most evenings.');
  }
  health=await(await fetch(f.base+'/api/family/health')).json();
  assert.equal(health.operations.activeCalls,0);assert.equal(fake.calls.speech.length,1,'late actor completion must not resurrect speech');
  const recovered=await events(await f.request('/api/family/turn',input(stopped,{targetRoleId:'morgan'})));
  await hear(f,stopped,recovered);
  assert.equal(fake.calls.reply.length,3);assert.equal(fake.calls.speech.length,2,'released reservations allow one new authorized response');
  assert.equal((await f.request('/api/family/turn',input(stopped,{turnId:4,targetRoleId:'morgan'}))).status,429,'used actor work remains spent');
});

test('a blocked private disclosure in a both turn never reaches the queued actor or a later public projection',async t=>{
  const privateReply='I drank four to six beers most evenings.';
  const fake=provider({async replyStream(args){
    this.calls.reply.push(args);
    if(this.calls.reply.length===1)return privateReply;
    if(this.calls.reply.length===2){args.onLead('We did have a private conversation earlier.');return 'We did have a private conversation earlier. '+privateReply;}
    return 'I can offer a planned weekly call.';
  }});
  const f=await fixture(t,{provider:fake,maxProviderTurns:3,maxSpeechOperations:5}),initial=await f.session();
  const privateRoom=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'morgan-private'})).json();
  const first=await events(await f.request('/api/family/turn',input(privateRoom)));await hear(f,privateRoom,first);
  const joined=await(await f.request('/api/family/channel',{sessionId:initial.sessionId,channel:'public'})).json();
  const blocked=await events(await f.request('/api/family/turn',input(joined,{targetRoleId:'both',text:'What next step would each of you consider?'})));
  assert.equal(blocked.at(-1).code,'private_reply_blocked');assert.equal(segments(blocked).length,0);assert.equal(complete(blocked),undefined);
  assert.equal(fake.calls.reply.length,2);assert.equal(fake.calls.speech.length,1);
  const stopped=await(await f.request('/api/family/cancel',{sessionId:initial.sessionId})).json();
  const groupId=stopped.events.find(event=>event.kind==='learner'&&event.turnId===2).groupId;
  assert.equal((await f.request('/api/family/continue',{sessionId:initial.sessionId,groupId})).status,409);
  assert.equal(fake.calls.reply.length,2,'no queued Maya request after the blocked Morgan response');
  assert.equal(stopped.events.filter(event=>event.channel==='public'&&event.kind==='segment').length,0);
  const health=await(await fetch(f.base+'/api/family/health')).json();
  assert.equal(health.operations.actorReserved,0);assert.equal(health.operations.speechReserved,0);assert.equal(health.operations.speechUsed,1);
  const next=await events(await f.request('/api/family/turn',input(stopped,{targetRoleId:'maya',text:'Maya, what support could you offer?'})));
  await hear(f,stopped,next);
  assert.equal(fake.calls.reply.length,3);assert.match(fake.calls.reply[2].system,/You are Maya/);
  assert.doesNotMatch(JSON.stringify(fake.calls.reply[2].messages),/four to six beers|We did have a private conversation/);
  assert.equal(segments(next)[0].roleId,'maya');
});
