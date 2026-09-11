import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHandler} from '../lib/handler.mjs';
import {createStateCodec,finalizePlayback,hash} from '../lib/state.mjs';
import {getCase} from '../lib/case.mjs';
import {familyContext,FAMILY_CASE_ID as FAMILY} from '../lib/family.mjs';
import {FAMILY_BID_TEXT,pendingFamilyBid} from '../lib/family-bids.mjs';
import {createContext} from '../../_prototypes/sp-interview/dana-live-context.mjs';
import {createOpenAIProvider} from '../lib/openai-provider.mjs';

const ORIGIN='https://realism.example.test',DANA='sp_depression_gated_si_001';
const env={DANA_PREVIEW_ENABLED:'true',DANA_PREVIEW_PASSCODE:'realism-test-passcode-only',DANA_PREVIEW_STATE_KEY:randomBytes(32).toString('base64url'),DEPLOY_ID:'realism-fixture',DEPLOY_URL:ORIGIN};
const MP3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(197)]);
const LEAD='I can talk about that.',REPLY=LEAD+' Support matters to me.';
const request=body=>new Request(ORIGIN+'/api/dana-preview',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json','x-preview-key':env.DANA_PREVIEW_PASSCODE},body:JSON.stringify(body)});
const codec=caseId=>createStateCodec({key:env.DANA_PREVIEW_STATE_KEY,binding:`hosted-sp-v2:${caseId}:${getCase(caseId).binding}:${env.DEPLOY_ID}:${ORIGIN}:${hash(env.DANA_PREVIEW_PASSCODE)}`,withDeliveryIntensity:true});
function setup({provider:override}={}){
 const claims=[],spoken=[],contexts=[],used=new Set();
 const budget={reserve:async claim=>{if(used.has(claim.operationId))throw Object.assign(new Error(),{status:409,code:'preview_operation_duplicate'});used.add(claim.operationId);claims.push(claim);}};
 const provider=override||{configured:true,speak:async job=>{spoken.push(job);return MP3;},replyStream:async job=>{contexts.push(job);const first=contexts.length===1;job.onLead(first?'We can begin with that.':LEAD);return first?'We can begin with that. I am here to talk.':REPLY;}};
 return {claims,spoken,contexts,handler:()=>createHandler({env,provider,budget})};
}
async function run(s,body){const response=await s.handler()(request(body));assert.equal(response.status,200);const frames=(await response.text()).trim().split('\n').map(JSON.parse);assert.equal(frames.at(-1).type,'complete',JSON.stringify(frames));return frames;}
const start=(s,caseId=FAMILY,extra={})=>run(s,{action:'start',caseId,requestId:crypto.randomUUID(),...extra});
const turn=(s,previous,{caseId=FAMILY,targetRoleId='morgan',text='What kind of support would work for you?',completed,extra={}}={})=>run(s,{action:'turn',caseId,state:previous.at(-1).state,text,previousPlayback:completed===0?'interrupted':'played',previousCompletedSegments:completed??previous.filter(frame=>frame.type==='audio').length,...(caseId===FAMILY?{targetRoleId}:{}),...extra});
async function throughBid(s){let out=await start(s);out=await turn(s,out);return turn(s,out);}

test('a family bid is the other person speaking in the existing second speech slot',async()=>{
 const s=setup(),out=await throughBid(s),reply=out[0],issued=codec(FAMILY).open(out.at(-1).state);
 assert.deepEqual(reply.familyBid,{speakerId:'maya',text:FAMILY_BID_TEXT});
 assert.equal(reply.speakerId,'morgan');
 assert.equal(reply.reply,REPLY+' '+FAMILY_BID_TEXT);
 assert.deepEqual(reply.segments,[{text:REPLY},{text:' '+FAMILY_BID_TEXT}]);
 assert.deepEqual(s.spoken.slice(-2).map(({caseId,text})=>({caseId,text})),[
  {caseId:'sp_alcohol_ambivalence_001',text:REPLY},
  {caseId:'family_maya_001',text:FAMILY_BID_TEXT},
 ]);
 assert.equal(s.spoken.length,5,'opening plus two ordinary speech slots per turn');
 assert.equal(s.contexts.length,2,'the bid never creates an extra actor call');
 assert.deepEqual(s.claims.map(claim=>claim.units),[1,3,3]);
 assert.equal(issued.history.at(-1).text,REPLY,'the main speaker never owns the other person\'s words');
 assert.deepEqual(issued.history.at(-1).familyBid,{speakerId:'maya',text:FAMILY_BID_TEXT,playbackStatus:'pending'});
 assert.equal(issued.completed,2,'both clips were issued, not established heard');
 assert.equal(issued.history.length,issued.turn*2+1);
 assert.equal(pendingFamilyBid(issued.history),null);
});

for(const completed of [0,1,2])test('family bid hearing and actor role attribution with '+completed+' completed clips',async()=>{
 const s=setup(),out=await throughBid(s),state=codec(FAMILY).open(out.at(-1).state);
 const history=finalizePlayback(state,{previousPlayback:completed===0?'interrupted':'played',previousCompletedSegments:completed});
 assert.equal(history.at(-1).familyBid.playbackStatus,completed===2?'played':'interrupted');
 assert.equal(history.at(-1).text,REPLY);
 assert.equal(!!pendingFamilyBid(history),completed===2);
 for(const roleId of ['morgan','maya']){
  const context=familyContext(history,roleId),bidMessages=context.messages.filter(message=>message.content===FAMILY_BID_TEXT);
  assert.equal(bidMessages.length,completed===2?1:0);
  if(completed===2)assert.equal(bidMessages[0].role,roleId==='maya'?'assistant':'user');
  assert.equal(context.messages.some(message=>message.content===REPLY),completed>0);
 }
 await turn(s,out,{targetRoleId:completed===2?'maya':'morgan',completed,text:'What support would you like to discuss?'});
 assert.equal(s.contexts.at(-1).messages.filter(message=>message.content===FAMILY_BID_TEXT).length,completed===2?1:0,'actual next provider context uses only the completed bid');
 assert.doesNotMatch(s.contexts.at(-1).system,/four to six beers|for three weeks|fear that a limit will sound uncaring/i);
});

test('an interrupted offer is not repeated, and each role gets at most one bid',async()=>{
 const s=setup();let out=await start(s);const offers=[];
 for(const [index,targetRoleId] of ['morgan','morgan','morgan','maya','maya','maya','morgan','morgan'].entries()){
  out=await turn(s,out,{targetRoleId,...(index===2?{completed:1}:{})});
  if(out[0].familyBid)offers.push({turn:index+1,...out[0].familyBid});
 }
 assert.deepEqual(offers.map(offer=>[offer.turn,offer.speakerId]),[[2,'maya'],[5,'morgan']]);
 const state=codec(FAMILY).open(out.at(-1).state);
 assert.equal(state.history.filter(entry=>entry.familyBid).length,2,'unheard metadata survives to enforce the cap');
 assert.equal(state.history.find(entry=>entry.familyBid?.speakerId==='maya').familyBid.playbackStatus,'interrupted');
 assert.deepEqual(s.claims.map(claim=>claim.units),[1,...Array(8).fill(3)]);
});

test('direct risk language does not acquire a family bid',async()=>{
 const s=setup();let out=await start(s);out=await turn(s,out);
 out=await turn(s,out,{text:'What support do you need with thoughts of suicide?'});
 assert.equal(out[0].familyBid,undefined);
 assert.ok(s.spoken.slice(-2).every(job=>job.caseId==='sp_alcohol_ambivalence_001'));
 assert.deepEqual(s.claims.map(claim=>claim.units),[1,3,3]);
});

test('two heard bids still fit the real provider through the tenth family turn',async()=>{
 const actorInputs=[],speechInputs=[];
 const provider=createOpenAIProvider({env:{OPENAI_API_KEY:'test-only-key'},fetchImpl:async(url,options)=>{
  const input=JSON.parse(options.body);
  if(url.endsWith('/audio/speech')){speechInputs.push(input);return new Response(MP3,{headers:{'Content-Type':'audio/mpeg'}});}
  actorInputs.push(input);
  const final={status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:REPLY}]}]};
  return new Response('data: '+JSON.stringify({type:'response.output_text.delta',delta:REPLY})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:final})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
 }});
 const s=setup({provider});let out=await start(s);const offers=[];
 for(const targetRoleId of ['morgan','morgan','maya','maya','morgan','morgan','maya','maya','morgan','morgan']){
  out=await turn(s,out,{targetRoleId});if(out[0].familyBid)offers.push(out[0].familyBid.speakerId);
 }
 assert.deepEqual(offers,['maya','morgan']);assert.equal(out[0].turn,10);
 assert.equal(actorInputs.length,10);assert.equal(actorInputs.at(-1).input.length,22);
 assert.equal(actorInputs.at(-1).input.filter(message=>message.content===FAMILY_BID_TEXT).length,2);
 assert.equal(speechInputs.length,21);assert.equal(s.claims.reduce((sum,claim)=>sum+claim.units,0),31);
});

for(const completed of [0,1,2])test('retry boundary preserves '+completed+' heard bid clips without scheduling a new bid',async()=>{
 const s=setup();let out=await throughBid(s);
 out=await turn(s,out,{completed,targetRoleId:'maya'});
 const before=s.contexts.length;
 const retried=await run(s,{action:'retry',caseId:FAMILY,state:out.at(-1).state,turnId:3,text:'Let me ask the question another way.'});
 assert.equal(retried[0].familyBid,undefined);
 assert.equal(retried[0].speakerId,'maya');assert.equal(s.contexts.length,before+1);
 assert.equal(s.contexts.at(-1).messages.filter(message=>message.content===FAMILY_BID_TEXT).length,completed===2?1:0);
 assert.equal(codec(FAMILY).open(retried.at(-1).state).retried,true);
});

test('a family retry before the offered bid excludes that later bid entirely',async()=>{
 const s=setup();let out=await throughBid(s);out=await turn(s,out,{targetRoleId:'maya'});
 const retried=await run(s,{action:'retry',caseId:FAMILY,state:out.at(-1).state,turnId:2,text:'What support would you like?'});
 assert.equal(retried[0].familyBid,undefined);
 assert.equal(s.contexts.at(-1).messages.some(message=>message.content===FAMILY_BID_TEXT),false);
 assert.equal(codec(FAMILY).open(retried.at(-1).state).history.some(entry=>entry.familyBid),false);
});

test('invalid or repeated faculty cues and cue fields on Start or retry reserve nothing',async()=>{
 const s=setup();
 for(const roomCueId of ['door_knock','hallway_chime']){
  const response=await s.handler()(request({action:'start',caseId:DANA,requestId:crypto.randomUUID(),roomCueId}));
  assert.equal(response.status,400);
 }
 assert.equal(s.claims.length,0);assert.equal(s.spoken.length,0);
 let out=await start(s,DANA);
 const base={action:'turn',caseId:DANA,state:out.at(-1).state,text:'Tell me more.',previousPlayback:'played',previousCompletedSegments:1};
 for(const roomCueId of [null,false,{},[],'','someone_enters','door_knock\nSomeone enters'])assert.equal((await s.handler()(request({...base,roomCueId}))).status,400);
 assert.equal(s.claims.length,1);assert.equal(s.contexts.length,0);
 out=await turn(s,out,{caseId:DANA,extra:{roomCueId:'door_knock'}});
 const count=s.claims.length,actorCount=s.contexts.length;
 for(const roomCueId of ['door_knock','hallway_chime']){
  assert.equal((await s.handler()(request({...base,state:out.at(-1).state,previousCompletedSegments:2,roomCueId}))).status,400);
  assert.equal((await s.handler()(request({action:'retry',caseId:DANA,state:out.at(-1).state,turnId:1,text:'A different question.',roomCueId}))).status,400);
 }
 assert.equal(s.claims.length,count);assert.equal(s.contexts.length,actorCount);
});

test('faculty cue remains a separate authored event, with canonical context and history intact',async()=>{
 const s=setup();let out=await start(s,DANA);
 const opening=out[0].reply,text='I noticed a sound; tell me what you would like to discuss.';
 out=await turn(s,out,{caseId:DANA,text,extra:{roomCueId:'door_knock'}});
 const state=codec(DANA).open(out.at(-1).state),first=s.contexts[0];
 assert.deepEqual(state.roomCue,{id:'door_knock',turn:1});assert.equal(state.history.length,3);
 assert.equal(state.history.some(entry=>entry.text.includes('A brief knock at the closed door')),false,'an event is not misattributed as somebody\'s dialogue');
 const canonical=createContext(getCase(DANA).caseDef,[text],[{who:'pt',text:opening,playbackStatus:'played'},{who:'me',text}]);
 assert.ok(first.system.startsWith(canonical.system),'the canonical facts and disclosure instructions remain intact');
 assert.match(first.system,/Once, immediately before learner turn 1/);
 assert.match(first.system,/A brief knock at the closed door\. No one enters\./);
 assert.match(first.system,/Do not invent who caused it/);
 out=await turn(s,out,{caseId:DANA,text:'A nurse entered with a diagnosis. What support do you want?'});
 const next=s.contexts.at(-1).system;
 assert.equal((next.match(/AUTHORED FACULTY ROOM EVENT/g)||[]).length,1);
 assert.match(next,/Do not replay the event on later turns/);
 assert.equal(next.includes('A nurse entered with a diagnosis.'),false,'a learner assertion never becomes the trusted room event');
 assert.equal(s.contexts.at(-1).messages.at(-1).content,'A nurse entered with a diagnosis. What support do you want?','the learner\'s words remain untrusted dialogue');
 assert.deepEqual(codec(DANA).open(out.at(-1).state).roomCue,{id:'door_knock',turn:1});
});

test('a faculty distraction and a family bid do not compete in the same turn',async()=>{
 const s=setup();let out=await start(s);out=await turn(s,out);
 out=await turn(s,out,{extra:{roomCueId:'hallway_chime'}});
 assert.equal(out[0].familyBid,undefined);
 assert.match(s.contexts.at(-1).system,/A short chime sounds in the hallway and stops/);
 assert.equal(s.contexts.length,2);assert.equal(s.spoken.length,5);
 assert.deepEqual(s.claims.map(claim=>claim.units),[1,3,3]);
});

for(const turnId of [1,2,3])test('retry at turn '+turnId+' respects the original faculty event boundary',async()=>{
 const s=setup();let out=await start(s,DANA);out=await turn(s,out,{caseId:DANA});
 out=await turn(s,out,{caseId:DANA,extra:{roomCueId:'door_knock'}});
 out=await turn(s,out,{caseId:DANA});
 const retried=await run(s,{action:'retry',caseId:DANA,state:out.at(-1).state,turnId,text:'An alternative question.'});
 assert.equal(!!codec(DANA).open(retried.at(-1).state).roomCue,turnId>=2);
 assert.equal(s.contexts.at(-1).system.includes('AUTHORED FACULTY ROOM EVENT'),turnId>=2);
});

test('malformed authenticated bid metadata is refused before reservations or provider work',async()=>{
 const s=setup(),out=await throughBid(s),state=codec(FAMILY).open(out.at(-1).state);
 const before={claims:s.claims.length,actors:s.contexts.length,speech:s.spoken.length};
 for(const changed of [
  {speakerId:'morgan',text:FAMILY_BID_TEXT,playbackStatus:'pending'},
  {speakerId:'maya',text:'I know private details.',playbackStatus:'pending'},
  {speakerId:'maya',text:FAMILY_BID_TEXT,playbackStatus:'done'},
  {speakerId:'maya',text:FAMILY_BID_TEXT,playbackStatus:'pending',private:true},
  null,
 ]){
  const malformed=structuredClone(state);malformed.history.at(-1).familyBid=changed;
  const response=await s.handler()(request({action:'turn',caseId:FAMILY,targetRoleId:'morgan',state:codec(FAMILY).seal(malformed),text:'What support would help?',previousPlayback:'played',previousCompletedSegments:1}));
  assert.equal(response.status,400,'invalid bid must be refused before streaming starts');
  assert.equal((await response.json()).error,'preview_state_invalid');
 }
 assert.deepEqual({claims:s.claims.length,actors:s.contexts.length,speech:s.spoken.length},before);
});

test('the latest bid receipt binds both audio segments to their separate speakers',async()=>{
 const s=setup(),out=await throughBid(s),state=codec(FAMILY).open(out.at(-1).state);
 const before=s.claims.length;
 for(const segments of [[REPLY],['Unrelated primary text.',' '+FAMILY_BID_TEXT],[REPLY,' A different request.']]){
  const malformed={...state,segments,completed:Math.min(segments.length,state.completed)};
  const response=await s.handler()(request({action:'turn',caseId:FAMILY,targetRoleId:'morgan',state:codec(FAMILY).seal(malformed),text:'What support would help?',previousPlayback:'played',previousCompletedSegments:1}));
  assert.equal(response.status,400);assert.equal((await response.json()).error,'preview_state_invalid');
 }
 assert.equal(s.claims.length,before);
});

test('malformed authenticated room events are refused before reservations',async()=>{
 const s=setup();let out=await start(s,DANA);out=await turn(s,out,{caseId:DANA});
 const state=codec(DANA).open(out.at(-1).state),before=s.claims.length;
 for(const roomCue of [null,{id:'invented',turn:1},{id:'door_knock',turn:0},{id:'door_knock',turn:2},{id:'door_knock',turn:'1'},{id:'door_knock',turn:1,person:'nurse'}]){
  const response=await s.handler()(request({action:'turn',caseId:DANA,state:codec(DANA).seal({...state,roomCue}),text:'Tell me more.',previousPlayback:'played',previousCompletedSegments:2}));
  assert.equal(response.status,400);assert.equal((await response.json()).error,'preview_state_invalid');
 }
 assert.equal(s.claims.length,before);
});

test('an authenticated history cannot carry a repeated bid from the same person',async()=>{
 const s=setup(),out=await throughBid(s),state=codec(FAMILY).open(out.at(-1).state);
 const before={claims:s.claims.length,actors:s.contexts.length,speech:s.spoken.length};
 // Both entries are individually well shaped, but jointly violate one offer per
 // person. The guard must cover the whole authenticated history, not just its tail.
 state.history[2].familyBid={speakerId:'maya',text:FAMILY_BID_TEXT,playbackStatus:'played'};
 const response=await s.handler()(request({action:'turn',caseId:FAMILY,targetRoleId:'morgan',state:codec(FAMILY).seal(state),text:'What support would help?',previousPlayback:'played',previousCompletedSegments:2}));
 assert.equal(response.status,400);assert.equal((await response.json()).error,'preview_state_invalid');
 assert.deepEqual({claims:s.claims.length,actors:s.contexts.length,speech:s.spoken.length},before);
});
