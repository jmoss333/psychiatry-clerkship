import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createFacultyFeedbackHandler,FACULTY_FEEDBACK_STORE} from '../lib/faculty-feedback.mjs';
import {createStateCodec,initialState,nextHistory,issuedState,hash} from '../lib/state.mjs';
import {getCase} from '../lib/case.mjs';
import {createHandler} from '../lib/handler.mjs';
import {runtimeEnvironment} from '../netlify/functions/dana-preview.mjs';
import nativeHandler from '../netlify/functions/faculty-feedback.mjs';

const origin='https://feedback.example.test',DANA='sp_depression_gated_si_001',MORGAN='sp_alcohol_ambivalence_001';
const time=Date.parse('2026-11-20T12:00:00Z');
const env={DANA_PREVIEW_ENABLED:'true',DANA_PREVIEW_PASSCODE:'fixture-faculty-passcode',DANA_PREVIEW_STATE_KEY:randomBytes(32).toString('base64url'),DEPLOY_ID:'fixture-deploy',DEPLOY_URL:origin,FACULTY_FEEDBACK_REVIEW_KEY:randomBytes(32).toString('base64url')};
function codec(caseId=DANA,environment=env){
 return createStateCodec({key:environment.DANA_PREVIEW_STATE_KEY,binding:`hosted-sp-v2:${caseId}:${getCase(caseId).binding}:${environment.DEPLOY_ID}:${origin}:${hash(environment.DANA_PREVIEW_PASSCODE)}`,now:()=>time,withDeliveryIntensity:true});
}
function encounter(caseId=DANA){
 let state={...initialState('The opening is not selected.',()=>time,caseId),completed:1};
 for(const [question,reply,segments,completed] of [
  ['The first question is not selected.','Can I get back to work? Unheard concern tail.',['Can I get back to work?',' Unheard concern tail.'],1],
  ['We can talk about what work would require.','I still worry about my hours. Unheard reply tail.',['I still worry about my hours.',' Unheard reply tail.'],2],
 ]){
  state=issuedState(state,nextHistory(state,{text:question,previousPlayback:'interrupted',previousCompletedSegments:state.completed}),reply,segments);
  state.completed=completed;
 }
 return state;
}
function body(state=encounter(),changes={}){
 return {caseId:state.caseId,state:codec(state.caseId).seal(state),previousPlayback:'interrupted',previousCompletedSegments:1,patientIndex:2,learnerIndex:3,judgment:'Partly addressed',note:'A useful point for the next session.',...changes};
}
function request(payload,headers={},url=origin+'/api/faculty-feedback'){
 return new Request(url,{method:'POST',headers:{origin,'content-type':'application/json','x-preview-key':env.DANA_PREVIEW_PASSCODE,...headers},body:typeof payload==='string'?payload:JSON.stringify(payload)});
}
function review(headers={}){
 return new Request(origin+'/api/faculty-feedback',{headers:{origin,authorization:`Bearer ${env.FACULTY_FEEDBACK_REVIEW_KEY}`,...headers}});
}
function setup(options={}){
 const records=new Map(),calls={get:[],set:[],list:[]};let writes=0;
 const store={
  async get(key,options){calls.get.push({key,options});return records.has(key)?structuredClone(records.get(key)):null;},
  async set(key,value,options){calls.set.push({key,value,options});assert.deepEqual(options,{onlyIfNew:true});if(records.has(key))return {modified:false};records.set(key,JSON.parse(value));writes++;return {modified:true,etag:`etag-${writes}`};},
  async *list(options){calls.list.push(options);yield {blobs:[...records.keys()].map(key=>({key,etag:'fixture'})),directories:[]};},
  ...options.store,
 };
 return {records,calls,store,get writes(){return writes;},handler:createFacultyFeedbackHandler({env,store,now:()=>time,...options,store})};
}
test('saves only selected authenticated heard excerpts, authoritative settings, and a server timestamp',async()=>{
 const s=setup(),state=encounter(MORGAN);
 state.concernInitiative='forthcoming';state.deliveryIntensity='gentle';state.replyDetail='one-point';
 const payload=body(state),response=await s.handler(request(payload));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{saved:true,reference:state.sid});
 assert.equal(s.writes,1);assert.equal(s.records.size,1);
 const record=s.records.get(`v1/${state.sid}`);
 assert.deepEqual(record.settings,{concernInitiative:'forthcoming',deliveryIntensity:'gentle',replyDetail:'one-point'});
 assert.deepEqual(record.patient,{index:2,text:'Can I get back to work?',omittedTail:true});
 assert.deepEqual(record.learner,{index:3,text:'We can talk about what work would require.'});
 assert.deepEqual(record.patientReply,{index:4,text:'I still worry about my hours.',omittedTail:true});
 assert.equal(record.savedAt,new Date(time).toISOString());assert.equal(record.caseBinding,getCase(MORGAN).binding);assert.equal(record.deployId,env.DEPLOY_ID);
 const serialized=JSON.stringify(record);
 for(const privateValue of [payload.state,env.DANA_PREVIEW_PASSCODE,env.DANA_PREVIEW_STATE_KEY,env.FACULTY_FEEDBACK_REVIEW_KEY,state.nonce,'Unheard concern tail.','Unheard reply tail.','The opening is not selected.','The first question is not selected.'])assert.ok(!serialized.includes(privateValue),privateValue);
 for(const forbiddenKey of ['state','history','segments','passcode','token','previousPlayback','previousCompletedSegments'])assert.ok(!Object.hasOwn(record,forbiddenKey));
 assert.ok(s.calls.get.every(call=>call.options.consistency==='strong'));
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
});
test('legacy settings default and an unplayed following reply is omitted completely',async()=>{
 const s=setup(),state=encounter(),response=await s.handler(request(body(state,{previousCompletedSegments:0})));
 assert.equal(response.status,200);
 const record=s.records.get(`v1/${state.sid}`);
 assert.deepEqual(record.settings,{concernInitiative:'natural',deliveryIntensity:'standard',replyDetail:'standard'});
 assert.equal(record.patientReply,null);assert.ok(!JSON.stringify(record).includes('I still worry'));
});
test('a heard concern with no selected later learner response saves explicit nulls',async()=>{
 const s=setup(),state=encounter();
 assert.equal((await s.handler(request(body(state,{patientIndex:4,learnerIndex:null})))).status,200);
 const record=s.records.get(`v1/${state.sid}`);
 assert.deepEqual(record.patient,{index:4,text:'I still worry about my hours.',omittedTail:true});assert.equal(record.learner,null);assert.equal(record.patientReply,null);
});
test('a receipt emitted by the real full-encounter handler opens without a parallel signing convention',async()=>{
 const full=createHandler({env,now:()=>time,budget:{reserve:async()=>{}},provider:{configured:true,speak:async()=>Buffer.concat([Buffer.from('ID3'),Buffer.alloc(197)])}});
 const response=await full(request({action:'start',caseId:DANA,requestId:crypto.randomUUID()}));assert.equal(response.status,200);
 const events=(await response.text()).trim().split('\n').map(JSON.parse),receipt=events.at(-1).state,s=setup();
 const result=await s.handler(request({caseId:DANA,state:receipt,previousPlayback:'played',previousCompletedSegments:1,patientIndex:0,learnerIndex:null,judgment:'Still open',note:''}));
 assert.equal(result.status,200);const reference=(await result.json()).reference;
 assert.equal(s.records.get(`v1/${reference}`).patient.text,getCase(DANA).caseDef.persona.opening);
});
test('same submission retries succeed without writes or timestamp changes; edits conflict',async()=>{
 const s=setup(),state=encounter(),payload=body(state);
 assert.equal((await s.handler(request(payload))).status,200);
 const later=createFacultyFeedbackHandler({env,store:s.store,now:()=>time+60000});
 assert.equal((await later(request(payload))).status,200);assert.equal(s.writes,1);assert.equal(s.calls.set.length,1);
 assert.equal(s.records.get(`v1/${state.sid}`).savedAt,new Date(time).toISOString());
 for(const changes of [{note:'A changed note.'},{judgment:'Addressed'},{learnerIndex:null},{previousCompletedSegments:2}]){
  const response=await later(request({...payload,...changes}));assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'feedback_already_submitted'});
 }
 assert.equal(s.writes,1);
});
test('concurrent duplicate submissions create exactly one immutable record',async()=>{
 const s=setup(),payload=body(),responses=await Promise.all([s.handler(request(payload)),s.handler(request(payload))]);
 assert.deepEqual(responses.map(response=>response.status),[200,200]);assert.equal(s.writes,1);assert.equal(s.records.size,1);
 assert.ok(s.calls.set.every(call=>call.options.onlyIfNew===true));
});
test('concurrent differing submissions produce one winner and one conflict',async()=>{
 const s=setup(),payload=body(),responses=await Promise.all([s.handler(request(payload)),s.handler(request({...payload,note:'Different judgment context.'}))]);
 assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);assert.equal(s.writes,1);assert.equal(s.records.size,1);
});
test('authorization and same-origin checks reject requests before any store reads or writes',async()=>{
 const s=setup(),payload=body();
 for(const headers of [{'x-preview-key':'wrong'},{'x-preview-key':''},{origin:'https://other.example.test'},{origin:''}])assert.equal((await s.handler(request(payload,headers))).status,403);
 assert.equal((await s.handler(request(payload,{},'https://other.example.test/api/faculty-feedback'))).status,403);
 assert.equal(s.calls.get.length,0);assert.equal(s.calls.set.length,0);
});
test('strict fields, selection order, supported cases, judgments, notes, and playback counts are checked before storage',async()=>{
 const s=setup(),payload=body();
 for(const changes of [
  {quote:'Forged words'},{settings:{}},{history:[]},{note:'x'.repeat(1201)},{note:17},{note:'bad\u0000note'},
  {judgment:'Passed'},{caseId:'sp_mania_redirect_001'},{caseId:'family_morgan_maya_001'},
  {patientIndex:1},{patientIndex:-1},{patientIndex:20},{patientIndex:2.1},{patientIndex:'2'},
  {learnerIndex:2},{learnerIndex:1},{learnerIndex:4},{learnerIndex:19},{learnerIndex:'3'},
  {previousPlayback:'pending'},{previousCompletedSegments:3},{previousCompletedSegments:-1},{previousCompletedSegments:1.5},
 ])assert.equal((await s.handler(request({...payload,...changes}))).status,400,JSON.stringify(changes));
 const missing={...payload};delete missing.note;assert.equal((await s.handler(request(missing))).status,400);
 assert.equal(s.calls.get.length,0);assert.equal(s.calls.set.length,0);
});
test('a selected last patient statement cannot be submitted if it was not heard',async()=>{
 const s=setup();assert.equal((await s.handler(request(body(encounter(),{patientIndex:4,learnerIndex:null,previousCompletedSegments:0})))).status,400);assert.equal(s.writes,0);
});
test('invalid JSON, media types, malformed UTF-8, and bounded bodies cannot write feedback',async()=>{
 const s=setup(),payload=body();
 assert.equal((await s.handler(request('{bad'))).status,400);
 assert.equal((await s.handler(request(payload,{'content-type':'text/plain'}))).status,400);
 assert.equal((await s.handler(request(' '.repeat(150001)))).status,413);
 const malformed=new Request(origin+'/api/faculty-feedback',{method:'POST',headers:{origin,'content-type':'application/json','x-preview-key':env.DANA_PREVIEW_PASSCODE},body:new Uint8Array([0xff])});
 assert.equal((await s.handler(malformed)).status,400);
 assert.equal(s.writes,0);assert.equal(s.calls.get.length,0);
});
test('receipt forgery, wrong case/deploy/key bindings, expired state, and retry receipts are refused',async()=>{
 const s=setup(),state=encounter(),payload=body(state);
 const corrupt=Buffer.from(payload.state,'base64url');corrupt[corrupt.length-1]^=1;
 const invalidTokens=[corrupt.toString('base64url'),codec(MORGAN).seal(state),codec(DANA,{...env,DEPLOY_ID:'other-deploy'}).seal(state),codec(DANA,{...env,DANA_PREVIEW_PASSCODE:'other-passcode-123456'}).seal(state),codec().seal({...state,caseId:MORGAN})];
 for(const token of invalidTokens)assert.equal((await s.handler(request({...payload,state:token}))).status,400);
 const expired=await s.handler(request({...payload,state:codec().seal({...state,expires:time})}));assert.equal(expired.status,410);assert.deepEqual(await expired.json(),{error:'preview_session_expired'});
 const retried=await s.handler(request({...payload,state:codec().seal({...state,retried:true})}));assert.equal(retried.status,400);assert.deepEqual(await retried.json(),{error:'feedback_original_encounter_required'});
 assert.equal(s.calls.get.length,0);assert.equal(s.writes,0);
});
test('private review requires its separate bearer key and never accepts the faculty passcode',async()=>{
 const s=setup(),state=encounter();assert.equal((await s.handler(request(body(state)))).status,200);
 for(const headers of [{authorization:''},{authorization:`Bearer ${env.DANA_PREVIEW_PASSCODE}`},{authorization:'', 'x-preview-key':env.DANA_PREVIEW_PASSCODE},{origin:'https://other.example.test'},{origin:''}])assert.equal((await s.handler(review(headers))).status,403);
 assert.equal(s.calls.list.length,0);
 const response=await s.handler(review());assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.records.length,1);assert.equal(result.truncated,false);assert.equal(result.records[0].reference,state.sid);
 assert.deepEqual(s.calls.list,[{prefix:'v1/',paginate:true}]);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
 const withoutOrigin=new Request(origin+'/api/faculty-feedback',{headers:{authorization:`Bearer ${env.FACULTY_FEEDBACK_REVIEW_KEY}`}});
 assert.equal((await s.handler(withoutOrigin)).status,200,'same-origin browser GET need not send an Origin header');
 const wrongUrl=new Request('https://other.example.test/api/faculty-feedback',{headers:{authorization:`Bearer ${env.FACULTY_FEEDBACK_REVIEW_KEY}`}});
 assert.equal((await s.handler(wrongUrl)).status,403,'missing Origin cannot bypass the allowed request URL');
});
test('review retrieves at most 200 records, stops pagination, and sorts the retrieved records',async()=>{
 const s=setup(),state=encounter();await s.handler(request(body(state)));
 const template=s.records.get(`v1/${state.sid}`);s.records.clear();
 for(let n=0;n<201;n++){const reference=n.toString(16).padStart(32,'0');s.records.set(`v1/${reference}`,{...template,reference,savedAt:new Date(time+n*1000).toISOString()});}
 let pageCount=0;
 s.store.list=async function*(options){assert.deepEqual(options,{prefix:'v1/',paginate:true});const entries=[...s.records.keys()];for(let i=0;i<entries.length;i+=50){pageCount++;yield {blobs:entries.slice(i,i+50).map(key=>({key})),directories:[]};}throw new Error('Pagination must stop once truncation is known');};
 s.calls.get.length=0;
 const response=await s.handler(review());assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.records.length,200);assert.equal(result.truncated,true);assert.equal(s.calls.get.length,200);assert.equal(pageCount,5);
 assert.equal(result.records[0].savedAt,new Date(time+199000).toISOString());assert.equal(result.records.at(-1).savedAt,new Date(time).toISOString());
});
test('storage failures and malformed stored data return safe errors, including private review',async()=>{
 const secretError=()=>{throw new Error('private transcript state and storage credential');};
 for(const store of [{get:secretError},{set:secretError},{get:async()=>({history:['should not leak']})},{set:async()=>({})},{set:async()=>({modified:false})}]){
  const s=setup({store}),response=await s.handler(request(body()));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'feedback_unavailable'});
 }
 const s=setup(),state=encounter();await s.handler(request(body(state)));s.records.get(`v1/${state.sid}`).history=['private transcript'];
 const response=await s.handler(review());assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'feedback_unavailable'});
 const badList=setup({store:{list:secretError}});assert.equal((await badList.handler(review())).status,503);
});
test('disabled or missing configuration fails closed and unsupported methods never write',async()=>{
 for(const changes of [{DANA_PREVIEW_ENABLED:'false'},{DEPLOY_ID:undefined},{DANA_PREVIEW_PASSCODE:'short'},{DANA_PREVIEW_STATE_KEY:undefined}]){
  const s=setup({env:{...env,...changes}});assert.equal((await s.handler(request(body()))).status,503);assert.equal(s.writes,0);
 }
 for(const key of [undefined,'short',env.DANA_PREVIEW_PASSCODE]){const s=setup({env:{...env,FACULTY_FEEDBACK_REVIEW_KEY:key}});assert.equal((await s.handler(review())).status,503);assert.equal(s.calls.list.length,0);}
 const s=setup();for(const method of ['PUT','OPTIONS','DELETE'])assert.equal((await s.handler(new Request(origin+'/api/faculty-feedback',{method,headers:{origin}}))).status,405);
 assert.equal(s.writes,0);
});
test('native adapter isolates durable feedback and uses the trusted invocation deploy identity',async()=>{
 assert.equal(FACULTY_FEEDBACK_STORE,'faculty-full-visit-feedback-v1');
 assert.equal(runtimeEnvironment({...env,DEPLOY_ID:'untrusted-build-id'},{deploy:{id:'trusted-deploy'},site:{url:origin}}).DEPLOY_ID,'trusted-deploy');
 const missingContext=await nativeHandler(request(body()),{});
 assert.equal(missingContext.status,503);assert.deepEqual(await missingContext.json(),{error:'feedback_unavailable'});
});
