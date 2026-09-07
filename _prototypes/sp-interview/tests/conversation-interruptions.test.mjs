import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {createSpeechBridge} = require('../sp-interview.conversation.js');

function fixture() {
  let callbacks, playbackCallbacks, adopted, bridge;
  const events = [], stats = {starts:0,stops:0,plays:0,audioStops:0,interrupts:0};
  let ready = false;
  const input = {start(){stats.starts++; if(ready) callbacks.onReady();}, stop(){stats.stops++;},retarget(next){callbacks=next;}};
  const receiver = {onReady(){events.push('ready');},onStart(){events.push('start');},onEnd(){},onResult(result){events.push(result);},onConnecting(){},onError(error){throw error;}};
  bridge = createSpeechBridge({
    enabled:()=>true,
    createInput(next){callbacks=next;return input;},
    speak(next){stats.plays++;playbackCallbacks=next;return{stop(){stats.audioStops++;}};},
    interrupt(){stats.interrupts++;handle.stop();adopted=bridge.input(receiver);adopted.start();},
    onMonitor(value){events.push('monitor:'+value);}
  });
  const handle = bridge.speak({text:'Dana opening',onHeardText(prefix){events.push('heard:'+prefix);},onError(error){events.push(error.message);},onEnded(){adopted=bridge.input(receiver);adopted.start();}});
  return {bridge,handle,input,events,stats,get callbacks(){return callbacks;},get playback(){return playbackCallbacks;},ready(){ready=true;callbacks.onReady();},get adopted(){return adopted;}};
}

test('headphone mode connects the microphone before starting Dana playback',()=>{
  const f=fixture();assert.equal(f.stats.plays,0);f.ready();assert.equal(f.stats.plays,1);f.handle.stop();assert.equal(f.stats.stops,1);
});
test('a result without speechstart interrupts and preserves the first negation once',()=>{
  const f=fixture();f.ready();const first={text:'No, I am not asking that',final:true,resultId:'1:0'};
  f.callbacks.onResult(first);
  assert.equal(f.stats.interrupts,1);assert.equal(f.stats.audioStops,1);assert.equal(f.stats.stops,0);
  assert.equal(f.events.filter(x=>typeof x==='object'&&x.text===first.text&&x.final===first.final).length,1);assert.equal(f.adopted.source,f.input);
  f.adopted.stop();assert.equal(f.stats.stops,1);
});
test('speechstart waits for words, then transfers the existing recognizer without losing them',()=>{
  const f=fixture();f.ready();f.callbacks.onStart();assert.equal(f.stats.interrupts,0);const first={text:'No, wait',final:false};f.callbacks.onResult(first);
  assert.equal(f.events.filter(x=>x==='start').length,1);assert.equal(f.events.filter(x=>typeof x==='object'&&x.text===first.text&&x.final===first.final).length,1);assert.equal(f.stats.stops,0);
});
test('natural playback end adopts the same input without interrupting',()=>{
  const f=fixture();f.ready();f.playback.onEnded();assert.equal(f.adopted.source,f.input);assert.equal(f.stats.interrupts,0);assert.equal(f.stats.stops,0);
});
test('interrupting before microphone readiness cancels any late playback start',()=>{
  const f=fixture();const staleReady=f.callbacks.onReady;f.bridge.interrupt();staleReady();f.ready();assert.equal(f.stats.plays,0);assert.equal(f.stats.stops,0);
});
test('stop detaches a pending monitor and ignores late readiness or result',()=>{
  const f=fixture();const old=f.callbacks;f.handle.stop();old.onReady();old.onResult({text:'late',final:true});assert.equal(f.stats.plays,0);assert.equal(f.stats.interrupts,0);assert.equal(f.stats.stops,1);
});
test('playback callbacks after interruption cannot finish the new learner turn',()=>{
  const f=fixture();f.ready();const stale=f.playback;f.bridge.interrupt();const adopted=f.adopted;stale.onEnded();stale.onError(new Error('late'));assert.equal(f.adopted,adopted);assert.equal(f.stats.stops,0);
});
test('the headphone bridge forwards verified heard text only while its playback is active',()=>{
  const f=fixture();f.ready();const stale=f.playback;
  stale.onHeardText('Dana');assert.ok(f.events.includes('heard:Dana'));
  f.bridge.interrupt();stale.onHeardText('Dana opening');
  assert.equal(f.events.includes('heard:Dana opening'),false);
});
test('a final reply with no next capture stops its monitoring microphone',()=>{
  let cb,playback,stops=0;
  const bridge=createSpeechBridge({enabled:()=>true,onMonitor(){},interrupt(){},createInput(next){cb=next;return{start(){},stop(){stops++;},retarget(){}};},speak(next){playback=next;return{stop(){}};}});
  bridge.speak({text:'last',onEnded(){},onError(error){throw error;}});cb.onReady();playback.onEnded();assert.equal(stops,1);
});
test('a microphone factory error clears the interruption monitor and reports failure',()=>{
  const states=[],errors=[];let interrupts=0;
  const bridge=createSpeechBridge({enabled:()=>true,onMonitor(state){states.push(state);},createInput(){throw new Error('Unavailable microphone');},speak(){throw new Error('must not play');},interrupt(){interrupts++;}});
  assert.doesNotThrow(()=>bridge.speak({text:'opening',onEnded(){},onError(error){errors.push(error.message);}}));
  assert.equal(states.at(-1),'off');assert.deepEqual(errors,['Unavailable microphone']);bridge.interrupt();assert.equal(interrupts,1);
});

test('short final backchannels do not interrupt patient audio or create learner turns',()=>{
  for(const text of ['mm-hmm','Uh-huh.','okay','yes','right','I see']){
    const f=fixture();f.ready();f.callbacks.onStart();f.callbacks.onResult({text,final:true,resultId:'1:0'});
    assert.equal(f.stats.interrupts,0,text);assert.equal(f.stats.audioStops,0,text);assert.equal(f.adopted,undefined,text);f.handle.stop();
  }
});
test('a question or fuller acknowledgment interrupts and retains all words',()=>{
  for(const text of ['Okay, but how much?','Right?','Yes and I want to understand','No, that is not what I meant']){
    const f=fixture();f.ready();f.callbacks.onStart();const result={text,final:true,resultId:'1:0'};f.callbacks.onResult(result);
    assert.equal(f.stats.interrupts,1,text);assert.equal(f.stats.audioStops,1,text);assert.deepEqual(f.events.at(-1),result);f.adopted.stop();
  }
});
test('headphone opt-in remains required; disabled mode creates no monitor',()=>{
  let inputs=0,plays=0;const bridge=createSpeechBridge({enabled:()=>false,createInput(){inputs++;},speak(){plays++;return{stop(){}};}});
  bridge.speak({text:'patient'});assert.equal(inputs,0);assert.equal(plays,1);
});
