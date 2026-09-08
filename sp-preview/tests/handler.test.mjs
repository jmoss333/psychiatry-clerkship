import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHandler} from '../lib/handler.mjs';
import {createStateCodec, initialState, nextHistory,issuedState,retryState} from '../lib/state.mjs';
const origin='https://preview.example.test';
const DANA='sp_depression_gated_si_001';
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
async function start(s){return events(await s.handler()(request({action:'start',caseId:DANA,requestId:crypto.randomUUID()})));}
test('rejects authorization, origin, and disabled configuration before reservations',async()=>{
 const s=setup();for(const headers of [{'x-preview-key':'wrong'},{origin:'https://evil.test'},{origin:''}])assert.equal((await s.handler()(request({action:'start',caseId:DANA,requestId:crypto.randomUUID()},headers))).status,403);
 assert.equal(s.calls.length,0);
 assert.equal((await createHandler({env:{...env,DANA_PREVIEW_ENABLED:'false'}})(request({action:'start',caseId:DANA}))).status,503);
});
test('ten turns continue across fresh handlers with no process session memory',async()=>{
 const s=setup();let output=await start(s),state=output.at(-1).state;
 assert.deepEqual(output.map(x=>x.type),['reply','audio','complete']);
 for(let n=1;n<=10;n++){
  output=await events(await s.handler()(request({action:'turn',caseId:DANA,state,text:'Could you tell me more?',previousPlayback:'played',previousCompletedSegments:n===1?1:2})));
  assert.equal(output[0].turn,n);assert.deepEqual(output.map(x=>x.type),['reply','audio','audio','complete']);state=output.at(-1).state;
 }
 assert.equal((await s.handler()(request({action:'turn',caseId:DANA,state,text:'More?',previousPlayback:'played',previousCompletedSegments:2}))).status,409);
 assert.equal(s.calls.length,11);assert.equal(s.contexts.length,10);
});
test('replaying the same turn cannot start a second paid operation',async()=>{
 const s=setup(), state=(await start(s)).at(-1).state;
 const body={action:'turn',caseId:DANA,state,text:'How are you?',previousPlayback:'played',previousCompletedSegments:1};
 const responses=await Promise.all([s.handler()(request(body)),s.handler()(request(body))]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);await responses.find(r=>r.status===200).text();assert.equal(s.calls.length,2);
});
test('invalid or expired receipts fail before paid work',async()=>{
 const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'test',now:()=>0}),value=initialState('Opening',()=>0,DANA),token=codec.seal(value);
 assert.throws(()=>codec.open(token.slice(0,-4)+'abcd'));
 assert.throws(()=>createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'other'}).open(token));
 assert.throws(()=>createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'test',now:()=>1800000}).open(token),{code:'preview_session_expired'});
 const s=setup();assert.equal((await s.handler()(request({action:'turn',caseId:DANA,state:token,text:'Hi',previousPlayback:'played',previousCompletedSegments:1}))).status,400);assert.equal(s.calls.length,0);
});
test('only completed issued segments enter heard history after an interruption',()=>{
 const state={...initialState('First sentence. Second sentence.',Date.now,DANA),segments:['First sentence.',' Second sentence.'],completed:1};
 const history=nextHistory(state,{text:'Tell me more',previousPlayback:'interrupted',previousCompletedSegments:1});
 assert.deepEqual(history[0],{who:'pt',text:'First sentence.',playbackStatus:'played',omittedTail:true});
 assert.throws(()=>nextHistory(state,{text:'Tell me more',previousPlayback:'played',previousCompletedSegments:2}),{code:'preview_input_invalid'});
});
test('a rejected final actor reply publishes no speculative audio or private error',async()=>{
 const s=setup({provider:{replyStream:async job=>{job.onLead('I have been feeling empty.');throw new Error('secret prompt and provider credentials');}}});
 const state=(await start(s)).at(-1).state;
 const output=await events(await s.handler()(request({action:'turn',caseId:DANA,state,text:'How are you?',previousPlayback:'played',previousCompletedSegments:1})));
 assert.deepEqual(output,[{type:'error',code:'preview_provider_unavailable'}]);
});
test('nonmatching speculative prefix fails before publication',async()=>{
 const s=setup({provider:{replyStream:async job=>{job.onLead('I have been feeling empty.');return 'Different final response.';}}});
 const state=(await start(s)).at(-1).state;
 assert.deepEqual(await events(await s.handler()(request({action:'turn',caseId:DANA,state,text:'Hi',previousPlayback:'played',previousCompletedSegments:1}))),[{type:'error',code:'preview_provider_unavailable'}]);
});
test('legal multibyte ten-turn receipts remain within the codec and body limits',()=>{
 const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'multibyte'});
 let state=initialState('界'.repeat(900),Date.now,DANA);state.completed=1;
 for(let n=0;n<10;n++){
  const history=nextHistory(state,{text:'界'.repeat(1200),previousPlayback:'played',previousCompletedSegments:1});
  state=issuedState(state,history,'界'.repeat(900),['界'.repeat(900)]);state.completed=1;
  const token=codec.seal(state);assert.ok(token.length<120000);assert.equal(codec.open(token).turn,n+1);
 }
});
test('cancelling the response aborts pending speech and suppresses late audio',async()=>{
 let stopped=false;
 const s=setup({provider:{speak:({signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>{stopped=true;reject(new Error('private provider detail'));},{once:true});})}});
 const response=await s.handler()(request({action:'start',caseId:DANA,requestId:crypto.randomUUID()})),reader=response.body.getReader();
 const first=await reader.read();assert.equal(JSON.parse(new TextDecoder().decode(first.value)).type,'reply');
 await reader.cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,true);assert.equal(s.calls.length,1);
});

test('a receipt may record that its one alternative is spent, and rejects any other value',()=>{
 const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'test',now:()=>0}),base=initialState('Opening',()=>0,DANA);
 assert.equal(codec.open(codec.seal(base)).retried,undefined,'a fresh encounter has spent nothing');
 assert.equal(codec.open(codec.seal({...base,retried:true})).retried,true);
 for(const bad of [false,1,'true',null,0])assert.throws(()=>codec.open(codec.seal({...base,retried:bad})),{code:'preview_state_invalid'},String(bad));
});

test('an issued state carries the spent flag forward so a reload cannot restore the alternative',()=>{
 const spent={...initialState('Opening',Date.now,DANA),retried:true};
 const next=issuedState(spent,[...spent.history,{who:'me',text:'A question'}],'A reply.',['A reply.']);
 assert.equal(next.retried,true);
});

// Three completed turns; turn 1's reply has two segments, both heard.
function encounterOfThree(){
 let state=initialState('Opening line.',Date.now,DANA);
 for(const [question,reply,segments] of [['Q1','R1 first. R1 second.',['R1 first.',' R1 second.']],['Q2','R2 only.',['R2 only.']],['Q3','R3 only.',['R3 only.']]]){
  const history=nextHistory(state,{text:question,previousPlayback:'played',previousCompletedSegments:state.completed});
  state=issuedState(state,history,reply,segments);
  state={...state,completed:state.segments.length};
 }
 return state;
}

test('a retry truncates history to everything before the chosen question',()=>{
 const parent=encounterOfThree(),child=retryState(parent,2,'a'.repeat(32));
 assert.equal(child.turn,1);
 assert.equal(child.history.length,child.turn*2+1,'the codec length invariant holds by construction');
 assert.deepEqual(child.history.map(entry=>entry.text),['Opening line.','Q1','R1 first. R1 second.']);
 assert.equal(child.history.some(entry=>entry.text==='Q2'),false,'the question being retried is not in the child history');
 assert.equal(child.history.some(entry=>entry.text==='R2 only.'),false,'nor is any later reply');
});

test('a retry gets its own session id and keeps the parent expiry',()=>{
 const parent=encounterOfThree(),child=retryState(parent,3,'b'.repeat(32));
 assert.equal(child.sid,'b'.repeat(32));
 assert.notEqual(child.sid,parent.sid,'a child cannot share the parent ledger identity');
 assert.equal(child.expires,parent.expires);
 assert.equal(Object.hasOwn(child,'retried'),false,'the flag is set on the issued state, not on the child input');
});

test('a retry presents only what was heard at that earlier moment',()=>{
 // The opening has to be marked heard before a turn can claim it played.
 let state={...initialState('Opening line.',Date.now,DANA),completed:1};
 let history=nextHistory(state,{text:'Q1',previousPlayback:'played',previousCompletedSegments:1});
 state=issuedState(state,history,'Heard part. Unheard tail.',['Heard part.',' Unheard tail.']);
 state={...state,completed:1};
 history=nextHistory(state,{text:'Q2',previousPlayback:'interrupted',previousCompletedSegments:1});
 state=issuedState(state,history,'R2.',['R2.']);
 state={...state,completed:1};
 const reply=retryState(state,2,'c'.repeat(32)).history.at(-1);
 assert.equal(reply.text,'Heard part.','the unheard tail is not replayed to the actor');
 assert.equal(reply.omittedTail,true);
 assert.equal(reply.playbackStatus,'played');
});

test('an out-of-range turn or a spent alternative is refused before any work',()=>{
 const parent=encounterOfThree();
 for(const bad of [0,-1,4,1.5,'2',null,undefined])assert.throws(()=>retryState(parent,bad,'d'.repeat(32)),{code:'preview_input_invalid'},String(bad));
 assert.throws(()=>retryState({...parent,retried:true},2,'d'.repeat(32)),{code:'preview_encounter_finished'});
});

// One opening plus `turns` sequential turns; returns the latest sealed receipt.
async function runEncounter(s,turns){
 let state=(await start(s)).at(-1).state;
 for(let n=1;n<=turns;n++){
  const output=await events(await s.handler()(request({action:'turn',caseId:DANA,state,text:'Q'+n,previousPlayback:'played',previousCompletedSegments:n===1?1:2})));
  state=output.at(-1).state;
 }
 return state;
}

test('a retry sends the actor the truncated history and nothing from the retried turn onward',async()=>{
 const s=setup();
 const state=await runEncounter(s,2);
 const before=s.contexts.length;
 const output=await events(await s.handler()(request({action:'retry',caseId:DANA,state,turnId:2,text:'A different way of asking'})));
 assert.deepEqual(output.map(x=>x.type),['reply','audio','audio','complete']);
 const prompt=JSON.stringify(s.contexts.at(-1).messages);
 assert.equal(s.contexts.length,before+1);
 assert.equal(prompt.includes('Q1'),true,'the earlier question is still in context');
 assert.equal(prompt.includes('Q2'),false,'the retried question is not');
 assert.equal(prompt.includes('A different way of asking'),true,'the alternative wording is');
});

test('a second retry on the same encounter is refused before any provider work',async()=>{
 const s=setup();
 const state=await runEncounter(s,2);
 const first=await events(await s.handler()(request({action:'retry',caseId:DANA,state,turnId:2,text:'Once'})));
 const after=s.contexts.length;
 const second=await s.handler()(request({action:'retry',caseId:DANA,state:first.at(-1).state,turnId:2,text:'Twice'}));
 assert.equal(second.status,409);
 assert.equal((await second.json()).error,'preview_encounter_finished');
 assert.equal(s.contexts.length,after,'no provider call was made for the refused retry');
});

test('re-presenting a consumed turn receipt still fails, which is the control this design preserves',async()=>{
 const s=setup();
 const state=await runEncounter(s,1);
 const body={action:'turn',caseId:DANA,state,text:'Q2',previousPlayback:'played',previousCompletedSegments:2};
 await events(await s.handler()(request(body)));
 const replay=await s.handler()(request({...body,text:'A different question'}));
 assert.equal(replay.status,409);
 assert.equal((await replay.json()).error,'preview_operation_duplicate');
});

test('a malformed retry body is refused before reservation',async()=>{
 const s=setup();
 const state=await runEncounter(s,2);
 const before=s.calls.length;
 for(const body of [
  {action:'retry',caseId:DANA,state,turnId:2},
  {action:'retry',caseId:DANA,state,turnId:9,text:'A question'},
  {action:'retry',caseId:DANA,state,turnId:2,text:''},
  {action:'retry',caseId:DANA,state,turnId:2,text:'A question',extra:true},
  {action:'retry',caseId:DANA,state,turnId:2,text:'A question',previousPlayback:'played',previousCompletedSegments:2}
 ])assert.equal((await s.handler()(request(body))).status>=400,true,JSON.stringify(Object.keys(body)));
 assert.equal(s.calls.length,before,'nothing was reserved for a malformed retry');
});

test('the receipt a retry was asked from cannot then be reused, or the one-alternative cap is bypassable',async()=>{
 const s=setup();
 const state=await runEncounter(s,2);
 await events(await s.handler()(request({action:'retry',caseId:DANA,state,turnId:2,text:'One alternative'})));
 // Continuing from the PRE-retry receipt would produce a branch with no retried
 // flag, and a second alternative could be asked from it.
 const reused=await s.handler()(request({action:'turn',caseId:DANA,state,text:'Continuing from before the alternative',previousPlayback:'played',previousCompletedSegments:2}));
 assert.equal(reused.status>=400,true,'the receipt a retry consumed must not also serve a turn');
 // This fixture's ledger only checks the operation id, so it says duplicate; the
 // real ledger also compares the binding hash and says mismatch. Either is a refusal.
 assert.equal(['preview_operation_duplicate','preview_operation_mismatch'].includes((await reused.json()).error),true);
});

test('the registry carries exactly the reviewed cases, each with its own binding',async()=>{
 const {CASES,caseIds,getCase}=await import('../lib/case.mjs');
 assert.deepEqual([...caseIds].sort(),['sp_depression_gated_si_001','sp_mania_redirect_001','sp_psychosis_paranoid_001']);
 assert.equal(caseIds.includes('sp_alcohol_ambivalence_001'),false,'Morgan is out of scope for this slice');
 const bindings=caseIds.map(id=>CASES[id].binding);
 assert.equal(new Set(bindings).size,bindings.length,'each case must have a distinct binding');
 for(const id of caseIds)assert.equal(CASES[id].caseDef.id,id);
 assert.equal(getCase('sp_mania_redirect_001').caseDef.persona.displayName.length>0,true);
 assert.equal(getCase('not_a_case'),undefined);
});

test('only Dana carries the direct-suicide-question overlay',async()=>{
 const {CASES}=await import('../lib/case.mjs');
 assert.equal(CASES.sp_depression_gated_si_001.caseDef.localDraftOverlay?.id,'dana-direct-si-v1');
 for(const id of ['sp_mania_redirect_001','sp_psychosis_paranoid_001'])
  assert.equal(Object.hasOwn(CASES[id].caseDef,'localDraftOverlay'),false,id+' must not receive Dana overlay');
});

test('a receipt sealed for one case cannot be opened as another',async()=>{
 const {CASES}=await import('../lib/case.mjs');
 const bind=id=>`hosted-sp-v2:${id}:${CASES[id].binding}:deploy:origin:secret`;
 const marcus=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:bind('sp_mania_redirect_001'),now:()=>0});
 const ray=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:bind('sp_psychosis_paranoid_001'),now:()=>0});
 const token=marcus.seal(initialState('Marcus opening.',()=>0,'sp_mania_redirect_001'));
 assert.equal(marcus.open(token).caseId,'sp_mania_redirect_001');
 assert.throws(()=>ray.open(token),{code:'preview_state_invalid'},'a Marcus receipt must not open as Ray');
});

test('the sealed caseId must be a plausible id',()=>{
 const codec=createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:'test',now:()=>0});
 const base=initialState('Opening',()=>0,'sp_mania_redirect_001');
 assert.equal(codec.open(codec.seal(base)).caseId,'sp_mania_redirect_001');
 for(const bad of ['',null,1,{},'x'.repeat(65)])
  assert.throws(()=>codec.open(codec.seal({...base,caseId:bad})),{code:'preview_state_invalid'},String(bad));
});

test('a start names its case, and an unknown case is refused before any reservation',async()=>{
 const s=setup();
 const good=await events(await s.handler()(request({action:'start',caseId:'sp_mania_redirect_001',requestId:crypto.randomUUID()})));
 assert.equal(good[0].type,'reply');
 const before=s.calls.length;
 for(const caseId of ['sp_alcohol_ambivalence_001','not_a_case','',null])
  assert.equal((await s.handler()(request({action:'start',caseId,requestId:crypto.randomUUID()}))).status,400,String(caseId));
 assert.equal(s.calls.length,before,'nothing was reserved for an unknown case');
});

test('a turn whose caseId disagrees with its receipt is refused before any reservation',async()=>{
 const s=setup();
 const state=(await events(await s.handler()(request({action:'start',caseId:'sp_mania_redirect_001',requestId:crypto.randomUUID()})))).at(-1).state;
 const before=s.calls.length;
 const wrong=await s.handler()(request({action:'turn',caseId:'sp_psychosis_paranoid_001',state,text:'A question',previousPlayback:'played',previousCompletedSegments:1}));
 assert.equal(wrong.status,400);
 assert.equal(s.calls.length,before,'a case mismatch reserves nothing');
});

test('each case speaks its opening in its own voice',async()=>{
 const spoken=[];
 const s=setup({provider:{speak:async job=>{spoken.push(job.caseId);return mp3;}}});
 for(const caseId of ['sp_mania_redirect_001','sp_psychosis_paranoid_001'])
  await events(await s.handler()(request({action:'start',caseId,requestId:crypto.randomUUID()})));
 assert.deepEqual(spoken,['sp_mania_redirect_001','sp_psychosis_paranoid_001']);
});

test('a retry never presents an unheard reply as heard — R1',()=>{
 // A reply that was interrupted before ANY segment played keeps its full generated
 // text in history; only playbackStatus marks it unheard. Truncation must carry that
 // status, or the tail is laundered into heard history and reaches the actor.
 let state={...initialState('Opening line.',Date.now,DANA),completed:1};
 let history=nextHistory(state,{text:'Q1',previousPlayback:'played',previousCompletedSegments:1});
 state=issuedState(state,history,'R1 never heard.',['R1 never heard.']);
 state={...state,completed:0};                                  // nothing played
 history=nextHistory(state,{text:'Q2',previousPlayback:'interrupted',previousCompletedSegments:0});
 state=issuedState(state,history,'R2.',['R2.']);
 state={...state,completed:1};

 const child=retryState(state,2,'a'.repeat(32));
 const tail=child.history.at(-1);
 assert.equal(tail.text,'R1 never heard.','the entry is still there');
 assert.equal(tail.playbackStatus,'interrupted','and is still marked unheard');
 assert.equal(child.completed,0,'a retry must not claim an unheard reply was heard');
});

test('a retry of the first question after an unheard opening does not present it as heard — R1',()=>{
 let state=initialState('Opening never heard.',Date.now,DANA);   // completed stays 0
 let history=nextHistory(state,{text:'Q1',previousPlayback:'interrupted',previousCompletedSegments:0});
 state=issuedState(state,history,'R1.',['R1.']);
 state={...state,completed:1};
 const child=retryState(state,1,'b'.repeat(32));
 assert.equal(child.history.at(-1).playbackStatus,'interrupted');
 assert.equal(child.completed,0,'an unheard opening must not become heard by retrying turn 1');
});

test('a retry of a heard reply still presents it as heard — R1 regression guard',()=>{
 let state={...initialState('Opening line.',Date.now,DANA),completed:1};
 let history=nextHistory(state,{text:'Q1',previousPlayback:'played',previousCompletedSegments:1});
 state=issuedState(state,history,'R1 heard.',['R1 heard.']);
 state={...state,completed:1};
 history=nextHistory(state,{text:'Q2',previousPlayback:'played',previousCompletedSegments:1});
 state=issuedState(state,history,'R2.',['R2.']);
 state={...state,completed:1};
 const child=retryState(state,2,'c'.repeat(32));
 assert.equal(child.history.at(-1).playbackStatus,'played');
 assert.equal(child.completed,1,'a genuinely heard reply is still available to the actor');
});

test('a retry after a zero-heard reply sends the actor nothing of that reply — R1 end to end',async()=>{
 // Distinct text per reply, or a heard reply and an unheard one are indistinguishable.
 // Overriding replyStream replaces setup's own capture, so capture here instead.
 let n=0;const seen=[];
 const s=setup({provider:{replyStream:async job=>{seen.push(job);n++;const lead='Reply '+n+' lead.';job.onLead(lead);return lead+' Reply '+n+' tail.';}}});
 let state=(await start(s)).at(-1).state;
 // Turn 1 is heard; turn 2's reply is interrupted before any segment plays.
 let out=await events(await s.handler()(request({action:'turn',caseId:DANA,state,text:'Q1',previousPlayback:'played',previousCompletedSegments:1})));
 state=out.at(-1).state;
 out=await events(await s.handler()(request({action:'turn',caseId:DANA,state,text:'Q2',previousPlayback:'played',previousCompletedSegments:2})));
 state=out.at(-1).state;
 // Acknowledge that NOTHING of the turn-2 reply played.
 out=await events(await s.handler()(request({action:'turn',caseId:DANA,state,text:'Q3',previousPlayback:'interrupted',previousCompletedSegments:0})));
 state=out.at(-1).state;
 const unheard=seen.length;   // three replies were generated

 const before=seen.length;
 await events(await s.handler()(request({action:'retry',caseId:DANA,state,turnId:3,text:'Asking turn 3 a different way'})));
 assert.equal(seen.length,before+1);
 const prompt=JSON.stringify(seen.at(-1).messages);
 assert.equal(prompt.includes('Q3'),false,'the retried question is absent');
 // start does not call replyStream, so Reply N answers QN. Reply 2 is the one the
 // learner acknowledged hearing none of.
 assert.equal(prompt.includes('Reply 2'),false,'the never-heard reply must not reach the actor on a retry');
 assert.equal(prompt.includes('Reply 1'),true,'while the reply that WAS heard is still available');
 assert.equal(unheard,3,'the fixture generated three replies, one of which was never heard');
});
