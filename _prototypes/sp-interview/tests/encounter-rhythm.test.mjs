import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {isAcknowledgment,createListener,createFloorRequests}=require('../sp-encounter-rhythm.js');

function fixture(){
  let callbacks,ready=false;
  const events=[],stats={starts:0,stops:0,interrupts:0},input={
    start(){stats.starts++;if(ready)callbacks.onReady();},stop(){stats.stops++;},retarget(value){callbacks=value;}
  };
  const listener=createListener({createInput(value){callbacks=value;return input;},onReady(){events.push('ready');},onConnecting(){events.push('connecting');},
    onAcknowledgment(result){events.push(['ack',result.text]);},onInterrupt(seed){stats.interrupts++;events.push(['interrupt',seed]);},onError(error){events.push(['error',error.message]);}});
  listener.start();
  return{listener,events,stats,input,get callbacks(){return callbacks;},ready(){ready=true;callbacks.onReady();},take(){
    const received=[];
    const adopted=listener.takeInput({onReady(){received.push('ready');},onStart(){received.push('start');},onEnd(){received.push('end');},onResult(result){received.push(result);},onError(error){received.push(error);}});
    adopted.start();return{adopted,received};
  }};
}
test('only exact short acknowledgments qualify; questions, negations, and continuations do not',()=>{
  for(const text of ['mm-hmm','mhm','mm hmm','Uh-huh.','okay!','OK','yes','yeah','right','I see.'])assert.equal(isAcknowledgment(text),true,text);
  for(const text of ['','hmm','no','yes?','Right?','Okay, but I am worried','I see why you worry','yes and what next','No, okay','Mm-hmm, how much?','sure','not right'])assert.equal(isAcknowledgment(text),false,text);
});
test('speech onset and a final backchannel preserve playback without creating an interruption',()=>{
  const f=fixture();f.ready();f.callbacks.onStart();f.callbacks.onResult({text:'mm-hmm',final:false});
  assert.equal(f.stats.interrupts,0);assert.equal(f.events.some(e=>Array.isArray(e)&&e[0]==='ack'),false);
  f.callbacks.onResult({text:'mm-hmm',final:true,resultId:'1:0'});
  assert.equal(f.stats.interrupts,0);assert.deepEqual(f.events.at(-1),['ack','mm-hmm']);assert.equal(f.stats.stops,0);f.listener.stop();
});
test('an interim acknowledgment that grows into a question hands off all first words',()=>{
  const f=fixture();f.ready();f.callbacks.onStart();f.callbacks.onResult({text:'okay',final:false});
  const question={text:'okay but what happened next',final:false};f.callbacks.onResult(question);
  assert.equal(f.stats.interrupts,1);const {adopted,received}=f.take();assert.equal(adopted.source,f.input);
  assert.deepEqual(received,['ready','start',question]);assert.equal(f.stats.stops,0);adopted.stop();assert.equal(f.stats.stops,1);
});
test('partial recognition of uh-huh or I see waits without discarding a fuller interruption',()=>{
  for(const [partial,final] of [['uh','uh-huh'],['I','I see']]){
    const f=fixture();f.ready();f.callbacks.onStart();f.callbacks.onResult({text:partial,final:false});
    assert.equal(f.stats.interrupts,0);f.callbacks.onResult({text:final,final:true});assert.equal(f.stats.interrupts,0);f.listener.stop();
  }
  const f=fixture();f.ready();f.callbacks.onResult({text:'I',final:false});f.callbacks.onResult({text:'I disagree with that',final:false});
  const {received,adopted}=f.take();assert.equal(f.stats.interrupts,1);assert.equal(received.at(-1).text,'I disagree with that');adopted.stop();
});
test('asynchronous cancellation buffers finalized chunks and replaces interim hypotheses',()=>{
  const f=fixture();f.ready();f.callbacks.onResult({text:'No',final:true,resultId:'1:0'});
  f.callbacks.onResult({text:'I did',final:false});f.callbacks.onResult({text:'I did not mean',final:false});
  f.callbacks.onResult({text:'I did not mean that',final:true,resultId:'1:1'});
  const {received,adopted}=f.take();assert.equal(f.stats.interrupts,1);
  assert.deepEqual(received.filter(item=>typeof item==='object').map(item=>item.text),['No','I did not mean that']);adopted.stop();
});
test('a backchannel begun during playback stays excluded if it finalizes after playback ends',()=>{
  const f=fixture();f.ready();f.callbacks.onStart();f.callbacks.onResult({text:'mm-hmm',final:false});
  const {received,adopted}=f.take();f.callbacks.onResult({text:'mm-hmm',final:true,resultId:'1:0'});
  assert.deepEqual(received,['ready']);assert.deepEqual(f.events.at(-1),['ack','mm-hmm']);
  f.callbacks.onStart();f.callbacks.onResult({text:'What happened next?',final:true,resultId:'1:1'});
  assert.equal(received.at(-1).text,'What happened next?');adopted.stop();
});
test('new yes spoken after a clean natural playback end is ordinary learner input',()=>{
  const f=fixture();f.ready();const {received,adopted}=f.take();f.callbacks.onStart();f.callbacks.onResult({text:'yes',final:true,resultId:'1:0'});
  assert.equal(received.at(-1).text,'yes');adopted.stop();
});
test('interim backchannel completed with more words after natural playback end loses nothing',()=>{
  const f=fixture();f.ready();f.callbacks.onStart();f.callbacks.onResult({text:'I see',final:false});
  const {received,adopted}=f.take();f.callbacks.onResult({text:'I see but could you explain that',final:true,resultId:'1:0'});
  assert.equal(received.at(-1).text,'I see but could you explain that');assert.equal(received.filter(x=>x==='start').length,1);adopted.stop();
});
test('explicit stop blocks stale callbacks and does not restart a microphone',()=>{
  const f=fixture(),stale=f.callbacks;f.listener.stop();stale.onReady();stale.onStart();stale.onResult({text:'No wait',final:true});
  f.listener.start();assert.equal(f.stats.starts,1);assert.equal(f.stats.stops,1);assert.equal(f.stats.interrupts,0);assert.equal(f.listener.takeInput({}),null);
});
test('the adopted capture ignores stale results and readiness after its owner stops',()=>{
  const f=fixture();f.ready();f.callbacks.onResult({text:'No wait',final:true});
  const {received,adopted}=f.take(),stale=f.callbacks,before=received.length;adopted.stop();
  stale.onReady();stale.onStart();stale.onResult({text:'late words',final:true});stale.onError(new Error('late'));adopted.start();
  assert.equal(received.length,before);assert.equal(f.stats.stops,1);assert.equal(f.stats.starts,2);
});
test('microphone errors fail closed instead of silently losing an interrupted thought',()=>{
  const f=fixture();f.ready();f.callbacks.onResult({text:'No',final:true});f.callbacks.onError(new Error('Recognition disconnected'));
  assert.equal(f.stats.stops,1);assert.equal(f.listener.takeInput({}),null);assert.deepEqual(f.events.at(-1),['error','Recognition disconnected']);
});
test('silence, acknowledgment count, and delay never create floor requests or patient impatience',()=>{
  const floor=createFloorRequests({});for(let i=0;i<100;i++)assert.equal(floor.next([],'public'),null);
});
function exchange(turnId,target='morgan',channel='public',status='completed'){
  return[{kind:'learner',channel,status:'completed',turnId,groupId:'g'+turnId,targetRoleId:target,text:'Synthetic question'},
    {kind:'segment',channel,status,turnId,groupId:'g'+turnId,roleId:target==='both'?'morgan':target,text:'Synthetic reply'}];
}
test('two completed public turns to one person make one explicit quiet-person request',()=>{
  const floor=createFloorRequests({}),events=[...exchange(1),...exchange(2)];
  const request=floor.next(events,'public');assert.equal(request.roleId,'maya');assert.equal(request.prompt,'Maya: “Could I add something?”');
  assert.deepEqual(floor.next([...events,...exchange(3)],'public'),request);assert.equal(floor.defer(request),true);
  assert.equal(floor.next([...events,...exchange(3)],'public'),null);assert.equal(floor.next([...events,...exchange(3),...exchange(4)],'public').roleId,'maya');
});
test('private, unplayed, failed, and mixed targeted exchanges cannot trigger a request',()=>{
  for(const events of [[...exchange(1),...exchange(2,'morgan','morgan-private')],[...exchange(1),...exchange(2,'morgan','public','pending')],
    [...exchange(1),...exchange(2,'morgan','public','interrupted')],[...exchange(1),...exchange(2,'maya')],[...exchange(1),...exchange(2,'both')]])assert.equal(createFloorRequests({}).next(events,'public'),null);
  assert.equal(createFloorRequests({}).next([...exchange(1),...exchange(2)],'morgan-private'),null);
});
test('a completed invitation clears the pending request without an automatic answer',()=>{
  const floor=createFloorRequests({}),events=[...exchange(1),...exchange(2)];const request=floor.next(events,'public');
  assert.equal(floor.next([...events,...exchange(3,'maya')],'public'),null);assert.equal(floor.invite(request),false);
  const second=createFloorRequests({}),again=second.next(events,'public');assert.equal(second.invite(again),true);assert.equal(second.next(events,'public'),null);
});
