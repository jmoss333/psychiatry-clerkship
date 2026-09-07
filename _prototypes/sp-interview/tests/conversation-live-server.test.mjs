import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createDanaServer} from '../dana-live-server.mjs';

function fakeProvider(overrides={}) {
  const calls={reply:[],speak:[]};
  return {calls,async reply(input){calls.reply.push(input);return 'I have been feeling tired.';},async speak(input){calls.speak.push(input);return Buffer.from('ID3-test-audio');},...overrides};
}
async function fixture(t, options={}) {
  const provider=options.provider || fakeProvider();
  const server=createDanaServer({...options,provider});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));});
  const request=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...extra.headers},body:JSON.stringify(body),...extra});
  const session=async()=>{const response=await request('/api/dana/session',{});assert.equal(response.status,201);return response.json();};
  return {base,server,provider,request,session};
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

for(const quotes of [['“','”'],['"','"']])test('Dana holds a quoted lead and plays the valid complete reply '+quotes.join(''),async t=>{
  const lead=quotes[0]+'I do not know where to start.'+quotes[1],reply=lead+' That is how I feel today.';
  let release,started;const ready=new Promise(resolve=>started=resolve),final=new Promise(resolve=>release=resolve);
  const provider=fakeProvider({async replyStream(args){this.calls.reply.push(args);started();args.onLead(lead);return final;}});
  const f=await fixture(t,{provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'What has it been like?'});await ready;
  assert.equal(provider.calls.speak.length,0);release(reply);const response=await pending;
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.reply,reply);assert.equal(body.audioSegments.length,1);
  assert.equal(provider.calls.reply.length,1);assert.equal(provider.calls.speak.length,1);
});

test('Dana health retains safe failure metadata while response stays generic',async t=>{
  const f=await fixture(t,{provider:fakeProvider({async reply(){throw Object.assign(new Error('private provider detail'),{code:'provider_connection'});}})}),s=await f.session();
  const result=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'});assert.equal(result.status,502);
  const health=await(await fetch(f.base+'/api/dana/health')).json();assert.equal(health.serverDiagnostics.at(-1).code,'provider_connection');
  assert.equal(health.serverDiagnostics.at(-1).stage,'server_actor');assert.doesNotMatch(JSON.stringify(health),/private provider detail|sessionId|stack/);
});

test('health separates counted operations, reported usage, and unavailable costs',async t=>{
  const usage={scope:'provider-instance-memory',costUsd:null,actor:{usageReported:1,tokens:{inputTokens:31,outputTokens:8}},speech:{usageMissing:1,tokens:{inputTokens:null}}};
  const f=await fixture(t,{provider:fakeProvider({getUsage:()=>usage})}),room=await f.session();
  const result=await f.request('/api/dana/turn',{sessionId:room.sessionId,turnId:1,text:'How are you?'});assert.equal(result.status,200);
  const health=await(await fetch(f.base+'/api/dana/health')).json();
  assert.equal(health.operations.actorUsed,1);assert.equal(health.operations.speechUsed,1);assert.deepEqual(health.usage,usage);
  assert.doesNotMatch(JSON.stringify(health),/sessionId|apiKey|transcript|messages/);
});

test('local turn returns private audio, deduplicates and retains only server-owned history',async t=>{
  const f=await fixture(t), s=await f.session();
  assert.match(s.sessionId,/^[A-Za-z0-9_-]{32}$/);assert.ok(s.opening);
  const input={sessionId:s.sessionId,turnId:1,text:'How have you been sleeping?',previousPlayback:'played'};
  const a=await f.request('/api/dana/turn',input);assert.equal(a.status,200);const result=await a.json();
  const b=await f.request('/api/dana/turn',input);assert.equal(b.status,200);assert.deepEqual(await b.json(),result);
  assert.equal(f.provider.calls.reply.length,1);assert.equal(f.provider.calls.speak.length,1);
  const audio=await fetch(f.base+result.audioUrl);assert.equal(audio.status,200);assert.equal(audio.headers.get('cache-control'),'no-store');assert.equal(await audio.text(),'ID3-test-audio');
  const conflict=await f.request('/api/dana/turn',{...input,text:'A different question'});assert.equal(conflict.status,409);
  await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Can you explain?',previousPlayback:'interrupted'});
  const outbound=JSON.stringify(f.provider.calls.reply[1].messages);
  assert.ok(outbound.includes('Can you explain?'));
  assert.ok(!outbound.includes('I have been feeling tired.'),'interrupted reply must not be included as heard history');
  const ended=await fetch(f.base+'/api/dana/session/'+s.sessionId,{method:'DELETE',headers:{Origin:f.base}});assert.equal(ended.status,200);
  assert.equal((await fetch(f.base+result.audioUrl)).status,404);
});

test('pending playback defaults to uncertain and explicit played retains prior reply',async t=>{
  const f=await fixture(t), s=await f.session();
  await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:'one',text:'How are you?'});
  await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:'two',text:'What else?'});
  assert.ok(!JSON.stringify(f.provider.calls.reply[1].messages).includes('I have been feeling tired.'));
  await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:'three',text:'Tell me more.',previousTurnId:'two',previousPlayback:'played'});
  assert.ok(JSON.stringify(f.provider.calls.reply[2].messages).includes('I have been feeling tired.'));
});

test('in-flight retry joins once; another turn is rejected before any provider call',async t=>{
  let release,started;
  const ready=new Promise(resolve=>started=resolve);
  const provider=fakeProvider({reply(input){this.calls.reply.push(input);started();return new Promise(resolve=>release=resolve);}});
  const f=await fixture(t,{provider}),s=await f.session();
  const input={sessionId:s.sessionId,turnId:1,text:'How are you?'};
  const a=f.request('/api/dana/turn',input);await ready;
  const b=f.request('/api/dana/turn',input);
  const conflict=await f.request('/api/dana/turn',{...input,turnId:2});assert.equal(conflict.status,409);
  release('I have been feeling tired.');
  const [ra,rb]=await Promise.all([a,b]);assert.equal(ra.status,200);assert.equal(rb.status,200);assert.deepEqual(await ra.json(),await rb.json());assert.equal(provider.calls.reply.length,1);
});

test('session deletion cancels provider work and never starts synthesis or commits late reply',async t=>{
  let started,signal,release;const ready=new Promise(resolve=>started=resolve);
  const provider=fakeProvider({reply(input){signal=input.signal;started();return new Promise(resolve=>release=resolve);}});
  const f=await fixture(t,{provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'});await ready;
  const ended=await fetch(f.base+'/api/dana/session/'+s.sessionId,{method:'DELETE',headers:{Origin:f.base}});assert.equal(ended.status,200);assert.equal(signal.aborted,true);
  assert.equal((await pending).status,409);release('I have been feeling tired.');await delay(5);assert.equal(provider.calls.speak.length,0);
});

test('client disconnect aborts a turn; retry does not invoke the provider again',async t=>{
  let started,signal;const ready=new Promise(resolve=>started=resolve);
  const provider=fakeProvider({reply(input){this.calls.reply.push(input);signal=input.signal;started();return new Promise(()=>{});}});
  const f=await fixture(t,{provider}),s=await f.session();
  const input={sessionId:s.sessionId,turnId:1,text:'How are you?'};
  const abort=new AbortController();const pending=f.request('/api/dana/turn',input,{signal:abort.signal}).catch(()=>null);await ready;abort.abort();await pending;
  for(let n=0;n<20&&!signal.aborted;n++)await delay(5);assert.equal(signal.aborted,true);
  assert.equal((await f.request('/api/dana/turn',input)).status,409);assert.equal(provider.calls.reply.length,1);
});

test('cross-origin, forged state/history and non-JSON requests cannot trigger providers',async t=>{
  const f=await fixture(t),s=await f.session(),input={sessionId:s.sessionId,turnId:1,text:'How are you?'};
  for(const extra of [{history:[]},{gates:{all:true}},{messages:[]},{caseId:'other'}])assert.equal((await f.request('/api/dana/turn',{...input,...extra})).status,400);
  assert.equal((await fetch(f.base+'/api/dana/session',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(f.base+'/api/dana/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(f.base+'/api/dana/session',{method:'POST',headers:{Origin:f.base,'Content-Type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await f.request('/api/dana/turn',{...input,text:'x'.repeat(1201)})).status,400);
  assert.equal((await f.request('/api/dana/turn',{...input,text:'MRN 12345678'})).status,400);
  assert.equal(f.provider.calls.reply.length,0);
});

test('static allowlist excludes secrets, traversal and symlinks',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'dana-static-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'_prototypes/sp-interview'),{recursive:true});
  await writeFile(path.join(root,'.env.dana.local'),'secret-placeholder');
  await writeFile(path.join(root,'_prototypes/sp-interview/sp-interview.preview.html'),'preview fixture');
  await writeFile(path.join(root,'_prototypes/sp-interview/sp-interview.bookmarks.js'),'bookmark fixture');
  await symlink(path.join(root,'.env.dana.local'),path.join(root,'_prototypes/sp-interview/sp-interview.live.js'));
  const f=await fixture(t,{rootDir:root});
  assert.equal((await fetch(f.base+'/_prototypes/sp-interview/sp-interview.preview.html')).status,200);
  assert.equal(await (await fetch(f.base+'/_prototypes/sp-interview/sp-interview.bookmarks.js')).text(),'bookmark fixture');
  for(const route of ['/.env.dana.local','/','/_prototypes/sp-interview/sp-interview.live.js','/_prototypes/sp-interview/sp-interview.pack.json','/%2eenv.dana.local','/output/speech/dana-marin-v1/../.env.dana.local'])assert.equal((await fetch(f.base+route)).status,404,route);
  const forbiddenHost=await new Promise(resolve=>{const req=http.get(f.base+'/api/dana/health',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',()=>resolve(0));});assert.equal(forbiddenHost,403);
});

test('session TTL and process provider limit are enforced before generation',async t=>{
  let clock=0;const f=await fixture(t,{now:()=>clock,maxProviderTurns:1}),s=await f.session();
  await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'});
  assert.equal((await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'What else?'})).status,429);
  clock=30*60*1000;
  assert.equal((await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'What else?'})).status,404);
  assert.equal(f.provider.calls.reply.length,1);
});

test('unconfigured health is truthful and provider failures are sanitized',async t=>{
  const unconfigured=await fixture(t,{provider:fakeProvider({configured:false})});
  assert.equal((await (await fetch(unconfigured.base+'/api/dana/health')).json()).configured,false);
  assert.equal((await unconfigured.request('/api/dana/session',{})).status,503);
  const f=await fixture(t,{provider:fakeProvider({async reply(){throw new Error('secret-provider-detail');}})}),s=await f.session();
  const response=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'});assert.equal(response.status,502);assert.ok(!(await response.text()).includes('secret-provider-detail'));
});

test('eight sessions, ten completed turns and two concurrent generations are hard limits',async t=>{
  const f=await fixture(t);
  const sessions=[];for(let n=0;n<8;n++)sessions.push(await f.session());
  assert.equal((await f.request('/api/dana/session',{})).status,429);
  for(let n=1;n<=10;n++)assert.equal((await f.request('/api/dana/turn',{sessionId:sessions[0].sessionId,turnId:String(n),text:'How are you?'})).status,200);
  assert.equal((await f.request('/api/dana/turn',{sessionId:sessions[0].sessionId,turnId:'eleven',text:'How are you?'})).status,429);
  let count=0,ready;const active=new Promise(resolve=>ready=resolve);
  const blocked=await fixture(t,{provider:fakeProvider({reply(){if(++count===2)ready();return new Promise(()=>{});}})});
  const a=await blocked.session(),b=await blocked.session(),c=await blocked.session();
  const p1=blocked.request('/api/dana/turn',{sessionId:a.sessionId,turnId:1,text:'How are you?'});
  const p2=blocked.request('/api/dana/turn',{sessionId:b.sessionId,turnId:1,text:'How are you?'});
  await active;
  assert.equal((await blocked.request('/api/dana/turn',{sessionId:c.sessionId,turnId:1,text:'How are you?'})).status,429);
  for(const s of [a,b])await fetch(blocked.base+'/api/dana/session/'+s.sessionId,{method:'DELETE',headers:{Origin:blocked.base}});
  assert.equal((await p1).status,409);assert.equal((await p2).status,409);
});

test('deadline terminates an ignoring provider and late synthesis cannot commit audio',async t=>{
  let signal;
  const f=await fixture(t,{turnTimeoutMs:20,provider:fakeProvider({reply(input){signal=input.signal;return new Promise(()=>{});}})}),s=await f.session();
  assert.equal((await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'})).status,409);assert.equal(signal.aborted,true);
  let release,started;const ready=new Promise(resolve=>started=resolve);
  const g=await fixture(t,{provider:fakeProvider({speak(input){this.calls.speak.push(input);started();return new Promise(resolve=>release=resolve);}})}),session=await g.session();
  const pending=g.request('/api/dana/turn',{sessionId:session.sessionId,turnId:1,text:'How are you?'});await ready;
  await fetch(g.base+'/api/dana/session/'+session.sessionId,{method:'DELETE',headers:{Origin:g.base}});
  const metadata=await pending;assert.equal(metadata.status,200);const {audioUrl}=await metadata.json();assert.equal(g.provider.calls.speak[0].signal.aborted,true);
  release(Buffer.from('ID3-late'));await delay(5);assert.equal((await fetch(g.base+audioUrl)).status,404);
});

test('cross-site top-level preview navigation works while API, audio and embedded requests remain protected',async t=>{
  const f=await fixture(t),session=await f.session();
  const turn=await f.request('/api/dana/turn',{sessionId:session.sessionId,turnId:1,text:'How are you?'});
  const {audioUrl}=await turn.json();
  const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document',Origin:'https://example.com'};
  const raw=(route,{method='GET',headers=navigation,body}={})=>new Promise((resolve,reject)=>{
    const req=http.request(f.base+route,{method,headers},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));});
    req.on('error',reject);req.end(body);
  });
  const preview='/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1';
  const permitted=await raw(preview);assert.equal(permitted.status,200);assert.equal(permitted.headers['cross-origin-resource-policy'],'same-origin');
  assert.equal((await raw(preview,{headers:{...navigation,Host:'evil.example'}})).status,403);
  assert.equal((await raw(preview,{headers:{...navigation,'Sec-Fetch-Dest':'iframe'}})).status,403);
  assert.equal((await raw(preview,{headers:{...navigation,'Sec-Fetch-Mode':'no-cors','Sec-Fetch-Dest':'script'}})).status,403);
  assert.equal((await raw('/_prototypes/sp-interview/sp-interview.live.js')).status,403);
  assert.equal((await raw('/api/dana/health')).status,403);
  assert.equal((await raw(audioUrl)).status,403);
  assert.equal((await raw('/api/dana/session',{method:'POST',headers:{...navigation,'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await raw('/api/dana/session/'+session.sessionId,{method:'DELETE'})).status,403);
  assert.equal(f.provider.calls.reply.length,1);
});

test('playback claims bind to the identified reply and cannot mark a discarded response heard',async t=>{
  const f=await fixture(t),s=await f.session();
  const first=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?',previousTurnId:null,previousPlayback:'played'});
  assert.equal(first.status,200);
  assert.ok(JSON.stringify(f.provider.calls.reply[0].messages).includes(s.opening),'explicit opening identity preserves a heard opening');
  // Model the response crossing the wire just before client cancellation: the
  // server committed turn 1, but the browser still knows only its played opening.
  const next=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Can you tell me more?',previousTurnId:null,previousPlayback:'played'});
  assert.equal(next.status,200);
  assert.ok(!JSON.stringify(f.provider.calls.reply[1].messages).includes('I have been feeling tired.'),'opening playback must not mark the unseen turn-1 reply played');
  const matched=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:3,text:'What happened next?',previousTurnId:2,previousPlayback:'played'});
  assert.equal(matched.status,200);
  const heard=f.provider.calls.reply[2].messages.filter(entry=>entry.role==='assistant'&&entry.content==='I have been feeling tired.');
  assert.equal(heard.length,1,'only the matching turn-2 reply is marked played');
  assert.equal((await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:4,text:'How is sleep?',previousPlayback:'played'})).status,200);
  assert.equal(f.provider.calls.reply[3].messages.filter(entry=>entry.role==='assistant'&&entry.content==='I have been feeling tired.').length,1,'missing identity cannot certify a newer reply');
});

function controlledSpeech() {
  const streams=[];
  const provider=fakeProvider({speakStream(input){return new Promise((resolve,reject)=>streams.push({...input,resolve,reject}));}});
  return {provider,streams};
}
async function readRest(reader,first) {
  const chunks=[Buffer.from(first.value)];
  for(;;){const item=await reader.read();if(item.done)return Buffer.concat(chunks);chunks.push(Buffer.from(item.value));}
}

test('turn metadata and first audio bytes arrive before synthesis completes; duplicate and range GETs reuse one producer', {timeout:3000},async t=>{
  const control=controlledSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const input={sessionId:s.sessionId,turnId:1,text:'How are you?'};
  const response=await f.request('/api/dana/turn',input);assert.equal(response.status,200);const metadata=await response.json();
  assert.deepEqual(await (await fetch(f.base+metadata.audioUrl+'/status')).json(),{state:'pending',turnId:1});
  assert.equal(control.streams.length,1);
  const stream=control.streams[0];stream.onChunk(Buffer.from('ID3-first'));
  const audio=await fetch(f.base+metadata.audioUrl),range=await fetch(f.base+metadata.audioUrl,{headers:{Range:'bytes=0-'}});
  assert.equal(audio.status,200);assert.equal(range.status,200);
  const reader=audio.body.getReader(),rangeReader=range.body.getReader();
  const first=await reader.read(),rangeFirst=await rangeReader.read();assert.equal(Buffer.from(first.value).toString(),'ID3-first');assert.equal(Buffer.from(rangeFirst.value).toString(),'ID3-first');
  assert.equal((await (await fetch(f.base+metadata.audioUrl+'/status')).json()).state,'streaming');
  assert.deepEqual(await (await f.request('/api/dana/turn',input)).json(),metadata);
  assert.equal((await f.request('/api/dana/turn',{...input,turnId:2})).status,409,'session reservation lasts beyond metadata response');
  stream.onChunk(Buffer.from('-last'));stream.resolve();
  assert.equal((await readRest(reader,first)).toString(),'ID3-first-last');assert.equal((await readRest(rangeReader,rangeFirst)).toString(),'ID3-first-last');
  assert.deepEqual(await (await fetch(f.base+metadata.audioUrl+'/status')).json(),{state:'complete',turnId:1});
  assert.equal(await (await fetch(f.base+metadata.audioUrl,{headers:{Range:'bytes=2-'}})).text(),'ID3-first-last');
  assert.equal(control.streams.length,1);assert.equal(control.provider.calls.reply.length,1);
});

test('explicit audio cancellation terminates streams, frees reservation and ignores late provider bytes', {timeout:3000},async t=>{
  const control=controlledSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const metadata=await (await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'})).json();
  const stream=control.streams[0];stream.onChunk(Buffer.from('ID3-first'));
  const response=await fetch(f.base+metadata.audioUrl),reader=response.body.getReader();await reader.read();
  const ended=await fetch(f.base+metadata.audioUrl,{method:'DELETE',headers:{Origin:f.base}});assert.equal(ended.status,200);assert.equal(stream.signal.aborted,true);
  await assert.rejects(reader.read());
  stream.onChunk(Buffer.from('late'));stream.resolve();await delay(5);
  assert.deepEqual(await (await fetch(f.base+metadata.audioUrl+'/status')).json(),{state:'cancelled',turnId:1});
  assert.equal((await fetch(f.base+metadata.audioUrl)).status,409);
  assert.equal((await fetch(f.base+metadata.audioUrl,{method:'DELETE',headers:{Origin:f.base}})).status,200);
  const next=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'What else?',previousTurnId:1,previousPlayback:'played'});assert.equal(next.status,200);
  assert.ok(!JSON.stringify(control.provider.calls.reply[1].messages).includes('I have been feeling tired.'),'cancelled generation cannot be called played');
});

test('partial synthesis failure cannot issue a complete receipt or a successful MP3 EOF', {timeout:3000},async t=>{
  const control=controlledSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const metadata=await (await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'})).json();
  control.streams[0].onChunk(Buffer.from('ID3-partial'));
  const response=await fetch(f.base+metadata.audioUrl),reader=response.body.getReader();await reader.read();
  control.streams[0].reject(new Error('private provider detail'));
  await assert.rejects(reader.read());
  assert.deepEqual(await (await fetch(f.base+metadata.audioUrl+'/status')).json(),{state:'failed',turnId:1});
  assert.equal((await fetch(f.base+metadata.audioUrl)).status,502);
  assert.equal(control.streams.length,1);
});

test('stream byte cap and deadline terminate producer without allowing late completion', {timeout:3000},async t=>{
  const control=controlledSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const metadata=await (await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'})).json();
  assert.throws(()=>control.streams[0].onChunk(Buffer.alloc(4000001)),/invalid_audio/);assert.equal(control.streams[0].signal.aborted,true);
  control.streams[0].resolve();await delay(5);
  assert.equal((await (await fetch(f.base+metadata.audioUrl+'/status')).json()).state,'failed');
  const timed=controlledSpeech(),g=await fixture(t,{provider:timed.provider,turnTimeoutMs:30}),other=await g.session();
  const pending=await (await g.request('/api/dana/turn',{sessionId:other.sessionId,turnId:1,text:'How are you?'})).json();
  await delay(60);assert.equal(timed.streams[0].signal.aborted,true);
  timed.streams[0].onChunk(Buffer.from('ID3-late'));timed.streams[0].resolve();await delay(5);
  assert.equal((await (await fetch(g.base+pending.audioUrl+'/status')).json()).state,'cancelled');
});

test('global concurrency remains reserved during synthesis after POST has returned', {timeout:3000},async t=>{
  const control=controlledSpeech(),f=await fixture(t,{provider:control.provider});
  const sessions=[];for(let i=0;i<3;i++)sessions.push(await f.session());
  const a=await (await f.request('/api/dana/turn',{sessionId:sessions[0].sessionId,turnId:1,text:'How are you?'})).json();
  await f.request('/api/dana/turn',{sessionId:sessions[1].sessionId,turnId:1,text:'How are you?'});
  assert.equal((await f.request('/api/dana/turn',{sessionId:sessions[2].sessionId,turnId:1,text:'How are you?'})).status,429);
  await fetch(f.base+a.audioUrl,{method:'DELETE',headers:{Origin:f.base}});
  assert.equal((await f.request('/api/dana/turn',{sessionId:sessions[2].sessionId,turnId:1,text:'How are you?'})).status,200);
  assert.equal(control.streams.length,3);
});

test('cleaning up a successfully completed audio resource preserves its historical completion identity',async t=>{
  const f=await fixture(t),s=await f.session();
  const metadata=await (await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are you?'})).json();
  assert.equal((await (await fetch(f.base+metadata.audioUrl+'/status')).json()).state,'complete');
  assert.equal((await fetch(f.base+metadata.audioUrl,{method:'DELETE',headers:{Origin:f.base}})).status,200);
  assert.equal((await fetch(f.base+metadata.audioUrl)).status,409);
  const next=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Tell me more.',previousTurnId:1,previousPlayback:'played'});assert.equal(next.status,200);
  assert.ok(f.provider.calls.reply[1].messages.some(entry=>entry.role==='assistant'&&entry.content==='I have been feeling tired.'));
});

test('known turn cancellation repairs discarded metadata and blocks a late POST that arrives after its cancellation', {timeout:3000},async t=>{
  const control=controlledSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const firstInput={sessionId:s.sessionId,turnId:1,text:'How are you?',previousTurnId:null,previousPlayback:'played'};
  // Metadata reached the network, but the browser discards it before learning
  // the token. Cancellation therefore uses the turn ID known before the POST.
  const discarded=await f.request('/api/dana/turn',firstInput);assert.equal(discarded.status,200);
  const cancel='/api/dana/session/'+s.sessionId+'/turn/1';
  assert.equal((await fetch(f.base+cancel,{method:'DELETE',headers:{Origin:f.base}})).status,200);
  assert.equal(control.streams[0].signal.aborted,true);
  assert.equal((await f.request('/api/dana/turn',firstInput)).status,409);
  control.streams[0].onChunk(Buffer.from('ID3-late'));control.streams[0].resolve();
  const next=await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Tell me more.',previousTurnId:null,previousPlayback:'played'});assert.equal(next.status,200,'acknowledged cancellation releases the session before continuation');
  assert.ok(!JSON.stringify(control.provider.calls.reply[1].messages).includes('I have been feeling tired.'));
  const second=await next.json();await fetch(f.base+second.audioUrl,{method:'DELETE',headers:{Origin:f.base}});
  const beforeCalls=control.provider.calls.reply.length;
  const early='/api/dana/session/'+s.sessionId+'/turn/3';
  assert.equal((await fetch(f.base+early,{method:'DELETE',headers:{Origin:f.base}})).status,200);
  assert.equal((await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:3,text:'This arrives too late.'})).status,409);
  assert.equal(control.provider.calls.reply.length,beforeCalls);
  assert.equal((await fetch(f.base+early,{method:'DELETE',headers:{Origin:'https://evil.example'}})).status,403);
});

function controlledActorAndSpeech() {
  const control=controlledSpeech(),actors=[];
  control.provider.replyStream=function(input){this.calls.reply.push(input);return new Promise((resolve,reject)=>actors.push({...input,resolve,reject}));};
  return {...control,actors};
}
async function until(test){for(let i=0;i<100&&!test();i++)await delay(2);assert.ok(test(),'expected asynchronous state');}

test('early lead stays private until complete actor validation; duplicate requests share both producers', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const input={sessionId:s.sessionId,turnId:1,text:'How have things been?'};
  let settled=false;const first=f.request('/api/dana/turn',input).then(r=>{settled=true;return r;});
  await until(()=>control.actors.length===1);
  control.actors[0].onLead('I have been tired.');
  assert.equal(control.streams.length,1);
  control.streams[0].onChunk(Buffer.from('ID3-lead'));control.streams[0].resolve();
  const duplicate=f.request('/api/dana/turn',input);await delay(10);
  assert.equal(settled,false,'no text or audio URL leaves before actor completion');
  control.actors[0].resolve('I have been tired. Nothing feels easy.');
  const a=await first,b=await duplicate;assert.equal(a.status,200);assert.equal(b.status,200);
  const metadata=await a.json();assert.deepEqual(await b.json(),metadata);
  assert.equal(Object.hasOwn(metadata,'audioUrl'),false);assert.equal(metadata.audioSegments.length,2);
  assert.equal(metadata.audioSegments.map(s=>s.text).join(''),metadata.reply);
  assert.equal(metadata.audioSegments[1].text,' Nothing feels easy.');
  assert.equal(control.actors.length,1);assert.equal(control.streams.length,2);
  assert.equal(await (await fetch(f.base+metadata.audioSegments[0].audioUrl)).text(),'ID3-lead');
  assert.equal((await f.request('/api/dana/turn',{...input,turnId:2})).status,409,'remainder keeps turn reservation');
  control.streams[1].onChunk(Buffer.from('ID3-rest'));control.streams[1].resolve();
  assert.equal(await (await fetch(f.base+metadata.audioSegments[1].audioUrl)).text(),'ID3-rest');
  assert.equal((await f.request('/api/dana/turn',input)).status,200);assert.equal(control.streams.length,2);
});

test('invalid final reply, prefix mismatch, and actor failure cancel speculative audio without exposing a reply', {timeout:3000},async t=>{
  for(const outcome of ['[stage direction]','I am a different prefix.',null]){
    const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
    const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
    await until(()=>control.actors.length===1);control.actors[0].onLead('I have been tired.');
    control.streams[0].onChunk(Buffer.from('ID3-private'));
    if(outcome===null)control.actors[0].reject(new Error('private error'));else control.actors[0].resolve(outcome);
    const response=await pending;assert.equal(response.status,502);
    assert.equal(control.streams[0].signal.aborted,true);assert.equal(control.streams.length,1);
    assert.ok(!(await response.text()).includes('audioUrl'));
    control.streams[0].resolve();
  }
});

test('cancelled actor cannot start a late speculative lead or remainder', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
  await until(()=>control.actors.length===1);
  await fetch(f.base+'/api/dana/session/'+s.sessionId+'/turn/1',{method:'DELETE',headers:{Origin:f.base}});
  assert.equal((await pending).status,409);
  control.actors[0].onLead('This is too late.');control.actors[0].resolve('This is too late. It must never play.');
  await delay(5);assert.equal(control.streams.length,0);
});

test('single-sentence and no-lead replies create only one segment and ignore post-completion callbacks', {timeout:3000},async t=>{
  for(const withLead of [true,false]){
    const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
    const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
    await until(()=>control.actors.length===1);
    if(withLead)control.actors[0].onLead('I have been tired.');
    control.actors[0].resolve('I have been tired.');
    const response=await pending;assert.equal(response.status,200);const metadata=await response.json();
    assert.equal(metadata.audioSegments.length,1);assert.equal(control.streams.length,1);
    control.actors[0].onLead('An orphaned late sentence.');assert.equal(control.streams.length,1);
    control.streams[0].onChunk(Buffer.from('ID3-only'));control.streams[0].resolve();
    assert.equal(await (await fetch(f.base+metadata.audioSegments[0].audioUrl)).text(),'ID3-only');
  }
});

test('deleting either segment cancels the whole turn and late audio cannot complete it', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
  await until(()=>control.actors.length===1);control.actors[0].onLead('I have been tired.');control.actors[0].resolve('I have been tired. Nothing feels easy.');
  const metadata=await (await pending).json();
  await fetch(f.base+metadata.audioSegments[1].audioUrl,{method:'DELETE',headers:{Origin:f.base}});
  for(const [index,segment] of metadata.audioSegments.entries()){
    assert.equal(control.streams[index].signal.aborted,true);control.streams[index].onChunk(Buffer.from('ID3-too-late'));control.streams[index].resolve();
    assert.equal((await (await fetch(f.base+segment.audioUrl+'/status')).json()).state,'cancelled');
  }
});

test('a failed remainder cannot enter heard history even when the lead finished successfully', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
  await until(()=>control.actors.length===1);control.actors[0].onLead('I have been tired.');control.actors[0].resolve('I have been tired. Nothing feels easy.');
  const metadata=await (await pending).json();
  control.streams[0].onChunk(Buffer.from('ID3-lead'));control.streams[0].resolve();await delay(5);
  control.streams[1].reject(new Error('failed remainder'));await delay(5);
  const next=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Tell me more.',previousTurnId:1,previousPlayback:'played'});
  await until(()=>control.actors.length===2);
  assert.ok(!control.actors[1].messages.some(entry=>entry.role==='assistant'&&entry.content===metadata.reply));
  control.actors[1].resolve('I am still tired.');const response=await next;assert.equal(response.status,200);
});

test('audio byte limit applies to the entire segmented turn', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
  await until(()=>control.actors.length===1);control.actors[0].onLead('I have been tired.');control.actors[0].resolve('I have been tired. Nothing feels easy.');
  const metadata=await (await pending).json();
  control.streams[0].onChunk(Buffer.alloc(2_500_000));control.streams[0].resolve();await delay(5);
  assert.throws(()=>control.streams[1].onChunk(Buffer.alloc(1_500_001)),/invalid_audio/);
  assert.equal(control.streams[1].signal.aborted,true);control.streams[1].resolve();
  assert.notEqual((await (await fetch(f.base+metadata.audioSegments[1].audioUrl+'/status')).json()).state,'complete');
});

test('speech attempt cap includes speculative and remainder jobs without duplicate billing attempts', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider,maxSpeechOperations:1}),s=await f.session();
  const input={sessionId:s.sessionId,turnId:1,text:'How are things?'};
  const pending=f.request('/api/dana/turn',input);await until(()=>control.actors.length===1);
  control.actors[0].onLead('I have been tired.');control.actors[0].resolve('I have been tired. Nothing feels easy.');
  assert.equal((await pending).status,429);assert.equal(control.streams.length,1);assert.equal(control.streams[0].signal.aborted,true);control.streams[0].resolve();
  assert.equal((await f.request('/api/dana/turn',{...input,turnId:2})).status,429);assert.equal(control.actors.length,1);
});

test('concurrent actors cannot both spend the final speech attempt', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider,maxSpeechOperations:1}),a=await f.session(),b=await f.session();
  const first=f.request('/api/dana/turn',{sessionId:a.sessionId,turnId:1,text:'How are things?'});
  const second=f.request('/api/dana/turn',{sessionId:b.sessionId,turnId:1,text:'How are things?'});
  await until(()=>control.actors.length===2);
  control.actors[0].onLead('I have been tired.');
  assert.throws(()=>control.actors[1].onLead('I have been tired.'),/speech_audition_limit/);
  control.actors[1].reject(new Error('speech budget exhausted'));
  assert.equal((await second).status,502);assert.equal(control.streams.length,1);
  control.actors[0].resolve('I have been tired.');assert.equal((await first).status,200);
  control.streams[0].onChunk(Buffer.from('ID3-only'));control.streams[0].resolve();
});

test('all completed segments plus matching played acknowledgement retain the full reply in history', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
  await until(()=>control.actors.length===1);control.actors[0].onLead('I have been tired.');control.actors[0].resolve('I have been tired. Nothing feels easy.');
  const metadata=await (await pending).json();
  for(const stream of control.streams){stream.onChunk(Buffer.from('ID3-complete'));stream.resolve();}
  for(const segment of metadata.audioSegments)assert.equal((await (await fetch(f.base+segment.audioUrl+'/status')).json()).state,'complete');
  const next=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Tell me more.',previousTurnId:1,previousPlayback:'played'});
  await until(()=>control.actors.length===2);
  assert.ok(control.actors[1].messages.some(entry=>entry.role==='assistant'&&entry.content===metadata.reply));
  control.actors[1].resolve('I am still tired.');assert.equal((await next).status,200);
});

test('speculative speech failure aborts an unfinished actor and never releases audio metadata', {timeout:3000},async t=>{
  const control=controlledActorAndSpeech(),f=await fixture(t,{provider:control.provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'How are things?'});
  await until(()=>control.actors.length===1);control.actors[0].onLead('I have been tired.');
  control.streams[0].reject(new Error('private speech failure'));
  const response=await pending;assert.equal(response.status,409);
  assert.equal(control.actors[0].signal.aborted,true);assert.ok(!(await response.text()).includes('audioUrl'));
  control.actors[0].resolve('I have been tired. Nothing feels easy.');await delay(5);
  assert.equal(control.streams.length,1);
});

async function segmentedTurn(control,f,session,turnId=1) {
  const pending=f.request('/api/dana/turn',{sessionId:session.sessionId,turnId,text:'How are things?'});
  await until(()=>control.actors.length===turnId);
  control.actors.at(-1).onLead('I have been tired.');
  control.actors.at(-1).resolve('I have been tired. Nothing feels easy.');
  return (await pending).json();
}

test('completed segment claims retain only a source-owned contiguous heard prefix',async t=>{
  const c=controlledActorAndSpeech(),f=await fixture(t,{provider:c.provider}),s=await f.session();
  const first=await segmentedTurn(c,f,s);
  c.streams[0].onChunk(Buffer.from('ID3-lead'));c.streams[0].resolve();await delay(5);
  await fetch(f.base+first.audioSegments[1].audioUrl,{method:'DELETE',headers:{Origin:f.base}});
  const next=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Tell me more.',previousTurnId:1,previousPlayback:'interrupted',previousCompletedSegments:1});
  await until(()=>c.actors.length===2);
  const context=c.actors[1];
  assert.ok(context.messages.some(m=>m.role==='assistant'&&m.content==='I have been tired.'));
  assert.ok(!JSON.stringify(context.messages).includes('Nothing feels easy.'));
  assert.match(context.system,/only the included complete prefix was heard/);
  assert.ok(!context.system.includes('Nothing feels easy.'));
  c.actors[1].resolve('I am still tired.');assert.equal((await next).status,200);
});

test('mismatched identities, incomplete first segments and late completions cannot certify heard prefixes',async t=>{
  for(const kind of ['mismatch','unfinished-first','late']) {
    const c=controlledActorAndSpeech(),f=await fixture(t,{provider:c.provider}),s=await f.session();
    const first=await segmentedTurn(c,f,s);
    if(kind==='mismatch'){for(const stream of c.streams){stream.onChunk(Buffer.from('ID3-done'));stream.resolve();}await delay(5);}
    else if(kind==='unfinished-first'){c.streams[1].onChunk(Buffer.from('ID3-tail'));c.streams[1].resolve();await delay(5);}
    await fetch(f.base+first.audioSegments[0].audioUrl,{method:'DELETE',headers:{Origin:f.base}});
    const next=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Tell me more.',previousTurnId:kind==='mismatch'?9:1,previousPlayback:'interrupted',previousCompletedSegments:2});
    await until(()=>c.actors.length===2);
    if(kind==='late'){c.streams[0].onChunk(Buffer.from('ID3-late'));c.streams[0].resolve();}
    assert.ok(!c.actors[1].messages.some(m=>m.role==='assistant'&&m.content.includes('I have been tired.')));
    assert.ok(!JSON.stringify(c.actors[1].messages).includes('Nothing feels easy.'));
    c.actors[1].resolve('I am still tired.');assert.equal((await next).status,200);
  }
});

test('completed segment schema rejects out-of-range claims and client history',async t=>{
  const f=await fixture(t),s=await f.session(),input={sessionId:s.sessionId,turnId:1,text:'Hello'};
  for(const count of [-1,3,1.5,'1',null])assert.equal((await f.request('/api/dana/turn',{...input,previousCompletedSegments:count})).status,400);
  assert.equal((await f.request('/api/dana/turn',{...input,previousCompletedSegments:1,previousSegmentText:'Invented'})).status,400);
  assert.equal(f.provider.calls.reply.length,0);
});

test('finish freezes original, invalidates audio and retry replays only the selected pre-question history',async t=>{
  const f=await fixture(t),s=await f.session();
  const first=await (await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'First original question',previousTurnId:null,previousPlayback:'played'})).json();
  const second=await (await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Future original question',previousTurnId:1,previousPlayback:'played'})).json();
  const finish='/api/dana/session/'+s.sessionId+'/finish',retry='/api/dana/session/'+s.sessionId+'/retry';
  const result=await (await f.request(finish,{})).json();assert.deepEqual(result,{finished:true,retryTurnIds:[1,2]});
  assert.deepEqual(await (await f.request(finish,{})).json(),result);
  assert.equal((await fetch(f.base+first.audioUrl)).status,404);assert.equal((await fetch(f.base+second.audioUrl)).status,404);
  assert.equal((await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:3,text:'Original must stay closed'})).status,409);
  const child=await (await f.request(retry,{turnId:2})).json();
  assert.deepEqual(await (await f.request(retry,{turnId:2})).json(),child);
  assert.equal((await f.request(retry,{turnId:1})).status,409);
  assert.equal((await f.request('/api/dana/turn',{sessionId:child.sessionId,turnId:1,text:'Alternative question',previousTurnId:null,previousPlayback:'interrupted',previousCompletedSegments:0})).status,200);
  const messages=f.provider.calls.reply.at(-1).messages;
  assert.ok(messages.some(m=>m.content==='First original question'));
  assert.ok(messages.some(m=>m.role==='assistant'&&m.content==='I have been feeling tired.'));
  assert.ok(messages.some(m=>m.content===s.opening),'retry cannot overwrite heard opening/prefix');
  assert.ok(!JSON.stringify(messages).includes('Future original question'));
  assert.equal(messages.filter(m=>m.content==='Alternative question').length,1);
  assert.equal((await f.request('/api/dana/turn',{sessionId:child.sessionId,turnId:2,text:'No second retry turn'})).status,429);
  const childFinish=await (await f.request('/api/dana/session/'+child.sessionId+'/finish',{})).json();assert.deepEqual(childFinish.retryTurnIds,[]);
  assert.equal((await f.request('/api/dana/session/'+child.sessionId+'/retry',{turnId:1})).status,409);
  assert.deepEqual(await (await f.request(finish,{})).json(),result,'branch cannot mutate original snapshot list');
});

test('retry before finish, nonexistent source and forged request keys never create actor work',async t=>{
  const f=await fixture(t),s=await f.session(),base='/api/dana/session/'+s.sessionId;
  assert.equal((await f.request(base+'/retry',{turnId:1})).status,409);
  assert.equal((await f.request(base+'/finish',{history:[]})).status,400);
  await f.request(base+'/finish',{});
  assert.equal((await f.request(base+'/retry',{turnId:1})).status,404);
  assert.equal((await f.request(base+'/retry',{turnId:1,history:[]})).status,400);
  assert.equal((await f.request(base+'/retry',{turnId:1,state:{}})).status,400);
  assert.equal((await f.request(base+'/finish',{}, {headers:{Origin:'https://evil.example','Content-Type':'application/json'}})).status,403);
  assert.equal(f.provider.calls.reply.length,0);
});

test('finish aborts private actor/lead work without creating a retry snapshot from the cancelled turn',async t=>{
  const c=controlledActorAndSpeech(),f=await fixture(t,{provider:c.provider}),s=await f.session();
  const pending=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'A cancelled question'});
  await until(()=>c.actors.length===1);c.actors[0].onLead('I have been tired.');
  const finish=await f.request('/api/dana/session/'+s.sessionId+'/finish',{});
  assert.deepEqual(await finish.json(),{finished:true,retryTurnIds:[]});
  assert.equal((await pending).status,409);assert.equal(c.actors[0].signal.aborted,true);assert.equal(c.streams[0].signal.aborted,true);
  c.actors[0].resolve('I have been tired. Nothing feels easy.');c.streams[0].onChunk(Buffer.from('ID3-late'));c.streams[0].resolve();await delay(5);
  assert.equal(c.streams.length,1);
  assert.equal((await f.request('/api/dana/session/'+s.sessionId+'/retry',{turnId:1})).status,404);
});

test('parent deletion and original TTL cascade to retry children',async t=>{
  for(const expire of [false,true]) {
    let now=0;const f=await fixture(t,{now:()=>now}),s=await f.session();
    await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'Hello'});
    await f.request('/api/dana/session/'+s.sessionId+'/finish',{});now=29*60*1000;
    const child=await (await f.request('/api/dana/session/'+s.sessionId+'/retry',{turnId:1})).json();
    if(expire)now=30*60*1000;
    else await fetch(f.base+'/api/dana/session/'+s.sessionId,{method:'DELETE',headers:{Origin:f.base}});
    assert.equal((await f.request('/api/dana/turn',{sessionId:child.sessionId,turnId:1,text:'Child is gone'})).status,404);
  }
});

test('retry children count toward session cap and use the shared provider budget',async t=>{
  const f=await fixture(t,{maxProviderTurns:1}),s=await f.session();
  await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:1,text:'Hello'});
  await f.request('/api/dana/session/'+s.sessionId+'/finish',{});
  const others=[];for(let i=0;i<7;i++)others.push(await f.session());
  const retry='/api/dana/session/'+s.sessionId+'/retry';assert.equal((await f.request(retry,{turnId:1})).status,429);
  await fetch(f.base+'/api/dana/session/'+others[0].sessionId,{method:'DELETE',headers:{Origin:f.base}});
  const child=await (await f.request(retry,{turnId:1})).json();
  assert.equal((await f.request('/api/dana/turn',{sessionId:child.sessionId,turnId:1,text:'Alternative'})).status,429);
  assert.equal(f.provider.calls.reply.length,1);
});

test('retry retains heard-prefix metadata and recomputes gates from original prefix plus alternative only',async t=>{
  const {createContext}=await import('../dana-live-context.mjs');
  const {readFile}=await import('node:fs/promises');
  const pack=JSON.parse(await readFile(new URL('../sp-interview.pack.json',import.meta.url),'utf8'));
  const dana=pack.cases.find(c=>c.id==='sp_depression_gated_si_001');
  const c=controlledActorAndSpeech(),f=await fixture(t,{provider:c.provider}),s=await f.session();
  const first=await segmentedTurn(c,f,s);c.streams[0].onChunk(Buffer.from('ID3-lead'));c.streams[0].resolve();await delay(5);
  await fetch(f.base+first.audioSegments[1].audioUrl,{method:'DELETE',headers:{Origin:f.base}});
  const second=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Original question being replaced',previousTurnId:1,previousPlayback:'interrupted',previousCompletedSegments:1});
  await until(()=>c.actors.length===2);c.actors[1].resolve('I am still tired.');await second;
  await f.request('/api/dana/session/'+s.sessionId+'/finish',{});
  const child=await (await f.request('/api/dana/session/'+s.sessionId+'/retry',{turnId:2})).json();
  const alternative='Have you been thinking of hurting yourself?';
  const next=f.request('/api/dana/turn',{sessionId:child.sessionId,turnId:1,text:alternative,previousTurnId:null,previousPlayback:'played',previousCompletedSegments:2});
  await until(()=>c.actors.length===3);
  const expected=createContext(dana,['How are things?',alternative],[
    {who:'pt',text:dana.persona.opening,playbackStatus:'interrupted'},
    {who:'me',text:'How are things?'},
    {who:'pt',text:'I have been tired.',playbackStatus:'played',omittedTail:true},
    {who:'me',text:alternative},
  ]);
  assert.deepEqual(c.actors[2].messages,expected.messages);assert.equal(c.actors[2].system,expected.system);
  assert.ok(!JSON.stringify(c.actors[2]).includes('Original question being replaced'));
  assert.ok(!JSON.stringify(c.actors[2]).includes('Nothing feels easy.'));
  c.actors[2].resolve('I am still tired.');assert.equal((await next).status,200);
});

test('retry of turn ten accepts the complete nine-question prefix and only one alternative',async t=>{
  const f=await fixture(t),s=await f.session();
  for(let turn=1;turn<=10;turn++)assert.equal((await f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:turn,text:'Original question '+turn,previousTurnId:turn===1?null:turn-1,previousPlayback:'played'})).status,200);
  await f.request('/api/dana/session/'+s.sessionId+'/finish',{});
  const child=await (await f.request('/api/dana/session/'+s.sessionId+'/retry',{turnId:10})).json();
  assert.equal((await f.request('/api/dana/turn',{sessionId:child.sessionId,turnId:1,text:'Alternative tenth question'})).status,200);
  const learners=f.provider.calls.reply.at(-1).messages.filter(m=>m.role==='user').map(m=>m.content);
  assert.deepEqual(learners,[...Array.from({length:9},(_,i)=>'Original question '+(i+1)),'Alternative tenth question']);
});

test('an explicit partial count cannot be upgraded to a full reply by a contradictory played claim',async t=>{
  const c=controlledActorAndSpeech(),f=await fixture(t,{provider:c.provider}),s=await f.session();
  await segmentedTurn(c,f,s);
  for(const stream of c.streams){stream.onChunk(Buffer.from('ID3-complete'));stream.resolve();}await delay(5);
  const next=f.request('/api/dana/turn',{sessionId:s.sessionId,turnId:2,text:'Continue.',previousTurnId:1,previousPlayback:'played',previousCompletedSegments:1});
  await until(()=>c.actors.length===2);
  assert.ok(c.actors[1].messages.some(m=>m.content==='I have been tired.'));
  assert.ok(!JSON.stringify(c.actors[1].messages).includes('Nothing feels easy.'));
  c.actors[1].resolve('I am still tired.');assert.equal((await next).status,200);
});

test('case identity is fixed per session, including speech and exact-prefix retry',async t=>{
  const f=await fixture(t);
  const ids=['sp_mania_redirect_001','sp_psychosis_paranoid_001','sp_alcohol_ambivalence_001'];
  const health=await (await fetch(f.base+'/api/dana/health')).json();
  for(const caseId of ids)assert.ok(health.cases.includes(caseId));
  for(const caseId of ids){
    const response=await f.request('/api/dana/session',{caseId});assert.equal(response.status,201);
    const session=await response.json();assert.equal(session.caseId,caseId);
    const expected=['Marcus','Ray','Morgan'][ids.indexOf(caseId)];
    const first=await f.request('/api/dana/turn',{sessionId:session.sessionId,turnId:1,text:'How would you like me to help?',previousPlayback:'played'});
    assert.equal(first.status,200);await first.json();
    const actor=f.provider.calls.reply.at(-1);assert.ok(actor.system.includes(expected));
    assert.equal(f.provider.calls.speak.at(-1).caseId,caseId);
    assert.equal((await f.request('/api/dana/turn',{sessionId:session.sessionId,turnId:2,text:'Switch patients',caseId:ids.find(id=>id!==caseId)})).status,400);
    await f.request('/api/dana/session/'+session.sessionId+'/finish',{});
    const child=await (await f.request('/api/dana/session/'+session.sessionId+'/retry',{turnId:1})).json();
    assert.equal(child.caseId,caseId);
    assert.equal((await f.request('/api/dana/turn',{sessionId:child.sessionId,turnId:1,text:'I want to understand your concern.'})).status,200);
    assert.equal(f.provider.calls.speak.at(-1).caseId,caseId);
    assert.ok(f.provider.calls.reply.at(-1).system.includes(expected));
    assert.ok(!JSON.stringify(f.provider.calls.reply.at(-1).messages).includes('How would you like me to help?'));
  }
  assert.equal((await f.request('/api/dana/session',{caseId:'unknown'})).status,400);
  assert.equal((await f.request('/api/dana/session',{caseId:'__proto__'})).status,400);
  assert.equal((await f.request('/api/dana/session',{caseId:ids[0],voice:'marin'})).status,400);
});
