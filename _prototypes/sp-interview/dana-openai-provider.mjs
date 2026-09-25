import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TextDecoder} from 'node:util';
import {createRecordedSpeech} from './dana-recorded-speech.mjs';
import {createUsageCounter,normalizeUsage} from './dana-provider-usage.mjs';

const WORKER = fileURLToPath(new URL('./dana-openai-worker.py', import.meta.url));
const MAX_AUDIO = 4000000, MAX_STDOUT = 6000000, MAX_LINE = 8192;
const MAX_ACTOR_STDOUT = 65536, MAX_ACTOR_TEXT = 1200;
const DIAGNOSTIC_CATEGORIES=Object.freeze({provider_auth:'api',provider_limit:'api',provider_timeout:'api',provider_connection:'api',provider_status:'api',worker_startup:'runtime',worker_exit:'runtime',protocol_encoding:'protocol',protocol_size:'protocol',protocol_prefix:'protocol',protocol_final:'protocol',protocol_invalid:'protocol',actor_incomplete:'output',speech_incomplete:'output',callback_rejected:'caller',invalid_reply_prefix:'validation',invalid_reply:'validation',private_reply_blocked:'validation',invalid_audio:'validation',turn_timeout:'timeout',turn_cancelled:'cancellation',aborted:'cancellation',unknown:'internal'});
const SAFE_STAGES=new Set(['api','startup','exit','encoding','size','prefix','final','protocol','actor_output','speech_output','lead_callback','chunk_callback','abort','server_actor','server_speech','validation','unknown']);
function safeInteger(value,min,max,fallback){return Number.isFinite(value)?Math.min(max,Math.max(min,Math.trunc(value))):fallback;}
export function normalizeDiagnostic(error,{kind,stage,elapsedMs}={}){
  const code=typeof error?.code==='string'&&Object.hasOwn(DIAGNOSTIC_CATEGORIES,error.code)?error.code:'unknown';
  const value={kind:kind==='speech'?'speech':'actor',code,category:DIAGNOSTIC_CATEGORIES[code],stage:SAFE_STAGES.has(stage)?stage:(SAFE_STAGES.has(error?.stage)?error.stage:'unknown'),elapsedMs:safeInteger(elapsedMs,0,3600000,0)};
  if(code==='provider_status'&&Number.isInteger(error?.httpStatus)&&error.httpStatus>=400&&error.httpStatus<=599)value.httpStatus=error.httpStatus;
  if(code==='callback_rejected'&&typeof error?.causeCode==='string'&&Object.hasOwn(DIAGNOSTIC_CATEGORIES,error.causeCode))value.causeCode=error.causeCode;
  return value;
}
function diagnosticError(message,code,stage,options={}){const error=new Error(message);if(options.abort)error.name='AbortError';error.code=code;error.category=DIAGNOSTIC_CATEGORIES[code]||'internal';error.stage=stage;if(code==='provider_status'&&Number.isInteger(options.httpStatus)&&options.httpStatus>=400&&options.httpStatus<=599)error.httpStatus=options.httpStatus;return error;}
const mp3Prefix = bytes => bytes.length >= 3 && (bytes.subarray(0,3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224));
import {speechProfile,DANA_CASE_ID,MARIN_INSTRUCTIONS} from './conversation-speech-profiles.mjs';
export {MARIN_INSTRUCTIONS};

export function createOpenAIProvider({env=process.env, spawnImpl=spawn, recordedSpeech=createRecordedSpeech(fileURLToPath(new URL('../../', import.meta.url)))}={}) {
  const configured = Boolean(env.OPENAI_API_KEY);
  const usage = createUsageCounter();
  const diagnostics={counts:{actor:{},speech:{}},lastFailures:[]};
  function recordDiagnostic(error,kind,stage,startedAt){
    if(!error)return;
    const item=normalizeDiagnostic(error,{kind,stage,elapsedMs:Date.now()-startedAt}),counts=diagnostics.counts[item.kind];
    counts[item.code]=(counts[item.code]||0)+1;diagnostics.lastFailures.push(item);if(diagnostics.lastFailures.length>12)diagnostics.lastFailures.shift();
  }
  function diagnosticsSnapshot(){return JSON.parse(JSON.stringify(diagnostics));}
  function request(job, signal) {
    if (!configured) return Promise.reject(diagnosticError('Live Dana has no configured API key.','provider_auth','api'));
    if (signal?.aborted) return Promise.reject(diagnosticError('Cancelled','aborted','abort',{abort:true}));
    return new Promise((resolve,reject)=>{
      let settled=false, output=[],size=0,child,timer,reportedUsage=null,startedAt=Date.now();
      const kind=job.kind==='reply'?'actor':'speech';
      const finishUsage=usage.start(job.kind==='reply'?'actor':'speech');
      function finish(error,value){
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        finishUsage(error,reportedUsage);recordDiagnostic(error,kind,error?.stage,startedAt);
        if(error){child?.kill();reject(error);}else resolve(value);
      }
      function cancel(){finish(diagnosticError('Cancelled','aborted','abort',{abort:true}));}
      try {
        child=spawnImpl(env.DANA_PYTHON || 'python3',[WORKER],{
          env:{PATH:env.PATH,HOME:env.HOME,OPENAI_API_KEY:env.OPENAI_API_KEY,PYTHONIOENCODING:'utf-8'},
          stdio:['pipe','pipe','pipe'],
        });
        signal?.addEventListener('abort',cancel,{once:true});
        timer=setTimeout(()=>finish(diagnosticError('Live Dana took too long to respond. Please try again.','provider_timeout','api')),35000);
        child.stdout.on('data',chunk=>{size+=chunk.length;if(size>6000000)finish(diagnosticError('Live Dana returned an invalid response.','protocol_size','size'));else output.push(chunk);});
        // Deliberately do not retain or print stderr; SDK errors can include inputs.
        child.stderr.on('data',()=>{});
        child.on('error',()=>finish(diagnosticError('Live Dana could not start. Check the local speech runtime.','worker_startup','startup')));
        child.stdin.on('error',()=>finish(diagnosticError('Live Dana could not receive the request.','worker_startup','startup')));
        child.on('close',code=>{
          if(settled)return;
          try {
            if(code!==0){finish(diagnosticError('Live Dana returned an invalid response.','worker_exit','exit'));return;}
            const result=JSON.parse(Buffer.concat(output).toString('utf8'));
            reportedUsage=normalizeUsage(result?.usage);
            const messages={provider_auth:'Live Dana could not authenticate. Check the local API setup.',provider_limit:'Live Dana reached an API usage limit. Check your API credits or try again later.',provider_timeout:'Live Dana took too long to respond. Please try again.'};
            if(result.error){const diagnosticCode=Object.hasOwn(DIAGNOSTIC_CATEGORIES,result.diagnosticCode)?result.diagnosticCode:(result.error==='provider_auth'?'provider_auth':result.error==='provider_limit'?'provider_limit':result.error==='provider_timeout'?'provider_timeout':'unknown');finish(diagnosticError(messages[result.error] || 'Live Dana is temporarily unavailable. Please try again.',diagnosticCode,'api',{httpStatus:result.httpStatus}));return;}
            finish(null,result);
          }catch{finish(diagnosticError('Live Dana returned an invalid response.','protocol_invalid','protocol'));}
        });
        child.stdin.end(JSON.stringify(job));
        if(signal?.aborted)cancel();
      }catch{finish(diagnosticError('Live Dana could not start. Check the local speech runtime.','worker_startup','startup'));}
    });
  }
  function streamRequest(job, signal, onChunk) {
    if (!configured) return Promise.reject(diagnosticError('Live Dana has no configured API key.','provider_auth','api'));
    if (signal?.aborted) return Promise.reject(diagnosticError('Cancelled','aborted','abort',{abort:true}));
    return new Promise((resolve,reject)=>{
      let settled=false, child, timer, pending=Buffer.alloc(0), prefix=Buffer.alloc(0), reportedUsage=null, usageSeen=false,startedAt=Date.now();
      const finishUsage=usage.start('speech');
      let stdoutBytes=0, audioBytes=0, prefixVerified=false, done=false;
      const invalid=(code='protocol_invalid',stage='protocol')=>diagnosticError('Live Dana returned invalid streaming audio.',code,stage);
      function finish(error){
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        finishUsage(error,reportedUsage);recordDiagnostic(error,'speech',error?.stage,startedAt);
        if(error){child?.kill();reject(error);}else resolve();
      }
      function cancel(){finish(diagnosticError('Cancelled','aborted','abort',{abort:true}));}
      function receive(line){
        if(done || !line.length)throw invalid();
        if(line.length>MAX_LINE)throw invalid('protocol_size','size');
        let event;try{event=JSON.parse(line.toString('utf8'));}catch{throw invalid();}
        if(!event || typeof event!=='object' || Array.isArray(event))throw invalid();
        if(Object.keys(event).length===1 && Object.hasOwn(event,'usage')){
          if(usageSeen)throw invalid();usageSeen=true;reportedUsage=normalizeUsage(event.usage);return;
        }
        if(event.error){
          if(!usageSeen && Object.hasOwn(event,'usage')){usageSeen=true;reportedUsage=normalizeUsage(event.usage);}
          const messages={provider_auth:'Live Dana could not authenticate. Check the local API setup.',provider_limit:'Live Dana reached an API usage limit. Check your API credits or try again later.',provider_timeout:'Live Dana took too long to respond. Please try again.'};
          const code=Object.hasOwn(DIAGNOSTIC_CATEGORIES,event.diagnosticCode)?event.diagnosticCode:(event.error==='provider_auth'?'provider_auth':event.error==='provider_limit'?'provider_limit':event.error==='provider_timeout'?'provider_timeout':'unknown');finish(diagnosticError(messages[event.error] || 'Live Dana is temporarily unavailable. Please try again.',code,'api',{httpStatus:event.httpStatus}));return;
        }
        if(Object.keys(event).length===2 && event.done===true && Object.hasOwn(event,'bytes')){
          if(!Number.isSafeInteger(event.bytes) || event.bytes!==audioBytes || audioBytes<100 || !prefixVerified)throw invalid('protocol_final','final');
          done=true;return;
        }
        if(Object.keys(event).length!==1 || typeof event.chunk!=='string' || !event.chunk.length
          || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.chunk))throw invalid('protocol_encoding','encoding');
        const bytes=Buffer.from(event.chunk,'base64');
        if(!bytes.length || bytes.toString('base64')!==event.chunk)throw invalid('protocol_encoding','encoding');
        if(bytes.length>4096 || audioBytes+bytes.length>MAX_AUDIO)throw invalid('protocol_size','size');
        audioBytes+=bytes.length;
        if(!prefixVerified){
          prefix=Buffer.concat([prefix,bytes]);
          if(prefix.length<3)return;
          if(!mp3Prefix(prefix))throw invalid('protocol_prefix','prefix');
          prefixVerified=true;try{onChunk(prefix);}catch(cause){const error=diagnosticError('Live Dana could not deliver streaming audio.','callback_rejected','chunk_callback');if(typeof cause?.code==='string'&&Object.hasOwn(DIAGNOSTIC_CATEGORIES,cause.code))error.causeCode=cause.code;throw error;}prefix=Buffer.alloc(0);
        }else try{onChunk(bytes);}catch(cause){const error=diagnosticError('Live Dana could not deliver streaming audio.','callback_rejected','chunk_callback');if(typeof cause?.code==='string'&&Object.hasOwn(DIAGNOSTIC_CATEGORIES,cause.code))error.causeCode=cause.code;throw error;}
      }
      try {
        child=spawnImpl(env.DANA_PYTHON || 'python3',[WORKER],{
          env:{PATH:env.PATH,HOME:env.HOME,OPENAI_API_KEY:env.OPENAI_API_KEY,PYTHONIOENCODING:'utf-8'},
          stdio:['pipe','pipe','pipe'],
        });
        signal?.addEventListener('abort',cancel,{once:true});
        timer=setTimeout(()=>finish(diagnosticError('Live Dana took too long to respond. Please try again.','provider_timeout','api')),35000);
        child.stdout.on('data',chunk=>{
          if(settled)return;
          try {
            if(!Buffer.isBuffer(chunk))throw invalid('protocol_encoding','encoding');
            if((stdoutBytes+=chunk.length)>MAX_STDOUT)throw invalid('protocol_size','size');
            pending=Buffer.concat([pending,chunk]);
            let newline;
            while(!settled && (newline=pending.indexOf(10))>=0){
              const line=pending.subarray(0,newline);pending=pending.subarray(newline+1);receive(line);
            }
            if(!settled && pending.length>MAX_LINE)throw invalid('protocol_size','size');
          }catch(error){finish(Object.hasOwn(DIAGNOSTIC_CATEGORIES,error?.code)?error:invalid());}
        });
        child.stderr.on('data',()=>{});
        child.on('error',()=>finish(diagnosticError('Live Dana could not start. Check the local speech runtime.','worker_startup','startup')));
        child.stdin.on('error',()=>finish(diagnosticError('Live Dana could not receive the request.','worker_startup','startup')));
        child.on('close',code=>{
          if(settled)return;
          if(code!==0)finish(diagnosticError('Live Dana returned invalid streaming audio.','worker_exit','exit'));else if(!done)finish(diagnosticError('Live Dana returned invalid streaming audio.','speech_incomplete','speech_output'));else if(pending.length)finish(invalid('protocol_final','final'));else finish();
        });
        child.stdin.end(JSON.stringify(job));
        if(signal?.aborted)cancel();
      }catch{finish(diagnosticError('Live Dana could not start. Check the local speech runtime.','worker_startup','startup'));}
    });
  }
  function actorStreamRequest(job, signal, onLead) {
    if (!configured) return Promise.reject(diagnosticError('Live Dana has no configured API key.','provider_auth','api'));
    if (signal?.aborted) return Promise.reject(diagnosticError('Cancelled','aborted','abort',{abort:true}));
    return new Promise((resolve,reject)=>{
      let settled=false, child, timer, pending=Buffer.alloc(0), stdoutBytes=0, reportedUsage=null, usageSeen=false,startedAt=Date.now();
      const finishUsage=usage.start('actor');
      let accumulated='', lead=null, finalText=null, done=false;
      const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
      const invalid=(code='protocol_invalid',stage='protocol')=>diagnosticError('Live Dana returned an invalid streaming reply.',code,stage);
      function finish(error){
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        finishUsage(error,reportedUsage);recordDiagnostic(error,'actor',error?.stage,startedAt);
        if(error){child?.kill();reject(error);}else resolve(finalText);
      }
      function cancel(){finish(diagnosticError('Cancelled','aborted','abort',{abort:true}));}
      function receive(line){
        if(done || !line.length)throw invalid();
        if(line.length>MAX_LINE)throw invalid('protocol_size','size');
        let decoded;try{decoded=decoder.decode(line);}catch{throw invalid('protocol_encoding','encoding');}
        let event;try{event=JSON.parse(decoded);}catch{throw invalid();}
        if(!event || typeof event!=='object' || Array.isArray(event))throw invalid();
        if(Object.keys(event).length===1 && Object.hasOwn(event,'usage')){
          if(usageSeen)throw invalid();usageSeen=true;reportedUsage=normalizeUsage(event.usage);return;
        }
        if(event.error){
          if(!usageSeen && Object.hasOwn(event,'usage')){usageSeen=true;reportedUsage=normalizeUsage(event.usage);}
          const messages={provider_auth:'Live Dana could not authenticate. Check the local API setup.',provider_limit:'Live Dana reached an API usage limit. Check your API credits or try again later.',provider_timeout:'Live Dana took too long to respond. Please try again.'};
          const code=Object.hasOwn(DIAGNOSTIC_CATEGORIES,event.diagnosticCode)?event.diagnosticCode:(event.error==='provider_auth'?'provider_auth':event.error==='provider_limit'?'provider_limit':event.error==='provider_timeout'?'provider_timeout':'unknown');finish(diagnosticError(messages[event.error] || 'Live Dana is temporarily unavailable. Please try again.',code,'api',{httpStatus:event.httpStatus}));return;
        }
        const keys=Object.keys(event);
        if(keys.length===1 && typeof event.delta==='string'){
          if(!event.delta.length)throw invalid();
          if(accumulated.length+event.delta.length>MAX_ACTOR_TEXT)throw invalid('protocol_size','size');
          accumulated+=event.delta;return;
        }
        if(keys.length===1 && typeof event.lead==='string'){
          const value=event.lead;
          if(lead!==null || value.length<20 || value.length>900 || value.trim()!==value
            || !/[.!?][”’"']?$/.test(value) || (value.match(/[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*/gu)||[]).length<4
            || !accumulated.trimStart().startsWith(value))throw invalid('protocol_prefix','prefix');
          lead=value;
          // This is a private prefetch notification, never permission to play audio.
          try{onLead(value);}catch(cause){const error=diagnosticError('Live Dana returned an invalid streaming reply.','callback_rejected','lead_callback');if(typeof cause?.code==='string'&&Object.hasOwn(DIAGNOSTIC_CATEGORIES,cause.code))error.causeCode=cause.code;throw error;}return;
        }
        if(keys.length===3 && event.done===true && Object.hasOwn(event,'text') && Object.hasOwn(event,'lead')){
          if(typeof event.text!=='string' || !event.text.length || event.text.length>900 || event.text.trim()!==event.text
            || event.text!==accumulated.trim() || event.lead!==lead || (lead!==null && !event.text.startsWith(lead)))throw invalid('protocol_final','final');
          finalText=event.text;done=true;return;
        }
        throw invalid();
      }
      try {
        child=spawnImpl(env.DANA_PYTHON || 'python3',[WORKER],{
          env:{PATH:env.PATH,HOME:env.HOME,OPENAI_API_KEY:env.OPENAI_API_KEY,PYTHONIOENCODING:'utf-8'},
          stdio:['pipe','pipe','pipe'],
        });
        signal?.addEventListener('abort',cancel,{once:true});
        timer=setTimeout(()=>finish(diagnosticError('Live Dana took too long to respond. Please try again.','provider_timeout','api')),35000);
        child.stdout.on('data',chunk=>{
          if(settled)return;
          try {
            if(!Buffer.isBuffer(chunk))throw invalid('protocol_encoding','encoding');
            if((stdoutBytes+=chunk.length)>MAX_ACTOR_STDOUT)throw invalid('protocol_size','size');
            pending=Buffer.concat([pending,chunk]);
            let newline;
            while(!settled && (newline=pending.indexOf(10))>=0){
              const line=pending.subarray(0,newline);pending=pending.subarray(newline+1);receive(line);
            }
            if(!settled && pending.length>MAX_LINE)throw invalid('protocol_size','size');
          }catch(error){finish(Object.hasOwn(DIAGNOSTIC_CATEGORIES,error?.code)?error:invalid());}
        });
        // Deliberately discard diagnostics, which may contain case text or secrets.
        child.stderr.on('data',()=>{});
        child.on('error',()=>finish(diagnosticError('Live Dana could not start. Check the local speech runtime.','worker_startup','startup')));
        child.stdin.on('error',()=>finish(diagnosticError('Live Dana could not receive the request.','worker_startup','startup')));
        child.on('close',code=>{
          if(settled)return;
          if(code!==0)finish(diagnosticError('Live Dana returned an invalid streaming reply.','worker_exit','exit'));else if(!done)finish(diagnosticError('Live Dana returned an invalid streaming reply.','actor_incomplete','actor_output'));else if(pending.length)finish(invalid('protocol_final','final'));else finish();
        });
        child.stdin.end(JSON.stringify(job));
        if(signal?.aborted)cancel();
      }catch{finish(diagnosticError('Live Dana could not start. Check the local speech runtime.','worker_startup','startup'));}
    });
  }
  return {
    configured,
    getUsage:()=>usage.snapshot(),
    getDiagnostics:diagnosticsSnapshot,
    async reply({system,messages,signal}){
      const data=await request({kind:'reply',system,messages},signal);
      if(typeof data.text!=='string' || !data.text.trim() || data.text.length>900)throw new Error('Live Dana returned an invalid reply.');
      return data.text.trim();
    },
    async replyStream({system,messages,signal,onLead}){
      if(typeof onLead!=='function')throw new Error('Invalid patient reply request.');
      return actorStreamRequest({kind:'reply_stream',system,messages},signal,onLead);
    },
    async speak({text,signal,caseId=DANA_CASE_ID}){
      const profile=speechProfile(caseId);
      if(typeof text!=='string'||!text.trim()||text.length>900)throw new Error('Invalid patient reply.');
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      const cached=caseId===DANA_CASE_ID ? await recordedSpeech(text) : null;
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      if(cached){usage.recordingHit();return cached;}
      const data=await request({kind:'speech',text,instructions:profile.instructions,...(caseId===DANA_CASE_ID?{}:{voice:profile.voice})},signal);
      if(typeof data.audio!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.audio))throw new Error('Live Dana returned invalid audio.');
      const bytes=Buffer.from(data.audio,'base64');
      if(bytes.length<100||bytes.length>4000000||!(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224)))throw new Error('Live Dana returned invalid audio.');
      return bytes;
    },
    async speakStream({text,signal,onChunk,caseId=DANA_CASE_ID}){
      const profile=speechProfile(caseId);
      if(typeof text!=='string'||!text.trim()||text.length>900||typeof onChunk!=='function')throw new Error('Invalid patient speech request.');
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      const cached=caseId===DANA_CASE_ID ? await recordedSpeech(text) : null;
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      if(cached){
        if(!Buffer.isBuffer(cached)||cached.length<100||cached.length>MAX_AUDIO||!mp3Prefix(cached))throw new Error('Live Dana returned invalid streaming audio.');
        try{onChunk(Buffer.from(cached));}catch{throw new Error('Live Dana could not deliver streaming audio.');}
        if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
        usage.recordingHit();return;
      }
      await streamRequest({kind:'speech_stream',text,instructions:profile.instructions,...(caseId===DANA_CASE_ID?{}:{voice:profile.voice})},signal,onChunk);
    },
  };
}
