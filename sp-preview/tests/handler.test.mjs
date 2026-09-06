import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHandler} from '../lib/handler.mjs';
import {createStateCodec, initialState, nextHistory,issuedState} from '../lib/state.mjs';
const origin='https://preview.example.test';
const env={DANA_PREVIEW_ENABLED:'true',DANA_PREVIEW_PASSCODE:'test-preview-passcode-only',DANA_PREVIEW_STATE_KEY:randomBytes(32).toString('base64url'),DEPLOY_ID:'fixture-deploy',DEPLOY_URL:origin};
const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(197)]);
function setup(options={}) {
  const seen=new Set(),contexts=[],calls=[];
  const budget={reserve:async claim=>{if(seen.has(claim.operationId))throw Object.assign(new Error(),{status:409,code:'preview_operation_duplicate'});seen.add(claim.operationId);calls.push(claim);}};
  const provider={configured:true,replyStream:async job=>{contexts.push(job);job.onLead('I have been feeling empty.');return 'I have been feeling empty. It has been hard.';},speak:async()=>mp3,...options.provider};
  const handler=()=>createHandler({...options,env,provider,budget});
  return {handler,calls,contexts};
}
function request(body,headers={}){return new Request(origin+'/api/dana-preview',{method:'POST',headers:{origin,'content-type':'application/json','x-preview-key':env.DANA_PREVIEW_PASSCODE,...headers},body:JSON.stringify(body)});}
async function events(response){assert.equal(response.status,200);return (await response.text()).trim().split('\n').map(line=>JSON.parse(line));}
async function start(s){return events(await s.handler()(request({action:'start',requestId:crypto.randomUUID()})));}
test('rejects authorization, origin, and disabled configuration before reservations',async()=>{
 const s=setup();for(const headers of [{'x-preview-key':'wrong'},{origin:'https://evil.test'},{origin:''}])assert.equal((await s.handler()(request({action:'start',requestId:crypto.randomUUID()},headers))).status,403);
 assert.equal(s.calls.length,0);
 assert.equal((await createHandler({env:{...env,DANA_PREVIEW_ENABLED:'false'}})(request({action:'start'}))).status,503);
});
test('ten turns continue across fresh handlers with no process session memory',async()=>{
 const s=setup();let output=await start(s),state=output.at(-1).state;
 assert.deepEqual(output.map(x=>x.type),['reply','audio','complete']);
 for(let n=1;n<=10;n++){
  output=await events(await s.handler()(request({action:'turn',state,text:'Could you tell me more?',previousPlayback:'played',previousCompletedSegments:n===1?1:2})));
  assert.equal(output[0].turn,n);assert.deepEqual(output.map(x=>x.type),['reply','audio','audio','complete']);state=output.at(-1).state;
 }
 assert.equal((await s.handler()(request({action:'turn',state,text:'More?',previousPlayback:'played',previousCompletedSegments:2}))).status,409);
 assert.equal(s.calls.length,11);assert.equal(s.contexts.length,10);
});
test('replaying the same turn cannot start a second paid operation',async()=>{
 const s=setup(), state=(await start(s)).at(-1).state;
 const body={action:'turn',state,text:'How are you?',previousPlayback:'played',previousCompletedSegments:1};
 const responses=await Promise.all([s.handler()(request(body)),s.handler()(request(body))]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);await responses.find(r=>r.status===200).text();assert.equal(s.calls.length,2);
});
test('invalid or expired receipts fail before paid work',async()=>{
 const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'test',now:()=>0}),value=initialState('Opening',()=>0),token=codec.seal(value);
 assert.throws(()=>codec.open(token.slice(0,-4)+'abcd'));
 assert.throws(()=>createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'other'}).open(token));
 assert.throws(()=>createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'test',now:()=>1800000}).open(token),{code:'preview_session_expired'});
 const s=setup();assert.equal((await s.handler()(request({action:'turn',state:token,text:'Hi',previousPlayback:'played',previousCompletedSegments:1}))).status,400);assert.equal(s.calls.length,0);
});
test('only completed issued segments enter heard history after an interruption',()=>{
 const state={...initialState('First sentence. Second sentence.'),segments:['First sentence.',' Second sentence.'],completed:1};
 const history=nextHistory(state,{text:'Tell me more',previousPlayback:'interrupted',previousCompletedSegments:1});
 assert.deepEqual(history[0],{who:'pt',text:'First sentence.',playbackStatus:'played',omittedTail:true});
 assert.throws(()=>nextHistory(state,{text:'Tell me more',previousPlayback:'played',previousCompletedSegments:2}),{code:'preview_input_invalid'});
});
test('a rejected final actor reply publishes no speculative audio or private error',async()=>{
 const s=setup({provider:{replyStream:async job=>{job.onLead('I have been feeling empty.');throw new Error('secret prompt and provider credentials');}}});
 const state=(await start(s)).at(-1).state;
 const output=await events(await s.handler()(request({action:'turn',state,text:'How are you?',previousPlayback:'played',previousCompletedSegments:1})));
 assert.deepEqual(output,[{type:'error',code:'preview_provider_unavailable'}]);
});
test('nonmatching speculative prefix fails before publication',async()=>{
 const s=setup({provider:{replyStream:async job=>{job.onLead('I have been feeling empty.');return 'Different final response.';}}});
 const state=(await start(s)).at(-1).state;
 assert.deepEqual(await events(await s.handler()(request({action:'turn',state,text:'Hi',previousPlayback:'played',previousCompletedSegments:1}))),[{type:'error',code:'preview_provider_unavailable'}]);
});
test('legal multibyte ten-turn receipts remain within the codec and body limits',()=>{
 const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'multibyte'});
 let state=initialState('界'.repeat(900));state.completed=1;
 for(let n=0;n<10;n++){
  const history=nextHistory(state,{text:'界'.repeat(1200),previousPlayback:'played',previousCompletedSegments:1});
  state=issuedState(state,history,'界'.repeat(900),['界'.repeat(900)]);state.completed=1;
  const token=codec.seal(state);assert.ok(token.length<120000);assert.equal(codec.open(token).turn,n+1);
 }
});
test('cancelling the response aborts pending speech and suppresses late audio',async()=>{
 let stopped=false;
 const s=setup({provider:{speak:({signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{stopped=true;reject(new Error('private provider detail'));},{once:true});})}});
 const response=await s.handler()(request({action:'start',requestId:crypto.randomUUID()})),reader=response.body.getReader();
 const first=await reader.read();assert.equal(JSON.parse(new TextDecoder().decode(first.value)).type,'reply');
 await reader.cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,true);assert.equal(s.calls.length,1);
});
