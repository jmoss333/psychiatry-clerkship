import {speechProfile, DANA_CASE_ID} from '../../_prototypes/sp-interview/conversation-speech-profiles.mjs';
import {createUsageCounter, normalizeUsage} from '../../_prototypes/sp-interview/dana-provider-usage.mjs';

const BASE_URL = 'https://api.openai.com/v1';
const ACTOR_MODEL = 'gpt-5.4-2026-03-05';
const SPEECH_MODEL = 'gpt-4o-mini-tts-2025-12-15';
const MAX_REPLY = 900;
const MAX_ACTOR_TEXT = 1200;
const MAX_ACTOR_BYTES = 256 * 1024;
const MAX_EVENT_BYTES = 64 * 1024;
const MAX_AUDIO = 4_000_000;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ABBREVIATIONS = new Set(['dr','mr','mrs','ms','prof','st','vs','etc','e.g','i.e','a.m','p.m','u.s']);
const CATEGORIES = Object.freeze({provider_auth:'api',provider_limit:'api',provider_timeout:'api',provider_connection:'api',provider_status:'api',protocol_encoding:'protocol',protocol_size:'protocol',protocol_prefix:'protocol',protocol_final:'protocol',protocol_invalid:'protocol',actor_incomplete:'output',speech_incomplete:'output',callback_rejected:'caller',invalid_reply:'validation',aborted:'cancellation'});
const MESSAGES = Object.freeze({provider_auth:'The preview could not authenticate with the speech provider.',provider_limit:'The preview reached a provider usage limit.',provider_timeout:'The preview response took too long. Please try again.',provider_connection:'The preview could not reach the speech provider.',provider_status:'The speech provider could not complete the request.',protocol_encoding:'The provider returned invalid encoded data.',protocol_size:'The provider response exceeded the preview limit.',protocol_prefix:'The provider returned an invalid response prefix.',protocol_final:'The provider returned inconsistent final content.',protocol_invalid:'The provider returned an invalid response.',actor_incomplete:'The patient response did not finish.',speech_incomplete:'The spoken response did not finish.',callback_rejected:'The preview could not deliver the response.',invalid_reply:'The preview request is invalid.',aborted:'The preview request was cancelled.'});

class ProviderError extends Error {
  constructor(code,stage='api',httpStatus) {
    super(MESSAGES[code]);
    this.name=code==='aborted'?'AbortError':'ProviderError';
    this.code=code;this.category=CATEGORIES[code];this.stage=stage;
    if(code==='provider_status'&&Number.isInteger(httpStatus))this.httpStatus=httpStatus;
  }
}
const fail = (code,stage,httpStatus) => new ProviderError(code,stage,httpStatus);
const mp3Prefix = bytes => bytes.length>=3&&((bytes[0]===73&&bytes[1]===68&&bytes[2]===51)||(bytes[0]===255&&(bytes[1]&224)===224));
const checkSignal = signal => {if(signal.aborted)throw signal.reason instanceof ProviderError?signal.reason:fail('aborted','abort');};
function json(text) {try{return JSON.parse(text);}catch{throw fail('protocol_invalid','protocol');}}

// Match the established local heuristic exactly: short acknowledgements attach
// to the first substantive sentence; an unfinished sentence is never prefetched.
export function firstSubstantiveSentence(value) {
  const text=value.trimStart();let segmentStart=0;
  for(const match of text.matchAll(/[.!?][”’"']?/g)) {
    const punctuation=match.index,end=punctuation+match[0].length;
    if(end===text.length||!(/\s/u.test(text[end])))continue;
    if(text[punctuation]==='.') {
      if(text[punctuation-1]==='.'||text[punctuation+1]==='.')continue;
      const token=text.slice(0,punctuation+1).match(/([A-Za-z][A-Za-z.]*)\.$/);
      if(token&&(ABBREVIATIONS.has(token[1].toLowerCase())||token[1].length===1))continue;
    }
    const segment=text.slice(segmentStart,end).trim();
    const words=segment.match(/[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*/gu)||[];
    if(words.length>=4&&segment.length>=20)return text.slice(0,end);
    segmentStart=end;
  }
  return null;
}

function actorInput(system,messages,stream) {
  if(typeof system!=='string'||!system.trim()||CONTROL.test(system)||!Array.isArray(messages)||messages.length>21)throw fail('invalid_reply','validation');
  for(const message of messages) {
    if(!message||Array.isArray(message)||Object.keys(message).length!==2||!Object.hasOwn(message,'role')||!Object.hasOwn(message,'content')
      ||!['user','assistant'].includes(message.role)||typeof message.content!=='string'||!message.content.trim()||message.content.length>MAX_ACTOR_TEXT||CONTROL.test(message.content))throw fail('invalid_reply','validation');
  }
  const value={model:ACTOR_MODEL,instructions:system,input:messages,store:false,max_output_tokens:768,reasoning:{effort:'low'},...(stream?{stream:true}:{})};
  if(Buffer.byteLength(JSON.stringify(value))>200_000)throw fail('invalid_reply','validation');
  return value;
}

function speechInput(text,caseId) {
  if(typeof text!=='string'||!text.trim()||text.length>MAX_REPLY||CONTROL.test(text))throw fail('invalid_reply','validation');
  let profile;try{profile=speechProfile(caseId);}catch{throw fail('invalid_reply','validation');}
  return {model:SPEECH_MODEL,voice:profile.voice,input:text,instructions:profile.instructions,response_format:'mp3',speed:1.0};
}

function providerUsage(value) {
  if(!value||typeof value!=='object')return null;
  return normalizeUsage({inputTokens:value.input_tokens,cachedInputTokens:value.input_tokens_details?.cached_tokens,cacheWriteTokens:value.input_tokens_details?.cache_write_tokens,outputTokens:value.output_tokens,reasoningTokens:value.output_tokens_details?.reasoning_tokens,totalTokens:value.total_tokens});
}

function finalActorText(response) {
  if(!response||response.status!=='completed'||!Array.isArray(response.output))throw fail('actor_incomplete','actor_output');
  let text='';
  for(const item of response.output) {
    if(item?.type==='reasoning')continue;
    if(item?.type!=='message'||item.role!=='assistant'||!Array.isArray(item.content))throw fail('protocol_final','final');
    for(const part of item.content) {
      if(part?.type!=='output_text'||typeof part.text!=='string')throw fail('protocol_final','final');
      text+=part.text;
    }
  }
  if(!text.trim())throw fail('actor_incomplete','actor_output');
  if(text.trim().length>MAX_REPLY||text.length>MAX_ACTOR_TEXT)throw fail('protocol_size','size');
  return text;
}

function abortable(promise,signal) {
  // The upstream can synchronously trigger cancellation before this race is
  // attached. Always observe its eventual rejection, including that narrow gap.
  const operation=Promise.resolve(promise);
  if(signal.aborted) {
    operation.catch(()=>{});
    return Promise.reject(signal.reason instanceof ProviderError?signal.reason:fail('aborted','abort'));
  }
  let onAbort;
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(signal.reason instanceof ProviderError?signal.reason:fail('aborted','abort'));signal.addEventListener('abort',onAbort,{once:true});});
  return Promise.race([operation,cancelled]).finally(()=>signal.removeEventListener('abort',onAbort));
}

async function readChunks(response,signal,limit,receive) {
  if(!response.body||typeof response.body.getReader!=='function')throw fail('protocol_invalid','protocol');
  // Fetch exposes decoded bytes but may retain the compressed Content-Length.
  // Actual bytes remain bounded regardless of transport content encoding.
  const encoding=response.headers.get('content-encoding');
  const lengthHeader=encoding&&encoding.toLowerCase()!=='identity'?null:response.headers.get('content-length');
  const expected=lengthHeader===null?null:/^\d+$/.test(lengthHeader)?Number(lengthHeader):NaN;
  if(expected!==null&&(!Number.isSafeInteger(expected)||expected<0))throw fail('protocol_invalid','protocol');
  if(expected!==null&&expected>limit)throw fail('protocol_size','size');
  const reader=response.body.getReader();let bytes=0,finished=false;
  const cancel=()=>{reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    checkSignal(signal);
    while(true) {
      const part=await abortable(reader.read(),signal);checkSignal(signal);
      if(part.done){finished=true;break;}
      if(!(part.value instanceof Uint8Array))throw fail('protocol_encoding','encoding');
      if(!part.value.byteLength)continue;
      bytes+=part.value.byteLength;
      if(bytes>limit)throw fail('protocol_size','size');
      receive(part.value);
    }
    if(expected!==null&&bytes!==expected)throw fail('speech_incomplete','speech_output');
    return bytes;
  } finally {
    signal.removeEventListener('abort',cancel);
    if(!finished)cancel();
    try{reader.releaseLock();}catch{}
  }
}

async function readJson(response,signal) {
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw fail('protocol_invalid','protocol');
  const chunks=[];await readChunks(response,signal,MAX_ACTOR_BYTES,value=>chunks.push(value));
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));}catch{throw fail('protocol_encoding','encoding');}
  return json(text);
}

async function readActorStream(response,signal,onLead,setUsage) {
  if(!/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw fail('protocol_invalid','protocol');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let pending='',data=[],eventBytes=0,accumulated='',lead=null,finalText=null,completed=false;
  function receiveEvent() {
    if(!data.length){eventBytes=0;return;}
    const payload=data.join('\n');data=[];eventBytes=0;
    if(payload==='[DONE]') {if(!completed)throw fail('actor_incomplete','actor_output');return;}
    const event=json(payload);
    if(!event||Array.isArray(event)||typeof event.type!=='string')throw fail('protocol_invalid','protocol');
    if(completed)throw fail('protocol_final','final');
    if(event.type==='response.output_text.delta') {
      if(typeof event.delta!=='string')throw fail('protocol_encoding','encoding');
      if(!event.delta)return;
      accumulated+=event.delta;
      if(accumulated.length>MAX_ACTOR_TEXT)throw fail('protocol_size','size');
      if(lead===null) {
        const candidate=firstSubstantiveSentence(accumulated);
        if(candidate!==null) {
          if(candidate.length>MAX_REPLY)throw fail('protocol_size','size');
          lead=candidate;
          // Only private prefetch is allowed here. The handler must validate
          // the final reply before releasing any generated audio to the client.
          try{onLead(candidate);}catch{throw fail('callback_rejected','lead_callback');}
        }
      }
    } else if(event.type==='response.completed') {
      setUsage(providerUsage(event.response?.usage));
      const text=finalActorText(event.response);
      if(text!==accumulated||(lead!==null&&!text.trim().startsWith(lead)))throw fail('protocol_final','final');
      finalText=text.trim();completed=true;
    } else if(['response.failed','response.incomplete','error'].includes(event.type)) {
      setUsage(providerUsage(event.response?.usage));
      throw fail('actor_incomplete','actor_output');
    }
  }
  function receiveText(text) {
    pending+=text;
    let newline;
    while((newline=pending.indexOf('\n'))>=0) {
      let line=pending.slice(0,newline);pending=pending.slice(newline+1);
      if(line.endsWith('\r'))line=line.slice(0,-1);
      eventBytes+=Buffer.byteLength(line)+1;
      if(eventBytes>MAX_EVENT_BYTES)throw fail('protocol_size','size');
      if(line==='')receiveEvent();
      else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
    }
    if(Buffer.byteLength(pending)+eventBytes>MAX_EVENT_BYTES)throw fail('protocol_size','size');
  }
  await readChunks(response,signal,MAX_ACTOR_BYTES,chunk=>{
    let text;try{text=decoder.decode(chunk,{stream:true});}catch{throw fail('protocol_encoding','encoding');}
    receiveText(text);
  });
  let tail;try{tail=decoder.decode();}catch{throw fail('protocol_encoding','encoding');}
  receiveText(tail);
  if(pending.length||data.length)throw fail('protocol_final','final');
  if(!completed)throw fail('actor_incomplete','actor_output');
  return finalText;
}

async function readSpeech(response,signal,onChunk) {
  if(!/^audio\/(?:mpeg|mp3)(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw fail('protocol_invalid','protocol');
  let prefix=Buffer.alloc(0),verified=false;
  const bytes=await readChunks(response,signal,MAX_AUDIO,chunk=>{
    const value=Buffer.from(chunk);
    if(!verified) {
      prefix=Buffer.concat([prefix,value]);
      if(prefix.length<3)return;
      if(!mp3Prefix(prefix))throw fail('protocol_prefix','prefix');
      verified=true;
      try{onChunk(prefix);}catch{throw fail('callback_rejected','chunk_callback');}
      prefix=Buffer.alloc(0);
    } else try{onChunk(value);}catch{throw fail('callback_rejected','chunk_callback');}
  });
  if(!verified||bytes<100)throw fail('speech_incomplete','speech_output');
}

export function createOpenAIProvider({env=process.env,fetchImpl=globalThis.fetch,timeoutMs=30_000}={}) {
  if(typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>45_000)throw fail('invalid_reply','validation');
  const configured=typeof env?.OPENAI_API_KEY==='string'&&env.OPENAI_API_KEY.trim().length>0;
  const usage=createUsageCounter();
  const diagnostics={counts:{actor:{},speech:{}},lastFailures:[]};
  async function request(kind,path,input,callerSignal,consume) {
    if(!configured)throw fail('provider_auth','api');
    if(callerSignal?.aborted)throw fail('aborted','abort');
    const controller=new AbortController(),startedAt=Date.now();
    const abort=()=>controller.abort(fail('aborted','abort'));
    callerSignal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(fail('provider_timeout','api')),timeoutMs);
    const finishUsage=usage.start(kind);let reportedUsage=null,error=null;
    const job=async()=>{
      const response=await fetchImpl(`${BASE_URL}${path}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.OPENAI_API_KEY}`},body:JSON.stringify(input),signal:controller.signal});
      checkSignal(controller.signal);
      if(!response||!Number.isInteger(response.status))throw fail('protocol_invalid','protocol');
      if(response.status<200||response.status>=300) {
        // Provider response bodies can contain inputs or credentials; discard.
        response.body?.cancel().catch(()=>{});
        throw fail(response.status===401||response.status===403?'provider_auth':response.status===429?'provider_limit':'provider_status','api',response.status);
      }
      return consume(response,controller.signal,value=>{reportedUsage=value;});
    };
    try{return await abortable(job(),controller.signal);}
    catch(cause) {
      error=controller.signal.aborted?controller.signal.reason:cause instanceof ProviderError?cause:fail('provider_connection','api');
      if(!(error instanceof ProviderError))error=fail('provider_connection','api');
      if(!controller.signal.aborted)controller.abort(error);
      const record={kind,code:error.code,category:error.category,stage:error.stage,elapsedMs:Math.max(0,Date.now()-startedAt),...(error.httpStatus?{httpStatus:error.httpStatus}:{})};
      diagnostics.counts[kind][error.code]=(diagnostics.counts[kind][error.code]||0)+1;
      diagnostics.lastFailures.push(record);if(diagnostics.lastFailures.length>12)diagnostics.lastFailures.shift();
      throw error;
    } finally {
      clearTimeout(timer);callerSignal?.removeEventListener('abort',abort);finishUsage(error,reportedUsage);
    }
  }
  return {
    configured,
    getUsage:()=>usage.snapshot(),
    getDiagnostics:()=>structuredClone(diagnostics),
    async reply({system,messages,signal}={}) {
      const input=actorInput(system,messages,false);
      return request('actor','/responses',input,signal,async(response,signal,setUsage)=>{const value=await readJson(response,signal);setUsage(providerUsage(value?.usage));return finalActorText(value).trim();});
    },
    async replyStream({system,messages,signal,onLead}={}) {
      if(typeof onLead!=='function')throw fail('invalid_reply','validation');
      const input=actorInput(system,messages,true);
      return request('actor','/responses',input,signal,(response,signal,setUsage)=>readActorStream(response,signal,onLead,setUsage));
    },
    async speak({text,signal,caseId=DANA_CASE_ID}={}) {
      const chunks=[];
      await request('speech','/audio/speech',speechInput(text,caseId),signal,(response,signal)=>readSpeech(response,signal,chunk=>chunks.push(chunk)));
      return Buffer.concat(chunks);
    },
    async speakStream({text,signal,onChunk,caseId=DANA_CASE_ID}={}) {
      if(typeof onChunk!=='function')throw fail('invalid_reply','validation');
      return request('speech','/audio/speech',speechInput(text,caseId),signal,(response,signal)=>readSpeech(response,signal,onChunk));
    },
  };
}
