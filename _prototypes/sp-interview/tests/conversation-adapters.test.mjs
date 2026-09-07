import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const path=new URL('../sp-interview.conversation.js',import.meta.url);
test('browser adapters are available independently of the view',()=>{
  assert.ok(fs.existsSync(path),'conversation browser adapters must exist');
  const api=require(path.pathname);
  assert.equal(typeof api.createSpeechInput,'function');
  assert.equal(typeof api.createSpeaker,'function');
});
test('speech input deduplicates finals and aborts with callbacks detached',()=>{
  assert.ok(fs.existsSync(path),'conversation browser adapters must exist');
  const api=require(path.pathname); let recognition; const events=[];
  class FakeRecognition { constructor(){recognition=this;} start(){} abort(){this.aborted=true;} }
  const input=api.createSpeechInput({SpeechRecognition:FakeRecognition,setTimeout,clearTimeout}, {onStart(){},onEnd(){},onError(e){throw e;},onResult(r){events.push(r);}});
  input.start();
  const result=Object.assign([{transcript:'How are you feeling?'}],{isFinal:true});
  recognition.onresult({resultIndex:0,results:[result]});
  recognition.onresult({resultIndex:0,results:[result]});
  assert.equal(events.filter(e=>e.final).length,1);
  assert.equal(events[0].text,'How are you feeling?');
  input.stop();
  assert.equal(recognition.aborted,true);
  assert.equal(recognition.onresult,null);
});
test('speaker removes stage directions, completes once and cancels late callbacks',()=>{
  assert.ok(fs.existsSync(path),'conversation browser adapters must exist');
  const api=require(path.pathname);let utterance,ended=0,cancels=0;
  class Utterance{constructor(text){this.text=text;}}
  const env={SpeechSynthesisUtterance:Utterance,speechSynthesis:{speak(v){utterance=v;},cancel(){cancels++;},getVoices(){return[{name:'Samantha',voiceURI:'samantha',lang:'en-US',localService:true}];}}};
  const speaker=api.createSpeaker(env,{text:'[Looks down.]\n\n*looks at hands* I am  tired.\n *sighs*',onEnded(){ended++;},onError(e){throw e;}});
  assert.equal(utterance.text,'I am tired.');
  const callback=utterance.onend;callback();callback();assert.equal(ended,1);
  speaker.stop();assert.ok(cancels>0);assert.equal(utterance.onend,null);
});
test('unfinished recognition never silently restarts and loses the start of a question',(t)=>{
  const api=require(path.pathname);let recognition,starts=0,problem;
  class FakeRecognition{constructor(){recognition=this;}start(){starts++;}abort(){}}
  const input=api.createSpeechInput({SpeechRecognition:FakeRecognition,setTimeout,clearTimeout},{onStart(){},onEnd(){},onResult(){},onError(e){problem=e;}});
  t.after(()=>input.stop());
  input.start();
  recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'You are not'}],{isFinal:false})]});
  recognition.onend();
  assert.match(problem?.message||'',/repeat.*whole question/i);
  assert.equal(starts,1);input.stop();
});
test('browser readiness is emitted only after the recognition service starts',(t)=>{
  const api=require(path.pathname);let recognition,ready=0;
  class FakeRecognition{constructor(){recognition=this;}start(){}abort(){}}
  const input=api.createSpeechInput({SpeechRecognition:FakeRecognition,setTimeout,clearTimeout},{onReady(){ready++;},onStart(){},onEnd(){},onResult(){},onError(e){throw e;}});
  t.after(()=>input.stop());
  input.start();assert.equal(ready,0);
  assert.equal(typeof recognition.onstart,'function');recognition.onstart();
  assert.equal(ready,1);input.stop();
});

function inputHarness(callbackOverrides = {}) {
  const api = require(path.pathname);
  let clock = 0, timerId = 0;
  const instances = [], timers = new Map(), events = [], errors = [];
  class Recognition {
    constructor() { this.starts = 0; this.aborts = 0; instances.push(this); }
    start() { this.starts += 1; }
    abort() { this.aborts += 1; }
  }
  const callbacks = {
    onReady() { events.push({type: 'ready'}); },
    onConnecting() { events.push({type: 'connecting'}); },
    onStart() { events.push({type: 'speech-start'}); },
    onEnd() { events.push({type: 'speech-end'}); },
    onResult(result) { events.push(result); },
    onError(error) { errors.push(error); },
    ...callbackOverrides,
  };
  const input = api.createSpeechInput({
    SpeechRecognition: Recognition,
    now: () => clock,
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, {callback, at: clock + delay});
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  }, callbacks);
  return {
    input, callbacks, instances, timers, events, errors,
    current() { return instances.at(-1); },
    advance(ms) {
      clock += ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= clock).sort((a,b) => a[1].at - b[1].at);
        if (!due.length) return;
        const [id, timer] = due[0];
        timers.delete(id); timer.callback();
      }
    },
  };
}

function recognitionResult(text, isFinal = true) {
  return Object.assign([{transcript: text}], {isFinal});
}

test('ordinary no-speech reconnects and keeps finalized words available for the continuing question', () => {
  const h = inputHarness();
  h.input.start(); h.current().onstart();
  const first = h.current(), lateEnd = first.onend;
  first.onresult({results: [recognitionResult('I do not')]});
  first.onerror({error: 'no-speech'});
  assert.equal(first.aborts, 1);
  assert.equal(h.errors.length, 0);
  assert.equal(h.events.at(-1).type, 'connecting');
  lateEnd();
  h.advance(0);
  assert.equal(h.instances.length, 2);
  h.current().onstart();
  h.current().onresult({results: [recognitionResult('understand what happened')]});
  const finalized = h.events.filter(event => event.final);
  assert.equal(finalized.map(event => event.text).join(' '), 'I do not understand what happened');
  assert.deepEqual(finalized.map(event => event.resultId), ['1:0', '2:0']);
  h.input.stop();
});

test('retarget adopts one connected recognizer and preserves the interruption first words and result IDs', () => {
  const received = [], ready = [];
  const nextCallbacks = {
    onReady() { ready.push(true); },
    onResult(result) { received.push(result); },
    onError(error) { throw error; },
  };
  const h = inputHarness({onResult(result) {
    h.input.retarget(nextCallbacks);
    assert.equal(ready.length, 0, 'retarget itself does not announce readiness');
    h.input.start();
    nextCallbacks.onResult(result); // Detector forwards its already-received seed exactly once.
  }});
  h.input.start(); h.current().onstart();
  const firstWords = recognitionResult('I am not');
  h.current().onresult({results: [firstWords]});
  h.current().onresult({results: [firstWords, recognitionResult('asking about that')]});
  h.input.start();
  assert.equal(h.instances.length, 1);
  assert.equal(h.current().starts, 1);
  assert.equal(ready.length, 2);
  assert.equal(received.map(event => event.text).join(' '), 'I am not asking about that');
  assert.deepEqual(received.map(event => event.resultId), ['1:0', '1:1']);
  assert.equal(h.timers.size, 1, 'repeated start does not add a deadline');
  h.input.stop();
});

test('retarget while connecting waits for actual recognition readiness', () => {
  const h = inputHarness();
  let ready = 0;
  h.input.start();
  h.input.retarget({onReady() { ready += 1; }});
  h.input.start();
  assert.equal(ready, 0);
  assert.equal(h.instances.length, 1);
  h.current().onstart();
  assert.equal(ready, 1);
  h.input.stop();
});

test('no-speech with unfinished interim words requires the entire question to be repeated', () => {
  const h = inputHarness();
  h.input.start(); h.current().onstart();
  h.current().onresult({results: [recognitionResult('I am not', false)]});
  h.current().onerror({error: 'no-speech'});
  h.advance(0);
  assert.equal(h.instances.length, 1);
  assert.match(h.errors[0]?.message || '', /repeat the whole question/);
  assert.equal(h.timers.size, 0);
});

test('only rapid unproductive restarts exhaust the restart budget', () => {
  const rapid = inputHarness();
  rapid.input.start();
  for (let i = 0; i < 4; i += 1) {
    rapid.current().onstart();
    rapid.current().onend();
    rapid.advance(0);
  }
  assert.match(rapid.errors[0]?.message || '', /repeatedly stopped/);
  assert.equal(rapid.instances.length, 4);
  assert.equal(rapid.timers.size, 0);

  const useful = inputHarness();
  useful.input.start();
  for (let i = 0; i < 7; i += 1) {
    useful.current().onstart();
    if (i === 2) useful.current().onresult({results: [recognitionResult('Still thinking')]});
    if (i >= 3) useful.advance(5000);
    useful.current().onend();
    useful.advance(0);
  }
  assert.equal(useful.errors.length, 0);
  assert.equal(useful.instances.length, 8);
  useful.input.stop();
});

test('stop removes every resource and saved callbacks cannot affect a later start', () => {
  const h = inputHarness();
  h.input.start(); h.current().onstart();
  const first = h.current();
  const late = {
    ready: first.onstart, speechStart: first.onspeechstart, speechEnd: first.onspeechend,
    result: first.onresult, error: first.onerror, end: first.onend,
  };
  first.onend();
  const queued = [...h.timers.values()].map(timer => timer.callback);
  h.input.stop();
  assert.equal(h.timers.size, 0);
  assert.equal(first.onresult, null);
  h.input.start();
  const eventCount = h.events.length;
  late.ready(); late.speechStart(); late.speechEnd(); late.end();
  late.result({results: [recognitionResult('stale question')]});
  late.error({error: 'network'});
  queued.forEach(callback => callback());
  assert.equal(h.events.length, eventCount);
  assert.equal(h.errors.length, 0);
  assert.equal(h.instances.length, 2);
  h.input.stop();
  assert.equal(h.timers.size, 0);
});

test('the five-minute turn limit survives retargeting and repeated start calls', () => {
  const h = inputHarness();
  h.input.start(); h.current().onstart();
  h.advance(299999);
  assert.equal(h.errors.length, 0);
  h.input.retarget(h.callbacks); h.input.start();
  h.advance(1);
  assert.match(h.errors[0]?.message || '', /5-minute limit/);
  assert.match(h.errors[0].message, /repeat the whole question/);
  assert.equal(h.timers.size, 0);
});

test('network and microphone permission errors remain visible failures', () => {
  for (const code of ['network', 'not-allowed', 'service-not-allowed', 'audio-capture']) {
    const h = inputHarness();
    h.input.start(); h.current().onstart();
    h.current().onerror({error: code});
    h.advance(0);
    assert.equal(h.errors.length, 1, code);
    assert.equal(h.instances.length, 1, code);
    assert.equal(h.timers.size, 0, code);
  }
});

test('holding before submission keeps cumulative recognition in one draft; a completed turn starts a clean capture',async(t)=>{
  const api=require(path.pathname),{createController}=require('../sp-interview.turns.js');
  const instances=[],timers=new Map(),requests=[],speeches=[];
  let clock=0,timerId=0;
  class Recognition{
    constructor(){this.results=[];instances.push(this);}
    start(){this.onstart();}
    abort(){}
    emit(text){
      this.onspeechstart();this.results.push(recognitionResult(text));
      this.onresult({resultIndex:this.results.length-1,results:this.results});this.onspeechend();
    }
  }
  const timing={
    now:()=>clock,
    setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,at:clock+delay});return id;},
    clearTimeout(id){timers.delete(id);},
  };
  function advance(ms){
    clock+=ms;
    for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.callback();}
  }
  const controller=createController({...timing,skipOpening:true,
    input:callbacks=>api.createSpeechInput({...timing,SpeechRecognition:Recognition},callbacks),
    respond(text){requests.push(text);return {reply:'Mornings have been difficult.'};},
    speak(args){speeches.push(args);return {stop(){}};},
  });
  t.after(()=>controller.end());controller.start();
  const first=instances[0],question='What have mornings been like?',continuation='I am still forming my next question.';
  first.emit(question);controller.setHoldTurn(true);advance(4500);first.emit(continuation);
  assert.equal(controller.getSnapshot().turnCount,0);
  assert.equal(controller.getSnapshot().draft,question+' '+continuation);
  first.onresult({resultIndex:0,results:first.results});
  assert.equal(controller.getSnapshot().draft,question+' '+continuation,'repeated cumulative results do not duplicate either segment');
  assert.deepEqual(requests,[]);
  controller.doneSpeaking();await Promise.resolve();
  assert.deepEqual(requests,[question+' '+continuation]);assert.equal(controller.getSnapshot().phase,'speaking');
  speeches.at(-1).onEnded();
  assert.equal(controller.getSnapshot().phase,'listening');assert.equal(controller.getSnapshot().turnCount,1);
  assert.notEqual(instances.at(-1),first);
  instances.at(-1).emit('A truly new question.');
  assert.equal(controller.getSnapshot().draft,'A truly new question.');
});
