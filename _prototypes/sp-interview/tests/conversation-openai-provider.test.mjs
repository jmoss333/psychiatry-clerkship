import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createOpenAIProvider,MARIN_INSTRUCTIONS,normalizeDiagnostic} from '../dana-openai-provider.mjs';

const worker=fileURLToPath(new URL('../dana-openai-worker.py',import.meta.url));
const ENV={OPENAI_API_KEY:'synthetic-test-key',DANA_PYTHON:'fake-python',PATH:'/fake/path',HOME:'/fake/home',UNRELATED_SECRET:'must-not-propagate'};
function harness(onJob,overrides={}) {
  const calls=[],children=[];
  const spawnImpl=(command,args,options)=>{
    const child=new EventEmitter();child.stdin=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kills=0;
    child.kill=()=>{child.kills++;return true;};
    child.respond=value=>{child.stdout.emit('data',Buffer.from(JSON.stringify(value)));child.emit('close',0);};
    child.stdin.end=text=>{child.job=JSON.parse(text);queueMicrotask(()=>onJob?.(child));};
    calls.push({command,args,options});children.push(child);return child;
  };
  return {provider:createOpenAIProvider({env:ENV,spawnImpl,recordedSpeech:async()=>null,...overrides}),calls,children};
}
const input=()=>({system:'Synthetic Dana case instructions',messages:[{role:'user',content:'How are you?'}]});
const mp3=()=>Buffer.concat([Buffer.from('ID3'),Buffer.alloc(197)]);
const frame=value=>Buffer.from(JSON.stringify(value)+'\n');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

const leadText='Okay. I have been feeling really tired.';
const fullText=leadText+' It has been hard to get started.';

test('safe diagnostics retain only allowlisted failure metadata and bounded counters',async()=>{
  const h=harness(),pending=h.provider.replyStream({...input(),onLead(){throw new Error('malicious prompt api-key provider/session-id');}});
  const rejected=assert.rejects(pending,error=>error.code==='callback_rejected'&&error.category==='caller'&&!JSON.stringify(error).includes('malicious'));
  await tick();h.children[0].stdout.emit('data',Buffer.concat([frame({delta:leadText+' '}),frame({lead:leadText})]));await rejected;
  const snapshot=h.provider.getDiagnostics();
  assert.deepEqual(snapshot.counts.actor,{callback_rejected:1});assert.equal(snapshot.lastFailures.length,1);
  assert.deepEqual(Object.keys(snapshot.lastFailures[0]).sort(),['category','code','elapsedMs','kind','stage']);
  assert.equal(snapshot.lastFailures[0].stage,'lead_callback');assert.ok(!JSON.stringify(snapshot).includes('malicious'));
  snapshot.counts.actor.callback_rejected=99;snapshot.lastFailures.length=0;
  assert.equal(h.provider.getDiagnostics().counts.actor.callback_rejected,1);assert.equal(h.provider.getDiagnostics().lastFailures.length,1);
});

test('normalization drops malicious fields and unknown codes while preserving safe status',()=>{
  const error=Object.assign(new Error('secret prompt and key'),{code:'provider_status',category:'forged',stage:'forged',httpStatus:503,providerId:'secret'});
  assert.deepEqual(normalizeDiagnostic(error,{kind:'actor',stage:'server_actor',elapsedMs:12.9}),{kind:'actor',code:'provider_status',category:'api',stage:'server_actor',elapsedMs:12,httpStatus:503});
  assert.deepEqual(normalizeDiagnostic(Object.assign(new Error('secret'),{code:'evil',httpStatus:999}),{kind:'speech',stage:'validation',elapsedMs:-1}),{kind:'speech',code:'unknown',category:'internal',stage:'validation',elapsedMs:0});
  assert.deepEqual(normalizeDiagnostic({code:'callback_rejected',causeCode:'private_reply_blocked',message:'secret'},{kind:'actor',stage:'server_actor',elapsedMs:7}),{kind:'actor',code:'callback_rejected',category:'caller',stage:'server_actor',elapsedMs:7,causeCode:'private_reply_blocked'});
  assert.deepEqual(normalizeDiagnostic({code:'turn_cancelled'},{kind:'speech',stage:'server_speech'}),{kind:'speech',code:'turn_cancelled',category:'cancellation',stage:'server_speech',elapsedMs:0});
});

test('worker diagnostic codes survive streamed normalization without exposing provider detail',async()=>{
  const h=harness(),pending=h.provider.replyStream({...input(),onLead(){}});
  const rejected=assert.rejects(pending,error=>error.code==='provider_connection'&&error.category==='api'&&!error.message.includes('host-secret'));
  await tick();h.children[0].stdout.emit('data',frame({error:'provider_unavailable',diagnosticCode:'provider_connection',detail:'host-secret'}));await rejected;
  assert.equal(h.provider.getDiagnostics().lastFailures[0].code,'provider_connection');
  assert.ok(!JSON.stringify(h.provider.getDiagnostics()).includes('host-secret'));
});

test('actor streaming announces one exact substantive lead before final reply and clean exit',async()=>{
  const h=harness(),leads=[];let finished=false;
  const pending=h.provider.replyStream({...input(),onLead:text=>leads.push(text)}).then(text=>{finished=true;return text;});
  await tick();const child=h.children[0];
  assert.deepEqual(child.job,{kind:'reply_stream',...input()});
  child.stdout.emit('data',frame({delta:leadText+' '}));
  child.stdout.emit('data',frame({lead:leadText}));
  assert.deepEqual(leads,[leadText]);assert.equal(finished,false);
  child.stdout.emit('data',frame({delta:'It has been hard to get started.'}));
  child.stdout.emit('data',frame({done:true,text:fullText,lead:leadText}));
  await tick();assert.equal(finished,false);
  child.emit('close',0);assert.equal(await pending,fullText);assert.deepEqual(leads,[leadText]);
  assert.equal(h.children[0].kills,0);assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].options.env.UNRELATED_SECRET,undefined);
  assert.ok(!JSON.stringify(child.job).includes(ENV.OPENAI_API_KEY));
});

test('actor NDJSON preserves fragmented UTF-8 exactly and accepts a final reply without an early lead',async()=>{
  const text='I’m tired, but I’m listening.';
  const h=harness(),leads=[];
  const pending=h.provider.replyStream({...input(),onLead:part=>leads.push(part)});
  await tick();const child=h.children[0];
  const output=Buffer.concat([frame({delta:'  I’m tired,'}),frame({delta:' but I’m listening.  '}),frame({done:true,text,lead:null})]);
  for(let index=0;index<output.length;index++)child.stdout.emit('data',output.subarray(index,index+1));
  child.emit('close',0);assert.equal(await pending,text);assert.deepEqual(leads,[]);
});

test('actor stream rejects mismatches, partial failures and missing or dirty completion after a lead',async()=>{
  for(const finish of [
    child=>child.stdout.emit('data',frame({error:'provider_limit',detail:'secret provider diagnostic'})),
    child=>child.stdout.emit('data',frame({lead:leadText})),
    child=>child.stdout.emit('data',frame({done:true,text:'A different final response.',lead:leadText})),
    child=>child.stdout.emit('data',frame({done:true,text:leadText,lead:null})),
    child=>child.stdout.emit('data',frame({done:true,text:leadText,lead:'Okay.'})),
    child=>child.emit('close',0),
    child=>{child.stdout.emit('data',frame({done:true,text:leadText,lead:leadText}));child.emit('close',1);},
    child=>{child.stdout.emit('data',frame({done:true,text:leadText,lead:leadText}));child.stdout.emit('data',frame({delta:' Late.'}));},
    child=>{child.stdout.emit('data',frame({done:true,text:leadText,lead:leadText}));child.stdout.emit('data',Buffer.from('partial'));child.emit('close',0);},
  ]){
    const h=harness(),leads=[];
    const pending=h.provider.replyStream({...input(),onLead:text=>leads.push(text)});
    const rejection=assert.rejects(pending,error=>!error.message.includes('secret'));
    await tick();const child=h.children[0];
    child.stdout.emit('data',frame({delta:leadText+' '}));child.stdout.emit('data',frame({lead:leadText}));finish(child);
    await rejection;assert.deepEqual(leads,[leadText]);assert.equal(child.kills,1);assert.equal(h.calls.length,1);
  }
});

test('actor stream rejects invalid lead, protocol shape, UTF-8 and bounded text without unsafe callbacks',async()=>{
  for(const data of [
    frame({lead:leadText}),frame({delta:leadText,extra:true}),frame({delta:''}),frame({delta:'x'.repeat(1201)}),
    frame({done:true,text:'A reply not accumulated.',lead:null}),frame({delta:42}),frame([]),Buffer.alloc(8193,65),Buffer.alloc(65537),
    Buffer.from([123,34,100,101,108,116,97,34,58,34,0xc3,0x28,34,125,10]),
    Buffer.concat([frame({delta:'Okay. '}),frame({lead:'Okay.'})]),
    Buffer.concat([frame({delta:leadText+' '}),frame({lead:'I have been feeling really tired.'})]),
    Buffer.concat([frame({delta:'x'.repeat(901)}),frame({done:true,text:'x'.repeat(901),lead:null})]),
  ]){
    const h=harness(),leads=[];
    const pending=h.provider.replyStream({...input(),onLead:text=>leads.push(text)});
    const rejection=assert.rejects(pending,/invalid streaming reply/);
    await tick();h.children[0].stdout.emit('data',data);await rejection;
    assert.deepEqual(leads,[]);assert.equal(h.children[0].kills,1);
  }
  const h=harness();const pending=h.provider.replyStream({...input(),onLead(){throw new Error('secret callback failure');}});
  const rejection=assert.rejects(pending,error=>/invalid streaming reply/.test(error.message)&&!error.message.includes('secret'));
  await tick();h.children[0].stdout.emit('data',Buffer.concat([frame({delta:leadText+' '}),frame({lead:leadText})]));await rejection;
});

test('actor stream abort and deadline terminate once, ignore later output and never retry',async t=>{
  const h=harness(),abort=new AbortController(),leads=[];
  const pending=h.provider.replyStream({...input(),signal:abort.signal,onLead:text=>leads.push(text)});
  const rejection=assert.rejects(pending,{name:'AbortError'});await tick();const child=h.children[0];
  child.stdout.emit('data',frame({delta:leadText+' '}));abort.abort();await rejection;
  child.stdout.emit('data',frame({lead:leadText}));child.stdout.emit('data',frame({done:true,text:leadText,lead:leadText}));child.emit('close',0);
  assert.deepEqual(leads,[]);assert.equal(child.kills,1);assert.equal(h.calls.length,1);
  t.mock.timers.enable({apis:['setTimeout']});
  const timeout=harness();const delayed=timeout.provider.replyStream({...input(),onLead(){}});
  const timeoutRejection=assert.rejects(delayed,/too long/);t.mock.timers.tick(35000);await timeoutRejection;
  assert.equal(timeout.children[0].kills,1);
});

test('actor stream missing credentials, invalid callback and pre-abort never spawn',async()=>{
  let spawned=0;const spawnImpl=()=>{spawned++;throw new Error('unexpected');};
  const missing=createOpenAIProvider({env:{},spawnImpl});
  await assert.rejects(missing.replyStream({...input(),onLead(){}}),/configured API key/);
  const configured=createOpenAIProvider({env:ENV,spawnImpl});const abort=new AbortController();abort.abort();
  await assert.rejects(configured.replyStream({...input(),signal:abort.signal,onLead(){}}),{name:'AbortError'});
  await assert.rejects(configured.replyStream(input()),/Invalid patient reply request/);assert.equal(spawned,0);
});

test('streamed MP3 arrives before worker exit and resolves only after done plus clean close',async()=>{
  const h=harness(),received=[];let finished=false;
  const pending=h.provider.speakStream({text:'A new synthetic reply.',onChunk:chunk=>received.push(chunk)}).then(()=>{finished=true;});
  await tick();const child=h.children[0];
  assert.equal(child.job.kind,'speech_stream');assert.equal(child.job.instructions,MARIN_INSTRUCTIONS);
  child.stdout.emit('data',frame({chunk:mp3().subarray(0,100).toString('base64')}));
  assert.equal(received.length,1);assert.equal(finished,false);
  child.stdout.emit('data',frame({chunk:mp3().subarray(100).toString('base64')}));
  child.stdout.emit('data',frame({done:true,bytes:200}));await tick();assert.equal(finished,false);
  child.emit('close',0);await pending;
  assert.deepEqual(Buffer.concat(received),mp3());assert.equal(h.calls.length,1);
});

test('fragmented NDJSON and fragmented MP3 prefix preserve every audio byte once',async()=>{
  const h=harness(),received=[];
  const pending=h.provider.speakStream({text:'A new synthetic reply.',onChunk:chunk=>received.push(chunk)});
  await tick();const child=h.children[0];
  const output=Buffer.concat([frame({chunk:mp3().subarray(0,1).toString('base64')}),frame({chunk:mp3().subarray(1).toString('base64')}),frame({done:true,bytes:200})]);
  for(let index=0;index<output.length;index+=7)child.stdout.emit('data',output.subarray(index,index+7));
  child.emit('close',0);await pending;assert.deepEqual(Buffer.concat(received),mp3());
});

test('partial provider errors, missing completion and dirty exit never report stream success',async()=>{
  for(const finish of [
    child=>child.stdout.emit('data',frame({error:'provider_limit',detail:'secret diagnostic'})),
    child=>child.emit('close',0),
    child=>{child.stdout.emit('data',frame({done:true,bytes:200}));child.emit('close',1);},
    child=>child.stdout.emit('data',frame({done:true,bytes:199})),
    child=>{child.stdout.emit('data',frame({done:true,bytes:200}));child.stdout.emit('data',frame({chunk:'AAAA'}));},
  ]){
    const h=harness(),received=[];const pending=h.provider.speakStream({text:'A new synthetic reply.',onChunk:chunk=>received.push(chunk)});
    const rejection=assert.rejects(pending,error=>!error.message.includes('secret'));
    await tick();const child=h.children[0];child.stdout.emit('data',frame({chunk:mp3().toString('base64')}));finish(child);
    await rejection;assert.equal(received.length,1);assert.equal(child.kills,1);assert.equal(h.calls.length,1);
  }
});

test('stream bounds and invalid MP3 prefix fail before invalid bytes are delivered',async()=>{
  for(const data of [Buffer.alloc(6000001),Buffer.alloc(8193,65),frame({chunk:Buffer.alloc(200).toString('base64')}),frame({chunk:'not-base64'})]){
    const h=harness(),received=[];const pending=h.provider.speakStream({text:'A new synthetic reply.',onChunk:chunk=>received.push(chunk)});
    const rejection=assert.rejects(pending,/invalid/);await tick();h.children[0].stdout.emit('data',data);await rejection;assert.equal(received.length,0);
  }
  const h=harness();const pending=h.provider.speakStream({text:'A new synthetic reply.',onChunk(){}});const rejection=assert.rejects(pending,/invalid/);
  await tick();const child=h.children[0];child.stdout.emit('data',frame({chunk:mp3().toString('base64')}));
  for(let index=0;index<977;index++)child.stdout.emit('data',frame({chunk:Buffer.alloc(4096).toString('base64')}));
  await rejection;assert.equal(child.kills,1);
});

test('stream cancellation and deadline kill once and suppress late callbacks',async t=>{
  const h=harness(),abort=new AbortController(),received=[];
  const pending=h.provider.speakStream({text:'A new synthetic reply.',signal:abort.signal,onChunk:chunk=>received.push(chunk)});
  const rejection=assert.rejects(pending,{name:'AbortError'});await tick();const child=h.children[0];
  child.stdout.emit('data',frame({chunk:mp3().toString('base64')}));abort.abort();await rejection;
  child.stdout.emit('data',frame({chunk:mp3().toString('base64')}));child.emit('close',0);
  assert.equal(received.length,1);assert.equal(child.kills,1);
  t.mock.timers.enable({apis:['setTimeout']});
  const timeout=harness();const delayed=timeout.provider.speakStream({text:'A new synthetic reply.',onChunk(){}});
  const timeoutRejection=assert.rejects(delayed,/too long/);await tick();t.mock.timers.tick(35000);await timeoutRejection;assert.equal(timeout.children[0].kills,1);
});

test('exact recording reuse streams once without spawning or requiring a provider key',async()=>{
  let spawned=0;const chunks=[];
  const provider=createOpenAIProvider({env:{},spawnImpl(){spawned++;},recordedSpeech:async text=>text==='Recorded text.'?mp3():null});
  await provider.speakStream({text:'Recorded text.',onChunk:chunk=>chunks.push(chunk)});
  assert.equal(chunks.length,1);assert.deepEqual(chunks[0],mp3());assert.equal(spawned,0);
});

test('missing key and already-cancelled operations never spawn a worker',async()=>{
  let spawned=0;const spawnImpl=()=>{spawned++;throw new Error('unexpected');};
  const missing=createOpenAIProvider({env:{},spawnImpl});assert.equal(missing.configured,false);
  await assert.rejects(missing.reply(input()),/configured API key/);
  const configured=createOpenAIProvider({env:ENV,spawnImpl});const abort=new AbortController();abort.abort();
  await assert.rejects(configured.reply({...input(),signal:abort.signal}),{name:'AbortError'});
  assert.equal(spawned,0);
});

test('reply and speech protocol keep credentials out of arguments and job payloads',async()=>{
  const h=harness(child=>child.respond(child.job.kind==='reply'?{text:' I am tired. '}:{audio:mp3().toString('base64')}));
  assert.equal(await h.provider.reply(input()),'I am tired.');
  assert.deepEqual(await h.provider.speak({text:'I am not feeling rested.'}),mp3());
  assert.equal(h.calls.length,2);assert.equal(h.calls[0].command,'fake-python');assert.deepEqual(h.calls[0].args,[worker]);
  assert.equal(h.calls[0].options.env.OPENAI_API_KEY,ENV.OPENAI_API_KEY);
  assert.equal(h.calls[0].options.env.UNRELATED_SECRET,undefined);
  assert.deepEqual(h.children[0].job,{kind:'reply',...input()});
  assert.deepEqual(h.children[1].job,{kind:'speech',text:'I am not feeling rested.',instructions:MARIN_INSTRUCTIONS});
  assert.ok(!JSON.stringify(h.calls.map(call=>call.args)).includes(ENV.OPENAI_API_KEY));
  assert.ok(!JSON.stringify(h.children.map(child=>child.job)).includes(ENV.OPENAI_API_KEY));
});

test('cancel terminates the active worker and ignores late output',async()=>{
  const h=harness();const abort=new AbortController();const pending=h.provider.reply({...input(),signal:abort.signal});
  const rejection=assert.rejects(pending,{name:'AbortError'});abort.abort();await rejection;
  assert.equal(h.children[0].kills,1);h.children[0].respond({text:'Late output'});assert.equal(h.calls.length,1);
});

test('worker deadline kills once and never retries',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=harness();const pending=h.provider.reply(input());const rejection=assert.rejects(pending,/too long/);
  t.mock.timers.tick(35000);await rejection;assert.equal(h.children[0].kills,1);assert.equal(h.calls.length,1);
});

test('SDK failures, stderr, spawn errors and malformed output expose only safe messages',async()=>{
  for(const code of ['provider_auth','provider_limit','provider_timeout','provider_unavailable','secret-server-diagnostic']){
    const h=harness(child=>{child.stderr.emit('data',Buffer.from('sensitive-transcript-and-key'));child.respond({error:code,detail:'sensitive-transcript-and-key'});});
    await assert.rejects(h.provider.reply(input()),error=>{assert.ok(!error.message.includes('sensitive'));assert.ok(!error.message.includes('secret-server'));return true;});
    assert.equal(h.calls.length,1);
  }
  const broken=harness(child=>{child.stdout.emit('data',Buffer.from('not JSON sensitive-transcript'));child.emit('close',0);});
  await assert.rejects(broken.provider.reply(input()),/invalid response/);
  const spawnFailure=createOpenAIProvider({env:ENV,spawnImpl(){throw new Error('secret diagnostic');}});
  await assert.rejects(spawnFailure.reply(input()),/could not start/);
  const eventFailure=harness(child=>child.emit('error',new Error('secret diagnostic')));
  await assert.rejects(eventFailure.provider.reply(input()),/could not start/);
});

test('stdout, reply and MP3 bounds reject oversized or invalid provider output',async()=>{
  const huge=harness(child=>child.stdout.emit('data',Buffer.alloc(6000001)));
  await assert.rejects(huge.provider.reply(input()),/invalid response/);assert.equal(huge.children[0].kills,1);
  for(const text of ['', 'x'.repeat(901)])await assert.rejects(harness(child=>child.respond({text})).provider.reply(input()),/invalid reply/);
  for(const audio of ['not valid base64!',Buffer.from('ID3').toString('base64'),Buffer.alloc(200).toString('base64'),Buffer.concat([Buffer.from('ID3'),Buffer.alloc(4000000)]).toString('base64')]){
    await assert.rejects(harness(child=>child.respond({audio})).provider.speak({text:'I am tired.'}),/invalid audio/);
  }
  const h=harness();await assert.rejects(h.provider.speak({text:'x'.repeat(901)}),/Invalid patient reply/);assert.equal(h.calls.length,0);
});

test('Marin delivery instructions match the approved local generation plan when present',t=>{
  const planPath=new URL('../../../output/speech/dana-marin-v1/generation-plan.json',import.meta.url);
  if(!existsSync(planPath)){t.skip('Local recording generation plan is not present in this checkout.');return;}
  const plan=JSON.parse(readFileSync(planPath,'utf8'));
  assert.equal(MARIN_INSTRUCTIONS,plan.instructions);assert.equal(plan.voice,'marin');assert.equal(plan.model,'gpt-4o-mini-tts-2025-12-15');
  assert.equal(createHash('sha256').update(MARIN_INSTRUCTIONS).digest('hex'),plan.instructionsHash);
});

test('Python worker pins actor/TTS models, disables storage and retries, and sanitizes SDK exceptions',()=>{
  // Import only this worker; fake the SDK entirely. No API key or network is used.
  const script=String.raw`
import importlib.util,io,json,sys,types
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
seen=[]
def reply(**kw):
 seen.append(['reply',kw]);return types.SimpleNamespace(status='completed',output_text=' I am tired. ')
def speech(**kw):
 seen.append(['speech',kw]);return types.SimpleNamespace(content=b'ID3'+b'x'*197)
client=types.SimpleNamespace(responses=types.SimpleNamespace(create=reply),audio=types.SimpleNamespace(speech=types.SimpleNamespace(create=speech)))
assert module.run({'kind':'reply','system':'synthetic','messages':[{'role':'user','content':'Hello'}]},client)['text']=='I am tired.'
assert module.run({'kind':'speech','text':'I am not rested.','instructions':'speak exactly'},client)['audio']
assert module.ACTOR_MODEL=='gpt-5.4-2026-03-05'
assert module.ACTOR_REASONING_EFFORT=='low' and module.ACTOR_MAX_OUTPUT_TOKENS==768
assert seen[0][1]['model']=='gpt-5.4-2026-03-05'
assert seen[0][1]['store'] is False and seen[0][1]['max_output_tokens']==768
assert seen[0][1]['reasoning']=={'effort':'low'} and 'temperature' not in seen[0][1]
assert seen[1][1]['model']=='gpt-4o-mini-tts-2025-12-15' and seen[1][1]['voice']=='marin'
assert seen[1][1]['input']=='I am not rested.' and seen[1][1]['response_format']=='mp3' and seen[1][1]['speed']==1.0
class Auth(Exception):pass
class Limit(Exception):pass
class Timeout(Exception):pass
saved_out=sys.stdout
for exception,code,diagnostic in [(Auth,'provider_auth','provider_auth'),(Limit,'provider_limit','provider_limit'),(Timeout,'provider_timeout','provider_timeout'),(ValueError,'provider_unavailable','unknown')]:
 def fail(**kw):raise exception('secret provider detail')
 def factory(**kw):
  assert kw=={'base_url':'https://api.openai.com/v1','max_retries':0,'timeout':30.0}
  return types.SimpleNamespace(responses=types.SimpleNamespace(create=fail))
 sys.modules['openai']=types.SimpleNamespace(OpenAI=factory,AuthenticationError=Auth,RateLimitError=Limit,APITimeoutError=Timeout)
 sys.stdin=types.SimpleNamespace(buffer=io.BytesIO(b'{"kind":"reply","system":"synthetic","messages":[]}'))
 sys.stdout=io.StringIO();module.main();result=json.loads(sys.stdout.getvalue());assert result=={'error':code,'diagnosticCode':diagnostic}
sys.stdout=saved_out
print('fake SDK contract passed')
`;
  const output=execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000});
  assert.equal(output.trim(),'fake SDK contract passed');
});

test('Python worker safely distinguishes connection and HTTP status failures',()=>{
  const script=String.raw`
import importlib.util,io,json,sys,types
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Auth(Exception):pass
class Limit(Exception):pass
class Timeout(Exception):pass
class Connection(Exception):pass
class Status(Exception):
 def __init__(self):super().__init__('malicious prompt key provider-id');self.status_code=529;self.response='secret'
saved_out=sys.stdout
for exception,diagnostic,status in [(Connection,'provider_connection',None),(Status,'provider_status',529)]:
 def factory(**unused):
  def fail(**unused):
   if exception is Connection:raise exception('malicious')
   raise exception()
  return types.SimpleNamespace(responses=types.SimpleNamespace(create=fail))
 sys.modules['openai']=types.SimpleNamespace(OpenAI=factory,AuthenticationError=Auth,RateLimitError=Limit,APITimeoutError=Timeout,APIConnectionError=Connection,APIStatusError=Status)
 sys.stdin=types.SimpleNamespace(buffer=io.BytesIO(b'{"kind":"reply","system":"synthetic","messages":[]}'))
 sys.stdout=io.StringIO();module.main();result=json.loads(sys.stdout.getvalue())
 assert result==dict(error='provider_unavailable',diagnosticCode=diagnostic,**({'httpStatus':status} if status else {})),result
 assert 'malicious' not in sys.stdout.getvalue() and 'secret' not in sys.stdout.getvalue()
sys.stdout=saved_out;print('safe SDK diagnostics passed')
`;
  assert.equal(execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000}).trim(),'safe SDK diagnostics passed');
});

test('Python streaming worker emits flushed SDK chunks immediately and sanitizes a later provider failure',()=>{
  const script=String.raw`
import importlib.util,io,json,sys,types,base64
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Output(io.StringIO):
 def __init__(self):super().__init__();self.flushes=0
 def flush(self):self.flushes+=1
class Auth(Exception):pass
class Limit(Exception):pass
class Timeout(Exception):pass
seen=[]
class Stream:
 def __init__(self,fail=False):self.fail=fail
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def iter_bytes(self,chunk_size):
  assert chunk_size==4096
  yield b'ID3'+b'x'*197
  assert sys.stdout.flushes==1 and len(sys.stdout.getvalue().splitlines())==1
  if self.fail:raise Limit('secret provider detail')
  yield b'y'*150
def streaming(**kw):
 seen.append(kw);return Stream()
client=types.SimpleNamespace(audio=types.SimpleNamespace(speech=types.SimpleNamespace(with_streaming_response=types.SimpleNamespace(create=streaming))))
saved_out=sys.stdout;sys.stdout=Output()
assert module.run({'kind':'speech_stream','text':'New spoken text.','instructions':'speak exactly'},client) is None
events=[json.loads(line) for line in sys.stdout.getvalue().splitlines()]
assert len(events)==3 and sys.stdout.flushes==3
assert base64.b64decode(events[0]['chunk'])==b'ID3'+b'x'*197
assert base64.b64decode(events[1]['chunk'])==b'y'*150
assert events[2]=={'done':True,'bytes':350}
assert seen[0]=={'model':'gpt-4o-mini-tts-2025-12-15','voice':'marin','input':'New spoken text.','instructions':'speak exactly','response_format':'mp3','speed':1.0}
def factory(**kw):
 assert kw=={'base_url':'https://api.openai.com/v1','max_retries':0,'timeout':30.0}
 return types.SimpleNamespace(audio=types.SimpleNamespace(speech=types.SimpleNamespace(with_streaming_response=types.SimpleNamespace(create=lambda **unused:Stream(True)))))
sys.modules['openai']=types.SimpleNamespace(OpenAI=factory,AuthenticationError=Auth,RateLimitError=Limit,APITimeoutError=Timeout)
sys.stdin=types.SimpleNamespace(buffer=io.BytesIO(b'{"kind":"speech_stream","text":"Synthetic","instructions":"speak exactly"}'))
sys.stdout=Output();module.main()
events=[json.loads(line) for line in sys.stdout.getvalue().splitlines()]
assert len(events)==2 and events[1]=={'error':'provider_limit','diagnosticCode':'provider_limit'} and sys.stdout.flushes==2
assert 'secret' not in sys.stdout.getvalue() and not any(event.get('done') for event in events)
sys.stdout=saved_out
print('fake streaming SDK contract passed')
`;
  const output=execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000});
  assert.equal(output.trim(),'fake streaming SDK contract passed');
});

test('Python actor stream uses real event-iterator shape, flushes one substantive prefix early and preserves pins',()=>{
  const script=String.raw`
import importlib.util,io,json,sys,types
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Output(io.StringIO):
 def __init__(self):super().__init__();self.flushes=0
 def flush(self):self.flushes+=1
lead='Okay. I have been feeling really tired.'
raw=' '+lead+' It has been hard to get started. '
seen=[]
class Stream:
 def __init__(self):self.final_calls=0
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def __iter__(self):
  yield types.SimpleNamespace(type='response.created')
  yield types.SimpleNamespace(type='response.output_text.delta',delta=' Okay. ')
  assert sys.stdout.flushes==1 and json.loads(sys.stdout.getvalue().splitlines()[0])=={'delta':' Okay. '}
  yield types.SimpleNamespace(type='response.output_text.delta',delta='I have been feeling really tired.')
  assert sys.stdout.flushes==2
  yield types.SimpleNamespace(type='response.output_text.delta',delta=' It has been hard ')
  events=[json.loads(line) for line in sys.stdout.getvalue().splitlines()]
  assert sys.stdout.flushes==4 and events[-1]=={'lead':lead} and self.final_calls==0
  yield types.SimpleNamespace(type='response.output_text.delta',delta='to get started. ')
  yield types.SimpleNamespace(type='response.completed')
 def get_final_response(self):
  self.final_calls+=1
  return types.SimpleNamespace(status='completed',output_text=raw)
def streaming(**kw):seen.append(kw);return Stream()
client=types.SimpleNamespace(responses=types.SimpleNamespace(stream=streaming))
saved_out=sys.stdout;sys.stdout=Output()
assert module.run({'kind':'reply_stream','system':'synthetic','messages':[{'role':'user','content':'Hello'}]},client) is None
events=[json.loads(line) for line in sys.stdout.getvalue().splitlines()]
assert len(events)==6 and sys.stdout.flushes==6
assert ''.join(event['delta'] for event in events if 'delta' in event)==raw
assert [event['lead'] for event in events if set(event)=={'lead'}]==[lead]
assert events[-1]=={'done':True,'text':raw.strip(),'lead':lead}
assert seen==[{'model':'gpt-5.4-2026-03-05','instructions':'synthetic','input':[{'role':'user','content':'Hello'}],'store':False,'max_output_tokens':768,'reasoning':{'effort':'low'}}]
sys.stdout=saved_out
print('fake actor stream contract passed')
`;
  const output=execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000});
  assert.equal(output.trim(),'fake actor stream contract passed');
});

test('Python actor incomplete, unequal, oversized and failed streams never emit completion',()=>{
  const script=String.raw`
import importlib.util,io,json,sys,types
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Auth(Exception):pass
class Limit(Exception):pass
class Timeout(Exception):pass
lead='I have been feeling really tired.'
cases=[('incomplete',lead+' ',None,'actor_incomplete'),('completed','A different reply.',None,'actor_incomplete'),('completed',lead,None,'actor_incomplete'),('completed',lead+' ',Limit,'provider_limit'),('completed','x'*901,None,'protocol_final'),('completed','x'*1201,None,'protocol_size'),('completed','',None,'protocol_final')]
saved_out=sys.stdout
for status,final,error,diagnostic in cases:
 class Stream:
  def __enter__(self):return self
  def __exit__(self,*args):return False
  def __iter__(self):
   delta=(lead+' ') if (error or final in (lead,lead+' ','A different reply.')) else final
   yield types.SimpleNamespace(type='response.output_text.delta',delta=delta)
   if error:raise error('secret provider detail')
  def get_final_response(self):return types.SimpleNamespace(status=status,output_text=final)
 def factory(**kw):
  assert kw=={'base_url':'https://api.openai.com/v1','max_retries':0,'timeout':30.0}
  return types.SimpleNamespace(responses=types.SimpleNamespace(stream=lambda **unused:Stream()))
 sys.modules['openai']=types.SimpleNamespace(OpenAI=factory,AuthenticationError=Auth,RateLimitError=Limit,APITimeoutError=Timeout)
 sys.stdin=types.SimpleNamespace(buffer=io.BytesIO(b'{"kind":"reply_stream","system":"synthetic","messages":[]}'))
 sys.stdout=io.StringIO();module.main()
 events=[json.loads(line) for line in sys.stdout.getvalue().splitlines()]
 assert not any(event.get('done') for event in events),events
 assert events[-1]['error']==('provider_limit' if error else 'provider_unavailable'),events
 assert events[-1]['diagnosticCode']==diagnostic,events
 assert 'secret' not in sys.stdout.getvalue()
sys.stdout=saved_out
print('fake actor stream failure contract passed')
`;
  const output=execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000});
  assert.equal(output.trim(),'fake actor stream failure contract passed');
});

test('streaming sentence boundary preserves tiny acknowledgements and avoids abbreviation or ellipsis cuts',()=>{
  const script=String.raw`
import importlib.util,pathlib,sys
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
worker=load('worker',sys.argv[1])
experiment=load('experiment',pathlib.Path(sys.argv[1]).with_name('dana-first-sentence-experiment.py'))
cases=[
 ('Okay. ',None),('No.',None),('I have been feeling tired.',None),
 ('Okay. I have been feeling really tired. More','Okay. I have been feeling really tired.'),
 ('  Okay. No. I’m feeling very tired today. More','Okay. No. I’m feeling very tired today.'),
 ('I spoke with Dr. Moss last night. More','I spoke with Dr. Moss last night.'),
 ('I have felt so... ',None),
 ('I don’t know... I have been very tired. Next','I don’t know... I have been very tired.'),
 ('My appointment was at 9.30 a.m. ',None),
 ('He said, “Can I help you?” I','He said, “Can I help you?”'),
 ('My name begins with D. Moss. ','My name begins with D. Moss.'),
]
for text,expected in cases:
 assert worker.first_substantive_sentence(text)==expected,(text,worker.first_substantive_sentence(text))
 assert worker.first_substantive_sentence(text)==experiment.first_substantive_sentence(text)
print('sentence boundary contract passed')
`;
  const output=execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000});
  assert.equal(output.trim(),'sentence boundary contract passed');
});

test('new-case speech uses its own voice and delivery without borrowing Dana recordings',async()=>{
  for(const [caseId,name,voice] of [['sp_mania_redirect_001','Marcus','cedar'],['sp_psychosis_paranoid_001','Ray','cedar'],['sp_alcohol_ambivalence_001','Morgan','marin']]){
    let recordingLookups=0;
    const h=harness(child=>child.respond({audio:mp3().toString('base64')}),{recordedSpeech:async()=>{recordingLookups++;return mp3();}});
    await h.provider.speak({text:'Hi.',caseId});
    assert.equal(recordingLookups,0);assert.equal(h.children[0].job.voice,voice);
    assert.ok(h.children[0].job.instructions.includes(name));assert.ok(!h.children[0].job.instructions.includes('Dana'));
  }
  const h=harness();await assert.rejects(h.provider.speak({text:'Hello',caseId:'__proto__'}),/Unsupported/);assert.equal(h.calls.length,0);
});

test('streamed new-case speech keeps Cedar instructions on every segment',async()=>{
  const h=harness(child=>{child.stdout.emit('data',frame({chunk:mp3().toString('base64')}));child.stdout.emit('data',frame({done:true,bytes:mp3().length}));child.emit('close',0);});
  const chunks=[];
  await h.provider.speakStream({text:'I need a moment.',caseId:'sp_psychosis_paranoid_001',onChunk:chunk=>chunks.push(chunk)});
  assert.equal(h.children[0].job.voice,'cedar');assert.match(h.children[0].job.instructions,/Ray/);assert.equal(chunks.length,1);
});

test('Morgan streaming retains Marin and the MI character instructions',async()=>{
  const h=harness(child=>{child.stdout.emit('data',frame({chunk:mp3().toString('base64')}));child.stdout.emit('data',frame({done:true,bytes:mp3().length}));child.emit('close',0);});
  const chunks=[];
  await h.provider.speakStream({text:'I am not sure what I want to do yet.',caseId:'sp_alcohol_ambivalence_001',onChunk:chunk=>chunks.push(chunk)});
  assert.equal(h.children[0].job.voice,'marin');assert.match(h.children[0].job.instructions,/Morgan/);assert.doesNotMatch(h.children[0].job.instructions,/Dana/);assert.equal(chunks.length,1);
});

test('Python speech worker honors the pinned Cedar voice and rejects arbitrary voice selection before provider work',()=>{
  const code=`import importlib.util,types,sys
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
seen=[]
class Speech:
 def create(self,**kwargs):
  seen.append(kwargs);return types.SimpleNamespace(content=b'ID3'+b'0'*197)
client=types.SimpleNamespace(audio=types.SimpleNamespace(speech=Speech()))
module.run({'kind':'speech','text':'Hello.','instructions':'Exact words.','voice':'cedar'},client)
assert seen[0]['voice']=='cedar'
try: module.run({'kind':'speech','text':'Hello.','instructions':'Exact words.','voice':'arbitrary'},client)
except ValueError: pass
else: raise AssertionError('Unrecognized voice accepted')
assert len(seen)==1
`;
  execFileSync('python3',['-c',code,worker],{stdio:'pipe'});
});

const reportedUsage={inputTokens:120,cachedInputTokens:20,cacheWriteTokens:5,outputTokens:12,reasoningTokens:2,totalTokens:132};
test('provider usage records real token metadata without exposing content and snapshots are isolated',async()=>{
  const h=harness(child=>child.respond({text:'Synthetic reply.',usage:{...reportedUsage,secret:'must-not-escape'}}));
  assert.equal(typeof h.provider.getUsage,'function');
  const empty=h.provider.getUsage();assert.equal(empty.actor.started,0);assert.equal(empty.actor.tokens.inputTokens,null);assert.equal(empty.costUsd,null);
  await h.provider.reply(input());const snapshot=h.provider.getUsage();
  assert.equal(snapshot.actor.started,1);assert.equal(snapshot.actor.completed,1);assert.equal(snapshot.actor.inFlight,0);
  assert.equal(snapshot.actor.usageReported,1);assert.equal(snapshot.actor.usageMissing,0);
  assert.deepEqual(snapshot.actor.tokens,reportedUsage);assert.equal(snapshot.actor.tokenReports.cachedInputTokens,1);
  assert.ok(!JSON.stringify(snapshot).includes('must-not'));assert.ok(!JSON.stringify(snapshot).includes('Synthetic'));assert.ok(!JSON.stringify(snapshot).includes(ENV.OPENAI_API_KEY));
  snapshot.actor.tokens.inputTokens=999;assert.equal(h.provider.getUsage().actor.tokens.inputTokens,120);
  assert.equal(harness().provider.getUsage().actor.started,0);
});

test('concurrent worker requests preserve separate usage and missing reports are not zero tokens',async()=>{
  const h=harness();assert.equal(typeof h.provider.getUsage,'function');
  const a=h.provider.reply(input()),b=h.provider.reply(input());await tick();
  assert.equal(h.provider.getUsage().actor.inFlight,2);
  h.children[1].respond({text:'Second reply.',usage:{inputTokens:7,outputTokens:3,totalTokens:10}});await b;
  h.children[0].respond({text:'First reply.'});await a;
  const usage=h.provider.getUsage().actor;
  assert.equal(usage.completed,2);assert.equal(usage.usageReported,1);assert.equal(usage.usageMissing,1);
  assert.equal(usage.tokens.inputTokens,7);assert.equal(usage.tokens.cachedInputTokens,null);assert.equal(usage.tokenReports.cachedInputTokens,0);
});

test('failed and cancelled requests count once and retain any usage already reported by a stream',async()=>{
  const h=harness();assert.equal(typeof h.provider.getUsage,'function');
  const first=h.provider.reply(input());const rejected=assert.rejects(first);await tick();
  h.children[0].respond({error:'provider_unavailable',usage:reportedUsage});await rejected;
  const abort=new AbortController();const second=h.provider.replyStream({...input(),onLead(){},signal:abort.signal});const cancelled=assert.rejects(second,{name:'AbortError'});await tick();
  const child=h.children[1];child.stdout.emit('data',frame({usage:{inputTokens:10,outputTokens:2,totalTokens:12}}));abort.abort();await cancelled;
  child.stdout.emit('data',frame({usage:reportedUsage}));child.emit('close',0);
  const usage=h.provider.getUsage().actor;
  assert.equal(usage.started,2);assert.equal(usage.failed,1);assert.equal(usage.cancelled,1);assert.equal(usage.usageReported,2);assert.equal(usage.usageMissing,0);assert.equal(usage.tokens.inputTokens,130);
  const missing=harness(child=>child.respond({error:'provider_limit'}));await assert.rejects(missing.provider.reply(input()));
  assert.equal(missing.provider.getUsage().actor.usageMissing,1);assert.equal(missing.provider.getUsage().actor.tokens.totalTokens,null);
});

test('stream completion accepts one numeric usage report for actor and speech without changing returned payloads',async()=>{
  const h=harness();assert.equal(typeof h.provider.getUsage,'function');
  const reply=h.provider.replyStream({...input(),onLead(){}});await tick();let child=h.children[0];
  child.stdout.emit('data',Buffer.concat([frame({delta:'I am tired.'}),frame({usage:reportedUsage}),frame({done:true,text:'I am tired.',lead:null})]));child.emit('close',0);
  assert.equal(await reply,'I am tired.');
  const chunks=[];const speech=h.provider.speakStream({text:'A new reply.',onChunk:chunk=>chunks.push(chunk)});await tick();child=h.children[1];
  child.stdout.emit('data',Buffer.concat([frame({chunk:mp3().toString('base64')}),frame({usage:{inputTokens:4,outputTokens:30,totalTokens:34}}),frame({done:true,bytes:200})]));child.emit('close',0);await speech;
  assert.deepEqual(Buffer.concat(chunks),mp3());assert.equal(h.provider.getUsage().speech.tokens.outputTokens,30);
  const noUsage=harness(child=>child.respond({audio:mp3().toString('base64')}));await noUsage.provider.speak({text:'Uncached reply.'});
  assert.equal(noUsage.provider.getUsage().speech.usageMissing,1);assert.equal(noUsage.provider.getUsage().speech.tokens.outputTokens,null);
});

test('invalid token values never become usage and recording hits or pre-aborts never count provider requests',async()=>{
  const h=harness(child=>child.respond({text:'Synthetic reply.',usage:{inputTokens:-1,outputTokens:'30',totalTokens:Infinity,cachedInputTokens:true,reasoningTokens:2.5}}));
  assert.equal(typeof h.provider.getUsage,'function');await h.provider.reply(input());
  assert.equal(h.provider.getUsage().actor.usageReported,0);assert.equal(h.provider.getUsage().actor.usageMissing,1);assert.equal(h.provider.getUsage().actor.tokens.inputTokens,null);
  const cache=harness(null,{env:{},recordedSpeech:async()=>mp3()});await cache.provider.speak({text:'Recorded reply.'});await cache.provider.speakStream({text:'Recorded reply.',onChunk(){}});
  assert.equal(cache.provider.getUsage().recordedSpeechHits,2);assert.equal(cache.provider.getUsage().speech.started,0);assert.equal(cache.calls.length,0);
  const abort=new AbortController();abort.abort();await assert.rejects(h.provider.reply({...input(),signal:abort.signal}));assert.equal(h.provider.getUsage().actor.started,1);
});

test('worker preserves allowlisted usage on actor completion, incomplete responses and available speech metadata',()=>{
  const script=String.raw`
import importlib.util,io,json,sys,types
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
usage=types.SimpleNamespace(input_tokens=20,output_tokens=3,total_tokens=23,input_tokens_details=types.SimpleNamespace(cached_tokens=5,cache_write_tokens=2),output_tokens_details=types.SimpleNamespace(reasoning_tokens=1),secret='must-not-escape')
result=types.SimpleNamespace(status='completed',output_text='I am tired.',usage=usage)
client=types.SimpleNamespace(responses=types.SimpleNamespace(create=lambda **kw:result))
output=module.run({'kind':'reply','system':'synthetic','messages':[]},client)
assert output.get('usage',{}).get('inputTokens')==20,output
assert output['usage']['cachedInputTokens']==5 and output['usage']['cacheWriteTokens']==2 and 'secret' not in output['usage']
class Stream:
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def __iter__(self):yield types.SimpleNamespace(type='response.output_text.delta',delta='I am tired.')
 def get_final_response(self):return result
client.responses.stream=lambda **kw:Stream()
saved=sys.stdout;sys.stdout=io.StringIO();module.run({'kind':'reply_stream','system':'synthetic','messages':[]},client)
events=[json.loads(line) for line in sys.stdout.getvalue().splitlines()];sys.stdout=saved
assert [x['usage'] for x in events if 'usage' in x]==[output['usage']]
result.status='incomplete'
try:module.run({'kind':'reply','system':'synthetic','messages':[]},client)
except Exception as exc:assert exc.usage==output['usage']
else:raise AssertionError('Incomplete reply accepted')
for raw in [None,{}, {'input_tokens':True,'output_tokens':-1,'total_tokens':'23'}]:assert module.normalized_usage(raw) is None
speech=types.SimpleNamespace(content=b'ID3'+b'x'*197,usage={'input_tokens':4,'output_tokens':30,'total_tokens':34})
client.audio=types.SimpleNamespace(speech=types.SimpleNamespace(create=lambda **kw:speech))
assert module.run({'kind':'speech','text':'Synthetic','instructions':'speak exactly'},client)['usage']['outputTokens']==30
del speech.usage
assert 'usage' not in module.run({'kind':'speech','text':'Synthetic','instructions':'speak exactly'},client)
print('fake SDK usage passed')
`;
  assert.equal(execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000}).trim(),'fake SDK usage passed');
});

test('zero reported tokens remain known and duplicate or late stream usage cannot double count',async()=>{
  const h=harness();const pending=h.provider.replyStream({...input(),onLead(){}});const rejected=assert.rejects(pending,/invalid streaming reply/);await tick();
  const child=h.children[0];const zero={inputTokens:0,outputTokens:0,totalTokens:0};
  child.stdout.emit('data',frame({usage:zero}));child.stdout.emit('data',frame({usage:reportedUsage}));await rejected;
  const usage=h.provider.getUsage().actor;assert.equal(usage.failed,1);assert.equal(usage.usageReported,1);assert.equal(usage.usageMissing,0);assert.equal(usage.tokens.inputTokens,0);assert.equal(usage.tokenReports.inputTokens,1);
  const abort=new AbortController();const missing=h.provider.replyStream({...input(),onLead(){},signal:abort.signal});const cancelled=assert.rejects(missing,{name:'AbortError'});abort.abort();await cancelled;
  assert.equal(h.provider.getUsage().actor.cancelled,1);assert.equal(h.provider.getUsage().actor.usageMissing,1);
});

test('speech streaming worker preserves available token metadata even if audio delivery fails afterward',()=>{
  const script=String.raw`
import importlib.util,io,json,sys,types
spec=importlib.util.spec_from_file_location('worker',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Stream:
 usage=None
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def iter_bytes(self,chunk_size):
  yield b'ID3'+b'x'*197
  self.usage={'input_tokens':4,'output_tokens':30,'total_tokens':34}
  raise ValueError('synthetic interruption')
client=types.SimpleNamespace(audio=types.SimpleNamespace(speech=types.SimpleNamespace(with_streaming_response=types.SimpleNamespace(create=lambda **kw:Stream()))))
saved=sys.stdout;sys.stdout=io.StringIO()
try:module.run({'kind':'speech_stream','text':'Synthetic','instructions':'speak exactly'},client)
except ValueError:pass
else:raise AssertionError('Failed stream accepted')
events=[json.loads(line) for line in sys.stdout.getvalue().splitlines()];sys.stdout=saved
assert len(events)==2 and events[1].get('usage',{}).get('outputTokens')==30,events
assert not any(event.get('done') for event in events)
print('fake partial speech usage passed')
`;
  assert.equal(execFileSync('python3',['-c',script,worker],{encoding:'utf8',timeout:10000}).trim(),'fake partial speech usage passed');
});
