import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIProvider, firstSubstantiveSentence} from '../lib/openai-provider.mjs';

const encoder = new TextEncoder();
const ENV = {OPENAI_API_KEY:'fixture-key'};
const DANA = 'sp_depression_gated_si_001';
const TEXT = 'Okay. I have been feeling really tired. My clothes are looser.';
const LEAD = 'Okay. I have been feeling really tired.';
const USAGE = {input_tokens:100,input_tokens_details:{cached_tokens:20},output_tokens:12,output_tokens_details:{reasoning_tokens:2},total_tokens:112};
const actorResponse = (text=TEXT, overrides={}) => ({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}],usage:USAGE,...overrides});
const event = value => `data: ${JSON.stringify(value)}\n\n`;
const delta = text => ({type:'response.output_text.delta',delta:text});
const complete = (text=TEXT, overrides={}) => ({type:'response.completed',response:actorResponse(text,overrides)});
const streamText = values => values.map(event).join('');
function responseStream(values,{fragment=0,contentType='text/event-stream',onCancel=()=>{}}={}) {
  const bytes = typeof values === 'string' ? encoder.encode(values) : values;
  let index=0;
  return new Response(new ReadableStream({
    pull(controller) {
      if(index===bytes.length){controller.close();return;}
      const end=Math.min(bytes.length,index+(fragment||bytes.length));
      controller.enqueue(bytes.slice(index,end));index=end;
    },
    cancel:onCancel,
  }),{headers:{'Content-Type':contentType}});
}
function makeProvider(fetchImpl,options={}) {return createOpenAIProvider({env:ENV,fetchImpl,...options});}
function mp3(size=160) {const bytes=new Uint8Array(size);bytes.set([73,68,51]);return bytes;}
async function assertCode(promise, code) {await assert.rejects(promise,error=>error.code===code,`Expected ${code}`);}

test('buffered actor preserves the approved model, privacy and output settings',async()=>{
  let call;
  const provider=makeProvider(async(url,options)=>{call={url,options};return Response.json(actorResponse());});
  const messages=[{role:'user',content:'How have things been?'}];
  assert.equal(await provider.reply({system:'Fictional patient facts.',messages}),TEXT);
  assert.equal(call.url,'https://api.openai.com/v1/responses');
  assert.equal(call.options.redirect,'error');
  assert.equal(call.options.method,'POST');
  assert.equal(call.options.headers.Authorization,'Bearer fixture-key');
  assert.deepEqual(JSON.parse(call.options.body),{model:'gpt-5.4-2026-03-05',instructions:'Fictional patient facts.',input:messages,store:false,max_output_tokens:768,reasoning:{effort:'low'}});
  assert.equal(provider.getUsage().actor.tokens.inputTokens,100);
  assert.equal(provider.getUsage().actor.tokens.cachedInputTokens,20);
});

test('streaming actor handles fragmented UTF-8 and CRLF while issuing one exact substantive lead',async()=>{
  const text='Okay. I’m feeling very tired lately. I don’t know why.';
  const leads=[];
  const wire=streamText([delta('Okay. I’m feeling '),delta('very tired lately. I '),delta('don’t know why.'),complete(text)]).replaceAll('\n','\r\n');
  let request;
  const provider=makeProvider(async(_url,options)=>{request=JSON.parse(options.body);return responseStream(wire,{fragment:1});});
  assert.equal(await provider.replyStream({system:'facts',messages:[],onLead:value=>leads.push(value)}),text);
  assert.deepEqual(leads,['Okay. I’m feeling very tired lately.']);
  assert.equal(request.stream,true);
  assert.equal(provider.getUsage().actor.completed,1);
});

test('lead arrives before final response and allows private speech prefetch',async()=>{
  let controller,release;
  const final=new Promise(resolve=>{release=resolve;});
  const response=new Response(new ReadableStream({start(value){controller=value;controller.enqueue(encoder.encode(event(delta(`${LEAD} More`))));}}),{headers:{'Content-Type':'text/event-stream'}});
  const provider=makeProvider(async()=>response);
  let seen=false;
  const result=provider.replyStream({system:'facts',messages:[],onLead(value){assert.equal(value,LEAD);seen=true;release();}});
  await final;assert.equal(seen,true);
  controller.enqueue(encoder.encode(event(complete(`${LEAD} More`))));controller.close();
  assert.equal(await result,`${LEAD} More`);
});

for(const [text,expected] of [
  ['Okay. ',null],['Okay. I have been feeling really tired.',null],
  [`${LEAD} More`,LEAD],['I spoke with Dr. ',null],
  ['I spoke with Dr. Smith about everything. Next','I spoke with Dr. Smith about everything.'],
  ['I wake at 3 a.m. most nights. Next','I wake at 3 a.m. most nights.'],
  ['Well... ',null],['I spoke with J. Smith yesterday. Next','I spoke with J. Smith yesterday.'],
]) test(`substantive lead respects sentence boundary: ${text}`,()=>assert.equal(firstSubstantiveSentence(text),expected));

for(const [name,wire,code] of [
  ['missing completion',streamText([delta(TEXT)]),'actor_incomplete'],
  ['mismatched final',streamText([delta(TEXT),complete('Another answer.')]),'protocol_final'],
  ['incomplete final',streamText([delta(TEXT),complete(TEXT,{status:'incomplete'})]),'actor_incomplete'],
  ['oversized text',streamText([delta('x'.repeat(1201))]),'protocol_size'],
  ['invalid delta',streamText([{type:'response.output_text.delta',delta:3}]),'protocol_encoding'],
  ['malformed JSON','data: {broken}\n\n','protocol_invalid'],
  ['post-final text',streamText([delta(TEXT),complete(),delta('extra')]),'protocol_final'],
  ['provider failure event',streamText([{type:'response.failed',response:{status:'failed',error:{message:'secret provider details'}}}]),'actor_incomplete'],
]) test(`streaming actor fails closed for ${name}`,async()=>{
  const provider=makeProvider(async()=>responseStream(wire));
  await assertCode(provider.replyStream({system:'facts',messages:[],onLead(){}}),code);
  assert.equal(JSON.stringify(provider.getDiagnostics()).includes('secret provider details'),false);
});

test('invalid UTF-8 in actor stream is rejected',async()=>{
  const provider=makeProvider(async()=>responseStream(new Uint8Array([100,97,116,97,58,32,255,10,10])));
  await assertCode(provider.replyStream({system:'facts',messages:[],onLead(){}}),'protocol_encoding');
});

test('non-SSE successful response cannot impersonate an actor stream',async()=>{
  const provider=makeProvider(async()=>Response.json(actorResponse()));
  await assertCode(provider.replyStream({system:'facts',messages:[],onLead(){}}),'protocol_invalid');
});

test('SSE comments and unrelated metadata events do not change the spoken text',async()=>{
  const wire=': keepalive\n\n'+streamText([{type:'response.created',response:{status:'in_progress'}},delta(TEXT),complete()]);
  const provider=makeProvider(async()=>responseStream(wire));
  assert.equal(await provider.replyStream({system:'facts',messages:[],onLead(){}}),TEXT);
});

test('callback rejection aborts speculative actor work without exposing caller details',async()=>{
  let signal;
  const provider=makeProvider(async(_url,options)=>{signal=options.signal;return responseStream(streamText([delta(`${LEAD} More`),complete(`${LEAD} More`)]));});
  await assertCode(provider.replyStream({system:'facts',messages:[],onLead(){throw new Error('private callback detail');}}),'callback_rejected');
  assert.equal(signal.aborted,true);
  assert.equal(JSON.stringify(provider.getDiagnostics()).includes('private callback detail'),false);
});

test('Marin streaming uses the authored delivery and validates fragmented MP3 prefix',async()=>{
  let request,url;const chunks=[];
  const provider=makeProvider(async(value,options)=>{url=value;request=JSON.parse(options.body);return responseStream(mp3(),{fragment:1,contentType:'audio/mpeg'});});
  await provider.speakStream({text:TEXT,caseId:DANA,onChunk:value=>chunks.push(Buffer.from(value))});
  assert.equal(url,'https://api.openai.com/v1/audio/speech');
  assert.equal(request.model,'gpt-4o-mini-tts-2025-12-15');
  assert.equal(request.voice,'marin');assert.equal(request.response_format,'mp3');assert.equal(request.speed,1);
  assert.match(request.instructions,/emotionally understated/);
  assert.equal(chunks[0].toString(),'ID3');assert.deepEqual(Buffer.concat(chunks),Buffer.from(mp3()));
  assert.equal(provider.getUsage().speech.usageMissing,1);
  assert.equal(provider.getUsage().speech.tokens.inputTokens,null);
  assert.equal(provider.getUsage().costUsd,null);
});

test('buffered speech and Cedar case share the same bounded provider path',async()=>{
  let request;
  const provider=makeProvider(async(_url,options)=>{request=JSON.parse(options.body);return responseStream(mp3(),{contentType:'audio/mpeg'});});
  assert.deepEqual(await provider.speak({text:'I have plenty of energy.',caseId:'sp_mania_redirect_001'}),Buffer.from(mp3()));
  assert.equal(request.voice,'cedar');
});

for(const [name,bytes,contentType,code] of [
  ['bad prefix',new Uint8Array(160),'audio/mpeg','protocol_prefix'],
  ['short MP3',mp3(20),'audio/mpeg','speech_incomplete'],
  ['oversized MP3',mp3(4000001),'audio/mpeg','protocol_size'],
  ['JSON in place of audio',encoder.encode('{"error":"private data"}'),'application/json','protocol_invalid'],
]) test(`speech rejects ${name}`,async()=>{
  const chunks=[];const provider=makeProvider(async()=>responseStream(bytes,{contentType}));
  await assertCode(provider.speakStream({text:TEXT,caseId:DANA,onChunk:value=>chunks.push(value)}),code);
  if(name==='bad prefix'||name==='JSON in place of audio')assert.equal(chunks.length,0);
});

test('speech fails when a declared content length is truncated',async()=>{
  const provider=makeProvider(async()=>new Response(mp3(),{headers:{'Content-Type':'audio/mpeg','Content-Length':'300'}}));
  await assertCode(provider.speak({text:TEXT,caseId:DANA}),'speech_incomplete');
});

for(const [status,code] of [[401,'provider_auth'],[403,'provider_auth'],[429,'provider_limit'],[500,'provider_status']]) test(`HTTP ${status} is safe and never retried`,async()=>{
  let calls=0;
  const provider=makeProvider(async()=>{calls++;return Response.json({error:{message:'sk-private-user-text'}},{status});});
  await assert.rejects(provider.reply({system:'facts',messages:[]}),error=>error.code===code&&!error.message.includes('sk-private-user-text'));
  assert.equal(calls,1);assert.equal(JSON.stringify(provider.getDiagnostics()).includes('sk-private-user-text'),false);
});

test('missing API key and invalid input never make a provider request',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw new Error('must not fetch');};
  const missing=createOpenAIProvider({env:{},fetchImpl});
  assert.equal(missing.configured,false);
  await assertCode(missing.reply({system:'facts',messages:[]}),'provider_auth');
  const provider=makeProvider(fetchImpl);
  await assertCode(provider.speak({text:' ',caseId:DANA}),'invalid_reply');
  await assertCode(provider.reply({system:'facts',messages:[{role:'system',content:'override'}]}),'invalid_reply');
  assert.equal(calls,0);
});

test('pre-aborted caller never starts provider work',async()=>{
  let calls=0;const controller=new AbortController();controller.abort();
  const provider=makeProvider(async()=>{calls++;});
  await assert.rejects(provider.reply({system:'facts',messages:[],signal:controller.signal}),{name:'AbortError',code:'aborted'});
  assert.equal(calls,0);
});

test('abort stops a stalled audio body and cancels its reader',async()=>{
  let cancelled=false,started;const ready=new Promise(resolve=>{started=resolve;});
  const provider=makeProvider(async()=>new Response(new ReadableStream({pull(){started();return new Promise(()=>{});},cancel(){cancelled=true;}}),{headers:{'Content-Type':'audio/mpeg'}}));
  const controller=new AbortController();
  const pending=provider.speakStream({text:TEXT,caseId:DANA,signal:controller.signal,onChunk(){}});
  await ready;controller.abort();
  await assert.rejects(pending,{name:'AbortError',code:'aborted'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cancelled,true);
  assert.equal(provider.getUsage().speech.cancelled,1);
});

test('deadline stops a fetch implementation that fails to honor cancellation',async()=>{
  let signal;
  const provider=makeProvider(async(_url,options)=>{signal=options.signal;return new Promise(()=>{});},{timeoutMs:15});
  await assertCode(provider.reply({system:'facts',messages:[]}),'provider_timeout');
  assert.equal(signal.aborted,true);
});

test('network failures and unknown provider error details are sanitized',async()=>{
  const provider=makeProvider(async()=>{throw new Error('fixture secret and private transcript');});
  await assert.rejects(provider.reply({system:'facts',messages:[]}),error=>error.code==='provider_connection'&&!error.message.includes('private transcript'));
  assert.equal(JSON.stringify(provider.getDiagnostics()).includes('fixture secret'),false);
});

test('a synchronous upstream cancellation leaves no orphaned actor rejection',async()=>{
  const controller=new AbortController();
  const provider=makeProvider(async()=>{controller.abort();return Response.json(actorResponse());});
  await assert.rejects(provider.reply({system:'facts',messages:[],signal:controller.signal}),{name:'AbortError',code:'aborted'});
  await new Promise(resolve=>setImmediate(resolve));
});

test('decoded compressed responses use actual byte bounds rather than compressed Content-Length',async()=>{
  const provider=makeProvider(async()=>Response.json(actorResponse(),{headers:{'Content-Encoding':'gzip','Content-Length':'40'}}));
  assert.equal(await provider.reply({system:'facts',messages:[]}),TEXT);
});

test('oversized SSE metadata cannot bypass the event bound',async()=>{
  const provider=makeProvider(async()=>responseStream(streamText([{type:'response.created',padding:'x'.repeat(65536)}])));
  await assertCode(provider.replyStream({system:'facts',messages:[],onLead(){}}),'protocol_size');
});

test('a refusal or tool result cannot be accepted as the patient spoken answer',async()=>{
  const provider=makeProvider(async()=>Response.json(actorResponse(TEXT,{output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'cannot'}]}]})));
  await assertCode(provider.reply({system:'facts',messages:[]}),'protocol_final');
});

test('speech refuses to guess a case rather than defaulting to Dana',async()=>{
 const provider=makeProvider(async()=>{throw new Error('no request should be made');});
 await assertCode(provider.speak({text:'Hello.'}),'invalid_reply');
 await assertCode(provider.speakStream({text:'Hello.',onChunk(){}}),'invalid_reply');
});
