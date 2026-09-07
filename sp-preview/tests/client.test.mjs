import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
// The shipped browser file is a classic script; the server package is ESM.
const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(clientModule,clientModule.exports);
const {createParser,createCapture,createController}=clientModule.exports;
const audio=Buffer.alloc(100,1).toString('base64');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const until=async(fn)=>{for(let i=0;i<40;i++){if(fn())return;await flush();}assert.ok(fn(),'condition should become true');};
function frames(turn=0,parts=['Hello.','What would you like to discuss?']){
  const segments=parts.map((text,index)=>({text:index?' '+text:text}));
  return [{type:'reply',reply:segments.map(segment=>segment.text).join(''),segments,state:`reply-${turn}`,turn},...parts.map((_,index)=>({type:'audio',index,data:audio,state:`audio-${turn}-${index}`})),{type:'complete',state:`complete-${turn}`}];
}
function response(events,signal){
  let streamController;
  const stream=new ReadableStream({start(controller){streamController=controller;for(const event of events)controller.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n'));if(events.at(-1)?.type==='complete')controller.close();},cancel(){}});
  signal?.addEventListener('abort',()=>{try{streamController.error(new Error('Aborted'));}catch(_){}},{once:true});
  return new Response(stream,{headers:{'content-type':'application/x-ndjson; charset=utf-8'}});
}
function environment(fetcher){
  let now=0,id=0;const timers=new Map(),calls=[],audios=[],recognizers=[],revoked=[],urls=[];
  const env={document:{hidden:false},now(){return now;},crypto:{randomUUID:()=> '123e4567-e89b-42d3-a456-426614174000'},atob,Blob,
    setTimeout(callback,delay){const key=++id;timers.set(key,{callback,at:now+delay});return key;},clearTimeout(key){timers.delete(key);},
    URL:{createObjectURL(){const value='blob:preview-'+urls.length;urls.push(value);return value;},revokeObjectURL(value){revoked.push(value);}},
    fetch(path,options){calls.push({path,options,body:JSON.parse(options.body)});return fetcher?fetcher(path,options,calls.length):Promise.resolve(response(frames(calls.length-1),options.signal));},
    Audio:class{constructor(src){this.src=src;this.pauses=0;audios.push(this);}play(){return Promise.resolve();}pause(){this.pauses++;}removeAttribute(){this.src='';}load(){}},
    SpeechRecognition:class{
      constructor(){this.results=[];this.cursor=0;this.active=false;recognizers.push(this);}
      start(){this.active=true;this.onstart?.();}
      abort(){this.active=false;}
      fire(){this.onresult?.({results:this.results,resultIndex:this.cursor});}
      interim(text){this.results[this.cursor]=Object.assign([{transcript:text}],{isFinal:false});this.results.length=this.cursor+1;this.fire();}
      final(text){this.results[this.cursor]=Object.assign([{transcript:text}],{isFinal:true});this.cursor++;this.fire();}
      speechStart(){this.onspeechstart?.();}
      speechEnd(){this.onspeechend?.();}
      noSpeech(){this.onerror?.({error:'no-speech'});this.active=false;this.onend?.();}
      serviceEnd(){this.active=false;this.onend?.();}
      emit(text,final=true){this.speechStart();if(final)this.final(text);else this.interim(text);this.speechEnd();}}
  };
  function advance(ms){now+=ms;let due;while((due=[...timers].filter(([,timer])=>timer.at<=now).sort((a,b)=>a[1].at-b[1].at)[0])){timers.delete(due[0]);due[1].callback();}}
  return {env,calls,audios,recognizers,revoked,urls,timers,advance,
    live(){return recognizers.filter(item=>item.active).at(-1);},
    // One spoken utterance in Chrome's real order: speechend arrives before the
    // final result, several hundred milliseconds after the last interim.
    speaks(words){const recognition=this.live();assert.ok(recognition,'an active recognizer must be listening');
      const parts=String(words).split(' ');
      recognition.speechStart();
      for(let count=1;count<parts.length;count++){recognition.interim(parts.slice(0,count).join(' '));advance(200);}
      recognition.speechEnd();advance(400);recognition.final(words);return recognition;}};
}
async function finishAudio(harness,index){await until(()=>harness.audios[index]);harness.audios[index].onended?.();await flush();}

test('NDJSON parser delivers each ordered full audio segment and latest receipt across split lines',()=>{
  const delivered=[],states=[];const parser=createParser({expectedTurn:0,onState:value=>states.push(value),onAudio:event=>delivered.push(event.index)});
  const text=frames().map(event=>JSON.stringify(event)+'\n').join('');
  for(let i=0;i<text.length;i+=17)parser.push(text.slice(i,i+17));
  assert.equal(parser.finish().audioCount,2);assert.deepEqual(delivered,[0,1]);assert.deepEqual(states,['reply-0','audio-0-0','audio-0-1','complete-0']);
});

test('parser rejects wrong turns, mismatched segments, duplicate audio, missing audio, and oversized state',()=>{
  function rejects(events){assert.throws(()=>{const parser=createParser({expectedTurn:0});parser.push(events.map(event=>JSON.stringify(event)).join('\n'));parser.finish();},error=>error.code==='protocol_error');}
  const original=frames();rejects([{...original[0],turn:1}]);rejects([{...original[0],segments:[{text:'Different words.'}]}]);
  rejects([original[0],original[1],original[1]]);rejects([original[0],original.at(-1)]);rejects([{...original[0],state:'x'.repeat(128*1024+1)}]);
  rejects([original[0],{...original[1],data:'===='.repeat(34)}]);
  rejects([{...original[0],reply:'x'.repeat(901),segments:[{text:'x'.repeat(901)}]}]);
  rejects([{...original[0],segments:[{text:'Hello.'},{text:'What would you like to discuss?'}]}]);
});

test('opening plays lead before next segment and next turn submits only completed-segment receipt',async()=>{
  const h=environment(),controller=createController(h.env);
  const opening=controller.start('private-passcode',false);await until(()=>h.audios.length===1);
  assert.equal(controller.getSnapshot().phase,'speaking');assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].options.headers['x-preview-key'],'private-passcode');assert.equal(JSON.stringify(controller.getSnapshot()).includes('private-passcode'),false);
  await finishAudio(h,0);await finishAudio(h,1);assert.equal(await opening,true);assert.equal(controller.getSnapshot().phase,'ready');
  const next=controller.send('What has been hardest?');await until(()=>h.calls.length===2);
  assert.deepEqual(h.calls[1].body,{action:'turn',state:'complete-0',text:'What has been hardest?',previousPlayback:'played',previousCompletedSegments:2});
  assert.equal(await controller.send('Duplicate'),false);assert.equal(h.calls.length,2);
  await finishAudio(h,2);await finishAudio(h,3);await next;assert.equal(controller.getSnapshot().turn,1);assert.equal(h.revoked.length,4);
});

test('interrupting second segment keeps first completed segment and original question',async()=>{
  const h=environment(),controller=createController(h.env);const opening=controller.start('key',false);
  await finishAudio(h,0);await until(()=>h.audios.length===2);controller.interrupt();await opening;
  assert.equal(controller.getSnapshot().restartRequired,false);assert.equal(controller.getSnapshot().phase,'paused');
  const next=controller.send('Let me check what I heard.');await until(()=>h.calls.length===2);
  assert.equal(h.calls[1].body.state,'complete-0');assert.equal(h.calls[1].body.previousPlayback,'interrupted');assert.equal(h.calls[1].body.previousCompletedSegments,1);
  await finishAudio(h,2);await finishAudio(h,3);await next;
  assert.equal(controller.getSnapshot().messages[1].text,'Let me check what I heard.');assert.equal(h.revoked.length,4);
});

test('cancellation before reply requires explicit restart and never automatically repeats an uncertain request',async()=>{
  const h=environment((path,options)=>Promise.resolve(response([],options.signal))),controller=createController(h.env);
  const work=controller.start('key',false);await flush();controller.interrupt();await work;
  const snapshot=controller.getSnapshot();assert.equal(snapshot.phase,'restart');assert.equal(snapshot.restartRequired,true);assert.match(snapshot.error,/outcome is unknown/);
  assert.equal(await controller.send('Are you there?'),false);assert.equal(h.calls.length,1);
  controller.clear();assert.equal(controller.getSnapshot().phase,'gate');assert.deepEqual(controller.getSnapshot().messages,[]);
});

test('reply receipt survives cancellation before audio or final event and allows a fresh continuation',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(number===1?[frames()[0]]:frames(1,['I understand.']),options.signal))),controller=createController(h.env);
  const work=controller.start('key',false);await until(()=>controller.getSnapshot().messages.length===1);controller.interrupt();await work;
  assert.equal(controller.getSnapshot().restartRequired,false);
  const next=controller.send('Could we slow down?');await until(()=>h.calls.length===2);
  assert.equal(h.calls[1].body.state,'reply-0');assert.equal(h.calls[1].body.previousCompletedSegments,0);assert.equal(h.calls[1].body.previousPlayback,'interrupted');
  await finishAudio(h,0);await next;
});

test('a cleared request cannot overwrite a new encounter or stop its audio when it resolves late',async()=>{
  let resolveOld;const h=environment((path,options,number)=>number===1?new Promise(resolve=>resolveOld=resolve):Promise.resolve(response(frames(),options.signal))),controller=createController(h.env);
  const old=controller.start('old-key',false);controller.clear();const fresh=controller.start('new-key',false);await until(()=>h.audios.length===1);
  resolveOld(response(frames(),h.calls[0].options.signal));await old;assert.equal(controller.getSnapshot().phase,'speaking');assert.equal(h.audios[0].pauses,0);
  await finishAudio(h,0);await finishAudio(h,1);await fresh;assert.equal(controller.getSnapshot().messages.length,1);assert.equal(controller.getSnapshot().phase,'ready');
});

test('ten completed learner turns end capture and block an eleventh question',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(frames(number-1,['One completed reply.']),options.signal))),controller=createController(h.env);
  let work=controller.start('key',true);await finishAudio(h,0);await work;
  for(let turn=1;turn<=10;turn++){work=controller.send('Question '+turn);await finishAudio(h,turn);await work;}
  assert.equal(controller.getSnapshot().phase,'ended');assert.equal(controller.getSnapshot().turn,10);assert.equal(h.recognizers.filter(item=>item.active).length,0);
  assert.equal(await controller.send('An eleventh question'),false);assert.equal(h.calls.length,11);
});

test('spoken capture waits 4.5 seconds, waits 8 with thinking time, and hold never sends by silence',()=>{
  const h=environment();let draft='',submissions=0;const capture=createCapture(h.env,{hasDraft:()=>!!draft,onFinal:text=>draft+=' '+text,onSubmit:()=>submissions++});
  capture.start();h.recognizers[0].emit('Hello');h.advance(4499);assert.equal(submissions,0);h.advance(1);assert.equal(submissions,1);
  capture.setThinking(true);h.recognizers[0].emit('One more thought');h.advance(7999);assert.equal(submissions,1);h.advance(1);assert.equal(submissions,2);
  capture.setHold(true);h.recognizers[0].emit('I am still thinking');h.advance(60000);assert.equal(submissions,2);capture.setHold(false);h.advance(8000);assert.equal(submissions,3);capture.stop();
});

function spoken(h=environment()){
  let draft='',submissions=0;const notices=[],errors=[];
  const capture=createCapture(h.env,{hasDraft:()=>!!draft.trim(),onFinal:text=>{draft=(draft.trim()+' '+text).trim();},
    onSubmit:()=>submissions++,onNotice:error=>notices.push(error.code),onError:error=>errors.push(error.code)});
  return {h,capture,notices,errors,draft:()=>draft,submissions:()=>submissions,clearDraft(){draft='';}};
}

test('interim words block sending, and an unfinished ending keeps the words, recovers the microphone, and never auto-sends the truncated half',()=>{
  const t=spoken();t.capture.start();
  t.h.speaks('I wanted to ask');
  const recognition=t.h.live();recognition.speechStart();recognition.interim('what matters');
  t.h.advance(10000);assert.equal(t.submissions(),0,'a live interim never sends');
  recognition.serviceEnd();
  assert.deepEqual(t.notices,['unfinished_speech'],'the learner is told, once, without a fatal error');
  assert.deepEqual(t.errors,[],'an unfinished ending is recoverable, not a stop');
  assert.equal(t.draft(),'I wanted to ask','completed words survive');
  assert.equal(t.capture.isActive(),true,'the microphone comes back by itself');
  t.h.advance(120000);
  assert.equal(t.submissions(),0,'the completed half is never promoted to a whole question');
  t.h.speaks('and what matters to you');
  t.h.advance(4500);
  assert.equal(t.submissions(),1,'new speech clears the suspension and the turn sends itself');
  assert.equal(t.draft(),'I wanted to ask and what matters to you');
});

test('voice activity that never becomes words cannot suppress the turn forever',()=>{
  // 'the real question' finalises 800 ms in, so the learner deadline is 5300 ms.
  const t=spoken();t.capture.start();t.h.speaks('the real question');
  t.h.advance(1000);t.h.live().speechStart();     // a fan, a hallway voice: the VAD trips
  t.h.advance(2000);assert.equal(t.submissions(),0,'a possible speaker is given a full grace period');
  t.h.advance(1499);assert.equal(t.submissions(),0,'the original quiet window is honoured, not restarted');
  t.h.advance(1);assert.equal(t.submissions(),1,'and it still sends at the learner own deadline');
  assert.equal(t.capture.isActive(),true);

  // Noise that keeps re-tripping the detector must not compound into a stall.
  const noisy=spoken();noisy.capture.start();noisy.h.speaks('a second question');
  for(let burst=0;burst<40&&noisy.submissions()===0;burst++){noisy.h.live().speechStart();noisy.h.advance(500);}
  assert.equal(noisy.submissions(),1,'repeated wordless trips end at most one grace past the deadline');
});

test('ordinary silence cycles restart the microphone indefinitely; only a true restart storm stops with an explicit error',()=>{
  const healthy=spoken();healthy.capture.start();healthy.h.speaks('a question I am still weighing');
  for(let cycle=0;cycle<30;cycle++){healthy.h.advance(3000);const recognition=healthy.h.live();if(recognition)recognition.noSpeech();healthy.h.advance(0);}
  assert.deepEqual(healthy.errors,[],'a thinking pause must never retire the microphone');
  assert.equal(healthy.capture.isActive(),true);

  const storm=spoken();storm.capture.start();
  for(let cycle=0;cycle<40&&storm.capture.isActive();cycle++){const recognition=storm.h.live();if(recognition)recognition.serviceEnd();storm.h.advance(2000);}
  assert.deepEqual(storm.errors,['recognition_failed'],'a genuine storm is bounded and surfaced');
  assert.equal(storm.capture.isActive(),false,'and it stops rather than reconnecting forever');
});

test('a restart keeps the completed words and the original quiet deadline rather than extending it',()=>{
  const t=spoken();t.capture.start();t.h.speaks('preserved words');
  t.h.advance(2000);t.h.live().noSpeech();t.h.advance(0);
  assert.equal(t.h.recognizers.length,2,'the session was replaced');
  t.h.advance(2499);assert.equal(t.submissions(),0,'the deadline was not restarted by the reconnect');
  t.h.advance(1);assert.equal(t.submissions(),1);
  assert.equal(t.draft(),'preserved words');
});

test('a late duplicate result list adds no second copy and no second turn',()=>{
  const t=spoken();t.capture.start();const recognition=t.h.speaks('only once');
  recognition.fire();recognition.fire();
  t.h.advance(4500);
  assert.equal(t.draft(),'only once');assert.equal(t.submissions(),1);
});

test('ten spoken turns complete with no click, key press, focus change or composer edit after Start',async()=>{
  const h=environment((path,options,number)=>Promise.resolve(response(frames(number-1,['One completed reply.']),options.signal))),
        controller=createController(h.env);
  const opening=controller.start('key',true);await finishAudio(h,0);await opening;
  assert.equal(controller.getSnapshot().phase,'listening','voice mode is listening as soon as Dana finishes');

  for(let turn=1;turn<=10;turn++){
    await until(()=>!!h.live());
    h.speaks('Question number '+turn);
    // Chrome ends and restarts the session mid-pause; hands-free must survive it.
    if(turn%3===0){h.advance(1500);h.live().noSpeech();h.advance(0);}
    h.advance(4500);
    await until(()=>h.calls.length===turn+1);
    await finishAudio(h,turn);
    await until(()=>controller.getSnapshot().turn===turn);
  }

  const diagnostics=controller.getDiagnostics();
  assert.equal(diagnostics.startRequests,1,'exactly one opening');
  assert.equal(diagnostics.turnRequests,10,'exactly ten turns, no duplicates');
  assert.equal(diagnostics.automaticSubmissions,10,'every turn sent itself');
  assert.equal(diagnostics.explicitSubmissions,0,'nothing was sent by Send, Space or Done');
  assert.equal(diagnostics.nativeRecognition,false,'this evidence is synthetic recognition, not a physical microphone');
  assert.equal(h.calls.length,11);
  assert.equal(controller.getSnapshot().phase,'ended');
  assert.equal(h.recognizers.filter(item=>item.active).length,0,'the microphone is off at the end');
  assert.equal(await controller.send('An eleventh question'),false);
});

test('a manual composer edit still pauses automatic sending until voice is explicitly resumed',async()=>{
  const h=environment((path,options)=>Promise.resolve(response(frames(0,['Hello.']),options.signal))),controller=createController(h.env);
  const opening=controller.start('key',true);await finishAudio(h,0);await opening;
  controller.setDraft('A question I am still editing.');
  h.advance(60000);
  assert.equal(h.calls.length,1,'an edited draft is never sent by the silence timer');
  assert.equal(controller.getSnapshot().phase,'paused');
  assert.equal(controller.getDiagnostics().automaticSubmissions,0);
});

test('page disposal closes audio, revokes its URL, drops draft and cannot resume microphone',async()=>{
  const h=environment(),controller=createController(h.env);const work=controller.start('key',true);await until(()=>h.audios.length===1);controller.dispose();await work;
  assert.equal(h.revoked.length,1);assert.equal(h.audios[0].pauses,1);assert.equal(controller.resume(),false);assert.equal(controller.getSnapshot().draft,'');assert.deepEqual(controller.getSnapshot().messages,[]);
});

test('typing pauses active capture and cannot send an edited question on the speech silence timer',async()=>{
  const h=environment((path,options)=>Promise.resolve(response(frames(0,['Hello.']),options.signal))),controller=createController(h.env);
  const opening=controller.start('key',true);await finishAudio(h,0);await opening;
  assert.equal(controller.getSnapshot().phase,'listening');controller.setDraft('A question I am still editing.');h.advance(30000);
  assert.equal(controller.getSnapshot().phase,'paused');assert.equal(h.calls.length,1);assert.equal(h.recognizers.some(item=>item.active),false);
  assert.equal(controller.getSnapshot().draft,'A question I am still editing.');
});

test('a dana message carries its segment texts so the heard prefix can be quoted exactly',async()=>{
  const h=environment(),controller=createController(h.env);
  const opening=controller.start('key',false);
  await finishAudio(h,0);await finishAudio(h,1);await opening;
  const first=controller.getSnapshot().messages[0];
  assert.deepEqual(first.segments,['Hello.',' What would you like to discuss?']);
  assert.equal(first.segments.length,first.totalSegments);
  assert.equal(first.segments.slice(0,first.completedSegments).join(''),first.text);

  // An interrupted reply must expose only what actually played.
  const next=controller.send('And after that?');await until(()=>h.audios.length===3);
  await finishAudio(h,2);controller.interrupt();await next;
  const second=controller.getSnapshot().messages.at(-1);
  assert.equal(second.status,'interrupted');
  assert.equal(second.completedSegments,1);
  assert.equal(second.segments.slice(0,second.completedSegments).join(''),'Hello.');
  assert.notEqual(second.segments.join(''),'Hello.');
});

test('a snapshot cannot be used to mutate the controller segment list',async()=>{
  const h=environment(),controller=createController(h.env);
  const opening=controller.start('key',false);
  await until(()=>controller.getSnapshot().messages.length===1);
  const snapshot=controller.getSnapshot();
  snapshot.messages[0].segments.push('injected');
  assert.equal(controller.getSnapshot().messages[0].segments.includes('injected'),false);
  controller.clear();await opening;
});
