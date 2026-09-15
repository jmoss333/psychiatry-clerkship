import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizePlayback,nextHistory} from '../lib/state.mjs';
import {createMomentCodec,initialMomentState,nextMomentHistory,closeMomentState,retryMomentState} from '../lib/moments/state.mjs';
const d={id:'moment_test',revision:1,maxTurns:4,opening:'First sentence. Second sentence.',facts:[],criteria:[],templates:{},actorDirections:[]};
const env={DANA_PREVIEW_STATE_KEY:Buffer.alloc(32,1).toString('base64url'),DEPLOY_ID:'deploy',DANA_PREVIEW_PASSCODE:'fixture-passcode-long'};
const now=()=>1000,codec=()=>createMomentCodec({definition:d,env,origin:'https://example.test',now});
for(const completed of [0,1,2])test(`playback finalization preserves original and ${completed} heard segments`,()=>{
 const s={...initialMomentState(d,now),segments:['First sentence.',' Second sentence.'],completed:2};
 const before=structuredClone(s),body={text:'I heard you.',previousPlayback:completed===2?'played':'interrupted',previousCompletedSegments:completed};
 const h=finalizePlayback(s,body);assert.deepEqual(s,before);assert.deepEqual(nextHistory(s,body).slice(0,-1),h);
 assert.equal(h[0].playbackStatus,completed?'played':'interrupted');if(completed)assert.equal(h[0].text,s.segments.slice(0,completed).join(''));
});
test('moment codec binds all authored content, mode, case, phase and original expiry',()=>{
 const s=initialMomentState(d,now);assert.deepEqual(codec().open(codec().seal(s)),s);
 for(const change of [{id:'other'},{revision:2},{facts:[{id:'f',text:'changed'}]},{templates:{changed:'yes'}}]){
  const other=createMomentCodec({definition:{...d,...change},env,origin:'https://example.test',now});assert.throws(()=>other.open(codec().seal(s)));
 }
 for(const change of [{caseId:'other'},{moment:{...s.moment,extra:true}},{moment:{...s.moment,phase:'bad'}},{expires:1801001},{history:[{who:'pt',text:'x',playbackStatus:'bogus'}]}])assert.throws(()=>codec().open(codec().seal({...s,...change})));
});
test('closure validates before spending, preserves alternating history, alternative terminal',()=>{
 const s=initialMomentState(d,now);assert.throws(()=>closeMomentState(s,{previousPlayback:'played',previousCompletedSegments:0}));
 const h=nextMomentHistory({...s,completed:1},{text:'Hello',previousPlayback:'played',previousCompletedSegments:1});
 const turn={...s,turn:1,history:[...h,{who:'pt',text:'Reply.',playbackStatus:'pending'}],segments:['Reply.'],completed:1};
 const closed=closeMomentState(turn,{previousPlayback:'played',previousCompletedSegments:1});
 assert.equal(closed.history.length,3);assert.equal(closed.moment.phase,'closed');assert.notEqual(closed.nonce,turn.nonce);assert.equal(closed.expires,s.expires);
 assert.throws(()=>nextMomentHistory(closed,{text:'No'}));assert.throws(()=>closeMomentState(closed,{}));
 assert.equal(retryMomentState(closed,1,'a'.repeat(32)).expires,s.expires);
 assert.throws(()=>retryMomentState(turn,1,'a'.repeat(32)));
 assert.throws(()=>nextMomentHistory({...turn,turn:4},{text:'Fifth',previousPlayback:'played',previousCompletedSegments:1}));
});
